import { Types } from 'mongoose';
import {
    inconsistentFilter,
    outOfRangeFilter,
    spellStatesConsistentExpr,
    spellStatesRepairPipeline,
    spellStatesTrimPipeline,
    unmigratedFilter,
} from './spell-state.migration';

describe('spell state migration pipeline', () => {
    const a = new Types.ObjectId();
    const catalog = [{ id: a, maxUsages: 3 }];

    const known = {
        $filter: {
            input: {
                $map: {
                    input: { $ifNull: ['$status.spells', []] },
                    in: {
                        $convert: {
                            input: '$$this',
                            to: 'objectId',
                            onError: null,
                            onNull: null,
                        },
                    },
                },
            },
            cond: { $ne: ['$$this', null] },
        },
    };
    const catalogMaxOf = (ref: string) => ({
        $ifNull: [
            {
                $let: {
                    vars: {
                        d: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: { $literal: catalog },
                                        cond: {
                                            $eq: [
                                                { $toString: '$$this.id' },
                                                { $toString: ref },
                                            ],
                                        },
                                    },
                                },
                                0,
                            ],
                        },
                    },
                    in: '$$d.maxUsages',
                },
            },
            null,
        ],
    });
    const recoveries = { $ifNull: ['$$state.recoveries', []] };

    it('repairs states then mirror in two $set stages', () => {
        const pipeline = spellStatesRepairPipeline(catalog);

        expect(pipeline).toHaveLength(2);
        expect(Object.keys(pipeline[0].$set as object)).toEqual([
            'status.spellStates',
        ]);
        expect(Object.keys(pipeline[1].$set as object)).toEqual([
            'assets.activeSpells',
        ]);
    });

    it('embeds the catalog as a literal with ObjectId ids', () => {
        const json = JSON.stringify(spellStatesRepairPipeline(catalog));

        expect(json).toContain('"$literal"');
        expect(json).toContain(`{"id":"${a.toHexString()}","maxUsages":3}`);
    });

    it('builds one state per known spell, keeping the stored entry or deriving it from mirror and catalog', () => {
        expect(spellStatesRepairPipeline(catalog)[0]).toEqual({
            $set: {
                'status.spellStates': {
                    $map: {
                        input: known,
                        as: 'k',
                        in: {
                            $ifNull: [
                                {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: {
                                                    $ifNull: [
                                                        '$status.spellStates',
                                                        [],
                                                    ],
                                                },
                                                cond: {
                                                    $eq: [
                                                        '$$this.spell',
                                                        '$$k',
                                                    ],
                                                },
                                            },
                                        },
                                        0,
                                    ],
                                },
                                {
                                    spell: '$$k',
                                    usages: {
                                        $ifNull: [
                                            {
                                                $let: {
                                                    vars: {
                                                        d: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: {
                                                                            $ifNull:
                                                                                [
                                                                                    '$assets.activeSpells',
                                                                                    [],
                                                                                ],
                                                                        },
                                                                        cond: {
                                                                            $eq: [
                                                                                {
                                                                                    $toString:
                                                                                        '$$this.spell',
                                                                                },
                                                                                {
                                                                                    $toString:
                                                                                        '$$k',
                                                                                },
                                                                            ],
                                                                        },
                                                                    },
                                                                },
                                                                0,
                                                            ],
                                                        },
                                                    },
                                                    in: '$$d.usages',
                                                },
                                            },
                                            {
                                                $ifNull: [
                                                    {
                                                        $let: {
                                                            vars: {
                                                                d: {
                                                                    $arrayElemAt:
                                                                        [
                                                                            {
                                                                                $filter:
                                                                                    {
                                                                                        input: {
                                                                                            $literal:
                                                                                                catalog,
                                                                                        },
                                                                                        cond: {
                                                                                            $eq: [
                                                                                                '$$this.id',
                                                                                                '$$k',
                                                                                            ],
                                                                                        },
                                                                                    },
                                                                            },
                                                                            0,
                                                                        ],
                                                                },
                                                            },
                                                            in: '$$d.maxUsages',
                                                        },
                                                    },
                                                    0,
                                                ],
                                            },
                                        ],
                                    },
                                    recoveries: [],
                                },
                            ],
                        },
                    },
                },
            },
        });
    });

    it('guarantees the mirror array and copies the usages from the state', () => {
        expect(spellStatesRepairPipeline(catalog)[1]).toEqual({
            $set: {
                'assets.activeSpells': {
                    $map: {
                        input: { $ifNull: ['$assets.activeSpells', []] },
                        as: 'a',
                        in: {
                            spell: '$$a.spell',
                            usages: {
                                $ifNull: [
                                    {
                                        $let: {
                                            vars: {
                                                d: {
                                                    $arrayElemAt: [
                                                        {
                                                            $filter: {
                                                                input: '$status.spellStates',
                                                                cond: {
                                                                    $eq: [
                                                                        {
                                                                            $toString:
                                                                                '$$this.spell',
                                                                        },
                                                                        {
                                                                            $toString:
                                                                                '$$a.spell',
                                                                        },
                                                                    ],
                                                                },
                                                            },
                                                        },
                                                        0,
                                                    ],
                                                },
                                            },
                                            in: '$$d.usages',
                                        },
                                    },
                                    '$$a.usages',
                                ],
                            },
                        },
                    },
                },
            },
        });
    });

    it('trims only the instants a credit can no longer consume, keeping the most recent ones', () => {
        expect(spellStatesTrimPipeline(catalog)).toEqual([
            {
                $set: {
                    'status.spellStates': {
                        $map: {
                            input: { $ifNull: ['$status.spellStates', []] },
                            as: 'state',
                            in: {
                                $let: {
                                    vars: {
                                        max: catalogMaxOf('$$state.spell'),
                                    },
                                    in: {
                                        $cond: [
                                            { $eq: ['$$max', null] },
                                            '$$state',
                                            {
                                                spell: '$$state.spell',
                                                usages: '$$state.usages',
                                                recoveries: {
                                                    $cond: [
                                                        {
                                                            $gte: [
                                                                '$$state.usages',
                                                                '$$max',
                                                            ],
                                                        },
                                                        [],
                                                        {
                                                            $cond: [
                                                                {
                                                                    $gt: [
                                                                        {
                                                                            $size: recoveries,
                                                                        },
                                                                        {
                                                                            $subtract:
                                                                                [
                                                                                    '$$max',
                                                                                    '$$state.usages',
                                                                                ],
                                                                        },
                                                                    ],
                                                                },
                                                                {
                                                                    $slice: [
                                                                        recoveries,
                                                                        {
                                                                            $multiply:
                                                                                [
                                                                                    -1,
                                                                                    {
                                                                                        $subtract:
                                                                                            [
                                                                                                '$$max',
                                                                                                '$$state.usages',
                                                                                            ],
                                                                                    },
                                                                                ],
                                                                        },
                                                                    ],
                                                                },
                                                                recoveries,
                                                            ],
                                                        },
                                                    ],
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        ]);
    });

    it('selects the active characters never migrated', () => {
        expect(unmigratedFilter()).toEqual({
            deletedAt: null,
            'status.spellStates': { $exists: false },
        });
    });

    it('selects the active characters that break the invariant', () => {
        expect(inconsistentFilter()).toEqual({
            deletedAt: null,
            $expr: { $not: [spellStatesConsistentExpr()] },
        });
    });

    it('checks known spells, both arrays and the mirror usages', () => {
        expect(spellStatesConsistentExpr()).toEqual({
            $and: [
                {
                    $eq: [
                        {
                            $map: {
                                input: { $ifNull: ['$status.spellStates', []] },
                                in: '$$this.spell',
                            },
                        },
                        known,
                    ],
                },
                { $eq: [{ $type: '$assets.activeSpells' }, 'array'] },
                { $eq: [{ $type: '$status.spellStates' }, 'array'] },
                {
                    $allElementsTrue: [
                        {
                            $map: {
                                input: {
                                    $ifNull: ['$assets.activeSpells', []],
                                },
                                as: 'a',
                                in: {
                                    $eq: [
                                        '$$a.usages',
                                        {
                                            $let: {
                                                vars: {
                                                    d: {
                                                        $arrayElemAt: [
                                                            {
                                                                $filter: {
                                                                    input: {
                                                                        $ifNull:
                                                                            [
                                                                                '$status.spellStates',
                                                                                [],
                                                                            ],
                                                                    },
                                                                    cond: {
                                                                        $eq: [
                                                                            {
                                                                                $toString:
                                                                                    '$$this.spell',
                                                                            },
                                                                            {
                                                                                $toString:
                                                                                    '$$a.spell',
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            },
                                                            0,
                                                        ],
                                                    },
                                                },
                                                in: '$$d.usages',
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            ],
        });
    });

    it('flags states over the catalog maximum or with more instants than missing usages', () => {
        expect(outOfRangeFilter(catalog)).toEqual({
            deletedAt: null,
            $expr: {
                $anyElementTrue: [
                    {
                        $map: {
                            input: { $ifNull: ['$status.spellStates', []] },
                            as: 'state',
                            in: {
                                $let: {
                                    vars: {
                                        max: catalogMaxOf('$$state.spell'),
                                    },
                                    in: {
                                        $and: [
                                            { $ne: ['$$max', null] },
                                            {
                                                $or: [
                                                    {
                                                        $gt: [
                                                            '$$state.usages',
                                                            '$$max',
                                                        ],
                                                    },
                                                    {
                                                        $gt: [
                                                            {
                                                                $size: recoveries,
                                                            },
                                                            {
                                                                $subtract: [
                                                                    '$$max',
                                                                    '$$state.usages',
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                ],
            },
        });
    });
});
