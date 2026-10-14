import { ForbiddenException } from '@nestjs/common';
import { AuthorizationException } from 'src/authz/authorization.exception';

describe('AuthorizationException', () => {
    it.each([
        [
            'notOwner',
            () => AuthorizationException.notOwner(),
            'Questo personaggio non ti appartiene',
        ],
        [
            'innkeeperOnly',
            () => AuthorizationException.innkeeperOnly(),
            'Operazione riservata al locandiere',
        ],
        [
            'pendingQuestNotOwned',
            () => AuthorizationException.pendingQuestNotOwned(),
            'Questa missione non ti appartiene',
        ],
    ])(
        '%s is a 403 FORBIDDEN with an italian message',
        (_name, factory, message) => {
            const exception = factory();

            expect(exception).toBeInstanceOf(ForbiddenException);
            expect(exception.getStatus()).toBe(403);
            expect(exception.code).toBe('FORBIDDEN');
            expect(exception.extensions).toEqual({ code: 'FORBIDDEN' });
            expect(exception.getResponse()).toEqual({
                statusCode: 403,
                error: 'Forbidden',
                message,
                code: 'FORBIDDEN',
            });
        },
    );
});
