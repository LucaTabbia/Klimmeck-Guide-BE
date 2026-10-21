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

export function slotsOf(_value: unknown): RankSlot[] | 'invalid' {
    throw new Error('not implemented');
}

export function slotRuleOf(_slots: readonly RankSlot[]): SlotRule {
    throw new Error('not implemented');
}

export function hasSeatFor(
    _rule: SlotRule,
    _registered: readonly RegisteredAdventurer[],
    _title: TitleType,
): boolean {
    throw new Error('not implemented');
}

export function isFullForEveryone(
    _rule: SlotRule,
    _registered: readonly RegisteredAdventurer[],
): boolean {
    throw new Error('not implemented');
}

export function seatAvailableExpr(
    _rule: SlotRule,
    _title: TitleType,
): Record<string, unknown> {
    throw new Error('not implemented');
}
