import { Model, Schema, Types } from 'mongoose';
import { City, CitySchema } from 'src/models/city.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestsModule } from 'src/quests/quests.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import {
    buildCharacter,
    buildCity,
    buildQuest,
    persistCity,
    persistPoi,
    persistQuest,
} from '../../test/fixtures';

const BOARD = 'query { quests { id } }';
const VIEWER_TITLE = 'paladin';
const CONCLUDED_AT = new Date('2026-11-05T10:00:00.000Z');

interface BoardBody {
    data?: { quests?: { id: string }[] } | null;
    errors?: unknown[];
}

interface BoardCity {
    marker: Types.ObjectId;
    pois: Types.ObjectId[];
}

interface QuestOptions {
    type?: QuestType;
    minTitle?: string;
    concludedAt?: Date | null;
}

describe('quest board by area (wire)', () => {
    let harness: AuthTestApp;
    let quests: Model<any>;
    let pois: Model<any>;
    let cities: Model<any>;
    let pendingQuests: Model<any>;
    let cityA: BoardCity;
    let cityB: BoardCity;
    let seq = 0;

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    async function poiId(): Promise<Types.ObjectId> {
        return (await persistPoi(pois))._id as Types.ObjectId;
    }

    // città A senza il marker fra i POI elencati, città B con il marker elencato: entrambe le forme del dato reale
    async function persistBoardCity(listMarker: boolean): Promise<BoardCity> {
        const marker = await poiId();
        const listed = [await poiId(), await poiId()];
        await persistCity(cities, {
            markerLocation: marker,
            pointsOfInterest: listMarker ? [marker, ...listed] : listed,
        });
        return { marker, pois: listed };
    }

    async function questAt(
        marker: Types.ObjectId,
        options: QuestOptions = {},
    ): Promise<string> {
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type: options.type ?? QuestType.hunt,
                markerLocation: marker,
            },
            requirements: {
                ...base.requirements,
                minTitle: options.minTitle ?? 'rookie',
            },
            concludedAt: options.concludedAt ?? null,
        });
        return String(quest._id);
    }

    function viewerAt(
        location: Types.ObjectId,
        overrides: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        seq += 1;
        return createPlayer(harness, {
            twitchId: `twitch-board-${seq}`,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    location,
                    title: VIEWER_TITLE,
                },
                ...overrides,
            },
        });
    }

    async function lanesOf(
        questIds: readonly string[],
    ): Promise<Record<string, unknown>> {
        const [pendingQuest, activeStoryQuest, activeWorldMissionQuest] =
            await Promise.all(
                questIds.map(
                    async (quest) =>
                        (
                            await pendingQuests.create({
                                startDate: CONCLUDED_AT,
                                waitingTime: 0,
                                pointsSpent: 0,
                                quest: new Types.ObjectId(quest),
                            })
                        )._id,
                ),
            );
        return {
            completedQuests: [],
            pendingQuest: pendingQuest ?? null,
            activeStoryQuest: activeStoryQuest ?? null,
            activeWorldMissionQuest: activeWorldMissionQuest ?? null,
        };
    }

    async function boardOf(bearer: string): Promise<string[]> {
        const body = (await graphqlRequest(harness.app, BOARD, {}, bearer))
            .body as BoardBody;
        expect(body.errors).toBeUndefined();
        return (body.data?.quests ?? []).map((quest) => quest.id).sort();
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [QuestsModule] });
        quests = modelOf(Quest.name, QuestSchema);
        pois = modelOf(PointOfInterest.name, PointOfInterestSchema);
        cities = modelOf(City.name, CitySchema);
        pendingQuests = modelOf(PendingQuest.name, PendingQuestSchema);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        cityA = await persistBoardCity(false);
        cityB = await persistBoardCity(true);
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('shows only the open quests on the pois of the city of the character (D-05)', async () => {
        const onMarker = await questAt(cityA.marker);
        const onPoi = await questAt(cityA.pois[0]);
        await questAt(cityB.pois[0]);
        const viewer = await viewerAt(cityA.marker);

        expect(await boardOf(viewer.bearer)).toEqual([onMarker, onPoi].sort());
    });

    it('finds the city from a listed poi as well as from the marker (D-05)', async () => {
        const onMarker = await questAt(cityA.marker);
        const onPoi = await questAt(cityA.pois[0]);
        await questAt(cityB.marker);
        const viewer = await viewerAt(cityA.pois[1]);

        expect(await boardOf(viewer.bearer)).toEqual([onMarker, onPoi].sort());
    });

    it('adds the open story quests of the exact title from anywhere (D-05)', async () => {
        const story = await questAt(cityB.pois[0], {
            type: QuestType.story,
            minTitle: VIEWER_TITLE,
        });
        await questAt(cityB.pois[0], {
            type: QuestType.story,
            minTitle: 'mage',
        });
        await questAt(cityB.pois[1]);
        const viewer = await viewerAt(cityA.marker);

        expect(await boardOf(viewer.bearer)).toEqual([story]);
    });

    it('keeps the quests of the three lanes even when they are elsewhere (D-05)', async () => {
        const laneQuests = [
            await questAt(cityB.pois[0]),
            await questAt(cityB.pois[1], {
                type: QuestType.story,
                minTitle: 'mage',
            }),
            await questAt(cityB.marker, { type: QuestType.worldMission }),
        ];
        await questAt(cityB.pois[0]);
        const viewer = await viewerAt(cityA.marker, {
            quests: await lanesOf(laneQuests),
        });

        expect(await boardOf(viewer.bearer)).toEqual([...laneQuests].sort());
    });

    it('answers an empty board without a current character (D-05)', async () => {
        await questAt(cityA.marker);
        await questAt(cityB.pois[0], {
            type: QuestType.story,
            minTitle: 'rookie',
        });
        const adventurer = await createPlayer(harness, {
            twitchId: 'twitch-board-nobody',
            withCharacter: false,
        });
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-board-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });

        expect(await boardOf(adventurer.bearer)).toEqual([]);
        expect(await boardOf(innkeeper.bearer)).toEqual([]);
    });

    it('answers an empty board for an archived character (D-05)', async () => {
        await questAt(cityA.marker);
        await questAt(cityB.pois[0], {
            type: QuestType.story,
            minTitle: VIEWER_TITLE,
        });
        const viewer = await viewerAt(cityA.marker, {
            deletedAt: CONCLUDED_AT,
        });

        expect(await boardOf(viewer.bearer)).toEqual([]);
    });

    it('shows only the lanes and the title stories on the road (D-05)', async () => {
        const road = await poiId();
        await questAt(road);
        await questAt(cityA.marker);
        const story = await questAt(cityB.pois[0], {
            type: QuestType.story,
            minTitle: VIEWER_TITLE,
        });
        const lane = await questAt(cityB.pois[1]);
        const viewer = await viewerAt(road, {
            quests: await lanesOf([lane]),
        });

        expect(await boardOf(viewer.bearer)).toEqual([story, lane].sort());
    });

    it('hides concluded quests in the city and in the lanes (D-05)', async () => {
        const open = await questAt(cityA.pois[0]);
        await questAt(cityA.marker, { concludedAt: CONCLUDED_AT });
        const concludedLane = await questAt(cityB.pois[0], {
            concludedAt: CONCLUDED_AT,
        });
        const viewer = await viewerAt(cityA.marker, {
            quests: await lanesOf([concludedLane]),
        });

        expect(await boardOf(viewer.bearer)).toEqual([open]);
    });

    it('finds a city whose marker is stored as a legacy hex string (D-05)', async () => {
        const marker = await poiId();
        const listed = await poiId();
        await cities.collection.insertOne(
            buildCity({
                markerLocation: marker.toHexString(),
                pointsOfInterest: [listed],
            }),
        );
        const onMarker = await questAt(marker);
        const onPoi = await questAt(listed);
        await questAt(cityA.marker);
        const viewer = await viewerAt(marker);

        expect(await boardOf(viewer.bearer)).toEqual([onMarker, onPoi].sort());
    });
});
