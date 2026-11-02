import {
    FIXED_QUEST_TYPES,
    RANKED_TIERS,
} from 'src/content/rules/content-config';
import type {
    FixedQuestType,
    RankedTier,
} from 'src/content/rules/content-config';
import {
    AssetQuantityEntry,
    CoinsEntry,
    Flag,
    IdField,
    IdList,
    IntBetween,
    Nested,
    NestedList,
    Nullable,
    OneOf,
    Optional,
    OptionalNullable,
    Text,
} from 'src/content/schema/common.content';

// i tipi fissi della fase vivono col config che ne prezza i premi: qui si riesportano per chi valida le quest
export { FIXED_QUEST_TYPES };

export class QuestInfosEntry {
    @Text()
    title: string;

    @OneOf(FIXED_QUEST_TYPES)
    type: FixedQuestType;

    @Nullable()
    @IdField()
    enemy: string | null;

    @IdField()
    markerLocation: string;

    @IdList()
    relatedLore: string[];

    @Optional()
    @IntBetween(1)
    timeToComplete?: number;
}

export class QuestRequirementsEntry {
    @OneOf(RANKED_TIERS)
    minTitle: RankedTier;

    @NestedList(() => AssetQuantityEntry)
    recommendedLoot: AssetQuantityEntry[];
}

export class QuestPrizesEntry {
    @NestedList(() => AssetQuantityEntry)
    randomLoot: AssetQuantityEntry[];

    @OptionalNullable()
    @Nested(() => AssetQuantityEntry)
    prizeItem?: AssetQuantityEntry | null;

    @OptionalNullable()
    @IdField()
    spell?: string | null;

    // D-31: la study di Valantar sorteggia la magia alla risoluzione
    @Optional()
    @Flag()
    spellDraw?: boolean;

    @Optional()
    @Nested(() => CoinsEntry)
    prizeCoins?: CoinsEntry;

    @Optional()
    @IntBetween(0)
    xpPrize?: number;
}

export class QuestEntry {
    @IdField()
    id: string;

    // solo file: città della quest, usata dai controlli su marker e generatore
    @IdField()
    city: string;

    @Nested(() => QuestInfosEntry)
    infos: QuestInfosEntry;

    @Nested(() => QuestRequirementsEntry)
    requirements: QuestRequirementsEntry;

    @Nested(() => QuestPrizesEntry)
    prizes: QuestPrizesEntry;
}
