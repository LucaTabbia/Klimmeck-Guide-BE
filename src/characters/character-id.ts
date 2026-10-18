import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { objectIdFromHex } from 'src/mongo/document-id';

// id malformato = personaggio inesistente: mai new Types.ObjectId() su input non validato
export function requireCharacterObjectId(id: string): Types.ObjectId {
    const characterId = objectIdFromHex(id);
    if (!characterId) throw ResourceNotFoundException.character();
    return characterId;
}
