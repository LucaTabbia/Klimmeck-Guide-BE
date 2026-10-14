import { Types } from 'mongoose';
import { NormalizedCharacterInput } from 'src/characters/creation/normalized-character-input';
import { buildStartingCharacter } from 'src/characters/creation/starting-character';
import { ClassType } from 'src/models/enums/class-type.enum';
import { PronounType } from 'src/models/enums/pronoun-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { SexType } from 'src/models/enums/sex-type.enum';

const INPUT: NormalizedCharacterInput = {
    name: 'Aria',
    sex: SexType.female,
    pronoun: PronounType.she,
    race: RaceType.elf,
    classType: ClassType.wizard,
    age: 120,
    background: '',
    imagePath: null,
};

describe('buildStartingCharacter', () => {
    const locationId = new Types.ObjectId();

    it('builds the backend-owned starting state (D-09)', () => {
        expect(buildStartingCharacter(INPUT, locationId)).toEqual({
            infos: {
                name: 'Aria',
                sex: 'female',
                pronoun: 'she',
                race: 'elf',
                classType: 'wizard',
                age: 120,
                background: '',
                imagePath: null,
            },
            status: {
                xp: 0,
                level: 1,
                title: 'rookie',
                location: locationId,
                injuries: [],
                spells: [],
                coins: { gold: 0, silver: 5, copper: 0 },
                currentLifePoints: 100,
                maxLifePoints: 100,
            },
            quests: { completedQuests: [], pendingQuest: null },
            assets: {
                ownedEquipments: [],
                ownedItems: [],
                wearedEquipment: {},
                activeSpells: [],
                pet: null,
            },
        });
    });

    it('keeps the given location ObjectId instance', () => {
        expect(buildStartingCharacter(INPUT, locationId).status.location).toBe(
            locationId,
        );
    });

    it('never shares mutable references between calls', () => {
        const first = buildStartingCharacter(INPUT, locationId);
        const second = buildStartingCharacter(INPUT, locationId);

        expect(first.status.coins).not.toBe(second.status.coins);
        expect(first.status.injuries).not.toBe(second.status.injuries);
        expect(first.assets.wearedEquipment).not.toBe(
            second.assets.wearedEquipment,
        );
    });

    it('leaves the _id to the caller', () => {
        expect(buildStartingCharacter(INPUT, locationId)).not.toHaveProperty(
            '_id',
        );
    });
});
