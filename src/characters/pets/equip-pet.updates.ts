import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { idForms } from 'src/mongo/document-id';

// si equipaggia solo un pet posseduto (D-15); le due forme dell'id come per gli altri ref
export function equipPetFilter(
    characterId: Types.ObjectId,
    petId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.ownedPets': { $in: idForms(petId) },
    };
}

// assets.pet è il compagno equipaggiato, l'unico letto dal viaggio (D-13)
export function equipPetUpdate(petId: Types.ObjectId | null) {
    return { $set: { 'assets.pet': petId } };
}

export function classifyEquipPetFailure(characterExists: boolean): Error {
    return characterExists
        ? GameRuleException.petNotOwned()
        : ResourceNotFoundException.character();
}
