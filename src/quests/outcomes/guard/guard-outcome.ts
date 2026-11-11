// esiti dello scontro di guardia (quick 261110-cgd): vittoria = premi della quest con monete doppie + xp dei nemici; sconfitta = 1 di vita in città, nessun soccorso
import { fromCopper, toCopper } from 'src/economy/coins';
import type {
    CombatCatalog,
    ResolutionCatalog,
} from '../resolution-loader.service';
import type { ParticipantEffects } from '../combat/combat-resolver';
import type {
    OutcomeCharacterSnapshot,
    ParticipantPlan,
} from '../outcome-plan';
import { woundsAfter } from '../outcome-plan';
import { MIN_LIFE_POINTS } from '../progression/level-table';
import type { PrizesSnapshot } from '../rewards/quest-rewards';
import { planUnrewarded, type UnrewardedPlanInput } from '../unrewarded-plan';

const GUARD_COIN_MULTIPLIER = 2;

export function planGuardDefeat(input: UnrewardedPlanInput): ParticipantPlan {
    return planUnrewarded(input, {
        lifePointsAfter: () => MIN_LIFE_POINTS,
        extraSet: {},
        coinsDelta: 0,
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

// lo scontro parte da vita e ferite lasciate dal combattimento della quest
export function foughtSnapshotOf<S extends OutcomeCharacterSnapshot>(
    snapshot: S,
    effects: ParticipantEffects | null,
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
