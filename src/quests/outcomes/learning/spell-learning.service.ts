import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { refIdOf } from 'src/mongo/document-id';
import {
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from '../outcome-writer.service';
import type { QuestResultDraft } from '../outcome-plan';
import {
    ResolutionLoader,
    type ResolutionOutcome,
    type StandardTrigger,
} from '../resolution-loader.service';
import type { SpellCandidate } from '../rewards/quest-rewards';
import {
    type LearningEndPlan,
    planLearningEnd,
    type ResearchSheet,
    researchSheetOf,
} from './learning-end-plan';

interface LearningPendingQuest {
    startDate: Date | null;
    waitingTime: number;
    spellId: Types.ObjectId;
    researchResultId: Types.ObjectId | null;
}

interface RawLearningPendingQuest {
    startDate?: Date | null;
    waitingTime?: number | null;
    learningSpell?: unknown;
    researchResult?: unknown;
}

const LEARNING_PENDING_QUEST_PROJECTION = {
    startDate: 1,
    waitingTime: 1,
    learningSpell: 1,
    researchResult: 1,
} as const;

const RESEARCH_SHEET_PROJECTION = { quest: 1, user: 1 } as const;

function learningOf(
    raw: RawLearningPendingQuest | null,
): LearningPendingQuest | null {
    const spellId = refIdOf(raw?.learningSpell);
    if (!raw || !spellId) return null;
    return {
        startDate: raw.startDate ?? null,
        waitingTime: raw.waitingTime ?? 0,
        spellId,
        researchResultId: refIdOf(raw.researchResult),
    };
}

// stessa regola del trigger delle quest: la startDate del job deve essere quella di oggi, e la scadenza passata
function triggerVerdictOf(
    learning: LearningPendingQuest,
    trigger: StandardTrigger,
    now: Date,
): 'stale' | 'waiting' | null {
    if (learning.startDate?.getTime() !== trigger.startDate.getTime())
        return 'stale';
    const dueAt = learning.startDate.getTime() + learning.waitingTime;
    return dueAt > now.getTime() ? 'waiting' : null;
}

// fine della parte di apprendimento (Phase 24 D-26, D-31): la PendingQuest riarmata dalla ricerca si chiude con la magia conosciuta
@Injectable()
export class SpellLearningService {
    private readonly logger = new Logger(SpellLearningService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        private readonly loader: ResolutionLoader,
        private readonly writer: OutcomeWriter,
    ) {}

    // null = la PendingQuest non è in apprendimento: decide la risoluzione standard
    async completeDue(
        trigger: StandardTrigger,
        now: Date,
    ): Promise<ResolutionOutcome | null> {
        const pendingQuestId = trigger.pendingQuestId;
        const learning = await this.readLearning(pendingQuestId);
        if (!learning) return null;
        const verdict = triggerVerdictOf(learning, trigger, now);
        if (verdict) {
            this.logger.log(
                `Missione in attesa ${pendingQuestId.toHexString()}: ${verdict === 'stale' ? 'trigger obsoleto' : 'non ancora scaduta'}, nessuna scrittura`,
            );
            return verdict;
        }
        const spell = await this.loader.readLearnableSpell(learning.spellId);
        const research = await this.readResearch(learning.researchResultId);
        const plan = await this.commit(pendingQuestId, {
            spellId: learning.spellId,
            spell,
            research,
            now,
        });
        if (!plan) {
            this.logger.log(
                `Apprendimento della missione in attesa ${pendingQuestId.toHexString()} già concluso o cambiato: nessuna scrittura`,
            );
            return 'stale';
        }
        if (plan.result) await this.deliver(plan.result);
        this.report(pendingQuestId, plan, spell, research);
        return 'resolved';
    }

    private async readLearning(
        pendingQuestId: Types.ObjectId,
    ): Promise<LearningPendingQuest | null> {
        const raw = await this.pendingQuestModel
            .findById(pendingQuestId, LEARNING_PENDING_QUEST_PROJECTION)
            .lean<RawLearningPendingQuest | null>()
            .exec();
        return learningOf(raw);
    }

    private async readResearch(
        resultId: Types.ObjectId | null,
    ): Promise<ResearchSheet | null> {
        if (!resultId) return null;
        const sheet = await this.questResultModel
            .findById(resultId, RESEARCH_SHEET_PROJECTION)
            .lean()
            .exec();
        return researchSheetOf(sheet);
    }

    // il callback viene rieseguito sui WriteConflict: il piano riparte dallo snapshot in sessione
    private async commit(
        pendingQuestId: Types.ObjectId,
        facts: {
            spellId: Types.ObjectId;
            spell: SpellCandidate | null;
            research: ResearchSheet | null;
            now: Date;
        },
    ): Promise<LearningEndPlan | null> {
        const resultId = new Types.ObjectId();
        const outcome: { plan: LearningEndPlan | null } = { plan: null };
        try {
            await this.connection.transaction(async (session) => {
                outcome.plan = null;
                const snapshot =
                    await this.loader.snapshotOnStandardLaneInSession(
                        pendingQuestId,
                        session,
                    );
                const plan = planLearningEnd({
                    ...facts,
                    snapshot,
                    pendingQuestId,
                    resultId,
                });
                await this.writer.writeCharacterUpdate(
                    plan.filter,
                    plan.update,
                    session,
                );
                if (plan.result) {
                    await this.writer.writeResult(plan.result, session);
                }
                await this.writer.deletePendingQuest(pendingQuestId, session);
                outcome.plan = plan;
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            return null;
        }
        return outcome.plan;
    }

    private deliver(result: QuestResultDraft): Promise<void> {
        const committed = emptyCommitted();
        committed.results.push({ resultId: result._id, userId: result.user });
        return this.writer.deliver(committed);
    }

    // soli id (T-24-52)
    private report(
        pendingQuestId: Types.ObjectId,
        plan: LearningEndPlan,
        spell: SpellCandidate | null,
        research: ResearchSheet | null,
    ): void {
        const subject = `Apprendimento della missione in attesa ${pendingQuestId.toHexString()} concluso`;
        if (!spell) {
            this.logger.warn(`${subject}: magia assente dal catalogo`);
            return;
        }
        if (!plan.learned) {
            this.logger.warn(`${subject}: magia già conosciuta`);
            return;
        }
        if (!research) {
            this.logger.warn(
                `${subject}: magia imparata, foglio della ricerca illeggibile`,
            );
            return;
        }
        this.logger.log(`${subject}: magia imparata`);
    }
}
