---
phase: 22-completamento-guidato-missioni
plan: 10
subsystem: quests
tags: [guided-mission, enemies, innkeeper, graphql]
requires: ["22-09"]
provides:
  - "missionBandOf, byMissionOrder, missionEnemyPoolOf (puri) in src/quests/guided/mission-enemy-pool.ts"
  - "MissionEnemiesService.list(pendingQuestHex, showAll): Promise<Enemy[]>"
  - "query missionEnemies(pendingQuestId: ID!, showAll: Boolean = false): [Enemy!]! (@Roles innkeeper, senza audit)"
affects: [22-11, 22-17, 22-18]
tech-stack:
  added: []
  patterns: ["regola di zona condivisa col generatore: livesIn e livesAnywhere esportate da enemy-pool.ts con parametro ristretto a Pick<EnemyCandidate, 'locations'>"]
key-files:
  created:
    - src/quests/guided/mission-enemy-pool.ts
    - src/quests/guided/mission-enemy-pool.spec.ts
    - src/quests/guided/mission-enemies.service.ts
  modified:
    - src/quests/generation/enemy-pool.ts
    - src/quests/guided/guided-mission.resolver.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - src/quests/guided/guided-mission.module.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Fascia: indice minimo = minTitle, massimo = max(minTitle, titoli dei posti) in GENERATED_RANKS; legend → hero, titolo assente → rookie; i posti si leggono con slotsOf (posti malformati → solo minTitle)"
  - "Leggendari solo con legendary === true e regolari solo con legendary === false: un valore diverso esce solo con showAll"
  - "Il ripiego su all scatta quando l'unione di regolari e leggendari della zona è vuota"
  - "Luogo: place della bozza (MissionDraftService.read), altrimenti status.location del primo posto; POI assente o luogo illeggibile → tipi vuoti (restano i nemici city)"
metrics:
  duration: "~30 min"
  completed: 2026-11-14
---

# Phase 22 Plan 10: lista dei nemici della missione Summary

L'oste legge con `missionEnemies` i nemici di uno scontro: di default quelli che vivono nei tipi del POI del gruppo o in città (stessa regola `livesIn` di `zonePoolOf`, animali compresi) con `xp` nella fascia del titolo della missione, più i leggendari di zona senza fascia solo per la worldMission; con `showAll` l'intero bestiario. Ordine stabile: `xp`, nome, id.

## Regola applicata

- Regolari: `legendary === false`, `livesIn(enemy, poiTypes)`, `band.min <= xp <= band.max`.
- Leggendari (solo `lane === worldMission`): `legendary === true`, `livesIn(enemy, poiTypes)`, nessun filtro di fascia.
- Zona vuota (unione vuota) → stessa regola con `livesIn || livesAnywhere`.
- `showAll: true` → tutti i documenti `Enemy`, ordinati con `byMissionOrder`.
- Documenti letti con `ENEMY_WIRE_POPULATE` + `withoutOrphanRelatedLore` (tipo `Enemy` invariato).

## Fasce

| Missione | Fascia |
|----------|--------|
| story `paladin` | 70..224 |
| worldMission `paladin` con posti `mage`, `paladin` | 70..548 |
| `legend` | hero (549..803) |
| titolo assente | rookie (1..20) |

## SDL aggiunto (verbatim)

```graphql
  missionEnemies(pendingQuestId: ID!, showAll: Boolean = false): [Enemy!]!
```

`git diff c6079ca3 -- src/schema.gql`: 0 righe tolte.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | aa7d2841 | test(quests): pin the mission enemy list rule |
| 1 GREEN | f479f6c9 | feat(quests): pick the mission enemies by place and rank |
| 2 RED | b3bdf065 | test(gm): pin the mission enemy list on the wire |
| 2 deviazione | 9e18992a | test(authz): count the mission enemy list in the matrix |
| 2 GREEN | c6c2902d | feat(gm): serve the mission enemy list |

## RED attesi

- Task 1: suite rossa per il modulo `./mission-enemy-pool` assente (Cannot find module).
- Task 2: i 5 casi del resolver rossi con `GRAPHQL_VALIDATION_FAILED` (campo assente); `handler-fixtures.spec.ts` rosso su «validates every document against the schema (D-01)».

## Casi verdi al primo colpo

- `adds the mission enemy list to the schema (D-17)` in `test/app.int-spec.ts`: il boot reale della stessa spec rigenera `src/schema.gql` prima che il caso lo legga, quindi in RED non è stato eseguito separatamente (passa col GREEN, 97/97).
- Aggiunto un caso unitario in più, `plays a missing title as rookie (D-19)`.

## Esiti

- unit `src/quests/guided` + `src/quests/generation`: 167/167; unit `handler-fixtures` + guided: 26/26.
- integration `test/app.int-spec.ts` + matrice + resolver guidato: 215/215; `mission-draft.service.int-spec.ts` (DI del modulo): 11/11.
- `npx tsc --noEmit -p tsconfig.json` = 0; prettier ed eslint puliti sui file toccati (un warning preesistente in `test/app.int-spec.ts:1149`, non toccato).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Conteggio delle righe HTTP della matrice**
- **Found during:** Task 2
- **Issue:** `authorization-matrix.int-spec.ts` pinna `httpRows(EXPECTED_INNKEEPER_HANDLERS).toHaveLength(13)`; con la query nuova le righe HTTP dell'oste diventano 14 (fuori dai files_modified, come nel piano 08).
- **Fix:** 13 → 14, commit dedicato.
- **Files modified:** test/authz/authorization-matrix.int-spec.ts
- **Commit:** 9e18992a

## Threat Flags

Nessuna superficie nuova oltre a T-22-25 (mitigata: `@Roles(innkeeper)`, voce nella superficie pinnata, fixture della matrice, caso FORBIDDEN) e T-22-26 (accettata).

## Self-Check: PASSED
