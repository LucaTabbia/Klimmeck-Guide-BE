import { Types } from 'mongoose';
import {
    inconsistentFilter,
    isSpellStateOutOfRange,
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
    const recoveries = {
        $cond: [{ $isArray: '$$state.recoveries' }, '$$state.recoveries', []],
    };
    const storedStates = {
        $cond: [{ $isArray: '$status.spellStates' }, '$status.spellStates', []],
    };
    const missingUsages = { $subtract: ['$$max', '$$state.usages'] };
    // usi interi sicuri: tipo numerico (senza decimal), dentro ±2^53−1, senza parte frazionaria
    const usagesAreSafeInteger = {
        $cond: [
            {
                $in: [{ $type: '$$state.usages' }, ['int', 'long', 'double']],
            },
            {
                $and: [
                    {
                        $gte: ['$$state.usages', -Number.MAX_SAFE_INTEGER],
                    },
                    { $lte: ['$$state.usages', Number.MAX_SAFE_INTEGER] },
                    {
                        $eq: ['$$state.usages', { $trunc: '$$state.usages' }],
                    },
                ],
            },
            false,
        ],
    };
    const stateOutOfRange = {
        $cond: [
            { $and: [{ $ne: ['$$max', null] }, usagesAreSafeInteger] },
            {
                $or: [
                    { $gt: ['$$state.usages', '$$max'] },
                    { $gt: [{ $size: recoveries }, missingUsages] },
                ],
            },
            false,
        ],
    };
    const overStates = (inner: unknown) => ({
        $map: {
            input: storedStates,
            as: 'state',
            in: {
                $let: {
                    vars: { max: catalogMaxOf('$$state.spell') },
                    in: inner,
                },
            },
        },
    });

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

    it('trims only the out-of-range entries, keeping the most recent instants and every other entry as stored', () => {
        expect(spellStatesTrimPipeline(catalog)).toEqual([
            {
                $set: {
                    'status.spellStates': overStates({
                        $cond: [
                            stateOutOfRange,
                            {
                                spell: '$$state.spell',
                                usages: '$$state.usages',
                                recoveries: {
                                    $cond: [
                                        { $gte: ['$$state.usages', '$$max'] },
                                        [],
                                        {
                                            $slice: [
                                                recoveries,
                                                {
                                                    $multiply: [
                                                        -1,
                                                        missingUsages,
                                                    ],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                            '$$state',
                        ],
                    }),
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

    it('flags states over the catalog maximum or with more instants than missing usages, ignoring malformed entries', () => {
        expect(outOfRangeFilter(catalog)).toEqual({
            deletedAt: null,
            $expr: { $anyElementTrue: [overStates(stateOutOfRange)] },
        });
    });

    it.each([
        ['usages within range', { usages: 1, recoveries: [0, 1] }, false],
        [
            'more instants than missing usages',
            { usages: 1, recoveries: [0, 1, 2] },
            true,
        ],
        ['instants at the maximum', { usages: 3, recoveries: [0] }, true],
        ['usages over the maximum', { usages: 5, recoveries: [] }, true],
        [
            'usages over the maximum, instants not a list',
            { usages: 5, recoveries: 'soon' },
            true,
        ],
        ['full and idle', { usages: 3, recoveries: [] }, false],
        ['null usages', { usages: null, recoveries: [0, 1, 2, 3] }, false],
        ['string usages', { usages: 'two', recoveries: [0, 1, 2, 3] }, false],
        ['missing usages, instants not a list', { recoveries: 'soon' }, false],
        ['fractional usages', { usages: 1.5, recoveries: [0, 1] }, false],
        [
            'not-a-number usages',
            { usages: NaN, recoveries: [0, 1, 2, 3] },
            false,
        ],
        ['instants not a list', { usages: 1, recoveries: 'soon' }, false],
        ['null instants', { usages: 1, recoveries: null }, false],
        ['missing instants', { usages: 1 }, false],
    ])(
        'mirrors the Mongo predicate in JavaScript: %s',
        (_, state, expected) => {
            expect(isSpellStateOutOfRange(state, 3)).toBe(expected);
        },
    );

    it('never flags a state whose spell is not in the catalog', () => {
        expect(
            isSpellStateOutOfRange({ usages: 5, recoveries: [0] }, undefined),
        ).toBe(false);
    });
});
