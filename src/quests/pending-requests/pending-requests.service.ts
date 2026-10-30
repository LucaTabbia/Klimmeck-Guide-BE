import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import type { PendingRequest } from 'src/models/pending-request.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import {
    buildPendingRequests,
    RequestCharacterSnapshot,
    RequestPendingQuestSnapshot,
    RequestQuestSnapshot,
    RequestUserSnapshot,
} from './pending-requests.builder';

const GM_LANE_FILTER = {
    $or: [
        { 'quests.activeStoryQuest': { $ne: null } },
        { 'quests.activeWorldMissionQuest': { $ne: null } },
    ],
};

// solo personaggi attivi con una corsia del GM (D-23): la voce di un archiviato non entra mai in coda
const GM_QUEUE_FILTER = { ...ACTIVE_CHARACTER_FILTER, ...GM_LANE_FILTER };

const CHARACTER_PROJECTION = {
    'infos.name': 1,
    'status.title': 1,
    'status.location': 1,
    'status.activeTravel': 1,
    'status.awaitingAid': 1,
    'quests.activeStoryQuest': 1,
    'quests.activeWorldMissionQuest': 1,
    'quests.pendingQuest': 1,
};

function refIdsOf(values: unknown[]): Types.ObjectId[] {
    return values.flatMap((value) => refIdOf(value) ?? []);
}

// coda del GM (D-22): quattro letture lean in serie, nessuna transazione (lista di sola lettura), riferimenti mai espansi
@Injectable()
export class PendingRequestsService {
    private readonly logger = new Logger(PendingRequestsService.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
    ) {}

    async list(): Promise<PendingRequest[]> {
        const characters = await this.characterModel
            .find(GM_QUEUE_FILTER, CHARACTER_PROJECTION)
            .lean<RequestCharacterSnapshot[]>();
        const pendingQuests = await this.pendingQuestModel
            .find(
                {
                    _id: {
                        $in: refIdsOf(
                            characters.flatMap((character) => [
                                character.quests?.activeStoryQuest,
                                character.quests?.activeWorldMissionQuest,
                            ]),
                        ),
                    },
                },
                { startDate: 1, pointsSpent: 1, quest: 1 },
            )
            .lean<RequestPendingQuestSnapshot[]>();
        const quests = await this.questModel
            .find(
                {
                    _id: {
                        $in: refIdsOf(pendingQuests.map((pq) => pq.quest)),
                    },
                },
                {
                    'infos.type': 1,
                    'infos.title': 1,
                    'requirements.requiredAdventurers': 1,
                    registeredAdventurers: 1,
                },
            )
            .lean<RequestQuestSnapshot[]>();
        const users = await this.userModel
            .find(
                {
                    currentCharacter: {
                        $in: characters.flatMap((character) =>
                            idForms(character._id),
                        ),
                    },
                },
                { twitchId: 1, currentCharacter: 1 },
            )
            .lean<RequestUserSnapshot[]>();

        const { requests, skipped } = buildPendingRequests({
            characters,
            pendingQuests,
            quests,
            users,
        });
        for (const { characterId, pendingQuestId } of skipped) {
            this.logger.warn(
                `Richiesta del personaggio ${characterId} (missione in attesa ${pendingQuestId}) incompleta: esclusa dalla coda`,
            );
        }
        return requests;
    }
}
