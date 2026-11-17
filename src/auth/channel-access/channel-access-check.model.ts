import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// ultima verifica riuscita dell'accesso al canale, fuori dal documento User per non far scattare userUpdated
@Schema({
    collection: 'channel_access_checks',
    versionKey: false,
})
export class ChannelAccessCheck {
    @Prop({ type: String, required: true, unique: true })
    twitchId: string;

    @Prop({ type: Date, required: true })
    checkedAt: Date;
}

export type ChannelAccessCheckDocument = HydratedDocument<ChannelAccessCheck>;

export const ChannelAccessCheckSchema =
    SchemaFactory.createForClass(ChannelAccessCheck);
