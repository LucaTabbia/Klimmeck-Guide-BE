---
phase: 01-fondazione-test-consolidamento-spell-wip
verified: 2026-07-23T20:15:00Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "`npm test` (comando aggregato, script `\"test\": \"jest\"`) è verde in modo affidabile"
    status: partial
    reason: "Il test bersaglio del criterio (test/harness/replset.int-spec.ts, transazione + change stream) passa in modo consistente (6/6 run). Ma il comando `npm test` nel suo insieme NON è affidabile: eseguendolo ripetutamente (6 run), src/characters/spell-recovery.processor.int-spec.ts fallisce deterministicamente in 6/6 run, e test/harness/character-changestream.int-spec.ts / test/fixtures/fixtures.int-spec.ts falliscono in modo intermittente. Causa: lo script \"test\": \"jest\" esegue i progetti unit+integration con la parallelizzazione di default di Jest (nessun --runInBand), mentre tutti i file *.int-spec.ts condividono lo STESSO MongoMemoryReplSet (avviato una sola volta via globalSetup) e ogni file registra un afterEach globale (test/setup/after-env.ts) che fa `deleteMany({})` su TUTTE le collection della connessione condivisa. Quando due file di integration girano in worker paralleli, l'afterEach di un file cancella a metà esecuzione i documenti che un altro file sta ancora asserendo, producendo `TypeError: Cannot read properties of null` o assert falliti. `npm run test:unit` + `npm run test:int` (che usa --runInBand) restano affidabili (verificato 2 run consecutive, 18/18 + 8/8 verdi)."
    artifacts:
      - path: "package.json"
        issue: "Script \"test\": \"jest\" non serializza il progetto integration (nessun --runInBand/maxWorkers), a differenza di \"test:int\""
      - path: "test/setup/after-env.ts"
        issue: "afterEach fa deleteMany({}) su TUTTE le collection della connessione condivisa — sicuro solo se i file *.int-spec.ts non girano mai in parallelo tra loro"
    missing:
      - "Serializzare l'esecuzione dei file *.int-spec.ts anche nello script aggregato `test` (es. impostare maxWorkers:1 / runInBand sul progetto \"integration\" dentro jest.projects, non solo nello script test:int), oppure isolare i dati per worker/file (namespace di collection o DB per worker)"
  - truth: "Esiste una pipeline GitHub Actions che esegue lint + unit + integration su ogni push (BE-TEST-01 \"CI-ready\"; must-have esplicito di 01-04-PLAN.md)"
    status: failed
    reason: "`npm run lint` (eseguito localmente, stesso comando invocato dallo step 'Lint' di .github/workflows/ci.yml) fallisce deterministicamente: exit code 1, 471 problemi (466 error, 5 warning), quasi tutti @typescript-eslint/no-unsafe-* su codice `any` nei file di test (test/harness/*.ts, test/setup/*.ts, test/fixtures/*.ts, *.spec.ts, *.int-spec.ts) più errori pre-esistenti in numerosi resolver/model non toccati da questa fase. Il flag --fix non risolve questi errori (sono di tipo unsafe-call/unsafe-member-access, non auto-fixabili). Di conseguenza la pipeline CI creata in 01-04, così com'è, sarebbe rossa allo step 'Lint' su OGNI push, PRIMA di raggiungere gli step unit/integration — contraddicendo l'obiettivo dichiarato 'CI-ready' di BE-TEST-01 e il success criterion del Plan 04 ('.github/workflows/ci.yml esegue lint + unit + integration'). Il problema era già stato notato come rischio in 01-04-SUMMARY.md (\"Deferred Issues\") ma non era stato verificato empiricamente che lint fallisse davvero; qui è confermato con evidenza riproducibile."
    artifacts:
      - path: ".github/workflows/ci.yml"
        issue: "Step 'Lint' (npm run lint) fallirebbe con exit code 1 su ogni run reale della pipeline"
      - path: "eslint.config.mjs"
        issue: "Nessuna eccezione/override delle regole @typescript-eslint/no-unsafe-* per i file di test (*.spec.ts, *.int-spec.ts) creati in questa fase"
    missing:
      - "Rilassare (override) le regole @typescript-eslint/no-unsafe-* per i file di test in eslint.config.mjs, oppure risolvere gli errori nei file introdotti da questa fase, prima di considerare la pipeline CI effettivamente verde/CI-ready"
      - "In alternativa: rimuovere/rendere non-bloccante lo step lint fino a una fase dedicata di hardening ESLint, documentando esplicitamente la deroga"
---

# Phase 01: Fondazione Test & Consolidamento Spell WIP Verification Report

**Phase Goal:** Esiste una fondazione TDD affidabile e il WIP spell nel working tree è consolidato, testato e committato — nulla a valle è testabile senza questo.
**Verified:** 2026-07-23T20:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm test` avvia un `MongoMemoryReplSet` e un test che esercita una transazione Mongo e un change stream su Character passa (prova la modalità replica set) | ⚠️ PARTIAL | Il test bersaglio (`test/harness/replset.int-spec.ts`: `startTransaction`/`commitTransaction`/`abortTransaction` + `.watch(...)`) passa in 6/6 run di `npm test`. Ma il comando aggregato `npm test` nel suo complesso NON è affidabile: altri file `*.int-spec.ts` falliscono per race condition su collection condivise (vedi gap #1) |
| 2 | Un unit test risolve un service con la coda Bull mockata al confine DI (`getQueueToken`, nessun Redis), mentre un test di integrazione del processor gira contro un Redis effimero reale (no `ioredis-mock`) | ✓ VERIFIED | `src/characters/characters.service.spec.ts` usa `getQueueToken('spell-recovery')`/`getModelToken` (nessun Redis, nessun `.watch`/`app.init()`); `src/characters/spell-recovery.processor.int-spec.ts` usa `startRedis()` (`redis-memory-server`) + `BullModule.forRoot({redis})`; `ioredis-mock` assente da `package.json`. `npm run test:unit` 18/18 verde, `npm run test:int` 8/8 verde |
| 3 | Fixture/factory costruiscono istanze valide di User, Character, Quest, Spell, Road, POI riusate in almeno due spec file | ✓ VERIFIED | 6 file `test/fixtures/{spell,user,road,poi,character,quest}.fixture.ts` con `buildX`/`persistX`, re-esportati da `test/fixtures/index.ts`. Riusate in ≥2 spec: `fixtures.spec.ts`, `fixtures.int-spec.ts`, `characters.service.spec.ts`, `spell-recovery.processor.int-spec.ts`, `character-changestream.int-spec.ts` |
| 4 | `useSpell` verifica l'esistenza della spell prima di decrementare gli usages (test RED prova il vecchio ordine, GREEN dopo il fix) e il processor spell-recovery è coperto da test | ✓ VERIFIED | Codice: `spellModel.findById` (riga 297) precede `activeSpell.usages -= 1` (riga 302) in `characters.service.ts`. Storia commit: `c301a58` test(RED) → `4816229` fix (diff 3+/3-, verificato via `git show`) → GREEN. Processor coperto da `spell-recovery.processor.int-spec.ts` (Redis reale, usages 2→3), verde in `test:int` |
| 5 | Il working tree è pulito a fine fase: WIP spell use/recovery committato sul branch, dir vuota `src/spellRecovery/` rimossa | ✓ VERIFIED | `git status --porcelain` pulito eccetto `.planning/config.json` (gestito dal workflow, escluso dal criterio come da istruzioni). `src/spellRecovery/` non esiste (`test -d` → false) |
| 6 | (Plan 01-04 must-have / BE-TEST-01 "CI-ready") Pipeline GitHub Actions esegue lint + unit + integration su ogni push | ✗ FAILED | `.github/workflows/ci.yml` esiste con struttura corretta (redis:7, MONGOMS_VERSION, actions/cache, step lint/test:unit/test:int) ma lo step "Lint" (`npm run lint`) fallisce deterministicamente: exit code 1, 466 errori ESLint. La pipeline sarebbe rossa su ogni push reale (vedi gap #2) |

**Score:** 4/6 truths verified (2 partial/failed — vedi Gaps Summary)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/setup/mongo-replset.ts` | start/stop MongoMemoryReplSet condiviso | ✓ VERIFIED | `MongoMemoryReplSet.create({ replSet: { count: 1 } })` presente |
| `test/setup/global-setup.ts` | globalSetup Jest | ✓ VERIFIED | esporta default, chiama `startReplSet` |
| `test/setup/global-teardown.ts` | globalTeardown Jest | ✓ VERIFIED | ferma replSet + disconnette mongoose |
| `test/setup/after-env.ts` | connessione + cleanup tra test | ✓ VERIFIED | `deleteMany({})` in `afterEach` (nota: causa gap #1 se eseguito in parallelo tra file) |
| `test/setup/redis.ts` | helper Redis effimero | ✓ VERIFIED | `RedisMemoryServer`, legge `REDIS_HOST`/`REDIS_PORT` |
| `test/harness/replset.int-spec.ts` | prova transazione + change stream | ✓ VERIFIED | `startTransaction`, `commitTransaction`, `abortTransaction`, `.watch(` presenti; verde in isolamento e in `test:int` |
| `src/characters/spell-recovery.processor.ts` | processor Bull spell-recovery | ✓ VERIFIED | esiste, wired al modulo, coperto da integration test |
| `src/models/request/use-spell-request.model.ts` | DTO UseSpellRequest | ✓ VERIFIED | esiste, usato da `useSpell` e dai test |
| `test/fixtures/{spell,user,road,poi,character,quest}.fixture.ts` + `index.ts` | fixture two-tier 6 modelli | ✓ VERIFIED | tutti presenti, `buildX`/`persistX` esportati, `index.ts` re-esporta tutti e 6 |
| `src/characters/characters.service.spec.ts` | unit spec Bull DI-mock + RED/GREEN | ✓ VERIFIED | `getQueueToken`, assert su `usages` invariato + `NotFoundException` + `queue.add` non chiamato |
| `src/characters/spell-recovery.processor.int-spec.ts` | integration processor Redis reale | ✓ VERIFIED | `startRedis`, nessun `ioredis-mock`, asserisce incremento 2→3 |
| `test/harness/character-changestream.int-spec.ts` | change stream Character → PUB_SUB | ✓ VERIFIED | `.watch(` su Character + asserzione su evento `characterUpdated` |
| `.github/workflows/ci.yml` | pipeline lint+unit+integration, Redis container, cache Mongo | ⚠️ ESISTE MA NON VERDE | contiene tutti gli elementi richiesti strutturalmente, ma lo step lint fallisce deterministicamente (vedi gap #2); inoltre code review WR-06 segnala che il path di cache `~/.cache/mongodb-memory-server` probabilmente non corrisponde al path di download effettivo (`node_modules/.cache/...`), quindi la cache binari Mongo è probabilmente sempre vuota (non verificabile senza un run reale su GitHub Actions) |
| `src/spellRecovery/` (rimozione) | dir vuota rimossa | ✓ VERIFIED | directory non esiste più |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| commit feat (characters.service.ts as-is) | fix in 01-03 (riordino validazione) | baseline committato prima del fix | ✓ WIRED | `git show --stat 4816229` → 1 file, 3+/3-; baseline in `feb90dc` (01-01) intatta |
| package.json (jest.projects) | test/setup/global-setup.ts | globalSetup del progetto integration | ✓ WIRED | confermato in `package.json` `jest.projects[1].globalSetup` |
| test/setup/global-setup.ts | test/setup/mongo-replset.ts | `startReplSet()` | ✓ WIRED | import e chiamata confermati |
| characters.service.ts (useSpell) | spellModel.findById | validazione esistenza spell PRIMA del decremento | ✓ WIRED | ordine di riga confermato (297 prima di 302) |
| spell-recovery.processor.ts | characterModel.save | handleSpellRecovery incrementa usages | ✓ WIRED | confermato da integration test verde (2→3) |
| .github/workflows/ci.yml | package.json scripts (test:unit, test:int, lint) | step di esecuzione della suite | ✓ WIRED (strutturalmente) | gli step invocano gli script corretti — ma lo step lint fallisce a runtime (vedi gap #2), quindi il link è presente ma il risultato a valle è rosso |
| .github/workflows/ci.yml (services.redis) | test/setup/redis.ts | REDIS_HOST/REDIS_PORT | ✓ WIRED | env impostati nel workflow, letti da `startRedis()` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit suite verde, nessun replSet/Redis | `npm run test:unit` | 3 suite, 18/18 test verdi, ~1.1s | ✓ PASS |
| Integration suite verde (serializzata) | `npm run test:int` | 4 suite, 8/8 test verdi, nessun open handle | ✓ PASS (verificato 2 run consecutive) |
| Comando `npm test` aggregato affidabile | `npm test` (×6 run) | 1° run: 1 suite fallita; 2° run: 2 suite fallite; 3° run: 3 suite fallite (crescente); pattern riproducibile anche isolando solo il progetto integration senza `--runInBand` | ✗ FAIL (vedi gap #1) |
| Ordine di validazione `useSpell` (findById prima del decremento) | `grep -n "findById\|usages -= 1" src/characters/characters.service.ts` | riga 297 (`findById`) precede riga 302 (`usages -= 1`) | ✓ PASS |
| Diff del commit fix limitato al riordino | `git show --stat 4816229` | 1 file, 3 insertion(+), 3 deletion(-) | ✓ PASS |
| `src/spellRecovery/` rimossa | `test -d src/spellRecovery` | directory assente | ✓ PASS |
| Lint (stesso comando dello step CI) | `npm run lint` | exit code 1, 471 problemi (466 error, 5 warning) | ✗ FAIL (vedi gap #2) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BE-TEST-01 | 01-01, 01-03, 01-04 | Suite Jest contro `mongodb-memory-server` in modalità replica set, setup/teardown condiviso, CI-ready | ⚠️ PARTIAL | Modalità replica-set + change stream + transazioni: VERIFIED. "CI-ready": FAILED (lint step rosso deterministicamente, `npm test` aggregato non affidabile) |
| BE-TEST-02 | 01-01, 01-03 | Unit Bull DI-mock (getQueueToken) + integration processor Redis reale (no ioredis-mock) | ✓ SATISFIED | Confermato in `characters.service.spec.ts` e `spell-recovery.processor.int-spec.ts` |
| BE-TEST-03 | 01-02 | Fixture/factory riusabili per i 6 modelli di dominio | ✓ SATISFIED | 6 fixture two-tier, riusate in ≥5 spec file |
| BE-TEST-04 | 01-03 | WIP spell use/recovery consolidato con TDD, ordine validazione corretto, processor coperto da test | ✓ SATISFIED | Fix RED→GREEN verificato nel codice e nella history commit; processor coperto |

Nessun requirement orfano: i 4 ID mappati a Phase 1 in REQUIREMENTS.md corrispondono esattamente ai 4 requirement dichiarati nei frontmatter dei 4 plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `test/setup/after-env.ts` | 10-15 | `afterEach` fa `deleteMany({})` su tutte le collection della connessione condivisa senza isolamento per file/worker | ⚠️ Warning | Causa la race condition che rompe `npm test` aggregato (gap #1) quando più file `*.int-spec.ts` girano in parallelo |
| `package.json` | script `"test"` | Nessun `--runInBand`/`maxWorkers` sul progetto integration nello script aggregato, a differenza di `test:int` | ⚠️ Warning | `npm test` eredita il default di parallelismo di Jest, innescando il gap #1 |
| `eslint.config.mjs` / file di test della fase | — | 466 errori `@typescript-eslint/no-unsafe-*` (in parte pre-esistenti, in parte nei nuovi file di test di questa fase) | 🛑 Blocker (per lo step CI lint) | `npm run lint` fallisce con exit code 1 → pipeline CI rossa su ogni push (gap #2) |
| `.github/workflows/ci.yml` | 36-40 | Cache path `~/.cache/mongodb-memory-server` probabilmente non corrisponde al path di download reale (`node_modules/.cache/...`), segnalato indipendentemente da 01-REVIEW.md (WR-06) | ℹ️ Info | Cache dei binari Mongo probabilmente sempre vuota in CI (re-download ~500MB ad ogni run) — non blocca la correttezza funzionale ma vanifica l'obiettivo di caching dichiarato |

Nessun placeholder/TODO/stub bloccante trovato nel codice di produzione o nei file fixture/harness (`grep` su TODO/FIXME/PLACEHOLDER: nessun match nei file chiave della fase).

## Human Verification Required

### 1. Esecuzione reale della pipeline GitHub Actions

**Test:** Fare push del branch `feat/01-fondazione-test-consolidamento-spell-wip` (o aprire la PR verso `develop`) e osservare l'esecuzione effettiva di `.github/workflows/ci.yml` su un runner GitHub-hosted reale.
**Expected:** Al momento è atteso che lo step "Lint" fallisca (gap #2, verificato localmente con lo stesso comando). Dopo la correzione, l'intera pipeline (lint + unit + integration) dovrebbe risultare verde, e i log dello step "Cache mongodb-memory-server binaries" dovrebbero mostrare una cache effettivamente popolata (non ~0 byte) per confermare/smentire WR-06.
**Why human:** Non è possibile eseguire un runner GitHub Actions reale (service container Docker, ambiente Ubuntu, comportamento di `actions/cache`) da questo ambiente di verifica locale.

## Gaps Summary

Due gap concreti, entrambi riproducibili con evidenza empirica diretta (non ipotetici):

1. **`npm test` aggregato non affidabile** — il comando esplicitamente nominato dal success criterion 1 del roadmap fallisce in modo riproducibile (osservato in 6/6 run, con un numero crescente di suite fallite) a causa di una race condition tra i file `*.int-spec.ts`, che condividono lo stesso `MongoMemoryReplSet` ma non sono isolati tra loro (ogni file cancella indiscriminatamente TUTTE le collection nel proprio `afterEach`). Gli script dedicati `test:unit`/`test:int` (quest'ultimo con `--runInBand`) restano affidabili e sono quelli effettivamente usati dalla pipeline CI — quindi CI non è esposta a questo problema, ma un qualsiasi sviluppatore che lanci il comando "naturale" `npm test` in locale ottiene fallimenti spuri non correlati a regressioni reali, il che mina la fiducia nella fondazione TDD ("affidabile" è l'aggettivo esplicito del goal di fase).

2. **Pipeline CI non verde per lo step lint** — `npm run lint` (lo stesso comando invocato da `.github/workflows/ci.yml`) fallisce deterministicamente con 466 errori ESLint. Questo era stato segnalato come rischio nel Deferred Issues di 01-04-SUMMARY.md ma non era stato verificato empiricamente; qui è confermato che la pipeline sarebbe rossa su OGNI push, il che contraddice l'obiettivo "CI-ready" di BE-TEST-01.

Entrambi i gap sono stati esplicitamente anticipati/riconosciuti a livello di SUMMARY come rischio potenziale ma non erano stati chiusi né accompagnati da un override formale. Se lo sviluppatore ritiene che questi limiti siano accettabili come debito tecnico intenzionale (parte pre-esistente all'intera codebase, non introdotta da questa fase), può accettarli tramite override nel frontmatter di questo file:

```yaml
overrides:
  - must_have: "Pipeline GitHub Actions esegue lint + unit + integration su ogni push (BE-TEST-01 CI-ready)"
    reason: "Debito ESLint pre-esistente su gran parte del repo (466 errori, in parte nei file di test di questa fase); riconciliazione della config ESLint per i test è pianificata come fase di hardening dedicata, non blocca il consolidamento del WIP spell né la fondazione TDD sostanziale"
    accepted_by: "<nome>"
    accepted_at: "<timestamp ISO>"
  - must_have: "npm test (comando aggregato) è verde in modo affidabile"
    reason: "CI usa test:unit + test:int (--runInBand), non npm test aggregato; la race condition è nota e limitata al comando aggregato in locale"
    accepted_by: "<nome>"
    accepted_at: "<timestamp ISO>"
```

In alternativa, entrambi i gap sono risolvibili con interventi mirati e di piccola entità (serializzare l'integration project nello script `test`; rilassare le regole ESLint `no-unsafe-*` per i file di test) prima di chiudere la fase.

---

*Verified: 2026-07-23T20:15:00Z*
*Verifier: Claude (gsd-verifier)*
