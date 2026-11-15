import { COMPANION_LIFE_FLOOR } from 'src/characters/pets/companion-life';
import type { ParticipantEffects } from '../combat/combat-resolver';

// uno scontro di una sequenza (tappe della dungeon, scontri della missione guidata) visto dal compagno di un partecipante
export interface CompanionFight {
    enemiesXp: number;
    companionLifeAfter?: number;
}

const hasFallen = ({ companionLifeAfter }: CompanionFight): boolean =>
    companionLifeAfter !== undefined &&
    companionLifeAfter <= COMPANION_LIFE_FLOOR;

// D-13: il compagno caduto è fuori dagli scontri seguenti e ne perde gli xp; mai caduto o caduto nell'ultimo = tutti i nemici, chiave assente
export function companionEnemiesXpOf(
    fights: readonly CompanionFight[],
): Pick<ParticipantEffects, 'companionEnemiesXp'> {
    const fall = fights.findIndex(hasFallen);
    if (fall === -1 || fall === fights.length - 1) return {};
    const companionEnemiesXp = fights
        .slice(0, fall + 1)
        .reduce((total, { enemiesXp }) => total + enemiesXp, 0);
    return { companionEnemiesXp };
}
