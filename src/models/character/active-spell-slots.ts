import { TitleType } from '../enums/title-type.enum';

// un'unica tabella delle soglie (04 D-11): la virtual e il filtro di equipSpell non possono divergere
export const ACTIVE_SPELL_SLOT_THRESHOLDS = [
    { minXp: 40000, slots: 4 },
    { minXp: 30000, slots: 3 },
    { minXp: 25000, slots: 2 },
    { minXp: 20000, slots: 1 },
] as const;

// soglie XP invariate (04 D-11); dal rango mage in su (D-13): sotto mage nessuno slot
export const SPELL_CASTER_TITLES = [
    TitleType.mage,
    TitleType.hero,
    TitleType.legend,
] as const;

export function isSpellCaster(title: TitleType | null | undefined): boolean {
    return (
        !!title && (SPELL_CASTER_TITLES as readonly TitleType[]).includes(title)
    );
}

export function maxActiveSpellsFor(
    xp: number,
    title: TitleType | null | undefined,
): number {
    if (!isSpellCaster(title)) return 0;
    return (
        ACTIVE_SPELL_SLOT_THRESHOLDS.find(({ minXp }) => xp >= minXp)?.slots ??
        0
    );
}

// valutata sul documento vivo nello stesso update (04 RESEARCH Q3): titolo e xp letti dal documento, niente snapshot
export function maxActiveSpellsExpression() {
    return {
        $cond: [
            {
                $in: [
                    { $ifNull: ['$status.title', null] },
                    [...SPELL_CASTER_TITLES],
                ],
            },
            {
                $switch: {
                    branches: ACTIVE_SPELL_SLOT_THRESHOLDS.map(
                        ({ minXp, slots }) => ({
                            case: {
                                $gte: [{ $ifNull: ['$status.xp', 0] }, minXp],
                            },
                            then: slots,
                        }),
                    ),
                    default: 0,
                },
            },
            0,
        ],
    };
}
