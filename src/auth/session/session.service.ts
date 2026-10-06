import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { generateOpaqueToken, sha256Hex } from 'src/auth/crypto/token-crypto';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const MILLISECONDS_PER_SECOND = 1000;

export interface IssuedRefreshToken {
    sessionId: string;
    userId: string;
    refreshToken: string;
}

@Injectable()
export class SessionService {
    constructor(
        @InjectModel(Session.name)
        private readonly sessionModel: Model<SessionDocument>,
        private readonly clock: Clock,
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    ) {}

    async create(userId: string): Promise<IssuedRefreshToken> {
        const refreshToken = generateOpaqueToken();
        const session = await this.sessionModel.create({
            userId: new Types.ObjectId(userId),
            refreshTokenHash: sha256Hex(refreshToken),
            expiresAt: this.expiresAtFrom(this.clock.now()),
        });
        return { sessionId: session._id.toString(), userId, refreshToken };
    }

    rotate(refreshToken: string): Promise<IssuedRefreshToken> {
        void refreshToken;
        return Promise.reject(new Error('not implemented'));
    }

    async revoke(sessionId: string): Promise<void> {
        if (!Types.ObjectId.isValid(sessionId)) return;
        await this.sessionModel
            .updateOne(
                { _id: sessionId, revokedAt: null },
                { $set: { revokedAt: this.clock.now() } },
            )
            .exec();
    }

    private expiresAtFrom(now: Date): Date {
        return new Date(
            now.getTime() +
                this.config.refreshTokenTtlSeconds * MILLISECONDS_PER_SECOND,
        );
    }
}
