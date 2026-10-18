import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { User, UserDocument } from 'src/models/user.model';
import {
    chunk,
    classifyDeliveryFailure,
    DeliveryFailureKind,
    deliveryCountsOf,
    describePushError,
    emptyDelivery,
    failureCodeSummary,
    prunableTokens,
    PushDeliveryCounts,
    topicDeliveryCounts,
} from 'src/push/push-delivery';
import { PushDeviceRegistry } from 'src/push/push-device.registry';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushMessage, STREAMER_LIVE_TOPIC } from 'src/push/push-message';
import {
    FCM_MULTICAST_LIMIT,
    PushTransport,
    TokenDeliveryOutcome,
    TRANSPORT_ERROR_CODE,
} from 'src/push/transport/push-transport';

const PAYLOAD_REJECTION_KINDS: ReadonlySet<DeliveryFailureKind> = new Set([
    DeliveryFailureKind.payload,
    DeliveryFailureKind.suspectToken,
]);

@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);

    constructor(
        private readonly registry: PushDeviceRegistry,
        private readonly transport: PushTransport,
        private readonly clock: Clock,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    ) {}

    // best-effort (D-08): mai un'eccezione verso il chiamante di dominio; chiamare DOPO il commit, mai dentro connection.transaction (Pitfall 7)
    async sendToUser(
        userId: Types.ObjectId,
        message: PushMessage,
    ): Promise<PushDeliveryCounts> {
        if (!this.transport.enabled) return emptyDelivery();
        try {
            const tokens = await this.registry.tokensOf(userId);
            if (tokens.length === 0) return emptyDelivery();
            const outcomes: TokenDeliveryOutcome[] = [];
            const prunable: string[] = [];
            for (const batch of chunk(tokens, FCM_MULTICAST_LIMIT)) {
                const batchOutcomes = await this.transport.sendToTokens(
                    batch,
                    message,
                );
                outcomes.push(...batchOutcomes);
                prunable.push(...prunableTokens(batchOutcomes));
            }
            const pruned =
                prunable.length > 0
                    ? await this.registry.removeTokens(prunable)
                    : 0;
            this.reportFailures(message.type, outcomes, prunable, pruned);
            return deliveryCountsOf(outcomes, pruned);
        } catch (error) {
            this.logger.warn(
                `Push ${message.type} not sent: ${describePushError(error)}`,
            );
            return emptyDelivery();
        }
    }

    async broadcast(message: PushMessage): Promise<PushDeliveryCounts> {
        if (!this.transport.enabled) return emptyDelivery();
        try {
            const outcome = await this.transport.sendToTopic(
                STREAMER_LIVE_TOPIC,
                message,
            );
            if (!outcome.delivered) {
                this.logger.warn(
                    `Push ${message.type} to topic ${STREAMER_LIVE_TOPIC} not delivered (${outcome.errorCode ?? TRANSPORT_ERROR_CODE})`,
                );
            }
            return topicDeliveryCounts(outcome);
        } catch (error) {
            this.logger.warn(
                `Push ${message.type} to topic ${STREAMER_LIVE_TOPIC} not sent: ${describePushError(error)}`,
            );
            return topicDeliveryCounts({ delivered: false });
        }
    }

    private reportFailures(
        type: PushEventType,
        outcomes: readonly TokenDeliveryOutcome[],
        prunable: readonly string[],
        pruned: number,
    ): void {
        if (pruned > 0)
            this.logger.log(`Push ${type}: pruned ${pruned} stale token(s)`);
        const pruneSet = new Set(prunable);
        const kept = outcomes.filter(
            (outcome) => !outcome.delivered && !pruneSet.has(outcome.token),
        );
        const rejected = kept.filter((outcome) =>
            PAYLOAD_REJECTION_KINDS.has(
                classifyDeliveryFailure(outcome.errorCode),
            ),
        );
        const transient = kept.filter(
            (outcome) =>
                classifyDeliveryFailure(outcome.errorCode) ===
                DeliveryFailureKind.transient,
        );
        if (rejected.length > 0) {
            this.logger.error(
                `Push ${type}: ${rejected.length} token(s) rejected the payload (${failureCodeSummary(rejected)}): nothing pruned for them`,
            );
        }
        if (transient.length > 0) {
            this.logger.warn(
                `Push ${type}: ${transient.length} token(s) not delivered (${failureCodeSummary(transient)})`,
            );
        }
    }
}
