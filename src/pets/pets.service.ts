import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pet, PetDocument } from 'src/models/pet.model';

@Injectable()
export class PetsService {
    constructor(@InjectModel(Pet.name) private petModel: Model<PetDocument>) { }

    async findAll(): Promise<Pet[]> {
        return await this.petModel.find().exec();
    }

    async findOne(id: string): Promise<Pet> {
        const pet = await this.petModel.findById(id).exec();
        if (!pet) throw new NotFoundException(`Pet with id ${id} not found`);
        return pet;
    }
}
