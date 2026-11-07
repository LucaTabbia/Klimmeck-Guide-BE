---
phase: 15-imboscate-in-viaggio
plan: 12
subsystem: documenti di chiusura (handoff FE 16, emendamenti, requisiti, ROADMAP, STATE)
tags: [docs, handoff, BE-AMBUSH-01, BE-AMBUSH-02, BE-AMBUSH-03, BE-AMBUSH-04, BE-AMBUSH-05, BE-AMBUSH-06, BE-AMBUSH-07, D-14, D-16, D-17]
requires: [15-11]
provides:
  - "handoff `.planning/phases/15-imboscate-in-viaggio/BACKEND-NOTES.md` per la FE Phase 16 (SDL verbatim, push `ambushDefeat`, semantica coi numeri, consegna, robustezza, dati UAT, deploy, deviazioni e osservazioni)"
  - "emendamenti in coda agli handoff della Phase 8 (§6, §7) e della Phase 9.2 (§1)"
  - "BE-AMBUSH-01..07 completi con la riga di tracciabilità scritta a mano"
affects: [FE Phase 16 (16-07, 16-08)]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/15-imboscate-in-viaggio/BACKEND-NOTES.md
    - .planning/phases/15-imboscate-in-viaggio/15-12-SUMMARY.md
  modified:
    - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md
    - .planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md
    - .planning/phases/15-imboscate-in-viaggio/15-CONTEXT.md
    - .planning/phases/15-imboscate-in-viaggio/15-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
key-decisions:
  - "`requirements mark-complete` eseguito solo qui (deroga dell'orchestratore): spunta le 7 checkbox ma non la riga di tracciabilità, portata a `Complete` a mano"
  - "STATE e ROADMAP raccontano la fase eseguita (12/12, In Progress): la chiusura come «complete» resta all'orchestratore dopo review, fix, verifica, security e PR"
duration: ~20 min
completed: 2026-11-06
---

# Phase 15 Plan 12: documenti di chiusura — Summary

Handoff per la FE Phase 16 con lo SDL copiato verbatim da `src/schema.gql` (`AmbushCity`, `AmbushReport`, `PushEventType`, `QuestResult`, `QuestResultKind`, più `ActiveTravel` invariato), il diff vs `develop` (1 riga tolta `  quest: QuestResultQuest!`, 17 aggiunte), il payload del push `ambushDefeat`, la semantica coi numeri del discuss (tabella completa delle fasce 1–20 calcolata da `level-bands.ts`, premi per titolo), report e consegna, trigger e fail-open, dati per la UAT descritti a campi (nessuno script nel repo), deploy e deviazioni dei SUMMARY 15-01..15-11 con le cinque osservazioni per la FE/UAT dell'orchestratore.

## Tasks

| Task | Nome | Commit |
|------|------|--------|
| 1 | handoff `BACKEND-NOTES.md` per la FE Phase 16 | `de23384` |
| 2 | emendamenti, requisiti completi, ROADMAP e STATE | `e7e3cd3` |
| 3 | bookkeeping del piano 12 (con questo SUMMARY) | commit `docs(phase-15): record plan 12 progress` |

## Verifiche

- Handoff: 9 sezioni `## `; `quest: QuestResultQuest` 4 righe; `ambushDefeat` 9; «Sei stato sconfitto: la via torna verso» 2; `D-17` 2; `394` 1 (riga della tabella con 15 e 20); `AMBUSH_TIMEZONE` 3; URI Mongo 0; il grep degli operatori Mongo (`[$](set|in|lte|eq|push|pull|inc|unset)`) non stampa nulla: nessun operatore nel documento, neppure in code span.
- SDL del handoff confrontato coi blocchi estratti da `src/schema.gql` con `awk` (stesso testo, ordine del file: `AmbushCity` riga 33, `AmbushReport` 38, `PushEventType` 517, `QuestResult` 631, `QuestResultKind` 662).
- Emendamenti: `git diff HEAD~1` sui due handoff e sul CONTEXT senza righe tolte (0); `Emendamento .* (Phase 15)` 2 nel handoff della Phase 8; rimando a `15-imboscate-in-viaggio/BACKEND-NOTES.md` in entrambi.
- Requisiti: 7 checkbox `[x] **BE-AMBUSH-0N**`; riga `| BE-AMBUSH-01..07 | Phase 15 | Complete (gate 15-11 e chiusura 15-12, 2026-11-06; …) |`.
- ROADMAP: `12/12 piani eseguiti` 1 volta; riga della fase ancora `[ ]`.
- Nessun file sotto `src/`, `test/`, `package.json`, `.env.example` toccato; nessun jest, nessuna build; trailer 0 su ogni commit.

## Deviations from Plan

- **Fatti nel handoff in più rispetto al piano** (brief dell'orchestratore): stato reale della FE Phase 16 (parcheggiata a 6/8, riprende con 16-07/16-08) al posto di «la FE deve ancora pianificare»; sezione «Osservazioni per la FE e la UAT» con (a) pedina che retrocede al nodo agganciato, (b) istante arrotondato per difetto, (c) ordine degli enum, (d) campi vuoti dei report, (e) fail-open.
- **Sconfitta forzata più precisa del piano:** il placeholder somma i `damages` di tutto l'equipaggiamento indossato (`assets.wearedEquipment`) e delle magie attive (`assets.activeSpells`): con potere 0 la sconfitta è certa (letto da `placeholder-combat-resolver.ts`), la vittoria resta non garantita.
- **Tabella completa delle fasce** (20 livelli) calcolata con la formula di `xpBandOf` (PE × `XP_SCALE`, arrotondamento, minimo 1), coerente coi valori del discuss.
- **Riga `**Executed:**` del CONTEXT** inserita subito sotto `**Status:**` senza riga vuota (stesso paragrafo dell'intestazione, come le righe vicine).
- STATE: cambiati solo `stopped_at`, `last_activity`, **Current focus**, `Status:`, `Last activity:` (Task 2) e `Plan: 12 of 12` (Task 3); `last_updated` e `progress` non toccati.

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: solo documenti; segnaposto `<id>`/`<characterId>`, nessuna URI né valore del DB reale (T-15-41); emendamenti solo in coda e SDL verbatim (T-15-42).
