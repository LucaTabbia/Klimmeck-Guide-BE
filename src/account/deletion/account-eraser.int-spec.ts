import { BSON, Db, Document } from 'mongodb';
import { Model, Schema, Types } from 'mongoose';
import { AccountDeletionModule } from 'src/account/deletion/account-deletion.module';
import {
    AccountEraser,
    ErasureReport,
} from 'src/account/deletion/account-eraser';
import { ChannelAccessCheck } from 'src/auth/channel-access/channel-access-check.model';
import { sha256Hex } from 'src/auth/crypto/token-crypto';
import { LoginTicket } from 'src/auth/login-ticket/login-ticket.model';
import { Session } from 'src/auth/session/session.model';
import { Character } from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { PendingQuest } from 'src/models/pending-quest.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { Quest } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { PushDevice } from 'src/push/push-device.model';
import { MissionDraft } from 'src/quests/guided/mission-draft.model';
import { UsersService } from 'src/users/users.service';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistCity,
    persistLore,
    persistQuest,
    persistSession,
    persistUser,
} from '../../../test/fixtures';
import { buildQuestResult } from '../../../test/quests/quest-result.fixture';

// ora reale al secondo: le sessioni revocate scadono a NOW + 900 s e il monitor TTL di Mongo non deve toglierle a metà caso
const NOW = new Date(Math.floor(new Date().getTime() / 1000) * 1000);
const HOUR_MS = 60 * 60 * 1000;
const STARTED_AT = new Date(NOW.getTime() - 2 * HOUR_MS);
const CONCLUDED_AT = new Date(NOW.getTime() - HOUR_MS);
const ACCESS_TOKEN_TTL_MS = 900 * 1000;
const ERASED_TWITCH_ID = 'tw-erased-account';
const KEPT_TWITCH_ID = 'tw-kept-account';
const ALLOWED_COLLECTIONS = ['admin_audit_logs', 'eventsub_messages'];
const CONCURRENT_ITERATIONS = 3;

type AnyModel = Model<any>;

interface World {
    userId: Types.ObjectId;
    current: Types.ObjectId;
    archived: Types.ObjectId;
    standardRequest: Types.ObjectId;
    archivedRequest: Types.ObjectId;
    gmRequest: Types.ObjectId;
    sharedDraft: Types.ObjectId;
    soloDraft: Types.ObjectId;
    openQuest: Types.ObjectId;
    openAid: Types.ObjectId;
    concludedBoss: Types.ObjectId;
    concludedAid: Types.ObjectId;
    unrelatedQuest: Types.ObjectId;
    otherWounded: Types.ObjectId;
    otherConcludedWounded: Types.ObjectId;
    otherRescued: Types.ObjectId;
    otherResult: Types.ObjectId;
    sessionIds: string[];
    pushTokens: string[];
    storyQuest: Types.ObjectId;
    kept: {
        userId: Types.ObjectId;
        character: Types.ObjectId;
        standardRequest: Types.ObjectId;
        storyRequest: Types.ObjectId;
    };
}

describe('AccountEraser.eraseWithin (replSet)', () => {
    let harness: AuthTestApp;
    let eraser: AccountEraser;
    let users: Model<UserDocument>;
    let characters: AnyModel;
    let quests: AnyModel;
    let pendingQuests: AnyModel;
    let questResults: AnyModel;
    let drafts: AnyModel;
    let sessions: AnyModel;
    let tickets: AnyModel;
    let devices: AnyModel;
    let accessChecks: AnyModel;
    let cities: AnyModel;
    let lores: AnyModel;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [AccountDeletionModule],
            clock: new FixedClock(NOW),
        });
        eraser = harness.app.get(AccountEraser);
        const model = (name: string): AnyModel =>
            harness.connection.model(name);
        users = harness.connection.model<UserDocument>(User.name);
        characters = model(Character.name);
        quests = model(Quest.name);
        pendingQuests = model(PendingQuest.name);
        questResults = model(QuestResult.name);
        drafts = model(MissionDraft.name);
        sessions = model(Session.name);
        tickets = model(LoginTicket.name);
        devices = model(PushDevice.name);
        accessChecks = model(ChannelAccessCheck.name);
        // geografia del rientro: registrata qui se il modulo non la porta
        const registered = (name: string, schema: Schema): AnyModel =>
            harness.connection.models[name] ??
            harness.connection.model(name, schema);
        cities = registered(City.name, CitySchema);
        lores = registered(Lore.name, LoreSchema);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all(
            [
                users,
                characters,
                quests,
                pendingQuests,
                questResults,
                drafts,
                sessions,
                tickets,
                devices,
                accessChecks,
                cities,
                lores,
            ].map((each) => each.init()),
        );
    });

    afterEach(async () => {
        await harness.clearDatabase();
        await rawDb().collection('admin_audit_logs').deleteMany({});
        await rawDb().collection('eventsub_messages').deleteMany({});
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    function rawDb(): Db {
        const db = harness.connection.db;
        if (!db) throw new Error('Connessione Mongo non aperta');
        return db as unknown as Db;
    }

    function eraseInTransaction(
        userId: Types.ObjectId,
    ): Promise<ErasureReport | null> {
        return harness.connection.transaction((session) =>
            eraser.eraseWithin(session, userId, NOW),
        );
    }

    async function persistRequest(questId: Types.ObjectId) {
        const request = await pendingQuests.create({
            quest: questId,
            waitingTime: 0,
            pointsSpent: 10,
        });
        return request._id as Types.ObjectId;
    }

    async function persistNamedCharacter(
        overrides: Record<string, unknown>,
    ): Promise<Types.ObjectId> {
        const character = await persistCharacter(characters, overrides);
        return character._id as Types.ObjectId;
    }

    async function persistKeptPlayer(storyQuest: Types.ObjectId) {
        const character = await persistNamedCharacter({
            infos: { ...buildCharacter().infos, name: 'Kept Hero' },
        });
        const user = await persistUser(users, {
            twitchId: KEPT_TWITCH_ID,
            twitchPoints: 70,
            currentCharacter: character,
        });
        const userId = user._id as Types.ObjectId;
        const storyRequest = await persistRequest(storyQuest);
        await persistSession(sessions, {
            userId,
            refreshTokenHash: sha256Hex('kept-refresh'),
        });
        await tickets.create({
            ticketHash: sha256Hex('kept-ticket'),
            userId,
            codeChallenge: 'kept-challenge',
            expiresAt: new Date(NOW.getTime() + HOUR_MS),
        });
        await devices.create({
            userId,
            deviceId: 'kept-device',
            token: 'kept-token',
            platform: 'android',
            lastSeenAt: NOW,
        });
        await accessChecks.create({ twitchId: KEPT_TWITCH_ID, checkedAt: NOW });
        return { userId, character, storyRequest };
    }

    async function persistWorld(role = 'adventurer'): Promise<World> {
        const userId = new Types.ObjectId();
        const storyQuest = new Types.ObjectId();
        const kept = await persistKeptPlayer(storyQuest);
        const current = new Types.ObjectId();
        const archived = new Types.ObjectId();
        const openQuest = (
            await persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'boss' },
                registeredAdventurers: [
                    { character: current, title: 'rookie' },
                    { character: kept.character, title: 'rookie' },
                ],
            })
        )._id as Types.ObjectId;
        const standardRequest = await persistRequest(openQuest);
        const keptStandardRequest = await persistRequest(openQuest);
        await characters.updateOne(
            { _id: kept.character },
            {
                $set: {
                    'quests.pendingQuest': keptStandardRequest,
                    'quests.activeStoryQuest': kept.storyRequest,
                },
            },
        );
        const gmRequest = await persistRequest(storyQuest);
        const archivedRequest = await persistRequest(new Types.ObjectId());
        await persistNamedCharacter({
            _id: current,
            user: userId,
            infos: { ...buildCharacter().infos, name: 'Erased Hero' },
            quests: {
                completedQuests: [],
                pendingQuest: standardRequest,
                activeStoryQuest: gmRequest,
            },
        });
        await persistNamedCharacter({
            _id: archived,
            user: userId,
            infos: { ...buildCharacter().infos, name: 'Erased Ghost' },
            quests: { completedQuests: [], pendingQuest: archivedRequest },
            deletedAt: STARTED_AT,
            deletionReason: 'user_request',
        });
        await persistUser(users, {
            _id: userId,
            twitchId: ERASED_TWITCH_ID,
            twitchPoints: 500,
            role,
            currentCharacter: current,
        });

        const otherWounded = new Types.ObjectId();
        const otherConcludedWounded = new Types.ObjectId();
        const aidOf = (wounded: Types.ObjectId[], concludedAt: Date | null) =>
            persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'aid' },
                rescue: { characters: wounded, failedQuest: openQuest },
                concludedAt,
            });
        const openAid = (await aidOf([current, otherWounded], null))
            ._id as Types.ObjectId;
        const concludedAid = (
            await aidOf([current, otherConcludedWounded], CONCLUDED_AT)
        )._id as Types.ObjectId;
        const concludedBoss = (
            await persistQuest(quests, {
                infos: { ...buildQuest().infos, type: 'boss' },
                registeredAdventurers: [
                    { character: current, title: 'rookie' },
                    { character: archived, title: 'rookie' },
                    { character: kept.character, title: 'rookie' },
                ],
                startedAt: STARTED_AT,
                concludedAt: CONCLUDED_AT,
            })
        )._id as Types.ObjectId;
        // forma legacy dell'id salvata col driver (04 Pitfall 1)
        await quests.collection.updateOne(
            { _id: concludedBoss },
            {
                $set: {
                    'registeredAdventurers.0.character': current.toHexString(),
                },
            },
        );
        const unrelatedQuest = (
            await persistQuest(quests, {
                registeredAdventurers: [
                    { character: kept.character, title: 'rookie' },
                ],
                startedAt: STARTED_AT,
                concludedAt: CONCLUDED_AT,
            })
        )._id as Types.ObjectId;

        await questResults.collection.insertMany([
            buildQuestResult({ character: current, user: userId }),
            buildQuestResult({
                character: archived,
                user: userId,
                kind: 'ambush',
                quest: null,
                ambush: { at: STARTED_AT },
            }),
        ]);
        const otherRescued = new Types.ObjectId();
        const otherResult = new Types.ObjectId();
        await questResults.collection.insertOne(
            buildQuestResult({
                _id: otherResult,
                character: kept.character,
                user: kept.userId,
                rescuedCharacters: [current, otherRescued],
            }),
        );

        const participant = (
            character: Types.ObjectId,
            pendingQuest: Types.ObjectId,
            name: string,
        ) => ({
            character,
            pendingQuest,
            name,
            title: 'rookie',
            maxLifePoints: 100,
        });
        const coins = { gold: 1, silver: 0, copper: 0 };
        const sharedDraft = (
            await drafts.create({
                quest: storyQuest,
                questType: 'story',
                participants: [
                    participant(current, gmRequest, 'Erased Hero'),
                    participant(kept.character, kept.storyRequest, 'Kept Hero'),
                ],
                fights: [
                    {
                        enemies: [],
                        outcomes: [
                            { character: current, hpBefore: 100 },
                            { character: kept.character, hpBefore: 90 },
                        ],
                    },
                ],
                prizes: [
                    { character: current, coins },
                    { character: kept.character, coins },
                ],
                backgroundAdditions: [
                    { character: current, text: 'Una storia da dimenticare' },
                ],
                startedAt: STARTED_AT,
                updatedAt: STARTED_AT,
                rev: 3,
            })
        )._id as Types.ObjectId;
        const soloDraft = (
            await drafts.create({
                quest: new Types.ObjectId(),
                questType: 'worldMission',
                participants: [
                    participant(current, new Types.ObjectId(), 'Erased Hero'),
                ],
                startedAt: STARTED_AT,
                updatedAt: STARTED_AT,
            })
        )._id as Types.ObjectId;

        const sessionIds: string[] = [];
        for (const label of ['erased-refresh-1', 'erased-refresh-2']) {
            const session = await persistSession(sessions, {
                userId,
                refreshTokenHash: sha256Hex(label),
            });
            sessionIds.push((session._id as Types.ObjectId).toHexString());
        }
        await tickets.create({
            ticketHash: sha256Hex('erased-ticket'),
            userId,
            codeChallenge: 'erased-challenge',
            expiresAt: new Date(NOW.getTime() + HOUR_MS),
        });
        const pushTokens = ['erased-token-1', 'erased-token-2'];
        for (const [index, token] of pushTokens.entries()) {
            await devices.create({
                userId,
                deviceId: `erased-device-${index}`,
                token,
                platform: 'android',
                lastSeenAt: NOW,
            });
        }
        await accessChecks.create({
            twitchId: ERASED_TWITCH_ID,
            checkedAt: NOW,
        });
        await rawDb()
            .collection('admin_audit_logs')
            .insertOne({
                at: NOW,
                actor: {
                    userId: userId.toHexString(),
                    twitchId: ERASED_TWITCH_ID,
                    role: 'adventurer',
                },
                action: 'saveMissionDraft',
                target: { type: 'User', id: userId.toHexString() },
                args: {},
                outcome: 'ok',
            });
        await rawDb().collection('eventsub_messages').insertOne({
            messageId: 'erased-message',
            type: 'channel.channel_points_custom_reward_redemption.add',
            eventId: 'erased-event',
            twitchUserId: ERASED_TWITCH_ID,
            rewardId: null,
            amount: 100,
            outcome: 'credited',
            receivedAt: NOW,
        });

        return {
            userId,
            current,
            archived,
            standardRequest,
            archivedRequest,
            gmRequest,
            sharedDraft,
            soloDraft,
            openQuest,
            openAid,
            concludedBoss,
            concludedAid,
            unrelatedQuest,
            otherWounded,
            otherConcludedWounded,
            otherRescued,
            otherResult,
            sessionIds,
            pushTokens,
            storyQuest,
            kept: {
                userId: kept.userId,
                character: kept.character,
                standardRequest: keptStandardRequest,
                storyRequest: kept.storyRequest,
            },
        };
    }

    async function dumpDatabase(): Promise<Record<string, Document[]>> {
        const dump: Record<string, Document[]> = {};
        const collections = await rawDb().listCollections().toArray();
        for (const { name } of collections) {
            dump[name] = await rawDb()
                .collection(name)
                .find({})
                .sort({ _id: 1 })
                .toArray();
        }
        return dump;
    }

    async function keptDocumentsOf(world: World): Promise<(Document | null)[]> {
        const byId = (model: AnyModel, id: Types.ObjectId) =>
            model.collection.findOne({ _id: id });
        return [
            await byId(users, world.kept.userId),
            await byId(characters, world.kept.character),
            await byId(pendingQuests, world.kept.standardRequest),
            await byId(pendingQuests, world.kept.storyRequest),
            await sessions.collection.findOne({ userId: world.kept.userId }),
            await tickets.collection.findOne({ userId: world.kept.userId }),
            await devices.collection.findOne({ userId: world.kept.userId }),
            await accessChecks.collection.findOne({
                twitchId: KEPT_TWITCH_ID,
            }),
            await byId(quests, world.unrelatedQuest),
        ];
    }

    function rawQuest(id: Types.ObjectId) {
        return quests.collection.findOne({ _id: id });
    }

    function seatsOf(quest: Document | null): string[] {
        return (quest?.registeredAdventurers ?? []).map(
            (seat: { character: unknown }) => String(seat.character),
        );
    }

    it('leaves nothing tied to the deleted account in any collection (D-04, D-14)', async () => {
        const world = await persistWorld();
        const keptBefore = await keptDocumentsOf(world);

        await eraseInTransaction(world.userId);

        await expectNothingLeftOf(world);
        expect(await keptDocumentsOf(world)).toEqual(keptBefore);
    });

    // inventario per collection: nessun documento nomina l'utente, i suoi personaggi o il suo Twitch ID (regola dura 4)
    async function expectNothingLeftOf(world: World): Promise<void> {
        const needles = [
            world.userId.toHexString(),
            world.current.toHexString(),
            world.archived.toHexString(),
            ERASED_TWITCH_ID,
        ];
        const dump = await dumpDatabase();
        expect(Object.keys(dump)).toEqual(
            expect.arrayContaining([
                'users',
                'characters',
                'quests',
                'pendingquests',
                'questresults',
                'missiondrafts',
                'sessions',
                'login_tickets',
                'push_devices',
                'channel_access_checks',
                ...ALLOWED_COLLECTIONS,
            ]),
        );
        const leftovers: string[] = [];
        for (const [name, documents] of Object.entries(dump)) {
            if (ALLOWED_COLLECTIONS.includes(name)) continue;
            for (const document of documents) {
                const serialised = BSON.EJSON.stringify(document, {
                    relaxed: true,
                });
                if (!needles.some((needle) => serialised.includes(needle)))
                    continue;
                if (name === 'sessions' && isRevokedInWindow(document, world))
                    continue;
                leftovers.push(`${name}:${String(document._id)}`);
            }
        }
        expect(leftovers).toEqual([]);
        expect(
            dump.sessions.filter((session) =>
                world.userId.equals(session.userId),
            ),
        ).toHaveLength(2);
    }

    function isRevokedInWindow(session: Document, world: World): boolean {
        return (
            world.userId.equals(session.userId) &&
            session.revokedAt instanceof Date &&
            session.revokeReason === 'accountDeleted' &&
            session.expiresAt.getTime() <= NOW.getTime() + ACCESS_TOKEN_TTL_MS
        );
    }

    it('finds an archived character with no result through its owner (D-24)', async () => {
        const userId = new Types.ObjectId();
        const archived = await persistNamedCharacter({
            user: userId,
            deletedAt: STARTED_AT,
            deletionReason: 'user_request',
        });
        await persistUser(users, {
            _id: userId,
            twitchId: ERASED_TWITCH_ID,
            currentCharacter: null,
        });

        await eraseInTransaction(userId);

        expect(await characters.collection.findOne({ _id: archived })).toBe(
            null,
        );
        expect(await users.collection.findOne({ _id: userId })).toBeNull();
    });

    it('finds a current character written before the owner field (D-24)', async () => {
        const world = await persistWorld();
        await characters.collection.updateOne(
            { _id: world.current },
            { $unset: { user: '' } },
        );

        await eraseInTransaction(world.userId);

        expect(
            await characters.collection.findOne({ _id: world.current }),
        ).toBeNull();
        expect(
            await characters.collection.findOne({ _id: world.archived }),
        ).toBeNull();
    });

    it('deletes the standard pending quest the archive leaves behind (D-14)', async () => {
        const world = await persistWorld();

        await eraseInTransaction(world.userId);

        const left = await pendingQuests.collection
            .find({
                _id: {
                    $in: [
                        world.standardRequest,
                        world.archivedRequest,
                        world.gmRequest,
                    ],
                },
            })
            .toArray();
        expect(left).toEqual([]);
        expect(
            await pendingQuests.collection.countDocuments({
                _id: {
                    $in: [world.kept.standardRequest, world.kept.storyRequest],
                },
            }),
        ).toBe(2);
    });

    it('frees the unstarted seat and the wounded like the archive (D-14)', async () => {
        const world = await persistWorld();

        await eraseInTransaction(world.userId);

        expect(seatsOf(await rawQuest(world.openQuest))).toEqual([
            world.kept.character.toHexString(),
        ]);
        const aid = await rawQuest(world.openAid);
        expect(aid?.rescue?.characters).toEqual([world.otherWounded]);
        expect(aid?.concludedAt).toBeNull();
    });

    it('drops the deleted character from guided drafts and deletes the drafts left empty (D-14)', async () => {
        const world = await persistWorld();

        await eraseInTransaction(world.userId);

        const shared = await drafts.collection.findOne({
            _id: world.sharedDraft,
        });
        expect(
            shared?.participants.map(
                (each: { character: unknown }) => each.character,
            ),
        ).toEqual([world.kept.character]);
        expect(
            shared?.prizes.map(
                (each: { character: unknown }) => each.character,
            ),
        ).toEqual([world.kept.character]);
        expect(shared?.backgroundAdditions).toEqual([]);
        expect(
            shared?.fights[0].outcomes.map(
                (each: { character: unknown }) => each.character,
            ),
        ).toEqual([world.kept.character]);
        expect(shared?.rev).toBe(4);
        expect(
            await drafts.collection.findOne({ _id: world.soloDraft }),
        ).toBeNull();
    });

    it("keeps the rescue count of another player's result without the deleted id (D-14)", async () => {
        const world = await persistWorld();

        await eraseInTransaction(world.userId);

        const result = await questResults.collection.findOne({
            _id: world.otherResult,
        });
        const rescued: Types.ObjectId[] = result?.rescuedCharacters ?? [];
        expect(rescued).toHaveLength(2);
        expect(rescued.map(String)).not.toContain(world.current.toHexString());
        expect(rescued.map(String)).toContain(world.otherRescued.toHexString());
    });

    it('cleans the concluded quests and aids (D-14)', async () => {
        const world = await persistWorld();
        const untouched = await rawQuest(world.unrelatedQuest);

        await eraseInTransaction(world.userId);

        const boss = await rawQuest(world.concludedBoss);
        expect(boss?.registeredAdventurers).toEqual([
            { character: world.kept.character, title: 'rookie' },
        ]);
        expect(boss?.concludedAt).toEqual(CONCLUDED_AT);
        expect(boss?.startedAt).toEqual(STARTED_AT);
        const aid = await rawQuest(world.concludedAid);
        expect(aid?.rescue?.characters).toEqual([world.otherConcludedWounded]);
        expect(aid?.concludedAt).toEqual(CONCLUDED_AT);
        expect(await rawQuest(world.unrelatedQuest)).toEqual(untouched);
    });

    it('revokes the sessions inside the transaction and reports them (D-18)', async () => {
        const world = await persistWorld();

        const report = await eraseInTransaction(world.userId);

        expect([...(report?.revokedSessionIds ?? [])].sort()).toEqual(
            [...world.sessionIds].sort(),
        );
        const revoked = await sessions.collection
            .find({ userId: world.userId })
            .toArray();
        expect(revoked).toHaveLength(2);
        for (const session of revoked) {
            expect(session.revokeReason).toBe('accountDeleted');
            expect(session.revokedAt).toEqual(NOW);
            expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
                NOW.getTime() + ACCESS_TOKEN_TTL_MS,
            );
        }
        expect(report?.userId).toEqual(world.userId);
        expect(report?.twitchId).toBe(ERASED_TWITCH_ID);
    });

    it('reports the push tokens read before deleting the devices (D-25)', async () => {
        const world = await persistWorld();

        const report = await eraseInTransaction(world.userId);

        expect([...(report?.pushTokens ?? [])].sort()).toEqual(
            world.pushTokens,
        );
        expect(
            await devices.collection.countDocuments({ userId: world.userId }),
        ).toBe(0);
        expect(
            await devices.collection.countDocuments({
                userId: world.kept.userId,
            }),
        ).toBe(1);
    });

    it('refuses the innkeeper and writes nothing (D-16)', async () => {
        // ruolo scritto all'inserimento: un update del ruolo farebbe revocare le sessioni al watcher dei ruoli
        const world = await persistWorld('innkeeper');
        const before = await dumpDatabase();

        await expect(eraseInTransaction(world.userId)).rejects.toMatchObject({
            code: 'INNKEEPER_ACCOUNT_PROTECTED',
        });

        expect(await dumpDatabase()).toEqual(before);
    });

    it('answers null for a user that no longer exists (D-20)', async () => {
        await persistWorld();
        const before = await dumpDatabase();

        const report = await eraseInTransaction(new Types.ObjectId());

        expect(report).toBeNull();
        expect(await dumpDatabase()).toEqual(before);
    });

    it('lets the same Twitch account come back from zero (D-04)', async () => {
        const world = await persistWorld();

        await eraseInTransaction(world.userId);
        const reborn = await new UsersService(users).findOrCreateByTwitchId(
            ERASED_TWITCH_ID,
            { termsVersion: '2026-11-24', acceptedAt: NOW },
        );

        expect((reborn._id as Types.ObjectId).equals(world.userId)).toBe(false);
        expect(reborn.twitchPoints).toBe(0);
        expect(reborn.currentCharacter).toBeNull();
        expect(
            await characters.collection.countDocuments({
                user: reborn._id as Types.ObjectId,
            }),
        ).toBe(0);
    });

    it('serialises two concurrent erasures of the same account (D-04)', async () => {
        for (let i = 0; i < CONCURRENT_ITERATIONS; i++) {
            const world = await persistWorld();

            const reports = await Promise.all([
                eraseInTransaction(world.userId),
                eraseInTransaction(world.userId),
            ]);

            expect(reports.filter((report) => report === null)).toHaveLength(1);
            expect(
                reports.find((report) => report !== null)?.revokedSessionIds,
            ).toHaveLength(2);
            expect(
                await users.collection.findOne({ _id: world.userId }),
            ).toBeNull();
            await harness.clearDatabase();
            await rawDb().collection('admin_audit_logs').deleteMany({});
            await rawDb().collection('eventsub_messages').deleteMany({});
        }
    });

    interface Companion {
        characterId: Types.ObjectId;
        userId: Types.ObjectId;
        pendingQuestId: Types.ObjectId;
    }

    interface StartedScene {
        questId: Types.ObjectId;
        cityMarker: Types.ObjectId;
        questMarker: Types.ObjectId;
        ration: Types.ObjectId;
        a: Companion;
        b: Companion;
    }

    interface StartedSceneOptions {
        seats: { character: Types.ObjectId; archivedAt?: Date }[];
        label?: string;
        type?: 'boss' | 'enemy' | 'aid';
        rescue?: { characters: Types.ObjectId[]; failedQuest: Types.ObjectId };
        startedAt?: Date | null;
    }

    interface CompanionSeed {
        name: string;
        twitchId: string;
        status?: Record<string, unknown>;
        ownedItems?: Record<string, unknown>[];
        pendingQuest: Record<string, unknown>;
    }

    async function persistCompanion(
        questId: Types.ObjectId,
        questMarker: Types.ObjectId,
        seed: CompanionSeed,
    ): Promise<Companion> {
        const characterId = new Types.ObjectId();
        const pendingQuestId = new Types.ObjectId();
        const base = buildCharacter();
        await persistCharacter(characters, {
            _id: characterId,
            infos: { ...base.infos, name: seed.name },
            status: { ...base.status, location: questMarker, ...seed.status },
            quests: { ...base.quests, pendingQuest: pendingQuestId },
            assets: { ...base.assets, ownedItems: seed.ownedItems ?? [] },
        });
        await pendingQuests.collection.insertOne({
            _id: pendingQuestId,
            quest: questId,
            startDate: STARTED_AT,
            arrivedAt: STARTED_AT,
            waitingTime: 0,
            ...seed.pendingQuest,
        });
        const user = await persistUser(users, {
            twitchId: seed.twitchId,
            twitchPoints: 100,
            currentCharacter: characterId,
        });
        return {
            characterId,
            userId: user._id as Types.ObjectId,
            pendingQuestId,
        };
    }

    // quest avviata sul marker di una città, con i posti dati e due compagni di altri utenti arrivati col cibo e i punti annotati
    async function persistStartedScene(
        options: StartedSceneOptions,
    ): Promise<StartedScene> {
        const label = options.label ?? 'scene';
        const cityMarker = new Types.ObjectId();
        const questMarker = new Types.ObjectId();
        const ration = new Types.ObjectId();
        const lore = await persistLore(lores);
        await persistCity(cities, {
            markerLocation: cityMarker,
            pointsOfInterest: [questMarker],
            relatedLore: lore._id,
        });
        const questId = new Types.ObjectId();
        const a = await persistCompanion(questId, questMarker, {
            name: `${label} Companion A`,
            twitchId: `tw-${label}-a`,
            status: { currentLifePoints: 40, maxLifePoints: 100 },
            ownedItems: [{ itemType: 'LootItem', item: ration, quantity: 1 }],
            pendingQuest: {
                pointsSpent: 30,
                travelFoodSpent: [{ item: ration, quantity: 2 }],
                travelHungerLifeLost: 6,
            },
        });
        const b = await persistCompanion(questId, questMarker, {
            name: `${label} Companion B`,
            twitchId: `tw-${label}-b`,
            pendingQuest: { pointsSpent: 10 },
        });
        await persistQuest(quests, {
            _id: questId,
            infos: {
                ...buildQuest().infos,
                type: options.type ?? 'boss',
                markerLocation: questMarker,
            },
            registeredAdventurers: [
                ...options.seats.map((seat) => ({ ...seat, title: 'rookie' })),
                { character: a.characterId, title: 'rookie' },
                { character: b.characterId, title: 'rookie' },
            ],
            startedAt:
                options.startedAt === undefined
                    ? STARTED_AT
                    : options.startedAt,
            concludedAt: null,
            ...(options.rescue ? { rescue: options.rescue } : {}),
        });
        return { questId, cityMarker, questMarker, ration, a, b };
    }

    const hexes = (ids: readonly unknown[]) => ids.map(String).sort();

    async function expectSentBack(scene: StartedScene): Promise<void> {
        for (const companion of [scene.a, scene.b]) {
            const raw = await characters.collection.findOne({
                _id: companion.characterId,
            });
            expect(raw?.status.location).toEqual(scene.cityMarker);
            expect(raw?.quests.pendingQuest).toBeNull();
            expect(
                await pendingQuests.collection.findOne({
                    _id: companion.pendingQuestId,
                }),
            ).toBeNull();
        }
    }

    async function expectBackOnTheBoard(scene: StartedScene): Promise<void> {
        const quest = await rawQuest(scene.questId);
        expect(quest?.startedAt).toBeNull();
        expect(quest?.concludedAt ?? null).toBeNull();
        expect(quest?.registeredAdventurers).toEqual([]);
    }

    describe('started quests (D-13)', () => {
        it('cancels a started boss quest of the deleted character before archiving it (D-13, D-26)', async () => {
            const world = await persistWorld();
            const scene = await persistStartedScene({
                seats: [{ character: world.current }],
            });

            await eraseInTransaction(world.userId);

            await expectSentBack(scene);
            const a = await characters.collection.findOne({
                _id: scene.a.characterId,
            });
            expect(a?.assets.ownedItems).toEqual([
                { itemType: 'LootItem', item: scene.ration, quantity: 3 },
            ]);
            expect(a?.status.currentLifePoints).toBe(46);
            expect(
                (await users.collection.findOne({ _id: scene.a.userId }))
                    ?.twitchPoints,
            ).toBe(130);
            expect(
                (await users.collection.findOne({ _id: scene.b.userId }))
                    ?.twitchPoints,
            ).toBe(110);
            await expectBackOnTheBoard(scene);
            expect(
                await quests.collection.countDocuments({
                    'registeredAdventurers.archivedAt': { $exists: true },
                }),
            ).toBe(0);
        });

        it('cancels a started enemy quest the same way (D-26)', async () => {
            const world = await persistWorld();
            const scene = await persistStartedScene({
                seats: [{ character: world.current }],
                type: 'enemy',
            });

            await eraseInTransaction(world.userId);

            await expectSentBack(scene);
            await expectBackOnTheBoard(scene);
        });

        it('cancels a started aid where the deleted character was a rescuer, keeping the wounded (D-13)', async () => {
            const world = await persistWorld();
            const wounded = new Types.ObjectId();
            const scene = await persistStartedScene({
                seats: [{ character: world.current }],
                type: 'aid',
                rescue: {
                    characters: [wounded],
                    failedQuest: new Types.ObjectId(),
                },
            });

            await eraseInTransaction(world.userId);

            await expectSentBack(scene);
            await expectBackOnTheBoard(scene);
            expect((await rawQuest(scene.questId))?.rescue.characters).toEqual([
                wounded,
            ]);
        });

        it('cancels a started quest held by an archived character of the account (D-26)', async () => {
            const world = await persistWorld();
            const scene = await persistStartedScene({
                seats: [{ character: world.archived, archivedAt: STARTED_AT }],
            });

            await eraseInTransaction(world.userId);

            await expectSentBack(scene);
            await expectBackOnTheBoard(scene);
        });

        it('reports the companions sent back for each cancelled quest (D-26)', async () => {
            const world = await persistWorld();
            const held = await persistStartedScene({
                seats: [{ character: world.current }],
                label: 'held',
            });
            const haunted = await persistStartedScene({
                seats: [{ character: world.archived, archivedAt: STARTED_AT }],
                label: 'haunted',
                type: 'enemy',
            });

            const report = await eraseInTransaction(world.userId);

            const reported = (report?.cancelled ?? [])
                .map(({ questId, characterIds }) => ({
                    questId: String(questId),
                    characterIds: hexes(characterIds),
                }))
                .sort((left, right) =>
                    left.questId.localeCompare(right.questId),
                );
            const expected = [held, haunted]
                .map((scene) => ({
                    questId: String(scene.questId),
                    characterIds: hexes([
                        scene.a.characterId,
                        scene.b.characterId,
                    ]),
                }))
                .sort((left, right) =>
                    left.questId.localeCompare(right.questId),
                );
            expect(reported).toEqual(expected);
        });

        it('leaves nothing behind after cancelling a started quest (D-04, D-13)', async () => {
            const world = await persistWorld();
            await persistStartedScene({
                seats: [{ character: world.current }],
                label: 'held',
            });
            await persistStartedScene({
                seats: [{ character: world.archived, archivedAt: STARTED_AT }],
                label: 'haunted',
            });
            const keptBefore = await keptDocumentsOf(world);

            await eraseInTransaction(world.userId);

            await expectNothingLeftOf(world);
            expect(await keptDocumentsOf(world)).toEqual(keptBefore);
        });
    });

    async function companionsOf(scene: StartedScene) {
        const of = async (companion: Companion) => ({
            character: await characters.collection.findOne({
                _id: companion.characterId,
            }),
            pendingQuest: await pendingQuests.collection.findOne({
                _id: companion.pendingQuestId,
            }),
            user: await users.collection.findOne({ _id: companion.userId }),
        });
        return [await of(scene.a), await of(scene.b)];
    }

    describe('quests left as today (D-13, D-14)', () => {
        it('resolves as today a started aid whose only wounded is the deleted character (D-13)', async () => {
            const world = await persistWorld();
            const scene = await persistStartedScene({
                seats: [],
                type: 'aid',
                rescue: {
                    characters: [world.current],
                    failedQuest: new Types.ObjectId(),
                },
            });
            const before = await companionsOf(scene);

            const report = await eraseInTransaction(world.userId);

            const aid = await rawQuest(scene.questId);
            expect(aid?.concludedAt).toEqual(NOW);
            expect(aid?.startedAt).toEqual(STARTED_AT);
            expect(aid?.rescue.characters).toEqual([]);
            expect(await companionsOf(scene)).toEqual(before);
            expect(report?.cancelled).toEqual([]);
        });

        it('resolves as today the aid of the deleted only wounded even with an archived rescuer of the account (D-13)', async () => {
            const world = await persistWorld();
            const scene = await persistStartedScene({
                seats: [{ character: world.archived, archivedAt: STARTED_AT }],
                type: 'aid',
                rescue: {
                    characters: [world.current],
                    failedQuest: new Types.ObjectId(),
                },
            });
            const before = await companionsOf(scene);

            const report = await eraseInTransaction(world.userId);

            const aid = await rawQuest(scene.questId);
            expect(aid?.concludedAt).toEqual(NOW);
            expect(aid?.startedAt).toEqual(STARTED_AT);
            expect(seatsOf(aid).sort()).toEqual(
                hexes([scene.a.characterId, scene.b.characterId]),
            );
            expect(await companionsOf(scene)).toEqual(before);
            expect(report?.cancelled).toEqual([]);
        });

        it('keeps a started aid going when other wounded remain (D-13)', async () => {
            const world = await persistWorld();
            const otherWounded = new Types.ObjectId();
            const scene = await persistStartedScene({
                seats: [],
                type: 'aid',
                rescue: {
                    characters: [world.current, otherWounded],
                    failedQuest: new Types.ObjectId(),
                },
            });
            const before = await companionsOf(scene);

            const report = await eraseInTransaction(world.userId);

            const aid = await rawQuest(scene.questId);
            expect(aid?.rescue.characters).toEqual([otherWounded]);
            expect(aid?.startedAt).toEqual(STARTED_AT);
            expect(aid?.concludedAt ?? null).toBeNull();
            expect(await companionsOf(scene)).toEqual(before);
            expect(report?.cancelled).toEqual([]);
        });

        it('frees only the seat of a quest not started while companions travel (D-13)', async () => {
            const world = await persistWorld();
            const scene = await persistStartedScene({
                seats: [{ character: world.current }],
                startedAt: null,
            });
            // A ancora in viaggio verso il marker, B già arrivato
            await characters.collection.updateOne(
                { _id: scene.a.characterId },
                {
                    $set: {
                        'status.location': scene.cityMarker,
                        'status.activeTravel': {
                            kind: 'quest',
                            destination: scene.questMarker,
                        },
                    },
                },
            );
            const before = await companionsOf(scene);

            const report = await eraseInTransaction(world.userId);

            const quest = await rawQuest(scene.questId);
            expect(seatsOf(quest)).toEqual([
                scene.a.characterId.toHexString(),
                scene.b.characterId.toHexString(),
            ]);
            expect(quest?.startedAt).toBeNull();
            expect(await companionsOf(scene)).toEqual(before);
            expect(report?.cancelled).toEqual([]);
        });

        it('deletes the guided request and cleans the draft of a story without cancelling anything (D-14)', async () => {
            const world = await persistWorld();
            await persistQuest(quests, {
                _id: world.storyQuest,
                infos: { ...buildQuest().infos, type: 'story' },
                registeredAdventurers: [
                    { character: world.current, title: 'rookie' },
                    { character: world.kept.character, title: 'rookie' },
                ],
            });

            const report = await eraseInTransaction(world.userId);

            expect(
                await pendingQuests.collection.findOne({
                    _id: world.gmRequest,
                }),
            ).toBeNull();
            const draft = await drafts.collection.findOne({
                _id: world.sharedDraft,
            });
            expect(
                draft?.participants.map(
                    (each: { character: unknown }) => each.character,
                ),
            ).toEqual([world.kept.character]);
            const story = await rawQuest(world.storyQuest);
            expect(seatsOf(story)).toEqual([
                world.kept.character.toHexString(),
            ]);
            expect(story?.startedAt ?? null).toBeNull();
            expect(
                await pendingQuests.collection.findOne({
                    _id: world.kept.storyRequest,
                }),
            ).not.toBeNull();
            expect(report?.cancelled).toEqual([]);
        });
    });
});
