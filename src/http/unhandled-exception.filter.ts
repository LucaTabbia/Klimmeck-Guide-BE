import {
    ArgumentsHost,
    Catch,
    HttpException,
    HttpStatus,
    Inject,
    Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { RUNTIME_CONFIG } from 'src/config/runtime-config';
import type { RuntimeConfig } from 'src/config/runtime-config';
import {
    INTERNAL_ERROR_MESSAGE,
    INTERNAL_SERVER_ERROR,
    logInternalError,
} from 'src/graphql/production-errors';
import { requestIdFrom } from 'src/graphql/request-id';
import type { RequestWithId } from 'src/http/request-id.middleware';

// globale: GraphQL resta ad Apollo (Pitfall 6), gli HttpException mantengono il corpo, il resto è mascherato solo in produzione (D-07)
@Catch()
export class UnhandledExceptionFilter extends BaseExceptionFilter {
    private readonly logger = new Logger('Http');

    constructor(
        @Inject(RUNTIME_CONFIG) private readonly runtime: RuntimeConfig,
    ) {
        super();
    }

    catch(exception: unknown, host: ArgumentsHost): unknown {
        if (host.getType() !== 'http') return exception;
        if (exception instanceof HttpException) {
            return super.catch(exception, host);
        }
        const clientStatus = clientErrorStatusOf(exception);
        if (clientStatus !== undefined) {
            return super.catch(
                clientHttpException(exception, clientStatus),
                host,
            );
        }
        const http = host.switchToHttp();
        const requestId =
            http.getRequest<RequestWithId>().requestId ??
            requestIdFrom(undefined);
        logInternalError(this.logger, requestId, exception);
        if (!this.runtime.production) return super.catch(exception, host);
        http.getResponse<Response>()
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .json({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                code: INTERNAL_SERVER_ERROR,
                message: INTERNAL_ERROR_MESSAGE,
                requestId,
            });
        return undefined;
    }
}

// errori del body parser (http-errors): status 4xx del client, non sono guasti interni
function clientErrorStatusOf(exception: unknown): number | undefined {
    if (typeof exception !== 'object' || exception === null) return undefined;
    const { status, statusCode } = exception as {
        status?: unknown;
        statusCode?: unknown;
    };
    const candidate = typeof statusCode === 'number' ? statusCode : status;
    if (typeof candidate !== 'number') return undefined;
    return candidate >= 400 && candidate < 500 ? candidate : undefined;
}

function clientHttpException(exception: object, status: number): HttpException {
    const { message } = exception as { message?: unknown };
    return new HttpException(
        {
            statusCode: status,
            message: typeof message === 'string' ? message : undefined,
        },
        status,
    );
}
