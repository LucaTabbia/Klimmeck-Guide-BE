---
phase: 22
slug: completamento-guidato-missioni
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-14
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest, progetti `unit` e `integration` (`package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), Redis effimero, harness e token di test esistenti (`test/auth/`, `test/harness/`), `FixedClock` |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | suite completa senza coverage nel piano di gate; `npm run test:cov` lo lancia l'orchestratore in background (supera i 600 s dello strumento) |
| **Estimated runtime** | spec mirata 10–90 s; suite completa ≈ 10 min |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** le cartelle toccate (`src/quests/guided`, `src/characters`, `src/quests/outcomes`, `src/quests/pending-requests`) nei due progetti (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** suite completa verde, coverage per cartella delle soglie toccate, boot reale (`test/app.int-spec.ts`) e `git diff --exit-code src/schema.gql` vuoto dopo il boot
- **Max feedback latency:** 180 s per task

---

## Requirements → Test Map (dalla ricerca)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-GMFLOW-01 | regola del pool (zona, `city`, fascia, leggendari solo worldMission, animali, ripiego `all`, `showAll`, ordinamento) | unit | `npx jest src/quests/guided/mission-enemy-pool.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-GMFLOW-01 | `missionEnemies` sul filo dal luogo della bozza o del primo partecipante | integration | `npx jest src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-02 | simulazione senza scritture, sorgente condivisa a zero tiri, scontro 2 dallo stato corretto dell'1, invalidazione a valle | unit + integration | `npx jest src/quests/guided/fight-state.spec.ts src/quests/guided/draft-invalidation.spec.ts --selectProjects unit`; `npx jest src/quests/guided/mission-simulation.service.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-03 | avvio idempotente, una bozza per gruppo (indice unico), ripresa, scarto, bozza orfana cancellata, mai esposta ai giocatori (handler innkeeper) | integration | `npx jest src/quests/guided/mission-draft.service.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-04 | correzioni per scontro validate sulla sovrapposizione (vita 1..max, posseduto/usi rimasti, ferite dell'enum, non partecipante) | unit + integration | `npx jest src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit`; `npx jest src/quests/guided/mission-draft.service.int-spec.ts --selectProjects integration --runInBand` | ✅ / ❌ |
| BE-GMFLOW-05 | catalogo filtrato (tetto, pet, caster + `minXpToLearn`, voci del blocco sempre ammesse), rivalidazione, `chosenRewardsOf` | unit + integration | `npx jest src/quests/guided/mission-prizes.spec.ts src/quests/guided/chosen-rewards.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-GMFLOW-06 | completamento in transazione: stato finale, nemici fusi in `QuestResult.enemies`, xp nemici e compagno, conoscenza, premi scelti, `gmCompleted`, bozza cancellata, nessun tiro | integration | `npx jest src/quests/guided/guided-completion.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ❌ / ✅ |
| BE-GMFLOW-07 | ruoli (matrice), audit delle mutation, SDL al boot reale | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`; `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`; `npx jest test/authz/handler-fixtures.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-GMFLOW-08 | blocco del flusso guidato: rifiuti `MISSION_IN_PROGRESS` per viaggio, accettazione, negozio, equip, compagno, magie, pozioni; sblocco a completamento/scarto; `characterUpdated` ad avvio e scarto | unit + integration | `npx jest src/characters/mission-lock --selectProjects unit`; `npx jest src/characters/mission-in-progress.int-spec.ts src/characters/mission-lock --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-GMFLOW-09 | stesso blocco dall'avvio effettivo delle missioni normali (solitaria all'arrivo, party all'avvio), precedenza dei codici esistenti | integration | `npx jest src/characters/equipment/equip-item.int-spec.ts src/characters/items/use-item.int-spec.ts src/economy/trade/do-transaction.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| (manuale) | avviso «Missione in corso» e flusso completo su device | manual-only | UAT su device dell'orchestratore con la FE Phase 21 | — |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | BE-GMFLOW-08 | T-22-01 / — | {comportamento sicuro atteso} | unit | `{comando}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/characters/mission-lock/mission-lock.spec.ts` — BE-GMFLOW-08/09
- [ ] `src/characters/mission-lock/mission-draft-lock.publisher.spec.ts` — BE-GMFLOW-08
- [ ] `src/characters/mission-in-progress.int-spec.ts` — BE-GMFLOW-08/09
- [ ] `src/quests/guided/*.spec.ts` (pool, sovrapposizione, invalidazione, premi, premi scelti) — BE-GMFLOW-01/02/04/05
- [ ] `src/quests/guided/*.int-spec.ts` (bozza, simulazione, completamento, resolver) — BE-GMFLOW-01..06
- [ ] `src/quests/pending-requests/mission-draft-queue.refresher.spec.ts` — BE-GMFLOW-03
- Nessuna installazione: framework presente.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale della build finale: SDL uguale a quello committato, 19 handler dell'oste, nessun log con token o URI | BE-GMFLOW-07 | Il boot contro il database reale lo lancia solo l'orchestratore | Runbook nel handoff: build, boot, lettura dei log di avvio (solo conteggi), `git diff --exit-code src/schema.gql` |
| Flusso guidato completo e avviso «Missione in corso» su device con la FE Phase 21 | BE-GMFLOW-01..09 | Serve il device e una worldMission / una story scritte a DB dall'orchestratore | UAT guidata dall'orchestratore dopo la merge (`BACKEND-NOTES.md`, dati per la UAT) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
