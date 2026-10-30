---
phase: 10-hardening-trasversale
plan: 01
subsystem: quests/pending-requests
tags: [innkeeper-queue, graphql, change-stream, BE-HARD-08]
requires: []
provides:
  - "PendingRequestCharacter.pendingQuest: ID (nullable, additivo)"
  - "GM_QUEUE_FILTER nominato in pending-requests.service.ts"
  - "ArchivedCharacterQueueRefresher (change stream degli archivi → requestRefresh)"
  - "standard-lane-liveness.int-spec.ts (harness della coda con accettazione, party e risoluzione)"
affects: [10-02, 10-30]
tech-stack:
  added: []
  patterns:
    - "ChangeStreamPublisher come puro osservatore che delega il ricalcolo al KeyedSingleFlight del publisher della coda"
    - "lettura del PubSub con una next() sempre in volo fra le finestre di silenzio"
key-files:
  created:
    - src/quests/pending-requests/archived-character-queue.refresher.ts
    - src/quests/pending-requests/archived-character-queue.refresher.spec.ts
    - src/quests/pending-requests/standard-lane-liveness.int-spec.ts
  modified:
    - src/models/pending-request.model.ts
    - src/quests/pending-requests/pending-requests.builder.ts
    - src/quests/pending-requests/pending-requests.builder.spec.ts
    - src/quests/pending-requests/pending-requests.service.ts
    - src/quests/pending-requests/pending-requests.service.int-spec.ts
    - src/quests/pending-requests/pending-requests.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - .planning/phases/10-hardening-trasversale/10-VALIDATION.md
decisions:
  - "pendingQuest: ID nullable invece di un booleano (D-23, C22): la voce resta in coda e il FE la nasconde o attenua"
  - "Il ricalcolo dopo un archivio è un osservatore separato sul change stream dei personaggi, non una chiamata dentro CharacterArchiver: nessuna dipendenza nuova del dominio dei personaggi verso la coda"
metrics:
  duration: "~15 min"
  completed: 2026-10-29
  tasks: 3
  files: 12
---

# Phase 10 Plan 01: corsia standard nella coda del GM Summary

La coda del locandiere espone `PendingRequestCharacter.pendingQuest: ID` (id esadecimale della PendingQuest standard, `null` se la corsia è libera o in un viaggio libero). La voce resta nella lista. Ogni transizione della corsia standard riemette la coda (lo provano le int-spec), e un archivio ora la ricalcola tramite `ArchivedCharacterQueueRefresher`.

## Commit

| Task | Fase | Commit | Messaggio |
|------|------|--------|-----------|
| 1 | RED | `b8d483c` | test(queue): expect the standard lane on the innkeeper queue |
| 2 | GREEN | `7f4523a` | feat(queue): expose the standard lane on the innkeeper queue |
| 3 | RED | `e2bca98` | test(queue): prove the queue liveness on the standard lane |
| 3 | GREEN | `7c926cf` | feat(queue): refresh the innkeeper queue after an archive |

Il Task 2 è il GREEN dei test del Task 1 (nessun RED proprio, come da piano).

## Fallimenti RED osservati

**Task 1**
- `pending-requests.builder.spec.ts` (unit): 4 rossi su 13. Sono `exposes the standard lane of a queued character (D-23)`, `reads a legacy string standard lane as its hex id (D-23)`, `leaves the standard lane null for a free travel between cities (D-23)` e `builds the flat entry of a story request`: per quest'ultimo l'atteso `toEqual` della voce intera include ora `pendingQuest: null`, il contratto nuovo, aggiornato già nel RED.
- `pending-requests.service.int-spec.ts` (integration): rosso `projects the standard lane of each queued character (D-23)` (Received `undefined`). `keeps a busy character in the queue instead of filtering it (C22)` era **verde al primo colpo**: la coda non ha mai filtrato la corsia standard e il caso blinda quel comportamento.
- `test/app.int-spec.ts`: rossi ESATTAMENTE `writes the innkeeper queue into the generated schema` e `mounts the archived character queue refresher` (2 su 51). `git diff --exit-code src/schema.gql` esce 0 dopo il RED.

**Task 3**
- `archived-character-queue.refresher.spec.ts` (unit): 2 rossi su 2 (`onModuleInit is not a function` sullo scheletro).
- `standard-lane-liveness.int-spec.ts` (integration): rosso solo `re-emits the queue without an archived holder` (Received `undefined`: dopo l'archivio non arriva nessuna lista). Le quattro transizioni (accettazione, risoluzione, abbandono, scioglimento) erano **verdi al primo colpo**: ognuna inserisce o elimina la PendingQuest standard nella stessa transazione, quindi il publisher esistente riemette da solo (D-24, RESEARCH F10 punto 4).

## Verde finale

- unit `src/quests/pending-requests`: 3 suite, 18 test verdi
- integration `src/quests/pending-requests` + `test/app.int-spec.ts`: 5 suite, 73 test verdi (liveness 5/5, boot reale 51/51)
- `npm run build` esce 0; `git diff --exit-code src/schema.gql` esce 0; contro `origin/develop` lo SDL ha una sola riga `+` (`  pendingQuest: ID`, dopo `  name: String!`) e nessuna riga `-`

## Deviazioni dal piano

### Problemi corretti automaticamente

**1. [Rule 1 - Bug di test] Liste perse dal PubSub nella liveness int-spec**
- **Trovato durante:** Task 3 (RED)
- **Problema:** il PubSub di yoga consegna solo le liste che arrivano mentre una `next()` è in volo. Una `next()` scaduta dopo la finestra di silenzio consumava poi l'evento successivo. Inoltre il setup inserisce le PendingQuest prima di creare personaggio e utente, quindi nessuna lista mostrava lo stato di partenza.
- **Correzione:** una `next()` resta sempre in volo (aperta subito dopo `subscribe`, riaperta solo dopo una consegna, come fa `waitForQuiet`). Lo stato di partenza si legge con un `requestRefresh()` esplicito del `PendingRequestsPublisher` (helper `laneAfterSetup`).
- **File:** `src/quests/pending-requests/standard-lane-liveness.int-spec.ts`
- **Commit:** `e2bca98`

### Scelte di esecuzione

- **Harness della liveness:** `createAuthTestApp` diretto con `PendingRequestsModule`, `QuestAcceptanceModule` e `PartyLifecycleModule`, con `QUIET_OUTCOME_OVERRIDES`, push finto e code finte (`QUEST_RESOLUTION_QUEUE`, `SPELL_RECOVERY_QUEUE`, `TRAVEL_QUEUE`), più `outcomeModels`/`initOutcomeCollections`/`persistQuester` di `test/quests/outcome-world.ts`. `createOutcomeHarness` non è riusabile così com'è: non accetta override extra e qui serve `TRAVEL_QUEUE`. Nessun helper modificato.
- **Risoluzione senza combattimento:** il caso `re-emits the queue with a free lane after the standard quest is resolved` risolve una quest `job` senza nemico invece di un combattimento scriptato vinto. La corsia si libera nello stesso modo, ma senza la porta `CombatResolver`.
- **Accettazione senza viaggio:** marker della quest uguale alla posizione del personaggio, in una città che contiene quel POI. Non parte nessun viaggio (`movementTo` restituisce null) e la corsia standard viene presa.
- **Archivio:** stesso aggiornamento di `CharacterArchiver` (data di archivio + `DeletionReason.death`). La morte lascia collegato l'utente, quindi solo il filtro dei personaggi attivi e il ricalcolo tolgono la voce.

Nessuna deviazione sui subject (tutti ≤ 72 caratteri) né sulla formattazione.

## Threat Flags

Nessuna superficie nuova oltre al threat model. Il campo passa solo dagli handler `@Roles(innkeeper)` già esistenti (nessun handler nuovo, whitelist del boot reale invariata). Il nuovo change stream legge solo l'evento e non pubblica dati del personaggio.

## Known Stubs

Nessuno: lo scheletro committato nel RED del Task 1 è sostituito dall'implementazione nel GREEN del Task 3.

## Self-Check: PASSED

- file creati presenti: `archived-character-queue.refresher.ts`, `archived-character-queue.refresher.spec.ts`, `standard-lane-liveness.int-spec.ts`
- commit presenti: `b8d483c`, `7f4523a`, `e2bca98`, `7c926cf`
