import { COMPANION_LIFE_FLOOR } from 'src/characters/pets/companion-life';
import type { ParticipantEffects } from '../combat/combat-resolver';

// uno scontro visto dal compagno di un partecipante: una tappa, uno scontro della missione guidata o una sequenza già fusa, che porta la sua quota se il compagno ci è caduto
export interface CompanionFight
    extends Pick<
        ParticipantEffects,
        'companionLifeAfter' | 'companionEnemiesXp'
    > {
    enemiesXp: number;
}

const hasFallen = ({ companionLifeAfter }: CompanionFight): boolean =>
    companionLifeAfter !== undefined &&
    companionLifeAfter <= COMPANION_LIFE_FLOOR;

export const companionFightOf = (
    effects: ParticipantEffects | null,
    enemiesXp: number,
): CompanionFight => ({
    enemiesXp,
    ...(effects?.companionLifeAfter === undefined
        ? {}
        : { companionLifeAfter: effects.companionLifeAfter }),
    ...(effects?.companionEnemiesXp === undefined
        ? {}
        : { companionEnemiesXp: effects.companionEnemiesXp }),
});

// D-13: il compagno prende gli xp dei soli scontri da cui esce in piedi, non quelli dello scontro in cui cade né dei seguenti; mai caduto = tutti i nemici, chiave assente
export function companionEnemiesXpOf(
    fights: readonly CompanionFight[],
): Pick<ParticipantEffects, 'companionEnemiesXp'> {
    const fall = fights.findIndex(hasFallen);
    if (fall === -1) return {};
    const standing = fights
        .slice(0, fall)
        .reduce((total, { enemiesXp }) => total + enemiesXp, 0);
    return {
        companionEnemiesXp: standing + (fights[fall].companionEnemiesXp ?? 0),
    };
}

// gli xp dei nemici che toccano al compagno di uno scontro singolo (una sequenza di uno) o di una sequenza fusa
export function companionShareOf(
    effects: ParticipantEffects | null,
    enemiesXp: number,
): number {
    const { companionEnemiesXp } = companionEnemiesXpOf([
        companionFightOf(effects, enemiesXp),
    ]);
    return companionEnemiesXp ?? enemiesXp;
}
