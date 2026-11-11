// UNA TANTUM (Phase 19 D-12): sposta le due liste di debolezze dei nemici nel sotto-documento `weaknesses` — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import { DamageType } from 'src/models/enums/damage-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';
import type {
    ModelReviewStep,
    ModelReviewStepReport,
} from './model-review.step';

// guardia di idempotenza: chi ha già il sotto-documento non si tocca
const NOT_MIGRATED = { weaknesses: { $exists: false } };

// lista assente o nulla = vuota; i due campi vecchi escono nella stessa scrittura
const MOVE_INTO_SUB_DOCUMENT = [
    {
        $set: {
            weaknesses: {
                base: { $ifNull: ['$baseWeaknesses', []] },
                energy: { $ifNull: ['$energyWeaknesses', []] },
            },
        },
    },
    { $unset: ['baseWeaknesses', 'energyWeaknesses'] },
];

// un valore fuori enum annullerebbe il nemico sul filo: si conta, non si corregge
const OUTSIDE_THE_ENUMS = {
    $or: [
        {
            'weaknesses.base': {
                $elemMatch: { $nin: Object.values(DamageType) },
            },
        },
        {
            'weaknesses.energy': {
                $elemMatch: { $nin: Object.values(EnergyType) },
            },
        },
    ],
};

@Injectable()
export class EnemyWeaknessesStep implements ModelReviewStep {
    readonly label = 'debolezze dei nemici';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello gli operatori sui path fuori schema non partono
        const enemies = this.connection.model(Enemy.name).collection;
        const found = await enemies.countDocuments({});
        const { modifiedCount: migrated } = await enemies.updateMany(
            NOT_MIGRATED,
            MOVE_INTO_SUB_DOCUMENT,
        );
        const unmatched = await enemies.countDocuments(OUTSIDE_THE_ENUMS);
        return { found, migrated, alreadyDone: found - migrated, unmatched };
    }
}
