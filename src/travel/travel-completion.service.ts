import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { knowledgeAdditionOf } from 'src/lore/knowledge-addition';
import { LoreGeographyReader } from 'src/lore/lore-geography.reader';
import { TravelKind } from 'src/models/character/active-travel.model';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { ResolutionTrigger } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import {
    QuestStartService,
    soloStartDateOf,
    StartTrigger,
} from 'src/quests/party/quest-start.service';
import { travelEnd } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
import { ambushResultDraftsOf } from './ambush/ambush-results';
import {
    foodLegOf,
    settlementGuardsOf,
    settlementOf,
    settlementSetOf,
} from './food/travel-food-settlement';
import { TravelPantryReader } from './food/travel-pantry.reader';
import { travelJobId } from './travel-job';
import {
    COMPLETION_PROJECTION,
    COMPLETION_UPDATE,
    CompletedSnapshot,
    completionFilter,
    questArrivalFilter,
    questArrivalUpdate,
    TravelIdentity,
} from './travel.updates';

export type CompletionOutcome = 'completed' | 'stale';

// arrivo sul marker: una quest da soli è già avviata (D-22), le altre passano da QuestStartService dopo il commit
interface MarkerArrival {
    trigger: StartTrigger | null;
    started: ResolutionTrigger | null;
}

interface ArrivingPendingQuest {
    quest?: unknown;
    waitingTime?: number | null;
}

@Injectable()
export class TravelCompletionService {
    private readonly logger = new Logger(TravelCompletionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        private readonly push: PushService,
        private readonly clock: Clock,
        private readonly questStart: QuestStartService,
        private readonly geography: LoreGeographyReader,
        private readonly pantry: TravelPantryReader,
    ) {}

    // trigger idempotente (D-12): il filtro d'identità decide; solo chi ha matchato invia la push (Pitfall 11)
    async complete(identity: TravelIdentity): Promise<CompletionOutcome> {
        const now = this.clock.now();
        const outcome: {
            completed: CompletedSnapshot | null;
            arrival: MarkerArrival | null;
        } = { completed: null, arrival: null };
        await this.connection.transaction(async (session) => {
            // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
            outcome.completed = null;
            outcome.arrival = null;
            const before = await this.characterModel
                .findOneAndUpdate(
                    completionFilter(identity, now),
                    COMPLETION_UPDATE,
                    {
                        session,
                        returnDocument: 'before',
                        projection: COMPLETION_PROJECTION,
                    },
                )
                .lean<CompletedSnapshot | null>()
                .exec();
            if (!before) return;
            outcome.completed = before;
            await this.settleArrivalFood(
                before,
                identity.characterId,
                now,
                session,
            );
            await this.unlockArrivalGeography(
                before,
                identity.characterId,
                session,
            );
            await this.deliverHeldReports(
                before,
                identity.characterId,
                session,
            );
            const pendingQuestId = refIdOf(before.quests?.pendingQuest);
            if (
                before.status?.activeTravel?.kind === TravelKind.quest &&
                pendingQuestId
            ) {
                outcome.arrival = await this.arriveOnMarker(
                    pendingQuestId,
                    identity.endTime,
                    session,
                );
            }
        });
        const jobId = travelJobId(identity.characterId, identity.startTime);
        const { completed } = outcome;
        if (!completed) {
            this.logger.log(
                `Viaggio ${jobId} non più valido o non ancora scaduto: nessuna scrittura`,
            );
            return 'stale';
        }
        this.logger.log(`Viaggio ${jobId} completato`);
        await this.startAfterCommit(outcome.arrival);
        if (completed.status?.activeTravel?.kind === TravelKind.free) {
            await this.notifyOwner(identity.characterId);
        }
        return 'completed';
    }

    // fame residua e pasto (b) nello stesso callback del completamento (Phase 20 D-07): la pipeline resta intatta come per la geografia
    private async settleArrivalFood(
        before: CompletedSnapshot,
        characterId: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<void> {
        const leg = foodLegOf(before.status?.activeTravel);
        if (!leg) return;
        const pantry = await this.pantry.read(characterId, session);
        const settlement = settlementOf({
            leg,
            targetKm: leg.distanceKm,
            moment: 'arrival',
            lifeNow: pantry.hpBefore,
            assets: pantry.assets,
            stacks: pantry.stacks,
            now,
        });
        if (!settlement) return;
        const written = await this.characterModel
            .updateOne(
                {
                    _id: characterId,
                    ...settlementGuardsOf(null, settlement, pantry.hpRaw),
                },
                { $set: settlementSetOf(settlement) },
                { session },
            )
            .exec();
        if (written.matchedCount !== 1) {
            throw new Error('arrival food settlement lost its guards');
        }
    }

    // la meta si conosce solo dal before: secondo update nello stesso callback, la pipeline del completamento resta intatta (Phase 16 D-05, C-4)
    private async unlockArrivalGeography(
        before: CompletedSnapshot,
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<void> {
        const geography = await this.geography.ofMarker(
            refIdOf(before.status?.activeTravel?.to),
            session,
        );
        const addition = knowledgeAdditionOf(geography);
        if (!addition.$addToSet) return;
        await this.characterModel
            .updateOne({ _id: characterId }, addition, { session })
            .exec();
    }

    // report trattenuti nella stessa transazione dell'arrivo (Phase 15 D-13): nessun push questEnd, basta il travelEnd
    private async deliverHeldReports(
        before: CompletedSnapshot,
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<void> {
        const reports = before.status?.activeTravel?.ambushReports ?? [];
        if (reports.length === 0) return;
        await this.questResultModel.create(
            ambushResultDraftsOf(reports, characterId),
            { session, ordered: true },
        );
    }

    // una PendingQuest assente (party sciolto) lascia un viaggio da quest senza countdown
    private async arriveOnMarker(
        pendingQuestId: Types.ObjectId,
        endTime: Date,
        session: ClientSession,
    ): Promise<MarkerArrival | null> {
        const pending = await this.pendingQuestModel
            .findOne(questArrivalFilter(pendingQuestId), {
                quest: 1,
                waitingTime: 1,
            })
            .session(session)
            .lean<ArrivingPendingQuest | null>()
            .exec();
        if (!pending) return null;
        const questId = refIdOf(pending.quest);
        const type = questId ? await this.questTypeOf(questId, session) : null;
        const startDate = type ? soloStartDateOf(type, endTime) : null;
        await this.pendingQuestModel
            .updateOne(
                questArrivalFilter(pendingQuestId),
                questArrivalUpdate(endTime, startDate),
                { session },
            )
            .exec();
        return {
            trigger: questId ? { questId, pendingQuestId } : null,
            started: startDate
                ? {
                      pendingQuestId,
                      startDate,
                      waitingTime: pending.waitingTime ?? 0,
                  }
                : null,
        };
    }

    private async questTypeOf(
        questId: Types.ObjectId,
        session: ClientSession,
    ): Promise<QuestType | null> {
        const quest = await this.questModel
            .findOne({ _id: questId }, { 'infos.type': 1 })
            .session(session)
            .lean<{ infos?: { type?: QuestType } } | null>()
            .exec();
        return quest?.infos?.type ?? null;
    }

    // dopo il commit dell'arrivo (D-24 emendata): una quest da soli accoda solo la scadenza, le altre le decide QuestStartService
    private async startAfterCommit(
        arrival: MarkerArrival | null,
    ): Promise<void> {
        if (arrival?.started) {
            await this.questStart.scheduleStarted(arrival.started);
            return;
        }
        if (arrival?.trigger) await this.questStart.tryStart(arrival.trigger);
    }

    // best-effort dopo il commit (D-14): il viaggio si completa solo per un personaggio attivo, quindi un morto ancora collegato non riceve push
    private async notifyOwner(characterId: Types.ObjectId): Promise<void> {
        const owner = await this.userModel
            .findOne(
                { currentCharacter: { $in: idForms(characterId) } },
                { _id: 1 },
            )
            .lean<{ _id: Types.ObjectId } | null>()
            .exec();
        if (!owner) return;
        await this.push.sendToUser(
            owner._id,
            travelEnd(characterId.toHexString()),
        );
    }
}
