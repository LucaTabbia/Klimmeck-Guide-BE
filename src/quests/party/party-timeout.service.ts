import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
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
import { idForms, refIdOf } from 'src/mongo/document-id';
import { questCancelled } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
import {
    QuestRequirementsSnapshot,
    registrationRuleOf,
} from 'src/quests/acceptance/quest-eligibility';
import { StaleResolution } from 'src/quests/outcomes/outcome-writer.service';
import {
    isPartyExpired,
    partyClaimFilter,
    partyFormingSinceOf,
} from './party-rules';

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

const FORMING_QUEST_PROJECTION = {
    'infos.type': 1,
    requirements: 1,
    registeredAdventurers: 1,
    concludedAt: 1,
    startedAt: 1,
} as const;

const registeredIdsOf = (
    registrations: readonly Registration[] | null | undefined,
): Types.ObjectId[] =>
    (registrations ?? []).flatMap(({ character }) => refIdOf(character) ?? []);

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
        if (rule === null || rule === 'invalid') return 'stale';
        // posti pieni: si aspetta solo l'arrivo, il party non scade (default tecnico 2026-10-25)
        if (members.length >= rule.total) return 'waiting';
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
                state.released = await this.releaseMembers(
                    questId,
                    registeredIdsOf(claimed.registeredAdventurers),
                    session,
                );
            });
        } catch (error) {
            if (error instanceof StaleResolution) return 'stale';
            throw error;
        }
        this.logger.log(
            `Party della missione ${questId.toHexString()} sciolto dopo 24 ore senza posti pieni: ${state.released.length} liberati`,
        );
        await this.notifyCancelled(questId, state.released);
        return 'disbanded';
    }

    // registrati riletti in sessione (non dalla pre-lettura): la push la fa il chiamante dopo il commit
    async releaseRegistered(
        questId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Types.ObjectId[]> {
        const quest = await this.questModel
            .findById(questId, { registeredAdventurers: 1 })
            .session(session)
            .lean<{ registeredAdventurers?: Registration[] } | null>()
            .exec();
        const members = registeredIdsOf(quest?.registeredAdventurers);
        if (members.length === 0) return [];
        const released = await this.releaseMembers(questId, members, session);
        await this.questModel
            .updateOne(
                { _id: questId },
                { $set: { registeredAdventurers: [] } },
                { session },
            )
            .exec();
        return released;
    }

    // registrazioni legacy senza registeredAt: retrodatate a now una sola volta, così anche loro scadono (T-09-95)
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

    async notifyCancelled(
        questId: Types.ObjectId,
        characterIds: readonly Types.ObjectId[],
    ): Promise<void> {
        if (characterIds.length === 0) return;
        const owners = await this.ownersOf(characterIds);
        const message = questCancelled(questId.toHexString());
        for (const ownerId of owners.values()) {
            await this.push.sendToUser(ownerId, message);
        }
    }

    // solo PendingQuest di questa quest ancora non avviate: un membro legacy con startDate scritto resta intatto
    private async releaseMembers(
        questId: Types.ObjectId,
        members: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<Types.ObjectId[]> {
        const characters = await this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    _id: { $in: members.flatMap((id) => idForms(id)) },
                },
                { 'quests.pendingQuest': 1 },
            )
            .session(session)
            .lean<
                {
                    _id: Types.ObjectId;
                    quests?: { pendingQuest?: unknown } | null;
                }[]
            >()
            .exec();
        const released: Types.ObjectId[] = [];
        for (const character of characters) {
            const pendingQuestId = refIdOf(character.quests?.pendingQuest);
            if (!pendingQuestId) continue;
            const deleted = await this.pendingQuestModel
                .deleteOne(
                    {
                        _id: pendingQuestId,
                        quest: { $in: idForms(questId) },
                        startDate: null,
                    },
                    { session },
                )
                .exec();
            if (deleted.deletedCount !== 1) continue;
            await this.characterModel
                .updateOne(
                    {
                        ...activeCharacterById(character._id),
                        'quests.pendingQuest': { $in: idForms(pendingQuestId) },
                    },
                    { $set: { 'quests.pendingQuest': null } },
                    { session },
                )
                .exec();
            released.push(character._id);
        }
        return released;
    }

    // proprietario = utente che punta al personaggio (come ResolutionLoader.ownersOf, non importabile qui)
    private async ownersOf(
        characterIds: readonly Types.ObjectId[],
    ): Promise<Map<string, Types.ObjectId>> {
        const users = await this.userModel
            .find(
                {
                    currentCharacter: {
                        $in: characterIds.flatMap((id) => idForms(id)),
                    },
                },
                { _id: 1, currentCharacter: 1 },
            )
            .lean<{ _id: Types.ObjectId; currentCharacter: unknown }[]>()
            .exec();
        return new Map(
            users.flatMap(({ _id, currentCharacter }) => {
                const characterId = refIdOf(currentCharacter);
                return characterId
                    ? [[characterId.toHexString(), _id] as const]
                    : [];
            }),
        );
    }
}
