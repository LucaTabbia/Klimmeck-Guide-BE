import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pet, PetDocument } from 'src/models/pet.model';
import { describeError } from 'src/mongo/mongo-errors';
import { petRecoveryTimeOf } from './companion-life';

// la tabella dei tempi vive solo a DB (D-25): al boot si dice quanti pet mancano, mai quali
@Injectable()
export class PetRecoveryCatalogReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger('PetRecovery');

    constructor(
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    ) {}

    async countUncurated(): Promise<number> {
        const pets = await this.petModel
            .find({}, { recoveryTime: 1 })
            .lean()
            .exec();
        return pets.filter(
            (pet) => petRecoveryTimeOf(pet.recoveryTime) === null,
        ).length;
    }

    async onApplicationBootstrap(): Promise<void> {
        try {
            const count = await this.countUncurated();
            if (count === 0) return;
            this.logger.warn(
                `Pet senza tempo di recupero: ${count} (recupero istantaneo finché non vengono curati a DB)`,
            );
        } catch (error) {
            this.logger.error(
                `Lettura dei tempi di recupero dei pet fallita: ${describeError(error)}`,
            );
        }
    }
}
