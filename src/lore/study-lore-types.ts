import { LoreType } from 'src/models/enums/lore-type.enum';

// tipi del pool dello studio (Phase 16 D-08) e del Bestiario (D-09, solo per i test di contratto e il handoff)

export const STUDY_LORE_TYPES: readonly LoreType[] = [
    LoreType.knowledge,
    LoreType.god,
    LoreType.religion,
    LoreType.ceremony,
    LoreType.material,
    LoreType.state,
    LoreType.character,
];

export const BESTIARY_LORE_TYPES: readonly LoreType[] = [
    LoreType.enemy,
    LoreType.animal,
    LoreType.plant,
];
