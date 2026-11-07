import { hourFormatterOf, localHourOf } from 'src/travel/ambush/ambush-clock';

const ROME_PROBES = [
    '2026-03-29T00:59:00Z',
    '2026-03-29T01:00:00Z',
    '2026-10-25T00:59:00Z',
    '2026-10-25T01:00:00Z',
    '2026-07-01T20:00:00Z',
    '2026-07-01T04:00:00Z',
    '2026-01-01T05:00:00Z',
    '2026-01-01T21:00:00Z',
    '2026-11-06T23:30:00Z',
];

describe('ambush clock', () => {
    it('reads the local hour in Rome across the daylight saving changes (D-01)', () => {
        const formatter = hourFormatterOf('Europe/Rome');

        expect(
            ROME_PROBES.map((iso) => localHourOf(formatter, new Date(iso))),
        ).toEqual([1, 3, 2, 2, 22, 6, 6, 22, 0]);
    });

    it('reads the local hour in another zone (D-01)', () => {
        const instant = new Date('2026-07-01T20:00:00Z');

        expect(localHourOf(hourFormatterOf('UTC'), instant)).toBe(20);
        expect(localHourOf(hourFormatterOf('America/New_York'), instant)).toBe(
            16,
        );
    });
});
