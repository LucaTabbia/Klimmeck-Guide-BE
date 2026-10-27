import { Model, Types } from 'mongoose';
import { persistPoi } from './poi.fixture';

/**
 * Two-tier Character fixture — valid against src/models/character/**.
 *
 * Two schema traps handled here (Pitfall #5):
 *  - status.xp defaults to 20000 with title 'rookie': no spell slot until the
 *    mage rank (D-13); pass title 'mage' (or above) for equipSpell tests:
 *    <20000→0, <25000→1, <30000→2, <40000→3, else 4.
 *  - status.location is a REQUIRED ref to PointOfInterest. buildCharacter uses a
 *    throwaway ObjectId; persistCharacter creates a real POI when none is given.
 *
 * Spells: build a coherent spell book with spellBook(...) and spread it in,
 *    since overrides replace status/assets whole:
 *    status: { ...buildCharacter().status, spells: book.spells, spellStates: book.spellStates },
 *    assets: { ...buildCharacter().assets, activeSpells: book.activeSpells }
 */
export function buildCharacter(overrides: Record<string, any> = {}) {
    return {
        infos: {
            sex: 'male', // SexType.male
            name: 'Test Hero',
            race: 'human', // RaceType.human
            pronoun: 'he', // PronounType.he
            classType: 'fighter', // ClassType.fighter
            age: 20,
            background: 'test',
            imagePath: null,
        },
        status: {
            xp: 20000, // maxActiveSpells 0 as rookie, 1 from the mage rank
            level: 1,
            location: new Types.ObjectId(), // ref POI (required) — replaced in persist
            title: 'rookie', // TitleType.rookie
            injuries: [],
            spells: [],
            spellStates: [],
            coins: { gold: 0, silver: 0, copper: 0 },
            currentLifePoints: 100,
            maxLifePoints: 100,
        },
        quests: {
            completedQuests: [],
            pendingQuest: null,
        },
        assets: {
            ownedEquipments: [],
            ownedItems: [],
            wearedEquipment: {},
            activeSpells: [],
            pet: null,
        },
        ...overrides,
    };
}

export interface SpellBookEntry {
    spell: Types.ObjectId | string; // stringa = ref legacy salvato come stringa (04 Pitfall 1)
    usages: number;
    recoveries?: Date[];
    active?: boolean;
}

// stato coerente per i test (D-03): spells, spellStates e activeSpells con lo stesso ordine; il mirror vale quanto lo stato (D-04)
export function spellBook(entries: readonly SpellBookEntry[]) {
    return {
        spells: entries.map((entry) => entry.spell),
        spellStates: entries.map((entry) => ({
            spell: new Types.ObjectId(String(entry.spell)),
            usages: entry.usages,
            recoveries: [...(entry.recoveries ?? [])],
        })),
        activeSpells: entries
            .filter((entry) => entry.active)
            .map((entry) => ({ spell: entry.spell, usages: entry.usages })),
    };
}

export async function persistCharacter(
    model: Model<any>,
    overrides: Record<string, any> = {},
    poiModel?: Model<any>,
) {
    const base = buildCharacter(overrides);
    if (!overrides.status?.location && poiModel) {
        const poi = await persistPoi(poiModel);
        base.status.location = poi._id;
    }
    return model.create(base);
}
