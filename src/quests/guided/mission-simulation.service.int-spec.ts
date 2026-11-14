import { type Model, Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    type CombatContext,
    type CombatResolution,
    CombatResolver,
} from 'src/quests/outcomes/combat/combat-resolver';
import { PlaceholderCombatResolver } from 'src/quests/outcomes/combat/placeholder-combat-resolver';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistEnemy,
    persistLootItem,
    persistPet,
    persistSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GuidedMissionModule } from './guided-mission.module';
import type { SimulateMissionFightInput } from './mission-draft.inputs';
import {
    MissionDraft,
    type MissionDraftRecord,
    type MissionFightRecord,
} from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';
import { MissionSimulationChance } from './mission-simulation.chance';
import { MissionSimulationService } from './mission-simulation.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const NOT_FOUND = { code: 'NOT_FOUND' };
const OUTCOME_OVERRIDE_INVALID = { code: 'OUTCOME_OVERRIDE_INVALID' };
const UNTOUCHED_COLLECTIONS = [
    'characters',
    'pendingquests',
    'questresults',
    'quests',
] as const;

// il placeholder per default; il caso del compagno passa al resolver scriptato che registra il contesto
class SwitchableCombatResolver extends CombatResolver {
    current: CombatResolver = new PlaceholderCombatResolver();

    resolve(context: CombatContext, chance: ChanceSource): CombatResolution {
        return this.current.resolve(context, chance);
    }
}

describe('MissionSimulationService (replSet)', () => {
    let world: OutcomeHarness;
    let service: MissionSimulationService;
    let drafts: MissionDraftService;
    let draftModel: Model<any>;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const sharedChance = new SequenceChance();
    const simulationChance = new SequenceChance();
    const combat = new SwitchableCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance: sharedChance,
            combat,
            imports: [GuidedMissionModule],
            overrides: [
                { token: MissionSimulationChance, useValue: simulationChance },
            ],
        });
        service = world.harness.app.get(MissionSimulationService);
        drafts = world.harness.app.get(MissionDraftService);
        draftModel = world.harness.connection.model(MissionDraft.name);
        await draftModel.init();
    });

    beforeEach(async () => {
        await world.reset();
        sharedChance.load([]);
        simulationChance.load([]);
        combat.current = new PlaceholderCombatResolver();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const gmQuest = () => ({
        infos: {
            ...buildQuest().infos,
            type: 'worldMission',
            title: 'La corte del re',
        },
        requirements: { ...buildQuest().requirements, minTitle: 'rookie' },
        prizes: buildQuest().prizes,
    });

    function quester(options: Partial<QuesterOptions>): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-sim-${seq}`,
            lane: QuestLane.worldMission,
            ...options,
        });
    }

    const lifeOf = (currentLifePoints: number) => ({
        currentLifePoints,
        maxLifePoints: 1000,
    });

    // due iscritti a vita 800 e 900 su 1000; il primo ha una ferita, tre pozioni e una magia attiva
    async function startedWorldMission(
        secondAssets: Record<string, unknown> = {},
    ) {
        const potion = (await persistLootItem(world.models.lootItems))
            ._id as Types.ObjectId;
        const spell = (await persistSpell(world.models.spells))
            ._id as Types.ObjectId;
        const enemy = (await persistEnemy(world.models.enemies))
            ._id as Types.ObjectId;
        const first = await quester({
            questOverrides: gmQuest(),
            characterOverrides: {
                status: {
                    ...lifeOf(800),
                    injuries: [InjuryType.deepCut],
                    spellStates: spellStatesOf([
                        { spell, usages: 5, active: true },
                    ]),
                },
                assets: {
                    ownedItems: [
                        { itemType: 'LootItem', item: potion, quantity: 3 },
                    ],
                },
            },
        });
        const second = await quester({
            quest: first.quest,
            characterOverrides: { status: lifeOf(900), assets: secondAssets },
        });
        const draft = await drafts.start(String(first.pendingQuest._id), null);
        sharedChance.load([]);
        return { first, second, potion, spell, enemy, draft };
    }

    const inputOf = (
        subject: Quester,
        fightIndex: number,
        enemy: Types.ObjectId,
        quantity = 1,
    ): SimulateMissionFightInput => ({
        pendingQuestId: String(subject.pendingQuest._id),
        fightIndex,
        enemies: [{ enemy: String(enemy), quantity }],
    });

    const outcomeOf = (fight: MissionFightRecord, subject: Quester) =>
        fight.outcomes.find(
            ({ character }) =>
                String(character) === String(subject.characterId),
        );

    const storedDraft = () => draftModel.findOne().lean<MissionDraftRecord>();

    const rawDocuments = async () =>
        Object.fromEntries(
            await Promise.all(
                UNTOUCHED_COLLECTIONS.map(
                    async (name) =>
                        [
                            name,
                            await world.models.characters.db
                                .collection(name)
                                .find()
                                .sort({ _id: 1 })
                                .toArray(),
                        ] as const,
                ),
            ),
        );

    it('simulates a fight without writing characters, quests or results (D-04)', async () => {
        const { first, enemy } = await startedWorldMission();
        const before = await rawDocuments();
        const draftBefore = await storedDraft();

        await service.simulate(inputOf(first, 0, enemy));

        expect(await rawDocuments()).toEqual(before);
        expect(await storedDraft()).not.toEqual(draftBefore);
        expect((await storedDraft())!.fights).toHaveLength(1);
    });

    it('draws only from the simulation chance (D-04)', async () => {
        const { first, enemy } = await startedWorldMission();

        await service.simulate(inputOf(first, 0, enemy));

        expect(sharedChance.drawn).toEqual([]);
        expect(simulationChance.drawn.length).toBeGreaterThan(0);
    });

    it('serves the start of the fight and the simulated effects (D-17, D-21)', async () => {
        const { first, second, potion, spell, enemy } =
            await startedWorldMission();

        const draft = await service.simulate(inputOf(first, 0, enemy, 2));

        const [fight] = draft.fights;
        expect(fight.verdict).not.toBeNull();
        expect(fight.enemies).toEqual([{ enemy, quantity: 2 }]);
        expect(fight.outcomes).toHaveLength(2);
        expect(outcomeOf(fight, first)).toEqual({
            character: first.characterId,
            hpBefore: 800,
            injuriesBefore: [InjuryType.deepCut],
            consumablesAvailable: [{ item: potion, quantity: 3 }],
            spellsAvailable: [{ spell, usages: 5 }],
            simulated: {
                hpAfter: expect.any(Number),
                injuriesAdded: [],
                consumablesUsed: [],
                spellsUsed: [{ spell, usages: 1 }],
            },
            corrected: null,
        });
        expect(outcomeOf(fight, second)).toEqual({
            character: second.characterId,
            hpBefore: 900,
            injuriesBefore: [],
            consumablesAvailable: [],
            spellsAvailable: [],
            simulated: {
                hpAfter: expect.any(Number),
                injuriesAdded: [],
                consumablesUsed: [],
                spellsUsed: [],
            },
            corrected: null,
        });
    });

    it('starts the second fight from the corrected state of the first (D-02)', async () => {
        const { first, second, potion, enemy } = await startedWorldMission();
        const simulated = await service.simulate(inputOf(first, 0, enemy));
        const [fight] = simulated.fights;
        await drafts.write(simulated._id, {
            fights: [
                {
                    ...fight,
                    outcomes: fight.outcomes.map((outcome) =>
                        String(outcome.character) === String(first.characterId)
                            ? {
                                  ...outcome,
                                  corrected: {
                                      hpAfter: 500,
                                      injuriesAdded: [],
                                      consumablesUsed: [
                                          { item: potion, quantity: 1 },
                                      ],
                                      spellsUsed: [],
                                  },
                              }
                            : outcome,
                    ),
                },
            ],
        });

        const draft = await service.simulate(inputOf(first, 1, enemy));

        expect(draft.fights).toHaveLength(2);
        const firstStart = outcomeOf(draft.fights[1], first)!;
        expect(firstStart.hpBefore).toBe(500);
        expect(firstStart.consumablesAvailable).toEqual([
            { item: potion, quantity: 2 },
        ]);
        expect(outcomeOf(draft.fights[1], second)!.hpBefore).toBe(
            outcomeOf(fight, second)!.simulated!.hpAfter,
        );
    });

    it('refuses a fight before the previous one is simulated (D-24)', async () => {
        const { first, enemy, draft } = await startedWorldMission();
        await drafts.write(draft._id, {
            fights: [
                {
                    enemies: [{ enemy, quantity: 1 }],
                    verdict: null,
                    outcomes: [],
                },
            ],
        });
        const before = await storedDraft();

        await expect(
            service.simulate(inputOf(first, 1, enemy)),
        ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
        await expect(
            service.simulate(inputOf(first, 3, enemy)),
        ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
        expect(await storedDraft()).toEqual(before);
    });

    it('refuses an enemy list over the caps of a fight (D-24)', async () => {
        const { first, enemy } = await startedWorldMission();
        const tooMany = Array.from({ length: 11 }, () => ({
            enemy: String(enemy),
            quantity: 1,
        }));

        await expect(
            service.simulate({ ...inputOf(first, 0, enemy), enemies: tooMany }),
        ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
        await expect(
            service.simulate(inputOf(first, 0, enemy, 21)),
        ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
        await expect(
            service.simulate({ ...inputOf(first, 0, enemy), enemies: [] }),
        ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
        expect((await storedDraft())!.fights).toEqual([]);
    });

    it('voids the following simulations when a fight is rerun (D-05, D-24)', async () => {
        const { first, enemy } = await startedWorldMission();
        await service.simulate(inputOf(first, 0, enemy));
        await service.simulate(inputOf(first, 1, enemy, 3));

        const draft = await service.simulate(inputOf(first, 0, enemy));

        expect(draft.fights[0].verdict).not.toBeNull();
        expect(draft.fights[0].outcomes).toHaveLength(2);
        expect(draft.fights[1]).toEqual({
            enemies: [{ enemy, quantity: 3 }],
            verdict: null,
            outcomes: [],
        });
    });

    it('refuses an unknown enemy (D-24)', async () => {
        const { first } = await startedWorldMission();
        const before = await storedDraft();

        await expect(
            service.simulate(inputOf(first, 0, new Types.ObjectId())),
        ).rejects.toMatchObject(NOT_FOUND);
        expect(await storedDraft()).toEqual(before);
    });

    it('hands the equipped companion to the engine (D-20)', async () => {
        const companion = (await persistPet(world.models.pets, { maxXp: 100 }))
            ._id as Types.ObjectId;
        const { first, second, enemy } = await startedWorldMission({
            pet: companion,
            ownedPets: [buildOwnedPet(companion, { currentLifePoints: 40 })],
        });
        const scripted = new ScriptedCombatResolver();
        combat.current = scripted;

        await service.simulate(inputOf(first, 0, enemy));

        const participantOf = (subject: Quester) =>
            scripted.contexts[0].participants.find(
                ({ characterId }) =>
                    characterId === String(subject.characterId),
            );
        expect(participantOf(second)!.companion).toMatchObject({
            petId: String(companion),
            currentLifePoints: 40,
        });
        expect(participantOf(first)!.companion).toBeNull();
    });
});
