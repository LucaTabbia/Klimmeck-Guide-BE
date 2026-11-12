import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WeaknessesModule } from 'src/enemies/weaknesses.module';
import { LoreVisibilityModule } from 'src/lore/lore-visibility.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { User, UserSchema } from 'src/models/user.model';
import { QuestNoEffectResolver } from './no-effect/quest-no-effect.resolver';
import { ViewerVitalsService } from './no-effect/viewer-vitals.service';
import { QuestsPublisher } from './quests.publisher';
import { QuestsResolver } from './quests.resolver';
import { QuestsService } from './quests.service';

// modulo autosufficiente: registra ogni modello che il populate del catalogo attraversa (C3)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: Lore.name, schema: LoreSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Spell.name, schema: SpellSchema },
            { name: Pet.name, schema: PetSchema },
            // registrati localmente come push.module.ts: nessun change stream, i moduli degli utenti e dei personaggi non si importano (13.1 D-05)
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: City.name, schema: CitySchema },
        ]),
        LoreVisibilityModule,
        WeaknessesModule,
    ],
    providers: [
        QuestsService,
        QuestsResolver,
        QuestsPublisher,
        ViewerVitalsService,
        QuestNoEffectResolver,
    ],
    exports: [QuestsService],
})
export class QuestsModule {}
