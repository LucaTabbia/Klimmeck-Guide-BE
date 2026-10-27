import { Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';

// una pipeline per migrazione e verifier (D-08): idempotente, per documento, archiviati esclusi; ripara voci mancanti/orfane, ordine, array assenti e mirror; gli istanti in eccesso li taglia solo spellStatesTrimPipeline
// solo Types.ObjectId (le pipeline non castano) e $arrayElemAt + $let: la soglia resta MongoDB 4.2 (D-07)

export interface SpellCatalogEntry {
    id: Types.ObjectId;
    maxUsages: number;
}

const arr = (path: string) => ({ $ifNull: [path, []] });
const first = (input: unknown, cond: unknown) => ({
    $arrayElemAt: [{ $filter: { input, cond } }, 0],
});
const pick = (doc: unknown, field: string) => ({
    $let: { vars: { d: doc }, in: `$$d.${field}` },
});
// ref Mixed salvato come ObjectId o stringa legacy: il confronto per esadecimale copre entrambe le forme
const sameRef = (left: string, right: string) => ({
    $eq: [{ $toString: left }, { $toString: right }],
});

// id di status.spells convertiti a ObjectId; spazzatura scartata
const KNOWN = {
    $filter: {
        input: {
            $map: {
                input: arr('$status.spells'),
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

const stateOf = (id: string) =>
    first(arr('$status.spellStates'), { $eq: ['$$this.spell', id] });

// $ifNull: una voce assente nel catalogo vale null, mai "missing" (che $ne/$gt tratterebbero come un valore)
const catalogMaxOf = (catalog: readonly SpellCatalogEntry[], ref: string) => ({
    $ifNull: [
        pick(
            first({ $literal: catalog }, sameRef('$$this.id', ref)),
            'maxUsages',
        ),
        null,
    ],
});

const MISSING_USAGES = { $subtract: ['$$max', '$$state.usages'] };

// taglio e filtro leggono voci forse scritte a mano: un valore malformato vale "non da tagliare", mai un errore che fermi il batch
const arrayOr = (path: string) => ({
    $cond: [{ $isArray: path }, path, []],
});
const STORED_STATES = arrayOr('$status.spellStates');
const RECOVERIES_LIST = arrayOr('$$state.recoveries');
// $cond valuta un solo ramo: $trunc e i confronti vedono solo numeri; decimal escluso (il driver lo legge come oggetto)
const USAGES_ARE_SAFE_INTEGER = {
    $cond: [
        { $in: [{ $type: '$$state.usages' }, ['int', 'long', 'double']] },
        {
            $and: [
                { $gte: ['$$state.usages', -Number.MAX_SAFE_INTEGER] },
                { $lte: ['$$state.usages', Number.MAX_SAFE_INTEGER] },
                { $eq: ['$$state.usages', { $trunc: '$$state.usages' }] },
            ],
        },
        false,
    ],
};
// stessa regola di isSpellStateOutOfRange, che la rispecchia in JavaScript per i WARN
const STATE_OUT_OF_RANGE = {
    $cond: [
        { $and: [{ $ne: ['$$max', null] }, USAGES_ARE_SAFE_INTEGER] },
        {
            $or: [
                { $gt: ['$$state.usages', '$$max'] },
                { $gt: [{ $size: RECOVERIES_LIST }, MISSING_USAGES] },
            ],
        },
        false,
    ],
};

const overStoredStates = (
    catalog: readonly SpellCatalogEntry[],
    inner: unknown,
) => ({
    $map: {
        input: STORED_STATES,
        as: 'state',
        in: {
            $let: {
                vars: { max: catalogMaxOf(catalog, '$$state.spell') },
                in: inner,
            },
        },
    },
});

export function spellStatesConsistentExpr(): Record<string, unknown> {
    return {
        $and: [
            {
                $eq: [
                    {
                        $map: {
                            input: arr('$status.spellStates'),
                            in: '$$this.spell',
                        },
                    },
                    KNOWN,
                ],
            },
            { $eq: [{ $type: '$assets.activeSpells' }, 'array'] },
            { $eq: [{ $type: '$status.spellStates' }, 'array'] },
            {
                $allElementsTrue: [
                    {
                        $map: {
                            input: arr('$assets.activeSpells'),
                            as: 'a',
                            in: {
                                $eq: [
                                    '$$a.usages',
                                    pick(
                                        first(
                                            arr('$status.spellStates'),
                                            sameRef(
                                                '$$this.spell',
                                                '$$a.spell',
                                            ),
                                        ),
                                        'usages',
                                    ),
                                ],
                            },
                        },
                    },
                ],
            },
        ],
    };
}

export function spellStatesRepairPipeline(
    catalog: readonly SpellCatalogEntry[],
): Record<string, unknown>[] {
    const maxOf = (id: string) =>
        pick(
            first({ $literal: catalog }, { $eq: ['$$this.id', id] }),
            'maxUsages',
        );
    const activeUsagesOf = (id: string) =>
        pick(
            first(arr('$assets.activeSpells'), sameRef('$$this.spell', id)),
            'usages',
        );
    return [
        {
            $set: {
                'status.spellStates': {
                    $map: {
                        input: KNOWN,
                        as: 'k',
                        in: {
                            $ifNull: [
                                stateOf('$$k'),
                                {
                                    spell: '$$k',
                                    usages: {
                                        $ifNull: [
                                            activeUsagesOf('$$k'),
                                            { $ifNull: [maxOf('$$k'), 0] },
                                        ],
                                    },
                                    recoveries: [],
                                },
                            ],
                        },
                    },
                },
            },
        },
        {
            $set: {
                'assets.activeSpells': {
                    $map: {
                        input: arr('$assets.activeSpells'),
                        as: 'a',
                        in: {
                            spell: '$$a.spell',
                            usages: {
                                $ifNull: [
                                    pick(
                                        first(
                                            '$status.spellStates',
                                            sameRef(
                                                '$$this.spell',
                                                '$$a.spell',
                                            ),
                                        ),
                                        'usages',
                                    ),
                                    '$$a.usages',
                                ],
                            },
                        },
                    },
                },
            },
        },
    ];
}

export function unmigratedFilter(): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        'status.spellStates': { $exists: false },
    };
}

export function inconsistentFilter(): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        $expr: { $not: [spellStatesConsistentExpr()] },
    };
}

// voci da correggere con spellStatesTrimPipeline: usi oltre il massimo (solo segnalati) o istanti che nessun credito può consumare
export function outOfRangeFilter(
    catalog: readonly SpellCatalogEntry[],
): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        $expr: {
            $anyElementTrue: [overStoredStates(catalog, STATE_OUT_OF_RANGE)],
        },
    };
}

// un istante che il credito non può più consumare violerebbe D-03 per sempre: gli istanti sono crescenti, il $slice negativo tiene i più recenti; gli usi non si toccano mai, le altre voci restano come sono
export function spellStatesTrimPipeline(
    catalog: readonly SpellCatalogEntry[],
): Record<string, unknown>[] {
    return [
        {
            $set: {
                'status.spellStates': overStoredStates(catalog, {
                    $cond: [
                        STATE_OUT_OF_RANGE,
                        {
                            spell: '$$state.spell',
                            usages: '$$state.usages',
                            recoveries: trimmedRecoveries(),
                        },
                        '$$state',
                    ],
                }),
            },
        },
    ];
}

// solo su una voce fuori dai limiti: usi interi e, sotto il massimo, più istanti del deficit (≥ 1)
function trimmedRecoveries() {
    return {
        $cond: [
            { $gte: ['$$state.usages', '$$max'] },
            [],
            {
                $slice: [RECOVERIES_LIST, { $multiply: [-1, MISSING_USAGES] }],
            },
        ],
    };
}

// specchio JavaScript di STATE_OUT_OF_RANGE (stessa tabella di casi nei test): decide i WARN del migrator
export function isSpellStateOutOfRange(
    state: { usages?: unknown; recoveries?: unknown },
    maxUsages: number | undefined,
): boolean {
    const { usages, recoveries } = state;
    if (maxUsages === undefined || !Number.isSafeInteger(usages)) return false;
    const instants = Array.isArray(recoveries) ? recoveries.length : 0;
    const stored = usages as number;
    return stored > maxUsages || instants > maxUsages - stored;
}
