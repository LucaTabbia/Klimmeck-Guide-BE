import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Session,
    SessionDocument,
    SessionSchema,
} from 'src/auth/session/session.model';
import { DeletedAccountRegistry } from 'src/auth/session/deleted-account.registry';
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
    let deletedAccounts: DeletedAccountRegistry;
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
                DeletedAccountRegistry,
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
        deletedAccounts = moduleRef.get(DeletedAccountRegistry);
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

    it('revokes every session of the user with accessLost before closing their sockets', async () => {
        const [foreign] = await createSessions(OTHER_USER_ID, 1);
        const [a, b] = await createSessions(USER_ID, 2);

        await revocation.revokeAllForAccessLoss(USER_ID);

        expect(events).toEqual([
            ['database'],
            ['sockets', [a, b].sort(), 'accessLost'],
        ]);
        expect((await readSession(a))?.revokeReason).toBe('accessLost');
        expect((await readSession(foreign))?.revokedAt).toBeNull();
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

    it('revokes inside the caller transaction and returns the revoked sessions (D-18)', async () => {
        const [foreign] = await createSessions(OTHER_USER_ID, 1);
        const [a, b] = await createSessions(USER_ID, 2);

        const revoked = await SessionModel.db.transaction((session) =>
            revocation.revokeForAccountDeletionWithin(
                USER_ID,
                session,
                new Date(),
            ),
        );

        expect([...revoked].sort()).toEqual([a, b].sort());
        expect((await readSession(a))?.revokeReason).toBe('accountDeleted');
        expect((await readSession(foreign))?.revokedAt).toBeNull();
        expect(fakeRegistry.closeSessions).not.toHaveBeenCalled();
        expect(deletedAccounts.isDeleted(USER_ID)).toBe(false);
    });

    it('revokes and closes a session born after the transaction of the deletion (WR-03)', async () => {
        const [foreign] = await createSessions(OTHER_USER_ID, 1);
        const [a, b] = await createSessions(USER_ID, 2);
        const revoked = await SessionModel.db.transaction((session) =>
            revocation.revokeForAccountDeletionWithin(
                USER_ID,
                session,
                new Date(),
            ),
        );
        const [late] = await createSessions(USER_ID, 1);

        await revocation.closeDeletedAccountSessions(USER_ID, revoked);

        const stored = await readSession(late);
        expect(stored?.revokeReason).toBe('accountDeleted');
        expect(stored?.revokedAt).toBeInstanceOf(Date);
        expect(stored?.expiresAt.getTime()).toBeLessThanOrEqual(
            (stored?.revokedAt as Date).getTime() + 900 * 1000,
        );
        expect(events).toEqual([
            ['sockets', [a, b, late].sort(), 'accountDeleted'],
        ]);
        expect((await readSession(foreign))?.revokedAt).toBeNull();
        expect(deletedAccounts.isDeleted(USER_ID)).toBe(true);
    });

    it('marks the account before the late revocation so no login slips between them (WR-03)', async () => {
        const marked: boolean[] = [];
        jest.spyOn(
            sessions,
            'revokeRemainingForAccountDeletion' as never,
        ).mockImplementation((() => {
            marked.push(deletedAccounts.isDeleted(USER_ID));
            return Promise.resolve([]);
        }) as never);

        await revocation.closeDeletedAccountSessions(USER_ID, []);

        expect(marked).toEqual([true]);
    });

    it('closes the live sockets with 4409 accountDeleted and marks the account after the commit (D-03, D-18)', async () => {
        const sockets = [{ close: jest.fn() }, { close: jest.fn() }];
        const registry = new WsSessionRegistry();
        registry.register('session-a', sockets[0]);
        registry.register('session-b', sockets[1]);
        const facade = new SessionRevocationService(
            sessions,
            registry,
            deletedAccounts,
        );

        await facade.closeDeletedAccountSessions(USER_ID, [
            'session-a',
            'session-b',
        ]);

        for (const socket of sockets) {
            expect(socket.close).toHaveBeenCalledWith(4409, 'accountDeleted');
        }
        expect(deletedAccounts.isDeleted(USER_ID)).toBe(true);
        expect(deletedAccounts.isDeleted(OTHER_USER_ID)).toBe(false);
    });
});
