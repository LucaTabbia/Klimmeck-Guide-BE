import { Types } from 'mongoose';
import {
    isSpellStateOutOfRange,
    outOfRangeFilter,
    spellStatesTrimPipeline,
} from './spell-state.migration';

describe('spell state trim pipeline', () => {
    const a = new Types.ObjectId();
    const catalog = [{ id: a, maxUsages: 3 }];

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

    it('embeds the catalog as a literal with ObjectId ids', () => {
        const json = JSON.stringify(spellStatesTrimPipeline(catalog));

        expect(json).toContain('"$literal"');
        expect(json).toContain(`{"id":"${a.toHexString()}","maxUsages":3}`);
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
                                active: '$$state.active',
                            },
                            '$$state',
                        ],
                    }),
                },
            },
        ]);
    });

    it('keeps the active flag of a trimmed spell state (D-21)', () => {
        const [stage] = spellStatesTrimPipeline(catalog) as unknown as [
            {
                $set: {
                    'status.spellStates': {
                        $map: { in: { $let: { in: { $cond: unknown[] } } } };
                    };
                };
            },
        ];
        const [, rebuilt, untouched] =
            stage.$set['status.spellStates'].$map.in.$let.in.$cond;

        expect(Object.keys(rebuilt as object).sort()).toEqual([
            'active',
            'recoveries',
            'spell',
            'usages',
        ]);
        expect(rebuilt).toMatchObject({ active: '$$state.active' });
        expect(untouched).toBe('$$state');
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
