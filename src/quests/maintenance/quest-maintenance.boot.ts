import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { GroupPrizeReportService } from './group-prize-report.service';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';

// un solo orchestratore, passi in ordine e mai bloccanti (Phase 12 D-24); i passi una tantum delle Phase 13 e 13.1 sono usciti dal repo dopo il primo boot reale del 2026-11-05 (Phase 12 D-25); la corsa del generatore al boot la chiede QuestGenerationSweeper
@Injectable()
export class QuestMaintenanceBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuestMaintenanceBoot.name);

    constructor(
        private readonly enemies: QuestEnemiesMigrator,
        private readonly groupPrizes: GroupPrizeReportService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.step('migrazione dei nemici delle missioni', () =>
            this.enemies.migrateAll(),
        );
        // sola lettura (D-24, D-28): elenca le quest di gruppo da correggere a mano
        await this.step('report dei premi per titolo', () =>
            this.groupPrizes.report(),
        );
    }

    private async step(
        label: string,
        work: () => Promise<unknown>,
    ): Promise<void> {
        try {
            await work();
        } catch (error) {
            this.logger.error(
                `Manutenzione missioni: ${label} fallita (${describeError(error)}), il boot prosegue`,
            );
        }
    }
}
