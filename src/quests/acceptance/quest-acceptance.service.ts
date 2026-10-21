import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { WalletService } from 'src/economy/wallet.service';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';

export interface AcceptQuestCommand {
    ownerId: Types.ObjectId;
    characterId: Types.ObjectId;
    questId: Types.ObjectId;
}

interface QuestTiming {
    infos?: { timeToComplete?: number | null };
}

@Injectable()
export class QuestAcceptanceService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly wallet: WalletService,
    ) {}

    async accept(command: AcceptQuestCommand): Promise<Types.ObjectId> {
        throw new Error('accept: not implemented');
    }

    private async rejectUnclaimed(
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const exists = await this.characterModel
            .exists(activeCharacterById(characterId))
            .session(session)
            .exec();
        return exists
            ? GameRuleException.questSlotBusy()
            : ResourceNotFoundException.character();
    }
}

// un costo negativo sarebbe un credito mascherato: RangeError prima di qualunque lettura o scrittura
function assertValidCost(costCopper: number): void {
    if (!Number.isSafeInteger(costCopper) || costCopper < 0) {
        throw new RangeError(`Costo non valido: ${costCopper}`);
    }
}

// durata in ms come la legge il FE (quest_info_sheet.dart); un solo punto da cambiare se la Phase 7 sceglie un'altra fonte (A1)
function waitingTimeOf(quest: QuestTiming): number {
    return quest.infos?.timeToComplete ?? 0;
}
