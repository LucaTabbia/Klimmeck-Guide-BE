import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { QuestResultDraft } from 'src/quests/outcomes/outcome-plan';
import {
    dropOrphanResultRefs,
    QUEST_RESULT_POPULATE,
    unpopulatedResultOf,
} from './quest-result.populate';

const draftWith = (
    overrides: Partial<QuestResultDraft> = {},
): QuestResultDraft => ({
    _id: new Types.ObjectId(),
    character: new Types.ObjectId(),
    user: new Types.ObjectId(),
    quest: { id: new Types.ObjectId(), type: QuestType.enemy, title: 'Caccia' },
    outcome: QuestOutcome.success,
    resolvedAt: new Date('2026-11-04T10:00:00.000Z'),
    hpBefore: 1000,
    hpAfter: 900,
    maxLifePoints: 1200,
    injuriesAdded: [],
    injuriesHealed: [],
    consumablesUsed: [],
    spellsUsed: [],
    rewards: {
        coins: { gold: 0, silver: 1, copper: 0 },
        items: [],
        pet: null,
    },
    xpGained: 100,
    xpBefore: 0,
    xpAfter: 100,
    levelBefore: 1,
    levelAfter: 1,
    titleBefore: TitleType.rookie,
    titleAfter: TitleType.rookie,
    spellLearned: null,
    enemies: [],
    stagesCleared: null,
    stagesTotal: null,
    rescuedCharacters: [],
    arrested: false,
    coinsLost: null,
    guardEncounter: false,
    ...overrides,
});

describe('QUEST_RESULT_POPULATE', () => {
    it('populates the fought enemies one level deep and the pet reward (D-01, D-21)', () => {
        expect(QUEST_RESULT_POPULATE).toEqual([
            { path: 'consumablesUsed.item' },
            { path: 'rewards.items.item' },
            { path: 'spellsUsed.spell', model: 'Spell' },
            { path: 'spellLearned', model: 'Spell' },
            { path: 'enemies.enemy', model: 'Enemy' },
            { path: 'rewards.pet', model: 'Pet' },
            { path: 'loreUnlocked', model: 'Lore' },
        ]);
    });
});

describe('dropOrphanResultRefs', () => {
    it('drops a fought enemy whose enemy was deleted without touching the others (D-28)', () => {
        const bandit = { _id: new Types.ObjectId(), name: 'Bandito' };
        const result = {
            enemies: [
                { enemy: new Types.ObjectId(), quantity: 1 },
                { enemy: bandit, quantity: 2 },
                { enemy: null, quantity: 1 },
            ] as { enemy: unknown; quantity: number }[],
        };

        dropOrphanResultRefs(result);

        expect(result.enemies).toEqual([{ enemy: bandit, quantity: 2 }]);
    });

    it('nulls an orphan pet reward and keeps a resolved one (D-21, D-28)', () => {
        const pet = { _id: new Types.ObjectId(), name: 'Gufo' };
        const raw = {
            rewards: { items: [], pet: new Types.ObjectId() as unknown },
        };
        const resolved = { rewards: { items: [], pet: pet as unknown } };

        dropOrphanResultRefs(raw);
        dropOrphanResultRefs(resolved);

        expect(raw.rewards.pet).toBeNull();
        expect(resolved.rewards.pet).toBe(pet);
    });

    it('drops the orphan unlocked lore (D-09)', () => {
        const unlocked = { _id: new Types.ObjectId() };
        const result = {
            loreUnlocked: [unlocked, new Types.ObjectId(), null] as unknown[],
        };

        dropOrphanResultRefs(result);

        expect(result.loreUnlocked).toEqual([unlocked]);
    });

    it('tolerates missing sections', () => {
        expect(() => dropOrphanResultRefs({})).not.toThrow();
        expect(() =>
            dropOrphanResultRefs({ enemies: null, rewards: null }),
        ).not.toThrow();
    });
});

describe('unpopulatedResultOf', () => {
    it('answers a quest kind without an ambush block (D-14)', () => {
        const result = unpopulatedResultOf(draftWith());

        expect(result.kind).toBe('quest');
        expect(result.ambush).toBeNull();
    });
    it('answers the fought enemies empty and keeps the dungeon stages (D-01, D-12)', () => {
        const result = unpopulatedResultOf(
            draftWith({
                enemies: [{ enemy: new Types.ObjectId(), quantity: 2 }],
                stagesCleared: 1,
                stagesTotal: 3,
            }),
        );

        expect(result.enemies).toEqual([]);
        expect(result.stagesCleared).toBe(1);
        expect(result.stagesTotal).toBe(3);
    });
    it('answers no unlocked lore without populate (D-09)', () => {
        const result = unpopulatedResultOf(draftWith());

        expect(result.loreUnlocked).toEqual([]);
    });
    it('answers the pet reward null without a populate (D-21)', () => {
        const result = unpopulatedResultOf(
            draftWith({
                rewards: {
                    coins: { gold: 0, silver: 1, copper: 0 },
                    items: [],
                    pet: new Types.ObjectId(),
                },
            }),
        );

        expect(result.rewards).toEqual({
            coins: { gold: 0, silver: 1, copper: 0 },
            items: [],
            pet: null,
        });
    });
});
