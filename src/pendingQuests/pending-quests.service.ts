import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';

@Injectable()
export class PendingQuestsService {
    constructor(
        @InjectModel(PendingQuest.name)
        private pendingQuestModel: Model<PendingQuestDocument>,
    ) {}

    async findAll(): Promise<PendingQuest[]> {
        return await this.pendingQuestModel.find().exec();
    }

    async findOne(id: string): Promise<PendingQuest> {
        const pendingQuest = await this.pendingQuestModel.findById(id).exec();
        if (!pendingQuest) throw ResourceNotFoundException.pendingQuest();
        return pendingQuest;
    }
}
