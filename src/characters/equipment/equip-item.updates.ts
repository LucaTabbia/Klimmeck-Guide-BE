import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { SlotType } from 'src/models/enums/slot-type.enum';

const ownedCopiesOf = (itemId: Types.ObjectId) => ({
    $sum: {
        $map: {
            input: {
                $filter: {
                    input: { $ifNull: ['$assets.ownedEquipments', []] },
                    cond: { $eq: ['$$this.item', itemId] },
                },
            },
            in: '$$this.quantity',
        },
    },
});

const copiesWornOutside = (
    itemId: Types.ObjectId,
    writtenSlots: readonly SlotType[],
) =>
    Object.values(SlotType)
        .filter((other) => !writtenSlots.includes(other))
        .map((other) => ({
            $cond: [{ $eq: [`$assets.wornEquipment.${other}`, itemId] }, 1, 0],
        }));

export function ownsEquipmentFilter(
    characterId: Types.ObjectId,
    itemId: Types.ObjectId,
) {
    return {
        ...activeCharacterById(characterId),
        'assets.ownedEquipments.item': itemId,
    };
}

// itemId null sveste lo slot senza guard; altrimenti serve una copia posseduta in più di quelle indossate fuori dagli slot scritti (04 D-12). equipType↔slot resta fuori scope
export function equipItemFilter(
    characterId: Types.ObjectId,
    itemId: Types.ObjectId | null,
    writtenSlots: readonly SlotType[],
) {
    return itemId === null
        ? activeCharacterById(characterId)
        : {
              ...ownsEquipmentFilter(characterId, itemId),
              $expr: {
                  $gte: [
                      ownedCopiesOf(itemId),
                      {
                          $add: [1, ...copiesWornOutside(itemId, writtenSlots)],
                      },
                  ],
              },
          };
}

export function equipItemUpdate(
    slot: SlotType,
    itemId: Types.ObjectId | null,
    freedHands: readonly SlotType[] = [],
) {
    const emptied = freedHands.map((hand): [string, null] => [
        `assets.wornEquipment.${hand}`,
        null,
    ]);
    return {
        $set: {
            [`assets.wornEquipment.${slot}`]: itemId,
            ...Object.fromEntries(emptied),
        },
    };
}

export function classifyEquipItemFailure(
    characterExists: boolean,
    ownsItem: boolean,
): Error {
    if (!characterExists) return ResourceNotFoundException.character();
    return ownsItem
        ? GameRuleException.insufficientItemQuantity()
        : GameRuleException.itemNotOwned();
}
