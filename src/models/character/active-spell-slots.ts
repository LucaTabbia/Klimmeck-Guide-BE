// un'unica tabella delle soglie (04 D-11): la virtual e il filtro di equipSpell non possono divergere
export const ACTIVE_SPELL_SLOT_THRESHOLDS = [
    { minXp: 40000, slots: 4 },
    { minXp: 30000, slots: 3 },
    { minXp: 25000, slots: 2 },
    { minXp: 20000, slots: 1 },
] as const;

export function maxActiveSpellsFor(xp: number): number {
    return (
        ACTIVE_SPELL_SLOT_THRESHOLDS.find(({ minXp }) => xp >= minXp)?.slots ??
        0
    );
}

// valutata sul documento vivo nello stesso update: niente snapshot di xp (RESEARCH Q3)
export function maxActiveSpellsExpression() {
    return {
        $switch: {
            branches: ACTIVE_SPELL_SLOT_THRESHOLDS.map(({ minXp, slots }) => ({
                case: { $gte: [{ $ifNull: ['$status.xp', 0] }, minXp] },
                then: slots,
            })),
            default: 0,
        },
    };
}
