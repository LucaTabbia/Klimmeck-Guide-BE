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
    let calls: string[];
    let report: ShopPoolReport;
    let failing: string | null;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    function step<T>(name: string, result: T) {
        return jest.fn(() => {
            calls.push(name);
            if (failing === name)
                return Promise.reject(
                    Object.assign(new Error('mongodb://user:secret@host'), {
                        name: 'MongoServerError',
                        code: 11000,
                    }),
                );
            return Promise.resolve(result);
        });
    }

    function reportOnce(): Promise<ShopPoolReport> {
        calls.push('report');
        return Promise.resolve(report);
    }

    function boot(): ShopBoot {
        return new ShopBoot(
            {
                migrate: step('sellable', { sellable: 0, questOnly: 0 }),
            } as never,
            { migrate: step('ownedPets', { owned: 0 }) } as never,
            {
                seedAll: step('seeding', {
                    equipment: 0,
                    loot: 0,
                    pets: 0,
                    deferred: 0,
                }),
            } as never,
            { report: jest.fn(() => reportOnce()) } as never,
        );
    }

    beforeEach(() => {
        calls = [];
        failing = null;
        report = { entries: [], unseeded: 0 };
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('runs sellable, owned pets, seeding and report in this order (D-24)', async () => {
        await boot().onApplicationBootstrap();

        expect(calls).toEqual(['sellable', 'ownedPets', 'seeding', 'report']);
    });

    it('stays silent on a database without shops (D-24)', async () => {
        await boot().onApplicationBootstrap();

        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('keeps booting when a step fails and logs the error code only (D-24)', async () => {
        failing = 'sellable';

        await boot().onApplicationBootstrap();

        expect(calls).toEqual(['sellable', 'ownedPets', 'seeding', 'report']);
        expect(errorSpy.mock.calls).toEqual([
            [
                'Negozi: valorizzazione di Pet.sellable fallita (MongoServerError, code 11000), il boot prosegue',
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
