import { UnauthorizedException } from '@nestjs/common';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';

export interface AuthExceptionExtensions {
    code: AuthErrorCode;
    reason?: SessionRevokeReason;
}

export class AuthException extends UnauthorizedException {
    readonly code: AuthErrorCode;
    readonly extensions: AuthExceptionExtensions;

    private constructor(
        code: AuthErrorCode,
        message: string,
        reason: SessionRevokeReason | null = null,
    ) {
        super({ statusCode: 401, error: 'Unauthorized', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions nella risposta (anche su WS)
        this.extensions = reason ? { code, reason } : { code };
    }

    static unauthenticated(): AuthException {
        return new AuthException(
            AuthErrorCode.UNAUTHENTICATED,
            'Authentication required',
        );
    }

    static sessionExpired(): AuthException {
        return new AuthException(
            AuthErrorCode.SESSION_EXPIRED,
            'Session expired, sign in again',
        );
    }

    static sessionRevoked(
        reason: SessionRevokeReason | null = null,
    ): AuthException {
        return new AuthException(
            AuthErrorCode.SESSION_REVOKED,
            'Session revoked, sign in again',
            reason,
        );
    }

    static loginTicketInvalid(): AuthException {
        return new AuthException(
            AuthErrorCode.LOGIN_TICKET_INVALID,
            'Login ticket is invalid or expired',
        );
    }
}
