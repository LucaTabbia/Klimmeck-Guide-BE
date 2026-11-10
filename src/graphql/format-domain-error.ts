import { unwrapResolverError } from '@apollo/server/errors';
import { HttpException } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';

const AUTH_ERROR_CODES: readonly unknown[] = Object.values(AuthErrorCode);
const SESSION_REVOKE_REASONS: readonly unknown[] =
    Object.values(SessionRevokeReason);

type CodedHttpException = HttpException & {
    extensions: {
        code: string;
        reason?: unknown;
        recoveryUntil?: unknown;
        imprisonedUntil?: unknown;
    };
};

// alias e non interface: GraphQLFormattedErrorExtensions richiede una index signature implicita
type DomainExtensions = {
    code: string;
    reason?: SessionRevokeReason;
    recoveryUntil?: string;
    imprisonedUntil?: string;
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

// allowlist di una chiave per codice (Phase 17 D-13, Phase 18 D-17, quick 261110-cgd): nient'altro delle extensions dell'eccezione
function extensionsOf(exception: CodedHttpException): DomainExtensions {
    const { code, reason, recoveryUntil, imprisonedUntil } =
        exception.extensions;
    return {
        code,
        ...revokeReasonOf(code, reason),
        ...potionRecoveryOf(code, recoveryUntil),
        ...imprisonmentOf(code, imprisonedUntil),
    };
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

// la data di fine ricarica esce solo con POTION_RECOVERING e solo come istante ISO (Phase 18 D-17): un testo libero di un'altra eccezione non arriva al client
export function potionRecoveryOf(
    code: unknown,
    recoveryUntil: unknown,
): { recoveryUntil?: string } {
    if (code !== GameRuleErrorCode.POTION_RECOVERING) return {};
    return isIsoInstant(recoveryUntil) ? { recoveryUntil } : {};
}

// la data di fine prigione esce solo con CHARACTER_IMPRISONED e solo come istante ISO (quick 261110-cgd)
export function imprisonmentOf(
    code: unknown,
    imprisonedUntil: unknown,
): { imprisonedUntil?: string } {
    if (code !== GameRuleErrorCode.CHARACTER_IMPRISONED) return {};
    return isIsoInstant(imprisonedUntil) ? { imprisonedUntil } : {};
}

function isIsoInstant(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString() === value
    );
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
