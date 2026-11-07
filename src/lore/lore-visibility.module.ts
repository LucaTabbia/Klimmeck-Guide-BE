import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { User, UserSchema } from 'src/models/user.model';
import {
    CityRelatedLoreResolver,
    EnemyRelatedLoreResolver,
    LoreRelatedLoreResolver,
} from './related-lore.resolvers';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: Lore.name, schema: LoreSchema },
        ]),
    ],
    providers: [
        ViewerKnowledgeService,
        LoreRelatedLoreResolver,
        CityRelatedLoreResolver,
        EnemyRelatedLoreResolver,
    ],
    exports: [ViewerKnowledgeService],
})
export class LoreVisibilityModule {}
