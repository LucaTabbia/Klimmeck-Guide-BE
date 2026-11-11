// UNA TANTUM (Phase 19 D-12): porta i danni dei pet a catalogo in `attack`, crea `defense` vuota dove manca e toglie lo stato dal catalogo — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Pet } from 'src/models/pet.model';
import type {
    ModelReviewStep,
    ModelReviewStepReport,
} from './model-review.step';

const OLD_FIELDS = ['damages', 'xp', 'currentLifePoints'];

// guardia di idempotenza: entra solo chi porta ancora almeno uno dei campi vecchi
const NOT_MIGRATED = {
    $or: OLD_FIELDS.map((field) => ({ [field]: { $exists: true } })),
};

const EMPTY_DAMAGES = { $literal: { base: [], energy: [] } };

// la mano vince: un ramo già scritto resta com'è; i campi vecchi escono nella stessa scrittura
const SPLIT_THE_DAMAGES = [
    {
        $set: {
            attack: {
                $ifNull: ['$attack', { $ifNull: ['$damages', EMPTY_DAMAGES] }],
            },
            defense: { $ifNull: ['$defense', EMPTY_DAMAGES] },
        },
    },
    { $unset: OLD_FIELDS },
];

@Injectable()
export class PetCatalogStep implements ModelReviewStep {
    readonly label = 'catalogo dei pet';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello gli operatori sui path fuori schema non partono
        const pets = this.connection.model(Pet.name).collection;
        const found = await pets.countDocuments({});
        const { modifiedCount: migrated } = await pets.updateMany(
            NOT_MIGRATED,
            SPLIT_THE_DAMAGES,
        );
        return {
            found,
            migrated,
            alreadyDone: found - migrated,
            unmatched: 0,
        };
    }
}
