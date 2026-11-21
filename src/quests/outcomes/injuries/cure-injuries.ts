import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { isInjuryType } from 'src/quests/outcomes/injuries/injury-rules';

// ferite tolte da una cura (Phase 18 D-13): le sole presenti in canHeal, nell'ordine del personaggio; quelle dell'oste restano tutte e non contano fra le guarite (Phase 25 D-11, D-14)
export function cureInjuries(
    injuries: readonly InjuryType[],
    canHeal: readonly unknown[],
    untouchable: readonly InjuryType[] = [],
): { injuries: InjuryType[]; healed: InjuryType[] } {
    const protectedTypes: ReadonlySet<unknown> = new Set(untouchable);
    const curable: ReadonlySet<InjuryType> = new Set(
        canHeal
            .filter(isInjuryType)
            .filter((injury) => !protectedTypes.has(injury)),
    );
    return {
        injuries: injuries.filter((injury) => !curable.has(injury)),
        healed: [...new Set(injuries.filter((injury) => curable.has(injury)))],
    };
}
