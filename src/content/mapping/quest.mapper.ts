import type { Document } from 'mongodb';
import {
    MappedDocument,
    toObjectId,
    toObjectIds,
} from 'src/content/mapping/canonical';
import { coinsOf } from 'src/content/mapping/catalog.mapper';
import { ContentConfig } from 'src/content/rules/content-config';
import {
    questPrizeCoins,
    questXpPrize,
    timeToCompleteMs,
} from 'src/content/rules/quest-prizes';
import type { AssetQuantityEntry } from 'src/content/schema/common.content';
import type {
    QuestEntry,
    QuestInfosEntry,
    QuestPrizesEntry,
    QuestRequirementsEntry,
} from 'src/content/schema/quest.content';

// lo stato di gioco della quest nasce vuoto all'inserimento e poi è del server: mai nel set (Pitfall 2)
function runtimeFieldsOnInsert(): Document {
    return {
        registeredAdventurers: [],
        concludedAt: null,
        startedAt: null,
        rescue: null,
    };
}

// itemType prima di item: è il refPath con cui Mongoose risolve il ref (Pitfall 9)
function assetQuantityOf(quantity: AssetQuantityEntry): Document {
    return {
        itemType: quantity.itemType,
        item: toObjectId(quantity.item),
        quantity: quantity.quantity,
    };
}

const idOrNull = (id: string | null | undefined) =>
    typeof id === 'string' ? toObjectId(id) : null;

function infosOf(infos: QuestInfosEntry, config: ContentConfig): Document {
    return {
        timeToComplete:
            infos.timeToComplete ?? timeToCompleteMs(infos.type, config),
        title: infos.title,
        enemy: idOrNull(infos.enemy),
        type: infos.type,
        markerLocation: toObjectId(infos.markerLocation),
        relatedLore: toObjectIds(infos.relatedLore),
    };
}

// D-22: nessuno slot di party né costo in punti sulle quest fisse
function requirementsOf(requirements: QuestRequirementsEntry): Document {
    return {
        requiredPoints: null,
        requiredAdventurers: [],
        recommendedLoot: requirements.recommendedLoot.map(assetQuantityOf),
        minTitle: requirements.minTitle,
    };
}

// D-19: monete e XP dalla tabella del config per il minTitle, salvo override nel file
function prizesOf(entry: QuestEntry, config: ContentConfig): Document {
    const prizes: QuestPrizesEntry = entry.prizes;
    const { type } = entry.infos;
    const tier = entry.requirements.minTitle;
    return {
        prizeCoins: coinsOf(
            prizes.prizeCoins ?? questPrizeCoins(type, tier, config),
        ),
        xpPrize: prizes.xpPrize ?? questXpPrize(type, tier, config),
        prizeItem: prizes.prizeItem ? assetQuantityOf(prizes.prizeItem) : null,
        randomLoot: prizes.randomLoot.map(assetQuantityOf),
        spell: idOrNull(prizes.spell),
        spellDraw: prizes.spellDraw ?? false,
    };
}

export function mapQuest(
    entry: QuestEntry,
    config: ContentConfig,
): MappedDocument {
    return {
        _id: toObjectId(entry.id),
        set: {
            infos: infosOf(entry.infos, config),
            requirements: requirementsOf(entry.requirements),
            prizes: prizesOf(entry, config),
        },
        setOnInsert: runtimeFieldsOnInsert(),
    };
}
