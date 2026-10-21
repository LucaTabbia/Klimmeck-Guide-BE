import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms, sameId } from 'src/mongo/document-id';
import { CapacityRule, Registration } from './quest-eligibility';
import { lanePathOf, QuestLane } from './quest-lanes';

export interface LaneClaimSnapshot {
    title: TitleType;
    location: Types.ObjectId;
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

export interface UnregisteredSnapshot {
    registrations?: readonly Registration[] | null;
    registeredAdventurers?: readonly string[] | null;
}

type LimitedCapacityRule = Exclude<CapacityRule, { kind: 'unlimited' }>;

const REGISTRATIONS_OR_EMPTY = { $ifNull: ['$registrations', []] };

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
    if (rule.kind === 'total') return { $size: REGISTRATIONS_OR_EMPTY };
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
export function classifyUnclaimed(
    fresh: UnclaimedSnapshot | null,
    lane: QuestLane,
    expected: LaneClaimSnapshot,
    questId: Types.ObjectId,
    repeatable: boolean,
): Error {
    if (!fresh) return ResourceNotFoundException.character();
    if (fresh.quests?.[lane] != null) return GameRuleException.questSlotBusy();
    const completed = (fresh.quests?.completedQuests ?? []).some((id) =>
        sameId(id, questId),
    );
    if (!repeatable && completed) return GameRuleException.questAlreadyTaken();
    if (fresh.status?.title !== expected.title)
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
