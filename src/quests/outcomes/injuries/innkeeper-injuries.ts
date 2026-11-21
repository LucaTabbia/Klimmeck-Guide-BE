import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { isInjuryType } from 'src/quests/outcomes/injuries/injury-rules';

export interface WoundStatus {
    injuries?: readonly unknown[] | null;
    innkeeperInjuries?: readonly unknown[] | null;
}

// ferite che solo l'oste toglie (Phase 25 D-11, D-16): tipi noti, senza doppioni, presenti fra le ferite; campo assente = nessuna
export function innkeeperInjuriesOf(status: WoundStatus): InjuryType[] {
    const carried: ReadonlySet<unknown> = new Set(status.injuries ?? []);
    return [...new Set(status.innkeeperInjuries ?? [])]
        .filter(isInjuryType)
        .filter((injury) => carried.has(injury));
}
