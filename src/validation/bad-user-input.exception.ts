import { BadRequestException } from '@nestjs/common';

export const BAD_USER_INPUT = 'BAD_USER_INPUT';

// solo i percorsi dei campi, mai i valori (D-03); formatDomainError ripristina extensions.code dopo la riscrittura di Nest
export class BadUserInputException extends BadRequestException {
    readonly code = BAD_USER_INPUT;
    readonly extensions = { code: BAD_USER_INPUT };

    constructor(readonly fields: readonly string[]) {
        super({
            statusCode: 400,
            error: 'Bad Request',
            code: BAD_USER_INPUT,
            message: `Input non valido: ${fields.join(', ')}`,
        });
    }

    static of(fields: readonly string[]): BadUserInputException {
        return new BadUserInputException(fields);
    }
}
