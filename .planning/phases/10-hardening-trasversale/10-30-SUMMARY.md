---
phase: 10-hardening-trasversale
plan: 30
subsystem: docs
tags: [handoff, deploy, backend-notes, d-18, d-20, be-hard-01, be-hard-02, be-hard-03, be-hard-04, be-hard-05, be-hard-06, be-hard-07, be-hard-08]
requires:
  - phase: 10-01..10-29
    provides: contratto, codici, default, runbook e misure da documentare
provides:
  - handoff BE → FE e deploy della Phase 10 (`BACKEND-NOTES.md`, 14 sezioni)
  - note datate additive negli handoff delle Phase 2.1, 3, 4, 7, 8, 9, 9.1, 9.2
  - sezione `## Deploy` nel README
affects: [10-31, FE Phase 10 (piano gated), FE Phase 12, quick task FE della creazione]
tech-stack:
  added: []
  patterns: ["emendamenti agli handoff solo additivi, datati, con rimando alla sezione del handoff nuovo"]
key-files:
  created:
    - .planning/phases/10-hardening-trasversale/BACKEND-NOTES.md
  modified:
    - .planning/phases/02.1-character-creation-contract/BACKEND-NOTES.md
    - .planning/phases/03-autorizzazione-ownership-ruoli-audit/BACKEND-NOTES.md
    - .planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md
    - .planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md
    - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md
    - .planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md
    - .planning/phases/09.1-spell-state-and-recovery-contract/BACKEND-NOTES.md
    - .planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md
    - README.md
key-decisions:
  - "Le tre domande del §4 della FE Phase 10 sono chiuse nel handoff BE: nessuna riemissione della coda su posizione/viaggio, messaggio dedicato per QUEST_IN_PROGRESS sul completamento, startDate mai null per story/worldMission scritte dal codice attuale"
  - "Dieci default/assunzioni (policy Sightengine A2-A5, moderazione disattivata fuori produzione, throttle A6, proxy A7, rate_limited, allowlist gitleaks A8) elencati per la conferma dell'utente prima della PR"
requirements-completed: []
duration: ~30 min
completed: 2026-10-30
---

# Phase 10 Plan 30: Handoff della Phase 10, emendamenti e README Summary

Handoff `BACKEND-NOTES.md` della Phase 10 in 14 sezioni (SDL additivo verbatim, 8 codici nuovi con copy FE, 31 righe di codici spostati, risposte alle 3 domande della FE Phase 10, moderazione con la tabella di policy, throttling, seat holder e avvio da soli, audit, checklist di deploy, 10 default da confermare, coverage, deviazioni); otto handoff precedenti emendati con note datate solo additive; sezione `## Deploy` nel README. Nessuna modifica al codice.

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 | 502d946 | `docs(phase-10): publish the hardening backend notes` |
| 2 | e5e5f3e | `docs(phase-10): amend earlier handoffs for the hardening` |

## Struttura del handoff

`## 0. TL;DR per il FE`, `## 1. Contratto GraphQL (additivo)`, `## 2. Codici nuovi`, `## 3. Codici spostati`, `## 4. Coda del GM e corsia standard (BE-HARD-08)` (con `### Risposte alle domande della FE Phase 10 (§4)`), `## 5. Superficie di produzione`, `## 6. Moderazione delle immagini`, `## 7. Throttling`, `## 8. Combattimento con i seat holder e avvio da soli (BE-HARD-07)`, `## 9. Audit`, `## 10. Checklist di deploy`, `## 11. Da confermare prima della PR`, `## 12. Coverage`, `## 13. Deviazioni e punti aperti`.

## Emendamenti

| Handoff | Dove | Contenuto |
| ------- | ---- | --------- |
| 02.1 | testa del §4 + riga accanto al limite «Nessuna moderazione NSFW» (§9) | codici della creazione invariati, `imagePath` facoltativo, upload moderato (422/503/429/400/413), copy del quick task, BE-CHAR-04 chiuso |
| 03 | testa del §3 | id malformato → `BAD_USER_INPUT` prima delle letture, `UNAUTHENTICATED`/`FORBIDDEN` prima, audit degli input malformati, target di `completePendingRequest` |
| 04 | testa del §2 | quantità/monete negative e item id malformati → `BAD_USER_INPUT`, 0 resta `INVALID_QUANTITY`, `itemId`/`spellId`/id personaggio |
| 07 | testa del §2 | `questId`/`id` malformati, avvio da soli atomico, `pendingQuest` nella coda e `QUEST_IN_PROGRESS` sul completamento |
| 08 | testa del §2 | `poiId`/`id` malformati in viaggio e teleport, avvio da soli all'arrivo |
| 09 | testa del §2, testa del §9, riga accanto a «Nessun blocco…» (§9), testa del §14, testa del §16 | override spostati e ordine dei codici, BE-HARD-08, nota sul blocco superato per la corsia occupata, punti del §14 chiusi, refactor e seat holder |
| 09.1 | testa del §5, testa del §10 | `spellId` malformato, `usages` scartato, punti del §10 chiusi, `removeOnFail` limitato |
| 09.2 | testa del §4, testa del §5, testa del §10 | conferma con id malformato → `BAD_USER_INPUT`, D-21 supera D-07, `startDate` sul `characterUpdated` degli avvii di party, risposte del §10 (OQ6 aperta) |

## Verifica

- Task 1: grep di accettazione del piano verde (14 sezioni `## `, `pendingQuest: ID`, `IMAGE_MODERATION_UNAVAILABLE`, `rate_limited`, `mixed-refs-migration`, `### Risposte alle domande della FE Phase 10`, nessuna URI né bearer); letterali di gate fuori dai code span vuoti; nessuna stringa esadecimale di 24 caratteri; repo FE invariato (`git status --short` vuoto prima e dopo).
- Task 2: grep di accettazione verde (8 handoff con «Emendato dalla Phase 10», 09 con 5 occorrenze, README con `## Deploy`); righe aggiunte senza letterali di gate né valori reali; diff solo additivo (36 righe `+`, 0 `-`).
- `git diff --exit-code src/schema.gql` esce 0; nessun file fuori da `files_modified` più il bookkeeping; nessun jest lanciato (piano solo documentazione).

## Deviations from Plan

- **Verificato contro il codice, non solo sulle note:** i messaggi di `validateEnv` per Twitch/EventSub sono riportati come sono (`TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` sono obbligatorie in produzione tramite il callback EventSub https, non come chiave autonoma); il CI ha anche lo step `Lint` prima di `Build`, riportato nella checklist.
- **Emendamenti oltre il minimo:** nel 02.1 una seconda riga accanto al limite «Nessuna moderazione NSFW» del §9, nel 09 una riga accanto alla frase «Nessun blocco se il partecipante è in viaggio» (oltre alle note in testa alle sezioni), per tenere la nota accanto al punto che cambia senza riscrivere il testo storico.
- **Open Question 6 della 9.2** dichiarata aperta (non affrontata dalla fase) invece di essere data per risolta.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md`, `README.md` con `## Deploy`, 8 handoff emendati
- FOUND: 502d946, e5e5f3e
