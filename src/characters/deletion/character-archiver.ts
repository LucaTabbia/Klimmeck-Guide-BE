import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
    activeRegistrantFilterOf,
    placeholderMarkOf,
    startedQuestResetOf,
    unstartedSeatReleaseOf,
} from 'src/characters/deletion/seat-release';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms } from 'src/mongo/document-id';
import { releaseRegisteredWithin } from 'src/quests/party/registered-release';

export type ArchiveOutcome = 'archived' | 'unlinked' | 'not-linked';

export interface ArchiveRequest {
    userId: Types.ObjectId;
    characterId: Types.ObjectId;
    reason: DeletionReason;
    now: Date;
}

export interface ReleasedRescuers {
    questId: Types.ObjectId;
    characterIds: Types.ObjectId[];
}

// solo le aid che hanno liberato qualcuno: il chiamante manda questCancelled dopo il commit (D-27)
export interface ArchiveReport {
    outcome: ArchiveOutcome;
    released: ReleasedRescuers[];
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
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
    ) {}

    async archiveWithinReporting(
        session: ClientSession,
        { userId, characterId, reason, now }: ArchiveRequest,
    ): Promise<ArchiveReport> {
        const dying = reason === DeletionReason.death;
        const linked = dying
            ? await this.confirmLinkOf(userId, characterId, session)
            : await this.unlinkOf(userId, characterId, session);
        if (!linked) return { outcome: 'not-linked', released: [] };
        const archived = await this.characterModel
            .updateOne(
                activeCharacterById(characterId),
                { $set: { deletedAt: now, deletionReason: reason } },
                { session },
            )
            .exec();
        if (archived.matchedCount === 0) {
            const outcome = dying
                ? this.deathAlreadyRecorded(userId, characterId)
                : await this.unlinkedAnyway(userId, characterId, session);
            return { outcome, released: [] };
        }
        const released = await this.releaseQuestsOf(characterId, now, session);
        return { outcome: 'archived', released };
    }

    // la morte non stacca il personaggio corrente: lo stacca la conferma del suo foglio (D-12); solo verifica in sessione
    private async confirmLinkOf(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<boolean> {
        const linked = await this.userModel
            .exists({
                _id: userId,
                currentCharacter: { $in: idForms(characterId) },
            })
            .session(session);
        return linked !== null;
    }

    // claim inverso (03.1 D-05): solo l'utente che punta proprio a questo personaggio viene scollegato
    private async unlinkOf(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<boolean> {
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
        return unlinked !== null;
    }

    // già archiviato: nessuna morte registrata e nessuno stacco
    private deathAlreadyRecorded(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
    ): ArchiveOutcome {
        this.logger.warn(
            `Character ${characterId.toHexString()} of user ${userId.toHexString()} was already archived: no death recorded`,
        );
        return 'not-linked';
    }

    // riferimento pendente o già archiviato: si scollega comunque, altrimenti l'utente non potrebbe né creare né eliminare;
    // il morto mai confermato è la via d'uscita documentata (D-12), non un'anomalia
    private async unlinkedAnyway(
        userId: Types.ObjectId,
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<ArchiveOutcome> {
        if (await this.diedOf(characterId, session)) {
            this.logger.log(
                `Utente ${userId.toHexString()} scollegato dal personaggio morto ${characterId.toHexString()} senza conferma`,
            );
            return 'unlinked';
        }
        this.logger.warn(
            `User ${userId.toHexString()} pointed to a missing or archived character ${characterId.toHexString()}: unlinked anyway`,
        );
        return 'unlinked';
    }

    private async diedOf(
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<boolean> {
        const dead = await this.characterModel
            .exists({ _id: characterId, deletionReason: DeletionReason.death })
            .session(session);
        return dead !== null;
    }

    // solo le quest lette in sessione: nessuna scansione della collection, nessun documento estraneo;
    // dopo l'avvio il posto resta come segnaposto fino alla conclusione (utente 2026-10-27);
    // una quest avviata senza nessun personaggio attivo torna non avviata
    private async releaseSeatsOf(
        characterId: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<void> {
        const seated = await this.questModel
            .find(
                {
                    'registeredAdventurers.character': {
                        $in: idForms(characterId),
                    },
                },
                { _id: 1 },
            )
            .session(session)
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        if (seated.length === 0) return;
        const seatedIds = seated.map(({ _id }) => _id);
        const release = unstartedSeatReleaseOf(seatedIds, characterId);
        await this.questModel
            .updateMany(release.filter, release.update, { session })
            .exec();
        const mark = placeholderMarkOf(seatedIds, characterId, now);
        await this.questModel
            .updateMany(mark.filter, mark.update, {
                session,
                arrayFilters: mark.arrayFilters,
            })
            .exec();
        await this.resetQuestsWithoutActiveRegistrants(seatedIds, session);
    }

    private async resetQuestsWithoutActiveRegistrants(
        questIds: Types.ObjectId[],
        session: ClientSession,
    ): Promise<void> {
        const started = await this.questModel
            .find(
                {
                    _id: { $in: questIds },
                    concludedAt: null,
                    startedAt: { $ne: null },
                },
                { registeredAdventurers: 1 },
            )
            .session(session)
            .lean<
                {
                    _id: Types.ObjectId;
                    registeredAdventurers?: { character?: unknown }[];
                }[]
            >()
            .exec();
        for (const quest of started) {
            const active = await this.characterModel
                .exists(
                    activeRegistrantFilterOf(quest.registeredAdventurers ?? []),
                )
                .session(session);
            if (active) continue;
            const reset = startedQuestResetOf(quest._id);
            await this.questModel
                .updateOne(reset.filter, reset.update, { session })
                .exec();
        }
    }

    // posti liberati (Phase 8 D-30); il ferito esce dalle aid aperte che lo soccorrono e la aid resta aperta finché c'è qualcuno da soccorrere (D-09): nessuna aid orfana sulla board;
    // le aid non avviate che il passo conclude liberano i soccorritori iscritti con la routine del timeout (D-16, D-27)
    private async releaseQuestsOf(
        characterId: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<ReleasedRescuers[]> {
        await this.releaseSeatsOf(characterId, now, session);
        const aids = await this.questModel
            .find(
                { 'rescue.characters': characterId, concludedAt: null },
                { _id: 1, startedAt: 1, 'rescue.characters': 1 },
                { session },
            )
            .lean<(WoundedAid & { _id: Types.ObjectId })[]>()
            .exec();
        if (aids.length === 0) return [];
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
        return this.releaseRescuersOf(
            aids
                .filter(concludedUnstartedBy(characterId))
                .map(({ _id }) => _id),
            session,
        );
    }

    private async releaseRescuersOf(
        aidIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<ReleasedRescuers[]> {
        const models = {
            questModel: this.questModel,
            characterModel: this.characterModel,
            pendingQuestModel: this.pendingQuestModel,
        };
        const released: ReleasedRescuers[] = [];
        for (const questId of aidIds) {
            const characterIds = await releaseRegisteredWithin(
                models,
                questId,
                session,
                this.logger,
            );
            if (characterIds.length > 0)
                released.push({ questId, characterIds });
        }
        return released;
    }
}

interface WoundedAid {
    startedAt?: Date | null;
    rescue?: { characters?: unknown[] } | null;
}

// stessa condizione dell'update che conclude (nessun altro ferito); l'aid avviata svuotata dall'archivio resta fuori (RESEARCH Q11)
function concludedUnstartedBy(characterId: Types.ObjectId) {
    return ({ startedAt, rescue }: WoundedAid): boolean =>
        startedAt == null &&
        (rescue?.characters ?? []).every(
            (wounded) =>
                wounded instanceof Types.ObjectId &&
                wounded.equals(characterId),
        );
}
