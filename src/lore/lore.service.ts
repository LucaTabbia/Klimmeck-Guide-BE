import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Lore, LoreDocument } from 'src/models/lore.model';

@Injectable()
export class LoreService {
    constructor(
        @InjectModel(Lore.name) private loreModel: Model<LoreDocument>,
    ) {}

    async findAll(): Promise<Lore[]> {
        return await this.loreModel.find().exec();
    }

    async findOne(id: string): Promise<Lore> {
        const lore = await this.loreModel.findById(id).exec();
        if (!lore) throw ResourceNotFoundException.lore();
        return lore;
    }
}
