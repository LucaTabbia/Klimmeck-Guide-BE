---
phase: 14
slug: viaggio-e-cibo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-05
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest, progetti `unit` (`*.spec.ts`) e `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` condiviso da `test/setup/global-setup.ts`) |
| **Config file** | `package.json` §`jest` (progetti, `coverageThreshold` per cartella: `./src/travel/` 97/84/98, `./src/quests/acceptance/` 97/91/98) |
| **Quick run command** | `npx jest src/travel/food --selectProjects unit` |
| **Integration mirata** | `npx jest <percorsi> --selectProjects integration --runInBand` (es. `src/travel/travel.service.int-spec.ts` ≈ 6 s) |
| **Boot reale / SDL** | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` |
| **Full suite command** | `npx tsc --noEmit -p tsconfig.json && npm run test:cov` (solo nel piano 07) |
| **Estimated runtime** | unit ≈ 5 s; integration mirata 6–40 s; `npm run test:cov` ≈ 9 min |

---

## Sampling Rate

- **After every task commit:** la spec mirata del task (unit o integration `--runInBand`) + `npx tsc --noEmit -p tsconfig.json` + grep dei trailer = 0
- **After every plan wave:** le int-spec della cartella toccata (`src/travel` nei piani 03–05, `src/quests/acceptance` nei piani 05–06), boot reale nei piani che cambiano lo SDL (03, 05)
- **Before `/gsd-verify-work`:** `npm run test:cov` verde con le soglie, boot reale verde, SDL additivo (piano 07)
- **Max feedback latency:** 60 s per task (le int-spec più lunghe dell'accettazione)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | BE-FOOD-01, BE-FOOD-03 | T-14-02, T-14-04 | costanti in codice, nessuna variabile d'ambiente; km scoperti in metri interi senza errore di virgola mobile; vita triangolare esatta | unit | `npx jest src/travel/food/travel-food.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 14-01-02 | 01 | 1 | BE-FOOD-02, BE-FOOD-03 | T-14-01, T-14-02, T-14-03 | DP limitata, deterministica, stack non validi ignorati, soglia 1 HP | unit | `npx jest src/travel/food --selectProjects unit` | ✅ | ✅ green |
| 14-01-03 | 01 | 1 | BE-FOOD-01 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 14-02-01 | 02 | 2 | BE-FOOD-03 | T-14-07 | `extensions` esattamente `{ code }`, messaggio fisso | unit | `npx jest src/gameRules --selectProjects unit` | ✅ | ✅ green |
| 14-02-02 | 02 | 2 | BE-FOOD-05 | T-14-05, T-14-06 | guardie su quantità e HP (null per i legacy), set vuoto senza costo | unit | `npx jest src/travel/food --selectProjects unit` | ✅ | ✅ green |
| 14-02-03 | 02 | 2 | BE-FOOD-05 | T-14-08 | builder estesi senza cambiare le attese esistenti | unit | `npx jest src/travel/travel.updates.spec.ts src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 14-02-04 | 02 | 2 | BE-FOOD-03 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 14-03-01 | 03 | 3 | BE-FOOD-04, BE-FOOD-06 | T-14-12, T-14-13 | lettura in sessione provata, nessun log del personaggio | integration | `npx jest src/travel/food/travel-pantry.reader.int-spec.ts src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 14-03-02 | 03 | 3 | BE-FOOD-04 | T-14-09, T-14-10, T-14-11, T-14-12 | anteprima owner-only invariata, `item.id` non nullo, cibo senza catalogo saltato, legacy senza `ownedItems` = dispensa vuota, SDL additivo | integration + boot | `npx jest src/travel/food/travel-pantry.reader.int-spec.ts src/travel/travel.resolver.int-spec.ts src/travel/travel.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 14-03-03 | 03 | 3 | BE-FOOD-04 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 14-04-01 | 04 | 4 | BE-FOOD-03, BE-FOOD-05 | T-14-15, T-14-16, T-14-17, T-14-18 | rifiuto senza scritture né job, HP ≥ 1, codice della corsa prima della fame | integration | `npx jest src/travel --selectProjects integration --runInBand` | ✅ | ✅ green |
| 14-04-02 | 04 | 4 | BE-FOOD-05, BE-FOOD-06 | T-14-14, T-14-15, T-14-19 | acquisto concorrente non perso (prova di mutazione), un solo consumo su due partenze, teleport esente | integration | `npx jest src/travel/travel.service.int-spec.ts src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 14-04-03 | 04 | 4 | BE-FOOD-05 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 14-05-01 | 05 | 5 | BE-FOOD-04 | T-14-23 | nessun WARN del salto dall'anteprima, WARN dell'accettazione identico | integration | `npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 14-05-02 | 05 | 5 | BE-FOOD-04, BE-FOOD-06 | T-14-20, T-14-21, T-14-22, T-14-24, T-14-25 | owner-only senza innkeeper, UNAUTHENTICATED, BAD_USER_INPUT, nessuna scrittura, SDL nullable additivo | integration + boot | `npx jest src/quests/acceptance test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ (RED prima) | ⬜ pending |
| 14-05-03 | 05 | 5 | BE-FOOD-04 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 14-06-01 | 06 | 6 | BE-FOOD-03, BE-FOOD-05 | T-14-27, T-14-29, T-14-30 | nessun punto, PendingQuest, registrazione o job su un rifiuto; codice della corsa prima della fame; esenzioni | integration | `npx jest src/quests/acceptance src/quests/pending-requests src/quests/party --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 14-06-02 | 06 | 6 | BE-FOOD-05, BE-FOOD-06 | T-14-26, T-14-28 | acquisto concorrente non perso nel claim, un solo consumo su due accettazioni, rifiuto sul filo | integration | `npx jest src/quests/acceptance --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 14-06-03 | 06 | 6 | BE-FOOD-05 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 14-07-01 | 07 | 7 | BE-FOOD-01..06 | T-14-31, T-14-32, T-14-33, T-14-34, T-14-35 | suite e soglie verdi, SDL additivo, nessun segreto né trailer, esenzioni intatte | full + boot | `npx tsc --noEmit -p tsconfig.json && npm run test:cov && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 14-07-02 | 07 | 7 | BE-FOOD-01..06 | — | N/A (firma e requisiti) | doc | `grep -q "nyquist_compliant: true" .planning/phases/14-viaggio-e-cibo/14-VALIDATION.md` | ✅ | ⬜ pending |
| 14-07-03 | 07 | 7 | BE-FOOD-06 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 14-08-01 | 08 | 8 | BE-FOOD-06 | T-14-36, T-14-38 | handoff senza URI né valori reali, SDL verbatim | doc | `grep -qF "type TravelFoodItem" .planning/phases/14-viaggio-e-cibo/BACKEND-NOTES.md` | ❌ (creato nel task) | ⬜ pending |
| 14-08-02 | 08 | 8 | BE-FOOD-06 | T-14-37 | emendamenti solo in coda | doc | `grep -q "14-viaggio-e-cibo/BACKEND-NOTES.md" .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` | ✅ | ⬜ pending |
| 14-08-03 | 08 | 8 | BE-FOOD-06 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 14-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessun framework da installare: l'harness esistente (Jest, replica set, `createAuthTestApp`, fixture `persist*`) copre la fase. I file di test nuovi nascono nel passo RED del task che li usa (TDD del repo), non in una wave separata:

- [ ] `src/travel/food/travel-food.spec.ts` — BE-FOOD-01/03 (piano 01, Task 1–2)
- [ ] `src/travel/food/food-selection.spec.ts` — BE-FOOD-02 (piano 01, Task 2)
- [ ] `src/travel/food/travel-food.updates.spec.ts` — BE-FOOD-05, guardie e set (piano 02, Task 2)
- [ ] `src/travel/food/travel-pantry.reader.int-spec.ts` e `test/travel/travel-food.fixture.ts` (`HARDY_LIFE_POINTS`, `persistFood`, `foodStack`) — BE-FOOD-04/06 (piano 03, Task 1)
- [ ] RED a stringa esatta in `test/app.int-spec.ts` (`type TravelPreview`, `type TravelFoodItem` nel piano 03; riga nullable della query, due liste owner-only, UNAUTHENTICATED nel piano 05) e in `src/gameRules/game-rule.exception.spec.ts` (`travelStarving`, piano 02) — D-16

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Partenza coperta, parziale e rifiutata sul DB di sviluppo con il cibo reale a catalogo | BE-FOOD-06 | UAT su device della FE Phase 15 dopo la merge: dati reali (strade, cibi, personaggi) fuori dal repo | l'orchestratore dà il cibo a DB al personaggio di prova (script fuori dal repo, `BACKEND-NOTES.md` §7) e segue i casi (a)–(e) del handoff dal foglio viaggio e dal foglio quest del FE |

Tutto il resto ha verifica automatica.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
