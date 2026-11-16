import { durationLabelOf } from 'src/push/duration-label';

describe('durationLabelOf', () => {
    it.each([
        [60_000, '1 minuto'],
        [1, '1 minuto'],
        [1_800_000, '30 minuti'],
        [3_600_000, '1 ora'],
        [5_400_000, '1 ora e 30 minuti'],
        [7_260_000, '2 ore e 1 minuto'],
        [43_200_000, '12 ore'],
    ])(
        'writes a learning time in Italian hours and minutes (D-29): %p ms is %p',
        (durationMs, label) => {
            expect(durationLabelOf(durationMs)).toBe(label);
        },
    );
});
