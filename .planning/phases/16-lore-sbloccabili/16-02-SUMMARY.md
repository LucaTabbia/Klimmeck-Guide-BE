---
phase: 16-lore-sbloccabili
plan: 02
subsystem: models + results (contratto SDL delle lore sbloccabili)
tags: [lore, models, results, graphql, BE-LORE-01, BE-LORE-03, BE-LORE-05, D-01, D-09]
requires: ["16-01"]
provides:
  - "`CharacterStatus.unlockedLore: Types.ObjectId[]` (`@Field(() => [ID])`, ref `Lore`, default `[]`) in src/models/character/character-status.model.ts"
  - "`CharacterStatus.knownEnemies: Types.ObjectId[]` (solo `@Prop`, ref `Enemy`, default `[]`)"
  - "`QuestResult.loreUnlocked: (Types.ObjectId | Lore)[]` (`@Field(() => [Lore])`, ref `Lore`, default `[]`) in src/models/quest-result/quest-result.model.ts"
  - "`QUEST_RESULT_POPULATE` con `{ path: 'loreUnlocked', model: Lore.name }` in coda; `ResultRefsHolder.loreUnlocked?: unknown[] | null`; `dropOrphanResultRefs` toglie in place le lore non risolte; `unpopulatedResultOf` risponde `loreUnlocked: []`"
  - "`Lore` registrato nel `forFeature` di `QuestResultsReadModule`"
  - "`buildQuestResult` con `loreUnlocked: []` dopo `spellLearned: null`"
affects: [16-03, 16-04, 16-05, 16-06, 16-07, 16-08, 16-09, 16-10, 16-11]
tech-stack:
  added: []
  patterns:
    - "Ref di soli id sul filo come `[ID!]!` senza populate (modello `rescuedCharacters`)"
    - "Orfani di un array di ref popolato tolti con `splice` in place: la riassegnazione depopola"
key-files:
  created: []
  modified:
    - src/models/character/character-status.model.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/quests/results/quest-results-read.module.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - test/quests/quest-result.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "`dropOrphanResultRefs` toglie le lore orfane con `splice` all'indietro invece di riassegnare il risultato di `filter`: su un documento idratato la riassegnazione casta i documenti popolati a ObjectId e `Lore.id` esce come Buffer (Rule 1)"
metrics:
  duration: "~25 min"
  completed: 2026-11-07
  tasks: 3
  files: 11
---

# Phase 16 Plan 02: modelli e SDL delle lore sbloccabili Summary

I due insiemi di conoscenza sul personaggio (`status.unlockedLore` sul filo come `[ID!]!`, `status.knownEnemies` interno) e le lore nuove dell'esito (`QuestResult.loreUnlocked: [Lore!]!`, popolate da `QUEST_RESULT_POPULATE` con gli orfani scartati) entrano nei modelli e nello SDL dal boot reale, con due sole righe aggiunte.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 925ad2b | test(characters): pin the unlocked lore ids on the character (D-01) |
| 1 GREEN | dbb0e37 | feat(models): add the lore and enemy knowledge sets to the character |
| 2 RED | ab3b95a | test(results): pin the lore unlocked by an outcome (D-09) |
| 2 GREEN | f70e440 | feat(results): add the lore unlocked by an outcome |

## Fallimenti RED osservati

- Task 1 (`test/app.int-spec.ts` + `character-updated.subscription.int-spec.ts`, integration): 4 falliti su 92. `writes the travel contract into the generated schema` (blocco `type CharacterStatus` senza `unlockedLore`) e i tre casi `(D-01)` (campo sconosciuto sulla query e sulla sottoscrizione).
- Task 2 unit: 4 falliti su 32. Il `toEqual` di `QUEST_RESULT_POPULATE`, `drops the orphan unlocked lore (D-09)`, `answers no unlocked lore without populate (D-09)` e `validates a complete result with empty lists and null optional refs` (`loreUnlocked` undefined: la ricerca lo dava «nessun rosso», invece è rosso finché il campo manca).
- Task 2 integration: 15 falliti su 133. `writes the quest result contract into the generated schema` più tutti i 14 casi di `quest-result.resolver.int-spec.ts`, con «Nest could not find LoreModel element»: il `beforeAll` crea la collezione `Lore` via `getModelToken` e il modulo non registrava ancora il modello (Pitfall 2).

## Righe SDL

`git diff origin/develop -- src/schema.gql`: due righe aggiunte, nessuna tolta.
- `+  unlockedLore: [ID!]!` (in `type CharacterStatus`, fra `title` e `xp`)
- `+  loreUnlocked: [Lore!]!` (in `type QuestResult`, fra `levelBefore` e `maxLifePoints`)

## Letterali tipizzati toccati

Nessuno: `npx tsc --noEmit -p tsconfig.json` è uscito 0 dopo ogni GREEN senza altre modifiche (l'unico letterale `QuestResult` costruito a mano è `unpopulatedResultOf`, aggiornato dal piano).

## Gate

- `npx jest test/app.int-spec.ts src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 92 test verdi.
- `npx jest src/quests/results src/models/quest-result --selectProjects unit`: 3 suite, 32 test verdi.
- `npx jest test/app.int-spec.ts src/quests/results --selectProjects integration --runInBand`: 7 suite, 133 test verdi.
- Sweep extra `npx jest src/travel src/quests src/characters src/models --selectProjects unit`: 116 suite, 1400 test verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier + eslint sui `.ts` toccati, uno per uno: puliti (l'unico warning, `test/app.int-spec.ts:977` `no-base-to-string`, c'era già). Prettier ha riformattato solo `character-updated.subscription.int-spec.ts` e `quest-result.resolver.int-spec.ts` prima dei commit RED.
- Grep di accettazione dei due task: tutti con il valore atteso.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lore popolate depopolate dalla riassegnazione**
- **Found during:** Task 2 GREEN
- **Issue:** con `result.loreUnlocked = result.loreUnlocked.filter(isResolvedRef)` su un documento idratato Mongoose casta di nuovo l'array a ObjectId; `Lore.id` arriva al filo come l'`id` di bson (Buffer) e il caso `(D-09)` rispondeva `INTERNAL_SERVER_ERROR` «ID cannot represent value: { type: "Buffer", ... }».
- **Fix:** helper privato `dropUnresolvedInPlace(refs)` che toglie le voci non risolte con `splice` dall'ultimo indice; la spec unit con l'array semplice resta verde.
- **Files modified:** src/quests/results/quest-result.populate.ts
- **Commit:** f70e440

**2. Bookkeeping di STATE.md:** il piano scrive `Plan: 02 of 12` (e il verify del task 3 grepa quel letterale); applicato `Plan: 2 of 12` come chiede l'orchestratore (stessa forma del piano 16-01).

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: T-16-05 (nessun `@Field` su `knownEnemies`, blocco SDL pinnato e query rifiutata), T-16-07 (orfani scartati, default `[]`) e T-16-08 (due righe aggiunte, nessuna tolta) coperti come da piano.

## Self-Check: PASSED

File modificati presenti; commit 925ad2b, dbb0e37, ab3b95a, f70e440 presenti in `git log`.
