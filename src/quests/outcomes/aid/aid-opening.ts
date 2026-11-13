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
