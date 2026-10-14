import { ForbiddenException } from '@nestjs/common';
import { AuthorizationErrorCode } from 'src/authz/authorization-error-code.enum';

export class AuthorizationException extends ForbiddenException {
    readonly code = AuthorizationErrorCode.FORBIDDEN;
    readonly extensions: { code: AuthorizationErrorCode.FORBIDDEN };

    private constructor(message: string) {
        super({
            statusCode: 403,
            error: 'Forbidden',
            message,
            code: AuthorizationErrorCode.FORBIDDEN,
        });
        // graphql-js copia originalError.extensions anche su WS, dove formatDomainError non gira (D-04)
        this.extensions = { code: AuthorizationErrorCode.FORBIDDEN };
    }

    static notOwner(): AuthorizationException {
        return new AuthorizationException(
            'Questo personaggio non ti appartiene',
        );
    }

    static innkeeperOnly(): AuthorizationException {
        return new AuthorizationException('Operazione riservata al locandiere');
    }

    static pendingQuestNotOwned(): AuthorizationException {
        return new AuthorizationException('Questa missione non ti appartiene');
    }
}
