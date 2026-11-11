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
const NEW_FIELD = 'assets.wornEquipment';
const OLD_SLOT = `${OLD_FIELD}.foots`;

// guardia di idempotenza: il campo vecchio presente e quello nuovo assente; sparito il campo, la seconda corsa non trova nulla
const WITH_OLD_FIELD_ONLY = {
    [OLD_FIELD]: { $exists: true },
    [NEW_FIELD]: { $exists: false },
};

// anomalia: entrambi i campi presenti (il codice nuovo ha già equipaggiato); la rinomina sovrascriverebbe, quindi il passo non sceglie
const WITH_BOTH_FIELDS = {
    [OLD_FIELD]: { $exists: true },
    [NEW_FIELD]: { $exists: true },
};

// lo slot si rinomina DENTRO il campo vecchio: le due rinomine nella stessa scrittura confliggono
const RENAME_SLOT = { $rename: { [OLD_SLOT]: `${OLD_FIELD}.feet` } };

const RENAME_FIELD = { $rename: { [OLD_FIELD]: NEW_FIELD } };

@Injectable()
export class WornEquipmentStep implements ModelReviewStep {
    readonly label = 'equipaggiamento indossato';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo e nessun filtro sugli archiviati: via modello gli operatori sui path fuori schema non partono
        const characters = this.connection.model(Character.name).collection;
        const found = await characters.countDocuments({});
        await characters.updateMany(
            { ...WITH_OLD_FIELD_ONLY, [OLD_SLOT]: { $exists: true } },
            RENAME_SLOT,
        );
        const { modifiedCount: migrated } = await characters.updateMany(
            WITH_OLD_FIELD_ONLY,
            RENAME_FIELD,
        );
        const unmatched = await characters.countDocuments(WITH_BOTH_FIELDS);
        return {
            found,
            migrated,
            alreadyDone: found - migrated - unmatched,
            unmatched,
        };
    }
}
