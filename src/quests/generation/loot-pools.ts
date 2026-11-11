import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { GeneratedRank } from 'src/quests/generation/generation-rules';

// modulo foglia: tabelle e primitive del loot condivise da premi e pet in premio, senza import fra i due
export type GeneratedQuestType = QuestType.enemy | QuestType.boss;

export interface LootSlot {
    rarity: RarityType;
    min: number;
    max: number;
}

const slot = (rarity: RarityType, min: number, max = min): LootSlot => ({
    rarity,
    min,
    max,
});

const HERO_BOSS_POOL: readonly LootSlot[] = [
    slot(RarityType.legendary, 1),
    slot(RarityType.ultrarare, 2),
    slot(RarityType.rare, 4),
];

// pool ampi per tipo e rango: legendary solo dai boss hero (D-20)
export const LOOT_POOLS: Readonly<
    Record<
        GeneratedQuestType,
        Readonly<Record<GeneratedRank, readonly LootSlot[]>>
    >
> = {
    [QuestType.boss]: {
        hero: HERO_BOSS_POOL,
        mage: [
            slot(RarityType.ultrarare, 1),
            slot(RarityType.rare, 2),
            slot(RarityType.uncommon, 4),
        ],
        paladin: [
            slot(RarityType.rare, 1),
            slot(RarityType.uncommon, 2),
            slot(RarityType.common, 4),
        ],
        adventurer: [slot(RarityType.uncommon, 1), slot(RarityType.common, 4)],
        rookie: [slot(RarityType.common, 2)],
    },
    [QuestType.enemy]: {
        hero: [slot(RarityType.ultrarare, 1), slot(RarityType.rare, 2)],
        mage: [slot(RarityType.rare, 1), slot(RarityType.uncommon, 2)],
        paladin: [slot(RarityType.uncommon, 1), slot(RarityType.common, 2)],
        adventurer: [slot(RarityType.common, 1, 2)],
        rookie: [slot(RarityType.common, 1, 2)],
    },
};

export const RARITY_RANK: Readonly<Record<RarityType, number>> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    ultrarare: 3,
    legendary: 4,
};

export const indexOf = (length: number, chance: ChanceSource): number =>
    Math.min(length - 1, Math.floor(chance.next() * length));
