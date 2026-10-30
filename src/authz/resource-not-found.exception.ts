import { NotFoundException } from '@nestjs/common';
import { AuthorizationErrorCode } from 'src/authz/authorization-error-code.enum';

// un NotFoundException grezzo esce come INTERNAL_SERVER_ERROR su HTTP e senza codice su WS (D-11)
export class ResourceNotFoundException extends NotFoundException {
    readonly code = AuthorizationErrorCode.NOT_FOUND;
    readonly extensions: { code: AuthorizationErrorCode.NOT_FOUND };

    private constructor(message: string) {
        super({
            statusCode: 404,
            error: 'Not Found',
            message,
            code: AuthorizationErrorCode.NOT_FOUND,
        });
        this.extensions = { code: AuthorizationErrorCode.NOT_FOUND };
    }

    static character(): ResourceNotFoundException {
        return new ResourceNotFoundException('Personaggio non trovato');
    }

    static pendingQuest(): ResourceNotFoundException {
        return new ResourceNotFoundException('Missione in attesa non trovata');
    }

    static quest(): ResourceNotFoundException {
        return new ResourceNotFoundException('Missione non trovata');
    }

    static user(): ResourceNotFoundException {
        return new ResourceNotFoundException('Utente non trovato');
    }

    static spell(): ResourceNotFoundException {
        return new ResourceNotFoundException('Magia non trovata');
    }

    static pointOfInterest(): ResourceNotFoundException {
        return new ResourceNotFoundException('Luogo non trovato');
    }

    static questResult(): ResourceNotFoundException {
        return new ResourceNotFoundException('Risultato non trovato');
    }

    static lore(): ResourceNotFoundException {
        return new ResourceNotFoundException('Lore non trovata');
    }

    static pet(): ResourceNotFoundException {
        return new ResourceNotFoundException('Compagno non trovato');
    }

    static city(): ResourceNotFoundException {
        return new ResourceNotFoundException('Città non trovata');
    }

    static enemy(): ResourceNotFoundException {
        return new ResourceNotFoundException('Nemico non trovato');
    }

    static lootItem(): ResourceNotFoundException {
        return new ResourceNotFoundException('Oggetto non trovato');
    }

    static equipmentItem(): ResourceNotFoundException {
        return new ResourceNotFoundException('Equipaggiamento non trovato');
    }
}
