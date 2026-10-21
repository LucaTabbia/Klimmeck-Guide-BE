import { getQueueToken } from '@nestjs/bull';
import { Types, type Model } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { PushTransport } from 'src/push/transport/push-transport';
import { RoadsService } from 'src/roads/roads.service';
import { TravelCompletionService } from './travel-completion.service';
import { travelJobId, TRAVEL_QUEUE } from './travel-job';
import { TravelModule } from './travel.module';
import { TravelService } from './travel.service';
import { AuthTestApp } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { primeCharactersChangeStream } from '../../test/characters/characters-change-stream';
import { buildCharacter } from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';
import {
    persistTravelWorld,
    TravelWorld,
} from '../../test/travel/travel-world';

const STARTED_AT = new Date('2026-10-21T10:00:00.000Z');
const MISSING_ID = '64b0000000000000000000ff';
const MS_PER_SECOND = 1000;

describe('teleportCharacter', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let world: TravelWorld;
    let seq = 0;
    const clock = new FixedClock(STARTED_AT);
    const queue = new FakeTravelQueue();
    const push = new FakePushTransport();

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            clock,
            imports: [TravelModule],
            overrides: [
                { token: getQueueToken(TRAVEL_QUEUE), useValue: queue },
                { token: PushTransport, useValue: push },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
            ],
        });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        await Promise.all([characters.init(), users.init()]);
        await primeCharactersChangeStream(harness);
    });

    beforeEach(async () => {
        world = await persistTravelWorld(
            harness.connection,
            harness.app.get(RoadsService),
        );
    });

    afterEach(async () => {
        await harness.clearDatabase();
        queue.reset();
        push.reset();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function playerAt(
        location: Types.ObjectId,
        options: {
            role?: RoleType;
            pendingQuest?: Types.ObjectId | null;
            activeStoryQuest?: Types.ObjectId | null;
            activeWorldMissionQuest?: Types.ObjectId | null;
        } = {},
    ): Promise<TestPlayer> {
        seq += 1;
        const base = buildCharacter();
        return createPlayer(harness, {
            twitchId: `twitch-teleport-${seq}`,
            role: options.role,
            characterOverrides: {
                infos: { ...base.infos, name: `Teletrasportato ${seq}` },
                status: {
                    ...base.status,
                    location,
                    title: 'rookie',
                    activeTravel: null,
                },
                quests: {
                    completedQuests: [],
                    pendingQuest: options.pendingQuest ?? null,
                    activeStoryQuest: options.activeStoryQuest ?? null,
                    activeWorldMissionQuest:
                        options.activeWorldMissionQuest ?? null,
                },
            },
        });
    }

    function characterIdOf(player: TestPlayer): Types.ObjectId {
        return player.character?._id as Types.ObjectId;
    }

    function rawCharacter(player: TestPlayer) {
        return characters.collection.findOne({ _id: player.character?._id });
    }

    // viaggio libero reale: job nel fake della coda, identità dal documento
    async function travellingToB(player: TestPlayer) {
        await harness.app
            .get(TravelService)
            .startTravel(characterIdOf(player), world.markerB);
        const raw = await rawCharacter(player);
        return {
            characterId: characterIdOf(player),
            startTime: raw?.status.activeTravel.startTime as Date,
            endTime: raw?.status.activeTravel.endTime as Date,
        };
    }

    describe('teleportCharacter (service)', () => {
        let travel: TravelService;

        beforeAll(() => {
            travel = harness.app.get(TravelService);
        });

        it('teleports a free traveller and cancels the pending job', async () => {
            const alice = await playerAt(world.markerA);
            const identity = await travellingToB(alice);
            const jobId = travelJobId(identity.characterId, identity.startTime);
            queue.getJob.mockClear();

            await travel.teleport(characterIdOf(alice), world.questPoi);

            const raw = await rawCharacter(alice);
            expect(raw?.status.location).toEqual(world.questPoi);
            expect(raw?.status.activeTravel).toBeNull();
            expect(queue.getJob).toHaveBeenCalledWith(jobId);
            expect(queue.removed).toEqual([jobId]);
        });

        it('neutralises the old job even when its removal fails', async () => {
            const alice = await playerAt(world.markerA);
            const identity = await travellingToB(alice);
            queue.failRemove = true;

            await travel.teleport(characterIdOf(alice), world.questPoi);

            expect(queue.removed).toEqual([]);
            const remainingMs =
                identity.endTime.getTime() - clock.now().getTime();
            clock.advanceSeconds(Math.ceil(remainingMs / MS_PER_SECOND) + 1);
            await expect(
                harness.app.get(TravelCompletionService).complete(identity),
            ).resolves.toBe('stale');
            const raw = await rawCharacter(alice);
            expect(raw?.status.location).toEqual(world.questPoi);
            expect(raw?.status.activeTravel).toBeNull();
        });

        it('teleports a character without a travel without touching the queue', async () => {
            const alice = await playerAt(world.markerA);

            await travel.teleport(characterIdOf(alice), world.markerB);

            expect((await rawCharacter(alice))?.status.location).toEqual(
                world.markerB,
            );
            expect(queue.getJob).not.toHaveBeenCalled();
        });

        it('teleports to any point of interest, not only cities', async () => {
            const alice = await playerAt(world.markerA);

            await travel.teleport(characterIdOf(alice), world.farQuestPoi);

            expect((await rawCharacter(alice))?.status.location).toEqual(
                world.farQuestPoi,
            );
        });

        it('refuses during a pending quest and writes nothing', async () => {
            const alice = await playerAt(world.markerA, {
                pendingQuest: new Types.ObjectId(),
            });
            const before = await rawCharacter(alice);

            await expect(
                travel.teleport(characterIdOf(alice), world.questPoi),
            ).rejects.toMatchObject({
                code: 'QUEST_IN_PROGRESS',
                message: 'Non puoi muoverti durante una missione in corso',
            });

            expect(await rawCharacter(alice)).toEqual(before);
        });

        it('does not block on story or world mission lanes', async () => {
            const alice = await playerAt(world.markerA, {
                activeStoryQuest: new Types.ObjectId(),
                activeWorldMissionQuest: new Types.ObjectId(),
            });

            await travel.teleport(characterIdOf(alice), world.questPoi);

            expect((await rawCharacter(alice))?.status.location).toEqual(
                world.questPoi,
            );
        });

        it('answers NOT_FOUND for an unknown point of interest or character', async () => {
            const alice = await playerAt(world.markerA);
            const archived = await playerAt(world.markerA);
            await characters.collection.updateOne(
                { _id: characterIdOf(archived) },
                { $set: { deletedAt: new Date() } },
            );

            await expect(
                travel.teleport(
                    characterIdOf(alice),
                    new Types.ObjectId(MISSING_ID),
                ),
            ).rejects.toMatchObject({ message: 'Luogo non trovato' });
            await expect(
                travel.teleport(new Types.ObjectId(MISSING_ID), world.questPoi),
            ).rejects.toMatchObject({ message: 'Personaggio non trovato' });
            await expect(
                travel.teleport(characterIdOf(archived), world.questPoi),
            ).rejects.toMatchObject({ message: 'Personaggio non trovato' });
            expect((await rawCharacter(alice))?.status.location).toEqual(
                world.markerA,
            );
            expect((await rawCharacter(archived))?.status.location).toEqual(
                world.markerA,
            );
        });

        it('sends no push', async () => {
            const alice = await playerAt(world.markerA);
            await travellingToB(alice);

            await travel.teleport(characterIdOf(alice), world.questPoi);

            expect(push.sent).toEqual([]);
            expect(push.topicSends).toEqual([]);
        });
    });
});
