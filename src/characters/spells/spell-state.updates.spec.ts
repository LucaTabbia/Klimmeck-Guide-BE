import { Types } from 'mongoose';
import {
    CREDIT_DUE_USAGE,
    CREDIT_LEGACY_USAGE,
    dueCreditFilter,
    legacyCreditFilter,
    spellStateArrayFilters,
    spendUsagesUpdate,
    useSpellFilter,
} from './spell-state.updates';

describe('spell state write builders', () => {
    const c = new Types.ObjectId();
    const s = new Types.ObjectId();
    const arraysNamedBy = (update: object) => [
        ...new Set(
            Object.values(update)
                .flatMap((paths) => Object.keys(paths as object))
                .map((path) => path.slice(0, path.indexOf('.$[') + 5)),
        ),
    ];

    it('uses a spell only from an active state with usages left (D-07)', () => {
        expect(useSpellFilter(c, s)).toEqual({
            _id: c,
            deletedAt: null,
            'status.spellStates': {
                $elemMatch: { spell: s, usages: { $gte: 1 }, active: true },
            },
        });
    });

    it('spends and credits the usages on the spell state alone, with a single array filter (D-07)', () => {
        const options = spellStateArrayFilters(s);

        expect(options).toEqual({ arrayFilters: [{ 's.spell': s }] });
        expect(options.arrayFilters[0]['s.spell']).toBeInstanceOf(
            Types.ObjectId,
        );
        for (const update of [
            spendUsagesUpdate([new Date(1_000)]),
            CREDIT_DUE_USAGE,
            CREDIT_LEGACY_USAGE,
        ])
            expect(arraysNamedBy(update)).toEqual(['status.spellStates.$[s]']);
    });

    it('spendUsagesUpdate spends one usage per instant on the state, pushing sorted instants', () => {
        const d1 = new Date(2_000);
        const d2 = new Date(1_000);

        expect(spendUsagesUpdate([d1, d2])).toEqual({
            $inc: { 'status.spellStates.$[s].usages': -2 },
            $push: {
                'status.spellStates.$[s].recoveries': {
                    $each: [d1, d2],
                    $sort: 1,
                },
            },
        });
    });

    it('spendUsagesUpdate copies the instants instead of sharing the caller array', () => {
        const instants = [new Date(1_000)];

        const update = spendUsagesUpdate(instants);

        expect(
            update.$push['status.spellStates.$[s].recoveries'].$each,
        ).not.toBe(instants);
    });

    it('spendUsagesUpdate refuses an empty list of instants', () => {
        expect(() => spendUsagesUpdate([])).toThrow(
            new Error('spendUsagesUpdate requires at least one instant'),
        );
    });

    it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: the due credit never requires the spell to be active', () => {
        const now = new Date(5_000);

        const filter = dueCreditFilter(c, s, 3, now);

        expect(filter).toEqual({
            _id: c,
            deletedAt: null,
            'status.spellStates': {
                $elemMatch: {
                    spell: s,
                    usages: { $lt: 3 },
                    'recoveries.0': { $lte: now },
                },
            },
        });
        expect(Object.keys(filter).sort()).toEqual(
            ['_id', 'deletedAt', 'status.spellStates'].sort(),
        );
    });

    it('«Il timer di recupero non si interrompe mai»: the due credit returns one usage and consumes the oldest instant', () => {
        expect(CREDIT_DUE_USAGE).toEqual({
            $inc: { 'status.spellStates.$[s].usages': 1 },
            $pop: { 'status.spellStates.$[s].recoveries': -1 },
        });
    });

    it('legacyCreditFilter credits only the untracked deficit of a known spell', () => {
        expect(legacyCreditFilter(c, s, 3)).toEqual({
            _id: c,
            deletedAt: null,
            $expr: {
                $let: {
                    vars: {
                        state: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: {
                                            $ifNull: [
                                                '$status.spellStates',
                                                [],
                                            ],
                                        },
                                        cond: { $eq: ['$$this.spell', s] },
                                    },
                                },
                                0,
                            ],
                        },
                    },
                    in: {
                        $and: [
                            { $ne: [{ $ifNull: ['$$state', null] }, null] },
                            {
                                $lt: [
                                    {
                                        $add: [
                                            '$$state.usages',
                                            {
                                                $size: {
                                                    $ifNull: [
                                                        '$$state.recoveries',
                                                        [],
                                                    ],
                                                },
                                            },
                                        ],
                                    },
                                    3,
                                ],
                            },
                        ],
                    },
                },
            },
        });
    });

    it('CREDIT_LEGACY_USAGE returns one usage and leaves the instants untouched', () => {
        expect(CREDIT_LEGACY_USAGE).toEqual({
            $inc: { 'status.spellStates.$[s].usages': 1 },
        });
    });
});
