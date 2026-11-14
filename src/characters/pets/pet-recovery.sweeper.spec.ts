import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterDocument } from 'src/models/character/character.model';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { PetRecoveryService } from './pet-recovery.service';
import { PetRecoverySweeper } from './pet-recovery.sweeper';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const EVERY_MINUTE_MS = 60_000;

interface DueCharacter {
    _id: Types.ObjectId;
}

const dueCharacter = (): DueCharacter => ({ _id: new Types.ObjectId() });

describe('PetRecoverySweeper', () => {
    let find: jest.Mock;
    let release: jest.Mock;
    let due: Promise<DueCharacter[]>;

    function sweeperWith(sweepIntervalMs: number): PetRecoverySweeper {
        return new PetRecoverySweeper(
            { sweepIntervalMs },
            { find } as unknown as Model<CharacterDocument>,
            { release } as unknown as PetRecoveryService,
            new FixedClock(NOW),
        );
    }

    beforeEach(() => {
        jest.useFakeTimers();
        due = Promise.resolve([]);
        find = jest.fn(() => ({ lean: () => ({ exec: () => due }) }));
        release = jest.fn().mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('reconciles once at boot and sweeps on the prison interval until destroyed (D-24)', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(EVERY_MINUTE_MS);
        const sweep = jest.spyOn(sweeper, 'sweep').mockResolvedValue(0);

        expect(sweeper.onApplicationBootstrap()).toBeUndefined();
        expect(sweep).toHaveBeenCalledTimes(1);
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

    it('starts no timer when the interval is 0 (D-24)', () => {
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        const sweeper = sweeperWith(0);
        jest.spyOn(sweeper, 'sweep').mockReturnValue(
            new Promise(() => undefined),
        );

        sweeper.onApplicationBootstrap();

        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('sweeps once at a time and sums the claimed companions (D-24)', async () => {
        const first = dueCharacter();
        const second = dueCharacter();
        due = Promise.resolve([first, second]);
        release
            .mockResolvedValueOnce([new Types.ObjectId(), new Types.ObjectId()])
            .mockResolvedValueOnce([new Types.ObjectId()]);
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        const sweeper = sweeperWith(0);

        const sweep = sweeper.sweep();
        expect(sweeper.sweep()).toBe(sweep);
        await expect(sweep).resolves.toBe(3);

        expect(find).toHaveBeenCalledTimes(1);
        expect(find).toHaveBeenCalledWith(
            {
                deletedAt: null,
                'assets.ownedPets.defeatedUntil': { $lte: NOW },
            },
            { _id: 1 },
        );
        expect(release.mock.calls).toEqual([[first._id], [second._id]]);
        expect(log.mock.calls.map(([value]) => String(value))).toEqual([
            'Sweep dei compagni: 3 di nuovo in forze',
        ]);
    });

    it('stays silent when no companion is claimed (D-24)', async () => {
        due = Promise.resolve([dueCharacter()]);
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweeperWith(0).sweep()).resolves.toBe(0);

        expect(log).not.toHaveBeenCalled();
    });

    it('logs a failed release with describeError and goes on (D-24)', async () => {
        const failing = dueCharacter();
        const next = dueCharacter();
        due = Promise.resolve([failing, next]);
        release
            .mockRejectedValueOnce(
                Object.assign(new Error('raw driver message'), { code: 112 }),
            )
            .mockResolvedValueOnce([new Types.ObjectId()]);
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

    it('releases nobody once the shutdown has begun (D-24)', async () => {
        let resolveDue!: (value: DueCharacter[]) => void;
        due = new Promise((resolve) => {
            resolveDue = resolve;
        });
        const sweeper = sweeperWith(0);
        const sweep = sweeper.sweep();

        const destroy = sweeper.onModuleDestroy();
        resolveDue([dueCharacter()]);
        await destroy;

        await expect(sweep).resolves.toBe(0);
        expect(release).not.toHaveBeenCalled();
    });
});
