import { Types } from 'mongoose';
import { activeCharacterById } from 'src/models/character/active-character.filter';

// s = voce di stato (ref castato): l'unico filtro d'array di ogni scrittura sulle magie (Phase 19 D-07); un solo update → un solo change event (D-04a)
export const spellStateArrayFilters = (spellId: Types.ObjectId) => ({
    arrayFilters: [{ 's.spell': spellId }],
});

// la stessa voce è attiva e ha almeno un uso (D-06, D-07)
export function useSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'status.spellStates': {
            $elemMatch: { spell: spellId, usages: { $gte: 1 }, active: true },
        },
    };
}

// istanti crescenti con i duplicati (D-02): $sort nel $push, mai read-sort-write
export function spendUsagesUpdate(dueAt: readonly Date[]) {
    if (dueAt.length === 0)
        throw new Error('spendUsagesUpdate requires at least one instant');
    return {
        $inc: { 'status.spellStates.$[s].usages': -dueAt.length },
        $push: {
            'status.spellStates.$[s].recoveries': {
                $each: [...dueAt],
                $sort: 1,
            },
        },
    };
}

// l'istante più vecchio già scaduto torna come uso; la magia può non essere equipaggiata (D-01); stesso update per processor e sweep
export function dueCreditFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
    maxUsages: number,
    now: Date,
) {
    return {
        ...activeCharacterById(characterId),
        'status.spellStates': {
            $elemMatch: {
                spell: spellId,
                usages: { $lt: maxUsages },
                'recoveries.0': { $lte: now },
            },
        },
    };
}

export const CREDIT_DUE_USAGE = {
    $inc: { 'status.spellStates.$[s].usages': 1 },
    $pop: { 'status.spellStates.$[s].recoveries': -1 },
};

// job accodati prima del deploy (senza dueAt): solo il deficit non tracciato, gli istanti restano (D-06 rivista)
export function legacyCreditFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
    maxUsages: number,
) {
    return {
        ...activeCharacterById(characterId),
        $expr: {
            $let: {
                vars: {
                    state: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: {
                                        $ifNull: ['$status.spellStates', []],
                                    },
                                    cond: { $eq: ['$$this.spell', spellId] },
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
                                maxUsages,
                            ],
                        },
                    ],
                },
            },
        },
    };
}

export const CREDIT_LEGACY_USAGE = {
    $inc: { 'status.spellStates.$[s].usages': 1 },
};
