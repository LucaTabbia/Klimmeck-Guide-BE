import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ collection: 'sessions', timestamps: true, versionKey: false })
export class Session {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    })
    userId: Types.ObjectId;

    @Prop({ type: String, required: true, unique: true })
    refreshTokenHash: string;

    @Prop({ type: String, index: true, sparse: true })
    previousRefreshTokenHash?: string;

    // hash SHA-256 dei refresh token già ruotati, limitati agli ultimi N (reuse detection, D-08)
    @Prop({ type: [String], default: [], index: true })
    retiredRefreshTokenHashes: string[];

    // valore casuale per sessione che, con la chiave del server, deriva i refresh token (D-35); mai restituito al client
    @Prop({ type: String })
    tokenSeed?: string;

    @Prop({ type: Number, default: 0 })
    rotationCount: number;

    @Prop({ type: Date, default: null })
    rotatedAt: Date | null;

    @Prop({ type: Date, default: null })
    revokedAt: Date | null;

    @Prop({ type: Date, required: true })
    expiresAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
