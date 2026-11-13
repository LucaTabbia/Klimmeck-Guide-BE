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

// un blocco per titolo dei posti del boss generato: niente cura né magia (D-05, D-05c)
export interface GeneratedRankPrize {
    title: GeneratedRank;
    prizeCoins: CoinPurse;
    xpPrize: number;
    prizeItem: null;
    randomLoot: GeneratedAssetQuantity[];
    spell: null;
    pet: Types.ObjectId | null;
    cure: null;
}

export interface MixedBossInput {
    lower: GeneratedRank;
    lowerSeats: number;
    lowerPrizes: GeneratedPrizes;
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
        rankPrizes?: GeneratedRankPrize[];
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

const petOf = (pet: string | null): Types.ObjectId | null =>
    pet === null ? null : objectIdOf(pet);

function rankPrizeOf(
    title: GeneratedRank,
    prizes: GeneratedPrizes,
): GeneratedRankPrize {
    return {
        title,
        prizeCoins: prizes.prizeCoins,
        xpPrize: prizes.xpPrize,
        prizeItem: null,
        randomLoot: prizes.randomLoot.map(assetOf),
        spell: null,
        pet: petOf(prizes.pet),
        cure: null,
    };
}

// solo i boss hanno blocchi: le enemy sono solitarie col premio unico sul minTitle (D-01, D-23)
const rankPrizesOf = (
    composition: Composition,
    prizes: GeneratedPrizes,
): { rankPrizes?: GeneratedRankPrize[] } =>
    composition.type === QuestType.boss
        ? { rankPrizes: [rankPrizeOf(composition.rank, prizes)] }
        : {};

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
            pet: petOf(prizes.pet),
            ...rankPrizesOf(composition, prizes),
        },
        registeredAdventurers: [],
        concludedAt: null,
        startedAt: null,
        rescue: null,
        generated: true,
    };
}

// posti [rango, inferiore] e minTitle sul titolo più basso, se no l'accettazione rifiuta l'inferiore prima dei posti (D-23)
export function mixedBossDraftOf(
    draft: GeneratedQuestDraft,
    mix: MixedBossInput,
): GeneratedQuestDraft {
    const [rankSeat] = draft.requirements.requiredAdventurers;
    return {
        ...draft,
        requirements: {
            ...draft.requirements,
            minTitle: mix.lower,
            requiredAdventurers: [
                {
                    title: rankSeat.title,
                    count: rankSeat.count - mix.lowerSeats,
                },
                { title: mix.lower, count: mix.lowerSeats },
            ],
        },
        prizes: {
            ...draft.prizes,
            rankPrizes: [
                ...(draft.prizes.rankPrizes ?? []),
                rankPrizeOf(mix.lower, mix.lowerPrizes),
            ],
        },
    };
}
