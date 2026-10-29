import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { INestApplication, Provider, Type } from '@nestjs/common';
import type { InjectionToken, ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { AuthModule } from 'src/auth/auth.module';
import { Clock } from 'src/auth/clock';
import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import { WsConnectionAuthenticator } from 'src/auth/ws/ws-connection-authenticator';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';
import { RUNTIME_CONFIG } from 'src/config/runtime-config';
import type { RuntimeConfig } from 'src/config/runtime-config';
import { THROTTLE_CONFIG } from 'src/config/throttle-config';
import type { ThrottleConfig } from 'src/config/throttle-config';
import { RuntimeConfigModule } from 'src/config/runtime-config.module';
import { CloudinaryController } from 'src/rest/cloudinary/cloudinary.controller';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { createGraphQLOptions } from 'src/graphql/graphql-options.factory';
import { CloudinaryService } from 'src/rest/cloudinary/cloudinary.service';
import { PortraitUploadService } from 'src/rest/cloudinary/portrait-upload.service';
import { ImageModerator } from 'src/moderation/image-moderator';
import { PubSubModule } from 'src/pubsub.module';
import { ValidationModule } from 'src/validation/validation.module';
import { HttpHardeningModule } from 'src/http/http-hardening.module';
import { ThrottlingModule } from 'src/throttling/throttling.module';
import { FakeImageModerator } from '../moderation/fake-image-moderator';
import { FakeTwitchOAuthClient } from './fake-twitch-oauth.client';
import { buildTestAuthConfig } from './test-auth-config';

export const AUTH_TEST_DB_NAME = 'auth-test';

// limiti generosi: le suite esistenti ripetono login e refresh dallo stesso IP (le prove del limite li abbassano)
const TEST_THROTTLE: ThrottleConfig = {
    ttlMs: 60_000,
    limit: 10_000,
    webhookLimit: 500_000,
    trustProxy: null,
};

const TEST_RUNTIME: RuntimeConfig = {
    mode: 'test',
    production: false,
    modeDefaulted: false,
};

export interface ProviderOverride {
    token: InjectionToken;
    useValue: unknown;
}

export interface AuthTestAppOptions {
    authConfig?: Partial<AuthConfig>;
    runtime?: Partial<RuntimeConfig>;
    throttle?: Partial<ThrottleConfig>;
    clock?: Clock;
    providers?: Provider[];
    controllers?: Type[];
    imports?: NonNullable<ModuleMetadata['imports']>;
    overrides?: ProviderOverride[];
}

export interface CloudinaryServiceMock {
    listResources: jest.Mock;
    listSubfoldersResources: jest.Mock;
    uploadImage: jest.Mock;
}

export interface AuthTestApp {
    app: INestApplication;
    port: number;
    config: AuthConfig;
    twitch: FakeTwitchOAuthClient;
    cloudinary: CloudinaryServiceMock;
    moderator: FakeImageModerator;
    connection: Connection;
    clearDatabase(): Promise<void>;
    close(): Promise<void>;
}

function buildCloudinaryMock(): CloudinaryServiceMock {
    return {
        listResources: jest.fn().mockResolvedValue([]),
        listSubfoldersResources: jest.fn().mockResolvedValue([]),
        uploadImage: jest
            .fn()
            .mockResolvedValue({ secure_url: 'https://cdn.test/image.png' }),
    };
}

// app Nest isolata: niente AppModule (Bull/Redis, change stream, .env), Twitch finto, porta effimera;
// GraphQL con la stessa factory di AppModule e schema in memoria; PubSub globale come in AppModule;
// moduli di feature senza Bull via `imports`, sostituzione di provider via `overrides`
export async function createAuthTestApp(
    options: AuthTestAppOptions = {},
): Promise<AuthTestApp> {
    const config = buildTestAuthConfig(options.authConfig);
    const twitch = new FakeTwitchOAuthClient();
    const cloudinary = buildCloudinaryMock();
    const moderator = new FakeImageModerator();

    let builder = Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
            RuntimeConfigModule,
            MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                dbName: AUTH_TEST_DB_NAME,
            }),
            PubSubModule,
            AuthModule,
            ValidationModule,
            HttpHardeningModule,
            ThrottlingModule,
            GraphQLModule.forRootAsync<ApolloDriverConfig>({
                driver: ApolloDriver,
                imports: [AuthModule],
                inject: [WsConnectionAuthenticator],
                useFactory: (
                    wsConnectionAuthenticator: WsConnectionAuthenticator,
                ) =>
                    createGraphQLOptions(wsConnectionAuthenticator, true, {
                        production: options.runtime?.production ?? false,
                    }),
            }),
            ...(options.imports ?? []),
        ],
        controllers: [
            AppController,
            CloudinaryController,
            ...(options.controllers ?? []),
        ],
        providers: [
            AppService,
            { provide: CloudinaryService, useValue: cloudinary },
            { provide: ImageModerator, useValue: moderator },
            PortraitUploadService,
            ...(options.providers ?? []),
        ],
    })
        .overrideProvider(AUTH_CONFIG)
        .useValue(config)
        .overrideProvider(RUNTIME_CONFIG)
        .useValue({ ...TEST_RUNTIME, ...options.runtime })
        .overrideProvider(THROTTLE_CONFIG)
        .useValue({ ...TEST_THROTTLE, ...options.throttle })
        .overrideProvider(TwitchOAuthClient)
        .useValue(twitch);
    if (options.clock) {
        builder = builder.overrideProvider(Clock).useValue(options.clock);
    }
    for (const { token, useValue } of options.overrides ?? []) {
        builder = builder.overrideProvider(token).useValue(useValue);
    }
    const moduleRef = await builder.compile();

    // rawBody come main.ts: il webhook EventSub firma i byte grezzi (06 D-02)
    const app = moduleRef.createNestApplication({ rawBody: true });
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const connection = app.get<Connection>(getConnectionToken());

    return {
        app,
        port,
        config,
        twitch,
        cloudinary,
        moderator,
        connection,
        async clearDatabase() {
            for (const collection of Object.values(connection.collections)) {
                await collection.deleteMany({});
            }
            twitch.reset();
            cloudinary.listResources.mockClear();
            cloudinary.listSubfoldersResources.mockClear();
            cloudinary.uploadImage.mockClear();
            moderator.reset();
        },
        async close() {
            await connection.dropDatabase();
            await app.close();
        },
    };
}

export function graphqlRequest(
    app: INestApplication,
    query: string,
    variables?: Record<string, unknown>,
    bearer?: string,
): request.Test {
    return request(app.getHttpServer())
        .post(GRAPHQL_PATH)
        .set(bearer ? { Authorization: bearer } : {})
        .send({ query, variables });
}
