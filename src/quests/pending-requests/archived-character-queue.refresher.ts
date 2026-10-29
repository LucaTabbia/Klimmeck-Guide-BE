import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { ChangeStreamPublisher } from 'src/mongo/change-stream-publisher';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { PendingRequestsPublisher } from './pending-requests.publisher';

// l'archivio non tocca le PendingQuest: senza questo osservatore la voce di un archiviato resterebbe in coda fino al ricalcolo successivo (D-23)
const ARCHIVED_CHARACTER_CHANGES = {
    pipeline: [
        {
            $match: {
                operationType: 'update',
                'updateDescription.updatedFields.deletedAt': {
                    $exists: true,
                    $ne: null,
                },
            },
        },
    ],
    subject: 'dei personaggi archiviati',
};

@Injectable()
export class ArchivedCharacterQueueRefresher extends ChangeStreamPublisher<CharacterDocument> {
    constructor(
        @InjectModel(Character.name)
        characterModel: Model<CharacterDocument>,
        private readonly queue: PendingRequestsPublisher,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(characterModel, ARCHIVED_CHARACTER_CHANGES, pubSub);
    }

    // una raffica di archivi si fonde nel ricalcolo unico del publisher della coda
    protected onChange(): void {
        this.queue.requestRefresh();
    }
}
