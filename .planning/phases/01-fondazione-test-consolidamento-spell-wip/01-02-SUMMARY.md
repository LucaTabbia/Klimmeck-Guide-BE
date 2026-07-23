---
phase: 01-fondazione-test-consolidamento-spell-wip
plan: 02
subsystem: testing
tags: [fixtures, factory, mongoose, jest, test-data, replica-set]

# Dependency graph
requires:
  - "MongoMemoryReplSet condiviso + split Jest unit/integration (Plan 01-01)"
provides:
  - "Fixture two-tier buildX/persistX per i sei modelli di dominio (User, Character, Quest, Spell, Road, POI)"
  - "buildCharacter che gestisce location required + virtual maxActiveSpells (xp:20000)"
  - "test/fixtures/index.ts: entrypoint unico per import puliti nelle spec a valle"
  - "Unit project Jest esteso a test/**/*.spec.ts (oltre a src/)"
affects: [01-03, 01-04, phase-04-atomicity, phase-06-quest, phase-07-travel, phase-09-combat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-tier fixture: buildX(overrides?) plain object deterministico; persistX(model, overrides?) riusa buildX per scrivere sul replSet (D-03/D-04)"
    - "Overrides top-level via spread; nessun faker/Math.random (deterministico)"
    - "persistCharacter crea un POI reale quando location non è fornita (gestione ref required)"

key-files:
  created:
    - test/fixtures/spell.fixture.ts
    - test/fixtures/user.fixture.ts
    - test/fixtures/road.fixture.ts
    - test/fixtures/poi.fixture.ts
    - test/fixtures/character.fixture.ts
    - test/fixtures/quest.fixture.ts
    - test/fixtures/index.ts
    - test/fixtures/fixtures.spec.ts
    - test/fixtures/fixtures.int-spec.ts
  modified:
    - package.json

key-decisions:
  - "buildCharacter default xp:20000 → virtual maxActiveSpells === 1 (uno slot per i test equipSpell)"
  - "Fixture conformi allo schema Mongoose runtime, non al @Field GraphQL: POI type è String scalare, non array"
  - "Unit project rootDir . + roots/testMatch per includere test/fixtures/*.spec.ts senza spostare i file"

patterns-established:
  - "test/fixtures/<entity>.fixture.ts con buildX/persistX; re-export centralizzato in index.ts"

requirements-completed: [BE-TEST-03]

# Metrics
duration: ~6min
completed: 2026-07-23
---

# Phase 1 Plan 02: Fixture/Factory Riusabili Summary

**Fixture two-tier (`buildX`/`persistX`) deterministiche per i sei modelli di dominio, con Character che gestisce la trappola `location` required + il virtual `maxActiveSpells` (xp:20000), verificate da una unit spec (buildX validi) e da una integration spec (persistX round-trip su MongoMemoryReplSet).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-23T16:56:17Z
- **Completed:** 2026-07-23T17:02:29Z
- **Tasks:** 3
- **Files modified:** 1 modificato (package.json) + 9 creati (fixture + spec)

## Accomplishments
- Sei fixture two-tier in `test/fixtures/`: `buildX(overrides?)` ritorna un plain object minimo, valido e deterministico; `persistX(model, overrides?)` lo salva sul replSet riusando `buildX`.
- `buildCharacter` disinnesca i due trap dello schema (Pitfall #5): `status.location` (ref POI **required**) e il virtual `maxActiveSpells` (default `xp:20000` → 1 slot). `persistCharacter` crea un POI reale quando la location non è fornita.
- `test/fixtures/index.ts` re-esporta tutte e sei le factory per import puliti nelle spec a valle (Plan 03 e fasi 2-10).
- Unit spec (`fixtures.spec.ts`): asserisce che ogni `buildX` produce oggetti con i campi required valorizzati e che gli overrides top-level vincono — 10 test verdi.
- Integration spec (`fixtures.int-spec.ts`): `persistSpell`/`persistCharacter` round-trip su MongoMemoryReplSet, provando che un Character persiste con `status.location` valorizzato (no ValidationError) — 3 test verdi.
- Fixture riusate in ≥2 spec file (unit + integration), come da requisito BE-TEST-03.

## Task Commits

Ogni task committato atomicamente (nessun `git add -A`/`git add .`):

1. **Task 1: Fixture semplici (Spell, User, Road, POI)** — `3167d4a` feat(01-02)
2. **Task 2: Fixture complesse (Character, Quest) + index** — `8084d75` feat(01-02)
3. **Task 3: Spec di verifica (unit + integration)** — `0eb9e01` test(01-02) _(include i due fix di deviazione)_

## Files Created/Modified
- `test/fixtures/spell.fixture.ts` - buildSpell/persistSpell (useType attack, energyDamage fire)
- `test/fixtures/user.fixture.ts` - buildUser/persistUser (twitchId fittizio 'twitch-test-1')
- `test/fixtures/road.fixture.ts` - buildRoad/persistRoad (coordinates, length, speedFactor)
- `test/fixtures/poi.fixture.ts` - buildPoi/persistPoi (location required, type String scalare)
- `test/fixtures/character.fixture.ts` - buildCharacter/persistCharacter (location + virtual maxActiveSpells)
- `test/fixtures/quest.fixture.ts` - buildQuest/persistQuest (markerLocation required, QuestType hunt)
- `test/fixtures/index.ts` - re-export unico delle sei factory
- `test/fixtures/fixtures.spec.ts` - unit spec: buildX validi + overrides
- `test/fixtures/fixtures.int-spec.ts` - integration spec: persistX round-trip su replSet
- `package.json` - unit project Jest esteso a test/**/*.spec.ts (rootDir . + roots)

## Decisions Made
- `buildCharacter` default `xp:20000` così il virtual `maxActiveSpells` restituisce 1: gli slot magia sono disponibili per i test equipSpell senza setup extra.
- Le fixture conformano allo **schema Mongoose runtime**, non al `@Field` GraphQL: il POI `type` è persistito come `String` scalare (non array), quindi `buildPoi` usa `type: 'city'`.
- Unit project esteso (rootDir `.`, roots `src`+`test`, testMatch su entrambi) per far girare `fixtures.spec.ts` da `test/fixtures/` senza spostare i file dove il piano li colloca.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] POI `type` è String scalare nello schema, non array**
- **Found during:** Task 3 (integration spec)
- **Issue:** `buildPoi` con `type: ['city']` (come da bozza del piano) falliva la persistenza: `ValidationError: PointOfInterest validation failed: type: Cast to string failed for value "[ 'city' ]"`. Il `@Prop` reale è `{ type: String, enum }` (scalare), nonostante il `@Field(() => [PoiType])` GraphQL sia un array.
- **Fix:** `buildPoi` usa `type: 'city'` (stringa enum valida); assertion unit allineata a `toBe('city')`.
- **Files modified:** test/fixtures/poi.fixture.ts, test/fixtures/fixtures.spec.ts
- **Verification:** integration spec verde (Character persiste con POI location valida).
- **Committed in:** 0eb9e01 (Task 3 commit)

**2. [Rule 3 - Blocking] Unit project Jest non trovava le spec in test/fixtures/**
- **Found during:** Task 3 (unit spec)
- **Issue:** L'acceptance criteria richiede `npm run test:unit -- test/fixtures/fixtures.spec.ts` verde, ma il progetto `unit` aveva `rootDir: src` con testMatch `<rootDir>/**/*.spec.ts` → non poteva scoprire una spec sotto `test/`.
- **Fix:** Unit project `rootDir` da `src` a `.`, aggiunto `roots: [src, test]`, testMatch su `src/**` e `test/**/*.spec.ts`, moduleNameMapper aggiornato a `<rootDir>/src/$1`. `*.int-spec.ts` resta escluso dallo unit (non matcha `*.spec.ts`).
- **Files modified:** package.json
- **Verification:** `npm run test:unit` → 10/10 verdi (fixtures.spec.ts + src/app.controller.spec.ts intatto); `npm run test:int` → 6/6 verdi (harness Plan 01 intatto).
- **Committed in:** 0eb9e01 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug di conformità schema, 1 blocking di configurazione harness)
**Impact on plan:** Nessuno scope creep. Il fix POI è correttezza di conformità allo schema reale; il fix Jest è necessario per soddisfare l'acceptance criteria della unit spec e non altera il comportamento dei test esistenti.

## Deferred Issues

Registrati in `.planning/phases/01-fondazione-test-consolidamento-spell-wip/deferred-items.md` (pre-esistenti, fuori scope):
- `tsconfig.json` `types: ["node","Multer"]` esclude i globali Jest da `tsc`: `npx tsc --noEmit` segnala `Cannot find name 'describe'/'expect'` su **tutti** i file spec (incluso l'harness del Plan 01), ma i test passano perché ts-jest risolve `@types/jest` a runtime. **I file fixture puri (`build*/persist*`) sono puliti sotto tsc**, coerente con la verification del piano.
- Mismatch schema/GraphQL su `PointOfInterest.type` (String vs `[PoiType]`) nel modello sorgente: riconciliazione fuori scope (possibile impatto sul contratto FE).

## Issues Encountered
- Le due deviazioni sopra, risolte durante Task 3 allineando le fixture allo schema Mongoose reale e la config Jest all'acceptance criteria.

## User Setup Required
None - nessuna configurazione di servizi esterni richiesta (Mongo effimero in-process).

## Known Stubs
Nessuno. Le fixture hanno default deterministici completi, non placeholder; ogni test sovrascrive via overrides ciò che gli serve.

## Next Phase Readiness
- Le fixture sono pronte per il Plan 01-03 (fix ordine validazione useSpell RED→GREEN) e per le fasi 2-10: costruzione deterministica di Character validi (slot magia disponibili, location valida) senza riscrivere setup ad ogni spec.
- L'uso in ≥2 spec file è già soddisfatto (unit + integration); il Plan 03 le riuserà, rafforzando il requisito.

## Self-Check: PASSED

Tutti i file creati verificati presenti (9 fixture/spec + SUMMARY). I 3 commit del plan (3167d4a, 8084d75, 0eb9e01) verificati in git log. Suite verde: unit 10/10, integration 6/6.

---
*Phase: 01-fondazione-test-consolidamento-spell-wip*
*Completed: 2026-07-23*
