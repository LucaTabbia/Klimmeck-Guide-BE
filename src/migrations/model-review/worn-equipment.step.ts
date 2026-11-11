// UNA TANTUM (Phase 19 D-12): rinomina l'equipaggiamento indossato e il suo slot dei piedi — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Character } from 'src/models/character/character.model';
import type {
    ModelReviewStep,
    ModelReviewStepReport,
} from './model-review.step';

const OLD_FIELD = 'assets.wearedEquipment';
const OLD_SLOT = `${OLD_FIELD}.foots`;

// lo slot si rinomina DENTRO il campo vecchio: le due rinomine nella stessa scrittura confliggono
const RENAME_SLOT = { $rename: { [OLD_SLOT]: `${OLD_FIELD}.feet` } };

const RENAME_FIELD = { $rename: { [OLD_FIELD]: 'assets.wornEquipment' } };

@Injectable()
export class WornEquipmentStep implements ModelReviewStep {
    readonly label = 'equipaggiamento indossato';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo e nessun filtro sugli archiviati: via modello gli operatori sui path fuori schema non partono
        const characters = this.connection.model(Character.name).collection;
        const found = await characters.countDocuments({});
        await characters.updateMany(
            { [OLD_SLOT]: { $exists: true } },
            RENAME_SLOT,
        );
        // guardia di idempotenza: il campo vecchio presente; sparito il campo, la seconda corsa non trova nulla
        const { modifiedCount: migrated } = await characters.updateMany(
            { [OLD_FIELD]: { $exists: true } },
            RENAME_FIELD,
        );
        return { found, migrated, alreadyDone: found - migrated, unmatched: 0 };
    }
}
