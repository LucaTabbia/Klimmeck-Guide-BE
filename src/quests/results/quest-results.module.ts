import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthzModule } from 'src/authz/authz.module';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
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
    providers: [QuestResultsResolver, QuestResultsPublisher],
})
export class QuestResultsModule {}
