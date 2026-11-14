import { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import { effectiveEffectsOf } from './draft-invalidation';
import { participantEffectsOf } from './fight-state';
import type {
    MissionFightOutcomeRecord,
    MissionFightRecord,
} from './mission-draft.model';

// esito della missione guidata dalla bozza (D-08, D-14, D-24): funzioni pure, nessun tiro

export interface EffectiveFight {
    effects: ParticipantEffects;
    // l'effetto viene da una correzione dell'oste, non dalla simulazione
    corrected: boolean;
}

const outcomeIn = (
    fight: MissionFightRecord,
    characterHex: string,
): MissionFightOutcomeRecord | undefined =>
    fight.outcomes.find(
        ({ character }) => character.toHexString() === characterHex,
    );

export function effectiveSequenceOf(
    fights: readonly MissionFightRecord[],
    characterHex: string,
): EffectiveFight[] {
    return fights.flatMap((fight) => {
        const outcome = outcomeIn(fight, characterHex);
        const effects = outcome ? effectiveEffectsOf(outcome) : null;
        if (!outcome || !effects) return [];
        return [
            {
                effects: participantEffectsOf(characterHex, effects),
                corrected: outcome.corrected != null,
            },
        ];
    });
}

// totale per id nell'ordine della prima comparsa
function totalsById(
    entries: readonly { id: string; amount: number }[],
): [string, number][] {
    const totals = new Map<string, number>();
    for (const { id, amount } of entries)
        totals.set(id, (totals.get(id) ?? 0) + amount);
    return [...totals];
}

// vita dell'ultimo scontro, ferite unite, consumi e usi sommati per id; nessuno scontro = nessun combattimento
export function aggregateEffectsOf(
    fights: readonly MissionFightRecord[],
    characterHex: string,
): ParticipantEffects | null {
    const sequence = effectiveSequenceOf(fights, characterHex).map(
        ({ effects }) => effects,
    );
    const last = sequence.at(-1);
    if (!last) return null;
    return {
        characterId: characterHex,
        hpAfter: last.hpAfter,
        injuriesAdded: [
            ...new Set<InjuryType>(
                sequence.flatMap(({ injuriesAdded }) => injuriesAdded),
            ),
        ],
        consumablesUsed: totalsById(
            sequence.flatMap(({ consumablesUsed }) =>
                consumablesUsed.map(({ itemId, quantity }) => ({
                    id: itemId,
                    amount: quantity,
                })),
            ),
        ).map(([itemId, quantity]) => ({ itemId, quantity })),
        spellsUsed: totalsById(
            sequence.flatMap(({ spellsUsed }) =>
                spellsUsed.map(({ spellId, usages }) => ({
                    id: spellId,
                    amount: usages,
                })),
            ),
        ).map(([spellId, usages]) => ({ spellId, usages })),
    };
}

export function mergedEnemiesOf(
    fights: readonly MissionFightRecord[],
): { enemy: Types.ObjectId; quantity: number }[] {
    return totalsById(
        fights.flatMap(({ enemies }) =>
            enemies.map(({ enemy, quantity }) => ({
                id: enemy.toHexString(),
                amount: quantity,
            })),
        ),
    ).map(([hex, quantity]) => ({ enemy: new Types.ObjectId(hex), quantity }));
}

// ogni scontro simulato e con un effetto per ogni personaggio (D-24)
export function assertFightsComplete(
    fights: readonly MissionFightRecord[],
    characterHexes: readonly string[],
): void {
    const complete = fights.every(
        (fight) =>
            fight.verdict != null &&
            characterHexes.every((hex) => {
                const outcome = outcomeIn(fight, hex);
                return !!outcome && effectiveEffectsOf(outcome) !== null;
            }),
    );
    if (!complete) throw GameRuleException.outcomeOverrideInvalid();
}

export function overrideInputOf(
    characterHex: string,
    effects: ParticipantEffects,
): ParticipantOverrideInput {
    return {
        characterId: characterHex,
        hpAfter: effects.hpAfter,
        injuries: [...effects.injuriesAdded],
        consumablesUsed: effects.consumablesUsed.map(
            ({ itemId, quantity }) => ({ item: itemId, quantity }),
        ),
        spellsUsed: effects.spellsUsed.map(({ spellId, usages }) => ({
            spell: spellId,
            usages,
        })),
    };
}
