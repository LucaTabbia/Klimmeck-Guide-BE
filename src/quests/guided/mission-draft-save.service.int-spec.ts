import { type Model, Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildPoi,
    buildQuest,
    persistEnemy,
    persistLootItem,
    persistSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GuidedMissionModule } from './guided-mission.module';
import type {
    MissionFightInput,
    SaveMissionDraftInput,
} from './mission-draft.inputs';
import {
    MissionDraft,
    type MissionDraftRecord,
    MissionDraftStep,
    type MissionFightRecord,
} from './mission-draft.model';
import { MissionDraftSaveService } from './mission-draft-save.service';
import { MissionDraftService } from './mission-draft.service';
import { MissionSimulationChance } from './mission-simulation.chance';
import { MissionSimulationService } from './mission-simulation.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const NOT_FOUND = { code: 'NOT_FOUND' };
const OUTCOME_OVERRIDE_INVALID = { code: 'OUTCOME_OVERRIDE_INVALID' };
const OUTCOME_NOT_PARTICIPANT = { code: 'OUTCOME_NOT_PARTICIPANT' };

describe('MissionDraftSaveService (replSet)', () => {
    let world: OutcomeHarness;
    let service: MissionDraftSaveService;
    let simulation: MissionSimulationService;
    let drafts: MissionDraftService;
    let draftModel: Model<any>;
    let pois: Model<PointOfInterest>;
    let seq = 0;
    const sharedChance = new SequenceChance();
    const simulationChance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock: new FixedClock(NOW),
            chance: sharedChance,
            imports: [GuidedMissionModule],
            overrides: [
                { token: MissionSimulationChance, useValue: simulationChance },
            ],
        });
        service = world.harness.app.get(MissionDraftSaveService);
        simulation = world.harness.app.get(MissionSimulationService);
        drafts = world.harness.app.get(MissionDraftService);
        const connection = world.harness.connection;
        draftModel = connection.model(MissionDraft.name);
        await draftModel.init();
        pois =
            (connection.models[PointOfInterest.name] as
                | Model<PointOfInterest>
                | undefined) ??
            connection.model<PointOfInterest>(
                PointOfInterest.name,
                PointOfInterestSchema,
            );
    });

    beforeEach(async () => {
        await world.reset();
        sharedChance.load([]);
        simulationChance.load([]);
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
            twitchId: `tw-save-${seq}`,
            lane: QuestLane.worldMission,
            ...options,
        });
    }

    const lifeOf = (currentLifePoints: number) => ({
        currentLifePoints,
        maxLifePoints: 1000,
    });

    // due iscritti a vita 800 e 900 su 1000; il primo ha una ferita, tre pozioni e una magia attiva
    async function startedWorldMission() {
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
            characterOverrides: { status: lifeOf(900) },
        });
        await drafts.start(String(first.pendingQuest._id), null);
        return { first, second, potion, spell, enemy };
    }

    const hexOf = (subject: Quester) => String(subject.pendingQuest._id);

    const simulate = (
        subject: Quester,
        fightIndex: number,
        enemy: Types.ObjectId,
    ) =>
        simulation.simulate({
            pendingQuestId: hexOf(subject),
            fightIndex,
            enemies: [{ enemy: String(enemy), quantity: 1 }],
        });

    const save = (
        subject: Quester,
        sections: Omit<SaveMissionDraftInput, 'pendingQuestId'>,
    ) => service.save({ pendingQuestId: hexOf(subject), ...sections });

    const fightOf = (
        enemy: Types.ObjectId,
        quantity = 1,
        corrections?: ParticipantOverrideInput[],
    ): MissionFightInput => ({
        enemies: [{ enemy: String(enemy), quantity }],
        corrections,
    });

    const correctionOf = (
        subject: Quester,
        correction: Omit<ParticipantOverrideInput, 'characterId'> = {},
    ): ParticipantOverrideInput => ({
        characterId: String(subject.characterId),
        ...correction,
    });

    const outcomeOf = (fight: MissionFightRecord, subject: Quester) =>
        fight.outcomes.find(
            ({ character }) =>
                String(character) === String(subject.characterId),
        );

    const storedDraft = () => draftModel.findOne().lean<MissionDraftRecord>();

    describe('step, place and fights', () => {
        it('saves the step and the place in any order (D-18)', async () => {
            const { first, second } = await startedWorldMission();
            const place = (await pois.create(buildPoi()))._id;

            await save(first, { step: MissionDraftStep.prizes });
            const saved = await save(second, { place: String(place) });

            expect(saved.step).toBe(MissionDraftStep.prizes);
            expect(saved.place).toEqual(place);
            await expect(
                save(first, { place: String(new Types.ObjectId()) }),
            ).rejects.toMatchObject(NOT_FOUND);
            expect((await storedDraft())!.place).toEqual(place);
        });

        it('keeps the last write of two devices (D-18)', async () => {
            const { first, second } = await startedWorldMission();

            await save(first, { step: MissionDraftStep.fights });
            await save(second, { step: MissionDraftStep.recap });

            expect((await storedDraft())!.step).toBe(MissionDraftStep.recap);
        });

        it('keeps the simulations of an unchanged prefix (D-24)', async () => {
            const { first, enemy } = await startedWorldMission();
            const simulated = await simulate(first, 0, enemy);

            const saved = await save(first, {
                fights: [fightOf(enemy), fightOf(enemy, 2)],
            });

            expect(saved.fights[0]).toEqual(simulated.fights[0]);
            expect(saved.fights[1]).toEqual({
                enemies: [{ enemy, quantity: 2 }],
                verdict: null,
                outcomes: [],
            });
        });

        it('voids a fight whose enemies changed and the following ones (D-24)', async () => {
            const { first, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);
            await simulate(first, 1, enemy);

            const saved = await save(first, {
                fights: [fightOf(enemy, 2), fightOf(enemy)],
            });

            expect(saved.fights).toEqual([
                {
                    enemies: [{ enemy, quantity: 2 }],
                    verdict: null,
                    outcomes: [],
                },
                {
                    enemies: [{ enemy, quantity: 1 }],
                    verdict: null,
                    outcomes: [],
                },
            ]);
        });

        it('saves a draft with no fights (D-24)', async () => {
            const { first, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);

            const saved = await save(first, { fights: [] });

            expect(saved.fights).toEqual([]);
            expect((await storedDraft())!.fights).toEqual([]);
        });

        it('refuses an unknown enemy (D-24)', async () => {
            const { first, enemy } = await startedWorldMission();
            const before = await storedDraft();

            await expect(
                save(first, {
                    fights: [fightOf(enemy), fightOf(new Types.ObjectId())],
                }),
            ).rejects.toMatchObject(NOT_FOUND);
            expect(await storedDraft()).toEqual(before);
        });
    });

    describe('corrections', () => {
        it('corrects a fight within the bounds at its start (D-06)', async () => {
            const { first, potion, spell, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);

            const lowest = await save(first, {
                fights: [
                    fightOf(enemy, 1, [
                        correctionOf(first, {
                            hpAfter: 1,
                            injuries: [InjuryType.fracturedRib],
                            consumablesUsed: [
                                { item: String(potion), quantity: 3 },
                            ],
                            spellsUsed: [{ spell: String(spell), usages: 5 }],
                        }),
                    ]),
                ],
            });
            const highest = await save(first, {
                fights: [
                    fightOf(enemy, 1, [correctionOf(first, { hpAfter: 1000 })]),
                ],
            });

            expect(outcomeOf(lowest.fights[0], first)!.corrected).toEqual({
                hpAfter: 1,
                injuriesAdded: [InjuryType.fracturedRib],
                consumablesUsed: [{ item: potion, quantity: 3 }],
                spellsUsed: [{ spell, usages: 5 }],
            });
            expect(outcomeOf(highest.fights[0], first)!.corrected).toEqual({
                hpAfter: 1000,
                injuriesAdded: [],
                consumablesUsed: [],
                spellsUsed: [],
            });
        });

        it('refuses a correction out of bounds (D-06)', async () => {
            const { first, potion, spell, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);
            const second = await simulate(first, 1, enemy);
            const remaining = outcomeOf(second.fights[1], first)!
                .spellsAvailable[0].usages;
            const before = await storedDraft();
            const correctFirst = (
                correction: Omit<ParticipantOverrideInput, 'characterId'>,
            ) =>
                save(first, {
                    fights: [
                        fightOf(enemy, 1, [correctionOf(first, correction)]),
                    ],
                });

            await expect(correctFirst({ hpAfter: 0 })).rejects.toMatchObject(
                OUTCOME_OVERRIDE_INVALID,
            );
            await expect(correctFirst({ hpAfter: 1001 })).rejects.toMatchObject(
                OUTCOME_OVERRIDE_INVALID,
            );
            await expect(
                correctFirst({
                    consumablesUsed: [{ item: String(potion), quantity: 4 }],
                }),
            ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            await expect(
                save(first, {
                    fights: [
                        fightOf(enemy),
                        fightOf(enemy, 1, [
                            correctionOf(first, {
                                spellsUsed: [
                                    {
                                        spell: String(spell),
                                        usages: remaining + 1,
                                    },
                                ],
                            }),
                        ]),
                    ],
                }),
            ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            await expect(
                save(first, {
                    fights: [
                        fightOf(enemy, 1, [
                            {
                                characterId: String(new Types.ObjectId()),
                                hpAfter: 10,
                            },
                        ]),
                    ],
                }),
            ).rejects.toMatchObject(OUTCOME_NOT_PARTICIPANT);
            expect(await storedDraft()).toEqual(before);
        });

        it('refuses a correction that adds an injury the character already had (D-14)', async () => {
            const { first, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);
            const before = await storedDraft();

            await expect(
                save(first, {
                    fights: [
                        fightOf(enemy, 1, [
                            correctionOf(first, {
                                injuries: [InjuryType.deepCut],
                            }),
                        ]),
                    ],
                }),
            ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            expect(await storedDraft()).toEqual(before);
            const character = await world.models.characters
                .findById(first.characterId)
                .lean<{ status: { injuries: InjuryType[] } }>()
                .exec();
            expect(character!.status.injuries).toEqual([InjuryType.deepCut]);
        });

        it('voids the following simulations when a fight is corrected (D-24)', async () => {
            const { first, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);
            await simulate(first, 1, enemy);
            const corrected = () =>
                save(first, {
                    fights: [
                        fightOf(enemy, 1, [
                            correctionOf(first, { hpAfter: 500 }),
                        ]),
                        fightOf(enemy),
                    ],
                });

            const voided = await corrected();
            const rerun = await simulate(first, 1, enemy);
            const repeated = await corrected();

            expect(voided.fights[1]).toEqual({
                enemies: [{ enemy, quantity: 1 }],
                verdict: null,
                outcomes: [],
            });
            expect(outcomeOf(rerun.fights[1], first)!.hpBefore).toBe(500);
            expect(repeated.fights[1]).toEqual(rerun.fights[1]);
        });

        it('refuses corrections on an unsimulated fight (D-24)', async () => {
            const { first, enemy } = await startedWorldMission();
            const before = await storedDraft();

            await expect(
                save(first, {
                    fights: [
                        fightOf(enemy, 1, [
                            correctionOf(first, { hpAfter: 500 }),
                        ]),
                    ],
                }),
            ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            expect(await storedDraft()).toEqual(before);
        });

        it('reverts an unlisted character to the simulated effect (D-06)', async () => {
            const { first, second, enemy } = await startedWorldMission();
            await simulate(first, 0, enemy);
            await save(first, {
                fights: [
                    fightOf(enemy, 1, [
                        correctionOf(first, { hpAfter: 600 }),
                        correctionOf(second, { hpAfter: 700 }),
                    ]),
                ],
            });

            const saved = await save(first, {
                fights: [
                    fightOf(enemy, 1, [correctionOf(first, { hpAfter: 600 })]),
                ],
            });

            expect(outcomeOf(saved.fights[0], first)!.corrected!.hpAfter).toBe(
                600,
            );
            expect(outcomeOf(saved.fights[0], second)!.corrected).toBeNull();
            expect(
                outcomeOf(saved.fights[0], second)!.simulated,
            ).not.toBeNull();
        });
    });
});
