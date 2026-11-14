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
    buildEquipmentItem,
    buildLootItem,
    buildPet,
    buildPoi,
    buildQuest,
    buildSpell,
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
    MissionPrizeInput,
    SaveMissionDraftInput,
} from './mission-draft.inputs';
import {
    MissionDraft,
    type MissionDraftRecord,
    MissionDraftStep,
    type MissionFightRecord,
    type MissionPrizeRecord,
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

    describe('prizes', () => {
        interface PrizeCatalogue {
            commonLoot: string;
            rareLoot: string;
            legendarySword: string;
            blockSword: string;
            rarePet: string;
            legendaryPet: string;
            learnable: string;
            blockSpell: string;
        }

        const idOf = (document: { _id: unknown }) => String(document._id);

        async function prizeCatalogue(): Promise<PrizeCatalogue> {
            const { equipmentItems, lootItems, pets, spells } = world.models;
            const equipment = (name: string, rarity: string) =>
                equipmentItems.create(buildEquipmentItem({ name, rarity }));
            const loot = (name: string, rarity: string) =>
                lootItems.create(buildLootItem({ name, rarity }));
            return {
                commonLoot: idOf(await loot('Pozione comune', 'common')),
                rareLoot: idOf(await loot('Pozione rara', 'rare')),
                legendarySword: idOf(
                    await equipment('Spada leggendaria', 'legendary'),
                ),
                blockSword: idOf(await equipment('Spada del re', 'legendary')),
                rarePet: idOf(
                    await pets.create(
                        buildPet({ name: 'Lupo', rarity: 'rare' }),
                    ),
                ),
                legendaryPet: idOf(
                    await pets.create(
                        buildPet({ name: 'Fenice', rarity: 'legendary' }),
                    ),
                ),
                learnable: idOf(
                    await spells.create(
                        buildSpell({ name: 'Scintilla', minXpToLearn: 100 }),
                    ),
                ),
                blockSpell: idOf(
                    await spells.create(
                        buildSpell({ name: 'Benedizione', minXpToLearn: 0 }),
                    ),
                ),
            };
        }

        // mage col solo oggetto del blocco (o il pool indicato), paladin con la magia e la cura del blocco
        async function mageAndPaladin(
            catalogue: PrizeCatalogue,
            mageLoot: Types.ObjectId[] = [],
        ) {
            const mage = await quester({
                characterOverrides: { status: { title: 'mage', xp: 20000 } },
                questOverrides: {
                    infos: {
                        ...buildQuest().infos,
                        type: 'worldMission',
                        title: 'Il tesoro del re',
                    },
                    requirements: {
                        ...buildQuest().requirements,
                        minTitle: 'paladin',
                        requiredAdventurers: [
                            { title: 'mage', count: 1 },
                            { title: 'paladin', count: 1 },
                        ],
                    },
                    prizes: {
                        ...buildQuest().prizes,
                        rankPrizes: [
                            {
                                title: 'mage',
                                xpPrize: 700,
                                prizeItem: {
                                    itemType: 'EquipmentItem',
                                    item: new Types.ObjectId(
                                        catalogue.blockSword,
                                    ),
                                    quantity: 1,
                                },
                                randomLoot: mageLoot.map((item) => ({
                                    itemType: 'LootItem',
                                    item,
                                    quantity: 1,
                                })),
                            },
                            {
                                title: 'paladin',
                                xpPrize: 400,
                                randomLoot: [],
                                spell: new Types.ObjectId(catalogue.blockSpell),
                                cure: {
                                    lifePointsShare: 0.5,
                                    canHeal: [InjuryType.deepCut],
                                },
                            },
                        ],
                    },
                },
            });
            const paladin = await quester({
                quest: mage.quest,
                characterOverrides: { status: { title: 'paladin', xp: 20000 } },
            });
            await drafts.start(hexOf(mage), null);
            return { mage, paladin };
        }

        const prizeOf = (
            subject: Quester,
            overrides: Partial<MissionPrizeInput> = {},
        ): MissionPrizeInput => ({
            characterId: String(subject.characterId),
            coins: { gold: 0, silver: 0, copper: 0 },
            cure: false,
            items: [],
            pet: null,
            spell: null,
            xp: 0,
            ...overrides,
        });

        const prizeIn = (
            prizes: readonly MissionPrizeRecord[],
            subject: Quester,
        ) =>
            prizes.find(
                ({ character }) =>
                    String(character) === String(subject.characterId),
            );

        it('saves a prize inside the rank filter with free coins and xp (D-07, D-15)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage, paladin } = await mageAndPaladin(catalogue);

            const saved = await save(paladin, {
                prizes: [
                    prizeOf(mage, {
                        coins: { gold: 5000, silver: 7, copper: 3 },
                        xp: 99999,
                        items: [
                            { item: catalogue.rareLoot, quantity: 99 },
                            { item: catalogue.blockSword, quantity: 1 },
                        ],
                        pet: catalogue.rarePet,
                        spell: catalogue.learnable,
                    }),
                ],
            });

            expect(prizeIn(saved.prizes, mage)).toEqual({
                character: mage.characterId,
                coins: { gold: 5000, silver: 7, copper: 3 },
                xp: 99999,
                items: [
                    {
                        itemType: 'LootItem',
                        item: new Types.ObjectId(catalogue.rareLoot),
                        quantity: 99,
                    },
                    {
                        itemType: 'EquipmentItem',
                        item: new Types.ObjectId(catalogue.blockSword),
                        quantity: 1,
                    },
                ],
                pet: new Types.ObjectId(catalogue.rarePet),
                spell: new Types.ObjectId(catalogue.learnable),
                cure: null,
            });
        });

        it('refuses a prize outside the rank filter (D-07, D-22)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage, paladin } = await mageAndPaladin(catalogue);
            const before = await storedDraft();

            for (const prize of [
                prizeOf(mage, {
                    items: [{ item: catalogue.legendarySword, quantity: 1 }],
                }),
                prizeOf(mage, { pet: catalogue.legendaryPet }),
                prizeOf(paladin, { spell: catalogue.learnable }),
                prizeOf(mage, {
                    items: [
                        { item: String(new Types.ObjectId()), quantity: 1 },
                    ],
                }),
            ]) {
                await expect(
                    save(mage, { prizes: [prize] }),
                ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            }
            expect(await storedDraft()).toEqual(before);
        });

        it('refuses a cure the block does not have and a quantity over 99 (D-15, D-22)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage, paladin } = await mageAndPaladin(catalogue);
            const before = await storedDraft();

            for (const prize of [
                prizeOf(mage, { cure: true }),
                prizeOf(mage, {
                    items: [{ item: catalogue.commonLoot, quantity: 100 }],
                }),
                prizeOf(mage, {
                    items: [
                        { item: catalogue.commonLoot, quantity: 1 },
                        { item: catalogue.commonLoot, quantity: 2 },
                    ],
                }),
            ]) {
                await expect(
                    save(mage, { prizes: [prize] }),
                ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            }
            expect(await storedDraft()).toEqual(before);

            const saved = await save(mage, {
                prizes: [prizeOf(paladin, { cure: true })],
            });
            expect(prizeIn(saved.prizes, paladin)!.cure).toEqual({
                lifePointsShare: 0.5,
                canHeal: [InjuryType.deepCut],
            });
        });

        it('refuses coins and xp that are not whole numbers from zero up (D-15)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage } = await mageAndPaladin(catalogue);
            const before = await storedDraft();

            for (const prize of [
                prizeOf(mage, { xp: -1 }),
                prizeOf(mage, { xp: 1.5 }),
                prizeOf(mage, { coins: { gold: -1, silver: 0, copper: 0 } }),
                prizeOf(mage, { coins: { gold: 0, silver: 0.5, copper: 0 } }),
            ]) {
                await expect(
                    save(mage, { prizes: [prize] }),
                ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            }
            expect(await storedDraft()).toEqual(before);
        });

        it('replaces the prize of the listed character only (D-18)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage, paladin } = await mageAndPaladin(catalogue);
            const paladinBefore = prizeIn(
                (await storedDraft())!.prizes,
                paladin,
            );

            const saved = await save(mage, {
                prizes: [prizeOf(mage, { xp: 10 })],
            });

            expect(saved.prizes).toHaveLength(2);
            expect(prizeIn(saved.prizes, mage)!.xp).toBe(10);
            expect(prizeIn(saved.prizes, mage)!.items).toEqual([]);
            expect(prizeIn(saved.prizes, paladin)).toEqual(paladinBefore);
        });

        it('saves unchanged a prefilled block with more than 50 distinct items (D-22)', async () => {
            const catalogue = await prizeCatalogue();
            const pool = await world.models.lootItems.insertMany(
                Array.from({ length: 60 }, (_, index) =>
                    buildLootItem({
                        name: `Gemma ${index}`,
                        rarity: 'legendary',
                    }),
                ),
            );
            const { mage } = await mageAndPaladin(
                catalogue,
                pool.map(({ _id }) => _id as Types.ObjectId),
            );
            const prefilled = prizeIn((await storedDraft())!.prizes, mage)!;
            expect(prefilled.items).toHaveLength(61);

            const saved = await save(mage, {
                prizes: [
                    {
                        characterId: String(mage.characterId),
                        coins: prefilled.coins,
                        cure: prefilled.cure !== null,
                        items: prefilled.items.map(({ item, quantity }) => ({
                            item: String(item),
                            quantity,
                        })),
                        pet: prefilled.pet ? String(prefilled.pet) : null,
                        spell: prefilled.spell ? String(prefilled.spell) : null,
                        xp: prefilled.xp,
                    },
                ],
            });

            expect(prizeIn(saved.prizes, mage)).toEqual(prefilled);
        });

        it('refuses a prize for a character outside the draft or listed twice (D-07)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage } = await mageAndPaladin(catalogue);
            const stranger = await quester({ questOverrides: gmQuest() });
            const before = await storedDraft();

            await expect(
                save(mage, { prizes: [prizeOf(stranger)] }),
            ).rejects.toMatchObject(OUTCOME_NOT_PARTICIPANT);
            await expect(
                save(mage, { prizes: [prizeOf(mage), prizeOf(mage)] }),
            ).rejects.toMatchObject(OUTCOME_OVERRIDE_INVALID);
            expect(await storedDraft()).toEqual(before);
        });
    });
});
