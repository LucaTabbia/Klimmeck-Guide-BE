import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PetsResolver } from './pets.resolver';
import { PetsService } from './pets.service';
import { Pet, PetSchema } from 'src/models/pet.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Pet.name, schema: PetSchema },
        ]),
    ],
    providers: [PetsService, PetsResolver],
    exports: [PetsService],
})
export class PetsModule { }
