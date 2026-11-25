import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { Lore, LoreDocument } from 'src/models/lore.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    buildCharacter,
    buildQuest,
    persistCharacter,
    persistCity,
    persistLore,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';
import { StartedQuestCancelModule } from './started-quest-cancel.module';
import {
    CancelledStartedQuest,
    StartedQuestCanceller,
} from './started-quest-canceller';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const STARTED_AT = new Date(NOW.getTime() - 60 * 60 * 1000);
const ARRIVED_AT = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const ARCHIVED_AT = new Date('2026-11-01T00:00:00.000Z');

describe('StartedQuestCanceller.cancelStartedQuestWithin (replSet)', () => {
    let harness: AuthTestApp;
    let canceller: StartedQuestCanceller;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let cities: Model<CityDocument>;
    let lores: Model<LoreDocument>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [StartedQuestCancelModule],
        });
        canceller = harness.app.get(StartedQuestCanceller);
        users = harness.connection.model<UserDocument>(User.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        quests = harness.connection.model<QuestDocument>(Quest.name);
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        cities = harness.connection.model<CityDocument>(City.name);
        lores = harness.connection.model<LoreDocument>(Lore.name);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([
            users.init(),
            characters.init(),
            quests.init(),
            pendingQuests.init(),
            cities.init(),
            lores.init(),
        ]);
    });

    afterEach(async () => {
        await harness.clearDatabase();
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    interface Member {
        characterId: Types.ObjectId;
        userId: Types.ObjectId;
        pendingQuestId: Types.ObjectId;
    }

    interface Scene {
        questId: Types.ObjectId;
        cityMarker: Types.ObjectId;
        questMarker: Types.ObjectId;
        cityLore: Types.ObjectId;
        ration: Types.ObjectId;
        a: Member;
        b: Member;
        c: Member;
    }

    interface SceneOptions {
        type?: 'boss' | 'enemy' | 'aid';
        startedAt?: Date | null;
        concludedAt?: Date | null;
        rescue?: { characters: Types.ObjectId[]; failedQuest: Types.ObjectId };
        cityHoldsMarker?: boolean;
    }

    interface MemberSeed {
        name: string;
        twitchId: string;
        location: Types.ObjectId;
        status?: Record<string, unknown>;
        ownedItems?: Record<string, unknown>[];
        pendingQuest: Record<string, unknown>;
        deletedAt?: Date;
    }

    async function persistMember(
        questId: Types.ObjectId,
        seed: MemberSeed,
    ): Promise<Member> {
        const characterId = new Types.ObjectId();
        const pendingQuestId = new Types.ObjectId();
        const base = buildCharacter();
        await persistCharacter(characters, {
            _id: characterId,
            infos: { ...base.infos, name: seed.name },
            status: { ...base.status, location: seed.location, ...seed.status },
            quests: { ...base.quests, pendingQuest: pendingQuestId },
            assets: { ...base.assets, ownedItems: seed.ownedItems ?? [] },
            ...(seed.deletedAt
                ? { deletedAt: seed.deletedAt, deletionReason: 'death' }
                : {}),
        });
        // documenti di oggi senza i campi del tragitto (lettura tollerante, D-11)
        await pendingQuests.collection.insertOne({
            _id: pendingQuestId,
            quest: questId,
            startDate: STARTED_AT,
            arrivedAt: ARRIVED_AT,
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

    async function persistScene(options: SceneOptions = {}): Promise<Scene> {
        const cityMarker = new Types.ObjectId();
        const questMarker = new Types.ObjectId();
        const ration = new Types.ObjectId();
        const lore = await persistLore(lores);
        await persistCity(cities, {
            markerLocation: cityMarker,
            pointsOfInterest:
                options.cityHoldsMarker === false
                    ? [new Types.ObjectId()]
                    : [questMarker],
            relatedLore: lore._id,
        });
        const questId = new Types.ObjectId();
        const a = await persistMember(questId, {
            name: 'Hero A',
            twitchId: 'twitch-a',
            location: questMarker,
            status: { currentLifePoints: 40, maxLifePoints: 100 },
            ownedItems: [{ itemType: 'LootItem', item: ration, quantity: 1 }],
            pendingQuest: {
                pointsSpent: 30,
                travelFoodSpent: [{ item: ration, quantity: 2 }],
                travelHungerLifeLost: 6,
            },
        });
        const b = await persistMember(questId, {
            name: 'Hero B',
            twitchId: 'twitch-b',
            location: questMarker,
            pendingQuest: { pointsSpent: 10 },
        });
        const c = await persistMember(questId, {
            name: 'Hero C',
            twitchId: 'twitch-c',
            location: questMarker,
            pendingQuest: { pointsSpent: 20 },
        });
        await persistQuest(quests, {
            _id: questId,
            infos: {
                ...buildQuest().infos,
                type: options.type ?? 'boss',
                markerLocation: questMarker,
            },
            registeredAdventurers: [a, b, c].map(({ characterId }) => ({
                character: characterId,
                title: 'rookie',
            })),
            startedAt:
                options.startedAt === undefined
                    ? STARTED_AT
                    : options.startedAt,
            concludedAt: options.concludedAt ?? null,
            ...(options.rescue ? { rescue: options.rescue } : {}),
        });
        return {
            questId,
            cityMarker,
            questMarker,
            cityLore: lore._id as Types.ObjectId,
            ration,
            a,
            b,
            c,
        };
    }

    function cancelInTransaction(
        scene: Scene,
        erased: Types.ObjectId[] = [scene.c.characterId],
    ): Promise<CancelledStartedQuest | null> {
        return harness.connection.transaction((session) =>
            canceller.cancelStartedQuestWithin(
                session,
                scene.questId,
                erased,
                NOW,
            ),
        );
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    function rawUser(id: Types.ObjectId) {
        return users.collection.findOne({ _id: id });
    }

    function rawQuest(id: Types.ObjectId) {
        return quests.collection.findOne({ _id: id });
    }

    async function snapshot() {
        const all = (model: Model<any>) =>
            model.collection.find({}).sort({ _id: 1 }).toArray();
        return {
            users: await all(users),
            characters: await all(characters),
            quests: await all(quests),
            pendingQuests: await all(pendingQuests),
        };
    }

    const hexes = (ids: readonly Types.ObjectId[]) =>
        ids.map((id) => id.toHexString()).sort();

    describe('a started boss with a deleted companion', () => {
        it('sends the remaining companions back to the city of the quest at once (D-13, D-26)', async () => {
            const scene = await persistScene();

            await cancelInTransaction(scene);

            for (const member of [scene.a, scene.b]) {
                const raw = await rawCharacter(member.characterId);
                expect(raw?.status.location).toEqual(scene.cityMarker);
                expect(raw?.quests.pendingQuest).toBeNull();
                expect(raw?.status.activeTravel ?? null).toBeNull();
                expect(hexes(raw?.status.unlockedLore ?? [])).toContain(
                    scene.cityLore.toHexString(),
                );
            }
        });

        it('deletes the pending quests of the cancelled quest (D-26)', async () => {
            const scene = await persistScene();

            await cancelInTransaction(scene);

            expect(
                await pendingQuests.collection.countDocuments({
                    quest: scene.questId,
                }),
            ).toBe(0);
            expect(
                (await rawCharacter(scene.c.characterId))?.quests.pendingQuest,
            ).toBeNull();
        });

        it('refunds the food, the points and the life lost to hunger (D-13)', async () => {
            const scene = await persistScene();

            await cancelInTransaction(scene);

            const a = await rawCharacter(scene.a.characterId);
            expect(a?.assets.ownedItems).toEqual([
                { itemType: 'LootItem', item: scene.ration, quantity: 3 },
            ]);
            expect(a?.status.currentLifePoints).toBe(46);
            expect((await rawUser(scene.a.userId))?.twitchPoints).toBe(130);
            const b = await rawCharacter(scene.b.characterId);
            expect(b?.assets.ownedItems).toEqual([]);
            expect(b?.status.currentLifePoints).toBe(100);
            expect((await rawUser(scene.b.userId))?.twitchPoints).toBe(110);
            expect((await rawUser(scene.c.userId))?.twitchPoints).toBe(100);
        });

        it('puts the quest back on the board not started (D-13)', async () => {
            const scene = await persistScene();

            await cancelInTransaction(scene);

            const quest = await rawQuest(scene.questId);
            expect(quest?.startedAt).toBeNull();
            expect(quest?.registeredAdventurers).toEqual([]);
            expect(quest?.concludedAt ?? null).toBeNull();
        });

        it('returns the companions sent back (D-26)', async () => {
            const scene = await persistScene();

            const cancelled = await cancelInTransaction(scene);

            expect(cancelled?.questId).toEqual(scene.questId);
            expect(hexes(cancelled?.characterIds ?? [])).toEqual(
                hexes([scene.a.characterId, scene.b.characterId]),
            );
        });
    });

    // registrazioni e collegamenti legacy in forma stringa (04 Pitfall 1): il cast di Mongoose li ridurrebbe a ObjectId
    async function storeRegistrationsAsStrings(
        scene: Scene,
        members: readonly Member[],
    ): Promise<void> {
        const quest = await rawQuest(scene.questId);
        const stringified = (
            quest?.registeredAdventurers as { character: Types.ObjectId }[]
        ).map((seat) =>
            members.some((member) => member.characterId.equals(seat.character))
                ? { ...seat, character: seat.character.toHexString() }
                : seat,
        );
        await quests.collection.updateOne(
            { _id: scene.questId },
            { $set: { registeredAdventurers: stringified } },
        );
    }

    async function storeLinksAsStrings(
        scene: Scene,
        member: Member,
    ): Promise<void> {
        await characters.collection.updateOne(
            { _id: member.characterId },
            {
                $set: {
                    'quests.pendingQuest': member.pendingQuestId.toHexString(),
                },
            },
        );
        await pendingQuests.collection.updateOne(
            { _id: member.pendingQuestId },
            { $set: { quest: scene.questId.toHexString() } },
        );
        await users.collection.updateOne(
            { _id: member.userId },
            { $set: { currentCharacter: member.characterId.toHexString() } },
        );
    }

    async function expectFullyCancelled(
        scene: Scene,
        cancelled: CancelledStartedQuest | null,
    ): Promise<void> {
        expect(hexes(cancelled?.characterIds ?? [])).toEqual(
            hexes([scene.a.characterId, scene.b.characterId]),
        );
        for (const member of [scene.a, scene.b]) {
            const raw = await rawCharacter(member.characterId);
            expect(raw?.status.location).toEqual(scene.cityMarker);
            expect(raw?.quests.pendingQuest).toBeNull();
        }
        const a = await rawCharacter(scene.a.characterId);
        expect(a?.assets.ownedItems).toEqual([
            { itemType: 'LootItem', item: scene.ration, quantity: 3 },
        ]);
        expect(a?.status.currentLifePoints).toBe(46);
        expect((await rawUser(scene.a.userId))?.twitchPoints).toBe(130);
        expect((await rawUser(scene.b.userId))?.twitchPoints).toBe(110);
        expect((await rawUser(scene.c.userId))?.twitchPoints).toBe(100);
        expect(
            await pendingQuests.collection.countDocuments({
                _id: {
                    $in: [scene.a, scene.b, scene.c].map(
                        ({ pendingQuestId }) => pendingQuestId,
                    ),
                },
            }),
        ).toBe(0);
        expect(
            (await rawCharacter(scene.c.characterId))?.quests.pendingQuest,
        ).toBeNull();
        const quest = await rawQuest(scene.questId);
        expect(quest?.startedAt).toBeNull();
        expect(quest?.registeredAdventurers).toEqual([]);
    }

    describe('legacy ids stored as strings', () => {
        it('cancels a started boss whose registrations are stored as strings (D-13, D-26)', async () => {
            const scene = await persistScene();
            await storeRegistrationsAsStrings(scene, [scene.c, scene.a]);

            const cancelled = await cancelInTransaction(scene);

            await expectFullyCancelled(scene, cancelled);
        });

        it('cancels a started boss whose lanes, requests and owners point by strings (D-13, D-26)', async () => {
            const scene = await persistScene();
            await storeLinksAsStrings(scene, scene.a);
            await storeLinksAsStrings(scene, scene.c);

            const cancelled = await cancelInTransaction(scene);

            await expectFullyCancelled(scene, cancelled);
        });
    });

    it('cancels a started enemy quest the same way (D-26)', async () => {
        const scene = await persistScene({ type: 'enemy' });

        const cancelled = await cancelInTransaction(scene);

        expect(hexes(cancelled?.characterIds ?? [])).toEqual(
            hexes([scene.a.characterId, scene.b.characterId]),
        );
        expect(
            (await rawCharacter(scene.b.characterId))?.status.location,
        ).toEqual(scene.cityMarker);
        expect((await rawQuest(scene.questId))?.startedAt).toBeNull();
    });

    it('cancels a started aid keeping its wounded (D-13)', async () => {
        const wounded = new Types.ObjectId();
        const failedQuest = new Types.ObjectId();
        const scene = await persistScene({
            type: 'aid',
            rescue: { characters: [wounded], failedQuest },
        });

        const cancelled = await cancelInTransaction(scene);

        expect(hexes(cancelled?.characterIds ?? [])).toEqual(
            hexes([scene.a.characterId, scene.b.characterId]),
        );
        expect(
            (await rawCharacter(scene.a.characterId))?.status.location,
        ).toEqual(scene.cityMarker);
        expect((await rawUser(scene.a.userId))?.twitchPoints).toBe(130);
        const aid = await rawQuest(scene.questId);
        expect(aid?.rescue.characters).toEqual([wounded]);
        expect(aid?.startedAt).toBeNull();
        expect(aid?.concludedAt ?? null).toBeNull();
        expect(aid?.registeredAdventurers).toEqual([]);
    });

    it('leaves an unstarted quest untouched (D-26)', async () => {
        const scene = await persistScene({ startedAt: null });
        const before = await snapshot();

        expect(await cancelInTransaction(scene)).toBeNull();

        expect(await snapshot()).toEqual(before);
    });

    it('leaves a concluded quest untouched (D-26)', async () => {
        const scene = await persistScene({ concludedAt: NOW });
        const before = await snapshot();

        expect(await cancelInTransaction(scene)).toBeNull();

        expect(await snapshot()).toEqual(before);
    });

    it('drops the pending quest of an archived seat holder without refund (D-26)', async () => {
        const scene = await persistScene();
        const placeholder = await persistMember(scene.questId, {
            name: 'Fallen D',
            twitchId: 'twitch-d',
            location: scene.questMarker,
            pendingQuest: { pointsSpent: 40 },
            deletedAt: ARCHIVED_AT,
        });
        await quests.collection.updateOne({ _id: scene.questId }, {
            $push: {
                registeredAdventurers: {
                    character: placeholder.characterId,
                    title: 'rookie',
                    archivedAt: ARCHIVED_AT,
                },
            },
        } as never);

        const cancelled = await cancelInTransaction(scene);

        expect(
            await pendingQuests.collection.findOne({
                _id: placeholder.pendingQuestId,
            }),
        ).toBeNull();
        expect((await rawUser(placeholder.userId))?.twitchPoints).toBe(100);
        expect(hexes(cancelled?.characterIds ?? [])).not.toContain(
            placeholder.characterId.toHexString(),
        );
        expect(
            (await rawCharacter(placeholder.characterId))?.status.location,
        ).toEqual(scene.questMarker);
    });

    it('keeps the companion in place when the quest marker has no city (D-26)', async () => {
        const warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const scene = await persistScene({ cityHoldsMarker: false });

        const cancelled = await cancelInTransaction(scene);

        const a = await rawCharacter(scene.a.characterId);
        expect(a?.status.location).toEqual(scene.questMarker);
        expect(a?.quests.pendingQuest).toBeNull();
        expect(a?.status.currentLifePoints).toBe(46);
        expect(a?.assets.ownedItems).toEqual([
            { itemType: 'LootItem', item: scene.ration, quantity: 3 },
        ]);
        expect((await rawUser(scene.a.userId))?.twitchPoints).toBe(130);
        expect(hexes(cancelled?.characterIds ?? [])).toEqual(
            hexes([scene.a.characterId, scene.b.characterId]),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(scene.questId.toHexString()),
        );
    });

    it('leaves a travelling companion intact with a warning (D-26)', async () => {
        const warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const scene = await persistScene();
        await characters.collection.updateOne(
            { _id: scene.b.characterId },
            { $set: { 'status.activeTravel': { kind: 'quest' } } },
        );
        const before = await rawCharacter(scene.b.characterId);

        const cancelled = await cancelInTransaction(scene);

        expect(await rawCharacter(scene.b.characterId)).toEqual(before);
        expect(
            await pendingQuests.collection.findOne({
                _id: scene.b.pendingQuestId,
            }),
        ).not.toBeNull();
        expect((await rawUser(scene.b.userId))?.twitchPoints).toBe(100);
        expect(hexes(cancelled?.characterIds ?? [])).toEqual(
            hexes([scene.a.characterId]),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining(scene.b.characterId.toHexString()),
        );
    });

    it('writes nothing when the caller transaction aborts (D-26)', async () => {
        const scene = await persistScene();
        const before = await snapshot();

        await expect(
            harness.connection.transaction(async (session) => {
                await canceller.cancelStartedQuestWithin(
                    session,
                    scene.questId,
                    [scene.c.characterId],
                    NOW,
                );
                throw new Error('abort');
            }),
        ).rejects.toThrow('abort');

        expect(await snapshot()).toEqual(before);
    });
});
