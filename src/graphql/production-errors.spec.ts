import { Logger } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { AuthException } from 'src/auth/auth.exception';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    INTERNAL_ERROR_MESSAGE,
    INTERNAL_SERVER_ERROR,
    sanitizeExecutionErrors,
    sanitizeFormattedError,
} from 'src/graphql/production-errors';

function fakeLogger(): { logger: Logger; error: jest.Mock } {
    const error = jest.fn();
    return { logger: { error } as unknown as Logger, error };
}

describe('sanitizeFormattedError', () => {
    it('uses an Italian generic message', () => {
        expect(INTERNAL_ERROR_MESSAGE).toBe('Errore interno');
    });

    it('hides an uncoded error behind a generic internal error in production (D-07)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'E11000 duplicate key mongodb://u:p@h',
            path: ['boom'],
            extensions: {
                code: 'INTERNAL_SERVER_ERROR',
                stacktrace: ['Error: E11000', '    at boom'],
            },
        });

        expect(sanitized).toEqual({
            message: 'Errore interno',
            path: ['boom'],
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
    });

    it('keeps a coded error with its code only (D-07)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'Monete insufficienti',
            locations: [{ line: 1, column: 3 }],
            path: ['doTransaction'],
            extensions: {
                code: 'INSUFFICIENT_FUNDS',
                originalError: { statusCode: 400, message: 'raw' },
                status: 400,
            },
        });

        expect(sanitized).toEqual({
            message: 'Monete insufficienti',
            locations: [{ line: 1, column: 3 }],
            path: ['doTransaction'],
            extensions: { code: 'INSUFFICIENT_FUNDS' },
        });
    });

    it('treats an error without a code as internal (D-07)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'Cannot read properties of undefined',
            locations: [{ line: 2, column: 5 }],
            extensions: { exception: { stacktrace: ['at x'] } },
        });

        expect(sanitized).toEqual({
            message: 'Errore interno',
            locations: [{ line: 2, column: 5 }],
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
    });

    it('keeps an Apollo request-level code as it is (D-07)', () => {
        expect(
            sanitizeFormattedError({
                message: 'Cannot query field "boo" on type "Query".',
                extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
            }),
        ).toEqual({
            message: 'Cannot query field "boo" on type "Query".',
            extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
        });
    });

    it('keeps the revoke reason of a coded error (D-13)', () => {
        expect(
            sanitizeFormattedError({
                message: 'Session revoked, sign in again',
                extensions: {
                    code: 'SESSION_REVOKED',
                    reason: 'newLogin',
                    stacktrace: ['x'],
                },
            }),
        ).toEqual({
            message: 'Session revoked, sign in again',
            extensions: { code: 'SESSION_REVOKED', reason: 'newLogin' },
        });
    });

    it('drops the reason of a code other than SESSION_REVOKED (D-05, D-13)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'probe',
            extensions: { code: 'PROBE_CODE', reason: 'probe' },
        });

        expect(sanitized.extensions).toEqual({ code: 'PROBE_CODE' });
    });

    it('drops a reason outside the revoke reasons (D-05, D-13)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'Session revoked, sign in again',
            extensions: { code: 'SESSION_REVOKED', reason: 'zzz' },
        });

        expect(sanitized.extensions).toEqual({ code: 'SESSION_REVOKED' });
    });

    it('keeps the roleChanged reason of a revoked session (D-05, D-13)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'Session revoked, sign in again',
            extensions: {
                code: 'SESSION_REVOKED',
                reason: SessionRevokeReason.roleChanged,
            },
        });

        expect(sanitized.extensions).toEqual({
            code: 'SESSION_REVOKED',
            reason: 'roleChanged',
        });
    });

    it('drops the reason of an internal error (D-13)', () => {
        expect(
            sanitizeFormattedError({
                message: 'boom',
                extensions: { reason: 'newLogin' },
            }),
        ).toEqual({
            message: INTERNAL_ERROR_MESSAGE,
            extensions: { code: INTERNAL_SERVER_ERROR },
        });
    });

    it('drops a revoke reason that is not a string (D-13)', () => {
        const sanitized = sanitizeFormattedError({
            message: 'Session revoked, sign in again',
            extensions: { code: 'SESSION_REVOKED', reason: { nested: true } },
        });

        expect(sanitized.extensions).toEqual({ code: 'SESSION_REVOKED' });
    });
});

describe('sanitizeExecutionErrors', () => {
    it('sanitizes graphql-ws errors with one request id and logs the original (D-07, C7)', () => {
        const { logger, error } = fakeLogger();

        const sanitized = sanitizeExecutionErrors(
            [new GraphQLError('raw secret')],
            'req-1',
            logger,
        );

        expect(sanitized).toEqual([
            {
                message: 'Errore interno',
                extensions: {
                    code: 'INTERNAL_SERVER_ERROR',
                    requestId: 'req-1',
                },
            },
        ]);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toContain('req-1');
    });

    it('keeps locations and path of a sanitized graphql-ws error (C7)', () => {
        const { logger } = fakeLogger();
        const raw = new GraphQLError('E11000 mongodb://user:pw@host', {
            path: ['probeBoom'],
            originalError: new Error('E11000 mongodb://user:pw@host'),
        });

        expect(sanitizeExecutionErrors([raw], 'req-2', logger)).toEqual([
            {
                message: 'Errore interno',
                path: ['probeBoom'],
                extensions: {
                    code: 'INTERNAL_SERVER_ERROR',
                    requestId: 'req-2',
                },
            },
        ]);
    });

    it('keeps the domain code of a graphql-ws error without logging it (D-07, C7)', () => {
        const { logger, error } = fakeLogger();
        const original = GameRuleException.insufficientFunds();
        const coded = new GraphQLError(original.message, {
            path: ['probeDomain'],
            originalError: original,
        });

        expect(sanitizeExecutionErrors([coded], 'req-3', logger)).toEqual([
            {
                message: 'Monete insufficienti',
                path: ['probeDomain'],
                extensions: { code: 'INSUFFICIENT_FUNDS' },
            },
        ]);
        expect(error).not.toHaveBeenCalled();
    });

    it('logs the request id, the error name and the stack, never the message (D-07)', () => {
        const { logger, error } = fakeLogger();
        const original = new Error('mongodb://user:pw@host');
        const raw = new GraphQLError(original.message, {
            originalError: original,
        });

        sanitizeExecutionErrors([raw], 'req-4', logger);

        expect(error).toHaveBeenCalledWith(
            'Errore interno req-4: Error',
            original.stack,
        );
    });

    it('keeps the revoke reason over graphql-ws in production (D-13)', () => {
        const { logger, error } = fakeLogger();
        const original = AuthException.sessionRevoked(
            SessionRevokeReason.roleChanged,
        );
        const coded = new GraphQLError(original.message, {
            path: ['probeRevoked'],
            originalError: original,
        });

        const [sanitized] = sanitizeExecutionErrors([coded], 'req-5', logger);

        expect(sanitized.extensions).toEqual({
            code: 'SESSION_REVOKED',
            reason: 'roleChanged',
        });
        expect(error).not.toHaveBeenCalled();
    });
});
