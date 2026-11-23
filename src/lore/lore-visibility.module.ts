import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { User, UserSchema } from 'src/models/user.model';
import { KnownEnemiesResolver } from './known-enemies.resolver';
import { KnownPetsResolver } from './known-pets.resolver';
import { LoreCreatureLoader } from './lore-creature.loader';
import { LoreCreatureResolver } from './lore-creature.resolver';
import {
    CityRelatedLoreResolver,
    EnemyRelatedLoreResolver,
    LootItemRelatedLoreResolver,
    LoreRelatedLoreResolver,
    PetRelatedLoreResolver,
    SpellRelatedLoreResolver,
    VisibleLoreLoader,
} from './related-lore.resolvers';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: Lore.name, schema: LoreSchema },
            // la creatura di una lore (quick 261123-lcv); Spell per il populate di Enemy.spells
            { name: Enemy.name, schema: EnemySchema },
            { name: Pet.name, schema: PetSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
    ],
    providers: [
        ViewerKnowledgeService,
        LoreRelatedLoreResolver,
        CityRelatedLoreResolver,
        EnemyRelatedLoreResolver,
        VisibleLoreLoader,
        LootItemRelatedLoreResolver,
        PetRelatedLoreResolver,
        SpellRelatedLoreResolver,
        KnownEnemiesResolver,
        KnownPetsResolver,
        LoreCreatureLoader,
        LoreCreatureResolver,
    ],
    exports: [ViewerKnowledgeService],
})
export class LoreVisibilityModule {}
