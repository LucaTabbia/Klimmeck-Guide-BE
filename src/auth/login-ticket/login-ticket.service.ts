import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import {
    CODE_VERIFIER_PATTERN,
    generateOpaqueToken,
    s256Challenge,
    safeEqual,
    sha256Hex,
} from 'src/auth/crypto/token-crypto';
import {
    LoginTicket,
    LoginTicketDocument,
} from 'src/auth/login-ticket/login-ticket.model';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const MILLISECONDS_PER_SECOND = 1000;

@Injectable()
export class LoginTicketService {
    constructor(
        @InjectModel(LoginTicket.name)
        private readonly loginTicketModel: Model<LoginTicketDocument>,
        private readonly clock: Clock,
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    ) {}

    async issue(userId: string, codeChallenge: string): Promise<string> {
        const ticket = generateOpaqueToken();
        await this.loginTicketModel.create({
            ticketHash: sha256Hex(ticket),
            userId: new Types.ObjectId(userId),
            codeChallenge,
            expiresAt: this.expiresAtFrom(this.clock.now()),
        });
        return ticket;
    }

    async redeem(ticket: string, codeVerifier: string): Promise<string> {
        // consumato prima di qualsiasi controllo sul verifier: un tentativo errato brucia il ticket
        const ticketDoc = await this.loginTicketModel
            .findOneAndDelete({
                ticketHash: sha256Hex(ticket),
                expiresAt: { $gt: this.clock.now() },
            })
            .exec();
        if (!ticketDoc || !matchesChallenge(codeVerifier, ticketDoc)) {
            throw AuthException.loginTicketInvalid();
        }
        return ticketDoc.userId.toString();
    }

    private expiresAtFrom(now: Date): Date {
        return new Date(
            now.getTime() +
                this.config.loginTicketTtlSeconds * MILLISECONDS_PER_SECOND,
        );
    }
}

function matchesChallenge(
    codeVerifier: string,
    ticketDoc: LoginTicketDocument,
): boolean {
    return (
        CODE_VERIFIER_PATTERN.test(codeVerifier) &&
        safeEqual(s256Challenge(codeVerifier), ticketDoc.codeChallenge)
    );
}
