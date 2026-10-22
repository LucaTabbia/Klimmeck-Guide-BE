import { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { sameId } from 'src/mongo/document-id';
import {
    hasSeatFor,
    RegisteredAdventurer,
    SlotRule,
    slotRuleOf,
    slotsOf,
} from './quest-capacity';
import { QuestLane } from './quest-lanes';

export const TITLE_RANK: Readonly<Record<TitleType, number>> = {
    rookie: 0,
    adventurer: 1,
    paladin: 2,
    mage: 3,
    hero: 4,
    legend: 5,
};

// pointsSpent è GraphQL Int a 32 bit: un costo oltre il tetto romperebbe la serializzazione del personaggio
export const MAX_QUEST_POINTS = 2_147_483_647;

const REPEATABLE_TYPES: ReadonlySet<QuestType> = new Set([
    QuestType.hunt,
    QuestType.dungeon,
    QuestType.heal,
    QuestType.job,
    QuestType.study,
    QuestType.crime,
    QuestType.guard,
]);

// registrazione sulla Quest con capienza (Phase 7 D-03 + D-27); hunt, dungeon, job, heal, study restano senza registrazione
const REGISTERED_TYPES: ReadonlySet<QuestType> = new Set([
    QuestType.worldMission,
    QuestType.boss,
    QuestType.enemy,
    QuestType.aid,
]);

export interface QuestRequirementsSnapshot {
    minTitle?: TitleType | null;
    requiredAdventurers?: unknown;
    requiredPoints?: number | null;
}

export interface QuestRoster {
    registeredAdventurers?: readonly RegisteredAdventurer[] | null;
}

export interface QuestEligibilitySnapshot extends QuestRoster {
    _id: Types.ObjectId;
    infos: { type: QuestType };
    requirements?: QuestRequirementsSnapshot | null;
}

export interface CharacterEligibilitySnapshot {
    _id: Types.ObjectId;
    status: { title: TitleType; activeTravel?: unknown };
    quests?: {
        completedQuests?: readonly unknown[] | null;
        pendingQuest?: unknown;
        activeStoryQuest?: unknown;
        activeWorldMissionQuest?: unknown;
    } | null;
}

export type PointsCost = { cost: number } | 'invalid';

// le story seguono il titolo esatto (niente salti né ritorni), gli altri tipi un titolo minimo (D-06)
export function meetsTitle(
    type: QuestType,
    title: TitleType,
    minTitle: TitleType | null | undefined,
): boolean {
    if (!minTitle) return true;
    const rank = TITLE_RANK[title];
    const minRank = TITLE_RANK[minTitle];
    if (rank === undefined || minRank === undefined) return false;
    return type === QuestType.story ? rank === minRank : rank >= minRank;
}

export function isRepeatable(type: QuestType): boolean {
    return REPEATABLE_TYPES.has(type);
}

export function isRegistered(type: QuestType): boolean {
    return REGISTERED_TYPES.has(type);
}

// null = nessuna registrazione né capienza; 'invalid' = quest registrata con slot non validi, mai capienza illimitata (D-27, C2)
export function registrationRuleOf(
    type: QuestType,
    requirements: QuestRequirementsSnapshot | null | undefined,
): SlotRule | null | 'invalid' {
    if (!isRegistered(type)) return null;
    const slots = slotsOf(requirements?.requiredAdventurers);
    return slots === 'invalid' ? 'invalid' : slotRuleOf(slots);
}

// un costo di catalogo assente o non valido rende la missione non accettabile, mai gratuita (D-09)
export function pointsCostOf(
    lane: QuestLane,
    requiredPoints: number | null | undefined,
): PointsCost {
    if (lane === QuestLane.standard) return { cost: 0 };
    return isValidPointsCost(requiredPoints)
        ? { cost: requiredPoints }
        : 'invalid';
}

function isValidPointsCost(value: number | null | undefined): value is number {
    return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value > 0 &&
        value <= MAX_QUEST_POINTS
    );
}

// story e world mission non hanno timer: si chiudono a mano (D-16)
export function waitingTimeOf(
    lane: QuestLane,
    timeToComplete: number | null | undefined,
): number {
    return lane === QuestLane.standard ? (timeToComplete ?? 0) : 0;
}

function alreadyTaken(
    quest: QuestEligibilitySnapshot,
    character: CharacterEligibilitySnapshot,
): boolean {
    const completed = (character.quests?.completedQuests ?? []).some((id) =>
        sameId(id, quest._id),
    );
    if (completed) return true;
    if (!isRegistered(quest.infos.type)) return false;
    return (quest.registeredAdventurers ?? []).some((entry) =>
        sameId(entry.character, character._id),
    );
}

// ordine fisso (RESEARCH Q7/Q14): viaggio → ripetibilità → titolo → corsia → capienza; la città è una lettura e la verifica il service
export function classifyEligibility(
    quest: QuestEligibilitySnapshot,
    character: CharacterEligibilitySnapshot,
    lane: QuestLane,
    rule: SlotRule | null,
): GameRuleException | null {
    // in viaggio nessuna corsia si accetta (D-06): lo stato blocca tutto
    if (character.status.activeTravel != null)
        return GameRuleException.travelInProgress();
    const type = quest.infos.type;
    if (!isRepeatable(type) && alreadyTaken(quest, character))
        return GameRuleException.questAlreadyTaken();
    if (!meetsTitle(type, character.status.title, quest.requirements?.minTitle))
        return GameRuleException.questTitleMismatch();
    if (character.quests?.[lane] != null)
        return GameRuleException.questSlotBusy();
    if (
        rule &&
        !hasSeatFor(
            rule,
            quest.registeredAdventurers ?? [],
            character.status.title,
        )
    )
        return GameRuleException.questFull();
    return null;
}
