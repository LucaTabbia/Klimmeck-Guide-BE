import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { AuthException } from 'src/auth/auth.exception';
import type { RuntimeConfig } from 'src/config/runtime-config';
import { UnhandledExceptionFilter } from 'src/http/unhandled-exception.filter';

interface FakeHost {
    host: ArgumentsHost;
    status: jest.Mock;
    json: jest.Mock;
}

function fakeHost(type: string, requestId?: string): FakeHost {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status };
    const request = { headers: {}, requestId };
    const host = {
        getType: () => type,
        getArgByIndex: (index: number) => [request, response][index],
        switchToHttp: () => ({
            getRequest: () => request,
            getResponse: () => response,
        }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
}

function filterFor(production: boolean): UnhandledExceptionFilter {
    return new UnhandledExceptionFilter({
        mode: production ? 'production' : 'test',
        production,
        modeDefaulted: false,
    } as RuntimeConfig);
}

describe('UnhandledExceptionFilter', () => {
    let logError: jest.SpyInstance;
    let baseCatch: jest.SpyInstance;

    beforeEach(() => {
        logError = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        baseCatch = jest
            .spyOn(BaseExceptionFilter.prototype, 'catch')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('answers an unexpected REST error with a coded 500 and the request id in production (D-07)', () => {
        const { host, status, json } = fakeHost('http', 'req-9');

        filterFor(true).catch(
            new Error('cloudinary says: api_secret=fake-secret'),
            host,
        );

        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Errore interno',
            requestId: 'req-9',
        });
        expect(baseCatch).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining('req-9'),
            expect.any(String),
        );
    });

    it('keeps the default REST error shape outside production (D-07)', () => {
        const { host, status } = fakeHost('http', 'req-3');
        const error = new Error('raw');

        filterFor(false).catch(error, host);

        expect(baseCatch).toHaveBeenCalledWith(error, host);
        expect(status).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining('req-3'),
            expect.any(String),
        );
    });

    it('passes HTTP exceptions through unchanged (D-07)', () => {
        const { host, status } = fakeHost('http', 'req-4');
        const exception = AuthException.unauthenticated();

        filterFor(true).catch(exception, host);

        expect(baseCatch).toHaveBeenCalledWith(exception, host);
        expect(status).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
    });

    it('answers a body parser 4xx with its own status and no internal error log in production (D-07)', () => {
        const { host, status } = fakeHost('http', 'req-5');
        const tooLarge = Object.assign(new Error('request entity too large'), {
            status: 413,
            type: 'entity.too.large',
        });

        filterFor(true).catch(tooLarge, host);

        expect(baseCatch).toHaveBeenCalledTimes(1);
        const [forwarded] = baseCatch.mock.calls[0] as [HttpException];
        expect(forwarded).toBeInstanceOf(HttpException);
        expect(forwarded.getStatus()).toBe(413);
        expect(forwarded.getResponse()).toEqual({
            statusCode: 413,
            message: 'request entity too large',
        });
        expect(status).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
    });

    it('still masks an error carrying a 5xx status in production (D-07)', () => {
        const { host, status } = fakeHost('http', 'req-6');
        const upstream = Object.assign(new Error('upstream down'), {
            statusCode: 502,
        });

        filterFor(true).catch(upstream, host);

        expect(status).toHaveBeenCalledWith(500);
        expect(baseCatch).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining('req-6'),
            expect.any(String),
        );
    });

    it('leaves GraphQL errors to Apollo (Pitfall 6)', () => {
        const { host, status } = fakeHost('graphql');
        const error = new Error('resolver failed');

        expect(filterFor(true).catch(error, host)).toBe(error);
        expect(baseCatch).not.toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
    });
});
