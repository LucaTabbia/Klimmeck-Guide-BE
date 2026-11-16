import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { SpellDocument } from 'src/models/spell.model';
import { MAX_LEVEL } from 'src/quests/outcomes/progression/level-table';
import {
    isServableSpell,
    SpellCatalogueReporter,
    unservableSpellCount,
} from './spell-catalogue.reporter';

const SOUND_SPELL = { origin: 'arcane', minLevelToLearn: 1 };

function spellModelReading(read: () => Promise<unknown[]>) {
    const lean = jest.fn().mockImplementation(read);
    const find = jest.fn().mockReturnValue({ lean });
    const model = { find } as unknown as Model<SpellDocument>;
    return { model, find };
}

describe('isServableSpell', () => {
    it.each(
        ['void', 'arcane', 'shamanic'].flatMap((origin) => [
            [origin, 1],
            [origin, 20],
        ]),
    )(
        'counts as servable a spell with one of the three origins and an integer level of at least one (D-01, D-07): %s at level %s',
        (origin, minLevelToLearn) => {
            expect(isServableSpell({ origin, minLevelToLearn })).toBe(true);
        },
    );

    it.each([[undefined], [null], [''], ['fire'], [7]])(
        'counts as unservable a spell without a valid origin (D-01): %p',
        (origin) => {
            expect(isServableSpell({ origin, minLevelToLearn: 1 })).toBe(false);
        },
    );

    it('counts as unservable a spell whose origin key is missing (D-01)', () => {
        expect(isServableSpell({ minLevelToLearn: 1 })).toBe(false);
    });

    it.each([[undefined], [null], [0], [2.5], ['6']])(
        'counts as unservable a spell without a valid minimum level (D-07): %p',
        (minLevelToLearn) => {
            expect(isServableSpell({ origin: 'void', minLevelToLearn })).toBe(
                false,
            );
        },
    );

    it.each([[MAX_LEVEL + 1], [4000]])(
        'counts as unservable a spell whose minimum level is above the top of the level table (D-07, WR-03): %p',
        (minLevelToLearn) => {
            expect(isServableSpell({ origin: 'void', minLevelToLearn })).toBe(
                false,
            );
        },
    );

    it('counts the unservable spells of a catalogue (D-01, D-07)', () => {
        expect(
            unservableSpellCount([
                SOUND_SPELL,
                { origin: 'fire', minLevelToLearn: 1 },
                { origin: 'void' },
            ]),
        ).toBe(2);
    });
});

describe('SpellCatalogueReporter', () => {
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
        error.mockRestore();
    });

    it('warns once with the number of unservable spells only (D-01, D-07)', async () => {
        const { model } = spellModelReading(() =>
            Promise.resolve([
                { _id: 'spell-sound', name: 'Scintilla', ...SOUND_SPELL },
                {
                    _id: 'spell-no-origin',
                    name: 'Meteora',
                    minLevelToLearn: 3,
                },
                { _id: 'spell-no-level', name: 'Lampo', origin: 'void' },
            ]),
        );

        await new SpellCatalogueReporter(model).onApplicationBootstrap();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]).toEqual([
            'Magie: 2 senza origine o livello minimo validi: non servibili sul filo e mai insegnate',
        ]);
        expect(error).not.toHaveBeenCalled();
    });

    it('warns about nothing on a sound catalogue (D-01, D-07)', async () => {
        const { model } = spellModelReading(() =>
            Promise.resolve([
                SOUND_SPELL,
                { origin: 'shamanic', minLevelToLearn: 9 },
            ]),
        );

        await new SpellCatalogueReporter(model).onApplicationBootstrap();

        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it('logs an error and lets the boot go on when the catalogue cannot be read (D-07)', async () => {
        const { model } = spellModelReading(() =>
            Promise.reject(
                Object.assign(new Error('down'), {
                    name: 'MongoServerError',
                    code: 6,
                }),
            ),
        );

        await expect(
            new SpellCatalogueReporter(model).onApplicationBootstrap(),
        ).resolves.toBe(undefined);

        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toBe(
            'Il catalogo delle magie non si è potuto controllare al boot (MongoServerError, code 6).',
        );
        expect(warn).not.toHaveBeenCalled();
    });

    it('projects only the origin and the minimum level (D-07)', async () => {
        const { model, find } = spellModelReading(() => Promise.resolve([]));

        await new SpellCatalogueReporter(model).onApplicationBootstrap();

        expect(find.mock.calls).toEqual([
            [{}, { origin: 1, minLevelToLearn: 1 }],
        ]);
    });
});
