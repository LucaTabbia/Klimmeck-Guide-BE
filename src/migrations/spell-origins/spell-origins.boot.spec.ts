// UNA TANTUM (Phase 24 D-07, D-20): prova il boot a passi delle origini delle magie — esce dal repo dopo il boot reale
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
    SpellOriginsBoot,
    spellOriginsBootProvider,
} from './spell-origins.boot';
import {
    type SpellOriginsStep,
    type SpellOriginsStepReport,
    stepReportLine,
} from './spell-origins.step';

const FIRST_REPORT: SpellOriginsStepReport = {
    found: 96,
    migrated: 95,
    alreadyDone: 0,
    unmatched: 1,
};
const SECOND_REPORT: SpellOriginsStepReport = {
    found: 7,
    migrated: 0,
    alreadyDone: 7,
    unmatched: 0,
};

const FIRST_STEP = Symbol('FIRST_STEP');
const SECOND_STEP = Symbol('SECOND_STEP');

@Injectable()
class LifecycleProbe implements OnModuleInit {
    completedAtModuleInit: boolean | undefined;

    constructor(private readonly boot: SpellOriginsBoot) {}

    onModuleInit(): void {
        this.completedAtModuleInit = this.boot.completed;
    }
}

describe('SpellOriginsBoot', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let runOrder: string[];

    function stepNamed(
        label: string,
        report: SpellOriginsStepReport,
    ): SpellOriginsStep {
        return {
            label,
            run: jest.fn(() => {
                runOrder.push(label);
                return Promise.resolve(report);
            }),
        };
    }

    function failingStepNamed(label: string, error: Error): SpellOriginsStep {
        return {
            label,
            run: jest.fn(() => {
                runOrder.push(label);
                return Promise.reject(error);
            }),
        };
    }

    function containerWith(first: SpellOriginsStep, second: SpellOriginsStep) {
        return Test.createTestingModule({
            providers: [
                { provide: FIRST_STEP, useValue: first },
                { provide: SECOND_STEP, useValue: second },
                spellOriginsBootProvider([FIRST_STEP, SECOND_STEP]),
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

    it('formats one line of counts for a step (D-07)', () => {
        expect(stepReportLine('magie', FIRST_REPORT)).toBe(
            'Origini delle magie, magie: trovati 96, migrati 95, già a posto 0, senza corrispondenza 1',
        );
    });

    it('runs the steps in order and logs one line of counts per step (D-07)', async () => {
        const boot = new SpellOriginsBoot([
            stepNamed('magie', FIRST_REPORT),
            stepNamed('tipo delle quest', SECOND_REPORT),
        ]);

        await boot.run();

        expect(runOrder).toEqual(['magie', 'tipo delle quest']);
        expect(logSpy.mock.calls).toEqual([
            [
                'Origini delle magie, magie: trovati 96, migrati 95, già a posto 0, senza corrispondenza 1',
            ],
            [
                'Origini delle magie, tipo delle quest: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0',
            ],
        ]);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(boot.completed).toBe(true);
    });

    it('stops the boot at the first failing step with a new error without a cause (D-07)', async () => {
        const failure = Object.assign(
            new Error('mongodb://uri-segreta-da-non-loggare'),
            { name: 'MongoServerError', code: 11000 },
        );
        const boot = new SpellOriginsBoot([
            stepNamed('magie', FIRST_REPORT),
            failingStepNamed('tipo delle quest', failure),
            stepNamed('tipo nei risultati', SECOND_REPORT),
        ]);

        const rejection = await boot.run().then(
            () => undefined,
            (error: unknown) => error,
        );

        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).message).toBe(
            'Origini delle magie: boot interrotto dal passo «tipo delle quest»',
        );
        expect((rejection as Error).cause).toBeUndefined();
        expect(runOrder).toEqual(['magie', 'tipo delle quest']);
        expect(logSpy.mock.calls).toEqual([
            [
                'Origini delle magie, magie: trovati 96, migrati 95, già a posto 0, senza corrispondenza 1',
            ],
        ]);
        expect(errorSpy.mock.calls).toEqual([
            [
                'Origini delle magie, tipo delle quest: fallito (MongoServerError, code 11000), il boot si ferma',
            ],
            [
                'Origini delle magie, boot interrotto: passi conclusi 1 su 3, fallito «tipo delle quest», non eseguiti 1',
            ],
        ]);
        expect(boot.completed).toBe(false);
        const loggedText = JSON.stringify([
            ...logSpy.mock.calls,
            ...errorSpy.mock.calls,
            String((rejection as Error).stack),
        ]);
        expect(loggedText).not.toContain('uri-segreta');
    });

    it('runs the steps inside the provider factory, before the provider resolves (D-07)', async () => {
        const provider = spellOriginsBootProvider([FIRST_STEP, SECOND_STEP]);
        const first = stepNamed('magie', FIRST_REPORT);
        const second = stepNamed('tipo delle quest', SECOND_REPORT);

        const boot = await provider.useFactory(first, second);

        expect(provider.inject).toEqual([FIRST_STEP, SECOND_STEP]);
        expect(runOrder).toEqual(['magie', 'tipo delle quest']);
        expect(boot).toBeInstanceOf(SpellOriginsBoot);
        expect(boot.completed).toBe(true);
    });

    it('ends every step before any lifecycle hook of the container (D-07)', async () => {
        const moduleRef = await containerWith(
            stepNamed('magie', FIRST_REPORT),
            stepNamed('tipo delle quest', SECOND_REPORT),
        ).compile();

        expect(runOrder).toEqual(['magie', 'tipo delle quest']);
        await moduleRef.init();

        expect(moduleRef.get(LifecycleProbe).completedAtModuleInit).toBe(true);
        await moduleRef.close();
    });

    it('fails the container when a step fails: no provider reaches its lifecycle hook (D-07)', async () => {
        const moduleInitSpy = jest.spyOn(
            LifecycleProbe.prototype,
            'onModuleInit',
        );

        await expect(
            containerWith(
                failingStepNamed('magie', new Error('guasto')),
                stepNamed('tipo delle quest', SECOND_REPORT),
            ).compile(),
        ).rejects.toThrow(
            'Origini delle magie: boot interrotto dal passo «magie»',
        );

        expect(runOrder).toEqual(['magie']);
        expect(moduleInitSpy).not.toHaveBeenCalled();
    });
});
