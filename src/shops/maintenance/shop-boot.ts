import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import { SHOP_REPORT_WARNINGS_LIMIT } from '../shop-pool.constants';
import { describeViolation } from '../shop-pool.report';
import { ShopPoolReportService } from '../shop-pool-report.service';

// al boot resta il solo report dei pool (D-06): migrazioni e semina hanno girato una volta sul database reale e sono uscite dal repo (D-25); atteso dal boot ma mai bloccante (D-24)
@Injectable()
export class ShopBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(ShopBoot.name);

    constructor(private readonly poolReport: ShopPoolReportService) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.warnViolations();
        } catch (error) {
            this.logger.error(
                `Negozi: report dei pool fallito (${describeError(error)}), il boot prosegue`,
            );
        }
    }

    private async warnViolations(): Promise<void> {
        const { entries, withoutPool } = await this.poolReport.report();
        for (const violation of entries.slice(0, SHOP_REPORT_WARNINGS_LIMIT))
            this.logger.warn(describeViolation(violation));
        if (entries.length > 0 || withoutPool > 0)
            this.logger.warn(
                `Negozi: ${entries.length} città con pool fuori regola, ${withoutPool} senza pool`,
            );
    }
}
