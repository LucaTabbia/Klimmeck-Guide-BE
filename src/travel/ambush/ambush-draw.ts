// sorteggio km per km (D-01): km interi fino a ⌈distance⌉ − 1, nessuna imboscata con at ≥ endTime (C8); nessun tiro sotto soglia (D-03): le sequenze dei test non si spostano
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { AMBUSH_RULES, hazardAt } from './ambush-rules';

export interface DrawnAmbush {
    at: Date;
    km: number;
}

export interface AmbushDrawInput {
    road: { distance: number };
    startTime: Date;
    durationMs: number;
    // 0 alla partenza, km dell'ultima imboscata dopo una vittoria (D-02)
    fromKm: number;
    chance: ChanceSource;
    hourOf: (instant: Date) => number;
}

export function drawAmbush(input: AmbushDrawInput): DrawnAmbush | null {
    const { distance } = input.road;
    const threshold =
        input.fromKm === 0
            ? AMBUSH_RULES.minTravelKm
            : AMBUSH_RULES.minRemainingKm;
    if (input.durationMs <= 0 || distance - input.fromKm < threshold) {
        return null;
    }
    for (let km = Math.floor(input.fromKm) + 1; km < distance; km += 1) {
        const at = new Date(
            input.startTime.getTime() +
                Math.floor((km / distance) * input.durationMs),
        );
        if (input.chance.next() < hazardAt(input.hourOf(at))) return { at, km };
    }
    return null;
}
