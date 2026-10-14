import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { CharacterAccessPolicy } from 'src/authz/ownership/character-access.policy';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { User, UserSchema } from 'src/models/user.model';

// policy e decisioni esportate: i guard di metodo vengono istanziati nel modulo che ospita il resolver
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
    ],
    providers: [CharacterAccessPolicy, AuthorizationDecisions],
    exports: [CharacterAccessPolicy, AuthorizationDecisions],
})
export class AuthzModule {}
