---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Cura e modelli
status: planning
last_updated: "2026-11-10T12:00:00.000Z"
last_activity: 2026-11-10 -- Milestone v1.1 Cura e modelli started
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-10 all'apertura della v1.1)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 18 — Quest heal per taglia (contesto raccolto, pronta per il plan; ↔ FE Phase 18)

## Current Position

Milestone: **v1.1 Cura e modelli** — aperta il 2026-11-10 (Phases 18–20; precedente: v1.0 Core Loop (BE), consegnata il 2026-11-10, tag `v1.0`)
Phase: 18 di 20 (Quest heal per taglia) — contesto raccolto il 2026-11-09 (`18-CONTEXT.md`), pronta per il plan
Plan: —
Status: Ready to plan
Last activity: 2026-11-10 -- Milestone v1.1 started (requisiti e roadmap definiti, contesti delle Phase 18, 19 e 20 riportati dai branch dei discuss)
Next step: `/gsd-plan-phase 18` insieme alla FE Phase 18, su `feat/18-quest-heal-per-taglia` ricreato da `develop` dopo la merge di `docs/v1.1-milestone-start` (i vecchi branch dei discuss `feat/18-quest-heal-per-taglia`, `feat/19-revisione-dei-modelli` e `feat/20-cibo-e-vita-progressivi` sono superati: i contesti sono su questo branch, le loro modifiche a ROADMAP/REQUIREMENTS/STATE sono sostituite dai file della v1.1).

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

## Session Continuity

Last session: 2026-11-10 — apertura della milestone v1.1 (FE e BE)
Stopped at: milestone inizializzata su `docs/v1.1-milestone-start` (PR → `develop`); prossimo: plan della Phase 18 insieme alla FE Phase 18
Resume file: .planning/phases/18-quest-heal-per-taglia/18-CONTEXT.md
