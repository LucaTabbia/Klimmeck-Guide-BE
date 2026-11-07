---
phase: 16-lore-sbloccabili
plan: 06
subsystem: quests/outcomes (GM) + travel/ambush (vittoria, report trattenuto, deviazione)
tags: [quests, ambush, travel, lore, enemies, BE-LORE-02, BE-LORE-03, D-05, D-06, D-09, D-15]
requires: ["16-02", "16-04", "16-05"]
provides:
  - "`GmCompletionService` passa `victory: victoryKnowledgeOf(catalog)` a `planParticipant`: `gmCompleted` con nemici insegna come un success, senza nemici nulla (C-1)"
  - "`AmbushReportSnapshot.loreUnlocked` (`@Prop` `[ObjectId]` ref `Lore`, default `[]`, dopo `titleAfter`)"
  - "`AmbushReportDraft.loreUnlocked?: Types.ObjectId[]` (scritto sempre dal piano), `AmbushPlanInput.victory?: VictoryKnowledge | null` (dopo `enemies`), `AmbushOutcomePlan.update` + `$addToSet?: KnowledgeAddition['$addToSet']` (tipo letterale)"
  - "`planAmbushOutcome` calcola `learned = knowledgeUpdateOf(snapshot.status.unlockedLore, victory.loreIds, victory.enemyIds)` con `victory` azzerata sulla sconfitta; `reportOf(input, fought, learned, won)` e `victoryUpdateOf(input, fought, learned, report)`; `defeatPlanOf` invariato"
  - "`AmbushResultDraft.loreUnlocked: Types.ObjectId[]`; `resultDraftOf` scrive `report.loreUnlocked ?? []` dopo `spellLearned`"
  - "`AmbushResolutionService.fight` passa `victory: victoryKnowledgeOf(catalog)` a `planAmbushOutcome`"
affects: [16-07, 16-11, 16-12]
tech-stack:
  added: []
  patterns:
    - "Conoscenza della vittoria nello stesso update (operatore set + push + add-to-set), add-to-set solo se c'è qualcosa da imparare (D-14)"
    - "Campo opzionale nel draft + `?? []` alla consegna per i documenti trattenuti prima del deploy (Pitfall 3)"
key-files:
  created: []
  modified:
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/models/character/ambush-snapshot.model.ts
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-results.ts
    - src/travel/ambush/ambush-results.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - src/travel/ambush/ambush-lifecycle.int-spec.ts
decisions:
  - "`AmbushOutcomePlan.update` resta un tipo letterale con `$addToSet?: KnowledgeAddition['$addToSet']` (non l'intersezione del blocco interfaces): stessa ragione del 16-05, `writeCharacterUpdate` vuole `Record<string, unknown>`"
  - "La sconfitta d'imboscata non insegna: `victory` è azzerata prima di `knowledgeUpdateOf`, quindi il report della sconfitta ha `loreUnlocked: []` e l'update della deviazione resta con il solo operatore set; la geografia della città raggiunta arriva al completamento del viaggio (16-04)"
metrics:
  duration: "~10 min"
  completed: 2026-11-07
  tasks: 3
  files: 10
---

# Phase 16 Plan 06: GM e imboscata vinta insegnano Summary

Le due vittorie che non passano da `planCombatant` ora insegnano con le stesse funzioni del 16-05: il completamento del GM di una quest con nemici aggiunge a ogni partecipante le `Enemy.relatedLore` e gli id dei nemici (e il foglio `gmCompleted` li elenca in `loreUnlocked`), l'imboscata vinta li aggiunge nello stesso update della vittoria e porta le sole novità nel report trattenuto (`@Prop` nuovo nello snapshot), che il `QuestResult` d'imboscata consegnato all'arrivo riporta; i report trattenuti prima del deploy si consegnano con `loreUnlocked: []`. La deviazione dopo una sconfitta insegna la geografia della città raggiunta tramite il completamento del 16-04.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 4e1520d | test(quests): expect a game master completion to teach (D-06) |
| 1 GREEN | 6ecf309 | feat(quests): teach the enemies on a game master completion |
| 2 RED | eb72203 | test(ambush): expect a won ambush to teach its enemies (D-06) |
| 2 GREEN | 3fd7ca0 | feat(ambush): teach the enemies of a won ambush |
| 3 | (questo) | docs(phase-16): record plan 06 progress |

## Fallimenti RED osservati

- Task 1: 1 fallito su 20 — `teaches a game master completion with enemies like a success (D-06)` (`unlockedLore` vuoto: il GM non passava la vittoria). Verde in RED per costruzione: `teaches nothing on a game master completion without enemies (D-06)` (senza nemici non c'è nulla da insegnare e i default `[]` di `@Prop` del 16-02 rendono gli insiemi e `loreUnlocked` presenti); resta come guardia.
- Task 2 unit: 5 falliti su 21 — `holds the report in the travel … (D-13)` (manca `loreUnlocked: []`), `teaches the enemies of a won ambush in the victory update (D-06)`, `teaches nothing on a lost ambush (D-06)` (`report.loreUnlocked` undefined), `maps a held report to an ambush quest result (D-13, D-14)` (chiave mancante), `delivers an old held report without unlocked lore as an empty list (D-09, Pitfall 3)`.
- Task 2 integration: 2 falliti su 42 — `teaches the enemies of a won ambush and holds the new lore in the report (D-06, D-09)` e l'estensione di `wins two ambushes on one travel and delivers both reports at arrival in order (D-02, D-13)`. Verde in RED: `unlocks the geography of the city reached by the detour (D-05)`, perché la deviazione è un viaggio `free` verso il marker della città e il completamento del 16-04 scrive già la geografia; il report della sconfitta ha `loreUnlocked: []` dal default `@Prop` di `QuestResult` (16-02). Resta come prova di D-05 sulla deviazione.

## Numeri misurati

- Il caso delle due vittorie combatte il **Bandito di città** al km 3 (nessuna `relatedLore`) e il **Lupo della strada** al km 9 (`Bestiario della strada`), non lo stesso nemico due volte: i due `QuestResult` d'imboscata portano `[]` e `[pagina del lupo]` (misurato con una probe temporanea, poi tolta prima del commit RED). Il `<behavior>` ipotizzava «il secondo `[]` se lo stesso nemico»: l'asserzione segue la fixture reale.
- Nel caso D-05 la geografia di Crocevia è creata con `persistGeographyLore(connection, { name: 'Crocevia' })` e collegata con un update della collection `cities` (`relatedLore` = lore della città); all'arrivo `unlockedLore` è esattamente `geography` (città + regione + stato), nell'ordine di `geographyOf`.

## Deviazioni dal piano

- **[Rule 3 - Blocco] Tipo di `AmbushOutcomePlan.update`.** Il blocco `<interfaces>` chiedeva `{ $set; $push? } & KnowledgeAddition`; come nel 16-05 l'intersezione con un'interfaccia non è assegnabile a `Record<string, unknown>` di `writeCharacterUpdate`: tipo letterale con `$addToSet?: KnowledgeAddition['$addToSet']`.
- **Grep di accettazione:** `grep -c "D-06)" gm-completion.service.int-spec.ts` stampa `3` (non `2`): il caso preesistente `closes a world mission for every registered character with one result each (D-04, D-06)` (Phase 9) combacia. `grep -c "D-05)" ambush-lifecycle.int-spec.ts` = 4 (≥ 1, tre casi preesistenti della Phase 15).
- **Scope dei commit:** `test(ambush)`/`feat(ambush)` come imposti dal piano, anche se l'elenco degli scope delle REPO-RULES non contiene `ambush`.
- **Bookkeeping:** `Plan: 6 of 12` in STATE.md (formato del brief dell'orchestratore) invece di `Plan: 06 of 12` del piano; il grep di verifica del Task 3 del piano quindi non passa per scelta.
- `buildAmbushReport` (`test/travel/ambush-report.fixture.ts`) non è cambiato: senza `loreUnlocked` rappresenta il report trattenuto prima del deploy (il caso Pitfall 3 lo verifica con `Object.keys`).

## Gate

- `npx jest src/travel src/models src/quests/outcomes --selectProjects unit`: 63 suite, 740/740 (`mixed-ref-paths.spec.ts` invariato e verde).
- `npx jest src/travel src/quests/outcomes/gm-completion.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 13 suite, 296/296 (~63 s).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier e eslint puliti sui 10 file `.ts` toccati (nessun file sporco in partenza, nessun commit style).
- `git diff --exit-code src/schema.gql` 0; `grep -c loreUnlocked src/schema.gql` = 1; schema vs origin/develop: 2 righe aggiunte (`unlockedLore: [ID!]!`, `loreUnlocked: [Lore!]!`, dal 16-02), 0 tolte.

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit 4e1520d, 6ecf309, eb72203, 3fd7ca0 nel log; i 10 file modificati presenti.
