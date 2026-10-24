import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { PendingRequestsModule } from 'src/quests/pending-requests/pending-requests.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../../test/auth/ws-test-client';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { persistQuest } from '../../../test/fixtures';
import { primePendingRequestsChangeStream } from '../../../test/quests/pending-requests-change-stream';

const REQUEST_FIELDS =
    'id startDate pointsSpent quest { id type title requiredAdventurers { title count } registeredAdventurers { character title } } character { id name title location activeTravel { endTime } awaitingAid { aidQuest } } user { id twitchId }';
const PENDING_REQUESTS = `{ pendingRequests { ${REQUEST_FIELDS} } }`;
const PENDING_REQUESTS_UPDATED = `subscription { pendingRequestsUpdated { ${REQUEST_FIELDS} } }`;
const STARTED_AT = new Date('2026-10-01T10:00:00.000Z');
// finestra di silenzio che chiude una raffica: l'ultima lista ricevuta è lo stato finale
const SETTLED_WINDOW_MS = 1000;
const EXPECTED_WITHIN_MS = 5000;

interface WireRequest {
    id: string;
    startDate: string | null;
    pointsSpent: number;
    quest: {
        id: string;
        type: string;
        title: string;
        requiredAdventurers: { title: string | null; count: number }[];
        registeredAdventurers: { character: string; title: string }[];
    };
    character: {
        id: string;
        name: string;
        title: string;
        location: string;
        activeTravel: { endTime: string } | null;
        awaitingAid: { aidQuest: string } | null;
    };
    user: { id: string; twitchId: string };
}

interface WireBody {
    data?: { pendingRequests?: WireRequest[] } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

type QueueUpdated = { pendingRequestsUpdated: WireRequest[] };
type QueueSubscription = OpenSubscription<QueueUpdated>;

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function idsOf(requests: WireRequest[]): string[] {
    return requests.map((entry) => entry.id).sort();
}

describe('pendingRequests / pendingRequestsUpdated (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let quests: Model<QuestDocument>;
    const opened: QueueSubscription[] = [];

    let aria: TestPlayer;
    let bram: TestPlayer;
    let oste: TestPlayer;
    let storyPq: PendingQuestDocument;
    let missionPq: PendingQuestDocument;
    let storyQuest: QuestDocument;
    let missionQuest: QuestDocument;

    function modelOf<T>(name: string): Model<T> {
        return harness.app.get<Model<T>>(getModelToken(name));
    }

    async function persistGmQuest(
        type: string,
        title: string,
        overrides: Record<string, unknown> = {},
    ): Promise<QuestDocument> {
        return (await persistQuest(quests, {
            infos: {
                title,
                type,
                markerLocation: new Types.ObjectId(),
                relatedLore: [],
            },
            ...overrides,
        })) as QuestDocument;
    }

    function pendingQuestOf(
        quest: QuestDocument,
        id = new Types.ObjectId(),
    ): Promise<PendingQuestDocument> {
        return pendingQuests.create({
            _id: id,
            startDate: STARTED_AT,
            waitingTime: 0,
            pointsSpent: 300,
            quest: quest._id,
        });
    }

    function playerOnLane(
        twitchId: string,
        lane: 'activeStoryQuest' | 'activeWorldMissionQuest',
        pendingQuestId: Types.ObjectId | null,
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                quests: { completedQuests: [], [lane]: pendingQuestId },
            },
        });
    }

    function setLane(
        player: TestPlayer,
        lane: 'activeStoryQuest' | 'activeWorldMissionQuest',
        pendingQuestId: Types.ObjectId | null,
    ) {
        return characters.updateOne(
            { _id: player.character?._id },
            { $set: { [`quests.${lane}`]: pendingQuestId } },
        );
    }

    function subscribe(bearer: string): QueueSubscription {
        const subscription = openSubscription<QueueUpdated>(
            url,
            { Authorization: bearer },
            { query: PENDING_REQUESTS_UPDATED },
        );
        opened.push(subscription);
        return subscription;
    }

    async function nextList(
        subscription: QueueSubscription,
        timeoutMs = EXPECTED_WITHIN_MS,
    ): Promise<WireRequest[]> {
        const result = await subscription.next(timeoutMs);
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.pendingRequestsUpdated as WireRequest[];
    }

    // i ricalcoli di eventi precedenti possono arrivare prima: si attende la prima lista che soddisfa il predicato
    async function listMatching(
        subscription: QueueSubscription,
        predicate: (requests: WireRequest[]) => boolean,
    ): Promise<WireRequest[]> {
        const deadline = Date.now() + EXPECTED_WITHIN_MS;
        for (;;) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new Error('expected list never arrived');
            const requests = await nextList(subscription, remaining);
            if (predicate(requests)) return requests;
        }
    }

    async function lastListBeforeSilence(
        subscription: QueueSubscription,
    ): Promise<WireRequest[] | undefined> {
        let last: WireRequest[] | undefined;
        for (;;) {
            const received = await nextList(
                subscription,
                SETTLED_WINDOW_MS,
            ).catch(() => undefined);
            if (!received) return last;
            last = received;
        }
    }

    async function expectRejection(
        subscription: QueueSubscription,
    ): Promise<{ message: string; extensions?: unknown }> {
        const first = await subscription.next();
        expect(first.done).toBe(false);
        expect(first.value.data ?? null).toBeNull();
        expect(first.value.errors).toHaveLength(1);
        const second = await subscription.next();
        expect(second.done).toBe(true);
        return first.value.errors?.[0] as {
            message: string;
            extensions?: unknown;
        };
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [PendingRequestsModule],
        });
        url = graphqlWsUrl(harness.port);
        characters = modelOf<CharacterDocument>(Character.name);
        pendingQuests = modelOf<PendingQuestDocument>(PendingQuest.name);
        quests = modelOf<QuestDocument>(Quest.name);
        await pendingQuests.createCollection();
        await characters.createCollection();
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        await primePendingRequestsChangeStream(harness);
        storyQuest = await persistGmQuest('story', 'The king');
        missionQuest = await persistGmQuest('worldMission', 'The siege', {
            requirements: {
                requiredAdventurers: [{ title: TitleType.rookie, count: 2 }],
                recommendedLoot: [],
                minTitle: TitleType.rookie,
            },
        });
        storyPq = await pendingQuestOf(storyQuest);
        missionPq = await pendingQuestOf(missionQuest);
        aria = await playerOnLane(
            'twitch-pr-aria',
            'activeStoryQuest',
            storyPq._id as Types.ObjectId,
        );
        bram = await playerOnLane(
            'twitch-pr-bram',
            'activeWorldMissionQuest',
            missionPq._id as Types.ObjectId,
        );
        await quests.updateOne(
            { _id: missionQuest._id },
            {
                $set: {
                    registeredAdventurers: [
                        {
                            character: bram.character?._id,
                            title: TitleType.rookie,
                        },
                    ],
                },
            },
        );
        oste = await createPlayer(harness, {
            twitchId: 'twitch-pr-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    describe('pendingRequests query', () => {
        it('returns the story and world mission requests to the innkeeper', async () => {
            const response = await graphqlRequest(
                harness.app,
                PENDING_REQUESTS,
                undefined,
                oste.bearer,
            );

            const body = bodyOf(response);
            expect(body.errors).toBeUndefined();
            const requests = body.data?.pendingRequests ?? [];
            expect(idsOf(requests)).toEqual(
                [String(storyPq._id), String(missionPq._id)].sort(),
            );
            expect(
                requests.find((entry) => entry.id === String(missionPq._id)),
            ).toEqual({
                id: String(missionPq._id),
                startDate: STARTED_AT.toISOString(),
                pointsSpent: 300,
                quest: {
                    id: String(missionQuest._id),
                    type: 'worldMission',
                    title: 'The siege',
                    requiredAdventurers: [
                        { title: TitleType.rookie, count: 2 },
                    ],
                    registeredAdventurers: [
                        {
                            character: String(bram.character?._id),
                            title: TitleType.rookie,
                        },
                    ],
                },
                character: {
                    id: String(bram.character?._id),
                    name: 'Eroe twitch-pr-bram',
                    title: TitleType.rookie,
                    location: (
                        bram.character?.status.location as Types.ObjectId
                    ).toHexString(),
                    activeTravel: null,
                    awaitingAid: null,
                },
                user: { id: String(bram.user._id), twitchId: 'twitch-pr-bram' },
            });
        });

        it('rejects an adventurer with FORBIDDEN', async () => {
            const body = bodyOf(
                await graphqlRequest(
                    harness.app,
                    PENDING_REQUESTS,
                    undefined,
                    aria.bearer,
                ),
            );

            expect(body.data ?? null).toBeNull();
            expect(body.errors?.[0].extensions.code).toBe('FORBIDDEN');
        });

        it('rejects a call without a bearer with UNAUTHENTICATED', async () => {
            const body = bodyOf(
                await graphqlRequest(harness.app, PENDING_REQUESTS),
            );

            expect(body.errors?.[0].extensions.code).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });
    });

    describe('pendingRequestsUpdated subscription', () => {
        it('sends the current queue as snapshot on subscribe', async () => {
            const snapshot = await nextList(subscribe(oste.bearer));

            expect(idsOf(snapshot)).toEqual(
                [String(storyPq._id), String(missionPq._id)].sort(),
            );
        });

        it('sends the full queue with a new request after its pending quest is inserted', async () => {
            const subscription = subscribe(oste.bearer);
            await nextList(subscription);
            const cora = await playerOnLane(
                'twitch-pr-cora',
                'activeStoryQuest',
                null,
            );
            const coraPqId = new Types.ObjectId();

            await setLane(cora, 'activeStoryQuest', coraPqId);
            await pendingQuestOf(storyQuest, coraPqId);

            const requests = await listMatching(subscription, (list) =>
                list.some((entry) => entry.id === coraPqId.toHexString()),
            );
            expect(idsOf(requests)).toEqual(
                [
                    String(storyPq._id),
                    String(missionPq._id),
                    coraPqId.toHexString(),
                ].sort(),
            );
            expect(
                requests.find((entry) => entry.id === coraPqId.toHexString())
                    ?.character.id,
            ).toBe(String(cora.character?._id));
        });

        it('sends the queue without the request after its pending quest is deleted', async () => {
            const subscription = subscribe(oste.bearer);
            await nextList(subscription);

            await setLane(aria, 'activeStoryQuest', null);
            await pendingQuests.deleteOne({ _id: storyPq._id });
            // sentinella ordinata: una lista che la contiene è stata calcolata dopo il delete
            const sentinelPqId = new Types.ObjectId();
            await setLane(aria, 'activeStoryQuest', sentinelPqId);
            await pendingQuestOf(storyQuest, sentinelPqId);

            const requests = await listMatching(subscription, (list) =>
                list.some((entry) => entry.id === sentinelPqId.toHexString()),
            );
            expect(idsOf(requests)).toEqual(
                [String(missionPq._id), sentinelPqId.toHexString()].sort(),
            );
        });

        it('rejects an adventurer with FORBIDDEN and no snapshot', async () => {
            const error = await expectRejection(subscribe(aria.bearer));

            expect(error.extensions).toEqual({ code: 'FORBIDDEN' });
        });

        it('settles on an empty queue after three pending quests are deleted in one transaction', async () => {
            const cora = await playerOnLane(
                'twitch-pr-cora',
                'activeWorldMissionQuest',
                null,
            );
            const coraPq = await pendingQuestOf(missionQuest);
            await setLane(
                cora,
                'activeWorldMissionQuest',
                coraPq._id as Types.ObjectId,
            );
            const subscription = subscribe(oste.bearer);
            await nextList(subscription);

            await harness.connection.transaction(async (session) => {
                await pendingQuests.deleteMany(
                    { _id: { $in: [storyPq._id, missionPq._id, coraPq._id] } },
                    { session },
                );
                await characters.updateMany(
                    {},
                    {
                        $set: {
                            'quests.activeStoryQuest': null,
                            'quests.activeWorldMissionQuest': null,
                        },
                    },
                    { session },
                );
            });

            expect(await lastListBeforeSilence(subscription)).toEqual([]);
        });
    });
});
