import { getQueueToken } from '@nestjs/bull';
import type { PubSub } from '@graphql-yoga/subscription';
import { Types, type Model } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { PartyModule } from 'src/quests/party/party.module';
import { QuestStartService } from 'src/quests/party/quest-start.service';
import type { AuthTestApp } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { withTimeout } from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { primeCharactersChangeStream } from '../../test/characters/characters-change-stream';
import { buildCharacter, buildQuest, persistQuest } from '../../test/fixtures';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const TEN = new Date('2026-10-30T10:00:00.000Z');
const TEN_THIRTY = new Date('2026-10-30T10:30:00.000Z');
const HOUR_MS = 3_600_000;
const EVENT_WAIT_MS = 3_000;

interface StartedSnapshot {
    _id: unknown;
    quests: { pendingQuest?: { startDate?: Date | null } | null };
}

type CharacterEvents = AsyncIterator<PubSubEvents['characterUpdated'][0]>;

describe('PendingQuestStartPublisher (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let pubSub: PubSub<PubSubEvents>;
    let questStart: QuestStartService;
    const questQueue = new FakeTravelQueue();

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            clock: new FixedClock(NOW),
            imports: [PartyModule],
            overrides: [
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: questQueue,
                },
            ],
        });
        quests = harness.connection.model<QuestDocument>(Quest.name);
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        questStart = harness.app.get(QuestStartService);
        await Promise.all([quests.init(), pendingQuests.init()]);
        await primeCharactersChangeStream(harness);
    });

    afterEach(async () => {
        questQueue.reset();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    // boss a due posti, entrambi i membri già sul marker: il secondo arrivo completa il party
    async function fullBossParty(): Promise<{
        questId: Types.ObjectId;
        members: Types.ObjectId[];
    }> {
        const quest = await persistQuest(quests, {
            infos: { ...buildQuest().infos, type: 'boss' },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: [{ title: null, count: 2 }],
            },
        });
        const questId = quest._id as Types.ObjectId;
        const members: Types.ObjectId[] = [];
        for (const [index, arrivedAt] of [TEN, TEN_THIRTY].entries()) {
            const pendingQuest = await pendingQuests.create({
                startDate: null,
                arrivedAt,
                waitingTime: HOUR_MS,
                pointsSpent: 0,
                quest: questId,
            });
            const player = await createPlayer(harness, {
                twitchId: `tw-party-start-${index}`,
                characterOverrides: {
                    quests: {
                        ...buildCharacter().quests,
                        completedQuests: [],
                        pendingQuest: pendingQuest._id,
                    },
                },
            });
            members.push(player.character!._id as Types.ObjectId);
        }
        await quests.updateOne(
            { _id: questId },
            {
                $push: {
                    registeredAdventurers: {
                        $each: members.map((character) => ({
                            character,
                            title: 'rookie',
                        })),
                    },
                },
            },
        );
        return { questId, members };
    }

    // eventi dei membri finché ognuno ha la corsia avviata; quelli del setup non hanno startDate
    async function startedMembersOf(
        live: CharacterEvents,
        members: readonly Types.ObjectId[],
    ): Promise<Map<string, Date>> {
        const pending = new Set(members.map((id) => id.toHexString()));
        const started = new Map<string, Date>();
        while (pending.size > 0) {
            const next = await withTimeout(live.next(), EVENT_WAIT_MS);
            const character = next.value
                .characterUpdated as unknown as StartedSnapshot;
            const id = String(character._id);
            const startDate = character.quests.pendingQuest?.startDate;
            if (!pending.has(id) || !startDate) continue;
            pending.delete(id);
            started.set(id, startDate);
        }
        return started;
    }

    it('sends characterUpdated to every member when a full party starts (D-22)', async () => {
        const { questId, members } = await fullBossParty();
        const live = pubSub.subscribe('characterUpdated');
        try {
            const started = startedMembersOf(live, members);

            await expect(questStart.tryStart({ questId })).resolves.toBe(
                'started',
            );

            expect(await started).toEqual(
                new Map(members.map((id) => [id.toHexString(), TEN_THIRTY])),
            );
        } finally {
            await live.return?.();
        }
    });
});
