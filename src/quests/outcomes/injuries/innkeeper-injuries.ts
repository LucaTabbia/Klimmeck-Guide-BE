import type { InjuryType } from 'src/models/enums/injury-type.enum';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
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

export type WoundEffects = Pick<
    ParticipantEffects,
    'injuriesAdded' | 'injuriesRemoved' | 'innkeeperInjuries'
>;

export interface CorrectedWounds {
    injuries: InjuryType[];
    innkeeperInjuries: InjuryType[];
    // tipi assenti prima e presenti dopo
    added: InjuryType[];
    // tipi presenti prima e assenti dopo
    removed: InjuryType[];
}

// le stringhe legacy sconosciute restano dove sono, come in woundsAfter
function carriedWoundsOf(status: WoundStatus): InjuryType[] {
    return [...(status.injuries ?? [])] as InjuryType[];
}

function knownTypesOf(injuries: readonly InjuryType[]): InjuryType[] {
    return [...new Set(injuries)].filter(isInjuryType);
}

function without(
    injuries: readonly InjuryType[],
    excluded: readonly InjuryType[],
): InjuryType[] {
    return injuries.filter((injury) => !excluded.includes(injury));
}

// una correzione dell'oste sulle ferite (Phase 25 D-12, D-13, D-16): prima toglie, poi aggiunge; null = nessun combattimento
export function applyWoundCorrection(
    status: WoundStatus,
    effects: WoundEffects | null,
): CorrectedWounds {
    const carried = carriedWoundsOf(status);
    const innkeeperInjuries = innkeeperInjuriesOf(status);
    if (effects === null) {
        return { injuries: carried, innkeeperInjuries, added: [], removed: [] };
    }
    const takenOff = knownTypesOf(effects.injuriesRemoved ?? []).filter(
        (injury) => carried.includes(injury),
    );
    const kept = without(carried, takenOff);
    const fresh = without(knownTypesOf(effects.injuriesAdded), kept);
    const byHand = effects.innkeeperInjuries ?? [];
    return {
        injuries: [...kept, ...fresh],
        innkeeperInjuries: [
            ...without(innkeeperInjuries, takenOff),
            ...fresh.filter((injury) => byHand.includes(injury)),
        ],
        added: without(fresh, carried),
        removed: without(takenOff, fresh),
    };
}

// effetti raccontati dall'oste senza simulazione: ogni ferita aggiunta è di suo pugno (Phase 25 D-12); null resta null
export function asInnkeeperHand(
    effects: ParticipantEffects | null,
): ParticipantEffects | null {
    if (effects === null || effects.injuriesAdded.length === 0) return effects;
    return { ...effects, innkeeperInjuries: [...effects.injuriesAdded] };
}

// ferite di pugno dell'oste in uno scontro corretto (Phase 25 D-12, D-16): aggiunte dal corretto e non dal simulato, oppure tolte e riaggiunte
export function handInflictedOf(
    corrected: WoundEffects,
    simulatedAdded: readonly InjuryType[],
): InjuryType[] {
    const removed = corrected.injuriesRemoved ?? [];
    return [...new Set(corrected.injuriesAdded)].filter(
        (injury) =>
            !simulatedAdded.includes(injury) || removed.includes(injury),
    );
}
