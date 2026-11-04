import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { JewelAccessoryMigrator } from './jewel-accessory.migrator';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';

// un solo orchestratore, passi in ordine e mai bloccanti (Phase 12 D-24): i passi una tantum dei piani 13-16/13-17 si aggiungono qui e se ne vanno dopo il primo boot reale (Phase 12 D-25)
@Injectable()
export class QuestMaintenanceBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuestMaintenanceBoot.name);

    constructor(
        private readonly enemies: QuestEnemiesMigrator,
        private readonly jewels: JewelAccessoryMigrator,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.step('migrazione dei nemici delle missioni', () =>
            this.enemies.migrateAll(),
        );
        await this.step("fasi d'uso dei gioielli (una tantum)", () =>
            this.jewels.migrate(),
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
