import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    maxActiveSpellsExpression,
    maxActiveSpellsFor,
} from 'src/models/character/active-spell-slots';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    SpellStateEntry,
    stateEntryOf,
    usagesFromState,
} from './spell-state.snapshot';

// una sola lista (Phase 19 D-07): conosciuta = esiste la voce, equipaggiata = flag della voce; una voce senza flag vale non equipaggiata
const ACTIVE_STATES_COUNT = {
    $size: {
        $filter: {
            input: { $ifNull: ['$status.spellStates', []] },
            cond: { $eq: ['$$this.active', true] },
        },
    },
};

// il filtro è la regola (04 D-10): conosciuta, non già attiva, capacità valutata sul documento vivo nello stesso update
export function equipSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'status.spellStates': {
            $elemMatch: { spell: spellId, active: { $ne: true } },
        },
        $expr: { $lt: [ACTIVE_STATES_COUNT, maxActiveSpellsExpression()] },
    };
}

// equip e unequip non toccano usi né recuperi (D-01, D-07): solo il flag della voce `s` di spellStateArrayFilters
export function equipSpellUpdate() {
    return { $set: { 'status.spellStates.$[s].active': true } };
}

export function unequipSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'status.spellStates': { $elemMatch: { spell: spellId, active: true } },
    };
}

export function unequipSpellUpdate() {
    return { $set: { 'status.spellStates.$[s].active': false } };
}

export const ACTIVE_SPELL_SNAPSHOT_PROJECTION = {
    'status.xp': 1,
    'status.title': 1,
    'status.spellStates': 1,
};

export interface ActiveSpellSnapshot {
    status?: {
        xp?: number;
        title?: TitleType;
        spellStates?: SpellStateEntry[];
    };
}

function isActive(snapshot: ActiveSpellSnapshot, spellId: Types.ObjectId) {
    return stateEntryOf(snapshot.status?.spellStates, spellId)?.active === true;
}

function hasNoFreeSlot(snapshot: ActiveSpellSnapshot) {
    const activeStates = (snapshot.status?.spellStates ?? []).filter(
        (state) => state.active === true,
    );
    return (
        activeStates.length >=
        maxActiveSpellsFor(snapshot.status?.xp ?? 0, snapshot.status?.title)
    );
}

// rilettura dopo matchedCount 0 (04 D-10); undefined = nessuna guard violata sullo snapshot: lo stato è cambiato fra l'update e la rilettura
export function classifyEquipSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
    spellId: Types.ObjectId,
): Error | undefined {
    if (!snapshot) return ResourceNotFoundException.character();
    if (!stateEntryOf(snapshot.status?.spellStates, spellId))
        return GameRuleException.spellNotKnown();
    if (isActive(snapshot, spellId))
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

// attiva e usi dalla stessa voce (D-07): prima il flag, poi gli usi
export function classifyUseSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
    spellId: Types.ObjectId,
): Error | undefined {
    if (!snapshot) return ResourceNotFoundException.character();
    if (!isActive(snapshot, spellId)) return GameRuleException.spellNotActive();
    if (usagesFromState(snapshot.status?.spellStates, spellId) < 1)
        return GameRuleException.spellNoUsagesLeft();
    return undefined;
}
