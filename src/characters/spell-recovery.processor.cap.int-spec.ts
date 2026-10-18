import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import mongoose, { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
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
    assets: { activeSpells: { usages: number }[] };
}

interface RecoveryFixture {
    maxUsages: number;
    usages: number;
    inCatalog?: boolean;
    active?: boolean;
}

function jobFor(data: SpellRecoveryJobData): Job<SpellRecoveryJobData> {
    return { data } as Job<SpellRecoveryJobData>;
}

describe('SpellRecoveryProcessor cap (replSet)', () => {
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

    async function persistWithActiveSpell({
        maxUsages,
        usages,
        inCatalog = true,
        active = true,
    }: RecoveryFixture) {
        const spellId = inCatalog
            ? ((await persistSpell(SpellModel, { maxUsages }))
                  ._id as Types.ObjectId)
            : new Types.ObjectId();
        const character = await persistCharacter(
            CharacterModel,
            {
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: active ? [{ spell: spellId, usages }] : [],
                },
            },
            PoiModel,
        );
        const job = jobFor({
            characterId: String(character._id),
            spellId: spellId.toHexString(),
        });
        return { character, job };
    }

    async function activeSpellsOf(id: unknown) {
        const raw = (await CharacterModel.collection.findOne({
            _id: id as never,
        })) as unknown as RawCharacter;
        return raw.assets.activeSpells;
    }

    async function usagesOf(id: unknown): Promise<number> {
        return (await activeSpellsOf(id))[0].usages;
    }

    function warnedAbout(fragment: string): boolean {
        return warnSpy.mock.calls
            .map(([message]) => String(message))
            .some((message) => message.includes(fragment));
    }

    it('increments up to maxUsages', async () => {
        const { character, job } = await persistWithActiveSpell({
            maxUsages: 3,
            usages: 1,
        });

        await processor.handleSpellRecovery(job);

        expect(await usagesOf(character._id)).toBe(2);
    });

    it('is a no-op at maxUsages and warns', async () => {
        const { character, job } = await persistWithActiveSpell({
            maxUsages: 3,
            usages: 3,
        });

        await processor.handleSpellRecovery(job);

        expect(await usagesOf(character._id)).toBe(3);
        expect(warnedAbout(String(character._id))).toBe(true);
    });

    it('never exceeds maxUsages when the job runs twice', async () => {
        const { character, job } = await persistWithActiveSpell({
            maxUsages: 3,
            usages: 2,
        });

        await processor.handleSpellRecovery(job);
        await processor.handleSpellRecovery(job);

        expect(await usagesOf(character._id)).toBe(3);
    });

    it('never exceeds maxUsages under parallel replays', async () => {
        const { character, job } = await persistWithActiveSpell({
            maxUsages: 1,
            usages: 0,
        });

        await Promise.all(
            Array.from({ length: 3 }, () => processor.handleSpellRecovery(job)),
        );

        expect(await usagesOf(character._id)).toBe(1);
    });

    it('skips a spell deleted from the catalog with a warning', async () => {
        const { character, job } = await persistWithActiveSpell({
            maxUsages: 3,
            usages: 0,
            inCatalog: false,
        });

        await processor.handleSpellRecovery(job);

        expect(await usagesOf(character._id)).toBe(0);
        expect(warnedAbout(job.data.spellId)).toBe(true);
    });

    it('skips a spell that is no longer active', async () => {
        const { character, job } = await persistWithActiveSpell({
            maxUsages: 3,
            usages: 0,
            active: false,
        });

        await processor.handleSpellRecovery(job);

        expect(await activeSpellsOf(character._id)).toEqual([]);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('skips malformed job data without throwing', async () => {
        const job = jobFor({ characterId: 'abc', spellId: 'xyz' });

        await expect(
            processor.handleSpellRecovery(job),
        ).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
    });
});
