import type { TitleType } from 'src/models/enums/title-type.enum';
import { levelRowFor } from './level-table';

export interface StatusSnapshot {
    status: {
        xp?: number;
        level?: number;
        title: TitleType;
        currentLifePoints?: number;
        maxLifePoints?: number;
    };
}

export interface StatusFacts {
    xp: number;
    level: number;
    title: TitleType;
    currentLifePoints: number;
    maxLifePoints: number;
}

// valori "prima" di combattimento e foglio esiti: i campi mancanti di un legacy si leggono dalla tabella unica
export function statusFactsOf(snapshot: StatusSnapshot): StatusFacts {
    const { status } = snapshot;
    const xp = status.xp ?? 0;
    const row = levelRowFor(xp);
    const maxLifePoints = status.maxLifePoints ?? row.maxLifePoints;
    return {
        xp,
        level: status.level ?? row.level,
        title: status.title,
        currentLifePoints: status.currentLifePoints ?? maxLifePoints,
        maxLifePoints,
    };
}
