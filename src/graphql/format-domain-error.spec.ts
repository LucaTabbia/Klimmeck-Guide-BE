import {
    BadRequestException,
    HttpException,
    NotFoundException,
} from '@nestjs/common';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { AuthException } from 'src/auth/auth.exception';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { AuthorizationException } from 'src/authz/authorization.exception';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { formatDomainError } from 'src/graphql/format-domain-error';

const ISO = '2026-11-10T12:30:00.000Z';

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

function badRequestWithExtensions(
    extensions: Record<string, unknown>,
): BadRequestException {
    return Object.assign(
        new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            message: 'probe',
            code: 'PROBE_CODE',
        }),
        { extensions },
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

    it('exposes only the FORBIDDEN code of a wrapped AuthorizationException', () => {
        const formatted = buildFormatted({
            code: 'FORBIDDEN',
            originalError: { statusCode: 403, code: 'FORBIDDEN' },
        });

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(AuthorizationException.notOwner()),
        );

        expect(result).toEqual({
            message: formatted.message,
            locations: formatted.locations,
            path: formatted.path,
            extensions: { code: 'FORBIDDEN' },
        });
    });

    it('turns a wrapped ResourceNotFoundException into NOT_FOUND without internals', () => {
        const formatted = buildFormatted({
            code: 'INTERNAL_SERVER_ERROR',
            status: 404,
            originalError: { statusCode: 404, code: 'NOT_FOUND' },
        });

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(ResourceNotFoundException.character()),
        );

        expect(result.extensions).toEqual({ code: 'NOT_FOUND' });
        expect(result.extensions).not.toHaveProperty('originalError');
        expect(result.extensions).not.toHaveProperty('status');
    });

    it('restores the code of a wrapped GameRuleException and strips internals', () => {
        const result = formatDomainError(
            buildFormatted(),
            wrapAsResolverError(GameRuleException.insufficientFunds()),
        );

        expect(result.extensions).toEqual({ code: 'INSUFFICIENT_FUNDS' });
    });

    it('keeps the body fallback limited to auth error codes', () => {
        const formatted = buildFormatted({
            originalError: { statusCode: 400, code: 'CHARACTER_NAME_TAKEN' },
        });

        expect(formatDomainError(formatted, new Error('opaque'))).toBe(
            formatted,
        );
    });

    it('keeps the revoke reason of a wrapped AuthException (D-13)', () => {
        const formatted = buildFormatted();

        const result = formatDomainError(
            formatted,
            wrapAsResolverError(
                AuthException.sessionRevoked(SessionRevokeReason.newLogin),
            ),
        );

        expect(result).toEqual({
            message: formatted.message,
            locations: formatted.locations,
            path: formatted.path,
            extensions: { code: 'SESSION_REVOKED', reason: 'newLogin' },
        });
    });

    it('keeps only the reason among the extensions of a revoked session (D-05, D-13)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'SESSION_REVOKED',
                    reason: SessionRevokeReason.newLogin,
                    secret: 'hidden',
                }),
            ),
        );

        expect(result.extensions).toEqual({
            code: 'SESSION_REVOKED',
            reason: 'newLogin',
        });
    });

    it('drops the reason of a code other than SESSION_REVOKED (D-05, D-13)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'PROBE_CODE',
                    reason: 'probe',
                }),
            ),
        );

        expect(result.extensions).toEqual({ code: 'PROBE_CODE' });
    });

    it('drops a reason outside the revoke reasons (D-05, D-13)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'SESSION_REVOKED',
                    reason: 'zzz',
                }),
            ),
        );

        expect(result.extensions).toEqual({ code: 'SESSION_REVOKED' });
    });

    it('keeps every revoke reason of the enum, e.g. roleChanged (D-05, D-13)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                AuthException.sessionRevoked(SessionRevokeReason.roleChanged),
            ),
        );

        expect(result.extensions).toEqual({
            code: 'SESSION_REVOKED',
            reason: 'roleChanged',
        });
    });

    it('drops a reason that is not a string (D-13)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({ code: 'PROBE_CODE', reason: 42 }),
            ),
        );

        expect(result.extensions).toEqual({ code: 'PROBE_CODE' });
    });

    it('keeps the recovery instant of a wrapped potion refusal (D-17)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                GameRuleException.potionRecovering(new Date(ISO)),
            ),
        );

        expect(result.extensions).toEqual({
            code: 'POTION_RECOVERING',
            recoveryUntil: ISO,
        });
    });

    it('keeps only the recovery instant among the extensions of a potion refusal (D-17)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'POTION_RECOVERING',
                    recoveryUntil: ISO,
                    secret: 'hidden',
                    reason: 'newLogin',
                }),
            ),
        );

        expect(result.extensions).toEqual({
            code: 'POTION_RECOVERING',
            recoveryUntil: ISO,
        });
    });

    it('drops a recovery instant carried by another code (D-17)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'PROBE_CODE',
                    recoveryUntil: ISO,
                }),
            ),
        );

        expect(result.extensions).toEqual({ code: 'PROBE_CODE' });
    });

    it.each(['tomorrow', '2026-11-10', 1731241800000, null, { nested: true }])(
        'drops the recovery instant %p that is not an ISO string (D-17)',
        (recoveryUntil) => {
            const result = formatDomainError(
                buildFormatted({ code: 'BAD_REQUEST' }),
                wrapAsResolverError(
                    badRequestWithExtensions({
                        code: 'POTION_RECOVERING',
                        recoveryUntil,
                    }),
                ),
            );

            expect(result.extensions).toEqual({ code: 'POTION_RECOVERING' });
        },
    );
    it('keeps the prison instant of a wrapped prison refusal (quick 261110-cgd)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                GameRuleException.characterImprisoned(new Date(ISO)),
            ),
        );

        expect(result.extensions).toEqual({
            code: 'CHARACTER_IMPRISONED',
            imprisonedUntil: ISO,
        });
    });

    it('keeps only the prison instant among the extensions of a prison refusal (quick 261110-cgd)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'CHARACTER_IMPRISONED',
                    imprisonedUntil: ISO,
                    recoveryUntil: ISO,
                    secret: 'hidden',
                }),
            ),
        );

        expect(result.extensions).toEqual({
            code: 'CHARACTER_IMPRISONED',
            imprisonedUntil: ISO,
        });
    });

    it('drops a prison instant carried by another code (quick 261110-cgd)', () => {
        const result = formatDomainError(
            buildFormatted({ code: 'BAD_REQUEST' }),
            wrapAsResolverError(
                badRequestWithExtensions({
                    code: 'POTION_RECOVERING',
                    imprisonedUntil: ISO,
                }),
            ),
        );

        expect(result.extensions).toEqual({ code: 'POTION_RECOVERING' });
    });

    it.each(['tomorrow', 1731241800000, null])(
        'drops the prison instant %p that is not an ISO string (quick 261110-cgd)',
        (imprisonedUntil) => {
            const result = formatDomainError(
                buildFormatted({ code: 'BAD_REQUEST' }),
                wrapAsResolverError(
                    badRequestWithExtensions({
                        code: 'CHARACTER_IMPRISONED',
                        imprisonedUntil,
                    }),
                ),
            );

            expect(result.extensions).toEqual({ code: 'CHARACTER_IMPRISONED' });
        },
    );
});
