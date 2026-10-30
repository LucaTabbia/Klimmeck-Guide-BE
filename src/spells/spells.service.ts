import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Spell, SpellDocument } from 'src/models/spell.model';

@Injectable()
export class SpellsService {
    constructor(
        @InjectModel(Spell.name) private spellModel: Model<SpellDocument>,
    ) {}

    async findAll(): Promise<Spell[]> {
        return await this.spellModel.find().exec();
    }

    async findOne(id: string): Promise<Spell> {
        const spell = await this.spellModel.findById(id).exec();
        if (!spell) throw ResourceNotFoundException.spell();
        return spell;
    }
}
