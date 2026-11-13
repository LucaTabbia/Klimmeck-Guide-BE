import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
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
import { User, UserDocument } from 'src/models/user.model';
import { PushService } from 'src/push/push.service';
import { questSlotsOf } from 'src/quests/acceptance/quest-capacity';
import {
    hasUntitledGroupSeat,
    QuestRequirementsSnapshot,
    registrationRuleOf,
} from 'src/quests/acceptance/quest-eligibility';
import { StaleResolution } from 'src/quests/outcomes/outcome-writer.service';
import {
    isPartyExpired,
    partyClaimFilter,
    partyFormingSinceOf,
    registeredIdsOf,
} from './party-rules';
import {
    notifyQuestCancelled,
    type RegisteredReleaseModels,
    releaseMembersWithin,
    releaseRegisteredWithin,
} from './registered-release';

export type DisbandOutcome = 'disbanded' | 'waiting' | 'stale';

export interface DisbandTrigger {
    questId: Types.ObjectId;
}

interface Registration {
    character?: unknown;
    registeredAt?: Date | null;
}

interface FormingQuestSnapshot {
    _id: Types.ObjectId;
    infos: { type: QuestType };
    requirements?: QuestRequirementsSnapshot | null;
    registeredAdventurers?: Registration[] | null;
    concludedAt?: Date | null;
    startedAt?: Date | null;
}

// D-24: un posto senza titolo rende il party incompletabile (nessuno entra, nessuno parte), ma non lo lascia appeso
const hasUntitledSeat = (quest: FormingQuestSnapshot): boolean => {
    const slots = questSlotsOf(
        quest.infos.type,
        quest.requirements?.requiredAdventurers,
    );
    return slots !== 'invalid' && hasUntitledGroupSeat(quest.infos.type, slots);
};

const FORMING_QUEST_PROJECTION = {
    'infos.type': 1,
    requirements: 1,
    registeredAdventurers: 1,
    concludedAt: 1,
    startedAt: 1,
} as const;

// utente 2026-10-25: "Se entro 24 ore i posti non diventano pieni, allora la missione viene annullata in automatico per tutti. Il timer si cancella solo a party completo."
@Injectable()
export class PartyTimeoutService {
    private readonly logger = new Logger(PartyTimeoutService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly push: PushService,
        private readonly clock: Clock,
    ) {}

    // la quest resta sulla board; vale anche per il party dei soccorritori di una aid, che resta aperta
    async disband({ questId }: DisbandTrigger): Promise<DisbandOutcome> {
        const quest = await this.questModel
            .findById(questId, FORMING_QUEST_PROJECTION)
            .lean<FormingQuestSnapshot | null>()
            .exec();
        if (!quest || quest.concludedAt != null || quest.startedAt != null)
            return 'stale';
        const members = registeredIdsOf(quest.registeredAdventurers);
        if (members.length === 0) return 'stale';
        const rule = registrationRuleOf(quest.infos.type, quest.requirements);
        if (rule === null) return 'stale';
        const untitled = rule === 'invalid' && hasUntitledSeat(quest);
        if (rule === 'invalid' && !untitled) return 'stale';
        // posti pieni: si aspetta solo l'arrivo, il party non scade (default tecnico 2026-10-25)
        if (rule !== 'invalid' && members.length >= rule.total)
            return 'waiting';
        const since = partyFormingSinceOf(quest.registeredAdventurers ?? []);
        if (!since || !isPartyExpired(since, this.clock.now()))
            return 'waiting';
        const state: { released: Types.ObjectId[] } = { released: [] };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: lo stato riparte da zero
                state.released = [];
                const claimed = await this.questModel
                    .findOneAndUpdate(
                        partyClaimFilter(questId, members),
                        { $set: { registeredAdventurers: [] } },
                        {
                            session,
                            returnDocument: 'before',
                            projection: { registeredAdventurers: 1 },
                        },
                    )
                    .lean<{ registeredAdventurers?: Registration[] } | null>()
                    .exec();
                if (!claimed) throw new StaleResolution();
                // il claim ha già svuotato i registrati: si liberano i membri letti dal claim (W4)
                state.released = await releaseMembersWithin(
                    this.releaseModels(),
                    questId,
                    registeredIdsOf(claimed.registeredAdventurers),
                    session,
                    this.logger,
                );
            });
        } catch (error) {
            if (error instanceof StaleResolution) return 'stale';
            throw error;
        }
        if (untitled) {
            this.logger.warn(
                `Missione ${questId.toHexString()} con un posto senza titolo (D-24): party sciolto alla scadenza`,
            );
        }
        this.logger.log(
            `Party della missione ${questId.toHexString()} sciolto dopo 24 ore senza posti pieni: ${state.released.length} liberati`,
        );
        await this.notifyCancelled(questId, state.released);
        return 'disbanded';
    }

    // registrati riletti in sessione (non dalla pre-lettura): la push la fa il chiamante dopo il commit
    releaseRegistered(
        questId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Types.ObjectId[]> {
        return releaseRegisteredWithin(
            this.releaseModels(),
            questId,
            session,
            this.logger,
        );
    }

    // registrazioni legacy senza registeredAt: retrodatate a now una sola volta, così anche loro scadono (T-09-95); conta le quest toccate
    async backfillRegisteredAt(now: Date): Promise<number> {
        const result = await this.questModel
            .updateMany(
                {
                    concludedAt: null,
                    registeredAdventurers: {
                        $elemMatch: { registeredAt: null },
                    },
                },
                { $set: { 'registeredAdventurers.$[r].registeredAt': now } },
                { arrayFilters: [{ 'r.registeredAt': null }] },
            )
            .exec();
        return result.modifiedCount;
    }

    notifyCancelled(
        questId: Types.ObjectId,
        characterIds: readonly Types.ObjectId[],
    ): Promise<void> {
        return notifyQuestCancelled(
            this.userModel,
            this.push,
            questId,
            characterIds,
            this.logger,
        );
    }

    private releaseModels(): RegisteredReleaseModels {
        return {
            questModel: this.questModel,
            characterModel: this.characterModel,
            pendingQuestModel: this.pendingQuestModel,
        };
    }
}
