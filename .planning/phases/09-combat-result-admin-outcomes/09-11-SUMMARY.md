---
phase: 09-combat-result-admin-outcomes
plan: 11
subsystem: characters
tags: [deletion, archive, death, transactions, aid, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: Quest.concludedAt, Quest.rescue { character, failedQuest }
  - phase: 03.1-character-deletion-contract
    provides: archiveCurrentCharacter (claim inverso, CHARACTER_NOT_FOUND/UNAUTHENTICATED), DeletionReason.death riservato
  - phase: 08-travel-lifecycle
    provides: rilascio dei posti alla cancellazione (D-30)
provides:
  - CharacterArchiver.archiveWithin(session, { userId, characterId, reason, now }) → 'archived' | 'unlinked' | 'not-linked', solo sulla session del chiamante
  - CharacterArchiveModule (User, Character, Quest; nessun UsersModule né change stream) per i moduli degli esiti
  - chiusura delle aid aperte (rescue.character) a ogni archivio, cancellazione inclusa
affects: [09-12, 09-13, 09-14, 09-16, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Funzione session-aware condivisa: il metodo pubblico apre la transazione, la funzione interna riceve la session (una transazione annidata committerebbe da sola, C1)"
    - "Esito tipizzato invece di eccezione: 'not-linked' lascia al chiamante la scelta (errore nella cancellazione, no-op loggato nella morte)"

key-files:
  created:
    - src/characters/deletion/character-archiver.ts
    - src/characters/deletion/character-archive.module.ts
    - src/characters/deletion/character-archiver.int-spec.ts
  modified:
    - src/characters/deletion/character-deletion.service.ts
    - src/characters/deletion/character-deletion.module.ts
    - src/characters/deletion/character-deletion.resolver.int-spec.ts

key-decisions:
  - "archiveCurrentCharacter legge currentCharacter in sessione e passa l'id a archiveWithin; 'not-linked' (perdente concorrente dopo il retry del WriteConflict) → rejectUnlinked come prima"
  - "Il filtro User di archiveWithin usa idForms(characterId): un currentCharacter legacy salvato come stringa esadecimale viene scollegato"
  - "CharacterDeletionModule non esporta più CharacterDeletionService: la morte usa CharacterArchiveModule, nessun altro consumatore"

patterns-established:
  - "Moduli degli esiti importano CharacterArchiveModule (non CharacterDeletionModule) per archiviare dentro la propria transazione"

requirements-completed: []  # contributo a BE-COMBAT-03 (D-09, C1); traceability nel gate 09-16

# Metrics
duration: 5min
completed: 2026-10-24
---

# Phase 9 Plan 11: CharacterArchiver.archiveWithin Summary

**Archivio del personaggio dentro la transazione del chiamante (C1): `CharacterArchiver.archiveWithin(session, …)` scollega l'utente solo se punta a quel personaggio (`idForms`), archivia, libera i posti e chiude le aid aperte, senza aprire transazioni; `archiveCurrentCharacter` lo riusa nella propria transazione a contratto 03.1 invariato**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-24T15:50:10Z
- **Completed:** 2026-10-24T15:54:30Z
- **Tasks:** 2 (2/2)
- **Files modified:** 6 (3 creati, 3 modificati)

## Accomplishments

- `CharacterArchiver.archiveWithin`: `findOneAndUpdate({ _id: userId, currentCharacter: { $in: idForms(characterId) } })` → `'not-linked'` senza scritture se l'utente è già scollegato o punta ad altro; `updateOne(activeCharacterById(characterId), { deletedAt: now, deletionReason })` → `'unlinked'` + WARN con soli id se il personaggio è assente o già archiviato; altrimenti `$pull` dei posti e `concludedAt: now` sulle aid con `rescue.character` aperte → `'archived'`.
- Prova C1: una transazione esterna che lancia dopo `archiveWithin` non lascia nulla (utente ancora collegato, personaggio attivo, posto e aid intatti).
- `CharacterArchiveModule`: solo `forFeature([User, Character, Quest])` e il provider; nessun `UsersModule`, quindi nessun change stream degli utenti nei processor test degli esiti.
- `CharacterDeletionService` non inietta più `Character`/`Quest` né `Logger`; nessun `$pull` nel servizio.
- Boy Scout (dal piano): la cancellazione volontaria chiude anche le aid aperte del personaggio, che spariscono dalla query `quests`.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | archiveWithin nella transazione del chiamante (RED) | `f6e72f7` | test |
| 1 | archiveWithin nella transazione del chiamante (GREEN) | `4dbb58a` | feat |
| 2 | chiusura delle aid alla cancellazione (RED) | `2ec4e74` | test |
| 2 | archiveCurrentCharacter attraverso l'archiver | `aaa3968` | refactor |

**Plan metadata:** commit `docs(phase-9): complete plan 09-11 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** `npx jest src/characters/deletion/character-archiver.int-spec.ts --selectProjects integration --runInBand` → 6/6 falliti su `not implemented` (firma stub nel commit RED).
- **Task 2:** `npx jest src/characters/deletion/character-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` → 1 fallito / 18 (`closes the open aid quests of the deleted character`: `concludedAt` null), 17 esistenti verdi.

### Casi esistenti di `character-deletion.resolver.int-spec.ts` (invariati, verdi dopo il refactor)

archives the current character and returns the unlinked user; answers CHARACTER_NOT_FOUND on a second call and writes nothing; answers CHARACTER_NOT_FOUND to a user without a character; archives exactly once under concurrent calls; rejects an anonymous call with UNAUTHENTICATED; rejects a valid bearer whose user no longer exists with UNAUTHENTICATED; refuses any argument; unlinks a user pointing at a missing character and warns; unlinks a user pointing at an already archived character without touching it; keeps the pending quest on the archived character; frees the name for a new character of the same user; makes the archived character invisible to its former owner; streams the unlinked user on userUpdated; seat release: frees the seats of the deleted character on every quest; leaves the quests untouched when the deletion is rejected; keeps the pending quest and the active travel on the archived character; releases the seats once under concurrent deletions.

L'unica modifica al setup: `QuestsModule` aggiunto agli `imports` dell'harness (serve la query `quests` per il caso nuovo; modulo autosufficiente, senza Bull).

## Verification

- `npx jest src/characters/deletion --selectProjects unit`: 2/2.
- `npx jest src/characters/deletion --selectProjects integration --runInBand`: 2 suite, 24/24 (archiver 6, cancellazione 18).
- `npm run build`: 0; `src/schema.gql` invariato. Prettier e ESLint puliti sui 6 file.
- Grep di accettazione: `connection.transaction\|startSession` nell'archiver = 0; `'rescue.character': characterId` 1 riga; `UsersModule` nel modulo dell'archivio vuoto; `abort` nell'int-spec = 3; `archiveWithin(` nel servizio 1 riga; `$pull` nel servizio = 0; `CharacterArchiveModule` nel modulo di cancellazione 2 righe.

## Decisions Made

- `archiveCurrentCharacter` legge l'utente con `findById(...).session(session)` e converte con `refIdOf`: un riferimento legacy esadecimale continua a funzionare; un valore non convertibile in id (impossibile con i dati attuali) ora risponde CHARACTER_NOT_FOUND invece di "scollegato comunque".
- Concorrenza: il perdente legge lo stesso `currentCharacter` del vincitore, il suo `findOneAndUpdate` va in WriteConflict, il driver ritenta il callback, rilegge `null` → CHARACTER_NOT_FOUND (caso `archives exactly once under concurrent calls` verde).
- Caso in più nell'int-spec: il WARN contiene sia l'id utente sia l'id del personaggio.

## Deviations from Plan

### Scostamenti minori

**1. Commenti riformulati per i grep di accettazione**
- Il commento dell'archiver citava `connection.transaction` (grep atteso 0) e quello del modulo `UsersModule` (grep atteso vuoto): riformulati in "una transazione annidata" e "senza il modulo degli utenti", stesso significato.

**2. Export di `CharacterDeletionService` rimosso**
- Esisteva solo per la morte della Phase 9, che ora passa da `CharacterArchiveModule`; nessun altro consumatore (grep su `src` e `test`).

**3. Progress Table della ROADMAP**
- Il piano indica `11/16`; l'orchestratore prescrive `8/16` (8 piani completati): applicato `8/16`.

Nessuna regola 1–4 attivata.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

Nessuna superficie nuova: T-09-50 (transazione abortita), T-09-51 (utente che punta ad altro), T-09-52 (aid chiuse alla cancellazione), T-09-53 (casi 03.1 invariati) mitigati e coperti dai test.

## Self-Check: PASSED

- FOUND: src/characters/deletion/character-archiver.ts, character-archive.module.ts, character-archiver.int-spec.ts
- FOUND: f6e72f7, 4dbb58a, 2ec4e74, aaa3968
