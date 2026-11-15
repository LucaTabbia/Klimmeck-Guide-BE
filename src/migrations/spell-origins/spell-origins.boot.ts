// UNA TANTUM (Phase 24 D-07, D-20): esegue i passi delle origini delle magie dentro la factory di un provider, prima di ogni lifecycle hook; un passo fallito ferma il boot — esce dal repo dopo il boot reale
import {
    type FactoryProvider,
    type InjectionToken,
    Logger,
} from '@nestjs/common';
import { describeError } from 'src/mongo/mongo-errors';
import {
    bootAbortedLine,
    bootAbortedMessage,
    type SpellOriginsStep,
    type SpellOriginsStepReport,
    stepFailureLine,
    stepReportLine,
} from './spell-origins.step';

export class SpellOriginsBoot {
    private readonly logger = new Logger(SpellOriginsBoot.name);

    private completedSteps = 0;

    constructor(private readonly steps: readonly SpellOriginsStep[]) {}

    get completed(): boolean {
        return this.completedSteps === this.steps.length;
    }

    async run(): Promise<void> {
        for (const step of this.steps) {
            await this.runOrAbort(step);
            this.completedSteps += 1;
        }
    }

    private async runOrAbort(step: SpellOriginsStep): Promise<void> {
        let report: SpellOriginsStepReport;
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

// Nest attende le factory asincrone di TUTTI i provider prima del primo onModuleInit: i passi finiscono prima dei processor Bull, degli sweep, di HTTP e WS.
// `prerequisites` sono provider da avere pronti prima dei passi (i modelli registrati sulla connessione).
export function spellOriginsBootProvider(
    steps: readonly InjectionToken[],
    prerequisites: readonly InjectionToken[] = [],
): FactoryProvider<SpellOriginsBoot> {
    return {
        provide: SpellOriginsBoot,
        useFactory: async (...resolved: unknown[]) => {
            const boot = new SpellOriginsBoot(
                resolved.slice(0, steps.length) as SpellOriginsStep[],
            );
            await boot.run();
            return boot;
        },
        inject: [...steps, ...prerequisites],
    };
}
