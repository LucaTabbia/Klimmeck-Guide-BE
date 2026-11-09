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
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { isObjectIdHex } from 'src/mongo/document-id';
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

export interface RevokedSessionState {
    reason: SessionRevokeReason | null;
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

    async revoke(
        sessionId: string,
        reason: SessionRevokeReason | null,
    ): Promise<void> {
        if (!Types.ObjectId.isValid(sessionId)) return;
        await this.sessionModel
            .updateOne(
                { _id: sessionId, revokedAt: null },
                { $set: { revokedAt: this.clock.now(), revokeReason: reason } },
            )
            .exec();
    }

    async revokeOthersOf(
        userId: string,
        keepSessionId: string,
        reason: SessionRevokeReason,
    ): Promise<string[]> {
        if (!isObjectIdHex(userId) || !isObjectIdHex(keepSessionId)) return [];
        // _id minore: fra due login concorrenti vince l'ultimo e nessuno caccia l'altro (D-12)
        return this.revokeActive(
            {
                userId: new Types.ObjectId(userId),
                _id: { $lt: new Types.ObjectId(keepSessionId) },
            },
            reason,
        );
    }

    // createdBefore esclude le sessioni emesse dopo l'evento che chiede la revoca (D-06)
    async revokeAllOf(
        userId: string,
        reason: SessionRevokeReason,
        createdBefore?: Date,
    ): Promise<string[]> {
        if (!isObjectIdHex(userId)) return [];
        return this.revokeActive(
            {
                userId: new Types.ObjectId(userId),
                ...this.createdBeforeFilter(createdBefore),
            },
            reason,
        );
    }

    // una lettura per connessione WS (D-03): solo revokedAt non nullo chiude, una sessione assente resta accettata
    async revokeReasonOf(
        sessionId: string,
    ): Promise<RevokedSessionState | null> {
        if (!isObjectIdHex(sessionId)) return null;
        const session = await this.sessionModel
            .findById(sessionId, { revokedAt: 1, revokeReason: 1 })
            .lean<{
                revokedAt?: Date | null;
                revokeReason?: SessionRevokeReason | null;
            }>()
            .exec();
        if (!session?.revokedAt) return null;
        return { reason: session.revokeReason ?? null };
    }

    // id candidati poi update condizionale su revokedAt: una revoca già scritta non si sovrascrive;
    // la rilettura restituisce solo le sessioni che portano questo motivo, così la reason sul socket coincide con quella a DB
    private async revokeActive(
        owner: Record<string, unknown>,
        reason: SessionRevokeReason,
    ): Promise<string[]> {
        const now = this.clock.now();
        const ids = await this.sessionIdsMatching({
            ...owner,
            ...this.activeFilter(now),
        });
        if (ids.length === 0) return [];
        await this.sessionModel
            .updateMany(
                { _id: { $in: ids }, revokedAt: null },
                { $set: { revokedAt: now, revokeReason: reason } },
            )
            .exec();
        const written = new Set(
            await this.sessionIdsMatching({
                _id: { $in: ids },
                revokeReason: reason,
            }),
        );
        return ids.filter((id) => written.has(id));
    }

    private async sessionIdsMatching(
        filter: Record<string, unknown>,
    ): Promise<string[]> {
        const sessions = await this.sessionModel
            .find(filter, { _id: 1 })
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        return sessions.map(({ _id }) => _id.toHexString());
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
                {
                    $set: {
                        revokedAt: now,
                        revokeReason: SessionRevokeReason.reuseDetected,
                    },
                },
            )
            .exec();
        if (reused) {
            this.logger.warn(
                `Refresh token reuse detected: session ${reused._id.toString()} revoked`,
            );
            throw AuthException.sessionRevoked(
                SessionRevokeReason.reuseDetected,
            );
        }
        const revoked = await this.findRevokedByToken(presentedHash);
        if (revoked) throw AuthException.sessionRevoked(revoked.reason);
        throw AuthException.sessionExpired();
    }

    // il token di una sessione già revocata risponde col motivo memorizzato; i documenti precedenti alla fase non hanno il campo (Pitfall 4)
    private async findRevokedByToken(
        presentedHash: string,
    ): Promise<RevokedSessionState | null> {
        const revoked = await this.sessionModel
            .findOne(
                {
                    $or: [
                        { refreshTokenHash: presentedHash },
                        { 'retiredRefreshTokens.hash': presentedHash },
                    ],
                    revokedAt: { $ne: null },
                },
                { revokeReason: 1 },
            )
            .lean<{ revokeReason?: SessionRevokeReason | null }>()
            .exec();
        return revoked ? { reason: revoked.revokeReason ?? null } : null;
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

    private createdBeforeFilter(createdBefore?: Date) {
        return createdBefore ? { createdAt: { $lt: createdBefore } } : {};
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
