---
phase: 21
slug: premi-per-rango-e-soccorsi
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-13
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest (progetti `unit` e `integration`, `package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), harness degli esiti (`test/quests/outcome-world.ts`), `ScriptedCombatResolver`, `SequenceChance` / `SeededChanceSource`, `FixedClock`, porta di test `TurnFailingDungeonResolver` (nuova, piano 08), boot reale `test/app.int-spec.ts` |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella; toccate: `./src/quests/acceptance/` 97/91/98, `./src/quests/generation/` 96/82/97) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | nel piano di gate (13): `npx jest --selectProjects unit` + integration a blocchi senza coverage; `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | unit completo ≈ 11 s; `tsc` ≈ 11 s; boot reale ≈ 8 s; `src/quests/outcomes` integration ≈ 100–150 s; `quest-generator.int-spec.ts` lenta; `test:cov` ≈ 630 s (fuori dai 600 s dello strumento) |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** le spec del piano + `git diff --exit-code src/schema.gql` (vuoto fino al piano 12, che lo rigenera e lo committa) (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** gate del piano 13 verde (unit completo, integration completa a blocchi, boot reale, SDL additivo verbatim, coverage per cartella di `./src/quests/acceptance/` e `./src/quests/generation/`, tabella di copertura verificata)
- **Max feedback latency:** 150 s (blocco integration di `src/quests/outcomes`); 3–30 s per le spec mirate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | BE-RANKP-02 | T-21-01, T-21-02, T-21-03 | magia solo ai titoli ≥ mage col titolo dopo l'esito, in ogni percorso; study di un non caster → lore | unit + integration | `npx jest src/quests/outcomes --selectProjects unit`; `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/study-lore-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-01-02 | 01 | 1 | — | — | bookkeeping del piano 01 | — | `grep -qF -- "- [x] 21-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-02-01 | 02 | 2 | BE-RANKP-01, BE-RANKP-02 | T-21-04, T-21-06 | schema `prizes.rankPrizes`; `rankBlocksOf`, `prizeBlocksOf` (blocco unico campo per campo, anche su documento idratato), `prizeBlockFor` col ripiego D-18 | unit | `npx jest src/models/quest src/quests/prizes --selectProjects unit` | ✅ | ✅ green |
| 21-02-02 | 02 | 2 | BE-RANKP-01 | T-21-05 | populate e sanificazione dei ref dei blocchi; pet orfano → null | unit + integration | `npx jest src/quests/quest-catalog.populate.spec.ts --selectProjects unit`; `npx jest src/quests/quest-catalog.populate.int-spec.ts src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-02-03 | 02 | 2 | — | — | bookkeeping del piano 02 | — | `grep -qF -- "- [x] 21-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-03-01 | 03 | 3 | BE-RANKP-02 | T-21-08 | catalogo dei premi sull'unione dei blocchi | unit | `npx jest src/quests/outcomes --selectProjects unit` | ✅ | ✅ green |
| 21-03-02 | 03 | 3 | BE-RANKP-01, BE-RANKP-02 | T-21-07, T-21-09 | boss misto: ognuno il suo blocco, pet e cura; legend → hero; worldMission a mano; solitaria = `minTitle` | unit + integration | `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/outcomes/crime-guard-conclusion.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-03-03 | 03 | 3 | — | — | bookkeeping del piano 03 | — | `grep -qF -- "- [x] 21-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-04-01 | 04 | 4 | BE-RANKP-01 | T-21-10 | posto null in boss/worldMission → `QUEST_NOT_ACCEPTABLE`, nessuna scrittura; spec che passano da accettazione, avvio e timeout portate a posti a titolo | unit + integration | `npx jest src/quests --selectProjects unit`; integration del `<verify>` di 04-01 (acceptance, party, liveness, publisher dell'avvio, arrivo del viaggio, sweeper e processor della risoluzione, più le sei di non regressione) | ✅ | ✅ green |
| 21-04-02 | 04 | 4 | BE-RANKP-01 | T-21-11, T-21-12, T-21-13 | report di sola lettura al boot (posti null, titoli senza blocco, magie sotto mage) | unit + integration | `npx jest src/quests/maintenance --selectProjects unit`; `npx jest src/quests/maintenance --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-04-03 | 04 | 4 | — | — | bookkeeping del piano 04 | — | `grep -qF -- "- [x] 21-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-05-01 | 05 | 5 | BE-RANKP-04 | T-21-14 | aid solo dai cinque tipi; sconfitta senza aid a vita 1 con `outcome` failure come la guardia persa | unit | `npx jest src/quests/outcomes --selectProjects unit` | ✅ | ✅ green |
| 21-05-02 | 05 | 5 | BE-RANKP-04 | T-21-15, T-21-16 | aid di gruppo coi blocchi (campo per campo) senza cura; hunt → aid, job → no; crime invariata | unit + integration | `npx jest src/quests/outcomes/quest-combat.int-spec.ts src/quests/outcomes/crime-guard-conclusion.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-05-03 | 05 | 5 | — | — | bookkeeping del piano 05 | — | `grep -qF -- "- [x] 21-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-06-01 | 06 | 6 | BE-RANKP-06 | T-21-17, T-21-18 | l'archiviatore che chiude un'aid libera i soccorritori iscritti (RED della sonda 1); `disband` coi membri del claim | integration | `npx jest src/characters/deletion/character-archiver.int-spec.ts src/quests/party/party-timeout.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-06-02 | 06 | 6 | BE-RANKP-06 | T-21-19, T-21-20 | push `questCancelled` dai chiamanti dopo il commit | integration | `npx jest src/characters/deletion/character-deletion.resolver.int-spec.ts src/characters/deletion/character-archiver.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-06-03 | 06 | 6 | — | — | bookkeeping del piano 06 | — | `grep -qF -- "- [x] 21-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-07-01 | 07 | 7 | BE-RANKP-03 | T-21-21, T-21-22 | regole pure del boss misto; draft coi blocchi; pet per blocco | unit | `npx jest src/quests/generation --selectProjects unit` | ✅ | ✅ green |
| 21-07-02 | 07 | 7 | BE-RANKP-03 | T-21-23, T-21-24 | generatore: boss misti col solo titolo inferiore, enemy identiche all'istantanea di prima, copertura sul titolo più alto, nessuna semina sulle scritte a mano; `seatViolationsOf` aggiornato | integration | `npx jest src/quests/generation test/quests/quest-generation.e2e.int-spec.ts test/quests/quest-generation-access.e2e.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-07-03 | 07 | 7 | — | — | bookkeeping del piano 07 | — | `grep -qF -- "- [x] 21-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-08-01 | 08 | 8 | BE-RANKP-05 | T-21-25, T-21-26 | turni E F, porta con sconfitta in esplorazione e ultimo turno, segnaposto senza tiri nuovi, contatori anche del successo parziale, porta di test | unit | `npx jest src/quests/outcomes/dungeon --selectProjects unit` | ✅ | ✅ green |
| 21-08-02 | 08 | 8 | — | — | bookkeeping del piano 08 | — | `grep -qF -- "- [x] 21-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-09-01 | 09 | 9 | BE-RANKP-05 | T-21-27 | contatori dei turni sugli esiti della dungeon (vinta, persa, null altrove compresa la sconfitta senza aid); `dungeonBattleOf` coi contatori | unit | `npx jest src/quests/outcomes src/models --selectProjects unit` | ✅ | ✅ green |
| 21-09-02 | 09 | 9 | BE-RANKP-05 | T-21-48 | `rescue.turn` salvato sull'aid alla sconfitta (scontro ed esplorazione) | unit + integration | `npx jest src/quests/outcomes/quest-dungeon.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-09-03 | 09 | 9 | — | — | bookkeeping del piano 09 | — | `grep -qF -- "- [x] 21-09-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-10-01 | 10 | 10 | BE-RANKP-05 | — | helper del turno del soccorso; esito `death` col turno della caduta, `rescued` null | unit | `npx jest src/quests/outcomes --selectProjects unit` | ✅ | ✅ green |
| 21-10-02 | 10 | 10 | BE-RANKP-04, BE-RANKP-05 | T-21-28, T-21-29, T-21-30, T-21-31 | percorso del soccorritore fino al turno; aid persa col turno nuovo; death da timeout col turno; dungeon aperta agli altri; salvato libero | integration | `npx jest src/quests/outcomes/dungeon-aid.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts src/quests/outcomes/quest-dungeon.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-10-03 | 10 | 10 | — | — | bookkeeping del piano 10 | — | `grep -qF -- "- [x] 21-10-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-11-01 | 11 | 11 | BE-RANKP-05 | T-21-32, T-21-33, T-21-34 | quota pura, premi scalati alla nascita (rapporto per una sorgente già scalata), soglie scalate con gli stessi tiri | unit | `npx jest src/quests/outcomes --selectProjects unit` | ✅ | ✅ green |
| 21-11-02 | 11 | 11 | BE-RANKP-05 | T-21-32 | criterio 4: 5/8 al 5° turno (esplorazione), 1/2 al 4° (scontro) | unit + integration | `npx jest src/quests/outcomes/dungeon-aid.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-11-03 | 11 | 11 | — | — | bookkeeping del piano 11 | — | `grep -qF -- "- [x] 21-11-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-12-01 | 12 | 12 | BE-RANKP-03, BE-RANKP-06 | T-21-35, T-21-36, T-21-37, T-21-38, T-21-39 | `Quest.prizes` per viewer (HTTP, WS per subscriber, senza personaggio, solitaria intera), `rankPrizes`; pin di `type Quest` e `type QuestRankPrizes` e SDL rigenerato | unit + integration | `npx jest src/quests/no-effect --selectProjects unit`; `npx jest test/app.int-spec.ts src/quests/quests.resolver.int-spec.ts src/quests/quest-updated.subscription.int-spec.ts src/quests/quest-board.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 21-12-02 | 12 | 12 | BE-RANKP-05, BE-RANKP-06 | T-21-39 | campi dei turni sul filo, enum registrato, SDL additivo verbatim al boot reale | integration | `npx jest test/app.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` + `git diff 1f9db973 -- src/schema.gql \| grep -cE '^-[^-]'` = 0 | ✅ | ✅ green |
| 21-12-03 | 12 | 12 | — | — | bookkeeping del piano 12 | — | `grep -qF -- "- [x] 21-12-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-13-01 | 13 | 13 | BE-RANKP-01..06 | T-21-40, T-21-41, T-21-42, T-21-43, T-21-44 | gate: tsc, unit e integration complete senza coverage, boot reale, SDL additivo, coverage per cartella, lint mirato, invarianti, tabella di copertura per titolo del caso | unit + integration | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 21-13-02 | 13 | 13 | — | — | bookkeeping del piano 13 | — | `grep -qF -- "- [x] 21-13-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 21-14-01 | 14 | 14 | BE-RANKP-06 | T-21-45 | handoff `BACKEND-NOTES.md` §0–§7 con SDL verbatim, matrice dei turni, lettura dell'aid di dungeon, UAT; nessun segreto | doc | `grep -cE "^## [0-7]\." .planning/phases/21-premi-per-rango-e-soccorsi/BACKEND-NOTES.md` = 8 | ✅ | ⬜ pending |
| 21-14-02 | 14 | 14 | BE-RANKP-01..06 | T-21-46 | VALIDATION firmata, requisiti chiusi dopo il gate, ROADMAP e STATE a 14/14 | doc | `grep -cE '\- \[x\] \*\*BE-RANKP-0[1-6]\*\*' .planning/REQUIREMENTS.md` = 6 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Decision Coverage

Ogni decisione del CONTEXT → piano-task e caso NUOVO che la prova. Il gate 13 la verifica con `grep -cF "<Caso>" <Spec>` sul titolo intero (I1: D-01, D-03, D-06, D-08, D-09, D-12 hanno già occorrenze di fasi precedenti); D-17 e D-30 anche sui documenti. Nessuna decisione parziale.

| Decisione | Piano-task | Spec | Caso |
|-----------|------------|------|------|
| D-01 | 02-01, 03-02, 12-01 | `src/quests/prizes/rank-prizes.spec.ts` | `reads a solo quest as one block on its minimum title (D-01)` |
| D-02 | 04-01, 04-02 | `src/quests/maintenance/group-prize.report.spec.ts` | `reports an untitled seat of a boss or a world mission (D-02, D-24)` |
| D-03 | 07-01, 07-02 | `src/quests/generation/quest-generator.int-spec.ts` | `generates mixed bosses with the lower title only (D-03, D-23)` |
| D-04 | 02-01, 03-02 | `src/quests/prizes/rank-prizes.spec.ts` | `picks the block of the exact title (D-04)` |
| D-05 | 02-01, 03-01, 03-02, 07-01 | `src/quests/outcomes/outcome-plan.spec.ts` | `heals with the cure of the character title block (D-05)` |
| D-05a | 03-01, 03-02, 07-01 | `src/quests/outcomes/boss-resolution.int-spec.ts` | `gives each seat the block of its own title in a mixed boss (D-04, D-05, D-05a)` |
| D-05b | 01-01 | `src/quests/outcomes/rewards/quest-rewards.spec.ts` | `teaches a fixed spell only to a caster title (D-05b, D-25)` |
| D-05c | 01-01, 04-02, 07-01 | `src/quests/outcomes/outcome-plan.spec.ts` | `never teaches a spell to a rookie on any path (D-05b, D-05c)` |
| D-06 | 02-01, 03-02, 07-02 | `src/quests/outcomes/gm-completion.service.int-spec.ts` | `uses the hand written blocks of a world mission as they are (D-06, D-04)` |
| D-07 | 12-01 | `src/quests/quests.resolver.int-spec.ts` | `shows each viewer the prize block of their title (D-07, D-22)` |
| D-08 | 03-02, 12-02 | `src/quests/results/quest-result.resolver.int-spec.ts` | `keeps the rewards of each participant in the same shape (D-08)` |
| D-09 | 05-01, 05-02 | `src/quests/outcomes/aid/aid-opening.spec.ts` | `opens an aid only for enemy, boss, hunt, dungeon and aid (D-09)` |
| D-09b | 05-02 | `src/quests/outcomes/crime-guard-conclusion.int-spec.ts` | `leaves a lost crime fight at one life point without aid and never arrests (D-19, D-09b)` |
| D-10 | 05-01, 10-02 | `src/quests/outcomes/dungeon-aid.int-spec.ts` | `applies the lost aid rule and saves the turn where the rescuers fell (D-10, D-26)` |
| D-11 | 05-02 | `src/quests/outcomes/aid/aid-quest.spec.ts` | `clones the rank blocks of a group quest without their cure (D-11)` |
| D-12 | 08-01, 09-02, 10-02 | `src/quests/outcomes/quest-dungeon.int-spec.ts` | `saves the fight turn of the defeat on the aid (D-12)` |
| D-13 | 08-01, 09-02, 10-02 | `src/quests/outcomes/quest-dungeon.int-spec.ts` | `saves an exploration turn of the defeat on the aid (D-12, D-13)` |
| D-14 | 11-01, 11-02 | `src/quests/outcomes/aid/rescue-share.spec.ts` | `shares the prize by the completed turns (D-14, D-20)` |
| D-15 | 10-02 | `src/quests/outcomes/dungeon-aid.int-spec.ts` | `keeps the dungeon open to the others while its aid is open (D-15)` |
| D-16 | 06-01 | `src/characters/deletion/character-archiver.int-spec.ts` | `releases the registered rescuers of an aid it concludes (D-16, D-27)` |
| D-17 | 14-01 | `BACKEND-NOTES.md` §6 | (documento: 0 aid a DB, pulizia fatta nel discuss, nessun codice) |
| D-18 | 02-01, 03-02, 12-01 | `src/quests/prizes/rank-prizes.spec.ts` | `falls back to the highest block not above the title (D-18)` |
| D-19 | 05-01, 05-02, 09-01 | `src/quests/outcomes/defeat-without-aid.spec.ts` | `carries the same failure outcome as a lost guard encounter (D-19)` |
| D-20 | 11-01, 11-02 | `src/quests/outcomes/rewards/cascading-loot.spec.ts` | `scales the drop chance by the share with the same draws (D-20)` |
| D-21 | 08-01, 09-01, 09-02, 10-01, 10-02, 12-02 | `src/quests/outcomes/dungeon-aid.int-spec.ts` | `writes the turns of a rescuer who wins a dungeon aid (D-21)` |
| D-22 | 12-01, 12-02 | `test/app.int-spec.ts` | `adds the rank prize blocks to the schema (D-22)` |
| D-23 | 07-01, 07-02 | `src/quests/generation/generation-rules.spec.ts` | `mixes one boss out of two (D-23)` |
| D-24 | 04-01, 04-02 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` | `rejects a group quest with a seat without a title with QUEST_NOT_ACCEPTABLE and writes nothing (D-24)` |
| D-25 | 01-01 | `src/quests/outcomes/study-spell-draw.int-spec.ts` | `teaches the Valantar spell only to a caster (D-05b, D-25)` |
| D-26 | 10-01, 10-02 | `src/quests/outcomes/dungeon/dungeon-turns.spec.ts` | `saves the turn where the rescuers fell (D-26)` |
| D-27 | 06-01, 06-02 | `src/characters/deletion/character-deletion.resolver.int-spec.ts` | `cancels the quest of the rescuers released by a deletion (D-27)` |
| D-28 | 02-01, 03-02, 04-02, 13-01 | `src/quests/prizes/rank-prizes.spec.ts` | `reads a legacy boss without blocks as one block on its minimum title (D-28)` |
| D-29 | 08-01 | `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts` | `passes every exploration without drawing (D-29)` |
| D-30 | 11-02 | `src/quests/outcomes/dungeon-aid.int-spec.ts` | `rescues a dungeon lost on the fifth turn with five eighths of the prize (D-14, D-20, D-30)` |

## Success Criteria Coverage (ROADMAP Phase 21)

| Criterio | Piano-task | Prova |
|----------|------------|-------|
| 1. Boss misto: ognuno il suo blocco col suo pet; solitaria rookie = premio del `minTitle`; nessun rookie impara una magia | 03-02, 01-01 | `boss-resolution.int-spec.ts` «gives each seat the block of its own title in a mixed boss (D-04, D-05, D-05a)»; `quest-resolution.service.int-spec.ts` «gives the minimum title prize of a solo quest to any winner (D-01)»; `outcome-plan.spec.ts` «never teaches a spell to a rookie on any path (D-05b, D-05c)» |
| 2. Generatore misto col solo titolo inferiore e blocchi dalle tabelle; worldMission a mano coi suoi blocchi; posto null rifiutato o riportato | 07-02, 03-02, 04-01, 04-02 | `quest-generator.int-spec.ts` «generates mixed bosses with the lower title only (D-03, D-23)»; `gm-completion.service.int-spec.ts` «uses the hand written blocks of a world mission as they are (D-06, D-04)»; `quest-acceptance.service.int-spec.ts` «rejects a group quest with a seat without a title with QUEST_NOT_ACCEPTABLE and writes nothing (D-24)»; `group-prize-report.service.int-spec.ts` «reports the open group quests and writes nothing (D-24, D-28)» |
| 3. Hunt persa → aid, job persa → no; boss perso → aid coi blocchi e i posti; crime con l'arresto senza aid | 05-02 | `quest-combat.int-spec.ts` «creates no aid for a lost job and leaves one life point (D-19)»; `boss-resolution.int-spec.ts` «opens an aid with the seats and the rank blocks of a lost boss (D-09, D-11)»; `crime-guard-conclusion.int-spec.ts` «keeps the crime arrest as it is: ten hours of prison, a quarter of the coins lost, no prize (D-09b)» |
| 4. Dungeon da 8 turni persa al 5° (esplorazione) → 5/8, al 4° (scontro) → metà, quota già sul foglio; soccorso perso → regola dell'aid persa; heal/job/study/magic/crime/guard perse → 1 di vita senza aid | 11-02, 10-02, 05-01 | `dungeon-aid.int-spec.ts` «rescues a dungeon lost on the fifth turn with five eighths of the prize (D-14, D-20, D-30)», «rescues a dungeon lost on the fourth turn with half of the prize (D-14, D-20, D-30)», «applies the lost aid rule and saves the turn where the rescuers fell (D-10, D-26)»; `combatant-plan.spec.ts` «concludes a lost %s without aid at one life point (D-19)» |
| 5. Archiviatore che libera corsie e PendingQuest; SDL al boot reale; handoff per la FE Phase 20 | 06-01, 12-01, 12-02, 14-01 | `character-archiver.int-spec.ts` «releases the registered rescuers of an aid it concludes (D-16, D-27)»; `test/app.int-spec.ts` «adds the rank prize blocks to the schema (D-22)», «adds the dungeon turns to the schema (D-21, D-22)»; `BACKEND-NOTES.md` |

## Requirement Coverage

| Requisito | Piani |
|-----------|-------|
| BE-RANKP-01 | 02, 03, 04, (13, 14) |
| BE-RANKP-02 | 01, 02, 03, (13, 14) |
| BE-RANKP-03 | 07, 12, (13, 14) |
| BE-RANKP-04 | 05, 10, (13, 14) |
| BE-RANKP-05 | 08, 09, 10, 11, 12, (13, 14) |
| BE-RANKP-06 | 06, 12, 14, (13) |

---

## Wave 0 Requirements

Le spec nuove nascono nel commit RED del task che le usa (TDD, REPO-RULES): nessun piano di soli scaffold.

- [ ] `src/quests/prizes/rank-prizes.spec.ts` — lettura e scelta dei blocchi (BE-RANKP-01/02), piano 02
- [ ] `src/quests/quest-catalog.populate.int-spec.ts` — ref dei blocchi su query vera (BE-RANKP-01), piano 02
- [ ] `src/quests/maintenance/group-prize.report.spec.ts` e `group-prize-report.service.int-spec.ts` — report D-24, piano 04
- [ ] `src/quests/outcomes/aid/aid-opening.spec.ts`, `src/quests/outcomes/defeat-without-aid.spec.ts` — D-09, D-19, piano 05
- [ ] `src/quests/outcomes/dungeon/dungeon-turns.spec.ts` e `test/quests/turn-failing-dungeon-resolver.ts` — turni e porta di test (BE-RANKP-05), piano 08
- [ ] `src/quests/outcomes/dungeon-aid.int-spec.ts` — percorso del soccorritore e quota (BE-RANKP-05), piani 10–11
- [ ] `src/quests/outcomes/aid/rescue-share.spec.ts` — quota proporzionale (BE-RANKP-05), piano 11

Harness: nessuno nuovo. Nessuna installazione di framework.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UAT su device: foglio del boss misto con blocchi diversi per mage e paladin, premi per titolo alla vittoria, aid di dungeon a metà premio con la riga dei turni, job persa a 1 di vita senza aid, `questCancelled` dopo la cancellazione di un ferito | BE-RANKP-01..06 | Device reale e database reale: fuori dagli esecutori (REPO-RULES) | Piano nel handoff `BACKEND-NOTES.md` §6 (stato «da eseguire»); semine con script fuori repo a cura dell'orchestratore dopo il riavvio del BE dal ramo |
| `npm run test:cov` con le soglie per cartella | BE-RANKP-06 | ≈ 630 s, oltre i 600 s dello strumento: mai da un esecutore | Lanciato dall'orchestratore in background dopo il gate; il piano 13 misura la coverage per cartella come ripiego |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
