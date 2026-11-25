import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { describeError } from 'src/mongo/mongo-errors';
import {
    PortraitDeletion,
    PortraitDeletionDocument,
} from './portrait-deletion.model';
import {
    portraitPublicIdOf,
    portraitReferencePatternOf,
} from './portrait-public-id';
import { PortraitStore } from './portrait-store';

interface QueuedPortrait {
    _id: Types.ObjectId;
    publicId: string;
    attempts?: number;
}

interface CharacterPortrait {
    infos?: { imagePath?: unknown } | null;
}

export interface ShownPortraitScope {
    excluding?: readonly Types.ObjectId[];
    session?: ClientSession;
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
        @InjectModel(Character.name)
        private readonly characters: Model<CharacterDocument>,
        private readonly store: PortraitStore,
        private readonly clock: Clock,
    ) {}

    // solo i ritratti del cloud su cui agisce lo store (CR-01)
    publicIdOf(imagePath: unknown): string | null {
        return portraitPublicIdOf(imagePath, this.store.cloudName);
    }

    // driver nativo: nessun filtro implicito sugli archiviati, la regex vede ogni grafia dell'URL (CR-01);
    // la usano l'accodamento, nella transazione, e il flush, subito prima di distruggere (U-01)
    async publicIdsShown(
        publicIds: readonly string[],
        { excluding = [], session }: ShownPortraitScope = {},
    ): Promise<string[]> {
        if (publicIds.length === 0) return [];
        const survivors = await this.characters.collection
            .find<CharacterPortrait>(
                {
                    _id: { $nin: [...excluding] },
                    'infos.imagePath': {
                        $regex: portraitReferencePatternOf(publicIds),
                    },
                },
                { projection: { 'infos.imagePath': 1 }, session },
            )
            .toArray();
        const paths = survivors
            .map(({ infos }) => infos?.imagePath)
            .filter((path): path is string => typeof path === 'string');
        return publicIds.filter((publicId) => {
            const pattern = portraitReferencePatternOf([publicId]);
            return paths.some((path) => pattern.test(path));
        });
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

    // un personaggio nato dopo l'accodamento (upload preso da un altro, riga rimasta in backoff) tiene il ritratto: la riga si chiude senza distruggere (U-01)
    private async closeSafely(row: QueuedPortrait, now: Date): Promise<number> {
        try {
            const [shown] = await this.publicIdsShown([row.publicId]);
            if (!shown) await this.store.destroy(row.publicId);
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
