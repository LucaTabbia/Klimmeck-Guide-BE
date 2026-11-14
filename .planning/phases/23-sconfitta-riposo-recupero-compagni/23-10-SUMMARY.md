---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 10
subsystem: travel/ambush, quests/outcomes
tags: [imboscate, compagni, quest-result, transazione, pitfall-9]
requires: [23-05 (companionAfterFight, CompanionOutcomeDraft, QuestResult.companion, companionSlotSet/companionSlotFilter), 23-06 (ScriptedCombatResolver con companionLifeAfter)]
provides: [AmbushPlanInput.petCatalog, AmbushReportDraft.companion, AmbushResultDraft.companion, risultato d'imboscata scritto nella transazione della risoluzione, OutcomeWriter.writeResult(QuestResultDraft | AmbushResultDraft)]
affects: [src/travel/ambush/ambush-plan.ts, src/travel/ambush/ambush-resolution.service.ts, src/quests/outcomes/outcome-writer.service.ts]
tech-stack:
  added: []
  patterns: [insert del QuestResult nella stessa transazione dell'update filtrato per identità, emissione dal change stream dopo il commit]
key-files:
  created: []
  modified:
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-results.ts
    - src/travel/ambush/ambush-results.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - src/travel/ambush/ambush-lifecycle.int-spec.ts
    - src/travel/ambush/ambush-sweeper.int-spec.ts
    - src/travel/ambush/ambush.processor.int-spec.ts
    - src/quests/outcomes/outcome-writer.service.ts
    - src/quests/outcomes/pets/companion-after-fight.spec.ts
  deleted:
    - src/quests/outcomes/pets/companion-xp.ts
    - src/quests/outcomes/pets/companion-xp.spec.ts
decisions:
  - "Slot e guardia dello slot dell'imboscata riusano companionSlotSet / companionSlotFilter di outcome-plan (zero duplicazione)"
  - "writeResult allargato a QuestResultDraft | AmbushResultDraft con import di solo tipo da src/travel/ambush (precedente: guard-encounter e quest-acceptance importano già da src/travel)"
  - "Il viaggio riscritto della sconfitta porta ambushReports = solo i trattenuti (array vuoto se nessuno): la chiave resta, come prima"
metrics:
  duration: ~50 min
  completed: 2026-11-14
---

# Phase 23 Plan 10: imboscate col compagno e QuestResult immediato Summary

L'imboscata decide il compagno con `companionAfterFight` (ferito resta nello slot, sconfitto esce e riposa fino a `at + T`), il report porta `companion`, e il `QuestResult` `kind: ambush` si scrive nella transazione della risoluzione con `resolvedAt = at`: si legge con `unacknowledgedQuestResults` e arriva con `questResultReceived` a viaggio in corso; i report già trattenuti nei viaggi in volo si consegnano ancora all'arrivo e al teleport.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 1c0fd16e | test(travel): pin the companion and the immediate ambush report |
| 1 GREEN | 3b00ec07 | feat(travel): decide the companion of an ambush |
| 2 RED | 1782c0b4 | test(travel): pin the ambush result written at once |
| 2 GREEN | f3e7729c | feat(travel): write the ambush result at the ambush instant |

## Cosa è cambiato

- `ambush-plan.ts`: `AmbushPlanInput.petCatalog`, `AmbushReportDraft.companion?` (assente nei report trattenuti prima della fase), `FoughtOutcome.companion: CompanionAfterFight`; `commonSetOf` aggiunge lo slot vuoto quando `unequip`; `filterOf(input, fought, guarded)` aggiunge lo slot letto; `reportOf` scrive `companion`; niente più `$push` (tolti `REPORT_PATH` e il tipo `$push` da `AmbushOutcomePlan['update']`); `defeatTravelOf` scrive `ambushReports: held`.
- `ambush-results.ts`: `AmbushResultDraft.companion`, `companion: report.companion ?? null`; commento Pitfall 9 sulla consegna legacy.
- `ambush-resolution.service.ts`: `petCatalog: catalog.pets`; in `fight`, dopo `writeCharacterUpdate` e `abandonLane`, `this.writer.writeResult(ambushResultDraftsOf([plan.report], identity.characterId)[0], session)`. Nessuna emissione nella transazione.
- `outcome-writer.service.ts`: `writeResult(result: QuestResultDraft | AmbushResultDraft, session)`.
- `companion-xp.ts` e la sua spec rimossi; i casi ancora utili (tetto, già al tetto, nessun tetto valido, voce assente, riferimento stringa legacy, voci rotte, xp frazionario) portati in `companion-after-fight.spec.ts` (describe «the companion xp after a fight (ex companion-xp, D-39)», 7 casi).
- `travel-completion.service.ts` e `travel.service.ts` NON toccati (consegna legacy invariata).

## Spec riscritte (titolo vecchio → nuovo)

`ambush-plan.spec.ts`:
- «holds the report in the travel with the owner and no reached city (D-13)» → «returns the report with the owner and no reached city, held nowhere (D-28)»
- «carries the held reports into the rewritten travel (D-13)» → «keeps only the held reports in the rewritten travel of a defeat (Pitfall 9, D-28)»
- Nuovi: «writes the wounded companion of a won ambush and keeps it equipped (D-03, D-10)», «unequips a companion defeated in an ambush and dates its return from the ambush instant (D-03, D-26)», «defeats the companion in a lost ambush too (D-26)», «no longer holds the report in the travel on a victory (D-28)», «returns the report of the ambush to be written at once (D-15)». Le attese del describe dell'xp del compagno ora portano `level` (seme con `level: 1`, catalogo base 100 / maxXp 1000 / recupero 1 h).

`ambush-results.spec.ts`: nuovo «carries the companion outcome into the ambush result and null for older held reports (D-10, Pitfall 9)»; il caso della mappatura completa ora attende `companion: null`.

`ambush-resolution.int-spec.ts`:
- «holds the report in the travel until arrival (D-13)» → «writes the ambush result at once while the travel goes on (D-15, D-28)»
- «carries the held reports into the rewritten travel (D-13)» → «keeps the reports held before the deploy in the rewritten travel and writes the new one at once (D-28, Pitfall 9)» (report legacy seminato con `buildAmbushReport`)
- «teaches the enemies of a won ambush and holds the new lore in the report» → «… writes the new lore in the result (D-06, D-09)»
- Nuovi: «serves the unseen ambush results mid-travel and hides them once acknowledged (D-15, D-28)», «writes the companion of the ambush in the result (D-10, D-26)», «writes no result when the resolution is stale (D-28)» (spy su `readCombatCatalog` che sposta `ambush.at` prima della transazione).
- Gli altri casi che leggevano `activeTravel.ambushReports[0]` ora leggono il `QuestResult` (helper `ambushResultsOf` / `ambushResultOf`); harness + `QuestResultsModule`.

`ambush-lifecycle.int-spec.ts` (nessuna riga `chance.load` toccata):
- «wins two ambushes on one travel and delivers both reports at arrival in order (D-02, D-13)» → «writes two ambush results during the travel in order and none at arrival (D-15, D-28)»
- «delivers the companion xp of the ambush in the result created at arrival (D-19)» → «writes the companion xp in the ambush result at once (D-19, D-28)» (voce legacy → `level: 1` all'arrivo)
- «shows the victory effects at once and holds the report until arrival (D-17)» → «shows the victory effects and the result at once (D-17, D-28)»
- «cancels the pending ambush and delivers the reports on teleport (D-02, D-13)» → «still delivers the reports held before the deploy on teleport (D-02, Pitfall 9)» (helper `holdLegacyReport`)
- Nuovo «still delivers the reports held before the deploy at arrival (Pitfall 9)»
- «completes the travel only after the pending ambush is resolved (D-13)»: il risultato d'imboscata è già non visto subito dopo lo sweep. Concurrent, soglie, duplicati, sweep al boot: conteggi sui `QuestResult`.

## RED attesi

- Task 1: 13 fallimenti unit (report col `$push`, voci senza `level`, `companion` assente nel report e nel draft, viaggio della sconfitta con il report nuovo).
- Task 2: 26 fallimenti int (nessun `QuestResult` prima dell'arrivo; dopo il GREEN del Task 1 anche le sconfitte non consegnavano più nulla all'arrivo, stato intermedio voluto).
- Verdi al primo colpo: i 7 casi portati da `companion-xp.spec.ts` (comportamento già presente in `companionAfterFight`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spec di sweeper e processor delle imboscate**
- **Found during:** Task 2 (verify integration su `src/travel/ambush`)
- **Issue:** `ambush-sweeper.int-spec.ts` e `ambush.processor.int-spec.ts` (fuori da `files_modified`) contavano i report nel viaggio.
- **Fix:** gli helper `reportsOf` / `reportCountOf` leggono i `QuestResult` `kind: ambush` del personaggio; nessuna asserzione tolta.
- **Commit:** f3e7729c

**2. [Rule 3 - Blocking] `outcome-writer.service.ts` fuori da `files_modified`**
- Firma di `writeResult` allargata come previsto dal piano (annotata con commento). Commit f3e7729c.

**3. Asserzione `defeat.update.$push` undefined** in «loses with at least one life point…» sostituita da `Object.keys(defeat.update)` = `['$set']` (il tipo non ha più `$push`; stessa prova di assenza). Commit 3b00ec07.

### Note sui grep di accettazione

- Il grep del Task 2 sulle sequenze dei tiri usa `--grep='record plan 09 progress'`, ma il commit del piano 09 si chiama `record plan 9 progress`: verificato con l'hash diretto `68fbd642` → 0 righe `chance.load` cambiate.
- `Plan: 10 of 18` in STATE.md (nessuno zero davanti, come da brief).

## Verifica

- Unit `src/travel/ambush src/quests/outcomes/pets`: 16 suite / 145 test verdi; `src/models/character`, `travel.updates.spec`, `outcome-writer`: 9 / 102 verdi.
- Integration `src/travel/ambush` + `travel-completion` + `teleport.resolver`: 6 suite / 138 test verdi. Non regressione: `travel.service`, `travel-food.sweep`, `quest-acceptance.service`: 3 / 193 verdi.
- `tsc` 0; `git diff --exit-code src/schema.gql` pulito (SDL invariato).

## Threat Flags

Nessuna superficie nuova: T-23-29 coperto dal caso «writes no result when the resolution is stale», T-23-31 dai due casi Pitfall 9.

## Self-Check: PASSED

- Commit 1c0fd16e, 3b00ec07, 1782c0b4, f3e7729c presenti; `src/quests/outcomes/pets/companion-xp.ts` assente.
