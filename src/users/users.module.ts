import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver';
import { TwitchIdIndexVerifier } from './twitch-id-index.verifier';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { User, UserSchema } from 'src/models/user.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
        ]),
    ],
    providers: [UsersService, UsersResolver, TwitchIdIndexVerifier],
    exports: [UsersService],
})
export class UsersModule {}
