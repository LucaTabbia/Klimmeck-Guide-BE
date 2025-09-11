import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Character, CharacterDocument } from 'src/models/character/character.model';

@Injectable()
export class CharactersService {
    constructor(@InjectModel(Character.name) private characterModel: Model<CharacterDocument>) { }

    async findAll(): Promise<Character[]> {
        return await this.characterModel.find().exec();
    }

    async findOne(id: string): Promise<Character> {
        const character = await this.characterModel.findById(id).exec();
        if (!character) throw new NotFoundException(`Character with id ${id} not found`);
        return character;
    }
}
