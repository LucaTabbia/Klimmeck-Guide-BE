import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false, versionKey: false })
export class RetiredRefreshToken {
    @Prop({ type: String, required: true })
    hash: string;

    @Prop({ type: Date, required: true })
    retiredAt: Date;
}

const RetiredRefreshTokenSchema =
    SchemaFactory.createForClass(RetiredRefreshToken);

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

    // hash SHA-256 e istante di ritiro dei refresh token già ruotati, limitati agli ultimi N:
    // grace per token ritirato (D-35) e reuse detection (D-08)
    @Prop({ type: [RetiredRefreshTokenSchema], default: [] })
    retiredRefreshTokens: RetiredRefreshToken[];

    // valore casuale per sessione che, con la chiave del server, deriva i refresh token (D-35); mai restituito al client
    @Prop({ type: String })
    tokenSeed?: string;

    @Prop({ type: Number, default: 0 })
    rotationCount: number;

    @Prop({ type: Date, default: null })
    revokedAt: Date | null;

    @Prop({ type: Date, required: true })
    expiresAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ 'retiredRefreshTokens.hash': 1 });
