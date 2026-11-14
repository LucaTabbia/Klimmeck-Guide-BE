import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import { participantEffectsOf } from './fight-state';
import { hexOf } from './ids';
import type {
    MissionFightEffectsRecord,
    MissionFightEnemyRecord,
    MissionFightOutcomeRecord,
    MissionFightRecord,
} from './mission-draft.model';

// D-24: cambiare i nemici di k annulla k e i successivi; la correzione e il rilancio azzerano i successivi con resetFrom

export function effectiveEffectsOf(
    outcome: MissionFightOutcomeRecord,
): MissionFightEffectsRecord | null {
    return outcome.corrected ?? outcome.simulated ?? null;
}

export function previousEffectsOf(
    fights: readonly MissionFightRecord[],
    index: number,
    characterHex: string,
): ParticipantEffects[] {
    const previous: ParticipantEffects[] = [];
    for (const fight of fights.slice(0, index)) {
        const outcome = fight.outcomes.find(
            (entry) => hexOf(entry.character) === characterHex,
        );
        const effects = outcome ? effectiveEffectsOf(outcome) : null;
        if (effects) previous.push(participantEffectsOf(characterHex, effects));
    }
    return previous;
}

function sameEnemies(
    a: readonly MissionFightEnemyRecord[],
    b: readonly MissionFightEnemyRecord[],
): boolean {
    return (
        a.length === b.length &&
        a.every(
            (entry, index) =>
                hexOf(entry.enemy) === hexOf(b[index].enemy) &&
                entry.quantity === b[index].quantity,
        )
    );
}

function unsimulated(enemies: MissionFightEnemyRecord[]): MissionFightRecord {
    return { enemies, verdict: null, outcomes: [] };
}

export function resetFrom(
    fights: readonly MissionFightRecord[],
    index: number,
): MissionFightRecord[] {
    return fights.map((fight, position) =>
        position < index ? fight : unsimulated(fight.enemies),
    );
}

export function reconcileFights(
    existing: readonly MissionFightRecord[],
    incoming: readonly (readonly MissionFightEnemyRecord[])[],
): MissionFightRecord[] {
    let keeping = true;
    return incoming.map((enemies, index) => {
        const kept = existing[index];
        keeping = keeping && !!kept && sameEnemies(kept.enemies, enemies);
        return keeping ? kept : unsimulated([...enemies]);
    });
}
