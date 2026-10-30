import { ValidationPipe } from '@nestjs/common';
import { BadUserInputException } from 'src/validation/bad-user-input.exception';
import { invalidFieldsOf } from 'src/validation/invalid-fields';

// unica pipe globale (D-01): campi senza decoratore scartati in silenzio, nessun valore nel messaggio
export const createValidationPipe = (): ValidationPipe =>
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        exceptionFactory: (errors) =>
            new BadUserInputException([...new Set(invalidFieldsOf(errors))]),
    });
