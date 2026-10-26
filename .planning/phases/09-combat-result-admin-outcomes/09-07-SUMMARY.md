---
phase: 09-combat-result-admin-outcomes
plan: 07
subsystem: api
tags: [graphql, subscription, change-stream, authz, innkeeper, read-model, single-flight, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: AwaitingAid (status.awaitingAid) esposto e nullable
  - phase: 09-combat-result-admin-outcomes (09-06)
    provides: modello di change stream con priming gemello, publish senza await, test WS con sentinella ordinata
  - phase: 03-realtime
    provides: subscribeWithSnapshot, modello UserUpdatesPublisher / userUpdated con snapshot (D-07)
  - phase: 08-travel-lifecycle
    provides: ActiveTravel, QuestPartySlot, QuestRegistration, refIdOf/idForms
provides:
  - read model PendingRequest / PendingRequestQuest / PendingRequestCharacter / PendingRequestUser (solo @ObjectType)
  - buildPendingRequests puro (corsie story e worldMission, voci incomplete in skipped, ordine startDate asc con null in coda)
  - PendingRequestsService.list (quattro letture lean in serie, ACTIVE_CHARACTER_FILTER, WARN di soli id)
  - PendingRequestsPublisher (change stream insert/delete su pendingquests, ricalcolo single-flight con rerun, publish senza await)
  - query pendingRequests e subscription pendingRequestsUpdated con snapshot, entrambe @Roles(innkeeper)
  - PendingRequestsModule montato in AppModule dopo QuestResultsModule, esporta PendingRequestsService (per 09-15)
  - helper di test primePendingRequestsChangeStream (sentinella + attesa di quiete dopo la pulizia)
affects: [09-15, 09-16, FE Phase 10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read model piatto per la vista admin: tipi dedicati invece di Character/Quest, nessun populate"
    - "Change stream senza documento: ogni evento ricalcola l'intera lista, single-flight con rerun (dirty + draining)"
    - "Priming con attesa di quiete: i delete della pulizia generano liste tardive, si aspetta il silenzio prima del test"
    - "Test WS con snapshot: listMatching (prima lista che soddisfa il predicato) e sentinella ordinata per la prova del delete"

key-files:
  created:
    - src/models/pending-request.model.ts
    - src/quests/pending-requests/pending-requests.builder.ts
    - src/quests/pending-requests/pending-requests.builder.spec.ts
    - src/quests/pending-requests/pending-requests.service.ts
    - src/quests/pending-requests/pending-requests.service.int-spec.ts
    - src/quests/pending-requests/pending-requests.publisher.ts
    - src/quests/pending-requests/pending-requests.publisher.spec.ts
    - src/quests/pending-requests/pending-requests.resolver.ts
    - src/quests/pending-requests/pending-requests.module.ts
    - src/quests/pending-requests/pending-requests.resolver.int-spec.ts
    - test/quests/pending-requests-change-stream.ts
  modified:
    - src/pubsub.module.ts
    - src/app.module.ts
    - test/app.int-spec.ts
    - src/schema.gql

key-decisions:
  - "Ref letti con refIdOf (PendingQuest.quest e User.currentCharacter sono path Mixed) e utenti cercati con idForms: le voci legacy in esadecimale stringa compaiono comunque"
  - "Una voce con location illeggibile è saltata come le altre incomplete (location è ID! sul filo): stesso WARN di soli id"
  - "Il priming della coda attende anche la quiete dopo clearDatabase, così le liste tardive della pulizia non arrivano dentro i test"

patterns-established:
  - "Vista admin live: query + subscription con snapshot sullo stesso service.list(), entrambe @Roles(innkeeper) ed enumerate nella whitelist del real boot"

requirements-completed: []  # BE-ADMIN-01: traceability nel gate 09-16

# Metrics
duration: 7min
completed: 2026-10-24
---

# Phase 9 Plan 07: coda live dell'innkeeper Summary

**Query `pendingRequests` e subscription `pendingRequestsUpdated` (snapshot alla subscribe, lista completa a ogni insert/delete su `pendingquests`, ricalcolo single-flight con rerun), solo innkeeper su HTTP e WS, su un read model piatto `PendingRequest*` costruito da letture lean e tollerante ai dati incompleti**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-24T16:06:28Z
- **Completed:** 2026-10-24T16:13:00Z
- **Tasks:** 2 (2/2)
- **Files modified:** 15 (11 creati, 4 modificati)

## Accomplishments

- `buildPendingRequests` produce una voce per corsia story/worldMission di ogni personaggio (una worldMission con tre registrati = tre voci), copia `requiredAdventurers` (`[]` se il catalogo legacy non ha un array), `registeredAdventurers`, `activeTravel`, `awaitingAid`; PendingQuest, quest, utente o location mancanti finiscono in `skipped` con `{ characterId, pendingQuestId }`; ordine `startDate` crescente con null in coda, poi id.
- `PendingRequestsService.list` legge personaggi attivi (`ACTIVE_CHARACTER_FILTER` + `$or` sulle due corsie GM, proiezione minima), PendingQuest, quest e utenti in lean, nessun populate, nessuna transazione; ogni voce saltata produce `Richiesta del personaggio <id> (missione in attesa <id>) incompleta: esclusa dalla coda` (nessun nome né twitchId, verificato con una spia su `Logger.prototype.warn`).
- `PendingRequestsPublisher` apre `watch([{ $match: { operationType: { $in: ['insert', 'delete'] } } }])`, `requestRefresh()` marca `dirty` e avvia un solo `drain()` alla volta; errori di `list()` loggati con `codeOf`, `publish` mai atteso.
- Resolver con `@Roles(RoleType.innkeeper)` su query e subscription; la subscription usa `subscribeWithSnapshot`. Adventurer → `FORBIDDEN` su HTTP e alla subscribe (nessuno snapshot), senza bearer → `UNAUTHENTICATED`.
- Real boot: `EXPECTED_INNKEEPER_HANDLERS` con i due handler, blocchi SDL esatti dei quattro tipi, righe `pendingRequests`/`pendingRequestsUpdated`, `rejects pendingRequests without a bearer`; `src/schema.gql` +33 righe, 0 rimosse (anche rispetto a `develop`), nessun letterale vietato.

## Task Commits

| Task | Fase | Commit | Tipo |
|------|------|--------|------|
| 1 | read model, builder e servizio (RED) | `236e92c` | test |
| 1 | read model, builder e servizio (GREEN) | `5a23607` | feat |
| 2 | change stream, resolver, montaggio e SDL (RED) | `970db45` | test |
| 2 | change stream, resolver, montaggio e SDL (GREEN) | `97c4699` | feat |

## RED evidence

- **Task 1:** `npx jest src/quests/pending-requests/pending-requests.builder.spec.ts --selectProjects unit` → 10 falliti / 10 (builder stub che restituisce liste vuote); `pending-requests.service.int-spec.ts` → 2 falliti / 2 (servizio stub).
- **Task 2:** publisher spec 3 falliti / 3 (stub senza watch né ricalcolo); resolver int-spec 8 falliti / 8 (modulo vuoto, modelli non registrati); real boot 3 falliti / 40 (SDL della coda, `rejects pendingRequests without a bearer`, whitelist innkeeper). `src/schema.gql` non toccato dal real boot rosso.

## GREEN evidence

- `npx jest src/quests/pending-requests --selectProjects unit` → 2 suite, 13 test verdi
- `npx jest src/quests/pending-requests --selectProjects integration --runInBand` → 2 suite, 10 test verdi (resolver int-spec rieseguita una seconda volta: 8/8)
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 40/40; `git diff --exit-code src/schema.gql` pulito dopo il commit
- `npm run build` 0; prettier e eslint puliti sui file toccati; grep di accettazione soddisfatti (`@Schema` 0, nessun `populate`/`twitchId}` nel servizio, due `@Roles(RoleType.innkeeper)`, nessun `await this.pubSub.publish`, una riga per operazione nello schema)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] Ref Mixed letti in entrambe le forme**
- **Found during:** Task 1 (GREEN)
- **Issue:** `PendingQuest.quest` e `User.currentCharacter` sono `@Prop({ type: Types.ObjectId })` (path Mixed, 04 Pitfall 1): un id salvato come stringa non matcherebbe il `$in` né la mappa per esadecimale.
- **Fix:** id letti con `refIdOf`, utenti cercati con `idForms` del personaggio; caso dedicato nel builder spec (`matches lanes, quests and users stored as legacy hex strings`).
- **Files modified:** src/quests/pending-requests/pending-requests.builder.ts, src/quests/pending-requests/pending-requests.service.ts
- **Commit:** `5a23607`

**2. [Rule 2 - Robustezza] Location illeggibile = voce saltata**
- **Found during:** Task 1 (GREEN)
- **Issue:** `location` è `ID!` sul filo: una location assente renderebbe l'intera lista `data: null`.
- **Fix:** la voce finisce in `skipped` con lo stesso WARN di soli id (T-09-35).
- **Commit:** `5a23607`

**3. [Rule 1 - Flakiness del test] Liste tardive della pulizia**
- **Found during:** Task 2 (stesura del RED)
- **Issue:** `clearDatabase` dopo il priming cancella le PendingQuest sentinella: i delete generano ricalcoli che possono arrivare dopo lo snapshot del test e somigliare a una lista "senza la voce".
- **Fix:** il priming attende 300 ms di silenzio dopo la pulizia; i test usano `listMatching` (prima lista che contiene la voce attesa) e, per il delete, una PendingQuest sentinella inserita dopo il delete (gli eventi sono ordinati: una lista che contiene la sentinella è calcolata dopo il delete). La raffica in transazione verifica l'ultima lista prima di 1 s di silenzio.
- **Files modified:** test/quests/pending-requests-change-stream.ts, src/quests/pending-requests/pending-requests.resolver.int-spec.ts
- **Commit:** `970db45`, `97c4699`

**4. [Rule 1 - Lint] `String()` su `status.location`**
- **Found during:** Task 1 e 2 (lint)
- **Issue:** `@typescript-eslint/no-base-to-string` (warning) su `String(character.status.location)` nei test.
- **Fix:** `(location as Types.ObjectId).toHexString()`.
- **Commit:** `5a23607`, `97c4699`

### Scelte di forma

- Il RED del Task 1 include il read model `pending-request.model.ts` e gli stub di builder/servizio come firme (servono al type check di ts-jest); nessun comportamento nel RED.
- Il commento del servizio non usa la parola "populate" (il grep di accettazione la vuole assente dal file).
- Progress Table a `10/16` come prescritto dall'orchestratore (il piano indicava `7/16`).

## Issues Encountered

- `gsd-tools roadmap update-plan-progress` ha letto 9 SUMMARY (questo non era ancora scritto) e ha rovinato la spaziatura della riga: checkbox di 09-07 e riga `| 9. Combat Result & Admin Outcomes | 10/16 | In Progress | - |` sistemate a mano.

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: le superfici nuove sono quelle del threat model (T-09-33..T-09-36), tutte mitigate e testate.

## Next Phase Readiness

- 09-15 aggiunge `completePendingRequest` a `PendingRequestsResolver` (e alla whitelist innkeeper) e può importare `PendingRequestsService` dal modulo.
- FE Phase 10: la coda espone `character.activeTravel` per il filtro e `awaitingAid`; i cambi di `activeTravel` arrivano all'emissione successiva o dalla `characters` dell'innkeeper (D-22).

## Self-Check: PASSED

- File creati presenti (11/11); commit `236e92c`, `5a23607`, `970db45`, `97c4699` presenti nel log, nessun trailer.
