import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    StreamerCredential,
    StreamerCredentialDocument,
} from 'src/auth/channel-access/streamer-credential.model';
import {
    deriveSecretBoxKey,
    openSecret,
    sealSecret,
} from 'src/auth/crypto/secret-box';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const KEY_PURPOSE = 'klimmeck-guide/streamer-twitch-refresh-token';

@Injectable()
export class StreamerCredentialStore {
    private readonly key: Buffer;

    constructor(
        @Inject(AUTH_CONFIG) config: AuthConfig,
        @InjectModel(StreamerCredential.name)
        private readonly credentials: Model<StreamerCredentialDocument>,
    ) {
        this.key = deriveSecretBoxKey(config.jwtSecret, KEY_PURPOSE);
    }

    async save(broadcasterId: string, refreshToken: string): Promise<void> {
        await this.credentials
            .updateOne(
                { broadcasterId },
                {
                    $set: {
                        sealedRefreshToken: sealSecret(refreshToken, this.key),
                    },
                },
                { upsert: true },
            )
            .exec();
    }

    // null anche quando il valore non si apre più (JWT_SECRET cambiato): lo streamer deve rifare il login
    async load(broadcasterId: string): Promise<string | null> {
        const credential = await this.credentials
            .findOne({ broadcasterId }, { sealedRefreshToken: 1 })
            .lean<{ sealedRefreshToken: string } | null>()
            .exec();
        if (!credential) return null;
        return openSecret(credential.sealedRefreshToken, this.key);
    }

    async clear(broadcasterId: string): Promise<void> {
        await this.credentials.deleteOne({ broadcasterId }).exec();
    }
}
