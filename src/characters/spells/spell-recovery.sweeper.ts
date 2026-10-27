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
import { SPELL_RECOVERY_CONFIG } from 'src/config/spell-recovery-config';
import type { SpellRecoveryConfig } from 'src/config/spell-recovery-config';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { describeError } from 'src/mongo/mongo-errors';
import { SpellRecoveryService } from './spell-recovery.service';

interface DueSpellStates {
    _id: Types.ObjectId;
    status: {
        spellStates?: { spell: Types.ObjectId; recoveries?: Date[] }[];
    };
}

@Injectable()
export class SpellRecoverySweeper
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger(SpellRecoverySweeper.name);
    private timer: NodeJS.Timeout | null = null;
    private inFlight: Promise<number> | null = null;
    private stopping = false;

    constructor(
        @Inject(SPELL_RECOVERY_CONFIG)
        private readonly config: SpellRecoveryConfig,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly recovery: SpellRecoveryService,
        private readonly clock: Clock,
    ) {}

    // il DB decide (D-09): reconciler sempre al boot, mai atteso; 0 spegne solo lo sweep periodico
    onApplicationBootstrap(): void {
        if (this.config.sweepIntervalMs > 0) {
            this.timer = setInterval(
                () => void this.sweepSafely(),
                this.config.sweepIntervalMs,
            ).unref();
        }
        void this.sweepSafely();
    }

    // lo sweep in corso finisce prima che Mongoose chiuda; nessun nuovo credito dopo lo stop
    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.inFlight?.catch(() => undefined);
    }

    // single-flight: un tick saltato è recuperato dal successivo; copre i job persi, evictati o in anticipo
    sweep(): Promise<number> {
        this.inFlight ??= this.runOnce().finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    // nessun filtro sugli slot: il recupero vale anche per le magie disequipaggiate (D-01)
    private async runOnce(): Promise<number> {
        const now = this.clock.now();
        const due = await this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    'status.spellStates.recoveries': { $lte: now },
                },
                { 'status.spellStates': 1 },
            )
            .lean<DueSpellStates[]>()
            .exec();
        let credited = 0;
        // in serie: nessun picco al boot; ogni voce è un update condizionale indipendente
        for (const character of due) {
            for (const state of character.status.spellStates ?? []) {
                if (this.stopping) return credited;
                if (!isDue(state.recoveries?.[0], now)) continue;
                credited += await this.recoverSafely(
                    character._id,
                    state.spell,
                );
            }
        }
        if (credited > 0) {
            this.logger.log(
                `Sweep dei recuperi delle magie: ${credited} usi restituiti`,
            );
        }
        return credited;
    }

    private async recoverSafely(
        characterId: Types.ObjectId,
        spellId: Types.ObjectId,
    ): Promise<number> {
        try {
            return await this.recovery.recoverDue(characterId, spellId);
        } catch (error) {
            this.logger.error(
                `Recupero della magia ${spellId.toHexString()} del personaggio ${characterId.toHexString()} fallito: ${describeError(error)}`,
            );
            return 0;
        }
    }

    private sweepSafely(): Promise<void> {
        return this.sweep().then(
            () => undefined,
            (error: unknown) =>
                this.logger.error(
                    `Sweep dei recuperi delle magie fallito: ${describeError(error)}`,
                ),
        );
    }
}

function isDue(instant: Date | undefined, now: Date): boolean {
    return instant !== undefined && instant.getTime() <= now.getTime();
}
