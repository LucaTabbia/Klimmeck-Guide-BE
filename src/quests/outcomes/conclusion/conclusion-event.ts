import type { CombatCatalog } from '../resolution-loader.service';

// evento tirato alla conclusione di una quest individuale (quick 261110-cgd): arresto nella crime, scontro nella guard
export type ConclusionEvent =
    | { kind: 'arrest' }
    | { kind: 'guardEncounter'; catalog: CombatCatalog };
