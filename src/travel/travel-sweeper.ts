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
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import type { TravelConfig } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { describeError } from 'src/mongo/mongo-errors';
import { TravelFoodSweep } from './food/travel-food.sweep';
import { TravelCompletionService } from './travel-completion.service';
import { DUE_TRAVEL_PROJECTION, dueTravelsFilter } from './travel.updates';

interface DueTravel {
    _id: Types.ObjectId;
    status: { activeTravel: { startTime: Date; endTime: Date } };
}

@Injectable()
export class TravelSweeper implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(TravelSweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<number> | null = null;

    constructor(
        @Inject(TRAVEL_CONFIG) private readonly config: TravelConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly completion: TravelCompletionService,
        private readonly clock: Clock,
        private readonly foodSweep: TravelFoodSweep,
    ) {}

    // il DB decide (STATE [Phase 8]): il reconciler gira sempre al boot, mai atteso; 0 spegne solo lo sweep periodico (D-12)
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => void this.sweepSafely(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        void this.sweepSafely();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    // single-flight: un tick saltato è recuperato dal successivo; copre i job persi per eviction Redis (blocker STATE)
    sweep(): Promise<number> {
        this.inFlight ??= this.runOnce().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async runOnce(): Promise<number> {
        const now = this.clock.now();
        const due = await this.characterModel
            .find(dueTravelsFilter(now), DUE_TRAVEL_PROJECTION)
            .lean<DueTravel[]>()
            .exec();
        let completed = 0;
        // in serie: ogni completamento è una transazione sullo stesso pool, nessun picco al boot
        for (const character of due) {
            try {
                const outcome = await this.completion.complete({
                    characterId: character._id,
                    startTime: character.status.activeTravel.startTime,
                    endTime: character.status.activeTravel.endTime,
                });
                if (outcome === 'completed') completed++;
            } catch (error) {
                this.logger.error(
                    `Completamento del viaggio del personaggio ${character._id.toHexString()} fallito: ${describeError(error)}`,
                );
            }
        }
        if (completed > 0) {
            this.logger.log(`Sweep dei viaggi: ${completed} completati`);
        }
        // dopo i completamenti, stesso istante (Phase 20 D-15): un viaggio appena arrivato non ha più piano
        await this.settleHungerSafely(now);
        return completed;
    }

    // un errore del passo «fame» non cambia i completamenti restituiti (D-15)
    private async settleHungerSafely(now: Date): Promise<void> {
        try {
            await this.foodSweep.settleDue(now);
        } catch (error) {
            this.logger.error(
                `Sweep della fame fallito: ${describeError(error)}`,
            );
        }
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            () => undefined,
            (error: unknown) =>
                this.logger.error(
                    `Sweep dei viaggi fallito: ${describeError(error)}`,
                ),
        );
    }
}
