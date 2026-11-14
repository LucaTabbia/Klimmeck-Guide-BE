import { type Model, Types } from 'mongoose';
import {
    AdminAuditLog,
    AdminAuditLogSchema,
    AUDIT_OUTCOME_OK,
} from 'src/authz/audit/admin-audit-log.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import {
    buildEnemy,
    buildEquipmentItem,
    buildLootItem,
    buildPet,
    buildQuest,
    buildSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GuidedMissionModule } from './guided-mission.module';
import { MissionDraft } from './mission-draft.model';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const START =
    'mutation StartMissionDraft($pendingQuestId: ID!) { startMissionDraft(pendingQuestId: $pendingQuestId) { id questType participants { character name } prizes { character xp } fights { verdict } } }';
const READ =
    'query MissionDraft($pendingQuestId: ID!) { missionDraft(pendingQuestId: $pendingQuestId) { id } }';
const ENEMIES =
    'query MissionEnemies($pendingQuestId: ID!, $showAll: Boolean) { missionEnemies(pendingQuestId: $pendingQuestId, showAll: $showAll) { id } }';
const DISCARD =
    'mutation DiscardMissionDraft($pendingQuestId: ID!) { discardMissionDraft(pendingQuestId: $pendingQuestId) { response successful } }';

interface WireDraft {
    id: string;
    questType?: string;
    participants?: { character: string; name: string }[];
    prizes?: { character: string; xp: number }[];
    fights?: unknown[];
}

interface WireBody {
    data?: {
        startMissionDraft?: WireDraft | null;
        missionDraft?: WireDraft | null;
        discardMissionDraft?: { response: string; successful: boolean };
        missionEnemies?: { id: string }[] | null;
    } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

describe('GuidedMissionResolver (wire)', () => {
    let world: OutcomeHarness;
    let audits: Model<AdminAuditLog>;
    let pois: Model<PointOfInterest>;
    let seq = 0;

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock: new FixedClock(NOW),
            chance: new SequenceChance(),
            imports: [GuidedMissionModule],
        });
        const connection = world.harness.connection;
        audits =
            (connection.models[AdminAuditLog.name] as
                | Model<AdminAuditLog>
                | undefined) ??
            connection.model<AdminAuditLog>(
                AdminAuditLog.name,
                AdminAuditLogSchema,
            );
        await audits.init();
        await connection.model(MissionDraft.name).init();
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
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function worldMissionPair(): Promise<[Quester, Quester]> {
        seq += 2;
        const first = await persistQuester(world.harness, {
            twitchId: `tw-gm-wire-${seq}a`,
            lane: QuestLane.worldMission,
            questOverrides: {
                infos: {
                    ...buildQuest().infos,
                    type: 'worldMission',
                    title: 'La corte del re',
                },
                requirements: {
                    ...buildQuest().requirements,
                    minTitle: 'rookie',
                },
                prizes: { ...buildQuest().prizes, xpPrize: 300 },
            },
        });
        const second = await persistQuester(world.harness, {
            twitchId: `tw-gm-wire-${seq}b`,
            lane: QuestLane.worldMission,
            quest: first.quest,
        });
        return [first, second];
    }

    function innkeeper(): Promise<TestPlayer> {
        seq += 1;
        return createPlayer(world.harness, {
            twitchId: `tw-gm-oste-${seq}`,
            role: RoleType.innkeeper,
        });
    }

    const hexOf = (subject: Quester) => String(subject.pendingQuest._id);

    async function send(
        document: string,
        pendingQuestId: string,
        bearer: string,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            world.harness.app,
            document,
            { pendingQuestId },
            bearer,
        );
        return response.body as WireBody;
    }

    it('starts, reads and discards a draft over the wire (D-09)', async () => {
        const [first, second] = await worldMissionPair();
        const oste = await innkeeper();

        const started = await send(START, hexOf(first), oste.bearer);

        expect(started.errors).toBeUndefined();
        const draft = started.data!.startMissionDraft!;
        expect(draft.questType).toBe('worldMission');
        expect(draft.fights).toEqual([]);
        const seated = [first, second].map((subject) => ({
            character: String(subject.characterId),
            name: subject.player.character!.infos.name,
        }));
        expect(
            [...draft.participants!].sort((a, b) =>
                a.character.localeCompare(b.character),
            ),
        ).toEqual(
            seated.sort((a, b) => a.character.localeCompare(b.character)),
        );
        expect(draft.prizes!.map(({ character }) => character).sort()).toEqual(
            seated.map(({ character }) => character).sort(),
        );

        const read = await send(READ, hexOf(second), oste.bearer);

        expect(read.errors).toBeUndefined();
        expect(read.data!.missionDraft).toEqual({ id: draft.id });

        const discarded = await send(DISCARD, hexOf(second), oste.bearer);

        expect(discarded.errors).toBeUndefined();
        expect(discarded.data!.discardMissionDraft).toEqual({
            response: 'Bozza scartata',
            successful: true,
        });
        const after = await send(READ, hexOf(first), oste.bearer);
        expect(after.errors).toBeUndefined();
        expect(after.data!.missionDraft).toBeNull();
    });

    it('never serves the draft to a player (D-10)', async () => {
        const [first] = await worldMissionPair();
        const oste = await innkeeper();
        await send(START, hexOf(first), oste.bearer);

        for (const document of [START, READ, DISCARD]) {
            const body = await send(
                document,
                hexOf(first),
                first.player.bearer,
            );

            // la query è nullable: il rifiuto arriva come data { missionDraft: null }
            expect(Object.values(body.data ?? {})).not.toContainEqual(
                expect.anything(),
            );
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['FORBIDDEN']);
        }
        expect(
            await world.harness.connection
                .model(MissionDraft.name)
                .countDocuments(),
        ).toBe(1);
    });

    it('audits the draft mutations and not the read (D-26)', async () => {
        const [first] = await worldMissionPair();
        const oste = await innkeeper();
        const pendingQuestId = hexOf(first);

        await send(START, pendingQuestId, oste.bearer);
        await send(READ, pendingQuestId, oste.bearer);
        await send(DISCARD, pendingQuestId, oste.bearer);
        await send(READ, pendingQuestId, oste.bearer);

        const records = await audits.find().sort({ _id: 1 }).lean().exec();
        expect(records.map(({ action }) => action)).toEqual([
            'startMissionDraft',
            'discardMissionDraft',
        ]);
        for (const record of records) {
            expect(record).toMatchObject({
                actor: { userId: String(oste.user._id), role: 'innkeeper' },
                target: { type: 'PendingQuest', id: pendingQuestId },
                args: { pendingQuestId },
                outcome: AUDIT_OUTCOME_OK,
            });
        }
    });

    it('answers not found for an unknown pending quest (D-09)', async () => {
        const oste = await innkeeper();

        const body = await send(
            START,
            new Types.ObjectId().toHexString(),
            oste.bearer,
        );

        expect(body.data ?? null).toBeNull();
        expect(body.errors?.map(({ extensions }) => extensions.code)).toEqual([
            'NOT_FOUND',
        ]);
    });

    describe('mission enemies', () => {
        interface Bestiary {
            ruinsRookie: string;
            cityPaladin: string;
            forestMage: string;
            anywhereMage: string;
            ruinsMage: string;
            cityMage: string;
            ruinsLegend: string;
            forestLegend: string;
        }

        interface EnemyWorld {
            ruins: Types.ObjectId;
            marker: Types.ObjectId;
            enemies: Bestiary;
        }

        async function poiOf(type: string[]): Promise<Types.ObjectId> {
            const poi = await pois.create({
                type,
                location: [0, 0],
                city: new Types.ObjectId(),
            });
            return poi._id;
        }

        async function enemyOf(
            name: string,
            xp: number,
            locations: string[],
            legendary = false,
        ): Promise<string> {
            const enemy = await world.models.enemies.create(
                buildEnemy({ name, xp, locations, legendary }),
            );
            return String(enemy._id);
        }

        async function enemyWorld(): Promise<EnemyWorld> {
            return {
                ruins: await poiOf(['ruins']),
                marker: await poiOf(['city']),
                enemies: {
                    ruinsRookie: await enemyOf('Ratto delle rovine', 10, [
                        'ruins',
                    ]),
                    cityPaladin: await enemyOf('Guardia corrotta', 100, [
                        'city',
                    ]),
                    forestMage: await enemyOf('Bestia della foresta', 300, [
                        'minnelyForest',
                    ]),
                    anywhereMage: await enemyOf('Ombra errante', 300, ['all']),
                    ruinsMage: await enemyOf('Spettro delle rovine', 300, [
                        'ruins',
                    ]),
                    cityMage: await enemyOf('Assassino dei vicoli', 500, [
                        'city',
                    ]),
                    ruinsLegend: await enemyOf(
                        'Re delle rovine',
                        2000,
                        ['ruins'],
                        true,
                    ),
                    forestLegend: await enemyOf(
                        'Drago della foresta',
                        2500,
                        ['minnelyForest'],
                        true,
                    ),
                },
            };
        }

        async function mageWorldMission(
            location: Types.ObjectId,
        ): Promise<[Quester, Quester]> {
            seq += 2;
            const characterOverrides = { status: { location } };
            const first = await persistQuester(world.harness, {
                twitchId: `tw-gm-enemies-${seq}a`,
                lane: QuestLane.worldMission,
                characterOverrides,
                questOverrides: {
                    infos: {
                        ...buildQuest().infos,
                        type: 'worldMission',
                        title: 'Le rovine del re',
                    },
                    requirements: {
                        ...buildQuest().requirements,
                        minTitle: 'mage',
                        requiredAdventurers: [{ title: 'mage', count: 2 }],
                    },
                },
            });
            const second = await persistQuester(world.harness, {
                twitchId: `tw-gm-enemies-${seq}b`,
                lane: QuestLane.worldMission,
                characterOverrides,
                quest: first.quest,
            });
            return [first, second];
        }

        async function enemiesOf(
            pendingQuestId: string,
            bearer: string,
            showAll?: boolean,
        ): Promise<WireBody> {
            const response = await graphqlRequest(
                world.harness.app,
                ENEMIES,
                { pendingQuestId, showAll },
                bearer,
            );
            return response.body as WireBody;
        }

        const idsOf = (body: WireBody): string[] | undefined =>
            body.data?.missionEnemies?.map(({ id }) => id);

        it('lists the ruins and city enemies of the mage band plus the legendaries (D-03, D-19)', async () => {
            const { ruins, marker, enemies } = await enemyWorld();
            const [first] = await mageWorldMission(marker);
            const oste = await innkeeper();
            await send(START, hexOf(first), oste.bearer);
            await world.harness.connection
                .model(MissionDraft.name)
                .updateOne({}, { $set: { place: ruins } });

            const body = await enemiesOf(hexOf(first), oste.bearer);

            expect(body.errors).toBeUndefined();
            expect(idsOf(body)).toEqual([
                enemies.ruinsMage,
                enemies.cityMage,
                enemies.ruinsLegend,
            ]);
        });

        it('lists the whole bestiary with show all (D-03)', async () => {
            const { ruins, enemies } = await enemyWorld();
            const [first] = await mageWorldMission(ruins);
            const oste = await innkeeper();

            const body = await enemiesOf(hexOf(first), oste.bearer, true);

            expect(body.errors).toBeUndefined();
            expect(idsOf(body)).toEqual([
                enemies.ruinsRookie,
                enemies.cityPaladin,
                enemies.forestMage,
                enemies.anywhereMage,
                enemies.ruinsMage,
                enemies.cityMage,
                enemies.ruinsLegend,
                enemies.forestLegend,
            ]);
        });

        it('reads the place of the first participant without a draft (D-01)', async () => {
            const { marker, enemies } = await enemyWorld();
            const [first] = await mageWorldMission(marker);
            const oste = await innkeeper();

            const body = await enemiesOf(hexOf(first), oste.bearer);

            expect(body.errors).toBeUndefined();
            expect(idsOf(body)).toEqual([enemies.cityMage]);
        });

        it('offers no legendary for a story (D-03)', async () => {
            const { ruins, enemies } = await enemyWorld();
            seq += 1;
            const story = await persistQuester(world.harness, {
                twitchId: `tw-gm-enemies-${seq}s`,
                lane: QuestLane.story,
                characterOverrides: { status: { location: ruins } },
                questOverrides: {
                    infos: {
                        ...buildQuest().infos,
                        type: 'story',
                        title: 'La guardia corrotta',
                    },
                    requirements: {
                        ...buildQuest().requirements,
                        minTitle: 'paladin',
                    },
                },
            });
            const oste = await innkeeper();

            const body = await enemiesOf(hexOf(story), oste.bearer);

            expect(body.errors).toBeUndefined();
            expect(idsOf(body)).toEqual([enemies.cityPaladin]);
        });

        it('refuses an adventurer (D-03)', async () => {
            const { ruins } = await enemyWorld();
            const [first] = await mageWorldMission(ruins);

            const body = await enemiesOf(hexOf(first), first.player.bearer);

            expect(Object.values(body.data ?? {})).not.toContainEqual(
                expect.anything(),
            );
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['FORBIDDEN']);
        });
    });

    describe('mission fight simulation', () => {
        const SIMULATE =
            'mutation SimulateMissionFight($input: SimulateMissionFightInput!) { simulateMissionFight(input: $input) { id fights { verdict enemies { enemy { id } quantity } outcomes { character hpBefore injuriesBefore consumablesAvailable { item quantity } spellsAvailable { spell usages } simulated { hpAfter } corrected { hpAfter } } } } }';

        interface WireOutcome {
            character: string;
            hpBefore: number;
            injuriesBefore: string[];
            consumablesAvailable: { item: string; quantity: number }[];
            spellsAvailable: { spell: string; usages: number }[];
            simulated: { hpAfter: number } | null;
            corrected: { hpAfter: number } | null;
        }

        interface SimulationBody {
            data?: {
                simulateMissionFight?: {
                    id: string;
                    fights: {
                        verdict: string | null;
                        enemies: { enemy: { id: string }; quantity: number }[];
                        outcomes: WireOutcome[];
                    }[];
                } | null;
            } | null;
            errors?: { message: string; extensions: Record<string, unknown> }[];
        }

        async function startedPair() {
            const [first, second] = await worldMissionPair();
            const oste = await innkeeper();
            await send(START, hexOf(first), oste.bearer);
            const enemy = String(
                (await world.models.enemies.create(buildEnemy()))._id,
            );
            return { first, second, oste, enemy };
        }

        async function simulate(
            pendingQuestId: string,
            enemy: string,
            bearer: string,
            quantity = 1,
        ): Promise<SimulationBody> {
            const response = await graphqlRequest(
                world.harness.app,
                SIMULATE,
                {
                    input: {
                        pendingQuestId,
                        fightIndex: 0,
                        enemies: [{ enemy, quantity }],
                    },
                },
                bearer,
            );
            return response.body as SimulationBody;
        }

        const storedFights = async () =>
            (
                await world.harness.connection
                    .model(MissionDraft.name)
                    .findOne()
                    .lean<{ fights: unknown[] }>()
                    .exec()
            )?.fights;

        it('simulates the first fight over the wire (D-04)', async () => {
            const { first, second, oste, enemy } = await startedPair();

            const body = await simulate(hexOf(second), enemy, oste.bearer, 2);

            expect(body.errors).toBeUndefined();
            const [fight] = body.data!.simulateMissionFight!.fights;
            expect(fight.verdict).not.toBeNull();
            expect(fight.enemies).toEqual([
                { enemy: { id: enemy }, quantity: 2 },
            ]);
            const byCharacter = [...fight.outcomes].sort((a, b) =>
                a.character.localeCompare(b.character),
            );
            const expected = [first, second]
                .map((subject) => ({
                    character: String(subject.characterId),
                    hpBefore:
                        subject.player.character!.status.currentLifePoints,
                    injuriesBefore: [],
                    consumablesAvailable: [],
                    spellsAvailable: [],
                    simulated: { hpAfter: expect.any(Number) },
                    corrected: null,
                }))
                .sort((a, b) => a.character.localeCompare(b.character));
            expect(byCharacter).toEqual(expected);
            expect(await storedFights()).toHaveLength(1);
        });

        it('refuses an adventurer (D-10)', async () => {
            const { first, enemy } = await startedPair();

            const body = await simulate(
                hexOf(first),
                enemy,
                first.player.bearer,
            );

            expect(body.data ?? null).toBeNull();
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['FORBIDDEN']);
            expect(await storedFights()).toEqual([]);
        });

        it('audits the simulation (D-26)', async () => {
            const { first, oste, enemy } = await startedPair();
            const pendingQuestId = hexOf(first);

            await simulate(pendingQuestId, enemy, oste.bearer);

            const records = await audits
                .find({ action: 'simulateMissionFight' })
                .lean()
                .exec();
            expect(records).toHaveLength(1);
            expect(records[0]).toMatchObject({
                actor: { userId: String(oste.user._id), role: 'innkeeper' },
                target: { type: 'PendingQuest', id: pendingQuestId },
                outcome: AUDIT_OUTCOME_OK,
            });
        });

        it('rejects an enemy quantity over the cap (D-24)', async () => {
            const { first, oste, enemy } = await startedPair();

            const body = await simulate(hexOf(first), enemy, oste.bearer, 21);

            expect(body.data ?? null).toBeNull();
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['BAD_USER_INPUT']);
            expect(await storedFights()).toEqual([]);
        });
    });
    describe('mission prize options', () => {
        const OPTIONS =
            'query MissionPrizeOptions($characterId: ID!, $pendingQuestId: ID!) { missionPrizeOptions(characterId: $characterId, pendingQuestId: $pendingQuestId) { character title maxRarity block { xpPrize prizeItem { item { ... on EquipmentItem { id } } } pet { id } spell { id } } equipment { id } loot { id } pets { id } spells { id } } }';

        interface WireOptions {
            character: string;
            title: string;
            maxRarity: string;
            block: {
                xpPrize: number | null;
                prizeItem: { item: { id: string } } | null;
                pet: { id: string } | null;
                spell: { id: string } | null;
            };
            equipment: { id: string }[];
            loot: { id: string }[];
            pets: { id: string }[];
            spells: { id: string }[];
        }

        interface OptionsBody {
            data?: { missionPrizeOptions?: WireOptions | null } | null;
            errors?: { message: string; extensions: Record<string, unknown> }[];
        }

        interface PrizeCatalogue {
            equipment: Record<string, string>;
            blockSword: string;
            loot: Record<string, string>;
            rarePet: string;
            legendaryPet: string;
            learnable: string;
            costly: string;
            known: string;
            blockSpell: string;
        }

        const RARITIES = [
            'common',
            'uncommon',
            'rare',
            'ultrarare',
            'legendary',
        ] as const;

        const idOf = (document: { _id: unknown }) => String(document._id);

        async function byRarity(
            create: (rarity: string) => Promise<{ _id: unknown }>,
        ): Promise<Record<string, string>> {
            const entries: [string, string][] = [];
            for (const rarity of RARITIES) {
                entries.push([rarity, idOf(await create(rarity))]);
            }
            return Object.fromEntries(entries);
        }

        async function prizeCatalogue(): Promise<PrizeCatalogue> {
            const { equipmentItems, lootItems, pets, spells } = world.models;
            return {
                equipment: await byRarity((rarity) =>
                    equipmentItems.create(
                        buildEquipmentItem({ name: `Spada ${rarity}`, rarity }),
                    ),
                ),
                blockSword: idOf(
                    await equipmentItems.create(
                        buildEquipmentItem({
                            name: 'Spada del re',
                            rarity: 'legendary',
                        }),
                    ),
                ),
                loot: await byRarity((rarity) =>
                    lootItems.create(
                        buildLootItem({ name: `Pozione ${rarity}`, rarity }),
                    ),
                ),
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
                costly: idOf(
                    await spells.create(
                        buildSpell({ name: 'Meteora', minXpToLearn: 999999 }),
                    ),
                ),
                known: idOf(
                    await spells.create(
                        buildSpell({ name: 'Lampo', minXpToLearn: 100 }),
                    ),
                ),
                blockSpell: idOf(
                    await spells.create(
                        buildSpell({ name: 'Benedizione', minXpToLearn: 0 }),
                    ),
                ),
            };
        }

        async function mageAndPaladin(catalogue: PrizeCatalogue) {
            seq += 2;
            const mage = await persistQuester(world.harness, {
                twitchId: `tw-gm-prizes-${seq}a`,
                lane: QuestLane.worldMission,
                characterOverrides: {
                    status: {
                        title: 'mage',
                        xp: 20000,
                        spellStates: spellStatesOf([
                            { spell: catalogue.known, usages: 3 },
                        ]),
                    },
                },
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
                                randomLoot: [],
                            },
                            {
                                title: 'paladin',
                                xpPrize: 400,
                                randomLoot: [],
                                spell: new Types.ObjectId(catalogue.blockSpell),
                            },
                        ],
                    },
                },
            });
            const paladin = await persistQuester(world.harness, {
                twitchId: `tw-gm-prizes-${seq}b`,
                lane: QuestLane.worldMission,
                characterOverrides: { status: { title: 'paladin', xp: 20000 } },
                quest: mage.quest,
            });
            return { mage, paladin };
        }

        async function optionsOf(
            pendingQuestId: string,
            characterId: string,
            bearer: string,
        ): Promise<OptionsBody> {
            const response = await graphqlRequest(
                world.harness.app,
                OPTIONS,
                { pendingQuestId, characterId },
                bearer,
            );
            return response.body as OptionsBody;
        }

        const idsOf = (entries: { id: string }[] | undefined) =>
            (entries ?? []).map(({ id }) => id).sort();

        it('serves the block and the filtered catalogue of a mage (D-07, D-22)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage, paladin } = await mageAndPaladin(catalogue);
            const oste = await innkeeper();

            const body = await optionsOf(
                hexOf(paladin),
                String(mage.characterId),
                oste.bearer,
            );

            expect(body.errors).toBeUndefined();
            const options = body.data!.missionPrizeOptions!;
            expect(options.character).toBe(String(mage.characterId));
            expect(options.title).toBe('mage');
            expect(options.maxRarity).toBe('ultrarare');
            expect(options.block).toEqual({
                xpPrize: 700,
                prizeItem: { item: { id: catalogue.blockSword } },
                pet: null,
                spell: null,
            });
            const { equipment, loot } = catalogue;
            expect(idsOf(options.equipment)).toEqual(
                [
                    equipment.common,
                    equipment.uncommon,
                    equipment.rare,
                    equipment.ultrarare,
                    catalogue.blockSword,
                ].sort(),
            );
            expect(idsOf(options.loot)).toEqual(
                [loot.common, loot.uncommon, loot.rare, loot.ultrarare].sort(),
            );
            expect(idsOf(options.pets)).toEqual([catalogue.rarePet]);
            expect(idsOf(options.spells)).toEqual(
                [catalogue.learnable, catalogue.blockSpell].sort(),
            );
        });

        it('serves no catalogue spell to a paladin (D-07)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage, paladin } = await mageAndPaladin(catalogue);
            const oste = await innkeeper();

            const body = await optionsOf(
                hexOf(mage),
                String(paladin.characterId),
                oste.bearer,
            );

            expect(body.errors).toBeUndefined();
            const options = body.data!.missionPrizeOptions!;
            expect(options.title).toBe('paladin');
            expect(options.maxRarity).toBe('rare');
            expect(options.block.spell).toEqual({ id: catalogue.blockSpell });
            expect(idsOf(options.spells)).toEqual([catalogue.blockSpell]);
        });

        it('refuses a character outside the request (D-07)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage } = await mageAndPaladin(catalogue);
            const [stranger] = await worldMissionPair();
            const oste = await innkeeper();

            const body = await optionsOf(
                hexOf(mage),
                String(stranger.characterId),
                oste.bearer,
            );

            expect(body.data ?? null).toBeNull();
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['OUTCOME_NOT_PARTICIPANT']);
        });

        it('refuses an adventurer (D-10)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage } = await mageAndPaladin(catalogue);

            const body = await optionsOf(
                hexOf(mage),
                String(mage.characterId),
                mage.player.bearer,
            );

            expect(body.data ?? null).toBeNull();
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['FORBIDDEN']);
        });

        it('does not audit the query (D-26)', async () => {
            const catalogue = await prizeCatalogue();
            const { mage } = await mageAndPaladin(catalogue);
            const oste = await innkeeper();

            const body = await optionsOf(
                hexOf(mage),
                String(mage.characterId),
                oste.bearer,
            );

            expect(body.errors).toBeUndefined();
            expect(await audits.find({}).lean().exec()).toEqual([]);
        });
    });
});
