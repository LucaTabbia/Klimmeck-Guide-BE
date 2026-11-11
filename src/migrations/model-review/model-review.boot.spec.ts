// UNA TANTUM (Phase 19 D-12): prova il boot a passi della revisione dei modelli — esce dal repo dopo il boot reale
import { Logger } from '@nestjs/common';
import { ModelReviewBoot } from './model-review.boot';
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
        await boot([
            stepNamed('primo', FIRST_REPORT),
            stepNamed('secondo', SECOND_REPORT),
        ]).onApplicationBootstrap();

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
    });

    it('logs a failed step by name and code only and runs the next one (D-12)', async () => {
        const failure = Object.assign(new Error('uri-segreta-da-non-loggare'), {
            name: 'MongoServerError',
            code: 11000,
        });

        await expect(
            boot([
                failingStepNamed('primo', failure),
                stepNamed('secondo', SECOND_REPORT),
            ]).onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(runOrder).toEqual(['primo', 'secondo']);
        expect(errorSpy.mock.calls).toEqual([
            [
                'Revisione dei modelli, primo: fallito (MongoServerError, code 11000), il boot prosegue',
            ],
        ]);
        expect(logSpy.mock.calls).toEqual([
            [
                'Revisione dei modelli, secondo: trovati 5, migrati 0, già a posto 5, senza corrispondenza 4',
            ],
        ]);
        const loggedText = JSON.stringify([
            ...logSpy.mock.calls,
            ...errorSpy.mock.calls,
        ]);
        expect(loggedText).not.toContain('uri-segreta');
    });

    it('resolves without logging when there are no steps (D-12)', async () => {
        await expect(
            boot([]).onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
