---
phase: 10-hardening-trasversale
plan: 21
subsystem: quest-outcomes
tags: [boss, rescue, seat-holder, combat, D-21, C18, BE-HARD-07]
requires:
  - "10-20: gate `npx tsc --noEmit -p tsconfig.json`"
  - "9.2 D-07: marcatore `archivedAt` sulla registrazione delle quest avviate"
provides:
  - "GroupRoster.seatHolders: registrati archiviati dopo l'avvio con corsia e PendingQuest coerenti"
  - "seatHolderLaneMembersOf (lettura della corsia senza il filtro dei personaggi attivi)"
  - "ResolutionLoader.readGroupRoster(questId, registered, now, seatHolderIds = []) e snapshotSeatHolderInSession"
  - "boss e soccorso di gruppo combattono a posti pieni; esiti e premi solo ai posti vivi; PendingQuest dei seat holder eliminate nella transazione"
  - "ScriptedCombatResolver.willEndBy(rule) per verdetti in funzione del contesto"
affects: [10-22, 10-23, 10-25, 10-30]
tech-stack:
  added: []
  patterns:
    - "lettura gemella con filtro dei personaggi passato a un core privato (nessun flag booleano)"
    - "assenza di risultati provata con toEqual sulla lista intera dei risultati"
key-files:
  created: []
  modified:
    - src/quests/outcomes/group-roster.ts
    - src/quests/party/lane-members.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/boss-resolution.service.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - test/quests/scripted-combat-resolver.ts
decisions:
  - "Il documento del seat holder non riceve alcuna scrittura (nemmeno la corsia): resta la fotografia dell'archivio; solo la sua PendingQuest viene eliminata"
  - "`dropped` continua a contenere i seat holder (escono dal roster con la clausola di uscita di `questUpdateOf`); `incoherentOf(roster)` = `dropped` meno i seat holder decide il WARN «rimosso»"
  - "`waiting` si calcola solo sui posti vivi; un seat holder non blocca né ritarda la risoluzione"
  - "Un id con il marcatore che risulta anche posto vivo non è letto due volte (escluso dai seat holder)"
metrics:
  duration: "~25 min"
  completed: "2026-10-30"
  tasks: 3
  files: 8
---

# Phase 10 Plan 21: seat holder in combattimento (D-21) Summary

I registrati archiviati dopo l'avvio di un boss o di un soccorso di gruppo restano nel combattimento come segnaposto di posto con la fotografia del personaggio archiviato («Per quello lasciamo il posto pieno»): il nemico affronta il gruppo al completo, mentre esiti, risultati e premi vanno solo ai posti vivi e le PendingQuest dei seat holder spariscono nella stessa transazione.

## Commit

| Task | Nome | Commit | Tipo |
| ---- | ---- | ------ | ---- |
| 1 | RED del combattimento con i seat holder (boss e soccorso) | 7b3c79a | test |
| 2 | roster con seat holder e loader senza filtro dei personaggi attivi | 123b730 | refactor |
| 3 | GREEN di boss e soccorso con i seat holder | 2fea346 | feat |

## Task 1 — RED

Casi in `boss-resolution.int-spec.ts` (helper nuovo `startedWithArchivedMember`, `allResults`, `messagesOf`, spia `log`):
- `fights with every seat when a member of a started boss was archived («Per quello lasciamo il posto pieno»)` — **rosso**: contesto con 1 combattente invece di 2 (la PendingQuest dell'archiviato restava).
- `wins a fight that only the full seat count can win («Per quello lasciamo il posto pieno»)` — **rosso**: con un solo combattente il resolver scriptato (`willEndBy`) dava `failure`.
- `gives no reward and no result to an archived seat holder («Per quello lasciamo il posto pieno»)` — **verde al primo colpo**: la 9.2 già scartava l'archiviato senza scrivergli nulla; il caso diventa la guardia contro la regressione ora che il seat holder entra nel combattimento con effetti scriptati (`hpAfter: 1`) che non devono toccarlo (`toEqual` sul documento grezzo dopo l'archivio).
- `logs a seat holder in combat with ids only` — **rosso**: nessun INFO «Segnaposto di posto …», solo `Boss … risolto per 1 partecipanti`.

`aid-rescue.int-spec.ts`: `rescues with every seat when a rescuer was archived after the start («Per quello lasciamo il posto pieno»)` — **rosso** (1 soccorritore nel contesto; il verdetto scriptato richiede ≥ 2 combattenti).

Esito RED: 4 falliti, 24 passati su 28.

## Task 2 — roster e loader

- `group-roster.ts`: `SeatHolder { character; pendingQuestId }`, `GroupRoster.seatHolders`, `seatHolderIdsOf(registrations)` (registrazioni con il marcatore), `incoherentOf(roster)`.
- `lane-members.ts`: core privato `readLaneMembers` con il filtro dei personaggi come parametro; `laneMembersOf` (attivi, invariato) e `seatHolderLaneMembersOf` (senza filtro dei personaggi attivi, stessa corsia standard e PendingQuest della quest); lista vuota ⇒ nessuna query.
- `resolution-loader.service.ts`: `readGroupRoster(..., seatHolderIds = [])` con `readLiveSeats`/`readSeatHolders`; `ResolutionQuest.registeredAdventurers` include `archivedAt`; `snapshotSeatHolderInSession` e `snapshotInSession` condividono `snapshotWhere`; `laneOn` estratto da `laneFilter`.

## Task 3 — GREEN

- Boss: `readGroupRoster` riceve `seatHolderIdsOf(...)`, catalogo su `fightersOf(roster)`, snapshot in sessione dei seat holder, contesto `[...vivi, ...seat holder]`, piano/scrittura/risultati solo per `roster.seats`, `deletePendingQuest` per ogni seat holder prima del claim; INFO per seat holder, WARN solo per `incoherentOf(roster)`.
- Soccorso: stessa regola dentro `commitRescue` (non spezzato: il refactor è del 10-23).

## Verifica

- `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 28 verdi.
- `npx jest src/quests --selectProjects unit`: 30 suite / 570 verdi.
- `npx jest src/quests/outcomes src/quests/party src/characters/deletion --selectProjects integration --runInBand`: 13 suite / 164 verdi.
- `npm run build` 0; `npx tsc --noEmit -p tsconfig.json` 0; `git diff --exit-code src/schema.gql` 0; nessuna riga rimossa rispetto a `origin/develop`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `willEndBy` nel fake scriptato**
- **Found during:** Task 1
- **Issue:** `ScriptedCombatResolver` aveva solo un verdetto fisso: il caso «only the full seat count can win» richiede un verdetto in funzione del numero di combattenti.
- **Fix:** `willEndBy(rule)` (prevale su `willEnd`, azzerato da `reset`) in `test/quests/scripted-combat-resolver.ts`, fuori da `files_modified`.
- **Commit:** 7b3c79a

**2. [Boy Scout] Duplicazioni rimosse nel loader**
- `snapshotWhere` condiviso fra le due letture in sessione, `laneOn` estratto da `laneFilter`, `fightersOf`/`incoherentOf` in `group-roster.ts` (usati da boss e soccorso). Comportamento invariato.

Nessun'altra deviazione.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: T-10-76 (nessun esito né premio al seat holder, `toEqual` sul documento grezzo), T-10-77 (PendingQuest eliminate nella transazione, asserito), T-10-78 (contesto a posti pieni) mitigati come da piano.

## Self-Check: PASSED
