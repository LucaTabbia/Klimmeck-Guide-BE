---
phase: 22-completamento-guidato-missioni
plan: 04
subsystem: travel, quests
tags: [mission-lock, travel, acceptance, guards]
requires: ["22-01", "22-03"]
provides:
  - "guardia MissionLockReader.assertFree in TravelService.preview e startTravel, subito dopo planFree; teleport senza guardia"
  - "guardia MissionLockReader.assertFree in QuestAcceptanceService.accept dopo i rifiuti esistenti, hasOpenDraft per la corsia worldMission (QUEST_NOT_ACCEPTABLE)"
  - "guardia MissionLockReader.assertFree in QuestAcceptanceService.previewTravel (story prima del ritorno null, altre corsie dopo locationInQuestCity)"
  - "MissionLockModule importato da TravelModule e QuestAcceptanceModule"
affects: [22-05, 22-17]
tech-stack:
  added: []
  patterns: ["guardia del blocco dopo i codici esistenti (D-23) nel punto comune di anteprima e avvio"]
key-files:
  created: []
  modified:
    - src/travel/travel.service.ts
    - src/travel/travel.module.ts
    - src/travel/travel.service.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
decisions:
  - "MissionLockReader è l'ultimo parametro del costruttore di TravelService e di QuestAcceptanceService"
  - "F7 riscritta con un boss a due posti col solo personaggio iscritto (party in attesa, startDate null)"
metrics:
  duration: "~10 min"
  completed: 2026-11-14
---

# Phase 22 Plan 04: guardie di viaggio, anteprima e accettazione Summary

Partenze, anteprime del viaggio, accettazioni e anteprime del viaggio dell'accettazione rifiutate con `MISSION_IN_PROGRESS` a missione in corso, sempre dopo i codici esistenti (`QUEST_IN_PROGRESS`, `TRAVEL_IN_PROGRESS`, `CHARACTER_IMPRISONED`, `QUEST_SLOT_BUSY`, `QUEST_NOT_IN_CITY`, ecc.); una worldMission con una bozza aperta non accetta iscritti nuovi (`QUEST_NOT_ACCEPTABLE`) e torna accettabile allo scarto; il teleport dell'oste su un partecipante della bozza resta permesso.

## Task e commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | `1b29befd` | `test(travel): pin the mission lock on travels` |
| 1 GREEN | `8c48f464` | `feat(travel): lock travels during a guided draft` |
| 2 RED | `08056a31` | `test(quests): pin the mission lock on quest acceptance` |
| 2 GREEN | `65460b2e` | `feat(quests): lock quest acceptance during a mission` |
| 3 | commit di bookkeeping | `docs(phase-22): record plan 04 progress` |

## F7 riscritta

`runs a story in parallel with a pending standard quest` → `runs a story in parallel with a standard quest not started yet (D-13)`: la standard è un `boss` con `requiredAdventurers: [{ title: 'rookie', count: 2 }]` e il solo personaggio iscritto (party in attesa sul marker, `startDate` null, verificato nel caso); la story si accetta e restano due PendingQuest. Il caso gemello `refuses a story while the standard quest has started (D-13)` usa la hunt che parte subito sul marker (salto senza strada).

## Fallimenti RED attesi

- Task 1: 2 rossi su 5 nuovi (`refuses to start a travel during a guided draft without writing (D-11)`, `refuses the travel preview during a guided draft (D-23)`: il viaggio parte, l'anteprima risponde). Verdi al primo colpo, guardie di regressione: `keeps the busy standard lane code first (D-23)` (planFree risponde già `QUEST_IN_PROGRESS`), `lets a character with a story and no draft travel (D-11)` (permesso), `teleports a participant of an open guided draft (D-01, D-23)` (il teleport non legge il blocco).
- Task 2: 5 rossi su 8 (`refuses a story while the standard quest has started (D-13)`, `refuses a world mission registration during a guided draft of a story (D-13)`, `refuses a standard quest during a guided draft of a world mission (D-13)`, `refuses a new registration to a world mission with an open draft (D-23)`, `refuses the quest travel preview during a mission (D-23)`: tutte le accettazioni e anteprime riuscivano). Verdi al primo colpo: F7 riscritta (permesso), `keeps the existing refusals first (D-23)` (precedenza già vera), `accepts the world mission again once the draft is discarded (D-23)` (permesso).

## Verifica

- `npx jest src/travel --selectProjects unit`: 252/252; mirata `travel.service` + `teleport.resolver` + `travel.resolver` integration: 74/74; allargata `src/travel` integration: 249/249 (12 suite).
- `npx jest src/quests/acceptance --selectProjects unit`: 229/229; integration (dentro la run di coverage): 190/190.
- Coverage di `src/quests/acceptance` (comando del gate, unit + integration, 419/419): **99.11 / 92.83 / 98.66** (statements / branches / functions; lines 99.75), sopra la soglia 97/91/98.
- Controllo allargato per la DI: `standard-lane-liveness`, `travel.resolver`, `ambush-lifecycle`, `test/app.int-spec.ts`, `authorization-matrix` integration 223/223.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; grep di accettazione: `missionLock.assertFree(` 2 in `travel.service.ts` e 3 in `quest-acceptance.service.ts`, `hasOpenDraft(` 1, `MissionLockModule` 2 in `travel.module.ts`, `D-01, D-23)` 1, titolo F7 vecchio 0, `D-13)` 7.

## Deviations from Plan

- Caso in più (non in `<behavior>`): `refuses a standard quest during a guided draft of a world mission (D-13)`, per coprire la corsia standard bloccata da una bozza guidata. Il caso dell'anteprima prova anche story e worldMission del personaggio bloccato (i due rami di `previewTravel`).

Nessuna spec fuori piano corretta.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit `1b29befd`, `8c48f464`, `08056a31`, `65460b2e` nel log.
