// UNA TANTUM (Phase 12 D-25): semina Enemy.legendary al primo boot reale e poi esce dal repo; da lì cura a DB (D-04, D-36)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';

export interface EnemyLegendaryReport {
    legendary: number;
    ordinary: number;
}

// i 22 leggendari del handoff Phase 11 §4, riservati alle worldMission
export const LEGENDARY_ENEMY_IDS = [
    '6ae80b5b2e7351b494ecc869', // Tarrasque
    '6ae80b5b2e7351b494ecc86a', // Kraken
    '6ae80b5b2e7351b494ecc86b', // Artropal
    '6ae80b5b2e7351b494ecc86c', // Goristro
    '6ae80b5b2e7351b494ecc86d', // Dracolich adulto
    '6ae80b5b2e7351b494ecc86e', // Drago d'ombra adulto
    '6ae80b5b2e7351b494ecc86f', // Drago d'ombra anziano
    '6ae80b5b2e7351b494ecc870', // Drago rosso adulto
    '6ae80b5b2e7351b494ecc871', // Drago blu adulto
    '6ae80b5b2e7351b494ecc872', // Drago d'argento adulto
    '6ae80b5b2e7351b494ecc873', // Drago di rame adulto
    '6ae80b5b2e7351b494ecc874', // Drago rosso antico
    '6ae80b5b2e7351b494ecc875', // Drago blu antico
    '6ae80b5b2e7351b494ecc876', // Drago d'argento antico
    '6ae80b5b2e7351b494ecc877', // Drago di rame antico
    '6ae80b5b2e7351b494ecc878', // Urvinass il non-morto
    '6ae80b5b2e7351b494ecc879', // Lung Wang adulto
    '6ae80b5b2e7351b494ecc87a', // Lung Wang anziano
    '6ae80b5b2e7351b494ecc87b', // Golem di ferro
    '6ae80b5b2e7351b494ecc87c', // Lich
    '6ae80b5b2e7351b494ecc87d', // Demilich
    '6ae80b5b2e7351b494ecc87e', // Orgeal il Re lich
] as const;

// la mano vince: si scrive solo dove il flag manca o è null
const UNSET_LEGENDARY = { legendary: { $nin: [true, false] } };

// nessun hook di boot proprio: lo chiama QuestMaintenanceBoot dopo i nemici delle missioni
@Injectable()
export class EnemyLegendaryMigrator {
    private readonly logger = new Logger(EnemyLegendaryMigrator.name);

    constructor(
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
    ) {}

    async migrate(): Promise<EnemyLegendaryReport> {
        const legendaryIds = LEGENDARY_ENEMY_IDS.map(
            (hex) => new Types.ObjectId(hex),
        );
        const legendary = await this.enemyModel
            .updateMany(
                { ...UNSET_LEGENDARY, _id: { $in: legendaryIds } },
                { $set: { legendary: true } },
            )
            .exec();
        const ordinary = await this.enemyModel
            .updateMany(
                { ...UNSET_LEGENDARY, _id: { $nin: legendaryIds } },
                { $set: { legendary: false } },
            )
            .exec();
        const report = {
            legendary: legendary.modifiedCount,
            ordinary: ordinary.modifiedCount,
        };
        if (report.legendary + report.ordinary > 0)
            this.logger.log(
                `Nemici: ${report.legendary} leggendari e ${report.ordinary} ordinari marcati`,
            );
        return report;
    }
}
