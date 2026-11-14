// esiti dello scontro di guardia (quick 261110-cgd): vittoria = premi della quest con monete doppie + xp dei nemici; sconfitta = 1 di vita in città, nessun soccorso
import { companionStoredLevelOf } from 'src/characters/pets/companion-level';
import { COMPANION_LIFE_FLOOR } from 'src/characters/pets/companion-life';
import { fromCopper, toCopper } from 'src/economy/coins';
import type {
    CombatCatalog,
    ResolutionCatalog,
} from '../resolution-loader.service';
import { refOf } from '../combat/combat-context';
import {
    lastCompanionLifeOf,
    type ParticipantEffects,
} from '../combat/combat-resolver';
import type {
    OutcomeCharacterSnapshot,
    ParticipantPlan,
} from '../outcome-plan';
import { woundsAfter } from '../outcome-plan';
import { MIN_LIFE_POINTS } from '../progression/level-table';
import type { PrizesSnapshot } from '../rewards/quest-rewards';
import {
    planUnrewarded,
    type UnrewardedConclusion,
    type UnrewardedPlanInput,
} from '../unrewarded-plan';

const GUARD_COIN_MULTIPLIER = 2;

// vita a 1 in città, nessuna moneta tolta né campo in più: lo scontro di guardia perso e la sconfitta senza soccorso (D-19)
export const ONE_LIFE_POINT_CONCLUSION: Omit<UnrewardedConclusion, 'result'> = {
    lifePointsAfter: () => MIN_LIFE_POINTS,
    extraSet: {},
    coinsDelta: 0,
};

export function planGuardDefeat(input: UnrewardedPlanInput): ParticipantPlan {
    return planUnrewarded(input, {
        ...ONE_LIFE_POINT_CONCLUSION,
        result: { arrested: false, coinsLost: null, guardEncounter: true },
    });
}

// tutte e tre le monete raddoppiate; un premio non leggibile resta com'è e lo sanifica drawRewards
export function doubledCoinPrizes<
    Q extends { _id: unknown; prizes?: PrizesSnapshot | null },
>(quest: Q): Q {
    if (!quest.prizes) return quest;
    const copper = toCopper(quest.prizes.prizeCoins) * GUARD_COIN_MULTIPLIER;
    if (!Number.isSafeInteger(copper) || copper < 0) return quest;
    return {
        ...quest,
        prizes: { ...quest.prizes, prizeCoins: fromCopper(copper) },
    };
}

// D-12, D-26: il compagno entra nello scontro seguente con la vita lasciata dal precedente, col livello scritto perché la voce non si legga più piena (D-23); a 1 resta fuori
export function companionAssetsAfter<S extends OutcomeCharacterSnapshot>(
    assets: S['assets'],
    companionLifeAfter: number | undefined,
    pets: ReadonlyMap<string, { maxXp?: unknown }>,
): Pick<S, 'assets'> | Record<string, never> {
    const petId = refOf(assets?.pet);
    if (!assets || !petId || companionLifeAfter === undefined) return {};
    const hex = petId.toHexString();
    return {
        assets: {
            ...assets,
            pet: companionLifeAfter <= COMPANION_LIFE_FLOOR ? null : assets.pet,
            ownedPets:
                assets.ownedPets?.map((entry) =>
                    refOf(entry.pet)?.toHexString() === hex
                        ? {
                              ...entry,
                              currentLifePoints: companionLifeAfter,
                              level: companionStoredLevelOf(
                                  entry,
                                  pets.get(hex),
                              ),
                          }
                        : entry,
                ) ?? assets.ownedPets,
        },
    };
}

// lo scontro parte da vita, ferite e compagno lasciati dal combattimento della quest
export function foughtSnapshotOf<S extends OutcomeCharacterSnapshot>(
    snapshot: S,
    effects: ParticipantEffects | null,
    pets: ReadonlyMap<string, { maxXp?: unknown }>,
): S {
    if (!effects) return snapshot;
    return {
        ...snapshot,
        status: {
            ...snapshot.status,
            currentLifePoints: effects.hpAfter,
            injuries: woundsAfter(
                snapshot.status.injuries ?? [],
                effects.injuriesAdded,
            ).injuries,
        },
        ...companionAssetsAfter(
            snapshot.assets,
            effects.companionLifeAfter,
            pets,
        ),
    };
}

// consumi e magie dei due combattimenti sommati: il piano li clampa al posseduto
export function mergedEffects(
    first: ParticipantEffects | null,
    second: ParticipantEffects,
): ParticipantEffects {
    if (!first) return second;
    return {
        characterId: second.characterId,
        hpAfter: second.hpAfter,
        injuriesAdded: [...first.injuriesAdded, ...second.injuriesAdded],
        consumablesUsed: [...first.consumablesUsed, ...second.consumablesUsed],
        spellsUsed: [...first.spellsUsed, ...second.spellsUsed],
        ...lastCompanionLifeOf(first, second),
    };
}

// nemici della quest e dello scontro insieme: xp (enemyFactsOf) e conoscenze (victoryKnowledgeOf) li leggono da qui
export function encounterCatalogOf(
    quest: ResolutionCatalog,
    encounter: CombatCatalog,
): ResolutionCatalog {
    return {
        ...quest,
        enemies: [...quest.enemies, ...encounter.enemies],
        equipment: encounter.equipment,
        spells: encounter.spells,
        loot: encounter.loot,
        recoveryTimes: new Map([
            ...quest.recoveryTimes,
            ...encounter.recoveryTimes,
        ]),
    };
}
