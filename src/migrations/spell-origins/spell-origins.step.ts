// UNA TANTUM (Phase 24 D-07, D-20): contratto dei passi delle origini delle magie e righe di log dei conteggi — esce dal repo dopo il boot reale
export interface SpellOriginsStepReport {
    found: number;
    migrated: number;
    alreadyDone: number;
    // anomalie del passo: contate, mai corrette
    unmatched: number;
}

export interface SpellOriginsStep {
    readonly label: string;
    run(): Promise<SpellOriginsStepReport>;
}

const SPELL_ORIGINS_NAME = 'Origini delle magie';

export const SPELL_ORIGINS_LOG_PREFIX = `${SPELL_ORIGINS_NAME}, `;

export function stepReportLine(
    label: string,
    report: SpellOriginsStepReport,
): string {
    return `${SPELL_ORIGINS_LOG_PREFIX}${label}: trovati ${report.found}, migrati ${report.migrated}, già a posto ${report.alreadyDone}, senza corrispondenza ${report.unmatched}`;
}

export function stepFailureLine(label: string, reason: string): string {
    return `${SPELL_ORIGINS_LOG_PREFIX}${label}: fallito (${reason}), il boot si ferma`;
}

export interface BootAbort {
    completed: number;
    total: number;
    failedLabel: string;
}

export function bootAbortedLine(abort: BootAbort): string {
    const notRun = abort.total - abort.completed - 1;
    return `${SPELL_ORIGINS_LOG_PREFIX}boot interrotto: passi conclusi ${abort.completed} su ${abort.total}, fallito «${abort.failedLabel}», non eseguiti ${notRun}`;
}

export function bootAbortedMessage(failedLabel: string): string {
    return `${SPELL_ORIGINS_NAME}: boot interrotto dal passo «${failedLabel}»`;
}

// condizione di scrittura sul valore letto: un campo assente alla lettura deve esserlo ancora
export function asRead(value: unknown): unknown {
    return value === undefined ? { $exists: false } : value;
}

// il documento è cambiato fra la lettura e la scrittura del passo: resta com'è e la guardia lo ritrova al prossimo boot
export function writeNotAppliedLine(
    label: string,
    subject: string,
    id: string,
): string {
    return `${SPELL_ORIGINS_LOG_PREFIX}${label}: ${subject} ${id} cambiato durante il passo, scrittura non applicata`;
}
