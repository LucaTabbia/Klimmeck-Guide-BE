import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms, sameId } from 'src/mongo/document-id';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    CapacityRule,
    isRepeatable,
    meetsTitle,
    QuestRoster,
} from './quest-eligibility';
import { lanePathOf, laneOf, QuestLane } from './quest-lanes';

export interface LaneClaimSnapshot {
    title: TitleType;
    location: Types.ObjectId;
}

export interface ClaimedQuest {
    id: Types.ObjectId;
    type: QuestType;
    minTitle?: TitleType | null;
}

export interface UnclaimedSnapshot {
    status?: { title?: TitleType; location?: unknown } | null;
    quests?: {
        completedQuests?: readonly unknown[] | null;
        pendingQuest?: unknown;
        activeStoryQuest?: unknown;
        activeWorldMissionQuest?: unknown;
    } | null;
}

export type UnregisteredSnapshot = QuestRoster;

type LimitedCapacityRule = Exclude<CapacityRule, { kind: 'unlimited' }>;

const REGISTRATIONS_OR_EMPTY = { $ifNull: ['$registrations', []] };
const LEGACY_ADVENTURERS_OR_EMPTY = {
    $ifNull: ['$registeredAdventurers', []],
};

// ogni regola esprimibile sul documento sta nel filtro (D-18): attivo, corsia libera, titolo e posizione verificati, non ripetibilità
export function laneClaimFilter(
    characterId: Types.ObjectId,
    lane: QuestLane,
    snapshot: LaneClaimSnapshot,
    questId: Types.ObjectId,
    repeatable: boolean,
): Record<string, unknown> {
    return {
        ...activeCharacterById(characterId),
        [lanePathOf(lane)]: null,
        'status.title': snapshot.title,
        'status.location': { $in: idForms(snapshot.location) },
        ...(repeatable
            ? {}
            : { 'quests.completedQuests': { $nin: idForms(questId) } }),
    };
}

export function laneClaimUpdate(
    lane: QuestLane,
    pendingQuestId: Types.ObjectId,
) {
    return { $set: { [lanePathOf(lane)]: pendingQuestId } };
}

export function takenCountExpr(
    rule: LimitedCapacityRule,
): Record<string, unknown> {
    // i legacy stanno solo in registeredAdventurers e senza titolo: contano nel totale, non per rango; specchio di hasCapacity
    if (rule.kind === 'total')
        return {
            $max: [
                { $size: REGISTRATIONS_OR_EMPTY },
                { $size: LEGACY_ADVENTURERS_OR_EMPTY },
            ],
        };
    return {
        $size: {
            $filter: {
                input: REGISTRATIONS_OR_EMPTY,
                as: 'registration',
                cond: { $eq: ['$$registration.title', rule.title] },
            },
        },
    };
}

// stesso findOneAndUpdate per anti-duplicato e capienza: i concorrenti vanno in WriteConflict e il filtro rivalutato non matcha (RESEARCH Q1)
export function registrationFilter(
    questId: Types.ObjectId,
    characterId: Types.ObjectId,
    rule: CapacityRule,
): Record<string, unknown> {
    const notRegistered = {
        _id: questId,
        'registrations.character': { $ne: characterId },
        registeredAdventurers: { $ne: characterId.toHexString() },
    };
    if (rule.kind === 'unlimited') return notRegistered;
    return {
        ...notRegistered,
        $expr: { $lt: [takenCountExpr(rule), rule.limit] },
    };
}

export function registrationUpdate(
    characterId: Types.ObjectId,
    title: TitleType,
) {
    return {
        $push: { registrations: { character: characterId, title } },
        $addToSet: { registeredAdventurers: characterId.toHexString() },
    };
}

// rilettura nella session solo per scegliere il codice (Phase 4): il filtro resta la regola
// dopo un claim fallito la corsia occupata è la causa più probabile (concorrente dello stesso personaggio): SLOT_BUSY prima di ALREADY_TAKEN, a differenza della pre-verifica; solo corse, sempre fail-closed
// il titolo si giudica con la regola della pre-verifica: un titolo cambiato ma ancora ammesso è una corsa (SLOT_BUSY), non un MISMATCH
export function classifyUnclaimed(
    fresh: UnclaimedSnapshot | null,
    quest: ClaimedQuest,
    expected: LaneClaimSnapshot,
): Error {
    if (!fresh) return ResourceNotFoundException.character();
    if (fresh.quests?.[laneOf(quest.type)] != null)
        return GameRuleException.questSlotBusy();
    const completed = (fresh.quests?.completedQuests ?? []).some((id) =>
        sameId(id, quest.id),
    );
    if (!isRepeatable(quest.type) && completed)
        return GameRuleException.questAlreadyTaken();
    const title = fresh.status?.title;
    if (!title || !meetsTitle(quest.type, title, quest.minTitle))
        return GameRuleException.questTitleMismatch();
    if (!sameId(fresh.status?.location, expected.location))
        return GameRuleException.questNotInCity();
    return GameRuleException.questSlotBusy();
}

export function classifyUnregistered(
    fresh: UnregisteredSnapshot | null,
    characterId: Types.ObjectId,
): Error {
    if (!fresh) return ResourceNotFoundException.quest();
    const registered =
        (fresh.registrations ?? []).some((registration) =>
            sameId(registration.character, characterId),
        ) ||
        (fresh.registeredAdventurers ?? []).includes(characterId.toHexString());
    return registered
        ? GameRuleException.questAlreadyTaken()
        : GameRuleException.questFull();
}
