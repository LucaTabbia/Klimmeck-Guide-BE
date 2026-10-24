import type { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import type {
    ItemUsageInput,
    ParticipantOverrideInput,
    SpellUsageInput,
} from 'src/models/request/complete-pending-request.model';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import type { ParticipantOutcome } from './combat/combat-resolver';
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

const KNOWN_INJURIES: ReadonlySet<string> = new Set(Object.values(InjuryType));

const isPositiveInteger = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) > 0;

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
    const activeSpells = new Map<string, number>();
    for (const entry of snapshot.assets?.activeSpells ?? []) {
        const spell = refIdOf(entry.spell);
        if (!spell) continue;
        addTo(
            activeSpells,
            spell.toHexString(),
            Math.max(0, entry.usages ?? 0),
        );
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
    if (injuries.some((injury) => !KNOWN_INJURIES.has(injury)))
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
): ParticipantOutcome['consumablesUsed'] =>
    [
        ...usagesWithin(
            used.map(({ item, quantity }) => ({ id: item, amount: quantity })),
            participant.ownedLoot,
        ),
    ].map(([itemId, quantity]) => ({ itemId, quantity }));

const spellsOf = (
    used: readonly SpellUsageInput[],
    participant: OverrideParticipant,
): ParticipantOutcome['spellsUsed'] =>
    [
        ...usagesWithin(
            used.map(({ spell, usages }) => ({ id: spell, amount: usages })),
            participant.activeSpells,
        ),
    ].map(([spellId, usages]) => ({ spellId, usages }));

function outcomeOf(
    override: ParticipantOverrideInput,
    participant: OverrideParticipant,
): ParticipantOutcome {
    return {
        characterId: participant.characterId.toHexString(),
        outcome: 'success',
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
): Map<string, ParticipantOutcome | null> {
    const outcomes = new Map<string, ParticipantOutcome | null>(
        participants.map(({ characterId }) => [
            characterId.toHexString(),
            null,
        ]),
    );
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
        outcomes.set(key, outcomeOf(override, participant));
    }
    return outcomes;
}
