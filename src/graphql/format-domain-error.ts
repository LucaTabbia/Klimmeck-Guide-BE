import { unwrapResolverError } from '@apollo/server/errors';
import { HttpException } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';

const AUTH_ERROR_CODES: readonly unknown[] = Object.values(AuthErrorCode);

type CodedHttpException = HttpException & { extensions: { code: string } };

// Nest riscrive il codice di ogni HttpException prima del formatter utente: qui si ripristina il codice di dominio
export function formatDomainError(
    formatted: GraphQLFormattedError,
    error: unknown,
): GraphQLFormattedError {
    const code = resolveDomainErrorCode(formatted, error);
    if (!code) return formatted;
    return {
        message: formatted.message,
        locations: formatted.locations,
        path: formatted.path,
        extensions: { code },
    };
}

function resolveDomainErrorCode(
    formatted: GraphQLFormattedError,
    error: unknown,
): string | undefined {
    const original = unwrapResolverError(error);
    if (isCodedHttpException(original)) return original.extensions.code;
    if (isCodedHttpException(error)) return error.extensions.code;
    return readNestBodyAuthCode(formatted);
}

function isCodedHttpException(error: unknown): error is CodedHttpException {
    return (
        error instanceof HttpException &&
        typeof (error as { extensions?: { code?: unknown } }).extensions
            ?.code === 'string'
    );
}

function readNestBodyAuthCode(
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
