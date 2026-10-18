import {
    coinsDeltaStages,
    hasAtLeastCopper,
    TOTAL_COPPER_EXPRESSION,
} from 'src/economy/coins.expressions';

describe('coins expressions', () => {
    it('computes the total copper with missing denominations as zero', () => {
        expect(TOTAL_COPPER_EXPRESSION).toEqual({
            $add: [
                { $multiply: [{ $ifNull: ['$status.coins.gold', 0] }, 10000] },
                { $multiply: [{ $ifNull: ['$status.coins.silver', 0] }, 100] },
                { $ifNull: ['$status.coins.copper', 0] },
            ],
        });
    });

    it('filters on a minimum total copper', () => {
        expect(hasAtLeastCopper(150)).toEqual({
            $expr: { $gte: [TOTAL_COPPER_EXPRESSION, 150] },
        });
    });

    it('rewrites the purse from the shifted total copper', () => {
        const total = { $add: [TOTAL_COPPER_EXPRESSION, -150] };

        expect(coinsDeltaStages(-150)).toEqual([
            {
                $set: {
                    'status.coins': {
                        gold: {
                            $toInt: { $floor: { $divide: [total, 10000] } },
                        },
                        silver: {
                            $toInt: {
                                $floor: {
                                    $divide: [{ $mod: [total, 10000] }, 100],
                                },
                            },
                        },
                        copper: { $toInt: { $mod: [total, 100] } },
                    },
                },
            },
        ]);
    });

    it('casts every denomination to int', () => {
        expect(
            JSON.stringify(coinsDeltaStages(1)).match(/\$toInt/g),
        ).toHaveLength(3);
    });

    it('accepts only safe integer deltas', () => {
        expect(() => coinsDeltaStages(1.5)).toThrow(RangeError);
    });
});
