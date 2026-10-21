import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { PushDevice } from 'src/push/push-device.model';
import { travelEnd } from 'src/push/push-events';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushService } from 'src/push/push.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { TravelCompletionService } from './travel-completion.service';
import { TravelModule } from './travel.module';
import { TravelIdentity } from './travel.updates';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { createPlayer } from '../../test/authz/player-fixture';
import { buildCharacter, persistCharacter } from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { buildActiveTravelDoc } from '../../test/travel/active-travel.fixture';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const START = new Date('2026-10-21T08:00:00.000Z');
const END = new Date('2026-10-21T09:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const STARTED_AT = new Date('2026-10-21T09:30:00.000Z');

describe('TravelCompletionService (replSet)', () => {
    let harness: AuthTestApp;
    let completion: TravelCompletionService;
    let pushService: PushService;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let users: Model<UserDocument>;
    let clock: FixedClock;
    let seq = 0;
    const push = new FakePushTransport();

    beforeAll(async () => {
        clock = new FixedClock(NOW);
        harness = await createAuthTestApp({
            clock,
            imports: [TravelModule],
            overrides: [
                { token: PushTransport, useValue: push },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
            ],
        });
        completion = harness.app.get(TravelCompletionService);
        pushService = harness.app.get(PushService);
        characters = harness.app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        pendingQuests = harness.app.get<Model<PendingQuestDocument>>(
            getModelToken(PendingQuest.name),
        );
        users = harness.app.get<Model<UserDocument>>(getModelToken(User.name));
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            pendingQuests.init(),
            users.init(),
            harness.connection.model(PushDevice.name).init(),
        ]);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        push.reset();
    });

    afterAll(async () => {
        await harness.close();
    });

    function travelStatus(
        destination: Types.ObjectId,
        travel: Record<string, unknown> = {},
    ) {
        return {
            ...buildCharacter().status,
            location: new Types.ObjectId(),
            activeTravel: buildActiveTravelDoc({ to: destination, ...travel }),
        };
    }

    // personaggio in viaggio con proprietario e un device registrato
    async function ownedTraveller(
        destination: Types.ObjectId,
        overrides: {
            travel?: Record<string, unknown>;
            character?: Record<string, unknown>;
        } = {},
    ): Promise<Types.ObjectId> {
        seq += 1;
        const player = await createPlayer(harness, {
            twitchId: `tw-travel-${seq}`,
            characterOverrides: {
                status: travelStatus(destination, overrides.travel),
                ...overrides.character,
            },
        });
        await pushService.registerDevice(String(player.user._id), {
            deviceId: 'dev-1',
            token: 'tok-1',
            platform: PushPlatform.android,
        });
        return player.character!._id as Types.ObjectId;
    }

    async function orphanTraveller(
        destination: Types.ObjectId,
    ): Promise<Types.ObjectId> {
        seq += 1;
        const character = await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name: `Orfano ${seq}` },
            status: travelStatus(destination),
        });
        return character._id as Types.ObjectId;
    }

    function identityOf(
        characterId: Types.ObjectId,
        overrides: Partial<TravelIdentity> = {},
    ): TravelIdentity {
        return { characterId, startTime: START, endTime: END, ...overrides };
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function persistPendingQuest(startDate: Date | null) {
        return pendingQuests.create({
            startDate,
            waitingTime: 3_600_000,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
        });
    }

    it('completes an expired free travel and pushes travelEnd to the owner', async () => {
        const destination = new Types.ObjectId();
        const id = await ownedTraveller(destination);

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        const raw = await rawCharacter(id);
        expect(raw?.status.location).toEqual(destination);
        expect(raw?.status.activeTravel).toBeNull();
        expect(push.sent).toEqual([
            { tokens: ['tok-1'], message: travelEnd(id.toHexString()) },
        ]);
    });

    it('is a no-op for a duplicate or replayed trigger', async () => {
        const id = await ownedTraveller(new Types.ObjectId());

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );
        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'stale',
        );

        expect(push.sent).toHaveLength(1);
    });

    it('ignores a stale identity', async () => {
        const id = await ownedTraveller(new Types.ObjectId());
        const before = await rawCharacter(id);

        await expect(
            completion.complete(
                identityOf(id, {
                    startTime: new Date(START.getTime() + 1),
                }),
            ),
        ).resolves.toBe('stale');

        expect(await rawCharacter(id)).toEqual(before);
        expect(push.sent).toEqual([]);
    });

    it('does not complete a travel before its endTime', async () => {
        const endTime = new Date(NOW.getTime() + 60_000);
        const id = await ownedTraveller(new Types.ObjectId(), {
            travel: { endTime, duration: endTime.getTime() - START.getTime() },
        });
        const before = await rawCharacter(id);

        await expect(
            completion.complete(identityOf(id, { endTime })),
        ).resolves.toBe('stale');

        expect(await rawCharacter(id)).toEqual(before);
        expect(push.sent).toEqual([]);
    });

    it('skips an archived character', async () => {
        const id = await ownedTraveller(new Types.ObjectId(), {
            character: { deletedAt: ARCHIVED_AT },
        });
        const before = await rawCharacter(id);

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'stale',
        );

        expect(await rawCharacter(id)).toEqual(before);
        expect(push.sent).toEqual([]);
    });

    it('starts the quest countdown at the planned arrival without any push', async () => {
        const pending = await persistPendingQuest(null);
        const destination = new Types.ObjectId();
        const id = await ownedTraveller(destination, {
            travel: { kind: 'quest' },
            character: {
                quests: { completedQuests: [], pendingQuest: pending._id },
            },
        });

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        const quest = await pendingQuests.collection.findOne({
            _id: pending._id,
        });
        expect(quest?.startDate).toEqual(END);
        expect((await rawCharacter(id))?.status.location).toEqual(destination);
        expect(push.sent).toEqual([]);
    });

    it('keeps a countdown that already started', async () => {
        const pending = await persistPendingQuest(STARTED_AT);
        const id = await ownedTraveller(new Types.ObjectId(), {
            travel: { kind: 'quest' },
            character: {
                quests: { completedQuests: [], pendingQuest: pending._id },
            },
        });

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        const quest = await pendingQuests.collection.findOne({
            _id: pending._id,
        });
        expect(quest?.startDate).toEqual(STARTED_AT);
        expect(push.sent).toEqual([]);
    });

    it('completes without a push when no user owns the character', async () => {
        const destination = new Types.ObjectId();
        const id = await orphanTraveller(destination);

        await expect(completion.complete(identityOf(id))).resolves.toBe(
            'completed',
        );

        expect((await rawCharacter(id))?.status.location).toEqual(destination);
        expect(push.sent).toEqual([]);
    });

    it('pushes once under concurrent completions', async () => {
        const id = await ownedTraveller(new Types.ObjectId());

        const outcomes = await Promise.all([
            completion.complete(identityOf(id)),
            completion.complete(identityOf(id)),
        ]);

        expect([...outcomes].sort()).toEqual(['completed', 'stale']);
        expect(push.sent).toHaveLength(1);
    });
});
