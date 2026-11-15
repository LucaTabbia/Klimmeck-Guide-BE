import { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import {
    lastCompanionLifeOf,
    type ParticipantEffects,
} from 'src/quests/outcomes/combat/combat-resolver';
import {
    type CompanionFight,
    companionEnemiesXpOf,
} from 'src/quests/outcomes/pets/companion-enemies-xp';
import { effectiveEffectsOf } from './draft-invalidation';
import { participantEffectsOf } from './fight-state';
import type {
    MissionFightEnemyRecord,
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

// vita del compagno dell'ultimo scontro in cui c'era (D-12, D-26)
const companionLifeOf = (
    sequence: readonly ParticipantEffects[],
): Pick<ParticipantEffects, 'companionLifeAfter'> =>
    sequence.reduce<Pick<ParticipantEffects, 'companionLifeAfter'>>(
        (kept, effects) =>
            lastCompanionLifeOf({ ...effects, ...kept }, effects),
        {},
    );

// vita dell'ultimo scontro, ferite unite, consumi e usi sommati per id, vita del compagno dell'ultimo scontro che la porta; nessuno scontro = nessun combattimento
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
        ...companionLifeOf(sequence),
    };
}

const fightXpOf = (
    enemies: readonly MissionFightEnemyRecord[],
    enemyXp: ReadonlyMap<string, number>,
): number =>
    enemies.reduce(
        (total, { enemy, quantity }) =>
            total + (enemyXp.get(enemy.toHexString()) ?? 0) * quantity,
        0,
    );

// D-13: ogni scontro con gli xp dei suoi nemici e la vita effettiva del compagno alla fine (corretta se corretta)
function companionFightsOf(
    fights: readonly MissionFightRecord[],
    characterHex: string,
    enemyXp: ReadonlyMap<string, number>,
): CompanionFight[] {
    return fights.flatMap((fight) => {
        const outcome = outcomeIn(fight, characterHex);
        const effects = outcome ? effectiveEffectsOf(outcome) : null;
        if (!effects) return [];
        const { companionLifeAfter } = effects;
        return [
            {
                enemiesXp: fightXpOf(fight.enemies, enemyXp),
                ...(companionLifeAfter == null ? {} : { companionLifeAfter }),
            },
        ];
    });
}

// effetti aggregati con gli xp dei soli scontri combattuti dal compagno caduto prima dell'ultimo (D-13)
export function guidedBattleOf(
    fights: readonly MissionFightRecord[],
    characterHex: string,
    enemyXp: ReadonlyMap<string, number>,
): ParticipantEffects | null {
    const battle = aggregateEffectsOf(fights, characterHex);
    if (!battle) return null;
    return {
        ...battle,
        ...companionEnemiesXpOf(
            companionFightsOf(fights, characterHex, enemyXp),
        ),
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
        ...(effects.companionLifeAfter === undefined
            ? {}
            : { companionLifeAfter: effects.companionLifeAfter }),
    };
}

// A-08: ciò che l'oste non tocca (omesso o null) vale il simulato dello scontro; un valore esplicito, anche una lista vuota, vince
export function correctionOverSimulated(
    correction: ParticipantOverrideInput,
    simulated: ParticipantEffects,
): ParticipantOverrideInput {
    const base = overrideInputOf(correction.characterId, simulated);
    const companionLifeAfter =
        correction.companionLifeAfter ?? base.companionLifeAfter;
    return {
        characterId: correction.characterId,
        hpAfter: correction.hpAfter ?? base.hpAfter,
        injuries: correction.injuries ?? base.injuries,
        consumablesUsed: correction.consumablesUsed ?? base.consumablesUsed,
        spellsUsed: correction.spellsUsed ?? base.spellsUsed,
        ...(companionLifeAfter == null ? {} : { companionLifeAfter }),
    };
}
