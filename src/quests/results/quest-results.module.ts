import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { AuthzModule } from 'src/authz/authz.module';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { User, UserSchema } from 'src/models/user.model';
import { QuestResultAcknowledgementService } from './quest-result-acknowledgement.service';
import { QuestResultMaintenance } from './quest-result-maintenance';
import { QuestResultsReadModule } from './quest-results-read.module';
import { QuestResultsPublisher } from './quest-results.publisher';
import { QuestResultsResolver } from './quest-results.resolver';

// i modelli servono al publisher per il change stream e alla conferma, che stacca il morto: il modulo di lettura non esporta i modelli
@Module({
    imports: [
        QuestResultsReadModule,
        AuthzModule,
        MongooseModule.forFeature([
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    providers: [
        QuestResultsResolver,
        QuestResultsPublisher,
        QuestResultAcknowledgementService,
        QuestResultMaintenance,
        { provide: Clock, useClass: SystemClock },
    ],
})
export class QuestResultsModule {}
