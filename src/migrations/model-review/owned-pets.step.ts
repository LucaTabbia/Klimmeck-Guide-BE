// UNA TANTUM (Phase 19 D-12): trasforma i riferimenti ai pet posseduti dei personaggi in voci con stato — esce dal repo dopo il boot reale
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Types } from 'mongoose';
import { newOwnedPetEntry } from 'src/characters/pets/owned-pet-entry';
import { Character } from 'src/models/character/character.model';
import { Pet } from 'src/models/pet.model';
import { refIdOf } from 'src/mongo/document-id';
import {
    type ModelReviewStep,
    type ModelReviewStepReport,
    writeNotAppliedLine,
} from './model-review.step';

export interface OwnedPetsMigration {
    // voci nuove al posto dei riferimenti; ogni altro elemento resta com'è, nello stesso ordine
    entries: unknown[];
    // riferimenti diventati voci
    converted: number;
    // di cui senza pet a catalogo (vita 0)
    orphans: number;
}

// guardia di idempotenza: almeno un elemento non ancora voce (ObjectId o esadecimale legacy); nessun filtro sugli archiviati
const WITH_BARE_REFERENCES = {
    'assets.ownedPets': { $elemMatch: { $type: ['objectId', 'string'] } },
};

const LABEL = 'pet posseduti';

export function ownedPetEntriesOf(
    owned: readonly unknown[],
    lifePointsOf: ReadonlyMap<string, unknown>,
): OwnedPetsMigration {
    let converted = 0;
    let orphans = 0;
    const entries = owned.map((element) => {
        const petId = refIdOf(element);
        if (!petId) return element;
        const hex = petId.toHexString();
        converted += 1;
        if (!lifePointsOf.has(hex)) orphans += 1;
        return newOwnedPetEntry(petId, lifePointsOf.get(hex));
    });
    return { entries, converted, orphans };
}

@Injectable()
export class OwnedPetsStep implements ModelReviewStep {
    readonly label = LABEL;

    private readonly logger = new Logger(OwnedPetsStep.name);

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello i riferimenti nudi verrebbero letti col cast dello schema delle voci
        const characters = this.connection.model(Character.name).collection;
        const lifePointsOf = await this.readCatalogLifePoints();
        const found = await characters.countDocuments({});
        const withReferences = await characters
            .find<{
                _id: Types.ObjectId;
                assets: { ownedPets: unknown[] };
            }>(WITH_BARE_REFERENCES, { projection: { 'assets.ownedPets': 1 } })
            .toArray();

        let migrated = 0;
        let notApplied = 0;
        let unmatched = 0;
        for (const character of withReferences) {
            const owned = character.assets.ownedPets;
            const migration = ownedPetEntriesOf(owned, lifePointsOf);
            // una stringa che non è un id fa scattare la guardia ma non si converte: nessuna scrittura
            if (migration.converted === 0) continue;
            // la lista letta sta nel filtro (e porta con sé la guardia): una scrittura caduta nel mezzo non viene sovrascritta
            const { matchedCount } = await characters.updateOne(
                { _id: character._id, 'assets.ownedPets': owned },
                { $set: { 'assets.ownedPets': migration.entries } },
            );
            if (matchedCount === 0) {
                notApplied += 1;
                this.logger.warn(
                    writeNotAppliedLine(
                        LABEL,
                        'personaggio',
                        character._id.toHexString(),
                    ),
                );
                continue;
            }
            migrated += 1;
            unmatched += migration.orphans;
        }
        return {
            found,
            migrated,
            alreadyDone: found - migrated - notApplied,
            unmatched: unmatched + notApplied,
        };
    }

    private async readCatalogLifePoints(): Promise<Map<string, unknown>> {
        const pets = await this.connection
            .model(Pet.name)
            .collection.find<{
                _id: Types.ObjectId;
                maxLifePoints?: unknown;
            }>({}, { projection: { maxLifePoints: 1 } })
            .toArray();
        return new Map(
            pets.map((pet) => [pet._id.toHexString(), pet.maxLifePoints]),
        );
    }
}
