export const UNMIGRATED_QUEST_FILTER = {
    'infos.enemies': { $exists: false },
} as const;

export const UNMIGRATED_RESULT_FILTER = {
    enemies: { $exists: false },
} as const;

// nemico nullo o assente → lista vuota, altrimenti una voce da 1; il vecchio campo se ne va (D-01, D-28)
export function enemiesPipeline(
    listPath: string,
    legacyPath: string,
): Record<string, unknown>[] {
    const legacy = `$${legacyPath}`;
    return [
        {
            $set: {
                [listPath]: {
                    $cond: [
                        { $eq: [{ $ifNull: [legacy, null] }, null] },
                        [],
                        [{ enemy: legacy, quantity: 1 }],
                    ],
                },
            },
        },
        { $unset: legacyPath },
    ];
}
