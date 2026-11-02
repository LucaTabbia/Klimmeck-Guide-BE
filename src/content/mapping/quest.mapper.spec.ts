import { ObjectId } from 'mongodb';
import { assertNoUndefined } from 'src/content/mapping/canonical';
import { mapQuest } from 'src/content/mapping/quest.mapper';
import { ContentConfig } from 'src/content/rules/content-config';
import type { QuestEntry } from 'src/content/schema/quest.content';
import {
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';

const HEAL_ID = '64b000000000000000000301';
const HUNT_ID = '64b000000000000000000302';
const WOLF_ID = '64b000000000000000000101';
const SPELL_ID = '64b0000000000000000000b1';
const SWORD_ID = '64b0000000000000000000e1';
const POTION_ID = '64b0000000000000000000f1';
const MARKER_ID = '64b0000000000000000000d1';
const RUNTIME_FIELDS = [
    'registeredAdventurers',
    'concludedAt',
    'startedAt',
    'rescue',
];

interface QuestFixture {
    heal: QuestEntry;
    hunt: QuestEntry;
    config: ContentConfig;
}

function fixture(): QuestFixture {
    const tree = loadTestContentTree();
    return {
        heal: entryOf(tree, 'quests', HEAL_ID) as unknown as QuestEntry,
        hunt: entryOf(tree, 'quests', HUNT_ID) as unknown as QuestEntry,
        config: tree.config!,
    };
}

describe('quest mapper', () => {
    it('writes the quest keys in schema order with ObjectId references', () => {
        const { hunt, config } = fixture();

        const mapped = mapQuest(hunt, config);

        assertNoUndefined(mapped.set);
        expect(mapped._id.toHexString()).toBe(HUNT_ID);
        expect(Object.keys(mapped.set)).toEqual([
            'infos',
            'requirements',
            'prizes',
        ]);
        expect(Object.keys(mapped.set.infos)).toEqual([
            'timeToComplete',
            'title',
            'enemy',
            'type',
            'markerLocation',
            'relatedLore',
            'description',
        ]);
        expect(Object.keys(mapped.set.requirements)).toEqual([
            'requiredPoints',
            'requiredAdventurers',
            'recommendedLoot',
            'minTitle',
        ]);
        expect(Object.keys(mapped.set.prizes)).toEqual([
            'prizeCoins',
            'xpPrize',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
        ]);
        expect(mapped.set.infos.enemy).toBeInstanceOf(ObjectId);
        expect(mapped.set.infos.enemy.toHexString()).toBe(WOLF_ID);
        expect(mapped.set.infos.relatedLore[1]).toBeInstanceOf(ObjectId);
        expect(mapped.set).not.toHaveProperty('city');
    });

    it('writes the notice description or null (D-32)', () => {
        const { heal, config } = fixture();

        const absent = mapQuest(heal, config);
        heal.infos.description = 'Un annuncio.';
        const described = mapQuest(heal, config);

        assertNoUndefined(absent.set);
        assertNoUndefined(described.set);
        expect(absent.set.infos.description).toBeNull();
        expect(described.set.infos.description).toBe('Un annuncio.');
    });

    it('computes coins and xp from the prize table and the min title (D-19)', () => {
        const { heal, config } = fixture();
        heal.infos.type = 'guard';
        heal.requirements.minTitle = 'paladin';

        const guard = mapQuest(heal, config);
        heal.infos.type = 'job';
        const job = mapQuest(heal, config);

        assertNoUndefined(guard.set);
        expect(guard.set.prizes.prizeCoins).toEqual({
            gold: 0,
            silver: 10,
            copper: 0,
        });
        expect(Object.keys(guard.set.prizes.prizeCoins)).toEqual([
            'gold',
            'silver',
            'copper',
        ]);
        expect(guard.set.prizes.xpPrize).toBe(200);
        expect(job.set.prizes.xpPrize).toBe(0);
    });

    it('converts the completion time from hours to milliseconds (Pitfall 4)', () => {
        const { heal, config } = fixture();

        const mapped = mapQuest(heal, config);

        expect(mapped.set.infos.timeToComplete).toBe(18_000_000);
    });

    it('writes runtime fields only on insert (Pitfall 2)', () => {
        const { heal, config } = fixture();

        const mapped = mapQuest(heal, config);

        assertNoUndefined(mapped.setOnInsert);
        expect(mapped.setOnInsert).toEqual({
            registeredAdventurers: [],
            concludedAt: null,
            startedAt: null,
            rescue: null,
        });
        for (const field of RUNTIME_FIELDS) {
            expect(mapped.set).not.toHaveProperty(field);
        }
    });

    it('always writes the spell draw flag (D-31)', () => {
        const { heal, config } = fixture();

        const absent = mapQuest(heal, config);
        heal.infos.type = 'study';
        heal.prizes.spellDraw = true;
        const drawn = mapQuest(heal, config);

        assertNoUndefined(absent.set);
        expect(absent.set.prizes.spellDraw).toBe(false);
        expect(absent.set.prizes.spell).toBeNull();
        expect(drawn.set.prizes.spellDraw).toBe(true);
    });

    it('writes the study spell prize as an ObjectId', () => {
        const { heal, config } = fixture();
        heal.infos.type = 'study';
        heal.prizes.spell = SPELL_ID;

        const mapped = mapQuest(heal, config);

        expect(mapped.set.prizes.spell).toBeInstanceOf(ObjectId);
        expect(mapped.set.prizes.spell.toHexString()).toBe(SPELL_ID);
    });

    it('writes itemType before item in every asset quantity (Pitfall 9)', () => {
        const { heal, config } = fixture();
        const potion = { item: POTION_ID, quantity: 2, itemType: 'LootItem' };
        const sword = {
            quantity: 1,
            item: SWORD_ID,
            itemType: 'EquipmentItem',
        };
        heal.requirements.recommendedLoot = [potion] as never;
        heal.prizes.randomLoot = [sword] as never;
        heal.prizes.prizeItem = { ...potion } as never;

        const mapped = mapQuest(heal, config);

        assertNoUndefined(mapped.set);
        const quantities = [
            mapped.set.requirements.recommendedLoot[0],
            mapped.set.prizes.randomLoot[0],
            mapped.set.prizes.prizeItem,
        ];
        for (const quantity of quantities) {
            expect(Object.keys(quantity)).toEqual([
                'itemType',
                'item',
                'quantity',
            ]);
            expect(quantity.item).toBeInstanceOf(ObjectId);
        }
        expect(mapped.set.prizes.randomLoot[0].item.toHexString()).toBe(
            SWORD_ID,
        );
    });

    it('writes no party slots and no points cost (D-22)', () => {
        const { heal, config } = fixture();

        const mapped = mapQuest(heal, config);

        expect(mapped.set.requirements.requiredAdventurers).toEqual([]);
        expect(mapped.set.requirements.requiredPoints).toBeNull();
        expect(mapped.set.prizes.prizeItem).toBeNull();
        expect(mapped.set.infos.enemy).toBeNull();
        expect(mapped.set.infos.markerLocation.toHexString()).toBe(MARKER_ID);
    });

    it('keeps explicit prize and time overrides (D-19, D-21)', () => {
        const { heal, config } = fixture();
        heal.infos.timeToComplete = 1_000;
        heal.prizes.prizeCoins = { copper: 5, silver: 0, gold: 1 } as never;
        heal.prizes.xpPrize = 15;

        const mapped = mapQuest(heal, config);

        assertNoUndefined(mapped.set);
        expect(mapped.set.infos.timeToComplete).toBe(1_000);
        expect(Object.keys(mapped.set.prizes.prizeCoins)).toEqual([
            'gold',
            'silver',
            'copper',
        ]);
        expect(mapped.set.prizes.prizeCoins).toEqual({
            gold: 1,
            silver: 0,
            copper: 5,
        });
        expect(mapped.set.prizes.xpPrize).toBe(15);
    });
});
