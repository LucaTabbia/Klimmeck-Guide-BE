---
phase: 16
slug: lore-sbloccabili
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-07
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest, progetti `unit` (`*.spec.ts`) e `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` condiviso da `test/setup/global-setup.ts`) |
| **Config file** | `package.json` §`jest` (progetti, `coverageThreshold` per cartella) |
| **Quick run command** | `npx jest <spec mirata> --selectProjects unit` (≈ 2–5 s) |
| **Integration mirata** | `npx jest <percorsi> --selectProjects integration --runInBand` |
| **Boot reale / SDL** | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` |
| **Full suite command** | `npx tsc --noEmit -p tsconfig.json && npm run test:cov` (solo nel piano di gate; ripiego senza coverage + coverage per cartella se supera i 600 s del tool) |
| **Estimated runtime** | unit ≈ 5 s; integration mirata 6–60 s; `npm run test:cov` ≈ 9–10 min (360 suite / 4503 test al gate 15-11) |

---

## Sampling Rate

- **After every task commit:** la spec mirata del task (unit o integration `--runInBand`) + `npx tsc --noEmit -p tsconfig.json` + grep dei trailer = 0 + `pgrep -fl 'bin/jest'` vuoto
- **After every plan wave:** le spec della cartella toccata (`src/lore`, `src/characters`, `src/travel`, `src/quests/outcomes`, `src/quests/acceptance`, `src/cities`, `src/enemies`, `src/models`), boot reale nei piani che toccano lo SDL o i moduli
- **Before `/gsd-verify-work`:** `npm run test:cov` (o ripiego) verde con le soglie invariate, boot reale verde, SDL solo additivo (piano di gate)
- **Max feedback latency:** 60 s per task (le int-spec della risoluzione e del viaggio)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | BE-LORE-0X | T-16-01 / — | _righe aggiunte dal planner, una per task_ | unit | `npx jest <spec> --selectProjects unit` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lore/lore-geography.spec.ts`, `src/lore/lore-geography.reader.int-spec.ts` — BE-LORE-01/02
- [ ] `src/lore/lore-visibility.spec.ts`, `src/lore/viewer-knowledge.service.int-spec.ts` (HTTP + due eventi WS), `src/lore/known-enemies.resolver.int-spec.ts` — BE-LORE-05/06
- [ ] `src/quests/outcomes/victory-knowledge.spec.ts`, `src/quests/outcomes/study-lore-draw.int-spec.ts` — BE-LORE-03/04
- [ ] `src/config/lore-config.spec.ts` — BE-LORE-04
- [ ] `src/migrations/lore-backfill/*.spec.ts` / `*.int-spec.ts` — BE-LORE-01 (one-off)
- [ ] fixture `test/quests/quest-result.fixture.ts` (`loreUnlocked: []`), helper `playerKnowing(harness, { lore, enemies })`
- [ ] asserzioni a stringa esatta aggiornate RED prima del codice (RESEARCH F9, REPO-RULES «Completato dopo la ricerca»)

Nessun framework da installare.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale con il backfill one-off (log dei conteggi, secondo boot a zero modifiche), rimozione prima della merge | BE-LORE-01 | gira solo contro il database reale, a carico dell'orchestratore | runbook del handoff `BACKEND-NOTES.md` |
| UAT della FE Phase 17 su device con la seconda identità (ruolo giocatore via env) e `LORE_STUDY_CHANCE=1` | BE-LORE-02..06 | change stream, filtri per identità, tiro dello studio | `../Klimmeck-Guide/.planning/phases/17-unlockable-lore/17-HUMAN-UAT.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
