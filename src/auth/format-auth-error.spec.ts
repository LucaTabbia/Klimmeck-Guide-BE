import { NotFoundException } from '@nestjs/common';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { AuthException } from 'src/auth/auth.exception';
import { formatAuthError } from 'src/auth/format-auth-error';

function buildFormatted(
    extensions: Record<string, unknown> = {},
): GraphQLFormattedError {
    return {
        message: 'Session revoked, sign in again',
        locations: [{ line: 1, column: 12 }],
        path: ['refreshSession'],
        extensions: {
            code: 'UNAUTHENTICATED',
            stacktrace: ['UnauthorizedException: ...'],
            originalError: { statusCode: 401 },
            ...extensions,
        },
    };
}

function wrapAsResolverError(original: Error): GraphQLError {
    return new GraphQLError(original.message, {
        path: ['refreshSession'],
        originalError: original,
    });
}

describe('formatAuthError', () => {
    it('restores the domain code of a wrapped AuthException and strips internals', () => {
        const formatted = buildFormatted();

        const result = formatAuthError(
            formatted,
            wrapAsResolverError(AuthException.sessionRevoked()),
        );

        expect(result).toEqual({
            message: formatted.message,
            locations: formatted.locations,
            path: formatted.path,
            extensions: { code: 'SESSION_REVOKED' },
        });
    });

    it('reads the code of an unwrapped AuthException', () => {
        const result = formatAuthError(
            buildFormatted(),
            AuthException.sessionExpired(),
        );

        expect(result.extensions).toEqual({ code: 'SESSION_EXPIRED' });
    });

    it('falls back to the Nest response body code when the error is not traceable', () => {
        const formatted = buildFormatted({
            originalError: { statusCode: 401, code: 'LOGIN_TICKET_INVALID' },
        });

        const result = formatAuthError(formatted, new Error('opaque'));

        expect(result.extensions).toEqual({ code: 'LOGIN_TICKET_INVALID' });
        expect(result.extensions).not.toHaveProperty('stacktrace');
        expect(result.extensions).not.toHaveProperty('originalError');
    });

    it('ignores a body code that is not an auth error code', () => {
        const formatted = buildFormatted({
            originalError: { statusCode: 401, code: 'SOMETHING_ELSE' },
        });

        expect(formatAuthError(formatted, new Error('opaque'))).toBe(formatted);
    });

    it('returns the very same object for non-auth errors', () => {
        const formatted = buildFormatted({ code: 'NOT_FOUND' });

        const result = formatAuthError(
            formatted,
            wrapAsResolverError(new NotFoundException('User not found')),
        );

        expect(result).toBe(formatted);
    });
});
