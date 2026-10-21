import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateDelivery } from 'src/eventsub/duplicate-delivery';
import {
    EventSubMessage,
    EventSubMessageDocument,
    EventSubMessageOutcome,
} from 'src/eventsub/eventsub-message.model';
import type { StreamOnlineEvent } from 'src/eventsub/eventsub-payload';
import { EventSubSubscriptionType } from 'src/eventsub/eventsub-types';

export enum StreamOnlineOutcome {
    recorded = 'recorded',
    duplicate = 'duplicate',
}

// un solo documento: l'insert è già atomico, l'indice unico basta alla dedup (Phase 4 D-19)
@Injectable()
export class StreamOnlineRecorder {
    constructor(
        @InjectModel(EventSubMessage.name)
        private readonly messageModel: Model<EventSubMessageDocument>,
    ) {}

    async record(
        event: StreamOnlineEvent,
        messageId: string,
        receivedAt: Date,
    ): Promise<StreamOnlineOutcome> {
        try {
            await this.messageModel.create({
                messageId,
                type: EventSubSubscriptionType.streamOnline,
                eventId: event.id,
                outcome: EventSubMessageOutcome.broadcast,
                receivedAt,
            });
            return StreamOnlineOutcome.recorded;
        } catch (error) {
            if (isDuplicateDelivery(error))
                return StreamOnlineOutcome.duplicate;
            throw error;
        }
    }
}
