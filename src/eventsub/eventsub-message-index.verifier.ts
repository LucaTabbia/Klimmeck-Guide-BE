import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    EventSubMessage,
    EventSubMessageDocument,
} from 'src/eventsub/eventsub-message.model';
import { describeError } from 'src/mongo/mongo-errors';

// non blocca mai il boot: senza gli indici unici la dedup delle consegne sparirebbe in silenzio (D-09)
@Injectable()
export class EventSubMessageIndexVerifier implements OnApplicationBootstrap {
    private readonly logger = new Logger(EventSubMessageIndexVerifier.name);

    constructor(
        @InjectModel(EventSubMessage.name)
        private readonly model: Model<EventSubMessageDocument>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.model.createIndexes();
        } catch (error) {
            this.logger.error(
                `Indexes on eventsub_messages could not be built (${describeError(error)}). EventSub deliveries are not guaranteed to be credited once.`,
            );
        }
    }
}
