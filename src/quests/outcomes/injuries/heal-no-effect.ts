// heal senza effetto (Phase 18 D-25): vita già al tetto della quest e nessuna ferita curabile; senza cura non ha effetto per nessuno; un solo predicato per il rifiuto di acceptQuest e per il campo Quest.noEffect
import { cureInjuries } from 'src/quests/outcomes/injuries/cure-injuries';
import { isInjuryType } from 'src/quests/outcomes/injuries/injury-rules';
import { cureOf } from 'src/quests/outcomes/injuries/quest-cure';

export interface HealSubject {
    currentLifePoints: number;
    maxLifePoints: number;
    injuries: readonly unknown[];
}

export function healHasNoEffect(
    character: HealSubject,
    cure: unknown,
): boolean {
    const sanitized = cureOf(cure);
    if (sanitized === null) {
        return true;
    }
    const ceiling = Math.round(
        character.maxLifePoints * sanitized.lifePointsShare,
    );
    const { healed } = cureInjuries(
        character.injuries.filter(isInjuryType),
        sanitized.canHeal,
    );
    return character.currentLifePoints >= ceiling && healed.length === 0;
}
