---
phase: 13-generazione-quest
plan: 20
subsystem: docs (handoff FE Phase 14, runbook del primo boot, chiusura della fase)
tags: [docs, handoff, runbook, BE-QGEN-08, D-18, D-25]
requires: ["13-19"]
provides:
  - ".planning/phases/13-generazione-quest/BACKEND-NOTES.md (§0–§14): contratto SDL tolto/nuovo, populate e orfani, dungeon a tappe, generateQuests, board e insert (D-18), regole del generatore, scelte dell'utente, cura a DB, configurazione, runbook del primo boot reale (§11) con i file una tantum da rimuovere, note per le fasi successive, numeri del gate, note dall'esecuzione"
  - "ROADMAP Phase 13 `[x]`, Progress Table `| 13. Generazione quest | 20/20 | Complete | 2026-11-04 |`, nota di chiusura"
  - "STATE `Plan: 20 of 20`, fase eseguita, prossimi passi (review → fix → verifica → security, primo boot, rimozione dei one-off, PR); frontmatter `status: executing` lasciato all'orchestratore"
  - "13-VALIDATION righe 13-20-01/02 `✅ green`"
affects: [FE Phase 14 piani gated 14-10/14-11]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/13-generazione-quest/BACKEND-NOTES.md
    - .planning/phases/13-generazione-quest/13-20-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/13-generazione-quest/13-VALIDATION.md
decisions:
  - "Progress Table a `20/20 | Complete | 2026-11-04` come prescrive il piano (il bookkeeping generico del brief diceva `In Progress`: vince il piano, la cui verifica automatica lo richiede)"
  - "REQUIREMENTS non modificato: checkbox BE-QGEN-01..11 e riga di tracciabilità erano già `Complete (gate 13-19, 2026-11-04; …)`"
metrics:
  duration: "~25 min"
  completed: 2026-11-04
  tasks: 2
  files: 4
---

# Phase 13 Plan 20: Handoff, runbook e chiusura della fase Summary

`BACKEND-NOTES.md` dà alla FE Phase 14 il contratto copiato da `src/schema.gql` (due righe `  enemy: Enemy` tolte, `QuestEnemy`, `stagesCleared`/`stagesTotal`, `pet`, `legendary`, `accessoryUseTypes`, `generateQuests`), le regole di populate (mai `enemies[].enemy.relatedLore`), la nota D-18 sugli insert e il runbook del primo boot reale dal branch con i log attesi e l'elenco esatto dei file una tantum da rimuovere prima della merge; ROADMAP, STATE e VALIDATION chiudono la fase a 20/20.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 | 7b4c841 | docs(phase-13): add the backend notes for the FE Phase 14 |
| 2 | fb75a04 | docs(phase-13): complete phase execution |

## Task 1 — `BACKEND-NOTES.md`

Sezioni: 0 TL;DR (7 punti), 1 SDL tolto (dal diff), 2 SDL nuovo (blocchi copiati), 3 populate e orfani, 4 dungeon a tappe, 5 `generateQuests` (FORBIDDEN, UNAUTHENTICATED, single-flight, audit), 6 board/insert/scadenza (D-14, D-18), 7 regole del generatore (costanti di `generation-rules.ts`, `generated-prizes.ts`, `recommended-loot.ts`, `quest-templates.ts`, `city-picker.ts`, `enemy-pool.ts`), 8 scelte dell'utente del 2026-11-04, 9 cura a DB (C5, C6, A2, gioielli nuovi), 10 configurazione (`.env.example`), 11 runbook (a–e), 12 note per le fasi successive e domande per la FE, 13 numeri del gate, 14 note dall'esecuzione (fatti dell'orchestratore 13-13..13-17).

Accettazione: `^## ` 15; `D-18` 5; `stagesCleared` 7; `enemy-legendary.migrator.ts` / `jewel-accessory.migrator.ts` / `dungeon-stages.migrator.ts` 1 ciascuno; `accessoryUseTypes` 7; URI Mongo 0; operatori Mongo nella prosa fuori da code span/blocchi 0.

Log attesi del runbook: `Nemici delle missioni: <q> missioni e <r> risultati migrati alla lista` (≈ 581 / 24), `Nemici: 22 leggendari e <n> ordinari marcati` (n ≈ 128), `Gioielli: 42 valorizzati` senza WARN, `Dungeon: <n> arricchite a tappe` (fino a 40, WARN di solo id per le saltate), `Generatore: <n> missioni create (target <t>)` (≈ 167); silenzio dei one-off dal secondo boot.

## Task 2 — chiusura

- ROADMAP: `- [x] **Phase 13: Generazione quest**`; `- [x] 13-20-PLAN.md`; Progress Table `| 13. Generazione quest | 20/20 | Complete | 2026-11-04 |`; «esecuzione completa il 2026-11-04» e nota di chiusura sotto **Plans**.
- STATE: `Plan: 20 of 20`, `stopped_at`, `last_activity`, Current focus, Status, Progress; frontmatter `status: executing` invariato (lo chiude l'orchestratore).
- VALIDATION: 13-20-01 `✅` / `✅ green`, 13-20-02 `✅ green`; nessuna riga `⬜ pending`.
- REQUIREMENTS: nessuna modifica (già completo dal 13-19); `requirements mark-complete` non eseguito.

## Deviations from Plan

1. **Progress Table:** il brief generico indicava `In Progress | -`, il piano `Complete | <data>` (con verifica automatica): applicato il piano.
2. **REQUIREMENTS invariato:** la riga di tracciabilità era già Complete con data dal 13-19 (commit 312ceeb); nessun commit su REQUIREMENTS.
3. **Sezioni in più:** §13 (numeri del gate) e §14 (note dall'esecuzione) oltre alle 0–12 del piano, su istruzione dell'orchestratore; le domande per la FE stanno in §12.

## Known Stubs

Nessuno (documenti). Il blocco `<log del primo boot reale: righe 1–5>` in §11 è un segnaposto intenzionale da riempire dopo il primo boot reale.

## Self-Check: PASSED

- BACKEND-NOTES.md presente e contiene `generateQuests: GenerateQuestsResult!`, `type QuestEnemy`, `FORBIDDEN`, `relatedLore`.
- Commit 7b4c841 e fb75a04 presenti; trailer vietati 0.
