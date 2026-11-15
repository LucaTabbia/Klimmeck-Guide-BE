import { Logger } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { PetDocument } from 'src/models/pet.model';
import { PetRecoveryCatalogReporter } from './pet-recovery-catalog.reporter';

type CatalogueRow = { _id: string; name: string; recoveryTime?: unknown };

const CATALOGUE: CatalogueRow[] = [
    { _id: 'pet-curated', name: 'Lupo', recoveryTime: 3_600_000 },
    { _id: 'pet-null', name: 'Gatto', recoveryTime: null },
    { _id: 'pet-zero', name: 'Corvo', recoveryTime: 0 },
    { _id: 'pet-missing', name: 'Rospo' },
    { _id: 'pet-fraction', name: 'Falco', recoveryTime: 1.5 },
];

function petModelReading(exec: () => Promise<CatalogueRow[]>) {
    return {
        find: () => ({ lean: () => ({ exec }) }),
    } as unknown as Model<PetDocument>;
}

function reporterOf(rows: CatalogueRow[]): PetRecoveryCatalogReporter {
    return new PetRecoveryCatalogReporter(
        petModelReading(() => Promise.resolve(rows)),
    );
}

describe('PetRecoveryCatalogReporter', () => {
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    afterEach(() => {
        warn.mockRestore();
        error.mockRestore();
    });

    it('counts the pets without a valid recovery time (D-25)', async () => {
        await expect(reporterOf(CATALOGUE).countUncurated()).resolves.toBe(4);
    });

    it('warns at boot with the count only (D-25)', async () => {
        await reporterOf(CATALOGUE).onApplicationBootstrap();

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('4');
        for (const row of CATALOGUE) {
            expect(message).not.toContain(row._id);
            expect(message).not.toContain(row.name);
        }
    });

    it('stays silent when every pet is curated (D-01)', async () => {
        await reporterOf([CATALOGUE[0]]).onApplicationBootstrap();

        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it('never fails the boot when the catalogue cannot be read (D-25)', async () => {
        const failure = Object.assign(new Error('boom'), {
            name: 'MongoServerError',
            code: 13,
        });
        const reporter = new PetRecoveryCatalogReporter(
            petModelReading(() => Promise.reject(failure)),
        );

        await expect(
            reporter.onApplicationBootstrap(),
        ).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain(
            'MongoServerError, code 13',
        );
        expect(warn).not.toHaveBeenCalled();
    });
});
