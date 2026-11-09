import { unwrapResolverError } from '@apollo/server/errors';
import { HttpException } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';

const AUTH_ERROR_CODES: readonly unknown[] = Object.values(AuthErrorCode);
const SESSION_REVOKE_REASONS: readonly unknown[] =
    Object.values(SessionRevokeReason);

type CodedHttpException = HttpException & {
    extensions: { code: string; reason?: unknown };
};

// alias e non interface: GraphQLFormattedErrorExtensions richiede una index signature implicita
type DomainExtensions = {
    code: string;
    reason?: SessionRevokeReason;
};

// Nest riscrive il codice di ogni HttpException prima del formatter utente: qui si ripristina il codice di dominio
export function formatDomainError(
    formatted: GraphQLFormattedError,
    error: unknown,
): GraphQLFormattedError {
    const extensions = resolveDomainExtensions(formatted, error);
    if (!extensions) return formatted;
    return {
        message: formatted.message,
        locations: formatted.locations,
        path: formatted.path,
        extensions,
    };
}

function resolveDomainExtensions(
    formatted: GraphQLFormattedError,
    error: unknown,
): DomainExtensions | undefined {
    const original = unwrapResolverError(error);
    if (isCodedHttpException(original)) return extensionsOf(original);
    if (isCodedHttpException(error)) return extensionsOf(error);
    const code = readNestBodyAuthCode(formatted);
    return code ? { code } : undefined;
}

// allowlist di una sola chiave (Phase 17 D-13): la reason della revoca e nient'altro delle extensions dell'eccezione
function extensionsOf(exception: CodedHttpException): DomainExtensions {
    const { code, reason } = exception.extensions;
    return { code, ...revokeReasonOf(code, reason) };
}

// la reason esce solo con SESSION_REVOKED e solo coi valori dell'enum (D-05, D-13): un testo libero di un'altra eccezione non arriva al client
export function revokeReasonOf(
    code: unknown,
    reason: unknown,
): { reason?: SessionRevokeReason } {
    if (code !== AuthErrorCode.SESSION_REVOKED) return {};
    return SESSION_REVOKE_REASONS.includes(reason)
        ? { reason: reason as SessionRevokeReason }
        : {};
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
