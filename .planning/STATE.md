---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-02-PLAN.md
last_updated: "2026-07-23T17:03:56.246Z"
last_activity: 2026-07-23
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 01 — fondazione-test-consolidamento-spell-wip

## Current Position

Phase: 01 (fondazione-test-consolidamento-spell-wip) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-07-23

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 6 | 4 tasks | 14 files |
| Phase 01 P02 | 6 | 3 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Test con mongodb-memory-server in modalità replica set (change stream + transazioni); Bull mockato al confine DI negli unit + Redis effimero reale nei processor test (ioredis-mock NON viabile per Bull).
- [Phase 2]: Auth = JWT di sessione proprio (scambio `twitchToken → JWT BE` al login); dev bypass fail-closed compatibile con lo stub FE `DEV_AUTH_ACCESS_TOKEN`.
- [Phase 8]: Il DB (`endTime` persistito) è la fonte di verità dei timer viaggio; il job Bull è solo un trigger + reconciler al boot.
- [Phase 01]: Harness test: MongoMemoryReplSet single-node condiviso via globalSetup; split Jest unit/integration via projects; Redis effimero dietro env; pre-create collection prima delle transazioni multi-doc su replSet.
- [Phase 01]: Fixture two-tier buildX/persistX deterministiche per i 6 modelli; Character con xp:20000 (virtual maxActiveSpells) e location POI reale via persistCharacter

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Conteggio requirement: REQUIREMENTS.md riporta "38 total" nella riga di summary, ma l'enumerazione effettiva dei BE-* ID è **42** (AUTH ha 6, ATOM ha 5, ecc.). La roadmap mappa tutti i 42. La riga di summary in REQUIREMENTS.md è stata corretta a 42.
- Research flags da approfondire in planning: Phase 1 (replica-set CI flakiness), Phase 2 (context graphql-ws #1756), Phase 6 (Twitch Helix subscription lifecycle).
- Verificare topologia MongoDB prod (replica set?) prima del layer transazioni; runtime Node prod (18/20 vs 22) per firebase-admin 13 vs 14; policy Redis prod (eviction dei delayed job Bull).

## Session Continuity

Last session: 2026-07-23T17:03:47.668Z
Stopped at: Completed 01-02-PLAN.md
Resume file: None
