import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { GraphQLFormattedError } from 'graphql';
import type {
    WsConnectionAuthenticator,
    WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
import { formatDomainError } from 'src/graphql/format-domain-error';
import { buildGraphQLContext, GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { sanitizeFormattedError } from 'src/graphql/production-errors';
import { requestIdPlugin } from 'src/graphql/request-id.plugin';

export interface GraphQLSurfaceOptions {
    production: boolean;
}

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
