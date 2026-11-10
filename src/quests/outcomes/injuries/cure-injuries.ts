import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { isInjuryType } from 'src/quests/outcomes/injuries/injury-rules';

// ferite tolte da una cura (Phase 18 D-13): le sole presenti in canHeal, nell'ordine del personaggio; usata dal piano d'esito e dalla bevuta dal Diario
export function cureInjuries(
    injuries: readonly InjuryType[],
    canHeal: readonly unknown[],
): { injuries: InjuryType[]; healed: InjuryType[] } {
    const curable: ReadonlySet<InjuryType> = new Set(
        canHeal.filter(isInjuryType),
    );
    return {
        injuries: injuries.filter((injury) => !curable.has(injury)),
        healed: [...new Set(injuries.filter((injury) => curable.has(injury)))],
    };
}
