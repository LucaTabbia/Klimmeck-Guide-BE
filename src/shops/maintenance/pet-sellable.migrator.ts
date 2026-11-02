import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Pet, PetDocument } from 'src/models/pet.model';
import { SELLABLE_PET_IDS } from '../shop-pool.constants';

export interface PetSellableReport {
    sellable: number;
    questOnly: number;
}

// la mano vince anche qui: si scrive solo dove sellable manca o è null (D-16)
const UNSET_SELLABLE = { sellable: { $nin: [true, false] } };

// nessun hook di boot proprio: lo chiama l'orchestratore della semina (D-24)
@Injectable()
export class PetSellableMigrator {
    private readonly logger = new Logger(PetSellableMigrator.name);

    constructor(
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    ) {}

    async migrate(): Promise<PetSellableReport> {
        const shopPets = SELLABLE_PET_IDS.map((id) => new Types.ObjectId(id));
        const sellable = await this.petModel
            .updateMany(
                { ...UNSET_SELLABLE, _id: { $in: shopPets } },
                { $set: { sellable: true } },
            )
            .exec();
        const questOnly = await this.petModel
            .updateMany(
                { ...UNSET_SELLABLE, _id: { $nin: shopPets } },
                { $set: { sellable: false } },
            )
            .exec();
        const report = {
            sellable: sellable.modifiedCount,
            questOnly: questOnly.modifiedCount,
        };
        if (report.sellable + report.questOnly > 0)
            this.logger.log(
                `Compagni: ${report.sellable} in vendita e ${report.questOnly} solo da quest valorizzati`,
            );
        return report;
    }
}
