import { Types } from 'mongoose';
import { toCopper } from 'src/economy/coins';
import { priceKey } from 'src/economy/trade/trade-line';
import {
    DrawnRewards,
    isNonNegativeInteger,
    NO_REWARDS,
    RewardCatalog,
    RewardItem,
    SpellCandidate,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { MissionPrizeRecord } from './mission-draft.model';

function cataloguedItems(
    prize: MissionPrizeRecord,
    catalog: RewardCatalog,
): RewardItem[] {
    return prize.items
        .filter(({ itemType, item }) =>
            catalog.rarities.has(priceKey(itemType, item)),
        )
        .map(({ itemType, item, quantity }) => ({ itemType, item, quantity }));
}

function chosenPetOf(
    prize: MissionPrizeRecord,
    catalog: RewardCatalog,
): Types.ObjectId | null {
    return prize.pet && catalog.pets.has(prize.pet.toHexString())
        ? prize.pet
        : null;
}

function chosenSpellOf(
    prize: MissionPrizeRecord,
    catalog: RewardCatalog,
): SpellCandidate | null {
    const spell = prize.spell && catalog.spells.get(prize.spell.toHexString());
    return prize.spell && spell
        ? {
              spellId: prize.spell,
              minXpToLearn: spell.minXpToLearn,
              maxUsages: spell.maxUsages,
          }
        : null;
}

// premio scelto dall'oste (D-07, D-08): nessun tiro, i cancelli di pet e magia restano a planParticipant; monete e xp liberi (D-15)
export function chosenRewardsOf(
    prize: MissionPrizeRecord | null,
    catalog: RewardCatalog,
): DrawnRewards {
    if (!prize) return NO_REWARDS;
    const coinsCopper = toCopper(prize.coins);
    const pet = chosenPetOf(prize, catalog);
    return {
        coinsCopper: isNonNegativeInteger(coinsCopper) ? coinsCopper : 0,
        xpPrize: isNonNegativeInteger(prize.xp) ? prize.xp : 0,
        items: cataloguedItems(prize, catalog),
        spellCandidate: chosenSpellOf(prize, catalog),
        spellDraw: null,
        pet,
        petLifePoints: pet ? catalog.pets.get(pet.toHexString()) : null,
        petLore: [...((pet && catalog.petLore?.get(pet.toHexString())) ?? [])],
        loreDraw: null,
        cure: prize.cure ?? null,
    };
}
