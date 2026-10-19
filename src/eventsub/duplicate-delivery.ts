import { isDuplicateKeyOn } from 'src/mongo/mongo-errors';

// una riconsegna collide sul message id, una seconda subscription sullo stesso evento collide sull'indice dell'evento
export function isDuplicateDelivery(error: unknown): boolean {
    return (
        isDuplicateKeyOn(error, 'messageId') ||
        isDuplicateKeyOn(error, 'eventId')
    );
}
