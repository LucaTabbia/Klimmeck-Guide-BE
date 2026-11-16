import { Types } from 'mongoose';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { SpellOrigin } from 'src/models/enums/spell-origin.enum';
import { Lore } from 'src/models/lore.model';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistLore,
    persistQuest,
    persistSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    OUTCOME_WAITING_TIME_MS,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
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
                // la magia si impara solo dai titoli ≥ mage (D-05b): il quester di base è un mage
                status: {
                    ...FRESH_STATUS,
                    title: 'mage',
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
            minLevelToLearn: 2,
            maxUsages: 3,
        });
        const drawn = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 4,
        });
        await persistSpell(world.models.spells, { minLevelToLearn: 8 });
        const spellStates = spellStatesOf([{ spell: known._id, usages: 3 }]);
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
            characterOverrides: {
                status: { spellStates },
            },
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([
            { spell: known._id, usages: 3, recoveries: [], active: false },
            { spell: drawn._id, usages: 4, recoveries: [], active: false },
        ]);
        expect(String((await resultOf(subject)).spellLearned)).toBe(
            String(drawn._id),
        );
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('adds the learned spell as a state that is not active (D-07)', async () => {
        const equipped = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 3,
        });
        const drawn = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 4,
        });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
            characterOverrides: {
                status: {
                    spellStates: spellStatesOf([
                        { spell: equipped._id, usages: 1, active: true },
                    ]),
                },
            },
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        // lettura grezza: la magia imparata è una voce in coda, non attiva
        const raw = await characterOf(subject);
        expect(raw.status.spellStates).toEqual([
            { spell: equipped._id, usages: 1, recoveries: [], active: true },
            { spell: drawn._id, usages: 4, recoveries: [], active: false },
        ]);
    });

    // vale solo perché le magie del caso nascono arcane (default della fixture): il pool della scuola è l'intero catalogo di prova
    it('teaches an arcane quest the spell a study draws with the same seed (quick 261110-mag)', async () => {
        const known = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 3,
        });
        const drawn = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 4,
        });
        await persistSpell(world.models.spells, { minLevelToLearn: 8 });
        const spellStates = spellStatesOf([{ spell: known._id, usages: 3 }]);
        const subject = await quester({
            questOverrides: questOfType('arcane', { xpPrize: 300 }),
            characterOverrides: {
                status: { spellStates },
            },
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(
            character.status.spellStates.map((state: { spell: unknown }) =>
                String(state.spell),
            ),
        ).toEqual([String(known._id), String(drawn._id)]);
        expect(String((await resultOf(subject)).spellLearned)).toBe(
            String(drawn._id),
        );
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('leaves a catalog spell without max usages out of the draw (D-31)', async () => {
        const valid = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 4,
        });
        const malformed = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
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

    it('teaches no spell when none is learnable at the level after the prizes (D-31)', async () => {
        await persistSpell(world.models.spells, { minLevelToLearn: 8 });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([]);
        expect(character.status.xp).toBe(300);
        expect((await resultOf(subject)).spellLearned).toBeNull();
    });

    // 300 xp dopo il premio = livello 2; la fixture tiene la soglia in xp vecchia a 0
    it('teaches no spell below its minimum level, whatever its old xp threshold (D-07)', async () => {
        await persistSpell(world.models.spells, {
            minLevelToLearn: 3,
        });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([]);
        expect(character.status.level).toBe(2);
        expect((await resultOf(subject)).spellLearned).toBeNull();
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('teaches a drawn spell exactly at its minimum level (D-07)', async () => {
        const spell = await persistSpell(world.models.spells, {
            minLevelToLearn: 2,
            maxUsages: 4,
        });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.level).toBe(2);
        expect(character.status.spellStates).toEqual([
            { spell: spell._id, usages: 4, recoveries: [], active: false },
        ]);
        expect(String((await resultOf(subject)).spellLearned)).toBe(
            String(spell._id),
        );
    });

    it('teaches no spell from a learnable pool when the 30% gate misses (quick 261111-sdc)', async () => {
        await persistSpell(world.models.spells, { minLevelToLearn: 2 });
        const subject = await quester({
            questOverrides: questOfType('arcane', { xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0.3, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([]);
        expect(character.status.xp).toBe(300);
        expect((await resultOf(subject)).spellLearned).toBeNull();
        expect(chance.drawn).toEqual([0.3, 0]);
    });

    it.each([
        ['rookie', false],
        ['mage', true],
    ])(
        'teaches the Valantar spell only to a caster (D-05b, D-25): %s',
        async (title, caster) => {
            const spell = await persistSpell(world.models.spells, {
                minLevelToLearn: 2,
                maxUsages: 4,
            });
            const studyLore = (await persistLore(
                world.harness.connection.model(Lore.name),
                { type: LoreType.knowledge, name: 'Trattato di Valantar' },
            )) as { _id: Types.ObjectId };
            const subject = await quester({
                questOverrides: studyQuest({ xpPrize: 300 }),
                characterOverrides: { status: { title } },
            });
            await drawSpellOn(subject);
            chance.load([0, 0, 0.1, 0]);

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            const result = await resultOf(subject);
            expect(character.status.spellStates).toEqual(
                caster
                    ? [
                          {
                              spell: spell._id,
                              usages: 4,
                              recoveries: [],
                              active: false,
                          },
                      ]
                    : [],
            );
            expect(
                result.spellLearned ? String(result.spellLearned) : null,
            ).toBe(caster ? String(spell._id) : null);
            expect((result.loreUnlocked as unknown[]).map(String)).toEqual(
                caster ? [] : [String(studyLore._id)],
            );
            expect(chance.drawn).toEqual([0, 0, 0.1, 0]);
        },
    );

    it('ignores the spell catalog for a study without the flag', async () => {
        await persistSpell(world.models.spells, { minLevelToLearn: 1 });
        const subject = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([]);
        expect((await resultOf(subject)).spellLearned).toBeNull();
        expect(chance.drawn).toEqual([]);
    });
    const learnableOf = (origin: SpellOrigin, overrides = {}) =>
        persistSpell(world.models.spells, {
            origin,
            minLevelToLearn: 2,
            maxUsages: 4,
            ...overrides,
        });

    const SCHOOLS = [
        ['arcane', SpellOrigin.arcane],
        ['shamanic', SpellOrigin.shamanic],
        ['void', SpellOrigin.void],
    ] as const;

    const otherOrigins = (origin: SpellOrigin) =>
        Object.values(SpellOrigin).filter((other) => other !== origin);

    const learnedBy = async (subject: Quester) => {
        const { spellLearned } = await resultOf(subject);
        return spellLearned ? String(spellLearned) : null;
    };

    // la magia della scuola sta in mezzo per id: il tiro 0 sull'intero catalogo prenderebbe la prima
    it.each(SCHOOLS)(
        'teaches a %s quest only a spell of the %s origin (D-10, D-20)',
        async (type, origin) => {
            const [before, after] = otherOrigins(origin);
            await learnableOf(before);
            const taught = await learnableOf(origin);
            await learnableOf(after);
            const subject = await quester({
                questOverrides: questOfType(type, { xpPrize: 300 }),
            });
            await drawSpellOn(subject);
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await learnedBy(subject)).toBe(String(taught._id));
            expect(chance.drawn).toEqual([0, 0]);
        },
    );

    it.each([[[0, 0]], [[0, 0.5]], [[0, 0.99]]])(
        'never teaches a shamanic quest an arcane spell, on any roll (D-10): %p',
        async (rolls) => {
            await learnableOf(SpellOrigin.arcane);
            await learnableOf(SpellOrigin.void);
            const subject = await quester({
                questOverrides: questOfType('shamanic', { xpPrize: 300 }),
            });
            await drawSpellOn(subject);
            chance.load(rolls);

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            expect(character.status.spellStates).toEqual([]);
            expect(await learnedBy(subject)).toBeNull();
        },
    );

    it('consumes the same two draws on an empty school pool (D-10)', async () => {
        await learnableOf(SpellOrigin.arcane);
        await learnableOf(SpellOrigin.shamanic);
        const subject = await quester({
            questOverrides: questOfType('void', { xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        expect(await learnedBy(subject)).toBeNull();
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('keeps the whole catalogue for a drawing study (D-10)', async () => {
        const first = await learnableOf(SpellOrigin.void);
        await learnableOf(SpellOrigin.arcane);
        const last = await learnableOf(SpellOrigin.shamanic);
        const firstStudy = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        const lastStudy = await quester({
            questOverrides: studyQuest({ xpPrize: 300 }),
        });
        await drawSpellOn(firstStudy);
        await drawSpellOn(lastStudy);

        chance.load([0, 0]);
        await service.resolveStandard(triggerOf(firstStudy));
        chance.load([0, 0.99]);
        await service.resolveStandard(triggerOf(lastStudy));

        expect(await learnedBy(firstStudy)).toBe(String(first._id));
        expect(await learnedBy(lastStudy)).toBe(String(last._id));
    });

    it.each(SCHOOLS)(
        'leaves a spell with an unknown origin out of every school pool (D-10): %s',
        async (type) => {
            const dirty = await learnableOf(SpellOrigin.arcane);
            await world.models.spells.collection.updateOne(
                { _id: dirty._id },
                { $set: { origin: 'fire' } },
            );
            const subject = await quester({
                questOverrides: questOfType(type, { xpPrize: 300 }),
            });
            await drawSpellOn(subject);
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await learnedBy(subject)).toBeNull();
            expect(chance.drawn).toEqual([0, 0]);
        },
    );

    // 300 xp dopo il premio = livello 2: la magia void chiede il livello 3, la arcane imparabile non è della scuola
    it('applies the level gate inside a school pool (D-07, D-10)', async () => {
        await learnableOf(SpellOrigin.arcane);
        await learnableOf(SpellOrigin.void, { minLevelToLearn: 3 });
        const subject = await quester({
            questOverrides: questOfType('void', { xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.level).toBe(2);
        expect(character.status.spellStates).toEqual([]);
        expect(await learnedBy(subject)).toBeNull();
    });

    // una seconda quest per lo stesso personaggio: quest e richiesta nuove sulla corsia standard, col flag del sorteggio
    async function nextDrawingQuestFor(
        subject: Quester,
        type: string,
    ): Promise<Types.ObjectId> {
        const quest = await persistQuest(world.models.quests, {
            ...buildQuest(),
            ...questOfType(type, { xpPrize: 0, spellDraw: true }),
        });
        const pending = await world.models.pendingQuests.create({
            startDate: OUTCOME_START,
            arrivedAt: OUTCOME_START,
            waitingTime: OUTCOME_WAITING_TIME_MS,
            pointsSpent: 0,
            quest: quest._id,
        });
        await world.models.characters.updateOne(
            { _id: subject.characterId },
            { $set: { 'quests.pendingQuest': pending._id } },
        );
        return pending._id as Types.ObjectId;
    }

    // la lore dell'origine fuori dal pool dello studio, così i tiri restano due per esito
    it('unlocks the origin lore with the first spell of an origin and nothing with the second (D-24)', async () => {
        const originLore = (await persistLore(
            world.harness.connection.model(Lore.name),
            { type: LoreType.region, name: 'Il Vuoto' },
        )) as { _id: Types.ObjectId };
        const first = await learnableOf(SpellOrigin.void, {
            relatedLore: [originLore._id],
        });
        const second = await learnableOf(SpellOrigin.void, {
            relatedLore: [originLore._id],
        });
        const subject = await quester({
            questOverrides: questOfType('void', { xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0, 0, 0]);

        await service.resolveStandard(triggerOf(subject));
        const afterFirst = await characterOf(subject);
        const nextPending = await nextDrawingQuestFor(subject, 'void');
        await service.resolveStandard({
            pendingQuestId: nextPending,
            startDate: OUTCOME_START,
        });

        const character = await characterOf(subject);
        const results = await world.models.questResults
            .find({ character: subject.characterId })
            .sort({ _id: 1 })
            .lean<any[]>();
        expect(afterFirst.status.unlockedLore.map(String)).toEqual([
            String(originLore._id),
        ]);
        expect(results.map((result) => String(result.spellLearned))).toEqual([
            String(first._id),
            String(second._id),
        ]);
        expect(
            results.map((result) => result.loreUnlocked.map(String)),
        ).toEqual([[String(originLore._id)], []]);
        expect(character.status.unlockedLore.map(String)).toEqual([
            String(originLore._id),
        ]);
        expect(chance.drawn).toEqual([0, 0, 0, 0]);
    });

    // la stessa lore di un tipo dello studio: fuori dal pool dello studio, la porta solo la magia imparata e i tiri restano due
    it('unlocks a study-type origin lore only through the learned spell (D-24, D-25)', async () => {
        const originLore = (await persistLore(
            world.harness.connection.model(Lore.name),
            { type: LoreType.knowledge, name: 'Il Vuoto' },
        )) as { _id: Types.ObjectId };
        const spell = await learnableOf(SpellOrigin.void, {
            relatedLore: [originLore._id],
        });
        const subject = await quester({
            questOverrides: questOfType('void', { xpPrize: 300 }),
        });
        await drawSpellOn(subject);
        chance.load([0, 0, 0, 0]);

        await service.resolveStandard(triggerOf(subject));

        const result = await resultOf(subject);
        expect(String(result.spellLearned)).toBe(String(spell._id));
        expect(result.loreUnlocked.map(String)).toEqual([
            String(originLore._id),
        ]);
        expect(chance.drawn).toEqual([0, 0]);
    });

    it('does not filter the fixed spell of a school quest by origin (D-10)', async () => {
        const fixed = await learnableOf(SpellOrigin.arcane);
        const subject = await quester({
            questOverrides: questOfType('void', {
                xpPrize: 300,
                spell: fixed._id,
            }),
        });

        await service.resolveStandard(triggerOf(subject));

        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([
            { spell: fixed._id, usages: 4, recoveries: [], active: false },
        ]);
        expect(await learnedBy(subject)).toBe(String(fixed._id));
    });

    describe('research and learning parts', () => {
        const LEARN_TIME = 1_800_000;
        const learnableWithTime = () =>
            persistSpell(world.models.spells, {
                minLevelToLearn: 2,
                maxUsages: 4,
                requiredLearnTime: LEARN_TIME,
            });
        const researcher = async () => {
            const subject = await quester({
                questOverrides: questOfType('arcane', { xpPrize: 300 }),
            });
            await drawSpellOn(subject);
            return subject;
        };
        const sheetsOf = (subject: Quester) =>
            world.models.questResults
                .find({ character: subject.characterId })
                .lean<any[]>();
        const pendingQuestOf = (subject: Quester) =>
            world.models.pendingQuests
                .findById(subject.pendingQuest._id)
                .lean<any>();

        it('writes the research sheet with the found spell at the end of the research (D-31)', async () => {
            const spell = await learnableWithTime();
            const subject = await researcher();
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            const sheets = await sheetsOf(subject);
            expect(sheets).toHaveLength(1);
            expect(String(sheets[0].spellFound)).toBe(String(spell._id));
            expect(sheets[0].spellLearned).toBeNull();
            expect(sheets[0].xpGained).toBe(300);
            expect(sheets[0].resolvedAt).toEqual(NOW);
        });

        it('keeps the character engaged on the re-armed pending quest when the research finds a spell (D-26)', async () => {
            const spell = await learnableWithTime();
            const subject = await researcher();
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            const [sheet] = await sheetsOf(subject);
            const pendingQuest = await pendingQuestOf(subject);
            expect(character.status.spellStates).toEqual([]);
            expect(String(character.quests.pendingQuest)).toBe(
                String(subject.pendingQuest._id),
            );
            expect(character.status.xp).toBe(300);
            expect(pendingQuest.startDate).toEqual(NOW);
            expect(pendingQuest.waitingTime).toBe(LEARN_TIME);
            expect(String(pendingQuest.learningSpell)).toBe(String(spell._id));
            expect(String(pendingQuest.researchResult)).toBe(String(sheet._id));
        });

        it('schedules the end of the learning part with the job id of the new start (D-26)', async () => {
            await learnableWithTime();
            const subject = await researcher();
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            const resolves = world.questQueue.added.filter(
                (job) => job.name === 'resolve',
            );
            expect(resolves).toHaveLength(1);
            expect(resolves[0].data).toEqual({
                pendingQuestId: String(subject.pendingQuest._id),
                startDate: NOW.getTime(),
                waitingTime: LEARN_TIME,
            });
        });

        it('sends no quest end push for the research sheet of a found spell (D-31)', async () => {
            await learnableWithTime();
            const subject = await researcher();
            await registerDevice(world.harness, subject.player);
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(
                world.push.sent.filter(
                    ({ message }) => message.type === PushEventType.questEnd,
                ),
            ).toEqual([]);
        });

        const pushesOf = () =>
            world.push.sent.map(({ message }) => ({
                type: message.type,
                id: message.id,
                body: message.body,
            }));

        it('sends the research success push with the spell name and the learning time (D-29)', async () => {
            const spell = await learnableWithTime();
            const subject = await researcher();
            await registerDevice(world.harness, subject.player);
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));

            const [sheet] = await sheetsOf(subject);
            expect(String(sheet.spellFound)).toBe(String(spell._id));
            expect(pushesOf()).toEqual([
                {
                    type: PushEventType.spellResearchSucceeded,
                    id: String(sheet._id),
                    body: `Hai scoperto «${spell.name}»: l'apprendimento dura 30 minuti.`,
                },
            ]);
        });

        it('sends the research failure push in place of the quest end push (D-29)', async () => {
            await learnableWithTime();
            const subject = await researcher();
            await registerDevice(world.harness, subject.player);
            chance.load([0.9, 0]);

            await service.resolveStandard(triggerOf(subject));

            const [sheet] = await sheetsOf(subject);
            expect(pushesOf()).toEqual([
                {
                    type: PushEventType.spellResearchFailed,
                    id: String(sheet._id),
                    body: "Nessuna magia scoperta: scopri com'è andata la missione.",
                },
            ]);
        });

        it('keeps the quest end push for a study without a draw (D-29)', async () => {
            await learnableWithTime();
            const subject = await quester({
                questOverrides: studyQuest({ xpPrize: 300 }),
            });
            await registerDevice(world.harness, subject.player);

            await service.resolveStandard(triggerOf(subject));

            const [sheet] = await sheetsOf(subject);
            expect(pushesOf().map(({ type, id }) => ({ type, id }))).toEqual([
                { type: PushEventType.questEnd, id: String(sheet._id) },
            ]);
        });

        it('keeps the quest end push when the fixed spell wins over the draw (D-29, D-30)', async () => {
            const fixed = await learnableWithTime();
            const subject = await quester({
                questOverrides: questOfType('arcane', {
                    xpPrize: 300,
                    spell: fixed._id,
                }),
            });
            await drawSpellOn(subject);
            await registerDevice(world.harness, subject.player);

            await service.resolveStandard(triggerOf(subject));

            const [sheet] = await sheetsOf(subject);
            expect(String(sheet.spellLearned)).toBe(String(fixed._id));
            expect(pushesOf().map(({ type, id }) => ({ type, id }))).toEqual([
                { type: PushEventType.questEnd, id: String(sheet._id) },
            ]);
        });

        it('ends the quest as before when the draw gives nothing (D-26)', async () => {
            await learnableWithTime();
            const subject = await researcher();
            chance.load([0.9, 0]);

            await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            const sheets = await sheetsOf(subject);
            expect(await pendingQuestOf(subject)).toBeNull();
            expect(character.quests.pendingQuest).toBeNull();
            expect(sheets).toHaveLength(1);
            expect(sheets[0].spellFound).toBeNull();
            expect(world.questQueue.added).toEqual([]);
        });

        it('stores the failed research on the sheet of a draw that gives nothing (D-29)', async () => {
            await learnableWithTime();
            const subject = await researcher();
            chance.load([0.9, 0]);

            await service.resolveStandard(triggerOf(subject));

            const [sheet] = await sheetsOf(subject);
            expect(sheet.spellResearchFailed).toBe(true);
            expect(sheet.spellFound).toBeNull();
            expect(sheet.spellLearned).toBeNull();
        });

        it('stores no failed research on the sheet of a study without a draw (D-29)', async () => {
            await learnableWithTime();
            const subject = await quester({
                questOverrides: studyQuest({ xpPrize: 300 }),
            });

            await service.resolveStandard(triggerOf(subject));

            const [sheet] = await sheetsOf(subject);
            expect(sheet.spellResearchFailed).toBe(false);
        });

        it('writes nothing on a second trigger of the same research (D-26)', async () => {
            await learnableWithTime();
            const subject = await researcher();
            chance.load([0, 0]);

            await service.resolveStandard(triggerOf(subject));
            chance.load([0, 0]);
            const second = await service.resolveStandard(triggerOf(subject));

            const character = await characterOf(subject);
            const pendingQuest = await pendingQuestOf(subject);
            expect(second).toBe('stale');
            expect(character.status.xp).toBe(300);
            expect(await sheetsOf(subject)).toHaveLength(1);
            expect(pendingQuest.startDate).toEqual(NOW);
            expect(pendingQuest.waitingTime).toBe(LEARN_TIME);
        });
    });
});
