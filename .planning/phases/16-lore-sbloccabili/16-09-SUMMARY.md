---
phase: 16-lore-sbloccabili
plan: 09
subsystem: lore (field resolver `QuestEnemy.known`)
tags: [lore, quests, results, pending-requests, viewer, BE-LORE-06, D-06, D-07, D-13]
requires: ["16-08"]
provides:
  - "`KnownEnemiesResolver` (`@Resolver(() => QuestEnemy)`, `@ResolveField('known', () => Boolean)`) in `src/lore/known-enemies.resolver.ts`, fornito da `LoreVisibilityModule`"
  - "`QuestsModule`, `QuestResultsModule`, `PendingRequestsModule` importano `LoreVisibilityModule`"
  - "SDL: `type QuestEnemy` con `known: Boolean!` (terza e ultima riga nuova della fase)"
affects: [16-10, 16-11, 16-12]
tech-stack:
  added: []
  patterns:
    - "Field resolver per viewer sul tipo condiviso `QuestEnemy`: un solo resolver copre `Quest.infos.enemies[]` e `QuestResult.enemies[]`"
key-files:
  created:
    - src/lore/known-enemies.resolver.ts
    - src/lore/known-enemies.resolver.int-spec.ts
  modified:
    - src/lore/lore-visibility.module.ts
    - src/quests/quests.module.ts
    - src/quests/results/quest-results.module.ts
    - src/quests/pending-requests/pending-requests.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "`known` = `knowsEnemy(await viewers.of(identity, context, info), entry.enemy)`: l'esadecimale si legge sia dal documento popolato sia dall'ObjectId; innkeeper `true` senza DB; senza personaggio o morto in attesa del foglio `false`"
  - "`LoreVisibilityModule` importato in `QuestResultsModule` (non in `QuestResultsReadModule`, che resta di sola lettura senza resolver)"
metrics:
  duration: "~15 min"
  completed: 2026-11-07
  tasks: 2
  files: 8
---

# Phase 16 Plan 09: `QuestEnemy.known` per viewer Summary

Ogni voce di `enemies` di quest e risultati dice se il personaggio corrente attivo del bearer ha sconfitto quel nemico esatto (`status.knownEnemies`): il Goblin sì, il Goblin boss no. `KnownEnemiesResolver` vive in `LoreVisibilityModule` e usa la cache del piano 08 (chiave `rootValue`-o-context), quindi una lettura per richiesta HTTP e una per evento WS. Lo SDL guadagna la sola riga `known: Boolean!` in `type QuestEnemy`; nessuna operazione nuova.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 5e887ff | test(lore): pin the known flag of quest enemies per viewer (D-07) |
| 1 GREEN | 9ea57d4 | feat(lore): resolve the known flag of quest enemies per viewer |
| 2 | (questo) | docs(phase-16): record plan 09 progress |

## Fallimenti RED osservati

- `src/lore/known-enemies.resolver.int-spec.ts`: 7 falliti su 7, tutti con `GRAPHQL_VALIDATION_FAILED` «Cannot query field "known" on type "QuestEnemy"» (HTTP nel body, WS come errore della subscription).
- `test/app.int-spec.ts`: 2 falliti su 76, `writes the quest enemies list in place of the single enemy (D-01)` e `writes the quest generation contract of the FE Phase 14 into the generated schema (D-01, D-16, D-21, D-24)` (le due stringhe di `type QuestEnemy`).

## Harness

- `createAuthTestApp({ imports: [QuestsModule, QuestResultsModule] })`, ~3 s per i 7 casi.
- WS: `openSubscription(graphqlWsUrl(harness.port), { Authorization: bearer }, { query, variables })`; il primo `next()` apre il client lazy, una finestra di 300 ms (`SUBSCRIBER_WAIT_MS`) lascia registrare la subscription, poi il primo `persistQuestResult`; tra i due eventi l'aggiunta del nemico a `status.knownEnemies` direttamente sulla collezione `characters` (operatore `$addToSet`), poi il secondo risultato sullo stesso socket. `primeChangeStream(harness, 'questResultReceived', questResultTouch(harness))` gira UNA volta in `beforeAll`.
- Prova di mutazione (non committata): con `viewerCacheKeyOf` che restituisce sempre il context, il caso `(D-07, Pitfall 1)` diventa rosso; ripristinato con `git checkout` del file.

## Righe SDL

`git diff origin/develop -- src/schema.gql`: 3 righe aggiunte, 0 tolte:
- `+  unlockedLore: [ID!]!` (type CharacterStatus, 16-02)
- `+  known: Boolean!` (type QuestEnemy, questo piano, fra `enemy` e `quantity`)
- `+  loreUnlocked: [Lore!]!` (type QuestResult, 16-02)

## Deviazioni dal piano

- **[Rule 1 - Bug nella spec RED] Priming del change stream spostato in `beforeAll`**: nel commit RED il caso WS chiamava `primeChangeStream` dentro il test, dopo il `beforeEach` che persiste i nemici; la pulizia del priming (`questResultTouch.cleanup` = `harness.clearDatabase()`) cancellava i nemici e il risultato arrivava con `enemies: []` (voce orfana scartata dal populate). Corretto nel commit GREEN (una sola apertura per suite in `beforeAll`), annotato nel corpo del commit.
- **Bookkeeping:** `Plan: 9 of 12` in STATE.md (formato dell'orchestratore, senza zero iniziale) invece di `Plan: 09 of 12` del piano: il `grep -q "Plan: 09 of 12"` della verifica del Task 2 non passa per scelta.
- **Selezione WS**: la subscription seleziona `id` + la selezione FE dei nemici (non l'intero `QuestResultFragment`); HTTP `quest(id)` seleziona `id infos { enemies { quantity known enemy { id name imagePath xp } } }`. Il caso «una lettura» usa `quest(id)` con tre voci (non `quests`, che legge il personaggio anche per il tabellone).
- **In più rispetto alla verifica del piano:** gli altri harness che importano i tre moduli (`quest-board`, `accept-quest.resolver`, `pending-quests-authz`, `character-deletion.resolver`, `scalar-ids`, `quest-generation.e2e`, `ambush-lifecycle`): 7 suite, 106/106.

## Gate

- `npx jest test/app.int-spec.ts src/lore src/quests/results src/quests/quests.resolver.int-spec.ts src/quests/quest-updated.subscription.int-spec.ts src/quests/pending-requests --selectProjects integration --runInBand`: 17 suite, 211/211 (~68 s).
- `src/lore/known-enemies.resolver.int-spec.ts` 7/7 tre volte di fila.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui 7 file `.ts` toccati (resta il warning preesistente `test/app.int-spec.ts:977` `no-base-to-string`).
- `git diff --exit-code src/schema.gql` 0; `EXPECTED_OWNER_ONLY_HANDLERS` invariato (grep del diff: 0).

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit 5e887ff e 9ea57d4 nel log; `src/lore/known-enemies.resolver.ts` e `src/lore/known-enemies.resolver.int-spec.ts` presenti.
