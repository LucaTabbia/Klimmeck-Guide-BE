import { LEVEL_BANDS, xpBandOf } from 'src/travel/ambush/level-bands';

const XP_BANDS_BY_LEVEL: ReadonlyArray<[number, number]> = [
    [4, 7],
    [7, 14],
    [11, 21],
    [18, 35],
    [35, 70],
    [42, 85],
    [49, 106],
    [63, 127],
    [77, 155],
    [85, 169],
    [113, 225],
    [141, 282],
    [155, 310],
    [176, 352],
    [197, 394],
    [225, 451],
    [282, 549],
    [296, 592],
    [338, 690],
    [394, 803],
];

const bandOfRow = (level: number) => {
    const [min, max] = XP_BANDS_BY_LEVEL[level - 1];
    return { min, max };
};

describe('level bands', () => {
    it('keeps twenty world building rows of easy and medium experience (D-08)', () => {
        expect(LEVEL_BANDS.length).toBe(20);
        expect(LEVEL_BANDS.map((row) => row.level)).toEqual(
            Array.from({ length: 20 }, (_, index) => index + 1),
        );
        expect(LEVEL_BANDS[0]).toEqual({ level: 1, easyPe: 25, mediumPe: 50 });
        expect(LEVEL_BANDS[19]).toEqual({
            level: 20,
            easyPe: 2800,
            mediumPe: 5700,
        });
    });

    it('scales the easy to medium band to enemy xp (D-08)', () => {
        expect([1, 3, 5, 8, 10, 13, 16, 20].map(xpBandOf)).toEqual([
            { min: 4, max: 7 },
            { min: 11, max: 21 },
            { min: 35, max: 70 },
            { min: 63, max: 127 },
            { min: 85, max: 169 },
            { min: 155, max: 310 },
            { min: 225, max: 451 },
            { min: 394, max: 803 },
        ]);
        expect(LEVEL_BANDS.map((row) => xpBandOf(row.level))).toEqual(
            LEVEL_BANDS.map((row) => bandOfRow(row.level)),
        );
    });

    it('clamps an out of table level to the nearest row (D-08)', () => {
        expect(xpBandOf(0)).toEqual(bandOfRow(1));
        expect(xpBandOf(-3)).toEqual(bandOfRow(1));
        expect(xpBandOf(25)).toEqual(bandOfRow(20));
        expect(xpBandOf(4.7)).toEqual(bandOfRow(4));
        expect(xpBandOf(Number.NaN)).toEqual(bandOfRow(1));
    });
});
