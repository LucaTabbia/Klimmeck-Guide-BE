---
phase: 13-generazione-quest
plan: 10
subsystem: quests (generazione, composizione pura)
tags: [quests, generation, composition, BE-QGEN-03, BE-QGEN-05, D-04, D-05, D-06, D-07, D-08, D-09]
requires: ["13-09"]
provides:
  - "`EnemyCandidate`, `zonePoolOf`, `fallbackPoolOf` in src/quests/generation/enemy-pool.ts (zona del POI + habitat city, `all` solo di ripiego, `legendary === false` fail-closed)"
  - "`composeQuest(input): Composition | null` in src/quests/generation/quest-composition.ts: forme (a)/(b), branchi legend di 2–4 nemici hero, boss 1 su 10 con posti da `bossSeatsOf`"
affects: [13-11, 13-12, 13-13, 13-17]
tech-stack:
  added: []
  patterns:
    - "Funzioni pure deterministiche dato il `ChanceSource`: candidati ordinati per id, ordine dei tiri fisso, prove su 200 semi di `SeededChanceSource`"
key-files:
  created:
    - src/quests/generation/enemy-pool.ts
    - src/quests/generation/enemy-pool.spec.ts
    - src/quests/generation/quest-composition.ts
    - src/quests/generation/quest-composition.spec.ts
  modified: []
decisions:
  - "Il pool di zona ignora la location `all` anche se compare fra i `type` del POI: `all` entra solo nel ripiego (D-08)"
  - "Il pool di ripiego si prova solo se aggiunge nemici (`fallback.length > zone.length`): nessun tiro sprecato su un pool identico"
  - "Ordine dei tiri: legend → unità, tipi, scelte; altri ranghi → tiro del boss (solo adventurer..hero), scelta del boss, tiro della forma, poi le scelte della forma; il boss senza candidati in zona e ripiego ripiega su enemy senza ritirare la forma del boss"
  - "Indice di un'estrazione = `min(len − 1, floor(next × len))`; il numero di tipi del branco (b) è `1 + floor(next × MAX_PACK_TYPES)` limitato ai candidati"
metrics:
  duration: "~15 min"
  completed: 2026-11-04
  tasks: 2
  files: 4
---

# Phase 13 Plan 10: pool dei nemici e composizione delle quest generate Summary

Il generatore sa ora comporre una quest da un catalogo di candidati e dai `type` del POI: pool coerente con la zona più l'habitat `city` (ripiego `all` solo quando la zona non compone la forma), nemico singolo della fascia o branco di nemici più deboli, branchi legend di 2–4 nemici della fascia hero, boss di un solo nemico con 2–6 posti una volta su 10; i leggendari e i nemici senza flag non entrano mai.

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | bec28a3 | `test(generation): pin the enemy pool of a point of interest` |
| 1 GREEN | 612b8e5 | `feat(generation): pool the enemies of a point of interest` |
| 2 RED | 308aa14 | `test(generation): pin the composition of generated quests` |
| 2 GREEN | 4865165 | `feat(generation): compose generated enemy and boss quests` |

## RED osservati

- Task 1: suite fallita al caricamento, `Could not locate module src/quests/generation/enemy-pool`, 0 test eseguiti.
- Task 2: suite fallita al caricamento, `Could not locate module src/quests/generation/quest-composition`, 0 test eseguiti. Il RED nascondeva anche un secondo errore di caricamento (import `test/quests/sequence-chance` non risolto da jest), emerso al GREEN e corretto (vedi Deviations).

## Nomi e firme

- src/quests/generation/enemy-pool.ts: `export interface EnemyCandidate { id: string; name: string; xp: number; locations: readonly string[]; legendary: unknown; relatedLore: readonly string[]; baseWeaknesses: readonly string[]; energyWeaknesses: readonly string[] }`; `export function zonePoolOf(enemies: readonly EnemyCandidate[], poiTypes: readonly string[]): EnemyCandidate[]` (legendary === false e una location `city` o in `poiTypes` diversa da `all`, ordinati per id con `localeCompare`); `export function fallbackPoolOf(enemies, poiTypes): EnemyCandidate[]` (zona più chi ha `all`, ordinati per id). Privati: `CITY_HABITAT`, `ANYWHERE`, `isGeneratable`, `byId`, `livesIn`, `livesAnywhere`.
- src/quests/generation/quest-composition.ts: `export interface ComposedEnemy { enemy: EnemyCandidate; quantity: number }`; `export interface Composition { type: QuestType.enemy | QuestType.boss; rank: GeneratedRank; enemies: ComposedEnemy[]; seats: number }`; `export interface CompositionInput { rank: GeneratedRank; enemies: readonly EnemyCandidate[]; poiTypes: readonly string[]; chance: ChanceSource }`; `export function composeQuest(input: CompositionInput): Composition | null`. Privati: `singleForm`, `packForm` (fino a `PACK_ATTEMPTS`), `drawPack`, `legendPack`, `bossOf`, `composeBossQuest`, `composeEnemyQuest`, `composeLegendQuest`, `ENEMY_SEATS = 1`, `MIN_PACK_UNITS = 2`.
- Enemy: `seats = 1`; boss: `seats = bossSeatsOf(xp, BOSS_PARTY_AVERAGE_PE[rank])`, `enemies = [{ enemy, quantity: 1 }]`; voci del branco nell'ordine di scelta; `null` quando né zona né ripiego servono il rango.

## Verifiche

- `npx jest src/quests/generation/quest-composition.spec.ts src/quests/generation/enemy-pool.spec.ts --selectProjects unit`: 2 suite, 16 test verdi (11 + 5); `npx jest src/quests/generation --selectProjects unit`: 4 suite, 32 test.
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier (check) ed eslint puliti sui quattro file, uno per uno.
- Acceptance: `legendary === false` 1 in enemy-pool.ts; `D-08)` 4 e `D-04)` 1 nella spec del pool; `D-08)` 2, `D-09)` 1, `D-06)` 1 nella spec della composizione; `Math.random` 0 in quest-composition.ts.
- Schema invariato: `git diff origin/develop -- src/schema.gql` toglie solo le due righe `  enemy: Enemy`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import di `SequenceChance` non risolto da jest nelle spec sotto `src/`**
- **Found during:** Task 2 (GREEN)
- **Issue:** `import { SequenceChance } from 'test/quests/sequence-chance'` fallisce (`Cannot find module`): il moduleNameMapper copre solo `src/`.
- **Fix:** percorso relativo `../../../test/quests/sequence-chance`, come le altre spec di `src/quests/party`.
- **Files modified:** src/quests/generation/quest-composition.spec.ts
- **Commit:** 4865165

**2. [Rule 1 - Bug del test] Candidato «senza flag» del test D-04 valeva `false`**
- **Found during:** Task 2 (GREEN)
- **Issue:** `enemy('z03', …, undefined)` attivava il valore di default `false` del parametro: il candidato entrava e il test falliva per un difetto della fixture, non del codice.
- **Fix:** `{ ...enemy('z03', 'Nuovo', 99), legendary: undefined }`.
- **Files modified:** src/quests/generation/quest-composition.spec.ts
- **Commit:** 4865165

## Known Stubs

Nessuno.

## Self-Check: PASSED

- I quattro file creati esistono; i commit bec28a3, 612b8e5, 308aa14, 4865165 sono nella storia del branch.
