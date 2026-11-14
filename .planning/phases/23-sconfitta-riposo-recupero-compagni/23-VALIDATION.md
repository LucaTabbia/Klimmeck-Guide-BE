---
phase: 23
slug: sconfitta-riposo-recupero-compagni
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-14
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (progetti `unit` e `integration`, MongoMemoryReplSet condiviso) |
| **Config file** | `jest.config` esistente — nessuna installazione |
| **Quick run command** | `npx jest <percorsi> --selectProjects unit` |
| **Full suite command** | `npx jest --selectProjects unit; integration a blocchi `--runInBand` (solo nel piano di gate)` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest <percorsi> --selectProjects unit`
- **After every plan wave:** Run `npx jest --selectProjects unit; integration a blocchi `--runInBand` (solo nel piano di gate)`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | REQ-{XX} | T-23-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Gap della Wave 0 di `23-RESEARCH.md` §Validation Architecture — il planner li copia qui e compila la Per-Task Verification Map (una riga per task `23-NN-TT`, requisito BE-PET-NN)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {behavior} | REQ-{XX} | {reason} | {steps} |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
