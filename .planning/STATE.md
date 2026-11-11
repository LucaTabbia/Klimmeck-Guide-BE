---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Cura e modelli
status: planned
last_updated: "2026-11-11T21:00:00.000Z"
last_activity: 2026-11-11 -- Phase 19 pianificata (23 piani; aggiunte dell'utente D-25..D-28: contenuto dei pet nella fase, lore dei pet, rarità, pet in premio per nemico e zona)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 34
  completed_plans: 11
  percent: 32
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-10 all'apertura della v1.1)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 19 — Revisione dei modelli — in pianificazione su `feat/19-revisione-dei-modelli` (riallineato a `develop` `bc92fb6f`); la Phase 18 è chiusa (PR #31 mergiata, contenuto a DB, BE-HEAL-01..09 completi) (↔ FE Phase 19, piani gated dalla merge di questa fase)

## Current Position

Milestone: **v1.1 Cura e modelli** — aperta il 2026-11-10 (Phases 18–20; precedente: v1.0 Core Loop (BE), consegnata il 2026-11-10, tag `v1.0`)
Phase: 19 di 20 (Revisione dei modelli) — contesto del 2026-11-09 (D-01..D-15), `19-REPO-RULES.md` con i nomi del contratto scritto l'11 novembre 2026; ricerca e piani in corso
Plan: 15 of 23
Status: Pronta per l'esecuzione — Phase 18 completa (PR #31 su `develop`, contenuto verificato a DB); Phase 19 pianificata in 23 piani sequenziali (catalogo 01–11, mondo 12–14, personaggio 15–20, rarità e pet in premio 21–22, gate 23); BE-MODEL-10..12 aggiunti a plan in corso.
Last activity: 2026-11-11 -- Phase 19: ricerca, regole, 23 piani, mappa di validazione
Next step: esecuzione dei piani 19-01..19-23 (`/gsd-execute-phase 19`), review, verifica, security; poi PR in draft, boot reale col migratore (processo dell'utente fermo, backup prima), script di contenuto dei pet con prova a secco, rimozione del modulo in TDD, PR pronta; la FE esegue i piani gated dopo la merge.

## Current Milestone

v1.1 Cura e modelli: Phase 18 Quest heal per taglia (BE-HEAL-01..09, ↔ FE 18) → Phase 19 Revisione dei modelli (BE-MODEL-01..09, ↔ FE 19) → Phase 20 Cibo e vita progressivi in viaggio (BE-FOODP-01..05, solo BE). Milestone FE gemella v1.1 «Healing & Models» (FE Phases 18–19). Ricerca di dominio saltata all'apertura (fasi già discusse); la ricerca per fase resta nel plan-phase.

## Accumulated Context

- Stack: NestJS 11 + Mongoose 8 + Apollo code-first (HTTP + `graphql-ws`) + Bull/ioredis + firebase-admin 14; Jest con `mongodb-memory-server` (replica set) e Redis effimero; CI GitHub Actions (lint, unit, integration, build + diff schema, secret scan).
- Il mondo vive solo nel DB (D-36): semina idempotente al boot, cura a DB, nessun seeder/migratore nel repo dopo il boot reale (resta il report nell'handoff).
- Il processo dell'utente gira da `dist/` su `develop` (porta 3001): `npm run build` è vietato mentre gira; riavvio dall'orchestratore con build prima del TaskStop.
- `test:cov` ≈ 630 s: solo in background; `npm run lint` e il filtro jest hanno trappole note (memoria dell'orchestratore).
- Handoff FE in `.planning/phases/NN-<slug>/BACKEND-NOTES.md` dei due repo; le regole di gioco dette dall'utente diventano D-NN.

### Roadmap Evolution

- v1.0: 10 fasi dalla roadmap del 2026-07-16, inserite 2.1 (2026-10-09), 3.1 (2026-10-15), 9.1 e 9.2 (2026-10-27), estensione con le Phase 11–16 (2026-10-29), inserita 13.1 (2026-11-05), Phase 17 aggiunta il 2026-11-09 come companion della FE Phase 12 Hardening. Dettagli in `milestones/v1.0-ROADMAP.md`.
- 2026-11-10: milestone archiviata; `REQUIREMENTS.md` rimosso (lo ricrea `/gsd-new-milestone`).
- 2026-11-10: milestone v1.1 Cura e modelli aperta con le Phase 18–20 (scope confermato dall'utente: solo le fasi discusse il 2026-11-09); `REQUIREMENTS.md` ricreato con BE-HEAL-01..09, BE-MODEL-01..09 e BE-FOODP-01..05.

### Decisions

Il log completo è nella tabella Key Decisions di `PROJECT.md`; le decisioni per piano delle fasi v1.0 sono nei `NN-CONTEXT.md` e nei SUMMARY delle fasi.

## Open Questions / Blockers

- **Promemoria operativi di produzione (Phase 10):** conferma della tabella di policy Sightengine e dei default del throttler (`BACKEND-NOTES.md` §11 della Phase 10), una chiamata Sightengine reale, `THROTTLE_TRUST_PROXY` quando la topologia sarà nota; topologia Mongo (replica set) e policy Redis (eviction dei delayed job).
- **EventSub:** E2E managed con tunnel HTTPS e verifica C4 prima della produzione (Phase 6).
- **«Esci da tutti i dispositivi»** (mutation che revoca ogni sessione) — backlog dalla Phase 2, non necessaria finché «l'ultimo login caccia l'altro».
- **Branch locali già mergiati** (23 `feat/*`, `fix/*`, `docs/*`) lasciati in place: cancellabili con `git branch -d`.

### Quick Tasks Completed (v1.0)

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261022-f0n | worldMission accettabile solo dalla sua città (D-26 emendata: solo la story da qualunque città; correzione utente) | 2026-10-22 | bc7b7f7 | [261022-f0n-worldmission-accettabile-solo-dalla-sua-](./quick/261022-f0n-worldmission-accettabile-solo-dalla-sua-/) |
| 261022-rhs | travel scheduler: Bull queue calls bounded by a 2 s timeout, Redis error logged once (UAT 2026-10-22: acceptQuest hung with Redis down) | 2026-10-22 | 2c77334 | [261022-rhs-travel-scheduler-bound-the-bull-queue-ca](./quick/261022-rhs-travel-scheduler-bound-the-bull-queue-ca/) |
| 261105-hea | `heal` come nono `UseType` delle magie (regola dell'utente, revisione dei mostri 2026-11-05); nessuna modifica SDL; cura a DB delle magie di cura dopo la merge e la FE gemella | 2026-11-05 | 34adf5f | [261105-hea-spell-heal-use-type](./quick/261105-hea-spell-heal-use-type/) |
| 261109-inj | `LootItem.canHeal: InjuryType[]` (campo già a DB, riusato su correzione dell'utente; `[InjuryType!]!` sullo schema, confermato al boot reale); solo il campo, meccanica di cura nella Phase 18; gemello FE | 2026-11-09 | branch `fix/…` gemello | [261109-inj-loot-effected-injuries](./quick/261109-inj-loot-effected-injuries/) |
| 261109-inj2 | nove `InjuryType` nuovi (37) con effetti provvisori a DB; gemello FE | 2026-11-09 | branch gemello | [261109-inj2-new-injury-types](./quick/261109-inj2-new-injury-types/) |
| 261109-cap | `ferrionCity` e `necrorianCity` a `CitySize.capital` (regola dell'utente nella UAT FE 12); nessun cambio SDL, Necrorian resta senza negozio, pool a DB non rigenerati | 2026-11-09 | PR #28 | [261109-cap-city-size-capitals](./quick/261109-cap-city-size-capitals/) |
| 261110-mag | tipo di quest `magic` (si comporta come `study`, ripetibile, rango minimo come dato della quest); SDL invariato; sul ramo della Phase 18 (PR #31) | 2026-11-10 | 63847cb4 | [261110-mag-quest-magic-type](./quick/261110-mag-quest-magic-type/) |
| 261110-cgd | arresto nelle `crime` (20 % alla conclusione, 10 ore di prigione, 25 % delle monete, `CharacterStatus.imprisonedUntil`, `CHARACTER_IMPRISONED`) e scontro nelle `guard` (20 %, nemico o branco city/all in fascia, monete doppie e xp dei nemici in vittoria, vita a 1 senza soccorso in sconfitta); ranghi a DB dopo la merge; sul ramo della Phase 18 (PR #31) | 2026-11-10 | 6c4e28f4 | [261110-cgd-crime-arrest-guard-encounter](./quick/261110-cgd-crime-arrest-guard-encounter/) |
| 261110-prp | push `prisonRelease` alla scadenza della prigione (sweep, un push per arresto, `imprisonedUntil` torna `null`); sul ramo della Phase 18 (PR #31) | 2026-11-10 | e50dba8c | [261110-prp-prison-release-push](./quick/261110-prp-prison-release-push/) |
| 261111-sdc | magia delle quest `magic` (`prizes.spellDraw`) con probabilità 30 % (`SPELL_DRAW_CHANCE`, gate tirato prima della scelta, solo col booleano); magia fissa senza gate; SDL invariato; ramo `feat/quick-spell-draw-chance` | 2026-11-11 | 5134cc5b | [261111-sdc-spell-draw-chance](./quick/261111-sdc-spell-draw-chance/) |

## Session Continuity

Last session: 2026-11-10 — apertura della milestone v1.1 (FE e BE)
Stopped at: Phase 18 codice completo (11/11, 2026-11-10) — PR in draft, contenuto a DB dopo la merge
Resume file: .planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md
