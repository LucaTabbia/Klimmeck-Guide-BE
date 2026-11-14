---
phase: 22-completamento-guidato-missioni
plan: 05
subsystem: characters
tags: [mission-lock, graphql, subscriptions, change-streams, sdl]
requires: ["22-01", "22-02", "22-04"]
provides:
  - "lockLanesOf(character) → LockLanes | 'unresolved' | null in mission-lock.ts (solo `in` e `.get`, mai l'elenco delle chiavi)"
  - "CharacterStatus.missionInProgress: Boolean! e CharacterStatus.guidedMissionInProgress: Boolean! risolti (CharacterStatusResolver col MissionLockReader)"
  - "MissionDraftLockPublisher: change stream del marcatore della PendingQuest → requestPublish dei titolari delle corsie story/worldMission"
  - "src/schema.gql con le sole due righe nuove in type CharacterStatus"
affects: [22-07, 22-11, 22-17, 22-18]
tech-stack:
  added: []
  patterns: ["campo risolto dal parent idratato via $parent() con ripiego sul reader per corsie non popolate", "publisher gemello su change stream di un campo anche messo a null"]
key-files:
  created:
    - src/characters/mission-lock/mission-draft-lock.publisher.ts
    - src/characters/mission-lock/mission-draft-lock.publisher.spec.ts
    - src/characters/mission-in-progress.int-spec.ts
  modified:
    - src/characters/mission-lock/mission-lock.ts
    - src/characters/mission-lock/mission-lock.spec.ts
    - src/characters/character-status.resolver.ts
    - src/characters/character-status.resolver.spec.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Una corsia è popolata se è un oggetto non ObjectId con startDate, missionDraftStartedAt o quest; una corsia di forma ignota vale come id (si chiede al reader)"
  - "Il resolver passa dal predicato puro con le corsie popolate e dal MissionLockReader con l'_id del parent altrimenti; senza $parent risponde false"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 22 Plan 05: campi risolti della missione in corso, publisher del marcatore, SDL Summary

`CharacterStatus.missionInProgress` e `CharacterStatus.guidedMissionInProgress` sono sul filo, risolti dalla stessa regola delle guardie (`missionInProgressOf` / `guidedMissionInProgressOf`) leggendo le corsie già popolate del personaggio (nessuna lettura in più per `character` e `characterUpdated`) o, con le corsie come id, il `MissionLockReader`; `MissionDraftLockPublisher` ripubblica `characterUpdated` per gli iscritti quando il marcatore della bozza va a una data o torna a `null`.

## Task e commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | `e0d8de60` | `test(characters): pin the served mission flags` |
| 1 GREEN | `0d4deac1` | `feat(characters): serve the mission in progress flags` (con `src/schema.gql`) |
| 1 REFACTOR | `bc475a21` | `refactor(characters): read the status flags through the shared predicate` |
| 2 RED | `4ffec0d2` | `test(characters): pin the live mission lock events` |
| 2 GREEN | `7fced919` | `feat(characters): publish the lock of a guided draft` |
| 3 | commit di bookkeeping | `docs(phase-22): record plan 05 progress` |

## SDL aggiunto

Al boot reale di test (`test/app.int-spec.ts`) `src/schema.gql` ha guadagnato solo due righe in `type CharacterStatus`: `guidedMissionInProgress: Boolean!` e `missionInProgress: Boolean!`; `git diff c6079ca3 -- src/schema.gql` non ha righe tolte; `type PendingQuest` non contiene il marcatore.

## Eventi provati (`src/characters/mission-in-progress.int-spec.ts`)

- Avvio da solo all'arrivo (scrittura del personaggio con la corsia standard avviata) → `missionInProgress` true, `guidedMissionInProgress` false.
- Avvio del party (`startDate` scritta sulla sola PendingQuest) → `missionInProgress` true (via `PendingQuestStartPublisher`).
- Bozza guidata su una worldMission con due iscritti: marcatore a una data → un evento per ciascuno con entrambi true; marcatore a `null` → entrambi false.
- Query `character(id)` coerente: libero, standard avviata, story con bozza.

## Fallimenti RED attesi

- Task 1: unit 12 rossi su 25 (`lockLanesOf` e i due resolve field assenti); `test/app.int-spec.ts` 2 rossi (i due casi che pinnano `CHARACTER_STATUS_BLOCK`). Verde al primo colpo: `keeps the guided draft marker off the pending quest type (D-18)` (il marcatore è già solo Mongoose dal piano 01: guardia di regressione).
- Task 2: la spec unit del publisher non compila il modulo (assente); int-spec 1 rosso su 4 (`emits both flags when a guided draft starts and ends (D-23)`: nessun evento, timeout). Verdi al primo colpo come previsto dal piano: avvio da solo (l'arrivo scrive il personaggio), avvio del party (`PendingQuestStartPublisher` esistente), query `character` (il resolver del task 1).

## Verifica

- `npx jest src/characters --selectProjects unit`: 441/441 (33 suite).
- `npx jest src/characters/mission-in-progress.int-spec.ts src/characters/pending-quest-start.publisher.int-spec.ts src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand`: 25/25.
- `npx jest test/app.int-spec.ts src/characters/mission-lock src/characters/mission-in-progress.int-spec.ts src/characters/archived-character.realtime.int-spec.ts --selectProjects integration --runInBand`: 121/121 (DI di `CharactersModule` col publisher nuovo).
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato dopo il GREEN del task 1.
- Grep di accettazione: `missionInProgress: Boolean!` 1 e `guidedMissionInProgress: Boolean!` 1 in `src/schema.gql`, marcatore 0; `missionInProgressOf(` 1 nel resolver; nessun elenco delle chiavi in `mission-lock.ts`; `requestPublish(` 1 nel publisher; `MissionDraftLockPublisher` 2 nel modulo e 2 nell'app di test; `D-23)` 1 e `D-16)` 3 nell'int-spec; `pending-quest-start.publisher.ts` intatto.

## Deviations from Plan

- **Refactor dopo il GREEN del task 1** (`bc475a21`): la prima versione passava i predicati come riferimento e il grep `missionInProgressOf(` sul resolver dava 0; il resolver ora usa un solo helper `lanesOrIdOf` e chiama i predicati direttamente. Effetto collaterale: il criterio «`git show --stat HEAD` contiene `schema.gql`» vale per il commit GREEN `0d4deac1`, non per HEAD a fine task (mai amend).
- Il caso del documento idratato (`reads populated lanes without a second read (D-16)`) sta nella spec unit con `new CharacterModel(...)` e PendingQuest idratate assegnate alle corsie (in memoria, senza connessione); in più la query `character` dell'int-spec prova il documento restituito da `findOne`.
- Casi in più nella spec unit del publisher (gemelli di quella di `PendingQuestStartPublisher`): evento senza chiave, errore di lettura col solo codice nel log, nessuna lettura né ripubblicazione a chiusura iniziata.

Nessuna spec fuori piano corretta.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti; commit `e0d8de60`, `0d4deac1`, `bc475a21`, `4ffec0d2`, `7fced919` nel log.
