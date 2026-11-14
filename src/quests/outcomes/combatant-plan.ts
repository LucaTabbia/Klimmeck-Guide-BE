import type { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { refIdOf } from 'src/mongo/document-id';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { prizeBlockFor } from 'src/quests/prizes/rank-prizes';
import { opensAid } from './aid/aid-opening';
import { rescueShareOf } from './aid/rescue-share';
import type { ChanceSource } from './chance-source';
import { buildCombatContext } from './combat/combat-context';
import type {
    CombatContext,
    CombatResolution,
    CombatVerdict,
    ParticipantEffects,
} from './combat/combat-resolver';
import { planDefeatWithoutAid } from './defeat-without-aid';
import type { DungeonResolution } from './dungeon/dungeon-resolver';
import { rescueTurnOf, turnCountersOf } from './dungeon/dungeon-turns';
import {
    type DungeonStages,
    type EnemyFacts,
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
import { victoryKnowledgeOf } from './victory-knowledge';

export interface CombatantBattle {
    verdict: CombatVerdict;
    effects: ParticipantEffects | null;
    stages?: DungeonStages | null;
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
    // vuoto se il verdetto è failure (planParticipant lo azzera)
    rescuedCharacters?: readonly Types.ObjectId[];
    now: Date;
}

export interface CombatantPlan {
    plan: ParticipantPlan;
    verdict: QuestOutcome.success | QuestOutcome.failure;
    aid: ParticipantPlanInput['aid'];
}

// nessun nemico valido (voci orfane scartate, C6) = nessun combattimento: successo automatico per tutti (D-01)
export function combatContextOf(
    quest: ResolutionQuest,
    catalog: ResolutionCatalog,
    participants: readonly ResolutionCharacter[],
): CombatContext | null {
    if (catalog.enemies.length === 0) return null;
    return buildCombatContext({
        quest,
        enemies: catalog.enemies,
        participants: [...participants],
        equipment: catalog.equipment,
        spells: catalog.spells,
        loot: catalog.loot,
        pets: catalog.pets,
    });
}

// XP dei nemici × quantità sommata al premio di chi vince (D-11, D-02): un valore non numerico vale 0
export function enemyFactsOf(
    catalog: Pick<ResolutionCatalog, 'enemies'>,
): EnemyFacts | null {
    if (catalog.enemies.length === 0) return null;
    return {
        entries: catalog.enemies.map(({ snapshot, quantity }) => ({
            enemy: snapshot._id,
            quantity,
        })),
        xp: catalog.enemies.reduce(
            (total, { snapshot, quantity }) =>
                total +
                (isFiniteNumber(snapshot.xp) ? snapshot.xp : 0) * quantity,
            0,
        ),
    };
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

// l'esplorazione a tappe porta tappe e turni nel risultato (D-12, D-21)
export function dungeonBattleOf(
    resolution: DungeonResolution,
    characterId: Types.ObjectId,
): CombatantBattle {
    return {
        verdict: resolution.verdict,
        effects: battleOf(resolution, characterId)?.effects ?? null,
        stages: {
            cleared: resolution.stagesCleared,
            total: resolution.stagesTotal,
            ...turnCountersOf(resolution),
        },
    };
}

// calcolo puro dentro il callback: la sconfitta apre la aid riferita alla quest originale solo per i tipi di soccorso (D-06..D-09, D-19)
export function planCombatant(input: CombatantPlanInput): CombatantPlan {
    const { quest, catalog, snapshot, battle } = input;
    const verdict =
        battle?.verdict === 'failure'
            ? QuestOutcome.failure
            : QuestOutcome.success;
    const won = verdict === QuestOutcome.success;
    if (!won && !opensAid(quest.infos?.type)) {
        return {
            plan: planDefeatWithoutAid({
                resultId: input.resultId,
                snapshot,
                quest,
                pendingQuestId: input.pendingQuestId,
                userId: input.userId,
                battle: battle?.effects ?? null,
                enemies: enemyFactsOf(catalog),
                spellRecoveryTimes: catalog.recoveryTimes,
                now: input.now,
            }),
            verdict: QuestOutcome.failure,
            aid: null,
        };
    }
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
        enemies: enemyFactsOf(catalog),
        victory: victoryKnowledgeOf(catalog),
        // il blocco del titolo del personaggio letto in sessione, non del posto (D-04, D-18)
        // la quota del soccorritore di una dungeon scala le soglie di loot e pet (D-20)
        rewards: won
            ? drawRewards(
                  prizeBlockFor(quest, snapshot.status.title),
                  catalog.rewards,
                  input.chance,
                  rescueShareOf(rescueTurnOf(quest.rescue?.turn)),
              )
            : NO_REWARDS,
        aid,
        spellRecoveryTimes: catalog.recoveryTimes,
        petMaxXp: catalog.petMaxXp,
        rescuedCharacters: input.rescuedCharacters,
        stages: battle?.stages ?? null,
        now: input.now,
    });
    return { plan, verdict, aid };
}
