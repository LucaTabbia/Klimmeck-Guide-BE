import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    maxActiveSpellsExpression,
    maxActiveSpellsFor,
} from 'src/models/character/active-spell-slots';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms, sameId } from 'src/mongo/document-id';
import { SpellStateEntry, usagesFromState } from './spell-state.snapshot';

// il filtro è la regola (04 D-10): conosciuta, non già attiva, capacità valutata sul documento vivo nello stesso update
// ogni ref di magia si confronta in entrambe le forme salvate (04 Pitfall 1): filtro e classificatore (sameId) coincidono
export function equipSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'status.spells': { $in: idForms(spellId) },
        'assets.activeSpells.spell': { $nin: idForms(spellId) },
        $expr: {
            $lt: [
                { $size: { $ifNull: ['$assets.activeSpells', []] } },
                maxActiveSpellsExpression(),
            ],
        },
    };
}

// equip non tocca usi né recuperi (D-01, D-07; Phase 4 D-11 superata): il mirror nasce uguale alla voce di stato nello stesso update, maxUsages solo se la voce manca
export function equipSpellUpdate(spellId: Types.ObjectId, maxUsages: number) {
    const stateUsages = {
        $let: {
            vars: {
                state: {
                    $arrayElemAt: [
                        {
                            $filter: {
                                input: { $ifNull: ['$status.spellStates', []] },
                                cond: { $eq: ['$$this.spell', spellId] },
                            },
                        },
                        0,
                    ],
                },
            },
            in: '$$state.usages',
        },
    };
    return [
        {
            $set: {
                'assets.activeSpells': {
                    $concatArrays: [
                        { $ifNull: ['$assets.activeSpells', []] },
                        [
                            {
                                spell: spellId,
                                usages: { $ifNull: [stateUsages, maxUsages] },
                            },
                        ],
                    ],
                },
            },
        },
    ];
}

export function unequipSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.activeSpells.spell': { $in: idForms(spellId) },
    };
}

export function unequipSpellUpdate(spellId: Types.ObjectId) {
    return {
        $pull: { 'assets.activeSpells': { spell: { $in: idForms(spellId) } } },
    };
}

export const ACTIVE_SPELL_SNAPSHOT_PROJECTION = {
    'status.spells': 1,
    'status.xp': 1,
    'status.title': 1,
    'status.spellStates': 1,
    'assets.activeSpells': 1,
};

export interface ActiveSpellSnapshot {
    status?: {
        spells?: unknown[];
        xp?: number;
        title?: TitleType;
        spellStates?: SpellStateEntry[];
    };
    assets?: { activeSpells?: { spell?: unknown; usages?: number }[] };
}

function isKnown(snapshot: ActiveSpellSnapshot, spellId: Types.ObjectId) {
    return (snapshot.status?.spells ?? []).some((spell) =>
        sameId(spell, spellId),
    );
}

function activeEntryOf(snapshot: ActiveSpellSnapshot, spellId: Types.ObjectId) {
    return (snapshot.assets?.activeSpells ?? []).find((active) =>
        sameId(active.spell, spellId),
    );
}

function hasNoFreeSlot(snapshot: ActiveSpellSnapshot) {
    return (
        (snapshot.assets?.activeSpells ?? []).length >=
        maxActiveSpellsFor(snapshot.status?.xp ?? 0, snapshot.status?.title)
    );
}

// rilettura dopo matchedCount 0 (04 D-10); undefined = nessuna guard violata sullo snapshot: lo stato è cambiato fra l'update e la rilettura
export function classifyEquipSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
    spellId: Types.ObjectId,
): Error | undefined {
    if (!snapshot) return ResourceNotFoundException.character();
    if (!isKnown(snapshot, spellId)) return GameRuleException.spellNotKnown();
    if (activeEntryOf(snapshot, spellId))
        return GameRuleException.spellAlreadyActive();
    if (hasNoFreeSlot(snapshot))
        return GameRuleException.maxActiveSpellsReached();
    return undefined;
}

// l'unica guard di unequip è "attiva": un personaggio esistente che non matcha non ha la magia attiva
export function classifyUnequipSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
): Error {
    if (!snapshot) return ResourceNotFoundException.character();
    return GameRuleException.spellNotActive();
}

// attiva dallo slot, usi dalla voce di stato (D-03): il mirror non decide mai
export function classifyUseSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
    spellId: Types.ObjectId,
): Error | undefined {
    if (!snapshot) return ResourceNotFoundException.character();
    if (!activeEntryOf(snapshot, spellId))
        return GameRuleException.spellNotActive();
    if (usagesFromState(snapshot.status?.spellStates, spellId) < 1)
        return GameRuleException.spellNoUsagesLeft();
    return undefined;
}
