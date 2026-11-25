import { INestApplication, Logger } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import {
    PortraitDeletion,
    PortraitDeletionDocument,
    PortraitDeletionSchema,
} from './portrait-deletion.model';
import { PortraitDeletionService } from './portrait-deletion.service';
import { PortraitStore } from './portrait-store';
import { FakePortraitStore } from '../../../../test/account/fake-portrait-store';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const LATER = new Date('2026-11-25T10:05:00.000Z');
const FIRST_PORTRAIT = 'characters_profile/first-portrait';
const SECOND_PORTRAIT = 'characters_profile/second-portrait';

describe('PortraitDeletionService (replSet)', () => {
    let app: INestApplication;
    let connection: Connection;
    let outbox: Model<PortraitDeletionDocument>;
    let service: PortraitDeletionService;
    let store: FakePortraitStore;

    beforeAll(async () => {
        store = new FakePortraitStore();
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'portrait-deletion-test',
                }),
                MongooseModule.forFeature([
                    {
                        name: PortraitDeletion.name,
                        schema: PortraitDeletionSchema,
                    },
                ]),
            ],
            providers: [
                PortraitDeletionService,
                { provide: PortraitStore, useValue: store },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        connection = app.get<Connection>(getConnectionToken());
        outbox = app.get<Model<PortraitDeletionDocument>>(
            getModelToken(PortraitDeletion.name),
        );
        service = app.get(PortraitDeletionService);
        await outbox.init();
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        store.destroyed.length = 0;
        store.failNext(0);
        await outbox.deleteMany({});
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    async function enqueueCommitted(
        publicIds: readonly string[],
        now: Date,
    ): Promise<void> {
        const session = await connection.startSession();
        try {
            await session.withTransaction(() =>
                service.enqueueWithin(session, publicIds, now),
            );
        } finally {
            await session.endSession();
        }
    }

    it('queues portraits inside the caller transaction without duplicates (portrait default)', async () => {
        await enqueueCommitted([FIRST_PORTRAIT, FIRST_PORTRAIT], NOW);
        await enqueueCommitted([FIRST_PORTRAIT], LATER);

        const rows = await outbox.find({}).lean().exec();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            publicId: FIRST_PORTRAIT,
            queuedAt: NOW,
            attempts: 0,
        });

        const session = await connection.startSession();
        try {
            session.startTransaction();
            await service.enqueueWithin(session, [SECOND_PORTRAIT], NOW);
            await session.abortTransaction();
        } finally {
            await session.endSession();
        }

        expect(await outbox.countDocuments({ publicId: SECOND_PORTRAIT })).toBe(
            0,
        );
    });

    it('stores no link to the user in the outbox (D-04)', async () => {
        await enqueueCommitted([FIRST_PORTRAIT], NOW);

        const row = await connection
            .collection('portrait_deletions')
            .findOne({ publicId: FIRST_PORTRAIT });

        expect(Object.keys(row ?? {}).sort()).toEqual([
            '_id',
            'attempts',
            'publicId',
            'queuedAt',
        ]);
    });

    it('deletes the row once the portrait is destroyed (portrait default)', async () => {
        await enqueueCommitted([FIRST_PORTRAIT], NOW);

        await expect(service.flush()).resolves.toBe(1);

        expect(store.destroyed).toEqual([FIRST_PORTRAIT]);
        expect(await outbox.countDocuments({})).toBe(0);
    });

    it('keeps the row and counts the attempt when the store fails, without throwing (portrait default)', async () => {
        await enqueueCommitted([FIRST_PORTRAIT], NOW);
        const row = await outbox.findOne({ publicId: FIRST_PORTRAIT }).exec();
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        store.failNext();

        await expect(service.flush()).resolves.toBe(0);

        expect(store.destroyed).toEqual([]);
        const kept = await outbox.findOne({ publicId: FIRST_PORTRAIT }).exec();
        expect(kept?.attempts).toBe(1);
        const messages = warn.mock.calls.map(([value]) => String(value));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(String(row?._id));
        expect(messages[0]).toContain('CloudinaryError, code 503');
        expect(messages[0]).not.toContain('cloudinary.com');
        expect(messages[0]).not.toContain(FIRST_PORTRAIT);
        expect(messages[0]).not.toContain('fake provider failure');
    });

    it('closes the remaining rows on the next flush (portrait default)', async () => {
        await enqueueCommitted([FIRST_PORTRAIT], NOW);
        await enqueueCommitted([SECOND_PORTRAIT], LATER);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        store.failNext();

        await expect(service.flush()).resolves.toBe(1);
        expect(store.destroyed).toEqual([SECOND_PORTRAIT]);

        await expect(service.flush()).resolves.toBe(1);
        expect(store.destroyed).toEqual([SECOND_PORTRAIT, FIRST_PORTRAIT]);
        expect(await outbox.countDocuments({})).toBe(0);
    });
});
