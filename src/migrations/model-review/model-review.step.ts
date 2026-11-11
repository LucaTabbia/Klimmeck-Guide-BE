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

export const MODEL_REVIEW_STEPS = Symbol('MODEL_REVIEW_STEPS');

export const MODEL_REVIEW_LOG_PREFIX = 'Revisione dei modelli, ';

export function stepReportLine(
    label: string,
    report: ModelReviewStepReport,
): string {
    return `${MODEL_REVIEW_LOG_PREFIX}${label}: trovati ${report.found}, migrati ${report.migrated}, già a posto ${report.alreadyDone}, senza corrispondenza ${report.unmatched}`;
}

export function stepFailureLine(label: string, reason: string): string {
    return `${MODEL_REVIEW_LOG_PREFIX}${label}: fallito (${reason}), il boot prosegue`;
}
