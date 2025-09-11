import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';

@Injectable()
export class QuestsService {
    constructor(@InjectModel(Quest.name) private questModel: Model<QuestDocument>) { }

    async findAll(): Promise<Quest[]> {
        return await this.questModel.find().exec();
    }

    async findOne(id: string): Promise<Quest> {
        const quest = await this.questModel.findById(id).exec();
        if (!quest) throw new NotFoundException(`Quest with id ${id} not found`);
        return quest;
    }
}
