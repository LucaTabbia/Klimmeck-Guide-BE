import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Logger, Inject, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
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
import { EquipSpellRequest } from 'src/models/request/equip-spell-request.model';
import { UseSpellRequest } from 'src/models/request/use-spell-request.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { ActiveSpell } from 'src/models/common/active-spell.model';
import { SpellRecoveryJobData } from './spell-recovery.processor';

@Injectable()
export class CharactersService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CharactersService.name);
    private changeStream: ReturnType<typeof Model.prototype.watch>;

    constructor(
        @InjectModel(Character.name) private characterModel: Model<CharacterDocument>,
        @InjectModel(Spell.name) private spellModel: Model<SpellDocument>,
        @InjectQueue('spell-recovery') private spellRecoveryQueue: Queue<SpellRecoveryJobData>,
        @Inject('PUB_SUB') private pubSub: PubSub
    ) { }

    getPubSub(): PubSub {
        return this.pubSub;
    }


    async onModuleInit() {
        const pipeline = [{ $match: { operationType: { $in: ['update', 'replace'] } } }];

        this.changeStream = this.characterModel.watch(pipeline, {
            fullDocument: 'updateLookup',
        });

        this.changeStream.on('change', async (change) => {
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

        this.changeStream.on('error', (err) => {
            this.logger.error('Errore nel change stream MongoDB', err);
        });
    }

    async onModuleDestroy() {
        if (this.changeStream) {
            await this.changeStream.close();
            this.logger.log('Change stream chiuso correttamente');
        }
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
                path: 'status.spells',
                model: 'Spell',
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

        const activeSpellMap = new Map<string, number>();
        character.assets.activeSpells.forEach(a => {
            if (a.spell instanceof Types.ObjectId) {
                activeSpellMap.set(a.spell.toString(), a.usages);
            }
        });

        const activeSpells: ActiveSpell[] = [];

        character.status.spells.forEach(spell => {
            const usages = activeSpellMap.get(spell.id);
            if (usages !== undefined) {
                activeSpells.push({ spell, usages });
            }
        });

        character.assets.activeSpells = activeSpells;

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

    async equipSpell(request: EquipSpellRequest): Promise<CommonResponse> {
        const character = await this.characterModel.findById(request.id).exec();
        if (!character) {
            throw new NotFoundException(`Character with id ${request.id} not found`);
        }

        const knownSpellIds = character.status.spells.map(s => 
            s instanceof Types.ObjectId ? s.toString() : s.id?.toString()
        );
        if (!knownSpellIds.includes(request.spellId)) {
            throw new BadRequestException(`Spell ${request.spellId} is not known by character ${request.id}`);
        }

        const isAlreadyActive = character.assets.activeSpells.some(
            a => a.spell?.toString() === request.spellId
        );
        if (isAlreadyActive) {
            throw new BadRequestException(`Spell ${request.spellId} is already active`);
        }

        if (character.status.maxActiveSpells <= character.assets.activeSpells.length) {
            throw new BadRequestException(`Character ${request.id} has reached the maximum number of active spells`);
        }

        const usages = request.usages ?? 0;
        character.assets.activeSpells = [
            ...character.assets.activeSpells, 
            { spell: new Types.ObjectId(request.spellId), usages }
        ];

        await character.save();
        return {
            response: 'Magia equipaggiata con successo',
            successful: true,
        };
    }

    async unequipSpell(request: EquipSpellRequest): Promise<CommonResponse> {
        const character = await this.characterModel.findById(request.id).exec();
        if (!character) {
            throw new NotFoundException(`Character with id ${request.id} not found`);
        }

        const activeSpellIndex = character.assets.activeSpells.findIndex(
            a => a.spell?.toString() === request.spellId
        );
        if (activeSpellIndex === -1) {
            throw new NotFoundException(`Spell ${request.spellId} is not active for character ${request.id}`);
        }

        character.assets.activeSpells.splice(activeSpellIndex, 1);

        await character.save();
        return {
            response: 'Magia disequipaggiata con successo',
            successful: true,
        };
    }

    async useSpell(request: UseSpellRequest): Promise<CommonResponse> {
        const character = await this.characterModel.findById(request.characterId).exec();
        if (!character) {
            throw new NotFoundException(`Character with id ${request.characterId} not found`);
        }

        const activeSpell = character.assets.activeSpells.find(
            a => a.spell?.toString() === request.spellId
        );
        if (!activeSpell) {
            throw new BadRequestException(`Spell ${request.spellId} is not active for character ${request.characterId}`);
        }

        if (activeSpell.usages <= 0) {
            throw new BadRequestException(`Spell ${request.spellId} has no usages left`);
        }

        const spell = await this.spellModel.findById(request.spellId).exec();
        if (!spell) {
            throw new NotFoundException(`Spell ${request.spellId} not found`);
        }

        activeSpell.usages -= 1;
        await character.save();

        const jobId = `${request.characterId}-${request.spellId}-${Date.now()}`;
        await this.spellRecoveryQueue.add(
            'recover',
            {
                characterId: request.characterId,
                spellId: request.spellId,
            },
            {
                delay: spell.recoveryTime,
                jobId,
                removeOnComplete: true,
                removeOnFail: false,
            }
        );

        this.logger.log(`Spell ${request.spellId} used by character ${request.characterId}. Recovery scheduled in ${spell.recoveryTime}ms`);

        return {
            response: 'Magia utilizzata con successo',
            successful: true,
        };
    }
}
