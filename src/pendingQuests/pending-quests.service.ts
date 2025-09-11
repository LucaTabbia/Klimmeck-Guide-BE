import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PendingQuest, PendingQuestDocument } from 'src/models/pending-quest.model';

@Injectable()
export class PendingQuestsService {
    constructor(@InjectModel(PendingQuest.name) private pendingQuestModel: Model<PendingQuestDocument>) { }

    async findAll(): Promise<PendingQuest[]> {
        return await this.pendingQuestModel.find().exec();
    }

    async findOne(id: string): Promise<PendingQuest> {
        const pendingQuest = await this.pendingQuestModel.findById(id).exec();
        if (!pendingQuest) throw new NotFoundException(`PendingQuest with id ${id} not found`);
        return pendingQuest;
    }
}
