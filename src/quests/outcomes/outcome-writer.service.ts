import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bull';
import type { ClientSession, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    SPELL_RECOVERY_TRIGGER_FALLBACK,
    SPELL_RECOVERY_TRIGGER_SUBJECT,
    type SpellRecoveryJobData,
    spellRecoveryTrigger,
} from 'src/characters/spells/spell-recovery-job';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { WalletService } from 'src/economy/wallet.service';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { documentIdOf, objectIdFromHex } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { questEnd } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
import { enqueueTrigger } from 'src/queues/enqueue-trigger';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import type { AmbushResultDraft } from 'src/travel/ambush/ambush-results';
import type { AidQuestDraft } from './aid/aid-quest';
import type {
    ParticipantPlan,
    QuestResultDraft,
    SpellRecovery,
} from './outcome-plan';
import { QuestResolutionScheduler } from './scheduling/quest-resolution.scheduler';

// sentinella: la transazione abortisce senza scrivere e il trigger diventa no-op (non è un TransientTransactionError, non viene rieseguita)
export class StaleResolution extends Error {
    constructor() {
        super('stale quest resolution');
    }
}

export interface CommittedLearning {
    pendingQuestId: Types.ObjectId;
    // inizio della parte di apprendimento = fine della ricerca
    startDate: Date;
    learnTime: number;
    userId: Types.ObjectId;
    // foglio della ricerca: id del push della ricerca riuscita (D-31)
    resultId: Types.ObjectId;
    spellName: string | null;
}

export interface CommittedOutcome {
    results: { resultId: Types.ObjectId; userId: Types.ObjectId }[];
    aids: { aidQuestId: Types.ObjectId; since: Date }[];
    spellRecoveries: SpellRecovery[];
    // una generata conclusa (D-17): dopo il commit si chiede una corsa del generatore
    regenerate?: boolean;
    // ricerche riuscite (Phase 24 D-26): opzionale per i CommittedOutcome letterali senza sorteggio
    learnings?: CommittedLearning[];
}

// una factory, non una costante: ogni esito riempie i propri array
export const emptyCommitted = (): CommittedOutcome => ({
    results: [],
    aids: [],
    spellRecoveries: [],
    regenerate: false,
    learnings: [],
});

// dopo il commit: un foglio da notificare con questEnd oppure una ricerca riuscita da notificare e un apprendimento da pianificare (Phase 24 D-26, D-31)
export function recordParticipant(
    committed: CommittedOutcome,
    plan: ParticipantPlan,
    seat: { pendingQuestId: Types.ObjectId; userId: Types.ObjectId },
): void {
    committed.spellRecoveries.push(...plan.spellRecoveries);
    if (!plan.learning) {
        committed.results.push({
            resultId: plan.result._id,
            userId: seat.userId,
        });
        return;
    }
    (committed.learnings ??= []).push({
        pendingQuestId: seat.pendingQuestId,
        startDate: plan.result.resolvedAt,
        learnTime: plan.learning.learnTime,
        userId: seat.userId,
        resultId: plan.result._id,
        spellName: plan.learning.spellName,
    });
}

// claim = la scrittura della Quest decide chi risolve; bestEffort = la quest può mancare senza bloccare l'esito
export type QuestWriteMode = 'claim' | 'bestEffort';

// unico punto delle scritture dell'esito (D-21): le write in sessione dentro il callback, la consegna solo dopo il commit
@Injectable()
export class OutcomeWriter {
    private readonly logger = new Logger(OutcomeWriter.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        private readonly wallet: WalletService,
        private readonly push: PushService,
        private readonly scheduler: QuestResolutionScheduler,
        @InjectQueue(SPELL_RECOVERY_QUEUE)
        private readonly spellRecoveryQueue: Queue<SpellRecoveryJobData>,
        @Inject(QUEUE_CALL_TIMEOUT)
        private readonly timeoutMs: number,
        private readonly clock: Clock,
        private readonly trigger: QuestGenerationTrigger,
    ) {}

    // il saldo passa solo dal WalletService nella stessa session (04 D-04)
    async writeParticipant(
        plan: ParticipantPlan,
        session: ClientSession,
    ): Promise<void> {
        await this.writeCharacterUpdate(plan.filter, plan.update, session);
        if (plan.coinsDelta !== 0) {
            await this.wallet.applyCharacterCoinsDelta(
                plan.result.character,
                plan.coinsDelta,
                session,
            );
        }
        await this.writeResult(plan.result, session);
    }

    async writeCharacterUpdate(
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        session: ClientSession,
    ): Promise<void> {
        const written = await this.characterModel
            .findOneAndUpdate(filter, update, {
                session,
                projection: { _id: 1 },
            })
            .exec();
        if (!written) throw new StaleResolution();
    }

    // anche il risultato dell'imboscata, scritto all'istante nella transazione della risoluzione (D-28)
    async writeResult(
        result: QuestResultDraft | AmbushResultDraft,
        session: ClientSession,
    ): Promise<void> {
        await this.questResultModel.create([result], { session });
    }

    async deletePendingQuest(
        pendingQuestId: Types.ObjectId,
        session: ClientSession,
    ): Promise<void> {
        const deleted = await this.pendingQuestModel
            .deleteOne({ _id: pendingQuestId }, { session })
            .exec();
        if (deleted.deletedCount === 0) throw new StaleResolution();
    }

    // chiude la PendingQuest di un partecipante della corsia standard: cancellata a quest finita, riarmata per la parte di apprendimento (Phase 24 D-26)
    async closePendingQuest(
        pendingQuestId: Types.ObjectId,
        plan: ParticipantPlan,
        session: ClientSession,
    ): Promise<void> {
        // una PendingQuest già in apprendimento non si chiude due volte: il secondo trigger abortisce la transazione, foglio compreso
        const filter = { _id: pendingQuestId, learningSpell: null };
        if (!plan.learning) {
            const deleted = await this.pendingQuestModel
                .deleteOne(filter, { session })
                .exec();
            if (deleted.deletedCount === 0) throw new StaleResolution();
            return;
        }
        const rearmed = await this.pendingQuestModel
            .updateOne(
                filter,
                {
                    $set: {
                        startDate: plan.result.resolvedAt,
                        waitingTime: plan.learning.learnTime,
                        learningSpell: plan.learning.spellId,
                        researchResult: plan.result._id,
                    },
                },
                { session },
            )
            .exec();
        if (rearmed.matchedCount === 0) throw new StaleResolution();
    }

    async updateQuest(
        filter: Record<string, unknown>,
        update: Record<string, unknown> | null,
        session: ClientSession,
        mode: QuestWriteMode,
    ): Promise<void> {
        if (!update) return;
        const updated = await this.questModel
            .updateOne(filter, update, { session })
            .exec();
        if (updated.matchedCount > 0) return;
        if (mode === 'claim') throw new StaleResolution();
        this.logger.warn(
            `Missione ${documentIdOf(filter) ?? 'sconosciuta'} non aggiornata dall'esito: nessuna corrispondenza`,
        );
    }

    async createAid(
        draft: AidQuestDraft,
        session: ClientSession,
    ): Promise<void> {
        await this.questModel.create([draft], { session });
    }

    // best-effort dopo il commit: un errore di consegna non annulla l'esito né le altre consegne
    async deliver(committed: CommittedOutcome): Promise<void> {
        for (const { resultId, userId } of committed.results) {
            await this.notify(resultId, userId);
        }
        for (const aid of committed.aids) {
            await this.scheduler.scheduleAidTimeout(aid);
        }
        for (const recovery of committed.spellRecoveries) {
            await this.scheduleSpellRecovery(recovery);
        }
        for (const learning of committed.learnings ?? []) {
            await this.scheduler.scheduleResolution({
                pendingQuestId: learning.pendingQuestId,
                startDate: learning.startDate,
                waitingTime: learning.learnTime,
            });
        }
        if (committed.regenerate) this.requestGeneration();
    }

    // la richiesta non attende la corsa: il single-flight del generatore la accoda, lo sweep la recupera se va persa
    private requestGeneration(): void {
        try {
            this.trigger.request();
        } catch (error) {
            this.logger.warn(
                `Generatore: richiesta di corsa dopo l'esito non inviata (${describeError(error)})`,
            );
        }
    }

    private async notify(
        resultId: Types.ObjectId,
        userId: Types.ObjectId,
    ): Promise<void> {
        try {
            await this.push.sendToUser(
                userId,
                questEnd(resultId.toHexString()),
            );
        } catch {
            this.logger.warn(
                `Push questEnd del risultato ${resultId.toHexString()} all'utente ${userId.toHexString()} non inviata`,
            );
        }
    }

    // il job è solo un trigger (D-06): best-effort dopo il commit, nessuna compensazione; lo sweep restituisce gli usi se Redis lo perde
    private scheduleSpellRecovery({
        characterId,
        spellId,
        dueAt,
    }: SpellRecovery): Promise<void> {
        const character = objectIdFromHex(characterId);
        const spell = objectIdFromHex(spellId);
        if (!character || !spell) return Promise.resolve();
        return enqueueTrigger(
            this.spellRecoveryQueue,
            spellRecoveryTrigger(character, spell, dueAt),
            {
                clock: this.clock,
                timeoutMs: this.timeoutMs,
                logger: this.logger,
                subject: SPELL_RECOVERY_TRIGGER_SUBJECT,
                fallback: SPELL_RECOVERY_TRIGGER_FALLBACK,
            },
        );
    }
}
