// hourCycle h23: su ICU vecchi hour12 false dava 24 a mezzanotte (Pitfall 2); il formatter si costruisce una volta e si riusa
export const hourFormatterOf = (timeZone: string): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        hourCycle: 'h23',
    });

export const localHourOf = (
    formatter: Intl.DateTimeFormat,
    instant: Date,
): number =>
    Number(
        formatter.formatToParts(instant).find(({ type }) => type === 'hour')
            ?.value ?? 0,
    );
