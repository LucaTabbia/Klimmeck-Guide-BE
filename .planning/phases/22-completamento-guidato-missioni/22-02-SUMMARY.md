---
phase: 22-completamento-guidato-missioni
plan: 02
subsystem: characters
tags: [mission-lock, equipment, companion, spells, guards]
requires: ["22-01"]
provides:
  - "sei guardie MissionLockReader.assertFree in CharactersService (equipItem, equipPet, unequipPet, equipSpell, unequipSpell, useSpell)"
  - "MissionLockModule importato da CharactersModule e da createCharactersTestApp"
  - "int-spec sul filo del blocco delle mutation del personaggio"
affects: [22-03, 22-04, 22-05, 22-17]
tech-stack:
  added: []
  patterns: ["guardia unica subito dopo requireCharacterObjectId, prima di ogni lettura o update (Pattern 3)"]
key-files:
  created:
    - src/characters/mission-lock/character-mutations-lock.int-spec.ts
  modified:
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
decisions:
  - "La guardia precede anche la lettura del catalogo delle magie (equipSpell, useSpell): un personaggio bloccato non tocca nessuna collection"
  - "MissionLockReader è l'ultimo parametro del costruttore di CharactersService"
metrics:
  duration: "~20 min"
  completed: 2026-11-14
---

# Phase 22 Plan 02: guardie delle mutation del personaggio Summary

`MissionLockReader.assertFree` iniettato in `CharactersService` e chiamato subito dopo il parsing dell'id in tutte e sei le mutation di equipaggiamento, compagno e magie: in missione (standard avviata o bozza guidata aperta) rispondono `MISSION_IN_PROGRESS` senza scrivere nulla, anche per l'oste col bypass dell'ownership; in viaggio verso la quest e a corsia liberata restano permesse.

## Task e commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | `9048c818` | `test(characters): pin the mission lock on equipment and companion` |
| 1 GREEN | `e9246f38` | `feat(characters): lock equipment and companion during a mission` |
| 2 RED | `e0766815` | `test(characters): pin the mission lock on spells` |
| 2 GREEN | `d6346a15` | `feat(characters): lock spells during a mission` |
| 3 | commit di bookkeeping | `docs(phase-22): record plan 02 progress` |

## Fallimenti RED attesi

- Task 1 unit: 3 casi rossi (`equipItem`, `equipPet`, `unequipPet`): la promessa rigetta con il codice di oggi (`NOT_FOUND` / errore del mock di `updateOne`) invece di `MISSION_IN_PROGRESS`, e `updateOne` è chiamato. Il provider del reader era già nella spec: nessun errore di DI.
- Task 1 int-spec: 4 casi rossi su 5 (`extensions.code` `undefined`: la mutation riesce). Verde al primo colpo `allows the same changes while travelling to the quest (D-12)`: è il caso di permesso, verde per costruzione senza guardia.
- Task 2 unit: 3 casi rossi (`equipSpell`, `unequipSpell`, `useSpell`), stesso motivo.
- Task 2 int-spec: 2 casi rossi; `allows spells again once the mission is over (D-11)` è rosso sulla precondizione (la prima `equipSpell` a missione avviata deve essere rifiutata, prima di liberare la corsia).

## Spec toccate per la DI

- `src/characters/characters.service.spec.ts`: provider `{ provide: MissionLockReader, useValue: missionLock }` (F6), con `assertFree` riportato a `mockResolvedValue(undefined)` in ogni `beforeEach`.
- `test/authz/characters-test-app.ts`: `MissionLockModule` fra gli `imports` fissi. Nessuna altra spec costruisce `CharactersService`.

## Verifica

- `npx jest src/characters --selectProjects unit`: 32 suite, 419 test verdi.
- `npx jest src/characters/mission-lock/character-mutations-lock.int-spec.ts src/characters/equipment/equip-item.int-spec.ts src/characters/characters-ownership.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 85 test verdi.
- Controllo allargato: `npx jest src/characters src/throttling/throttling.int-spec.ts src/authz/audit/admin-audit.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 28 suite, 516 test verdi (boot di `AppModule` con `CharactersModule` → `MissionLockModule` compreso).
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; `grep -c "missionLock.assertFree(" src/characters/characters.service.ts` = 6.

## Deviations from Plan

None - plan executed exactly as written. (Nella spec unit delle magie si verifica in più che `spellModel.findById` non sia chiamato: la guardia precede la lettura del catalogo.)

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati/modificati presenti; commit `9048c818`, `e9246f38`, `e0766815`, `d6346a15` nel log.
