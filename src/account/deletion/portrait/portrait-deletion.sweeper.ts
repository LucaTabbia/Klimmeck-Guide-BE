import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { QuestConfig } from 'src/config/quest-config';
import { describeError } from 'src/mongo/mongo-errors';
import { PortraitDeletionService } from './portrait-deletion.service';

// ritratti rimasti nell'outbox (Phase 26): stesso intervallo dello sweep delle missioni, nessuna variabile d'ambiente nuova
@Injectable()
export class PortraitDeletionSweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger(PortraitDeletionSweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<number> | null = null;

    constructor(
        @Inject(QUEST_CONFIG) private readonly config: QuestConfig,
        private readonly deletions: PortraitDeletionService,
    ) {}

    // al boot sempre (righe rimaste a processo fermo), mai atteso; 0 spegne solo il ritentativo periodico
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => void this.sweepSafely(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        void this.sweepSafely();
    }

    // il flush in corso finisce prima che Mongoose chiuda
    async onModuleDestroy(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.inFlight?.catch(() => undefined);
    }

    // single-flight: un tick saltato è recuperato dal successivo
    sweep(): Promise<number> {
        this.inFlight ??= this.deletions.flush().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            (closed) => {
                if (closed > 0) {
                    this.logger.log(
                        `Sweep dei ritratti: ${closed} ritratti cancellati`,
                    );
                }
            },
            (error: unknown) =>
                this.logger.error(
                    `Sweep dei ritratti fallito: ${describeError(error)}`,
                ),
        );
    }
}
