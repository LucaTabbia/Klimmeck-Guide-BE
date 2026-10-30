import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf, idForms, objectIdFromHex } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import { CharacterUpdatesPublisher } from './character-updates.publisher';

const PENDING_QUEST_STARTS = {
    pipeline: [
        {
            $match: {
                operationType: 'update',
                'updateDescription.updatedFields.startDate': {
                    $exists: true,
                    $ne: null,
                },
            },
        },
    ],
    subject: 'degli avvii delle missioni',
};

// gli avvii scrivono solo la PendingQuest: il personaggio si ripubblica da qui, nessun publish sparso nei service (D-22)
@Injectable()
export class PendingQuestStartPublisher extends ChangeStreamPublisher<PendingQuestDocument> {
    constructor(
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly characterUpdates: CharacterUpdatesPublisher,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(pendingQuestModel, PENDING_QUEST_STARTS, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const pendingQuestId = objectIdFromHex(
            documentIdOf(change.documentKey),
        );
        if (pendingQuestId) void this.republishHolders(pendingQuestId);
    }

    // il party avvia insieme tutti i membri: ognuno tiene la propria PendingQuest sulla corsia standard
    private async republishHolders(
        pendingQuestId: Types.ObjectId,
    ): Promise<void> {
        try {
            const holders = await this.characterModel
                .find(
                    {
                        ...ACTIVE_CHARACTER_FILTER,
                        [lanePathOf(QuestLane.standard)]: {
                            $in: idForms(pendingQuestId),
                        },
                    },
                    { _id: 1 },
                )
                .lean<{ _id: Types.ObjectId }[]>()
                .exec();
            for (const { _id } of holders)
                this.characterUpdates.requestPublish(String(_id));
        } catch (error) {
            this.logger.error(
                `Ripubblicazione dei personaggi della missione in attesa ${pendingQuestId.toHexString()} fallita: ${describeError(error)}`,
            );
        }
    }
}
