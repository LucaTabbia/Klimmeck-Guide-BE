import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model, Types } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Clock } from 'src/auth/clock';
import { sha256Hex } from 'src/auth/crypto/token-crypto';
import {
    LoginTicket,
    LoginTicketDocument,
    LoginTicketSchema,
} from 'src/auth/login-ticket/login-ticket.model';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildTestAuthConfig } from '../../../test/auth/test-auth-config';

const LoginTicketModel: Model<LoginTicketDocument> =
    mongoose.models.LoginTicket ||
    mongoose.model(LoginTicket.name, LoginTicketSchema);

const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const WRONG_VERIFIER = 'wrongVerifierwrongVerifierwrongVerifier1234';
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOGIN_TICKET_TTL_MS = 60 * 1000;
const LOGIN_TICKET_INVALID = { code: AuthErrorCode.LOGIN_TICKET_INVALID };

describe('LoginTicketService (replSet)', () => {
    let service: LoginTicketService;
    let clock: FixedClock;
    let userId: string;

    beforeAll(async () => {
        await LoginTicketModel.init();
    });

    beforeEach(async () => {
        clock = new FixedClock();
        userId = new Types.ObjectId().toString();
        const moduleRef = await Test.createTestingModule({
            providers: [
                LoginTicketService,
                {
                    provide: getModelToken(LoginTicket.name),
                    useValue: LoginTicketModel,
                },
                { provide: Clock, useValue: clock },
                { provide: AUTH_CONFIG, useValue: buildTestAuthConfig() },
            ],
        }).compile();
        service = moduleRef.get(LoginTicketService);
    });

    describe('issue', () => {
        it('returns an opaque 43-char base64url ticket', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);

            expect(ticket).toMatch(OPAQUE_TOKEN_PATTERN);
        });

        it('stores only the hash of the ticket, the challenge and a 60 s expiry', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);

            const stored = await LoginTicketModel.findOne({
                ticketHash: sha256Hex(ticket),
            })
                .lean()
                .exec();

            expect(stored).not.toBeNull();
            expect(stored?.userId.toString()).toBe(userId);
            expect(stored?.codeChallenge).toBe(RFC_CHALLENGE);
            expect(stored?.expiresAt.getTime()).toBe(
                clock.now().getTime() + LOGIN_TICKET_TTL_MS,
            );
            expect(JSON.stringify(stored)).not.toContain(ticket);
        });
    });

    describe('redeem', () => {
        it('returns the userId for the matching verifier and deletes the ticket', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);

            await expect(service.redeem(ticket, RFC_VERIFIER)).resolves.toBe(
                userId,
            );
            await expect(
                LoginTicketModel.countDocuments({
                    ticketHash: sha256Hex(ticket),
                }).exec(),
            ).resolves.toBe(0);
        });

        it('rejects a second redeem of the same ticket', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);
            await service.redeem(ticket, RFC_VERIFIER);

            await expect(
                service.redeem(ticket, RFC_VERIFIER),
            ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
        });

        it('consumes the ticket when the verifier is wrong (no brute force on the verifier)', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);

            await expect(
                service.redeem(ticket, WRONG_VERIFIER),
            ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
            await expect(
                service.redeem(ticket, RFC_VERIFIER),
            ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
        });

        it.each(['short', `${RFC_VERIFIER}+`])(
            'rejects a malformed verifier %p and consumes the ticket',
            async (malformedVerifier) => {
                const ticket = await service.issue(userId, RFC_CHALLENGE);

                await expect(
                    service.redeem(ticket, malformedVerifier),
                ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
                await expect(
                    service.redeem(ticket, RFC_VERIFIER),
                ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
            },
        );

        it('rejects a ticket after its 60 s lifetime even before the TTL monitor reaps it', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);
            clock.advanceSeconds(61);

            await expect(
                service.redeem(ticket, RFC_VERIFIER),
            ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
        });

        it('rejects a ticket that was never issued', async () => {
            await expect(
                service.redeem('never-issued-ticket', RFC_VERIFIER),
            ).rejects.toMatchObject(LOGIN_TICKET_INVALID);
        });

        it('lets exactly one of two concurrent redeems succeed', async () => {
            const ticket = await service.issue(userId, RFC_CHALLENGE);

            const results = await Promise.allSettled([
                service.redeem(ticket, RFC_VERIFIER),
                service.redeem(ticket, RFC_VERIFIER),
            ]);

            const fulfilled = results.filter(
                (result) => result.status === 'fulfilled',
            );
            const rejected = results.filter(
                (result) => result.status === 'rejected',
            );
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(rejected[0]).toMatchObject({
                reason: LOGIN_TICKET_INVALID,
            });
        });
    });
});
