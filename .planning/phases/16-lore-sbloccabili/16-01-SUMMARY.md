---
phase: 16-lore-sbloccabili
plan: 01
subsystem: lore (fondazioni pure) + config
tags: [lore, config, BE-LORE-01, BE-LORE-02, BE-LORE-04, BE-LORE-05, D-01, D-03, D-07, D-08, D-10, D-14]
requires: []
provides:
  - "`LORE_CONFIG`, `DEFAULT_LORE_STUDY_CHANCE = 0.5`, `LORE_ENV_KEYS`, `LoreEnv`, `LoreConfig { studyChance }`, `parseLoreConfig`, `readLoreEnv`, `loreConfigProvider` in src/config/lore-config.ts"
  - "`STUDY_LORE_TYPES`, `BESTIARY_LORE_TYPES` in src/lore/study-lore-types.ts"
  - "`GEOGRAPHY_LORE_TYPES`, `GeographyLore`, `geographyOf(cityLore, related)` in src/lore/lore-geography.ts"
  - "`KnowledgeAddition`, `knowledgeAdditionOf(lore, enemies = [])` in src/lore/knowledge-addition.ts"
  - "`LoreVisibility`, `SEES_EVERYTHING`, `SEES_NOTHING`, `refHexOf`, `visibilityOf`, `isVisible`, `knowsEnemy`, `visibleRelated` in src/lore/lore-visibility.ts"
affects: [16-02, 16-03, 16-04, 16-05, 16-06, 16-07, 16-08, 16-09, 16-10]
tech-stack:
  added: []
  patterns:
    - "Config opzionale validata al boot con errore fisso che non ripete il valore; provider con `ConfigService` opzionale (trappola 15-03)"
    - "Add-to-set con `$each` su copia, solo per le liste non vuote"
    - "Visibilità per esadecimale su ogni forma di ref (ObjectId, stringa, documento popolato)"
key-files:
  created:
    - src/config/lore-config.ts
    - src/config/lore-config.spec.ts
    - src/lore/study-lore-types.ts
    - src/lore/study-lore-types.spec.ts
    - src/lore/lore-geography.ts
    - src/lore/lore-geography.spec.ts
    - src/lore/knowledge-addition.ts
    - src/lore/knowledge-addition.spec.ts
    - src/lore/lore-visibility.ts
    - src/lore/lore-visibility.spec.ts
  modified:
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - .env.example
decisions:
  - "`geographyOf` deduplica per `toHexString()` mantenendo la prima occorrenza (la lore della città resta in testa anche se ricompare fra le related)"
  - "`visibilityOf` di uno status senza i due insiemi restituisce un oggetto uguale a `SEES_NOTHING` (non lo stesso riferimento)"
metrics:
  duration: "~10 min"
  completed: 2026-11-07
  tasks: 3
  files: 13
---

# Phase 16 Plan 01: fondazioni pure delle lore sbloccabili Summary

Config opzionale `LORE_STUDY_CHANCE` (default 0,5, validata al boot) più quattro moduli puri in `src/lore/`: tipi dello studio e del Bestiario, geografia di una città senza cascata, builder dell'add-to-set solo se non vuoto e visibilità per viewer confrontata per esadecimale.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 86782e8 | test(config): pin the optional lore study chance |
| 1 GREEN | 33612eb | feat(config): add the optional LORE_STUDY_CHANCE |
| 2 RED | 55c04be | test(lore): pin geography, knowledge addition and visibility |
| 2 GREEN | 51d9f8e | feat(lore): add geography, knowledge addition and visibility |

## Fallimenti RED osservati

- Task 1: `src/config/lore-config.spec.ts` → «Test suite failed to run» (modulo `src/config/lore-config` assente); `src/config/env.validation.spec.ts` → 1 fallito, `throws on an invalid LORE_STUDY_CHANCE (D-08)` (la chiave non era validata, `validateEnv` non lanciava). Suite: 2 fallite, 15 passate; test 1 fallito, 253 passati.
- Task 2: le quattro spec → «Could not locate module src/lore/… mapped as …» (moduli assenti). Suite: 4 fallite, 0 test eseguiti.

## Firme create

```typescript
export function parseLoreConfig(env: LoreEnv): LoreConfig;
export function readLoreEnv(source: Record<string, unknown>): LoreEnv;
export const loreConfigProvider: FactoryProvider<LoreConfig>; // provide LORE_CONFIG, inject [{ token: ConfigService, optional: true }]
export const STUDY_LORE_TYPES: readonly LoreType[];
export const BESTIARY_LORE_TYPES: readonly LoreType[];
export const GEOGRAPHY_LORE_TYPES: readonly LoreType[];
export function geographyOf(cityLore: GeographyLore | null, related: readonly GeographyLore[]): Types.ObjectId[];
export function knowledgeAdditionOf(lore: readonly Types.ObjectId[], enemies?: readonly Types.ObjectId[]): KnowledgeAddition;
export function refHexOf(ref: unknown): string | undefined;
export function visibilityOf(status: { unlockedLore?: unknown[] | null; knownEnemies?: unknown[] | null } | null | undefined): LoreVisibility;
export function isVisible(visibility: LoreVisibility, ref: unknown): boolean;
export function knowsEnemy(visibility: LoreVisibility, ref: unknown): boolean;
export function visibleRelated<T>(visibility: LoreVisibility, related: readonly T[] | null | undefined): T[];
```

Messaggio d'errore della config: `LORE_STUDY_CHANCE must be a number between 0 and 1 (empty = 0.5)`. Nella spec di `validateEnv` l'ambiente valido è `{ JWT_SECRET: VALID_SECRET }` (forma già usata dal caso `AMBUSH_TIMEZONE`).

## Gate

- `npx jest src/config src/lore --selectProjects unit`: 21 suite, 274 test verdi (comprende il drift di `.env.example`).
- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx prettier --write` + `npx eslint` sui dieci `.ts` toccati, uno per uno: puliti (Prettier ha riformattato solo `lore-geography.ts`, `knowledge-addition.spec.ts`, `lore-visibility.spec.ts`).
- `src/schema.gql` invariato; nessuna riga tolta rispetto a `origin/develop`.
- Grep di accettazione dei due task: tutti con il valore atteso.

## Deviations from Plan

- **Bookkeeping di STATE.md:** il piano scrive `Plan: 01 of 12` (e il suo verify grepa quel letterale), il brief dell'orchestratore `Plan: 1 of 12` e la riga attuale ha la forma `Plan: 0 of 12`: applicato `Plan: 1 of 12` (l'orchestratore vince); il grep del verify del task 3 sul letterale `01 of 12` non passa per questo solo motivo.
- Nessun'altra deviazione: piano eseguito come scritto.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti, commit 86782e8, 33612eb, 55c04be, 51d9f8e presenti in `git log`.
