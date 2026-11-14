---
phase: 22-completamento-guidato-missioni
plan: 13
subsystem: quests
tags: [guided-mission, simulation, graphql, authz]
requires: ["22-12"]
provides:
  - "MAX_MISSION_FIGHTS, MAX_FIGHT_ENEMIES, MAX_ENEMY_QUANTITY, MissionEnemyInput, SimulateMissionFightInput (mission-draft.inputs.ts)"
  - "MissionSimulationService.simulate(input): Promise<MissionDraftRecord> (mission-simulation.service.ts)"
  - "mutation simulateMissionFight(input: SimulateMissionFightInput!): MissionDraft!"
affects: [22-15, 22-16, 22-17, 22-18]
tech-stack:
  added: []
  patterns: ["simulazione a secco: stato sovrapposto, motore con la porta del caso dedicata, unica scrittura sulla bozza"]
key-files:
  created:
    - src/quests/guided/mission-draft.inputs.ts
    - src/quests/guided/mission-simulation.service.ts
    - src/quests/guided/mission-simulation.service.int-spec.ts
  modified:
    - src/quests/guided/guided-mission.module.ts
    - src/quests/guided/guided-mission.resolver.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - test/app.int-spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - src/schema.gql
decisions:
  - "Tetti tecnici: 10 scontri, 10 voci di nemico per scontro, quantità 1..20 per voce; class-validator sull'input e OUTCOME_OVERRIDE_INVALID in dominio"
  - "Un id di nemico non esadecimale arrivato al servizio è NOT_FOUND come un nemico inesistente"
  - "Un personaggio senza effetti restituiti dal motore riceve simulated null (il motore di oggi li restituisce sempre)"
  - "AuditTarget della mutation con un selettore di modulo inputPendingQuestTarget (input.pendingQuestId)"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 22 Plan 13: simulazione a secco di uno scontro Summary

`simulateMissionFight` risolve lo scontro k col `CombatResolver` sullo stato all'inizio di k (reale per k = 0, sovrapposto agli effetti corretti o simulati degli scontri precedenti per k > 0), tira solo dalla `MissionSimulationChance`, scrive esclusivamente nella bozza (scontro k sostituito o aggiunto, successivi azzerati con `resetFrom`) e serve per personaggio `hpBefore`, `injuriesBefore`, `consumablesAvailable`, `spellsAvailable`, gli effetti simulati e `corrected: null`. La sonda 1 della ricerca è ora la spec «simulates a fight without writing characters, quests or results (D-04)» (dump grezzo ordinato di `characters`, `pendingquests`, `questresults`, `quests` identico prima e dopo).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 6cc04cd7 | test(gm): pin the dry run of a guided fight |
| 1 GREEN | aac72fda | feat(gm): simulate a guided fight without writing |
| 2 RED | 053c609b | test(gm): pin the guided fight simulation on the wire |
| 2 RED (matrice) | 4f9073f4 | test(authz): count the guided fight simulation in the matrix |
| 2 GREEN | 3c13718b | feat(gm): expose the guided fight simulation |

## Fallimenti attesi in RED

- Task 1: la suite fallisce alla risoluzione del modulo `./mission-simulation.service` assente.
- Task 2: `handler-fixtures.spec.ts` 2 casi rossi (documento e variabili contro lo SDL committato); `app.int-spec.ts` rosso su «adds the guided fight simulation to the schema (D-17)» e sulla superficie pinnata (16 voci); i 4 casi nuovi del resolver rossi per la mutation assente.

Nessun caso verde al primo colpo prima del codice; dopo il GREEN tutti i casi sono passati alla prima esecuzione.

## Esiti

- `npx jest src/quests/guided/mission-simulation.service.int-spec.ts --selectProjects integration --runInBand`: 9/9.
- `npx jest test/authz/handler-fixtures.spec.ts src/quests/guided --selectProjects unit`: 43/43 (solo guided: 36/36).
- `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand`: 225/225.
- `mission-draft.service.int-spec` + simulazione: 20/20 (il modulo guidato col servizio nuovo boota).
- `npx tsc --noEmit -p tsconfig.json` = 0; prettier ed eslint puliti sui file toccati (un warning preesistente in `test/app.int-spec.ts:1165`, non toccato).
- `src/schema.gql`: +12 righe (due input, una riga di `Mutation`), 0 tolte rispetto a `c6079ca3`.
- Grep di accettazione: tutti soddisfatti (`D-24)` = 4, `D-04)` = 2 nella spec della simulazione; `@AuditTarget(` = 3; `GuidedMissionResolver.` = 5).

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 1 - Bug] Matrice di autorizzazione 14 → 15 righe HTTP**
- **Found during:** Task 2
- **Issue:** `test/authz/authorization-matrix.int-spec.ts` pinna il numero delle righe HTTP dell'oste; con un handler nuovo diventa rossa.
- **Fix:** conteggio a 15 in un commit dedicato (fuori da `files_modified`, come nei piani 08 e 10).
- **Commit:** 4f9073f4

Altre note: un caso in più nella spec della simulazione, `refuses an enemy list over the caps of a fight (D-24)` (11 voci, quantità 21, lista vuota → `OUTCOME_OVERRIDE_INVALID` in dominio). Per il caso del compagno (D-20) la spec usa un `CombatResolver` locale commutabile (placeholder di default, `ScriptedCombatResolver` nel solo caso D-20), così un solo harness copre sia i tiri del motore vero sia la registrazione del contesto.

## Threat model

- T-22-31: dump grezzo `toEqual` prima/dopo e `drawn` vuoto della `ChanceSource` condivisa; il servizio inietta solo `MissionSimulationChance`.
- T-22-32: tetti su input (`class-validator`, caso quantità 21 → `BAD_USER_INPUT` dal filo) e in dominio (`OUTCOME_OVERRIDE_INVALID`).
- T-22-33: `@Roles(innkeeper)`, `@AuditTarget('PendingQuest', …)`, superficie pinnata a 16, fixture e riga in più nella matrice.

## Self-Check: PASSED
