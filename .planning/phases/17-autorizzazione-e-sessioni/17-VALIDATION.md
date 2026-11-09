---
phase: 17
slug: autorizzazione-e-sessioni
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-09
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (progetti `unit` e `integration`, `package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), Redis effimero, harness `createAuthTestApp`/`createCharactersTestApp`, token per ruolo `signTestAccessToken`, client WS `test/auth/ws-test-client.ts` |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella: `./src/auth/` 97/84/98) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | `npm run test:cov` (nel piano di gate; ripiego per cartella se supera i 600 s dello strumento) |
| **Estimated runtime** | ~32 s per `src/auth` + `test/auth` (misurati, RESEARCH F-8); ~1 min per il controllo di wave `src/auth test/auth test/authz src/users src/graphql`; `test:cov` ≈ 576 s → ripiego per cartella con `--coverageThreshold='{}'` e lettura del `json-summary` (D-15) |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** `npx jest src/auth test/auth test/authz --selectProjects unit` e `npx jest src/auth test/auth test/authz --selectProjects integration --runInBand` (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** suite completa verde con coverage (gate), boot reale (`test/app.int-spec.ts`) con whitelist invariata e `git diff --exit-code src/schema.gql` vuoto
- **Max feedback latency:** 60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | BE-SESSION-03 | T-17-01 / — | {comportamento sicuro atteso} | unit | `{comando}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/authz/expected-handlers.ts` — le tre liste condivise (refactor di `test/app.int-spec.ts`, verde prima e dopo)
- [ ] `test/harness/real-app-boot.ts` — env e boot reale di `AppModule` condivisi (C-2), usato da `test/app.int-spec.ts` e dalla matrice
- [ ] `test/authz/handler-fixtures.ts` e `test/authz/authorization-matrix.int-spec.ts` — BE-SESSION-01
- [ ] `src/auth/ws/ws-session-registry.spec.ts` — BE-SESSION-02
- [ ] `test/auth/session-revocation.int-spec.ts` — filo WS + HTTP di D-02/D-03/D-05 (BE-SESSION-02/03)
- [ ] `src/auth/session/user-role-changes.publisher.int-spec.ts` — BE-SESSION-04, con l'helper di priming (Pitfall 3)
- [ ] `src/auth/session/session-revocation.service.int-spec.ts` — ordine DB → socket (BE-SESSION-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale della build finale: whitelist degli handler invariata, SDL invariato, nessun log con token o hash | BE-SESSION-05 | Il boot contro il database reale lo lancia solo l'orchestratore | Runbook nel handoff: build, boot, lettura dei log di avvio (solo conteggi), `git diff --exit-code src/schema.gql` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
