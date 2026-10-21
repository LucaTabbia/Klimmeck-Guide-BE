import { NotFoundException } from '@nestjs/common';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';

describe('ResourceNotFoundException', () => {
    it.each([
        [
            'character',
            () => ResourceNotFoundException.character(),
            'Personaggio non trovato',
        ],
        [
            'pendingQuest',
            () => ResourceNotFoundException.pendingQuest(),
            'Missione in attesa non trovata',
        ],
        [
            'quest',
            () => ResourceNotFoundException.quest(),
            'Missione non trovata',
        ],
        ['user', () => ResourceNotFoundException.user(), 'Utente non trovato'],
        ['spell', () => ResourceNotFoundException.spell(), 'Magia non trovata'],
        [
            'pointOfInterest',
            () => ResourceNotFoundException.pointOfInterest(),
            'Luogo non trovato',
        ],
    ])(
        '%s is a 404 NOT_FOUND with an italian message',
        (_name, factory, message) => {
            const exception = factory();

            expect(exception).toBeInstanceOf(NotFoundException);
            expect(exception.getStatus()).toBe(404);
            expect(exception.code).toBe('NOT_FOUND');
            expect(exception.extensions).toEqual({ code: 'NOT_FOUND' });
            expect(exception.getResponse()).toEqual({
                statusCode: 404,
                error: 'Not Found',
                message,
                code: 'NOT_FOUND',
            });
        },
    );
});
