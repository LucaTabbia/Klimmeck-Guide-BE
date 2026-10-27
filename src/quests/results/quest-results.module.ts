import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { AuthzModule } from 'src/authz/authz.module';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { QuestResultAcknowledgementService } from './quest-result-acknowledgement.service';
import { QuestResultsReadModule } from './quest-results-read.module';
import { QuestResultsPublisher } from './quest-results.publisher';
import { QuestResultsResolver } from './quest-results.resolver';

// il modello serve al publisher per il change stream: il modulo di lettura non esporta i modelli
@Module({
    imports: [
        QuestResultsReadModule,
        AuthzModule,
        MongooseModule.forFeature([
            { name: QuestResult.name, schema: QuestResultSchema },
        ]),
    ],
    providers: [
        QuestResultsResolver,
        QuestResultsPublisher,
        QuestResultAcknowledgementService,
        { provide: Clock, useClass: SystemClock },
    ],
})
export class QuestResultsModule {}
