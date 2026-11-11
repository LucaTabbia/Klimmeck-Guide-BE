// UNA TANTUM (Phase 19 D-12): modulo della revisione dei modelli con la lista ordinata dei passi — esce dal repo dopo il boot reale
import { Module, type Type } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { EnemySpellsStep } from './enemy-spells.step';
import { EnemyWeaknessesStep } from './enemy-weaknesses.step';
import { ModelReviewBoot } from './model-review.boot';
import { MODEL_REVIEW_STEPS, type ModelReviewStep } from './model-review.step';
import { OwnedPetsStep } from './owned-pets.step';
import { PetCatalogStep } from './pet-catalog.step';

// lista ordinata (D-13): ogni piano accoda la classe del proprio passo e aggiunge agli imports il forFeature dei modelli che legge
const STEPS: Type<ModelReviewStep>[] = [
    EnemyWeaknessesStep,
    EnemySpellsStep,
    PetCatalogStep,
    OwnedPetsStep,
];

// importato SOLO da AppModule: gli harness non migrano; rimosso prima della merge
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Enemy.name, schema: EnemySchema },
            { name: Spell.name, schema: SpellSchema },
            { name: Pet.name, schema: PetSchema },
            { name: Character.name, schema: CharacterSchema },
        ]),
    ],
    providers: [
        ...STEPS,
        {
            provide: MODEL_REVIEW_STEPS,
            useFactory: (...steps: ModelReviewStep[]) => steps,
            inject: STEPS,
        },
        ModelReviewBoot,
    ],
})
export class ModelReviewMigrationModule {}
