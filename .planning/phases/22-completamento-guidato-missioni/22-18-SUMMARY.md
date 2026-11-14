---
phase: 22-completamento-guidato-missioni
plan: 18
subsystem: docs
tags: [handoff, validation, requirements, bookkeeping]
requires: ["22-17"]
provides: ["handoff BACKEND-NOTES.md per la FE Phase 21 e piano della UAT su device; VALIDATION firmata; BE-GMFLOW-01..09 chiusi"]
affects: [.planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/22-completamento-guidato-missioni/BACKEND-NOTES.md
  modified:
    - .planning/phases/22-completamento-guidato-missioni/22-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Il handoff porta i fatti della review (tetto tecnico 9 999 999 su monete e xp, rifiuto del completamento su bozza cambiata, completamento concorrente, recupero della storia persa, precedenza parziale A-02) e gli usi già implementati dalla FE"
  - "D-27 annotato fra le domande aperte di STATE come bug fuori scope"
metrics:
  duration: 25min
  completed: 2026-11-14
---

# Phase 22 Plan 18: Chiusura della fase e handoff Summary

Handoff `BACKEND-NOTES.md` per la FE Phase 21 (SDL verbatim col diff da `c6079ca3`, semantica per passo con tabella dei rifiuti e tetti tecnici, blocco «missione in corso» con precedenza e messaggio, subscription, comportamenti provati con le spec, dati a DB e undici passi della UAT su device, risposte N-1..N-15 e deviazioni); VALIDATION firmata; BE-GMFLOW-01..09 chiusi; D-27 in STATE; ROADMAP e STATE a 18/18.

## Sezioni del handoff

- §0 TL;DR (SDL additivo, otto operazioni dell'oste, due booleani D-16, `PendingRequest.missionDraftStartedAt`, `MISSION_IN_PROGRESS`, convivenza D-25)
- §1 SDL aggiunto verbatim (righe nei tipi esistenti + tipi, enum e input nuovi; prova `git diff c6079ca3 -- src/schema.gql` 147 righe aggiunte, 0 tolte)
- §2 Semantica per passo, tabella «operazione → codici», sottosezione «Contratto: tetti tecnici» (otto righe, compreso `MAX_PRIZE_AMOUNT` = 9 999 999 della review), regola in grassetto sulle `corrections`, usi lato FE
- §3 Blocco: definizione, i due campi, tabella copiata dal piano, messaggio, `extensions`, A-02, corsa accettata
- §4 Subscription (`characterUpdated`, `pendingRequestsUpdated`, recupero della storia persa, nulla ai giocatori)
- §5 Comportamenti provati (elenco puntato, decisioni e percorsi delle spec)
- §6 Dati a DB (worldMission con `rankPrizes`, story, leggendario con controllo I5), prerequisiti, 11 passi, diagnosi
- §7 Risposte N-1, N-2, N-9, N-12..N-15, scelte del planner e ruling, D-27, deviazioni, nessuna domanda per la FE

## Controlli

- `grep -cE '^## [0-7]\.'` = 8; D-(14..25) = 40 righe; N-(…) = 14; `rankPrizes` = 2; `worldMission` = 12; URI Mongo = 0.
- Operatori Mongo: il grep degli operatori sul handoff non trova nessuna riga (nessun operatore scritto, nemmeno in code span); il contatore della review è descritto a parole.
- Jest NON lanciato (piano di soli documenti; `npm run test:cov` lo esegue l'orchestratore su questo albero): gli esiti citati vengono da `22-17-SUMMARY.md` e `22-REVIEW-FIX.md`.
- `requirements mark-complete` ha aggiornato checkbox e tabella di tracciabilità (9 righe `Complete`).

## Deviazioni dal piano

- Nessuna deviazione di contenuto. Le righe «Manual-Only» della VALIDATION restano; la riga della UAT su device porta «da eseguire».

## Known Stubs

Nessuno.

## Restano all'orchestratore

`npm run test:cov`, verifica e audit, build e riavvio del BE dal ramo, semina dei dati UAT (§6, script fuori dal repo), UAT su device con la FE Phase 21, PR verso `develop`; dopo la merge FE, rimozione di `completePendingRequest` con gli override.

## Self-Check: PASSED

- `BACKEND-NOTES.md` presente; commit `1bc4be64` e `32a827bf` presenti.
