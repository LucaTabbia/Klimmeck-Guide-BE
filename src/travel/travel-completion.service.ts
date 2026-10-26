import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { TravelKind } from 'src/models/character/active-travel.model';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import {
    QuestStartService,
    StartTrigger,
} from 'src/quests/party/quest-start.service';
import { travelEnd } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
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

@Injectable()
export class TravelCompletionService {
    private readonly logger = new Logger(TravelCompletionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly push: PushService,
        private readonly clock: Clock,
        private readonly questStart: QuestStartService,
    ) {}

    // trigger idempotente (D-12): il filtro d'identità decide; solo chi ha matchato invia la push (Pitfall 11)
    async complete(identity: TravelIdentity): Promise<CompletionOutcome> {
        const now = this.clock.now();
        const outcome: {
            completed: CompletedSnapshot | null;
            arrival: StartTrigger | null;
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
            const pendingQuestId = refIdOf(before.quests?.pendingQuest);
            if (
                before.status?.activeTravel?.kind === TravelKind.quest &&
                pendingQuestId
            ) {
                // una PendingQuest assente (party sciolto) lascia un viaggio da quest senza countdown
                const arrived = await this.pendingQuestModel
                    .findOneAndUpdate(
                        questArrivalFilter(pendingQuestId),
                        questArrivalUpdate(identity.endTime),
                        { session, projection: { quest: 1 } },
                    )
                    .lean<{ quest?: unknown } | null>()
                    .exec();
                const questId = refIdOf(arrived?.quest);
                if (questId) outcome.arrival = { questId, pendingQuestId };
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
        // avvio dopo il commit dell'arrivo (D-24 emendata): QuestStartService decide e accoda la scadenza
        if (outcome.arrival) await this.questStart.tryStart(outcome.arrival);
        if (completed.status?.activeTravel?.kind === TravelKind.free) {
            await this.notifyOwner(identity.characterId);
        }
        return 'completed';
    }

    // best-effort dopo il commit (D-14): un archiviato ha currentCharacter null ⇒ nessuna push
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
