import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { PubSubEvents } from 'src/pubsub.module';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
    ChangeStreamSpec,
} from './change-stream-publisher';
import { describeError } from './mongo-errors';

interface ProbeDocument {
    label: string;
}

const PROBE_SPEC: ChangeStreamSpec = {
    pipeline: [{ $match: { operationType: 'insert' } }],
    options: { fullDocument: 'updateLookup' },
    subject: 'delle sonde',
};

const HISTORY_LOST_CODE = 286;

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

class ProbePublisher extends ChangeStreamPublisher<ProbeDocument> {
    readonly changes: ChangeStreamEvent[] = [];

    constructor(model: Model<ProbeDocument>) {
        super(model, PROBE_SPEC, {
            publish: jest.fn(),
        } as unknown as PubSub<PubSubEvents>);
    }

    protected onChange(change: ChangeStreamEvent): void {
        this.changes.push(change);
    }
}

function serverError(code: number): Error {
    return Object.assign(new Error('fake-server-message'), {
        name: 'MongoServerError',
        code,
        errmsg: 'fake-uri mongodb://fake-user:fake-pass@fake-host',
    });
}

describe('ChangeStreamPublisher', () => {
    let streams: FakeChangeStream[];
    let watch: jest.Mock;
    let publisher: ProbePublisher;
    let errorLog: jest.SpyInstance;
    let warnLog: jest.SpyInstance;

    function latestStream(): FakeChangeStream {
        return streams[streams.length - 1];
    }

    beforeEach(() => {
        jest.useFakeTimers();
        errorLog = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        warnLog = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        streams = [];
        watch = jest.fn(() => {
            const stream = new FakeChangeStream();
            streams.push(stream);
            return stream;
        });
        publisher = new ProbePublisher({
            watch,
        } as unknown as Model<ProbeDocument>);
        publisher.onModuleInit();
    });

    afterEach(async () => {
        await publisher.onModuleDestroy();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('forwards the changes of the open stream to the subclass', () => {
        const change = { _id: { _data: 'tok-1' }, documentKey: { _id: 'a' } };

        latestStream().emit('change', change);

        expect(publisher.changes).toEqual([change]);
    });

    it('reopens the stream after an error with an exponential backoff (D-17a)', () => {
        latestStream().emit('error', serverError(43));
        jest.advanceTimersByTime(999);
        expect(watch).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1);
        expect(watch).toHaveBeenCalledTimes(2);

        latestStream().emit('error', serverError(43));
        jest.advanceTimersByTime(1999);
        expect(watch).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(1);
        expect(watch).toHaveBeenCalledTimes(3);
    });

    it('reopens the stream after an unexpected close (D-17a)', () => {
        latestStream().emit('close');
        jest.advanceTimersByTime(1000);
        expect(watch).toHaveBeenCalledTimes(2);

        const second = latestStream();
        second.emit('error', serverError(43));
        second.emit('close');
        jest.advanceTimersByTime(30_000);

        expect(watch).toHaveBeenCalledTimes(3);
    });

    it('closes the stream it abandons before reopening (D-17a)', () => {
        const first = latestStream();

        first.emit('error', serverError(43));

        expect(first.close).toHaveBeenCalledTimes(1);
    });

    it('resumes after the last seen change (D-17a)', () => {
        latestStream().emit('change', { _id: { _data: 'tok-1' } });
        latestStream().emit('error', serverError(43));
        jest.advanceTimersByTime(1000);

        expect(watch.mock.calls[1]).toEqual([
            PROBE_SPEC.pipeline,
            { ...PROBE_SPEC.options, startAfter: { _data: 'tok-1' } },
        ]);
    });

    it('restarts without a token when the history is lost (D-17a)', () => {
        latestStream().emit('change', { _id: { _data: 'tok-1' } });
        latestStream().emit('error', serverError(HISTORY_LOST_CODE));
        jest.advanceTimersByTime(1000);

        expect(watch.mock.calls[1]).toEqual([
            PROBE_SPEC.pipeline,
            PROBE_SPEC.options,
        ]);
        expect(warnLog.mock.calls).toEqual([
            [
                'Storia del change stream delle sonde persa: riapertura senza ripresa',
            ],
        ]);
    });

    it('resets the backoff after the first change following a reopen (D-17a)', () => {
        latestStream().emit('error', serverError(43));
        jest.advanceTimersByTime(1000);
        latestStream().emit('change', { _id: { _data: 'tok-2' } });

        latestStream().emit('error', serverError(43));
        jest.advanceTimersByTime(999);
        expect(watch).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(1);

        expect(watch).toHaveBeenCalledTimes(3);
    });

    it('never reopens while the application is closing (D-17a)', async () => {
        const first = latestStream();

        await publisher.onModuleDestroy();
        first.emit('close');
        first.emit('error', serverError(43));
        jest.advanceTimersByTime(60_000);

        expect(watch).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
        expect(publisher.changes).toEqual([]);
    });

    it('cancels a pending reopen when the application closes (D-17a)', async () => {
        latestStream().emit('error', serverError(43));
        expect(jest.getTimerCount()).toBe(1);

        await publisher.onModuleDestroy();
        jest.advanceTimersByTime(60_000);

        expect(jest.getTimerCount()).toBe(0);
        expect(watch).toHaveBeenCalledTimes(1);
    });

    it('logs only the subject, the attempt and the error description (D-17a)', () => {
        const error = serverError(43);

        latestStream().emit('error', error);
        jest.advanceTimersByTime(1000);
        latestStream().emit('close');

        expect(errorLog.mock.calls).toEqual([
            [
                `Change stream delle sonde chiuso (${describeError(error)}): riapertura n. 1 fra 1000 ms`,
            ],
            [
                'Change stream delle sonde chiuso (chiusura inattesa): riapertura n. 2 fra 2000 ms',
            ],
        ]);
    });
});
