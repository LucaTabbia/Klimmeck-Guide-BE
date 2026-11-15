---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 18
subsystem: docs
tags: [handoff, validation, requirements, closure]
requires:
  - phase: 23-17
    provides: gate verde (tsc, suite, SDL, coverage per cartella)
provides:
  - BACKEND-NOTES.md per la FE Phase 22 e piano di UAT su device
  - 23-VALIDATION.md firmata
  - BE-PET-01..14 chiusi in REQUIREMENTS.md
affects: [FE Phase 22, orchestratore (test:cov, verifica, audit, PR, tabella dei tempi a DB, UAT)]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/23-sconfitta-riposo-recupero-compagni/BACKEND-NOTES.md
    - .planning/phases/23-sconfitta-riposo-recupero-compagni/23-18-SUMMARY.md
  modified:
    - .planning/phases/23-sconfitta-riposo-recupero-compagni/23-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Handoff sul codice FINALE dopo la review: contratto A-08 (correzione dell'oste = sostituzione completa; la FE rimanda sempre companionLifeAfter simulato) messo in evidenza in §0 e §2 g"
  - "Fase lasciata In Progress 18/18: verifica, audit, PR, boot reale e UAT a cura dell'orchestratore"
metrics:
  duration: ~4 min (22:25Z → 22:29Z, più la lettura del contesto)
  completed: 2026-11-14
---

# Phase 23 Plan 18: Chiusura della fase e handoff Summary

Handoff `BACKEND-NOTES.md` per la FE Phase 22 sul codice finale dopo le correzioni della review (SDL verbatim, semantica per area, rifiuti, push, comportamenti provati con le spec, tabella dei tempi descritta e passi della UAT), VALIDATION firmata e BE-PET-01..14 chiusi; fase ferma a 18/18 «In Progress» in attesa dell'orchestratore.

## Sezioni del handoff

- Intestazione: fase, requisiti, decisioni D-01..D-33 e D-37..D-39, data, branch → PR verso `develop`, numeri del gate 23-17 e dopo le correzioni (unit 304 / 4 206; integration 160 suite, `src/characters` 475, `src/travel` 277, `src/quests/outcomes` 222, `src/quests/guided` 93, boot reale 102; `tsc` 0), `test:cov` dell'orchestratore, nessuna variabile/dipendenza/migrazione, «il codice vince».
- §0 TL;DR (11 punti, compresi livelli con `status.level`, push `ambush` che la FE di oggi non conosce, A-08 e query `characters` dell'oste senza compagni).
- §1 SDL verbatim: `git diff 2c462cbe -- src/schema.gql` = 36 righe aggiunte e 1 tolta (la riga di `useItem`).
- §2 semantica: (a) stato e interpolazione con la formula di `fullLifeAt`, (b) equip e riposo, (c) pozione (A-01), (d) nome (A-04), (e) esiti, (f) imboscate e viaggio (B-01..B-05, B-09), (g) guidato col contratto A-08 in evidenza, (h) livelli (A-06, A-07, tabella base 100 / tetto 100).
- §3 rifiuti con precedenza e messaggi dei tre codici nuovi; §4 subscription e push (testi composti, ordine dopo il commit B-01, A-03, A-05, testi provvisori); §5 comportamenti provati con il percorso delle spec; §6 tabella dei tempi (solo formula, non nel repo, compagno sconfitto riequipaggiabile subito finché manca), dati di prova, prerequisiti, passi 1–8 con 7-bis, riga sul `recoveryTime` corretto durante una sconfitta, diagnosi; §7 risposte W-1..W-12, domande aperte (xp del dungeon, `onFoot`, testi delle push, contratto A-08), deviazioni, rinvii della review, casi verdi al primo colpo.

## Requisiti chiusi

BE-PET-01..14 via `gsd-tools requirements mark-complete` (14 checkbox e 14 righe di tracciabilità a `Complete`).

## Controlli

- Verify del Task 1: 8 sezioni `## N.`, `type CompanionOutcome {`, riga di `useItem`, `PET_POTION_RECOVERING`, `schema.gql`, nessuna URI Mongo, nessun trailer: tutto verde. W-NN 24 righe, D-(13..33) 39, `recoveryTime` 8, D-37..39 9, `162, 180, 200` 1, `status.level` 1; commit del handoff con un solo file.
- Controllo sugli operatori: `grep -nE '[$](set|unset|...)\b'` sul handoff non stampa NESSUNA riga (nessun operatore Mongo scritto, nemmeno in code span).
- Verify del Task 2: 14 BE-PET spuntati, `nyquist_compliant: true`, `- [x] 23-18-PLAN.md`, `Plan: 18 of 18`, `Approval:** approved` 1, nessuna riga `⬜ pending`, Progress Table `18/18 | In Progress | -`.
- Nessuna spec lanciata (piano di soli documenti; l'orchestratore ha `npm run test:cov` in corso sullo stesso albero).

## Deviations from Plan

- Il primo commit del Task 2 contiene i testi di VALIDATION, REQUIREMENTS, ROADMAP e STATE con i valori di bookkeeping ancora a 17; il secondo (`record plan 18 progress`) porta `Plan: 18 of 18`, la riga `18/18` della Progress Table, la checkbox del piano 18 e questo SUMMARY. La VALIDATION era già completa nel primo commit e non cambia nel secondo.
- Nessun'altra deviazione.

## Self-Check: PASSED

- FOUND: BACKEND-NOTES.md, 23-VALIDATION.md, 23-18-SUMMARY.md
- FOUND: c2a4fb8b, cb636625
