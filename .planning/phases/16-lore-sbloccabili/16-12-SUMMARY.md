---
phase: 16-lore-sbloccabili
plan: 12
subsystem: documenti di chiusura (handoff FE Phase 17, emendamenti, requisiti, ROADMAP, STATE)
tags: [docs, handoff, BE-LORE-01, BE-LORE-02, BE-LORE-03, BE-LORE-04, BE-LORE-05, BE-LORE-06, D-11, D-12]
requires: [16-11]
provides:
  - "handoff .planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md per la FE Phase 17 (SDL verbatim, selezioni FE con le int-spec, semantica, identità UAT, trucchi a DB, runbook del backfill e della rimozione, deploy, deviazioni)"
  - "emendamenti in coda a §1 degli handoff della Phase 11 e della Phase 9.2"
  - "BE-LORE-01..06 completi (checkbox e riga di tracciabilità)"
affects: [FE Phase 17 (17-09, 17-10), boot reale col backfill, piano di rimozione fuori fase]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md
    - .planning/phases/16-lore-sbloccabili/16-12-SUMMARY.md
  modified:
    - .planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md
    - .planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/phases/16-lore-sbloccabili/16-VALIDATION.md
key-decisions:
  - "Handoff a 8 sezioni (§0..§7) sul modello della Phase 15; §5 «Esito del boot reale» lasciata vuota per l'orchestratore"
  - "UAT: teleportCharacter è innkeeper-only, quindi con l'identità da giocatore gli arrivi si provocano col viaggio a endTime nel passato + sweep (annotato in §3 e §4 c)"
  - "Riga di tracciabilità di REQUIREMENTS portata a Complete a mano (requirements mark-complete aggiorna solo le checkbox)"
duration: ~12 min
completed: 2026-11-07
---

# Phase 16 Plan 12: documenti di chiusura e handoff — Summary

Handoff per la FE Phase 17 con lo SDL copiato da `src/schema.gql` (CharacterStatus, City, Enemy, Lore, QuestEnemy, QuestResult nell'ordine del file), le cinque selezioni FE verbatim con l'int-spec che le prova, la semantica coi numeri del discuss, l'identità da giocatore (`DEV_AUTH_ROLE=adventurer`, `DEV_AUTH_TWITCH_ID=<twitchId del giocatore>`, `LORE_STUDY_CHANCE=1`), i trucchi a DB coi soli nomi di campo, il runbook del boot reale col backfill e della rimozione in TDD (PR in draft fino ad allora), il deploy e le deviazioni della fase. Emendamenti in coda agli handoff 11 e 9.2, requisiti BE-LORE-01..06 completi, ROADMAP e STATE raccontano la fase eseguita.

## Commit

- `3a6a3ae` docs(phase-16): write the FE Phase 17 handoff
- `0c35d92` docs(phase-16): fix a typo in the handoff
- `c5ad3c6` docs(phase-16): amend the handoffs and close the requirements
- bookkeeping: `docs(phase-16): record plan 12 progress`

## Fallimenti RED osservati

Nessuno: piano di soli documenti (nessun TDD).

## Verifiche di accettazione

- Task 1: `grep -c "^## "` = 8; `loreUnlocked { id name type }` = 1; `enemies { quantity known enemy { id name imagePath xp } }` = 1; `DEV_AUTH_ROLE=adventurer` = 1; `LORE_STUDY_CHANCE=1` = 2; `Backfill delle lore: ` = 1; `LoreBackfillModule` = 3; URI Mongo = 0. Il grep degli operatori stampa 3 righe (§4 a, d, e): `$set` e `$pull` sono tutti dentro code span (lettura a mano).
- Task 2: righe tolte negli handoff 11 e 9.2 = 0; `Emendamento .* (Phase 16)` = 1 in ciascuno; `- [x] **BE-LORE-0[1-6]**` = 6.
- `grep -cF "12/12 piani eseguiti" .planning/ROADMAP.md` stampa **2**, non 1: la riga `**Stato (2026-11-06)**: 12/12 piani eseguiti; …` della Phase 15 è preesistente e combacia. La riga della Phase 16 è unica (`grep -cF "**Stato (2026-11-07)**: 12/12 piani eseguiti"` = 1). Lo storico non si tocca.

## Deviazioni dal piano

- **Commit di correzione `0c35d92`:** il primo commit del handoff conteneva un refuso («lora» per «lore», una occorrenza sfuggita alla sostituzione); corretto in un commit separato (niente amend).
- **Riga di tracciabilità:** `requirements mark-complete` ha aggiornato le 6 checkbox ma non la riga `| BE-LORE-01..06 | Phase 16 | … |`: portata a `Complete (gate 16-11 e chiusura 16-12, 2026-11-07; …)` con python3 utf-8, sul modello della riga BE-AMBUSH.
- **STATE.md:** cambiati solo `stopped_at`, `last_activity`, **Current focus**, **Status**, **Last activity** (task 2) e `Plan:` (bookkeeping); la riga `Progress:` del corpo resta quella dell'orchestratore.
- **Contenuto aggiunto oltre al piano (handoff):** nota che `teleportCharacter` è `@Roles(RoleType.innkeeper)` e risponde `FORBIDDEN` all'identità da giocatore; tabella dei filtri per viewer (giocatore / innkeeper / senza personaggio); osservazione che il FE precedente alla 17 vede `City.relatedLore` null sulle città sconosciute (FE CONTEXT D-11: `relatedLore!.id`); staleness del tabellone (FE D-09).

## Gate

- `npx tsc --noEmit -p tsconfig.json`: exit 0 (nessun file di codice toccato).
- Nessuna spec eseguita (piano di soli documenti; reviewer e verifier in parallelo).
- Prettier/eslint: nessun `.ts` toccato.
- `git diff --exit-code src/schema.gql`: 0. Vs `origin/develop`: 0 righe tolte, 3 aggiunte (`unlockedLore: [ID!]!`, `known: Boolean!`, `loreUnlocked: [Lore!]!`).
- Trailer: 0 su ogni commit.

## Known Stubs

- `BACKEND-NOTES.md` §5 «Esito del boot reale»: segnaposto intenzionale, lo compila l'orchestratore dopo il boot reale col backfill.

## Self-Check: PASSED

- FOUND: .planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md
- FOUND: 3a6a3ae, 0c35d92, c5ad3c6
