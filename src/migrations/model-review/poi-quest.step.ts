// UNA TANTUM (Phase 19 D-12): toglie dai POI il back-link morto verso una quest — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import type {
    ModelReviewStep,
    ModelReviewStepReport,
} from './model-review.step';

// guardia di idempotenza: il campo presente, anche nullo
const WITH_BACK_LINK = { quest: { $exists: true } };

const DROP_BACK_LINK = { $unset: { quest: '' } };

@Injectable()
export class PoiQuestStep implements ModelReviewStep {
    readonly label = 'back-link dei POI';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello gli operatori sui path fuori schema non partono
        const pointsOfInterest = this.connection.model(
            PointOfInterest.name,
        ).collection;
        const found = await pointsOfInterest.countDocuments({});
        const { modifiedCount: migrated } = await pointsOfInterest.updateMany(
            WITH_BACK_LINK,
            DROP_BACK_LINK,
        );
        return { found, migrated, alreadyDone: found - migrated, unmatched: 0 };
    }
}
