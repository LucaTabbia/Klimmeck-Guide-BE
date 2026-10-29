import type { Types } from 'mongoose';
import { refIdOf } from 'src/mongo/document-id';
import { GM_LANES } from 'src/quests/acceptance/quest-lanes';
import type { ActiveTravel } from 'src/models/character/active-travel.model';
import type { AwaitingAid } from 'src/models/character/awaiting-aid.model';
import type {
    PendingRequest,
    PendingRequestCharacter,
} from 'src/models/pending-request.model';
import type { QuestPartySlot } from 'src/models/quest/quest-party-slot.model';
import type { QuestRegistration } from 'src/models/quest/quest-registration.model';

export interface RequestCharacterSnapshot {
    _id: Types.ObjectId;
    infos?: { name?: string };
    status?: {
        title?: string;
        location?: unknown;
        activeTravel?: ActiveTravel | null;
        awaitingAid?: AwaitingAid | null;
    };
    quests?: {
        activeStoryQuest?: unknown;
        activeWorldMissionQuest?: unknown;
        pendingQuest?: unknown;
    };
}

export interface RequestPendingQuestSnapshot {
    _id: Types.ObjectId;
    startDate?: Date | null;
    pointsSpent?: number;
    quest?: unknown;
}

export interface RequestQuestSnapshot {
    _id: Types.ObjectId;
    infos?: { type?: string; title?: string };
    requirements?: { requiredAdventurers?: unknown };
    registeredAdventurers?: QuestRegistration[];
}

export interface RequestUserSnapshot {
    _id: Types.ObjectId;
    twitchId: string;
    currentCharacter?: unknown;
}

export interface PendingRequestsInput {
    characters: RequestCharacterSnapshot[];
    pendingQuests: RequestPendingQuestSnapshot[];
    quests: RequestQuestSnapshot[];
    users: RequestUserSnapshot[];
}

export interface SkippedRequest {
    characterId: string;
    pendingQuestId: string;
}

export interface PendingRequestsBuild {
    requests: PendingRequest[];
    skipped: SkippedRequest[];
}

interface LaneEntry {
    character: RequestCharacterSnapshot;
    pendingQuestId: Types.ObjectId;
}

function byHex<T>(items: T[], idOf: (item: T) => unknown): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items) {
        const id = refIdOf(idOf(item));
        if (id) map.set(id.toHexString(), item);
    }
    return map;
}

function gmLaneEntries(characters: RequestCharacterSnapshot[]): LaneEntry[] {
    return characters.flatMap((character) =>
        GM_LANES.flatMap((lane) => {
            const pendingQuestId = refIdOf(character.quests?.[lane]);
            return pendingQuestId ? [{ character, pendingQuestId }] : [];
        }),
    );
}

// catalogo legacy: requiredAdventurers poteva essere un numero
function requiredAdventurersOf(quest: RequestQuestSnapshot): QuestPartySlot[] {
    const required = quest.requirements?.requiredAdventurers;
    return Array.isArray(required) ? (required as QuestPartySlot[]) : [];
}

function characterEntryOf(
    character: RequestCharacterSnapshot,
): PendingRequestCharacter | null {
    const location = refIdOf(character.status?.location);
    if (!location) return null;
    return {
        id: character._id.toHexString(),
        name: character.infos?.name ?? '',
        title: character.status?.title ?? '',
        location: location.toHexString(),
        activeTravel: character.status?.activeTravel ?? null,
        awaitingAid: character.status?.awaitingAid ?? null,
        pendingQuest:
            refIdOf(character.quests?.pendingQuest)?.toHexString() ?? null,
    };
}

// startDate crescente, null in coda (in viaggio verso il marker), poi id per un ordine stabile
function compareRequests(a: PendingRequest, b: PendingRequest): number {
    const aTime = a.startDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.startDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.id.localeCompare(b.id);
}

export function buildPendingRequests(
    input: PendingRequestsInput,
): PendingRequestsBuild {
    const pendingQuests = byHex(input.pendingQuests, (pq) => pq._id);
    const quests = byHex(input.quests, (quest) => quest._id);
    const users = byHex(input.users, (user) => user.currentCharacter);
    const requests: PendingRequest[] = [];
    const skipped: SkippedRequest[] = [];

    for (const { character, pendingQuestId } of gmLaneEntries(
        input.characters,
    )) {
        const characterId = character._id.toHexString();
        const pendingQuest = pendingQuests.get(pendingQuestId.toHexString());
        const questId = refIdOf(pendingQuest?.quest);
        const quest = questId ? quests.get(questId.toHexString()) : undefined;
        const user = users.get(characterId);
        const characterEntry = characterEntryOf(character);
        if (!pendingQuest || !quest || !user || !characterEntry) {
            skipped.push({
                characterId,
                pendingQuestId: pendingQuestId.toHexString(),
            });
            continue;
        }
        requests.push({
            id: pendingQuest._id.toHexString(),
            startDate: pendingQuest.startDate ?? null,
            pointsSpent: pendingQuest.pointsSpent ?? 0,
            quest: {
                id: quest._id.toHexString(),
                type: quest.infos?.type ?? '',
                title: quest.infos?.title ?? '',
                requiredAdventurers: requiredAdventurersOf(quest),
                registeredAdventurers: quest.registeredAdventurers ?? [],
            },
            character: characterEntry,
            user: { id: user._id.toHexString(), twitchId: user.twitchId },
        });
    }

    return { requests: requests.sort(compareRequests), skipped };
}
