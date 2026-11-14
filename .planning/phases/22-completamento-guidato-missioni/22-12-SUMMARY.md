---
phase: 22-completamento-guidato-missioni
plan: 12
subsystem: quests
tags: [guided-mission, simulation, fights, invalidation]
requires: ["22-11"]
provides:
  - "MissionSimulationChance e MISSION_SIMULATION_CHANCE_PROVIDER (mission-simulation.chance.ts)"
  - "stateBeforeFight, FightStart, fightStartOf, assertAddsOnlyNewInjuries, effectsRecordOf, participantEffectsOf (fight-state.ts)"
  - "effectiveEffectsOf, previousEffectsOf, sameEnemies, unsimulated, resetFrom, reconcileFights (draft-invalidation.ts)"
affects: [22-13, 22-15, 22-16]
tech-stack:
  added: []
  patterns: ["stato all'inizio dello scontro k = reduce degli effetti effettivi 0..k-1 sullo snapshot, con le regole del piano d'esito"]
key-files:
  created:
    - src/quests/guided/mission-simulation.chance.ts
    - src/quests/guided/mission-simulation.chance.spec.ts
    - src/quests/guided/fight-state.ts
    - src/quests/guided/fight-state.spec.ts
    - src/quests/guided/draft-invalidation.ts
    - src/quests/guided/draft-invalidation.spec.ts
  modified: []
decisions:
  - "fightStartOf ordina consumabili e magie per id esadecimale; include le magie attive anche a zero usi e i loot posseduti come li vede overrideParticipantOf"
  - "effectsRecordOf scarta gli id non esadecimali (come consumablesSpent/spellsSpent): il round trip vale per id validi"
  - "previousEffectsOf salta gli scontri senza outcome effettivo per quel personaggio"
  - "reconcileFights copia la lista dei nemici in ingresso per gli scontri non simulati (l'ingresso è readonly)"
metrics:
  duration: "~20 min"
  completed: 2026-11-14
---

# Phase 22 Plan 12: regole pure degli scontri e porta del caso dedicata Summary

Una sola definizione pura dello stato all'inizio di uno scontro guidato (snapshot reale + effetti corretti, altrimenti simulati, degli scontri precedenti tramite `woundsAfter`, `consumablesSpent` + `applyTradeToInventory`, `spellsSpent` senza istanti di recupero), i limiti serviti alla FE con `overrideParticipantOf`, il rifiuto delle ferite preesistenti (D-14), l'invalidazione a valle quando cambiano i nemici (D-24) e la porta del caso `MissionSimulationChance` a token distinto da `ChanceSource`.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | ca4f1797 | test(quests): pin the state at the start of a guided fight |
| 1 GREEN | 4416ed0d | feat(quests): overlay the state of the previous guided fights |
| 2 RED | 17848318 | test(quests): pin the downstream invalidation of guided fights |
| 2 GREEN | 5a931d19 | feat(quests): void the guided fights downstream of a change |

## Fallimenti attesi in RED

- Task 1: entrambe le suite falliscono alla risoluzione dei moduli `fight-state` e `mission-simulation.chance` assenti.
- Task 2: la suite fallisce alla risoluzione del modulo `draft-invalidation` assente.

Nessun caso verde al primo colpo (moduli nuovi).

## Esiti

- `npx jest src/quests/guided --selectProjects unit`: 6 suite, 36/36 (7 casi nuovi in fight-state + chance, 10 in draft-invalidation).
- `npx tsc --noEmit -p tsconfig.json` = 0; prettier ed eslint puliti sui file toccati; `src/schema.gql` invariato.
- Grep di accettazione: tutti soddisfatti (`D-24)` = 7 nella spec dell'invalidazione).

## Deviazioni dal piano

Nessuna. Due casi in più rispetto al `<behavior>`: `compares the enemies by order, id and quantity (D-24)` e la variante del caso «voids…» parametrizzata su quantità e nemico. Nessuna spec fuori piano corretta.

## Threat model

- T-22-29: `assertAddsOnlyNewInjuries` e `fightStartOf` da `overrideParticipantOf` sullo stato sovrapposto (stessi limiti di `validateOverrides`).
- T-22-30: `MISSION_SIMULATION_CHANCE_PROVIDER` lega il token nuovo a `MathChanceSource`, nessun `Math.random` nuovo; la prova senza tiri condivisi resta al piano 13.

## Self-Check: PASSED
