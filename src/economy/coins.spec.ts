import {
    add,
    compare,
    fromCopper,
    normalize,
    subtract,
    toCopper,
} from 'src/economy/coins';

describe('coins', () => {
    describe('toCopper', () => {
        it('weighs every denomination', () => {
            expect(toCopper({ gold: 1, silver: 2, copper: 3 })).toBe(10203);
        });

        it.each([
            ['null', null],
            ['undefined', undefined],
        ])('treats %s coins as zero', (_name, coins) => {
            expect(toCopper(coins)).toBe(0);
        });

        it('accepts a purse that is not normalized', () => {
            expect(toCopper({ gold: 0, silver: 0, copper: 150 })).toBe(150);
        });
    });

    describe('fromCopper', () => {
        it('splits copper into denominations', () => {
            expect(fromCopper(10203)).toEqual({
                gold: 1,
                silver: 2,
                copper: 3,
            });
        });

        it('returns an empty purse for zero', () => {
            expect(fromCopper(0)).toEqual({ gold: 0, silver: 0, copper: 0 });
        });

        it.each([-1, 1.5])('rejects %p', (copper) => {
            expect(() => fromCopper(copper)).toThrow(RangeError);
        });
    });

    describe('normalize', () => {
        it.each([
            [
                { gold: 0, silver: 0, copper: 150 },
                { gold: 0, silver: 1, copper: 50 },
            ],
            [
                { gold: 0, silver: 150, copper: 0 },
                { gold: 1, silver: 50, copper: 0 },
            ],
            [
                { gold: 1, silver: -1, copper: 0 },
                { gold: 0, silver: 99, copper: 0 },
            ],
        ])('normalizes %o into %o', (coins, expected) => {
            expect(normalize(coins)).toEqual(expected);
        });
    });

    describe('add', () => {
        it('carries copper and silver over', () => {
            expect(
                add(
                    { gold: 0, silver: 99, copper: 99 },
                    { gold: 0, silver: 0, copper: 1 },
                ),
            ).toEqual({ gold: 1, silver: 0, copper: 0 });
        });
    });

    describe('subtract', () => {
        it('borrows from the higher denomination', () => {
            expect(
                subtract(
                    { gold: 0, silver: 1, copper: 0 },
                    { gold: 0, silver: 0, copper: 1 },
                ),
            ).toEqual({ gold: 0, silver: 0, copper: 99 });
        });

        it('never goes negative', () => {
            expect(() =>
                subtract(
                    { gold: 0, silver: 0, copper: 1 },
                    { gold: 0, silver: 0, copper: 2 },
                ),
            ).toThrow(RangeError);
        });
    });

    describe('compare', () => {
        it.each([
            [
                { gold: 1, silver: 0, copper: 0 },
                { gold: 0, silver: 100, copper: 0 },
                0,
            ],
            [
                { gold: 0, silver: 0, copper: 1 },
                { gold: 0, silver: 0, copper: 2 },
                -1,
            ],
            [
                { gold: 0, silver: 1, copper: 0 },
                { gold: 0, silver: 0, copper: 99 },
                1,
            ],
        ])('compare(%o, %o) is %i', (a, b, expected) => {
            expect(compare(a, b)).toBe(expected);
        });
    });
});
