---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Cura e modelli
status: verifying
last_updated: "2026-11-10T20:00:00.000Z"
last_activity: 2026-11-10 -- Phase 18 code complete (11/11), PR in draft until the DB content
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-10 all'apertura della v1.1)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 18 — Quest heal per taglia — codice completo (11/11) su `feat/18-quest-heal-per-taglia`: gate, review (11 fix), verifica e security chiusi; PR verso `develop` in draft fino alla revisione del contenuto da parte dell'utente; BE-HEAL-03 e BE-HEAL-08 aperti fino agli script di contenuto dell'orchestratore (↔ FE Phase 18, parcheggiata a 11/13 in attesa di questa merge)

## Current Position

Milestone: **v1.1 Cura e modelli** — aperta il 2026-11-10 (Phases 18–20; precedente: v1.0 Core Loop (BE), consegnata il 2026-11-10, tag `v1.0`)
Phase: 18 di 20 (Quest heal per taglia) — codice completo dal 2026-11-10 su `feat/18-quest-heal-per-taglia` (da `develop` `86095d89` + l'apertura della milestone): 11/11 piani, PR in draft; la fase si chiude con il contenuto a DB dopo la merge
Plan: 11 of 11
Status: In verifica — Phase 18 eseguita (11/11): gate verde; review 0 critical / 3 warning / 11 info → 11 corretti, 3 chiusi per ruling (`18-REVIEW-FIX.md`); verifica `passed` 8/8 con 2 differiti di contenuto (`18-VERIFICATION.md`); security 56 minacce, 0 aperte (`18-SECURITY.md`); `test:cov` dopo i fix 390 suite / 5131 test verdi, soglie rispettate (totale 97,34 / 85,91 / 93,86 / 97,89). PR verso `develop` in draft: fra la merge e gli script di contenuto ogni heal è rifiutata con `QUEST_NO_EFFECT` e nessuna pozione è bevibile, quindi merge e contenuto vanno applicati vicini.
Last activity: 2026-11-10 -- Phase 18: review corretta, verifica e security chiuse, `test:cov` verde, PR in draft
Next step: l'utente rivede il contenuto (166 heal per taglia con `cure`, `recovery` delle 28 pozioni, lore «Il limite del corpo»); merge della PR; l'orchestratore applica gli script di contenuto fuori repo con prova a secco (runbook in `BACKEND-NOTES.md` §3 c), riavvia il BE da `develop` e chiude BE-HEAL-03 e BE-HEAL-08; poi la FE esegue 18-12 e 18-13.

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

## Session Continuity

Last session: 2026-11-10 — apertura della milestone v1.1 (FE e BE)
Stopped at: Phase 18 codice completo (11/11, 2026-11-10) — PR in draft, contenuto a DB dopo la merge
Resume file: .planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md
