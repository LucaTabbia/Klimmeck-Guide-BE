import {
    BadRequestException,
    HttpException,
    NotFoundException,
} from '@nestjs/common';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { AuthException } from 'src/auth/auth.exception';
import { formatDomainError } from 'src/graphql/format-domain-error';

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

function codedBadRequest(code: string): BadRequestException {
    return Object.assign(
        new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Età non valida per la razza scelta',
            code,
        }),
        { extensions: { code } },
    );
}

describe('formatDomainError', () => {
    it('restores the domain code of a wrapped AuthException and strips internals', () => {
        const formatted = buildFormatted();

        const result = formatDomainError(
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
        const result = formatDomainError(
            buildFormatted(),
            AuthException.sessionExpired(),
        );

        expect(result.extensions).toEqual({ code: 'SESSION_EXPIRED' });
    });

    it('falls back to the Nest response body code when the error is not traceable', () => {
        const formatted = buildFormatted({
            originalError: { statusCode: 401, code: 'LOGIN_TICKET_INVALID' },
        });

        const result = formatDomainError(formatted, new Error('opaque'));

        expect(result.extensions).toEqual({ code: 'LOGIN_TICKET_INVALID' });
        expect(result.extensions).not.toHaveProperty('stacktrace');
        expect(result.extensions).not.toHaveProperty('originalError');
    });

    it('ignores a body code that is not an auth error code', () => {
        const formatted = buildFormatted({
            originalError: { statusCode: 401, code: 'SOMETHING_ELSE' },
        });

        expect(formatDomainError(formatted, new Error('opaque'))).toBe(
            formatted,
        );
    });

    it('returns the very same object for non-auth errors', () => {
        const formatted = buildFormatted({ code: 'NOT_FOUND' });

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(new NotFoundException('User not found')),
        );

        expect(result).toBe(formatted);
    });

    it('restores the domain code of a wrapped coded HttpException and strips internals', () => {
        const formatted = buildFormatted({
            code: 'BAD_REQUEST',
            originalError: {
                statusCode: 400,
                code: 'CHARACTER_AGE_OUT_OF_RANGE',
            },
        });

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(codedBadRequest('CHARACTER_AGE_OUT_OF_RANGE')),
        );

        expect(result).toEqual({
            message: formatted.message,
            locations: formatted.locations,
            path: formatted.path,
            extensions: { code: 'CHARACTER_AGE_OUT_OF_RANGE' },
        });
    });

    it('reads the code of an unwrapped coded HttpException', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            codedBadRequest('CHARACTER_NAME_TAKEN'),
        );

        expect(result.extensions).toEqual({ code: 'CHARACTER_NAME_TAKEN' });
    });

    it('returns the very same object for an HttpException without extensions', () => {
        const formatted = buildFormatted({ code: 'BAD_REQUEST' });

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(new BadRequestException('plain')),
        );

        expect(result).toBe(formatted);
    });

    it('returns the very same object for an HttpException with a non-string code', () => {
        const formatted = buildFormatted({ code: 'BAD_REQUEST' });
        const exception = Object.assign(new HttpException('numeric', 400), {
            extensions: { code: 42 },
        });

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(exception),
        );

        expect(result).toBe(formatted);
    });

    it('ignores extensions carried by an error that is not an HttpException', () => {
        const formatted = buildFormatted({ code: 'INTERNAL_SERVER_ERROR' });
        const error = Object.assign(new Error('x'), {
            extensions: { code: 'CHARACTER_NAME_TAKEN' },
        });

        const result = formatDomainError(formatted, wrapAsResolverError(error));

        expect(result).toBe(formatted);
    });

    it('keeps the body fallback limited to auth error codes', () => {
        const formatted = buildFormatted({
            originalError: { statusCode: 400, code: 'CHARACTER_NAME_TAKEN' },
        });

        expect(formatDomainError(formatted, new Error('opaque'))).toBe(
            formatted,
        );
    });
});
