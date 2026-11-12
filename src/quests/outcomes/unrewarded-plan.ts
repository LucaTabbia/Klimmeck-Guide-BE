// esito senza premio e senza soccorso (quick 261110-cgd): arresto nella crime, sconfitta nello scontro di guardia; compone gli helper di outcome-plan come l'imboscata
import type { Types } from 'mongoose';
import { applyTradeToInventory } from 'src/economy/trade/trade-inventory';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import type { ParticipantEffects } from './combat/combat-resolver';
import {
    consumablesSpent,
    type EnemyFacts,
    type OutcomeCharacterSnapshot,
    type OutcomeQuestSnapshot,
    participantFilter,
    type ParticipantPlan,
    type QuestResultDraft,
    questFactsOf,
    sellLine,
    spellsSpent,
    woundsAfter,
} from './outcome-plan';
import { lifePointsWithin } from './progression/level-table';
import { statusFactsOf } from './progression/status-facts';

export interface UnrewardedPlanInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    quest: OutcomeQuestSnapshot;
    pendingQuestId: Types.ObjectId;
    userId: Types.ObjectId;
    battle: ParticipantEffects | null;
    enemies: EnemyFacts | null;
    spellRecoveryTimes: ReadonlyMap<string, number>;
    now: Date;
}

export interface UnrewardedConclusion {
    // vita dopo l'esito a partire da quella lasciata dal combattimento
    lifePointsAfter: (foughtLifePoints: number) => number;
    extraSet: Record<string, unknown>;
    coinsDelta: number;
    result: Pick<QuestResultDraft, 'arrested' | 'coinsLost' | 'guardEncounter'>;
}

const NO_COINS = { gold: 0, silver: 0, copper: 0 };

// corsia standard liberata, effetti del combattimento tenuti, nessun xp, oggetto, magia, lore, completedQuests né awaitingAid
export function planUnrewarded(
    input: UnrewardedPlanInput,
    conclusion: UnrewardedConclusion,
): ParticipantPlan {
    const { snapshot, battle } = input;
    const before = statusFactsOf(snapshot);
    const hpFought = battle
        ? lifePointsWithin(battle.hpAfter, before.maxLifePoints)
        : before.currentLifePoints;
    const hpAfter = lifePointsWithin(
        conclusion.lifePointsAfter(hpFought),
        before.maxLifePoints,
    );
    const wounds = woundsAfter(
        snapshot.status.injuries ?? [],
        battle?.injuriesAdded ?? [],
    );
    const consumables = consumablesSpent(
        snapshot.assets?.ownedItems,
        battle?.consumablesUsed ?? [],
    );
    const inventory = applyTradeToInventory(
        snapshot.assets ?? {},
        consumables.map(sellLine),
    );
    const spells = spellsSpent(
        snapshot._id,
        snapshot.status.spellStates ?? [],
        battle?.spellsUsed ?? [],
        input.spellRecoveryTimes,
        input.now,
    );
    const lane = QuestLane.standard;
    const lanePath = lanePathOf(lane);
    return {
        filter: participantFilter({ ...input, lane }, lanePath),
        update: {
            $set: {
                'status.currentLifePoints': hpAfter,
                'status.injuries': wounds.injuries,
                'assets.ownedItems': inventory.ownedItems,
                'assets.ownedEquipments': inventory.ownedEquipments,
                [lanePath]: null,
                ...(spells.spellStates
                    ? { 'status.spellStates': spells.spellStates }
                    : {}),
                ...conclusion.extraSet,
            },
        },
        coinsDelta: conclusion.coinsDelta,
        result: {
            _id: input.resultId,
            character: snapshot._id,
            user: input.userId,
            quest: questFactsOf(input.quest),
            outcome: QuestOutcome.failure,
            resolvedAt: input.now,
            hpBefore: before.currentLifePoints,
            hpAfter,
            maxLifePoints: before.maxLifePoints,
            injuriesAdded: wounds.added,
            injuriesHealed: [],
            consumablesUsed: consumables,
            spellsUsed: spells.used,
            rewards: { coins: NO_COINS, items: [], pet: null },
            xpGained: 0,
            petXpGained: 0,
            xpBefore: before.xp,
            xpAfter: before.xp,
            levelBefore: before.level,
            levelAfter: before.level,
            titleBefore: before.title,
            titleAfter: before.title,
            spellLearned: null,
            loreUnlocked: [],
            enemies: [...(input.enemies?.entries ?? [])],
            stagesCleared: null,
            stagesTotal: null,
            rescuedCharacters: [],
            ...conclusion.result,
        },
        spellRecoveries: spells.recoveries,
    };
}
