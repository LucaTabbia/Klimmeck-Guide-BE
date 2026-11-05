import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest, persistEnemy, persistPet } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const LUCKY_ROLL = 0.1;
const UNLUCKY_ROLL = 0.5;
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};
const ONE_SEAT = [{ title: null, count: 1 }];
const THREE_SEATS = [{ title: null, count: 3 }];

describe('QuestResolutionService.resolveStandard with a pet prize (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance, combat: scripted });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const questPet = () =>
        persistPet(world.models.pets, {
            name: 'Gufo delle nevi',
            sellable: false,
        }) as Promise<{ _id: Types.ObjectId }>;

    async function petQuest(
        type: string,
        petId: Types.ObjectId,
        seats: unknown[],
    ) {
        const foe = (await persistEnemy(world.models.enemies, {
            xp: 100,
        })) as { _id: Types.ObjectId };
        return {
            infos: {
                ...buildQuest().infos,
                type,
                title: 'Il troll del guado',
                enemies: [{ enemy: foe._id, quantity: 1 }],
            },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: seats,
            },
            prizes: { ...buildQuest().prizes, xpPrize: 50, pet: petId },
        };
    }

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-pet-prize-${seq}`,
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: {
                    ...FRESH_STATUS,
                    ...options.characterOverrides?.status,
                },
            },
        });
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const resultOf = async (subject: Quester) => {
        const [result] = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        return result;
    };

    const ownedPetsOf = async (subject: Quester) =>
        ((await characterOf(subject)).assets.ownedPets ?? []).map(String);

    it('adds the pet prize to a winner on a lucky roll (D-21)', async () => {
        const pet = await questPet();
        const subject = await quester({
            questOverrides: await petQuest('enemy', pet._id, ONE_SEAT),
        });
        chance.load([LUCKY_ROLL]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.assets.ownedPets.map(String)).toEqual([
            String(pet._id),
        ]);
        expect(character.assets.pet ?? null).toBeNull();
        expect(String((await resultOf(subject)).rewards.pet)).toBe(
            String(pet._id),
        );
        expect(chance.drawn).toEqual([LUCKY_ROLL]);
    });

    it('leaves a winner without the pet on an unlucky roll (D-21)', async () => {
        const pet = await questPet();
        const subject = await quester({
            questOverrides: await petQuest('enemy', pet._id, ONE_SEAT),
        });
        chance.load([UNLUCKY_ROLL]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(await ownedPetsOf(subject)).toEqual([]);
        expect((await resultOf(subject)).rewards.pet).toBeNull();
    });

    it('never duplicates a pet already owned (D-21)', async () => {
        const pet = await questPet();
        const subject = await quester({
            questOverrides: await petQuest('enemy', pet._id, ONE_SEAT),
            characterOverrides: { assets: { ownedPets: [pet._id] } },
        });
        chance.load([LUCKY_ROLL]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(await ownedPetsOf(subject)).toEqual([String(pet._id)]);
        expect((await resultOf(subject)).rewards.pet).toBeNull();
    });

    it('rolls the pet for each winner of a boss (D-21)', async () => {
        const pet = await questPet();
        const first = await quester({
            questOverrides: await petQuest('boss', pet._id, THREE_SEATS),
        });
        const second = await quester({ quest: first.quest });
        chance.load([LUCKY_ROLL, UNLUCKY_ROLL]);

        await expect(resolve(first)).resolves.toBe('resolved');

        expect(await ownedPetsOf(first)).toEqual([String(pet._id)]);
        expect(await ownedPetsOf(second)).toEqual([]);
        expect(String((await resultOf(first)).rewards.pet)).toBe(
            String(pet._id),
        );
        expect((await resultOf(second)).rewards.pet).toBeNull();
        expect(chance.drawn).toEqual([LUCKY_ROLL, UNLUCKY_ROLL]);
    });
});
