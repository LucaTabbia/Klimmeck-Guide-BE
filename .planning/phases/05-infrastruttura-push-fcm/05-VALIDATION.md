---
phase: 05
slug: infrastruttura-push-fcm
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-18
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29, projects `unit` (`*.spec.ts`) / `integration` (`*.int-spec.ts`, MongoMemoryReplSet condiviso via `test/setup/{global-setup,global-teardown,after-env,mongo-replset,redis}.ts`) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest src/push src/config --selectProjects unit` |
| **Full suite command** | `npm test` (= `test:unit` + `test:int --runInBand`) |
| **Estimated runtime** | unit ~5 s; int-spec singolo ~3–10 s; `npm test` ~2 min |

Trappole di tooling (vincolanti, 02.1 D-14 / 05-RESEARCH Pitfall 20): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI `npm run lint` (solo `npx prettier --write <file>` + `npx eslint <file>` sui file toccati); `src/schema.gql` si rigenera con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e deve restare committato senza drift (D-14); firebase-admin mai contattato nei test (porta `PushTransport` + fake, D-07); `test/app.int-spec.ts` con `FIREBASE_SERVICE_ACCOUNT: ''` nell'env e `sendTestPush` nella whitelist innkeeper (Pitfall 11); nessun file service-account committato (Pitfall 18).

---

## Sampling Rate

- **After every task commit:** Run `npx jest <touched unit specs> --selectProjects unit` + the single touched int-spec with `--selectProjects integration --runInBand`
- **After every plan wave:** Run `npx jest src/push src/config --selectProjects unit` + `npx jest src/push --selectProjects integration --runInBand`
- **Before `/gsd-verify-work`:** Full suite must be green (`npm test`), `npm run build`, `npx eslint <touched files>`, `git diff --exit-code src/schema.gql`, `git ls-files | grep -iE 'service-?account|adminsdk'` vuoto
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 05-01 | 1 | BE-NOTIF-02 (D-05, D-17) | T-05-02, T-05-05 | firebase-admin ^14.5.0 + engines >=22; service account ignorati da git | build/CLI | `npm ls firebase-admin \| grep firebase-admin@14. && git check-ignore -q service-account.json && npm run build` | n/a (config) | ⬜ pending |
| 05-01-T2 | 05-01 | 1 | BE-NOTIF-02 (D-06) | T-05-01, T-05-04 | parser fail-closed; nessun messaggio riecheggia valore o chiave | unit | `npx jest src/config --selectProjects unit` | ❌ W0 → creato nel task (RED) | ⬜ pending |
| 05-01-T3 | 05-01 | 1 | BE-NOTIF-02 (D-06, D-17) | T-05-03 | production senza variabile → boot rifiutato; `.env.example` vuota | unit | `npx jest src/config --selectProjects unit` | ✅ estende env.validation.spec.ts | ⬜ pending |
| 05-02-T1 | 05-02 | 1 | BE-NOTIF-01 (D-02, D-13) | T-05-08 | codici stabili PUSH_*, messaggi italiani costanti | unit | `npx jest src/push/push.exception.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-02-T2 | 05-02 | 1 | BE-NOTIF-01 (D-02) | T-05-06, T-05-09 | validazione autoritativa deviceId/token; nessun userId in input | unit | `npx jest src/push/push-device-input.validator.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-02-T3 | 05-02 | 1 | BE-NOTIF-03 (D-10, D-11, D-12) | T-05-07 | catalogo unico, solo tipo/id/copy, streamerLive senza id | unit | `npx jest src/push/push-events.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-03-T1 | 05-03 | 2 | BE-NOTIF-02 (D-07) | T-05-13 | porta + no-op (enabled=false) + FakePushTransport condiviso | unit | `npx jest src/push/transport/noop-push-transport.spec.ts --selectProjects unit` | ❌ W0 → crea test/push/fake-push-transport.ts | ⬜ pending |
| 05-03-T2 | 05-03 | 2 | BE-NOTIF-03 (D-10, D-11) | T-05-12 | data-only, valori stringa, APNs background priority 5, scadenze in unità corrette | unit | `npx jest src/push/transport/fcm-message.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-03-T3 | 05-03 | 2 | BE-NOTIF-02 (D-05, D-07, D-08) | T-05-10, T-05-11, T-05-13 | esito per-token, mai throw sugli invii, connect offline idempotente, log senza token | unit | `npx jest src/push/transport/fcm-push-transport.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-04-T1 | 05-04 | 2 | BE-NOTIF-01 SC1 (D-01, D-03, D-04) | T-05-15, T-05-16, T-05-17, T-05-18, T-05-20 | 1 riga per device, 1 riga per token anche in concorrenza, userId ObjectId, TTL 23 328 000 s | integration | `npx jest src/push/push-device.registry.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → creato nel task | ⬜ pending |
| 05-04-T2 | 05-04 | 2 | BE-NOTIF-01 (D-01) | T-05-19 | build indici fallita → ERROR senza token, boot non bloccato | unit | `npx jest src/push/push-device-index.verifier.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-05-T1 | 05-05 | 3 | BE-NOTIF-01 SC3 (D-08) | T-05-21 | pruning solo su not-registered/invalid-registration; invalid-argument solo con testimone | unit | `npx jest src/push/push-delivery.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-05-T2 | 05-05 | 3 | BE-NOTIF-02 SC2/SC3 (D-07, D-08, D-09) | T-05-22, T-05-26 | sendToUser/broadcast mai throw, batch 500/500/1, pruning, log senza token | unit | `npx jest src/push/push.service.spec.ts --selectProjects unit` | ❌ W0 → registro in memoria nello spec | ⬜ pending |
| 05-05-T3 | 05-05 | 3 | BE-NOTIF-01/03 (D-02, D-03, D-09, D-13) | T-05-23, T-05-24, T-05-25, T-05-27 | utente cancellato → UNAUTHENTICATED; PUSH_DISABLED; NOT_FOUND; topic best-effort | unit | `npx jest src/push/push.service.spec.ts --selectProjects unit` | ✅ estende lo spec del T2 | ⬜ pending |
| 05-06-T1 | 05-06 | 4 | BE-NOTIF-02 (D-06) | T-05-32 | WARN disabilitato / LOG solo project_id | unit | `npx jest src/push/push-startup.reporter.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 05-06-T2 | 05-06 | 4 | BE-NOTIF-01 SC1 (D-02, D-03, D-09) | T-05-28, T-05-31 | identità dal bearer, invarianti sul wire, token mai nello schema | integration | `npx jest src/push/push.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → creato nel task | ⬜ pending |
| 05-06-T3 | 05-06 | 4 | BE-NOTIF-01 SC3 / BE-NOTIF-03 (D-13) | T-05-29, T-05-30 | sendTestPush innkeeper-only, audit target {PushDeliveryReport, null}, pruning sul wire | integration | `npx jest src/push/push.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ estende l'int-spec del T2 | ⬜ pending |
| 05-07-T1 | 05-07 | 5 | BE-NOTIF-01..03 (D-14) | T-05-35, T-05-36, T-05-37, T-05-38 | whitelist innkeeper esatta, schema senza token, no-op senza credenziali | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (RED atteso) | ✅ estende test/app.int-spec.ts | ⬜ pending |
| 05-07-T2 | 05-07 | 5 | BE-NOTIF-01..03 (D-14) | T-05-34 | schema additivo committato senza drift | integration + CI | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 05-08-T1 | 05-08 | 6 | BE-NOTIF-01..03 (D-16, D-17) | T-05-39, T-05-40 | suite completa, build, lint file toccati, nessun service account in git | full suite | `npm test && npm run build && git diff --exit-code src/schema.gql && test -z "$(git ls-files \| grep -iE 'service-?account\|adminsdk')"` | ✅ | ⬜ pending |
| 05-08-T2 | 05-08 | 6 | BE-NOTIF-01..03 (D-15) | T-05-41, T-05-42, T-05-43 | handoff verificato contro lo schema; traceability Complete | doc grep | `grep -q 'sendTestPush(input: SendTestPushInput!): PushDeliveryReport!' .planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md` | ❌ → creato nel task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le infrastrutture di test mancanti sono create dentro i task che le usano, sempre nel passo RED prima dell'implementazione:

- [x] `firebase-admin@^14.5.0` in `package.json`/`package-lock.json` + `"engines": { "node": ">=22" }` + pattern service-account in `.gitignore` → 05-01 Task 1
- [x] `src/push/push-error-code.enum.ts` + `push.exception.ts` + spec → 05-02 Task 1
- [x] `src/push/push-platform.enum.ts`, `push-event-type.enum.ts` (`registerEnumType`) → 05-02 Task 1
- [x] `test/push/fake-push-transport.ts` (condiviso da unit e integration) → 05-03 Task 1
- [x] registry fake in memoria per lo spec di `PushService` → 05-05 Task 2 (inline nello spec)
- [x] `src/config/push-config.ts` + spec (chiavi generate a runtime con `generateKeyPairSync`, nessun PEM fixture) → 05-01 Task 2
- Framework install: none (Jest/harness già presenti)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Un device reale riceve il data message in foreground, background e killed (Android); iOS background (non force-quit) | BE-NOTIF-03 | Richiede credenziali Firebase reali e un device con la build FE | `FIREBASE_SERVICE_ACCOUNT` reale nel `.env`, FE dev build registrata, `sendTestPush` da bearer innkeeper (dev bypass `DEV_AUTH_ROLE=innkeeper`) per ciascun `PushEventType`; verificare il report e la notifica locale sul device — eseguita dal FE Phase 5 (UAT) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (singoli spec; il real-boot e `npm test` solo nei plan 05-07/05-08)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated by planner 2026-10-18 (8 plan, 21 task)
