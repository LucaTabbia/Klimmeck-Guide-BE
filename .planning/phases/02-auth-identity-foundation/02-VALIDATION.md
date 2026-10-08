---
phase: 2
slug: auth-identity-foundation
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Fonte: `02-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29, projects `unit` / `integration` (`package.json`) |
| **Config file** | `package.json` → `jest.projects`; setup integration in `test/setup/*` (MongoMemoryReplSet condiviso, Phase 1) |
| **Quick run command** | `npx jest --selectProjects unit src/auth src/config` |
| **Full suite command** | `npm test` (= `test:unit` + `test:int --runInBand`) |
| **Estimated runtime** | ~90 seconds (full suite) |

Nessuna chiave Twitch reale è richiesta: il client Twitch è un fake iniettabile (CONTEXT D-21).

---

## Sampling Rate

- **After every task commit:** Run `npx jest --selectProjects unit src/auth src/config` (+ il singolo int-spec toccato dal task)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm run lint && npm test` verdi
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> ID task = `<plan>-T<n>` (es. `02-03-T2` = plan 02-03, Task 2). Comandi eseguiti dalla root del repo.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | BE-AUTH-06, BE-AUTH-01 | T-2-timing | `AuthException` porta `extensions.code`; `safeEqual` su digest (nessun RangeError); S256 conforme RFC 7636; deps pinnate (`@nestjs/jwt@^11`) | unit | `npx jest --selectProjects unit src/auth/auth.exception.spec.ts src/auth/crypto` | ❌ W0 | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | BE-AUTH-05, BE-AUTH-04 | T-2-bypass-prod, T-2-weak-secret, T-2-open-redirect | `validateEnv` rifiuta `DEV_AUTH_ENABLED=true` + `NODE_ENV=production`; `JWT_SECRET` mancante/< 32 → throw; `TWITCH_*` mancanti → ok (`twitch: null`); `APP_AUTH_REDIRECT_URL` http(s) → throw; `.env.example` completo | unit | `npx jest --selectProjects unit src/config` | ❌ W0 | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | BE-AUTH-01 | T-2-dup-identity | Indice unico `twitchId`; upsert atomici (5 concorrenti → 1 documento) | integration | `npx jest --selectProjects integration --runInBand src/users/users.service.int-spec.ts` | ❌ W0 | ⬜ pending |
| 02-02-T1 | 02-02 | 2 | BE-AUTH-01 | T-2-refresh-at-rest | Sessione salva solo `sha256` del refresh token; TTL index `expiresAt` | integration | `npx jest --selectProjects integration --runInBand src/auth/session` | ❌ W0 | ⬜ pending |
| 02-02-T2 | 02-02 | 2 | BE-AUTH-01 | T-2-refresh-reuse, T-2-refresh-race | Rotazione; grace 30 s; riuso fuori grace → `SESSION_REVOKED` + revoca; sconosciuto/scaduto → `SESSION_EXPIRED`; rotate concorrenti → una sola sessione | integration | `npx jest --selectProjects integration --runInBand src/auth/session` | ❌ W0 | ⬜ pending |
| 02-02-T3 | 02-02 | 2 | BE-AUTH-01 | T-2-dup-identity | Indice `users.twitchId` non costruibile → errore al boot con elenco duplicati | integration | `npx jest --selectProjects integration --runInBand src/users` | ❌ W0 | ⬜ pending |
| 02-03-T1 | 02-03 | 2 | BE-AUTH-02 | T-2-token-confusion | Access JWT HS256 `aud`/`iss` verificati; state OAuth, `alg: none`, scaduto, firma errata → `UNAUTHENTICATED` | unit | `npx jest --selectProjects unit src/auth/token src/auth/bearer-token.spec.ts` | ❌ W0 | ⬜ pending |
| 02-03-T2 | 02-03 | 2 | BE-AUTH-05, BE-AUTH-02 | T-2-bypass-prod, T-2-timing | Strategia dev: token giusto → identità stub reale a DB; lunghezza diversa → null senza eccezioni; `NODE_ENV=production` a runtime → null; resolver unico dev → JWT | unit + integration | `npx jest --selectProjects unit src/auth/dev src/auth/auth-identity.resolver.spec.ts && npx jest --selectProjects integration --runInBand src/auth/dev` | ❌ W0 | ⬜ pending |
| 02-03-T3 | 02-03 | 2 | BE-AUTH-03 | T-2-ws-unauth, T-2-ws-error-leak, T-2-ws-expiry | `onConnect` → `false` (mai throw); timer → `close(4401, 'Token expired')`; `onClose` cancella il timer; dev senza timer | unit (fake timers) | `npx jest --selectProjects unit src/auth/ws` | ❌ W0 | ⬜ pending |
| 02-04-T1 | 02-04 | 2 | BE-AUTH-01 | T-2-ticket-replay, T-2-deeplink-hijack | Ticket monouso (`findOneAndDelete`), TTL 60 s, verifier S256 obbligatorio, consumato anche con verifier errato, riscatti concorrenti → 1 successo | integration | `npx jest --selectProjects integration --runInBand src/auth/login-ticket` | ❌ W0 | ⬜ pending |
| 02-04-T2 | 02-04 | 2 | BE-AUTH-01 | T-2-secret-leak, T-2-twitch-dos | Client Twitch form-urlencoded, stesso `redirect_uri`, timeout, errori senza code/secret; fetch sempre mockato | unit | `npx jest --selectProjects unit src/auth/twitch/http-twitch-oauth.client.spec.ts` | ❌ W0 | ⬜ pending |
| 02-04-T3 | 02-04 | 2 | BE-AUTH-01 | T-2-oauth-csrf, T-2-open-redirect | Authorize URL con `response_type=code`, `scope=` vuoto, `force_verify=true`, `state` firmato con audience dedicata; state invalido → null | unit | `npx jest --selectProjects unit src/auth/twitch` | ❌ W0 | ⬜ pending |
| 02-05-T1 | 02-05 | 3 | BE-AUTH-05 | T-2-log-leak | Warning di boot per dev bypass e Twitch non configurato senza secret; AuthModule avviabile con fake Twitch | unit + integration | `npx jest --selectProjects unit src/auth/auth-startup.reporter.spec.ts && npx jest --selectProjects integration --runInBand src/auth/auth.module.int-spec.ts` | ❌ W0 | ⬜ pending |
| 02-05-T2 | 02-05 | 3 | BE-AUTH-01 | T-2-ticket-replay | `AuthSession` emessa al riscatto; refresh rilegge il ruolo (D-10); logout revoca | integration | `npx jest --selectProjects integration --runInBand src/auth/auth-session.service.int-spec.ts` | ❌ W0 | ⬜ pending |
| 02-05-T3 | 02-05 | 3 | BE-AUTH-01 | T-2-oauth-csrf, T-2-client-mismatch | `start` senza Twitch → 302 `error=twitch_not_configured`; callback con fake → upsert User → 302 `ticket=`; `client_id` diverso / `access_denied` / state invalido / exchange fallito → errore tipizzato; revoke fallito non blocca | integration | `npx jest --selectProjects integration --runInBand src/auth/twitch` | ❌ W0 | ⬜ pending |
| 02-06-T1 | 02-06 | 4 | BE-AUTH-03 | T-2-ws-unauth, T-2-error-leak | Factory GraphQL condivisa (onConnect/onClose, context unico, `formatAuthError`), `installSubscriptionHandlers` rimosso | unit | `npx jest --selectProjects unit src/graphql src/auth/format-auth-error.spec.ts` | ❌ W0 | ⬜ pending |
| 02-06-T2 | 02-06 | 4 | BE-AUTH-01 | T-2-ticket-replay, T-2-refresh-reuse | `exchangeLoginTicket`: verifier giusto → `AuthSession`; secondo riscatto / verifier errato / scaduto → `LOGIN_TICKET_INVALID`; `refreshSession` → `SESSION_REVOKED`/`SESSION_EXPIRED` sul wire senza stacktrace | integration | `npx jest --selectProjects integration --runInBand src/auth` | ❌ W0 | ⬜ pending |
| 02-06-T3 | 02-06 | 4 | BE-AUTH-01, BE-AUTH-05 | — | Vero AppModule si avvia con solo `JWT_SECRET` (nessuna chiave Twitch); schema rigenerato | integration (boot reale) | `npx jest --selectProjects integration --runInBand test/app.int-spec.ts` | ❌ W0 | ⬜ pending |
| 02-07-T1 | 02-07 | 5 | BE-AUTH-02, BE-AUTH-06 | T-2-unauth-access, T-2-ws-guard-bypass | Guard transport-aware: `@Public` passa; http/graphql via bearer; WS via `extra.identity` con re-check `expiresAt` | unit | `npx jest --selectProjects unit src/auth/guards src/app.controller.spec.ts` | ❌ W0 | ⬜ pending |
| 02-07-T2 | 02-07 | 5 | BE-AUTH-02, BE-AUTH-05, BE-AUTH-06 | T-2-unauth-access, T-2-rest-open, T-2-token-confusion | Operazione senza bearer → `UNAUTHENTICATED`; `@Public` raggiunge il resolver; `GET /` 200; state come bearer → rifiutato; `POST /cloudinary/*` senza token → 401 JSON, con token → service chiamato; dev token su HTTP/REST; `me` dall'identità; login completo | integration (supertest) | `npx jest --selectProjects integration --runInBand test/auth/http-guard test/auth/login-flow` | ❌ W0 | ⬜ pending |
| 02-07-T3 | 02-07 | 5 | BE-AUTH-02, BE-AUTH-06 | T-2-public-drift | Sul vero AppModule esattamente 5 handler `@Public`; resolver esistenti e Cloudinary protetti; introspection pubblica (limite noto) | integration (boot reale) | `npx jest --selectProjects integration --runInBand test/app.int-spec.ts` | ❌ W0 | ⬜ pending |
| 02-08-T1 | 02-08 | 6 | BE-AUTH-03, BE-AUTH-05 | T-2-ws-unauth, T-2-ws-expiry, T-2-legacy-channel | WS senza token / invalido / scaduto / state → close 4403; valido → `connection_ack` + identità nel resolver (`authProbe`); scadenza → close 4401; dev token su WS; legacy subprotocol senza ack; nessun timer pendente | integration (ws reale) | `npx jest --selectProjects integration --runInBand --detectOpenHandles test/auth/ws-auth` | ❌ W0 | ⬜ pending |
| 02-08-T2 | 02-08 | 6 | BE-AUTH-03 | T-2-schema-drift, T-2-secret-leak | CI: build + schema committato aggiornato, nessun secret nel workflow | ci + suite | `npm run build && npm test && git diff --exit-code src/schema.gql` | ❌ W0 | ⬜ pending |
| 02-09-T1 | 02-09 | 7 | BE-AUTH-04 | T-2-contract-drift | `BACKEND-NOTES.md` con login, sessione, HTTP, WS, codici | grep | `grep -c "connection_init\|SESSION_REVOKED\|4401\|4403\|PKCE" .planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 02-09-T2 | 02-09 | 7 | BE-AUTH-04, BE-AUTH-05 | T-2-secret-leak | Dev bypass `.env`, console Twitch, limiti noti, deploy note duplicati, coerenza con schema e `.env.example` | grep | verify del Task 2 in `02-09-PLAN.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install: `@nestjs/jwt@^11.0.2`, `@apollo/server@4.12.2`, `graphql-ws@6.0.6` (exact) (dependencies); `ws@8.18.3`, `@types/ws` (devDependencies) → 02-01-T1
- [ ] `.prettierrc` `tabWidth: 4` (allinea prettier alla convenzione a 4 spazi) → 02-01-T1
- [ ] `test/auth/test-auth-config.ts` (`buildTestAuthConfig`) e `test/auth/fixed-clock.ts` (`FixedClock`) → 02-01-T1/T2
- [ ] `test/fixtures/session.fixture.ts` — `buildSession` / `persistSession` → 02-02-T1
- [ ] `test/auth/auth-test-app.ts` — builder app di test (Mongo replSet, `ignoreEnvFile`, `AUTH_CONFIG` di test con access TTL configurabile, fake Twitch, Cloudinary mock, `listen(0)`, pulizia collection via `getConnectionToken()`) → 02-05-T1, esteso con GraphQL in 02-06-T2 e con `providers` extra
- [ ] `test/auth/fake-twitch-oauth.client.ts` — fake configurabile → 02-05-T1
- [ ] `src/graphql/graphql-options.factory.ts` estratto prima dei test WS → 02-06-T1
- [ ] `test/auth/auth-probe.resolver.ts` (`whoAmI` + `authProbe`) e `test/auth/test-tokens.ts` → 02-07-T2
- [ ] `test/auth/ws-test-client.ts` — helper raw ws (close code) + `subscribeOnce` con `createClient` → 02-08-T1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login Twitch reale end-to-end (authorize → callback → ticket) | BE-AUTH-01 | Richiede `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` reali e un redirect URL registrato: **le chiavi non sono ancora disponibili** | Quando arrivano le chiavi: registrare il redirect URL nella console Twitch, valorizzare `TWITCH_*` in `.env`, aprire `GET /auth/twitch/start?challenge=<S256>` in un browser e verificare il 302 finale verso `klimmeck://auth?ticket=…`; confermare che `scope=` vuoto è accettato (Assumption A1) |
| Duplicati su `User.twitchId` nei dati esistenti prima del deploy dell'indice unico | BE-AUTH-01 | Dipende dai dati reali di dev/staging | Eseguire l'aggregazione di controllo documentata in `BACKEND-NOTES.md` prima del primo avvio con l'indice |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
