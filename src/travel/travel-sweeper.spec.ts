import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterDocument } from 'src/models/character/character.model';
import { TravelCompletionService } from './travel-completion.service';
import { TravelSweeper } from './travel-sweeper';
import { FixedClock } from '../../test/auth/fixed-clock';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const START = new Date('2026-10-21T08:00:00.000Z');
const END = new Date('2026-10-21T09:00:00.000Z');

interface DueTravel {
    _id: Types.ObjectId;
    status: { activeTravel: { startTime: Date; endTime: Date } };
}

function dueTravel(): DueTravel {
    return {
        _id: new Types.ObjectId(),
        status: { activeTravel: { startTime: START, endTime: END } },
    };
}

describe('TravelSweeper', () => {
    let find: jest.Mock;
    let complete: jest.Mock;

    function sweeperWith(sweepIntervalMs: number): TravelSweeper {
        const characterModel = { find } as unknown as Model<CharacterDocument>;
        const completion = {
            complete,
        } as unknown as TravelCompletionService;
        return new TravelSweeper(
            { sweepIntervalMs },
            characterModel,
            completion,
            new FixedClock(NOW),
        );
    }

    function findResolving(result: Promise<DueTravel[]>): jest.Mock {
        return jest.fn(() => ({ lean: () => ({ exec: () => result }) }));
    }

    beforeEach(() => {
        jest.useFakeTimers();
        find = findResolving(Promise.resolve([]));
        complete = jest.fn().mockResolvedValue('completed');
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('reconciles once at boot and starts no timer when the interval is 0', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(0);
        const sweep = jest.spyOn(sweeper, 'sweep').mockResolvedValue(0);

        sweeper.onApplicationBootstrap();

        expect(sweep).toHaveBeenCalledTimes(1);
        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('sweeps periodically until the module is destroyed', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(50);
        const sweep = jest.spyOn(sweeper, 'sweep').mockResolvedValue(0);

        sweeper.onApplicationBootstrap();
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 50);
        jest.advanceTimersByTime(100);
        expect(sweep).toHaveBeenCalledTimes(3);

        sweeper.onModuleDestroy();
        jest.advanceTimersByTime(100);
        expect(sweep).toHaveBeenCalledTimes(3);
    });

    it('runs a single sweep at a time', () => {
        find = findResolving(new Promise<DueTravel[]>(() => undefined));
        const sweeper = sweeperWith(0);

        const first = sweeper.sweep();
        const second = sweeper.sweep();

        expect(second).toBe(first);
        expect(find).toHaveBeenCalledTimes(1);
    });

    it('keeps sweeping after a failed completion and logs only id and code', async () => {
        const travels = [dueTravel(), dueTravel(), dueTravel()];
        find = findResolving(Promise.resolve(travels));
        const failure = Object.assign(new Error('raw driver message'), {
            code: 112,
        });
        complete
            .mockResolvedValueOnce('completed')
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce('completed');
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(2);

        expect(complete).toHaveBeenCalledTimes(3);
        expect(complete).toHaveBeenNthCalledWith(2, {
            characterId: travels[1]._id,
            startTime: START,
            endTime: END,
        });
        expect(error).toHaveBeenCalledTimes(1);
        const message = String(error.mock.calls[0][0]);
        expect(message).toContain(travels[1]._id.toHexString());
        expect(message).toContain('112');
        expect(message).not.toContain('raw driver message');
    });

    it.each([
        ['the error name', new TypeError('raw driver message'), 'TypeError'],
        ['unknown for a bare value', 'raw driver message', 'unknown'],
        ['unknown for null', null, 'unknown'],
    ])(
        'logs %s when a completion fails without a code',
        async (_label, failure, expected) => {
            const travel = dueTravel();
            find = findResolving(Promise.resolve([travel]));
            complete.mockRejectedValueOnce(failure);
            const error = jest
                .spyOn(Logger.prototype, 'error')
                .mockImplementation();

            await expect(sweeperWith(0).sweep()).resolves.toBe(0);

            expect(error.mock.calls.map(([value]) => String(value))).toEqual([
                `Completamento del viaggio del personaggio ${travel._id.toHexString()} fallito: ${expected}`,
            ]);
        },
    );

    it('logs only the code when the boot sweep fails to read the due travels', async () => {
        const failure = Object.assign(new Error('raw driver message'), {
            code: 'ECONNRESET',
        });
        find = findResolving(Promise.reject(failure));
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        const sweeper = sweeperWith(0);

        sweeper.onApplicationBootstrap();
        await jest.runAllTimersAsync();

        expect(error.mock.calls.map(([value]) => String(value))).toEqual([
            'Sweep dei viaggi fallito: ECONNRESET',
        ]);
        expect(complete).not.toHaveBeenCalled();
    });

    it('sweeps again on the next tick after a failed sweep', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();
        find = findResolving(Promise.reject(new Error('down')));
        const sweeper = sweeperWith(50);
        sweeper.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);
        const travel = dueTravel();
        find.mockImplementation(() => ({
            lean: () => ({ exec: () => Promise.resolve([travel]) }),
        }));

        await jest.advanceTimersByTimeAsync(50);
        sweeper.onModuleDestroy();

        expect(complete).toHaveBeenCalledWith({
            characterId: travel._id,
            startTime: START,
            endTime: END,
        });
    });

    it('finishes the sweep in flight when the module is destroyed, then stops ticking', async () => {
        let release: (travels: DueTravel[]) => void = () => undefined;
        find = findResolving(
            new Promise<DueTravel[]>((resolve) => {
                release = resolve;
            }),
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation();
        const sweeper = sweeperWith(50);
        sweeper.onApplicationBootstrap();
        const inFlight = sweeper.sweep();

        sweeper.onModuleDestroy();
        release([dueTravel()]);

        await expect(inFlight).resolves.toBe(1);
        await jest.advanceTimersByTimeAsync(200);
        expect(find).toHaveBeenCalledTimes(1);
        expect(complete).toHaveBeenCalledTimes(1);
    });

    it('does not count a stale completion as completed', async () => {
        find = findResolving(Promise.resolve([dueTravel(), dueTravel()]));
        complete
            .mockResolvedValueOnce('stale')
            .mockResolvedValueOnce('completed');
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(1);

        expect(log.mock.calls.map(([value]) => String(value))).toEqual([
            'Sweep dei viaggi: 1 completati',
        ]);
    });
});
