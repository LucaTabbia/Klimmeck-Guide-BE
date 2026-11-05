import {
    Inject,
    Injectable,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { QUEST_GENERATION_CONFIG } from 'src/config/quest-generation-config';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { QuestGenerator } from './quest-generator.service';

@Injectable()
export class QuestGenerationSweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private timer: NodeJS.Timeout | null = null;
    private stopping = false;

    constructor(
        @Inject(QUEST_GENERATION_CONFIG)
        private readonly config: QuestGenerationConfig,
        private readonly generator: QuestGenerator,
    ) {}

    // il DB decide (D-17): a mondo pieno una corsa crea 0; la richiesta dopo una conclusione e la mutation passano dallo stesso single-flight
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => this.requestUnlessStopping(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        this.generator.request();
    }

    // la corsa in volo finisce prima che Mongoose chiuda; nessuna nuova corsa dopo lo stop
    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.generator.close();
    }

    private requestUnlessStopping(): void {
        if (this.stopping) return;
        this.generator.request();
    }
}
