---
phase: 14-viaggio-e-cibo
plan: 07
subsystem: gate della fase (suite, coverage, SDL, lint, invarianti, firma)
tags: [gate, coverage, schema, BE-FOOD-01, BE-FOOD-02, BE-FOOD-03, BE-FOOD-04, BE-FOOD-05, BE-FOOD-06, D-13, D-14, D-19]
requires: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06]
provides:
  - "fase 14 verde e misurata: `test:cov` con tutte le soglie, boot reale, SDL puramente additivo"
  - "14-VALIDATION.md firmata, BE-FOOD-01..06 completi"
affects: [14-08]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/14-viaggio-e-cibo/14-07-SUMMARY.md
  modified:
    - .planning/phases/14-viaggio-e-cibo/14-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Nessuna correzione di codice: tutti gli invarianti verdi al primo passaggio"
  - "`process.env.MONGO_TEST_URI` nella nuova int-spec del lettore della dispensa accettato: è la variabile dell'harness già usata da 11 int-spec su develop, non una variabile nuova"
metrics:
  duration: "~20 min"
  completed: 2026-11-05
  tasks: 3
  files: 5
---

# Phase 14 Plan 07: gate della fase — Summary

La fase 14 è verde con tutte le soglie di coverage (viaggio 99,68/87,67/100, accettazione 99,25/93,13/100), il boot reale aggiunge allo SDL esattamente le otto righe attese senza toglierne nessuna, lint mirato e invarianti puliti; VALIDATION firmata e BE-FOOD-01..06 completi.

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 | — | nessuna modifica (solo verifiche) |
| 2 | 60f7484 | docs(phase-14): sign the validation and complete the requirements |
| 3 | (bookkeeping) | docs(phase-14): record plan 07 progress |

## Task 1 — suite e coverage

- `npx tsc --noEmit -p tsconfig.json` → 0.
- `npm run test:cov` (eseguito una volta sola, nessun ripiego: lo strumento lo ha spostato in background a 180 s, atteso fino alla notifica) → exit 0, **341/341 suite, 4333/4333 test**, 526,5 s; nessuna soglia violata.
- Coverage da `coverage/coverage-summary.json` (somma dei file della cartella):

| Cartella | File | Statements | Branches | Lines | Functions | Soglia |
| --- | --- | --- | --- | --- | --- | --- |
| `src/travel/` | 18 | 99,68% (619/621) | 87,67% (320/365) | 100% (550/550) | 100% (117/117) | 97/84/98 |
| `src/quests/acceptance/` | 7 | 99,25% (396/399) | 93,13% (298/320) | 100% (352/352) | 100% (68/68) | 97/91/98 |
| `src/travel/food/` (informativo) | 4 | 100% (161/161) | 90,41% (66/73) | 100% (138/138) | 100% (43/43) | — |

- Totale repo: statements 97,23, branches 85,9, functions 93,66, lines 97,78.
- Soglie in `package.json` invariate (`node -e` sulle branches 84/91 → exit 0; `git diff origin/develop -- package.json | grep -c coverageThreshold` → 0).

## Task 1 — boot reale e SDL

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 1 suite, 76/76 test.
- `git diff --exit-code src/schema.gql` → 0; righe tolte rispetto a `origin/develop` → nessuna; righe aggiunte → **8**, esattamente quelle attese:
  - `type Query`: `questTravelPreview(request: AcceptQuestRequest!): TravelPreview`
  - `type TravelFoodItem {` / `item: LootItem!` / `quantity: Int!` / `}`
  - `type TravelPreview`: `arrivesAlive: Boolean!`, `food: [TravelFoodItem!]!`, `hpLost: Int!`

## Task 1 — lint mirato

Prettier `--check` ed ESLint file per file sui 30 `.ts` aggiunti/modificati rispetto a `origin/develop`: nessun FAIL, 0 errori. Un solo warning preesistente: `test/app.int-spec.ts:960` `@typescript-eslint/no-base-to-string` (`String(url)`, presente su develop alla riga 937, spostato dalle righe aggiunte; già segnalato dal 14-03).

## Task 1 — invarianti

| Invariante | Esito |
| --- | --- |
| trailer vietati su `origin/develop..HEAD` (39 commit prima del gate) | 0 |
| file `.env*` nel diff | 0 |
| URI Mongo reali nei `.md` della fase | nessuno |
| `.env.example` | diff vuoto |
| `npx jest src/config --selectProjects unit` | 15 suite, 245/245 test |
| `process.env.` nuovo sotto `src/` fuori da `src/config/` | una riga: `MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, …)` in `src/travel/food/travel-pantry.reader.int-spec.ts` — variabile dell'harness di test (impostata da `test/setup/global-setup.ts`) già usata da 11 int-spec su develop; nessuna variabile d'ambiente nuova, accettata |
| operatori Mongo nei SUMMARY della fase | 4 righe (14-02 r. 59, 64, 66; 14-06 r. 90), tutte dentro code span |
| titoli dei test con operatori | nessuno |
| `Math.random` in `src/travel/food` | nessuno |
| esenzioni D-13: completion service, sweeper, completion processor | diff vuoto |
| righe teleport/COMPLETION/dueTravels cambiate in `travel.updates.ts` | 0 |
| file migrazione/seed nel diff di `src` | 0 |
| `pgrep -fl jest` a fine task | vuoto |

## Task 2 — firma e requisiti

- `14-VALIDATION.md`: `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`, sei voci del Sign-Off spuntate, `**Approval:** approved 2026-11-05`, righe 14-07-01/02 `✅ green` (14-07-03 nel bookkeeping); 14-08-01..03 restano `⬜ pending`.
- `requirements mark-complete BE-FOOD-01..06` → 6 marcati; la riga di tracciabilità non era aggiornata dallo strumento: portata a mano a `Complete (gate 14-07, 2026-11-05; …)`.

## Deviazioni

- Il piano chiede `Plan: 07 of 8` in STATE.md: il formato reale è `Plan: 7 of 8` (vince il brief, come nei piani 01–06).
- Nessun'altra: piano eseguito come scritto, nessun file di codice toccato.

## Self-Check: PASSED

- 60f7484 presente; 14-VALIDATION.md, REQUIREMENTS.md, ROADMAP.md, STATE.md aggiornati; `git status --short` vuoto dopo il commit di bookkeeping.
