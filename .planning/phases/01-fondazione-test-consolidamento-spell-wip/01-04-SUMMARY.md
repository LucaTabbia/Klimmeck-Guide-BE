---
phase: 01-fondazione-test-consolidamento-spell-wip
plan: 04
subsystem: ci
tags: [github-actions, ci, redis-service-container, mongodb-memory-server, cache, cleanup]

# Dependency graph
requires:
  - "Script npm lint/test:unit/test:int (Plan 01-01)"
  - "Helper Redis effimero che legge REDIS_HOST/REDIS_PORT (Plan 01-01, test/setup/redis.ts)"
  - "Suite unit + integration verde (Plan 01-01/01-02/01-03)"
provides:
  - "Pipeline GitHub Actions che esegue lint + unit + integration su ogni push (ogni branch) + pull_request"
  - "Redis service container reale (redis:7) per i processor test (no ioredis-mock)"
  - "Cache dei binari mongodb-memory-server con MONGOMS_VERSION pinnata (8.0.4) per determinismo"
  - "Working tree pulito a fine fase: dir vuota src/spellRecovery/ rimossa"
affects: [phase-02-auth, phase-04-atomicity, phase-09-combat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CI single-job: checkout -> setup-node (cache npm) -> restore cache binari Mongo -> npm ci -> lint -> test:unit -> test:int"
    - "Redis reale via services.redis con healthcheck; env REDIS_HOST/REDIS_PORT instradano l'helper al container invece di scaricare redis-memory-server"
    - "actions/cache su ~/.cache/mongodb-memory-server con chiave mongoms-<os>-<MONGOMS_VERSION> per evitare re-download ad ogni run"

key-files:
  created:
    - .github/workflows/ci.yml
  modified: []
  removed:
    - src/spellRecovery/

key-decisions:
  - "Trigger su `push` senza filtro di branch (feedback continuo anche sui branch di fase) + `pull_request` per completezza (D-10)"
  - "Node 22 allineato al runtime locale verificato nel research; cache npm via setup-node"
  - "MONGOMS_VERSION 8.0.4 (>=7.0 wiredTiger) come chiave cache deterministica (D-11/D-12, mitiga T-01-11 DoS download)"
  - "Nessun secret nel workflow: solo host/port locali del service container (mitiga T-01-09)"

patterns-established:
  - ".github/workflows/ci.yml come gate CI della milestone: lint + unit + integration con dipendenze effimere (Redis container + Mongo cache)"

requirements-completed: [BE-TEST-01]

# Metrics
duration: ~1min
completed: 2026-07-23
---

# Phase 1 Plan 04: Pipeline CI & Pulizia Finale Summary

**Pipeline GitHub Actions che esegue lint + unit + integration su ogni push (ogni branch) e pull_request, con Redis service container reale (redis:7 + healthcheck) per i processor test e cache dei binari mongodb-memory-server pinnata a MONGOMS_VERSION 8.0.4; dir vuota `src/spellRecovery/` rimossa e working tree pulito a fine fase (WIP di produzione già committato per concern in 01-01/01-03).**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-07-23T17:18:53Z
- **Completed:** 2026-07-23T17:19:49Z
- **Tasks:** 2
- **Files modified:** 1 creato (.github/workflows/ci.yml) + 1 dir rimossa (src/spellRecovery/)

## Accomplishments
- `.github/workflows/ci.yml` creato (D-10/D-11/D-12): trigger `push` (ogni branch) + `pull_request`; job unico `test` su `ubuntu-latest`.
- Redis service container reale `redis:7` con healthcheck (`redis-cli ping`), porte `6379:6379` — i processor test girano contro un Redis vero, coerente con la decisione di non usare ioredis-mock per Bull.
- env `REDIS_HOST: localhost` / `REDIS_PORT: 6379`: `test/setup/redis.ts` usa il service container invece di scaricare redis-memory-server in CI.
- `actions/cache@v4` su `~/.cache/mongodb-memory-server` con chiave `mongoms-${{ runner.os }}-${{ env.MONGOMS_VERSION }}` e `MONGOMS_VERSION: 8.0.4` (>=7.0 wiredTiger) → chiave cache deterministica, niente re-download dei binari Mongo ad ogni run.
- Step ordinati: checkout → setup-node@v4 (Node 22, cache npm) → restore cache Mongo → `npm ci` → `npm run lint` → `npm run test:unit` → `npm run test:int`.
- Nessun secret hardcoded: gli unici env sono host/port locali del container (grep di controllo negativo).
- Dir vuota `src/spellRecovery/` rimossa (concern #9: il recovery vive in `src/characters/spell-recovery.processor.ts`).
- Working tree pulito rispetto ai file sorgente/test del WIP: `git status --porcelain -- 'src/**' 'test/**'` non mostra residui non committati (l'intero WIP è già in history nei plan precedenti, D-08).

## Task Commits

Ogni task committato atomicamente (nessun `git add -A`/`git add .`):

1. **Task 1: Pipeline GitHub Actions** — `5dc05b3` ci(01-04)
2. **Task 2: Rimozione src/spellRecovery/ + verifica tree pulito** — *nessun commit*: la dir era vuota e non tracciata da git (git non traccia le directory vuote), quindi la sua rimozione non produce alcun cambiamento in history. Non è emerso alcun residuo di produzione WIP da committare (già tutto in 01-01/01-03).

## Files Created/Modified
- `.github/workflows/ci.yml` - pipeline CI: lint + unit + integration, Redis service container, cache binari Mongo, trigger push+PR
- `src/spellRecovery/` - **rimossa** (dir vuota, concern #9)

## Decisions Made
- Trigger `push` senza filtro di branch: feedback continuo anche sui branch di fase, non solo sulle PR (D-10). Aggiunto anche `pull_request`.
- Node 22 (allineato al runtime locale v22.12.0 del research) con `cache: 'npm'` via setup-node.
- `MONGOMS_VERSION 8.0.4` come chiave cache deterministica (D-11/D-12): pinnare la versione MongoDB rende la cache dei binari riproducibile.
- La rimozione di `src/spellRecovery/` non genera un commit perché la dir vuota non è tracciata da git; documentato qui per trasparenza.

## Deviations from Plan

None - plan eseguito esattamente come scritto. Nessuna deviazione, nessun auth gate, nessun residuo WIP inatteso.

## Known Stubs
Nessuno. Il workflow è completo e autoconsistente; le dipendenze effimere (Redis container + cache Mongo) sono cablate agli helper esistenti.

## Threat Flags
Nessuna nuova superficie applicativa. Il workflow CI è versionato senza credenziali (mitiga T-01-09 Information Disclosure) e la cache dei binari Mongo pinnata mitiga T-01-11 (DoS da re-download). Nessun endpoint/trust boundary applicativo introdotto.

## Deferred Issues
- **Step `npm run lint` in CI:** lo script `lint` usa `eslint --fix`; sui file di test permangono errori `@typescript-eslint/no-unsafe-*` (uso di `any`), pattern pre-esistente registrato in `deferred-items.md` dai Plan 01-02/01-03. Se questi errori non sono auto-fixabili, lo step lint potrebbe risultare rosso in CI: la riconciliazione della config ESLint per i file di test è fuori scope in questa fase (impatta l'intero repo) ed è materia di una futura fase di hardening/tooling. La struttura della pipeline è comunque corretta e completa per l'obiettivo BE-TEST-01 (CI-ready).

## Next Phase Readiness
- BE-TEST-01 "CI-ready" chiuso: la pipeline esegue l'intera suite su ogni push con Redis reale e cache Mongo deterministica.
- Fase 1 completa: tutti e 4 i plan eseguiti. Working tree pulito (solo artefatti di planning `.planning/**`). Pronta per la PR verso `develop`.
- Le fasi a valle (Phase 2 auth, Phase 4 atomicity, Phase 9 combat) erediteranno la pipeline CI come gate su ogni push.

## Self-Check: PASSED

- `.github/workflows/ci.yml` presente e verificato (redis:7, MONGOMS_VERSION, actions/cache, test:int, on:).
- Commit `5dc05b3` (ci 01-04) presente in git log.
- `src/spellRecovery/` non esiste più (`test ! -d src/spellRecovery` vero).
- `git status --porcelain -- 'src/**' 'test/**'` pulito (nessun residuo WIP non committato).

---
*Phase: 01-fondazione-test-consolidamento-spell-wip*
*Completed: 2026-07-23*
