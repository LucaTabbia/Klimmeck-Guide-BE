---
phase: 15-imboscate-in-viaggio
plan: 11
subsystem: gate della fase (tsc, test:cov, boot reale, SDL, lint, invarianti)
tags: [gate, coverage, schema, BE-AMBUSH-01, BE-AMBUSH-02, BE-AMBUSH-03, BE-AMBUSH-04, BE-AMBUSH-05, BE-AMBUSH-06, BE-AMBUSH-07, D-06, D-08, D-14, D-15, D-23, D-25]
requires: [15-10]
provides:
  - "fase verde e misurata: test:cov 360 suite / 4493 test, `./src/travel/` 98.62/84.53/99.42 dopo i 3 casi nuovi"
  - "tre casi nuovi in src/travel/ambush/ambush-resolution.int-spec.ts (proprietario assente, POI senza città, sconfitta senza città raggiungibile)"
  - "15-VALIDATION.md firmata (status complete, nyquist_compliant true, wave_0_complete true)"
affects: [15-12]
tech-stack:
  added: []
  patterns:
    - "coverage per cartella: `npx jest src/travel --coverage --selectProjects unit integration --runInBand --collectCoverageFrom='src/travel/**/*.ts' --collectCoverageFrom='!src/travel/**/*.spec.ts' --collectCoverageFrom='!src/travel/**/*.int-spec.ts'` (esce 1 solo per i «Coverage data … not found» delle altre soglie)"
key-files:
  created:
    - .planning/phases/15-imboscate-in-viaggio/15-11-SUMMARY.md
  modified:
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - .planning/phases/15-imboscate-in-viaggio/15-VALIDATION.md
key-decisions:
  - "Soglia di `./src/travel/` rossa al primo test:cov (96.9/82.37/97.6): riportata sopra soglia con test sui rami di produzione mai esercitati di `AmbushResolutionService`, soglie mai toccate"
  - "Nessun secondo test:cov completo: la correzione aggiunge solo una int-spec sotto src/travel, le altre soglie erano già verdi nella run completa; `./src/travel/` misurata per cartella"
duration: ~35 min
completed: 2026-11-06
---

# Phase 15 Plan 11: gate della fase — Summary

Gate della BE Phase 15. Al primo `npm run test:cov` tutte le 360 suite (4493 test) erano verdi, ma la soglia di `./src/travel/` era rossa: 96.9 % statements, 82.37 % branches, 97.6 % lines. Con tre casi di integrazione nuovi su `AmbushResolutionService` la cartella sale a 98.62/84.53/99.42. Boot reale verde. Lo SDL ha la sola riga tolta dichiarata e le 17 righe aggiunte attese. Lint mirato pulito; tutti gli invarianti rispettati; VALIDATION firmata.

## Task 1 — suite, boot reale, invarianti

### 1. Type check e suite
- `npx tsc --noEmit -p tsconfig.json`: exit 0 (all'inizio e dopo il commit dei test).
- `npm run test:cov` in foreground con timeout 600000: dopo 180 s lo strumento lo ha spostato in background; ho atteso la notifica senza rilanciarlo. Esito: **Test Suites 360 passed / 360, Tests 4493 passed / 4493, 571.5 s, exit 1** per le soglie:
  - `Jest: "./src/travel/" coverage threshold for statements (97%) not met: 96.9%`
  - `... branches (84%) not met: 82.37%`
  - `... lines (98%) not met: 97.6%`
  - nessun'altra soglia violata.
- Coverage letta da `coverage/coverage-summary.json` (aggregata con `node -e`):
  - prima: `src/travel/` 96.90 % (1127/1163) · 82.38 % (575/698) · 97.60 % (1017/1042); `src/travel/ambush/` 93.27 % (471/505) · 75.88 % (236/311) · 94.52 % (431/456).
  - il file principale da coprire era `src/travel/ambush/ambush-resolution.service.ts` (27 statements, 50 branches e 20 lines scoperti), con tre rami di produzione mai esercitati: `nearCityOf` col ripiego sul marker più vicino (righe 126–145), skip del personaggio senza proprietario (229–232), ripiego D-25 senza città raggiungibile (293–299).
- Correzione (commit `1f931f5`, `test(ambush): cover ownerless, unowned POI and roadless defeat paths`): tre `it` in `src/travel/ambush/ambush-resolution.int-spec.ts`:
  - `skips an ownerless traveller without any redraw (D-08)`: utenti cancellati, esito `skipped`, `ambush` null anche con tiri a colpo, nessun combattimento, nessun job `ambush`;
  - `names the city of the nearest marker when the nearest POI has no city (D-06)`: `forestPoi.city` a null e tolto dai `pointsOfInterest` di Crocevia; al km 10 `nearCity` = Crocevia, che ha il marker più vicino; nemico lupo;
  - `keeps heading to the destination without a city reachable by road (D-25)`: strade cancellate e `RoadsService.buildGraph()` rifatto; sconfitta → `to` = marker di Borgo (la meta), `kind` free, `startTime` = at, polilinea `[punto (0, 4.4966), ...original.slice(1)]`, `reachedCity` Borgo, push «Sei stato sconfitto: la via torna verso Borgo».
  - Misura dopo la correzione (ripiego per cartella, comando in tech-stack): 33 suite / 372 test verdi; `src/travel/` **98.62 % (1147/1163) · 84.53 % (590/698) · 99.42 % (1036/1042)** ≥ 97/84/98; `src/travel/ambush/` 97.23 % (491/505) · 80.71 % (251/311) · 98.68 % (450/456). L'exit 1 della run per cartella viene solo dai «Coverage data for ./src/<altro>/ was not found»; nessun messaggio per `./src/travel/`.
  - Margine sui branch: 3 (590 coperti contro i 587 richiesti).
- `npx jest src/config --selectProjects unit`: 16 suite / 251 test verdi.

### 2. Boot reale e SDL
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 76/76 verdi; `git diff --exit-code src/schema.gql` 0.
- Riga tolta rispetto a `origin/develop` (esattamente una): `-  quest: QuestResultQuest!`.
- Righe aggiunte: **17**, come atteso: `type AmbushCity {`, `  id: ID!`, `  name: String!`, `}`, `type AmbushReport {`, `  at: DateTime!`, `  nearCity: AmbushCity!`, `  reachedCity: AmbushCity`, `}`, `  ambushDefeat`, `  ambush: AmbushReport`, `  kind: QuestResultKind!`, `  quest: QuestResultQuest`, `enum QuestResultKind {`, `  ambush`, `  quest`, `}`.

### 3. Lint mirato
- `prettier --check` + `eslint` su ciascuno degli 88 `.ts` aggiunti o modificati rispetto a `origin/develop`: nessun FAIL. Restano solo i due warning della baseline di develop, non corretti: `src/roads/roads.service.ts:141:26` `no-unsafe-return` e `test/app.int-spec.ts:977:38` `no-base-to-string`.

### 4. Invarianti
| Invariante | Esito |
|---|---|
| trailer vietati su `origin/develop..HEAD` | 0 |
| `.env` nel diff | 0 |
| URI Mongo con credenziali nei `.md` della fase | nessuna |
| `.env.example` | solo `+AMBUSH_TIMEZONE=` |
| `process.env.` nuovo fuori dalle spec (diff e per file fuori da `src/config/`) | vuoto |
| determinismo (`Math.random`/`Date.now` in `src/travel/ambush`, spec escluse) | vuoto |
| operatori Mongo nei `.md` della fase fuori dai code span | nessuno: le occorrenze sono tutte in blocchi delimitati (15-06-SUMMARY:64, 15-06-PLAN, 15-08-PLAN, 15-RESEARCH), verificato con uno script che salta i blocchi delimitati e i code span |
| titoli dei test con operatori | vuoto |
| `AmbushModule` in `src/travel/travel.module.ts` | 0 |
| `AmbushModule` in `src/app.module.ts` | 2 |
| `EXPECTED_OWNER_ONLY_HANDLERS` | invariato (0 righe di diff) |
| `type ActiveTravel` in `test/app.int-spec.ts` | invariato (0) |
| seeder/migrazioni nel diff di `src` | 0 |
| `dist/` nel diff | 0 |
| `coverageThreshold` nel diff di package.json | 0; `./src/travel/` = 97/84/98 (controllo con node, exit 0) |
| `pgrep -fl 'bin/jest'` | vuoto |
| processo `node dist/main.js` pid 97078 | vivo |

## Task 2 — VALIDATION firmata
Commit `50754ae` (`docs(phase-15): sign the validation`): frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; righe 15-01..15-10 e 15-11-01/02 `✅ green`, «File Exists» `✅` (i tre `❌ W0` dei piani 07/08 diventano `✅`: i file esistono); voci Wave 0 e le sei del Sign-Off spuntate; `**Approval:** approved 2026-11-06`. 15-11-03 diventa green con il commit di bookkeeping; le righe 15-12 restano `⬜ pending`.

## Task 3 — bookkeeping
ROADMAP `11/12`, `- [x] 15-11-PLAN.md`, STATE `Plan: 11 of 12`, VALIDATION 15-11-03 `✅ green`, in `docs(phase-15): record plan 11 progress`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Copertura mancante] Soglia di `./src/travel/` sotto i minimi**
- **Found during:** Task 1, primo `npm run test:cov`
- **Issue:** 96.9/82.37/97.6 contro 97/84/98. Tre rami di produzione di `AmbushResolutionService` non avevano test: ripiego `nearCityOf` sul marker più vicino, skip del personaggio senza proprietario, ripiego D-25 senza strada.
- **Fix:** tre casi di integrazione (nessuna modifica di produzione; nessun bug emerso). Prima stesura del caso D-25 rossa per un'attesa mia sbagliata: avevo usato `original.slice(2)` al posto di `slice(1)`, ma il punto al km 10 (0, 4.4966) sta prima del bivio, quindi `segment` = 1. Corretta l'attesa, non il codice.
- **Files modified:** src/travel/ambush/ambush-resolution.int-spec.ts
- **Commit:** 1f931f5

**2. [Ripiego dichiarato] Coverage misurata per cartella dopo la correzione**
- Nessun secondo `test:cov` completo (~10 min): la correzione aggiunge solo una int-spec sotto `src/travel` e le altre soglie erano verdi nella run completa. `./src/travel/` misurata con il ripiego per cartella del piano.

## Known Stubs
Nessuno.

## Self-Check: PASSED
- src/travel/ambush/ambush-resolution.int-spec.ts: FOUND (24 test verdi)
- commit 1f931f5, 50754ae: FOUND
