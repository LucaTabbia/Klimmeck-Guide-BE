---
phase: 14-viaggio-e-cibo
plan: 05
subsystem: acceptance + travel (anteprima del viaggio della quest)
tags: [acceptance, travel, food, graphql, BE-FOOD-04, BE-FOOD-06, D-08, D-09, D-14, D-16, D-18]
requires: [14-03, 14-04]
provides:
  - "`TravelPlanner.autoRoute(request: AutoTravelRequest): Promise<ActiveTravelDraft | null>` senza il WARN del salto; `planAuto` = `autoRoute` + WARN identico"
  - "`QuestAcceptanceService.previewTravel(characterId, questId): Promise<TravelPreview | null>` (nessuna scrittura) e helper privato `autoRequestOf`"
  - "query owner-only nullable `questTravelPreview(request: AcceptQuestRequest!): TravelPreview` su `QuestAcceptanceResolver`"
affects: [14-06, 14-07, 14-08]
tech-stack:
  added: []
  patterns:
    - "calcolo silenzioso estratto da un metodo che logga: il chiamante che vuole il log lo aggiunge (nessun flag booleano)"
    - "query nullable: un rifiuto azzera il solo campo (`data.questTravelPreview` null), le spec usano un helper dedicato"
key-files:
  created: []
  modified:
    - src/travel/travel-planner.service.ts
    - src/travel/travel-planning.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.resolver.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Attese del viaggio quest calcolate con le funzioni pure sui numeri reali (questPoi da A ≈ 0,22 km, fabbisogno 1): un Cibo 20 su due ne mangia uno, hpLost 0"
  - "Il rifiuto per fame dell'anteprima (arrivesAlive false) usa `lifePoints: 1`: con HP 10 si arriverebbe vivi"
  - "Per una query nullable GraphQL risponde `data: { questTravelPreview: null }` con l'errore: helper `expectPreviewRejected` nella describe dell'anteprima, `expectRejected` dell'accettazione invariato"
metrics:
  duration: "~25 min"
  completed: 2026-11-05
  tasks: 3
  files: 7
---

# Phase 14 Plan 05: anteprima del viaggio della quest — Summary

`questTravelPreview` è una query owner-only nullable che calcola il movimento come l'accettazione (`autoRequestOf` + `TravelPlanner.autoRoute`, senza il WARN del salto) e risponde con la `TravelPreview` del cibo (`TravelPantryReader.previewOf`) o `null` quando non c'è viaggio; nessuna scrittura, mai `TRAVEL_STARVING`.

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 RED | 7fb9b3e | test(travel): expect a silent auto route for the quest preview |
| 1 GREEN | ad3f5cc | refactor(travel): split the silent auto route from planAuto (D-08) |
| 2 RED | d2e46e5 | test(acceptance): expect the owner-only quest travel preview |
| 2 GREEN | c023d47 | feat(acceptance): preview the quest travel for its owner (D-08) |
| 3 | (bookkeeping) | docs(phase-14): record plan 05 progress |

## Fallimenti RED osservati

- Task 1: i due casi nuovi rossi con `TypeError: planner.autoRoute is not a function` (31 verdi).
- Task 2: 14 rossi. Boot reale: le due liste (ownership e owner-only) senza `QuestAcceptanceResolver.questTravelPreview`, la riga SDL assente, il caso UNAUTHENTICATED (`GRAPHQL_VALIDATION_FAILED`). Wire: i 10 casi con `Cannot query field "questTravelPreview" on type "Query"` (`GRAPHQL_VALIDATION_FAILED`).

## Nomi e firme

- `src/travel/travel-planner.service.ts`: `async autoRoute(request: AutoTravelRequest): Promise<ActiveTravelDraft | null>` (WARN del marker inesistente + `QUEST_NOT_ACCEPTABLE` restano qui); `async planAuto(request)` = `const travel = await this.autoRoute(request); if (!travel) this.logger.warn(<testo identico>); return travel;`. «salto istantaneo» compare una sola volta nel file (i commenti sono stati riformulati per il grep di gate).
- `src/quests/acceptance/quest-acceptance.service.ts`: costruttore + `private readonly pantry: TravelPantryReader` (ultimo parametro); `async previewTravel(characterId: Types.ObjectId, questId: Types.ObjectId): Promise<TravelPreview | null>` (readQuest → readCharacter → story null → locationInQuestCity → non standard null → autoRequestOf → autoRoute → previewOf); `private autoRequestOf(quest, characterId, location, character): AutoTravelRequest | null` usato anche da `movementTo` (che chiama `planAuto`, salto = `{ kind: 'jump', marker: request.to }`).
- `src/quests/acceptance/quest-acceptance.resolver.ts`: `@OwnsCharacter(({ request }) => request.id, { ownerOnly: true }) @Query(() => TravelPreview, { nullable: true }) questTravelPreview(@Args('request') request: AcceptQuestRequest): Promise<TravelPreview | null>`.

## Diff dello SDL (vs origin/develop: solo righe aggiunte)

Riga nuova di questo piano, in `type Query`: `questTravelPreview(request: AcceptQuestRequest!): TravelPreview`. Le altre righe aggiunte della fase restano quelle del 14-03 (`type TravelFoodItem`, `arrivesAlive`, `food`, `hpLost`). Nessuna riga tolta.

## Messaggi effettivi dei rifiuti sul filo

`QUEST_NOT_IN_CITY` «Devi trovarti nella città della missione»; `NOT_FOUND` «Missione non trovata»; `QUEST_NOT_ACCEPTABLE` «Missione non disponibile»; `FORBIDDEN` «Questo personaggio non ti appartiene» (innkeeper e altro avventuriero); `BAD_USER_INPUT` «Input non valido: id» / «Input non valido: questId»; senza bearer `UNAUTHENTICATED`. Con una query nullable la risposta è `data: { questTravelPreview: null }` più `errors`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Numeri della fixture del piano sbagliati (deviazione sanzionata dall'orchestratore)**
- **Found during:** Task 2
- **Issue:** il piano assume questPoi ≈ 11,12 km → 45 power, `food` con quantità 2, hpLost con coperto 40 e «HP 10 senza cibo» come fame. Reale: questPoi da A ≈ 0,22 km, fabbisogno 1, senza cibo hpLost 1.
- **Fix:** titoli e invarianti invariati; `food` atteso `[{ quantity: 1, Cibo 20 }]` (con `needed` fra 1 e 20 asserito), hpLost = `hpLostFor(uncoveredKmOf(needed, 20, distance))`; il caso affamato usa `lifePoints: 1` e hpLost = `hpLostFor(uncoveredKmOf(foodNeededFor(duration), 0, distance))`. Nessun letterale per km/HP.
- **Files modified:** src/quests/acceptance/accept-quest.resolver.int-spec.ts
- **Commit:** d2e46e5

**2. [Rule 1 - Bug] Asserzione del rifiuto inadatta a una query nullable**
- **Found during:** Task 2 GREEN
- **Issue:** `expectRejected` dell'accettazione richiede `data` nullo; per un campo nullable GraphQL risponde `data: { questTravelPreview: null }` (5 casi rossi dopo il codice, a comportamento corretto).
- **Fix:** helper locale `expectPreviewRejected` nella describe `questTravelPreview (wire)` (campo nullo + codice + messaggio); `expectRejected` lasciato com'era.
- **Files modified:** src/quests/acceptance/accept-quest.resolver.int-spec.ts
- **Commit:** c023d47

**3. [Rule 3 - Blocking] Commenti con «salto istantaneo»**
- **Found during:** Task 1
- **Issue:** il grep di gate vuole una sola occorrenza nel planner; il commento preesistente di `planAuto` ne conteneva un'altra.
- **Fix:** commenti riformulati («il chiamante salta sul marker», «il salto senza strada si logga»); il testo del WARN è identico.
- **Commit:** ad3f5cc

### Aggiunte nei test

- Il caso del salto aggiunge un controllo positivo: dopo l'anteprima silenziosa, `acceptQuest` sulla stessa quest produce esattamente un WARN con «salto istantaneo» (la spia su `Logger.prototype.warn` funziona davvero).
- `playerWith` guadagna `lifePoints?` (current e max) e `ownedItems?` (con spread di `buildCharacter().assets`, default invariato).

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni task.
- `src/travel/travel-planning.int-spec.ts` 33/33; `src/quests/acceptance` + `test/app.int-spec.ts` integration 198/198 (3 suite); `src/quests/acceptance` unit 185/185 (4 suite).
- prettier/eslint puliti sui file toccati (warning preesistente `no-base-to-string` di `test/app.int-spec.ts`, non nostro).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` vuoto.

## Threat model

T-14-20..25 coperti dai casi: FORBIDDEN innkeeper + avventuriero, UNAUTHENTICATED nel boot reale, BAD_USER_INPUT su id e questId, salto senza WARN, riga nullable con `\n`, documento grezzo del personaggio, quest, pendingQuests, punti e coda invariati.

## Self-Check: PASSED
