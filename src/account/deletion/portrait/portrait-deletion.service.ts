import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { describeError } from 'src/mongo/mongo-errors';
import {
    PortraitDeletion,
    PortraitDeletionDocument,
} from './portrait-deletion.model';
import { PortraitStore } from './portrait-store';

interface QueuedPortrait {
    _id: Types.ObjectId;
    publicId: string;
}

// Cloudinary sta fuori dalla transazione e dopo il commit: l'outbox sopravvive ai riavvii, il flush ritenta (Phase 26)
@Injectable()
export class PortraitDeletionService {
    private readonly logger = new Logger(PortraitDeletionService.name);

    constructor(
        @InjectModel(PortraitDeletion.name)
        private readonly outbox: Model<PortraitDeletionDocument>,
        private readonly store: PortraitStore,
    ) {}

    // in serie: una sessione transazionale non regge operazioni concorrenti
    async enqueueWithin(
        session: ClientSession,
        publicIds: readonly string[],
        now: Date,
    ): Promise<void> {
        for (const publicId of new Set(publicIds)) {
            await this.outbox
                .updateOne(
                    { publicId },
                    { $setOnInsert: { publicId, queuedAt: now, attempts: 0 } },
                    { upsert: true, session },
                )
                .exec();
        }
    }

    // mai lancia: un errore lascia la riga al giro seguente
    async flush(): Promise<number> {
        try {
            const queued = await this.outbox
                .find({}, { _id: 1, publicId: 1 })
                .sort({ queuedAt: 1 })
                .lean<QueuedPortrait[]>()
                .exec();
            let closed = 0;
            for (const row of queued) closed += await this.closeSafely(row);
            return closed;
        } catch (error) {
            this.logger.warn(
                `Lettura dei ritratti da cancellare fallita: ${describeError(error)}`,
            );
            return 0;
        }
    }

    private async closeSafely(row: QueuedPortrait): Promise<number> {
        try {
            await this.store.destroy(row.publicId);
            await this.outbox.deleteOne({ _id: row._id }).exec();
            return 1;
        } catch (error) {
            this.logger.warn(
                `Cancellazione del ritratto ${row._id.toHexString()} fallita: ${describeError(error)}`,
            );
            await this.countAttempt(row._id);
            return 0;
        }
    }

    private async countAttempt(rowId: Types.ObjectId): Promise<void> {
        try {
            await this.outbox
                .updateOne({ _id: rowId }, { $inc: { attempts: 1 } })
                .exec();
        } catch (error) {
            this.logger.warn(
                `Conteggio del tentativo sul ritratto ${rowId.toHexString()} fallito: ${describeError(error)}`,
            );
        }
    }
}
