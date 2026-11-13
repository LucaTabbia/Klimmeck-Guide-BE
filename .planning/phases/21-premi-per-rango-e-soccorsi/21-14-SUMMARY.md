---
phase: 21-premi-per-rango-e-soccorsi
plan: 14
subsystem: docs
tags: [handoff, validation, requirements, bookkeeping]
requires:
  - 21-13
provides:
  - BACKEND-NOTES.md (§0–§7) per la FE Phase 20, la FE Phase 21 e la UAT su device
  - 21-VALIDATION.md firmata (nyquist_compliant true, approved 2026-11-13)
  - BE-RANKP-01..06 chiusi in REQUIREMENTS.md (checkbox e tracciabilità)
affects: [orchestratore: test:cov, verifica, audit, PR, riavvio reale, UAT]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/21-premi-per-rango-e-soccorsi/BACKEND-NOTES.md
    - .planning/phases/21-premi-per-rango-e-soccorsi/21-14-SUMMARY.md
  modified:
    - .planning/phases/21-premi-per-rango-e-soccorsi/21-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Il handoff cita i numeri del gate POST-FIX (unit 281 / 3745, integration 144 / 2106) e descrive il codice finale: comportamenti cambiati, log nuovi e limiti noti della review in §7"
  - "Le otto domande della FE Phase 20 (§4 del suo BACKEND-NOTES) hanno risposta in §7: nessuna domanda per la FE; resta per l'utente il testo del push dell'archiviatore"
metrics:
  duration: ~25 min
  completed: 2026-11-13
  tasks: 2
  files: 6
---

# Phase 21 Plan 14: Chiusura della fase Summary

Handoff `BACKEND-NOTES.md` con SDL verbatim, semantica del premio per viewer, matrice dei turni a 7 righe, lettura dell'aid di dungeon per la FE, comportamenti provati col percorso delle spec verificato sulla HEAD e piano di UAT coi dati da seminare; VALIDATION firmata, BE-RANKP-01..06 chiusi, ROADMAP e STATE a 14/14 con ciò che resta all'orchestratore.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 46797bbb | docs(phase-21): write the FE handoff and the device UAT plan |
| 2 | df0a0e36 | docs(phase-21): sign the validation and close the requirements |
| 2 | (questo commit) | docs(phase-21): record plan 14 progress |

## Sezioni del handoff

- **§0 TL;DR:** cambio additivo; `Quest.prizes` = blocco del titolo del viewer; `Quest.rankPrizes` per la FE 21; quattro campi dei turni; semantica cambiata di tappe, foglio dell'aid e sconfitta senza aid.
- **§1 SDL:** `enum DungeonTurnKind`, `type Quest`, `type QuestRankPrizes`, `type QuestResult` copiati da `src/schema.gql`; prova `git diff 1f9db973` (15 righe aggiunte, 0 tolte); invariati `QuestPrizes`, tappe, `rewards`, `QuestResultQuest`.
- **§2 Premi per titolo:** `prizeBlockFor` unica regola (D-04, D-18), solitarie e boss legacy (D-01, D-28), `rankPrizes`, magia ai soli caster (D-05b, D-25), «la mano vince», report del boot con le quattro violazioni.
- **§3 Dungeon a turni:** ritmo E F, contratto della porta, matrice dei turni (7 righe), tappe per i soccorritori (D-21), quota `(indice + 1) / totale` (5/8, 1/2), catene col rapporto delle quote, conferma `quest.type == aid` + turni non null sugli esiti, nessun segnale sul foglio.
- **§4 Aid, sconfitte e boss:** D-09, D-19 (`failure` come la guardia persa, prova in `defeat-without-aid.spec.ts`), D-09b, D-11, D-10/D-26, aid di dungeon senza feriti (C-WR-01), D-15, boss misti (D-03, D-23), D-24 col scioglimento del boss alla scadenza, archiviatore (D-16, D-27) e push best-effort.
- **§5 Comportamenti provati:** elenco puntato, 27 voci, ogni percorso e titolo verificato con `grep -cF` sulla HEAD (titoli rinominati dal fixer compresi).
- **§6 UAT:** prerequisiti (riavvio dal ramo, nessun migratore, D-17), dati da seminare (boss misto con iscritti, dungeon da 4 gruppi, soccorritore, job con nemici, ferito con soccorritore iscritto), sei passi, diagnosi con i log.
- **§7 Domande e deviazioni:** risposte alle otto domande della FE, domanda per l'utente sul testo del push, comportamenti cambiati dalla review, limiti noti, deviazioni e scelte dei piani 01–12, casi verdi al primo colpo.

## Controlli

- `grep -cE "^## [0-7]\."` = 8; `D-(18|19|21|22|26)` = 28 righe; righe della matrice = 7; `quest.type == aid` = 1; URI = 0.
- **Operatori Mongo:** `grep -nE '[$](set|unset|inc|and|or|gte|lte|in|elemMatch|size|pull)\b'` sul handoff non stampa nessuna riga (nessun operatore, nemmeno in code span): lettura a mano non necessaria.
- Nessun segreto, host, nome del database né valore reale: solo segnaposto `<characterId>`, `<questId>`, `<twitchId di test>`.
- Task 1: `git show --stat --format= HEAD | grep -c "|"` = 1.
- Requisiti: `requirements mark-complete` ha aggiornato checkbox e tracciabilità (6 righe `Complete`), controllate a mano; `grep -cE '\- \[x\] \*\*BE-RANKP-0[1-6]\*\*'` = 6.
- VALIDATION: `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`, righe `21-NN-TT` pending = 0, `**Approval:** approved 2026-11-13`; righe Manual-Only tenute (UAT «da eseguire», test:cov all'orchestratore).

## Deviations from Plan

- **Nessuna spec eseguita (sanzionata dall'orchestratore):** il piano non chiede spec; l'orchestratore esegue `npm run test:cov` in background sullo stesso albero, quindi niente jest in questo piano. Il gate post-fix è verde.
- **§7 con le risposte alle domande della FE:** le otto domande della FE Phase 20 (§4 del suo handoff) hanno risposta esplicita, oltre al contenuto chiesto dal piano.
- **§6 con l'elenco dei dati da seminare** chiesto dalle note dell'orchestratore (boss misto con iscritti, dungeon per l'aid, secondo personaggio, job con nemici, ferito con soccorritore iscritto); l'aid di dungeon nasce da una sconfitta vera, non da una semina.
- Documenti scritti con heredoc Bash / python3 `utf-8` (preferenza dell'utente per i documenti di pianificazione; STATE solo python3 come da REPO-RULES).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: BACKEND-NOTES.md, 21-14-SUMMARY.md
- FOUND: 46797bbb, df0a0e36
