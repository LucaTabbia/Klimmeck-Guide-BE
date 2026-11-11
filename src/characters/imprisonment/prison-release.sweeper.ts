import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { QuestConfig } from 'src/config/quest-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { describeError } from 'src/mongo/mongo-errors';
import { dueReleasesFilter } from './imprisonment';
import { PrisonReleaseService } from './prison-release.service';

interface DuePrisoner {
    _id: Types.ObjectId;
}

// liberazioni dalla prigione (quick 261110-prp): stesso intervallo dello sweep delle missioni, nessuna variabile d'ambiente nuova
@Injectable()
export class PrisonReleaseSweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger(PrisonReleaseSweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<number> | null = null;
    private stopping = false;

    constructor(
        @Inject(QUEST_CONFIG) private readonly config: QuestConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly releases: PrisonReleaseService,
        private readonly clock: Clock,
    ) {}

    // il DB decide: reconciler sempre al boot (liberazioni scadute a processo fermo), mai atteso; 0 spegne solo lo sweep periodico
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => void this.sweepSafely(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        void this.sweepSafely();
    }

    // lo sweep in corso finisce prima che Mongoose chiuda; nessuna nuova liberazione dopo lo stop
    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.inFlight?.catch(() => undefined);
    }

    // single-flight: un tick saltato è recuperato dal successivo
    sweep(): Promise<number> {
        this.inFlight ??= this.runOnce().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async runOnce(): Promise<number> {
        const due = await this.characterModel
            .find(dueReleasesFilter(this.clock.now()), { _id: 1 })
            .lean<DuePrisoner[]>()
            .exec();
        let released = 0;
        // in serie: ogni liberazione è un update condizionale indipendente
        for (const prisoner of due) {
            if (this.stopping) return released;
            released += await this.releaseSafely(prisoner._id);
        }
        if (released > 0) {
            this.logger.log(
                `Sweep delle prigioni: ${released} personaggi liberati`,
            );
        }
        return released;
    }

    private async releaseSafely(characterId: Types.ObjectId): Promise<number> {
        try {
            const outcome = await this.releases.release(characterId);
            return outcome === 'released' ? 1 : 0;
        } catch (error) {
            this.logger.error(
                `Liberazione del personaggio ${characterId.toHexString()} fallita: ${describeError(error)}`,
            );
            return 0;
        }
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            () => undefined,
            (error: unknown) =>
                this.logger.error(
                    `Sweep delle prigioni fallito: ${describeError(error)}`,
                ),
        );
    }
}
