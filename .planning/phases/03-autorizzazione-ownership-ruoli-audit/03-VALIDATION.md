---
phase: 3
slug: autorizzazione-ownership-ruoli-audit
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-14
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29, progetti `unit` / `integration` (`package.json` → `jest.projects`) |
| **Config file** | `package.json`; setup integration in `test/setup/{global-setup,global-teardown,after-env,mongo-replset,redis}.ts` |
| **Quick run command** | `npx jest src/authz src/graphql src/auth src/users src/mongo --selectProjects unit` |
| **Full suite command** | `npm test` (= `test:unit` + `test:int --runInBand`) |
| **Estimated runtime** | unit ~5 s; singolo int-spec 10-40 s (replica set + WS reali); suite completa alcuni minuti |

Trappole di tooling (vincolanti): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI `npm run lint` (solo `npx prettier --write <file>` + `npx eslint <file>`); `src/schema.gql` si rigenera con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e si committa.

---

## Sampling Rate

- **After every task commit:** quick run unit + il singolo int-spec toccato (`npx jest <file> --selectProjects integration --runInBand`)
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** `npm test` verde, `npm run build` ok, `git diff --exit-code src/schema.gql`
- **Max feedback latency:** ~40 s per task (int-spec WS)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | BE-SYNC-01 | T-03-01a | payload PubSub tipizzati `{ characterUpdated }` / `{ userUpdated }` | integration | `npx jest test/harness/character-changestream.int-spec.ts --selectProjects integration --runInBand` | ✅ (da modificare) | ⬜ pending |
| 3-01-02 | 01 | 1 | BE-SYNC-02, BE-AUTHZ-03 | T-03-14a, T-03-11a | harness con PUB_SUB, helper WS multi-evento, fixture senza dev bypass | integration | `npx jest test/auth/auth-test-app.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) | ⬜ pending |
| 3-02-01 | 02 | 1 | BE-AUTHZ-01 | — | identità letta in un solo punto (HTTP/WS) | unit | `npx jest src/auth/request-identity.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | BE-AUTHZ-01, BE-AUTHZ-03 | T-03-13 | `extensions` esattamente `{ code: FORBIDDEN/NOT_FOUND }` | unit | `npx jest src/authz src/graphql/format-domain-error.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | BE-SYNC-02 | T-03-11, T-03-02a | snapshot → eventi durante lo snapshot → live; teardown immediato | unit | `npx jest src/graphql/subscribe-with-snapshot.spec.ts src/mongo/document-id.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | BE-SYNC-01 | T-03-13b | change stream users → userUpdated; no-op del login senza eventi | integration | `npx jest src/users/user-updates.publisher.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | BE-SYNC-01, BE-SYNC-02, BE-AUTHZ-03 | T-03-03, T-03-03b | userUpdated senza argomenti, filtro su identity.userId, snapshot | integration (WS reale) | `npx jest src/users/user-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 2 | BE-AUTHZ-01, BE-AUTHZ-03 | T-03-01, T-03-16, T-03-10 | owner/onBehalf/FORBIDDEN/NOT_FOUND con una lettura users; filtro evento fail-closed | unit | `npx jest src/authz/ownership/character-access.policy.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-04-02 | 04 | 2 | BE-AUTHZ-01 | T-03-01b, T-03-06a | guard dichiarativo, decisione on-behalf su `info`, fail-closed fuori da GraphQL | unit | `npx jest src/authz/ownership --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 3 | BE-AUTHZ-03 | T-03-02 | (RED) specifica WS della subscription protetta | integration (WS reale) | `! npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-05-02 | 05 | 3 | BE-AUTHZ-03, BE-SYNC-02 | T-03-02, T-03-17 | FORBIDDEN alla subscribe prima dello snapshot; innkeeper ammesso; filtro per evento | integration (WS reale) | `npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-05-03 | 05 | 3 | BE-SYNC-01, BE-AUTHZ-03 | T-03-19 | schema.gql con il contratto real-time committato; handoff wave 1 | integration (boot reale) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ (da estendere) | ⬜ pending |
| 3-06-01 | 06 | 4 | BE-AUTHZ-02 | T-03-04b, T-03-08 | @Roles: innkeeper passa, adventurer/guard FORBIDDEN, senza identità UNAUTHENTICATED | unit | `npx jest src/authz/roles/roles.guard.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-06-02 | 06 | 4 | BE-AUTHZ-02 | T-03-04, T-03-05 | users/user innkeeper-only; CRUD utenti rimosso dallo schema | integration | `npx jest src/users/users-authz.int-spec.ts test/auth/http-guard.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-07-01 | 07 | 5 | BE-AUTHZ-01 | T-03-01 | (RED) specifica ownership delle 7 operazioni | integration | `! npx jest src/characters/characters-ownership.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-07-02 | 07 | 5 | BE-AUTHZ-01, BE-AUTHZ-02 | T-03-01, T-03-01c, T-03-05b, T-03-13d | altrui → FORBIDDEN e DB invariato; innkeeper esente; NOT_FOUND tipizzato | integration | `npx jest src/characters/characters-ownership.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-08-01 | 08 | 5 | BE-AUTHZ-01 | T-03-01d, T-03-16c | pending quest risolta dal personaggio del bearer | unit | `npx jest src/authz/ownership --selectProjects unit` | ✅ (da estendere) | ⬜ pending |
| 3-08-02 | 08 | 5 | BE-AUTHZ-01, BE-AUTHZ-02 | T-03-01d, T-03-05c | pendingQuest(id) owner/innkeeper; pendingQuests innkeeper-only | integration | `npx jest src/pendingQuests/pending-quests-authz.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-09-01 | 09 | 6 | BE-AUTHZ-04 | T-03-07, T-03-13e, T-03-15 | TTL 90 giorni; scrittura best-effort che non lancia | unit | `npx jest src/authz/audit/admin-audit-log.service.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-09-02 | 09 | 6 | BE-AUTHZ-04 | T-03-06 | solo Mutation @Roles(innkeeper) o on-behalf; outcome ok/codice | unit | `npx jest src/authz/audit/admin-audit.interceptor.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 3-09-03 | 09 | 6 | BE-AUTHZ-04, BE-AUTHZ-01, BE-AUTHZ-02 | T-03-06, T-03-07b, T-03-14 | record persistente sul wire; esito invariato se l'audit fallisce; indice TTL in collection | integration | `npx jest src/authz/audit/admin-audit.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 3-10-01 | 10 | 7 | BE-AUTHZ-01..04, BE-SYNC-01/02 | T-03-18, T-03-14b, T-03-SCHEMA | whitelist enumerate @Roles/@Owns*; nessun drift di schema; gate completo | integration (boot reale) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && npm test && npm run build` | ✅ (da estendere) | ⬜ pending |
| 3-10-02 | 10 | 7 | BE-SYNC-01, BE-SYNC-02, BE-AUTHZ-03 | T-03-19 | handoff FE completo (no retry su FORBIDDEN, domande 1-5) | grep | `grep -q "Risposte alle domande aperte del FE" .planning/phases/03-autorizzazione-ownership-ruoli-audit/BACKEND-NOTES.md` | ✅ (bozza) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/auth/auth-test-app.ts` — `PubSubModule` tra gli import di base (plan 03-01, Pitfall 1)
- [ ] `test/auth/ws-test-client.ts` — `openSubscription`, `expectSilence`, `withTimeout` (plan 03-01)
- [ ] `test/authz/player-fixture.ts` — `createPlayer` (plan 03-01)
- [ ] `src/pubsub.module.ts` + `test/harness/character-changestream.int-spec.ts` + `CharactersService` allineati (plan 03-01, Pitfall 7)
- [ ] `test/authz/characters-test-app.ts` — CharactersService/Resolver senza Redis (plan 03-05, Pitfall 8)
- [ ] `test/authz/admin-probe.resolver.ts` — mutation/query `@Roles` solo-test (plan 03-09)
- [ ] Spec RED: `request-identity.spec.ts`, `authorization.exception.spec.ts`, `resource-not-found.exception.spec.ts`, `subscribe-with-snapshot.spec.ts`, `document-id.spec.ts`, `character-access.policy.spec.ts`, `ownership.guard.spec.ts`, `authorization-decisions.spec.ts`, `roles.guard.spec.ts`, `admin-audit-log.service.spec.ts`, `admin-audit.interceptor.spec.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E con l'app Flutter reale contro il BE del branch (snapshot al connect, live twitchPoints/role/status, reconnect dopo 4401, FORBIDDEN senza retry) | BE-SYNC-01, BE-SYNC-02, BE-AUTHZ-03 | richiede l'app FE della Phase 3 e un device/emulatore | eseguito dal FE nel proprio ultimo plan seguendo `BACKEND-NOTES.md` §8; il BE è coperto dai test WS reali |
| Scadenza effettiva dei record di audit dopo 90 giorni | BE-AUTHZ-04 | il monitor TTL di MongoDB agisce in tempo reale (~60 s) e non è accelerabile | coperto dall'asserzione dell'indice `{ at: 1 }` con `expireAfterSeconds: 7776000` su schema e collection |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 3s (non realistico per gli int-spec WS su replica set: ~10-40 s per task, accettato)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
