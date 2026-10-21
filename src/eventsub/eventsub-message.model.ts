import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// 604 800 s: il ledger serve al supporto e alla dedup delle riconsegne per una settimana (D-09)
export const EVENTSUB_MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

export enum EventSubMessageOutcome {
    credited = 'credited',
    broadcast = 'broadcast',
}

@Schema({ collection: 'eventsub_messages', versionKey: false })
export class EventSubMessage {
    @Prop({ type: String, required: true })
    messageId: string;

    @Prop({ type: String, required: true })
    type: string;

    @Prop({ type: String, required: true })
    eventId: string;

    @Prop({ type: String, default: null })
    twitchUserId: string | null;

    @Prop({ type: String, default: null })
    rewardId: string | null;

    @Prop({ type: Number, default: null })
    amount: number | null;

    @Prop({
        type: String,
        enum: Object.values(EventSubMessageOutcome),
        required: true,
    })
    outcome: EventSubMessageOutcome;

    @Prop({ type: Date, required: true })
    receivedAt: Date;
}

export type EventSubMessageDocument = HydratedDocument<EventSubMessage>;

export const EventSubMessageSchema =
    SchemaFactory.createForClass(EventSubMessage);

EventSubMessageSchema.index(
    { messageId: 1 },
    { unique: true, name: 'eventsub_message_id_unique' },
);
// due subscription attive consegnano lo stesso evento con message id diversi (C7)
EventSubMessageSchema.index(
    { type: 1, eventId: 1 },
    {
        unique: true,
        name: 'eventsub_event_unique',
        partialFilterExpression: { eventId: { $type: 'string' } },
    },
);
EventSubMessageSchema.index(
    { receivedAt: 1 },
    {
        expireAfterSeconds: EVENTSUB_MESSAGE_TTL_SECONDS,
        name: 'eventsub_message_ttl',
    },
);
