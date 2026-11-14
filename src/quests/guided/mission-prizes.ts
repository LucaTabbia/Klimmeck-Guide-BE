import { isSpellCaster } from 'src/models/character/active-spell-slots';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { refIdOf } from 'src/mongo/document-id';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    GeneratedRank,
    isGeneratedRank,
} from 'src/quests/generation/generation-rules';
import {
    GeneratedQuestType,
    RARITY_RANK,
} from 'src/quests/generation/loot-pools';
import { petRarityCapOf } from 'src/quests/generation/pet-prize';
import {
    PrizesSnapshot,
    validRewardItems,
} from 'src/quests/outcomes/rewards/quest-rewards';

// rarità e xp curati a mano a DB: letti lean, quindi non tipizzati (fail-closed)
export interface PrizeCatalogueEntry {
    id: string;
    rarity: string | null;
}

export interface SpellCatalogueEntry {
    id: string;
    minXpToLearn: unknown;
}

export interface MissionPrizeCatalogue {
    equipment: PrizeCatalogueEntry[];
    loot: PrizeCatalogueEntry[];
    pets: PrizeCatalogueEntry[];
    spells: SpellCatalogueEntry[];
}

// id esadecimali ordinati
export interface MissionPrizeAllowance {
    maxRarity: RarityType;
    equipmentIds: string[];
    lootIds: string[];
    petIds: string[];
    spellIds: string[];
}

export interface MissionPrizeOptionsInput {
    block: PrizesSnapshot | null;
    questType: QuestType;
    title: TitleType;
    xp: number;
    knownSpellIds: readonly string[];
    catalogue: MissionPrizeCatalogue;
}

export interface ChosenPrizeRefs {
    items: { itemType: string; item: string }[];
    pet: string | null;
    spell: string | null;
}

const RARITIES: readonly string[] = Object.values(RarityType);

const isRarity = (rarity: string | null): rarity is RarityType =>
    rarity !== null && RARITIES.includes(rarity);

// worldMission come i premi di gruppo, story come la solitaria (Phase 21)
export function ceilingTableOf(questType: QuestType): GeneratedQuestType {
    return questType === QuestType.worldMission
        ? QuestType.boss
        : QuestType.enemy;
}

// legend gioca le hero (13.1 D-02), un titolo assente le rookie
function rankOf(title: TitleType | null | undefined): GeneratedRank {
    if (title === TitleType.legend) return TitleType.hero;
    return isGeneratedRank(title) ? title : TitleType.rookie;
}

const sortedUnique = (ids: readonly string[]): string[] =>
    [...new Set(ids)].sort();

const hexOf = (value: unknown): string[] => {
    const id = refIdOf(value);
    return id ? [id.toHexString()] : [];
};

function blockItemIds(
    block: PrizesSnapshot | null,
    itemType: 'EquipmentItem' | 'LootItem',
): string[] {
    if (!block) return [];
    return validRewardItems(block)
        .filter((entry) => entry.itemType === itemType)
        .map((entry) => entry.item.toHexString());
}

function underCap(
    entries: readonly PrizeCatalogueEntry[],
    maxRarity: RarityType,
): string[] {
    return entries
        .filter(
            (entry) =>
                isRarity(entry.rarity) &&
                RARITY_RANK[entry.rarity] <= RARITY_RANK[maxRarity],
        )
        .map((entry) => entry.id);
}

function learnableSpells({
    title,
    xp,
    knownSpellIds,
    catalogue,
}: MissionPrizeOptionsInput): string[] {
    if (!isSpellCaster(title)) return [];
    return catalogue.spells
        .filter(
            ({ id, minXpToLearn }) =>
                typeof minXpToLearn === 'number' &&
                Number.isFinite(minXpToLearn) &&
                minXpToLearn <= xp &&
                !knownSpellIds.includes(id),
        )
        .map(({ id }) => id);
}

// D-07, D-22: una sola regola per opzioni e rivalidazione; monete e xp sono liberi (D-15)
export function missionPrizeOptionsOf(
    input: MissionPrizeOptionsInput,
): MissionPrizeAllowance {
    const { block, questType, title, catalogue } = input;
    const maxRarity = petRarityCapOf(ceilingTableOf(questType), rankOf(title));
    return {
        maxRarity,
        equipmentIds: sortedUnique([
            ...blockItemIds(block, 'EquipmentItem'),
            ...underCap(catalogue.equipment, maxRarity),
        ]),
        lootIds: sortedUnique([
            ...blockItemIds(block, 'LootItem'),
            ...underCap(catalogue.loot, maxRarity),
        ]),
        petIds: sortedUnique([
            ...hexOf(block?.pet),
            ...underCap(catalogue.pets, maxRarity),
        ]),
        spellIds: sortedUnique([
            ...hexOf(block?.spell),
            ...learnableSpells(input),
        ]),
    };
}

function allowedItemIdsOf(
    itemType: string,
    allowance: MissionPrizeAllowance,
): readonly string[] {
    if (itemType === 'EquipmentItem') return allowance.equipmentIds;
    if (itemType === 'LootItem') return allowance.lootIds;
    return [];
}

export function assertPrizeAllowed(
    prize: ChosenPrizeRefs,
    allowance: MissionPrizeAllowance,
): void {
    const itemsAllowed = prize.items.every(({ itemType, item }) =>
        allowedItemIdsOf(itemType, allowance).includes(item),
    );
    const petAllowed =
        prize.pet === null || allowance.petIds.includes(prize.pet);
    const spellAllowed =
        prize.spell === null || allowance.spellIds.includes(prize.spell);
    if (!itemsAllowed || !petAllowed || !spellAllowed) {
        throw GameRuleException.outcomeOverrideInvalid();
    }
}
