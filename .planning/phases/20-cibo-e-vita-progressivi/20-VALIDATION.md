---
phase: 20
slug: cibo-e-vita-progressivi
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-12
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest (progetti `unit` e `integration`, `package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), `createOutcomeHarness` e harness di `travel-completion.int-spec.ts`, `FixedClock`, mondo delle imboscate `test/travel/ambush-world.ts`, fixture del cibo `test/travel/travel-food.fixture.ts`, `ScriptedCombatResolver`, boot reale `test/app.int-spec.ts` |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella; a rischio: `./src/travel/` 97/84/98, `./src/quests/acceptance/` 97/91/98) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | nel piano di gate: `npx jest --selectProjects unit` + integration a blocchi per cartella senza coverage; `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | unit del viaggio ≈ 3 s; le cinque int-spec del viaggio ≈ 28 s; `tsc` ≈ 11 s; boot reale ≈ 8 s; `src/quests` integration ≈ 150 s; `test:cov` ≈ 630 s (fuori dai 600 s dello strumento) |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** le spec del piano + `git diff --exit-code src/schema.gql` + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** gate del penultimo piano verde (unit completo, integration completa a blocchi, boot reale, SDL identico, coverage per cartella di `./src/travel/` e `./src/quests/acceptance/`)
- **Max feedback latency:** 150 s (blocco integration di `src/quests`); 3–30 s per le spec mirate

---

## Per-Task Verification Map

Le righe per task le scrive il piano (bookkeeping di fine piano, REPO-RULES); qui la mappa requisito → prova della ricerca, che ogni task deve coprire.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (mappa 01) | — | — | BE-FOODP-01 | — | piano salvato alla partenza libera, inventario e vita intatti | integration | `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| (mappa 02) | — | — | BE-FOODP-01 | — | piano salvato nel claim, salto e marker senza piano | integration | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| (mappa 03) | — | — | BE-FOODP-01 | — | builder di partenza/claim con `food`, nessun meal set | unit | `npx jest src/travel/travel.updates.spec.ts src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| (mappa 04) | — | — | BE-FOODP-01 | — | `foodPlanOf` (campi, `uncoveredKm`, clamp di `coveredKm`) | unit | `npx jest src/travel/food/travel-food.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| (mappa 05) | — | — | BE-FOODP-02 | — | `travelKmAt` (0, metà, clamp, duration 0) | unit | `npx jest src/travel/travel-timing.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| (mappa 06) | — | — | BE-FOODP-02 | — | `travelHungerAt`/`hungerBetween`: 0 km, confine, oltre, intero, proprietà dei totali, nessun negativo | unit | `npx jest src/travel/food/travel-food.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| (mappa 07) | — | — | BE-FOODP-02 | — | `settlementOf`: clamp a 1, nessuna scrittura a incremento zero, vita oltre il massimo non abbassata | unit | `npx jest src/travel/food/travel-food-settlement.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| (mappa 08) | — | — | BE-FOODP-02 | — | sweep: niente prima del confine; scatti dopo; pozione fra due sweep; imboscata pendente limita il km; doppio sweep idempotente; legacy ignorato | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| (mappa 09) | — | — | BE-FOODP-02 | — | `TravelSweeper` chiama il passo dopo i completamenti, errore isolato | unit | `npx jest src/travel/travel-sweeper.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| (mappa 10) | — | — | BE-FOODP-03 | — | selezione parziale: 30 km su 400 → fabbisogno di 30 km; 400 → tutto; dopo il confine = (a) | unit | `npx jest src/travel/food/travel-food-settlement.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| (mappa 11) | — | — | BE-FOODP-03 | — | pasto al confine una volta sola; acquisto/pozione concorrente conservati | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| (mappa 12) | — | — | BE-FOODP-03 | — | teleport a metà: (c) + fame al km; senza viaggio/deviazione/legacy nulla | integration | `npx jest src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| (mappa 13) | — | — | BE-FOODP-04 | — | imboscata al km 290: vita d'ingresso esatta nel contesto; vittoria conserva il piano con `settledKm = km` | integration | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| (mappa 14) | — | — | BE-FOODP-04 | — | sconfitta al km 30 di 400: cibo pro-rata, deviazione senza `food`; legacy invariato (701) | integration | idem | ✅ | ⬜ pending |
| (mappa 15) | — | — | BE-FOODP-04 | — | arrivo: fame fino a `distanceKm`, pasto (b), totali = Phase 14; doppio trigger una volta; legacy invariato | integration | `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| (mappa 16) | — | — | BE-FOODP-04 | — | piano puro dell'imboscata con assestamento (vittoria/sconfitta, legacy) | unit | `npx jest src/travel/ambush/ambush-plan.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| (mappa 17) | — | — | BE-FOODP-05 | — | SDL identico al boot reale | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` + `git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| (mappa 18) | — | — | BE-FOODP-05 | — | indice dichiarato e costruito (se OQ-4) | unit + integration | `npx jest src/models/sweep-indexes.schema.spec.ts --selectProjects unit`; `npx jest src/mongo/sweep-index.verifier.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 20-01-01 | 01 | 1 | BE-FOODP-01, BE-FOODP-05 | T-20-01, T-20-04 | `ActiveTravelFood` interno su `ActiveTravel.food`, assente sui legacy, SDL identico | unit + integration | `npx jest src/models/character/active-travel.schema.spec.ts --selectProjects unit`; `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` + `git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 20-01-02 | 01 | 1 | BE-FOODP-02, BE-FOODP-05 | T-20-02, T-20-03 | `travelKmAt`, `coveredKmOf`, `travelHungerAt`, `hungerBetween`, `foodPlanOf`; griglia di 350 partizioni sui totali della Phase 14 | unit | `npx jest src/travel/food src/travel/travel-timing.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 20-01-03 | 01 | 1 | — | — | bookkeeping del piano 01 | — | `grep -qF -- "- [x] 20-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 20-02-01 | 02 | 2 | BE-FOODP-02, BE-FOODP-03, BE-FOODP-05 | T-20-05, T-20-06, T-20-09 | `settlementOf`, `settlementIsDue`, `reachedKmOf`, `foodLegOf`: fame incrementale clampata, pasto nei tre momenti, fail-safe del confine | unit | `npx jest src/travel/food/travel-food-settlement.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 20-02-02 | 02 | 2 | BE-FOODP-02, BE-FOODP-03, BE-FOODP-05 | T-20-05, T-20-07, T-20-08, T-20-10 | `settlementSetOf`, `foodProgressSetOf`, `settlementGuardsOf`; `foodCatalogFor` pubblico, `stacksOf` esportato | unit + integration | `npx jest src/travel/food --selectProjects unit`; `npx jest src/travel/food/travel-pantry.reader.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 20-02-03 | 02 | 2 | — | — | bookkeeping del piano 02 | — | `grep -qF -- "- [x] 20-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 20-03-01 | 03 | 3 | BE-FOODP-04 | T-20-11 | `COMPLETION_PROJECTION` con distanza, durata e piano; fixture `buildActiveTravelFood` / `buildFoodTravelDoc` | unit | `npx jest src/travel/travel.updates.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 20-03-02 | 03 | 3 | BE-FOODP-03, BE-FOODP-04, BE-FOODP-05 | T-20-11, T-20-12, T-20-13 | `settleArrivalFood`: fame fino a fine percorso e pasto (b) nella transazione dell'arrivo, concorrente una volta, legacy intatto | integration | `npx jest src/travel/travel-completion.int-spec.ts src/travel/travel-completion.processor.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 20-03-03 | 03 | 3 | — | — | bookkeeping del piano 03 | — | `grep -qF -- "- [x] 20-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 20-04-01 | 04 | 4 | BE-FOODP-02, BE-FOODP-03, BE-FOODP-05 | T-20-15, T-20-16, T-20-17, T-20-18, T-20-19, T-20-20, T-20-21 | `TravelFoodSweep.settleDue`: nessuna scrittura nel tratto coperto, pasto al confine una volta, fame a scatti di km, pozione conservata, concorrenti una volta, imboscata limita il km, legacy e piano malformato intatti, fail-safe D-19, errore isolato | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 20-04-02 | 04 | 4 | BE-FOODP-02, BE-FOODP-05 | T-20-19 | `TravelSweeper.runOnce` chiama il passo dopo i completamenti allo stesso istante, errore isolato; indice `character_active_travel_food` dichiarato e costruito | unit + integration | `npx jest src/travel/travel-sweeper.spec.ts src/models/sweep-indexes.schema.spec.ts --selectProjects unit`; `npx jest src/travel/food/travel-food.sweep.int-spec.ts src/mongo/sweep-index.verifier.int-spec.ts src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 20-04-03 | 04 | 4 | — | — | bookkeeping del piano 04 | — | `grep -qF -- "- [x] 20-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 20-05-01 | 05 | 5 | BE-FOODP-03, BE-FOODP-04, BE-FOODP-05 | T-20-22, T-20-23 | `ambushFoodOf`, `withFoodSettlement`, `defeatSettlementOf`: fame e pasto al km salvato (mai dall'ora), pasto dei km percorsi per la sconfitta, legacy e piano malformato senza passo | unit | `npx jest src/travel/ambush/ambush-food.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 20-05-02 | 05 | 5 | BE-FOODP-03, BE-FOODP-04, BE-FOODP-05 | T-20-23, T-20-24, T-20-25 | `planAmbushOutcome` col passo «cibo»: vittoria con `settledKm` e pasto, `hpBefore` fame compresa, sconfitta col cibo dei km percorsi e deviazione senza piano, guardie in una sola lista, legacy senza path | unit | `npx jest src/travel/ambush --selectProjects unit` | ✅ | ✅ green |
| 20-05-03 | 05 | 5 | — | — | bookkeeping del piano 05 | — | `grep -qF -- "- [x] 20-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 20-06-01 | 06 | 6 | BE-FOODP-05 | — | `TravellerOptions` con `distanceKm`, `durationMs`, `food`; default identici | integration | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts src/travel/ambush/ambush-sweeper.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 20-06-02 | 06 | 6 | BE-FOODP-03, BE-FOODP-04, BE-FOODP-05 | T-20-26, T-20-27, T-20-28 | `AmbushResolutionService`: catalogo del cibo fuori dalla transazione, combattimento con la vita del km salvato (945 al km 290), vittoria col piano, sconfitta col cibo dei km percorsi e deviazione senza piano, legacy intatto | integration | `npx jest src/travel/ambush --selectProjects integration --runInBand` | ✅ | ✅ green |
| 20-06-03 | 06 | 6 | — | — | bookkeeping del piano 06 | — | `grep -qF -- "- [x] 20-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le spec nuove nascono nel commit RED del task che le usa (TDD, REPO-RULES): nessun piano di soli scaffold.

- [ ] `test/travel/ambush-world.ts` — `TravellerOptions` con `distanceKm`, `durationMs`, `food` (viaggi da 400 km sulla polilinea R1)
- [ ] `test/travel/active-travel.fixture.ts` — opzione `food` per `buildActiveTravelDoc` e builder `buildActiveTravelFood(overrides)`
- [x] `src/travel/food/travel-food-settlement.spec.ts` — unit dell'assestamento puro (BE-FOODP-02, BE-FOODP-03)
- [ ] `src/travel/food/travel-food.sweep.int-spec.ts` — sweep con `FixedClock` e `sweepIntervalMs: 0` (BE-FOODP-02, BE-FOODP-03)

Harness: nessuno nuovo. Nessuna installazione di framework.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UAT su device con l'app com'è: viaggio lungo con poco cibo (vita che cala a scatti di un chilometro nel tratto scoperto, cibo tolto al confine), sconfitta seminata al km 30 (cibo pro-rata, deviazione senza costi), pozione bevuta in viaggio che resta nel conto | BE-FOODP-02..04 | Device reale e database reale: fuori dagli esecutori (REPO-RULES) | Piano di UAT nel handoff `BACKEND-NOTES.md` §4; lo guida l'orchestratore dopo il riavvio del BE dal ramo |
| `npm run test:cov` con le soglie per cartella | BE-FOODP-05 | ≈ 630 s, oltre i 600 s dello strumento: mai da un esecutore | Lanciato dall'orchestratore in background dopo il gate; il piano di gate misura la coverage per cartella come ripiego |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
