import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import {
    MissionDraft,
    MissionDraftSchema,
} from 'src/quests/guided/mission-draft.model';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistEnemy,
    persistPet,
} from '../../../test/fixtures';
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
import { buildAidQuest } from './aid/aid-quest';
import { GmCompletionService } from './gm-completion.service';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const INJURED_SINCE = new Date('2026-11-13T12:00:00.000Z');
const RECOVERY_TIME_MS = 60 * 60 * 1000;
const BACK_IN_FORCE = new Date(NOW.getTime() + RECOVERY_TIME_MS);
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 30, copper: 0 },
};
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
// tiri della conclusione: sotto 0,2 l'evento (arresto, guardia) avviene
const HIT = 0.1;

type EnemyEntry = { enemy: Types.ObjectId; quantity: number };

describe('companion defeat on rescues, guards and GM completion', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let gm: GmCompletionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance, combat: scripted });
        service = world.harness.app.get(QuestResolutionService);
        gm = world.harness.app.get(GmCompletionService);
        const { connection } = world.harness;
        const missionDrafts =
            connection.models[MissionDraft.name] ??
            connection.model(MissionDraft.name, MissionDraftSchema);
        await missionDrafts.init();
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function enemy(
        overrides: Record<string, unknown> = {},
    ): Promise<EnemyEntry> {
        const foe = (await persistEnemy(world.models.enemies, {
            xp: 100,
            locations: ['forest'],
            legendary: false,
            ...overrides,
        })) as { _id: Types.ObjectId };
        return { enemy: foe._id, quantity: 1 };
    }

    // il ladro che la guardia incontra in città
    const thief = () => enemy({ xp: 5, locations: ['city'] });

    async function worg() {
        return (await persistPet(world.models.pets, WORG)) as {
            _id: Types.ObjectId;
        };
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
            twitchId: `tw-companion-rescue-${seq}`,
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: FRESH_STATUS,
            },
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    const questOf = (type: string, enemies: EnemyEntry[]) => ({
        infos: { ...buildQuest().infos, type, title: `Quest ${type}`, enemies },
        prizes: { ...buildQuest().prizes, xpPrize: 50 },
    });

    const fighterWith = (
        type: string,
        enemies: EnemyEntry[],
        petId: Types.ObjectId,
        entry: OwnedPetOverrides = FENRIR,
    ) =>
        quester({
            questOverrides: questOf(type, enemies),
            characterOverrides: withCompanion(petId, entry),
        });

    // ferito in attesa con la aid clonata da una quest a nemico; il soccorritore col compagno è registrato sulla aid
    async function rescuerWith(petId: Types.ObjectId): Promise<Quester> {
        seq += 1;
        const marker = new Types.ObjectId();
        await persistCity(world.models.cities, {
            pointsOfInterest: [marker],
            markerLocation: new Types.ObjectId(),
        });
        const original = await world.models.quests.create(
            buildQuest({
                infos: {
                    ...buildQuest().infos,
                    type: 'enemy',
                    title: 'Il bandito del passo',
                    markerLocation: marker,
                    enemies: [await enemy()],
                },
                prizes: { ...buildQuest().prizes, xpPrize: 50 },
            }),
        );
        const aidId = new Types.ObjectId();
        const injured = await createPlayer(world.harness, {
            twitchId: `tw-injured-${seq}`,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    ...FRESH_STATUS,
                    currentLifePoints: 300,
                    awaitingAid: {
                        quest: original._id,
                        aidQuest: aidId,
                        since: INJURED_SINCE,
                    },
                },
            },
        });
        const aid = await world.models.quests.create(
            buildAidQuest(
                original.toObject() as never,
                [injured.character!._id as Types.ObjectId],
                aidId,
            ),
        );
        return quester({
            quest: aid,
            characterOverrides: withCompanion(petId),
        });
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const storyWith = (petId: Types.ObjectId, entry: OwnedPetOverrides) =>
        quester({
            lane: QuestLane.story,
            questOverrides: {
                infos: {
                    ...buildQuest().infos,
                    type: 'story',
                    title: 'La corte del re',
                },
                requirements: {
                    ...buildQuest().requirements,
                    minTitle: 'rookie',
                },
                prizes: { ...buildQuest().prizes, xpPrize: 400 },
            },
            characterOverrides: withCompanion(petId, entry),
        });

    const completeWithOverride = (subject: Quester) =>
        gm.complete({
            pendingQuestId: String(subject.pendingQuest._id),
            outcomes: [
                { characterId: String(subject.characterId), hpAfter: 900 },
            ],
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

    const defeatedFenrir = (
        petId: Types.ObjectId,
        xp: number,
        lifeBefore = 60,
    ) => ({
        entry: {
            pet: petId,
            xp,
            currentLifePoints: 1,
            level: 1,
            name: 'Fenrir',
            lifeAsOf: NOW,
            defeatedUntil: BACK_IN_FORCE,
        },
        outcome: {
            name: 'Fenrir',
            lifeBefore,
            lifePoints: 1,
            maxLifePoints: 100,
            defeated: true,
            fullLifeAt: BACK_IN_FORCE,
        },
    });

    async function expectDefeated(
        subject: Quester,
        expected: ReturnType<typeof defeatedFenrir>,
    ) {
        const raw = await rawCharacterOf(subject);
        expect(raw?.assets.pet).toBeNull();
        expect(raw?.assets.ownedPets).toEqual([expected.entry]);
        const result = await resultOf(subject);
        expect(result.companion).toEqual(expected.outcome);
        return result;
    }

    it('defeats the companion of a rescuer that ends the rescue fight at 1, without xp (D-03, D-13, D-26)', async () => {
        const pet = await worg();
        const rescuer = await rescuerWith(pet._id);
        scripted.willResolve(rescuer.characterId, { companionLifeAfter: 1 });

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        const result = await expectDefeated(
            rescuer,
            defeatedFenrir(pet._id, 0),
        );
        expect(result.outcome).toBe('success');
        expect(result.rescuedCharacters).toHaveLength(1);
    });

    it('fights the guard without a companion defeated by the quest, keeps it defeated and gives it no xp (D-12, D-13, D-26)', async () => {
        await thief();
        const pet = await worg();
        const subject = await fighterWith('guard', [await enemy()], pet._id);
        scripted.willResolve(subject.characterId, { companionLifeAfter: 1 });
        chance.load([HIT, 0]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(
            scripted.contexts.map(
                ({ participants }) => participants[0].companion?.petId ?? null,
            ),
        ).toEqual([String(pet._id), null]);
        const result = await expectDefeated(
            subject,
            defeatedFenrir(pet._id, 0),
        );
        expect(result).toMatchObject({
            outcome: 'success',
            guardEncounter: true,
            petXpGained: 0,
        });
    });

    it('gives a companion fallen in a won guard fight the xp of the quest fight only (D-13)', async () => {
        await thief();
        const pet = await worg();
        const subject = await fighterWith('guard', [await enemy()], pet._id);
        scripted.willResolve(subject.characterId, () => ({
            companionLifeAfter: scripted.contexts.length === 1 ? 35 : 1,
        }));
        chance.load([HIT, 0]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(
            scripted.contexts[1].participants[0].companion?.currentLifePoints,
        ).toBe(35);
        const result = await expectDefeated(
            subject,
            defeatedFenrir(pet._id, 10),
        );
        expect(result).toMatchObject({
            outcome: 'success',
            guardEncounter: true,
            petXpGained: 10,
        });
    });

    it('writes the companion of a lost guard fight (Pitfall 8)', async () => {
        await thief();
        const pet = await worg();
        const subject = await fighterWith('guard', [await enemy()], pet._id);
        const questFightOnly = () => scripted.contexts.length === 1;
        scripted
            .willEndBy(() => (questFightOnly() ? 'success' : 'failure'))
            .willResolve(subject.characterId, () => ({
                companionLifeAfter: questFightOnly() ? 35 : 20,
            }));
        chance.load([HIT, 0]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(
            scripted.contexts[1].participants[0].companion?.currentLifePoints,
        ).toBe(35);
        const raw = await rawCharacterOf(subject);
        expect(String(raw?.assets.pet)).toBe(String(pet._id));
        expect(raw?.assets.ownedPets).toEqual([
            {
                pet: pet._id,
                xp: 0,
                currentLifePoints: 20,
                level: 1,
                name: 'Fenrir',
            },
        ]);
        const result = await resultOf(subject);
        expect(result).toMatchObject({
            outcome: 'failure',
            guardEncounter: true,
        });
        expect(result.companion).toEqual({
            name: 'Fenrir',
            lifeBefore: 60,
            lifePoints: 20,
            maxLifePoints: 100,
            defeated: false,
            fullLifeAt: null,
        });
    });

    it('writes the companion of a crime ending in an arrest (D-26, Pitfall 8)', async () => {
        const pet = await worg();
        const subject = await fighterWith('crime', [await enemy()], pet._id);
        scripted.willResolve(subject.characterId, { companionLifeAfter: 1 });
        chance.load([HIT]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const result = await expectDefeated(
            subject,
            defeatedFenrir(pet._id, 0),
        );
        expect(result).toMatchObject({ outcome: 'failure', arrested: true });
    });

    it('treats a companion at 1 in the legacy GM completion as defeated (D-26)', async () => {
        const pet = await worg();
        const subject = await storyWith(pet._id, {
            ...FENRIR,
            currentLifePoints: 1,
        });

        await completeWithOverride(subject);

        const result = await expectDefeated(
            subject,
            defeatedFenrir(pet._id, 0, 1),
        );
        expect(result.outcome).toBe(QuestOutcome.gmCompleted);
    });

    it('keeps the companion life unchanged in the legacy GM completion (D-27)', async () => {
        const pet = await worg();
        const subject = await storyWith(pet._id, FENRIR);

        await completeWithOverride(subject);

        const raw = await rawCharacterOf(subject);
        expect(String(raw?.assets.pet)).toBe(String(pet._id));
        expect(raw?.assets.ownedPets).toEqual([buildOwnedPet(pet._id, FENRIR)]);
        expect((await resultOf(subject)).companion).toEqual({
            name: 'Fenrir',
            lifeBefore: 60,
            lifePoints: 60,
            maxLifePoints: 100,
            defeated: false,
            fullLifeAt: null,
        });
    });

    it('tells no companion when the legacy completion has no fight (D-27)', async () => {
        const pet = await worg();
        const subject = await storyWith(pet._id, FENRIR);

        await gm.complete({ pendingQuestId: String(subject.pendingQuest._id) });

        const raw = await rawCharacterOf(subject);
        expect(String(raw?.assets.pet)).toBe(String(pet._id));
        expect(raw?.assets.ownedPets).toEqual([buildOwnedPet(pet._id, FENRIR)]);
        expect((await resultOf(subject)).companion).toBeNull();
    });
});
