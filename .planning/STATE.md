---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-10-06T16:45:08.052Z"
last_activity: 2026-07-24
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 01 — fondazione-test-consolidamento-spell-wip

## Current Position

Phase: 2
Plan: Not started
Status: Executing Phase 01
Last activity: 2026-07-24

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 6 | 4 tasks | 14 files |
| Phase 01 P02 | 6 | 3 tasks | 10 files |
| Phase 01 P01-03 | 9 | 3 tasks | 4 files |
| Phase 01 P04 | 1 | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Test con mongodb-memory-server in modalità replica set (change stream + transazioni); Bull mockato al confine DI negli unit + Redis effimero reale nei processor test (ioredis-mock NON viabile per Bull).
- [Phase 2]: Auth = JWT di sessione proprio (scambio `twitchToken → JWT BE` al login); dev bypass fail-closed compatibile con lo stub FE `DEV_AUTH_ACCESS_TOKEN`.
- [Phase 8]: Il DB (`endTime` persistito) è la fonte di verità dei timer viaggio; il job Bull è solo un trigger + reconciler al boot.
- [Phase 01]: Harness test: MongoMemoryReplSet single-node condiviso via globalSetup; split Jest unit/integration via projects; Redis effimero dietro env; pre-create collection prima delle transazioni multi-doc su replSet.
- [Phase 01]: Fixture two-tier buildX/persistX deterministiche per i 6 modelli; Character con xp:20000 (virtual maxActiveSpells) e location POI reale via persistCharacter
- [Phase 01]: Fix D-06 minimale (solo riordino validazione useSpell, RED->GREEN); attesa job Bull via polling documento (no job.finished, evita open handle); processor test senza CharactersService per non aprire il change stream
- [Phase 01]: CI GitHub Actions: lint+unit+integration su ogni push+PR, Redis service container reale (redis:7), cache binari mongodb-memory-server con MONGOMS_VERSION pinnata (8.0.4); dir vuota src/spellRecovery/ rimossa

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Conteggio requirement: REQUIREMENTS.md riporta "38 total" nella riga di summary, ma l'enumerazione effettiva dei BE-* ID è **42** (AUTH ha 6, ATOM ha 5, ecc.). La roadmap mappa tutti i 42. La riga di summary in REQUIREMENTS.md è stata corretta a 42.
- Research flags da approfondire in planning: Phase 1 (replica-set CI flakiness), Phase 2 (context graphql-ws #1756), Phase 6 (Twitch Helix subscription lifecycle).
- Verificare topologia MongoDB prod (replica set?) prima del layer transazioni; runtime Node prod (18/20 vs 22) per firebase-admin 13 vs 14; policy Redis prod (eviction dei delayed job Bull).

## Session Continuity

Last session: 2026-10-06T16:45:08.046Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-auth-identity-foundation/02-CONTEXT.md
