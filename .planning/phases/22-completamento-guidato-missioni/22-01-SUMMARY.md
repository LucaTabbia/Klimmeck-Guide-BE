---
phase: 22-completamento-guidato-missioni
plan: 01
subsystem: characters
tags: [mission-lock, game-rules, pending-quest, mongoose]
requires: []
provides:
  - "GameRuleErrorCode.MISSION_IN_PROGRESS e GameRuleException.missionInProgress()"
  - "PendingQuest.missionDraftStartedAt (solo @Prop, default null)"
  - "missionInProgressOf / guidedMissionInProgressOf (predicato puro unico)"
  - "MissionLockReader (lanesOf, isLocked, isGuidedLocked, assertFree, hasOpenDraft) e MissionLockModule"
affects: [22-02, 22-03, 22-04, 22-05]
tech-stack:
  added: []
  patterns: ["reader a due letture + predicato puro: una sola regola per ogni guardia"]
key-files:
  created:
    - src/characters/mission-lock/mission-lock.ts
    - src/characters/mission-lock/mission-lock.spec.ts
    - src/characters/mission-lock/mission-lock.reader.ts
    - src/characters/mission-lock/mission-lock.reader.int-spec.ts
    - src/characters/mission-lock/mission-lock.module.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/models/pending-quest.model.ts
decisions:
  - "Il reader non ha una seconda regola: legge le tre corsie del personaggio attivo e le loro PendingQuest, poi chiama il predicato puro"
  - "Personaggio archiviato o inesistente: libero (false), la guardia non risponde mai NOT_FOUND"
metrics:
  duration: "~8 min"
  completed: 2026-11-14
---

# Phase 22 Plan 01: fondazione del blocco «missione in corso» Summary

Codice `MISSION_IN_PROGRESS` con fabbrica senza chiavi extra, marcatore `PendingQuest.missionDraftStartedAt` solo Mongoose, predicato puro unico (`missionInProgressOf` / `guidedMissionInProgressOf`) e `MissionLockReader` a due letture esportato da `MissionLockModule`, pronto per le guardie dei piani 02–05.

## Task e commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | `982624e1` | `test(characters): pin the mission lock predicate and its code` |
| 1 GREEN | `2c443261` | `feat(characters): add the mission lock predicate and its refusal code` |
| 2 RED | `c104437a` | `test(characters): pin the mission lock reader` |
| 2 GREEN | `51f61714` | `feat(characters): read the mission lock of a character` |
| 2 (titolo) | `f30a77d0` | `test(characters): name the lock decision in the guided draft case` |
| 3 | commit di bookkeeping | `docs(phase-22): record plan 01 progress` |

## Fallimenti RED attesi

- Task 1: `game-rule.exception.spec.ts` 3 casi rossi con `TypeError: GameRuleException.missionInProgress is not a function` (la riga in `cases`, «covers every GameRuleErrorCode exactly once», il caso delle extensions); `mission-lock.spec.ts` non si avvia (errore di risoluzione del modulo `src/characters/mission-lock/mission-lock`, «Configuration error» di jest).
- Task 2: `mission-lock.reader.int-spec.ts` non si avvia (`createNoMappedModuleFoundError` su `mission-lock.module`).

## Contratto del reader (come committato)

```typescript
@Injectable() export class MissionLockReader {
    lanesOf(characterId: Types.ObjectId, session?: ClientSession | null): Promise<LockLanes | null>;
    isLocked(characterId, session?): Promise<boolean>;        // missionInProgressOf(lanesOf)
    isGuidedLocked(characterId, session?): Promise<boolean>;  // guidedMissionInProgressOf(lanesOf)
    assertFree(characterId, session?): Promise<void>;         // throw GameRuleException.missionInProgress()
    hasOpenDraft(questId: Types.ObjectId, session?): Promise<boolean>;
}
```

- `lanesOf`: `findOne` col filtro del personaggio attivo e proiezione sulle tre corsie (`lanePathOf` di `QUEST_LANES`), poi una sola `find` sulle PendingQuest (`startDate`, `missionDraftStartedAt`), saltata se nessuna corsia è occupata; id delle corsie normalizzati con `refIdOf` (accetta anche le stringhe legacy); corsia vuota o PendingQuest sparita → `null`.
- `hasOpenDraft`: `exists` su `quest` in entrambe le forme (`idForms`) e marcatore non nullo.
- `MissionLockModule`: `forFeature` di Character e PendingQuest, `exports: [MissionLockReader]`.

## Casi verdi

Unit: `src/gameRules` + `src/characters/mission-lock` 55/55. Integration: `mission-lock.reader.int-spec.ts` 9/9 (`it.each` su story e worldMission). Nessun caso verde al primo colpo nel RED. Controllo di non regressione per il campo nuovo con default: `src/models` + `quest-eligibility.spec.ts` 305/305 unit; `src/characters/deletion`, `travel-completion`, `ambush-resolution`, `src/quests/pending-requests` 156/156 integration. `tsc` 0; `src/schema.gql` invariato.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug di test] Nomi dei personaggi unici nella int-spec**
- **Trovato durante:** Task 2 GREEN
- **Problema:** due personaggi col nome di default della fixture violano l'indice unico `character_name_active_ci_unique` (caso dei partecipanti della stessa bozza).
- **Fix:** l'helper `characterOn` dà a ogni personaggio un nome derivato dall'id della sua PendingQuest.
- **Commit:** `51f61714` (insieme al GREEN)

**2. [Rule 3 - Gate del piano] Titolo del caso dei partecipanti**
- **Problema:** i titoli prescritti dal piano danno un solo `D-11)` nella int-spec, il gate ne vuole ≥ 2.
- **Fix:** `(D-11, D-16)` → `(D-16, D-11)` nel caso dei partecipanti della bozza.
- **Commit:** `f30a77d0`

Altro: il commento di testa del reader è sopra gli import; il messaggio della fabbrica e il commento del marcatore sono quelli del piano, verbatim.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `mission-lock.ts`, `mission-lock.spec.ts`, `mission-lock.reader.ts`, `mission-lock.reader.int-spec.ts`, `mission-lock.module.ts`.
- Commit presenti: `982624e1`, `2c443261`, `c104437a`, `51f61714`, `f30a77d0`.
