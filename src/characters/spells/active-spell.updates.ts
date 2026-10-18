import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { maxActiveSpellsExpression } from 'src/models/character/active-spell-slots';

// il filtro è la regola (04 D-10): conosciuta, non già attiva, capacità valutata sul documento vivo nello stesso update
export function equipSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'status.spells': spellId,
        'assets.activeSpells.spell': { $ne: spellId },
        $expr: {
            $lt: [
                { $size: { $ifNull: ['$assets.activeSpells', []] } },
                maxActiveSpellsExpression(),
            ],
        },
    };
}

export function equipSpellUpdate(spellId: Types.ObjectId, maxUsages: number) {
    return {
        $push: { 'assets.activeSpells': { spell: spellId, usages: maxUsages } },
    };
}

export function unequipSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.activeSpells.spell': spellId,
    };
}

export function unequipSpellUpdate(spellId: Types.ObjectId) {
    return { $pull: { 'assets.activeSpells': { spell: spellId } } };
}

export function useSpellFilter(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.activeSpells': {
            $elemMatch: { spell: spellId, usages: { $gte: 1 } },
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
            $elemMatch: { spell: spellId, usages: { $lt: maxUsages } },
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
    'assets.activeSpells': 1,
};

export interface ActiveSpellSnapshot {
    status?: { spells?: unknown[] };
    assets?: { activeSpells?: { spell?: unknown; usages?: number }[] };
}

// i dati legacy possono avere id stringa: il confronto per esadecimale copre entrambe le forme
function sameId(value: unknown, id: Types.ObjectId): boolean {
    return (
        value != null &&
        (value as { toString(): string }).toString() === id.toHexString()
    );
}

function isKnown(snapshot: ActiveSpellSnapshot, spellId: Types.ObjectId) {
    return (snapshot.status?.spells ?? []).some((spell) =>
        sameId(spell, spellId),
    );
}

function isActive(snapshot: ActiveSpellSnapshot, spellId: Types.ObjectId) {
    return (snapshot.assets?.activeSpells ?? []).some((active) =>
        sameId(active.spell, spellId),
    );
}

// rilettura dopo matchedCount 0: se nessuna guard risulta violata lo stato è cambiato nel frattempo, si risponde col codice di contesa
export function classifyEquipSpellFailure(
    snapshot: ActiveSpellSnapshot | null,
    spellId: Types.ObjectId,
): Error {
    if (!snapshot) return ResourceNotFoundException.character();
    if (!isKnown(snapshot, spellId)) return GameRuleException.spellNotKnown();
    if (isActive(snapshot, spellId))
        return GameRuleException.spellAlreadyActive();
    return GameRuleException.maxActiveSpellsReached();
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
): Error {
    if (!snapshot) return ResourceNotFoundException.character();
    if (!isActive(snapshot, spellId)) return GameRuleException.spellNotActive();
    return GameRuleException.spellNoUsagesLeft();
}
