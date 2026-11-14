import { Types, type Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import {
    characterTouch,
    primeChangeStream,
} from '../../test/harness/prime-change-stream';
import { buildCharacter } from '../../test/fixtures';

const ACCEPTED_AT = new Date('2026-11-14T09:00:00.000Z');
const STARTED_AT = new Date('2026-11-14T10:00:00.000Z');
const HOUR_MS = 3_600_000;
// gli eventi del setup possono precedere quello atteso: se ne leggono al più tanti
const MAX_EVENTS = 6;

const FLAGS_SELECTION = 'status { missionInProgress guidedMissionInProgress }';
const CHARACTER_FLAGS_UPDATED = `subscription OnCharacter($id: String!) { characterUpdated(id: $id) { ${FLAGS_SELECTION} } }`;
const CHARACTER_FLAGS_QUERY = `query Character($id: String!) { character(id: $id) { ${FLAGS_SELECTION} } }`;

interface MissionFlags {
    missionInProgress: boolean;
    guidedMissionInProgress: boolean;
}

type FlagsUpdatedResult = { characterUpdated: { status: MissionFlags } };
type FlagsSubscription = OpenSubscription<FlagsUpdatedResult>;
type Lane = 'pendingQuest' | 'activeStoryQuest' | 'activeWorldMissionQuest';

const FREE: MissionFlags = {
    missionInProgress: false,
    guidedMissionInProgress: false,
};
const STANDARD_STARTED: MissionFlags = {
    missionInProgress: true,
    guidedMissionInProgress: false,
};
const GUIDED: MissionFlags = {
    missionInProgress: true,
    guidedMissionInProgress: true,
};

describe('mission in progress flags (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    const opened: FlagsSubscription[] = [];

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        url = graphqlWsUrl(harness.port);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        await pendingQuests.init();
        await primeChangeStream(
            harness,
            'characterUpdated',
            characterTouch(harness),
        );
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

    async function pendingQuestOf(
        quest: Types.ObjectId,
        startDate: Date | null,
        extra: { arrivedAt?: Date } = {},
    ): Promise<Types.ObjectId> {
        const pendingQuest = await pendingQuests.create({
            startDate,
            arrivedAt: null,
            waitingTime: HOUR_MS,
            pointsSpent: 0,
            quest,
            ...extra,
        });
        return pendingQuest._id as Types.ObjectId;
    }

    async function heroOn(
        twitchId: string,
        lanes: Partial<Record<Lane, Types.ObjectId>> = {},
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                quests: {
                    ...buildCharacter().quests,
                    completedQuests: [],
                    ...lanes,
                },
            },
        });
    }

    function subscribeTo(player: TestPlayer): FlagsSubscription {
        const subscription = openSubscription<FlagsUpdatedResult>(
            url,
            { Authorization: player.bearer },
            {
                query: CHARACTER_FLAGS_UPDATED,
                variables: { id: String(player.character?._id) },
            },
        );
        opened.push(subscription);
        return subscription;
    }

    async function nextFlags(
        subscription: FlagsSubscription,
    ): Promise<MissionFlags> {
        const result = await subscription.next();
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data!.characterUpdated.status;
    }

    // l'ultimo stato letto: si ferma al primo evento uguale all'atteso
    async function flagsUntil(
        subscription: FlagsSubscription,
        expected: MissionFlags,
    ): Promise<MissionFlags> {
        let flags = await nextFlags(subscription);
        for (
            let read = 1;
            read < MAX_EVENTS && !sameFlags(flags, expected);
            read++
        ) {
            flags = await nextFlags(subscription);
        }
        return flags;
    }

    async function queriedFlags(player: TestPlayer): Promise<unknown> {
        const response = await graphqlRequest(
            harness.app,
            CHARACTER_FLAGS_QUERY,
            { id: String(player.character?._id) },
            player.bearer,
        );
        return response.body;
    }

    // stessa scrittura di QuestStartService.startSingle: solo la PendingQuest cambia, il personaggio no
    it('emits the lock when a solo quest starts on arrival (D-16)', async () => {
        const pendingQuestId = await pendingQuestOf(
            new Types.ObjectId(),
            null,
            {
                arrivedAt: STARTED_AT,
            },
        );
        const hero = await heroOn('tw-solo-arrival', {
            pendingQuest: pendingQuestId,
        });
        const subscription = subscribeTo(hero);
        expect(await nextFlags(subscription)).toEqual(FREE);

        await pendingQuests.updateOne(
            { _id: pendingQuestId, startDate: null },
            [{ $set: { startDate: '$arrivedAt' } }],
        );

        expect(await flagsUntil(subscription, STANDARD_STARTED)).toEqual(
            STANDARD_STARTED,
        );
    });

    it('emits the release when a normal mission ends (D-23)', async () => {
        const hero = await heroOn('tw-mission-end', {
            pendingQuest: await pendingQuestOf(
                new Types.ObjectId(),
                STARTED_AT,
            ),
        });
        const subscription = subscribeTo(hero);
        expect(await nextFlags(subscription)).toEqual(STANDARD_STARTED);

        await characters.updateOne(
            { _id: hero.character?._id },
            { $set: { 'quests.pendingQuest': null } },
        );

        expect(await flagsUntil(subscription, FREE)).toEqual(FREE);
    });

    it('emits the lock when the party starts (D-16)', async () => {
        const pendingQuestId = await pendingQuestOf(new Types.ObjectId(), null);
        const hero = await heroOn('tw-party-start', {
            pendingQuest: pendingQuestId,
        });
        const subscription = subscribeTo(hero);
        expect(await nextFlags(subscription)).toEqual(FREE);

        await pendingQuests.updateOne(
            { _id: pendingQuestId },
            { $set: { startDate: STARTED_AT } },
        );

        expect(await flagsUntil(subscription, STANDARD_STARTED)).toEqual(
            STANDARD_STARTED,
        );
    });

    it('emits both flags when a guided draft starts and ends (D-23)', async () => {
        const worldMission = new Types.ObjectId();
        const enrolled = await Promise.all(
            ['tw-guided-first', 'tw-guided-second'].map(async (twitchId) =>
                heroOn(twitchId, {
                    activeWorldMissionQuest: await pendingQuestOf(
                        worldMission,
                        ACCEPTED_AT,
                    ),
                }),
            ),
        );
        const subscriptions = enrolled.map(subscribeTo);
        for (const subscription of subscriptions) {
            expect(await nextFlags(subscription)).toEqual(FREE);
        }

        await pendingQuests.updateMany(
            { quest: worldMission },
            { $set: { missionDraftStartedAt: STARTED_AT } },
        );
        for (const subscription of subscriptions) {
            expect(await flagsUntil(subscription, GUIDED)).toEqual(GUIDED);
        }

        await pendingQuests.updateMany(
            { quest: worldMission },
            { $set: { missionDraftStartedAt: null } },
        );
        for (const subscription of subscriptions) {
            expect(await flagsUntil(subscription, FREE)).toEqual(FREE);
        }
    });

    it('answers free for a wounded character awaiting aid (D-23)', async () => {
        const wounded = await createPlayer(harness, {
            twitchId: 'tw-query-wounded',
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: ACCEPTED_AT,
                    },
                },
            },
        });

        expect(await queriedFlags(wounded)).toEqual({
            data: { character: { status: FREE } },
        });
    });

    it('answers the flags on the character query (D-16)', async () => {
        const free = await heroOn('tw-query-free');
        const fighting = await heroOn('tw-query-fighting', {
            pendingQuest: await pendingQuestOf(
                new Types.ObjectId(),
                STARTED_AT,
            ),
        });
        const draftId = await pendingQuestOf(new Types.ObjectId(), ACCEPTED_AT);
        await pendingQuests.updateOne(
            { _id: draftId },
            { $set: { missionDraftStartedAt: STARTED_AT } },
        );
        const guided = await heroOn('tw-query-guided', {
            activeStoryQuest: draftId,
        });

        const answers = await Promise.all(
            [free, fighting, guided].map(queriedFlags),
        );

        expect(answers).toEqual(
            [FREE, STANDARD_STARTED, GUIDED].map((status) => ({
                data: { character: { status } },
            })),
        );
    });
});

function sameFlags(left: MissionFlags, right: MissionFlags): boolean {
    return (
        left.missionInProgress === right.missionInProgress &&
        left.guidedMissionInProgress === right.guidedMissionInProgress
    );
}
