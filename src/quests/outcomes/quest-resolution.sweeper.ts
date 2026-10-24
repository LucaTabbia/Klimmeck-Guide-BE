import {
    Inject,
    Injectable,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { QuestConfig } from 'src/config/quest-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { QuestResolutionService } from './quest-resolution.service';
import { RescueResolutionService } from './rescue-resolution.service';

export interface QuestSweepCounts {
    resolved: number;
    timedOut: number;
}

@Injectable()
export class QuestResolutionSweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    constructor(
        @Inject(QUEST_CONFIG) private readonly config: QuestConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly resolution: QuestResolutionService,
        private readonly rescue: RescueResolutionService,
        private readonly clock: Clock,
    ) {}

    onApplicationBootstrap(): void {}

    onModuleDestroy(): void {}

    sweep(): Promise<QuestSweepCounts> {
        return Promise.resolve({ resolved: 0, timedOut: 0 });
    }
}
