import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PushPlatform } from 'src/push/push-platform.enum';

// 23 328 000 s: FCM fa scadere i token Android inattivi da 270 giorni (D-01)
export const PUSH_DEVICE_TTL_SECONDS = 270 * 24 * 60 * 60;

@Schema({ collection: 'push_devices', versionKey: false })
export class PushDevice {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: String, required: true })
    deviceId: string;

    @Prop({ type: String, required: true })
    token: string;

    @Prop({ type: String, enum: Object.values(PushPlatform), required: true })
    platform: PushPlatform;

    @Prop({ type: Date, required: true })
    lastSeenAt: Date;
}

export type PushDeviceDocument = HydratedDocument<PushDevice>;

export const PushDeviceSchema = SchemaFactory.createForClass(PushDevice);

// invariante (a) di D-01; il prefisso userId serve anche il fan-out di tokensOf
PushDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
// invariante (b) di D-01: un token appartiene a una sola riga
PushDeviceSchema.index({ token: 1 }, { unique: true });
PushDeviceSchema.index(
    { lastSeenAt: 1 },
    { expireAfterSeconds: PUSH_DEVICE_TTL_SECONDS },
);
