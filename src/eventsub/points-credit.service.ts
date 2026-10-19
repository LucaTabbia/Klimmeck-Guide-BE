import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { WalletService } from 'src/economy/wallet.service';
import { isDuplicateDelivery } from 'src/eventsub/duplicate-delivery';
import {
    EventSubMessage,
    EventSubMessageDocument,
    EventSubMessageOutcome,
} from 'src/eventsub/eventsub-message.model';
import type { RedemptionEvent } from 'src/eventsub/eventsub-payload';
import { EventSubSubscriptionType } from 'src/eventsub/eventsub-types';
import { User, UserDocument } from 'src/models/user.model';

export enum CreditOutcome {
    credited = 'credited',
    duplicate = 'duplicate',
    unknownViewer = 'unknownViewer',
}

@Injectable()
export class PointsCreditService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(EventSubMessage.name)
        private readonly messageModel: Model<EventSubMessageDocument>,
        private readonly wallet: WalletService,
    ) {}

    async credit(
        redemption: RedemptionEvent,
        messageId: string,
        receivedAt: Date,
    ): Promise<CreditOutcome> {
        const user = await this.userModel
            .findOne({ twitchId: redemption.userId }, { _id: 1 })
            .lean<{ _id: Types.ObjectId } | null>()
            .exec();
        if (!user) return CreditOutcome.unknownViewer;
        try {
            // insert di dedup e credito nella stessa transazione: il perdente di una consegna concorrente riceve E11000 e non accredita (D-08); niente side effect dentro, il callback può essere rieseguito
            await this.connection.transaction(async (session) => {
                await this.messageModel.create(
                    [
                        {
                            messageId,
                            type: EventSubSubscriptionType.redemptionAdd,
                            eventId: redemption.id,
                            twitchUserId: redemption.userId,
                            rewardId: redemption.rewardId,
                            amount: redemption.cost,
                            outcome: EventSubMessageOutcome.credited,
                            receivedAt,
                        },
                    ],
                    { session },
                );
                await this.wallet.creditUserPoints(
                    user._id,
                    redemption.cost,
                    session,
                );
            });
            return CreditOutcome.credited;
        } catch (error) {
            if (isDuplicateDelivery(error)) return CreditOutcome.duplicate;
            // utente cancellato fra il lookup e il credito: la transazione è abortita, nessuna traccia (D-07)
            if (error instanceof ResourceNotFoundException) {
                return CreditOutcome.unknownViewer;
            }
            throw error;
        }
    }
}
