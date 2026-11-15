import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { QuestConfig } from 'src/config/quest-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { describeError } from 'src/mongo/mongo-errors';
import { duePetRecoveriesFilter } from './pet-recovery';
import { PetRecoveryService } from './pet-recovery.service';

interface DueCharacter {
    _id: Types.ObjectId;
}

// push «in forze» (D-24): stesso intervallo della prigione, ritardo massimo = un intervallo, nessuna variabile d'ambiente nuova
@Injectable()
export class PetRecoverySweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger(PetRecoverySweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<number> | null = null;
    private stopping = false;

    constructor(
        @Inject(QUEST_CONFIG) private readonly config: QuestConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly recoveries: PetRecoveryService,
        private readonly clock: Clock,
    ) {}

    // reconciler sempre al boot (sconfitte finite a processo fermo), mai atteso; 0 spegne solo lo sweep periodico
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => void this.sweepSafely(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        void this.sweepSafely();
    }

    // lo sweep in corso finisce prima che Mongoose chiuda; nessun nuovo claim dopo lo stop
    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.inFlight?.catch(() => undefined);
    }

    // single-flight: un tick saltato è recuperato dal successivo
    sweep(): Promise<number> {
        this.inFlight ??= this.runOnce().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async runOnce(): Promise<number> {
        const due = await this.characterModel
            .find(duePetRecoveriesFilter(this.clock.now()), { _id: 1 })
            .lean<DueCharacter[]>()
            .exec();
        let recovered = 0;
        for (const character of due) {
            if (this.stopping) return recovered;
            recovered += await this.releaseSafely(character._id);
        }
        if (recovered > 0) {
            this.logger.log(
                `Sweep dei compagni: ${recovered} di nuovo in forze`,
            );
        }
        return recovered;
    }

    private async releaseSafely(characterId: Types.ObjectId): Promise<number> {
        try {
            return (await this.recoveries.release(characterId)).length;
        } catch (error) {
            this.logger.error(
                `Recupero dei compagni del personaggio ${characterId.toHexString()} fallito: ${describeError(error)}`,
            );
            return 0;
        }
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            () => undefined,
            (error: unknown) =>
                this.logger.error(
                    `Sweep dei compagni fallito: ${describeError(error)}`,
                ),
        );
    }
}
