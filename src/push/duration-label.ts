const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MIN_MINUTES = 1;

function countLabel(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

// durata in italiano per i corpi dei push (Phase 24 D-29): minuti arrotondati al più vicino, mai sotto un minuto
export function durationLabelOf(durationMs: number): string {
    const totalMinutes = Math.max(
        MIN_MINUTES,
        Math.round(durationMs / MS_PER_MINUTE),
    );
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const minutes = totalMinutes % MINUTES_PER_HOUR;
    const parts = [
        hours > 0 ? countLabel(hours, 'ora', 'ore') : null,
        minutes > 0 ? countLabel(minutes, 'minuto', 'minuti') : null,
    ].filter((part): part is string => part !== null);
    return parts.join(' e ');
}
