import type { Types } from 'mongoose';
import {
    NO_SPELL_MAX_USAGES,
    spellStatesOrMigrated,
    usagesFromState,
} from 'src/characters/spells/spell-state.snapshot';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { MAX_OVERRIDE_ENTRIES } from 'src/models/request/complete-pending-request.model';
import type {
    ItemUsageInput,
    ParticipantOverrideInput,
    SpellUsageInput,
} from 'src/models/request/complete-pending-request.model';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import type { ParticipantEffects } from './combat/combat-resolver';
import { isInjuryType } from './injuries/injury-rules';
import { isPositiveInteger } from './outcome-numbers';
import { MIN_LIFE_POINTS } from './progression/level-table';
import type { OutcomeCharacterSnapshot } from './outcome-plan';
import { statusFactsOf } from './progression/status-facts';

// limiti di un partecipante letti dallo snapshot (Open Q 14): chiavi esadecimali
export interface OverrideParticipant {
    characterId: Types.ObjectId;
    currentLifePoints: number;
    maxLifePoints: number;
    ownedLoot: ReadonlyMap<string, number>;
    activeSpells: ReadonlyMap<string, number>;
}

// difesa in profondità: il tetto vive nel modello dell'input (C5)
export { MAX_OVERRIDE_ENTRIES };

const withinCap = (list: readonly unknown[] | null | undefined): boolean =>
    (list?.length ?? 0) <= MAX_OVERRIDE_ENTRIES;

const overrideWithinCap = (override: ParticipantOverrideInput): boolean =>
    withinCap(override.injuries) &&
    withinCap(override.consumablesUsed) &&
    withinCap(override.spellsUsed);

function addTo(totals: Map<string, number>, key: string, amount: number) {
    totals.set(key, (totals.get(key) ?? 0) + amount);
}

export function overrideParticipantOf(
    snapshot: OutcomeCharacterSnapshot,
): OverrideParticipant {
    const facts = statusFactsOf(snapshot);
    const ownedLoot = new Map<string, number>();
    for (const entry of snapshot.assets?.ownedItems ?? []) {
        const item = refIdOf(entry.item);
        if (entry.itemType !== 'LootItem' || !item) continue;
        addTo(ownedLoot, item.toHexString(), entry.quantity);
    }
    // limite degli usi dalla voce di stato, mai dal mirror degli slot (D-04a, T-9.1-32)
    const states = spellStatesOrMigrated(snapshot, NO_SPELL_MAX_USAGES);
    const activeSpells = new Map<string, number>();
    for (const entry of snapshot.assets?.activeSpells ?? []) {
        const spell = refIdOf(entry.spell);
        if (!spell) continue;
        activeSpells.set(spell.toHexString(), usagesFromState(states, spell));
    }
    return {
        characterId: snapshot._id,
        currentLifePoints: facts.currentLifePoints,
        maxLifePoints: facts.maxLifePoints,
        ownedLoot,
        activeSpells,
    };
}

// HP fra 1 e il massimo dello snapshot, prima della ricompensa (Open Q 14)
function hpAfterOf(
    override: ParticipantOverrideInput,
    participant: OverrideParticipant,
): number {
    const { hpAfter } = override;
    if (hpAfter === undefined || hpAfter === null)
        return participant.currentLifePoints;
    if (!Number.isSafeInteger(hpAfter))
        throw GameRuleException.outcomeOverrideInvalid();
    if (hpAfter < MIN_LIFE_POINTS || hpAfter > participant.maxLifePoints)
        throw GameRuleException.outcomeOverrideInvalid();
    return hpAfter;
}

function injuriesOf(override: ParticipantOverrideInput): InjuryType[] {
    const injuries = [...new Set(override.injuries ?? [])];
    if (injuries.some((injury) => !isInjuryType(injury)))
        throw GameRuleException.outcomeOverrideInvalid();
    return injuries;
}

// totale per id entro il disponibile: una voce ripetuta si somma, mai oltre lo snapshot (T-09-73)
function usagesWithin(
    entries: readonly { id: string; amount: number }[],
    available: ReadonlyMap<string, number>,
): Map<string, number> {
    const totals = new Map<string, number>();
    for (const { id, amount } of entries) {
        const key = objectIdFromHex(id)?.toHexString();
        if (!key || !isPositiveInteger(amount))
            throw GameRuleException.outcomeOverrideInvalid();
        addTo(totals, key, amount);
        if (totals.get(key)! > (available.get(key) ?? 0))
            throw GameRuleException.outcomeOverrideInvalid();
    }
    return totals;
}

const consumablesOf = (
    used: readonly ItemUsageInput[],
    participant: OverrideParticipant,
): ParticipantEffects['consumablesUsed'] =>
    [
        ...usagesWithin(
            used.map(({ item, quantity }) => ({ id: item, amount: quantity })),
            participant.ownedLoot,
        ),
    ].map(([itemId, quantity]) => ({ itemId, quantity }));

const spellsOf = (
    used: readonly SpellUsageInput[],
    participant: OverrideParticipant,
): ParticipantEffects['spellsUsed'] =>
    [
        ...usagesWithin(
            used.map(({ spell, usages }) => ({ id: spell, amount: usages })),
            participant.activeSpells,
        ),
    ].map(([spellId, usages]) => ({ spellId, usages }));

function effectsOf(
    override: ParticipantOverrideInput,
    participant: OverrideParticipant,
): ParticipantEffects {
    return {
        characterId: participant.characterId.toHexString(),
        hpAfter: hpAfterOf(override, participant),
        injuriesAdded: injuriesOf(override),
        consumablesUsed: consumablesOf(
            override.consumablesUsed ?? [],
            participant,
        ),
        spellsUsed: spellsOf(override.spellsUsed ?? [], participant),
    };
}

// il racconto del GM diventa l'esito del combattimento (D-04): nessun override = nessun combattimento, HP intatti e nessuna ferita
export function validateOverrides(
    overrides: readonly ParticipantOverrideInput[] | null | undefined,
    participants: readonly OverrideParticipant[],
): Map<string, ParticipantEffects | null> {
    const effects = new Map<string, ParticipantEffects | null>(
        participants.map(({ characterId }) => [
            characterId.toHexString(),
            null,
        ]),
    );
    if (!withinCap(overrides) || !(overrides ?? []).every(overrideWithinCap))
        throw GameRuleException.outcomeOverrideInvalid();
    const seen = new Set<string>();
    for (const override of overrides ?? []) {
        const key = objectIdFromHex(override.characterId)?.toHexString();
        const participant = participants.find(
            ({ characterId }) => characterId.toHexString() === key,
        );
        if (!key || !participant)
            throw GameRuleException.outcomeNotParticipant();
        if (seen.has(key)) throw GameRuleException.outcomeOverrideInvalid();
        seen.add(key);
        effects.set(key, effectsOf(override, participant));
    }
    return effects;
}
