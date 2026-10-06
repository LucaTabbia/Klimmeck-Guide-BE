---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 02-04-PLAN.md
last_updated: "2026-10-06T18:01:38.479Z"
last_activity: 2026-10-06
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 14
  completed_plans: 9
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 2 — auth-identity-foundation

## Current Position

Phase: 2 (auth-identity-foundation) — EXECUTING
Plan: 5 of 9
Status: Ready to execute
Last activity: 2026-10-06

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
| Phase 02 P01 | 7 min | 3 tasks | 25 files |
| Phase 02 P02 | 6 min | 3 tasks | 9 files |
| Phase 02 P03 | 10min | 3 tasks | 12 files |
| Phase 02 P04 | 9 min | 3 tasks | 12 files |

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
- [Phase 02]: Boot fail-closed: validateEnv (ConfigModule.forRoot validate) delega a parseAuthConfig puro; JWT_SECRET >= 32, DEV_AUTH_ENABLED solo === 'true' e vietato in production, Twitch opzionale (twitch: null), APP_AUTH_REDIRECT_URL solo deep link
- [Phase 02]: Identità User: indice unico su twitchId + findOneAndUpdate upsert atomico con un solo retry su E11000 (findOrCreateByTwitchId / upsertWithRole)
- [Phase 02]: Sessioni BE: solo sha256 del refresh token opaco; rotate atomico (current → grace 30s ancorata alla prima rotazione); riuso fuori grace revoca l'intera sessione (SESSION_REVOKED); ogni query filtra revokedAt null + expiresAt > now
- [Phase 02]: Riferimenti ObjectId nei @Prop: usare MongooseSchema.Types.ObjectId (Types.ObjectId diventa Mixed in Mongoose 8, niente cast)
- [Phase 02]: D-32: TwitchIdIndexVerifier al boot logga i twitchId duplicati se l'indice unico non si costruisce, senza bloccare l'avvio
- [Phase 02]: Single AuthIdentityResolver (dev strategy first, then HS256 session JWT) is the only bearer-to-identity path for HTTP, REST and WS
- [Phase 02]: graphql-ws onConnect returns false on any auth failure (close 4403), per-socket timer closes 4401 'Token expired' at JWT exp
- [Phase 02]: Login ticket monouso: findOneAndDelete atomico con filtro expiresAt > now, consumato prima del controllo S256 del verifier; a DB solo sha256
- [Phase 02]: TwitchOAuthClient classe astratta come token DI; HttpTwitchOAuthClient normalizza ogni errore (status, rete, timeout, JSON) in TwitchOAuthError senza code/token/secret

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Conteggio requirement: REQUIREMENTS.md riporta "38 total" nella riga di summary, ma l'enumerazione effettiva dei BE-* ID è **42** (AUTH ha 6, ATOM ha 5, ecc.). La roadmap mappa tutti i 42. La riga di summary in REQUIREMENTS.md è stata corretta a 42.
- Research flags da approfondire in planning: Phase 1 (replica-set CI flakiness), Phase 2 (context graphql-ws #1756), Phase 6 (Twitch Helix subscription lifecycle).
- Verificare topologia MongoDB prod (replica set?) prima del layer transazioni; runtime Node prod (18/20 vs 22) per firebase-admin 13 vs 14; policy Redis prod (eviction dei delayed job Bull).

## Session Continuity

Last session: 2026-10-06T18:01:38.476Z
Stopped at: Completed 02-04-PLAN.md
Resume file: None
