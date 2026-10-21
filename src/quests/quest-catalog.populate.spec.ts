import { Schema } from 'mongoose';
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
    it('populates every ref the FE selects on the catalog', () => {
        expect(QUEST_CATALOG_POPULATE).toEqual([
            { path: 'infos.markerLocation' },
            { path: 'infos.enemy', model: 'Enemy' },
            { path: 'infos.relatedLore', model: 'Lore' },
            { path: 'requirements.recommendedLoot.item' },
            { path: 'prizes.prizeItem.item' },
            { path: 'prizes.randomLoot.item' },
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

    it('keeps a resolved prize item', () => {
        const quest = { prizes: { prizeItem: { item: C }, randomLoot: [] } };

        dropOrphanCatalogRefs(quest);

        expect(quest.prizes.prizeItem).toEqual({ item: C });
    });

    it('tolerates missing sections', () => {
        expect(() => dropOrphanCatalogRefs({})).not.toThrow();
        expect(() =>
            dropOrphanCatalogRefs({
                infos: { relatedLore: null },
                requirements: { recommendedLoot: null },
                prizes: { prizeItem: null, randomLoot: null },
            }),
        ).not.toThrow();
    });
});
