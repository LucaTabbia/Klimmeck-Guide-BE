import { HttpException, HttpStatus } from '@nestjs/common';
import { PushErrorCode } from 'src/push/push-error-code.enum';

export class PushException extends HttpException {
    readonly code: PushErrorCode;
    readonly extensions: { code: PushErrorCode };

    private constructor(
        code: PushErrorCode,
        status: HttpStatus,
        error: string,
        message: string,
    ) {
        super({ statusCode: status, error, message, code }, status);
        this.code = code;
        // graphql-js copia originalError.extensions; formatDomainError ripristina il codice dopo la riscrittura di Nest
        this.extensions = { code };
    }

    static invalidDeviceId(): PushException {
        return new PushException(
            PushErrorCode.PUSH_INVALID_DEVICE_ID,
            HttpStatus.BAD_REQUEST,
            'Bad Request',
            'Identificativo del dispositivo non valido',
        );
    }

    static invalidToken(): PushException {
        return new PushException(
            PushErrorCode.PUSH_INVALID_TOKEN,
            HttpStatus.BAD_REQUEST,
            'Bad Request',
            'Token di notifica non valido',
        );
    }

    static disabled(): PushException {
        return new PushException(
            PushErrorCode.PUSH_DISABLED,
            HttpStatus.SERVICE_UNAVAILABLE,
            'Service Unavailable',
            'Notifiche push non configurate sul server',
        );
    }
}
