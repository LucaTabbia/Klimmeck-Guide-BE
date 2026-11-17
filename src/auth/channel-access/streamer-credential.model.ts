import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// refresh token Twitch dello streamer, sigillato: serve solo a chiedere a Helix chi segue il canale
@Schema({
    collection: 'streamer_credentials',
    timestamps: true,
    versionKey: false,
})
export class StreamerCredential {
    @Prop({ type: String, required: true, unique: true })
    broadcasterId: string;

    @Prop({ type: String, required: true })
    sealedRefreshToken: string;
}

export type StreamerCredentialDocument = HydratedDocument<StreamerCredential>;

export const StreamerCredentialSchema =
    SchemaFactory.createForClass(StreamerCredential);
