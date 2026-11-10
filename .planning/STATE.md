---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Core Loop (BE)
status: completed
last_updated: "2026-11-10T01:40:00.000Z"
last_activity: 2026-11-10 -- v1.0 Core Loop (BE) milestone completed and archived (21/21 phases, 261/261 plans)
progress:
  total_phases: 21
  completed_phases: 21
  total_plans: 261
  completed_plans: 261
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-10 after the v1.0 milestone)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Pianificazione della prossima milestone (v1.1) con `/gsd-new-milestone`

## Current Position

Milestone: **v1.0 Core Loop (BE) — SHIPPED 2026-11-10** (archivio: `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`; riepilogo: `MILESTONES.md`; retrospettiva: `RETROSPECTIVE.md`)
Phase: nessuna attiva — tutte le 21 fasi complete (ultime: Phase 17 Autorizzazione e sessioni, PR #27 mergiata; quick task 261109-cap, PR #28 mergiata il 2026-11-10; `develop` `9973fcb1`)
Plan: —
Status: milestone v1.0 completa — chiusura registrata su `docs/v1-milestone-close` (PR → `develop`); tag `v1.0` da creare sul merge commit di `develop` dopo la merge
Last activity: 2026-11-10 -- v1.0 milestone completed and archived
Next step: `/gsd-new-milestone` (v1.1). Candidati già discussi: Phase 18 Quest heal per taglia (+ pozioni, `feat/18-quest-heal-per-taglia`, ↔ FE 18), Phase 19 Revisione dei modelli (`feat/19-revisione-dei-modelli`, ↔ FE 19), Phase 20 Cibo e vita progressivi (`feat/20-cibo-e-vita-progressivi`, solo BE; worktree `Klimmeck-Guide-BE-wt18`). Quei branch portano modifiche a `ROADMAP.md`, `REQUIREMENTS.md` e `STATE.md` precedenti alla chiusura e vanno ribasati: le sezioni di fase finiscono sotto la milestone v1.1 della roadmap nuova, `REQUIREMENTS.md` lo ricrea la nuova milestone.

## Current Milestone

Nessuna — v1.0 Core Loop (BE) consegnata. La milestone FE v1.0 (17 fasi, 180 piani) è stata chiusa lo stesso giorno (FE PR #46).

## Accumulated Context

- Stack: NestJS 11 + Mongoose 8 + Apollo code-first (HTTP + `graphql-ws`) + Bull/ioredis + firebase-admin 14; Jest con `mongodb-memory-server` (replica set) e Redis effimero; CI GitHub Actions (lint, unit, integration, build + diff schema, secret scan).
- Il mondo vive solo nel DB (D-36): semina idempotente al boot, cura a DB, nessun seeder/migratore nel repo dopo il boot reale (resta il report nell'handoff).
- Il processo dell'utente gira da `dist/` su `develop` (porta 3001): `npm run build` è vietato mentre gira; riavvio dall'orchestratore con build prima del TaskStop.
- `test:cov` ≈ 630 s: solo in background; `npm run lint` e il filtro jest hanno trappole note (memoria dell'orchestratore).
- Handoff FE in `.planning/phases/NN-<slug>/BACKEND-NOTES.md` dei due repo; le regole di gioco dette dall'utente diventano D-NN.

### Roadmap Evolution

- v1.0: 10 fasi dalla roadmap del 2026-07-16, inserite 2.1 (2026-10-09), 3.1 (2026-10-15), 9.1 e 9.2 (2026-10-27), estensione con le Phase 11–16 (2026-10-29), inserita 13.1 (2026-11-05), Phase 17 aggiunta il 2026-11-09 come companion della FE Phase 12 Hardening. Dettagli in `milestones/v1.0-ROADMAP.md`.
- 2026-11-10: milestone archiviata; `REQUIREMENTS.md` rimosso (lo ricrea `/gsd-new-milestone`).

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

Last session: 2026-11-10 — chiusura della milestone v1.0 (FE poi BE)
Stopped at: milestone archiviata; PR `docs/v1-milestone-close` → `develop` da mergiare, poi tag `v1.0`
Resume file: .planning/MILESTONES.md
