import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { idForms, refIdOf } from 'src/mongo/document-id';

export interface OwnedPetsReport {
    owned: number;
}

interface EquippedPetCharacter {
    _id: Types.ObjectId;
    assets?: { pet?: unknown };
}

// il compagno equipaggiato è sempre anche posseduto (D-13, D-16); pochi personaggi: un ciclo leggibile
// nessun hook di boot proprio: lo chiama l'orchestratore della semina dopo PetSellableMigrator (D-24)
@Injectable()
export class OwnedPetsMigrator {
    private readonly logger = new Logger(OwnedPetsMigrator.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
    ) {}

    async migrate(): Promise<OwnedPetsReport> {
        const characters = await this.characterModel.collection
            .find(
                { 'assets.pet': { $ne: null } },
                { projection: { 'assets.pet': 1 } },
            )
            .toArray();
        let owned = 0;
        for (const { _id, assets } of characters as EquippedPetCharacter[]) {
            const petId = refIdOf(assets?.pet);
            if (!petId) continue;
            // collection grezza: le due forme dell'id restano nel filtro senza cast (idForms)
            const written = await this.characterModel.collection.updateOne(
                { _id, 'assets.ownedPets': { $nin: idForms(petId) } },
                // il driver tipizza il push su Document senza array noti: il cast resta sul solo update
                { $push: { 'assets.ownedPets': petId } } as never,
            );
            owned += written.modifiedCount;
        }
        if (owned > 0)
            this.logger.log(
                `Compagni: ${owned} personaggi ricevono il compagno equipaggiato fra i posseduti`,
            );
        return { owned };
    }
}
