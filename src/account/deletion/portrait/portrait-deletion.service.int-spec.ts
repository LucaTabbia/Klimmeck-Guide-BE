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
import { Clock } from 'src/auth/clock';
import {
    MAX_PORTRAIT_ATTEMPTS,
    PortraitDeletionService,
} from './portrait-deletion.service';
import { PortraitStore } from './portrait-store';
import { FakePortraitStore } from '../../../../test/account/fake-portrait-store';
import { FixedClock } from '../../../../test/auth/fixed-clock';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const LATER = new Date('2026-11-25T10:05:00.000Z');
const FIRST_PORTRAIT = 'characters_profile/first-portrait';
const SECOND_PORTRAIT = 'characters_profile/second-portrait';
const MINUTE_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * 60;

describe('PortraitDeletionService (replSet)', () => {
    let app: INestApplication;
    let connection: Connection;
    let outbox: Model<PortraitDeletionDocument>;
    let service: PortraitDeletionService;
    let store: FakePortraitStore;
    let clock: FixedClock;

    beforeAll(async () => {
        store = new FakePortraitStore();
        clock = new FixedClock(NOW);
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
                { provide: Clock, useValue: clock },
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
            'nextAttemptAt',
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

        clock.advanceSeconds(MINUTE_SECONDS);
        await expect(service.flush()).resolves.toBe(1);
        expect(store.destroyed).toEqual([SECOND_PORTRAIT, FIRST_PORTRAIT]);
        expect(await outbox.countDocuments({})).toBe(0);
    });

    it('waits a growing delay before retrying a failed portrait (WR-02)', async () => {
        const start = clock.now();
        await enqueueCommitted([FIRST_PORTRAIT], start);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        const destroy = jest.spyOn(store, 'destroy');
        store.failNext(2);

        await service.flush();
        await service.flush();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(
            (await outbox.findOne({ publicId: FIRST_PORTRAIT }).lean().exec())
                ?.nextAttemptAt,
        ).toEqual(new Date(start.getTime() + MINUTE_SECONDS * 1000));

        clock.advanceSeconds(MINUTE_SECONDS);
        await service.flush();
        expect(destroy).toHaveBeenCalledTimes(2);
        const retried = await outbox
            .findOne({ publicId: FIRST_PORTRAIT })
            .lean()
            .exec();
        expect(retried?.attempts).toBe(2);
        expect(retried?.nextAttemptAt).toEqual(
            new Date(clock.now().getTime() + 2 * MINUTE_SECONDS * 1000),
        );

        clock.advanceSeconds(MINUTE_SECONDS);
        await service.flush();
        expect(destroy).toHaveBeenCalledTimes(2);
        clock.advanceSeconds(MINUTE_SECONDS);
        await expect(service.flush()).resolves.toBe(1);
        expect(store.destroyed).toEqual([FIRST_PORTRAIT]);
    });

    it('gives up after the cap and reports the row once at ERROR without its public id (WR-02)', async () => {
        await enqueueCommitted([FIRST_PORTRAIT], clock.now());
        const row = await outbox.findOne({ publicId: FIRST_PORTRAIT }).exec();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        const destroy = jest.spyOn(store, 'destroy');
        store.failNext(MAX_PORTRAIT_ATTEMPTS + 1);

        for (let attempt = 0; attempt < MAX_PORTRAIT_ATTEMPTS + 2; attempt++) {
            await service.flush();
            clock.advanceSeconds(DAY_SECONDS);
        }

        expect(MAX_PORTRAIT_ATTEMPTS).toBeGreaterThan(1);
        expect(destroy).toHaveBeenCalledTimes(MAX_PORTRAIT_ATTEMPTS);
        const kept = await outbox.findOne({ publicId: FIRST_PORTRAIT }).exec();
        expect(kept?.attempts).toBe(MAX_PORTRAIT_ATTEMPTS);
        const reports = error.mock.calls.map(([value]) => String(value));
        expect(reports).toHaveLength(1);
        expect(reports[0]).toContain(String(row?._id));
        expect(reports[0]).not.toContain(FIRST_PORTRAIT);
    });
});
