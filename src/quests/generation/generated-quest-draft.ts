import { Types } from 'mongoose';
import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { CoinPurse } from 'src/economy/coins';
import {
    GeneratedAssetRef,
    GeneratedPrizes,
} from 'src/quests/generation/generated-prizes';
import { RankSlot, soloSlots } from 'src/quests/acceptance/quest-capacity';
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
        requiredAdventurers: RankSlot[];
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

// enemy: un solo posto senza titolo, si prende da soli col rango di minTitle (quick 261111-enm, supera D-09 per il solo tipo enemy);
// boss: posti a titolo esatto della formula, nessun jolly (13.1 D-09)
const seatsOf = (composition: Composition): RankSlot[] =>
    composition.type === QuestType.enemy
        ? soloSlots()
        : [{ title: composition.rank, count: composition.seats }];

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
            requiredAdventurers: seatsOf(composition),
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
