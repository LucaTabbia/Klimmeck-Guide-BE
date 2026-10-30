import { ApolloServerErrorCode } from '@apollo/server/errors';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import type {
    DocumentNode,
    GraphQLFormattedError,
    GraphQLSchema,
} from 'graphql';
import {
    GraphQLError,
    NoSchemaIntrospectionCustomRule,
    specifiedRules,
    validate,
} from 'graphql';
import type { ServerOptions } from 'graphql-ws';
import type {
    WsConnectionAuthenticator,
    WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
import { formatDomainError } from 'src/graphql/format-domain-error';
import { buildGraphQLContext, GRAPHQL_PATH } from 'src/graphql/graphql-context';
import {
    sanitizeExecutionErrors,
    sanitizeFormattedError,
} from 'src/graphql/production-errors';
import { requestIdFrom } from 'src/graphql/request-id';
import { requestIdPlugin } from 'src/graphql/request-id.plugin';

export interface GraphQLSurfaceOptions {
    production: boolean;
}

type ProductionWsHooks = Pick<ServerOptions, 'validate' | 'onNext' | 'onError'>;

const PRODUCTION_WS_RULES = [
    ...specifiedRules,
    NoSchemaIntrospectionCustomRule,
];
const SCHEMA_SUGGESTION = / ?Did you mean(.+?)\?$/;
const wsLogger = new Logger('GraphQL');

// unica sorgente delle opzioni GraphQL: AppModule e harness di test la condividono;
// la modalità arriva dal chiamante, così l'harness prova produzione e sviluppo (D-05, D-07)
export function createGraphQLOptions(
    wsConnectionAuthenticator: WsConnectionAuthenticator,
    autoSchemaFile: string | boolean,
    { production }: GraphQLSurfaceOptions,
): Omit<ApolloDriverConfig, 'driver'> {
    return {
        path: GRAPHQL_PATH,
        autoSchemaFile,
        sortSchema: true,
        playground: false,
        introspection: !production,
        hideSchemaDetailsFromClientErrors: production,
        ...(production ? { includeStacktraceInErrorResponses: false } : {}),
        plugins: [
            production
                ? ApolloServerPluginLandingPageDisabled()
                : ApolloServerPluginLandingPageLocalDefault(),
            requestIdPlugin(),
        ],
        context: buildGraphQLContext,
        formatError: production ? formatProductionError : formatDomainError,
        subscriptions: {
            'graphql-ws': {
                onConnect: (context) =>
                    wsConnectionAuthenticator.onConnect(
                        context as WsConnectionContext,
                    ),
                onClose: (context) =>
                    wsConnectionAuthenticator.onClose(
                        context as WsConnectionContext,
                    ),
                ...(production ? productionWsHooks() : {}),
            },
        },
    };
}

function formatProductionError(
    formatted: GraphQLFormattedError,
    error: unknown,
): GraphQLFormattedError {
    return sanitizeFormattedError(formatDomainError(formatted, error));
}

// graphql-ws non passa da Apollo: introspection, suggerimenti ed errori grezzi si chiudono qui (C7)
function productionWsHooks(): ProductionWsHooks {
    return {
        validate: validateWithoutIntrospection,
        onNext: (_ctx, _id, _payload, _args, result) =>
            result.errors
                ? {
                      ...result,
                      errors: sanitizeExecutionErrors(
                          result.errors,
                          requestIdFrom(undefined),
                          wsLogger,
                      ),
                  }
                : undefined,
        onError: (_ctx, _id, _payload, errors) =>
            sanitizeExecutionErrors(errors, requestIdFrom(undefined), wsLogger),
    };
}

// stessa forma dell'HTTP: codice di validazione e nessun campo suggerito (D-07)
function validateWithoutIntrospection(
    schema: GraphQLSchema,
    document: DocumentNode,
): GraphQLError[] {
    return validate(schema, document, PRODUCTION_WS_RULES).map(
        (error) =>
            new GraphQLError(error.message.replace(SCHEMA_SUGGESTION, ''), {
                nodes: error.nodes,
                extensions: {
                    code: ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED,
                },
            }),
    );
}
