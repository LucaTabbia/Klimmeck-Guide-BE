import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { describeError } from 'src/mongo/mongo-errors';
import { countResidualRefs, MixedRefPathReport } from './mixed-refs.migration';

function residualSummaryOf(counts: MixedRefPathReport[]): string {
    return counts
        .filter(({ residual }) => residual > 0)
        .map(
            ({ collection, path, residual }) =>
                `${collection}:${path}=${residual}`,
        )
        .join(', ');
}

// sola lettura e mai bloccante (D-17d): segnala un deploy del codice ritipizzato su dati non ancora migrati
@Injectable()
export class MixedRefsVerifier implements OnApplicationBootstrap {
    private readonly logger = new Logger(MixedRefsVerifier.name);

    constructor(@InjectConnection() private readonly connection: Connection) {}

    onApplicationBootstrap(): void {
        void this.verify();
    }

    async verify(): Promise<void> {
        try {
            const summary = residualSummaryOf(
                await countResidualRefs(this.connection.db!),
            );
            if (!summary) return;
            this.logger.error(
                `Ref stringa ancora da migrare: ${summary}. Eseguire la migrazione (runbook) prima del deploy del codice ritipizzato`,
            );
        } catch (error) {
            this.logger.error(
                `Verifica dei ref Mixed non riuscita (${describeError(error)})`,
            );
        }
    }
}
