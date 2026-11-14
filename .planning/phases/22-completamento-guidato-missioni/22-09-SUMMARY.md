---
phase: 22-completamento-guidato-missioni
plan: 09
subsystem: quests
tags: [guided-mission, innkeeper-queue, change-stream, graphql]
requires: ["22-08"]
provides:
  - "PendingRequest.missionDraftStartedAt: DateTime (nullable), letto dal marcatore della PendingQuest nella proiezione esistente"
  - "MissionDraftQueueRefresher: change stream sugli update del marcatore → PendingRequestsPublisher.requestRefresh()"
affects: [22-15, 22-16, 22-18]
tech-stack:
  added: []
  patterns: ["refresher gemello di ArchivedCharacterQueueRefresher su un altro modello: la pipeline pinnata del publisher della coda non cambia"]
key-files:
  created:
    - src/quests/pending-requests/mission-draft-queue.refresher.ts
    - src/quests/pending-requests/mission-draft-queue.refresher.spec.ts
  modified:
    - src/models/pending-request.model.ts
    - src/quests/pending-requests/pending-requests.builder.ts
    - src/quests/pending-requests/pending-requests.builder.spec.ts
    - src/quests/pending-requests/pending-requests.service.ts
    - src/quests/pending-requests/pending-requests.service.int-spec.ts
    - src/quests/pending-requests/pending-requests.module.ts
    - src/quests/pending-requests/pending-requests.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "La pipeline del refresher accetta ogni update che tocca il marcatore (data o null): avvio e scarto riemettono la coda; mai un unset dal servizio della bozza"
  - "Il caso wire del refresher sta in coda al describe della subscription: il cursore nuovo è già aperto dopo i priming dei casi precedenti"
metrics:
  duration: "~15 min"
  completed: 2026-11-14
---

# Phase 22 Plan 09: stato del flusso sulla coda dell'oste Summary

La voce della coda dell'oste porta `missionDraftStartedAt` (marcatore della PendingQuest, mai la bozza intera) e `pendingRequestsUpdated` riemette la coda quando il marcatore cambia, grazie a un `MissionDraftQueueRefresher` nuovo che chiede il ricalcolo al publisher esistente senza toccarne la pipeline.

## SDL aggiunto (verbatim, da `src/schema.gql`)

```graphql
type PendingRequest {
  character: PendingRequestCharacter!
  id: ID!
  missionDraftStartedAt: DateTime
  pointsSpent: Int!
  quest: PendingRequestQuest!
  startDate: DateTime
  user: PendingRequestUser!
}
```

Una sola riga aggiunta; `git diff c6079ca3 -- src/schema.gql` non mostra righe tolte.

## Eventi provati

- `pending-requests.resolver.int-spec.ts` «sends the queue again when a guided draft starts and is discarded (D-17, D-23)»: `$set` del marcatore su una PendingQuest in coda → lista con la data ISO sulla voce; `$set` a null → lista con `null`; la coda resta la stessa (stessi id).
- `mission-draft-queue.refresher.spec.ts`: pipeline pinnata con `toEqual`, `onChange` e `onHistoryLost` (codice 286) chiamano `requestRefresh` una volta ciascuno.
- `pending-requests.service.int-spec.ts` «lists the draft start of each world mission entry (D-18)»: due iscritti marcati → stessa data su entrambe le voci.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 9ac3eccd | test(gm): pin the draft start on the innkeeper queue |
| 1 GREEN | 87f47455 | feat(gm): show the draft start on the innkeeper queue |
| 2 RED | 5253fa27 | test(gm): pin the queue refresh on the draft marker |
| 2 GREEN | a606865d | feat(gm): refresh the innkeeper queue on a draft change |

## Fallimenti RED attesi (osservati)

- Task 1: builder «builds the flat entry of a story request» (F8, campo assente) e «carries the guided draft start of the pending quest (D-17, D-18)»; `app.int-spec` «writes the innkeeper queue into the generated schema» (F2); service int-spec «lists the draft start of each world mission entry (D-18)». `tsc` rosso nel RED solo per il campo assente sul tipo.
- Task 2: `Cannot find module './mission-draft-queue.refresher'`; caso wire rosso per nessun evento sull'update del marcatore (`expected list never arrived`).

## Esiti

- unit `src/quests/pending-requests` 23/23.
- integration `test/app.int-spec.ts` + service int-spec 101/101; resolver int-spec 9/9; allargata `src/quests/pending-requests src/quests/guided test/app.int-spec.ts` 139/139.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` stabile dopo il boot; publisher della coda senza diff; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

Nessuna: piano eseguito come scritto. Oltre al piano, nel caso `returns the story and world mission requests to the innkeeper` della resolver int-spec il `toEqual` della voce include `missionDraftStartedAt: null` (conseguenza diretta del campo aggiunto a `REQUEST_FIELDS`, file del piano).

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre il threat model: solo la data sulla voce di una coda già `@Roles(innkeeper)` (T-22-23); publisher esistente invariato (T-22-24).

## Self-Check: PASSED
