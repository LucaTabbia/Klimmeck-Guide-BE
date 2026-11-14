import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    ITEM_USE_CATALOG_PROJECTION,
    ITEM_USE_CHARACTER_PROJECTION,
    type ItemUseCatalogSnapshot,
    type ItemUseCharacterSnapshot,
    type ItemUseOutcome,
    type ItemUsePlan,
    type ItemUsePlanInput,
    PET_POTION_CATALOG_PROJECTION,
    planItemUse,
    planPetPotion,
} from 'src/characters/items/item-use.plan';
import type { PetCatalogFacts } from 'src/characters/pets/equip-pet.plan';
import type { UseItemResult } from 'src/characters/items/use-item-result.model';
import { MissionLockReader } from 'src/characters/mission-lock/mission-lock.reader';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Lore, LoreDocument } from 'src/models/lore.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { User, UserDocument } from 'src/models/user.model';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';

interface LinkedUser {
    currentCharacter: unknown;
}

// a chi va la pozione: il personaggio (planItemUse) o un suo compagno (planPetPotion, Phase 23 D-05)
type DrinkPlanner = (input: ItemUsePlanInput) => ItemUsePlan;

// una transazione, snapshot in sessione, una sola scrittura (Phase 18 D-22); nessuna emissione a mano: il change stream riemette characterUpdated
@Injectable()
export class ItemUseService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(LootItem.name)
        private readonly lootItemModel: Model<LootItemDocument>,
        @InjectModel(Lore.name) private readonly loreModel: Model<LoreDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
        private readonly clock: Clock,
        private readonly missionLock: MissionLockReader,
    ) {}

    async useItem(
        userId: string,
        itemId: string,
        petId?: string | null,
    ): Promise<UseItemResult> {
        const characterId = await this.currentCharacterOf(userId);
        const catalogId = new Types.ObjectId(itemId);
        // il catalogo non cambia con la bevuta: letto una volta, l'ordine dei rifiuti lo decide il piano puro
        const item = await this.lootItemModel
            .findById(catalogId, ITEM_USE_CATALOG_PROJECTION)
            .lean<ItemUseCatalogSnapshot | null>()
            .exec();
        const planner = petId ? await this.petPlannerOf(petId) : planItemUse;
        const outcome = await this.connection.transaction((session) =>
            this.drinkWithin(characterId, catalogId, item, session, planner),
        );
        return {
            ...outcome,
            loreUnlocked: await this.loreInOrder(outcome.loreUnlocked),
        };
    }

    // come la pozione, il catalogo del pet si legge una volta fuori dalla transazione (Phase 23 D-05)
    private async petPlannerOf(petId: string): Promise<DrinkPlanner> {
        const catalogPetId = new Types.ObjectId(petId);
        const pet = await this.petModel
            .findById(catalogPetId, PET_POTION_CATALOG_PROJECTION)
            .lean<PetCatalogFacts | null>()
            .exec();
        return (input) => planPetPotion({ ...input, petId: catalogPetId, pet });
    }

    private async currentCharacterOf(userId: string): Promise<Types.ObjectId> {
        const user = await this.userModel
            .findById(objectIdFromHex(userId), { currentCharacter: 1 })
            .lean<LinkedUser | null>()
            .exec();
        const characterId = refIdOf(user?.currentCharacter);
        if (!characterId) throw ResourceNotFoundException.character();
        return characterId;
    }

    // rieseguibile dal driver sui WriteConflict (Pitfall 9): solo snapshot, piano e scrittura
    private async drinkWithin(
        characterId: Types.ObjectId,
        itemId: Types.ObjectId,
        item: ItemUseCatalogSnapshot | null,
        session: ClientSession,
        planner: DrinkPlanner,
    ): Promise<ItemUseOutcome> {
        const snapshot = await this.characterModel
            .findOne(
                activeCharacterById(characterId),
                ITEM_USE_CHARACTER_PROJECTION,
            )
            .session(session)
            .lean<ItemUseCharacterSnapshot | null>()
            .exec();
        if (!snapshot) throw ResourceNotFoundException.character();
        const missionInProgress = await this.missionLock.isLocked(
            characterId,
            session,
        );
        const plan = planner({
            snapshot,
            itemId,
            item,
            now: this.clock.now(),
            missionInProgress,
        });
        const written = await this.characterModel
            .updateOne(plan.filter, plan.update, { session })
            .exec();
        // quasi irraggiungibile dentro la transazione (RESEARCH A3): un codice stabile invece di un esito a metà
        if (written.matchedCount === 0) throw GameRuleException.itemNotOwned();
        return plan.outcome;
    }

    // dopo il commit: le sole lore esistenti, nell'ordine degli id nuovi
    private async loreInOrder(ids: readonly Types.ObjectId[]): Promise<Lore[]> {
        if (ids.length === 0) return [];
        const found = await this.loreModel.find({ _id: { $in: ids } }).exec();
        const byHex = new Map(found.map((lore) => [lore.id as string, lore]));
        return ids.flatMap((id) => byHex.get(id.toHexString()) ?? []);
    }
}
