---
phase: 17-autorizzazione-e-sessioni
plan: 10
subsystem: docs (chiusura della fase)
tags: [handoff, requirements, BE-SESSION-01, BE-SESSION-02, BE-SESSION-03, BE-SESSION-04, BE-SESSION-05, D-09, D-16, HARDEN-02]
requires: ["17-09"]
provides:
  - "`.planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md`: handoff per la FE Phase 12 (contratto 4409 + `SessionRevokeReason` + `extensions.reason`, comportamenti provati, evidenza HARDEN-02, note UAT dual-device e tunnel TLS, deploy)"
  - "BE-SESSION-01..05 marcati completi in `.planning/REQUIREMENTS.md` (checkbox e riga di tracciabilità)"
affects: [FE Phase 12]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/17-autorizzazione-e-sessioni/17-VALIDATION.md
decisions:
  - "Nel handoff la review è una sola riga di rimando (`17-REVIEW.md` / `17-REVIEW-FIX.md`), senza anticiparne i contenuti"
  - "Conteggi della matrice per gruppo raggruppati per handler (11 innkeeper = 10 HTTP + 1 subscription, 19 ownership = 17 + 2, 8 owner-only = 7 + 1), letti da `17-08-SUMMARY.md`"
metrics:
  duration: "~15 min"
  completed: 2026-11-09
  tasks: 3
  files: 5
---

# Phase 17 Plan 10: documenti di chiusura Summary

Handoff `BACKEND-NOTES.md` per la FE Phase 12 col contratto copiato dal codice (enum `SessionRevokeReason` verbatim da `src/auth/session/session-revoke-reason.enum.ts`, tabella dei close code `4401`/`4403`/`4409`, payload di esempio del refresh rifiutato con `extensions.reason`, finestra HTTP del JWT di 900 s), comportamenti provati per decisione con i percorsi delle spec, evidenza HARDEN-02 (`test/authz/authorization-matrix.int-spec.ts`, 85 casi per gruppo), note per la UAT dual-device e per la UAT della release via tunnel TLS, deploy e runbook del boot; BE-SESSION-01..05 completi; ROADMAP e STATE raccontano la fase eseguita con la PR verso `develop` non in draft.

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | handoff `BACKEND-NOTES.md` per la FE Phase 12 | 621be74 | `.planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md` |
| 2 | requisiti completi, ROADMAP e STATE | b4c4459 | `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` |
| 3 | bookkeeping del piano 10 | (questo commit) | ROADMAP, STATE, VALIDATION, SUMMARY |

## Struttura del handoff

`# BACKEND-NOTES — Phase 17 Autorizzazione e sessioni (handoff per la FE Phase 12)`, intestazione (fase, data, branch, gate della FE, schema invariato, numeri del gate 17-09, riga «Review e fix», fonti), poi `## 0. TL;DR per il FE` (8 punti), `## 1. Contratto` (1.1 motivo, 1.2 close code, 1.3 rifiuto del refresh, 1.4 quando il BE chiude con `4409`, 1.5 finestra HTTP), `## 2. Comportamenti provati` (tabella D-02..D-07, D-11..D-13 + `### Evidenza HARDEN-02`), `## 3. Note per le UAT della FE Phase 12` (3.1 dual-device, 3.2 tunnel TLS), `## 4. Deploy` (runbook in 4 passi), `## 5. Domande aperte e deviazioni`.

## Fallimenti RED osservati

Nessuno: piano di soli documenti, nessun codice.

## Verifiche

- Task 1: `grep -c "^## "` = 6; `grep -cE "(newLogin|roleChanged|reuseDetected|userLogout) = '"` = 4; `session-revoke-reason.enum.ts` 3 occorrenze; `900` 2; «un solo processo BE» 1; `TWITCH_REDIRECT_URI` 1; `DEV_AUTH_TWITCH_ID` 1; URI Mongo 0; payload `"reason":"newLogin"` presente. Il grep degli operatori trova una sola riga (§3.1, `updateOne` con `$set` su `role`): l'operatore è dentro un code span (lettura a mano).
- Task 2: `requirements mark-complete` ha marcato i 5 requisiti (`not_found: []`) ma non la riga di tracciabilità, portata a `Complete (gate 17-09 e chiusura 17-10, 2026-11-09; …)` con python3 utf-8; `grep -cE '\- \[x\] \*\*BE-SESSION-0[1-5]\*\*'` = 5; `10/10 piani eseguiti` = 1; `Phase 17` in STATE = 6.
- Task 3: `| 17. Autorizzazione e sessioni | 10/10 | In Progress | - |` = 1; righe `⬜ pending` in VALIDATION = 0.
- Trailer dopo ogni commit: 0. Nessun file `.ts` toccato: tsc, jest, prettier ed eslint non applicabili; `git diff origin/develop -- src/schema.gql` vuoto.

## Deviations from Plan

- **Riga di tracciabilità** di REQUIREMENTS.md aggiornata a mano (python3 utf-8), come previsto dal piano se lo strumento non la tocca.
- **VALIDATION 17-10-01:** colonna «File Exists» portata da `❌ W0` a `✅` (il handoff ora esiste).
- **STATE.md:** campi `Phase:` e `Progress:` della Current Position non toccati (il piano limita le modifiche a `stopped_at`, Current focus, Status, Last activity e `Plan:`); restano col testo «EXECUTING» / «0/10» per l'orchestratore.

## Known Stubs

Nessuno.

## Self-Check: PASSED
