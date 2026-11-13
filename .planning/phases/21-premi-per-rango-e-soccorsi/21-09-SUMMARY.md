---
phase: 21-premi-per-rango-e-soccorsi
plan: 09
subsystem: dungeon
tags: [dungeon, turns, aid, results, tdd]
requires:
  - 21-08
provides:
  - DungeonTurnFields, NO_TURN_COUNTERS, DungeonStages esteso (turnsTotal, turnsCompleted, lastTurn, lastTurnKind) in src/quests/outcomes/outcome-plan.ts
  - QuestResultDraft con i quattro contatori dei turni
  - quattro @Prop dei turni su QuestResult (solo Mongoose, sul filo nel piano 12)
  - QuestRescueTurn / QuestRescueTurnSchema su rescue.turn (solo Mongoose)
  - buildAidQuest(original, injuredIds, aidId, turn = null)
  - rescueTurnFromStages(stages) in src/quests/outcomes/dungeon/dungeon-turns.ts
affects: [21-10, 21-11, 21-12]
tech-stack:
  added: []
  patterns:
    - porta della dungeon sostituita per caso in int-spec con un delegatore locale passato come useValue (l'harness non accetta useFactory)
key-files:
  created: []
  modified:
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/outcomes/unrewarded-plan.ts
    - src/quests/outcomes/defeat-without-aid.spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/models/quest/quest-rescue.model.ts
    - src/quests/outcomes/dungeon/dungeon-turns.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-dungeon.int-spec.ts
decisions:
  - "Costante NO_TURN_COUNTERS esportata da outcome-plan.ts: unica sorgente dei quattro null per rescue-plan, unrewarded-plan (quindi sconfitta senza aid, arresto, guardia) e la fixture del draft"
  - "rescueTurnFromStages costruisce il turno da lastTurn − 1, lastTurnKind e turnsTotal e lo passa per rescueTurnOf: stessa sanificazione della rilettura, mai un turno incoerente a DB"
  - "lastTurnKind a DB con enum [exploration, fight, null] e default null"
  - "Nell'int-spec la porta DungeonResolver è un SwappableDungeonResolver locale passato come useValue: l'harness (createAuthTestApp) applica solo overrideProvider().useValue, quindi l'override con useFactory proposto nelle note del piano 08 non è utilizzabile"
metrics:
  duration: ~35 min
  completed: 2026-11-13
---

# Phase 21 Plan 09: turni negli esiti e turno salvato sull'aid Summary

Gli esiti della dungeon portano a DB `turnsTotal`, `turnsCompleted`, `lastTurn` (1-based) e `lastTurnKind` (D-21) e una dungeon persa apre un'aid con `rescue.turn { index, kind, total }` (D-12, D-13), anche quando la caduta avviene in esplorazione.

## Cosa è stato fatto

- **Task 1 (D-21):** `DungeonStages` estende `DungeonTurnFields`; `dungeonBattleOf` spande `turnCountersOf(resolution)`; `planParticipant` scrive i contatori da `input.stages` o `NO_TURN_COUNTERS`; `rescue-plan` e `unrewarded-plan` scrivono `NO_TURN_COUNTERS`. Quattro `@Prop` con `default: null` su `QuestResult`, nessun decoratore GraphQL (`src/schema.gql` invariato).
- **Task 2 (D-12, D-13):** `QuestRescueTurn` (`index` min 0, `kind` enum `DungeonTurnKind`, `total` min 1, tutti required) su `QuestRescue.turn` con `default: undefined`; `buildAidQuest` ha un quarto parametro `turn` e scrive `rescue.turn` (copia) solo se non nullo; `ResolutionQuest.rescue.turn?: unknown`; `QuestResolutionService` tiene `battle` in una variabile e passa `rescueTurnFromStages(battle?.stages)` a `buildAidQuest` quando c'è un'aid. `fight()` è rimasto com'è.

Matrice coperta qui: dungeon vinta → T, T, T, fight; dungeon persa al turno i → T, i, i+1, tipo del turno i; enemy, sconfitta senza aid, rescued, death → quattro `null` (il test della sconfitta senza aid vive in `defeat-without-aid.spec.ts`).

## RED attesi

- `210ed925`: 10 casi rossi in 5 suite (i tre nuovi di `outcome-plan.spec`, il foglio esistente, `carries the turn counters…` e il letterale di `dungeonBattleOf` in `combatant-plan.spec`, `planRescued` e `deathResultOf` in `rescue-plan.spec`, il nuovo caso di `defeat-without-aid.spec`, il caso dello schema): campi assenti.
- `5699fb02`: `saves the turn of the defeat on a dungeon aid (D-12)` (unit) e tre casi dell'int-spec (`stops at the first defeat…` con l'asserzione nuova, `saves the fight turn…`, `saves an exploration turn…`): `rescue.turn` undefined. **Verdi al RED:** `writes the turn counters of a cleared dungeon (D-21)` e `keeps the turn counters null for an enemy quest (D-21)` dell'int-spec, perché il GREEN del Task 1 era già dentro.

## Verifiche

- Unit `src/quests/outcomes src/models`: 61 suite / 903 test (Task 1); `src/quests/outcomes` 38 / 719 e `src/models` 23 / 185 (Task 2).
- Integration del piano: quest-dungeon, quest-combat, aid-rescue 3 suite / 49 test.
- Non regressione: aid-timeout, boss-resolution, crime-guard-conclusion, quest-resolution.service, quest-pet-prize, quest-result.resolver 6 suite / 90 test; populate + ambush 15 suite / 102.
- `npx tsc --noEmit -p tsconfig.json` 0; `git diff --exit-code src/schema.gql` vuoto; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture del draft senza i contatori dei turni**
- **Trovato durante:** Task 1 (tsc dopo il GREEN)
- **Problema:** `src/quests/results/quest-result.populate.spec.ts` tipizza un `QuestResultDraft` completo: con i quattro campi obbligatori `tsc` falliva.
- **Fix:** `...NO_TURN_COUNTERS` nella fixture.
- **Commit:** `c8698b52`

**2. [Rule 3 - Blocking] Override della porta della dungeon in int-spec**
- **Trovato durante:** Task 2
- **Problema:** l'harness applica solo `overrideProvider(token).useValue(...)`: l'override con `useFactory` + `inject: [CombatResolver]` indicato nelle note del piano 08 non è supportato.
- **Fix:** delegatore locale `SwappableDungeonResolver` (default = `PlaceholderDungeonResolver(scripted)`, stessa porta di combattimento scriptata) passato come `useValue`; il caso dell'esplorazione chiama `dungeon.use(new TurnFailingDungeonResolver(dungeon.placeholder, [4]))`, `beforeEach` lo ripristina.
- **File:** `src/quests/outcomes/quest-dungeon.int-spec.ts`

**3. Spec aggiunte fuori da `files_modified`, previste dal `<behavior>`:** `rescue-plan.spec.ts` (i quattro `null` nel `toEqual` dei casi `rescued`/`death`) e `quest-result.schema.spec.ts` (default `null` e rifiuto di un `lastTurnKind` sconosciuto).

## Known Stubs

Nessuno. Il percorso del soccorritore fino al turno salvato e l'aid nata da un'aid di dungeon persa (D-26) sono del piano 10.

## Self-Check: PASSED
