import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import { generateOpaqueToken, sha256Hex } from 'src/auth/crypto/token-crypto';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const MILLISECONDS_PER_SECOND = 1000;
const RETIRED_REFRESH_TOKEN_HASHES_LIMIT = 10;

export interface IssuedRefreshToken {
    sessionId: string;
    userId: string;
    refreshToken: string;
}

export interface RotatableSession {
    sessionId: string;
    userId: string;
}

@Injectable()
export class SessionService {
    private readonly logger = new Logger(SessionService.name);

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

    // sola lettura: nessuna rotazione, così un errore a valle lascia valido il token presentato
    async findRotatable(refreshToken: string): Promise<RotatableSession> {
        const now = this.clock.now();
        const presentedHash = sha256Hex(refreshToken);
        const session = await this.sessionModel
            .findOne({
                $or: [
                    { refreshTokenHash: presentedHash },
                    {
                        previousRefreshTokenHash: presentedHash,
                        rotatedAt: { $gt: this.graceStartFrom(now) },
                    },
                ],
                revokedAt: null,
                expiresAt: { $gt: now },
            })
            .exec();
        if (!session) return this.rejectRefresh(presentedHash, now);
        return {
            sessionId: session._id.toString(),
            userId: session.userId.toString(),
        };
    }

    async rotate(refreshToken: string): Promise<IssuedRefreshToken> {
        const now = this.clock.now();
        const presentedHash = sha256Hex(refreshToken);
        const nextToken = generateOpaqueToken();
        const nextHash = sha256Hex(nextToken);
        const rotated =
            (await this.rotateCurrent(presentedHash, nextHash, now)) ??
            (await this.rotateWithinGrace(presentedHash, nextHash, now));
        if (!rotated) return this.rejectRefresh(presentedHash, now);
        return {
            sessionId: rotated._id.toString(),
            userId: rotated.userId.toString(),
            refreshToken: nextToken,
        };
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

    private rotateCurrent(
        presentedHash: string,
        nextHash: string,
        now: Date,
    ): Promise<SessionDocument | null> {
        return this.sessionModel
            .findOneAndUpdate(
                {
                    refreshTokenHash: presentedHash,
                    revokedAt: null,
                    expiresAt: { $gt: now },
                },
                {
                    $set: {
                        previousRefreshTokenHash: presentedHash,
                        refreshTokenHash: nextHash,
                        rotatedAt: now,
                        expiresAt: this.expiresAtFrom(now),
                    },
                    $push: {
                        retiredRefreshTokenHashes: {
                            $each: [presentedHash],
                            $slice: -RETIRED_REFRESH_TOKEN_HASHES_LIMIT,
                        },
                    },
                },
                { new: true },
            )
            .exec();
    }

    // La finestra di grace resta ancorata alla prima rotazione: previousRefreshTokenHash
    // e rotatedAt non cambiano, e solo il token emesso per ultimo resta valido. Il token
    // corrente, ora orfano, viene ritirato nella stessa update (pipeline atomica).
    private rotateWithinGrace(
        presentedHash: string,
        nextHash: string,
        now: Date,
    ): Promise<SessionDocument | null> {
        return this.sessionModel
            .findOneAndUpdate(
                {
                    previousRefreshTokenHash: presentedHash,
                    rotatedAt: { $gt: this.graceStartFrom(now) },
                    revokedAt: null,
                    expiresAt: { $gt: now },
                },
                [
                    {
                        $set: {
                            retiredRefreshTokenHashes: {
                                $slice: [
                                    {
                                        $concatArrays: [
                                            {
                                                $ifNull: [
                                                    '$retiredRefreshTokenHashes',
                                                    [],
                                                ],
                                            },
                                            ['$refreshTokenHash'],
                                        ],
                                    },
                                    -RETIRED_REFRESH_TOKEN_HASHES_LIMIT,
                                ],
                            },
                            refreshTokenHash: nextHash,
                            expiresAt: this.expiresAtFrom(now),
                        },
                    },
                ],
                { new: true },
            )
            .exec();
    }

    private async rejectRefresh(
        presentedHash: string,
        now: Date,
    ): Promise<never> {
        const reused = await this.sessionModel
            .findOneAndUpdate(
                {
                    retiredRefreshTokenHashes: presentedHash,
                    revokedAt: null,
                    expiresAt: { $gt: now },
                },
                { $set: { revokedAt: now } },
            )
            .exec();
        if (reused) {
            this.logger.warn(
                `Refresh token reuse detected: session ${reused._id.toString()} revoked`,
            );
            throw AuthException.sessionRevoked();
        }
        if (await this.isRevokedSessionToken(presentedHash))
            throw AuthException.sessionRevoked();
        throw AuthException.sessionExpired();
    }

    private async isRevokedSessionToken(
        presentedHash: string,
    ): Promise<boolean> {
        const revoked = await this.sessionModel
            .exists({
                $or: [
                    { refreshTokenHash: presentedHash },
                    { retiredRefreshTokenHashes: presentedHash },
                ],
                revokedAt: { $ne: null },
            })
            .exec();
        return revoked !== null;
    }

    private graceStartFrom(now: Date): Date {
        return new Date(
            now.getTime() -
                this.config.refreshTokenGraceSeconds * MILLISECONDS_PER_SECOND,
        );
    }

    private expiresAtFrom(now: Date): Date {
        return new Date(
            now.getTime() +
                this.config.refreshTokenTtlSeconds * MILLISECONDS_PER_SECOND,
        );
    }
}
