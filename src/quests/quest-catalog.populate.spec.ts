import { Schema, Types } from 'mongoose';
import {
    AssetQuantitySchema,
    assetQuantitySchemaAt,
} from 'src/models/common/asset-quantity.model';
import { QuestPrizesSchema } from 'src/models/quest/quest-prizes.model';
import { QuestRequirementsSchema } from 'src/models/quest/quest-requirements.model';
import {
    dropOrphanCatalogRefs,
    QUEST_CATALOG_POPULATE,
} from './quest-catalog.populate';

const itemRefPathOf = (schema: Schema, path: string): unknown =>
    (schema.path(path) as unknown as { schema: Schema }).schema.path('item')
        .options.refPath;

describe('assetQuantitySchemaAt', () => {
    it('declares the absolute refPath of the given path', () => {
        expect(
            assetQuantitySchemaAt('prizes.randomLoot').path('item').options
                .refPath,
        ).toBe('prizes.randomLoot.itemType');
    });

    it('leaves the original relative refPath untouched', () => {
        assetQuantitySchemaAt('prizes.randomLoot');
        expect(AssetQuantitySchema.path('item').options.refPath).toBe(
            'itemType',
        );
    });
});

describe('quest catalog asset quantity schemas', () => {
    it('uses absolute refPaths in the prizes', () => {
        expect(itemRefPathOf(QuestPrizesSchema, 'randomLoot')).toBe(
            'prizes.randomLoot.itemType',
        );
        expect(itemRefPathOf(QuestPrizesSchema, 'prizeItem')).toBe(
            'prizes.prizeItem.itemType',
        );
    });

    it('uses an absolute refPath in the recommended loot', () => {
        expect(itemRefPathOf(QuestRequirementsSchema, 'recommendedLoot')).toBe(
            'requirements.recommendedLoot.itemType',
        );
    });
});

describe('QUEST_CATALOG_POPULATE', () => {
    it('populates every ref the FE selects on the catalog, enemies with their spells (D-01, D-02, D-21)', () => {
        expect(QUEST_CATALOG_POPULATE).toEqual([
            { path: 'infos.markerLocation' },
            {
                path: 'infos.enemies.enemy',
                model: 'Enemy',
                populate: { path: 'spells', model: 'Spell' },
            },
            { path: 'infos.relatedLore', model: 'Lore' },
            { path: 'requirements.recommendedLoot.item' },
            { path: 'prizes.prizeItem.item' },
            { path: 'prizes.randomLoot.item' },
            { path: 'prizes.spell', model: 'Spell' },
            { path: 'prizes.pet', model: 'Pet' },
            { path: 'prizes.rankPrizes.prizeItem.item' },
            { path: 'prizes.rankPrizes.randomLoot.item' },
            { path: 'prizes.rankPrizes.spell', model: 'Spell' },
            { path: 'prizes.rankPrizes.pet', model: 'Pet' },
        ]);
    });

    it('populates the refs of every rank prize block (D-05)', () => {
        expect(
            QUEST_CATALOG_POPULATE.filter(({ path }) =>
                path.startsWith('prizes.rankPrizes.'),
            ),
        ).toEqual([
            { path: 'prizes.rankPrizes.prizeItem.item' },
            { path: 'prizes.rankPrizes.randomLoot.item' },
            { path: 'prizes.rankPrizes.spell', model: 'Spell' },
            { path: 'prizes.rankPrizes.pet', model: 'Pet' },
        ]);
    });
});

describe('dropOrphanCatalogRefs', () => {
    const A = { name: 'A' };
    const B = { name: 'B' };
    const C = { name: 'C' };
    const L = { name: 'L' };

    it('drops orphan entries and nulls an orphan prize item', () => {
        const quest = {
            requirements: { recommendedLoot: [{ item: A }, { item: null }] },
            prizes: {
                prizeItem: { item: null } as { item: unknown } | null,
                randomLoot: [{ item: null }, { item: B }],
            },
            infos: { relatedLore: [L, null] },
        };

        dropOrphanCatalogRefs(quest);

        expect(quest.requirements.recommendedLoot).toEqual([{ item: A }]);
        expect(quest.prizes.prizeItem).toBeNull();
        expect(quest.prizes.randomLoot).toEqual([{ item: B }]);
        expect(quest.infos.relatedLore).toEqual([L]);
    });

    // itemType assente ⇒ refPath irrisolto ⇒ populate lascia l'ObjectId grezzo (Mongoose 8.18.1)
    it('drops an item left as a raw ObjectId by an unresolved refPath', () => {
        const raw = new Types.ObjectId();
        const quest = {
            requirements: { recommendedLoot: [{ item: raw }, { item: A }] },
            prizes: {
                prizeItem: { item: raw } as { item: unknown } | null,
                randomLoot: [{ item: B }, { item: raw }],
            },
        };

        dropOrphanCatalogRefs(quest);

        expect(quest.requirements.recommendedLoot).toEqual([{ item: A }]);
        expect(quest.prizes.prizeItem).toBeNull();
        expect(quest.prizes.randomLoot).toEqual([{ item: B }]);
    });

    it('keeps a resolved prize item', () => {
        const quest = { prizes: { prizeItem: { item: C }, randomLoot: [] } };

        dropOrphanCatalogRefs(quest);

        expect(quest.prizes.prizeItem).toEqual({ item: C });
    });

    it('drops a quest enemy whose enemy was deleted without touching the others (D-28)', () => {
        const goblin = { _id: new Types.ObjectId(), name: 'Goblin' };
        const quest = {
            infos: {
                enemies: [
                    { enemy: null, quantity: 2 },
                    { enemy: goblin, quantity: 3 },
                    { enemy: new Types.ObjectId(), quantity: 1 },
                ] as { enemy: unknown; quantity: number }[],
            },
        };

        dropOrphanCatalogRefs(quest);

        expect(quest.infos.enemies).toEqual([{ enemy: goblin, quantity: 3 }]);
    });

    it('nulls an orphan pet prize and keeps a resolved one (D-21, D-28)', () => {
        const pet = { _id: new Types.ObjectId(), name: 'Gufo' };
        const orphan = { prizes: { pet: null as unknown } };
        const raw = { prizes: { pet: new Types.ObjectId() as unknown } };
        const resolved = { prizes: { pet: pet as unknown } };

        dropOrphanCatalogRefs(orphan);
        dropOrphanCatalogRefs(raw);
        dropOrphanCatalogRefs(resolved);

        expect(orphan.prizes.pet).toBeNull();
        expect(raw.prizes.pet).toBeNull();
        expect(resolved.prizes.pet).toBe(pet);
    });

    it('drops orphan refs inside every block like the plain fields (D-05)', () => {
        const raw = new Types.ObjectId();
        const pet = { _id: new Types.ObjectId(), name: 'Gufo' };
        const orphanBlock = {
            title: 'mage',
            prizeItem: { item: raw } as { item: unknown } | null,
            randomLoot: [{ item: raw }, { item: B }],
            pet: new Types.ObjectId() as unknown,
            cure: { lifePointsShare: 'x', canHeal: ['deepCut', 'brokenWing'] },
        };
        const resolvedBlock = {
            title: 'paladin',
            prizeItem: { item: C } as { item: unknown } | null,
            randomLoot: [{ item: A }],
            pet: pet as unknown,
            cure: null as unknown,
        };
        const quest = {
            prizes: {
                randomLoot: [],
                rankPrizes: [orphanBlock, resolvedBlock],
            },
        };

        dropOrphanCatalogRefs(quest);

        expect(quest.prizes.rankPrizes).toEqual([
            {
                title: 'mage',
                prizeItem: null,
                randomLoot: [{ item: B }],
                pet: null,
                cure: { lifePointsShare: 0, canHeal: ['deepCut'] },
            },
            {
                title: 'paladin',
                prizeItem: { item: C },
                randomLoot: [{ item: A }],
                pet,
                cure: null,
            },
        ]);
    });

    it('tolerates missing sections', () => {
        expect(() => dropOrphanCatalogRefs({})).not.toThrow();
        expect(() =>
            dropOrphanCatalogRefs({
                infos: { relatedLore: null, enemies: null },
                requirements: { recommendedLoot: null },
                prizes: { prizeItem: null, randomLoot: null },
            }),
        ).not.toThrow();
        expect(() =>
            dropOrphanCatalogRefs({ prizes: { rankPrizes: null } }),
        ).not.toThrow();
    });
});
