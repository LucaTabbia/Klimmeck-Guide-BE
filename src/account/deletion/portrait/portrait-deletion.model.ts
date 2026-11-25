import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// outbox dei ritratti da distruggere su Cloudinary dopo il commit: solo l'id dell'immagine, nessun legame con l'utente (Phase 26 D-04)
@Schema({ collection: 'portrait_deletions', versionKey: false })
export class PortraitDeletion {
    @Prop({ type: String, required: true, unique: true })
    publicId: string;

    @Prop({ type: Date, required: true })
    queuedAt: Date;

    @Prop({ type: Number, default: 0 })
    attempts: number;

    // backoff dei tentativi (WR-02): nessun tentativo prima di questo istante
    @Prop({ type: Date, default: null })
    nextAttemptAt: Date | null;
}

export type PortraitDeletionDocument = HydratedDocument<PortraitDeletion>;

export const PortraitDeletionSchema =
    SchemaFactory.createForClass(PortraitDeletion);

PortraitDeletionSchema.index({ queuedAt: 1 });
