import { Model } from 'mongoose';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { sha256Hex } from 'src/auth/crypto/token-crypto';
import {
    LoginTicket,
    LoginTicketDocument,
} from 'src/auth/login-ticket/login-ticket.model';
import { TwitchOAuthError } from 'src/auth/twitch/twitch-oauth.client';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import request from 'supertest';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    FAKE_TWITCH_ACCESS_TOKEN,
    FAKE_TWITCH_USER_ID,
} from '../../../test/auth/fake-twitch-oauth.client';
import { persistUser } from '../../../test/fixtures';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const TICKET_REDIRECT_PATTERN =
    /^klimmeck:\/\/auth\?ticket=([A-Za-z0-9_-]{43})$/;

function errorRedirect(code: string): string {
    return `klimmeck://auth?error=${code}`;
}

async function get(
    harness: AuthTestApp,
    path: string,
    query: Record<string, string> = {},
): Promise<request.Response> {
    return request(harness.app.getHttpServer()).get(path).query(query);
}

function locationOf(response: request.Response): string {
    expect(response.status).toBe(302);
    return response.headers.location;
}

describe('Twitch login redirect flow (harness, fake Twitch client)', () => {
    describe('with Twitch configured', () => {
        let harness: AuthTestApp;
        let users: Model<UserDocument>;
        let tickets: Model<LoginTicketDocument>;

        beforeAll(async () => {
            harness = await createAuthTestApp();
            users = harness.connection.model<UserDocument>(User.name);
            tickets = harness.connection.model<LoginTicketDocument>(
                LoginTicket.name,
            );
        });

        afterEach(async () => {
            await harness.clearDatabase();
        });

        afterAll(async () => {
            await harness.close();
        });

        async function startState(): Promise<string> {
            const location = locationOf(
                await get(harness, '/auth/twitch/start', {
                    challenge: CHALLENGE,
                }),
            );
            return new URL(location).searchParams.get('state') as string;
        }

        async function callback(
            query: Record<string, string>,
        ): Promise<string> {
            return locationOf(
                await get(harness, '/auth/twitch/callback', query),
            );
        }

        describe('GET /auth/twitch/start', () => {
            it('redirects to the Twitch authorize page with an empty scope and force_verify', async () => {
                const location = locationOf(
                    await get(harness, '/auth/twitch/start', {
                        challenge: CHALLENGE,
                    }),
                );

                expect(
                    location.startsWith(
                        'https://id.twitch.tv/oauth2/authorize?',
                    ),
                ).toBe(true);
                const params = new URL(location).searchParams;
                expect(params.get('response_type')).toBe('code');
                expect(params.get('client_id')).toBe('test-client-id');
                expect(params.get('redirect_uri')).toBe(
                    'http://localhost:3000/auth/twitch/callback',
                );
                expect(params.has('scope')).toBe(true);
                expect(params.get('scope')).toBe('');
                expect(params.get('force_verify')).toBe('true');
                expect(params.get('state')).toBeTruthy();
            });

            it('redirects with invalid_request when the challenge is missing', async () => {
                expect(
                    locationOf(await get(harness, '/auth/twitch/start')),
                ).toBe(errorRedirect('invalid_request'));
            });

            it('redirects with invalid_request when the challenge is malformed', async () => {
                expect(
                    locationOf(
                        await get(harness, '/auth/twitch/start', {
                            challenge: 'abc',
                        }),
                    ),
                ).toBe(errorRedirect('invalid_request'));
            });
        });

        describe('GET /auth/twitch/callback', () => {
            it('creates the user, revokes the Twitch token and redirects with a login ticket', async () => {
                const location = await callback({
                    code: 'fake-code',
                    state: await startState(),
                });

                const match = TICKET_REDIRECT_PATTERN.exec(location);
                expect(match).not.toBeNull();
                const ticket = match?.[1] as string;
                expect(harness.twitch.exchangedCodes).toEqual(['fake-code']);
                expect(harness.twitch.revokedTokens).toEqual([
                    FAKE_TWITCH_ACCESS_TOKEN,
                ]);
                const created = await users
                    .findOne({ twitchId: FAKE_TWITCH_USER_ID })
                    .exec();
                expect(created?.role).toBe(RoleType.adventurer);
                expect(created?.twitchPoints).toBe(0);
                expect(created?.currentCharacter).toBeNull();
                const storedTickets = await tickets.find().exec();
                expect(storedTickets).toHaveLength(1);
                expect(storedTickets[0].ticketHash).not.toBe(ticket);
                expect(storedTickets[0].ticketHash).toBe(sha256Hex(ticket));
            });

            it('issues a ticket the app can redeem with its code verifier', async () => {
                const location = await callback({
                    code: 'fake-code',
                    state: await startState(),
                });
                const ticket = TICKET_REDIRECT_PATTERN.exec(location)?.[1];

                const session = await harness.app
                    .get(AuthSessionService)
                    .exchangeLoginTicket(ticket as string, VERIFIER);

                expect(session.user.twitchId).toBe(FAKE_TWITCH_USER_ID);
            });

            it('resolves an existing user without duplicating it or changing its role', async () => {
                await persistUser(users, {
                    twitchId: FAKE_TWITCH_USER_ID,
                    role: RoleType.innkeeper,
                });

                const location = await callback({
                    code: 'fake-code',
                    state: await startState(),
                });

                expect(location).toMatch(TICKET_REDIRECT_PATTERN);
                expect(
                    await users.countDocuments({
                        twitchId: FAKE_TWITCH_USER_ID,
                    }),
                ).toBe(1);
                const stored = await users
                    .findOne({ twitchId: FAKE_TWITCH_USER_ID })
                    .exec();
                expect(stored?.role).toBe(RoleType.innkeeper);
            });

            it('rejects a token issued to another client, still revoking it', async () => {
                harness.twitch.tokenInfo = {
                    ...harness.twitch.tokenInfo,
                    clientId: 'other-client',
                };

                const location = await callback({
                    code: 'fake-code',
                    state: await startState(),
                });

                expect(location).toBe(errorRedirect('twitch_client_mismatch'));
                expect(await users.countDocuments()).toBe(0);
                expect(await tickets.countDocuments()).toBe(0);
                expect(harness.twitch.revokedTokens).toEqual([
                    FAKE_TWITCH_ACCESS_TOKEN,
                ]);
            });

            it('forwards a Twitch access_denied without exchanging any code', async () => {
                const location = await callback({
                    error: 'access_denied',
                    state: await startState(),
                });

                expect(location).toBe(errorRedirect('access_denied'));
                expect(harness.twitch.exchangedCodes).toEqual([]);
            });

            it('rejects a forged state before any exchange', async () => {
                const location = await callback({ code: 'x', state: 'forged' });

                expect(location).toBe(errorRedirect('invalid_state'));
                expect(harness.twitch.exchangedCodes).toEqual([]);
            });

            it('rejects a missing state as invalid_state', async () => {
                expect(await callback({ code: 'x' })).toBe(
                    errorRedirect('invalid_state'),
                );
            });

            it('rejects a valid state without a code as invalid_request', async () => {
                const location = await callback({ state: await startState() });

                expect(location).toBe(errorRedirect('invalid_request'));
                expect(harness.twitch.exchangedCodes).toEqual([]);
            });

            it('redirects with twitch_exchange_failed when the code exchange fails', async () => {
                harness.twitch.exchangeError = new TwitchOAuthError(
                    'Twitch token exchange failed with status 400',
                );

                const location = await callback({
                    code: 'fake-code',
                    state: await startState(),
                });

                expect(location).toBe(errorRedirect('twitch_exchange_failed'));
                expect(await tickets.countDocuments()).toBe(0);
            });

            it('completes the login even when the best-effort revoke fails', async () => {
                harness.twitch.revokeError = new TwitchOAuthError(
                    'Twitch revoke request failed',
                );

                const location = await callback({
                    code: 'fake-code',
                    state: await startState(),
                });

                expect(location).toMatch(TICKET_REDIRECT_PATTERN);
                expect(harness.twitch.revokedTokens).toEqual([
                    FAKE_TWITCH_ACCESS_TOKEN,
                ]);
            });
        });
    });

    describe('without Twitch configured', () => {
        let harness: AuthTestApp;

        beforeAll(async () => {
            harness = await createAuthTestApp({ authConfig: { twitch: null } });
        });

        afterEach(async () => {
            await harness.clearDatabase();
        });

        afterAll(async () => {
            await harness.close();
        });

        it('redirects start with twitch_not_configured', async () => {
            expect(
                locationOf(
                    await get(harness, '/auth/twitch/start', {
                        challenge: CHALLENGE,
                    }),
                ),
            ).toBe(errorRedirect('twitch_not_configured'));
        });

        it('redirects callback with twitch_not_configured without calling Twitch', async () => {
            expect(
                locationOf(
                    await get(harness, '/auth/twitch/callback', {
                        code: 'fake-code',
                        state: 'any',
                    }),
                ),
            ).toBe(errorRedirect('twitch_not_configured'));
            expect(harness.twitch.exchangedCodes).toEqual([]);
        });
    });
});
