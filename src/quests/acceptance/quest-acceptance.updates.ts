import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms, sameId } from 'src/mongo/document-id';
import { QuestType } from 'src/models/enums/quest-type.enum';
import type { ActiveTravelDraft } from 'src/travel/travel-timing';
import { SlotRule, seatAvailableExpr } from './quest-capacity';
import { isRepeatable, meetsTitle, QuestRoster } from './quest-eligibility';
import { lanePathOf, laneOf, QuestLane } from './quest-lanes';

export interface LaneClaimSnapshot {
    title: TitleType;
    // location per la corsia standard e per la worldMission (D-26 emendata 2026-10-22): solo la story si accetta da qualunque città
    location?: Types.ObjectId;
}

export interface ClaimedQuest {
    id: Types.ObjectId;
    type: QuestType;
    minTitle?: TitleType | null;
}

export interface UnclaimedSnapshot {
    status?: {
        title?: TitleType;
        location?: unknown;
        awaitingAid?: unknown;
        activeTravel?: unknown;
    } | null;
    quests?: {
        completedQuests?: readonly unknown[] | null;
        pendingQuest?: unknown;
        activeStoryQuest?: unknown;
        activeWorldMissionQuest?: unknown;
    } | null;
}

export type UnregisteredSnapshot = QuestRoster & {
    concludedAt?: Date | null;
    startedAt?: Date | null;
};

// ogni regola esprimibile sul documento sta nel filtro (D-18): attivo, corsia libera, non in attesa di soccorso (D-07), non in viaggio (D-06), titolo e posizione verificati, non ripetibilità
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
        'status.awaitingAid': null,
        'status.activeTravel': null,
        'status.title': snapshot.title,
        ...(snapshot.location
            ? { 'status.location': { $in: idForms(snapshot.location) } }
            : {}),
        ...(repeatable
            ? {}
            : { 'quests.completedQuests': { $nin: idForms(questId) } }),
    };
}

// movimento verso il marker scritto nello stesso update del claim (D-21): viaggio (D-02) o salto istantaneo (D-03)
export type LaneMovement =
    | { kind: 'travel'; travel: ActiveTravelDraft }
    | { kind: 'jump'; marker: Types.ObjectId };

export function laneClaimUpdate(
    lane: QuestLane,
    pendingQuestId: Types.ObjectId,
    movement: LaneMovement | null = null,
) {
    return {
        $set: {
            [lanePathOf(lane)]: pendingQuestId,
            ...(movement?.kind === 'travel'
                ? { 'status.activeTravel': movement.travel }
                : {}),
            ...(movement?.kind === 'jump'
                ? { 'status.location': movement.marker }
                : {}),
        },
    };
}

// stesso findOneAndUpdate per anti-duplicato e capienza: i concorrenti vanno in WriteConflict e il filtro rivalutato non matcha (RESEARCH Q1)
export function registrationFilter(
    questId: Types.ObjectId,
    characterId: Types.ObjectId,
    rule: SlotRule,
    title: TitleType,
): Record<string, unknown> {
    return {
        _id: questId,
        // una quest conclusa non accetta registrazioni (D-06, C9)
        concludedAt: null,
        // né una quest avviata: il party è chiuso e un posto liberato non fa entrare nessuno (utente 2026-10-25)
        startedAt: null,
        'registeredAdventurers.character': { $ne: characterId },
        $expr: seatAvailableExpr(rule, title),
    };
}

// registeredAt apre la finestra di 24 ore del party (utente 2026-10-25)
export function registrationUpdate(
    characterId: Types.ObjectId,
    title: TitleType,
    now: Date,
) {
    return {
        $push: {
            registeredAdventurers: {
                character: characterId,
                title,
                registeredAt: now,
            },
        },
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
    if (fresh.status?.awaitingAid != null)
        return GameRuleException.awaitingAid();
    if (fresh.status?.activeTravel != null)
        return GameRuleException.travelInProgress();
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
    if (expected.location && !sameId(fresh.status?.location, expected.location))
        return GameRuleException.questNotInCity();
    return GameRuleException.questSlotBusy();
}

export function classifyUnregistered(
    fresh: UnregisteredSnapshot | null,
    characterId: Types.ObjectId,
): Error {
    if (!fresh || fresh.concludedAt != null)
        return ResourceNotFoundException.quest();
    if (fresh.startedAt != null) return GameRuleException.questFull();
    const registered = (fresh.registeredAdventurers ?? []).some((entry) =>
        sameId(entry.character, characterId),
    );
    return registered
        ? GameRuleException.questAlreadyTaken()
        : GameRuleException.questFull();
}
