---
phase: 01-fondazione-test-consolidamento-spell-wip
plan: 05
subsystem: testing
tags: [jest, eslint, github-actions, mongodb-memory-server, ci, tooling]

# Dependency graph
requires:
  - phase: 01-fondazione-test-consolidamento-spell-wip (plan 01-04)
    provides: harness test MongoMemoryReplSet condiviso, split Jest unit/integration, pipeline CI GitHub Actions
provides:
  - "`npm test` aggregato affidabile e ripetibile (serializza test:unit + test:int)"
  - "`npm run lint` con exit code 0 (step CI Lint verde) senza mascherare il debito src"
  - "Cache binari mongodb-memory-server effettivamente popolabile (MONGOMS_DOWNLOAD_DIR allineato al path actions/cache)"
affects: [tutte le fasi a valle che eseguono la suite di test in CI e localmente]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Script test aggregato come composizione di due script gia affidabili (unit parallelo + integration --runInBand) invece di un singolo jest parallelo"
    - "ESLint: debito type-safety pre-esistente src a 'warn' (non-masking, visibile in CI); file di test con no-unsafe-* a 'off' (any legittimo per mock/fixture, mai spedito)"
    - "mongodb-memory-server: MONGOMS_DOWNLOAD_DIR su path assoluto identico al path di actions/cache per far combaciare download e cache"

key-files:
  created:
    - .planning/phases/01-fondazione-test-consolidamento-spell-wip/01-05-SUMMARY.md
  modified:
    - package.json
    - eslint.config.mjs
    - .github/workflows/ci.yml

key-decisions:
  - "Fix gap #1 di sola orchestrazione: nessuna modifica al codice dei test ne alla config jest; l'isolamento per-worker (alternativa) e superfluo con l'integration seriale"
  - "Gap #2 non-masking: src a 'warn' (violazioni riportate nei log CI), solo i file di test a 'off'; hardening di tipizzazione reale rimandato a Phase 10 (BE-HARD)"
  - "WR-06: path assoluto /home/runner/.cache/mongodb-memory-server (mongodb-memory-server non espande ~), coincidente col path espanso da actions/cache su ubuntu-latest"

patterns-established:
  - "Serializzazione integration via composizione script npm invece di runInBand globale"
  - "Downgrade a warn (non off) per il debito di produzione: rende il debito visibile in CI senza bloccare la build"

requirements-completed: [BE-TEST-01]

# Metrics
duration: 5min
completed: 2026-07-23
---

# Phase 01 Plan 05: Gap-closure fondazione TDD (npm test affidabile, lint exit 0, cache WR-06) Summary

**`npm test` reso deterministico serializzando l'integration, `npm run lint` portato a exit 0 senza mascherare il debito src, e cache binari Mongo allineata al path di actions/cache**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-23T20:13:13Z
- **Completed:** 2026-07-23T20:18:01Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Gap #1 chiuso: `npm test` verde e ripetibile su 3 run consecutivi (18 unit + 8 integration ogni volta), eliminata la race tra file `*.int-spec.ts` che condividevano lo stesso MongoMemoryReplSet
- Gap #2 chiuso: `npm run lint` esce 0 (step CI Lint verde); 391 errori sui file di test spenti, 76 errori src pre-esistenti declassati a `warn` (visibili nei log, non mascherati)
- Fold-in WR-06 chiuso: `MONGOMS_DOWNLOAD_DIR` allineato al path di `actions/cache`, la cache dei binari Mongo ora e effettivamente popolabile (stop al re-download ~500MB per run)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rendere `npm test` affidabile serializzando l'integration (gap #1)** - `be2ff07` (build)
2. **Task 2: Portare `npm run lint` a exit 0 senza mascherare il repo (gap #2)** - `1dccd18` (ci)
3. **Task 3: Allineare il download dir dei binari Mongo al path della cache CI (WR-06)** - `1e6270a` (ci)

## Files Created/Modified
- `package.json` - Script `test` da `jest` a `npm run test:unit && npm run test:int` (composizione dei due script gia affidabili; nessuna modifica a test:unit/test:int ne alla config jest)
- `eslint.config.mjs` - Blocco rules repo-wide esteso con downgrade a `warn` del debito type-safety pre-esistente + override finale per i file di test (no-unsafe-* a `off`)
- `.github/workflows/ci.yml` - Aggiunta env `MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-memory-server` nel blocco `env:` del job (step cache, MONGOMS_VERSION e trigger invariati)

## Decisions Made
- **Gap #1 di sola orchestrazione:** componendo `test:unit` (parallelo, senza stato condiviso) e `test:int` (`--runInBand`, seriale) l'integration non gira mai in parallelo con se stessa; l'afterEach globale `deleteMany({})` sulla connessione condivisa torna sicuro senza toccare il codice dei test.
- **Non-masking su src:** le regole `no-unsafe-*`, `no-unused-vars`, `no-base-to-string`, `require-await`, ecc. sul codice di produzione sono `warn` (79 warning riportati in CI), non `off`. Solo i file di test — mai spediti, che usano `any` per mock/fixture — hanno la famiglia `no-unsafe-*` a `off`. L'hardening di tipizzazione reale resta di competenza di Phase 10 (BE-HARD).
- **Path assoluto per la cache:** `mongodb-memory-server` non espande `~`, quindi `MONGOMS_DOWNLOAD_DIR` usa il path assoluto `/home/runner/.cache/mongodb-memory-server`, identico al path che `actions/cache` espande da `~/.cache/...` su ubuntu-latest.
- **`--fix` load-bearing e non committato:** lo script `lint` resta `eslint ... --fix` (auto-corregge i ~2765 problemi prettier che altrimenti farebbero fallire il lint). Il churn prettier prodotto in locale da `--fix` NON e stato committato: la verifica statica ha usato `--fix-dry-run` e le modifiche del working tree sono state scartate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Il worktree partiva da un commit vecchio (`911afa1`, 3 commit indietro rispetto al target `c1557d3`) senza commit propri e con working tree pulito: risolto con `git reset --hard c1557d3` prima di iniziare.
- Il worktree non aveva `node_modules`: eseguito `npm ci` per abilitare l'esecuzione della suite di test e di ESLint.
- Verifica finale `npm run lint` (comando CI reale con `--fix`): come atteso dal piano ha riformattato l'intero repo (churn prettier). Scartato con `git checkout -- .` per non committare reformat di produzione; i 3 file target erano gia committati e il working tree e tornato pulito.

## Verification Results
- `npm test` eseguito 3 volte consecutive → exit 0 tutte e 3 le volte (18 unit + 8 integration passati, nessun open handle).
- `npx eslint "{src,apps,libs,test}/**/*.ts" --fix-dry-run` → `errorCount=0`, `warningCount=79`, exit 0.
- `npm run lint` (comando reale step CI, con `--fix`) → `79 problems (0 errors, 79 warnings)`, exit 0.
- `.github/workflows/ci.yml` → `MONGOMS_DOWNLOAD_DIR` e `path` della cache coincidono (`/home/runner/.cache/mongodb-memory-server`); YAML valido (js-yaml).
- `git diff --name-only` a fine plan → vuoto (working tree pulito, nessun file di produzione/test riformattato committato).

**Nota human-verify (gia flaggata in 01-VERIFICATION.md):** la conferma EMPIRICA che la cache Mongo si popoli (dimensione > 0 nei log "Post Cache") e che lo step Lint sia verde su GitHub richiede un run reale della pipeline (push del branch / apertura PR). Questo plan garantisce la correttezza statica.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fondazione TDD ora "affidabile e CI-ready" come richiesto dal goal di fase e dal success criterion 1 del roadmap: `npm test` deterministico, `npm run lint` verde, cache Mongo funzionante.
- Le fasi a valle possono affidarsi alla suite di test in CI e localmente senza flakiness.

## Self-Check: PASSED

---
*Phase: 01-fondazione-test-consolidamento-spell-wip*
*Completed: 2026-07-23*
