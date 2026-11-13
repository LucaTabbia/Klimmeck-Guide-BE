import { QuestType } from 'src/models/enums/quest-type.enum';

// solo le sconfitte di questi tipi aprono un soccorso; gli altri chiudono a 1 di vita (D-09, D-19)
export const AID_OPENING_TYPES: ReadonlySet<QuestType> = new Set([
    QuestType.enemy,
    QuestType.boss,
    QuestType.hunt,
    QuestType.dungeon,
    QuestType.aid,
]);

export function opensAid(type: QuestType | null | undefined): boolean {
    return type != null && AID_OPENING_TYPES.has(type);
}

// le sole ripetibili che aprono un soccorso: strappate per tutti finché un'aid aperta nasce da loro (quick 261113-aql, supera la D-15 della Phase 21)
export const RESCUE_LOCKED_TYPES: ReadonlySet<QuestType> = new Set([
    QuestType.hunt,
    QuestType.dungeon,
]);

export function locksWhileRescued(type: QuestType | null | undefined): boolean {
    return type != null && RESCUE_LOCKED_TYPES.has(type);
}
