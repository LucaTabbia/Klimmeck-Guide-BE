import { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { sameId } from 'src/mongo/document-id';
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

const SHARED_TYPES: ReadonlySet<QuestType> = new Set([
    QuestType.worldMission,
    QuestType.boss,
]);

export interface PartySlot {
    title: TitleType;
    count: number;
}

export interface Registration {
    character: unknown;
    title: TitleType;
}

export interface QuestRequirementsSnapshot {
    minTitle?: TitleType | null;
    party?: readonly PartySlot[] | null;
    requiredAdventurers?: number | null;
    requiredPoints?: number | null;
}

export interface QuestRoster {
    registrations?: readonly Registration[] | null;
    registeredAdventurers?: readonly string[] | null;
}

export interface QuestEligibilitySnapshot extends QuestRoster {
    _id: Types.ObjectId;
    infos: { type: QuestType };
    requirements?: QuestRequirementsSnapshot | null;
}

export interface CharacterEligibilitySnapshot {
    _id: Types.ObjectId;
    status: { title: TitleType };
    quests?: {
        completedQuests?: readonly unknown[] | null;
        pendingQuest?: unknown;
        activeStoryQuest?: unknown;
        activeWorldMissionQuest?: unknown;
    } | null;
}

export type PointsCost = { cost: number } | 'invalid';

export type CapacityRule =
    | { kind: 'perRank'; title: TitleType; limit: number }
    | { kind: 'total'; limit: number }
    | { kind: 'unlimited' };

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

export function isShared(type: QuestType): boolean {
    return SHARED_TYPES.has(type);
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

// slot esatti per rango: un rango assente dal party non ha posti (D-04)
export function capacityRuleOf(
    requirements: QuestRequirementsSnapshot | null | undefined,
    title: TitleType,
): CapacityRule {
    const party = requirements?.party ?? [];
    if (party.length > 0) {
        const limit = party.find((slot) => slot.title === title)?.count ?? 0;
        return { kind: 'perRank', title, limit };
    }
    const total = requirements?.requiredAdventurers ?? 0;
    return total > 0 ? { kind: 'total', limit: total } : { kind: 'unlimited' };
}

// i legacy stanno solo in registeredAdventurers e senza titolo: contano nel totale, non per rango; specchio di takenCountExpr
export function hasCapacity(rule: CapacityRule, roster: QuestRoster): boolean {
    if (rule.kind === 'unlimited') return true;
    const registrations = roster.registrations ?? [];
    const taken =
        rule.kind === 'perRank'
            ? registrations.filter(
                  (registration) => registration.title === rule.title,
              ).length
            : Math.max(
                  registrations.length,
                  roster.registeredAdventurers?.length ?? 0,
              );
    return taken < rule.limit;
}

function alreadyTaken(
    quest: QuestEligibilitySnapshot,
    character: CharacterEligibilitySnapshot,
): boolean {
    const completed = (character.quests?.completedQuests ?? []).some((id) =>
        sameId(id, quest._id),
    );
    if (completed) return true;
    if (!isShared(quest.infos.type)) return false;
    return (
        (quest.registrations ?? []).some((registration) =>
            sameId(registration.character, character._id),
        ) ||
        (quest.registeredAdventurers ?? []).includes(
            character._id.toHexString(),
        )
    );
}

// ordine fisso (RESEARCH Q7/Q14): ripetibilità → titolo → corsia → capienza; la città è una lettura e la verifica il service
export function classifyEligibility(
    quest: QuestEligibilitySnapshot,
    character: CharacterEligibilitySnapshot,
    lane: QuestLane,
): GameRuleException | null {
    const type = quest.infos.type;
    if (!isRepeatable(type) && alreadyTaken(quest, character))
        return GameRuleException.questAlreadyTaken();
    if (!meetsTitle(type, character.status.title, quest.requirements?.minTitle))
        return GameRuleException.questTitleMismatch();
    if (character.quests?.[lane] != null)
        return GameRuleException.questSlotBusy();
    if (
        isShared(type) &&
        !hasCapacity(
            capacityRuleOf(quest.requirements, character.status.title),
            quest,
        )
    )
        return GameRuleException.questFull();
    return null;
}
