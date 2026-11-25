import { HttpException } from '@nestjs/common';
import { AccountDeletionErrorCode } from 'src/account/deletion/account-deletion-error-code.enum';
import { AccountDeletionException } from 'src/account/deletion/account-deletion.exception';

describe('AccountDeletionException', () => {
    function expectCoded(
        exception: AccountDeletionException,
        code: string,
        status: number,
        error: string,
        message: string,
    ): void {
        expect(exception).toBeInstanceOf(HttpException);
        expect(exception.getStatus()).toBe(status);
        expect(exception.code).toBe(code);
        expect(exception.extensions).toEqual({ code });
        expect(exception.message).toBe(message);
        expect(exception.getResponse()).toEqual({
            statusCode: status,
            error,
            message,
            code,
        });
    }

    it('protects the innkeeper account with a 403 (D-16)', () => {
        expectCoded(
            AccountDeletionException.innkeeperProtected(),
            'INNKEEPER_ACCOUNT_PROTECTED',
            403,
            'Forbidden',
            "L'account dell'oste non si elimina dall'app",
        );
    });

    it('answers 404 when the Twitch user has no account (D-15)', () => {
        expectCoded(
            AccountDeletionException.accountNotFound(),
            'ACCOUNT_NOT_FOUND',
            404,
            'Not Found',
            'Nessun account per questo utente Twitch',
        );
    });

    it('answers 404 when the Twitch user does not exist (D-15)', () => {
        expectCoded(
            AccountDeletionException.twitchUserNotFound(),
            'TWITCH_USER_NOT_FOUND',
            404,
            'Not Found',
            'Utente Twitch inesistente',
        );
    });

    it('answers 503 when Twitch does not respond (D-15)', () => {
        expectCoded(
            AccountDeletionException.twitchUnavailable(),
            'TWITCH_UNAVAILABLE',
            503,
            'Service Unavailable',
            'Twitch non risponde: riprova più tardi',
        );
    });

    it('uses error codes whose values equal their names (D-15, D-16)', () => {
        expect(Object.entries(AccountDeletionErrorCode)).toEqual([
            ['INNKEEPER_ACCOUNT_PROTECTED', 'INNKEEPER_ACCOUNT_PROTECTED'],
            ['ACCOUNT_NOT_FOUND', 'ACCOUNT_NOT_FOUND'],
            ['TWITCH_USER_NOT_FOUND', 'TWITCH_USER_NOT_FOUND'],
            ['TWITCH_UNAVAILABLE', 'TWITCH_UNAVAILABLE'],
        ]);
    });
});
