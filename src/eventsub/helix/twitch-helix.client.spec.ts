import {
    describeHelixError,
    TwitchHelixError,
} from 'src/eventsub/helix/twitch-helix.client';
import {
    assertTwitchOk,
    readTwitchJson,
    sendTwitchRequest,
} from 'src/eventsub/helix/twitch-http';

const URL_UNDER_TEST = 'https://api.twitch.tv/helix/eventsub/subscriptions';

describe('TwitchHelixError', () => {
    it('keeps the message and exposes the HTTP status', () => {
        const error = new TwitchHelixError(
            'Helix create subscription failed with status 403',
            403,
        );

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('TwitchHelixError');
        expect(error.status).toBe(403);
        expect(error.message).toBe(
            'Helix create subscription failed with status 403',
        );
    });

    it('has no status when the failure is not an HTTP response', () => {
        expect(
            new TwitchHelixError('Helix list subscriptions request failed')
                .status,
        ).toBeUndefined();
    });
});

describe('describeHelixError', () => {
    it('returns the message of a TwitchHelixError', () => {
        expect(
            describeHelixError(
                new TwitchHelixError('Helix list subscriptions request failed'),
            ),
        ).toBe('Helix list subscriptions request failed');
    });

    it('returns only the name of foreign errors, never their message', () => {
        expect(describeHelixError(new TypeError('secret-token leaked'))).toBe(
            'TypeError',
        );
    });

    it('returns UnknownError for non-error values', () => {
        expect(describeHelixError('x')).toBe('UnknownError');
    });
});

describe('twitch http helpers', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockRejectedValue(new Error('Unexpected network call'));
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    describe('sendTwitchRequest', () => {
        it('turns a network failure into a TwitchHelixError without leaking details', async () => {
            fetchSpy.mockRejectedValue(new Error('getaddrinfo token=abc'));

            const failure = sendTwitchRequest('Op', URL_UNDER_TEST, {
                method: 'GET',
            });

            await expect(failure).rejects.toBeInstanceOf(TwitchHelixError);
            const error = (await failure.catch(
                (caught: unknown) => caught,
            )) as TwitchHelixError;
            expect(error.message).toBe('Op request failed (Error)');
            expect(error.message).not.toContain('token=abc');
            expect(error.status).toBeUndefined();
            expect(error).not.toHaveProperty('cause');
        });

        it.each<[string, Error]>([
            [
                'TimeoutError',
                new DOMException('timed out token=abc', 'TimeoutError'),
            ],
            ['TypeError', new TypeError('fetch failed token=abc')],
        ])('names the %s cause without its message', async (name, cause) => {
            fetchSpy.mockRejectedValue(cause);

            const error = (await sendTwitchRequest('Op', URL_UNDER_TEST, {
                method: 'GET',
            }).catch((caught: unknown) => caught)) as TwitchHelixError;

            expect(error.message).toBe(`Op request failed (${name})`);
            expect(error.message).not.toContain('token=abc');
        });

        it('names a non error rejection as UnknownError', async () => {
            fetchSpy.mockRejectedValue('token=abc');

            await expect(
                sendTwitchRequest('Op', URL_UNDER_TEST, { method: 'GET' }),
            ).rejects.toThrow(
                new TwitchHelixError('Op request failed (UnknownError)'),
            );
        });

        it('resolves non-2xx responses and lets the caller decide', async () => {
            const response = new Response(null, { status: 500 });
            fetchSpy.mockResolvedValue(response);

            await expect(
                sendTwitchRequest('Op', URL_UNDER_TEST, { method: 'GET' }),
            ).resolves.toBe(response);
            expect(fetchSpy).toHaveBeenCalledWith(URL_UNDER_TEST, {
                method: 'GET',
            });
        });
    });

    describe('assertTwitchOk', () => {
        it('throws a TwitchHelixError carrying the status for non-2xx responses', () => {
            let caught: unknown;
            try {
                assertTwitchOk('Op', new Response(null, { status: 409 }));
            } catch (error) {
                caught = error;
            }

            expect(caught).toBeInstanceOf(TwitchHelixError);
            expect((caught as TwitchHelixError).status).toBe(409);
            expect((caught as TwitchHelixError).message).toBe(
                'Op failed with status 409',
            );
        });

        it('accepts 2xx responses', () => {
            expect(() =>
                assertTwitchOk('Op', new Response(null, { status: 202 })),
            ).not.toThrow();
        });
    });

    describe('readTwitchJson', () => {
        it('parses a JSON body', async () => {
            await expect(
                readTwitchJson<{ ok: boolean }>(
                    'Op',
                    new Response(JSON.stringify({ ok: true })),
                ),
            ).resolves.toEqual({ ok: true });
        });

        it('rejects an invalid body with a generic message', async () => {
            await expect(
                readTwitchJson('Op', new Response('not json')),
            ).rejects.toThrow(
                new TwitchHelixError('Op response is not valid JSON'),
            );
        });
    });
});
