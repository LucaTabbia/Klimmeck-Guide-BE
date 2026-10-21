import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { TRAVEL_CONFIG, TravelConfig } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { TravelCompletionService } from './travel-completion.service';

@Injectable()
export class TravelSweeper implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(TravelSweeper.name);

    constructor(
        @Inject(TRAVEL_CONFIG) private readonly config: TravelConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly completion: TravelCompletionService,
        private readonly clock: Clock,
    ) {}

    onApplicationBootstrap(): void {}

    onModuleDestroy(): void {}

    sweep(): Promise<number> {
        return Promise.resolve(0);
    }
}
