import type { ApolloServerPlugin } from '@apollo/server';
import { Logger } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';
import { formatDomainError } from 'src/graphql/format-domain-error';
import type { GraphQLRequestContext } from 'src/graphql/graphql-context';
import {
    isInternalError,
    logInternalError,
} from 'src/graphql/production-errors';

// formatError non vede il contesto: il plugin logga l'errore intero e mette il requestId nella risposta HTTP (D-07)
export function requestIdPlugin(
    logger = new Logger('GraphQL'),
): ApolloServerPlugin<GraphQLRequestContext> {
    return {
        async requestDidStart() {
            await Promise.resolve();
            return {
                async didEncounterErrors({ contextValue, errors }) {
                    await Promise.resolve();
                    for (const error of errors) {
                        if (
                            !isInternalError(
                                formatDomainError(error.toJSON(), error),
                            )
                        ) {
                            continue;
                        }
                        logInternalError(
                            logger,
                            contextValue.requestId,
                            error.originalError ?? error,
                        );
                    }
                },
                async willSendResponse({ contextValue, response }) {
                    await Promise.resolve();
                    if (response.body.kind !== 'single') return;
                    const { singleResult } = response.body;
                    if (!singleResult.errors) return;
                    singleResult.errors = singleResult.errors.map((error) =>
                        withRequestId(error, contextValue.requestId),
                    );
                },
            };
        },
    };
}

function withRequestId(
    error: GraphQLFormattedError,
    requestId: string,
): GraphQLFormattedError {
    if (error.extensions?.code !== 'INTERNAL_SERVER_ERROR') return error;
    return { ...error, extensions: { ...error.extensions, requestId } };
}
