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
        [
            'questResult',
            () => ResourceNotFoundException.questResult(),
            'Risultato non trovato',
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

    it.each([
        ['lore', () => ResourceNotFoundException.lore(), 'Lore non trovata'],
        ['pet', () => ResourceNotFoundException.pet(), 'Compagno non trovato'],
        ['city', () => ResourceNotFoundException.city(), 'Città non trovata'],
        [
            'enemy',
            () => ResourceNotFoundException.enemy(),
            'Nemico non trovato',
        ],
        [
            'lootItem',
            () => ResourceNotFoundException.lootItem(),
            'Oggetto non trovato',
        ],
        [
            'equipmentItem',
            () => ResourceNotFoundException.equipmentItem(),
            'Equipaggiamento non trovato',
        ],
    ])(
        'codes a missing %s as NOT_FOUND without echoing the id (F2)',
        (_name, factory, message) => {
            const exception = factory();

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
