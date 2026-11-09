import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Session,
    SessionDocument,
    SessionSchema,
} from 'src/auth/session/session.model';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { SessionService } from 'src/auth/session/session.service';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildTestAuthConfig } from '../../../test/auth/test-auth-config';

const SessionModel: Model<SessionDocument> =
    mongoose.models.Session || mongoose.model(Session.name, SessionSchema);

const USER_ID = '64b0000000000000000000c1';
const OTHER_USER_ID = '64b0000000000000000000c2';

type RevocationEvent =
    | ['database']
    | ['sockets', string[], SessionRevokeReason];

describe('SessionRevocationService (replSet)', () => {
    let sessions: SessionService;
    let revocation: SessionRevocationService;
    let events: RevocationEvent[];
    let fakeRegistry: { closeSessions: jest.Mock };

    beforeAll(async () => {
        await SessionModel.init();
    });

    beforeEach(async () => {
        events = [];
        fakeRegistry = {
            closeSessions: jest.fn(
                (ids: readonly string[], reason: SessionRevokeReason) => {
                    events.push(['sockets', [...ids].sort(), reason]);
                },
            ),
        };
        const moduleRef = await Test.createTestingModule({
            providers: [
                SessionService,
                SessionRevocationService,
                { provide: WsSessionRegistry, useValue: fakeRegistry },
                {
                    provide: getModelToken(Session.name),
                    useValue: SessionModel,
                },
                { provide: Clock, useValue: new FixedClock() },
                { provide: AUTH_CONFIG, useValue: buildTestAuthConfig() },
            ],
        }).compile();
        sessions = moduleRef.get(SessionService);
        revocation = moduleRef.get(SessionRevocationService);
        recordDatabaseRevocation('revokeOthersOf');
        recordDatabaseRevocation('revokeAllOf');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function recordDatabaseRevocation(
        method: 'revokeOthersOf' | 'revokeAllOf',
    ): void {
        const original = sessions[method].bind(sessions) as (
            ...args: unknown[]
        ) => Promise<string[]>;
        jest.spyOn(sessions, method).mockImplementation(
            async (...args: unknown[]) => {
                const revoked = await original(...args);
                events.push(['database']);
                return revoked;
            },
        );
    }

    function readSession(sessionId: string) {
        return SessionModel.findById(sessionId).lean().exec();
    }

    async function createSessions(userId: string, count: number) {
        const ids: string[] = [];
        for (let index = 0; index < count; index += 1) {
            ids.push((await sessions.create(userId)).sessionId);
        }
        return ids;
    }

    it('revokes the other sessions at the database before closing their sockets (D-02)', async () => {
        const [a, b, keep] = await createSessions(USER_ID, 3);

        await revocation.revokeOthersOnLogin(USER_ID, keep);

        expect(events).toEqual([
            ['database'],
            ['sockets', [a, b].sort(), 'newLogin'],
        ]);
        for (const sessionId of [a, b]) {
            expect((await readSession(sessionId))?.revokeReason).toBe(
                'newLogin',
            );
        }
        expect((await readSession(keep))?.revokedAt).toBeNull();
    });

    it('never closes the socket of the kept session (D-02)', async () => {
        const [, keep] = await createSessions(USER_ID, 2);

        await revocation.revokeOthersOnLogin(USER_ID, keep);

        expect(fakeRegistry.closeSessions).toHaveBeenCalledTimes(1);
        const [closedIds] = fakeRegistry.closeSessions.mock.calls[0] as [
            string[],
        ];
        expect(closedIds).not.toContain(keep);
    });

    it('closes no socket of another user (D-02)', async () => {
        const [foreign] = await createSessions(OTHER_USER_ID, 1);
        const [a, keep] = await createSessions(USER_ID, 2);

        await revocation.revokeOthersOnLogin(USER_ID, keep);

        expect(events).toEqual([['database'], ['sockets', [a], 'newLogin']]);
        expect((await readSession(foreign))?.revokedAt).toBeNull();
    });

    it('revokes every session of the user with roleChanged before closing their sockets (D-06)', async () => {
        const [a, b] = await createSessions(USER_ID, 2);

        await revocation.revokeAllForRoleChange(USER_ID);

        expect(events).toEqual([
            ['database'],
            ['sockets', [a, b].sort(), 'roleChanged'],
        ]);
        for (const sessionId of [a, b]) {
            expect((await readSession(sessionId))?.revokeReason).toBe(
                'roleChanged',
            );
        }
    });

    it('closes no socket when the database revocation fails (D-12)', async () => {
        const [, keep] = await createSessions(USER_ID, 2);
        const failure = new Error('database down');
        jest.spyOn(sessions, 'revokeOthersOf').mockRejectedValueOnce(failure);

        await expect(
            revocation.revokeOthersOnLogin(USER_ID, keep),
        ).rejects.toBe(failure);

        expect(fakeRegistry.closeSessions).not.toHaveBeenCalled();
    });
});
