import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';
import { abandonClaimFilter } from './party-rules';

export interface AbandonQuestCommand {
    characterId: Types.ObjectId;
    questId: Types.ObjectId;
}

interface WaitingSnapshot {
    quest?: unknown;
}

// utente 2026-10-25: "bisogna dare la possibilità di abbandonare la quest boss durante il momento dell'attesa"
@Injectable()
export class PartyAbandonService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
    ) {}

    // claim sulla PendingQuest in attesa (T-09-91): nessun esito, nessun rimborso (la corsia standard non costa punti)
    async abandon({
        characterId,
        questId,
    }: AbandonQuestCommand): Promise<void> {
        await this.connection.transaction(async (session) => {
            const pendingQuestId = await this.laneOf(characterId, session);
            const deleted = await this.pendingQuestModel
                .deleteOne(abandonClaimFilter(pendingQuestId, questId), {
                    session,
                })
                .exec();
            if (deleted.deletedCount === 0)
                throw await this.refusalOf(pendingQuestId, questId, session);
            await this.characterModel
                .updateOne(
                    {
                        ...activeCharacterById(characterId),
                        'quests.pendingQuest': { $in: idForms(pendingQuestId) },
                    },
                    { $set: { 'quests.pendingQuest': null } },
                    { session },
                )
                .exec();
            await this.questModel
                .updateOne(
                    { _id: questId },
                    {
                        $pull: {
                            registeredAdventurers: {
                                character: { $in: idForms(characterId) },
                            },
                        },
                    },
                    { session },
                )
                .exec();
        });
    }

    private async laneOf(
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Types.ObjectId> {
        const character = await this.characterModel
            .findOne(activeCharacterById(characterId), {
                'quests.pendingQuest': 1,
            })
            .session(session)
            .lean<{ quests?: { pendingQuest?: unknown } | null } | null>()
            .exec();
        const pendingQuestId = refIdOf(character?.quests?.pendingQuest);
        if (!pendingQuestId) throw ResourceNotFoundException.quest();
        return pendingQuestId;
    }

    // rilettura in sessione solo per scegliere il codice: il filtro resta la regola
    private async refusalOf(
        pendingQuestId: Types.ObjectId,
        questId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const fresh = await this.pendingQuestModel
            .findById(pendingQuestId, { quest: 1 })
            .session(session)
            .lean<WaitingSnapshot | null>()
            .exec();
        if (!fresh || !sameId(fresh.quest, questId))
            return ResourceNotFoundException.quest();
        return GameRuleException.questNotWaiting();
    }
}
