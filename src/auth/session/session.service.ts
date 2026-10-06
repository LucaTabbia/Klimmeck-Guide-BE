import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import {
    deriveRefreshToken,
    deriveRefreshTokenKey,
} from 'src/auth/crypto/refresh-token-derivation';
import { generateOpaqueToken, sha256Hex } from 'src/auth/crypto/token-crypto';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const MILLISECONDS_PER_SECOND = 1000;
const RETIRED_REFRESH_TOKENS_LIMIT = 10;

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
    private readonly refreshTokenKey: Buffer;

    constructor(
        @InjectModel(Session.name)
        private readonly sessionModel: Model<SessionDocument>,
        private readonly clock: Clock,
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    ) {
        this.refreshTokenKey = deriveRefreshTokenKey(config.jwtSecret);
    }

    async create(userId: string): Promise<IssuedRefreshToken> {
        const sessionId = new Types.ObjectId();
        const tokenSeed = generateOpaqueToken();
        const refreshToken = this.deriveToken(sessionId, 0, tokenSeed);
        await this.sessionModel.create({
            _id: sessionId,
            userId: new Types.ObjectId(userId),
            refreshTokenHash: sha256Hex(refreshToken),
            tokenSeed,
            rotationCount: 0,
            expiresAt: this.expiresAtFrom(this.clock.now()),
        });
        return { sessionId: sessionId.toString(), userId, refreshToken };
    }

    // sola lettura: nessuna rotazione, così un errore a valle lascia valido il token presentato
    async findRotatable(
        refreshToken: string,
        requestedAt: Date = this.clock.now(),
    ): Promise<RotatableSession> {
        const now = this.clock.now();
        const presentedHash = sha256Hex(refreshToken);
        const session = await this.sessionModel
            .findOne({
                $or: [
                    { refreshTokenHash: presentedHash },
                    this.retiredWithinGraceFilter(presentedHash, requestedAt),
                ],
                ...this.activeFilter(now),
            })
            .exec();
        if (!session) return this.rejectRefresh(presentedHash, now);
        return {
            sessionId: session._id.toString(),
            userId: session.userId.toString(),
        };
    }

    // la grace è valutata all'arrivo della richiesta (requestedAt): la latenza del server tra
    // findRotatable e rotate non deve trasformare un retry legittimo in un riuso (WR-04).
    // Chi perde la corsa sulla rotazione ricade sulla ri-emissione e riceve il token del vincitore.
    async rotate(
        refreshToken: string,
        requestedAt: Date = this.clock.now(),
    ): Promise<IssuedRefreshToken> {
        const now = this.clock.now();
        const presentedHash = sha256Hex(refreshToken);
        const issued =
            (await this.rotateCurrent(presentedHash, now)) ??
            (await this.reissueWithinGrace(presentedHash, now, requestedAt));
        return issued ?? this.rejectRefresh(presentedHash, now);
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

    // l'hash presentato nel filtro dell'update rende la rotazione atomica: un solo vincitore
    private async rotateCurrent(
        presentedHash: string,
        now: Date,
    ): Promise<IssuedRefreshToken | null> {
        const session = await this.sessionModel
            .findOne({
                refreshTokenHash: presentedHash,
                ...this.activeFilter(now),
            })
            .exec();
        if (!session) return null;
        const tokenSeed = session.tokenSeed ?? generateOpaqueToken();
        const rotationCount = (session.rotationCount ?? 0) + 1;
        const nextToken = this.deriveToken(
            session._id,
            rotationCount,
            tokenSeed,
        );
        const rotated = await this.sessionModel
            .findOneAndUpdate(
                {
                    _id: session._id,
                    refreshTokenHash: presentedHash,
                    ...this.activeFilter(now),
                },
                {
                    $set: {
                        refreshTokenHash: sha256Hex(nextToken),
                        tokenSeed,
                        rotationCount,
                        expiresAt: this.expiresAtFrom(now),
                    },
                    $push: {
                        retiredRefreshTokens: {
                            $each: [{ hash: presentedHash, retiredAt: now }],
                            $slice: -RETIRED_REFRESH_TOKENS_LIMIT,
                        },
                    },
                },
                { new: true },
            )
            .exec();
        return rotated ? this.toIssued(rotated, nextToken) : null;
    }

    // ri-emissione idempotente (D-35): qualunque token ritirato meno di 30 s prima dell'arrivo
    // della richiesta riceve il token corrente, ricostruito dal documento così com'è ora, senza
    // alcuna scrittura sulla sessione. Rischio accettato (T-2-refresh-replay): chi presenta un
    // token ritirato dentro la finestra riceve il token corrente (REVIEW-3 WR-01, IN-03).
    private async reissueWithinGrace(
        presentedHash: string,
        now: Date,
        requestedAt: Date,
    ): Promise<IssuedRefreshToken | null> {
        const session = await this.sessionModel
            .findOne({
                ...this.retiredWithinGraceFilter(presentedHash, requestedAt),
                ...this.activeFilter(now),
            })
            .exec();
        if (!session) return null;
        const currentToken = this.rebuildCurrentToken(session);
        if (!currentToken) {
            this.logger.warn(
                `Refresh token re-issue impossible: session ${session._id.toString()} cannot rebuild its current token`,
            );
            throw AuthException.sessionExpired();
        }
        return this.toIssued(session, currentToken);
    }

    // null se la sessione è precedente a D-35 (nessun seed o token non derivato) o se JWT_SECRET è cambiato
    private rebuildCurrentToken(session: SessionDocument): string | null {
        if (!session.tokenSeed) return null;
        const currentToken = this.deriveToken(
            session._id,
            session.rotationCount,
            session.tokenSeed,
        );
        return sha256Hex(currentToken) === session.refreshTokenHash
            ? currentToken
            : null;
    }

    private async rejectRefresh(
        presentedHash: string,
        now: Date,
    ): Promise<never> {
        const reused = await this.sessionModel
            .findOneAndUpdate(
                {
                    'retiredRefreshTokens.hash': presentedHash,
                    ...this.activeFilter(now),
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
                    { 'retiredRefreshTokens.hash': presentedHash },
                ],
                revokedAt: { $ne: null },
            })
            .exec();
        return revoked !== null;
    }

    private deriveToken(
        sessionId: Types.ObjectId,
        rotationCount: number,
        tokenSeed: string,
    ): string {
        return deriveRefreshToken(
            this.refreshTokenKey,
            sessionId.toString(),
            rotationCount,
            tokenSeed,
        );
    }

    private toIssued(
        session: SessionDocument,
        refreshToken: string,
    ): IssuedRefreshToken {
        return {
            sessionId: session._id.toString(),
            userId: session.userId.toString(),
            refreshToken,
        };
    }

    private retiredWithinGraceFilter(presentedHash: string, requestedAt: Date) {
        return {
            retiredRefreshTokens: {
                $elemMatch: {
                    hash: presentedHash,
                    retiredAt: { $gt: this.graceStartFrom(requestedAt) },
                },
            },
        };
    }

    private activeFilter(now: Date) {
        return { revokedAt: null, expiresAt: { $gt: now } };
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
