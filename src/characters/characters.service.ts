import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Character, CharacterDocument } from 'src/models/character/character.model';
import { TransactionInput } from 'src/models/common/transaction-input.model';
import { Equipment } from 'src/models/common/equipment.model';
import { AssetQuantity, AssetQuantityInput, ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { TransactionResponse } from 'src/models/common/transaction-response.model';
import { normalizeCoins } from 'src/utils';

@Injectable()
export class CharactersService {
    constructor(
        @InjectModel(Character.name) private characterModel: Model<CharacterDocument>) { }

    async findAll(): Promise<Character[]> {
        return await this.characterModel.find().exec();
    }

    async findOne(id: string): Promise<Character> {
        const character = await this.characterModel.findById(id).populate({
            path: 'assets.ownedEquipments.item',
            model: 'EquipmentItem',
            populate: {
                path: 'addedSpell',
            },
        })
            .populate({
                path: 'assets.ownedItems.item',
                model: 'LootItem',
            }).exec();
        if (!character) throw new NotFoundException(`Character with id ${id} not found`);
        return character;
    }

    async getEquipment(id: string): Promise<Equipment> {
        const slots = [
            'head', 'chest', 'legs', 'arms',
            'leftHand', 'rightHand', 'firstAccessory', 'secondAccessory', 'foots'
        ];

        let query = this.characterModel.findById(id);
        for (const slot of slots) {
            query = query.populate(`assets.wearedEquipment.${slot}`);
        }
        const character = await query.exec();

        if (!character) {
            throw new NotFoundException(`Character with id ${id} not found`);
        }
        return character.assets.wearedEquipment;
    }

    async doTransaction(input: TransactionInput): Promise<TransactionResponse> {
        const character = await this.characterModel.findById(input.id);
        if (!character) throw new NotFoundException(`Character with id ${input.id} not found`);

        const coinSign = input.isTotalPositive ? 1 : -1;
        character.status.coins.gold += coinSign * input.total.gold;
        character.status.coins.silver += coinSign * input.total.silver;
        character.status.coins.copper += coinSign * input.total.copper;

        normalizeCoins(character.status.coins);

        character.markModified('status.coins');

        const updateAssets = (targetArray: AssetQuantity[], items: AssetQuantityInput[], isAdding: boolean, itemType: ItemReferenceType) => {
            for (const item of items) {
                const existing = targetArray.find(a => a.item.toString() === item.item);
                if (existing) {
                    existing.quantity += isAdding ? item.quantity : -item.quantity;
                    if (existing.quantity <= 0) {
                        const index = targetArray.indexOf(existing);
                        targetArray.splice(index, 1);
                    }
                } else if (isAdding) {
                    targetArray.push({
                        itemType,
                        item: new Types.ObjectId(item.item!),
                        quantity: item.quantity,
                    } as unknown as AssetQuantity);
                }
            }
        };

        updateAssets(character.assets.ownedItems, input.boughtItems.lootAssets, true, 'LootItem');
        updateAssets(character.assets.ownedEquipments, input.boughtItems.equipAssets, true, 'EquipmentItem');

        updateAssets(character.assets.ownedItems, input.soldItems.lootAssets, false, 'LootItem');
        updateAssets(character.assets.ownedEquipments, input.soldItems.equipAssets, false, 'EquipmentItem');

        await character.save();
        return {
            response: "Transazione avvenuta con successo",
            successful: true
        }
    }
}
