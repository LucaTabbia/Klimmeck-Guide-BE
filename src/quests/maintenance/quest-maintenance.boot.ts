import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import { DungeonStagesMigrator } from './dungeon-stages.migrator';
import { GeneratedQuestsResetMigrator } from './generated-quests-reset.migrator';
import { HuntPreyMigrator } from './hunt-prey.migrator';
import { QuestEnemiesMigrator } from './quest-enemies.migrator';

// un solo orchestratore, passi in ordine e mai bloccanti (Phase 12 D-24); passi una tantum della 13.1 (reset, prede, tappe) e richiesta finale escono dal repo dopo il primo boot reale (Phase 12 D-25); lo sweeper chiede comunque una corsa al boot, il single-flight le fonde
@Injectable()
export class QuestMaintenanceBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuestMaintenanceBoot.name);

    constructor(
        private readonly enemies: QuestEnemiesMigrator,
        private readonly reset: GeneratedQuestsResetMigrator,
        private readonly hunts: HuntPreyMigrator,
        private readonly dungeons: DungeonStagesMigrator,
        private readonly trigger: QuestGenerationTrigger,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.step('migrazione dei nemici delle missioni', () =>
            this.enemies.migrateAll(),
        );
        await this.step('reset delle generate (una tantum)', () =>
            this.reset.migrate(),
        );
        await this.step('prede delle hunt (una tantum)', () =>
            this.hunts.migrate(),
        );
        await this.step('tappe delle dungeon (una tantum)', () =>
            this.dungeons.migrate(),
        );
        // a dati pronti: generate azzerate, hunt e dungeon coerenti prima della corsa (13.1 D-06, D-07)
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
