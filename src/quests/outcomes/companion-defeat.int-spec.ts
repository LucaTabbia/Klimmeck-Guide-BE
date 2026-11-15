import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest, persistEnemy, persistPet } from '../../../test/fixtures';
import {
    buildOwnedPet,
    type OwnedPetOverrides,
} from '../../../test/fixtures/owned-pet.fixture';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { SwappableDungeonResolver } from '../../../test/quests/swappable-dungeon-resolver';
import { DungeonResolver } from './dungeon/dungeon-resolver';
import { PlaceholderDungeonResolver } from './dungeon/placeholder-dungeon-resolver';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const RECOVERY_TIME_MS = 60 * 60 * 1000;
const BACK_IN_FORCE = new Date(NOW.getTime() + RECOVERY_TIME_MS);
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};
const ONE_SEAT = [{ title: null, count: 1 }];
const THREE_SEATS = [{ title: null, count: 3 }];
// tetto di xp alto: l'xp di uno scontro non cambia livello, il massimo resta la base
const WORG = {
    name: 'Worg',
    maxLifePoints: 100,
    maxXp: 10_000,
    recoveryTime: RECOVERY_TIME_MS,
};
const FENRIR: OwnedPetOverrides = {
    currentLifePoints: 60,
    level: 1,
    name: 'Fenrir',
};
// 10 % dei 100 xp del nemico
const FIGHT_PET_XP = 10;

type EnemyEntry = { enemy: Types.ObjectId; quantity: number };

describe('companion defeat across fights', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();
    const dungeon = new SwappableDungeonResolver(
        new PlaceholderDungeonResolver(scripted),
    );

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat: scripted,
            overrides: [{ token: DungeonResolver, useValue: dungeon }],
        });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        dungeon.reset();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function enemy(xp = 100): Promise<EnemyEntry> {
        const foe = (await persistEnemy(world.models.enemies, {
            xp,
            lifePoints: 200,
        })) as { _id: Types.ObjectId };
        return { enemy: foe._id, quantity: 1 };
    }

    const questOf = (
        type: string,
        enemies: EnemyEntry[],
        seats: unknown[] = ONE_SEAT,
    ) => ({
        infos: { ...buildQuest().infos, type, title: 'La tana', enemies },
        requirements: {
            ...buildQuest().requirements,
            requiredAdventurers: seats,
        },
        prizes: { ...buildQuest().prizes, xpPrize: 50 },
    });

    async function worg(overrides: Record<string, unknown> = {}) {
        return (await persistPet(world.models.pets, {
            ...WORG,
            ...overrides,
        })) as { _id: Types.ObjectId };
    }

    const withCompanion = (
        petId: Types.ObjectId,
        entry: OwnedPetOverrides = FENRIR,
    ) => ({
        assets: { pet: petId, ownedPets: [buildOwnedPet(petId, entry)] },
    });

    async function quester(options: Partial<QuesterOptions>): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-companion-${seq}`,
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: FRESH_STATUS,
            },
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    async function fighterWith(
        type: string,
        enemies: EnemyEntry[],
        petId: Types.ObjectId,
        entry: OwnedPetOverrides = FENRIR,
    ): Promise<Quester> {
        return quester({
            questOverrides: questOf(type, enemies),
            characterOverrides: withCompanion(petId, entry),
        });
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    // forma a DB senza i default dello schema: le chiavi assenti restano assenti
    const rawCharacterOf = (subject: Quester) =>
        world.models.characters.collection.findOne({
            _id: subject.characterId,
        });

    async function resultOf(subject: Quester) {
        const results = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        expect(results).toHaveLength(1);
        return results[0];
    }

    const defeatedFenrir = (petId: Types.ObjectId, xp = FIGHT_PET_XP) => ({
        pet: petId,
        xp,
        currentLifePoints: 1,
        level: 1,
        name: 'Fenrir',
        lifeAsOf: NOW,
        defeatedUntil: BACK_IN_FORCE,
    });

    const DEFEATED_OUTCOME = {
        name: 'Fenrir',
        lifeBefore: 60,
        lifePoints: 1,
        maxLifePoints: 100,
        defeated: true,
        fullLifeAt: BACK_IN_FORCE,
    };

    it('defeats the companion of a won quest that ends at 1 and dates its return (D-03, D-26)', async () => {
        const pet = await worg();
        const subject = await fighterWith('enemy', [await enemy()], pet._id);
        scripted.willResolve(subject.characterId, { companionLifeAfter: 1 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const raw = await rawCharacterOf(subject);
        expect(raw?.assets.pet).toBeNull();
        expect(raw?.assets.ownedPets).toEqual([defeatedFenrir(pet._id)]);
        const result = await resultOf(subject);
        expect(result.outcome).toBe('success');
        expect(result.companion).toEqual(DEFEATED_OUTCOME);
    });

    it('keeps a wounded companion equipped with its new life (D-03, D-10)', async () => {
        const pet = await worg();
        const subject = await fighterWith('enemy', [await enemy()], pet._id);
        scripted.willResolve(subject.characterId, { companionLifeAfter: 35 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const raw = await rawCharacterOf(subject);
        expect(String(raw?.assets.pet)).toBe(String(pet._id));
        expect(raw?.assets.ownedPets).toEqual([
            {
                pet: pet._id,
                xp: FIGHT_PET_XP,
                currentLifePoints: 35,
                level: 1,
                name: 'Fenrir',
            },
        ]);
        expect((await resultOf(subject)).companion).toEqual({
            name: 'Fenrir',
            lifeBefore: 60,
            lifePoints: 35,
            maxLifePoints: 100,
            defeated: false,
            fullLifeAt: null,
        });
    });

    it('serves an unharmed companion on the result (D-27)', async () => {
        const pet = await worg();
        const subject = await fighterWith('enemy', [await enemy()], pet._id);
        scripted.willResolve(subject.characterId, { companionLifeAfter: 60 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const { companion } = await resultOf(subject);
        expect(companion).toMatchObject({ lifeBefore: 60, lifePoints: 60 });
        expect(companion.defeated).toBe(false);
        const raw = await rawCharacterOf(subject);
        expect(String(raw?.assets.pet)).toBe(String(pet._id));
    });

    it('defeats the companion of a boss fight (D-03, D-26)', async () => {
        const pet = await worg();
        const boss = questOf('boss', [await enemy()], THREE_SEATS);
        const tamer = await quester({
            questOverrides: boss,
            characterOverrides: withCompanion(pet._id),
        });
        const ally = await quester({ quest: tamer.quest });
        scripted.willResolve(tamer.characterId, { companionLifeAfter: 1 });

        await expect(resolve(tamer)).resolves.toBe('resolved');

        expect(scripted.contexts).toHaveLength(1);
        const raw = await rawCharacterOf(tamer);
        expect(raw?.assets.pet).toBeNull();
        expect(raw?.assets.ownedPets).toEqual([defeatedFenrir(pet._id)]);
        expect((await resultOf(tamer)).companion).toEqual(DEFEATED_OUTCOME);
        expect((await resultOf(ally)).companion).toBeNull();
    });

    it('keeps a companion defeated on a stage out of the later stages and empties the slot at the end (D-12)', async () => {
        const pet = await worg();
        const stages = [await enemy(), await enemy()];
        const subject = await fighterWith('dungeon', stages, pet._id);
        scripted.willResolve(subject.characterId, { companionLifeAfter: 1 });
        const writes = jest.spyOn(world.models.characters, 'findOneAndUpdate');

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(
            scripted.contexts.map(
                ({ participants }) => participants[0].companion?.petId ?? null,
            ),
        ).toEqual([String(pet._id), null]);
        expect(writes).toHaveBeenCalledTimes(1);
        const raw = await rawCharacterOf(subject);
        expect(raw?.assets.pet).toBeNull();
        expect(raw?.assets.ownedPets).toEqual([
            defeatedFenrir(pet._id, 2 * FIGHT_PET_XP),
        ]);
        const result = await resultOf(subject);
        expect(result).toMatchObject({ stagesCleared: 2, stagesTotal: 2 });
        expect(result.companion).toEqual(DEFEATED_OUTCOME);
    });

    it('raises the companion level with the fight xp and keeps its life (D-37, D-39)', async () => {
        const pet = await worg({ maxXp: 100 });
        const subject = await fighterWith('enemy', [await enemy(50)], pet._id, {
            xp: 60,
            level: 7,
            currentLifePoints: 147,
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const raw = await rawCharacterOf(subject);
        expect(raw?.assets.ownedPets).toEqual([
            { pet: pet._id, xp: 65, currentLifePoints: 147, level: 8 },
        ]);
        expect((await resultOf(subject)).companion).toEqual({
            name: 'Worg',
            lifeBefore: 147,
            lifePoints: 147,
            maxLifePoints: 162,
            defeated: false,
            fullLifeAt: null,
        });
    });

    it('writes the companion of a defeat without a rescue (D-26, Pitfall 8)', async () => {
        const pet = await worg();
        const subject = await fighterWith('job', [await enemy()], pet._id);
        scripted
            .willEnd('failure')
            .willResolve(subject.characterId, { companionLifeAfter: 1 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(
            await world.models.quests.countDocuments({ 'infos.type': 'aid' }),
        ).toBe(0);
        const raw = await rawCharacterOf(subject);
        expect(raw?.assets.pet).toBeNull();
        expect(raw?.assets.ownedPets).toEqual([defeatedFenrir(pet._id, 0)]);
        const result = await resultOf(subject);
        expect(result.outcome).toBe('failure');
        expect(result.companion).toEqual(DEFEATED_OUTCOME);
    });
});
