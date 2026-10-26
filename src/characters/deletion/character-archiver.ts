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

    // solo le quest lette in sessione prima del $pull: nessuna scansione della collection, nessun documento estraneo
    private async releaseSeatsOf(
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<void> {
        const character = { $in: idForms(characterId) };
        const seated = await this.questModel
            .find({ 'registeredAdventurers.character': character }, { _id: 1 })
            .session(session)
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        if (seated.length === 0) return;
        const seatedIds = seated.map(({ _id }) => _id);
        await this.questModel
            .updateMany(
                { _id: { $in: seatedIds } },
                { $pull: { registeredAdventurers: { character } } },
                { session },
            )
            .exec();
        // una quest avviata rimasta senza nessuno torna non avviata: un nuovo party può formarsi (utente 2026-10-25)
        await this.questModel
            .updateMany(
                {
                    _id: { $in: seatedIds },
                    concludedAt: null,
                    startedAt: { $ne: null },
                    registeredAdventurers: { $size: 0 },
                },
                { $set: { startedAt: null } },
                { session },
            )
            .exec();
    }

    // posti liberati (Phase 8 D-30); il ferito esce dalle aid aperte che lo soccorrono e la aid resta aperta finché c'è qualcuno da soccorrere (D-09): nessuna aid orfana sulla board
    private async releaseQuestsOf(
        characterId: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<void> {
        await this.releaseSeatsOf(characterId, session);
        const aids = await this.questModel
            .find(
                { 'rescue.characters': characterId, concludedAt: null },
                { _id: 1 },
                { session },
            )
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        if (aids.length === 0) return;
        const aidIds = aids.map(({ _id }) => _id);
        await this.questModel
            .updateMany(
                { _id: { $in: aidIds } },
                { $pull: { 'rescue.characters': characterId } },
                { session },
            )
            .exec();
        await this.questModel
            .updateMany(
                {
                    _id: { $in: aidIds },
                    concludedAt: null,
                    'rescue.characters': { $size: 0 },
                },
                { $set: { concludedAt: now } },
                { session },
            )
            .exec();
    }
}
