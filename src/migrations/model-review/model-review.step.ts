// UNA TANTUM (Phase 19 D-12): contratto dei passi della revisione dei modelli e riga di log dei conteggi — esce dal repo dopo il boot reale
export interface ModelReviewStepReport {
    found: number;
    migrated: number;
    alreadyDone: number;
    // anomalie del passo: contate, mai corrette
    unmatched: number;
}

export interface ModelReviewStep {
    readonly label: string;
    run(): Promise<ModelReviewStepReport>;
}

const MODEL_REVIEW_NAME = 'Revisione dei modelli';

export const MODEL_REVIEW_LOG_PREFIX = `${MODEL_REVIEW_NAME}, `;

export function stepReportLine(
    label: string,
    report: ModelReviewStepReport,
): string {
    return `${MODEL_REVIEW_LOG_PREFIX}${label}: trovati ${report.found}, migrati ${report.migrated}, già a posto ${report.alreadyDone}, senza corrispondenza ${report.unmatched}`;
}

export function stepFailureLine(label: string, reason: string): string {
    return `${MODEL_REVIEW_LOG_PREFIX}${label}: fallito (${reason}), il boot si ferma`;
}

export interface BootAbort {
    completed: number;
    total: number;
    failedLabel: string;
}

export function bootAbortedLine(abort: BootAbort): string {
    const notRun = abort.total - abort.completed - 1;
    return `${MODEL_REVIEW_LOG_PREFIX}boot interrotto: passi conclusi ${abort.completed} su ${abort.total}, fallito «${abort.failedLabel}», non eseguiti ${notRun}`;
}

export function bootAbortedMessage(failedLabel: string): string {
    return `${MODEL_REVIEW_NAME}: boot interrotto dal passo «${failedLabel}»`;
}
