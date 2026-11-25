import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { describeError } from 'src/mongo/mongo-errors';
import {
    PortraitDeletion,
    PortraitDeletionDocument,
} from './portrait-deletion.model';
import { portraitPublicIdOf } from './portrait-public-id';
import { PortraitStore } from './portrait-store';

interface QueuedPortrait {
    _id: Types.ObjectId;
    publicId: string;
    attempts?: number;
}

// tetto e ritmo dei tentativi (WR-02): 1, 2, 4… minuti, al massimo 6 ore fra due tentativi
export const MAX_PORTRAIT_ATTEMPTS = 10;
const FIRST_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

function retryDelayMsAfter(attempts: number): number {
    return Math.min(
        FIRST_RETRY_DELAY_MS * 2 ** (attempts - 1),
        MAX_RETRY_DELAY_MS,
    );
}

// Cloudinary sta fuori dalla transazione e dopo il commit: l'outbox sopravvive ai riavvii, il flush ritenta (Phase 26)
@Injectable()
export class PortraitDeletionService {
    private readonly logger = new Logger(PortraitDeletionService.name);

    constructor(
        @InjectModel(PortraitDeletion.name)
        private readonly outbox: Model<PortraitDeletionDocument>,
        private readonly store: PortraitStore,
        private readonly clock: Clock,
    ) {}

    // solo i ritratti del cloud su cui agisce lo store (CR-01)
    publicIdOf(imagePath: unknown): string | null {
        return portraitPublicIdOf(imagePath, this.store.cloudName);
    }

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
                    {
                        $setOnInsert: {
                            publicId,
                            queuedAt: now,
                            attempts: 0,
                            nextAttemptAt: now,
                        },
                    },
                    { upsert: true, session },
                )
                .exec();
        }
    }

    // mai lancia: un errore lascia la riga al suo prossimo turno; oltre il tetto la riga resta per la pulizia a mano (WR-02)
    async flush(): Promise<number> {
        try {
            const now = this.clock.now();
            const queued = await this.outbox
                .find(
                    {
                        attempts: { $lt: MAX_PORTRAIT_ATTEMPTS },
                        nextAttemptAt: { $not: { $gt: now } },
                    },
                    { _id: 1, publicId: 1, attempts: 1 },
                )
                .sort({ queuedAt: 1 })
                .lean<QueuedPortrait[]>()
                .exec();
            let closed = 0;
            for (const row of queued)
                closed += await this.closeSafely(row, now);
            return closed;
        } catch (error) {
            this.logger.warn(
                `Lettura dei ritratti da cancellare fallita: ${describeError(error)}`,
            );
            return 0;
        }
    }

    private async closeSafely(row: QueuedPortrait, now: Date): Promise<number> {
        try {
            await this.store.destroy(row.publicId);
            await this.outbox.deleteOne({ _id: row._id }).exec();
            return 1;
        } catch (error) {
            this.logger.warn(
                `Cancellazione del ritratto ${row._id.toHexString()} fallita: ${describeError(error)}`,
            );
            await this.countAttempt(row, now);
            return 0;
        }
    }

    private async countAttempt(row: QueuedPortrait, now: Date): Promise<void> {
        const rowId = row._id;
        const attempts = (row.attempts ?? 0) + 1;
        try {
            await this.outbox
                .updateOne(
                    { _id: rowId },
                    {
                        $inc: { attempts: 1 },
                        $set: {
                            nextAttemptAt: new Date(
                                now.getTime() + retryDelayMsAfter(attempts),
                            ),
                        },
                    },
                )
                .exec();
            if (attempts >= MAX_PORTRAIT_ATTEMPTS) {
                this.logger.error(
                    `Ritratto ${rowId.toHexString()} abbandonato dopo ${attempts} tentativi: resta nell'outbox per la pulizia a mano`,
                );
            }
        } catch (error) {
            this.logger.warn(
                `Conteggio del tentativo sul ritratto ${rowId.toHexString()} fallito: ${describeError(error)}`,
            );
        }
    }
}
