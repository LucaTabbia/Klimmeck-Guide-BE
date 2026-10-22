---
phase: quick-261022-f0n
plan: 01
subsystem: quests/acceptance
tags: [quests, acceptance, city, worldMission, D-26]
requirements: [BE-QUEST-03]
requires: [phase-08 quest acceptance (D-02, D-26, D-27)]
provides: [worldMission bound to its marker city (QUEST_NOT_IN_CITY)]
affects: [FE Phase 6 quest board (worldMission any-city no longer valid)]
key-files:
  modified:
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - .planning/phases/08-travel-lifecycle-travel-01/08-CONTEXT.md
    - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md
    - .planning/phases/08-travel-lifecycle-travel-01/08-VERIFICATION.md
    - .planning/PROJECT.md
decisions:
  - "D-26 emendata 2026-10-22: solo la story e' esente dal controllo di citta'; standard e worldMission richiedono QUEST_NOT_IN_CITY"
  - "Il viaggio automatico resta solo per la corsia standard (D-02): la worldMission non muove il personaggio"
commits:
  - { hash: afbba49, type: test, message: "test(quests): require the quest city for world missions" }
  - { hash: 55ca53f, type: fix, message: "fix(quests): accept world missions only from the quest city" }
  - { hash: bc7b7f7, type: docs, message: "docs(08): amend D-26, world missions bound to their city" }
completed: 2026-10-22
---

# Quick 261022-f0n: worldMission accettabile solo dalla sua città

La worldMission ora richiede che il personaggio sia nella città del marker (marker o POI della città, Phase 7 D-10), con rifiuto `QUEST_NOT_IN_CITY` senza scritture e riaffermazione di `status.location` nel filtro del claim; solo la story resta any-city; il viaggio automatico resta solo standard.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | afbba49 | test(quests): require the quest city for world missions (RED) |
| 2 | 55ca53f | fix(quests): accept world missions only from the quest city (GREEN) |
| 3 | bc7b7f7 | docs(08): amend D-26, world missions bound to their city |

## What changed

- `QuestAcceptanceService.accept`: `location` calcolata con `lane !== QuestLane.story`; `movement` solo con `lane === QuestLane.standard && location`. Il `claim` porta `location` anche per la worldMission, quindi `laneClaimFilter` riafferma `status.location` e `classifyUnclaimed` classifica un cambio di posizione in corsa come `QUEST_NOT_IN_CITY` (logica invariata, guidata dallo snapshot).
- `LaneClaimSnapshot.location`: commento aggiornato.
- Spec: integration — sostituito `accepts a world mission from another city` con `rejects a world mission from another city with QUEST_NOT_IN_CITY and writes nothing`, aggiunto `accepts a world mission from a point of interest of the quest city` (corsia impostata, location invariata, activeTravel nullo, registrazione rookie, 3000 punti addebitati); wire — `rejects a world mission from another city on the wire`; unit — rinominato `has no location only for the story lane ...`, aggiunti `reasserts the location for the world mission lane` e `a changed location is QUEST_NOT_IN_CITY for the world mission lane`.
- Docs: D-26 emendata in 08-CONTEXT (domain + voce), BACKEND-NOTES (righe 191/204/205/219/303/312 + nuova riga sul marker delle worldMission), 08-VERIFICATION riga D-26, PROJECT.md.

## Gates

- RED: service int-spec `-t city` 1 failed / 5 passed; wire `-t "another city"` 1 failed / 2 passed (i due nuovi rifiuti worldMission); unit updates spec 24/24 (documentano il contratto, verdi come previsto).
- GREEN: unit `src/quests/acceptance` 4 suites / 164 tests passed; integration `src/quests/acceptance` 2 suites / 84 tests passed (`--runInBand`); integration `src/characters/deletion` 1 suite / 17 tests passed; `npm run build` ok; `git diff --exit-code src/schema.gql` 0; eslint + prettier --check puliti sui 5 file.
- Nessun commit con `Co-Authored-By`.

## Deviations from Plan

None - plan executed exactly as written. Nessun refactor/style commit necessario (prettier ha solo riformattato il ternario di `movement` prima del commit fix).

## Threat Flags

None — la superficie è ristretta (T-q261022-01/02 mitigate come da piano).

## Self-Check: PASSED
