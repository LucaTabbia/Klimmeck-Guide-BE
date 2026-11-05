import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ResolutionLoader } from './resolution-loader.service';

type ReadEnemies = {
    readEnemies(quest: unknown): Promise<unknown[]>;
};

describe('ResolutionLoader enemy read', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('projects the enemies on the fields of the combat snapshot (D-10)', async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        const find = jest.fn(() => ({
            lean: () => ({ exec: () => Promise.resolve([]) }),
        }));
        const loader = new ResolutionLoader(
            null as never,
            null as never,
            null as never,
            null as never,
            { find } as never,
            null as never,
            null as never,
            null as never,
            null as never,
        );
        const enemy = new Types.ObjectId();

        await (loader as unknown as ReadEnemies).readEnemies({
            _id: new Types.ObjectId(),
            infos: { enemies: [{ enemy, quantity: 2 }] },
        });

        expect(find).toHaveBeenCalledWith(
            { _id: { $in: [enemy] } },
            {
                name: 1,
                lifePoints: 1,
                xp: 1,
                damages: 1,
                baseWeaknesses: 1,
                energyWeaknesses: 1,
            },
        );
    });
});
