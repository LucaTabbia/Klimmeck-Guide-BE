import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import { CharacterUpdatesPublisher } from './character-updates.publisher';
import { PendingQuestHoldersPublisher } from './pending-quest-holders.publisher';

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

// gli avvii scrivono solo la PendingQuest: il personaggio si ripubblica da qui, nessun publish sparso nei service (D-22);
// il party avvia insieme tutti i membri e ognuno tiene la propria PendingQuest sulla corsia standard
@Injectable()
export class PendingQuestStartPublisher extends PendingQuestHoldersPublisher {
    constructor(
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Character.name)
        characterModel: Model<CharacterDocument>,
        characterUpdates: CharacterUpdatesPublisher,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(pendingQuestModel, characterModel, characterUpdates, pubSub, {
            stream: PENDING_QUEST_STARTS,
            holding: (condition) => ({
                [lanePathOf(QuestLane.standard)]: condition,
            }),
            holders: 'della missione in attesa',
        });
    }
}
