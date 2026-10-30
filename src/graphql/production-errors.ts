import type { Logger } from '@nestjs/common';
import type { GraphQLError, GraphQLFormattedError } from 'graphql';
import { formatDomainError } from 'src/graphql/format-domain-error';
import { describeError } from 'src/mongo/mongo-errors';

export const INTERNAL_ERROR_MESSAGE = 'Errore interno';
export const INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR';

// produzione: un errore codificato tiene solo il codice; ogni altro errore diventa generico (D-07)
export function sanitizeFormattedError(
    formatted: GraphQLFormattedError,
): GraphQLFormattedError {
    const code = codeOf(formatted);
    const internal = isInternalCode(code);
    return {
        message: internal ? INTERNAL_ERROR_MESSAGE : formatted.message,
        ...(formatted.locations ? { locations: formatted.locations } : {}),
        ...(formatted.path ? { path: formatted.path } : {}),
        extensions: { code: internal ? INTERNAL_SERVER_ERROR : code },
    };
}

export function isInternalError(formatted: GraphQLFormattedError): boolean {
    return isInternalCode(codeOf(formatted));
}

// graphql-ws non passa da formatError: stessa regola dell'HTTP con un requestId per operazione (C7)
export function sanitizeExecutionErrors(
    errors: readonly GraphQLError[],
    requestId: string,
    logger: Logger,
): GraphQLFormattedError[] {
    return errors.map((error) => {
        const sanitized = sanitizeFormattedError(
            formatDomainError(error.toJSON(), error),
        );
        if (!isInternalError(sanitized)) return sanitized;
        logInternalError(logger, requestId, error.originalError ?? error);
        return {
            ...sanitized,
            extensions: { ...sanitized.extensions, requestId },
        };
    });
}

export function logInternalError(
    logger: Logger,
    requestId: string,
    error: unknown,
): void {
    logger.error(
        `Errore interno ${requestId}: ${describeError(error)}`,
        error instanceof Error ? error.stack : undefined,
    );
}

function codeOf(formatted: GraphQLFormattedError): string | undefined {
    const code = formatted.extensions?.code;
    return typeof code === 'string' ? code : undefined;
}

function isInternalCode(code: string | undefined): boolean {
    return code === undefined || code === INTERNAL_SERVER_ERROR;
}
