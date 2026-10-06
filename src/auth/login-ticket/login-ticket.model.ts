import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ collection: 'login_tickets', timestamps: true, versionKey: false })
export class LoginTicket {
    @Prop({ type: String, required: true, unique: true })
    ticketHash: string;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: String, required: true })
    codeChallenge: string;

    @Prop({ type: Date, required: true })
    expiresAt: Date;
}

export type LoginTicketDocument = HydratedDocument<LoginTicket>;

export const LoginTicketSchema = SchemaFactory.createForClass(LoginTicket);

LoginTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
