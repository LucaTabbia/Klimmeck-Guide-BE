import { UnauthorizedException } from '@nestjs/common';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthException } from 'src/auth/auth.exception';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';

describe('AuthException', () => {
    const cases: Array<[string, () => AuthException, AuthErrorCode, string]> = [
        [
            'unauthenticated',
            () => AuthException.unauthenticated(),
            AuthErrorCode.UNAUTHENTICATED,
            'Authentication required',
        ],
        [
            'sessionExpired',
            () => AuthException.sessionExpired(),
            AuthErrorCode.SESSION_EXPIRED,
            'Session expired, sign in again',
        ],
        [
            'sessionRevoked',
            () => AuthException.sessionRevoked(),
            AuthErrorCode.SESSION_REVOKED,
            'Session revoked, sign in again',
        ],
        [
            'loginTicketInvalid',
            () => AuthException.loginTicketInvalid(),
            AuthErrorCode.LOGIN_TICKET_INVALID,
            'Login ticket is invalid or expired',
        ],
    ];

    it.each(cases)(
        '%s() is a 401 UnauthorizedException carrying the error code',
        (_name, factory, code, message) => {
            const exception = factory();

            expect(exception).toBeInstanceOf(UnauthorizedException);
            expect(exception.getStatus()).toBe(401);
            expect(exception.code).toBe(code);
            expect(exception.extensions).toEqual({ code });
            expect(exception.getResponse()).toEqual({
                statusCode: 401,
                error: 'Unauthorized',
                message,
                code,
            });
        },
    );

    it.each(Object.values(SessionRevokeReason))(
        'carries the revoke reason in the extensions only (D-05): %s',
        (reason) => {
            const exception = AuthException.sessionRevoked(reason);

            expect(exception.extensions).toEqual({
                code: AuthErrorCode.SESSION_REVOKED,
                reason,
            });
            expect(exception.getResponse()).toEqual({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Session revoked, sign in again',
                code: AuthErrorCode.SESSION_REVOKED,
            });
        },
    );

    it('omits the reason when the revocation has none (D-11)', () => {
        expect(
            Object.keys(AuthException.sessionRevoked(null).extensions),
        ).toEqual(['code']);
        expect(Object.keys(AuthException.sessionRevoked().extensions)).toEqual([
            'code',
        ]);
    });

    it('uses error codes whose values equal their names', () => {
        expect(Object.entries(AuthErrorCode)).toEqual([
            ['UNAUTHENTICATED', 'UNAUTHENTICATED'],
            ['SESSION_EXPIRED', 'SESSION_EXPIRED'],
            ['SESSION_REVOKED', 'SESSION_REVOKED'],
            ['LOGIN_TICKET_INVALID', 'LOGIN_TICKET_INVALID'],
        ]);
    });
});
