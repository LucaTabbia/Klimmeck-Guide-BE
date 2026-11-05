---
phase: 13-generazione-quest
plan: 19
subsystem: quests (generazione: gate della fase)
tags: [quests, generation, gate, coverage, schema, BE-QGEN-01, BE-QGEN-02, BE-QGEN-03, BE-QGEN-04, BE-QGEN-05, BE-QGEN-06, BE-QGEN-07, BE-QGEN-08, BE-QGEN-09, BE-QGEN-10, BE-QGEN-11, D-01, D-16, D-21, D-24]
requires: ["13-18"]
provides:
  - "test/app.int-spec.ts: `writes the quest generation contract of the FE Phase 14 into the generated schema (D-01, D-16, D-21, D-24)`"
  - "package.json `jest.coverageThreshold['./src/quests/generation/']` = statements 96, branches 82, lines 97"
  - "13-VALIDATION.md firmata (`status: complete`, `wave_0_complete: true`)"
  - "BE-QGEN-01..11 completi in REQUIREMENTS (checkbox + riga di tracciabilità)"
affects: [13-20]
tech-stack:
  added: []
  patterns:
    - "Contratto FE nel real boot: blocco del tipo estratto con `new RegExp(`type ${name} \\{[^}]*\\}`)` e `toContain` della riga esatta"
key-files:
  created:
    - .planning/phases/13-generazione-quest/13-19-SUMMARY.md
  modified:
    - test/app.int-spec.ts
    - package.json
    - .planning/phases/13-generazione-quest/13-VALIDATION.md
    - .planning/REQUIREMENTS.md
decisions:
  - "Soglia `./src/quests/generation/` = baseline − 2 per difetto: 96/82/97 (baseline 98,3/84,4/99,0)"
  - "La riga di tracciabilità `BE-QGEN-01..11` di REQUIREMENTS portata a Complete con un commit separato (il comando `requirements mark-complete` tocca solo le checkbox)"
metrics:
  duration: "~35 min (due corse di test:cov da ~500 s)"
  completed: 2026-11-04
  tasks: 2
  files: 4
---

# Phase 13 Plan 19: Gate della fase Summary

Il real boot fissa nello SDL tutti i nomi del contratto FE Phase 14; `npm run test:cov` è verde (334 suite / 4208 test) con le soglie esistenti e la soglia nuova `./src/quests/generation/` (96/82/97); lo SDL vs `origin/develop` toglie solo le due righe `  enemy: Enemy`; VALIDATION firmata e BE-QGEN-01..11 completi.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 | b95d46e | test(quests): pin the FE Phase 14 contract in the schema |
| 2 | b8968c7 | test(generation): enforce the generation coverage threshold |
| 2 | 3860e17 | docs(phase-13): sign the validation and complete the requirements |
| 2 | 312ceeb | docs(phase-13): mark the BE-QGEN traceability row complete |

## Task 1 — contratto SDL del FE Phase 14

Test `writes the quest generation contract of the FE Phase 14 into the generated schema (D-01, D-16, D-21, D-24)` in `test/app.int-spec.ts`, subito dopo quello di `generateQuests`. Asserisce: `type QuestEnemy { enemy: Enemy!  quantity: Int! }`; `  enemies: [QuestEnemy!]!` in `type QuestInfos` e `type QuestResult`; `  description: String` in QuestInfos; `  stagesCleared: Int\n  stagesTotal: Int` in QuestResult; `  pet: Pet` in QuestPrizes e QuestRewards; `  legendary: Boolean!` in Enemy; `enum AccessoryUseType { attack  defense }`; `  accessoryUseTypes: [AccessoryUseType!]` in EquipmentItem; `generateQuests: GenerateQuestsResult!`; `type GenerateQuestsResult { created: Int! }`; nessun `DungeonResolver`, `  generated: Boolean`, `legendaryEnemy`.

Verde al primo colpo (atteso: lo SDL è già quello finale dal 13-14; il test fissa i nomi che la FE Phase 14 seleziona). app.int-spec: 73 test verdi; `git diff --exit-code src/schema.gql` → 0.

## Task 2 — suite, soglia, invarianti

- `npx tsc --noEmit -p tsconfig.json` → 0.
- `npm run test:cov` (prima corsa, soglie esistenti): **334 suite / 4208 test verdi**, 504,8 s, exit 0.
- Baseline `src/quests/generation/` (15 file, da `coverage/coverage-summary.json`): statements 569/579 = **98,3**; branches 233/276 = **84,4**; lines 503/508 = **99,0**; functions 159/162 = 98,1.
- Soglia aggiunta: `"./src/quests/generation/": { "statements": 96, "branches": 82, "lines": 97 }`.
- `npm run test:cov` (seconda corsa, con la soglia): **334 suite / 4208 test verdi**, 496,3 s, exit 0.

Invarianti (nessuna modifica necessaria):

| Controllo | Esito |
|-----------|-------|
| SDL vs `origin/develop`, righe tolte | esattamente due, entrambe `-  enemy: Enemy` |
| Contratto FE con `grep -cxF` su `src/schema.gql` | `  enemies: [QuestEnemy!]!` 2; `  stagesCleared: Int` 1; `  stagesTotal: Int` 1; `  pet: Pet` 3 (QuestPrizes, QuestRewards e una preesistente; 2 aggiunte dalla fase); `  legendary: Boolean!` 1; `  accessoryUseTypes: [AccessoryUseType!]` 1; `  generateQuests: GenerateQuestsResult!` 1; `type GenerateQuestsResult {` 1; `enum AccessoryUseType {` 1; `type QuestEnemy {` 1; `DungeonResolver` 0 |
| prettier `--check` sui 118 `.ts` A/M della fase | tutti conformi |
| eslint sui 118 `.ts` A/M della fase | 0 errori; 1 warning preesistente `no-base-to-string` in `test/app.int-spec.ts:937` |
| drift `npx jest src/config --selectProjects unit` | 15 suite / 245 test verdi |
| segreti: `.env` nel diff | solo `.env.example` (template, due chiavi `QUEST_GENERATION_*` vuote dal commit 04c60f0); nessun `.env` |
| segreti: URI Mongo nei documenti della fase | nessuna |
| operatori Mongo nella prosa dei `.md` della fase (fuori da fence e code span) | nessuno (le occorrenze del grep grezzo sono tutte dentro fence ` ``` `) |
| one-off isolati in `src/quests/maintenance/` (grep su `src` e `test`) | nessun riferimento fuori |
| trailer vietati su `origin/develop..HEAD` (112 commit prima del bookkeeping) | 0 |
| `pgrep -fl jest` | vuoto |

VALIDATION: righe 13-19-01/02 → `✅ green`; «File Exists» di 13-04-02 → `✅`; frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; Approval con i numeri del gate. Restano `⬜ pending` solo le due righe 13-20 (`grep -cE '^\| 13-[0-9]{2}-[0-9]{2} .*⬜ pending'` = 2).

Requisiti: `requirements mark-complete BE-QGEN-01..11` → 11 marcati; `grep -c "\- \[x\] \*\*BE-QGEN-"` = 11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eslint `no-regex-spaces` sul test nuovo**
- **Trovato durante:** Task 1 (prima del commit)
- **Problema:** il letterale `/DungeonResolver|  generated: Boolean|legendaryEnemy/` viola `no-regex-spaces`
- **Fix:** `/DungeonResolver| {2}generated: Boolean|legendaryEnemy/` (stesso significato)
- **Commit:** b95d46e

**2. [Rule 2 - Coerenza] riga di tracciabilità di REQUIREMENTS**
- **Trovato durante:** Task 2, punto 5
- **Problema:** `requirements mark-complete` aggiorna le checkbox ma lascia `| BE-QGEN-01..11 | Phase 13 | Pending … |`
- **Fix:** riga portata a `Complete (gate 13-19, 2026-11-04; …)` sul modello della riga BE-SHOP della Phase 12
- **Commit:** 312ceeb (commit in più rispetto al piano)

**3. Il test di contratto asserisce anche `legendaryEnemy` assente e `QuestInfos.description` presente** (righe dell'interfaccia del piano non elencate nel `<behavior>`).

## Note per il 13-20

- Il comando di `test:cov` viene spostato in background dallo strumento dopo 180 s: attesa della notifica, nessun secondo jest.
- Al real boot su DB vuoto compaiono gli ERROR attesi dei change stream alla chiusura e il WARN dei gioielli; i test restano verdi.

## Self-Check: PASSED

- test/app.int-spec.ts contiene `FE Phase 14 into the generated schema`; package.json contiene `"./src/quests/generation/"`; 13-VALIDATION.md contiene `wave_0_complete: true`.
- Commit b95d46e, b8968c7, 3860e17, 312ceeb presenti in `git log`.
