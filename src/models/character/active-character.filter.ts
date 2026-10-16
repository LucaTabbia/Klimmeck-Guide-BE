import type { Types } from 'mongoose';

// un personaggio archiviato non esiste per i percorsi di gioco: missing e null valgono entrambi "attivo"
export const ACTIVE_CHARACTER_FILTER = { deletedAt: null } as const;

export function activeCharacterById(id: string | Types.ObjectId) {
    return { _id: id, ...ACTIVE_CHARACTER_FILTER };
}
