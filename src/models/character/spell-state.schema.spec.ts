import { model, Types } from 'mongoose';
import { CharacterStatusSchema } from './character-status.model';
import { SpellStateSchema } from './spell-state.model';

describe('spell state schemas', () => {
    it('stores the spell as a cast ref, the usages as a number and the recoveries as dates', () => {
        const recoveries = SpellStateSchema.path('recoveries') as unknown as {
            instance: string;
            caster: { instance: string };
        };

        expect(SpellStateSchema.path('spell').instance).toBe('ObjectId');
        expect(SpellStateSchema.path('usages').instance).toBe('Number');
        expect(recoveries.instance).toBe('Array');
        expect(recoveries.caster.instance).toBe('Date');
    });

    it('keeps the spell state without its own id', () => {
        expect(SpellStateSchema.path('_id')).toBeUndefined();
    });

    it('stores the spell states as an array of subdocuments on the status', () => {
        expect(CharacterStatusSchema.path('spellStates').instance).toBe(
            'Array',
        );
        expect(
            (
                CharacterStatusSchema.path('spellStates') as unknown as {
                    schema: unknown;
                }
            ).schema,
        ).toBe(SpellStateSchema);
    });

    it('defaults the spell states to an empty array for new and legacy statuses', () => {
        const Status = model(
            'CharacterStatusSpellStateProbe',
            CharacterStatusSchema,
        );

        expect(
            new Status({ location: new Types.ObjectId(), title: 'rookie' })
                .spellStates,
        ).toHaveLength(0);
        expect(
            Status.hydrate({ location: new Types.ObjectId(), title: 'rookie' })
                .spellStates,
        ).toHaveLength(0);
    });

    it('casts a hex spell id and a date string, and requires spell and usages', () => {
        const State = model('SpellStateProbe', SpellStateSchema);
        const state = new State({
            spell: new Types.ObjectId().toHexString(),
            usages: 2,
            recoveries: ['2026-10-27T10:00:00.000Z'],
        });

        expect(state.validateSync()).toBeUndefined();
        expect(state.spell instanceof Types.ObjectId).toBe(true);
        expect(state.recoveries[0]).toEqual(
            new Date('2026-10-27T10:00:00.000Z'),
        );

        const errors = new State({}).validateSync()?.errors ?? {};

        for (const path of ['spell', 'usages']) {
            expect(errors[path]).toBeDefined();
        }
        expect(
            new State({ spell: new Types.ObjectId(), usages: 1 }).recoveries,
        ).toHaveLength(0);
    });
});
