---
phase: 09-combat-result-admin-outcomes
plan: 06
subsystem: api
tags: [graphql, subscription, change-stream, authz, ownership, quest-result, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: modello QuestResult (collection questresults) ed enum QuestOutcome, ancora fuori dallo schema
  - phase: 07-authz
    provides: CharacterAccessPolicy, OwnershipGuard, OwnsCharacter ownerOnly (07 D-11), whitelist enumerate del real boot
  - phase: 03-realtime
    provides: PubSub globale, modello UserUpdatesPublisher, priming del change stream (Pitfall 9)
provides:
  - OwnedResource.questResult + CharacterAccessPolicy.authorizeQuestResult (proprietario = utente del risultato, nessun bypass innkeeper)
  - OwnsQuestResult (owner-only), ResourceNotFoundException.questResult, AuthorizationException.questResultNotOwned
  - QuestResultsReadModule / QuestResultsService.findOne popolato con orfani tollerati (QUEST_RESULT_POPULATE, dropOrphanResultRefs)
  - query questResult(id) owner-only per utente, leggibile anche dopo la morte
  - QuestResultsPublisher (change stream insert → PubSub) e subscription questResultReceived(characterId) owner-only senza snapshot
  - SDL QuestResult / QuestResultQuest / QuestRewards / SpellUsage / enum QuestOutcome nello schema generato dal real boot
  - helper di test buildQuestResult / persistQuestResult e primeQuestResultsChangeStream
affects: [09-07, 09-12, 09-13, 09-15, 09-16, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Proprietà per utente del documento (non per currentCharacter): la policy legge solo { user: 1 } del risultato"
    - "Subscription senza snapshot: guard owner-only alla subscribe + filtro per evento su user E character del payload"
    - "Modulo di sola lettura (senza change stream) separato dal modulo che monta resolver e publisher"
    - "Test WS senza snapshot: il primo next() pendente avvolto in un oggetto, finestra di silenzio, poi sentinella ordinata"

key-files:
  created:
    - test/quests/quest-result.fixture.ts
    - test/quests/quest-results-change-stream.ts
    - src/authz/ownership/quest-result-access.int-spec.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-results.service.ts
    - src/quests/results/quest-results-read.module.ts
    - src/quests/results/quest-results.resolver.ts
    - src/quests/results/quest-results.publisher.ts
    - src/quests/results/quest-results.module.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - src/quests/results/quest-result-received.subscription.int-spec.ts
  modified:
    - src/authz/ownership/owned-resource.ts
    - src/authz/ownership/ownership.decorators.ts
    - src/authz/ownership/character-access.policy.ts
    - src/authz/ownership/character-access.policy.spec.ts
    - src/authz/authorization.exception.ts
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
    - src/authz/authz.module.ts
    - src/quests/quest-catalog.populate.ts
    - src/pubsub.module.ts
    - src/app.module.ts
    - test/app.int-spec.ts
    - src/schema.gql

key-decisions:
  - "QuestResultsModule registra anche lui il modello QuestResult (forFeature): il publisher ne ha bisogno e QuestResultsReadModule non esporta i modelli"
  - "Il publisher legge l'id dal documentKey con documentIdOf (niente String(unknown)) e logga solo id e nome dell'errore"
  - "Le prove negative della subscription usano una sentinella ordinata (risultati altrui poi il proprio: arriva solo il proprio) invece di expectSilence a vuoto (Pitfall 12)"

patterns-established:
  - "Risultato owner-only per utente: OwnsQuestResult entra sia nelle ownership sia nelle owner-only del real boot"
  - "Change stream solo insert su questresults: nessun publish manuale nei servizi che scrivono risultati (job, sweep, GM)"

requirements-completed: []

# Metrics
duration: 16min
completed: 2026-10-24
---

# Phase 9 Plan 06: lettura e consegna del risultato Summary

**Query `questResult(id)` e subscription `questResultReceived(characterId)` owner-only per utente (anche dopo la morte, nessun bypass innkeeper), alimentate da un change stream solo insert su `questresults`, con risultato popolato e orfani tollerati; SDL del risultato pubblicato dal real boot**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-10-24T15:09:05Z
- **Completed:** 2026-10-24
- **Tasks:** 3
- **Files modified:** 24 (11 creati, 13 modificati)

## Accomplishments

- `CharacterAccessPolicy.authorizeQuestResult`: id malformato o assente → `NOT_FOUND` (`Risultato non trovato`), utente del risultato → `owner`, chiunque altro (innkeeper compreso) → `FORBIDDEN` (`Questo risultato non ti appartiene`); quarto modello iniettato dopo `pendingQuestModel`.
- `QuestResultsService.findOne` popola oggetti (refPath assoluti), magie e nemico; `dropOrphanResultRefs` scarta le voci di oggetti orfane, le magie e il nemico orfani valgono `null`: il risultato non diventa mai `data: null`.
- `QuestResultsPublisher` apre `watch([{ $match: { operationType: 'insert' } }])`, rilegge il risultato popolato e lo pubblica senza `await`; la subscription filtra per `user` e `character` del payload (non `currentCharacter`), quindi il risultato `death` arriva anche dopo lo scollegamento.
- Real boot: whitelist ownership e owner-only con i due handler, blocchi SDL esatti, `rejects questResult without a bearer`; `src/schema.gql` +52 righe, 0 rimosse (anche rispetto a `develop`).

## Task Commits

| Task | Fase | Commit | Tipo |
|------|------|--------|------|
| 1 | proprietà del risultato per utente (RED) | `43930de` | test |
| 1 | proprietà del risultato per utente (GREEN) | `e1cdf3e` | feat |
| 2 | query questResult popolata (RED) | `0b301a6` | test |
| 2 | query questResult popolata (GREEN) | `19e133c` | feat |
| 3 | subscription, montaggio e SDL (RED) | `f27dd7b` | test |
| 3 | subscription, montaggio e SDL (GREEN) | `f8a1ad1` | feat |

## RED evidence

- **Task 1:** unit 7 falliti / 49 (`questResult` assente in `ResourceNotFoundException`, `authorizeQuestResult` e ramo dello switch assenti); integration 6 falliti / 6.
- **Task 2:** integration 3 falliti / 8 (le tre letture del proprietario; i casi FORBIDDEN/NOT_FOUND/UNAUTHENTICATED erano già verdi grazie al guard del Task 1).
- **Task 3:** WS 6 falliti / 6 (priming stub); real boot 4 falliti / 38 (SDL, bearer, due whitelist). `src/schema.gql` ripristinato con `git checkout` prima del commit RED.

## GREEN evidence

- `npx jest src/authz src/quests --selectProjects unit` → 22 suite, 395 test verdi
- `npx jest src/quests/results src/authz/ownership/quest-result-access.int-spec.ts --selectProjects integration --runInBand` → 3 suite, 20 test verdi
- `npx jest src/authz/ownership/quest-result-access.int-spec.ts src/pendingQuests/pending-quests-authz.int-spec.ts …` → 21 verdi; `src/quests/quests.resolver.int-spec.ts` verde dopo il refactor di `isResolvedItemEntry`
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 38/38, seconda esecuzione idempotente (`git diff --exit-code src/schema.gql` pulito dopo il commit)
- `npm run build` 0; eslint pulito sui file toccati; grep di accettazione tutti soddisfatti (nessun `await this.pubSub.publish`, nessun `subscribeWithSnapshot`, nessun `@Public()`, letterali vietati 0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Modello `QuestResult` non risolvibile nel publisher**
- **Found during:** Task 3 (GREEN)
- **Issue:** `QuestResultsPublisher` inietta `QuestResultModel`, ma `QuestResultsReadModule` esporta solo `QuestResultsService`: Nest non risolveva la dipendenza nel contesto di `QuestResultsModule`.
- **Fix:** `QuestResultsModule` aggiunge `MongooseModule.forFeature([QuestResult])`; il modulo di lettura resta senza change stream e senza export dei modelli.
- **Files modified:** src/quests/results/quest-results.module.ts
- **Commit:** f8a1ad1

**2. [Rule 3 - Blocking] `locations: []` nel nemico creato dal test**
- **Found during:** Task 2 (RED)
- **Issue:** il piano crea il nemico con `locations: []`, ma `Enemy.locations` è dichiarato `String` singolo e l'array fallisce il cast (bug già registrato in `deferred-items.md` da 09-04).
- **Fix:** il nemico del test omette `locations` (commento nel test); la selezione `enemy { id name }` non lo legge.
- **Files modified:** src/quests/results/quest-result.resolver.int-spec.ts
- **Commit:** 0b301a6

**3. [Rule 1 - Bug nel test] Promise pendente adottata dalla funzione async**
- **Found during:** Task 3 (GREEN)
- **Issue:** l'helper `subscribeWithoutSnapshot` restituiva il `next()` pendente da una funzione `async`: la promise veniva adottata e l'`await` aspettava l'evento prima dell'inserimento (timeout di 5 s). Un run in background era rimasto appeso con i WS aperti ed è stato terminato.
- **Fix:** la promise pendente viaggia dentro `{ pending }` (`LiveSubscription`), con commento.
- **Files modified:** src/quests/results/quest-result-received.subscription.int-spec.ts
- **Commit:** f8a1ad1

**4. [Rule 1 - Lint] `String(unknown)` sul `documentKey`**
- **Found during:** Task 3 (GREEN)
- **Issue:** `@typescript-eslint/no-base-to-string` sul `String(id)` di un `_id` tipato `unknown`.
- **Fix:** id letto con `documentIdOf(change.documentKey)` (helper esistente).
- **Commit:** f8a1ad1

### Scelte di forma (nessun cambio di comportamento)

- Prove negative della subscription: invece di `expectSilence` dopo un risultato altrui, ogni test inserisce prima i risultati da scartare e poi quello del proprietario, e verifica che il primo evento ricevuto sia quest'ultimo (gli eventi del change stream sono ordinati; Pitfall 12). Il "nessuno snapshot" è una finestra di silenzio di 300 ms sul primo `next()` pendente, che lascia anche aprire la subscription.
- Il priming avviene nel `beforeEach` dopo `clearDatabase`, come prescritto.
- Il piano a riga 103 indica `6/16` per la Progress Table; l'orchestratore prescrive `5/16` (09-05 non è ancora eseguito): applicato `5/16`.

## Issues Encountered

- Il real boot rosso (Task 3 RED) aveva già scritto 16 righe in `src/schema.gql`: ripristinato prima del commit RED come da regola.
- Log benigni durante il priming: `ResourceNotFoundException` del publisher quando `clearDatabase` cancella la sentinella prima della rilettura (solo id e nome dell'errore nel log).

## Known Stubs

Nessuno.

## Next Phase Readiness

- La FE Phase 9 ha sullo schema `QuestResult`, `questResult(id)` e `questResultReceived(characterId)`.
- 09-12 aggiunge la push `questEnd` con l'id del risultato; 09-15 importa `QuestResultsReadModule` per rileggere i risultati del completamento GM; i writer di risultati non devono pubblicare a mano (il change stream lo fa al commit).
- Il bug `Enemy.locations` (deferred-items.md) resta aperto: il risultato espone `enemy` ma la FE non deve selezionare `locations` finché il modello non è corretto.

## Self-Check: PASSED

- File creati presenti (11/11), commit `43930de`, `e1cdf3e`, `0b301a6`, `19e133c`, `f27dd7b`, `f8a1ad1` presenti nel log.
