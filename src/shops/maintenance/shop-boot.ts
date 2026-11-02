import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { SHOP_REPORT_WARNINGS_LIMIT } from '../shop-pool.constants';
import { describeViolation } from '../shop-pool.report';
import { ShopPoolReportService } from '../shop-pool-report.service';
import { OwnedPetsMigrator } from './owned-pets.migrator';
import { PetSellableMigrator } from './pet-sellable.migrator';
import { ShopPoolSeeder } from './shop-pool.seeder';

// un solo orchestratore: ordine esplicito e testabile (D-24); atteso dal boot ma mai bloccante, come SpellStateMigrator
@Injectable()
export class ShopBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(ShopBoot.name);

    constructor(
        private readonly petSellable: PetSellableMigrator,
        private readonly ownedPets: OwnedPetsMigrator,
        private readonly seeder: ShopPoolSeeder,
        private readonly poolReport: ShopPoolReportService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.step('valorizzazione di Pet.sellable', () =>
            this.petSellable.migrate(),
        );
        await this.step('compagni posseduti', () => this.ownedPets.migrate());
        await this.step('semina dei pool', () => this.seeder.seedAll());
        await this.step('report dei pool', () => this.warnViolations());
    }

    private async step(
        label: string,
        work: () => Promise<unknown>,
    ): Promise<void> {
        try {
            await work();
        } catch (error) {
            this.logger.error(
                `Negozi: ${label} fallita (${describeError(error)}), il boot prosegue`,
            );
        }
    }

    private async warnViolations(): Promise<void> {
        const { entries, unseeded } = await this.poolReport.report();
        for (const violation of entries.slice(0, SHOP_REPORT_WARNINGS_LIMIT))
            this.logger.warn(describeViolation(violation));
        if (entries.length > 0 || unseeded > 0)
            this.logger.warn(
                `Negozi: ${entries.length} città con pool fuori regola, ${unseeded} non seminate`,
            );
    }
}
