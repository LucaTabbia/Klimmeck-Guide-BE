import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms } from 'src/mongo/document-id';

export type ArchiveOutcome = 'archived' | 'unlinked' | 'not-linked';

export interface ArchiveRequest {
    userId: Types.ObjectId;
    characterId: Types.ObjectId;
    reason: DeletionReason;
    now: Date;
}

// archivio dentro la transazione del chiamante (C1): una transazione annidata committerebbe da sola (Pitfall 1)
@Injectable()
export class CharacterArchiver {
    private readonly logger = new Logger(CharacterArchiver.name);

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
    ) {}

    async archiveWithin(
        session: ClientSession,
        { userId, characterId, reason, now }: ArchiveRequest,
    ): Promise<ArchiveOutcome> {
        // claim inverso (03.1 D-05): solo l'utente che punta proprio a questo personaggio viene scollegato
        const unlinked = await this.userModel
            .findOneAndUpdate(
                {
                    _id: userId,
                    currentCharacter: { $in: idForms(characterId) },
                },
                { $set: { currentCharacter: null } },
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (!unlinked) return 'not-linked';
        const archived = await this.characterModel
            .updateOne(
                activeCharacterById(characterId),
                { $set: { deletedAt: now, deletionReason: reason } },
                { session },
            )
            .exec();
        if (archived.matchedCount === 0) {
            // riferimento pendente o già archiviato: si scollega comunque, altrimenti l'utente non potrebbe né creare né eliminare
            this.logger.warn(
                `User ${userId.toHexString()} pointed to a missing or archived character ${characterId.toHexString()}: unlinked anyway`,
            );
            return 'unlinked';
        }
        await this.releaseQuestsOf(characterId, now, session);
        return 'archived';
    }

    // posti liberati (Phase 8 D-30) e aid che lo riguardano chiuse (D-09): nessuna aid orfana sulla board
    private async releaseQuestsOf(
        characterId: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<void> {
        await this.questModel
            .updateMany(
                { 'registeredAdventurers.character': characterId },
                {
                    $pull: {
                        registeredAdventurers: { character: characterId },
                    },
                },
                { session },
            )
            .exec();
        await this.questModel
            .updateMany(
                { 'rescue.character': characterId, concludedAt: null },
                { $set: { concludedAt: now } },
                { session },
            )
            .exec();
    }
}
