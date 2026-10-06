import { UnauthorizedException } from '@nestjs/common';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';

export class AuthException extends UnauthorizedException {
    readonly code: AuthErrorCode;
    readonly extensions: { code: AuthErrorCode };

    private constructor(code: AuthErrorCode, message: string) {
        super({ statusCode: 401, error: 'Unauthorized', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions nella risposta (anche su WS)
        this.extensions = { code };
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

    static sessionRevoked(): AuthException {
        return new AuthException(
            AuthErrorCode.SESSION_REVOKED,
            'Session revoked, sign in again',
        );
    }

    static loginTicketInvalid(): AuthException {
        return new AuthException(
            AuthErrorCode.LOGIN_TICKET_INVALID,
            'Login ticket is invalid or expired',
        );
    }
}
