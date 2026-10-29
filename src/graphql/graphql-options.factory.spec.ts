import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import type { GraphQLFormattedError } from 'graphql';
import { GraphQLError } from 'graphql';
import type {
    WsConnectionAuthenticator,
    WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
import { formatDomainError } from 'src/graphql/format-domain-error';
import { buildGraphQLContext } from 'src/graphql/graphql-context';
import { createGraphQLOptions } from 'src/graphql/graphql-options.factory';

interface GraphqlWsHooks {
    onConnect: (context: WsConnectionContext) => Promise<boolean>;
    onClose: (context: WsConnectionContext) => void;
}

type FormatError = (
    formatted: GraphQLFormattedError,
    error: unknown,
) => GraphQLFormattedError;

describe('createGraphQLOptions', () => {
    let wsAuthenticator: { onConnect: jest.Mock; onClose: jest.Mock };

    beforeEach(() => {
        wsAuthenticator = {
            onConnect: jest.fn().mockResolvedValue(true),
            onClose: jest.fn(),
        };
    });

    function buildOptions(
        autoSchemaFile: string | boolean = true,
        production = false,
    ) {
        return createGraphQLOptions(
            wsAuthenticator as unknown as WsConnectionAuthenticator,
            autoSchemaFile,
            { production },
        );
    }

    function graphqlWsHooks(production = false): GraphqlWsHooks {
        const subscriptions = buildOptions(true, production)
            .subscriptions as Record<string, unknown>;
        return subscriptions['graphql-ws'] as GraphqlWsHooks;
    }

    it('builds the options outside production', () => {
        const options = buildOptions(true, false);

        expect(options.path).toBe('/api/graphql');
        expect(options.autoSchemaFile).toBe(true);
        expect(options.sortSchema).toBe(true);
        expect(options.playground).toBe(false);
        expect(options.introspection).toBe(true);
        expect(options.hideSchemaDetailsFromClientErrors).toBe(false);
        expect(options.includeStacktraceInErrorResponses).toBeUndefined();
        expect(options.context).toBe(buildGraphQLContext);
        expect(options.formatError).toBe(formatDomainError);
        expect(options.plugins).toHaveLength(2);
        expect(Object.keys(options.plugins?.[0] ?? {})).toContain(
            'serverWillStart',
        );
        expect(Object.keys(options.plugins?.[1] ?? {})).toEqual([
            'requestDidStart',
        ]);
    });

    it('turns introspection, landing page and suggestions off in production (D-05, D-07)', () => {
        const options = buildOptions(true, true);
        const formatError = options.formatError as FormatError;
        const raw = new GraphQLError('E11000 mongodb://user:pw@host', {
            path: ['probeBoom'],
            originalError: new Error('E11000 mongodb://user:pw@host'),
        });

        expect(options.introspection).toBe(false);
        expect(options.hideSchemaDetailsFromClientErrors).toBe(true);
        expect(options.includeStacktraceInErrorResponses).toBe(false);
        expect(options.context).toBe(buildGraphQLContext);
        expect(options.plugins).toHaveLength(2);
        expect(options.plugins?.[0]).toEqual(
            ApolloServerPluginLandingPageDisabled(),
        );
        expect(
            formatError(
                {
                    message: raw.message,
                    path: ['probeBoom'],
                    extensions: {
                        code: 'INTERNAL_SERVER_ERROR',
                        stacktrace: ['Error: E11000'],
                    },
                },
                raw,
            ),
        ).toEqual({
            message: 'Errore interno',
            path: ['probeBoom'],
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
    });

    it('passes the schema file path through', () => {
        expect(buildOptions('/tmp/schema.gql').autoSchemaFile).toBe(
            '/tmp/schema.gql',
        );
    });

    it('exposes graphql-ws as the only subscription protocol', () => {
        const options = buildOptions();

        expect(Object.keys(options.subscriptions ?? {})).toEqual([
            'graphql-ws',
        ]);
        expect(Object.keys(options).sort()).toEqual([
            'autoSchemaFile',
            'context',
            'formatError',
            'hideSchemaDetailsFromClientErrors',
            'introspection',
            'path',
            'playground',
            'plugins',
            'sortSchema',
            'subscriptions',
        ]);
    });

    it('adds the stack trace switch only in production (D-07)', () => {
        expect(Object.keys(buildOptions(true, true)).sort()).toEqual([
            'autoSchemaFile',
            'context',
            'formatError',
            'hideSchemaDetailsFromClientErrors',
            'includeStacktraceInErrorResponses',
            'introspection',
            'path',
            'playground',
            'plugins',
            'sortSchema',
            'subscriptions',
        ]);
    });

    it('delegates onConnect to the ws authenticator and returns its result', async () => {
        wsAuthenticator.onConnect.mockResolvedValue(false);
        const context = { extra: {} } as WsConnectionContext;

        const accepted = await graphqlWsHooks().onConnect(context);

        expect(wsAuthenticator.onConnect).toHaveBeenCalledWith(context);
        expect(accepted).toBe(false);
    });

    it('delegates onClose to the ws authenticator', () => {
        const context = { extra: {} } as WsConnectionContext;

        graphqlWsHooks().onClose(context);

        expect(wsAuthenticator.onClose).toHaveBeenCalledWith(context);
    });
});
