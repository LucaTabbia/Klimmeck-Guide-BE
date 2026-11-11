// UNA TANTUM (Phase 19 D-12): modulo della revisione dei modelli con la lista ordinata dei passi — esce dal repo dopo il boot reale
import { Module, type Type } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { CityShopStep } from './city-shop.step';
import { EnemySpellsStep } from './enemy-spells.step';
import { EnemyWeaknessesStep } from './enemy-weaknesses.step';
import { LoreImagePathStep } from './lore-image-path.step';
import { modelReviewBootProvider } from './model-review.boot';
import type { ModelReviewStep } from './model-review.step';
import { OwnedPetsStep } from './owned-pets.step';
import { PetCatalogStep } from './pet-catalog.step';
import { PoiQuestStep } from './poi-quest.step';
import { SpellStatesStep } from './spell-states.step';
import { WornEquipmentStep } from './worn-equipment.step';

// lista ordinata (D-13): ogni piano accoda la classe del proprio passo e aggiunge agli imports il forFeature dei modelli che legge
const STEPS: Type<ModelReviewStep>[] = [
    EnemyWeaknessesStep,
    EnemySpellsStep,
    PetCatalogStep,
    OwnedPetsStep,
    PoiQuestStep,
    CityShopStep,
    LoreImagePathStep,
    WornEquipmentStep,
    SpellStatesStep,
];

// modelli letti dai passi: i passi li prendono dalla connessione, quindi vanno registrati PRIMA che la factory del boot li esegua
const MODELS = [
    { name: Enemy.name, schema: EnemySchema },
    { name: Spell.name, schema: SpellSchema },
    { name: Pet.name, schema: PetSchema },
    { name: Character.name, schema: CharacterSchema },
    { name: PointOfInterest.name, schema: PointOfInterestSchema },
    { name: City.name, schema: CitySchema },
    { name: Lore.name, schema: LoreSchema },
];

// importato SOLO da AppModule: gli harness non migrano; rimosso prima della merge
@Module({
    imports: [MongooseModule.forFeature(MODELS)],
    providers: [
        ...STEPS,
        modelReviewBootProvider(
            STEPS,
            MODELS.map((model) => getModelToken(model.name)),
        ),
    ],
})
export class ModelReviewMigrationModule {}
