import type { Logger } from '@nestjs/common';
import type { ClientSession, Model, Types } from 'mongoose';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import type { CharacterDocument } from 'src/models/character/character.model';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import type { QuestDocument } from 'src/models/quest/quest.model';
import type { UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { ownersOf } from 'src/mongo/owners-of';
import { questCancelled } from 'src/push/push-events';
import type { PushService } from 'src/push/push.service';
import { registeredIdsOf } from './party-rules';

export interface RegisteredReleaseModels {
    questModel: Model<QuestDocument>;
    characterModel: Model<CharacterDocument>;
    pendingQuestModel: Model<PendingQuestDocument>;
}

type WarnLogger = Pick<Logger, 'warn'>;

// solo PendingQuest di questa quest ancora non avviate: un membro legacy con startDate scritto resta intatto, con un WARN per la pulizia a mano (BACKEND-NOTES §16)
export async function releaseMembersWithin(
    { characterModel, pendingQuestModel }: RegisteredReleaseModels,
    questId: Types.ObjectId,
    members: readonly Types.ObjectId[],
    session: ClientSession,
    logger: WarnLogger,
): Promise<Types.ObjectId[]> {
    const characters = await characterModel
        .find(
            {
                ...ACTIVE_CHARACTER_FILTER,
                _id: { $in: members.flatMap((id) => idForms(id)) },
            },
            { 'quests.pendingQuest': 1 },
        )
        .session(session)
        .lean<
            {
                _id: Types.ObjectId;
                quests?: { pendingQuest?: unknown } | null;
            }[]
        >()
        .exec();
    const released: Types.ObjectId[] = [];
    for (const character of characters) {
        const pendingQuestId = refIdOf(character.quests?.pendingQuest);
        if (!pendingQuestId) continue;
        const deleted = await pendingQuestModel
            .deleteOne(
                {
                    _id: pendingQuestId,
                    quest: { $in: idForms(questId) },
                    startDate: null,
                },
                { session },
            )
            .exec();
        if (deleted.deletedCount !== 1) {
            logger.warn(
                `Registrato ${character._id.toHexString()} della missione ${questId.toHexString()} non liberato: la missione in attesa ${pendingQuestId.toHexString()} è già avviata o di un'altra missione (dato legacy, pulizia manuale)`,
            );
            continue;
        }
        await characterModel
            .updateOne(
                {
                    ...activeCharacterById(character._id),
                    'quests.pendingQuest': { $in: idForms(pendingQuestId) },
                },
                { $set: { 'quests.pendingQuest': null } },
                { session },
            )
            .exec();
        released.push(character._id);
    }
    return released;
}

// registrati riletti in sessione (non da una pre-lettura): la push la fa il chiamante dopo il commit (D-27)
export async function releaseRegisteredWithin(
    models: RegisteredReleaseModels,
    questId: Types.ObjectId,
    session: ClientSession,
    logger: WarnLogger,
): Promise<Types.ObjectId[]> {
    const quest = await models.questModel
        .findById(questId, { registeredAdventurers: 1 })
        .session(session)
        .lean<{ registeredAdventurers?: { character?: unknown }[] } | null>()
        .exec();
    const members = registeredIdsOf(quest?.registeredAdventurers);
    if (members.length === 0) return [];
    const released = await releaseMembersWithin(
        models,
        questId,
        members,
        session,
        logger,
    );
    await models.questModel
        .updateOne(
            { _id: questId },
            { $set: { registeredAdventurers: [] } },
            { session },
        )
        .exec();
    return released;
}

export async function notifyQuestCancelled(
    userModel: Model<UserDocument>,
    push: Pick<PushService, 'sendToUser'>,
    questId: Types.ObjectId,
    characterIds: readonly Types.ObjectId[],
): Promise<void> {
    if (characterIds.length === 0) return;
    const owners = await ownersOf(userModel, characterIds);
    const message = questCancelled(questId.toHexString());
    for (const ownerId of owners.values()) {
        await push.sendToUser(ownerId, message);
    }
}
