import { INestApplication } from '@nestjs/common';
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
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { startRedis, stopRedis } from './setup/redis';

const BOOT_TIMEOUT_MS = 60_000;
const VALID_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');
const CREATE_INTRUDER = `mutation { createUser(user: { twitchId: "intruder", role: innkeeper }) { id } }`;
const CREATE_CHARACTER = `mutation { createCharacter(input: { name: "Aria", sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) { id } }`;
const RACE_TRAITS = '{ raceTraits { race } }';
// whitelist enumerata (D-12): ogni aggiunta di @Public() deve passare da qui
const EXPECTED_PUBLIC_HANDLERS = [
    'AppController.getHello',
    'AuthResolver.exchangeLoginTicket',
    'AuthResolver.refreshSession',
    'TwitchAuthController.callback',
    'TwitchAuthController.start',
];

interface PublicSurface {
    handlers: string[];
    publicClasses: string[];
}

// legge i descriptor e non prototype[name]: alcuni provider hanno getter che lancerebbero sul prototype
function collectPublicHandlers(app: INestApplication): PublicSurface {
    const handlers = new Set<string>();
    const publicClasses = new Set<string>();
    for (const moduleRef of app.get(ModulesContainer).values()) {
        const wrappers = [
            ...moduleRef.controllers.values(),
            ...moduleRef.providers.values(),
        ];
        for (const wrapper of wrappers) {
            const instance: unknown = wrapper.instance;
            if (!instance || typeof instance !== 'object') continue;
            const prototype = Object.getPrototypeOf(instance) as object | null;
            if (!prototype) continue;
            const type = instance.constructor;
            if (Reflect.getMetadata(IS_PUBLIC_KEY, type)) {
                publicClasses.add(type.name);
            }
            for (const name of Object.getOwnPropertyNames(prototype)) {
                const handler: unknown = Object.getOwnPropertyDescriptor(
                    prototype,
                    name,
                )?.value;
                if (
                    typeof handler === 'function' &&
                    Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true
                ) {
                    handlers.add(`${type.name}.${name}`);
                }
            }
        }
    }
    return {
        handlers: [...handlers].sort(),
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

    beforeAll(async () => {
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
        });
        // import differito: native import() non è disponibile in Jest CJS (module nodenext lo preserva)
        const { AppModule } =
            jest.requireActual<typeof import('src/app.module')>(
                'src/app.module',
            );
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await app?.get<Connection>(getConnectionToken()).dropDatabase();
        await app?.close();
        await stopRedis();
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
            expect(errorCodeOf(await graphqlCall(app, CREATE_INTRUDER))).toBe(
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
});
