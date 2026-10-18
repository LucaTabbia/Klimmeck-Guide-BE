import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { User, UserDocument } from 'src/models/user.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
import { SendTestPushInput } from 'src/push/dto/send-test-push.input';
import {
    chunk,
    DeliveryFailureKind,
    deliveryCountsOf,
    describePushError,
    emptyDelivery,
    failureCodeSummary,
    failuresByKind,
    prunableTokens,
    PushDeliveryCounts,
    topicDeliveryCounts,
} from 'src/push/push-delivery';
import {
    assertValidDeviceId,
    validateRegisterPushDeviceInput,
} from 'src/push/push-device-input.validator';
import { PushDeviceRegistry } from 'src/push/push-device.registry';
import { testPushMessage } from 'src/push/push-events';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushMessage, STREAMER_LIVE_TOPIC } from 'src/push/push-message';
import { PushException } from 'src/push/push.exception';
import {
    FCM_MULTICAST_LIMIT,
    PushTransport,
    TokenDeliveryOutcome,
    TRANSPORT_ERROR_CODE,
} from 'src/push/transport/push-transport';

const LOGGED_TOKEN_SUFFIX_LENGTH = 6;

const tokenSuffix = (token: string): string =>
    `…${token.slice(-LOGGED_TOKEN_SUFFIX_LENGTH)}`;

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
            const pruned = await this.pruneBestEffort(message.type, prunable);
            this.reportFailures(message.type, outcomes, pruned);
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

    async registerDevice(
        userId: string,
        input: RegisterPushDeviceInput,
    ): Promise<boolean> {
        validateRegisterPushDeviceInput(input);
        const owner = await this.authenticatedOwner(userId);
        const previous = await this.registry.claim(
            {
                userId: owner,
                deviceId: input.deviceId,
                token: input.token,
                platform: input.platform,
            },
            this.clock.now(),
        );
        // si ri-iscrive a ogni registrazione: idempotente e ripara un fallimento precedente (D-09)
        await this.subscribeBestEffort(input.token);
        if (previous && previous !== input.token) {
            await this.unsubscribeBestEffort(previous);
        }
        return true;
    }

    async unregisterDevice(userId: string, deviceId: string): Promise<boolean> {
        assertValidDeviceId(deviceId);
        const owner = objectIdFromHex(userId);
        if (!owner) throw AuthException.unauthenticated();
        const removed = await this.registry.unregister(owner, deviceId);
        if (removed) await this.unsubscribeBestEffort(removed);
        return true; // idempotente (D-03)
    }

    async sendTest(
        callerId: string,
        input: SendTestPushInput,
    ): Promise<PushDeliveryCounts> {
        if (!this.transport.enabled) throw PushException.disabled();
        if (input.type === PushEventType.streamerLive) {
            return this.broadcast(testPushMessage(input.type));
        }
        const target = await this.existingUser(input.targetUserId ?? callerId);
        return this.sendToUser(target, testPushMessage(input.type, input.id));
    }

    // un bearer valido di uno User cancellato non registra device: nessuna riga orfana (precedente rejectUnlinked)
    private async authenticatedOwner(userId: string): Promise<Types.ObjectId> {
        const owner = objectIdFromHex(userId);
        if (!owner || !(await this.userExists(owner))) {
            throw AuthException.unauthenticated();
        }
        return owner;
    }

    private async existingUser(userId: string): Promise<Types.ObjectId> {
        const id = objectIdFromHex(userId);
        if (!id || !(await this.userExists(id))) {
            throw ResourceNotFoundException.user();
        }
        return id;
    }

    private async userExists(id: Types.ObjectId): Promise<boolean> {
        return (await this.userModel.exists({ _id: id }).exec()) !== null;
    }

    // FCM ha già accettato i messaggi: un errore del registro non deve cancellare l'esito della consegna (review IN-01)
    private async pruneBestEffort(
        type: PushEventType,
        tokens: string[],
    ): Promise<number> {
        if (tokens.length === 0) return 0;
        try {
            return await this.registry.removeTokens(tokens);
        } catch (error) {
            this.logger.warn(
                `Push ${type}: pruning failed for ${tokens.length} stale token(s): ${describePushError(error)}`,
            );
            return 0;
        }
    }

    // best-effort (D-09): un errore di gestione topic è loggato e non cambia l'esito della mutation
    private async subscribeBestEffort(token: string): Promise<void> {
        try {
            await this.transport.subscribeToTopic([token], STREAMER_LIVE_TOPIC);
        } catch (error) {
            this.logger.warn(
                `subscribe ${STREAMER_LIVE_TOPIC} failed for token ${tokenSuffix(token)}: ${describePushError(error)}`,
            );
        }
    }

    private async unsubscribeBestEffort(token: string): Promise<void> {
        try {
            await this.transport.unsubscribeFromTopic(
                [token],
                STREAMER_LIVE_TOPIC,
            );
        } catch (error) {
            this.logger.warn(
                `unsubscribe ${STREAMER_LIVE_TOPIC} failed for token ${tokenSuffix(token)}: ${describePushError(error)}`,
            );
        }
    }

    private reportFailures(
        type: PushEventType,
        outcomes: readonly TokenDeliveryOutcome[],
        pruned: number,
    ): void {
        if (pruned > 0)
            this.logger.log(`Push ${type}: pruned ${pruned} stale token(s)`);
        const failures = failuresByKind(outcomes);
        const rejected = failures[DeliveryFailureKind.payload];
        const transient = failures[DeliveryFailureKind.transient];
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
