---
phase: 2
slug: auth-identity-foundation
status: draft
nyquist_compliant: false
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

> Gli ID task vengono assegnati dal planner; questa mappa è a livello di requisito e va raffinata nei PLAN.md.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | BE-AUTH-05 | T-2-bypass-prod | `validateEnv` rifiuta `DEV_AUTH_ENABLED=true` con `NODE_ENV=production`; `JWT_SECRET` mancante/corto → throw; `TWITCH_*` mancanti → ok | unit | `npx jest --selectProjects unit src/config` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-05 | T-2-bypass-prod | Strategia dev: token giusto → identità stub reale a DB; lunghezza diversa → null senza eccezioni; produzione a runtime → null | unit + integration | `npx jest src/auth/dev` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-01 | T-2-oauth-csrf | Authorize URL con `response_type=code`, `scope=` vuoto, `force_verify=true`, `state` firmato con audience dedicata | unit | `npx jest --selectProjects unit src/auth/twitch` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-01 | T-2-oauth-csrf | `start` senza Twitch configurato → 302 `error=twitch_not_configured`; callback con fake client → upsert User → 302 `ticket=`; `client_id` diverso / `access_denied` / state invalido → errore tipizzato | integration | `npx jest --selectProjects integration --runInBand src/auth/twitch` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-01 | T-2-ticket-replay | `exchangeLoginTicket`: verifier giusto → `AuthSession`; secondo riscatto / verifier errato / scaduto → `LOGIN_TICKET_INVALID` | integration | `npx jest --selectProjects integration --runInBand src/auth` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-01 | T-2-refresh-reuse | `refreshSession`: rotazione, solo hash a DB, riuso fuori grace → `SESSION_REVOKED`; sconosciuto/scaduto → `SESSION_EXPIRED`; `logout` revoca | integration | `npx jest --selectProjects integration --runInBand src/auth/session` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-02 | T-2-unauth-access | Operazione senza bearer → `extensions.code === 'UNAUTHENTICATED'`; `@Public` raggiunge il resolver; `GET /` 200; `state` usato come bearer → rifiutato | integration (supertest) | `npx jest --selectProjects integration --runInBand test/auth/http-guard` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-02, BE-AUTH-06 | T-2-rest-open | `POST /cloudinary/*` senza token → 401 JSON; con token → service mock chiamato | integration | `npx jest --selectProjects integration --runInBand test/auth/http-guard` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-03 | T-2-ws-unauth | WS senza token / invalido / scaduto → close 4403; valido → `connection_ack` + identità nel resolver; scadenza → close 4401; nessun timer pendente | integration (ws reale) | `npx jest --selectProjects integration --runInBand test/auth/ws-auth` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-06 | — | `me` restituisce lo User dell'identità; `@CurrentUser` uniforme HTTP/WS | integration | `npx jest --selectProjects integration --runInBand test/auth` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BE-AUTH-04 | — | `BACKEND-NOTES.md` presente con contratto completo | grep | `grep -c "connection_init\|SESSION_REVOKED\|4401\|4403\|PKCE" .planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install: `@nestjs/jwt@^11.0.2`, `graphql-ws@6.0.6` (dependencies); `ws`, `@types/ws` (devDependencies)
- [ ] `test/auth/auth-test-app.ts` — builder dell'app di test (Mongo replSet, `ignoreEnvFile`, config auth di test con access TTL configurabile, fake Twitch, Cloudinary mock, `listen(0)`, pulizia collection via `getConnectionToken()`)
- [ ] `test/auth/fake-twitch-oauth.client.ts` — fake configurabile
- [ ] `test/auth/ws-test-client.ts` — helper raw ws per i close code + factory client graphql-ws
- [ ] `test/auth/auth-probe.resolver.ts` — subscription/query di sonda solo per test
- [ ] `test/fixtures/session.fixture.ts` — `buildSession` / `persistSession`
- [ ] Options factory GraphQL condivisa estratta prima dei test WS

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login Twitch reale end-to-end (authorize → callback → ticket) | BE-AUTH-01 | Richiede `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` reali e un redirect URL registrato: **le chiavi non sono ancora disponibili** | Quando arrivano le chiavi: registrare il redirect URL nella console Twitch, valorizzare `TWITCH_*` in `.env`, aprire `GET /auth/twitch/start?challenge=<S256>` in un browser e verificare il 302 finale verso `klimmeck://auth?ticket=…`; confermare che `scope=` vuoto è accettato (Assumption A1) |
| Duplicati su `User.twitchId` nei dati esistenti prima del deploy dell'indice unico | BE-AUTH-01 | Dipende dai dati reali di dev/staging | Eseguire l'aggregazione di controllo documentata in `BACKEND-NOTES.md` prima del primo avvio con l'indice |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
