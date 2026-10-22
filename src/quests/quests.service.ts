import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import {
    dropOrphanCatalogRefs,
    QUEST_CATALOG_POPULATE,
} from './quest-catalog.populate';

@Injectable()
export class QuestsService {
    constructor(
        @InjectModel(Quest.name) private questModel: Model<QuestDocument>,
    ) {}

    async findAll(): Promise<Quest[]> {
        const quests = await this.questModel
            .find()
            .populate(QUEST_CATALOG_POPULATE)
            .exec();
        quests.forEach((quest) => dropOrphanCatalogRefs(quest));
        return quests;
    }

    // id malformato = missione inesistente: NOT_FOUND tipizzato invece dell'eccezione Nest grezza (INTERNAL_SERVER_ERROR sul filo)
    async findOne(id: string): Promise<Quest> {
        const questId = objectIdFromHex(id);
        if (!questId) throw ResourceNotFoundException.quest();
        const quest = await this.questModel
            .findById(questId)
            .populate(QUEST_CATALOG_POPULATE)
            .exec();
        if (!quest) throw ResourceNotFoundException.quest();
        dropOrphanCatalogRefs(quest);
        return quest;
    }
}
