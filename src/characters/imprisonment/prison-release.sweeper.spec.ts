import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterDocument } from 'src/models/character/character.model';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { PrisonReleaseService } from './prison-release.service';
import { PrisonReleaseSweeper } from './prison-release.sweeper';

const NOW = new Date('2026-11-10T20:00:00.000Z');
const EVERY_MINUTE_MS = 60_000;

interface DuePrisoner {
    _id: Types.ObjectId;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const flushMicrotasks = async () => {
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

const prisoner = (): DuePrisoner => ({ _id: new Types.ObjectId() });

describe('PrisonReleaseSweeper', () => {
    let find: jest.Mock;
    let release: jest.Mock;
    let due: Promise<DuePrisoner[]>;

    function sweeperWith(sweepIntervalMs: number): PrisonReleaseSweeper {
        return new PrisonReleaseSweeper(
            { sweepIntervalMs },
            { find } as unknown as Model<CharacterDocument>,
            { release } as unknown as PrisonReleaseService,
            new FixedClock(NOW),
        );
    }

    beforeEach(() => {
        jest.useFakeTimers();
        due = Promise.resolve([]);
        find = jest.fn(() => ({ lean: () => ({ exec: () => due }) }));
        release = jest.fn().mockResolvedValue('released');
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('reconciles once at boot without waiting and starts no timer when the interval is 0 (quick 261110-prp)', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(0);
        const sweep = jest
            .spyOn(sweeper, 'sweep')
            .mockReturnValue(new Promise(() => undefined));

        expect(sweeper.onApplicationBootstrap()).toBeUndefined();

        expect(sweep).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('sweeps periodically until the module is destroyed (quick 261110-prp)', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(EVERY_MINUTE_MS);
        const sweep = jest.spyOn(sweeper, 'sweep').mockResolvedValue(0);

        sweeper.onApplicationBootstrap();
        expect(setIntervalSpy).toHaveBeenCalledWith(
            expect.any(Function),
            EVERY_MINUTE_MS,
        );
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(sweep).toHaveBeenCalledTimes(3);

        void sweeper.onModuleDestroy();
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(sweep).toHaveBeenCalledTimes(3);
    });

    it('runs a single sweep at a time (quick 261110-prp)', () => {
        due = new Promise(() => undefined);
        const sweeper = sweeperWith(0);

        const first = sweeper.sweep();
        const second = sweeper.sweep();

        expect(second).toBe(first);
        expect(find).toHaveBeenCalledTimes(1);
    });

    it('reads only the active characters whose release is due (quick 261110-prp)', async () => {
        await sweeperWith(0).sweep();

        expect(find).toHaveBeenCalledWith(
            { deletedAt: null, 'status.imprisonedUntil': { $lte: NOW } },
            { _id: 1 },
        );
    });

    it('releases the due prisoners in series and counts only the claimed ones (quick 261110-prp)', async () => {
        const first = prisoner();
        const second = prisoner();
        due = Promise.resolve([first, second]);
        release
            .mockResolvedValueOnce('released')
            .mockResolvedValueOnce('stale');
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(1);

        expect(release.mock.calls).toEqual([[first._id], [second._id]]);
        expect(log.mock.calls.map(([value]) => String(value))).toEqual([
            'Sweep delle prigioni: 1 personaggi liberati',
        ]);
    });

    it('stays silent when nobody is released (quick 261110-prp)', async () => {
        due = Promise.resolve([prisoner()]);
        release.mockResolvedValue('stale');
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(0);

        expect(log).not.toHaveBeenCalled();
    });

    it('keeps sweeping after a failure and logs only the id and the error code (quick 261110-prp)', async () => {
        const failing = prisoner();
        const next = prisoner();
        due = Promise.resolve([failing, next]);
        release.mockRejectedValueOnce(
            Object.assign(new Error('raw driver message'), { code: 112 }),
        );
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(1);

        expect(release).toHaveBeenCalledTimes(2);
        const messages = error.mock.calls.map(([value]) => String(value));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(failing._id.toHexString());
        expect(messages[0]).toContain('code 112');
        expect(messages[0]).not.toContain('raw driver message');
    });

    it('waits for the sweep in flight before the module is destroyed (quick 261110-prp)', async () => {
        const pending = deferred<DuePrisoner[]>();
        due = pending.promise;
        const sweeper = sweeperWith(0);
        const sweep = sweeper.sweep();
        let destroyed = false;

        const destroy = sweeper.onModuleDestroy().then(() => {
            destroyed = true;
        });
        await flushMicrotasks();
        expect(destroyed).toBe(false);

        pending.resolve([]);
        await destroy;

        await expect(sweep).resolves.toBe(0);
    });

    it('releases nobody once the shutdown has begun (quick 261110-prp)', async () => {
        const pending = deferred<DuePrisoner[]>();
        due = pending.promise;
        const sweeper = sweeperWith(0);
        const sweep = sweeper.sweep();

        const destroy = sweeper.onModuleDestroy();
        pending.resolve([prisoner()]);
        await destroy;

        await expect(sweep).resolves.toBe(0);
        expect(release).not.toHaveBeenCalled();
    });
});
