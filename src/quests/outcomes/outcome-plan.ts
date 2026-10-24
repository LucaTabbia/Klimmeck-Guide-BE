import type { Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import type { InventorySnapshot } from 'src/economy/trade/trade-inventory';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { QuestType } from 'src/models/enums/quest-type.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import type { QuestLane } from 'src/quests/acceptance/quest-lanes';
import type { ParticipantOutcome } from './combat/combat-resolver';
import type { DrawnRewards, RewardItem } from './rewards/quest-rewards';

export const OUTCOME_CHARACTER_PROJECTION = {
    status: 1,
    quests: 1,
    assets: 1,
} as const;

export interface OutcomeCharacterSnapshot {
    _id: Types.ObjectId;
    status: {
        xp?: number;
        level?: number;
        title: TitleType;
        currentLifePoints?: number;
        maxLifePoints?: number;
        injuries?: InjuryType[];
        spells?: unknown[];
        location?: unknown;
        awaitingAid?: unknown;
    };
    quests?: { completedQuests?: unknown[] | null } | null;
    assets?:
        | (InventorySnapshot & {
              activeSpells?: { spell?: unknown; usages?: number }[];
          })
        | null;
}

export interface OutcomeQuestSnapshot {
    _id: Types.ObjectId;
    infos: { type: QuestType; title: string };
    requirements?: { minTitle?: TitleType | null } | null;
}

export interface ConsumableUsage {
    itemType: 'LootItem';
    item: Types.ObjectId;
    quantity: number;
}

export interface QuestResultDraft {
    _id: Types.ObjectId;
    character: Types.ObjectId;
    user: Types.ObjectId;
    quest: { id: Types.ObjectId; type: QuestType; title: string };
    outcome: QuestOutcome;
    resolvedAt: Date;
    hpBefore: number;
    hpAfter: number;
    maxLifePoints: number;
    injuriesAdded: InjuryType[];
    consumablesUsed: ConsumableUsage[];
    spellsUsed: { spell: Types.ObjectId; usages: number }[];
    rewards: { coins: CoinPurse; items: RewardItem[] };
    xpGained: number;
    xpBefore: number;
    xpAfter: number;
    levelBefore: number;
    levelAfter: number;
    titleBefore: TitleType;
    titleAfter: TitleType;
    spellLearned: Types.ObjectId | null;
    enemy: Types.ObjectId | null;
    rescuedCharacter: Types.ObjectId | null;
}

export type PlanVerdict =
    | QuestOutcome.success
    | QuestOutcome.failure
    | QuestOutcome.gmCompleted;

export interface ParticipantPlanInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    quest: OutcomeQuestSnapshot;
    lane: QuestLane;
    pendingQuestId: Types.ObjectId;
    userId: Types.ObjectId;
    verdict: PlanVerdict;
    battle: ParticipantOutcome | null;
    enemy: { id: Types.ObjectId; xp: number } | null;
    rewards: DrawnRewards;
    aid: { aidQuestId: Types.ObjectId; failedQuestId: Types.ObjectId } | null;
    spellRecoveryTimes: ReadonlyMap<string, number>;
    rescuedCharacter?: Types.ObjectId | null;
    now: Date;
}

export interface SpellRecovery {
    characterId: string;
    spellId: string;
    delayMs: number;
}

export interface ParticipantPlan {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> };
    coinsDelta: number;
    result: QuestResultDraft;
    spellRecoveries: SpellRecovery[];
}

export function planParticipant(input: ParticipantPlanInput): ParticipantPlan {
    void input;
    throw new Error('not implemented');
}
