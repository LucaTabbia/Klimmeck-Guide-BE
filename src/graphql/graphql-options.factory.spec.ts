import type {
    WsConnectionAuthenticator,
    WsConnectionContext,
} from 'src/auth/ws/ws-connection-authenticator';
import { formatAuthError } from 'src/auth/format-auth-error';
import { buildGraphQLContext } from 'src/graphql/graphql-context';
import { createGraphQLOptions } from 'src/graphql/graphql-options.factory';

interface GraphqlWsHooks {
    onConnect: (context: WsConnectionContext) => Promise<boolean>;
    onClose: (context: WsConnectionContext) => void;
}

describe('createGraphQLOptions', () => {
    let wsAuthenticator: { onConnect: jest.Mock; onClose: jest.Mock };

    beforeEach(() => {
        wsAuthenticator = {
            onConnect: jest.fn().mockResolvedValue(true),
            onClose: jest.fn(),
        };
    });

    function buildOptions(autoSchemaFile: string | boolean = true) {
        return createGraphQLOptions(
            wsAuthenticator as unknown as WsConnectionAuthenticator,
            autoSchemaFile,
        );
    }

    function graphqlWsHooks(): GraphqlWsHooks {
        const subscriptions = buildOptions().subscriptions as Record<
            string,
            unknown
        >;
        return subscriptions['graphql-ws'] as GraphqlWsHooks;
    }

    it('builds the shared server options', () => {
        const options = buildOptions(true);

        expect(options.path).toBe('/api/graphql');
        expect(options.autoSchemaFile).toBe(true);
        expect(options.sortSchema).toBe(true);
        expect(options.playground).toBe(false);
        expect(options.introspection).toBe(true);
        expect(options.context).toBe(buildGraphQLContext);
        expect(options.formatError).toBe(formatAuthError);
        expect(options.plugins).toHaveLength(1);
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
        expect(options).not.toHaveProperty('installSubscriptionHandlers');
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
