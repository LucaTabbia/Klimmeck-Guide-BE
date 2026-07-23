import mongoose from 'mongoose';
import { SpellSchema } from 'src/models/spell.model';
import { PointOfInterestSchema } from 'src/models/point-of-interest.model';
import { CharacterSchema } from 'src/models/character/character.model';
import { persistSpell, persistCharacter } from './index';

/**
 * INTEGRATION: persistX round-trips fixtures on the shared MongoMemoryReplSet.
 * The mongoose connection is opened once by test/setup/after-env.ts; here we
 * only register the schemas we need (guarding against OverwriteModelError).
 */
const SpellModel =
    mongoose.models.Spell || mongoose.model('Spell', SpellSchema);
const PoiModel =
    mongoose.models.PointOfInterest ||
    mongoose.model('PointOfInterest', PointOfInterestSchema);
const CharacterModel =
    mongoose.models.Character ||
    mongoose.model('Character', CharacterSchema);

describe('fixtures persistence (replSet)', () => {
    describe('persistSpell', () => {
        it('writes a valid spell document', async () => {
            const spell = await persistSpell(SpellModel);
            expect(spell._id).toBeDefined();
            expect(spell.name).toBe('Test Spell');
            expect(spell.useType).toBe('attack');
            expect(spell.energyDamage.type).toBe('fire');
        });

        it('honours overrides on persisted document', async () => {
            const spell = await persistSpell(SpellModel, { maxUsages: 7 });
            expect(spell.maxUsages).toBe(7);
        });
    });

    describe('persistCharacter', () => {
        it('persists with a real POI location — no ValidationError on required location', async () => {
            const character = await persistCharacter(
                CharacterModel,
                {},
                PoiModel,
            );
            expect(character._id).toBeDefined();
            expect(character.status.location).toBeDefined();

            // location must reference an actually persisted POI
            const poi = await PoiModel.findById(character.status.location);
            expect(poi).not.toBeNull();

            // reload from DB to prove it round-trips without validation errors
            const reloaded = await CharacterModel.findById(character._id);
            expect(reloaded).not.toBeNull();
            expect(reloaded.status.xp).toBe(20000);
        });
    });
});
