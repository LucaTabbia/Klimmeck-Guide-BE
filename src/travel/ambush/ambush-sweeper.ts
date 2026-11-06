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
import { TravelScheduler } from '../travel-scheduler.service';
import { ambushJobId, type AmbushIdentity } from './ambush-job';
import { AmbushResolutionService } from './ambush-resolution.service';
import { AMBUSH_MAX_ATTEMPTS } from './ambush-rules';
import {
    AMBUSH_ATTEMPT_UPDATE,
    ambushFilter,
    ambushSkipUpdate,
    DUE_AMBUSH_PROJECTION,
    dueAmbushesFilter,
} from './ambush.updates';

interface DueAmbush {
    _id: Types.ObjectId;
    status: {
        activeTravel: {
            startTime: Date;
            endTime: Date;
            ambush: { at: Date; attempts?: number };
        };
    };
}

const identityOf = (character: DueAmbush): AmbushIdentity => ({
    characterId: character._id,
    startTime: character.status.activeTravel.startTime,
    at: character.status.activeTravel.ambush.at,
});

const jobIdOf = (identity: AmbushIdentity): string =>
    ambushJobId(identity.characterId, identity.startTime, identity.at);

@Injectable()
export class AmbushSweeper implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(AmbushSweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<number> | null = null;

    constructor(
        @Inject(TRAVEL_CONFIG) private readonly config: TravelConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly resolution: AmbushResolutionService,
        private readonly scheduler: TravelScheduler,
        private readonly clock: Clock,
    ) {}

    // il DB decide (D-05): il reconciler gira sempre al boot, mai atteso; 0 spegne solo lo sweep periodico
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

    // single-flight: un tick saltato è recuperato dal successivo; copre i job persi da Redis
    sweep(): Promise<number> {
        this.inFlight ??= this.runOnce().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private async runOnce(): Promise<number> {
        const now = this.clock.now();
        const due = await this.characterModel
            .find(dueAmbushesFilter(now), DUE_AMBUSH_PROJECTION)
            .lean<DueAmbush[]>()
            .exec();
        let resolved = 0;
        // in serie: ogni risoluzione è una transazione sullo stesso pool, nessun picco al boot
        for (const character of due) {
            try {
                const outcome = await this.resolution.resolve(
                    identityOf(character),
                );
                if (outcome === 'won' || outcome === 'lost') resolved++;
            } catch (error) {
                await this.recordFailure(character, error, now);
            }
        }
        if (resolved > 0) {
            this.logger.log(`Sweep delle imboscate: ${resolved} risolte`);
        }
        return resolved;
    }

    // fail-open (D-18): un errore non transitorio non blocca il viaggio per sempre; i WriteConflict li ritenta il driver e non arrivano qui
    private async recordFailure(
        character: DueAmbush,
        error: unknown,
        now: Date,
    ): Promise<void> {
        const identity = identityOf(character);
        const { endTime, ambush } = character.status.activeTravel;
        const attempts = (ambush.attempts ?? 0) + 1;
        if (attempts < AMBUSH_MAX_ATTEMPTS) {
            await this.characterModel
                .updateOne(ambushFilter(identity, now), AMBUSH_ATTEMPT_UPDATE)
                .exec();
            this.logger.error(
                `Imboscata ${jobIdOf(identity)} fallita (tentativo ${attempts}): ${describeError(error)}`,
            );
            return;
        }
        await this.characterModel
            .updateOne(ambushFilter(identity, now), ambushSkipUpdate(null))
            .exec();
        this.logger.error(
            `Imboscata ${jobIdOf(identity)} annullata dopo ${attempts} errori: ${describeError(error)}`,
        );
        if (endTime.getTime() <= now.getTime()) {
            await this.scheduler.schedule(identity.characterId, {
                startTime: identity.startTime,
                endTime,
            });
        }
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            () => undefined,
            (error: unknown) =>
                this.logger.error(
                    `Sweep delle imboscate fallito: ${describeError(error)}`,
                ),
        );
    }
}
