import { Types } from 'mongoose';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { CoinPurse } from 'src/economy/coins';
import {
    GeneratedAssetRef,
    GeneratedPrizes,
} from 'src/quests/generation/generated-prizes';
import { GeneratedRank } from 'src/quests/generation/generation-rules';
import { Composition } from 'src/quests/generation/quest-composition';
import {
    announcementOf,
    relatedLoreOf,
    TIME_TO_COMPLETE_MS,
    TitledEnemy,
    titleOf,
} from 'src/quests/generation/quest-templates';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

export interface GeneratedQuestCity {
    name: string;
    relatedLore: string | null;
}

export interface GeneratedQuestDraftInput {
    composition: Composition;
    poiId: string;
    city: GeneratedQuestCity;
    prizes: GeneratedPrizes;
    recommendedLoot: readonly GeneratedAssetRef[];
    chance: ChanceSource;
}

export interface GeneratedAssetQuantity {
    itemType: ItemReferenceType;
    item: Types.ObjectId;
    quantity: number;
}

export interface GeneratedQuestDraft {
    infos: {
        title: string;
        type: QuestType.enemy | QuestType.boss;
        markerLocation: Types.ObjectId;
        relatedLore: Types.ObjectId[];
        timeToComplete: number;
        enemies: { enemy: Types.ObjectId; quantity: number }[];
        description: string;
    };
    requirements: {
        minTitle: GeneratedRank;
        requiredPoints: number | null;
        requiredAdventurers: { title: GeneratedRank; count: number }[];
        recommendedLoot: GeneratedAssetQuantity[];
    };
    prizes: {
        prizeCoins: CoinPurse;
        xpPrize: number;
        prizeItem: null;
        randomLoot: GeneratedAssetQuantity[];
        spell: null;
        spellDraw: false;
        pet: Types.ObjectId | null;
    };
    registeredAdventurers: [];
    concludedAt: null;
    startedAt: null;
    rescue: null;
    generated: boolean;
}

const objectIdOf = (hex: string): Types.ObjectId => new Types.ObjectId(hex);

const assetOf = (ref: GeneratedAssetRef): GeneratedAssetQuantity => ({
    itemType: ref.itemType,
    item: objectIdOf(ref.item),
    quantity: ref.quantity,
});

// un solo tiro (l'annuncio); nessuna scadenza (D-14): mai startedAt né concludedAt
export function generatedQuestDraftOf(
    input: GeneratedQuestDraftInput,
): GeneratedQuestDraft {
    const { composition, city, prizes } = input;
    const titled: TitledEnemy[] = composition.enemies.map((entry) => ({
        name: entry.enemy.name,
        quantity: entry.quantity,
    }));
    const enemies = composition.enemies.map((entry) => entry.enemy);
    return {
        infos: {
            title: titleOf(composition.type, titled, city.name),
            type: composition.type,
            markerLocation: objectIdOf(input.poiId),
            relatedLore: relatedLoreOf(city.relatedLore, enemies).map(
                objectIdOf,
            ),
            timeToComplete: TIME_TO_COMPLETE_MS[composition.type],
            enemies: composition.enemies.map((entry) => ({
                enemy: objectIdOf(entry.enemy.id),
                quantity: entry.quantity,
            })),
            description: announcementOf(
                composition.type,
                titled,
                city.name,
                input.chance,
            ),
        },
        requirements: {
            minTitle: composition.rank,
            requiredPoints: null,
            // posti a titolo esatto (D-09 emendata): nessun jolly, anche per legend
            requiredAdventurers: [
                { title: composition.rank, count: composition.seats },
            ],
            recommendedLoot: input.recommendedLoot.map(assetOf),
        },
        prizes: {
            prizeCoins: prizes.prizeCoins,
            xpPrize: prizes.xpPrize,
            prizeItem: null,
            randomLoot: prizes.randomLoot.map(assetOf),
            spell: null,
            spellDraw: false,
            pet: prizes.pet === null ? null : objectIdOf(prizes.pet),
        },
        registeredAdventurers: [],
        concludedAt: null,
        startedAt: null,
        rescue: null,
        generated: true,
    };
}
