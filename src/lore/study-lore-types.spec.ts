import { LoreType } from 'src/models/enums/lore-type.enum';
import {
    BESTIARY_LORE_TYPES,
    STUDY_LORE_TYPES,
} from 'src/lore/study-lore-types';

describe('study lore types', () => {
    it('draws the study lore among seven types (D-08)', () => {
        expect(STUDY_LORE_TYPES).toEqual([
            LoreType.knowledge,
            LoreType.god,
            LoreType.religion,
            LoreType.ceremony,
            LoreType.material,
            LoreType.state,
            LoreType.character,
        ]);
    });

    it('names the bestiary types (D-09)', () => {
        expect(BESTIARY_LORE_TYPES).toEqual([
            LoreType.enemy,
            LoreType.animal,
            LoreType.plant,
        ]);
    });
});
