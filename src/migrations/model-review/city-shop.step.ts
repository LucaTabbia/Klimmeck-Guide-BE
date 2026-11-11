// UNA TANTUM (Phase 19 D-12): sposta i tre campi del pool dei negozi dentro il sotto-documento della città — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { City } from 'src/models/city.model';
import type {
    ModelReviewStep,
    ModelReviewStepReport,
} from './model-review.step';

// guardia di idempotenza: almeno uno dei tre campi vecchi presente, anche vuoto
const WITH_LOOSE_POOL = {
    $or: [
        { shopEquipment: { $exists: true } },
        { shopLoot: { $exists: true } },
        { shopPets: { $exists: true } },
    ],
};

// sola rinomina: le liste restano tali e quali (la mano vince), un campo assente non crea nulla
const MOVE_POOL_UNDER_SHOP = {
    $rename: {
        shopEquipment: 'shop.equipment',
        shopLoot: 'shop.loot',
        shopPets: 'shop.pets',
    },
};

@Injectable()
export class CityShopStep implements ModelReviewStep {
    readonly label = 'pool dei negozi';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello gli operatori sui path fuori schema non partono
        const cities = this.connection.model(City.name).collection;
        const found = await cities.countDocuments({});
        const { modifiedCount: migrated } = await cities.updateMany(
            WITH_LOOSE_POOL,
            MOVE_POOL_UNDER_SHOP,
        );
        return { found, migrated, alreadyDone: found - migrated, unmatched: 0 };
    }
}
