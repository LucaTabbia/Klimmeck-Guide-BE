---
phase: 14-viaggio-e-cibo
plan: 08
subsystem: documenti della fase (handoff FE Phase 15, emendamento Phase 8, stato)
tags: [docs, handoff, BE-FOOD-06, D-14, D-17]
requires: [14-07]
provides:
  - "handoff `BACKEND-NOTES.md` per la FE Phase 15 (contratto verbatim, codici, semantica coi numeri, anteprime, concorrenza, esenzioni, dati UAT, deploy)"
  - "emendamento in coda al handoff della Phase 8 (§2, §4)"
affects: [FE Phase 15, BE Phase 15]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/14-viaggio-e-cibo/BACKEND-NOTES.md
    - .planning/phases/14-viaggio-e-cibo/14-08-SUMMARY.md
  modified:
    - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md
    - .planning/phases/14-viaggio-e-cibo/14-CONTEXT.md
    - .planning/phases/14-viaggio-e-cibo/14-VALIDATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Numeri del handoff: quelli reali della fixture (A→B 0,4448 km / fabbisogno 2; marker di quest 0,22 km / fabbisogno 1) nelle deviazioni, quelli del discuss (≈ 55 power / 16 km, 136 HP senza cibo) per la UAT"
  - "Runbook post-merge = solo build + riavvio, nessun passo di dati; il cibo della UAT lo semina l'orchestratore fuori dal repo"
  - "Riga della Progress Table a `8/8 | Complete | 2026-11-05` come da istruzione dell'orchestratore (il piano diceva `In Progress`)"
metrics:
  duration: "~15 min"
  completed: 2026-11-05
  tasks: 3
  files: 7
---

# Phase 14 Plan 08: documenti e handoff — Summary

Handoff `BACKEND-NOTES.md` per la FE Phase 15 con lo SDL copiato verbatim da `src/schema.gql`, la tabella dei codici con l'azione FE, la semantica del cibo con gli esempi del discuss, anteprime, concorrenza, esenzioni, dati della UAT e runbook di solo build + riavvio; emendamenti in coda al handoff della Phase 8 e al CONTEXT; ROADMAP e STATE raccontano la fase eseguita (8/8).

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 | 17b53ab | docs(phase-14): write the FE Phase 15 handoff |
| 2 | 596b465 | docs(phase-14): amend the Phase 8 handoff and record the phase status |
| 3 | (bookkeeping) | docs(phase-14): record plan 08 progress |

## Task 1 — handoff

Sezioni scritte in `.planning/phases/14-viaggio-e-cibo/BACKEND-NOTES.md`: intestazione (fase, data, branch, schema, stato coi numeri del gate 14-07: 341 suite / 4333 test, coverage per cartella, boot 76/76), `## 0. TL;DR per il FE`, `## 1. Contratto GraphQL (additivo)` (riga di `type Query`, `type TravelFoodItem`, `type TravelPreview` verbatim, diff delle 8 righe aggiunte, documenti d'esempio `GetQuestTravelPreview`/`GetTravelPreview`), `## 2. Codici` (tabella con `TRAVEL_STARVING` e i rifiuti di `questTravelPreview`, forma `data: null` vs `data: { questTravelPreview: null }` + errors, ordine dei rifiuti di `startTravel` e `acceptQuest`), `## 3. Semantica` (tabella degli esempi del discuss, 128 271 compreso), `## 4. Anteprime` (casi `null`, ordine D-17), `## 5. Concorrenza` (esiti dei piani 04/06 e prova D-20), `## 6. Esenzioni` (nota per la BE Phase 15), `## 7. Dati per la UAT` (campi, ordini di grandezza, casi a–e), `## 8. Deploy`, `## 9. Deviazioni e punti aperti`.

Verifiche: `grep -c "^## "` 10; `TRAVEL_STARVING` 11; frase di fame 2; `arrivesAlive` 13; `characterUpdated` 2; `128 271` 1; `D-17` 1; URI Mongo 0; operatori Mongo (`grep -nE '[$](set|in|elemMatch|gte|push|unset)'`) nessuna riga: il handoff non contiene operatori. Messaggi e codici di `questTravelPreview` riletti dal codice e dalle spec (`Input non valido: id` / `questId`, `Devi trovarti nella città della missione`, `Missione non disponibile`).

## Task 2 — emendamenti e stato

- Phase 8 handoff: due paragrafi **Emendamento 2026-11-05 (Phase 14):** in coda a §2 e a §4 con rimando al nuovo handoff; 0 righe tolte.
- `14-CONTEXT.md`: riga **Executed:** sotto **Status:**; 0 righe tolte.
- ROADMAP §Phase 14: riga **Stato (2026-11-05)** sotto la lista dei piani; la riga d'elenco della fase resta `[ ]`.
- STATE: `stopped_at`, **Current focus**, **Status**, **Last activity**; nessun altro campo del frontmatter. `REQUIREMENTS.md` senza diff.

## Task 3 — bookkeeping

Progress Table `| 14. Viaggio e cibo | 8/8 | Complete | 2026-11-05 |`, `- [x] 14-08-PLAN.md`, `Plan: 8 of 8`, righe 14-08-01..03 `✅ green` (14-08-01 File Exists `✅`); nessuna riga `⬜ pending` rimasta in VALIDATION.

## Deviations from Plan

1. **[Istruzione dell'orchestratore] Progress Table a `Complete | 2026-11-05`** invece di `In Progress | -` come scritto nel Task 3 del piano: il grep di accettazione del piano sulla riga `In Progress` quindi non matcha.
2. **[Formato] `Plan: 8 of 8`** invece di `Plan: 08 of 8` (formato reale di STATE.md, come nei piani 01–07): il verify del Task 3 che cerca `Plan: 08 of 8` non matcha.
3. **`grep -cF "8/8 piani eseguiti" .planning/ROADMAP.md` stampa 2, non 1:** la stessa frase esiste già nella riga di stato della Phase 13 (preesistente, non toccata); la riga della Phase 14 è una sola.
4. Sezione `## 9` del handoff: la nota sul calcolo dei km scoperti cita il caso reale del piano 01 (in km float 55/5/1,1 dava 2 km; in metri interi 1).

Nessun file di codice toccato; nessun jest eseguito (piano di soli documenti); `git diff --exit-code src/schema.gql` → 0.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- `BACKEND-NOTES.md` presente; 17b53ab e 596b465 nel log; `git diff --exit-code src/schema.gql` 0.
