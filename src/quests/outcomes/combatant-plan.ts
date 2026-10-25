import type { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { refIdOf } from 'src/mongo/document-id';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import type { ChanceSource } from './chance-source';
import { buildCombatContext } from './combat/combat-context';
import type {
    CombatContext,
    CombatResolution,
    CombatVerdict,
    ParticipantEffects,
} from './combat/combat-resolver';
import {
    type ParticipantPlan,
    type ParticipantPlanInput,
    planParticipant,
} from './outcome-plan';
import {
    isFiniteNumber,
    type ResolutionCatalog,
    type ResolutionCharacter,
    type ResolutionQuest,
} from './resolution-loader.service';
import { drawRewards, NO_REWARDS } from './rewards/quest-rewards';

export interface CombatantBattle {
    verdict: CombatVerdict;
    effects: ParticipantEffects | null;
}

export interface CombatantPlanInput {
    quest: ResolutionQuest;
    catalog: ResolutionCatalog;
    snapshot: ResolutionCharacter;
    battle: CombatantBattle | null;
    resultId: Types.ObjectId;
    aidQuestId: Types.ObjectId;
    pendingQuestId: Types.ObjectId;
    userId: Types.ObjectId;
    chance: ChanceSource;
    rescuedCharacter?: Types.ObjectId | null;
    now: Date;
}

export interface CombatantPlan {
    plan: ParticipantPlan;
    verdict: QuestOutcome.success | QuestOutcome.failure;
    aid: ParticipantPlanInput['aid'];
}

// nessun nemico (o nemico orfano, C6) = nessun combattimento: successo automatico per tutti (D-01)
export function combatContextOf(
    quest: ResolutionQuest,
    catalog: ResolutionCatalog,
    participants: readonly ResolutionCharacter[],
): CombatContext | null {
    if (!catalog.enemy) return null;
    return buildCombatContext({
        quest,
        enemy: catalog.enemy,
        participants: [...participants],
        equipment: catalog.equipment,
        spells: catalog.spells,
        loot: catalog.loot,
    });
}

// XP del nemico sommata al premio di chi vince (D-11): un valore non numerico vale 0
export function enemyFactsOf(
    catalog: ResolutionCatalog,
): ParticipantPlanInput['enemy'] {
    if (!catalog.enemy) return null;
    const { _id, xp } = catalog.enemy;
    return { id: _id, xp: isFiniteNumber(xp) ? xp : 0 };
}

// il verdetto è del combattimento (A3), gli effetti si prendono per characterId, mai per posizione (D-05); null = nessun combattimento
export function battleOf(
    resolution: CombatResolution | null,
    characterId: Types.ObjectId,
): CombatantBattle | null {
    if (!resolution) return null;
    const hex = characterId.toHexString();
    return {
        verdict: resolution.verdict,
        effects:
            resolution.participants.find(
                (entry) => entry.characterId === hex,
            ) ?? null,
    };
}

// calcolo puro dentro il callback: la sconfitta apre la aid riferita alla quest originale (D-06..D-09)
export function planCombatant(input: CombatantPlanInput): CombatantPlan {
    const { quest, catalog, snapshot, battle } = input;
    const verdict =
        battle?.verdict === 'failure'
            ? QuestOutcome.failure
            : QuestOutcome.success;
    const won = verdict === QuestOutcome.success;
    const aid = won
        ? null
        : {
              aidQuestId: input.aidQuestId,
              failedQuestId: refIdOf(quest.rescue?.failedQuest) ?? quest._id,
          };
    const plan = planParticipant({
        resultId: input.resultId,
        snapshot,
        quest,
        lane: QuestLane.standard,
        pendingQuestId: input.pendingQuestId,
        userId: input.userId,
        verdict,
        battle: battle?.effects ?? null,
        enemy: enemyFactsOf(catalog),
        rewards: won
            ? drawRewards(quest.prizes, catalog.rewards, input.chance)
            : NO_REWARDS,
        aid,
        spellRecoveryTimes: catalog.recoveryTimes,
        rescuedCharacter: won ? (input.rescuedCharacter ?? null) : null,
        now: input.now,
    });
    return { plan, verdict, aid };
}
