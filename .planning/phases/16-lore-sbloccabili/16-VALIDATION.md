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
| 16-01-01 | 01 | 1 | BE-LORE-04 | T-16-01 / T-16-02 | `LORE_STUDY_CHANCE` opzionale, default 0.5, [0, 1], errore senza il valore | unit | `npx jest src/config --selectProjects unit` | ✅ | ✅ green |
| 16-01-02 | 01 | 1 | BE-LORE-01, 02, 05 | T-16-03 / T-16-04 | `geographyOf` senza cascata, add-to-set solo se non vuoto, visibilità per esadecimale | unit | `npx jest src/lore --selectProjects unit` | ✅ | ✅ green |
| 16-01-03 | 01 | 1 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-01-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 16-02-01 | 02 | 2 | BE-LORE-01, 05 | T-16-05 / T-16-06 / T-16-08 | `unlockedLore` sul filo, `knownEnemies` interno, legacy `[]`, `characterUpdated` riemesso | integration | `npx jest test/app.int-spec.ts src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | BE-LORE-03 | T-16-07 / T-16-08 | `loreUnlocked` popolato, orfani scartati, risultati vecchi `[]` | unit + integration | `npx jest test/app.int-spec.ts src/quests/results --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-02-03 | 02 | 2 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-02-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 3 | BE-LORE-01, 02 | T-16-10 / T-16-11 | reader: solo `markerLocation`, forme legacy, orfani → `[]` | integration | `npx jest src/lore/lore-geography.reader.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 16-03-02 | 03 | 3 | BE-LORE-01 | T-16-09 / T-16-11 | nascita con la geografia della città natale; ricreazione → insieme nuovo | unit + integration | `npx jest src/characters/creation --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-03-03 | 03 | 3 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-03-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-04-01 | 04 | 4 | BE-LORE-02 | T-16-12 / T-16-13 / T-16-14 / T-16-15 | completamento (libero, quest, deviazione) e teleport; territorio ignorato; idempotente | unit + integration | `npx jest src/travel --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-04-02 | 04 | 4 | BE-LORE-02 | T-16-13 / T-16-14 | salto istantaneo dell'accettazione | unit + integration | `npx jest src/quests/acceptance --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-04-03 | 04 | 4 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-04-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-05-01 | 05 | 5 | BE-LORE-03 | T-16-16 / T-16-18 / T-16-19 | `victoryKnowledgeOf`, `knowledgeUpdateOf`, piano del partecipante; sconfitta nulla | unit | `npx jest src/quests/outcomes --selectProjects unit` | ❌ W0 | ⬜ pending |
| 16-05-02 | 05 | 5 | BE-LORE-03 | T-16-16 / T-16-17 | individuale, party, dungeon: ogni vincitore impara | integration | `npx jest src/quests/outcomes src/travel/ambush --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-05-03 | 05 | 5 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-05-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-06-01 | 06 | 6 | BE-LORE-03 | T-16-20 | `gmCompleted` con nemici insegna, senza nemici nulla | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-06-02 | 06 | 6 | BE-LORE-02, 03 | T-16-21 / T-16-22 / T-16-23 | imboscata vinta, report con `loreUnlocked`, deviazione sulla città | unit + integration | `npx jest src/travel --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-06-03 | 06 | 6 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-06-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-07-01 | 07 | 7 | BE-LORE-02, 03 | T-16-28 | ritorno del soccorso con la geografia; soccorritori vincenti imparano | unit + integration | `npx jest src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-07-02 | 07 | 7 | BE-LORE-04 | T-16-24 / T-16-25 / T-16-26 / T-16-27 | studio al `LORE_STUDY_CHANCE`, pool filtrato, tiri dopo il pet | unit + integration | `npx jest src/quests/outcomes/study-lore-draw.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 16-07-03 | 07 | 7 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-07-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-08-01 | 08 | 8 | BE-LORE-05 | T-16-32 / T-16-33 | viewer: innkeeper tutto, personaggio attivo, una lettura per richiesta | integration | `npx jest src/lore/viewer-knowledge.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 16-08-02 | 08 | 8 | BE-LORE-05 | T-16-29 / T-16-30 / T-16-31 | `lores`/`lore`/`City`/`Enemy.relatedLore` filtrate, NOT_FOUND identico | integration | `npx jest src/lore src/cities src/shops --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 16-08-03 | 08 | 8 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-08-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-09-01 | 09 | 9 | BE-LORE-06 | T-16-34 / T-16-35 / T-16-36 / T-16-37 | `QuestEnemy.known` per viewer su HTTP e due eventi WS | integration | `npx jest test/app.int-spec.ts src/lore/known-enemies.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 16-09-02 | 09 | 9 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-09-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-10-01 | 10 | 10 | BE-LORE-01 | T-16-38 | backfill per unione, solo attivi, idempotente | unit + integration | `npx jest src/migrations/lore-backfill --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 16-10-02 | 10 | 10 | BE-LORE-01 | T-16-39 / T-16-40 / T-16-41 | passo al boot mai bloccante, soli conteggi, solo in `AppModule` | unit | `npx jest src/migrations/lore-backfill --selectProjects unit` | ❌ W0 | ⬜ pending |
| 16-10-03 | 10 | 10 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-10-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-11-01 | 11 | 11 | BE-LORE-01..06 | T-16-42 / T-16-43 / T-16-44 / T-16-45 | suite completa con le soglie, SDL solo additivo, invarianti | full | `npx tsc --noEmit -p tsconfig.json && npm run test:cov` (o ripiego per cartella) | ✅ | ⬜ pending |
| 16-11-02 | 11 | 11 | — | — | VALIDATION firmata | doc | `grep -q "nyquist_compliant: true" .planning/phases/16-lore-sbloccabili/16-VALIDATION.md` | ✅ | ⬜ pending |
| 16-11-03 | 11 | 11 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-11-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |
| 16-12-01 | 12 | 12 | BE-LORE-01..06 | T-16-46 / T-16-47 / T-16-48 | handoff FE Phase 17 con SDL verbatim e runbook | doc | `grep -qF "known: Boolean!" .planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md` | ✅ | ⬜ pending |
| 16-12-02 | 12 | 12 | BE-LORE-01..06 | T-16-47 | emendamenti in coda, requisiti completi | doc | `test "$(grep -cE '\- \[x\] \*\*BE-LORE-0[1-6]\*\*' .planning/REQUIREMENTS.md)" = 6` | ✅ | ⬜ pending |
| 16-12-03 | 12 | 12 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 16-12-PLAN.md" .planning/ROADMAP.md && test -z "$(git status --short)"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lore/lore-geography.spec.ts`, `src/lore/lore-geography.reader.int-spec.ts` — BE-LORE-01/02
- [x] `src/lore/lore-visibility.spec.ts`, `src/lore/viewer-knowledge.service.int-spec.ts` (HTTP + due eventi WS), `src/lore/known-enemies.resolver.int-spec.ts` — BE-LORE-05/06
- [x] `src/quests/outcomes/victory-knowledge.spec.ts`, `src/quests/outcomes/study-lore-draw.int-spec.ts` — BE-LORE-03/04
- [x] `src/config/lore-config.spec.ts` — BE-LORE-04
- [x] `src/migrations/lore-backfill/*.spec.ts` / `*.int-spec.ts` — BE-LORE-01 (one-off)
- [x] fixture `test/quests/quest-result.fixture.ts` (`loreUnlocked: []`), helper `playerKnowing(harness, { lore, enemies })`
- [x] asserzioni a stringa esatta aggiornate RED prima del codice (RESEARCH F9, REPO-RULES «Completato dopo la ricerca»)

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
