import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { describeError } from 'src/mongo/mongo-errors';
import {
    LEGACY_RESULTS_FILTER,
    legacyResultsBackfill,
} from './quest-result-acknowledgement';

// indice della lista e conferma dei risultati precedenti al deploy (D-04, D-05): una volta per processo al boot, non atteso;
// il backfill diventa un no-op dopo il primo deploy e si rimuove in v1.1 (D-17b)
@Injectable()
export class QuestResultMaintenance implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuestResultMaintenance.name);

    constructor(
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
    ) {}

    onApplicationBootstrap(): void {
        void this.maintain();
    }

    async maintain(): Promise<void> {
        await this.verifyIndexes();
        try {
            const marked = await this.backfill();
            if (marked > 0) {
                this.logger.log(
                    `Risultati precedenti alla conferma marcati come confermati: ${marked}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `Conferma dei risultati precedenti fallita (${describeError(error)}): il FE li riceverà come non confermati`,
            );
        }
    }

    async verifyIndexes(): Promise<void> {
        try {
            await this.questResultModel.createIndexes();
        } catch (error) {
            this.logger.error(
                `Indici di questresults non costruiti (${describeError(error)}): la lista dei non confermati resta corretta ma più lenta`,
            );
        }
    }

    async backfill(): Promise<number> {
        const { modifiedCount } = await this.questResultModel
            .updateMany(LEGACY_RESULTS_FILTER, legacyResultsBackfill())
            .exec();
        return modifiedCount;
    }
}
