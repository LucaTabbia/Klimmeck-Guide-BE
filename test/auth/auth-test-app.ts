import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { AddressInfo } from 'node:net';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { AuthModule } from 'src/auth/auth.module';
import { Clock } from 'src/auth/clock';
import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';
import { CloudinaryController } from 'src/rest/cloudinary/cloudinary.controller';
import { CloudinaryService } from 'src/rest/cloudinary/cloudinary.service';
import { FakeTwitchOAuthClient } from './fake-twitch-oauth.client';
import { buildTestAuthConfig } from './test-auth-config';

export const AUTH_TEST_DB_NAME = 'auth-test';

export interface AuthTestAppOptions {
    authConfig?: Partial<AuthConfig>;
    clock?: Clock;
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

// app Nest isolata: niente AppModule (Bull/Redis, change stream, .env), Twitch finto, porta effimera
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
        ],
        controllers: [AppController, CloudinaryController],
        providers: [
            AppService,
            { provide: CloudinaryService, useValue: cloudinary },
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
