import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CitySize } from 'src/models/enums/city-size.enum';
import { SHOP_REPORT_WARNINGS_LIMIT } from '../shop-pool.constants';
import { ShopPoolViolation } from '../shop-pool.report';
import { ShopPoolReport } from '../shop-pool-report.service';
import { ShopBoot } from './shop-boot';

function violation(index: number): ShopPoolViolation {
    return {
        cityId: new Types.ObjectId().toHexString(),
        cityName: `Città ${index}`,
        size: CitySize.village,
        emptyPool: true,
        outOfSize: [],
        vetoed: [],
        missing: [],
    };
}

describe('ShopBoot', () => {
    let report: ShopPoolReport;
    let failing: boolean;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    function boot(): ShopBoot {
        return new ShopBoot({
            report: jest.fn(() =>
                failing
                    ? Promise.reject(
                          Object.assign(
                              new Error('mongodb://user:secret@host'),
                              { name: 'MongoServerError', code: 11000 },
                          ),
                      )
                    : Promise.resolve(report),
            ),
        } as never);
    }

    beforeEach(() => {
        failing = false;
        report = { entries: [], unseeded: 0 };
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('runs only the pool report and stays silent on pools within the rules (D-06, D-25)', async () => {
        await boot().onApplicationBootstrap();

        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('keeps booting when the report fails and logs the error code only (D-24)', async () => {
        failing = true;

        await boot().onApplicationBootstrap();

        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy.mock.calls).toEqual([
            [
                'Negozi: report dei pool fallito (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
    });

    it('warns once per violating city up to the limit and once with the summary (D-06)', async () => {
        report = {
            entries: Array.from({ length: 60 }, (_, index) => violation(index)),
            unseeded: 3,
        };

        await boot().onApplicationBootstrap();

        expect(warnSpy).toHaveBeenCalledTimes(SHOP_REPORT_WARNINGS_LIMIT + 1);
        expect(warnSpy.mock.calls[0][0]).toContain('Negozio di Città 0');
        expect(warnSpy.mock.calls[SHOP_REPORT_WARNINGS_LIMIT][0]).toEqual(
            'Negozi: 60 città con pool fuori regola, 3 non seminate',
        );
    });
});
