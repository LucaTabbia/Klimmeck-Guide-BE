import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterCreationResolver } from 'src/characters/creation/character-creation.resolver';
import { CharacterCreationService } from 'src/characters/creation/character-creation.service';
import { CharacterNameIndexVerifier } from 'src/characters/creation/character-name-index.verifier';
import {
    MathRandomSource,
    RandomSource,
} from 'src/characters/creation/random-source';
import { StartingCitiesReporter } from 'src/characters/creation/starting-cities.reporter';
import { StartingLocationService } from 'src/characters/creation/starting-location.service';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { User, UserSchema } from 'src/models/user.model';
import { UsersModule } from 'src/users/users.module';

// modulo proprio senza Bull (D-21): i test della creazione non richiedono Redis
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: City.name, schema: CitySchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
        ]),
        UsersModule,
    ],
    providers: [
        CharacterCreationResolver,
        CharacterCreationService,
        StartingLocationService,
        { provide: RandomSource, useClass: MathRandomSource },
        CharacterNameIndexVerifier,
        StartingCitiesReporter,
    ],
})
export class CharacterCreationModule {}
