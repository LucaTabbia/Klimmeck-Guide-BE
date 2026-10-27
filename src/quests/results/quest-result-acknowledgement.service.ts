import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { User, UserDocument } from 'src/models/user.model';
import {
    acknowledgementFilterOf,
    acknowledgementUpdateOf,
    deathUnlinkOf,
} from './quest-result-acknowledgement';

interface ConfirmedResult {
    outcome: QuestOutcome;
    character: Types.ObjectId;
}

// update condizionale (D-03): già confermato ⇒ nessuna scrittura e nessun errore, il FE ritenta a piacere;
// la conferma di una morte stacca il personaggio corrente nella stessa transazione (D-12)
@Injectable()
export class QuestResultAcknowledgementService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
        private readonly clock: Clock,
    ) {}

    acknowledge(
        resultId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<boolean> {
        return this.connection.transaction(async (session) => {
            const confirmed = await this.questResultModel
                .findOneAndUpdate(
                    acknowledgementFilterOf(resultId, userId),
                    acknowledgementUpdateOf(this.clock.now()),
                    { session, projection: { outcome: 1, character: 1 } },
                )
                .lean<ConfirmedResult | null>()
                .exec();
            if (!confirmed) return false;
            if (confirmed.outcome === QuestOutcome.death) {
                await this.unlinkDeadCharacter(
                    userId,
                    confirmed.character,
                    session,
                );
            }
            return true;
        });
    }

    private async unlinkDeadCharacter(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<void> {
        const unlink = deathUnlinkOf(userId, characterId);
        await this.userModel
            .updateOne(unlink.filter, unlink.update, { session })
            .exec();
    }
}
