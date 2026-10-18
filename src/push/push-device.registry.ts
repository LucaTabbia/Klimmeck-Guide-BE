import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isDuplicateKeyError } from 'src/mongo/mongo-errors';
import { PushDevice, PushDeviceDocument } from 'src/push/push-device.model';
import { PushPlatform } from 'src/push/push-platform.enum';

export interface DeviceRegistration {
    userId: Types.ObjectId;
    deviceId: string;
    token: string;
    platform: PushPlatform;
}

interface StoredToken {
    token: string;
}

@Injectable()
export class PushDeviceRegistry {
    constructor(
        @InjectModel(PushDevice.name)
        private readonly model: Model<PushDeviceDocument>,
    ) {}

    // restituisce il token che la riga (userId, deviceId) aveva prima, o null: il chiamante lo disiscrive dai topic
    async claim(
        registration: DeviceRegistration,
        now: Date,
    ): Promise<string | null> {
        try {
            return await this.claimOnce(registration, now);
        } catch (error) {
            // un altro detentore ha preso il token tra la delete e l'upsert: il secondo tentativo lo rimuove (RESEARCH Q4)
            if (!isDuplicateKeyError(error)) throw error;
            return this.claimOnce(registration, now);
        }
    }

    async unregister(
        userId: Types.ObjectId,
        deviceId: string,
    ): Promise<string | null> {
        const removed = await this.model
            .findOneAndDelete(
                { userId, deviceId },
                { projection: { token: 1 } },
            )
            .lean<StoredToken | null>()
            .exec();
        return removed?.token ?? null;
    }

    async tokensOf(userId: Types.ObjectId): Promise<string[]> {
        const tokens: unknown[] = await this.model
            .distinct('token', { userId })
            .exec();
        return tokens.filter(
            (token): token is string => typeof token === 'string',
        );
    }

    async removeTokens(tokens: string[]): Promise<number> {
        if (tokens.length === 0) return 0;
        const result = await this.model
            .deleteMany({ token: { $in: tokens } })
            .exec();
        return result.deletedCount;
    }

    private async claimOnce(
        { userId, deviceId, token, platform }: DeviceRegistration,
        now: Date,
    ): Promise<string | null> {
        await this.model
            .deleteMany({ token, $nor: [{ userId, deviceId }] })
            .exec();
        const previous = await this.model
            .findOneAndUpdate(
                { userId, deviceId },
                { $set: { token, platform, lastSeenAt: now } },
                {
                    upsert: true,
                    returnDocument: 'before',
                    projection: { token: 1 },
                },
            )
            .lean<StoredToken | null>()
            .exec();
        return previous?.token ?? null;
    }
}
