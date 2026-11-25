import { Model, Schema, Types } from 'mongoose';
import request from 'supertest';
import { AccountDeletionModule } from 'src/account/deletion/account-deletion.module';
import { PortraitStore } from 'src/account/deletion/portrait/portrait-store';
import { TwitchUserDirectory } from 'src/auth/twitch/twitch-user-directory';
import { CharacterCreationModule } from 'src/characters/creation/character-creation.module';
import { RandomSource } from 'src/characters/creation/random-source';
import { PUSH_CONFIG } from 'src/config/push-config';
import { QUEST_CONFIG } from 'src/config/quest-config';
import { Character } from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { PendingQuest } from 'src/models/pending-quest.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
import { User } from 'src/models/user.model';
import { startedQuestCancelled } from 'src/push/push-events';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestsModule } from 'src/quests/quests.module';
import { FakePortraitStore } from '../account/fake-portrait-store';
import { AuthTestApp, graphqlRequest } from '../auth/auth-test-app';
import { FAKE_TWITCH_USER_ID } from '../auth/fake-twitch-oauth.client';
import { FakeTwitchUserDirectory } from '../auth/fake-twitch-user-directory';
import { FixedClock } from '../auth/fixed-clock';
import { graphqlWsUrl, openAcknowledgedSocket } from '../auth/ws-test-client';
import { createCharactersTestApp } from '../authz/characters-test-app';
import { createPlayer, TestPlayer } from '../authz/player-fixture';
import { FixedRandomSource } from '../characters/fixed-random-source';
import {
    buildQuest,
    persistCity,
    persistLore,
    persistPoi,
    persistQuest,
} from '../fixtures';
import { FakePushTransport } from '../push/fake-push-transport';

// ora reale al secondo: le sessioni revocate scadono a NOW + 900 s e il monitor TTL di Mongo non deve toglierle a metà caso
const NOW = new Date(Math.floor(new Date().getTime() / 1000) * 1000);
const STARTED_AT = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
// coppia verifier/challenge S256 dell'esempio RFC 7636 (appendice B)
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const TERMS_VERSION = '2026-11-24';
// valori del contratto FE asseriti letterali: un cambio silenzioso delle costanti deve rompere il test
const SESSION_REVOKED_CLOSE_CODE = 4409;

const EXCHANGE =
    'mutation Exchange($ticket: String!, $codeVerifier: String!) { exchangeLoginTicket(ticket: $ticket, codeVerifier: $codeVerifier) { accessToken refreshToken } }';
const REFRESH =
    'mutation Refresh($refreshToken: String!) { refreshSession(refreshToken: $refreshToken) { accessToken } }';
const CREATE_CHARACTER =
    'mutation Create($input: CreateCharacterInput!) { createCharacter(input: $input) { id currentCharacter { id } } }';
const DELETE_MY_ACCOUNT = 'mutation { deleteMyAccount }';
const ME = '{ me { id twitchId twitchPoints currentCharacter { id } } }';

const CHARACTER_INPUT = {
    name: 'Aria',
    sex: 'female',
    pronoun: 'she',
    race: 'human',
    classType: 'wizard',
    age: 25,
    background: 'Nata a Drustea.',
};

type AnyModel = Model<any>;

interface WireSession {
    accessToken: string;
    refreshToken: string;
}

interface WireBody {
    data?: Record<string, any> | null;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
}

interface Companion {
    player: TestPlayer;
    characterId: Types.ObjectId;
    pendingQuestId: Types.ObjectId;
    token: string;
}

interface StartedScene {
    questId: Types.ObjectId;
    cityMarker: Types.ObjectId;
    ration: Types.ObjectId;
    a: Companion;
    b: Companion;
}

describe('account deletion flow (wire)', () => {
    const push = new FakePushTransport();
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            imports: [
                AccountDeletionModule,
                QuestsModule,
                CharacterCreationModule,
            ],
            clock: new FixedClock(NOW),
            overrides: [
                {
                    token: TwitchUserDirectory,
                    useValue: new FakeTwitchUserDirectory(),
                },
                { token: PushTransport, useValue: push },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: PortraitStore, useValue: new FakePortraitStore() },
                { token: QUEST_CONFIG, useValue: { sweepIntervalMs: 0 } },
                { token: RandomSource, useValue: new FixedRandomSource(0) },
            ],
        });
        const registered = (name: string, schema: Schema): AnyModel =>
            harness.connection.models[name] ??
            harness.connection.model(name, schema);
        registered(City.name, CitySchema);
        registered(Lore.name, LoreSchema);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all(
            Object.values(harness.connection.models).map((model) =>
                model.init(),
            ),
        );
    });

    afterEach(async () => {
        await harness.clearDatabase();
        push.reset();
    });

    afterAll(async () => {
        await harness.close();
    });

    const model = (name: string): AnyModel => harness.connection.model(name);

    async function call(
        query: string,
        bearer?: string,
        variables?: Record<string, unknown>,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            query,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    async function redirectParam(
        path: string,
        query: Record<string, string>,
        param: string,
    ): Promise<string> {
        const response = await request(harness.app.getHttpServer())
            .get(path)
            .query(query);
        expect(response.status).toBe(302);
        const value = new URL(response.headers.location).searchParams.get(
            param,
        );
        expect(value).toBeTruthy();
        return value as string;
    }

    // start → callback → ticket → exchange, col consenso firmato nello state (D-09, D-19)
    async function signIn(): Promise<WireSession> {
        const state = await redirectParam(
            '/auth/twitch/start',
            { challenge: CHALLENGE, termsVersion: TERMS_VERSION },
            'state',
        );
        const ticket = await redirectParam(
            '/auth/twitch/callback',
            { code: 'c', state },
            'ticket',
        );
        const body = await call(EXCHANGE, undefined, {
            ticket,
            codeVerifier: VERIFIER,
        });
        expect(body.errors).toBeUndefined();
        return body.data?.exchangeLoginTicket as WireSession;
    }

    function rawUserByTwitchId() {
        return model(User.name).collection.findOne({
            twitchId: FAKE_TWITCH_USER_ID,
        });
    }

    function rawById(name: string, id: Types.ObjectId) {
        return model(name).collection.findOne({ _id: id });
    }

    async function seedStartingCities(): Promise<void> {
        const cities = model(City.name);
        const pois = model(PointOfInterest.name);
        for (const [type, name] of [
            ['drusteaCapital', 'Drustea'],
            ['liberiaCapital', 'Liberia'],
            ['elfCapital', 'Minnely'],
            ['motherCapital', 'Regno della Madre'],
            ['dragonbornCapital', 'Thengran'],
        ]) {
            await persistCity(cities, { type, name }, pois);
        }
    }

    async function registerDevice(userId: unknown, token: string) {
        await harness.connection.collection('push_devices').insertOne({
            userId,
            deviceId: `dev-${token}`,
            token,
            platform: PushPlatform.android,
            lastSeenAt: NOW,
        });
    }

    async function joinStartedQuest(
        characterId: Types.ObjectId,
        questId: Types.ObjectId,
        questMarker: Types.ObjectId,
        pendingQuest: Record<string, unknown>,
        status: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const pendingQuestId = new Types.ObjectId();
        await model(Character.name).collection.updateOne(
            { _id: characterId },
            {
                $set: {
                    'status.location': questMarker,
                    'quests.pendingQuest': pendingQuestId,
                    ...status,
                },
            },
        );
        await model(PendingQuest.name).collection.insertOne({
            _id: pendingQuestId,
            quest: questId,
            startDate: STARTED_AT,
            arrivedAt: STARTED_AT,
            waitingTime: 0,
            ...pendingQuest,
        });
        return pendingQuestId;
    }

    // quest boss avviata sul marker di una città: il personaggio creato sul filo e due compagni arrivati col tragitto annotato
    async function startedBossWith(
        deletedCharacterId: Types.ObjectId,
    ): Promise<StartedScene> {
        const pois = model(PointOfInterest.name);
        const cityPoi = await persistPoi(pois);
        const questPoi = await persistPoi(pois);
        const questMarker = questPoi._id as Types.ObjectId;
        const lore = await persistLore(model(Lore.name));
        await persistCity(model(City.name), {
            markerLocation: cityPoi._id,
            pointsOfInterest: [questMarker],
            relatedLore: lore._id,
        });
        const questId = new Types.ObjectId();
        const ration = new Types.ObjectId();
        await joinStartedQuest(deletedCharacterId, questId, questMarker, {
            pointsSpent: 20,
        });
        const companion = async (
            suffix: string,
            pendingQuest: Record<string, unknown>,
            status: Record<string, unknown> = {},
        ): Promise<Companion> => {
            const player = await createPlayer(harness, {
                twitchId: `tw-flow-${suffix}`,
            });
            const characterId = player.character?._id as Types.ObjectId;
            const pendingQuestId = await joinStartedQuest(
                characterId,
                questId,
                questMarker,
                pendingQuest,
                status,
            );
            const token = `tok-flow-${suffix}`;
            await registerDevice(player.user._id, token);
            return { player, characterId, pendingQuestId, token };
        };
        const a = await companion(
            'a',
            {
                pointsSpent: 30,
                travelFoodSpent: [{ item: ration, quantity: 2 }],
                travelHungerLifeLost: 6,
            },
            {
                'status.currentLifePoints': 40,
                'status.maxLifePoints': 100,
                'assets.ownedItems': [
                    { itemType: 'LootItem', item: ration, quantity: 1 },
                ],
            },
        );
        const b = await companion('b', { pointsSpent: 10 });
        await persistQuest(model(Quest.name), {
            _id: questId,
            infos: {
                ...buildQuest().infos,
                type: 'boss',
                markerLocation: questMarker,
            },
            registeredAdventurers: [
                deletedCharacterId,
                a.characterId,
                b.characterId,
            ].map((character) => ({ character, title: 'rookie' })),
            startedAt: STARTED_AT,
            concludedAt: null,
        });
        return {
            questId,
            cityMarker: cityPoi._id as Types.ObjectId,
            ration,
            a,
            b,
        };
    }

    async function pointsOf(companion: Companion): Promise<number> {
        const user = await rawById(
            User.name,
            companion.player.user._id as Types.ObjectId,
        );
        return user?.twitchPoints as number;
    }

    it('deletes an account end to end and lets the same Twitch account start again (D-04, D-09, D-13, D-18, D-24)', async () => {
        await seedStartingCities();
        const session = await signIn();
        const bearer = `Bearer ${session.accessToken}`;
        const consenting = await rawUserByTwitchId();
        expect(consenting?.acceptedTermsVersion).toBe(TERMS_VERSION);
        expect(consenting?.termsAcceptedAt).toEqual(NOW);
        const userId = consenting?._id as Types.ObjectId;

        const created = await call(CREATE_CHARACTER, bearer, {
            input: CHARACTER_INPUT,
        });
        expect(created.errors).toBeUndefined();
        const characterId = new Types.ObjectId(
            created.data?.createCharacter.currentCharacter.id as string,
        );
        expect((await rawById(Character.name, characterId))?.user).toEqual(
            userId,
        );

        const scene = await startedBossWith(characterId);
        const pointsBefore = [await pointsOf(scene.a), await pointsOf(scene.b)];
        const { closed } = await openAcknowledgedSocket(
            graphqlWsUrl(harness.port),
            { Authorization: bearer },
        );

        // la chiusura può arrivare prima della risposta HTTP: si attendono entrambe
        const [deleted, closeEvent] = await Promise.all([
            call(DELETE_MY_ACCOUNT, bearer),
            closed,
        ]);

        expect(deleted).toEqual({ data: { deleteMyAccount: true } });
        expect(closeEvent).toEqual({
            code: SESSION_REVOKED_CLOSE_CODE,
            reason: 'accountDeleted',
            acknowledged: true,
        });
        const refused = await call(REFRESH, undefined, {
            refreshToken: session.refreshToken,
        });
        expect(refused.data).toBeNull();
        expect(refused.errors?.[0]?.extensions).toEqual({
            code: 'SESSION_REVOKED',
            reason: 'accountDeleted',
        });
        expect(await rawById(User.name, userId)).toBeNull();
        expect(await rawById(Character.name, characterId)).toBeNull();

        for (const companion of [scene.a, scene.b]) {
            const raw = await rawById(Character.name, companion.characterId);
            expect(raw?.status.location).toEqual(scene.cityMarker);
            expect(raw?.quests.pendingQuest).toBeNull();
            expect(
                await rawById(PendingQuest.name, companion.pendingQuestId),
            ).toBeNull();
        }
        const a = await rawById(Character.name, scene.a.characterId);
        expect(a?.assets.ownedItems).toEqual([
            { itemType: 'LootItem', item: scene.ration, quantity: 3 },
        ]);
        expect(a?.status.currentLifePoints).toBe(46);
        expect([await pointsOf(scene.a), await pointsOf(scene.b)]).toEqual([
            pointsBefore[0] + 30,
            pointsBefore[1] + 10,
        ]);
        const message = startedQuestCancelled(scene.questId.toHexString());
        expect(
            [...push.sent].sort((left, right) =>
                left.tokens[0].localeCompare(right.tokens[0]),
            ),
        ).toEqual([
            { tokens: [scene.a.token], message },
            { tokens: [scene.b.token], message },
        ]);
        const quest = await rawById(Quest.name, scene.questId);
        expect(quest?.startedAt).toBeNull();
        expect(quest?.concludedAt ?? null).toBeNull();
        expect(quest?.registeredAdventurers).toEqual([]);

        const again = await signIn();
        const me = await call(ME, `Bearer ${again.accessToken}`);
        expect(me.errors).toBeUndefined();
        expect(me.data?.me.id).not.toBe(userId.toHexString());
        expect(me.data?.me).toEqual({
            id: me.data?.me.id,
            twitchId: FAKE_TWITCH_USER_ID,
            twitchPoints: 0,
            currentCharacter: null,
        });
        const reborn = await rawUserByTwitchId();
        expect(reborn?.acceptedTermsVersion).toBe(TERMS_VERSION);
        expect(reborn?.termsAcceptedAt).toEqual(NOW);
        expect(
            await model(Character.name).collection.countDocuments({
                user: reborn?._id,
            }),
        ).toBe(0);
    });
});
