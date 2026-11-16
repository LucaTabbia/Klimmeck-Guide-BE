---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 18
subsystem: quests
tags: [gate, handoff, spells, learning, research]
requires: ["24-17"]
provides:
  - "gate del blocco 13–17 verde e misurato"
  - "BACKEND-NOTES.md §8 «Ricerca e apprendimento» (8.1–8.10)"
  - "BE-ORIGIN-13..18 chiusi"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/quests/outcomes/spell-learning.int-spec.ts
    - .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/BACKEND-NOTES.md
    - .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Nessuna correzione di codice al gate; un solo caso di integrazione rafforzato (vita invariata sul secondo foglio, contratto del discriminatore per la FE)"
metrics:
  completed: 2026-11-16
  tasks: 2
  commits: 4
---

# Phase 24 Plan 18: gate del blocco ricerca e apprendimento e handoff §8 — Summary

Gate verde sul blocco 24-13..24-17 (type check, unit completo, integration completa in cinque blocchi, boot reale, matrice, SDL, lint, invarianti, copertura delle decisioni) e handoff `BACKEND-NOTES.md` §8 per la FE e per l'orchestratore; BE-ORIGIN-13..18 chiusi dopo il gate.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | e349347c | test(quests): pin the unchanged life on the second sheet |
| 2 | 9b3e7c1a | docs(phase-24): hand off the research and learning contract |
| 2 | dadf6327 | docs(phase-24): close the research and learning requirements |
| 2 | (questo) | docs(phase-24): record plan 18 progress |

## 1. Base e type check

- `LEARN_BASE=40916ccd` («docs(phase-24): record the research and learning decisions»); `git merge-base --is-ancestor 40916ccd HEAD` esce 0; 26 commit dalla base al gate.
- `npx tsc --noEmit -p tsconfig.json`: 0.

## 2. Unit completo

`npx jest --selectProjects unit`: **310 suite / 4 495 test** verdi, 12 s. Riconciliazione col baseline dato (310 / 4 419, gate 24-11): dopo il 24-11 l'orchestratore ha tolto le 4 spec del migratore (2 unit, 2 integration) prima della base del blocco; il blocco aggiunge 2 suite unit (`learning-end-plan.spec.ts`, `duration-label.spec.ts`): 310 − 2 + 2 = 310; +76 test.

## 3. Integration completa (senza coverage, `--runInBand`, foreground)

| Blocco | Comando (percorsi prima di `--selectProjects integration --runInBand`) | Suite | Test | Tempo |
|--------|------------------------------------------------------------------------|-------|------|-------|
| 1 | `src/quests/outcomes` | 17 | 279 | 76 s |
| 2 | resto di `src/quests` (elenco da `--listTests` meno `src/quests/outcomes`) | 30 | 578 | 184 s |
| 3 | `src/characters` | 30 | 482 | 102 s |
| 4 | `src/travel` | 13 | 277 | 77 s |
| 5 | resto (elenco da `--listTests` meno `src/quests`, `src/characters`, `src/travel`) | 72 | 970 | 166 s |
| **Totale** | | **162** | **2 586** | |

`npx jest --selectProjects integration --listTests | grep -c int-spec.ts` = 162 = somma dei blocchi. Riconciliazione col baseline (163 / 2 558): −2 spec del migratore, +1 `spell-learning.int-spec.ts`. Nessuna spec appesa; `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco. Il blocco 2 è stato spostato in background dallo strumento dopo 180 s (timeout di default del comando, non `run_in_background`): esito letto a fine corsa, verde.

## 4. Boot reale, matrice e SDL

- `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 238 test; subito dopo `git diff --exit-code src/schema.gql` esce 0.
- `git diff 40916ccd -- src/schema.gql`: **6 righe aggiunte, 0 tolte**:
  - `+  learningSpell: Spell` (`type PendingQuest`)
  - `+  spellResearchFailed` (`enum PushEventType`)
  - `+  spellResearchSucceeded` (`enum PushEventType`)
  - `+  spellDraw: Boolean!` (`type QuestPrizes`)
  - `+  spellFound: Spell` (`type QuestResult`)
  - `+  spellResearchFailed: Boolean!` (`type QuestResult`)
- Tabella dei controlli: `spellFound: Spell` in `type QuestResult` 1; `learningSpell: Spell` in `type PendingQuest` 1; `spellResearch(Failed|Succeeded)` in `enum PushEventType` 2; `spellDraw: Boolean!` in `type QuestPrizes` 1; `spellResearchFailed: Boolean!` in `type QuestResult` 1; `researchResult` nello SDL 0. Tutti come attesi.

## 5. Coverage

- `git diff --name-only 40916ccd -- src/quests/acceptance src/quests/generation src/shops | wc -l` = 0 (nessuna cartella con soglia toccata); `git diff 40916ccd --stat -- package.json | wc -l` = 0.
- Senza soglia, stesso comando per cartella del gate 24-11 (statements / branches / lines):
  - `src/push`: 99,35 / 88,94 / 99,75 (13 suite, 214 test).
  - `src/quests/outcomes/learning`: con le sole spec della cartella 31,96 / 29,26 / 31,19 (il servizio è esercitato dalle int-spec in `src/quests/outcomes/`); con `spell-learning.int-spec.ts` e `quest-resolution.sweeper.int-spec.ts` 90,98 / 79,26 / 92,66 (3 suite, 41 test).
- `npm run test:cov` completo resta all'orchestratore.

## 6. Lint mirato

`for f in $(git diff --name-only --diff-filter=AM 40916ccd -- '*.ts'); do npx prettier --check "$f" && npx eslint "$f" || echo "FAIL $f"; done`: 43 file, nessun `FAIL` (in `test/app.int-spec.ts` resta un warning preesistente `no-base-to-string`, non introdotto dal blocco).

## 7. Invarianti

| Invariante | Esito |
|------------|-------|
| nessun tiro nuovo (`chance.next(` aggiunti fuori dalle spec) | 0 |
| un solo lettore del tempo | `src/models/spell.model.ts`, `src/quests/outcomes/resolution-loader.service.ts` |
| cancello e origine invariati | stat 0; `isLearnLevel` nel diff di `quest-rewards.ts` 0 |
| job e sweep invariati | 0 |
| D-30 (guidato e GM) | stat 0; `closePendingQuest` nel GM 0 |
| una sola chiusura della corsia standard | `boss-resolution.service.ts`, `outcome-writer.service.ts`, `quest-resolution.service.ts`, `rescue-resolution.service.ts` |
| un solo sblocco per calcolo | `knowledgeUpdateOf(` 1 in `outcome-plan.ts`, 1 in `learning-end-plan.ts` |
| riferimento interno fuori dal filo | `researchResult` nello SDL 0 |
| nessun indice unico sui fogli (D-31) | `unique` 0; `.index(` aggiunti 0 |
| un solo scrittore del secondo foglio | `learning-end-plan.ts`, `spell-learning.service.ts` |
| autorizzazioni | `expected-handlers.ts` senza diff; matrice verde |
| nessun contenuto né migratore | 0 / 0 |
| ambiente | 0 / 0 |
| determinismo | `Math.random`/`Date.now` 0; `jest.mock(` 0; `setTimeout(` 0 |
| trailer e subject | trailer 0; subject oltre 72 caratteri 0 |
| segreti | `.env` nel diff 0; `dist/` 0 |
| operatori Mongo nei SUMMARY 13–17 | nessuna riga trovata dal grep; titoli dei test nuovi con `$` 0 |
| albero e jest | `git status --short` vuoto; `pgrep -fl 'bin/jest'` vuoto |

## 8. Copertura delle decisioni

Conteggio di `D-NN[,)]` sulle righe aggiunte delle spec dalla base:

| Decisione | Righe | Spec d'esempio |
|-----------|-------|----------------|
| D-26 | 47 | `src/characters/character-quest-lanes.int-spec.ts` |
| D-29 | 30 | `src/quests/outcomes/study-spell-draw.int-spec.ts` |
| D-30 | 5 | `src/quests/outcomes/outcome-plan.spec.ts` |
| D-31 | 34 | `src/quests/outcomes/spell-learning.int-spec.ts` |

D-27 è contenuto a DB, D-28 solo FE. Requisiti: BE-ORIGIN-13 `outcome-plan.spec.ts`; BE-ORIGIN-14 `study-spell-draw.int-spec.ts` e `boss-resolution.int-spec.ts`; BE-ORIGIN-15 `spell-learning.int-spec.ts`; BE-ORIGIN-16 `push-events.spec.ts` e `outcome-writer.spec.ts`; BE-ORIGIN-17 `character-quest-lanes.int-spec.ts` e `quest-result.resolver.int-spec.ts`.

## Handoff

`BACKEND-NOTES.md`: intestazione (riga «Fase BE» con §8, riga «Gate 24-18»), §0 voce 8, nota in §7 per i passi 3–5, sezione `## 8. Ricerca e apprendimento (D-26..D-31, emendamenti del 2026-11-16)` con 8.1 TL;DR, 8.2 diff SDL verbatim, 8.3 stati sulla corsia, 8.4 tempi, 8.5 push, 8.6 esempi, 8.7 casi limite (compresi personaggio archiviato e `PendingQuest` orfana con `stale`, `findById` lean in più per trigger, due fogli ordinati per `resolvedAt`, magia già nota o sparita senza secondo foglio né push), 8.8 compiti dell'orchestratore, 8.9 UAT, 8.10 comportamenti provati. Per la FE è scritto che il secondo foglio non ha un campo discriminante: lo si riconosce da `spellLearned` con guadagni a zero e `hpBefore == hpAfter`, verificato nel codice (`learnedSheetOf` scrive entrambi dalla vita attuale) e pinnato nelle spec. Operatori Mongo nel §8: nessuno; quelli delle sezioni 4–5 preesistenti stanno in code span. Nessun URI, host o id reale.

## Requisiti

`requirements mark-complete BE-ORIGIN-13 … BE-ORIGIN-18`: 6 aggiornati; 18 checkbox `[x]` e 18 righe `Complete` nella tabella di tracciabilità.

## Deviations from Plan

1. **[Rule 2] Caso d'integrazione rafforzato** (`e349347c`): il secondo foglio è il discriminatore della FE (nessun campo dedicato), ma la vita invariata era pinnata solo nella spec unitaria del piano; il caso `writes a second sheet …` ora controlla anche `hpBefore` = vita del personaggio, `hpAfter == hpBefore`, `companion` nullo, `spellResearchFailed` falso. Verde al primo colpo (comportamento già corretto).
2. **Due commit di chiusura separati senza staging interattivo:** il commit `close the research and learning requirements` contiene REQUIREMENTS, frontmatter e approvazione della VALIDATION, testi di STATE e la riga di stato della ROADMAP; i soli segni di avanzamento (`Plan: 18 of 18`, `[x] 24-18-PLAN.md`, `18/18`, righe `24-18-0x`) vanno nel commit `record plan 18 progress` con questo SUMMARY.
3. **Baseline dei conteggi riconciliato** (§2, §3): i numeri dati come baseline precedono la rimozione delle spec del migratore.

## Self-Check: PASSED
