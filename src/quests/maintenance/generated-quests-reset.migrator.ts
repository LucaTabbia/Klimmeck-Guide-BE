// UNA TANTUM (Phase 12 D-25): azzera le generate aperte al primo boot reale dal branch 13.1 e poi esce dal repo con la sua int-spec (13.1 D-06)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { idForms, refIdOf } from 'src/mongo/document-id';

export interface GeneratedQuestsResetReport {
    deleted: number;
    kept: number;
}

const OPEN_GENERATED = { generated: true, concludedAt: null } as const;
// marcatore della prima corsa: dopo il reset il generatore non crea più legend (13.1 D-02)
const LEGACY_RANK = 'legend';
const WITH_REGISTERED = { 'registeredAdventurers.0': { $exists: true } };
const WITHOUT_REGISTERED = { 'registeredAdventurers.0': { $exists: false } };

const uniqueByHex = (ids: readonly Types.ObjectId[]): Types.ObjectId[] => [
    ...new Map(ids.map((id) => [id.toHexString(), id])).values(),
];

// nessun hook di boot proprio: lo chiama QuestMaintenanceBoot prima della corsa del generatore
@Injectable()
export class GeneratedQuestsResetMigrator {
    private readonly logger = new Logger(GeneratedQuestsResetMigrator.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
    ) {}

    async migrate(): Promise<GeneratedQuestsResetReport> {
        const protectedIds = await this.protectedIds();
        const protectedForms = protectedIds.flatMap(idForms);
        // una legend protetta rimasta non fa ripartire il reset a ogni boot (raffinamento di 13.1 D-06)
        const pending = await this.questModel
            .exists({
                ...OPEN_GENERATED,
                'requirements.minTitle': LEGACY_RANK,
                _id: { $nin: protectedForms },
            })
            .exec();
        if (!pending) return { deleted: 0, kept: 0 };
        // il filtro riafferma la protezione contro una registrazione arrivata fra lettura e cancellazione
        const { deletedCount } = await this.questModel
            .deleteMany({
                ...OPEN_GENERATED,
                ...WITHOUT_REGISTERED,
                _id: { $nin: protectedForms },
            })
            .exec();
        const kept = await this.questModel
            .countDocuments(OPEN_GENERATED)
            .exec();
        this.logger.log(
            `Generate: ${deletedCount} cancellate, ${kept} lasciate`,
        );
        if (protectedIds.length > 0)
            this.logger.debug(
                `Generate protette: ${protectedIds.map((id) => id.toHexString()).join(', ')}`,
            );
        return { deleted: deletedCount, kept };
    }

    // registrate o referenziate da una pendingquests, anche con l'id salvato come stringa
    private async protectedIds(): Promise<Types.ObjectId[]> {
        const registered = await this.questModel
            .find({ ...OPEN_GENERATED, ...WITH_REGISTERED })
            .distinct('_id')
            .exec();
        const inLanes = await this.pendingQuestModel.distinct('quest').exec();
        return uniqueByHex(
            [...registered, ...inLanes].flatMap((value: unknown) => {
                const id = refIdOf(value);
                return id ? [id] : [];
            }),
        );
    }
}
