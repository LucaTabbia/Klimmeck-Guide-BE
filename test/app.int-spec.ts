import { INestApplication, Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { IS_PUBLIC_KEY } from 'src/auth/decorators/public.decorator';
import type { AuthConfig } from 'src/config/auth-config';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { EventSubConfig } from 'src/config/eventsub-config';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import {
    OWNERSHIP_KEY,
    type OwnershipRule,
} from 'src/authz/ownership/ownership.decorators';
import { ROLES_KEY } from 'src/authz/roles/roles.decorator';
import { WalletService } from 'src/economy/wallet.service';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { PushService } from 'src/push/push.service';
import { NoopPushTransport } from 'src/push/transport/noop-push-transport';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import { startRedis, stopRedis } from './setup/redis';

const BOOT_TIMEOUT_MS = 60_000;
const VALID_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');
const INTRUDER_MUTATION =
    'mutation { doTransaction(request: { id: "64b000000000000000000001", boughtItems: { equipAssets: [], lootAssets: [] }, soldItems: { equipAssets: [], lootAssets: [] }, total: { gold: 0, silver: 1, copper: 0 }, isTotalPositive: true }) { successful } }';
const CREATE_CHARACTER = `mutation { createCharacter(input: { name: "Aria", sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) { id } }`;
const RACE_TRAITS = '{ raceTraits { race } }';
const DELETE_CHARACTER = 'mutation { deleteCharacter { id } }';
const REGISTER_PUSH_DEVICE =
    'mutation { registerPushDevice(input: { deviceId: "d", token: "t", platform: android }) }';
const ACCEPT_QUEST =
    'mutation { acceptQuest(request: { id: "64b000000000000000000001", questId: "64b000000000000000000002" }) { successful } }';
// whitelist enumerata (D-12): ogni aggiunta di @Public() deve passare da qui
const EXPECTED_PUBLIC_HANDLERS = [
    'AppController.getHello',
    'AuthResolver.exchangeLoginTicket',
    'AuthResolver.refreshSession',
    'EventSubController.receive',
    'TwitchAuthController.callback',
    'TwitchAuthController.start',
];
// whitelist enumerate (D-15): ogni nuova operazione admin o sul personaggio deve passare da qui
const EXPECTED_INNKEEPER_HANDLERS = [
    'CharactersResolver.characters',
    'PendingQuestsResolver.pendingQuests',
    'PushResolver.sendTestPush',
    'UsersResolver.user',
    'UsersResolver.users',
];
const EXPECTED_OWNERSHIP_HANDLERS = [
    'CharactersResolver.character',
    'CharactersResolver.characterUpdated',
    'CharactersResolver.doTransaction',
    'CharactersResolver.equipItem',
    'CharactersResolver.equipSpell',
    'CharactersResolver.equipment',
    'CharactersResolver.unequipSpell',
    'CharactersResolver.useSpell',
    'PendingQuestsResolver.pendingQuest',
    'QuestAcceptanceResolver.acceptQuest',
];
// nessun bypass innkeeper (07 D-11): ogni handler owner-only deve passare da qui
const EXPECTED_OWNER_ONLY_HANDLERS = ['QuestAcceptanceResolver.acceptQuest'];

interface PublicSurface {
    handlers: string[];
    publicClasses: string[];
}

type MetadataMatcher = (value: unknown) => boolean;

const isDefined: MetadataMatcher = (value) => value !== undefined;

function providerInstancesOf(app: INestApplication): object[] {
    const instances: object[] = [];
    for (const moduleRef of app.get(ModulesContainer).values()) {
        const wrappers = [
            ...moduleRef.controllers.values(),
            ...moduleRef.providers.values(),
        ];
        for (const wrapper of wrappers) {
            const instance: unknown = wrapper.instance;
            if (instance && typeof instance === 'object') {
                instances.push(instance);
            }
        }
    }
    return instances;
}

// legge i descriptor e non prototype[name]: alcuni provider hanno getter che lancerebbero sul prototype
function collectHandlersWithMetadata(
    app: INestApplication,
    metadataKey: string,
    matches: MetadataMatcher = isDefined,
): string[] {
    const handlers = new Set<string>();
    for (const instance of providerInstancesOf(app)) {
        const prototype = Object.getPrototypeOf(instance) as object | null;
        if (!prototype) continue;
        const type = instance.constructor;
        for (const name of Object.getOwnPropertyNames(prototype)) {
            const handler: unknown = Object.getOwnPropertyDescriptor(
                prototype,
                name,
            )?.value;
            if (
                typeof handler === 'function' &&
                matches(Reflect.getMetadata(metadataKey, handler))
            ) {
                handlers.add(`${type.name}.${name}`);
            }
        }
    }
    return [...handlers].sort();
}

function collectPublicHandlers(app: INestApplication): PublicSurface {
    const publicClasses = new Set<string>();
    for (const instance of providerInstancesOf(app)) {
        const type = instance.constructor;
        if (Reflect.getMetadata(IS_PUBLIC_KEY, type)) {
            publicClasses.add(type.name);
        }
    }
    return {
        handlers: collectHandlersWithMetadata(
            app,
            IS_PUBLIC_KEY,
            (value) => value === true,
        ),
        publicClasses: [...publicClasses],
    };
}

function graphqlCall(
    app: INestApplication,
    query: string,
    authorization?: string,
): request.Test {
    return request(app.getHttpServer())
        .post(GRAPHQL_PATH)
        .set(authorization ? { Authorization: authorization } : {})
        .send({ query });
}

function errorCodeOf(response: request.Response): unknown {
    const body = response.body as {
        errors?: { extensions: Record<string, unknown> }[];
    };
    return body.errors?.[0]?.extensions.code;
}

/**
 * INTEGRATION: boots the REAL AppModule (Bull + Redis effimero, MongoMemoryReplSet)
 * with only a fake JWT_SECRET and no Twitch credentials. process.env is set by the
 * test BEFORE AppModule is imported, so it wins over any local .env (Pitfall 8).
 */
describe('AppModule (real boot without Twitch credentials)', () => {
    const envSnapshot = { ...process.env };
    let app: INestApplication;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    beforeAll(async () => {
        // spie passthrough attive prima del boot: catturano le chiamate di rete e il WARN di avvio
        fetchSpy = jest.spyOn(global, 'fetch');
        warnSpy = jest.spyOn(Logger.prototype, 'warn');
        const redis = await startRedis();
        Object.assign(process.env, {
            MONGO_URI: process.env.MONGO_TEST_URI,
            DB_NAME: 'app-boot-test',
            REDIS_HOST: redis.host,
            REDIS_PORT: String(redis.port),
            JWT_SECRET: 'app-boot-test-secret-0123456789abcdef',
            TWITCH_CLIENT_ID: '',
            TWITCH_CLIENT_SECRET: '',
            TWITCH_REDIRECT_URI: '',
            APP_AUTH_REDIRECT_URL: 'klimmeck://auth',
            DEV_AUTH_ENABLED: 'false',
            // Pitfall 11: un .env locale con credenziali reali non deve mai accendere FCM nel test
            FIREBASE_SERVICE_ACCOUNT: '',
            // C2 / Pitfall 13: un .env locale con EventSub parziale non deve rompere il boot reale
            TWITCH_LOGIN_SCOPES: '',
            TWITCH_EVENTSUB_SECRET: '',
            TWITCH_EVENTSUB_CALLBACK_URL: '',
            TWITCH_BROADCASTER_ID: '',
        });
        // import differito: native import() non è disponibile in Jest CJS (module nodenext lo preserva)
        const { AppModule } =
            jest.requireActual<typeof import('src/app.module')>(
                'src/app.module',
            );
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication({ rawBody: true });
        await app.init();
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await app?.get<Connection>(getConnectionToken()).dropDatabase();
        await app?.close();
        await stopRedis();
        fetchSpy.mockRestore();
        warnSpy.mockRestore();
        process.env = envSnapshot;
    });

    it('resolves an auth config without Twitch and without the dev bypass', () => {
        const config = app.get<AuthConfig>(AUTH_CONFIG);

        expect(config.twitch).toBeNull();
        expect(config.devAuth).toBeNull();
    });

    it('serves the root endpoint', async () => {
        await request(app.getHttpServer())
            .get('/')
            .expect(200)
            .expect('Hello World!');
    });

    it('redirects the Twitch login start to the not-configured app error', async () => {
        const response = await request(app.getHttpServer())
            .get('/auth/twitch/start')
            .query({ challenge: VALID_CHALLENGE });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'klimmeck://auth?error=twitch_not_configured',
        );
    });

    it('writes the session API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('type AuthSession');
        expect(schema).toContain('exchangeLoginTicket(');
        expect(schema).toContain('refreshSession(');
        expect(schema).toContain('me: User!');
        expect(schema).toContain('logout: Boolean!');
    });

    it('writes the character creation API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'createCharacter(input: CreateCharacterInput!): User!',
        );
        expect(schema).toContain('raceTraits: [RaceTraits!]!');
        expect(schema).toContain('input CreateCharacterInput');
        expect(schema).toContain('type RaceTraits');
        expect(schema).toContain('enum RaceType');
        expect(schema).toContain('enum ClassType');
        expect(schema).toContain('enum SexType');
        expect(schema).toContain('enum PronounType');
        expect(schema).toContain('race: RaceType!');
    });

    it('writes the character deletion API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('deleteCharacter: User!');
        expect(schema).not.toContain('deletedAt');
        expect(schema).not.toContain('deletionReason');
        expect(schema).not.toContain('DeletionReason');
    });

    it('keeps the real-time and authorization contract in the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('userUpdated: User!');
        expect(schema).toContain('characterUpdated(id: String!): Character!');
        expect(schema).not.toContain('createUser(');
        expect(schema).not.toContain('updateUser(');
        expect(schema).not.toContain('deleteUser(');
        expect(schema).not.toContain('input UserInput');
        expect(schema).not.toContain('AdminAuditLog');
        expect(schema).not.toContain('adminProbe');
    });

    it('writes the quest lanes into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type CharacterQuests \{[^}]*\}/)?.[0]).toBe(
            'type CharacterQuests {\n  activeStoryQuest: PendingQuest\n  activeWorldMissionQuest: PendingQuest\n  completedQuests: [Quest!]!\n  pendingQuest: PendingQuest\n}',
        );
        expect(schema.match(/type PendingQuest \{[^}]*\}/)?.[0]).toBe(
            'type PendingQuest {\n  id: ID!\n  pointsSpent: Int!\n  quest: Quest!\n  startDate: DateTime!\n  waitingTime: Float!\n}',
        );
    });

    it('writes the quest party into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestRequirements \{[^}]*\}/)?.[0]).toBe(
            'type QuestRequirements {\n  minTitle: String!\n  party: [QuestPartySlot!]!\n  recommendedLoot: [AssetQuantity!]!\n  requiredAdventurers: Int!\n  requiredPoints: Int\n}',
        );
        expect(schema.match(/type QuestPartySlot \{[^}]*\}/)?.[0]).toBe(
            'type QuestPartySlot {\n  count: Int!\n  title: String!\n}',
        );
        expect(schema).not.toContain('registrations');
    });

    it('writes the server time query into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('  serverTime: DateTime!\n');
    });

    it('writes the quest acceptance API into the generated schema', () => {
        expect(app.get(QuestAcceptanceService)).toBeInstanceOf(
            QuestAcceptanceService,
        );
        expect(app.get(WalletService)).toBeInstanceOf(WalletService);
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'acceptQuest(request: AcceptQuestRequest!): CommonResponse!',
        );
        expect(schema.match(/input AcceptQuestRequest \{[^}]*\}/)?.[0]).toBe(
            'input AcceptQuestRequest {\n  id: String!\n  questId: String!\n}',
        );
        expect(schema).toContain('serverTime: DateTime!');
        expect(schema).not.toMatch(
            /QuestAcceptance|twitchPointsDebit|INSUFFICIENT_FUNDS|registrations/,
        );
    });

    it('writes the push API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'registerPushDevice(input: RegisterPushDeviceInput!): Boolean!',
        );
        expect(schema).toContain(
            'unregisterPushDevice(deviceId: String!): Boolean!',
        );
        expect(schema).toContain(
            'sendTestPush(input: SendTestPushInput!): PushDeliveryReport!',
        );
        expect(schema).toContain('input RegisterPushDeviceInput');
        expect(schema).toContain('input SendTestPushInput');
        expect(schema).toContain('enum PushPlatform');
        expect(schema).toContain('enum PushEventType');
        expect(schema).toContain('type PushDeliveryReport');
        expect(schema).toContain('targetUserId: ID');
        expect(schema).not.toContain('type PushDevice');
        expect(schema).not.toContain('lastSeenAt');
        expect(schema).not.toContain('FIREBASE');
        expect(schema.match(/type User \{[^}]*\}/)?.[0]).not.toMatch(
            /token|deviceId|push/i,
        );
    });

    it('resolves the no-op push transport without Firebase credentials', () => {
        const transport = app.get(PushTransport);

        expect(transport).toBeInstanceOf(NoopPushTransport);
        expect(transport.enabled).toBe(false);
        expect(app.get(PushService)).toBeInstanceOf(PushService);
    });

    it('boots EventSub disabled without calling Twitch', () => {
        const twitchCalls = fetchSpy.mock.calls.filter(([url]) =>
            /twitch\.tv/.test(String(url)),
        );

        expect(app.get<EventSubConfig>(EVENTSUB_CONFIG)).toEqual({
            mode: 'disabled',
        });
        expect(twitchCalls).toHaveLength(0);
        expect(
            warnSpy.mock.calls.some(([message]) =>
                String(message).includes('EventSub disabled'),
            ),
        ).toBe(true);
    });

    it('rejects EventSub webhook calls while EventSub is disabled', async () => {
        const response = await request(app.getHttpServer())
            .post('/webhooks/twitch/eventsub')
            .set('Content-Type', 'application/json')
            .send('{}');

        expect(response.status).toBe(403);
        expect(response.text).toBe('');
    });

    it('adds no GraphQL surface for EventSub', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).not.toMatch(/eventsub|EventSub|redemption/i);
    });

    describe('global auth guard', () => {
        it('rejects an existing query without a bearer or with a forged one', async () => {
            const query = '{ users { id } }';

            expect(errorCodeOf(await graphqlCall(app, query))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
            expect(
                errorCodeOf(await graphqlCall(app, query, 'Bearer forged')),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects an existing mutation without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, INTRUDER_MUTATION))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects createCharacter and raceTraits without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, RACE_TRAITS))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
            expect(errorCodeOf(await graphqlCall(app, CREATE_CHARACTER))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects deleteCharacter without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, DELETE_CHARACTER))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects registerPushDevice without a bearer', async () => {
            expect(
                errorCodeOf(await graphqlCall(app, REGISTER_PUSH_DEVICE)),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects acceptQuest without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, ACCEPT_QUEST))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects serverTime without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, '{ serverTime }'))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('answers 401 JSON on cloudinary/getUrls without a bearer', async () => {
            const response = await request(app.getHttpServer())
                .post('/cloudinary/getUrls')
                .send({ folder: 'x' });

            expect(response.status).toBe(401);
            expect(response.body).toMatchObject({
                statusCode: 401,
                code: AuthErrorCode.UNAUTHENTICATED,
            });
        });

        it('keeps introspection public until Phase 10 (known limit D-30)', async () => {
            const response = await graphqlCall(
                app,
                '{ __schema { queryType { name } } }',
            );
            const body = response.body as {
                data?: { __schema: { queryType: { name: string } } };
            };

            expect(body.data?.__schema.queryType.name).toBe('Query');
        });

        it('exposes exactly the enumerated @Public handlers and no public class', () => {
            const { handlers, publicClasses } = collectPublicHandlers(app);

            expect(handlers).toEqual(EXPECTED_PUBLIC_HANDLERS);
            expect(publicClasses).toEqual([]);
        });
    });

    describe('authorization surface', () => {
        it('exposes exactly the enumerated innkeeper-only handlers', () => {
            expect(collectHandlersWithMetadata(app, ROLES_KEY)).toEqual(
                EXPECTED_INNKEEPER_HANDLERS,
            );
        });

        it('exposes exactly the enumerated ownership-protected handlers', () => {
            expect(collectHandlersWithMetadata(app, OWNERSHIP_KEY)).toEqual(
                EXPECTED_OWNERSHIP_HANDLERS,
            );
        });

        it('exposes exactly the enumerated owner-only handlers', () => {
            expect(
                collectHandlersWithMetadata(
                    app,
                    OWNERSHIP_KEY,
                    (rule) =>
                        (rule as OwnershipRule | undefined)?.ownerOnly === true,
                ),
            ).toEqual(EXPECTED_OWNER_ONLY_HANDLERS);
        });
    });
});
