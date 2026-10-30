import type { Logger } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { requestIdPlugin } from 'src/graphql/request-id.plugin';

interface PluginHooks {
    didEncounterErrors(context: unknown): Promise<void>;
    willSendResponse(context: unknown): Promise<void>;
}

async function hooksOf(logger: Logger): Promise<PluginHooks> {
    const plugin = requestIdPlugin(logger);
    const hooks = await plugin.requestDidStart?.({} as never);
    return hooks as unknown as PluginHooks;
}

function fakeLogger(): { logger: Logger; error: jest.Mock } {
    const error = jest.fn();
    return { logger: { error } as unknown as Logger, error };
}

describe('requestIdPlugin', () => {
    it('adds the request id to internal errors of an HTTP response (D-07)', async () => {
        const hooks = await hooksOf(fakeLogger().logger);
        const response = {
            body: {
                kind: 'single',
                singleResult: {
                    data: null,
                    errors: [
                        {
                            message: 'Errore interno',
                            path: ['probeBoom'],
                            extensions: { code: 'INTERNAL_SERVER_ERROR' },
                        },
                        {
                            message: 'Monete insufficienti',
                            path: ['probeDomain'],
                            extensions: { code: 'INSUFFICIENT_FUNDS' },
                        },
                    ],
                },
            },
        };

        await hooks.willSendResponse({
            contextValue: { requestId: 'req-7' },
            response,
        });

        expect(response.body.singleResult.errors).toEqual([
            {
                message: 'Errore interno',
                path: ['probeBoom'],
                extensions: {
                    code: 'INTERNAL_SERVER_ERROR',
                    requestId: 'req-7',
                },
            },
            {
                message: 'Monete insufficienti',
                path: ['probeDomain'],
                extensions: { code: 'INSUFFICIENT_FUNDS' },
            },
        ]);
    });

    it('leaves a response without errors untouched (D-07)', async () => {
        const hooks = await hooksOf(fakeLogger().logger);
        const response = {
            body: { kind: 'single', singleResult: { data: { boom: 'boom' } } },
        };

        await hooks.willSendResponse({
            contextValue: { requestId: 'req-8' },
            response,
        });

        expect(response.body).toEqual({
            kind: 'single',
            singleResult: { data: { boom: 'boom' } },
        });
    });

    it('logs the original uncoded error with its request id (D-07)', async () => {
        const { logger, error } = fakeLogger();
        const hooks = await hooksOf(logger);
        const original = new Error('mongodb://user:pw@host');
        const domain = GameRuleException.insufficientFunds();

        await hooks.didEncounterErrors({
            contextValue: { requestId: 'req-9' },
            errors: [
                new GraphQLError(original.message, { originalError: original }),
                new GraphQLError(domain.message, { originalError: domain }),
                new GraphQLError('Cannot query field "boo" on type "Query".', {
                    extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
                }),
            ],
        });

        expect(error.mock.calls).toEqual([
            ['Errore interno req-9: Error', original.stack],
        ]);
    });
});
