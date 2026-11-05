---
phase: 13-generazione-quest
plan: 13
subsystem: quests (generazione, servizio del generatore e configurazione)
tags: [quests, generation, config, single-flight, BE-QGEN-02, BE-QGEN-03, BE-QGEN-04, BE-QGEN-05, BE-QGEN-07, D-14, D-15, D-17, D-28, D-30]
requires: ["13-09", "13-10", "13-11", "13-12"]
provides:
  - "`QUEST_GENERATION_CONFIG`, `QUEST_GENERATION_ENV_KEYS`, `parseQuestGenerationConfig`, `readQuestGenerationEnv`, `questGenerationConfigProvider` in src/config/quest-generation-config.ts"
  - "`generatedQuestDraftOf` / `GeneratedQuestDraft` in src/quests/generation/generated-quest-draft.ts"
  - "`QuestGenerator` (generate, request, whenIdle) in src/quests/generation/quest-generator.service.ts"
  - "`QuestGenerationTrigger` (porta astratta) e `QuestGenerationTriggerModule` (modulo leggero, D-30)"
  - "Mondo di prova `persistGenerationWorld` in test/quests/generation-world.ts"
affects: [13-14, 13-15, 13-18, 13-19]
tech-stack:
  added: []
  patterns:
    - "Single-flight con rerun: `inFlight ??= drain().finally(...)`, `drain` ripete `runOnce` finché `rerun`; un rerun chiesto nella finestra fra la fine di `drain` e il `finally` riparte dal `finally`"
    - "Corsa che legge il mondo una volta (lean, ordinato per id) e poi aggiorna in memoria POI liberi, conteggi per città e per rango dopo ogni quest"
key-files:
  created:
    - src/config/quest-generation-config.ts
    - src/config/quest-generation-config.spec.ts
    - src/quests/generation/generated-quest-draft.ts
    - src/quests/generation/generated-quest-draft.spec.ts
    - src/quests/generation/quest-generation-trigger.ts
    - src/quests/generation/quest-generator.service.ts
    - src/quests/generation/quest-generation-trigger.module.ts
    - src/quests/generation/quest-generator.int-spec.ts
    - test/quests/generation-world.ts
  modified:
    - src/config/sweep-interval.ts
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - .env.example
decisions:
  - "`parseSweepIntervalMs(name, raw, fallback = DEFAULT_SWEEP_INTERVAL_MS)`: il messaggio d'errore dell'intervallo è lo stesso degli altri sweep (`... must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)`)"
  - "Il target conta le città a DB (`cityModel.find({})`), anche quelle scartate dalla corsa perché il marker manca o non ha una `location` valida"
  - "Ripiego sui ranghi: `[leastCoveredRank(counts), ...altri per copertura crescente]` (sort stabile su `GENERATED_RANKS`, parità → rango più basso); ogni tentativo consuma i tiri di `composeQuest`"
  - "Il POI scelto esce dai liberi PRIMA del tentativo: non componibile o E11000 ⇒ resta fuori per la corsa e la corsa prosegue (il ciclo termina perché i POI finiscono)"
  - "Le generate aperte su un POI che non appartiene ad alcuna città contano nel target e nel rango ma non nel tetto per città"
  - "I tipi di `GeneratedQuestDraft` usano `requiredPoints: number | null` e `generated: boolean` (non i letterali) perché i grep di accettazione chiedono una sola riga con i letterali nel file"
metrics:
  duration: "~35 min"
  completed: 2026-11-04
  tasks: 3
  files: 13
---

# Phase 13 Plan 13: servizio del generatore Summary

Il generatore esiste ed è configurabile: `QuestGenerator` legge città, POI, quest aperte, nemici `legendary: false`, catalogo e pet non vendibili, poi crea una quest `enemy`/`boss` alla volta fino al target (`QUEST_GENERATION_TARGET`, vuota = numero delle città), con tetto 3 per città, POI liberi (marker escluso), rango meno coperto ricalcolato dopo ogni creazione e ripiego sugli altri ranghi quando il POI non compone il primo; un E11000 sull'indice parziale segna il POI preso e la corsa prosegue. Single-flight, rerun accodato, nessun trigger automatico (D-30: arrivano nel 13-14).

## Firme esatte

```typescript
// src/config/quest-generation-config.ts
export const QUEST_GENERATION_CONFIG = 'QUEST_GENERATION_CONFIG';
export const DEFAULT_QUEST_GENERATION_SWEEP_INTERVAL_MS = 3_600_000;
export const MAX_QUEST_GENERATION_TARGET = 10_000;
export const QUEST_GENERATION_ENV_KEYS = ['QUEST_GENERATION_SWEEP_INTERVAL_MS', 'QUEST_GENERATION_TARGET'] as const;
export type QuestGenerationEnv = Partial<Record<(typeof QUEST_GENERATION_ENV_KEYS)[number], string>>;
export interface QuestGenerationConfig { sweepIntervalMs: number; target: number | null }
export function parseQuestGenerationConfig(env: QuestGenerationEnv): QuestGenerationConfig
export function readQuestGenerationEnv(source: Record<string, unknown>): QuestGenerationEnv
export const questGenerationConfigProvider: FactoryProvider<QuestGenerationConfig>

// src/config/sweep-interval.ts
export function parseSweepIntervalMs(name: string, raw: string | undefined, fallback = DEFAULT_SWEEP_INTERVAL_MS): number

// src/quests/generation/generated-quest-draft.ts
export interface GeneratedQuestCity { name: string; relatedLore: string | null }
export interface GeneratedQuestDraftInput { composition: Composition; poiId: string; city: GeneratedQuestCity; prizes: GeneratedPrizes; recommendedLoot: readonly GeneratedAssetRef[]; chance: ChanceSource }
export interface GeneratedAssetQuantity { itemType: ItemReferenceType; item: Types.ObjectId; quantity: number }
export interface GeneratedQuestDraft { infos; requirements; prizes; registeredAdventurers: []; concludedAt: null; startedAt: null; rescue: null; generated: boolean }
export function generatedQuestDraftOf(input: GeneratedQuestDraftInput): GeneratedQuestDraft

// src/quests/generation/quest-generation-trigger.ts
export abstract class QuestGenerationTrigger { abstract request(): void }

// src/quests/generation/quest-generator.service.ts
@Injectable() export class QuestGenerator extends QuestGenerationTrigger {
    constructor(cityModel, poiModel, questModel, enemyModel, equipmentModel, lootModel, petModel, @Inject(QUEST_GENERATION_CONFIG) config, chance: ChanceSource)
    generate(): Promise<number>
    request(): void
    whenIdle(): Promise<void>
}
```

Messaggi d'errore: `QUEST_GENERATION_TARGET must be an integer between 0 and 10000 (empty = one generated quest per city)`; `QUEST_GENERATION_SWEEP_INTERVAL_MS must be an integer between 0 and 2147483647 milliseconds (0 disables the periodic sweep)`. Log: `Generatore: ${created} missioni create (target ${target})`, `Generatore: POI ${poiId} già occupato da un'altra corsa, si prosegue` (warn), `Generatore: corsa fallita (${describeError(error)})` (error, solo da `request`).

Ordine dei tiri per quest: `pickCity` (1), `pickPoi` (1), `composeQuest` per ogni rango tentato, `prizesOf`, l'annuncio di `generatedQuestDraftOf` (1).

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec della configurazione e del template | 5a320e0 |
| 1 GREEN | config, `parseSweepIntervalMs` con fallback, `validateEnv`, `.env.example` | 04c60f0 |
| 2 RED | spec del documento generato | 69823c8 |
| 2 GREEN | `generated-quest-draft.ts` | 8b91260 |
| 3 RED | int-spec del generatore + mondo di prova | 293b6dc |
| 3 GREEN | `QuestGenerator`, `QuestGenerationTrigger`, `QuestGenerationTriggerModule` | 79c5578 |

## Fallimenti RED osservati

- Task 1: suite `quest-generation-config.spec.ts` «failed to run» (modulo mancante); in `env.validation.spec.ts` 3 test rossi (target e intervallo malformati accettati, chiavi assenti dal template).
- Task 2: suite «failed to run» (modulo `generated-quest-draft` mancante).
- Task 3: suite «failed to run» (`Could not locate module src/quests/generation/quest-generation-trigger`).

## Test aggiunti

- Config: 19 test (intervallo di default, 0, malformati senza eco; target vuoto/0/167/10000, malformati senza eco; lettura delle chiavi) + 3 in env.validation.spec.ts.
- Draft: 6 test (D-09 ×2, D-05, D-17, D-22 ×2), incluso il controllo che si consumi un solo tiro.
- Generatore: 15 test di integrazione, oltre a quelli del piano: `wires the generator as the light trigger without a boot run (D-30)` (il modulo non crea nulla da solo, `QuestGenerationTrigger` è la stessa istanza), `rotates every rank, legend included, on an empty world (D-15)` (12 quest = 2 per ognuno dei 6 ranghi), `runs on request when idle and resolves whenIdle after the run (D-17)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Robustezza] rerun perso nella finestra di fine corsa**
- **Found during:** Task 3
- **Issue:** con il solo `inFlight ??= drain().finally(() => inFlight = null)` un `request()` arrivato fra la risoluzione di `drain` e l'esecuzione del `finally` riceveva la promessa in chiusura e il rerun andava perso fino al trigger successivo.
- **Fix:** il `finally` riparte (`startSafely()`) se `rerun` è ancora vero; `request()` e il `finally` condividono `startSafely()` con il log `describeError`.
- **Files modified:** src/quests/generation/quest-generator.service.ts
- **Commit:** 79c5578

**2. [Rule 3 - Blocco] tsc sui file del RED**
- **Found during:** Task 3 GREEN
- **Issue:** `const pois = []` in test/quests/generation-world.ts inferito come `never[]`; `QuestGenerationConfig` nel costruttore decorato richiede `import type` (TS1272); eslint `no-unnecessary-type-assertion` sul `raced!` della int-spec.
- **Fix:** array tipizzato, `import type`, contenitore `race.poi`; i ritocchi alla int-spec e al mondo di prova sono nel commit GREEN 79c5578 (nessun cambio di asserzioni).

Altro: i test del draft costruiscono `Composition` con `TitleType.x` (sottoinsieme `GeneratedRank`). Nessun test verde al primo colpo.

## Gates

- `npx tsc --noEmit -p tsconfig.json` esce 0.
- `npx jest src/quests/generation src/config --selectProjects unit`: 25 suite / 315 test verdi (drift spec inclusa, senza modifiche).
- `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand`: 15/15.
- prettier + eslint puliti su ogni file `.ts` toccato.
- `src/schema.gql` invariato (il modulo non è importato da `AppModule`); vs origin/develop tolte solo le due righe `  enemy: Enemy`.
- Grep di accettazione: `isDuplicateKeyError` 2, `legendary: false` 1, `OnApplicationBootstrap` 0, `Math.random` 0, `D-28)` 1, `D-15)` 7 nella int-spec; `generated: true` 1 e `requiredPoints: null` 1 nel draft; `D-15)` 3 nella spec di config; nessun `process.env.` nei file nuovi.

## Known Stubs

Nessuno. Il generatore non ha trigger automatici: arrivano nel piano 13-14 (dichiarato dal piano).

## Self-Check: PASSED
