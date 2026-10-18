import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { SlotType } from 'src/models/enums/slot_type.enum';

// itemId null sveste lo slot senza guard; altrimenti solo un oggetto posseduto (04 D-12). equipType↔slot resta fuori scope
export function equipItemFilter(
    characterId: Types.ObjectId,
    itemId: Types.ObjectId | null,
) {
    return itemId === null
        ? activeCharacterById(characterId)
        : {
              ...activeCharacterById(characterId),
              'assets.ownedEquipments.item': itemId,
          };
}

export function equipItemUpdate(slot: SlotType, itemId: Types.ObjectId | null) {
    return { $set: { [`assets.wearedEquipment.${slot}`]: itemId } };
}

export function classifyEquipItemFailure(characterExists: boolean): Error {
    return characterExists
        ? GameRuleException.itemNotOwned()
        : ResourceNotFoundException.character();
}
