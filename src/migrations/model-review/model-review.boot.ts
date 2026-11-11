// UNA TANTUM (Phase 19 D-12): esegue al boot i passi della revisione dei modelli, in ordine e mai bloccanti — esce dal repo dopo il boot reale
import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import {
    MODEL_REVIEW_STEPS,
    type ModelReviewStep,
    stepFailureLine,
    stepReportLine,
} from './model-review.step';

@Injectable()
export class ModelReviewBoot implements OnApplicationBootstrap {
    private readonly logger = new Logger(ModelReviewBoot.name);

    constructor(
        @Inject(MODEL_REVIEW_STEPS)
        private readonly steps: readonly ModelReviewStep[],
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        for (const step of this.steps) {
            await this.runLogged(step);
        }
    }

    private async runLogged(step: ModelReviewStep): Promise<void> {
        try {
            this.logger.log(stepReportLine(step.label, await step.run()));
        } catch (error) {
            this.logger.error(
                stepFailureLine(step.label, describeError(error)),
            );
        }
    }
}
