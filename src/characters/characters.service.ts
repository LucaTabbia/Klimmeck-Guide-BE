import { Injectable, NotFoundException, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PubSub } from 'graphql-subscriptions';
import { Character, CharacterDocument } from 'src/models/character/character.model';
import { Equipment } from 'src/models/common/equipment.model';
import { AssetQuantity, AssetQuantityInput, ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { CommonResponse } from 'src/models/common/common-response.model';
import { normalizeCoins } from 'src/utils';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { SlotType } from 'src/models/enums/slot_type.enum';

@Injectable()
export class CharactersService implements OnModuleInit {
    private readonly logger = new Logger(CharactersService.name);

    constructor(
        @InjectModel(Character.name) private characterModel: Model<CharacterDocument>,
        @Inject('PUB_SUB') private pubSub: PubSub
    ) { }

    getPubSub(): PubSub {
        return this.pubSub;
    }


    async onModuleInit() {
        const pipeline = [{ $match: { operationType: { $in: ['update', 'replace'] } } }];

        const changeStream = this.characterModel.watch(pipeline, {
            fullDocument: 'updateLookup',
        });

        changeStream.on('change', async (change) => {
            try {
                if (change.fullDocument) {
                    const id = change.fullDocument._id;

                    const character = await this.findOne(id)
                    await this.pubSub.publish('characterUpdated', {
                        characterUpdated: character,
                    });
                }
            } catch (err) {
                this.logger.error('Errore nel change stream', err);
            }
        });
    }

    async findAll(): Promise<Character[]> {
        return this.characterModel.find().exec();
    }

    async findOne(id: string): Promise<Character> {
        const character = await this.characterModel
            .findById(id)
            .populate({
                path: 'assets.ownedEquipments.item',
                model: 'EquipmentItem',
                populate: { path: 'addedSpell' },
            })
            .populate({
                path: 'status.location',
            })
            .populate({
                path: 'assets.ownedItems.item',
                model: 'LootItem',
            })
            .exec();

        if (!character) {
            throw new NotFoundException(`Character with id ${id} not found`);
        }

        const ownedEquipmentsMap = new Map<string, EquipmentItem>();

        character.assets.ownedEquipments.forEach(assetQuantity => {
            const item = assetQuantity.item as EquipmentItem;
            if (item && item.id) {
                ownedEquipmentsMap.set(item.id.toString(), item);
            }
        });

        const wearedEquipment = character.assets.wearedEquipment;

        Object.values(SlotType).forEach(slot => {
            const itemId = wearedEquipment[slot];

            if (itemId instanceof Types.ObjectId) {
                const populatedItem = ownedEquipmentsMap.get(itemId.toHexString());
                if (populatedItem) {
                    wearedEquipment[slot] = populatedItem;
                } else {
                    wearedEquipment[slot] = null;
                }
            }
        });

        return character;
    }

    async getEquipment(id: string): Promise<Equipment> {

        let query = this.characterModel.findById(id);
        for (const slot of Object.values(SlotType)) {
            query = query.populate(`assets.wearedEquipment.${slot}`);
        }
        const character = await query.exec();

        if (!character) {
            throw new NotFoundException(`Character with id ${id} not found`);
        }
        return character.assets.wearedEquipment;
    }

    async doTransaction(request: TransactionRequest): Promise<CommonResponse> {
        const character = await this.characterModel.findById(request.id);
        if (!character) throw new NotFoundException(`Character with id ${request.id} not found`);

        const coinSign = request.isTotalPositive ? 1 : -1;
        character.status.coins.gold += coinSign * request.total.gold;
        character.status.coins.silver += coinSign * request.total.silver;
        character.status.coins.copper += coinSign * request.total.copper;

        normalizeCoins(character.status.coins);
        character.markModified('status.coins');

        const updateAssets = (
            targetArray: AssetQuantity[],
            items: AssetQuantityInput[],
            isAdding: boolean,
            itemType: ItemReferenceType,
        ) => {
            for (const item of items) {
                const existing = targetArray.find((a) => a.item.toString() === item.item);
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

        updateAssets(character.assets.ownedItems, request.boughtItems.lootAssets, true, 'LootItem');
        updateAssets(character.assets.ownedEquipments, request.boughtItems.equipAssets, true, 'EquipmentItem');
        updateAssets(character.assets.ownedItems, request.soldItems.lootAssets, false, 'LootItem');
        updateAssets(character.assets.ownedEquipments, request.soldItems.equipAssets, false, 'EquipmentItem');

        await character.save();
        return {
            response: 'Transazione avvenuta con successo',
            successful: true,
        };
    }

    async equipItem(request: EquipItemRequest): Promise<CommonResponse> {
        const character = await this.characterModel.findById(request.id);
        if (!character) throw new NotFoundException(`Character with id ${request.id} not found`);
        const slot = request.slotType as keyof Equipment;
        character.assets.wearedEquipment[slot] = request.itemId != null ? new Types.ObjectId(request.itemId) : null;
        await character.save();
        return {
            response: 'Equipaggiamento cambiato con successo',
            successful: true,
        };
    }
}
