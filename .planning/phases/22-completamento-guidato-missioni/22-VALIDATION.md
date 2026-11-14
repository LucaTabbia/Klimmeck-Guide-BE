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
| 22-01-01 | 01 | 1 | BE-GMFLOW-08, 09 | T-22-01 / T-22-03 | predicato unico; marcatore senza `@Field`; codice senza chiavi extra | unit | `npx jest src/gameRules src/characters/mission-lock --selectProjects unit` | ✅ | ✅ green |
| 22-01-02 | 01 | 1 | BE-GMFLOW-08, 09 | T-22-01 / T-22-02 | il reader decide col predicato, anche in sessione; archiviato libero | integration | `npx jest src/characters/mission-lock --selectProjects integration --runInBand` | ✅ | ✅ green |
| 22-01-03 | 01 | 1 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-02-01 | 02 | 2 | BE-GMFLOW-08, 09 | T-22-04 | equip e compagno rifiutati in missione, liberi in viaggio; bypass dell'oste bloccato | unit + integration | `npx jest src/characters/characters.service.spec.ts --selectProjects unit && npx jest src/characters/mission-lock/character-mutations-lock.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 22-02-02 | 02 | 2 | BE-GMFLOW-08, 09 | T-22-04 / T-22-05 | magie e `useSpell` rifiutati in missione; sei guardie esatte | unit + integration | `npx jest src/characters --selectProjects unit && npx jest src/characters/mission-lock/character-mutations-lock.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 22-02-03 | 02 | 2 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-03-01 | 03 | 3 | BE-GMFLOW-08, 09 | T-22-06 / T-22-07 | pozione rifiutata dopo `AWAITING_AID`, blocco letto in sessione | unit + integration | `npx jest src/characters/items --selectProjects unit && npx jest src/characters/items --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 22-03-02 | 03 | 3 | BE-GMFLOW-08, 09 | T-22-06 / T-22-07 | negozio rifiutato dopo la prigione e prima della città; coverage di `src/economy` | integration | `npx jest src/economy --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 22-03-03 | 03 | 3 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-04-01 | 04 | 4 | BE-GMFLOW-08 | T-22-08 / T-22-10 | viaggio e anteprima rifiutati dalla bozza; teleport dell'oste libero | integration | `npx jest src/travel/travel.service.int-spec.ts src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 22-04-02 | 04 | 4 | BE-GMFLOW-08, 09 | T-22-08 / T-22-09 | ogni accettazione e `questTravelPreview` rifiutate in missione (F7 riscritta); worldMission con bozza `QUEST_NOT_ACCEPTABLE` | integration | `npx jest src/quests/acceptance --selectProjects integration --runInBand` | ✅ (F7 RED) | ✅ green |
| 22-04-03 | 04 | 4 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-05-01 | 05 | 5 | BE-GMFLOW-07, 08, 09 | T-22-11 / T-22-13 | due booleani risolti dalla regola unica; SDL verbatim; marcatore fuori dal filo | unit + integration | `npx jest src/characters --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 22-05-02 | 05 | 5 | BE-GMFLOW-08, 09 | T-22-12 | `characterUpdated` ad avvio da solo, avvio del party, avvio e scarto della bozza | unit + integration | `npx jest src/characters/mission-lock --selectProjects unit && npx jest src/characters/mission-in-progress.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 22-05-03 | 05 | 5 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-06-01 | 06 | 6 | BE-GMFLOW-06 | T-22-14 / T-22-15 | refactor senza cambi osservabili: guardie del completamento verdi e invariate | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 22-06-02 | 06 | 6 | BE-GMFLOW-06 | T-22-14 | catalogo dei premi di ref arbitrari; voci valide di un blocco | unit | `npx jest src/quests/outcomes --selectProjects unit` | ✅ (casi nuovi) | ✅ green |
| 22-06-03 | 06 | 6 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-07-01 | 07 | 7 | BE-GMFLOW-03, 05 | T-22-18 | modello senza `@Field`; precompilazione di tutto il blocco, orfani scartati, quantità ≤ 99 | unit | `npx jest src/quests/guided src/authz --selectProjects unit` | ✅ | ✅ green |
| 22-07-02 | 07 | 7 | BE-GMFLOW-03, 06, 08 | T-22-16 / T-22-17 / T-22-19 | avvio idempotente e concorrente, marcatore in transazione, scarto senza documento, orfana cancellata, `completePendingRequest` cancella la bozza | integration | `npx jest src/quests/guided src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 22-07-03 | 07 | 7 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-08-01 | 08 | 8 | BE-GMFLOW-03 | T-22-22 | forma del filo; nemico cancellato scartato, mai null su `Enemy!` | unit | `npx jest src/quests/guided src/enemies --selectProjects unit` | ✅ | ✅ green |
| 22-08-02 | 08 | 8 | BE-GMFLOW-03, 07 | T-22-20 / T-22-21 | tre handler `innkeeper`, FORBIDDEN all'adventurer, audit delle mutation, SDL additivo, 14 handler | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided --selectProjects integration --runInBand` | ✅ | ✅ green |
| 22-08-03 | 08 | 8 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-09-01 | 09 | 9 | BE-GMFLOW-03, 07 | T-22-23 / T-22-24 | data di avvio sulla voce della coda, SDL additivo (F2, F8) | unit + integration | `npx jest src/quests/pending-requests --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (F2, F8 RED) | ✅ green |
| 22-09-02 | 09 | 9 | BE-GMFLOW-03 | T-22-24 | coda riemessa ad avvio e scarto, pipeline pinnata intatta | unit + integration | `npx jest src/quests/pending-requests --selectProjects unit && npx jest src/quests/pending-requests/pending-requests.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 22-09-03 | 09 | 9 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-09-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-10-01 | 10 | 10 | BE-GMFLOW-01 | — | regola della lista: zona, `city`, fascia, leggendari solo worldMission, ripiego, ordinamento | unit | `npx jest src/quests/guided src/quests/generation --selectProjects unit` | ❌ W0 | ✅ green |
| 22-10-02 | 10 | 10 | BE-GMFLOW-01, 07 | T-22-25 / T-22-26 | `missionEnemies` sul filo, FORBIDDEN all'adventurer, 15 handler, SDL additivo | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ✅ green |
| 22-10-03 | 10 | 10 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-10-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-11-01 | 11 | 11 | BE-GMFLOW-02 | T-22-28 | statistiche dei pet nel catalogo del combattimento, una sola lettura | unit | `npx jest src/quests/outcomes src/travel/ambush --selectProjects unit` | ✅ (casi nuovi) | ✅ green |
| 22-11-02 | 11 | 11 | BE-GMFLOW-02 | T-22-27 / T-22-28 | compagno nel contesto delle quest; segnaposto senza tiri in più (F9) | unit | `npx jest src/quests/outcomes/combat src/quests/outcomes/combatant-plan.spec.ts --selectProjects unit` | ✅ (F9 RED) | ✅ green |
| 22-11-03 | 11 | 11 | BE-GMFLOW-02 | T-22-27 | compagno nell'imboscata; letterali meccanici delle dungeon; tsc di nuovo pulito | unit + integration | `npx jest src/quests/outcomes src/travel/ambush --selectProjects unit && npx jest src/travel/ambush/ambush-resolution.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ (F9) | ✅ green |
| 22-11-04 | 11 | 11 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-11-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-12-01 | 12 | 12 | BE-GMFLOW-02, 04 | T-22-29 / T-22-30 | stato all'inizio dello scontro senza mutazioni, limiti serviti, ferite di prima intoccabili, token del caso distinto | unit | `npx jest src/quests/guided --selectProjects unit` | ✅ (casi nuovi) | ✅ green |
| 22-12-02 | 12 | 12 | BE-GMFLOW-02 | T-22-29 | invalidazione a valle; zero scontri ammessi; verdetto per scontro | unit | `npx jest src/quests/guided --selectProjects unit` | ✅ (casi nuovi) | ✅ green |
| 22-12-03 | 12 | 12 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-12-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-13-01 | 13 | 13 | BE-GMFLOW-02 | T-22-31 / T-22-32 | simulazione senza scritture e senza tiri condivisi, sequenza, ordine e rilancio | integration | `npx jest src/quests/guided/mission-simulation.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (spec nuova) | ✅ green |
| 22-13-02 | 13 | 13 | BE-GMFLOW-02, 07 | T-22-33 | mutation `innkeeper`, audit, 16 handler, tetto delle quantità, SDL additivo | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 22-13-03 | 13 | 13 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-13-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-14-01 | 14 | 14 | BE-GMFLOW-05 | T-22-34 | una regola per opzioni e rivalidazione; premi scelti senza tiri | unit | `npx jest src/quests/guided --selectProjects unit` | ✅ (spec e casi nuovi) | ✅ green |
| 22-14-02 | 14 | 14 | BE-GMFLOW-05, 07 | T-22-35 | `missionPrizeOptions` filtrata per titolo, fuori dall'audit, 17 handler, SDL additivo | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (spec e casi nuovi) | ✅ green |
| 22-14-03 | 14 | 14 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-14-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 22-15-01 | 15 | 15 | BE-GMFLOW-03, 04 | T-22-36 | passo, luogo, scontri e correzioni: invalidazione, correzioni nei limiti, ferite di prima | integration | `npx jest src/quests/guided/mission-draft-save.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 22-15-02 | 15 | 15 | BE-GMFLOW-05 | T-22-37 / T-22-38 | premi rivalidati, monete e xp liberi, blocco precompilato con più di 50 voci salvato invariato | integration | `npx jest src/quests/guided/mission-draft-save.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 22-15-03 | 15 | 15 | BE-GMFLOW-07 | T-22-38 | mutation `innkeeper`, audit, 18 handler, SDL additivo | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 22-15-04 | 15 | 15 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-15-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 22-16-01 | 16 | 16 | BE-GMFLOW-06, 08 | T-22-39 / T-22-40 / T-22-41 | completamento in una transazione dalla sola bozza, rivalidato in sessione, senza tiri, blocco rilasciato | unit + integration | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/guided-completion.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 22-16-02 | 16 | 16 | BE-GMFLOW-06, 07 | T-22-42 | flusso completo sul filo, audit, 19 handler, SDL additivo | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 22-16-03 | 16 | 16 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-16-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 22-17-01 | 17 | 17 | BE-GMFLOW-01..09 | T-22-43 / T-22-44 / T-22-45 | gate: tsc, suite complete, boot reale, SDL additivo, coverage per cartella, invarianti, copertura D-01..D-26 | unit + integration | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 22-17-02 | 17 | 17 | — | — | bookkeeping | doc | `grep -qF -- "- [x] 22-17-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 22-18-01 | 18 | 18 | BE-GMFLOW-07 | T-22-46 | handoff senza segreti, SDL verbatim, dati UAT solo descritti | doc | `test "$(grep -cE '^## [0-7]\.' .planning/phases/22-completamento-guidato-missioni/BACKEND-NOTES.md)" = 8` | ❌ (creato nel piano) | ⬜ pending |
| 22-18-02 | 18 | 18 | BE-GMFLOW-01..09 | T-22-47 | requisiti chiusi solo dopo il gate; VALIDATION firmata | doc | `test "$(grep -cE '\- \[x\] \*\*BE-GMFLOW-0[1-9]\*\*' .planning/REQUIREMENTS.md)" = 9` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Pianificata: ogni casella si spunta nel piano che crea il file (task indicato, RED prima del codice); `wave_0_complete` lo porta a `true` il piano 18.

- [x] `src/characters/mission-lock/mission-lock.spec.ts` — BE-GMFLOW-08/09 (pianificato nel piano 01: 22-01-01, esteso in 22-05-01)
- [x] `src/characters/mission-lock/mission-lock.reader.int-spec.ts` — BE-GMFLOW-08/09 (pianificato nel piano 01: 22-01-02)
- [ ] `src/characters/mission-lock/character-mutations-lock.int-spec.ts` — BE-GMFLOW-08/09 (pianificato nel piano 02: 22-02-01)
- [x] `src/characters/mission-lock/mission-draft-lock.publisher.spec.ts` — BE-GMFLOW-08 (pianificato nel piano 05: 22-05-02)
- [x] `src/characters/mission-in-progress.int-spec.ts` — BE-GMFLOW-08/09 (pianificato nel piano 05: 22-05-02)
- [ ] `src/quests/guided/*.spec.ts` (pianificati nei piani 07, 08, 10, 12, 14, 16: precompilazione 22-07-01, filo 22-08-01, pool 22-10-01, sovrapposizione e porta del caso 22-12-01, invalidazione 22-12-02, premi e premi scelti 22-14-01, esito aggregato 22-16-01) — BE-GMFLOW-01/02/04/05/06
- [ ] `src/quests/guided/*.int-spec.ts` (pianificati nei piani 07, 08, 13, 15, 16: bozza 22-07-02, resolver 22-08-02, simulazione 22-13-01, salvataggio 22-15-01 e 22-15-02, completamento 22-16-01) — BE-GMFLOW-01..06
- [x] `src/quests/pending-requests/mission-draft-queue.refresher.spec.ts` — BE-GMFLOW-03 (pianificato nel piano 09: 22-09-02)
- Asserzioni esistenti che vanno RED prima del codice (tabella F della ricerca): F1 22-05-01, F2 22-09-01, F3/F4 22-08-02 (e ogni piano con handler nuovi: 22-10-02, 22-13-02, 22-14-02, 22-15-03, 22-16-02), F5 22-01-01, F6 22-02-01, F7 22-04-02, F8 22-09-01, F9 22-11-02 e 22-11-03.
- Nessuna installazione: framework presente.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale della build finale: SDL uguale a quello committato, 19 handler dell'oste, nessun log con token o URI | BE-GMFLOW-07 | Il boot contro il database reale lo lancia solo l'orchestratore | Runbook nel handoff: build, boot, lettura dei log di avvio (solo conteggi), `git diff --exit-code src/schema.gql` |
| Flusso guidato completo e avviso «Missione in corso» su device con la FE Phase 21 | BE-GMFLOW-01..09 | Serve il device e una worldMission / una story scritte a DB dall'orchestratore | UAT guidata dall'orchestratore dopo la merge (`BACKEND-NOTES.md`, dati per la UAT) |
| Semina della worldMission coi blocchi per titolo, della story e di un leggendario compatibile col POI della UAT | BE-GMFLOW-07 | Nessun file di contenuto nel repo (D-36 del progetto): lo script resta fuori dal repo | L'orchestratore scrive i documenti a DB con la forma di `BACKEND-NOTES.md` §6 e lo stesso formato del BE |
| Avviso che arriva sul telefono del partecipante senza toccare nulla all'avvio e allo scarto della bozza | BE-GMFLOW-08 | Serve la WS reale col device (le int-spec provano l'evento, non la resa) | Passo 2 e 10 della UAT di `BACKEND-NOTES.md` §6 |
| Blocco di una missione normale: hunt nel tempo d'attesa (rifiuti) e durante il viaggio verso la quest (permessi) | BE-GMFLOW-09 | Tempi reali del viaggio e dell'attesa | Passo 11 della UAT di `BACKEND-NOTES.md` §6 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
