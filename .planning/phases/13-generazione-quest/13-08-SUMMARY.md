---
phase: 13-generazione-quest
plan: 08
subsystem: quests (esiti, dungeon a tappe)
tags: [quests, dungeon, combat, BE-QGEN-09, D-12]
requires: ["13-07"]
provides:
  - "Dispatch per tipo in `QuestResolutionService.fight`: `dungeon` → `DungeonResolver.explore`, ogni altro tipo individuale → `CombatResolver.resolve`"
  - "`CombatantBattle.stages` → `ParticipantPlanInput.stages` → `QuestResult.stagesCleared`/`stagesTotal` (null fuori dalle dungeon)"
  - "Binding DI `{ provide: DungeonResolver, useClass: PlaceholderDungeonResolver }` in quest-outcomes.module.ts"
  - "Int-spec end to end della dungeon a tappe (quest-dungeon.int-spec.ts)"
affects: [13-09, 13-14, 13-15]
tech-stack:
  added: []
  patterns:
    - "Verdetto per tappa nella int-spec con `scripted.willEndBy(() => scripted.contexts.length >= k ? 'failure' : 'success')`"
key-files:
  created:
    - src/quests/outcomes/quest-dungeon.int-spec.ts
  modified:
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
decisions:
  - "Tipo nominato `DungeonStages { cleared; total }` esportato da outcome-plan.ts e riusato da `CombatantBattle.stages` (niente doppia forma inline)"
  - "`dungeonBattleOf` costruisce verdetto/effetti/tappe esplicitamente (gli effetti via `battleOf`), sempre non nullo"
  - "Il loader non cambia: `OUTCOME_CHARACTER_PROJECTION` proietta già `assets: 1` (quindi `assets.ownedEquipments`) e `RESOLUTION_QUEST_PROJECTION` proietta `requirements: 1` (quindi `recommendedLoot`)"
  - "Premi invariati: la sconfitta passa già `NO_REWARDS`; il successo arriva solo con tutte le tappe vinte (D-12)"
metrics:
  duration: "~25 min"
  completed: 2026-11-04
  tasks: 2
  files: 7
---

# Phase 13 Plan 08: dungeon a tappe nella risoluzione standard Summary

La risoluzione individuale delle `dungeon` passa ora dalla porta `DungeonResolver` (segnaposto PROVVISORIO legato via DI), scrive `stagesCleared`/`stagesTotal` nel risultato, premia solo a percorso completo e alla prima sconfitta apre la aid clonata con gli stessi `enemies` (D-12).

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | 6c8344d | `test(dungeon): pin the stages in the outcome plan` |
| 1 GREEN | 0280ec1 | `feat(dungeon): resolve dungeons stage by stage` |
| 2 | a1e5347 | `test(dungeon): cover the staged dungeon end to end` |

## RED osservati

- Task 1: `TypeError: (0 , combatant_plan_1.dungeonBattleOf) is not a function`; `writes the dungeon stages it receives into the result (D-12)` Expected 2 / Received null; `carries the dungeon stages into the participant result (D-12)` Expected 3 / Received null; `withholds the rewards and keeps the cleared stages on a defeat (D-12)` Expected 1 / Received null. `leaves the stages null outside a dungeon (D-12)` verde al primo colpo (prova di non regressione: il draft scriveva già null).
- Task 2: la int-spec arriva dopo il codice del Task 1 (come da piano). Un solo rosso, della spec: l'atteso di `rewards` non includeva `pet: null` (default del modello dal 13-02); corretto l'atteso con `toEqual` sull'intero oggetto.

## Nomi e firme

- src/quests/outcomes/outcome-plan.ts: `export interface DungeonStages { cleared: number; total: number }`; `ParticipantPlanInput.stages?: DungeonStages | null`; draft `stagesCleared: input.stages?.cleared ?? null`, `stagesTotal: input.stages?.total ?? null`.
- src/quests/outcomes/combatant-plan.ts: `CombatantBattle.stages?: DungeonStages | null`; `export function dungeonBattleOf(resolution: DungeonResolution, characterId: Types.ObjectId): CombatantBattle`; `planCombatant` passa `stages: battle?.stages ?? null`.
- src/quests/outcomes/quest-resolution.service.ts: costruttore `(connection, loader, boss, rescue, writer, combat: CombatResolver, dungeon: DungeonResolver, chance: ChanceSource, clock)`; `fight` con `loaded.quest.infos.type === QuestType.dungeon` → `this.dungeon.explore(buildDungeonContext({ combat: context, recommendedLoot: loaded.quest.requirements?.recommendedLoot, participants: [snapshot] }), this.chance)` → `dungeonBattleOf(exploration, snapshot._id)`. Zero nemici validi = nessun combattimento (null) anche per la dungeon, come prima.
- src/quests/outcomes/quest-outcomes.module.ts: provider `{ provide: DungeonResolver, useClass: PlaceholderDungeonResolver }` subito dopo quello di `CombatResolver`.

## Test

- combatant-plan.spec.ts (+4): `carries the dungeon stages into the participant result (D-12)`, `withholds the rewards and keeps the cleared stages on a defeat (D-12)`, `leaves the stages null outside a dungeon (D-12)`, `reads the verdict, the effects and the stages of the exploration (D-12)`.
- outcome-plan.spec.ts (+1): `writes the dungeon stages it receives into the result (D-12)`.
- quest-dungeon.int-spec.ts (4): `explores every stage and rewards only at the end (D-12)` (Ghoul xp 20 ×1, Ratto xp 5 ×2, Custode xp 120 ×1, xpGained = 50 + 20 + 10 + 120, monete 2 argento), `stops at the first defeat and opens an aid with the same enemies (D-12)`, `starts the second stage from the hp left by the first (D-12)` (HP dei contesti `[1000, 600, 600]`), `keeps the stages null for an enemy quest (D-12)`.

## Deviations from Plan

- Caso in più `writes the dungeon stages it receives into the result (D-12)` in outcome-plan.spec.ts (il piano lo ammetteva «se serve») e `dungeonBattleOf` provato da un caso dedicato.
- Boy Scout: tipo `DungeonStages` nominato invece della forma inline ripetuta.
- Nessuna modifica al loader: le proiezioni coprivano già `assets.ownedEquipments` e `requirements.recommendedLoot`.
- Il bookkeeping usa `Plan: 8 of 20` come da brief dell'orchestratore (il piano scriveva `08 of 20`).

## Gates

- `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/combatant-plan.spec.ts --selectProjects unit`: 56 verdi; `src/quests` unit 39 suite / 652 (baseline 647 + 5).
- `npx jest src/quests/outcomes --selectProjects integration --runInBand`: 10 suite / 113 (baseline 9 / 109 + la nuova suite da 4); dopo il Task 1, prima della nuova suite, 9 / 109 verdi (nessuna regressione).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier + eslint puliti su ogni file toccato.
- Schema invariato; vs origin/develop tolte solo le due righe `  enemy: Enemy`.
- Grep di accettazione: `this.dungeon.explore` 1, `PlaceholderDungeonResolver` nel modulo 2, `D-12)` in combatant-plan.spec 4, `D-12)` in quest-dungeon.int-spec 5, `stagesCleared` in quest-dungeon.int-spec 3.

## Self-Check: PASSED
