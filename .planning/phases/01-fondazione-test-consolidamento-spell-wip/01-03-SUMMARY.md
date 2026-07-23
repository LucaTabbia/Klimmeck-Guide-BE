---
phase: 01-fondazione-test-consolidamento-spell-wip
plan: 03
subsystem: characters
tags: [tdd, jest, bull, redis, mongoose, change-streams, pubsub, spell, di-mock]

# Dependency graph
requires:
  - "MongoMemoryReplSet condiviso + split Jest unit/integration + helper Redis effimero (Plan 01-01)"
  - "Fixture two-tier buildX/persistX (Plan 01-02)"
  - "Baseline WIP spell committata as-is con bug ordine validazione (Plan 01-01, commit feb90dc)"
provides:
  - "useSpell valida l'esistenza della spell PRIMA di decrementare/salvare (fix D-06, RED->GREEN)"
  - "Unit spec equipSpell/unequipSpell/useSpell con Bull mockato al confine DI (getQueueToken), nessun Redis"
  - "Integration test del processor spell-recovery su Redis effimero reale (usages 2->3)"
  - "Verifica change stream Character -> PUB_SUB dopo rimozione provider duplicato (D-09)"
affects: [01-04, phase-04-atomicity, phase-09-combat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unit service test: providers mockati al confine DI (getModelToken + getQueueToken + 'PUB_SUB'); compile() senza createNestApplication così onModuleInit (change stream) non parte"
    - "Processor integration: Nest app dedicata con BullModule.forRoot({redis}) + registerQueue + processor; app.init() wira il @Process handler; attesa deterministica via polling del documento (no job.finished per evitare open handle)"
    - "Change stream test: replica onModuleInit del service (watch update/replace + fullDocument updateLookup) e ripubblica su un createPubSub yoga; timeout cancellabile per non lasciare timer pendenti"

key-files:
  created:
    - src/characters/characters.service.spec.ts
    - src/characters/spell-recovery.processor.int-spec.ts
    - test/harness/character-changestream.int-spec.ts
  modified:
    - src/characters/characters.service.ts

key-decisions:
  - "Fix D-06 minimale: solo riordino (findById+guard prima di decremento/save), diff di 3+/3- sopra la baseline WIP; nessuna transazione/atomicità (deferita a Phase 4), nessun cap usages nel processor (deferito a Phase 4, D-07)"
  - "Attesa job Bull via polling del documento con deadline invece di job.finished(): quest'ultimo apre una connessione subscriber Redis non chiusa da queue.close() -> open handle"
  - "Processor test NON importa CharactersService per non aprire il change stream reale (test focalizzato sul processor)"

patterns-established:
  - "Unit service test con model+queue+pubsub mockati al confine DI NestJS"
  - "Processor integration test con Nest app dedicata (BullModule.forRoot) + polling deterministico"

requirements-completed: [BE-TEST-01, BE-TEST-02, BE-TEST-04]

# Metrics
duration: ~9min
completed: 2026-07-23
---

# Phase 1 Plan 03: Consolidamento Spell WIP con TDD Summary

**useSpell ora valida l'esistenza della spell prima di decrementare/salvare (fix D-06 RED->GREEN, diff di solo riordino sopra la baseline WIP); equipSpell/unequipSpell/useSpell coperti da unit test con Bull mockato al confine DI; il processor spell-recovery girato contro Redis effimero reale (usages 2->3); change stream Character -> PUB_SUB verificato dopo la rimozione del provider duplicato (D-09).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-23T17:06:31Z
- **Completed:** 2026-07-23T17:15:37Z
- **Tasks:** 3
- **Files modified:** 1 modificato (characters.service.ts) + 3 creati (spec)

## Accomplishments
- Unit spec `characters.service.spec.ts` (progetto unit, nessun replSet/Redis): equipSpell (known/free-slot, not-known, slot-pieni), unequipSpell (attiva/non-attiva), useSpell (happy, usages 0, e RED sull'ordine di validazione). Bull mockato via `getQueueToken('spell-recovery')`, model via `getModelToken`, PUB_SUB via token. `compile()` senza `createNestApplication` così `onModuleInit` (change stream) non viene triggerato sul mock.
- Fix D-06 (GREEN): in `useSpell` la `spellModel.findById` + guard `NotFoundException` precede ora `activeSpell.usages -= 1` e `character.save()`. Il commit `fix(01-03)` diffonde SOLO il riordino (3 insertions / 3 deletions) sopra la baseline WIP `feat(01-01)`.
- Integration `spell-recovery.processor.int-spec.ts`: Nest app dedicata con `BullModule.forRoot({ redis })` su Redis effimero reale (`startRedis`, NO ioredis-mock) + replSet; persiste un Character con `activeSpells:[{usages:2}]`, aggiunge un job reale, attende con polling deterministico del documento e asserisce `usages === 3`.
- Integration `character-changestream.int-spec.ts` (D-09): replica il change stream del service (watch update/replace + `fullDocument:'updateLookup'`), ripubblica su un `createPubSub` yoga e asserisce che `characterUpdated` viene emesso dopo un update del Character — prova che l'unico provider PUB_SUB rimasto (dopo la rimozione del duplicato in 01-01) funziona.
- Suite verde: unit 18/18, integration 8/8, nessun open handle Jest.

## Task Commits

Ogni task committato atomicamente (nessun `git add -A`/`git add .`):

1. **Task 1: Unit spec + RED ordine validazione** — `c301a58` test(01-03)
2. **Task 2: Fix ordine validazione useSpell (GREEN)** — `4816229` fix(01-03) _(diff di solo riordino, 3+/3-)_
3. **Task 3: Integration processor (Redis reale) + change stream -> PUB_SUB** — `26529c0` test(01-03)

## Files Created/Modified
- `src/characters/characters.service.spec.ts` - unit spec spell mutations con Bull DI-mock + RED useSpell
- `src/characters/spell-recovery.processor.int-spec.ts` - integration processor su Redis reale (usages 2->3)
- `test/harness/character-changestream.int-spec.ts` - verifica change stream Character -> PUB_SUB (D-09)
- `src/characters/characters.service.ts` - riordino validazione in useSpell (findById+guard prima di decremento/save)

## Decisions Made
- Fix D-06 mantenuto minimale (solo ordine): nessuna atomicità/transazione (deferita a Phase 4 BE-ATOM), nessun cap usages nel processor (deferito a Phase 4, D-07). Lo scheduling per-uso resta as-is (D-05).
- Attesa del job Bull via **polling del documento con deadline** invece di `job.finished()`: quest'ultimo apre una connessione subscriber Redis che `queue.close()` non chiude, producendo un open handle. Il polling è deterministico e non lascia handle.
- Il processor test NON importa `CharactersService` per evitare di aprire il change stream reale; registra solo il processor + i model + Bull, focalizzando il test sul processor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Timer non cancellato nella Promise.race del change stream test**
- **Found during:** Task 3 (change stream spec)
- **Issue:** Il `setTimeout` di guardia (8000ms) nella `Promise.race` non veniva cancellato quando l'evento arrivava per primo (~130ms): il timer restava pendente e teneva occupato l'event loop, causando il warning Jest "did not exit one second after the test run".
- **Fix:** Timer cancellabile (`clearTimeout` in `finally`) + `stream.removeAllListeners('change')` + chiusura ordinata di subscription e change stream nel `finally`.
- **Files modified:** test/harness/character-changestream.int-spec.ts
- **Verification:** suite integration completa senza warning open handle.
- **Committed in:** 26529c0 (Task 3 commit)

**2. [Rule 3 - Blocking] job.finished() lascia una connessione Redis subscriber aperta**
- **Found during:** Task 3 (processor spec)
- **Issue:** L'attesa via `job.finished()` apriva una connessione subscriber Redis interna non chiusa da `queue.close()` -> open handle Jest.
- **Fix:** Sostituito con polling deterministico del documento (deadline 15s, tick 100ms), esplicitamente permesso dalla ricerca (Pattern 3). `app.close()` gestisce la chiusura di coda e connessione Mongoose.
- **Files modified:** src/characters/spell-recovery.processor.int-spec.ts
- **Verification:** processor int-spec passa senza warning open handle.
- **Committed in:** 26529c0 (Task 3 commit)

**3. [Rule 3 - Blocking] Prettier default a 2 spazi vs convenzione codebase (4 spazi)**
- **Found during:** Task 3 (formattazione pre-commit)
- **Issue:** `.prettierrc` non imposta `tabWidth`, quindi `prettier --write` riformattava i nuovi file a 2 spazi, incoerenti con tutto il codebase (e le spec pre-esistenti) che usa 4 spazi.
- **Fix:** Riformattazione con `prettier --tab-width 4` per rispettare la convenzione del codebase mantenendo single-quote e trailing-comma. (Correggere `.prettierrc` è fuori scope — registrato sotto Deferred.)
- **Files modified:** i 3 file spec di questo plan
- **Verification:** indentazione a 4 spazi coerente con fixtures/harness pre-esistenti; suite verde.
- **Committed in:** 26529c0 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug + 2 blocking), tutte nel codice di test scritto in questo plan. Nessuna modifica di produzione oltre al fix D-06 pianificato.
**Impact on plan:** Nessuno scope creep. I fix riguardano solo la robustezza dei test (open handle) e la coerenza di stile.

## Deferred Issues

- `.prettierrc` non imposta `tabWidth: 4`: `prettier --write` senza override riformatta a 2 spazi, divergendo dalla convenzione codebase (4 spazi). Riconciliazione della config Prettier fuori scope in questa fase (impatta l'intero repo). Registrato per una futura fase di hardening/tooling.
- Errori `@typescript-eslint/no-unsafe-*` sui file di test (uso di `any`): pattern pre-esistente e condiviso con tutte le spec dei Plan 01/02 (es. replset.int-spec.ts: 110 errori analoghi). Non bloccante (nessun git hook attivo); riconciliazione della config ESLint per i test fuori scope.

## Issues Encountered
- Le tre deviazioni sopra, risolte iterativamente durante Task 3 (robustezza open handle + coerenza di stile).

## User Setup Required
None - Mongo e Redis sono effimeri in-process (replSet condiviso + redis-memory-server in locale / service container in CI).

## Known Stubs
Nessuno. Il fix D-06 chiude il bug baseline preservato in 01-01; il codice di produzione toccato (useSpell) è completo per il perimetro di Fase 1. Atomicità e cap usages sono deferiti a Phase 4 per decisione esplicita (D-07), non stub.

## Threat Flags
Nessuna nuova superficie. Il fix D-06 mitiga T-01-06 (Tampering): nessuna perdita/mutazione di stato su spell inesistente. Nessun endpoint/trust boundary nuovo introdotto.

## Next Phase Readiness
- BE-TEST-04 completo: fix ordine validazione applicato e coperto (RED->GREEN), processor coperto da integration test su Redis reale.
- Prove Character-side di BE-TEST-01 (change stream) e BE-TEST-02 (Bull DI-mock unit + processor integration) verdi.
- Resta Plan 01-04 (CI GitHub Actions, D-10/D-11/D-12) per chiudere la fase.

## Self-Check: PASSED

Tutti i file creati/modificati verificati presenti (3 spec + characters.service.ts + SUMMARY). I 3 commit del plan (c301a58, 4816229, 26529c0) verificati in git log. Fix order verificato: `spellModel.findById` (riga 297) precede `activeSpell.usages -= 1` (riga 302). Suite verde: unit 18/18, integration 8/8, nessun open handle.

---
*Phase: 01-fondazione-test-consolidamento-spell-wip*
*Completed: 2026-07-23*
