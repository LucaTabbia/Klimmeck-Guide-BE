---
phase: 1
slug: fondazione-test-consolidamento-spell-wip
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.0.0 + ts-jest 29.2.5 + @nestjs/testing 11.0.1 |
| **Config file** | Inline in `package.json` (unit) + `test/jest-e2e.json` (e2e); config integration da aggiungere in Wave 0 (Jest `projects` o `test/jest-integration.json`) |
| **Quick run command** | `npm test -- <file.spec.ts>` |
| **Full suite command** | `npm test` (unit) + comando integration dedicato + `npm run test:e2e` |
| **Estimated runtime** | ~30 seconds (unit quick run); integration più lenta (replSet + Redis) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <spec del task>` + `npm run lint`
- **After every plan wave:** Run suite unit completa + integration (replSet + Redis)
- **Before `/gsd-verify-work`:** Full suite must be green (lint + unit + integration + e2e) + pipeline GitHub Actions verde (D-10/D-11)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| P01-T3 | 01-01 | 1 | BE-TEST-01 | T-01-01/02 | replSet avvia; transazione Mongo (commit+abort) e change stream passano | integration | `npm run test:int -- test/harness/replset.int-spec.ts` | ❌ W0→P01 | ⬜ pending |
| P01-T1/T2 | 01-01 | 1 | BE-TEST-02 | T-01-03 | split unit/integration via Jest projects; helper Redis effimero (no ioredis-mock) | infra | `npm run test:unit` | ❌ W0→P01 | ⬜ pending |
| P02-T3 | 01-02 | 2 | BE-TEST-03 | T-01-04/05 | fixture/factory valide per User/Character/Quest/Spell/Road/POI riusate in ≥2 spec | unit + integration | `npm run test:unit -- test/fixtures/fixtures.spec.ts` ; `npm run test:int -- test/fixtures/fixtures.int-spec.ts` | ❌ W0→P02 | ⬜ pending |
| P03-T1 | 01-03 | 3 | BE-TEST-02 | — | service risolto con coda Bull mockata (`getQueueToken`), nessun Redis | unit | `npm run test:unit -- src/characters/characters.service.spec.ts` | ❌ W0→P03 | ⬜ pending |
| P03-T1/T2 | 01-03 | 3 | BE-TEST-04 | T-01-06 | `useSpell` verifica la spell prima di decrementare (RED→GREEN) | unit | `npm run test:unit -- src/characters/characters.service.spec.ts -t "useSpell"` | ❌ W0→P03 | ⬜ pending |
| P03-T3 | 01-03 | 3 | BE-TEST-02, BE-TEST-04 | T-01-07 | processor `spell-recovery` gira su Redis reale; `handleSpellRecovery` incrementa usages | integration | `npm run test:int -- src/characters/spell-recovery.processor.int-spec.ts` | ❌ W0→P03 | ⬜ pending |
| P03-T3 | 01-03 | 3 | BE-TEST-01 | T-01-07 | change stream Character → PUB_SUB emette `characterUpdated` (D-09) | integration | `npm run test:int -- test/harness/character-changestream.int-spec.ts` | ❌ W0→P03 | ⬜ pending |
| P04-T1 | 01-04 | 4 | BE-TEST-01 | T-01-09/11 | CI GitHub Actions: lint+unit+integration, Redis container, cache binari Mongo, trigger ogni push | ci | (GitHub Actions run verde) | ❌ W0→P04 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/setup/mongo-replset.ts` + `test/setup/global-setup.ts` + `test/setup/global-teardown.ts` — replSet condiviso (BE-TEST-01)
- [ ] Config Jest integration (Jest `projects` in package.json oppure `test/jest-integration.json`) — split unit/integration
- [ ] `test/setup/redis.ts` — helper Redis effimero (service container env / redis-memory-server) (BE-TEST-02)
- [ ] `test/fixtures/{user,character,quest,spell,road,poi}.fixture.ts` — factory two-tier (BE-TEST-03)
- [ ] `src/characters/characters.service.spec.ts` — unit `useSpell`/`equipSpell`/`unequipSpell` con mock (BE-TEST-02, BE-TEST-04)
- [ ] `src/characters/spell-recovery.processor.spec.ts` — integration processor (BE-TEST-02, BE-TEST-04)
- [ ] Test change stream → PubSub `characterUpdated` su replSet (BE-TEST-01 + verifica D-09 rimozione PUB_SUB duplicato)
- [ ] Install: `npm install --save-dev mongodb-memory-server@11 redis-memory-server@0`
- [ ] `.github/workflows/ci.yml` — lint + unit + integration, Redis service container, cache binari MongoDB, trigger su ogni push (D-10/D-11/D-12)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** map populated by planner (4 plans, 4 waves)
