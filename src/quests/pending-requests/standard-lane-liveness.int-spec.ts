import type { PubSub } from '@graphql-yoga/subscription';
import { getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { PUSH_CONFIG } from 'src/config/push-config';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import type { PendingRequest } from 'src/models/pending-request.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import { QuestResolutionService } from 'src/quests/outcomes/quest-resolution.service';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { PartyAbandonService } from 'src/quests/party/party-abandon.service';
import { PartyLifecycleModule } from 'src/quests/party/party-lifecycle.module';
import { PARTY_TIMEOUT_MS } from 'src/quests/party/party-rules';
import { PartyTimeoutService } from 'src/quests/party/party-timeout.service';
import { TRAVEL_QUEUE } from 'src/travel/travel-job';
import {
    type AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { withTimeout } from '../../../test/auth/ws-test-client';
import { createPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistQuest,
} from '../../../test/fixtures';
import { FakePushTransport } from '../../../test/push/fake-push-transport';
import {
    initOutcomeCollections,
    OUTCOME_START,
    OUTCOME_WAITING_TIME_MS,
    outcomeModels,
    type OutcomeModels,
    persistQuester,
    type Quester,
    QUIET_OUTCOME_OVERRIDES,
} from '../../../test/quests/outcome-world';
import { primePendingRequestsChangeStream } from '../../../test/quests/pending-requests-change-stream';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import { PendingRequestsModule } from './pending-requests.module';
import { PendingRequestsPublisher } from './pending-requests.publisher';

const NOW = new Date(OUTCOME_START.getTime() + OUTCOME_WAITING_TIME_MS);
const PARTY_OPENED_AT = new Date(NOW.getTime() - PARTY_TIMEOUT_MS);
// finestra di silenzio che chiude una raffica: l'ultima lista ricevuta è lo stato finale
const SETTLED_WINDOW_MS = 1000;

type QueueStream = AsyncIterableIterator<
    PubSubEvents['pendingRequestsUpdated'][0]
>;

const bossQuest = {
    infos: { ...buildQuest().infos, type: 'boss' },
    requirements: {
        ...buildQuest().requirements,
        requiredAdventurers: [{ title: null, count: 3 }],
    },
};

const jobQuest = {
    infos: { ...buildQuest().infos, type: 'job', title: 'Lavoro al porto' },
    prizes: { ...buildQuest().prizes, randomLoot: [] },
};

describe('standard lane liveness of the innkeeper queue (D-24)', () => {
    let harness: AuthTestApp;
    let models: OutcomeModels;
    let live: QueueStream;
    // la lettura resta in volo fra una chiamata e l'altra: un evento arrivato dopo una finestra scaduta non si perde
    let pending: ReturnType<QueueStream['next']>;
    let seq = 0;
    const clock = new FixedClock(NOW);

    beforeAll(async () => {
        harness = await createAuthTestApp({
            clock,
            imports: [
                PendingRequestsModule,
                QuestAcceptanceModule,
                PartyLifecycleModule,
            ],
            overrides: [
                ...QUIET_OUTCOME_OVERRIDES,
                { token: PushTransport, useValue: new FakePushTransport() },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
                {
                    token: getQueueToken(SPELL_RECOVERY_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
                {
                    token: getQueueToken(TRAVEL_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
            ],
        });
        models = outcomeModels(harness);
        await initOutcomeCollections(harness, models);
    });

    beforeEach(async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        await harness.clearDatabase();
        await primePendingRequestsChangeStream(harness);
        live = harness.app
            .get<PubSub<PubSubEvents>>(PUB_SUB)
            .subscribe('pendingRequestsUpdated');
        pending = live.next();
    });

    afterEach(async () => {
        await live.return?.();
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function lastListBeforeSilence(): Promise<
        PendingRequest[] | undefined
    > {
        let last: PendingRequest[] | undefined;
        for (;;) {
            const received = await withTimeout(
                pending,
                SETTLED_WINDOW_MS,
            ).catch(() => undefined);
            if (!received || received.done) return last;
            last = received.value.pendingRequestsUpdated;
            pending = live.next();
        }
    }

    // la coda dopo la raffica: la voce del personaggio indicato, o undefined se non c'è più
    async function settledEntryOf(
        characterId: Types.ObjectId,
    ): Promise<PendingRequest | undefined> {
        const list = await lastListBeforeSilence();
        expect(list).toBeDefined();
        return list?.find(
            (entry) => entry.character.id === characterId.toHexString(),
        );
    }

    // la story che tiene il personaggio nella coda del GM
    async function storyLane(): Promise<Types.ObjectId> {
        const story = await persistQuest(models.quests, {
            infos: { ...buildQuest().infos, type: 'story', title: 'The king' },
        });
        const pendingQuest = await models.pendingQuests.create({
            startDate: OUTCOME_START,
            waitingTime: 0,
            pointsSpent: 300,
            quest: story._id,
        });
        return pendingQuest._id as Types.ObjectId;
    }

    async function storyHolderOnStandard(
        questOverrides: Record<string, unknown>,
        startDate: Date | null,
    ): Promise<Quester> {
        seq += 1;
        return persistQuester(harness, {
            twitchId: `tw-liveness-${seq}`,
            questOverrides,
            startDate,
            arrivedAt: OUTCOME_START,
            characterOverrides: {
                quests: { activeStoryQuest: await storyLane() },
            },
        });
    }

    // il setup inserisce le PendingQuest prima dei personaggi: un ricalcolo esplicito fotografa lo stato di partenza
    async function laneAfterSetup(
        characterId: Types.ObjectId,
    ): Promise<unknown> {
        harness.app.get(PendingRequestsPublisher).requestRefresh();
        return (await settledEntryOf(characterId))?.character.pendingQuest;
    }

    async function settledLaneOf(subject: Quester): Promise<unknown> {
        return (await settledEntryOf(subject.characterId))?.character
            .pendingQuest;
    }

    it('re-emits the queue with the standard lane after a standard acceptance', async () => {
        const marker = new Types.ObjectId();
        await persistCity(models.cities, {
            markerLocation: marker,
            pointsOfInterest: [marker],
        });
        const base = buildCharacter();
        seq += 1;
        const player = await createPlayer(harness, {
            twitchId: `tw-liveness-${seq}`,
            characterOverrides: {
                status: { ...base.status, location: marker },
                quests: {
                    ...base.quests,
                    completedQuests: [],
                    pendingQuest: null,
                    activeStoryQuest: await storyLane(),
                },
            },
        });
        const characterId = player.character?._id as Types.ObjectId;
        const hunt = await persistQuest(models.quests, {
            infos: { ...buildQuest().infos, markerLocation: marker },
        });
        expect(await laneAfterSetup(characterId)).toEqual(null);

        const pendingQuestId = await harness.app
            .get(QuestAcceptanceService)
            .accept({
                ownerId: player.user._id as Types.ObjectId,
                characterId,
                questId: hunt._id as Types.ObjectId,
            });

        expect(
            (await settledEntryOf(characterId))?.character.pendingQuest,
        ).toEqual(pendingQuestId.toHexString());
    });

    it('re-emits the queue with a free lane after the standard quest is resolved', async () => {
        const subject = await storyHolderOnStandard(jobQuest, OUTCOME_START);
        expect(await laneAfterSetup(subject.characterId)).toEqual(
            String(subject.pendingQuest._id),
        );

        await expect(
            harness.app.get(QuestResolutionService).resolveStandard({
                pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
                startDate: OUTCOME_START,
            }),
        ).resolves.toBe('resolved');

        expect(await settledLaneOf(subject)).toEqual(null);
    });

    it('re-emits the queue with a free lane after the standard quest is abandoned', async () => {
        const subject = await storyHolderOnStandard(bossQuest, null);
        expect(await laneAfterSetup(subject.characterId)).toEqual(
            String(subject.pendingQuest._id),
        );

        await harness.app.get(PartyAbandonService).abandon({
            characterId: subject.characterId,
            questId: subject.quest._id as Types.ObjectId,
        });

        expect(await settledLaneOf(subject)).toEqual(null);
    });

    it('re-emits the queue with a free lane after the party is disbanded', async () => {
        const subject = await storyHolderOnStandard(bossQuest, null);
        await models.quests.updateOne(
            { _id: subject.quest._id },
            {
                $set: {
                    'registeredAdventurers.$[].registeredAt': PARTY_OPENED_AT,
                },
            },
        );
        expect(await laneAfterSetup(subject.characterId)).toEqual(
            String(subject.pendingQuest._id),
        );

        await expect(
            harness.app.get(PartyTimeoutService).disband({
                questId: subject.quest._id as Types.ObjectId,
            }),
        ).resolves.toBe('disbanded');

        expect(await settledLaneOf(subject)).toEqual(null);
    });

    it('re-emits the queue without an archived holder', async () => {
        const subject = await storyHolderOnStandard(jobQuest, OUTCOME_START);
        expect(await laneAfterSetup(subject.characterId)).toEqual(
            String(subject.pendingQuest._id),
        );

        await models.characters.updateOne(
            { _id: subject.characterId },
            { $set: { deletedAt: NOW, deletionReason: DeletionReason.death } },
        );

        expect(await lastListBeforeSilence()).toEqual([]);
    });
});
