import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import {
    WS_FORBIDDEN_CLOSE_CODE,
    WS_SESSION_REVOKED_CLOSE_CODE,
    WS_TOKEN_EXPIRED_CLOSE_CODE,
} from 'src/auth/ws/ws-close-codes';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';

function buildSocket() {
    return { close: jest.fn() };
}

describe('WsSessionRegistry', () => {
    let registry: WsSessionRegistry;

    beforeEach(() => {
        registry = new WsSessionRegistry();
    });

    it('pins the dedicated close code of a revoked session (D-03)', () => {
        expect(WS_SESSION_REVOKED_CLOSE_CODE).toBe(4409);
        expect(WS_FORBIDDEN_CLOSE_CODE).toBe(4403);
        expect(WS_TOKEN_EXPIRED_CLOSE_CODE).toBe(4401);
    });

    it('closes every live socket of a revoked session with 4409 and the reason (D-03)', () => {
        const first = buildSocket();
        const second = buildSocket();
        registry.register('s1', first);
        registry.register('s1', second);

        registry.closeSessions(['s1'], SessionRevokeReason.newLogin);

        for (const socket of [first, second]) {
            expect(socket.close).toHaveBeenCalledTimes(1);
            expect(socket.close).toHaveBeenCalledWith(4409, 'newLogin');
        }
    });

    it('never closes the sockets of another session (D-03)', () => {
        const revoked = buildSocket();
        const other = buildSocket();
        registry.register('s1', revoked);
        registry.register('s2', other);

        registry.closeSessions(['s1'], SessionRevokeReason.roleChanged);

        expect(other.close).not.toHaveBeenCalled();
        expect(registry.isRegistered('s2')).toBe(true);
    });

    it('forgets a revoked session once its sockets are closed (D-03)', () => {
        const socket = buildSocket();
        registry.register('s1', socket);

        registry.closeSessions(['s1'], SessionRevokeReason.newLogin);
        registry.closeSessions(['s1'], SessionRevokeReason.newLogin);

        expect(registry.isRegistered('s1')).toBe(false);
        expect(socket.close).toHaveBeenCalledTimes(1);
    });

    it('keeps closing the other sockets when one close throws (D-03)', () => {
        const broken = {
            close: jest.fn(() => {
                throw new Error('socket already gone');
            }),
        };
        const sibling = buildSocket();
        const otherSession = buildSocket();
        registry.register('s1', broken);
        registry.register('s1', sibling);
        registry.register('s2', otherSession);

        registry.closeSessions(['s1', 's2'], SessionRevokeReason.newLogin);

        expect(sibling.close).toHaveBeenCalledWith(4409, 'newLogin');
        expect(otherSession.close).toHaveBeenCalledWith(4409, 'newLogin');
        expect(registry.isRegistered('s1')).toBe(false);
        expect(registry.isRegistered('s2')).toBe(false);
    });

    it('does not close a socket that closed by itself (D-03)', () => {
        const closedByItself = buildSocket();
        const live = buildSocket();
        registry.register('s1', closedByItself);
        registry.register('s1', live);

        registry.unregister('s1', closedByItself);
        registry.closeSessions(['s1'], SessionRevokeReason.newLogin);

        expect(closedByItself.close).not.toHaveBeenCalled();
        expect(live.close).toHaveBeenCalledWith(4409, 'newLogin');
    });

    it('forgets a session once its last socket closed by itself (D-03)', () => {
        const first = buildSocket();
        const second = buildSocket();
        registry.register('s1', first);
        registry.register('s1', second);

        registry.unregister('s1', first);
        registry.unregister('s1', second);

        expect(registry.isRegistered('s1')).toBe(false);
    });

    it('ignores unknown sessions and unknown sockets (D-03)', () => {
        const socket = buildSocket();

        expect(() =>
            registry.closeSessions(['missing'], SessionRevokeReason.newLogin),
        ).not.toThrow();
        expect(() => registry.unregister('missing', socket)).not.toThrow();
        expect(socket.close).not.toHaveBeenCalled();
    });
});
