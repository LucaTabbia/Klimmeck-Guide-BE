import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import { DungeonStagesMigrator } from './dungeon-stages.migrator';
import { EnemyLegendaryMigrator } from './enemy-legendary.migrator';
import { JewelAccessoryMigrator } from './jewel-accessory.migrator';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';

// un solo orchestratore, passi in ordine e mai bloccanti (Phase 12 D-24); dopo il primo boot reale escono dal repo i passi una tantum e la richiesta finale (lo sweeper del generatore gira comunque al boot) (Phase 12 D-25)
@Injectable()
export class QuestMaintenanceBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuestMaintenanceBoot.name);

    constructor(
        private readonly enemies: QuestEnemiesMigrator,
        private readonly legendary: EnemyLegendaryMigrator,
        private readonly jewels: JewelAccessoryMigrator,
        private readonly dungeons: DungeonStagesMigrator,
        private readonly trigger: QuestGenerationTrigger,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.step('migrazione dei nemici delle missioni', () =>
            this.enemies.migrateAll(),
        );
        await this.step('flag dei leggendari (una tantum)', () =>
            this.legendary.migrate(),
        );
        await this.step("fasi d'uso dei gioielli (una tantum)", () =>
            this.jewels.migrate(),
        );
        await this.step('tappe delle dungeon (una tantum)', () =>
            this.dungeons.migrate(),
        );
        // a dati pronti: leggendari esclusi e dungeon a tappe prima della prima corsa (D-17)
        await this.step('richiesta di corsa al generatore', () => {
            this.trigger.request();
            return Promise.resolve();
        });
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
