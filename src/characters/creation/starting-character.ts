import { Types } from 'mongoose';
import { NormalizedCharacterInput } from 'src/characters/creation/normalized-character-input';
import { TitleType } from 'src/models/enums/title-type.enum';
import { LEVEL_TABLE } from 'src/quests/outcomes/progression/level-table';

const STARTING_LEVEL = LEVEL_TABLE[0].level;
const STARTING_XP = 0;
// 1000 (D-12): stessa tabella degli esiti
const STARTING_LIFE_POINTS = LEVEL_TABLE[0].maxLifePoints;
const STARTING_SILVER = 5;

export interface StartingCharacter {
    infos: NormalizedCharacterInput;
    status: {
        xp: number;
        level: number;
        title: TitleType;
        location: Types.ObjectId;
        injuries: never[];
        spells: never[];
        coins: { gold: number; silver: number; copper: number };
        currentLifePoints: number;
        maxLifePoints: number;
    };
    quests: {
        completedQuests: never[];
        pendingQuest: null;
    };
    assets: {
        ownedEquipments: never[];
        ownedItems: never[];
        wearedEquipment: Record<string, never>;
        activeSpells: never[];
        pet: null;
    };
}

export function buildStartingCharacter(
    input: NormalizedCharacterInput,
    locationId: Types.ObjectId,
): StartingCharacter {
    return {
        infos: {
            name: input.name,
            sex: input.sex,
            pronoun: input.pronoun,
            race: input.race,
            classType: input.classType,
            age: input.age,
            background: input.background,
            imagePath: input.imagePath,
        },
        status: {
            xp: STARTING_XP,
            level: STARTING_LEVEL,
            title: TitleType.rookie,
            location: locationId,
            injuries: [],
            spells: [],
            coins: { gold: 0, silver: STARTING_SILVER, copper: 0 },
            currentLifePoints: STARTING_LIFE_POINTS,
            maxLifePoints: STARTING_LIFE_POINTS,
        },
        quests: {
            completedQuests: [],
            pendingQuest: null,
        },
        assets: {
            ownedEquipments: [],
            ownedItems: [],
            // esplicito: senza, Mongoose non crea il sottodocumento e il campo GraphQL non-null si rompe
            wearedEquipment: {},
            activeSpells: [],
            pet: null,
        },
    };
}
