// cura letta dal premio di una quest (Phase 18 D-01, D-23): assente o malformata = nessuna cura; quota fuori scala = solo ferite, mai la cura piena
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { isInjuryType } from 'src/quests/outcomes/injuries/injury-rules';
import { lifePointsWithin } from 'src/quests/outcomes/progression/level-table';

export interface Cure {
    lifePointsShare: number;
    canHeal: InjuryType[];
}

const isShare = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;

// il contenuto può arrivare dal driver nativo o da update senza validatori (Pitfall 1 e 2)
export function cureOf(raw: unknown): Cure | null {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const { lifePointsShare, canHeal } = raw as Record<string, unknown>;
    return {
        lifePointsShare: isShare(lifePointsShare) ? lifePointsShare : 0,
        canHeal: Array.isArray(canHeal) ? canHeal.filter(isInjuryType) : [],
    };
}

// tetto, non incremento (D-02): si calcola sul massimo dopo la progressione
export const lifePointsAfterCure = (
    hp: number,
    max: number,
    share: number,
): number => lifePointsWithin(Math.max(hp, Math.round(max * share)), max);
