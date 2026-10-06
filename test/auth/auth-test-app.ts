import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { INestApplication, Provider } from '@nestjs/common';
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
import { CloudinaryController } from 'src/rest/cloudinary/cloudinary.controller';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { createGraphQLOptions } from 'src/graphql/graphql-options.factory';
import { CloudinaryService } from 'src/rest/cloudinary/cloudinary.service';
import { FakeTwitchOAuthClient } from './fake-twitch-oauth.client';
import { buildTestAuthConfig } from './test-auth-config';

export const AUTH_TEST_DB_NAME = 'auth-test';

export interface AuthTestAppOptions {
    authConfig?: Partial<AuthConfig>;
    clock?: Clock;
    providers?: Provider[];
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
// GraphQL con la stessa factory di AppModule e schema in memoria
export async function createAuthTestApp(
    options: AuthTestAppOptions = {},
): Promise<AuthTestApp> {
    const config = buildTestAuthConfig(options.authConfig);
    const twitch = new FakeTwitchOAuthClient();
    const cloudinary = buildCloudinaryMock();

    let builder = Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
            MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                dbName: AUTH_TEST_DB_NAME,
            }),
            AuthModule,
            GraphQLModule.forRootAsync<ApolloDriverConfig>({
                driver: ApolloDriver,
                imports: [AuthModule],
                inject: [WsConnectionAuthenticator],
                useFactory: (
                    wsConnectionAuthenticator: WsConnectionAuthenticator,
                ) => createGraphQLOptions(wsConnectionAuthenticator, true),
            }),
        ],
        controllers: [AppController, CloudinaryController],
        providers: [
            AppService,
            { provide: CloudinaryService, useValue: cloudinary },
            ...(options.providers ?? []),
        ],
    })
        .overrideProvider(AUTH_CONFIG)
        .useValue(config)
        .overrideProvider(TwitchOAuthClient)
        .useValue(twitch);
    if (options.clock) {
        builder = builder.overrideProvider(Clock).useValue(options.clock);
    }
    const moduleRef = await builder.compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    const connection = app.get<Connection>(getConnectionToken());

    return {
        app,
        port,
        config,
        twitch,
        cloudinary,
        connection,
        async clearDatabase() {
            for (const collection of Object.values(connection.collections)) {
                await collection.deleteMany({});
            }
            twitch.reset();
            cloudinary.listResources.mockClear();
            cloudinary.listSubfoldersResources.mockClear();
            cloudinary.uploadImage.mockClear();
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
