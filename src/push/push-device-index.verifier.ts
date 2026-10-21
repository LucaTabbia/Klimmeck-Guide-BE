import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { describeError } from 'src/mongo/mongo-errors';
import { PushDevice, PushDeviceDocument } from 'src/push/push-device.model';

// non blocca mai il boot: le invarianti (a)/(b) di D-01 dipendono da indici unici la cui build fallita sarebbe altrimenti silenziosa
@Injectable()
export class PushDeviceIndexVerifier implements OnApplicationBootstrap {
    private readonly logger = new Logger(PushDeviceIndexVerifier.name);

    constructor(
        @InjectModel(PushDevice.name)
        private readonly model: Model<PushDeviceDocument>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.model.createIndexes();
        } catch (error) {
            this.logger.error(
                `Indexes on push_devices could not be built (${describeError(error)}). Push registrations are not guaranteed unique per device and per token.`,
            );
        }
    }
}
