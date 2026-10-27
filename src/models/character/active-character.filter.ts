import type { Types } from 'mongoose';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';

// un personaggio archiviato non esiste per i percorsi di gioco: missing e null valgono entrambi "attivo"
export const ACTIVE_CHARACTER_FILTER = { deletedAt: null } as const;

export function activeCharacterById(id: string | Types.ObjectId) {
    return { _id: id, ...ACTIVE_CHARACTER_FILTER };
}

// il personaggio corrente comprende il morto finché il giocatore non chiude il suo foglio (D-12); ogni altro archiviato resta null (03.1 D-06)
export const CURRENT_CHARACTER_LINK_FILTER = {
    $or: [ACTIVE_CHARACTER_FILTER, { deletionReason: DeletionReason.death }],
} as const;
