---
phase: 22-completamento-guidato-missioni
plan: 08
subsystem: quests
tags: [guided-mission, draft, graphql, authz, audit]
requires: ["22-07"]
provides:
  - "Tipi del filo della bozza in src/quests/guided/mission-draft.wire.ts (MissionDraftView come `MissionDraft`, enum MissionDraftStep e MissionFightVerdict registrati)"
  - "toMissionDraftWire(record, enemies) pura e MissionDraftPresenter.present(record) (nemici con ENEMY_WIRE_POPULATE, voci orfane scartate)"
  - "ENEMY_WIRE_POPULATE esportata da src/enemies/enemies.service.ts"
  - "GuidedMissionResolver: startMissionDraft, missionDraft, discardMissionDraft (solo innkeeper, mutation nel log di audit con target PendingQuest)"
  - "EXPECTED_INNKEEPER_HANDLERS 11 → 14 con fixture della matrice"
affects: [22-10, 22-13, 22-14, 22-15, 22-16, 22-18]
tech-stack:
  added: []
  patterns: ["classi del filo separate dallo schema Mongoose + presentatore che popola i ref prima della funzione pura"]
key-files:
  created:
    - src/quests/guided/mission-draft.wire.ts
    - src/quests/guided/mission-draft.mapper.ts
    - src/quests/guided/mission-draft.mapper.spec.ts
    - src/quests/guided/guided-mission.resolver.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
  modified:
    - src/enemies/enemies.service.ts
    - src/quests/guided/guided-mission.module.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Il target di audit delle due mutation è una sola funzione `pendingQuestTarget` condivisa (due `@AuditTarget(` come da piano)"
  - "La guardia «nessun campo di esito della quest nello SDL» di app.int-spec ignora il solo blocco `type MissionDraft` (`startedAt` è l'avvio della bozza, D-17)"
  - "Il rifiuto della query nullable `missionDraft` arriva come `data { missionDraft: null }` + FORBIDDEN: il caso D-10 verifica che nessun valore non nullo sia servito"
metrics:
  duration: "~40 min"
  completed: 2026-11-14
---

# Phase 22 Plan 08: bozza sul filo Summary

La bozza è sul filo dell'oste: tipi GraphQL verbatim (RESEARCH §Q9 + D-17) in classi separate dallo schema Mongoose, un presentatore che popola i nemici degli scontri con `ENEMY_WIRE_POPULATE` e scarta le voci col nemico cancellato (mai un null su `Enemy!`), e `GuidedMissionResolver` con avvio, lettura e scarto, tutti `@Roles(innkeeper)`; le due mutation entrano nel log di audit con target `PendingQuest`, la query no.

## SDL aggiunto (verbatim, da `src/schema.gql`)

I dodici blocchi dell'`<interfaces>` del piano (`type MissionDraft`, `enum MissionDraftStep`, `type MissionFight`, `type MissionFightEffects`, `type MissionFightEnemy`, `type MissionFightOutcome` con `consumablesAvailable`/`injuriesBefore`/`spellsAvailable`, `enum MissionFightVerdict`, `type MissionItemUsage`, `type MissionParticipant`, `type MissionPrize`, `type MissionPrizeItem`, `type MissionSpellUsage`) più:

```graphql
# type Mutation
  discardMissionDraft(pendingQuestId: ID!): CommonResponse!
  startMissionDraft(pendingQuestId: ID!): MissionDraft!
# type Query
  missionDraft(pendingQuestId: ID!): MissionDraft
```

`git diff c6079ca3 -- src/schema.gql`: 0 righe tolte (+89).

## Handler

- `startMissionDraft` → `MissionDraftService.start(hex, identity?.userId ?? null)` → presentatore.
- `missionDraft` → `read(hex)` → presentatore o `null` (NOT_FOUND se la richiesta non è GM).
- `discardMissionDraft` → `discard(hex)` → `{ response: 'Bozza scartata', successful: true }`.
- `EXPECTED_INNKEEPER_HANDLERS` 11 → 14 (le tre voci dopo `CharactersResolver.characters`), una fixture `target: 'none'` per handler.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 0a08595f | test(quests): pin the wire shape of the mission draft |
| 1 GREEN | c92cd6d8 | feat(quests): shape the mission draft for the wire |
| 2 RED | e4138014 | test(gm): pin the guided mission draft on the wire |
| 2 deviazione | d37eadac | test(authz): count the guided draft handlers in the matrix rows |
| 2 GREEN | 9e906c77 | feat(gm): start, read and discard a guided mission draft |

## Fallimenti RED attesi (osservati)

- Task 1: `Cannot find module './mission-draft.mapper'` (suite non avviata).
- Task 2: `handler-fixtures.spec` «validates every document against the schema (D-01)» (campi sconosciuti allo SDL); int-spec del resolver 4/4 rossi (errore di validazione GraphQL); `app.int-spec` «adds the guided mission draft to the schema (D-17)» e «exposes exactly the enumerated innkeeper-only handlers» (11 contro 14).

## Esiti

- unit `src/quests/guided src/enemies` 12/12; `test/authz/handler-fixtures.spec.ts src/quests/guided` 16/16; `src/authz/audit src/enemies` 26/26.
- integration `test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/quests/guided` 215/215 (4 suite); `src/authz/audit` 11/11.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` stabile dopo il boot; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guardia dello SDL su `startedAt` in conflitto con lo SDL verbatim**
- **Found during:** Task 2 (GREEN, boot reale)
- **Issue:** `writes the quest outcome fields into the generated schema` vieta `startedAt` in tutto lo SDL; `MissionDraft.startedAt: DateTime!` è imposto da D-17.
- **Fix:** la guardia toglie il solo blocco `type MissionDraft` prima del `not.toMatch` (vale ancora ovunque altrove).
- **Files modified:** test/app.int-spec.ts (file del piano)
- **Commit:** 9e906c77

**2. [Rule 1 - Spec fuori piano] Conteggio delle righe HTTP della matrice**
- **Found during:** Task 2
- **Issue:** `authorization-matrix.int-spec.ts` «runs one row per listed handler (D-01)» pinnava 10 righe HTTP dell'oste; le tre nuove sono volute (D-10).
- **Fix:** 10 → 13, commit dedicato.
- **Files modified:** test/authz/authorization-matrix.int-spec.ts
- **Commit:** d37eadac

**3. [Rule 1 - Bug del RED] Caso D-10 sulla query nullable**
- **Issue:** il RED si aspettava `data` nullo; per una query nullable GraphQL risponde `data { missionDraft: null }` con l'errore FORBIDDEN.
- **Fix:** il caso verifica che nessun valore non nullo sia servito e il codice `FORBIDDEN` su tutti e tre gli handler.
- **Commit:** 9e906c77

## Known Stubs

Nessuno.

## Self-Check: PASSED
