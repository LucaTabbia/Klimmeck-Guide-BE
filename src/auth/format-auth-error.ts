import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthException } from 'src/auth/auth.exception';

const AUTH_ERROR_CODES: readonly unknown[] = Object.values(AuthErrorCode);

// Nest riscrive ogni 401 in UNAUTHENTICATED prima del formatter utente: qui si ripristina il codice di dominio
export function formatAuthError(
    formatted: GraphQLFormattedError,
    error: unknown,
): GraphQLFormattedError {
    const code = resolveAuthErrorCode(formatted, error);
    if (!code) return formatted;
    return {
        message: formatted.message,
        locations: formatted.locations,
        path: formatted.path,
        extensions: { code },
    };
}

function resolveAuthErrorCode(
    formatted: GraphQLFormattedError,
    error: unknown,
): AuthErrorCode | undefined {
    const original = unwrapResolverError(error);
    if (original instanceof AuthException) return original.code;
    if (error instanceof AuthException) return error.code;
    return readNestBodyCode(formatted);
}

function readNestBodyCode(
    formatted: GraphQLFormattedError,
): AuthErrorCode | undefined {
    const originalError = formatted.extensions?.originalError as
        | { code?: unknown }
        | undefined;
    const code = originalError?.code;
    return AUTH_ERROR_CODES.includes(code)
        ? (code as AuthErrorCode)
        : undefined;
}
