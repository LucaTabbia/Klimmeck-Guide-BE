---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 02-10-PLAN.md
last_updated: "2026-10-06T21:02:11.957Z"
last_activity: 2026-10-06
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 15
  completed_plans: 15
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Current focus:** Phase 3 — autorizzazione-ownership-ruoli-audit (da discutere/pianificare)

## Current Position

Phase: 3
Plan: Not started
Status: Phase 2 complete — verifier 5/5, human UAT pending (02-HUMAN-UAT.md); Phase 3 not started
Last activity: 2026-10-06

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 2 | 9 | - | - |

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
| Phase 02 P05 | 10 min | 3 tasks | 13 files |
| Phase 02 P06 | 8 min | 3 tasks | 16 files |
| Phase 02 P07 | 7 min | 3 tasks | 12 files |
| Phase 02 P08 | 6 min | 2 tasks | 3 files |
| Phase 02 P09 | 7 min | 2 tasks | 1 files |
| Phase 02 P10 | 9 min | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Test con mongodb-memory-server in modalità replica set (change stream + transazioni); Bull mockato al confine DI negli unit + Redis effimero reale nei processor test (ioredis-mock NON viabile per Bull).
- [Phase 2]: Auth = JWT di sessione proprio; il login Twitch è **mediato dal BE** (authorization code scambiato lato server + login ticket monouso legato a challenge S256 — Twitch non supporta PKCE e richiede `client_secret`, D-01); dev bypass fail-closed compatibile con lo stub FE `DEV_AUTH_ACCESS_TOKEN`.
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
- [Phase 02]: AuthModule not imported by AppModule until 02-06; Twitch REST flow always 302s to config.appAuthRedirectUrl with typed error codes
- [Phase 02]: Auth integration tests use createAuthTestApp (isolated Nest app, fake Twitch, shared auth-test DB dropped on close)
- [Phase 02]: AppModule and auth test harness share createGraphQLOptions (forRootAsync + WsConnectionAuthenticator hooks); installSubscriptionHandlers removed
- [Phase 02]: formatAuthError restores AuthErrorCode on the wire and strips originalError/stacktrace
- [Phase 02]: Real AppModule boot test loads AppModule via jest.requireActual after setting env (native import() unsupported in Jest CJS)
- [Phase 02]: AuthGuard is a deny-by-default APP_GUARD; the WS branch trusts only extra.identity (re-checking expiresAt), HTTP/REST reuse AuthIdentityResolver.resolveBearer
- [Phase 02]: Public whitelist is exactly 5 handlers (AppController.getHello, AuthResolver.exchangeLoginTicket/refreshSession, TwitchAuthController.start/callback), asserted on the real AppModule
- [Phase 02]: WS auth contract proven on real sockets: 4403 Forbidden at connect, 4401 Token expired on live socket; legacy graphql-ws subprotocol never acknowledged (client sees 1006, server closes 4406)
- [Phase 02]: CI builds the project and fails if committed src/schema.gql differs from the one regenerated by the real-boot test
- [Phase 02]: BACKEND-NOTES: malformed/unknown refresh token answers SESSION_EXPIRED; only SESSION_EXPIRED/SESSION_REVOKED are terminal on refresh
- [Phase 02]: D-35 implemented (02-10): previous refresh token inside the 30 s grace gets the current token back (derived HKDF+HMAC, verified against hash, no write); unrebuildable token -> SESSION_EXPIRED without revoke

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Conteggio requirement: REQUIREMENTS.md riporta "38 total" nella riga di summary, ma l'enumerazione effettiva dei BE-* ID è **42** (AUTH ha 6, ATOM ha 5, ecc.). La roadmap mappa tutti i 42. La riga di summary in REQUIREMENTS.md è stata corretta a 42.
- Research flags da approfondire in planning: Phase 1 (replica-set CI flakiness), Phase 2 (context graphql-ws #1756), Phase 6 (Twitch Helix subscription lifecycle).
- Verificare topologia MongoDB prod (replica set?) prima del layer transazioni; runtime Node prod (18/20 vs 22) per firebase-admin 13 vs 14; policy Redis prod (eviction dei delayed job Bull).
- **Phase 2 — decisione D-26 in sospeso (finestra di grazia del refresh):** la variante attuale (30 s) ha un caso limite documentato (richiesta bloccata + retry → rotazioni in ordine inverso → logout forzato al refresh successivo; fail-closed). Opzioni A/B/C in `02-HUMAN-UAT.md` §4 e `BACKEND-NOTES.md` §9 (j). Le varianti A e B richiedono un plan di gap-closure.
- **Phase 2 — UAT umane pendenti** (`02-HUMAN-UAT.md`): login Twitch reale (chiavi non ancora disponibili), pipeline GitHub Actions reale, controllo duplicati `twitchId` sui dati reali.
- **Branch non pushati:** `feat/01-fondazione-test-consolidamento-spell-wip` e `feat/02-auth-identity-foundation` (la Phase 2 poggia sulla Phase 1, non ancora su `develop`); PR da aprire a mano verso `develop`.
- `JWT_SECRET` (≥ 32 caratteri) è ora obbligatoria al boot su ogni ambiente; righe `.env` per il dev bypass in `BACKEND-NOTES.md` §7.

## Session Continuity

Last session: 2026-10-06T21:02:11.954Z
Stopped at: Completed 02-10-PLAN.md
Resume file: None
