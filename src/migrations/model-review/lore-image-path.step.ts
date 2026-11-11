// UNA TANTUM (Phase 19 D-12): rinomina il campo dell'immagine delle lore — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Lore } from 'src/models/lore.model';
import type {
    ModelReviewStep,
    ModelReviewStepReport,
} from './model-review.step';

// guardia di idempotenza: il campo vecchio presente (anche nullo) e quello nuovo assente
const WITH_OLD_IMAGE_ONLY = {
    image: { $exists: true },
    imagePath: { $exists: false },
};

// anomalia: entrambi i campi presenti; il passo non sceglie quale valore vince
const WITH_BOTH_FIELDS = {
    image: { $exists: true },
    imagePath: { $exists: true },
};

const RENAME_IMAGE = { $rename: { image: 'imagePath' } };

@Injectable()
export class LoreImagePathStep implements ModelReviewStep {
    readonly label = 'immagini delle lore';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello gli operatori sui path fuori schema non partono; la collection viene dal modello (si chiama `lore`)
        const lore = this.connection.model(Lore.name).collection;
        const found = await lore.countDocuments({});
        const { modifiedCount: migrated } = await lore.updateMany(
            WITH_OLD_IMAGE_ONLY,
            RENAME_IMAGE,
        );
        const unmatched = await lore.countDocuments(WITH_BOTH_FIELDS);
        return {
            found,
            migrated,
            alreadyDone: found - migrated - unmatched,
            unmatched,
        };
    }
}
