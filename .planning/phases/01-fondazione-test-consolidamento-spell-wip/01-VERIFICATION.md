---
phase: 01-fondazione-test-consolidamento-spell-wip
verified: 2026-07-23T22:28:17Z
status: human_needed
score: 7/7 must-haves verified (locally/staticamente); 1 elemento richiede conferma su runner GitHub reale
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "`npm test` (comando aggregato) è verde in modo affidabile"
    - "Pipeline GitHub Actions esegue lint + unit + integration su ogni push (BE-TEST-01 CI-ready) — `npm run lint` ora esce 0"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Push del branch `feat/01-fondazione-test-consolidamento-spell-wip` (o apertura PR verso `develop`) e osservazione dell'esecuzione reale di `.github/workflows/ci.yml` su runner GitHub-hosted"
    expected: "Tutti e tre gli step (Lint, Unit tests, Integration tests) risultano verdi; lo step 'Cache mongodb-memory-server binaries' mostra, nei log 'Post Cache' al secondo run consecutivo, una cache effettivamente popolata (> 0 byte), confermando l'allineamento MONGOMS_DOWNLOAD_DIR / path di actions/cache (WR-06)"
    why_human: "Il comportamento del service container Docker Redis, dell'ambiente ubuntu-latest e di actions/cache non è riproducibile da questo ambiente di verifica locale; è stato riprodotto localmente solo lo stesso comando (`npm run lint`, `npm test`) invocato dagli step, non l'esecuzione reale del workflow"
---

# Phase 01: Fondazione Test & Consolidamento Spell WIP Verification Report

**Phase Goal:** Esiste una fondazione TDD affidabile e il WIP spell nel working tree è consolidato, testato e committato — nulla a valle è testabile senza questo.
**Verified:** 2026-07-23T22:28:17Z
**Status:** human_needed
**Re-verification:** Yes — dopo gap-closure (Plan 01-05)

## Goal Achievement

Questa è una ri-verifica dopo la chiusura dei 2 gap identificati dalla verifica precedente (01-VERIFICATION.md, status `gaps_found`, score 4/6), effettuata dal Plan 01-05 (`gap_closure: true`). Entrambi i gap sono stati chiusi con evidenza empirica riprodotta in questa sessione (non solo sulla base del SUMMARY):

- **Gap #1** (`npm test` aggregato flaky): CHIUSO — `npm test` eseguito 3 volte consecutive in questa sessione → exit 0 tutte e 3 le volte (18 unit + 8 integration ogni run, nessuna suite fallita).
- **Gap #2** (`npm run lint` exit 1, 466 errori): CHIUSO — `npm run lint` (stesso comando dello step CI) eseguito in questa sessione → exit 0, `79 problems (0 errors, 79 warnings)`.
- **Fold-in WR-06** (cache binari Mongo mai popolata): CHIUSO staticamente — `MONGOMS_DOWNLOAD_DIR` e il `path` di `actions/cache` in `.github/workflows/ci.yml` ora coincidono (`/home/runner/.cache/mongodb-memory-server`); la conferma che la cache si popoli davvero richiede un run reale (vedi Human Verification).

Nessuna regressione rilevata sui 4 truth già VERIFIED nella verifica precedente (fixture, Bull DI-mock/Redis reale, ordine validazione useSpell, working tree pulito).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm test` avvia un `MongoMemoryReplSet` e un test che esercita una transazione Mongo e un change stream su Character passa, **ed è affidabile su tutto il comando aggregato** (non solo sul file bersaglio) | ✓ VERIFIED | `npm test` eseguito 3 volte consecutive in questa sessione: 3/3 run exit 0, `Test Suites: 3 passed` (unit) + `Test Suites: 4 passed` (integration, incluso `test/harness/replset.int-spec.ts` con `startTransaction`/`commitTransaction`/`abortTransaction` + `.watch(`), nessuna suite fallita/intermittente su 3 run |
| 2 | Un unit test risolve un service con la coda Bull mockata al confine DI (`getQueueToken`), mentre un test di integrazione del processor gira contro un Redis effimero reale (no `ioredis-mock`) | ✓ VERIFIED (regressione) | `characters.service.spec.ts:61` usa `provide: getQueueToken('spell-recovery')`; `spell-recovery.processor.int-spec.ts` importa `startRedis` da `test/setup/redis.ts` (`RedisMemoryServer`); `ioredis-mock` assente da `package.json` |
| 3 | Fixture/factory costruiscono istanze valide di User, Character, Quest, Spell, Road, POI riusate in almeno due spec file | ✓ VERIFIED (regressione) | 6 file `test/fixtures/{character,poi,quest,road,spell,user}.fixture.ts` presenti, invariati |
| 4 | `useSpell` verifica l'esistenza della spell prima di decrementare gli usages e il processor spell-recovery è coperto da test | ✓ VERIFIED (regressione) | `characters.service.ts:297` (`spellModel.findById`) precede riga 302 (`activeSpell.usages -= 1`); processor coperto da `spell-recovery.processor.int-spec.ts`, verde in `test:int` |
| 5 | Il working tree è pulito a fine fase: WIP spell use/recovery committato, dir vuota `src/spellRecovery/` rimossa | ✓ VERIFIED (regressione) | `test -d src/spellRecovery` → assente; `git status --porcelain` pulito eccetto i file di workflow planning (`.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/config.json`), gestiti dal processo GSD e fuori dal criterio |
| 6 | Pipeline GitHub Actions esegue lint + unit + integration su ogni push, `npm run lint` esce 0 (BE-TEST-01 "CI-ready") | ✓ VERIFIED (staticamente/localmente) | `npm run lint` eseguito in questa sessione con lo stesso comando dello step CI → exit 0, `79 problems (0 errors, 79 warnings)` (0 error confermato anche via `--fix-dry-run -f json`: `errorCount=0`). `.github/workflows/ci.yml` invoca esattamente `npm run lint` / `npm run test:unit` / `npm run test:int`. **Non verificabile**: esecuzione reale su runner GitHub-hosted (Docker, actions/cache) — vedi Human Verification |
| 7 | I binari mongodb-memory-server vengono scaricati nella directory effettivamente messa in cache (fold-in WR-06) | ✓ VERIFIED (allineamento statico) | `.github/workflows/ci.yml`: `MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-memory-server` (env) e `path: ~/.cache/mongodb-memory-server` (step cache) → stesso path assoluto su `ubuntu-latest`. **Non verificabile**: che la cache si popoli davvero (dimensione > 0 nei log "Post Cache") richiede un run reale — vedi Human Verification |

**Score:** 7/7 truth verificati (localmente/staticamente); 1 elemento (esecuzione reale del workflow su GitHub Actions) resta di competenza umana

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` (script `test`) | Compone `test:unit && test:int` (serializza l'integration) | ✓ VERIFIED | `"test": "npm run test:unit && npm run test:int"` (riga 16); `test:unit`/`test:int` invariati |
| `eslint.config.mjs` | Downgrade a `warn` del debito src pre-esistente + override `off` per i file di test | ✓ VERIFIED | Blocco `rules` repo-wide con 13 regole a `warn`; blocco finale `files: ['**/*.spec.ts', '**/*.int-spec.ts', 'test/**/*.ts']` con 6 regole `no-unsafe-*` a `off` |
| `.github/workflows/ci.yml` | `MONGOMS_DOWNLOAD_DIR` allineato al path di `actions/cache` | ✓ VERIFIED | Env `MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-memory-server` + step cache `path: ~/.cache/mongodb-memory-server` → stesso path espanso |
| Tutti gli artifact della verifica precedente (harness setup, fixture, processor, DTO, ci.yml struttura) | — | ✓ VERIFIED (regressione, invariati) | Nessuna modifica rilevata rispetto alla verifica precedente su questi file |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `package.json` (script `test`) | `package.json` (script `test:unit` + `test:int`) | composizione `&&` | ✓ WIRED | Verificato eseguendo `npm test` 3 volte: entrambi gli script vengono invocati in sequenza, entrambi verdi |
| `.github/workflows/ci.yml` (step Lint) | `eslint.config.mjs` | `npm run lint` (eslint --fix) | ✓ WIRED | `npm run lint` eseguito con lo stesso comando dello step → exit 0, 0 error |
| `.github/workflows/ci.yml` (`actions/cache` path) | `.github/workflows/ci.yml` (env `MONGOMS_DOWNLOAD_DIR`) | path cache == download dir | ✓ WIRED | Entrambi risolvono a `/home/runner/.cache/mongodb-memory-server` su `ubuntu-latest` |
| (invariati dalla verifica precedente) `characters.service.ts` → `spellModel.findById`, `spell-recovery.processor.ts` → `characterModel.save`, `ci.yml` → `redis.ts` | — | — | ✓ WIRED (regressione) | Nessuna modifica rilevata |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` affidabile su ≥3 run consecutivi | `npm test` (×3) | Run 1: 3 suite unit + 4 suite integration, 18+8 test verdi; Run 2: idem; Run 3: idem — nessuna variazione, nessuna suite fallita | ✓ PASS |
| `npm run lint` (comando reale step CI) esce 0 | `npm run lint` | `79 problems (0 errors, 79 warnings)`, exit 0 | ✓ PASS |
| Conteggio error ESLint (statico, senza scrivere su disco) | `npx eslint "{src,apps,libs,test}/**/*.ts" --fix-dry-run -f json` | `errorCount=0`, `warningCount=79` | ✓ PASS |
| Diff prodotto da `npm run lint --fix` è solo formattazione (nessuna modifica semantica) | `git diff src/characters/characters.service.ts` dopo il run reale di lint | Solo re-wrapping prettier (import multi-riga, ecc.), nessuna modifica di logica; modifiche scartate via `git stash`/`drop` per non sporcare il working tree di verifica | ✓ PASS |
| Allineamento cache Mongo (WR-06) | `grep MONGOMS_DOWNLOAD_DIR / path` in `ci.yml` | Entrambi `/home/runner/.cache/mongodb-memory-server` (dopo espansione `~`) | ✓ PASS (statico) |
| Ordine di validazione `useSpell` (regressione) | `grep -n "findById\|usages -= 1"` | Riga 297 precede riga 302 | ✓ PASS |
| `src/spellRecovery/` rimossa (regressione) | `test -d src/spellRecovery` | Assente | ✓ PASS |

Nota: dopo l'esecuzione di `npm run lint` (che usa `--fix` e riformatta l'intero repo con prettier, come già osservato in 01-05-SUMMARY.md), le modifiche di sola formattazione sono state scartate (`git stash` + `git stash drop`) per riportare il working tree allo stato pre-verifica, coerente col vincolo del piano "nessun reformat committato".

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BE-TEST-01 | 01-01, 01-03, 01-04, 01-05 | Suite Jest contro `mongodb-memory-server` in modalità replica set, setup/teardown condiviso, CI-ready | ✓ SATISFIED | Modalità replica-set + change stream + transazioni: VERIFIED (invariato). "CI-ready": ora VERIFIED localmente/staticamente (lint exit 0, `npm test` affidabile, cache allineata); conferma su runner reale resta human-verify |
| BE-TEST-02 | 01-01, 01-03 | Unit Bull DI-mock (`getQueueToken`) + integration processor Redis reale (no `ioredis-mock`) | ✓ SATISFIED | Regressione confermata |
| BE-TEST-03 | 01-02 | Fixture/factory riusabili per i 6 modelli di dominio | ✓ SATISFIED | Regressione confermata |
| BE-TEST-04 | 01-03 | WIP spell use/recovery consolidato con TDD, ordine validazione corretto, processor coperto da test | ✓ SATISFIED | Regressione confermata |

Nessun requirement orfano: i 4 ID mappati a Phase 1 in REQUIREMENTS.md (BE-TEST-01..04) corrispondono esattamente ai requirement dichiarati nei frontmatter dei 5 plan della fase (incluso 01-05, `requirements: [BE-TEST-01]`).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `test/setup/after-env.ts` | 10-15 | `afterEach` fa ancora `deleteMany({})` su tutte le collection della connessione condivisa, senza isolamento per file/worker | ℹ️ Info (mitigato) | Non più causa di fallimento: la serializzazione di `test:int` (`--runInBand`) e la composizione `test:unit && test:int` nello script `test` garantiscono che nessun file di integration giri mai in parallelo con un altro. Rimane un vincolo implicito da rispettare per futuri file `*.int-spec.ts` (non aggiungere parallelismo all'integration senza rivedere questo file) |
| `eslint.config.mjs` | 27-46 | 76 errori src pre-esistenti declassati a `warn` (non `off`) | ℹ️ Info | Comportamento intenzionale e documentato (non-masking): il debito resta visibile nei log CI, l'hardening reale è assegnato a Phase 10 (BE-HARD) — coerente con CLAUDE.md ("Rules relaxed for flexibility") |

Nessun placeholder/TODO/stub bloccante trovato nei file modificati da 01-05 (`package.json`, `eslint.config.mjs`, `.github/workflows/ci.yml`). Nessuna regressione sui file di produzione/test rispetto alla verifica precedente.

## Human Verification Required

### 1. Esecuzione reale della pipeline GitHub Actions

**Test:** Fare push del branch `feat/01-fondazione-test-consolidamento-spell-wip` (o aprire la PR verso `develop`) e osservare l'esecuzione effettiva di `.github/workflows/ci.yml` su un runner GitHub-hosted reale.
**Expected:** Tutti e tre gli step (Lint, Unit tests, Integration tests) risultano verdi (coerente con la riproduzione locale degli stessi comandi in questa verifica). Al secondo run consecutivo, i log dello step "Cache mongodb-memory-server binaries" dovrebbero mostrare una cache effettivamente popolata (non ~0 byte), confermando l'allineamento `MONGOMS_DOWNLOAD_DIR` / path di `actions/cache` (WR-06).
**Why human:** Il comportamento del service container Docker Redis, dell'ambiente `ubuntu-latest` e di `actions/cache` (espansione `~`, popolamento reale della cache) non è riproducibile da questo ambiente di verifica locale. Questa verifica ha riprodotto localmente gli stessi comandi (`npm test`, `npm run lint`) invocati dagli step del workflow, con esito verde, ma non l'esecuzione del workflow stesso.

## Gaps Summary

Nessun gap residuo bloccante. I 2 gap della verifica precedente sono stati chiusi con evidenza empirica riprodotta in questa sessione:

1. `npm test` è ora affidabile e ripetibile (3/3 run consecutivi verdi in questa verifica, non solo dichiarato nel SUMMARY).
2. `npm run lint` esce 0 (verificato con lo stesso comando invocato da `.github/workflows/ci.yml`), senza mascherare il debito di produzione (declassato a `warn`, non `off`).

Resta un solo elemento non verificabile da ambiente locale: la conferma che la pipeline GitHub Actions sia effettivamente verde su un runner reale e che la cache dei binari Mongo si popoli davvero (WR-06). Questo era già stato flaggato come item di verifica umana nella verifica precedente e non costituisce una regressione né un gap di implementazione — è un limite intrinseco della verifica locale rispetto a infrastruttura CI esterna. Lo stato della fase è quindi `human_needed`, non `gaps_found`: tutti i must-have osservabili localmente sono VERIFIED.

---

*Verified: 2026-07-23T22:28:17Z*
*Verifier: Claude (gsd-verifier)*
