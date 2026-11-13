---
phase: 21-premi-per-rango-e-soccorsi
plan: 08
subsystem: dungeon
tags: [dungeon, turns, aid, tdd]
requires:
  - 21-07
provides:
  - DungeonTurnKind (enum TypeScript, non ancora sul filo) in src/models/enums/dungeon-turn-kind.enum.ts
  - DungeonTurn, dungeonTurnsOf, RescueTurn, rescueTurnOf, TurnCounters, turnCountersOf in src/quests/outcomes/dungeon/dungeon-turns.ts
  - DungeonContext.lastTurnIndex, FailedTurn, DungeonResolution.turnsTotal / turnsCompleted / failedTurn
  - segnaposto a turni E F senza tiri nuovi; porta di test TurnFailingDungeonResolver
affects: [21-09, 21-10, 21-11, 21-12]
tech-stack:
  added: []
  patterns:
    - porta di test che avvolge il segnaposto e cade su un turno scelto, giocando col segnaposto i turni precedenti (lastTurnIndex = turno − 1)
key-files:
  created:
    - src/models/enums/dungeon-turn-kind.enum.ts
    - src/quests/outcomes/dungeon/dungeon-turns.ts
    - src/quests/outcomes/dungeon/dungeon-turns.spec.ts
    - test/quests/turn-failing-dungeon-resolver.ts
  modified:
    - src/quests/outcomes/dungeon/dungeon-resolver.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts
    - src/quests/outcomes/combatant-plan.spec.ts
decisions:
  - "Tipo del turno dalla parità dell'indice (pari = esplorazione, dispari = scontro), unica regola condivisa da dungeonTurnsOf, rescueTurnOf e turnCountersOf"
  - "Interfaccia FailedTurn { index, kind } esportata da dungeon-resolver.ts per il campo failedTurn"
  - "turnCountersOf usa il ramo della sconfitta solo se verdict failure E failedTurn presente; altrimenti i contatori del successo (anche parziale)"
  - "lastTurnIndex non è sanificato dal segnaposto: lo fornisce rescueTurnOf (già sanificato) nel piano 10; un valore negativo non gioca turni, uno oltre il totale gioca l'intera dungeon"
  - "TurnFailingDungeonResolver: un indice per chiamata a explore; se il segnaposto cade prima del turno scelto restituisce quella sconfitta; un indice fuori dai turni delega al segnaposto"
metrics:
  duration: ~20 min
  completed: 2026-11-13
---

# Phase 21 Plan 08: dungeon a turni (struttura, porta, segnaposto) Summary

La dungeon è una sequenza E F E F… (un'esplorazione e uno scontro per voce di `enemies`), la porta `DungeonResolver` esprime la sconfitta in qualunque turno (`failedTurn`) e accetta un ultimo turno da giocare (`lastTurnIndex`); il segnaposto supera l'esplorazione senza tiri, quindi una dungeon intera tira esattamente come prima.

## Commit

| Task | Fase | Commit | Messaggio |
|------|------|--------|-----------|
| 1 | RED | 39497101 | test(dungeon): pin the dungeon turns and the placeholder |
| 1 | GREEN | 8d4e4b9f | feat(dungeon): add the exploration and fight turns |
| 2 | docs | (questo) | docs(phase-21): record plan 08 progress |

## RED: fallimenti attesi

- `dungeon-turns.spec.ts` e `placeholder-dungeon-resolver.spec.ts`: «Could not locate module src/models/enums/dungeon-turn-kind.enum» (modulo assente); 2 suite rosse, `dungeon-context.spec.ts` verde (5 test).
- La porta di test `test/quests/turn-failing-dungeon-resolver.ts` è entrata nel commit RED (codice di test), con import di moduli non ancora esistenti.

## Tiri prima e dopo (D-29, T-21-26)

- Prima: dungeon di 3 gruppi vinta = 3 `combat.resolve`, 3 `next()` (il resolver di prova tira una volta per scontro).
- Dopo: identico, 3 chiamate e `chance.drawn` = `[0.1, 0.2, 0.3]` su una sequenza di 4 (caso `passes every exploration without drawing (D-29)`); il caso esistente `adds no chance draw of its own (D-10)` resta verde invariato.
- Non regressione: `src/quests/outcomes/quest-dungeon.int-spec.ts` (segnaposto reale del modulo) verde senza modifiche, 5 test.

## Esiti

- Unit `src/quests/outcomes/dungeon` + `combatant-plan.spec.ts`: 4 suite / 42 test verdi.
- Integration `quest-dungeon.int-spec.ts`: 1 suite / 5 test.
- `npx tsc --noEmit -p tsconfig.json` = 0; `src/schema.gql` invariato; prettier ed eslint puliti sui file toccati.
- Accettazione: 3 export in `dungeon-turns.ts`; `failedTurn` in `dungeon-resolver.ts`; `lastTurnIndex` nel segnaposto; nessuna registrazione GraphQL nell'enum; `D-29)` nella spec del segnaposto.

## Deviazioni dal piano

- Aggiunto in `placeholder-dungeon-resolver.spec.ts` un caso `loses on a chosen exploration turn, then delegates to the placeholder (D-13, D-29)` che esercita la porta di test (sconfitta al turno 4 dopo due scontri, effetti del primo scontro conservati, chiamata successiva delegata). Non chiesto esplicitamente, ma evita una porta di test senza prova prima che la usino i piani 09–10.
- Nel letterale di `combatant-plan.spec.ts` aggiunti solo i tre campi (`turnsTotal: 8`, `turnsCompleted: 5`, `failedTurn { index: 5, kind: fight }`, coerenti con `stagesCleared: 2` su 4) e l'import di `DungeonTurnKind`; il `toEqual` su `stages` è invariato.
- Nessuna spec fuori piano corretta.

## Known Stubs

Nessuno nuovo: il segnaposto resta PROVVISORIO per scelta (D-10, D-13), il motore vero è dell'utente.

## Self-Check: PASSED

- File creati presenti: enum, `dungeon-turns.ts`, `dungeon-turns.spec.ts`, porta di test.
- Commit 39497101 e 8d4e4b9f presenti in `git log`.
