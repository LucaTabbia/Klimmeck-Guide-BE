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
import { ChangeStreamPublisher } from 'src/mongo/change-stream-publisher';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { CharacterUpdatesPublisher } from './character-updates.publisher';

const PENDING_QUEST_STARTS = {
    pipeline: [],
    subject: 'degli avvii delle missioni',
};

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

    protected onChange(): void {
        return;
    }
}
