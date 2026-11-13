import type { ClientSession, Model, Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import type { QuestDocument } from 'src/models/quest/quest.model';
import { isObjectId, refIdOf } from 'src/mongo/document-id';
import { locksWhileRescued } from './aid-opening';

export interface RescueLockSubject {
    _id?: unknown;
    infos?: { type?: QuestType | null } | null;
}

interface AwaitingRescueRead {
    sources?: readonly Types.ObjectId[];
    session?: ClientSession;
}

// stato derivato, nessun campo a DB (quick 261113-aql): ogni chiusura di un'aid scrive concludedAt;
// infos.type e concludedAt sono il prefisso dell'indice quest_forming_parties, quindi si scorrono le sole aid aperte
export function openAidsFilter(
    sources?: readonly Types.ObjectId[],
): Record<string, unknown> {
    return {
        'infos.type': QuestType.aid,
        concludedAt: null,
        ...(sources ? { 'rescue.failedQuest': { $in: [...sources] } } : {}),
    };
}

// una catena clona sempre l'originale: la nuova aid di un soccorso perso punta alla stessa quest e il blocco continua
export async function questsAwaitingRescue(
    quests: Model<QuestDocument>,
    { sources, session }: AwaitingRescueRead = {},
): Promise<ReadonlySet<string>> {
    const failed: unknown[] = await quests
        .distinct('rescue.failedQuest', openAidsFilter(sources))
        .session(session ?? null)
        .exec();
    return new Set(
        failed
            .map(refIdOf)
            .filter(isObjectId)
            .map((id) => id.toHexString()),
    );
}

// la regola unica dell'accettazione e di Quest.awaitingRescue
export function awaitsRescue(
    quest: RescueLockSubject,
    awaiting: ReadonlySet<string>,
): boolean {
    if (!locksWhileRescued(quest.infos?.type)) return false;
    const id = refIdOf(quest._id);
    return id !== null && awaiting.has(id.toHexString());
}
