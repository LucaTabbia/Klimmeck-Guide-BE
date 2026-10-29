---
phase: 10-hardening-trasversale
plan: 19
subsystem: mongo-indexes
tags: [indexes, sweep, backfill, boot, D-17b, BE-HARD-06]
requires:
  - "10-18: CharacterUpdatesPublisher e boot reale a 62 casi"
provides:
  - "8 indici con nome negli schemi (costanti esportate accanto a ogni schema)"
  - "src/mongo/sweep-index.verifier.ts: SweepIndexVerifier, provider di MongoModule, mai atteso dal boot"
  - "QuestResolutionSweeper.backfillOnce(): backfill di registeredAt una volta per processo al boot, fuori dal tick"
  - "QuestResultMaintenance.maintain(): indice + backfill dei risultati, lanciato e non atteso da onApplicationBootstrap"
affects: [10-22, 10-23, 10-25, 10-30]
tech-stack:
  added: []
  patterns:
    - "verificatore di indici non bloccante: onApplicationBootstrap(): void lancia un metodo pubblico async; le spec ne attendono il risultato con jest.spyOn(...).mock.results[0].value"
key-files:
  created:
    - src/models/sweep-indexes.schema.spec.ts
    - src/mongo/sweep-index.verifier.ts
    - src/mongo/sweep-index.verifier.int-spec.ts
  modified:
    - src/models/character/character.model.ts
    - src/models/quest/quest.model.ts
    - src/models/pending-quest.model.ts
    - src/models/user.model.ts
    - src/mongo/mongo.module.ts
    - test/app.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.ts
    - src/quests/outcomes/quest-resolution.sweeper.spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
    - src/quests/results/quest-result-maintenance.ts
    - src/quests/results/quest-result-maintenance.int-spec.ts
decisions:
  - "SweepIndexVerifier costruisce gli indici dei quattro modelli in serie (nessun picco al boot), un try/catch per modello: un fallimento non impedisce gli altri"
  - "verifyAll() e backfillOnce() sono pubblici per permettere alle spec di attendere il lavoro lanciato in background dal boot"
  - "La riga di log del tick dello sweep non contiene più le registrazioni retrodatate; il backfill logga una riga propria solo se ha toccato quest"
metrics:
  duration: "~35 min"
  completed: 2026-10-29
---

# Phase 10 Plan 19: indici dello sweep e backfill al boot Summary

Otto indici con nome per le query dello sweep e delle corsie, costruiti al boot da `SweepIndexVerifier` senza mai bloccarlo, e backfill legacy (`registeredAt` delle registrazioni, conferma dei risultati) eseguiti una volta per processo e mai attesi dal boot.

## Indici

| Collection | Chiave | Nome | Costante |
|---|---|---|---|
| characters | `{ deletedAt: 1, 'quests.pendingQuest': 1 }` | `character_standard_lane` | `CHARACTER_STANDARD_LANE_INDEX` |
| characters | `{ deletedAt: 1, 'status.awaitingAid.since': 1 }` | `character_awaiting_aid_since` | `CHARACTER_AWAITING_AID_SINCE_INDEX` |
| characters | `{ deletedAt: 1, 'status.activeTravel.endTime': 1 }` | `character_active_travel_end` | `CHARACTER_ACTIVE_TRAVEL_END_INDEX` |
| characters | `{ deletedAt: 1, 'status.spellStates.recoveries': 1 }` | `character_spell_recoveries` | `CHARACTER_SPELL_RECOVERIES_INDEX` |
| quests | `{ 'infos.type': 1, concludedAt: 1, startedAt: 1 }` | `quest_forming_parties` | `QUEST_FORMING_PARTIES_INDEX` |
| quests | `{ 'registeredAdventurers.character': 1 }` | `quest_registered_character` | `QUEST_REGISTERED_CHARACTER_INDEX` |
| pendingquests | `{ quest: 1, startDate: 1, arrivedAt: 1 }` | `pending_quest_lane_dates` | `PENDING_QUEST_LANE_DATES_INDEX` |
| users | `{ currentCharacter: 1 }` | `user_current_character` | `USER_CURRENT_CHARACTER_INDEX` |

## Task

| Task | Nome | RED | GREEN |
|---|---|---|---|
| 1 | indici con nome negli schemi | `a4ffa03` | `bbce4b9` |
| 2 | verificatore non bloccante al boot | `15e85ad` | `111e05d` |
| 3 | backfill una volta per processo, mai attesi | `143b376` | `1cc39bd` |

### Fallimenti RED osservati

- Task 1: gli 8 casi di `sweep-indexes.schema.spec.ts` falliti (`toContainEqual` senza l'indice).
- Task 2: `sweep-index.verifier.int-spec.ts` e `test/app.int-spec.ts` falliti per modulo `src/mongo/sweep-index.verifier` inesistente (configuration error di jest-resolve).
- Task 3: unit 4 falliti (backfill a ogni tick: 3 chiamate invece di 1; sweep bloccato dal backfill sospeso, timeout 5 s; `backfillOnce` assente; log del tick con la voce delle registrazioni retrodatate); integration 5 falliti (`sweeper.backfillOnce is not a function`, `maintenance.maintain is not a function`).

### Verdi finali

- `npx jest src/models --selectProjects unit`: 10 suite / 87
- `npx jest src/quests --selectProjects unit`: 30 suite / 570
- `npx jest src/mongo test/app.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 65 (boot reale 63 casi)
- `npx jest src/quests/outcomes/quest-resolution.sweeper.int-spec.ts src/quests/results src/quests/party test/app.int-spec.ts --selectProjects integration --runInBand`: 11 suite / 151
- Regressione extra: `character-name-index.verifier.int-spec` + `twitch-id-index.verifier.int-spec` 2 / 21
- `npm run build` 0; `git diff --exit-code src/schema.gql` 0 dopo ogni commit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spec esistenti adattate al backfill fuori dal tick**
- **Found during:** Task 3
- **Issue:** `runs a single sweep at a time` teneva lo sweep in volo con un backfill sospeso; il caso unit «backfills, starts, then disbands…» e il caso integration «backdates a legacy registration…» presupponevano il backfill nel tick.
- **Fix:** il primo ora sospende la pipeline degli arrivi; il secondo diventa `starts, then disbands only the expired parties without backfilling (D-17b)` e prova la riga di log intera con `toEqual`; il terzo chiama `sweeper.backfillOnce()` prima dello sweep (titolo `… to now at boot (D-17b)`).
- **Commit:** `143b376`

**2. [Rule 2 - Critical] Caso unit sul log del backfill**
- Aggiunto `logs the boot backfill count, and its failure by name and code only (D-17b)`: conteggio solo se > 0, errore solo con `describeError`.

Nessun'altra deviazione; subject dei commit come da piano (tutti ≤ 72 caratteri).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/models/sweep-indexes.schema.spec.ts`, `src/mongo/sweep-index.verifier.ts`, `src/mongo/sweep-index.verifier.int-spec.ts`
- Commit presenti: `a4ffa03`, `bbce4b9`, `15e85ad`, `111e05d`, `143b376`, `1cc39bd`
