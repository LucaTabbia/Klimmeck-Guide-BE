// UNA TANTUM (Phase 19 D-12): esegue i passi della revisione dei modelli dentro la factory di un provider, prima di ogni lifecycle hook; un passo fallito ferma il boot — esce dal repo dopo il boot reale
import {
    type FactoryProvider,
    type InjectionToken,
    Logger,
} from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import {
    bootAbortedLine,
    bootAbortedMessage,
    type ModelReviewStep,
    type ModelReviewStepReport,
    stepFailureLine,
    stepReportLine,
} from './model-review.step';

export class ModelReviewBoot {
    private readonly logger = new Logger(ModelReviewBoot.name);

    private completedSteps = 0;

    constructor(private readonly steps: readonly ModelReviewStep[]) {}

    get completed(): boolean {
        return this.completedSteps === this.steps.length;
    }

    async run(): Promise<void> {
        for (const step of this.steps) {
            await this.runOrAbort(step);
            this.completedSteps += 1;
        }
    }

    private async runOrAbort(step: ModelReviewStep): Promise<void> {
        let report: ModelReviewStepReport;
        try {
            report = await step.run();
        } catch (error) {
            this.logger.error(
                stepFailureLine(step.label, describeError(error)),
            );
            this.logger.error(
                bootAbortedLine({
                    completed: this.completedSteps,
                    total: this.steps.length,
                    failedLabel: step.label,
                }),
            );
            // errore nuovo e senza causa: Nest ne stampa lo stack, quello del driver potrebbe portare l'URI
            throw new Error(bootAbortedMessage(step.label));
        }
        this.logger.log(stepReportLine(step.label, report));
    }
}

// Nest attende le factory asincrone di TUTTI i provider prima del primo onModuleInit: i passi finiscono prima dei processor Bull, degli sweep e del taglio delle magie.
// `prerequisites` sono provider da avere pronti prima dei passi (i modelli registrati sulla connessione).
export function modelReviewBootProvider(
    steps: readonly InjectionToken[],
    prerequisites: readonly InjectionToken[] = [],
): FactoryProvider<ModelReviewBoot> {
    return {
        provide: ModelReviewBoot,
        useFactory: async (...resolved: unknown[]) => {
            const boot = new ModelReviewBoot(
                resolved.slice(0, steps.length) as ModelReviewStep[],
            );
            await boot.run();
            return boot;
        },
        inject: [...steps, ...prerequisites],
    };
}
