import { HttpException, HttpStatus } from '@nestjs/common';
import { AccountDeletionErrorCode } from 'src/account/deletion/account-deletion-error-code.enum';

const ERROR_NAMES: Partial<Record<HttpStatus, string>> = {
    [HttpStatus.FORBIDDEN]: 'Forbidden',
    [HttpStatus.NOT_FOUND]: 'Not Found',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
};

export class AccountDeletionException extends HttpException {
    readonly code: AccountDeletionErrorCode;
    readonly extensions: { code: AccountDeletionErrorCode };

    private constructor(
        code: AccountDeletionErrorCode,
        status: HttpStatus,
        message: string,
    ) {
        super(
            { statusCode: status, error: ERROR_NAMES[status], message, code },
            status,
        );
        this.code = code;
        // graphql-js copia originalError.extensions; formatDomainError ripristina il codice dopo la riscrittura di Nest
        this.extensions = { code };
    }

    // l'account dell'oste si toglie solo a mano (Phase 26 D-16)
    static innkeeperProtected(): AccountDeletionException {
        return new AccountDeletionException(
            AccountDeletionErrorCode.INNKEEPER_ACCOUNT_PROTECTED,
            HttpStatus.FORBIDDEN,
            "L'account dell'oste non si elimina dall'app",
        );
    }

    static accountNotFound(): AccountDeletionException {
        return new AccountDeletionException(
            AccountDeletionErrorCode.ACCOUNT_NOT_FOUND,
            HttpStatus.NOT_FOUND,
            'Nessun account per questo utente Twitch',
        );
    }

    static twitchUserNotFound(): AccountDeletionException {
        return new AccountDeletionException(
            AccountDeletionErrorCode.TWITCH_USER_NOT_FOUND,
            HttpStatus.NOT_FOUND,
            'Utente Twitch inesistente',
        );
    }

    static twitchUnavailable(): AccountDeletionException {
        return new AccountDeletionException(
            AccountDeletionErrorCode.TWITCH_UNAVAILABLE,
            HttpStatus.SERVICE_UNAVAILABLE,
            'Twitch non risponde: riprova più tardi',
        );
    }
}
