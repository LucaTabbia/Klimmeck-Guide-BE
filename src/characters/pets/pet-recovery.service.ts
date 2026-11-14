import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms } from 'src/mongo/document-id';
import { petRecovered } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
import { companionDisplayName } from './companion-life';
import type { OwnedPetEntry } from './owned-pet-entry';
import {
    type DuePetRecovery,
    duePetsOf,
    petRecoveryClaim,
} from './pet-recovery';

interface OwnedPetsSnapshot {
    assets?: { ownedPets?: readonly OwnedPetEntry[] | null } | null;
}

interface SpeciesName {
    _id: Types.ObjectId;
    name?: unknown;
}

// push «in forze» (D-11, D-24): solo il claim che azzera il marcatore di una voce notifica, una push per sconfitta
@Injectable()
export class PetRecoveryService {
    private readonly logger = new Logger(PetRecoveryService.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly push: PushService,
        private readonly clock: Clock,
    ) {}

    // ogni claim è un update condizionale indipendente, nessuna transazione: le push partono dopo le scritture.
    // Proprietario e specie si leggono PRIMA dei claim: una lettura fallita lascia il marcatore e lo sweep seguente riprova
    async release(characterId: Types.ObjectId): Promise<Types.ObjectId[]> {
        const now = this.clock.now();
        const character = await this.characterModel
            .findOne(
                { _id: characterId, ...ACTIVE_CHARACTER_FILTER },
                { 'assets.ownedPets': 1 },
            )
            .lean<OwnedPetsSnapshot | null>()
            .exec();
        const due = duePetsOf(character?.assets?.ownedPets, now);
        if (due.length === 0) return [];
        const ownerId = await this.ownerIdOf(characterId);
        const species = await this.speciesNamesOf(due);
        const claimed: DuePetRecovery[] = [];
        for (const recovery of due) {
            if (await this.claim(characterId, recovery.petId, now))
                claimed.push(recovery);
        }
        if (claimed.length === 0) return [];
        this.logger.log(
            `Personaggio ${characterId.toHexString()}: ${claimed.length} compagni di nuovo in forze`,
        );
        if (ownerId) await this.notifyOwner(ownerId, claimed, species);
        return claimed.map(({ petId }) => petId);
    }

    private async claim(
        characterId: Types.ObjectId,
        petId: Types.ObjectId,
        now: Date,
    ): Promise<boolean> {
        const { filter, update, options } = petRecoveryClaim(
            characterId,
            petId,
            now,
        );
        const result = await this.characterModel
            .updateOne(filter, update, options)
            .exec();
        return result.modifiedCount === 1;
    }

    // come la prigione: un personaggio che nessuno gioca più non riceve push
    private async ownerIdOf(
        characterId: Types.ObjectId,
    ): Promise<Types.ObjectId | null> {
        const owner = await this.userModel
            .findOne(
                { currentCharacter: { $in: idForms(characterId) } },
                { _id: 1 },
            )
            .lean<{ _id: Types.ObjectId } | null>()
            .exec();
        return owner?._id ?? null;
    }

    // best-effort dopo la scrittura: sendToUser inghiotte i propri errori
    private async notifyOwner(
        ownerId: Types.ObjectId,
        claimed: readonly DuePetRecovery[],
        species: ReadonlyMap<string, unknown>,
    ): Promise<void> {
        for (const { petId, name } of claimed) {
            await this.push.sendToUser(
                ownerId,
                petRecovered(
                    petId.toHexString(),
                    companionDisplayName(
                        name,
                        species.get(petId.toHexString()),
                    ),
                ),
            );
        }
    }

    private async speciesNamesOf(
        due: readonly DuePetRecovery[],
    ): Promise<Map<string, unknown>> {
        const pets = await this.petModel
            .find({ _id: { $in: due.map(({ petId }) => petId) } }, { name: 1 })
            .lean<SpeciesName[]>()
            .exec();
        return new Map(pets.map((pet) => [pet._id.toHexString(), pet.name]));
    }
}
