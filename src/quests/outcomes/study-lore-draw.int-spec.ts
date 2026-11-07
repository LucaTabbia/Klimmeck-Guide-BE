import { Types } from 'mongoose';
import { LORE_CONFIG } from 'src/config/lore-config';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { Lore } from 'src/models/lore.model';
import { STUDY_LORE_TYPES } from 'src/lore/study-lore-types';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest, persistLore } from '../../../test/fixtures';
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
// una study senza loot, magia né pet non consuma tiri prima dei due dello studio
const STUDY_ROLLS_BEFORE_LORE: number[] = [];

interface StudyWorld {
    world: OutcomeHarness;
    service: QuestResolutionService;
    chance: SequenceChance;
}

function studyWorld(overrides: { studyChance?: number } = {}): StudyWorld {
    const state = { chance: new SequenceChance() } as StudyWorld;
    beforeAll(async () => {
        state.world = await createOutcomeHarness({
            clock: new FixedClock(NOW),
            chance: state.chance,
            overrides:
                overrides.studyChance === undefined
                    ? []
                    : [
                          {
                              token: LORE_CONFIG,
                              useValue: { studyChance: overrides.studyChance },
                          },
                      ],
        });
        state.service = state.world.harness.app.get(QuestResolutionService);
    });
    beforeEach(async () => {
        await state.world.reset();
        state.chance.load([]);
    });
    afterAll(async () => {
        await state.world.harness.close();
    });
    return state;
}

const questOfType = (type: string) => ({
    infos: { ...buildQuest().infos, type, title: 'Ricerca in biblioteca' },
    prizes: { ...buildQuest().prizes, xpPrize: 300, randomLoot: [] },
});

let seq = 0;

async function quester(
    world: OutcomeHarness,
    options: Partial<QuesterOptions> & { unlockedLore?: Types.ObjectId[] } = {},
): Promise<Quester> {
    seq += 1;
    const { unlockedLore, ...questerOptions } = options;
    return persistQuester(world.harness, {
        twitchId: `tw-study-lore-${seq}`,
        questOverrides: questOfType('study'),
        ...questerOptions,
        characterOverrides: {
            status: { ...FRESH_STATUS, unlockedLore: unlockedLore ?? [] },
        },
    });
}

const persistLoreOf = async (world: OutcomeHarness, type: LoreType) =>
    (await persistLore(world.harness.connection.model(Lore.name), {
        type,
        name: `Pagina ${type}`,
    })) as { _id: Types.ObjectId };

const triggerOf = (subject: Quester) => ({
    pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
    startDate: OUTCOME_START,
});

const unlockedOf = async (world: OutcomeHarness, subject: Quester) => {
    const character = await world.models.characters
        .findById(subject.characterId)
        .lean<any>();
    return (character.status.unlockedLore as unknown[]).map(String);
};

const loreUnlockedOf = async (world: OutcomeHarness, subject: Quester) => {
    const [result] = await world.models.questResults
        .find({ character: subject.characterId })
        .lean<any[]>();
    return (result.loreUnlocked as unknown[]).map(String);
};

describe('QuestResolutionService.resolveStandard with a study lore draw (replSet)', () => {
    describe('at the default chance', () => {
        const state = studyWorld();

        // tre lore dello studio, una città e una pagina del bestiario: solo le prime tre entrano nel pool
        async function library() {
            const { world } = state;
            const knowledge = await persistLoreOf(world, LoreType.knowledge);
            const god = await persistLoreOf(world, LoreType.god);
            const ceremony = await persistLoreOf(world, LoreType.ceremony);
            const city = await persistLoreOf(world, LoreType.city);
            const enemy = await persistLoreOf(world, LoreType.enemy);
            return { knowledge, god, ceremony, city, enemy };
        }

        it('learns a random unknown study lore when the roll passes (D-08)', async () => {
            const { world, service, chance } = state;
            const { knowledge, god } = await library();
            const subject = await quester(world, {
                unlockedLore: [knowledge._id],
            });
            chance.load([...STUDY_ROLLS_BEFORE_LORE, 0.1, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await unlockedOf(world, subject)).toEqual([
                String(knowledge._id),
                String(god._id),
            ]);
            expect(await loreUnlockedOf(world, subject)).toEqual([
                String(god._id),
            ]);
            expect(chance.drawn).toEqual([...STUDY_ROLLS_BEFORE_LORE, 0.1, 0]);
        });

        it('never draws a city or a bestiary page (D-08)', async () => {
            const { world, service, chance } = state;
            const { knowledge, god, ceremony } = await library();
            const subject = await quester(world, {
                unlockedLore: [knowledge._id, god._id],
            });
            chance.load([...STUDY_ROLLS_BEFORE_LORE, 0.1, 0.99]);

            await service.resolveStandard(triggerOf(subject));

            expect(await loreUnlockedOf(world, subject)).toEqual([
                String(ceremony._id),
            ]);
        });

        it('learns nothing when the roll fails (D-08)', async () => {
            const { world, service, chance } = state;
            const { knowledge } = await library();
            const subject = await quester(world, {
                unlockedLore: [knowledge._id],
            });
            chance.load([...STUDY_ROLLS_BEFORE_LORE, 0.6, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await unlockedOf(world, subject)).toEqual([
                String(knowledge._id),
            ]);
            expect(await loreUnlockedOf(world, subject)).toEqual([]);
        });

        it('learns nothing when every study lore is known (D-08)', async () => {
            const { world, service, chance } = state;
            const { knowledge, god, ceremony } = await library();
            const known = [knowledge._id, god._id, ceremony._id];
            const subject = await quester(world, { unlockedLore: known });
            chance.load([...STUDY_ROLLS_BEFORE_LORE, 0.1, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await unlockedOf(world, subject)).toEqual(known.map(String));
            expect(await loreUnlockedOf(world, subject)).toEqual([]);
            expect(chance.drawn).toEqual([...STUDY_ROLLS_BEFORE_LORE, 0.1, 0]);
        });

        it('consumes no roll without study lore in the catalog (D-08, Pitfall 5)', async () => {
            const { world, service, chance } = state;
            await persistLoreOf(world, LoreType.city);
            await persistLoreOf(world, LoreType.enemy);
            const subject = await quester(world);
            chance.load([0.1, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await loreUnlockedOf(world, subject)).toEqual([]);
            expect(chance.drawn).toEqual(STUDY_ROLLS_BEFORE_LORE);
        });

        it('ignores the study lore for another quest type (D-08, Pitfall 5)', async () => {
            const { world, service, chance } = state;
            await library();
            const subject = await quester(world, {
                questOverrides: questOfType('job'),
            });
            chance.load([0.1, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await unlockedOf(world, subject)).toEqual([]);
            expect(await loreUnlockedOf(world, subject)).toEqual([]);
            expect(chance.drawn).toEqual([]);
        });

        it('draws the pool from the study lore types only (D-08)', () => {
            expect([...STUDY_LORE_TYPES].sort()).toEqual(
                [
                    LoreType.ceremony,
                    LoreType.character,
                    LoreType.god,
                    LoreType.knowledge,
                    LoreType.material,
                    LoreType.religion,
                    LoreType.state,
                ].sort(),
            );
        });
    });

    describe('with the chance set to one', () => {
        const state = studyWorld({ studyChance: 1 });

        it('always learns with the chance set to one (D-08)', async () => {
            const { world, service, chance } = state;
            const material = await persistLoreOf(world, LoreType.material);
            const subject = await quester(world);
            chance.load([...STUDY_ROLLS_BEFORE_LORE, 0.99, 0]);

            await service.resolveStandard(triggerOf(subject));

            expect(await loreUnlockedOf(world, subject)).toEqual([
                String(material._id),
            ]);
            expect(await unlockedOf(world, subject)).toEqual([
                String(material._id),
            ]);
        });
    });
});
