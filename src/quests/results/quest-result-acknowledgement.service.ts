import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import {
    acknowledgementFilterOf,
    acknowledgementUpdateOf,
} from './quest-result-acknowledgement';

// un solo update condizionale (D-03): già confermato ⇒ nessuna scrittura e nessun errore, il FE ritenta a piacere
@Injectable()
export class QuestResultAcknowledgementService {
    constructor(
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        private readonly clock: Clock,
    ) {}

    async acknowledge(
        resultId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<boolean> {
        const { modifiedCount } = await this.questResultModel
            .updateOne(
                acknowledgementFilterOf(resultId, userId),
                acknowledgementUpdateOf(this.clock.now()),
            )
            .exec();
        return modifiedCount === 1;
    }
}
