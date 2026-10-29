import type { Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import type { CharacterDocument } from 'src/models/character/character.model';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';

export interface LaneModels {
    characters: Model<CharacterDocument>;
    pendingQuests: Model<PendingQuestDocument>;
}

export interface LaneCharacterRef {
    _id: Types.ObjectId;
    quests?: { pendingQuest?: unknown } | null;
}

export interface LaneMember<C, P> {
    character: C;
    pendingQuest: P;
}

export interface LaneMembers<C, P> {
    members: LaneMember<C, P>[];
    dropped: Types.ObjectId[];
}

// la proiezione del personaggio deve includere la corsia standard (quests o quests.pendingQuest)
export interface LaneProjections {
    character: Record<string, 1>;
    pendingQuest: Record<string, 1>;
}

const STANDARD_LANE_PATH = lanePathOf(QuestLane.standard);

// lettura condivisa da avvio del party e roster di gruppo: registrati attivi in corsia standard con una PendingQuest di questa quest,
// nell'ordine di registrazione; chi non ce l'ha finisce in dropped (Pitfall 8). Funzione pura sui modelli: nessun modulo Nest da importare
export function laneMembersOf<
    C extends LaneCharacterRef,
    P extends { _id: Types.ObjectId },
>(
    models: LaneModels,
    questId: Types.ObjectId,
    registered: readonly Types.ObjectId[],
    projections: LaneProjections,
): Promise<LaneMembers<C, P>> {
    return readLaneMembers(
        models,
        { questId, registered, characterFilter: ACTIVE_CHARACTER_FILTER },
        projections,
    );
}

// segnaposto di posto (D-21): stessi registrati in corsia con la PendingQuest della quest, letti anche se archiviati
export function seatHolderLaneMembersOf<
    C extends LaneCharacterRef,
    P extends { _id: Types.ObjectId },
>(
    models: LaneModels,
    questId: Types.ObjectId,
    seatHolderIds: readonly Types.ObjectId[],
    projections: LaneProjections,
): Promise<LaneMembers<C, P>> {
    return readLaneMembers(
        models,
        { questId, registered: seatHolderIds, characterFilter: {} },
        projections,
    );
}

interface LaneRead {
    questId: Types.ObjectId;
    registered: readonly Types.ObjectId[];
    characterFilter: Record<string, unknown>;
}

async function readLaneMembers<
    C extends LaneCharacterRef,
    P extends { _id: Types.ObjectId },
>(
    models: LaneModels,
    { questId, registered, characterFilter }: LaneRead,
    projections: LaneProjections,
): Promise<LaneMembers<C, P>> {
    if (registered.length === 0) return { members: [], dropped: [] };
    const characters = await models.characters
        .find(
            {
                ...characterFilter,
                _id: { $in: registered.flatMap((id) => idForms(id)) },
                [STANDARD_LANE_PATH]: { $ne: null },
            },
            projections.character,
        )
        .lean<C[]>()
        .exec();
    const lanes = characters.flatMap(
        (character) => refIdOf(character.quests?.pendingQuest) ?? [],
    );
    const pendingQuests = await models.pendingQuests
        .find(
            { _id: { $in: lanes }, quest: { $in: idForms(questId) } },
            projections.pendingQuest,
        )
        .lean<P[]>()
        .exec();
    const members: LaneMember<C, P>[] = [];
    const dropped: Types.ObjectId[] = [];
    for (const characterId of registered) {
        const character = characters.find(({ _id }) => _id.equals(characterId));
        const lane = refIdOf(character?.quests?.pendingQuest);
        const pendingQuest = pendingQuests.find(
            ({ _id }) => lane !== null && _id.equals(lane),
        );
        if (!character || !pendingQuest) {
            dropped.push(characterId);
            continue;
        }
        members.push({ character, pendingQuest });
    }
    return { members, dropped };
}
