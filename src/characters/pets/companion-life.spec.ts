import { MAX_RECOVERY_VALUE } from 'src/models/loot-item.model';
import {
    companionDisplayName,
    companionLifeAt,
    CompanionLifeInput,
    companionLifeNow,
    companionStoredLifeOf,
    defeatedUntilOf,
    isLegacyCompanionEntry,
    isPetDefeated,
    petRecoveryTimeOf,
} from './companion-life';
import { companionMaxLifeOf } from './companion-level';

const T = 6_000_000;
const MINUTE = 60_000;
const t0 = new Date('2026-11-14T10:00:00.000Z');
const at = (ms: number): Date => new Date(t0.getTime() + ms);

const input = (
    overrides: Partial<CompanionLifeInput> = {},
): CompanionLifeInput => ({
    lifePoints: 20,
    lifeAsOf: t0,
    resting: true,
    maxLifePoints: 100,
    recoveryTimeMs: T,
    now: t0,
    ...overrides,
});

describe('companion life clock', () => {
    it("regains 20 points in 20 minutes from 20 of 100 as in the user's example (D-04)", () => {
        expect(companionLifeAt(input({ now: at(20 * MINUTE) }))).toEqual({
            lifePoints: 40,
            fullLifeAt: at(Math.ceil((80 * T) / 99)),
        });
    });

    it('brings a companion from the floor to full life in exactly the recovery time (D-02, D-24)', () => {
        expect(
            companionLifeAt(input({ lifePoints: 1, now: at(T - 1) })),
        ).toEqual({ lifePoints: 99, fullLifeAt: at(T) });
        expect(companionLifeAt(input({ lifePoints: 1, now: at(T) }))).toEqual({
            lifePoints: 100,
            fullLifeAt: null,
        });
    });

    it('regains nothing while the anchor is still ahead of now, never below the anchor life nor 0 (D-04, D-03)', () => {
        expect(
            companionLifeAt(input({ lifePoints: 1, now: at(-5_000) })),
        ).toEqual({ lifePoints: 1, fullLifeAt: at(T) });
        expect(companionLifeAt(input({ lifePoints: 20, now: at(-T) }))).toEqual(
            { lifePoints: 20, fullLifeAt: at(Math.ceil((80 * T) / 99)) },
        );
    });

    it('never recovers the equipped companion (D-04)', () => {
        expect(
            companionLifeAt(input({ resting: false, now: at(T * 2) })),
        ).toEqual({ lifePoints: 20, fullLifeAt: null });
    });

    it.each([0, -3, null, undefined, 'x', Number.NaN])(
        'reads a legacy life of zero or a non-number as full life (D-23): %p',
        (lifePoints) => {
            expect(
                companionLifeAt(input({ lifePoints, resting: false })),
            ).toEqual({ lifePoints: 100, fullLifeAt: null });
        },
    );

    it('keeps the floor at 1 when the catalogue life is unusable (D-03)', () => {
        expect(
            companionLifeAt(input({ maxLifePoints: null, lifePoints: 0 })),
        ).toEqual({ lifePoints: 1, fullLifeAt: null });
        expect(
            companionLifeAt(input({ maxLifePoints: null, lifePoints: 7 })),
        ).toEqual({ lifePoints: 7, fullLifeAt: null });
    });

    it('clamps a stored life above the maximum (D-03)', () => {
        expect(companionLifeAt(input({ lifePoints: 250 }))).toEqual({
            lifePoints: 100,
            fullLifeAt: null,
        });
    });

    it.each([null, undefined, 0, -1, 1.5, 'x', 2 ** 31])(
        'recovers at once a pet without a curated recovery time (D-25): %p',
        (recoveryTimeMs) => {
            expect(companionLifeAt(input({ recoveryTimeMs }))).toEqual({
                lifePoints: 100,
                fullLifeAt: null,
            });
        },
    );

    it.each([null, new Date('x')])(
        'treats a rest without an anchor date as no rest (D-04): %p',
        (lifeAsOf) => {
            expect(
                companionLifeAt(input({ lifeAsOf, now: at(T * 2) })),
            ).toEqual({ lifePoints: 20, fullLifeAt: null });
        },
    );

    it('tells a defeated companion only while its date is in the future (D-24)', () => {
        expect(isPetDefeated({ defeatedUntil: at(1) }, t0)).toBe(true);
        expect(isPetDefeated({ defeatedUntil: at(0) }, t0)).toBe(false);
        expect(isPetDefeated({ defeatedUntil: at(-1) }, t0)).toBe(false);
        for (const defeatedUntil of [null, undefined, '2026-11-14', {}]) {
            expect(isPetDefeated({ defeatedUntil }, t0)).toBe(false);
        }
        expect(isPetDefeated(null, t0)).toBe(false);
    });

    it('dates the defeat at the recovery time or not at all (D-02, D-25)', () => {
        expect(defeatedUntilOf(t0, T)).toEqual(at(T));
        expect(defeatedUntilOf(t0, null)).toBeNull();
    });

    it('accepts only a positive integer recovery time within the wire cap (D-25)', () => {
        expect(petRecoveryTimeOf(1)).toBe(1);
        expect(petRecoveryTimeOf(MAX_RECOVERY_VALUE)).toBe(MAX_RECOVERY_VALUE);
        for (const value of [0, -1, 1.5, MAX_RECOVERY_VALUE + 1, '5']) {
            expect(petRecoveryTimeOf(value)).toBeNull();
        }
    });

    it('shows the name when given and the species otherwise (D-20)', () => {
        expect(companionDisplayName('Fenrir', 'Worg')).toBe('Fenrir');
        expect(companionDisplayName('', 'Worg')).toBe('Worg');
        expect(companionDisplayName('   ', 'Worg')).toBe('Worg');
        expect(companionDisplayName(null, 'Worg')).toBe('Worg');
        expect(companionDisplayName(null, null)).toBe('Compagno');
    });

    it('reads the life of an equipped companion with the same floor and legacy rules (D-03, D-23)', () => {
        expect(companionLifeNow(40, 80)).toBe(40);
        expect(companionLifeNow(250, 80)).toBe(80);
        expect(companionLifeNow(0, 80)).toBe(80);
        expect(companionLifeNow('x', 80)).toBe(80);
        expect(companionLifeNow(0, null)).toBe(1);
        expect(companionLifeNow(40, null)).toBe(40);
        expect(companionLifeNow(40, 80)).toBe(
            companionLifeAt(
                input({ lifePoints: 40, resting: false, maxLifePoints: 80 }),
            ).lifePoints,
        );
    });

    describe('entries written before the phase', () => {
        const pet = { maxXp: 100, maxLifePoints: 100 };
        const legacyEntry: {
            xp: number;
            currentLifePoints: number;
            level?: number;
        } = { xp: 22, currentLifePoints: 100 };

        it.each([true, false])(
            'reads an entry never touched by the phase at full life at the companion maximum (D-23, D-38): resting %p',
            (resting) => {
                const max = companionMaxLifeOf(legacyEntry, pet);
                expect(max).toBe(122);
                expect(isLegacyCompanionEntry(legacyEntry)).toBe(true);
                const lifePoints = companionStoredLifeOf(legacyEntry, max);
                expect(lifePoints).toBe(122);
                expect(
                    companionLifeAt(
                        input({
                            lifePoints,
                            lifeAsOf: undefined,
                            resting,
                            maxLifePoints: max,
                        }),
                    ),
                ).toEqual({ lifePoints: 122, fullLifeAt: null });
            },
        );

        it('stops reading the entry as legacy once it has a saved level (D-23, D-38)', () => {
            const entry = { ...legacyEntry, level: 5 };
            const max = companionMaxLifeOf(entry, pet);
            expect(isLegacyCompanionEntry(entry)).toBe(false);
            expect(max).toBe(122);
            expect(companionStoredLifeOf(entry, max)).toBe(100);
        });

        it('keeps the saved life of an entry with a level and no anchor (D-23, D-38)', () => {
            const entry = { level: 3, currentLifePoints: 40 };
            const max = companionMaxLifeOf(entry, pet);
            const lifePoints = companionStoredLifeOf(entry, max);
            expect(lifePoints).toBe(40);
            expect(
                companionLifeAt(
                    input({ lifePoints, resting: false, maxLifePoints: max }),
                ),
            ).toEqual({ lifePoints: 40, fullLifeAt: null });
        });

        it('treats an entry with an anchor as not legacy (D-23)', () => {
            const entry = { xp: 22, currentLifePoints: 30, lifeAsOf: t0 };
            expect(isLegacyCompanionEntry(entry)).toBe(false);
            expect(
                companionStoredLifeOf(entry, companionMaxLifeOf(entry, pet)),
            ).toBe(30);
        });
    });
});
