import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { QUEST_GENERATION_CONFIG } from 'src/config/quest-generation-config';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { QuestGenerationSweeper } from 'src/quests/generation/quest-generation.sweeper';
import type { ProviderOverride } from '../auth/auth-test-app';
import {
    buildCity,
    persistEnemy,
    persistEquipmentItem,
    persistLootItem,
    persistPet,
    persistPoi,
} from '../fixtures';

export interface GenerationModels {
    cities: Model<any>;
    pois: Model<any>;
    enemies: Model<any>;
    equipment: Model<any>;
    loot: Model<any>;
    pets: Model<any>;
}

export interface GenerationWorldOptions {
    cities: number;
    poisPerCity: number;
    // città per riga della griglia; lato di 100 unità fra due città vicine
    grid?: number;
    // xp dei nemici generabili (uno per voce); default: due per fascia, da rookie a hero
    enemyXps?: readonly number[];
}

export interface GenerationWorldCity {
    id: Types.ObjectId;
    name: string;
    markerId: Types.ObjectId;
    poiIds: Types.ObjectId[];
}

export interface GenerationWorld {
    cities: GenerationWorldCity[];
    enemyIds: Types.ObjectId[];
    legendaryIds: Types.ObjectId[];
}

// due nemici per fascia (rookie 1–20, adventurer 21–69, paladin 70–224, mage 225–548, hero 549–803)
export const STANDARD_ENEMY_XPS: readonly number[] = [
    8, 12, 22, 30, 80, 120, 250, 400, 560, 700,
];

export const HERO_BAND_ENEMY_XPS: readonly number[] = [560, 700];

export const WORLD_HABITAT = 'forest';

// nessuno sweep periodico; target = numero delle città (D-15)
export const QUIET_GENERATION_CONFIG: QuestGenerationConfig = {
    sweepIntervalMs: 0,
    target: null,
};

// nessuna corsa al boot né sweep negli harness che generano a mano (D-30)
export const IDLE_GENERATION_SWEEPER = {
    onApplicationBootstrap: () => undefined,
    onModuleDestroy: () => undefined,
};

export const QUIET_GENERATION_OVERRIDES: ProviderOverride[] = [
    { token: QuestGenerationSweeper, useValue: IDLE_GENERATION_SWEEPER },
    { token: QUEST_GENERATION_CONFIG, useValue: QUIET_GENERATION_CONFIG },
];

const CITY_SPACING = 100;
const RARITIES = Object.values(RarityType);

async function persistCityWithPois(
    models: GenerationModels,
    index: number,
    poisPerCity: number,
    grid: number,
): Promise<GenerationWorldCity> {
    const id = new Types.ObjectId();
    const x = (index % grid) * CITY_SPACING;
    const y = Math.floor(index / grid) * CITY_SPACING;
    const marker = await persistPoi(models.pois, {
        type: ['city'],
        location: [x, y],
        city: id,
    });
    const pois: { _id: Types.ObjectId }[] = [];
    for (let poi = 0; poi < poisPerCity; poi += 1) {
        pois.push(
            await persistPoi(models.pois, {
                type: [WORLD_HABITAT],
                location: [x + poi + 1, y + poi + 1],
                city: id,
            }),
        );
    }
    const name = `Città ${index}`;
    await models.cities.create(
        buildCity({
            _id: id,
            name,
            markerLocation: marker._id,
            pointsOfInterest: [marker._id, ...pois.map((poi) => poi._id)],
        }),
    );
    return {
        id,
        name,
        markerId: marker._id as Types.ObjectId,
        poiIds: pois.map((poi) => poi._id),
    };
}

async function persistEnemies(
    models: GenerationModels,
    xps: readonly number[],
    legendary: boolean,
): Promise<Types.ObjectId[]> {
    const ids: Types.ObjectId[] = [];
    for (const xp of xps) {
        const enemy = await persistEnemy(models.enemies, {
            name: `${legendary ? 'Leggendario' : 'Nemico'} ${xp}`,
            xp,
            locations: [WORLD_HABITAT],
            baseWeaknesses: ['cut'],
            legendary,
        });
        ids.push(enemy._id as Types.ObjectId);
    }
    return ids;
}

async function persistCatalog(models: GenerationModels): Promise<void> {
    for (const rarity of RARITIES) {
        await persistEquipmentItem(models.equipment, {
            name: `Spada ${rarity}`,
            rarity,
            damages: { base: [{ type: 'cut', power: 50 }], energy: [] },
        });
        await persistLootItem(models.loot, {
            name: `Pozione ${rarity}`,
            rarity,
            effect: 'heal',
            power: 10,
        });
        await persistLootItem(models.loot, {
            name: `Pane ${rarity}`,
            rarity,
            effect: 'hunger',
            power: 5,
        });
    }
}

async function persistPets(models: GenerationModels): Promise<void> {
    await persistPet(models.pets, { name: 'Pet da quest A', sellable: false });
    await persistPet(models.pets, { name: 'Pet da quest B', sellable: false });
    await persistPet(models.pets, { name: 'Pet in vendita', sellable: true });
}

// città con marker `city` e POI `forest`, un nemico e un leggendario per ogni voce di `enemyXps`, catalogo per rarità, pet
export async function persistGenerationWorld(
    models: GenerationModels,
    options: GenerationWorldOptions,
): Promise<GenerationWorld> {
    const grid =
        options.grid ?? Math.max(1, Math.ceil(Math.sqrt(options.cities)));
    const cities: GenerationWorldCity[] = [];
    for (let index = 0; index < options.cities; index += 1) {
        cities.push(
            await persistCityWithPois(models, index, options.poisPerCity, grid),
        );
    }
    const xps = options.enemyXps ?? STANDARD_ENEMY_XPS;
    const enemyIds = await persistEnemies(models, xps, false);
    const legendaryIds = await persistEnemies(models, xps, true);
    await persistCatalog(models);
    await persistPets(models);
    return { cities, enemyIds, legendaryIds };
}

// generate per città, zeri compresi; le quest fuori dai POI del mondo finiscono sotto `fuori mappa`
export function generatedPerCityOf(
    world: GenerationWorld,
    markers: readonly Types.ObjectId[],
): Record<string, number> {
    const counts: Record<string, number> = Object.fromEntries(
        world.cities.map((city) => [city.name, 0]),
    );
    for (const marker of markers) {
        const city = world.cities.find((candidate) =>
            candidate.poiIds.some((id) => id.equals(marker)),
        );
        const key = city?.name ?? 'fuori mappa';
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}
