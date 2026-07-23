---
phase: 01-fondazione-test-consolidamento-spell-wip
plan: 01
subsystem: testing
tags: [jest, mongodb-memory-server, redis-memory-server, mongoose, change-streams, transactions, bull, replica-set]

# Dependency graph
requires: []
provides:
  - "Baseline WIP spell committata in 4 commit per concern (D-08), pronta per il fix di 01-03"
  - "MongoMemoryReplSet condiviso (single-node, wiredTiger) avviabile via Jest globalSetup"
  - "Split Jest unit/integration via projects, con risoluzione dei path src/ (moduleNameMapper)"
  - "Helper Redis effimero agnostico (env service container in CI / redis-memory-server in locale)"
  - "Harness spec verde che prova transazione Mongo (commit + abort) e change stream"
affects: [01-02, 01-03, 01-04, phase-04-atomicity, phase-09-combat]

# Tech tracking
tech-stack:
  added: [mongodb-memory-server@11, redis-memory-server@0]
  patterns:
    - "Jest projects: unit (*.spec.ts, no replSet) vs integration (*.int-spec.ts, replSet via globalSetup)"
    - "ReplSet condiviso a nodo singolo via globalSetup/globalTeardown; mongoose connesso una volta, collection svuotate in afterEach (no restart)"
    - "Redis effimero astratto dietro env (REDIS_HOST/REDIS_PORT) con fallback RedisMemoryServer"

key-files:
  created:
    - test/setup/mongo-replset.ts
    - test/setup/global-setup.ts
    - test/setup/global-teardown.ts
    - test/setup/after-env.ts
    - test/setup/redis.ts
    - test/harness/replset.int-spec.ts
    - src/characters/spell-recovery.processor.ts
    - src/models/request/use-spell-request.model.ts
  modified:
    - package.json
    - src/app.module.ts
    - src/characters/characters.module.ts
    - src/characters/characters.service.ts
    - src/characters/characters.resolver.ts
    - src/schema.gql
    - src/mongo/mongo.module.ts
    - src/roads/roads.service.ts

key-decisions:
  - "WIP spell committato as-is con bug ordine validazione incluso: il fix (riordino) resta per 01-03 → diff pulito"
  - "ReplSet condiviso via globalSetup (una istanza per progetto integration) invece di per-file, per velocità"
  - "Pre-creazione della collection prima delle transazioni multi-doc su replSet per evitare il conflitto di namespace"

patterns-established:
  - "Suffisso *.int-spec.ts per i test di integrazione; *.spec.ts per gli unit"
  - "Commit atomici per concern (chore/feat/refactor/test) con scope (01-01)"

requirements-completed: [BE-TEST-01, BE-TEST-02, BE-TEST-04]

# Metrics
duration: ~6min
completed: 2026-07-23
---

# Phase 1 Plan 01: Fondazione Test & Consolidamento Spell WIP Summary

**WIP spell consolidato in 4 commit per concern (D-08) + harness TDD con MongoMemoryReplSet single-node (change stream + transazioni), split Jest unit/integration e helper Redis effimero, provato da una integration spec verde.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-23T16:23:39Z
- **Completed:** 2026-07-23T16:29:08Z
- **Tasks:** 4
- **Files modified:** 8 modificati + 6 creati (test/setup + harness)

## Accomplishments
- WIP spell del working tree committato as-is in 4 commit per concern nell'ordine D-08 (chore Bull → feat mutazioni+processor → refactor collaterali → chore packageManager), baseline immutabile per il fix di 01-03.
- MongoMemoryReplSet condiviso (single-node, wiredTiger) avviabile via Jest globalSetup: transazioni e change stream funzionanti.
- Split Jest a due progetti (unit veloce senza replSet, integration cablato ai setup) con risoluzione dei path `src/` via moduleNameMapper.
- Helper Redis effimero agnostico (env service container in CI / redis-memory-server in locale), nessuna credenziale hardcoded.
- `replset.int-spec.ts` verde: transazione (commit + abort) e change stream provati, nessun open handle.

## Task Commits

Ogni task committato atomicamente (nessun `git add -A`/`git add .`):

1. **Task 1: Consolidamento WIP (D-08)** — 4 commit:
   - `58d630c` chore(01-01): register spell-recovery Bull queue
   - `feb90dc` feat(01-01): add equipSpell/unequipSpell/useSpell mutations + spell-recovery processor _(WIP as-is, bug ordine validazione incluso)_
   - `634b548` refactor(01-01): use Nest Logger in roads + remove duplicate PUB_SUB provider
   - `a1abc84` chore(01-01): pin package manager (yarn)
2. **Task 2: Deps + MongoMemoryReplSet setup** — `ad66d23` (chore deps) + `409281a` (chore setup files)
3. **Task 3: Jest projects split** — `0d6e05a` (chore)
4. **Task 4: Redis helper + harness spec** — `2151636` (test)

_Note: Task 2 ha due commit per tenere separato l'install delle devDeps dalla creazione dei file di setup._

## Files Created/Modified
- `test/setup/mongo-replset.ts` - start/stop MongoMemoryReplSet condiviso (single-node)
- `test/setup/global-setup.ts` - globalSetup Jest: avvia replSet, espone URI via env
- `test/setup/global-teardown.ts` - globalTeardown: disconnette mongoose e ferma replSet
- `test/setup/after-env.ts` - connette mongoose una volta, svuota collection in afterEach
- `test/setup/redis.ts` - helper Redis effimero (env service container / RedisMemoryServer)
- `test/harness/replset.int-spec.ts` - prova transazione (commit + abort) e change stream
- `package.json` - jest.projects (unit/integration), scripts test:unit/test:int, devDeps
- `src/characters/spell-recovery.processor.ts` - processor Bull spell-recovery (WIP consolidato)
- `src/models/request/use-spell-request.model.ts` - DTO UseSpellRequest (WIP consolidato)
- `src/characters/characters.service.ts` - equipSpell/unequipSpell/useSpell (WIP as-is, bug incluso)

## Decisions Made
- WIP committato as-is (bug ordine validazione a :297-303 preservato) per creare una baseline pulita; il fix RED→GREEN è di competenza di 01-03 (D-06).
- ReplSet condiviso via globalSetup (una istanza per il progetto integration) invece che per-file, per velocità e stabilità.
- Pre-creazione esplicita della collection prima delle transazioni multi-documento (vedi Deviations) per evitare il conflitto di namespace tipico del replSet effimero.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] API Mongoose 8: create() multi-doc in sessione richiede ordered: true**
- **Found during:** Task 4 (harness spec)
- **Issue:** `HarnessModel.create([doc1, doc2], { session })` falliva con `MongooseError: Cannot call create() with a session and multiple documents unless ordered: true is set`.
- **Fix:** Aggiunto `{ session, ordered: true }`.
- **Files modified:** test/harness/replset.int-spec.ts
- **Verification:** il create in transazione non lancia più.
- **Committed in:** 2151636 (Task 4 commit)

**2. [Rule 1 - Bug] Commit transiente su replSet single-node (UnknownTransactionCommitResult)**
- **Found during:** Task 4 (harness spec)
- **Issue:** `commitTransaction()` poteva lanciare un errore transient; il catch chiamava poi `abortTransaction()` dopo un commit già avvenuto.
- **Fix:** retry loop sul commit per label `UnknownTransactionCommitResult` + guard `session.inTransaction()` prima dell'abort.
- **Files modified:** test/harness/replset.int-spec.ts
- **Verification:** test commit verde.
- **Committed in:** 2151636 (Task 4 commit)

**3. [Rule 1 - Bug] Conflitto di namespace creando la collection dentro una transazione**
- **Found during:** Task 4 (harness spec)
- **Issue:** `MongoServerError: Collection namespace 'test.harnessdocs' is already in use` — la creazione implicita della collection dentro una transazione multi-doc confligge sul replSet.
- **Fix:** aggiunto `beforeAll` con `HarnessModel.createCollection()` per pre-creare il namespace prima della transazione.
- **Files modified:** test/harness/replset.int-spec.ts
- **Verification:** `npm run test:int` — 3/3 verdi.
- **Committed in:** 2151636 (Task 4 commit)

---

**Total deviations:** 3 auto-fixed (3 bug, tutti nel codice di test dell'harness scritto in questo task)
**Impact on plan:** Nessuno scope creep. I fix riguardano solo la spec dell'harness e sono necessari per far girare transazioni/change stream sul replSet effimero con Mongoose 8. Nessuna modifica al codice di produzione oltre al consolidamento WIP pianificato.

## Issues Encountered
- Le tre deviazioni sopra sono state risolte iterativamente durante Task 4, allineando la spec alle API di Mongoose 8 e ai vincoli delle transazioni su replSet single-node.

## User Setup Required
None - nessuna configurazione di servizi esterni richiesta (Mongo/Redis sono effimeri in-process).

## Known Stubs
Il commit feat contiene `characters.service.ts` con il bug dell'ordine di validazione in `useSpell` (`usages -= 1` + `save()` prima di `findById`) intenzionalmente preservato as-is: è la baseline richiesta da D-06/D-08. Il fix RED→GREEN è pianificato in **01-03**. Non è uno stub bloccante per l'obiettivo di questo plan (fondazione test + consolidamento baseline).

## Next Phase Readiness
- Fondazione TDD pronta: replSet condiviso, split unit/integration, Redis helper. I plan a valle (01-02 fixture/factory, 01-03 fix ordine validazione, 01-04 CI) possono innestarsi.
- Baseline WIP committata: il fix di 01-03 produrrà un diff pulito (solo riordino validazione).

## Self-Check: PASSED

Tutti i file creati verificati presenti (test/setup/*, test/harness/replset.int-spec.ts, spell-recovery.processor.ts, SUMMARY.md). Tutti gli 8 commit del plan verificati in git log.

---
*Phase: 01-fondazione-test-consolidamento-spell-wip*
*Completed: 2026-07-23*
