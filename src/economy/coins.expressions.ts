import type { UpdateWithAggregationPipeline } from 'mongoose';
import { COPPER_PER_GOLD, COPPER_PER_SILVER } from 'src/economy/coins';

export const TOTAL_COPPER_EXPRESSION = {
    $add: [
        {
            $multiply: [
                { $ifNull: ['$status.coins.gold', 0] },
                COPPER_PER_GOLD,
            ],
        },
        {
            $multiply: [
                { $ifNull: ['$status.coins.silver', 0] },
                COPPER_PER_SILVER,
            ],
        },
        { $ifNull: ['$status.coins.copper', 0] },
    ],
};

export function hasAtLeastCopper(amount: number) {
    return { $expr: { $gte: [TOTAL_COPPER_EXPRESSION, amount] } };
}

// cast a int su ogni denominazione: il tipo BSON resta int e un delta zero è un vero no-op (nessun evento del change stream)
export function coinsDeltaStages(
    deltaCopper: number,
): UpdateWithAggregationPipeline {
    if (!Number.isSafeInteger(deltaCopper)) {
        throw new RangeError(`Delta in rame non valido: ${deltaCopper}`);
    }
    const total = { $add: [TOTAL_COPPER_EXPRESSION, deltaCopper] };
    return [
        {
            $set: {
                'status.coins': {
                    gold: {
                        $toInt: {
                            $floor: { $divide: [total, COPPER_PER_GOLD] },
                        },
                    },
                    silver: {
                        $toInt: {
                            $floor: {
                                $divide: [
                                    { $mod: [total, COPPER_PER_GOLD] },
                                    COPPER_PER_SILVER,
                                ],
                            },
                        },
                    },
                    copper: { $toInt: { $mod: [total, COPPER_PER_SILVER] } },
                },
            },
        },
    ];
}
