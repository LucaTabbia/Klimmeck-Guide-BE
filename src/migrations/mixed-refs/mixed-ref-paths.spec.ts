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

interface SchemaRef {
    ref: MixedRefPath;
    instance: string;
}

function hasRef(type: ProbedSchemaType | undefined): boolean {
    return Boolean(type?.options?.ref ?? type?.options?.refPath);
}

function refsOf(
    collection: string,
    schema: Schema,
    prefix = '',
    subdocArray?: string,
): SchemaRef[] {
    const found: SchemaRef[] = [];
    schema.eachPath((name, schemaType) => {
        const type = schemaType as unknown as ProbedSchemaType;
        const path = `${prefix}${name}`;
        if (type.schema) {
            const isList = type.instance === 'Array';
            found.push(
                ...refsOf(
                    collection,
                    type.schema,
                    isList ? '' : `${path}.`,
                    isList ? `${subdocArray ?? ''}${path}` : subdocArray,
                ),
            );
            return;
        }
        if (type.instance === 'Array' && type.caster) {
            if (!hasRef(type.caster) && !hasRef(type)) return;
            found.push({
                ref: { collection, path, shape: 'array' },
                instance: type.caster.instance,
            });
            return;
        }
        if (!hasRef(type)) return;
        found.push({
            ref: subdocArray
                ? {
                      collection,
                      path: subdocArray,
                      shape: 'subdocArray',
                      key: path,
                  }
                : { collection, path, shape: 'scalar' },
            instance: type.instance,
        });
    });
    return found;
}

const SCHEMA_REFS: readonly SchemaRef[] = Object.entries(
    SCHEMAS_BY_COLLECTION,
).flatMap(([collection, schema]) => refsOf(collection, schema));

function instanceOf(ref: MixedRefPath): string | undefined {
    const label = mixedRefLabel(ref);
    return SCHEMA_REFS.find((found) => mixedRefLabel(found.ref) === label)
        ?.instance;
}

const CHARACTER_FIELD_LABELS = [
    'characters:assets.activeSpells.spell',
    'characters:assets.pet',
    'characters:assets.wearedEquipment.arms',
    'characters:assets.wearedEquipment.chest',
    'characters:assets.wearedEquipment.firstAccessory',
    'characters:assets.wearedEquipment.foots',
    'characters:assets.wearedEquipment.head',
    'characters:assets.wearedEquipment.leftHand',
    'characters:assets.wearedEquipment.legs',
    'characters:assets.wearedEquipment.rightHand',
    'characters:assets.wearedEquipment.secondAccessory',
    'characters:quests.completedQuests',
    'characters:quests.pendingQuest',
    'characters:status.location',
    'characters:status.spells',
];

const SHARED_AND_CATALOG_PATHS = MIXED_REF_PATHS.filter(
    (ref) => !CHARACTER_FIELD_LABELS.includes(mixedRefLabel(ref)),
).map((ref) => ({ ...ref, label: mixedRefLabel(ref) }));

describe('MIXED_REF_PATHS', () => {
    it('keeps every migrated reference path in the schemas (D-17d)', () => {
        const missing = MIXED_REF_PATHS.map(mixedRefLabel).filter(
            (label) =>
                !SCHEMA_REFS.some(
                    (found) => mixedRefLabel(found.ref) === label,
                ),
        );

        expect(missing).toEqual([]);
    });

    it.each(SHARED_AND_CATALOG_PATHS)(
        'types the reference $label as ObjectId (D-17d)',
        (ref) => {
            expect(instanceOf(ref)).toBe('ObjectId');
        },
    );

    it('leaves no Mixed reference outside the character fields', () => {
        const stillMixed = SCHEMA_REFS.filter(
            (found) => found.instance === 'Mixed',
        )
            .map((found) => mixedRefLabel(found.ref))
            .sort();

        expect(stillMixed).toEqual(CHARACTER_FIELD_LABELS);
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
