import { ObjectId } from 'mongodb';
import { assertNoUndefined } from 'src/content/mapping/canonical';
import { imageUrlsOf } from 'src/content/mapping/catalog.mapper';
import { mapEnemy } from 'src/content/mapping/enemy.mapper';
import { ContentConfig } from 'src/content/rules/content-config';
import type { SpellEntry } from 'src/content/schema/catalog.content';
import type { EnemyEntry } from 'src/content/schema/enemy.content';
import {
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';

const WOLF_ID = '64b000000000000000000101';
const GOLEM_ID = '64b000000000000000000102';
const SPELL_ID = '64b0000000000000000000b1';
const WOLF_LORE_ID = '64b0000000000000000000a3';
const NO_IMAGES = imageUrlsOf([]);

interface EnemyFixture {
    wolf: EnemyEntry;
    golem: EnemyEntry;
    spellsById: Map<string, SpellEntry>;
    config: ContentConfig;
}

function fixture(): EnemyFixture {
    const tree = loadTestContentTree();
    const spell = entryOf(tree, 'spells', SPELL_ID) as unknown as SpellEntry;
    return {
        wolf: entryOf(tree, 'enemies', WOLF_ID) as unknown as EnemyEntry,
        golem: entryOf(tree, 'enemies', GOLEM_ID) as unknown as EnemyEntry,
        spellsById: new Map([[SPELL_ID, spell]]),
        config: tree.config!,
    };
}

describe('enemy mapper', () => {
    it('derives xp, life points and damages from the source block (D-11, D-12)', () => {
        const { wolf, spellsById, config } = fixture();

        const mapped = mapEnemy(wolf, spellsById, config, NO_IMAGES);

        assertNoUndefined(mapped.set);
        expect(mapped._id.toHexString()).toBe(WOLF_ID);
        expect(mapped.setOnInsert).toBeNull();
        expect(Object.keys(mapped.set)).toEqual([
            'name',
            'locations',
            'energyWeaknesses',
            'baseWeaknesses',
            'relatedLore',
            'xp',
            'spells',
            'lifePoints',
            'imagePath',
            'damages',
        ]);
        expect(mapped.set.xp).toBe(7);
        expect(mapped.set.lifePoints).toBe(1100);
        expect(mapped.set.damages).toEqual({
            base: [{ type: 'pierce', power: 700 }],
            energy: [],
        });
        expect(mapped.set.relatedLore[0]).toBeInstanceOf(ObjectId);
        expect(mapped.set.relatedLore[0].toHexString()).toBe(WOLF_LORE_ID);
    });

    it('keeps explicit overrides over the derived values (D-11, D-12)', () => {
        const { wolf, golem, spellsById, config } = fixture();
        wolf.xp = 99;

        const overridden = mapEnemy(wolf, spellsById, config, NO_IMAGES);
        const explicit = mapEnemy(golem, spellsById, config, NO_IMAGES);

        assertNoUndefined(overridden.set);
        assertNoUndefined(explicit.set);
        expect(overridden.set.xp).toBe(99);
        expect(overridden.set.lifePoints).toBe(1100);
        expect(explicit.set.xp).toBe(63);
        expect(explicit.set.lifePoints).toBe(5000);
        expect(explicit.set.damages).toEqual({
            base: [{ type: 'blunt', power: 1000 }],
            energy: [],
        });
    });

    it('copies the whole catalog spell with its id (Pitfall 8)', () => {
        const { golem, spellsById, config } = fixture();

        const mapped = mapEnemy(golem, spellsById, config, NO_IMAGES);

        assertNoUndefined(mapped.set);
        const [spell] = mapped.set.spells;
        expect(Object.keys(spell)).toEqual([
            '_id',
            'name',
            'description',
            'useType',
            'energyDamage',
            'requiredLearnTime',
            'minXpToLearn',
            'recoveryTime',
            'maxUsages',
        ]);
        expect(spell._id).toBeInstanceOf(ObjectId);
        expect(spell._id.toHexString()).toBe(SPELL_ID);
        expect(spell.energyDamage).toEqual({ type: 'fire', power: 300 });
    });

    it('throws when a spell reference is missing from the catalog (D-13)', () => {
        const { golem, config } = fixture();

        expect(() => mapEnemy(golem, new Map(), config, NO_IMAGES)).toThrow(
            SPELL_ID,
        );
    });

    it('never writes category, tier or source (D-10, D-11)', () => {
        const { wolf, golem, spellsById, config } = fixture();

        for (const entry of [wolf, golem]) {
            const { set } = mapEnemy(entry, spellsById, config, NO_IMAGES);
            assertNoUndefined(set);
            expect(set).not.toHaveProperty('category');
            expect(set).not.toHaveProperty('tier');
            expect(set).not.toHaveProperty('source');
            expect(set).not.toHaveProperty('id');
        }
    });

    it('takes the enemy image path from images.yaml (D-24)', () => {
        const { wolf, spellsById, config } = fixture();
        const url = 'https://res.cloudinary.com/klimmeck/image/upload/lupo.png';

        const withLink = mapEnemy(
            wolf,
            spellsById,
            config,
            imageUrlsOf([{ id: WOLF_ID, url }]),
        );
        const withoutLink = mapEnemy(wolf, spellsById, config, NO_IMAGES);

        assertNoUndefined(withLink.set);
        expect(withLink.set.imagePath).toBe(url);
        expect(withoutLink.set.imagePath).toBe(
            'assets/images/lupo-di-prova.png',
        );
    });
});
