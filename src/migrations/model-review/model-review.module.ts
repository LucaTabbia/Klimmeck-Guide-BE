// UNA TANTUM (Phase 19 D-12): modulo della revisione dei modelli con la lista ordinata dei passi — esce dal repo dopo il boot reale
import { Module, type Type } from '@nestjs/common';
import { ModelReviewBoot } from './model-review.boot';
import { MODEL_REVIEW_STEPS, type ModelReviewStep } from './model-review.step';

// lista ordinata (D-13): ogni piano accoda la classe del proprio passo e aggiunge agli imports il forFeature dei modelli che legge
const STEPS: Type<ModelReviewStep>[] = [];

// importato SOLO da AppModule: gli harness non migrano; rimosso prima della merge
@Module({
    imports: [],
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
