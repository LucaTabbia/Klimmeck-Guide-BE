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
import { buildEnemy, buildQuest } from '../../../test/fixtures';
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
});
