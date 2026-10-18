import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import mongoose, { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Spell, SpellDocument, SpellSchema } from 'src/models/spell.model';
import {
    buildCharacter,
    persistCharacter,
    persistSpell,
} from '../../test/fixtures';
import {
    SpellRecoveryJobData,
    SpellRecoveryProcessor,
} from './spell-recovery.processor';

const CharacterModel: Model<CharacterDocument> =
    mongoose.models.Character ||
    mongoose.model(Character.name, CharacterSchema);
const PoiModel: Model<PointOfInterest> =
    mongoose.models.PointOfInterest ||
    mongoose.model(PointOfInterest.name, PointOfInterestSchema);
const SpellModel: Model<SpellDocument> =
    mongoose.models.Spell || mongoose.model(Spell.name, SpellSchema);

interface RawCharacter {
    deletedAt?: Date | null;
    assets: { activeSpells: { usages: number }[] };
}

describe('SpellRecoveryProcessor on archived characters (replSet)', () => {
    let warnSpy: jest.SpyInstance;
    const processor = new SpellRecoveryProcessor(
        CharacterModel as never,
        SpellModel as never,
    );

    beforeEach(() => {
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all([
            CharacterModel.deleteMany({}),
            PoiModel.deleteMany({}),
            SpellModel.deleteMany({}),
        ]);
    });

    async function persistWithActiveSpell(
        overrides: Record<string, unknown> = {},
    ) {
        const spell = await persistSpell(SpellModel);
        const character = await persistCharacter(
            CharacterModel,
            {
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: spell._id, usages: 0 }],
                },
                ...overrides,
            },
            PoiModel,
        );
        const job = {
            data: {
                characterId: String(character._id),
                spellId: String(spell._id),
            },
        } as Job<SpellRecoveryJobData>;
        return { character, job };
    }

    async function rawCharacter(id: unknown): Promise<RawCharacter> {
        const raw = await CharacterModel.collection.findOne({
            _id: id as never,
        });
        expect(raw).not.toBeNull();
        return raw as unknown as RawCharacter;
    }

    it('skips an archived character', async () => {
        const deletedAt = new Date('2026-01-01T00:00:00.000Z');
        const { character, job } = await persistWithActiveSpell({
            deletedAt,
            deletionReason: DeletionReason.user_request,
        });

        await processor.handleSpellRecovery(job);

        const raw = await rawCharacter(character._id);
        expect(raw.assets.activeSpells[0].usages).toBe(0);
        expect(raw.deletedAt).toEqual(deletedAt);
        const warnings = warnSpy.mock.calls.map(([message]) => String(message));
        expect(
            warnings.some((message) => message.includes(String(character._id))),
        ).toBe(true);
    });

    it('still recovers an active character', async () => {
        const { character, job } = await persistWithActiveSpell();

        await processor.handleSpellRecovery(job);

        const raw = await rawCharacter(character._id);
        expect(raw.assets.activeSpells[0].usages).toBe(1);
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
