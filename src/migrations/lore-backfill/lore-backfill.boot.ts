import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { LoreBackfillMigrator } from './lore-backfill.migrator';

// passo una tantum al boot reale (Phase 16 D-11): mai bloccante, soli conteggi nel log; esce dal repo dopo il primo boot reale
@Injectable()
export class LoreBackfillBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(LoreBackfillBoot.name);

    constructor(private readonly migrator: LoreBackfillMigrator) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            const report = await this.migrator.backfillAll();
            this.logger.log(
                `Backfill delle lore: personaggi ${report.characters}, aggiornati ${report.updated}, lore aggiunte ${report.loreAdded}, nemici aggiunti ${report.enemiesAdded}, senza città ${report.withoutCity}`,
            );
        } catch (error) {
            this.logger.error(
                `Backfill delle lore fallito (${describeError(error)}), il boot prosegue`,
            );
        }
    }
}
