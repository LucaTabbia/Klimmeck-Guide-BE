import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import type { AuthConfig } from 'src/config/auth-config';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { startRedis, stopRedis } from './setup/redis';

const BOOT_TIMEOUT_MS = 60_000;
const VALID_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');

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
    });
});
