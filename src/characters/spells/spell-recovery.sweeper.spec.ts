import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterDocument } from 'src/models/character/character.model';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { SpellRecoveryService } from './spell-recovery.service';
import { SpellRecoverySweeper } from './spell-recovery.sweeper';

const NOW = new Date('2026-10-27T10:00:00.000Z');
const EVERY_MINUTE_MS = 60_000;
const before = (ms: number) => new Date(NOW.getTime() - ms);
const after = (ms: number) => new Date(NOW.getTime() + ms);

interface DueCharacter {
    _id: Types.ObjectId;
    status: {
        spellStates?: { spell: Types.ObjectId; recoveries?: Date[] }[];
    };
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

function characterWith(
    ...states: { spell: Types.ObjectId; recoveries?: Date[] }[]
): DueCharacter {
    return { _id: new Types.ObjectId(), status: { spellStates: states } };
}

describe('SpellRecoverySweeper', () => {
    let find: jest.Mock;
    let recoverDue: jest.Mock;
    let due: Promise<DueCharacter[]>;

    function sweeperWith(sweepIntervalMs: number): SpellRecoverySweeper {
        return new SpellRecoverySweeper(
            { sweepIntervalMs },
            { find } as unknown as Model<CharacterDocument>,
            { recoverDue } as unknown as SpellRecoveryService,
            new FixedClock(NOW),
        );
    }

    beforeEach(() => {
        jest.useFakeTimers();
        due = Promise.resolve([]);
        find = jest.fn(() => ({ lean: () => ({ exec: () => due }) }));
        recoverDue = jest.fn().mockResolvedValue(1);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('reconciles once at boot without waiting and starts no timer when the interval is 0', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(0);
        const sweep = jest
            .spyOn(sweeper, 'sweep')
            .mockReturnValue(new Promise(() => undefined));

        expect(sweeper.onApplicationBootstrap()).toBeUndefined();

        expect(sweep).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('sweeps periodically with an unref timer until the module is destroyed', () => {
        const unref = jest.fn();
        const realSetInterval = global.setInterval;
        const setIntervalSpy = jest
            .spyOn(global, 'setInterval')
            .mockImplementation(((handler: () => void, timeout: number) => {
                const timer = realSetInterval(handler, timeout);
                const original = timer.unref.bind(timer);
                unref.mockImplementation(() => original());
                timer.unref = unref;
                return timer;
            }) as typeof setInterval);
        const sweeper = sweeperWith(EVERY_MINUTE_MS);
        const sweep = jest.spyOn(sweeper, 'sweep').mockResolvedValue(0);

        sweeper.onApplicationBootstrap();
        expect(setIntervalSpy).toHaveBeenCalledWith(
            expect.any(Function),
            EVERY_MINUTE_MS,
        );
        expect(unref).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(sweep).toHaveBeenCalledTimes(3);

        void sweeper.onModuleDestroy();
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(sweep).toHaveBeenCalledTimes(3);
    });

    it('runs a single sweep at a time', () => {
        due = new Promise(() => undefined);
        const sweeper = sweeperWith(0);

        const first = sweeper.sweep();
        const second = sweeper.sweep();

        expect(second).toBe(first);
        expect(find).toHaveBeenCalledTimes(1);
    });

    it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: reads every active character with a due instant, slots ignored', async () => {
        await sweeperWith(0).sweep();

        expect(find).toHaveBeenCalledWith(
            {
                deletedAt: null,
                'status.spellStates.recoveries': { $lte: NOW },
            },
            { 'status.spellStates': 1 },
        );
    });

    it('credits only the entries whose oldest instant is due, in series', async () => {
        const dueSpell = new Types.ObjectId();
        const futureSpell = new Types.ObjectId();
        const idleSpell = new Types.ObjectId();
        const otherSpell = new Types.ObjectId();
        const first = characterWith(
            { spell: dueSpell, recoveries: [before(1000), after(1000)] },
            { spell: futureSpell, recoveries: [after(1000)] },
            { spell: idleSpell, recoveries: [] },
            { spell: idleSpell },
        );
        const second = characterWith({ spell: otherSpell, recoveries: [NOW] });
        due = Promise.resolve([first, second, { ...second, status: {} }]);
        recoverDue.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(3);

        expect(recoverDue.mock.calls).toEqual([
            [first._id, dueSpell],
            [second._id, otherSpell],
        ]);
        expect(log.mock.calls.map(([value]) => String(value))).toEqual([
            'Sweep dei recuperi delle magie: 3 usi restituiti',
        ]);
    });

    it('stays silent when nothing is given back', async () => {
        due = Promise.resolve([
            characterWith({ spell: new Types.ObjectId(), recoveries: [NOW] }),
        ]);
        recoverDue.mockResolvedValue(0);
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(0);

        expect(log).not.toHaveBeenCalled();
    });

    it('keeps sweeping after a failure and logs only the ids and the error code', async () => {
        const failing = characterWith({
            spell: new Types.ObjectId(),
            recoveries: [before(1000)],
        });
        const next = characterWith({
            spell: new Types.ObjectId(),
            recoveries: [before(1000)],
        });
        due = Promise.resolve([failing, next]);
        recoverDue.mockRejectedValueOnce(
            Object.assign(new Error('raw driver message'), { code: 112 }),
        );
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(1);

        expect(recoverDue).toHaveBeenCalledTimes(2);
        const messages = error.mock.calls.map(([value]) => String(value));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(failing._id.toHexString());
        expect(messages[0]).toContain(
            failing.status.spellStates![0].spell.toHexString(),
        );
        expect(messages[0]).toContain('code 112');
        expect(messages[0]).not.toContain('raw driver message');
    });

    it('waits for the sweep in flight before the module is destroyed', async () => {
        const pending = deferred<DueCharacter[]>();
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

    it('shuts down cleanly when the sweep in flight fails', async () => {
        const pending = deferred<DueCharacter[]>();
        due = pending.promise;
        const sweeper = sweeperWith(0);
        const sweep = sweeper.sweep();
        sweep.catch(() => undefined);

        const destroy = sweeper.onModuleDestroy();
        pending.reject(new Error('connection closed'));

        await expect(destroy).resolves.toBeUndefined();
    });

    it('gives back no further usage once the shutdown has begun', async () => {
        due = Promise.resolve([
            characterWith(
                { spell: new Types.ObjectId(), recoveries: [before(1000)] },
                { spell: new Types.ObjectId(), recoveries: [before(1000)] },
            ),
            characterWith({
                spell: new Types.ObjectId(),
                recoveries: [before(1000)],
            }),
        ]);
        const first = deferred<number>();
        recoverDue.mockReturnValueOnce(first.promise);
        jest.spyOn(Logger.prototype, 'log').mockImplementation();
        const sweeper = sweeperWith(0);
        const sweep = sweeper.sweep();
        await flushMicrotasks();
        expect(recoverDue).toHaveBeenCalledTimes(1);

        const destroy = sweeper.onModuleDestroy();
        first.resolve(1);
        await destroy;

        expect(recoverDue).toHaveBeenCalledTimes(1);
        await expect(sweep).resolves.toBe(1);
    });
});
