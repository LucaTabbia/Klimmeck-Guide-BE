import {
    ContentConfig,
    ContentTier,
    FixedQuestType,
    RankedTier,
    RANKED_TIERS,
} from 'src/content/rules/content-config';
import { CoinPurse, fromCopper } from 'src/economy/coins';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { RARITY_ORDER } from 'src/quests/outcomes/rewards/cascading-loot';

const MS_PER_HOUR = 3_600_000;

// legend è la fascia delle schede leggendarie: nessuna quest fissa la usa come minTitle
function rankedTierOf(tier: ContentTier): RankedTier {
    const ranked = RANKED_TIERS.find((candidate) => candidate === tier);
    if (!ranked) throw new RangeError(`Fascia senza premio: ${tier}`);
    return ranked;
}

function multiplierOf(tier: ContentTier, config: ContentConfig): number {
    return config.tierMultiplier[rankedTierOf(tier)];
}

export function questPrizeCoins(
    type: FixedQuestType,
    tier: ContentTier,
    config: ContentConfig,
): CoinPurse {
    return fromCopper(
        Math.round(config.prizes[type].copper * multiplierOf(tier, config)),
    );
}

export function questXpPrize(
    type: FixedQuestType,
    tier: ContentTier,
    config: ContentConfig,
): number {
    return Math.round(config.prizes[type].xp * multiplierOf(tier, config));
}

// Quest.infos.timeToComplete è in millisecondi (Pitfall 4): il config parla in ore
export function timeToCompleteMs(
    type: FixedQuestType,
    config: ContentConfig,
): number {
    return Math.round(config.timeToCompleteHours[type] * MS_PER_HOUR);
}

export function dungeonLootRarity(
    tier: ContentTier,
    config: ContentConfig,
): RarityType {
    return config.dungeonLootRarity[rankedTierOf(tier)] as RarityType;
}

// RARITY_ORDER va dalla più rara alla più comune: il rango cresce con la rarità
export function rarityRankOf(rarity: unknown): number | null {
    const index = RARITY_ORDER.findIndex((known) => known === rarity);
    return index < 0 ? null : RARITY_ORDER.length - 1 - index;
}

export function marchMinutesOf(power: number, config: ContentConfig): number {
    return Math.round(power * config.food.minutesPerPower);
}
