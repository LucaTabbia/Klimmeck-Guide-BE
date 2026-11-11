// UNA TANTUM (Phase 19 D-12): prova il boot a passi della revisione dei modelli — esce dal repo dopo il boot reale
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ModelReviewBoot, modelReviewBootProvider } from './model-review.boot';
import {
    type ModelReviewStep,
    type ModelReviewStepReport,
    stepReportLine,
} from './model-review.step';

const FIRST_REPORT: ModelReviewStepReport = {
    found: 3,
    migrated: 2,
    alreadyDone: 1,
    unmatched: 0,
};
const SECOND_REPORT: ModelReviewStepReport = {
    found: 5,
    migrated: 0,
    alreadyDone: 5,
    unmatched: 4,
};

const FIRST_STEP = Symbol('FIRST_STEP');
const SECOND_STEP = Symbol('SECOND_STEP');

@Injectable()
class LifecycleProbe implements OnModuleInit {
    completedAtModuleInit: boolean | undefined;

    constructor(private readonly boot: ModelReviewBoot) {}

    onModuleInit(): void {
        this.completedAtModuleInit = this.boot.completed;
    }
}

describe('ModelReviewBoot', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let runOrder: string[];

    function stepNamed(
        label: string,
        report: ModelReviewStepReport,
    ): ModelReviewStep {
        return {
            label,
            run: jest.fn(() => {
                runOrder.push(label);
                return Promise.resolve(report);
            }),
        };
    }

    function failingStepNamed(label: string, error: Error): ModelReviewStep {
        return {
            label,
            run: jest.fn(() => {
                runOrder.push(label);
                return Promise.reject(error);
            }),
        };
    }

    function boot(steps: readonly ModelReviewStep[]): ModelReviewBoot {
        return new ModelReviewBoot(steps);
    }

    // contenitore Nest vero: la factory del boot più una sonda di lifecycle
    function containerWith(first: ModelReviewStep, second: ModelReviewStep) {
        return Test.createTestingModule({
            providers: [
                { provide: FIRST_STEP, useValue: first },
                { provide: SECOND_STEP, useValue: second },
                modelReviewBootProvider([FIRST_STEP, SECOND_STEP]),
                LifecycleProbe,
            ],
        });
    }

    beforeEach(() => {
        runOrder = [];
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('formats one line of counts for a step (D-12)', () => {
        expect(
            stepReportLine('debolezze dei nemici', {
                found: 206,
                migrated: 206,
                alreadyDone: 0,
                unmatched: 0,
            }),
        ).toBe(
            'Revisione dei modelli, debolezze dei nemici: trovati 206, migrati 206, già a posto 0, senza corrispondenza 0',
        );
    });

    it('runs the steps in the given order and logs one line per step (D-12)', async () => {
        const modelReviewBoot = boot([
            stepNamed('primo', FIRST_REPORT),
            stepNamed('secondo', SECOND_REPORT),
        ]);

        await modelReviewBoot.run();

        expect(runOrder).toEqual(['primo', 'secondo']);
        expect(logSpy.mock.calls).toEqual([
            [
                'Revisione dei modelli, primo: trovati 3, migrati 2, già a posto 1, senza corrispondenza 0',
            ],
            [
                'Revisione dei modelli, secondo: trovati 5, migrati 0, già a posto 5, senza corrispondenza 4',
            ],
        ]);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(modelReviewBoot.completed).toBe(true);
    });

    it('stops at a failed step, logs it by name and code only with a summary, and rejects (C-WR-05)', async () => {
        const failure = Object.assign(new Error('uri-segreta-da-non-loggare'), {
            name: 'MongoServerError',
            code: 11000,
        });
        const modelReviewBoot = boot([
            stepNamed('primo', FIRST_REPORT),
            failingStepNamed('secondo', failure),
            stepNamed('terzo', SECOND_REPORT),
        ]);

        const rejection = await modelReviewBoot.run().then(
            () => undefined,
            (error: unknown) => error,
        );

        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).message).toBe(
            'Revisione dei modelli: boot interrotto dal passo «secondo»',
        );
        expect((rejection as Error).cause).toBeUndefined();
        expect(runOrder).toEqual(['primo', 'secondo']);
        expect(logSpy.mock.calls).toEqual([
            [
                'Revisione dei modelli, primo: trovati 3, migrati 2, già a posto 1, senza corrispondenza 0',
            ],
        ]);
        expect(errorSpy.mock.calls).toEqual([
            [
                'Revisione dei modelli, secondo: fallito (MongoServerError, code 11000), il boot si ferma',
            ],
            [
                'Revisione dei modelli, boot interrotto: passi conclusi 1 su 3, fallito «secondo», non eseguiti 1',
            ],
        ]);
        expect(modelReviewBoot.completed).toBe(false);
        const loggedText = JSON.stringify([
            ...logSpy.mock.calls,
            ...errorSpy.mock.calls,
            String((rejection as Error).stack),
        ]);
        expect(loggedText).not.toContain('uri-segreta');
    });

    it('resolves without logging when there are no steps (D-12)', async () => {
        await expect(boot([]).run()).resolves.toBeUndefined();

        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('ends every step inside the provider factory, before any lifecycle hook (C-CR-01)', async () => {
        const moduleRef = await containerWith(
            stepNamed('primo', FIRST_REPORT),
            stepNamed('secondo', SECOND_REPORT),
        ).compile();

        // nessun init: i passi sono già conclusi quando il contenitore è pronto
        expect(runOrder).toEqual(['primo', 'secondo']);
        expect(moduleRef.get(LifecycleProbe).completedAtModuleInit).toBe(
            undefined,
        );

        await moduleRef.init();

        expect(moduleRef.get(LifecycleProbe).completedAtModuleInit).toBe(true);
        await moduleRef.close();
    });

    it('fails the container when a step fails: no provider reaches its lifecycle hook (C-WR-05)', async () => {
        const moduleInitSpy = jest.spyOn(
            LifecycleProbe.prototype,
            'onModuleInit',
        );

        await expect(
            containerWith(
                failingStepNamed('primo', new Error('guasto')),
                stepNamed('secondo', SECOND_REPORT),
            ).compile(),
        ).rejects.toThrow(
            'Revisione dei modelli: boot interrotto dal passo «primo»',
        );

        expect(runOrder).toEqual(['primo']);
        expect(moduleInitSpy).not.toHaveBeenCalled();
    });
});
