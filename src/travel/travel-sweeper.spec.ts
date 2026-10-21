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
});
