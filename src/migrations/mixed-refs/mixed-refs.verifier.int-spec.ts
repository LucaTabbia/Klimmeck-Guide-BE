import { Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Connection, Types } from 'mongoose';
import { MixedRefsVerifier } from './mixed-refs.verifier';

const DB_NAME = 'mixed-refs-verifier-test';

describe('MixedRefsVerifier (replSet)', () => {
    let connection: Connection;
    let verifier: MixedRefsVerifier;
    let errorSpy: jest.SpyInstance;

    beforeAll(() => {
        connection = mongoose.connection.useDb(DB_NAME);
    });

    beforeEach(async () => {
        await connection.dropDatabase();
        const moduleRef = await Test.createTestingModule({
            providers: [
                MixedRefsVerifier,
                { provide: getConnectionToken(), useValue: connection },
            ],
        }).compile();
        verifier = moduleRef.get(MixedRefsVerifier);
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await connection.dropDatabase();
    });

    it('logs the residual string references per path at boot (D-17d)', async () => {
        const hex = new Types.ObjectId().toHexString();
        await connection
            .collection('users')
            .insertOne({ name: 'fake-viewer', currentCharacter: hex });
        await connection
            .collection('characters')
            .insertMany([
                { status: { spells: [hex, new Types.ObjectId()] } },
                { status: { spells: [hex] } },
            ]);

        await verifier.verify();

        expect(errorSpy.mock.calls).toEqual([
            [
                'Ref stringa ancora da migrare: users:currentCharacter=1, characters:status.spells=2. Eseguire la migrazione (runbook) prima del deploy del codice ritipizzato',
            ],
        ]);
    });

    it('stays silent when nothing is left to migrate', async () => {
        await connection
            .collection('users')
            .insertOne({ currentCharacter: new Types.ObjectId() });

        await verifier.verify();

        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('never blocks the boot', async () => {
        jest.spyOn(connection.db!, 'collection').mockImplementation(() => {
            throw new Error('fake-read-failure');
        });
        const verify = jest.spyOn(verifier, 'verify');

        expect(verifier.onApplicationBootstrap()).toBeUndefined();
        await expect(verify.mock.results[0].value).resolves.toBeUndefined();
        expect(errorSpy.mock.calls).toEqual([
            ['Verifica dei ref Mixed non riuscita (Error)'],
        ]);
    });
});
