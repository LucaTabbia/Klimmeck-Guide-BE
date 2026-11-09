// boot reale di AppModule condiviso (Phase 17 C-2): l'ambiente è scritto PRIMA dell'import di AppModule,
// così vince su qualunque .env locale (Pitfall 8); nessuna credenziale reale accende FCM, EventSub,
// moderazione o sweep (Pitfall 11, 13)
import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { AddressInfo } from 'node:net';
import { startRedis, stopRedis } from '../setup/redis';

export const REAL_BOOT_TIMEOUT_MS = 60_000;
export const REAL_BOOT_JWT_SECRET = 'app-boot-test-secret-0123456789abcdef';

export interface RealAppBootOptions {
    dbName: string;
    listen?: boolean;
}

export interface RealAppBoot {
    app: INestApplication;
    port: number | null;
    connection: Connection;
    close(): Promise<void>;
}

function writeTestEnvironment(
    dbName: string,
    redis: { host: string; port: number },
): void {
    Object.assign(process.env, {
        MONGO_URI: process.env.MONGO_TEST_URI,
        DB_NAME: dbName,
        REDIS_HOST: redis.host,
        REDIS_PORT: String(redis.port),
        JWT_SECRET: REAL_BOOT_JWT_SECRET,
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
        // Pitfall 13: nessun timer dello sweep nel boot reale; il reconciler al boot gira comunque
        TRAVEL_SWEEP_INTERVAL_MS: '0',
        QUEST_SWEEP_INTERVAL_MS: '0',
        SPELL_RECOVERY_SWEEP_INTERVAL_MS: '0',
        // D-08: un .env locale con limiti propri non deve cambiare i default attesi dal boot reale
        THROTTLE_TTL_MS: '',
        THROTTLE_LIMIT: '',
        THROTTLE_TRUST_PROXY: '',
        // Pitfall 11: un .env locale con chiavi Sightengine reali non deve accendere la moderazione (D-14)
        SIGHTENGINE_USER_ID: '',
        SIGHTENGINE_API_SECRET: '',
    });
}

async function createApp(): Promise<INestApplication> {
    // import differito: native import() non è disponibile in Jest CJS (module nodenext lo preserva)
    const { AppModule } =
        jest.requireActual<typeof import('src/app.module')>('src/app.module');
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();
    return moduleRef.createNestApplication({ rawBody: true });
}

async function listeningPortOf(app: INestApplication): Promise<number> {
    await app.listen(0);
    const server = app.getHttpServer() as { address(): AddressInfo };
    return server.address().port;
}

export async function bootRealApp(
    options: RealAppBootOptions,
): Promise<RealAppBoot> {
    const envSnapshot = { ...process.env };
    const redis = await startRedis();
    let app: INestApplication | undefined;
    try {
        writeTestEnvironment(options.dbName, redis);
        app = await createApp();
        await app.init();
        const port = options.listen ? await listeningPortOf(app) : null;
        const connection = app.get<Connection>(getConnectionToken());
        const booted = app;
        return {
            app: booted,
            port,
            connection,
            async close() {
                await connection.dropDatabase();
                await booted.close();
                await stopRedis();
                process.env = envSnapshot;
            },
        };
    } catch (error) {
        // trappola 15-03: un boot fallito non lascia handle aperti che terrebbero jest appeso
        await app?.close();
        await stopRedis();
        process.env = envSnapshot;
        throw error;
    }
}
