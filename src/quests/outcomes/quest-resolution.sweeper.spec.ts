import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterDocument } from 'src/models/character/character.model';
import { QuestResolutionService } from './quest-resolution.service';
import { QuestResolutionSweeper } from './quest-resolution.sweeper';
import { RescueResolutionService } from './rescue-resolution.service';
import type { DueStandardQuest } from './scheduling/quest-resolution.updates';
import { FixedClock } from '../../../test/auth/fixed-clock';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const START = new Date('2026-10-24T10:00:00.000Z');
const WAITING_TIME_MS = 60_000;
const EVERY_MINUTE_MS = 60_000;

interface DueAid {
    _id: Types.ObjectId;
    status: { awaitingAid: { aidQuest: Types.ObjectId } };
}

function dueQuest(): DueStandardQuest {
    return {
        _id: new Types.ObjectId(),
        pendingQuestId: new Types.ObjectId(),
        startDate: START,
        waitingTime: WAITING_TIME_MS,
    };
}

function dueAid(): DueAid {
    return {
        _id: new Types.ObjectId(),
        status: { awaitingAid: { aidQuest: new Types.ObjectId() } },
    };
}

describe('QuestResolutionSweeper', () => {
    let aggregate: jest.Mock;
    let find: jest.Mock;
    let resolveStandard: jest.Mock;
    let timeoutAid: jest.Mock;

    function sweeperWith(sweepIntervalMs: number): QuestResolutionSweeper {
        const characterModel = {
            aggregate,
            find,
        } as unknown as Model<CharacterDocument>;
        return new QuestResolutionSweeper(
            { sweepIntervalMs },
            characterModel,
            { resolveStandard } as unknown as QuestResolutionService,
            { timeoutAid } as unknown as RescueResolutionService,
            new FixedClock(NOW),
        );
    }

    function aggregateResolving(result: Promise<DueStandardQuest[]>) {
        return jest.fn(() => ({ exec: () => result }));
    }

    function findResolving(result: Promise<DueAid[]>) {
        return jest.fn(() => ({ lean: () => ({ exec: () => result }) }));
    }

    beforeEach(() => {
        jest.useFakeTimers();
        aggregate = aggregateResolving(Promise.resolve([]));
        find = findResolving(Promise.resolve([]));
        resolveStandard = jest.fn().mockResolvedValue('resolved');
        timeoutAid = jest.fn().mockResolvedValue('resolved');
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
        const sweep = jest
            .spyOn(sweeper, 'sweep')
            .mockResolvedValue({ resolved: 0, timedOut: 0 });

        sweeper.onApplicationBootstrap();
        expect(setIntervalSpy).toHaveBeenCalledWith(
            expect.any(Function),
            EVERY_MINUTE_MS,
        );
        expect(unref).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(sweep).toHaveBeenCalledTimes(3);

        sweeper.onModuleDestroy();
        jest.advanceTimersByTime(2 * EVERY_MINUTE_MS);
        expect(sweep).toHaveBeenCalledTimes(3);
    });

    it('runs a single sweep at a time', () => {
        aggregate = aggregateResolving(
            new Promise<DueStandardQuest[]>(() => undefined),
        );
        const sweeper = sweeperWith(0);

        const first = sweeper.sweep();
        const second = sweeper.sweep();

        expect(second).toBe(first);
        expect(aggregate).toHaveBeenCalledTimes(1);
    });

    it('resolves due quests then times out due rescues, in series', async () => {
        const quests = [dueQuest(), dueQuest()];
        const aids = [dueAid(), dueAid()];
        aggregate = aggregateResolving(Promise.resolve(quests));
        find = findResolving(Promise.resolve(aids));
        resolveStandard
            .mockResolvedValueOnce('resolved')
            .mockResolvedValueOnce('stale');
        timeoutAid
            .mockResolvedValueOnce('waiting')
            .mockResolvedValueOnce('resolved');
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toEqual({
            resolved: 1,
            timedOut: 1,
        });

        expect(resolveStandard.mock.calls).toEqual(
            quests.map((quest) => [
                { pendingQuestId: quest.pendingQuestId, startDate: START },
            ]),
        );
        expect(timeoutAid.mock.calls).toEqual(
            aids.map((aid) => [
                { aidQuestId: aid.status.awaitingAid.aidQuest },
            ]),
        );
    });

    it('keeps sweeping after a failure and logs only the id and the error name', async () => {
        const quests = [dueQuest(), dueQuest(), dueQuest()];
        const aids = [dueAid(), dueAid()];
        aggregate = aggregateResolving(Promise.resolve(quests));
        find = findResolving(Promise.resolve(aids));
        const failure = Object.assign(new Error('raw driver message'), {
            code: 112,
        });
        resolveStandard.mockRejectedValueOnce(failure);
        timeoutAid.mockRejectedValueOnce(failure);
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toEqual({
            resolved: 2,
            timedOut: 1,
        });

        expect(resolveStandard).toHaveBeenCalledTimes(3);
        expect(timeoutAid).toHaveBeenCalledTimes(2);
        const messages = error.mock.calls.map(([value]) => String(value));
        expect(messages).toHaveLength(2);
        expect(messages[0]).toContain(quests[0].pendingQuestId.toHexString());
        expect(messages[1]).toContain(
            aids[0].status.awaitingAid.aidQuest.toHexString(),
        );
        for (const message of messages) {
            expect(message).toContain('code 112');
            expect(message).not.toContain('raw driver message');
        }
    });
});
