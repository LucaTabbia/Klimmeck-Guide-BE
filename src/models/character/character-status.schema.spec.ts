import { model } from 'mongoose';
import { buildCharacter } from '../../../test/fixtures/character.fixture';
import { CharacterSchema } from './character.model';
import { CharacterAssetsSchema } from './character-assets.model';
import { CharacterStatusSchema } from './character-status.model';

const PotionRecoveryCharacterProbe = model(
    'PotionRecoveryCharacterProbe',
    CharacterSchema,
);

describe('character status potion recovery', () => {
    it('defaults the potion recovery of a character to null (D-15)', () => {
        const character = new PotionRecoveryCharacterProbe(
            buildCharacter(),
        ).toObject();

        expect(character.status.potionRecoveryUntil).toBeNull();
        expect(CharacterStatusSchema.path('potionRecoveryUntil').instance).toBe(
            'Date',
        );
    });

    it('stores the end of the potion recovery as a date (D-15)', () => {
        const until = new Date('2026-11-10T12:30:00.000Z');
        const character = new PotionRecoveryCharacterProbe(
            buildCharacter({
                status: {
                    ...buildCharacter().status,
                    potionRecoveryUntil: until,
                },
            }),
        );
        const stored = character.toObject().status.potionRecoveryUntil;

        expect(character.validateSync()).toBeUndefined();
        expect(stored).toBeInstanceOf(Date);
        expect(stored?.getTime()).toBe(until.getTime());
    });
});

describe('character status imprisonment', () => {
    it('defaults the prison release of a character to null (quick 261110-cgd)', () => {
        const character = new PotionRecoveryCharacterProbe(
            buildCharacter(),
        ).toObject();

        expect(character.status.imprisonedUntil).toBeNull();
        expect(CharacterStatusSchema.path('imprisonedUntil').instance).toBe(
            'Date',
        );
    });
});

describe('character spell lists', () => {
    it('keeps the spell states as the only spell list of the character (D-07)', () => {
        const spellPaths = Object.keys(CharacterStatusSchema.paths)
            .filter((path) => path.startsWith('spell'))
            .sort();

        expect(spellPaths).toEqual(['spellStates']);
        expect(Object.keys(CharacterAssetsSchema.paths).sort()).toEqual([
            'ownedEquipments',
            'ownedItems',
            'ownedPets',
            'pet',
            'wornEquipment',
        ]);
    });
});
