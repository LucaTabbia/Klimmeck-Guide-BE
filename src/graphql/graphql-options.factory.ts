import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import type {
    WsConnectionAuthenticator,
    WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
import { formatDomainError } from 'src/graphql/format-domain-error';
import { buildGraphQLContext, GRAPHQL_PATH } from 'src/graphql/graphql-context';

// unica sorgente delle opzioni GraphQL: AppModule e harness di test la condividono
export function createGraphQLOptions(
    wsConnectionAuthenticator: WsConnectionAuthenticator,
    autoSchemaFile: string | boolean,
): Omit<ApolloDriverConfig, 'driver'> {
    return {
        path: GRAPHQL_PATH,
        autoSchemaFile,
        sortSchema: true,
        playground: false,
        introspection: true,
        plugins: [ApolloServerPluginLandingPageLocalDefault()],
        context: buildGraphQLContext,
        formatError: formatDomainError,
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
