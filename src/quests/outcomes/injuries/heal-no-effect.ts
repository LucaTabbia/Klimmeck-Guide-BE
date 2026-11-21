// heal senza effetto (Phase 18 D-25): vita già al tetto della quest e nessuna ferita curabile, e una ferita dell'oste non è mai curabile (Phase 25 D-14); senza cura non ha effetto per nessuno; un solo predicato per il rifiuto di acceptQuest e per il campo Quest.noEffect
import { cureInjuries } from 'src/quests/outcomes/injuries/cure-injuries';
import { isInjuryType } from 'src/quests/outcomes/injuries/injury-rules';
import { innkeeperInjuriesOf } from 'src/quests/outcomes/injuries/innkeeper-injuries';
import { cureOf } from 'src/quests/outcomes/injuries/quest-cure';

export interface HealSubject {
    currentLifePoints: number;
    maxLifePoints: number;
    injuries: readonly unknown[];
    // ferite dell'oste del personaggio come lette a DB (Phase 25 D-14): chiave obbligatoria, valore tollerante
    innkeeperInjuries: readonly unknown[] | null | undefined;
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
        innkeeperInjuriesOf(character),
    );
    return character.currentLifePoints >= ceiling && healed.length === 0;
}
