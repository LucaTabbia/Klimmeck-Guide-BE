---
phase: 09-combat-result-admin-outcomes
plan: 04
subsystem: game-rules
tags: [combat, port, di, placeholder, rng, fixtures, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-03)
    provides: ChanceSource / SequenceChance, injuryModifiersOf
  - phase: 04-integrita-economica-atomics
    provides: refIdOf
provides:
  - CombatResolver (classe astratta usabile come token DI) + tipi CombatContext / CombatParticipant / CombatEnemy / ParticipantOutcome / CombatVerdict
  - normalizeDamages / combatCatalogRefsOf / buildCombatContext (idratazione pura, Pitfall 10)
  - PlaceholderCombatResolver + PLACEHOLDER_RULES (PROVVISORIO, D-02)
  - ScriptedCombatResolver (fake per le integration) e fixture buildEnemy / persistEnemy
affects: [09-05, 09-10, 09-12, 09-13, 09-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Porta di dominio come classe astratta-token DI (come PushTransport), input puro già idratato e RNG iniettato"
    - "Idratazione in due tempi: combatCatalogRefsOf per le pre-letture del servizio, buildCombatContext puro sulle mappe esadecimali"

key-files:
  created:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/combat/combat-context.spec.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts
    - test/quests/scripted-combat-resolver.ts
    - test/fixtures/enemy.fixture.ts
  modified:
    - test/fixtures/index.ts
    - test/fixtures/fixtures.spec.ts
    - test/fixtures/fixtures.int-spec.ts

key-decisions:
  - "Riferimenti orfani (equipaggiamento, magia, loot assenti dal catalogo) esclusi dal contesto; le voci di ownedItems con quantità < 1 non sono pre-lette né consumabili"
  - "Il segnaposto ordina i partecipanti per characterId anche se il contesto arriva non ordinato: esiti e consumo del ChanceSource riproducibili"
  - "Clamp HP = max(1, min(max, hp)): D-07 prevale anche su maxLifePoints malformati"
  - "buildEnemy omette locations: lo schema Enemy dichiara locations come String singolo (bug del modello, deferred)"

patterns-established:
  - "ScriptedCombatResolver.willResolve(characterId, esito) + contexts registrati: le integration decidono l'esito per personaggio"

requirements-completed: []  # contributo a BE-COMBAT-03; traceability nel gate 09-16

# Metrics
duration: 15min
completed: 2026-10-24
---

# Phase 9 Plan 04: Porta CombatResolver e resolver segnaposto Summary

**Porta `CombatResolver` astratta (token DI) con contesto puro idratato e tollerante ai danni malformati, `PlaceholderCombatResolver` PROVVISORIO deterministico sul `ChanceSource` con HP sempre in [1, max], fake `ScriptedCombatResolver` e fixture `Enemy`**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-24T15:25:00Z
- **Completed:** 2026-10-24T15:40:00Z
- **Tasks:** 2 (2/2)
- **Files modified:** 10 (7 creati, 3 modificati)

## Accomplishments

- `combat-resolver.ts`: solo tipi e la classe astratta `CombatResolver.resolve(context, chance): ParticipantOutcome[]` (D-02, D-05, D-07 documentato).
- `combat-context.ts`: `normalizeDamages` (oggetto singolo → array, power non numerico/negativo scartato, input assente → vuoto, nessuna eccezione — T-09-18), `combatCatalogRefsOf` (id indossati per slot, magie attive, LootItem posseduti, deduplicati come ObjectId), `buildCombatContext` (partecipanti ordinati per id esadecimale, default sicuri, `effect` ignoto → `null`, nessuna mutazione). Nessun import di modelli Mongoose.
- `placeholder-combat-resolver.ts`: intestazione `PROVVISORIO`, `PLACEHOLDER_RULES`, regola esatta del piano (winChance da potenza del party × `damageFactor` delle ferite, perdita divisa per partecipanti e `lifePointsFactor`, ferita al 20% sulla prima non posseduta, pozione heal sotto il 30%, una carica per magia con usi). Nessun `Math.random`/`Date`.
- `test/quests/scripted-combat-resolver.ts`: fake con `willResolve`, `reset`, `contexts` registrati; default vittoria senza danni.
- `test/fixtures/enemy.fixture.ts`: `buildEnemy` (1000 HP, 100 xp, danni cut 100) e `persistEnemy`, esportati da `index.ts`, coperti in `fixtures.spec.ts` (validateSync) e `fixtures.int-spec.ts` (replSet).

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | porta CombatResolver e contesto (RED) | `3e997a1` | test |
| 1 | porta CombatResolver e contesto (GREEN) | `d4a6c1e` | feat |
| 2 | segnaposto, fake e fixture Enemy (RED) | `0456397` | test |
| 2 | segnaposto, fake e fixture Enemy (GREEN) | `e6abe15` | feat |

`combat-resolver.ts` (solo tipi + classe astratta) è entrato completo nel commit RED del Task 1, come ChanceSource in 09-03: è il contratto delle spec, non comportamento.

## RED output

- Task 1: `npx jest src/quests/outcomes/combat/combat-context.spec.ts --selectProjects unit` → `Test Suites: 1 failed, 1 total; Tests: 11 failed, 11 total` (stub `not implemented`)
- Task 2: `npx jest src/quests/outcomes/combat test/fixtures/fixtures.spec.ts --selectProjects unit` → `Test Suites: 2 failed, 1 passed, 3 total; Tests: 12 failed, 26 passed, 38 total` (10 casi del segnaposto + 2 di buildEnemy; i 26 verdi sono il contesto del Task 1 e le fixture esistenti)

## Verification

- `npx jest src/quests/outcomes test/fixtures/fixtures.spec.ts --selectProjects unit` → 10 suite, 147 test verdi
- `npx jest test/fixtures/fixtures.int-spec.ts --selectProjects integration --runInBand` → 6 test verdi (incluso `persistEnemy`)
- `npm run build` esce 0; `npx eslint` e `npx prettier --check` puliti su tutti i 10 file
- Grep di accettazione: `export abstract class CombatResolver` (1), `@nestjs/mongoose|src/models/*.model` in combat-context = 0, `PROVVISORIO` (1), `extends CombatResolver` (2), `Math.random|Date.now|new Date(` in `src/quests/outcomes/combat` vuoto, `injuryModifiersOf` (3), `export * from './enemy.fixture'` (1); nessun letterale vietato (`kind`, `grade`, `TravelKind`)

## Decisions Made

- Gli orfani del catalogo sono esclusi dal contesto (non solo l'equipaggiamento come prescritto, anche magie e loot) per coerenza: il resolver non vede mai voci senza dati.
- Il segnaposto ordina i partecipanti per id internamente (il caso D-05 del piano li passa in ordine inverso e richiede che "il primo per id" vinca).
- Pozione con `power` negativo trattata come 0; clamp ripetuto dopo la pozione.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug nella spec] Loot a quantità 0 nelle pre-letture**
- **Found during:** Task 1 GREEN
- **Issue:** la mia spec RED si aspettava che `combatCatalogRefsOf` includesse anche un LootItem a quantità 0, contraddicendo "LootItem posseduti" e la regola dei consumabili (quantità ≥ 1).
- **Fix:** attesa corretta (solo la pozione posseduta), nome del caso esplicito "skipping empty stacks".
- **Files modified:** src/quests/outcomes/combat/combat-context.spec.ts
- **Commit:** d4a6c1e

**2. [Rule 3 - Blocking] Import di SequenceChance**
- **Found during:** Task 2 RED
- **Issue:** l'alias `test/quests/sequence-chance` non è risolto da Jest nel progetto unit.
- **Fix:** percorso relativo `../../../../test/quests/sequence-chance`, come le spec di 09-03.
- **Commit:** 0456397

**3. [Rule 3 - Blocking] `locations` nella fixture Enemy**
- **Found during:** Task 2 GREEN
- **Issue:** `src/models/enemy.model.ts` dichiara `locations` con `type: String` (singolo) mentre TS/GraphQL lo vogliono array: `locations: []` fallisce `validateSync` (`Cast to string failed`). Il piano vieta di modificare il modello.
- **Fix:** `buildEnemy` omette `locations` (commento nella fixture); bug registrato in `deferred-items.md` con il fix atteso.
- **Files modified:** test/fixtures/enemy.fixture.ts, .planning/phases/09-combat-result-admin-outcomes/deferred-items.md
- **Commit:** e6abe15 (fixture), commit docs finale (deferred-items)

**4. [Convenzione] Subject RED del Task 2 di 73 caratteri**
- Il subject prescritto dal piano `test(outcomes): specify the placeholder combat resolver and enemy fixture` supera di 1 il limite di 72; nessuna riscrittura della storia, commit `0456397` lasciato com'è.

## Issues Encountered

- Nessuno oltre le deviazioni sopra.

## Known Stubs

- `src/quests/outcomes/combat/placeholder-combat-resolver.ts`: regole di combattimento intenzionalmente PROVVISORIE (D-02) finché l'utente non fornisce le sue; sostituibili via DI su `CombatResolver` senza toccare il resto. Da dichiarare nel handoff (09-16).

## Threat Flags

Nessuna nuova superficie: moduli puri, nessun endpoint né I/O.

## Next Phase Readiness

- 09-05 applica `ParticipantOutcome[]` (con clamp difensivo, T-09-17); il servizio di risoluzione usa `combatCatalogRefsOf` per le pre-letture e `buildCombatContext` prima di `resolve`; le integration di 09-12/09-13 sostituiscono il provider con `ScriptedCombatResolver` e persistono nemici con `persistEnemy`.
- Da segnalare: il bug `Enemy.locations` (deferred-items.md) se una fase legge i nemici sul filo.

## Self-Check: PASSED
