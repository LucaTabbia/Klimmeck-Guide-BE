---
phase: 05
slug: infrastruttura-push-fcm
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| (compilato dal planner dalla sezione "Phase Requirements → Test Map" di 05-RESEARCH.md) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `firebase-admin@^14.5.0` in `package.json`/`package-lock.json` + `"engines": { "node": ">=22" }` + pattern service-account in `.gitignore`
- [ ] `src/push/push-error-code.enum.ts` + `push.exception.ts` + spec
- [ ] `src/push/push-platform.enum.ts`, `push-event-type.enum.ts` (`registerEnumType`)
- [ ] `test/push/fake-push-transport.ts` (condiviso da unit e integration)
- [ ] registry fake in memoria per lo spec di `PushService`
- [ ] `src/config/push-config.ts` skeleton + spec (chiavi generate a runtime, nessun PEM fixture)
- Framework install: none (Jest/harness già presenti)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Un device reale riceve il data message in foreground, background e killed (Android); iOS background (non force-quit) | BE-NOTIF-03 | Richiede credenziali Firebase reali e un device con la build FE | `FIREBASE_SERVICE_ACCOUNT` reale nel `.env`, FE dev build registrata, `sendTestPush` da bearer innkeeper (dev bypass `DEV_AUTH_ROLE=innkeeper`) per ciascun `PushEventType`; verificare il report e la notifica locale sul device — eseguita dal FE Phase 5 (UAT) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
