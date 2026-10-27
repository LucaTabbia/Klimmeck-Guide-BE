import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import type { SpellRecoveryConfig } from 'src/config/spell-recovery-config';
import { Clock } from 'src/auth/clock';
import { CharacterDocument } from 'src/models/character/character.model';
import { SpellRecoveryService } from './spell-recovery.service';

@Injectable()
export class SpellRecoverySweeper {
    constructor(
        readonly config: SpellRecoveryConfig,
        readonly characterModel: Model<CharacterDocument>,
        readonly recovery: SpellRecoveryService,
        readonly clock: Clock,
    ) {}

    onApplicationBootstrap(): void {}

    onModuleDestroy(): Promise<void> {
        return Promise.resolve();
    }

    sweep(): Promise<number> {
        return Promise.resolve(0);
    }
}
