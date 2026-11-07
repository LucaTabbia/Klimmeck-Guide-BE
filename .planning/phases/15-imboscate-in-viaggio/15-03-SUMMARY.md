---
phase: 15-imboscate-in-viaggio
plan: 03
subsystem: travel + models + quests/acceptance (imboscata nata alla partenza)
tags: [travel, ambush, models, BE-AMBUSH-01, BE-AMBUSH-02, BE-AMBUSH-07, D-03, D-04, D-05, D-13, D-15, D-18]
requires: [15-01, 15-02]
provides:
  - "`AmbushPlanEntry { at; km; attempts=0 }`, `AmbushCitySnapshot { id; name }`, `AmbushReportSnapshot` e i tre schema `_id: false` in src/models/character/ambush-snapshot.model.ts"
  - "`ActiveTravel.ambush?` e `ActiveTravel.ambushReports?` (`@Prop` senza `@Field`)"
  - "`ActiveTravelAmbush` e `ActiveTravelDraft.ambush?` in src/travel/travel-timing.ts"
  - "`AMBUSH_JOB`, `AmbushJobData`, `AmbushIdentity`, `ambushJobId`, `ambushJobDataOf` in src/travel/ambush/ambush-job.ts"
  - "`AmbushPlanner.withAmbush` / `AmbushPlanner.drawFrom` (+ `AmbushDrawTravel`) in src/travel/ambush/ambush-planner.service.ts"
  - "`TravelScheduler.scheduleAmbush` / `cancelAmbush` (+ `removeBestEffort` privato condiviso con `cancel`)"
  - "`persistAmbushWorld` in test/travel/ambush-world.ts"
affects: [15-04, 15-06, 15-07, 15-08]
tech-stack:
  added: []
  patterns:
    - "Sorteggio sul draft fuori dalla transazione (`{ ...travel, ambush }`), trigger accodato dopo il commit"
    - "Provider di config con `ConfigService` opzionale per gli harness nudi"
key-files:
  created:
    - src/models/character/ambush-snapshot.model.ts
    - src/travel/ambush/ambush-job.ts
    - src/travel/ambush/ambush-job.spec.ts
    - src/travel/ambush/ambush-planner.service.ts
    - src/travel/ambush/ambush-planner.service.spec.ts
    - test/travel/ambush-world.ts
  modified:
    - src/models/character/active-travel.model.ts
    - src/models/character/active-travel.schema.spec.ts
    - src/travel/travel-timing.ts
    - src/travel/travel-scheduler.service.ts
    - src/travel/travel-scheduler.service.spec.ts
    - src/travel/travel-planning.module.ts
    - src/travel/travel.service.ts
    - src/travel/travel.service.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/config/ambush-config.ts
    - src/config/ambush-config.spec.ts
decisions:
  - "`ambushConfigProvider` inietta `{ token: ConfigService, optional: true }`: senza servizio (harness nudo dell'accettazione) vale il default Europe/Rome; nell'app il ConfigModule globale c'è sempre"
  - "Le int-spec nuove hanno un `describe` gemello con harness e mondo propri (travel: `createCharactersTestApp` per la query `character`; accettazione: database `quest-acceptance-ambush-test`): i casi esistenti non sono toccati"
  - "Nelle int-spec il caso «colpisce sempre» è `SequenceChance` condivisa con `chance.load([0])` nel `beforeEach` (prima estrazione 0, fallback 0.99): equivalente a `SequenceChance([], 0)` per un'imboscata al km 1"
metrics:
  duration: "~45 min (compresi due jest appesi)"
  completed: 2026-11-06
  tasks: 4
  files: 18
---

# Phase 15 Plan 03: l'imboscata nasce alla partenza Summary

Campi interni tipizzati `activeTravel.ambush { at, km, attempts }` e `activeTravel.ambushReports[]` senza `@Field` (SDL identico), job `ambush` deterministico sulla coda `travel`, `AmbushPlanner` iniettabile (fuso + `ChanceSource`) e le due partenze (`startTravel`, `movementTo` dell'accettazione) che sorteggiano fuori dalla transazione e accodano il trigger dopo il commit; anteprime mute; mondo di test con strade ≥ 10 km.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 019d640 | test(models): pin the internal ambush fields of the travel |
| 1 GREEN | 8913583 | feat(models): add internal ambush fields to the active travel |
| 2 RED | dd3eb77 | test(ambush): pin the ambush job, planner and scheduling |
| 2 GREEN | 602cf44 | feat(ambush): plan and schedule the ambush trigger |
| Rule 1 RED | f4c4513 | test(config): pin the ambush zone default without a config service |
| Rule 1 GREEN | c640efe | fix(config): default the ambush zone without a config service |
| 3 RED | ea0cb5f | test(travel): pin the ambush drawn at departure |
| 3 GREEN | 24b1fa6 | feat(travel): draw the ambush at departure and schedule it |

## Fallimenti RED osservati

- Task 1: `Cannot find module './ambush-snapshot.model'` (suite intera).
- Task 2: `Cannot find module './ambush-job'`, `'./ambush-planner.service'`, `'./ambush/ambush-job'` (tre suite).
- Rule 1: `toEqual` di `ambushConfigProvider.inject` (atteso `[{ token: ConfigService, optional: true }]`, ricevuto `[ConfigService]`).
- Task 3: travel `writes the drawn ambush…` → `Received: undefined` su `active.ambush`; `keeps the wire travel identical…` rosso su `ambush?.km` undefined; accettazione `draws the ambush…` → `Cannot read properties of undefined (reading 'km')`.
- Verdi al primo colpo, per costruzione: `draws nothing under ten km…` (D-03) e i due `never draws on the … preview` (D-15) — provano un'assenza che c'era già prima del piano e restano verdi per regressione.

## Numeri reali del mondo di test (gameDistanceKm, speedFactor 1)

- Alba → Borgo (R1): 20,015 km, 20,015 h; km 1 ⇒ `at = startTime + ⌊1/20,015 × duration⌋` = `10:59:59.999Z` per partenza alle `10:00Z` (non 11:00 tonde).
- Alba → questPoi: 15,011 km; R2 bivio → Crocevia 4,434 km; R3 Alba → Erta 8,896 km (nessun tiro).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `AMBUSH_CONFIG` irrisolvibile negli harness senza ConfigModule**
- **Trovato durante:** Task 3 (RED dell'accettazione)
- **Problema:** il Task 2 ha messo `ambushConfigProvider` (che inietta `ConfigService`) in `TravelPlanningModule`; l'harness nudo di `quest-acceptance.service.int-spec.ts` (voluto senza ConfigModule, commento in `quest-acceptance.module.ts`) falliva a `compile()` con «Nest can't resolve dependencies of the AMBUSH_CONFIG (?)». Avrebbe rotto anche i 98 casi esistenti della suite.
- **Fix:** iniezione opzionale `{ token: ConfigService, optional: true }`, `config?.get(...)`: senza servizio vale il default (stessa semantica della variabile vuota). Spec dedicata.
- **File:** src/config/ambush-config.ts, src/config/ambush-config.spec.ts (file del piano 15-01, fuori da `files_modified`)
- **Commit:** f4c4513, c640efe

**2. [Rule 1 - Bug] jest appeso due volte (handle aperto) — causa e fix**
- **Causa:** il `beforeAll` dell'harness nuovo dell'accettazione falliva per il bug 1 dopo che `MongooseModule.forRoot` aveva già aperto la connessione; `app`/`connection` restavano `undefined`, `afterAll` lanciava su `connection.dropDatabase` e la connessione Mongo non veniva mai chiusa ⇒ jest non usciva. Entrambe le run sono state terminate dall'orchestratore. Nessun timer né client Redis del codice nuovo (FakeTravelQueue senza timer, `scheduleAmbush` passa da `enqueueTrigger` sulla coda finta).
- **Prova:** con il fix 1, `--detectOpenHandles --forceExit` su travel.service.int-spec non segnala handle (10 s); le due int-spec toccate SENZA `--forceExit` escono da sole in 20 s (124 test verdi).
- **Nota:** da quel momento le run di int-spec hanno usato `--forceExit` come chiesto dall'orchestratore, salvo la prova di uscita pulita.

**3. [Rule 1 - test debole] asserzione del filo**
- `expect(raw.ambush).not.toBeNull()` passava anche con `undefined` in RED: sostituita con `expect(raw.ambush?.km).toBe(1)` prima del commit RED.

## Known Stubs

Nessuno: `ambushReports` è dichiarato ma scritto dai piani 06–08 (previsto dal piano).

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0 a fine di ogni task.
- unit `src/models/character src/travel/ambush src/travel/travel-scheduler.service.spec.ts src/config`: 353 verdi; `src/migrations src/models`: 163 verdi (mixed-ref pin invariato).
- integration `src/travel src/quests/acceptance`: 9 suite, 269 verdi; `src/quests/pending-requests`, `quest-resolution.processor.int-spec.ts`, `city-shops.e2e.int-spec.ts`: 6 suite, 38 verdi; `test/app.int-spec.ts`: 76 verdi.
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` vuoto (nessuna riga tolta né aggiunta).
- prettier + eslint puliti su ogni file `.ts` toccato.

## Self-Check: PASSED
