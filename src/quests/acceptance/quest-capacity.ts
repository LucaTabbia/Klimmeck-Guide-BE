import { TitleType } from 'src/models/enums/title-type.enum';

export interface RankSlot {
    title: TitleType | null;
    count: number;
}

export interface SlotRule {
    seats: Partial<Record<TitleType, number>>;
    wildcard: number;
    total: number;
}

export interface RegisteredAdventurer {
    character: unknown;
    title: TitleType;
}

const TITLES: readonly TitleType[] = Object.values(TitleType);
const KNOWN_TITLES: ReadonlySet<string> = new Set(TITLES);

// fail-closed (D-27, C2): assente, vuoto, numerico legacy o uno slot non valido ⇒ la quest registrata non è accettabile
export function slotsOf(value: unknown): RankSlot[] | 'invalid' {
    if (!Array.isArray(value) || value.length === 0) return 'invalid';
    const slots: RankSlot[] = [];
    for (const item of value) {
        const slot = rankSlotOf(item);
        if (slot === null) return 'invalid';
        slots.push(slot);
    }
    return slots;
}

export function slotRuleOf(slots: readonly RankSlot[]): SlotRule {
    const rule: SlotRule = { seats: {}, wildcard: 0, total: 0 };
    for (const { title, count } of slots) {
        if (title === null) rule.wildcard += count;
        else rule.seats[title] = (rule.seats[title] ?? 0) + count;
        rule.total += count;
    }
    return rule;
}

// D-32, unico riferimento BE/FE: gli slot esatti si riempiono prima dei jolly; overflow = Σ_U max(0, reg(U) − exact(U))
export function hasSeatFor(
    rule: SlotRule,
    registered: readonly RegisteredAdventurer[],
    title: TitleType,
): boolean {
    const counts = registeredCountsOf(registered);
    if (counts[title] < (rule.seats[title] ?? 0)) return true;
    return overflowOf(rule, counts) < rule.wildcard;
}

export function isFullForEveryone(
    rule: SlotRule,
    registered: readonly RegisteredAdventurer[],
): boolean {
    const counts = registeredCountsOf(registered);
    const taken = TITLES.reduce((sum, title) => sum + counts[title], 0);
    return taken >= rule.total;
}

// specchio esatto di hasSeatFor riaffermato nel filtro di registrazione (Phase 7 D-18): due accettazioni sull'ultimo posto ⇒ un solo successo
export function seatAvailableExpr(
    rule: SlotRule,
    title: TitleType,
): Record<string, unknown> {
    const own = { $lt: [countOf(title), rule.seats[title] ?? 0] };
    if (rule.wildcard === 0) return own;
    const overflow = {
        $add: TITLES.map((u) => ({
            $max: [0, { $subtract: [countOf(u), rule.seats[u] ?? 0] }],
        })),
    };
    return { $or: [own, { $lt: [overflow, rule.wildcard] }] };
}

function rankSlotOf(item: unknown): RankSlot | null {
    if (typeof item !== 'object' || item === null) return null;
    const { title, count } = item as { title?: unknown; count?: unknown };
    if (
        typeof count !== 'number' ||
        !Number.isSafeInteger(count) ||
        count < 1
    ) {
        return null;
    }
    if (title === undefined || title === null) return { title: null, count };
    if (typeof title !== 'string' || !KNOWN_TITLES.has(title)) return null;
    return { title: title as TitleType, count };
}

function registeredCountsOf(
    registered: readonly RegisteredAdventurer[],
): Record<TitleType, number> {
    const counts = Object.fromEntries(
        TITLES.map((title) => [title, 0]),
    ) as Record<TitleType, number>;
    for (const { title } of registered) {
        if (KNOWN_TITLES.has(title)) counts[title] += 1;
    }
    return counts;
}

function overflowOf(rule: SlotRule, counts: Record<TitleType, number>): number {
    return TITLES.reduce(
        (sum, title) =>
            sum + Math.max(0, counts[title] - (rule.seats[title] ?? 0)),
        0,
    );
}

function countOf(title: TitleType) {
    return {
        $size: {
            $filter: {
                input: { $ifNull: ['$registeredAdventurers', []] },
                as: 'adventurer',
                cond: { $eq: ['$$adventurer.title', title] },
            },
        },
    };
}
