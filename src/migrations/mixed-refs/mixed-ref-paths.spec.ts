import type { Schema } from 'mongoose';
import { CharacterSchema } from 'src/models/character/character.model';
import { CitySchema } from 'src/models/city.model';
import { EnemySchema } from 'src/models/enemy.model';
import { EquipmentItemSchema } from 'src/models/equipment-item.model';
import { LootItemSchema } from 'src/models/loot-item.model';
import { LoreSchema } from 'src/models/lore.model';
import { PendingQuestSchema } from 'src/models/pending-quest.model';
import { PetSchema } from 'src/models/pet.model';
import { PointOfInterestSchema } from 'src/models/point-of-interest.model';
import { QuestResultSchema } from 'src/models/quest-result/quest-result.model';
import { QuestSchema } from 'src/models/quest/quest.model';
import { RoadSchema } from 'src/models/road.model';
import { SpellSchema } from 'src/models/spell.model';
import { UserSchema } from 'src/models/user.model';
import {
    MIXED_REF_PATHS,
    MixedRefPath,
    mixedRefLabel,
} from './mixed-ref-paths';

const SCHEMAS_BY_COLLECTION: Record<string, Schema> = {
    users: UserSchema,
    pendingquests: PendingQuestSchema,
    characters: CharacterSchema,
    quests: QuestSchema,
    cities: CitySchema,
    pointsofinterest: PointOfInterestSchema,
    enemies: EnemySchema,
    lore: LoreSchema,
    equipmentitems: EquipmentItemSchema,
    questresults: QuestResultSchema,
    spells: SpellSchema,
    pets: PetSchema,
    lootitems: LootItemSchema,
    roads: RoadSchema,
};

interface ProbedSchemaType {
    instance: string;
    options?: { ref?: unknown; refPath?: unknown };
    schema?: Schema;
    caster?: ProbedSchemaType;
}

function isMixedRef(type: ProbedSchemaType | undefined): boolean {
    return (
        type?.instance === 'Mixed' &&
        Boolean(type.options?.ref ?? type.options?.refPath)
    );
}

function mixedRefsOf(
    collection: string,
    schema: Schema,
    prefix = '',
    subdocArray?: string,
): MixedRefPath[] {
    const found: MixedRefPath[] = [];
    schema.eachPath((name, schemaType) => {
        const type = schemaType as unknown as ProbedSchemaType;
        const path = `${prefix}${name}`;
        if (type.schema) {
            const isList = type.instance === 'Array';
            found.push(
                ...mixedRefsOf(
                    collection,
                    type.schema,
                    isList ? '' : `${path}.`,
                    isList ? `${subdocArray ?? ''}${path}` : subdocArray,
                ),
            );
            return;
        }
        if (type.instance === 'Array' && isMixedRef(type.caster)) {
            found.push({ collection, path, shape: 'array' });
            return;
        }
        if (!isMixedRef(type)) return;
        found.push(
            subdocArray
                ? {
                      collection,
                      path: subdocArray,
                      shape: 'subdocArray',
                      key: path,
                  }
                : { collection, path, shape: 'scalar' },
        );
    });
    return found;
}

function byLabel(refs: readonly MixedRefPath[]): MixedRefPath[] {
    return [...refs].sort((a, b) =>
        mixedRefLabel(a).localeCompare(mixedRefLabel(b)),
    );
}

describe('MIXED_REF_PATHS', () => {
    it('lists every Mixed reference of the schemas (D-17d)', () => {
        const fromSchemas = Object.entries(SCHEMAS_BY_COLLECTION).flatMap(
            ([collection, schema]) => mixedRefsOf(collection, schema),
        );

        expect(byLabel(MIXED_REF_PATHS)).toEqual(byLabel(fromSchemas));
    });

    it('labels a reference as collection, path and subdocument key (D-17d)', () => {
        expect(
            mixedRefLabel({
                collection: 'characters',
                path: 'assets.ownedItems',
                shape: 'subdocArray',
                key: 'item',
            }),
        ).toBe('characters:assets.ownedItems.item');
        expect(
            mixedRefLabel({
                collection: 'users',
                path: 'currentCharacter',
                shape: 'scalar',
            }),
        ).toBe('users:currentCharacter');
    });

    it('counts 34 references in 10 collections (D-17d)', () => {
        const collections = new Set(
            MIXED_REF_PATHS.map((ref) => ref.collection),
        );

        expect(MIXED_REF_PATHS).toHaveLength(34);
        expect([...collections].sort()).toEqual([
            'characters',
            'cities',
            'enemies',
            'equipmentitems',
            'lore',
            'pendingquests',
            'pointsofinterest',
            'questresults',
            'quests',
            'users',
        ]);
    });
});
