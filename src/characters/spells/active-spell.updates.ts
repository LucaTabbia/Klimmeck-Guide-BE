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

export function useSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.activeSpells': {
            $elemMatch: {
                spell: { $in: idForms(spellId) },
                usages: { $gte: 1 },
            },
        },
    };
}

// guard sul massimo del catalogo: un job rieseguito non supera mai maxUsages (04 D-14)
export function recoverSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
    maxUsages: number,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.activeSpells': {
            $elemMatch: {
                spell: { $in: idForms(spellId) },
                usages: { $lt: maxUsages },
            },
        },
    };
}

export const DECREMENT_ACTIVE_SPELL_USAGE = {
    $inc: { 'assets.activeSpells.$.usages': -1 },
};

export const INCREMENT_ACTIVE_SPELL_USAGE = {
    $inc: { 'assets.activeSpells.$.usages': 1 },
};

export const ACTIVE_SPELL_SNAPSHOT_PROJECTION = {
    'status.spells': 1,
    'status.xp': 1,
    'status.title': 1,
    'assets.activeSpells': 1,
};

export interface ActiveSpellSnapshot {
    status?: { spells?: unknown[]; xp?: number; title?: TitleType };
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

export function classifyUseSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
    spellId: Types.ObjectId,
): Error | undefined {
    if (!snapshot) return ResourceNotFoundException.character();
    const active = activeEntryOf(snapshot, spellId);
    if (!active) return GameRuleException.spellNotActive();
    if ((active.usages ?? 0) < 1) return GameRuleException.spellNoUsagesLeft();
    return undefined;
}
