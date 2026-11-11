import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest, persistSpell, spellBook } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};

describe('QuestResolutionService.resolveStandard with a spell-draw study (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const questOfType = (type: string, prizes: Record<string, unknown>) => ({
        infos: {
            ...buildQuest().infos,
            type,
            title: 'Studio a Valantar',
        },
        prizes: { ...buildQuest().prizes, ...prizes },
    });
    const studyQuest = (prizes: Record<string, unknown>) =>
        questOfType('study', prizes);

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-spell-draw-${seq}`,
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: {
                    ...FRESH_STATUS,
                    ...options.characterOverrides?.status,
                },
            },
        });
    }

    // il flag è interno (nessun input GraphQL): lo scrive il caricatore del contenuto direttamente sul documento
    async function drawSpellOn(subject: Quester): Promise<void> {
        await world.models.quests.collection.updateOne(
            { _id: subject.quest._id },
            { $set: { 'prizes.spellDraw': true } },
        );
    }

    const triggerOf = (subject: Quester) => ({
        pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
        startDate: OUTCOME_START,
    });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const resultOf = async (subject: Quester) => {
        const [result] = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        return result;
    };

    it('teaches a spell drawn among the unknown learnable ones (D-31)', async () => {
        const known = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
            maxUsages: 3,
        });
        const drawn = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
            maxUsages: 4,
        });
        await persistSpell(world.models.spells, { minXpToLearn: 9000 });
        const book = spellBook([{ spell: known._id, usages: 3 }]);
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
            characterOverrides: {
                status: { spells: book.spells, spellStates: book.spellStates },
            },
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells.map(String)).toEqual([
            String(known._id),
            String(drawn._id),
        ]);
        expect(character.status.spellStates).toEqual([
            { spell: known._id, usages: 3, recoveries: [] },
            { spell: drawn._id, usages: 4, recoveries: [] },
        ]);
        expect(String((await resultOf(subject)).spellLearned)).toBe(
            String(drawn._id),
        );
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('teaches a magic quest the spell a study draws with the same seed (quick 261110-mag)', async () => {
        const known = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
            maxUsages: 3,
        });
        const drawn = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
            maxUsages: 4,
        });
        await persistSpell(world.models.spells, { minXpToLearn: 9000 });
        const book = spellBook([{ spell: known._id, usages: 3 }]);
        const subject = await quester({
            questOverrides: questOfType('magic', { xpPrize: 300 }),
            characterOverrides: {
                status: { spells: book.spells, spellStates: book.spellStates },
            },
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells.map(String)).toEqual([
            String(known._id),
            String(drawn._id),
        ]);
        expect(String((await resultOf(subject)).spellLearned)).toBe(
            String(drawn._id),
        );
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('leaves a catalog spell without max usages out of the draw (D-31)', async () => {
        const valid = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
            maxUsages: 4,
        });
        const malformed = await persistSpell(world.models.spells, {
            minXpToLearn: 200,
        });
        await world.models.spells.collection.updateOne(
            { _id: malformed._id },
            { $unset: { maxUsages: '' } },
        );
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0.99]);

        await service.resolveStandard(triggerOf(subject));

        expect(String((await resultOf(subject)).spellLearned)).toBe(
            String(valid._id),
        );
    });

    it('teaches no spell when none is learnable after the prizes (D-31)', async () => {
        await persistSpell(world.models.spells, { minXpToLearn: 9000 });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells).toEqual([]);
        expect(character.status.xp).toBe(300);
        expect((await resultOf(subject)).spellLearned).toBeNull();
    });

    it('teaches no spell from a learnable pool when the 30% gate misses (quick 261111-sdc)', async () => {
        await persistSpell(world.models.spells, { minXpToLearn: 200 });
        const subject = await quester({
            questOverrides: questOfType('magic', { xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0.3, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells).toEqual([]);
        expect(character.status.xp).toBe(300);
        expect((await resultOf(subject)).spellLearned).toBeNull();
        expect(chance.drawn).toEqual([0.3, 0]);
    });

    it('ignores the spell catalog for a study without the flag', async () => {
        await persistSpell(world.models.spells, { minXpToLearn: 0 });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spells).toEqual([]);
        expect((await resultOf(subject)).spellLearned).toBeNull();
        expect(chance.drawn).toEqual([]);
    });
});
