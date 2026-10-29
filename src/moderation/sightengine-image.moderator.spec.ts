import { Logger } from '@nestjs/common';
import { ImageModerationUnavailableException } from 'src/moderation/image-moderation.exceptions';
import type { ModerationImage } from 'src/moderation/image-moderator';
import {
    SIGHTENGINE_CHECK_URL,
    SIGHTENGINE_TIMEOUT_MS,
    SightengineImageModerator,
} from 'src/moderation/sightengine-image.moderator';

const CREDENTIALS = { userId: 'fake-user', secret: 'fake-secret' };

const IMAGE: ModerationImage = {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]),
    mimetype: 'image/jpeg',
    filename: 'portrait.jpg',
};

const CLEAN_BODY = {
    status: 'success',
    nudity: { erotica: 0.01, suggestive: 0.01 },
    gore: { prob: 0.01 },
    faces: [],
    text: { has_natural: 0.01, profanity: [], personal: [] },
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function failureBody(type: string) {
    return {
        status: 'failure',
        request: { id: 'req_fake' },
        error: { type, code: 21, message: 'fake failure' },
    };
}

const UNAVAILABLE_RESPONSES: Record<string, () => Response> = {
    '502': () => jsonResponse({ status: 'failure' }, 502),
    usage_limit: () => jsonResponse(failureBody('usage_limit'), 429),
    plan_error: () => jsonResponse(failureBody('plan_error'), 403),
    credentials_error: () =>
        jsonResponse(failureBody('credentials_error'), 401),
    argument_error: () => jsonResponse(failureBody('argument_error'), 400),
    html: () =>
        new Response('<html>oops</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
        }),
};

describe('SightengineImageModerator', () => {
    let fetchSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let moderator: SightengineImageModerator;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch');
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        moderator = new SightengineImageModerator(CREDENTIALS);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function respondWith(response: Response): void {
        fetchSpy.mockResolvedValueOnce(response);
    }

    function loggedLines(): string[] {
        return [logSpy, warnSpy, errorSpy].flatMap((spy) =>
            spy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')),
        );
    }

    it('is enabled', () => {
        expect(moderator.enabled).toBe(true);
    });

    it('posts the image with the verbatim models and the credentials as multipart (D-12)', async () => {
        respondWith(jsonResponse(CLEAN_BODY));

        await moderator.moderate(IMAGE);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.sightengine.com/1.0/check.json');
        expect(url).toBe(SIGHTENGINE_CHECK_URL);
        expect(init.method).toBe('POST');
        expect(init.body).toBeInstanceOf(FormData);
        const form = init.body as FormData;
        expect(form.get('models')).toBe(
            'nudity-2.1,offensive-2.0,text-content,face-age,gore-2.0,text,qr-content,self-harm',
        );
        expect(form.get('api_user')).toBe('fake-user');
        expect(form.get('api_secret')).toBe('fake-secret');
        const media = form.get('media') as File;
        expect(media).toBeInstanceOf(Blob);
        expect(media.type).toBe('image/jpeg');
        expect(media.name).toBe('portrait.jpg');
        expect(Buffer.from(await media.arrayBuffer())).toEqual(IMAGE.buffer);
        expect([...form.keys()].sort()).toEqual([
            'api_secret',
            'api_user',
            'media',
            'models',
        ]);
    });

    it('approves an image the policy accepts (D-13)', async () => {
        respondWith(
            jsonResponse({
                ...CLEAN_BODY,
                text: { has_natural: 0.9, link: [{ type: 'url' }] },
            }),
        );

        await expect(moderator.moderate(IMAGE)).resolves.toEqual({
            approved: true,
            logged: ['text-present', 'text-link'],
        });
    });

    it('rejects an image the policy refuses with its categories only (D-12)', async () => {
        respondWith(jsonResponse({ ...CLEAN_BODY, nudity: { erotica: 0.93 } }));

        await expect(moderator.moderate(IMAGE)).resolves.toEqual({
            approved: false,
            reasons: ['nudity'],
            logged: [],
        });
    });

    it('maps a media error to an unreadable rejection (D-14)', async () => {
        respondWith(
            jsonResponse(
                { status: 'failure', error: { type: 'media_error' } },
                400,
            ),
        );

        await expect(moderator.moderate(IMAGE)).resolves.toEqual({
            approved: false,
            reasons: ['unreadable'],
            logged: [],
        });
    });

    it.each([
        ['5xx', '502'],
        ['usage_limit', 'usage_limit'],
        ['plan_error', 'plan_error'],
        ['credentials_error', 'credentials_error'],
        ['argument_error', 'argument_error'],
        ['non-JSON', 'html'],
    ])(
        'fails closed with IMAGE_MODERATION_UNAVAILABLE on %s (D-14)',
        async (_, kind) => {
            respondWith(UNAVAILABLE_RESPONSES[kind]());

            await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
                ImageModerationUnavailableException,
            );
        },
    );

    it('fails closed on an unknown failure type or a success without a body (D-14)', async () => {
        respondWith(jsonResponse(failureBody('unknown_error'), 500));
        respondWith(jsonResponse(null));

        await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );
        await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );
    });

    it('fails closed on a network error or a 5 s timeout (D-14)', async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
        fetchSpy.mockRejectedValueOnce(
            new DOMException('The operation timed out.', 'TimeoutError'),
        );

        await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );
        await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(SIGHTENGINE_TIMEOUT_MS).toBe(5000);
    });

    it('arms the request with a 5 s timeout signal (D-14)', async () => {
        const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
        respondWith(jsonResponse(CLEAN_BODY));

        await moderator.moderate(IMAGE);

        expect(timeoutSpy).toHaveBeenCalledWith(5000);
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(init.signal).toBe(timeoutSpy.mock.results[0].value);
    });

    it('reports a misconfiguration with the error type and code only', async () => {
        respondWith(jsonResponse(failureBody('credentials_error'), 401));

        await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][0]).toBe(
            'Sightengine rifiuta la configurazione: credentials_error, codice 21',
        );
    });

    it('logs the outcome and the categories without scores, image or keys (D-15)', async () => {
        respondWith(jsonResponse(CLEAN_BODY));
        respondWith(jsonResponse({ ...CLEAN_BODY, nudity: { erotica: 0.93 } }));
        respondWith(
            jsonResponse({ ...CLEAN_BODY, text: { has_natural: 0.9 } }),
        );

        await moderator.moderate(IMAGE);
        await moderator.moderate(IMAGE);
        await moderator.moderate(IMAGE);

        expect(logSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            'Moderazione immagine: approvata',
            'Moderazione immagine: respinta (nudity)',
            'Moderazione immagine: approvata; da segnalare (text-present)',
        ]);
        expect(
            loggedLines().filter((line) =>
                /fake-secret|fake-user|0\.93|portrait/.test(line),
            ),
        ).toEqual([]);
    });

    it('never logs the keys or the image when the request fails (D-15)', async () => {
        fetchSpy.mockRejectedValueOnce(
            new TypeError('fetch failed for fake-secret'),
        );

        await expect(moderator.moderate(IMAGE)).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );

        expect(warnSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            'Moderazione immagine non disponibile: TypeError',
        ]);
        expect(
            loggedLines().filter((line) => /fake-secret|fake-user/.test(line)),
        ).toEqual([]);
    });
});
