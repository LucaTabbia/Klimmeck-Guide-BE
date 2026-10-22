---
phase: 08-travel-lifecycle-travel-01
plan: 07
subsystem: characters
tags: [characters, deletion, quests, seats, transactions]
requires:
  - "08-01: Quest.registeredAdventurers a oggetti { character, title }"
  - "03.1: CharacterDeletionService.archiveCurrentCharacter (claim inverso in transazione, D-06/D-10)"
provides:
  - "archiveCurrentCharacter: $pull da registeredAdventurers di ogni quest che contiene il personaggio archiviato, nella stessa session dell'archivio, solo se l'archivio ha trovato il personaggio (D-30)"
  - "CharacterDeletionModule registra Quest nel forFeature"
affects: [08-14, phase-9]
tech-stack:
  added: []
  patterns:
    - "effetto collaterale di dominio della cancellazione aggiunto alla stessa transazione del claim inverso (routine 03.1 estesa, non duplicata)"
key-files:
  created: []
  modified:
    - src/characters/deletion/character-deletion.service.ts
    - src/characters/deletion/character-deletion.module.ts
    - src/characters/deletion/character-deletion.resolver.int-spec.ts
key-decisions:
  - "Il $pull vale su tutte le quest che contengono il personaggio: non esiste ancora un marcatore di conclusione (Phase 9, RESEARCH Q6)"
  - "Riferimento pendente o già archiviato (matchedCount 0): WARN e return anticipato, nessun rilascio di posti"
  - "PendingQuest e activeTravel restano sul documento archiviato (03.1 D-10): job e sweep li saltano via ACTIVE_CHARACTER_FILTER"
metrics:
  duration: 6 min
  completed: 2026-10-21
  tasks: 1
  files: 3
---

# Phase 8 Plan 07: rilascio dei posti alla cancellazione del personaggio Summary

`deleteCharacter` (e la futura morte della Phase 9, stessa routine) libera i posti del personaggio in ogni quest registrata con un `updateMany` + `$pull` su `registeredAdventurers.character`, nella stessa transazione dell'archivio, senza toccare i posti degli altri registrati.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 RED | quattro casi `seat release (D-30)`, `Quest` fra le collection pre-create | 24b7357 | character-deletion.resolver.int-spec.ts |
| 1 GREEN | `questModel.updateMany(... $pull ..., { session })` dopo l'archivio; `Quest` nel `forFeature` | 5867049 | character-deletion.service.ts, character-deletion.module.ts |

### RED output

```
✕ frees the seats of the deleted character on every quest
✓ leaves the quests untouched when the deletion is rejected
✕ keeps the pending quest and the active travel on the archived character
    - Array []
    + Array [ Object { "character": "6ad9…", "title": "rookie" } ]
✕ releases the seats once under concurrent deletions
Tests: 3 failed, 14 passed, 17 total
```

Il caso del rifiuto passa già al RED per costruzione (è una prova di non regressione: nessuna scrittura sulle quest quando il claim fallisce).

### GREEN

- `npx jest src/characters/deletion --selectProjects integration --runInBand`: 17/17
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 30/30 (DI del real boot invariata)
- `npm run build` ok; `git diff --exit-code src/schema.gql` pulito; eslint pulito sui 3 file

## Threat model

- T-08-32: `$pull` nella stessa session dell'archivio — 'frees the seats of the deleted character on every quest'
- T-08-33: filtro e `$pull` sul solo `character` archiviato — `other` intatto in ogni caso
- T-08-34: rifiuto ⇒ la transazione lancia prima di ogni scrittura — 'leaves the quests untouched when the deletion is rejected'; concorrenza — 'releases the seats once under concurrent deletions'

## Deviations from Plan

None - plan executed exactly as written. (Il "solo se `matchedCount > 0`" è realizzato con un `return` anticipato dopo il WARN esistente.)

## Self-Check: PASSED

- FOUND: src/characters/deletion/character-deletion.service.ts (`$pull`, `'registeredAdventurers.character'`)
- FOUND: src/characters/deletion/character-deletion.module.ts (`QuestSchema`)
- FOUND: src/characters/deletion/character-deletion.resolver.int-spec.ts (`seat release (D-30)`)
- FOUND: 24b7357, 5867049
