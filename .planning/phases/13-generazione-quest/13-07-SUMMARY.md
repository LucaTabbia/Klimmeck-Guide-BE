---
phase: 13-generazione-quest
plan: 07
subsystem: quests (esiti, dungeon a tappe)
tags: [quests, dungeon, combat, BE-QGEN-09, D-10, D-11, D-12]
requires: ["13-06"]
provides:
  - "Porta astratta `DungeonResolver` con `DungeonContext` (CombatContext + `recommendedLoot` + `recommendedOwned`) e `DungeonResolution` (CombatResolution + `stagesCleared`/`stagesTotal`)"
  - "`buildDungeonContext` puro: consigliati della quest e copie possedute da ogni partecipante (indossati inclusi)"
  - "`PlaceholderDungeonResolver` PROVVISORIO: una tappa per voce di `enemies`, HP/ferite/consumi/usi trascinati, prima sconfitta ferma tutto, nessun tiro proprio"
affects: [13-08]
tech-stack:
  added: []
  patterns:
    - "CombatResolver finto scriptato per tappa (un tiro per tappa) dentro la spec del segnaposto"
key-files:
  created:
    - src/quests/outcomes/dungeon/dungeon-resolver.ts
    - src/quests/outcomes/dungeon/dungeon-context.ts
    - src/quests/outcomes/dungeon/dungeon-context.spec.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts
  modified:
    - src/quests/outcomes/combat/combat-context.ts
decisions:
  - "`refOf` e `isRecord` di combat-context.ts ora esportati (riusati dal contesto della dungeon, niente duplicazione)"
  - "Quantità posseduta: LootItem = somma delle voci `ownedItems` con `itemType` LootItem; EquipmentItem = somma di `ownedEquipments` + 1 per slot indossato; un consigliato non posseduto non compare; un partecipante senza consigliati riceve `[]`"
  - "Voci consigliate valide solo con `itemType` in EquipmentItem/LootItem, ref ObjectId (nudo, hex o popolato) e quantità intera ≥ 1"
  - "Effetti fusi: un'entrata per ogni partecipante del contesto (anche senza effetti: `hpAfter` = HP iniziali), ordinate per `characterId`"
metrics:
  duration: "~20 min"
  completed: 2026-11-04
  tasks: 2
  files: 6
---

# Phase 13 Plan 07: porta `DungeonResolver` e segnaposto a tappe Summary

Le dungeon hanno ora una porta DI `DungeonResolver` con un contesto puro che porta già i consigliati della quest e quelli posseduti dai partecipanti (D-11), e un segnaposto PROVVISORIO che risolve le tappe in sequenza con il `CombatResolver` (D-10, D-12).

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | 0bb0f19 | `test(dungeon): pin the dungeon context` |
| 1 GREEN | 6ad8eae | `feat(dungeon): add the dungeon resolver port and its context` |
| 2 RED | fb06b06 | `test(dungeon): pin the staged placeholder exploration` |
| 2 GREEN | 99d6c70 | `feat(dungeon): explore the stages with the placeholder resolver` |

## RED osservati

- Task 1: `Cannot find module './dungeon-context'` (suite fallita, 0 test).
- Task 2: `Cannot find module './placeholder-dungeon-resolver'` (suite fallita, 0 test).

## Nomi e firme

- `src/quests/outcomes/dungeon/dungeon-resolver.ts`: `RecommendedEntry { itemType: ItemReferenceType; itemId: string; quantity: number }`; `DungeonContext extends CombatContext { recommendedLoot: RecommendedEntry[]; recommendedOwned: Record<string, RecommendedEntry[]> }`; `DungeonResolution extends CombatResolution { stagesCleared: number; stagesTotal: number }`; `abstract class DungeonResolver { abstract explore(context: DungeonContext, chance: ChanceSource): DungeonResolution }`.
- `src/quests/outcomes/dungeon/dungeon-context.ts`: `DungeonContextInput { combat: CombatContext; recommendedLoot: unknown[] | null | undefined; participants: readonly CombatCharacterSnapshot[] }`; `buildDungeonContext(input): DungeonContext`.
- `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts`: `@Injectable() PlaceholderDungeonResolver extends DungeonResolver`, costruttore `(combat: CombatResolver)`, `explore(context, chance)`.
- `src/quests/outcomes/combat/combat-context.ts`: `CombatCharacterSnapshot.assets.ownedEquipments?: { item?: unknown; quantity?: number }[]`; `export const refOf`, `export const isRecord`.

## Test

- dungeon-context.spec.ts (5): `carries the recommended loot of the quest in order (D-11)`, `reads populated recommended items by their id (D-11)`, `lists the recommended items each participant owns, worn included (D-11)`, `sums the owned and worn copies of a recommended equipment (D-11)`, `keeps the combat context untouched (D-12)`.
- placeholder-dungeon-resolver.spec.ts (7): i sei casi del piano più `succeeds without stages when the dungeon has no enemies (D-12)`.

## Deviations from Plan

- Due casi in più rispetto al `<behavior>` (ref popolato e somma posseduti+indossati; zero tappe), a copertura delle regole scritte nell'`<action>`.
- Boy Scout: `isRecord` esportato da combat-context.ts invece di duplicarlo.
- Il bookkeeping usa `Plan: 7 of 20` come da brief dell'orchestratore (il piano scriveva `07 of 20`).

Nessun'altra deviazione; nessun miglioramento del segnaposto oltre il necessario (D-10).

## Gates

- `npx jest src/quests/outcomes/dungeon --selectProjects unit`: 2 suite / 12 test verdi; `src/quests` unit 39 suite / 647 (baseline 37 / 635 + 2 / 12).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier + eslint puliti su ogni file toccato.
- Schema invariato: vs origin/develop tolte solo le due righe `  enemy: Enemy`.
- Grep di accettazione: `abstract class DungeonResolver` 1, `recommendedOwned` 1, `D-11)` 4, `PROVVISORIO` 1, `chance.next` 0, `D-12)` 6, `this.combat.resolve` 1.

## Self-Check: PASSED
