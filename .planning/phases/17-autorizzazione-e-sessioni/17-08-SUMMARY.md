---
phase: 17-autorizzazione-e-sessioni
plan: 08
subsystem: test (matrice di autorizzazione)
tags: [authz, test, real-boot, matrix, BE-SESSION-01, D-01, C-1, HARDEN-02]
requires: ["17-07"]
provides:
  - "`test/authz/matrix-victims.ts`: `createMatrixWorld(boot)`, `MatrixWorld`, `MatrixBearers`, `NOT_A_JWT_BEARER`, `foreignSecretBearer()`"
  - "`test/authz/authorization-matrix.int-spec.ts`: matrice table-driven sul boot reale (85 casi), evidenza di HARDEN-02"
affects: [17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Righe della matrice derivate solo dalle liste enumerate (`httpRows`/`wsRows` filtrano `HANDLER_FIXTURES[h].kind`), `it.each` con oggetti e titoli `$role`/`$handler`"
    - "Un helper di rifiuto per trasporto: `expectRejected(handler, bearer, { code })` su HTTP, `expectSubscriptionForbidden(handler, bearer)` su WS con `dispose()` nel `finally`"
key-files:
  created:
    - test/authz/matrix-victims.ts
    - test/authz/authorization-matrix.int-spec.ts
  modified: []
decisions:
  - "Il controllo sul `data` del rifiuto guarda il campo dell'handler (`data?.[field] ?? null`), non l'intero `data`: un campo nullable torna come `{ field: null }`"
  - "La PendingQuest della vittima è agganciata al suo personaggio (`quests.pendingQuest`), così la vittima ne è davvero proprietaria"
  - "L'esenzione auditata dell'innkeeper sugli altri 11 handler ownership (Phase 3 D-09) non è asserita dalla matrice, per scelta: la matrice prova solo i rifiuti"
metrics:
  duration: "~25 min"
  completed: 2026-11-09
  tasks: 3
  files: 2
---

# Phase 17 Plan 08: matrice di autorizzazione Summary

Un solo int-spec sul boot reale di `AppModule` (`bootRealApp({ dbName: 'authorization-matrix', listen: true })`), alimentato dalle tre liste enumerate e dalle 30 fixture, prova `FORBIDDEN` per ruolo e per proprietà su HTTP e WS, `UNAUTHENTICATED` sugli handler innkeeper senza bearer valido e la chiusura `4403 Forbidden` alla `connection_init`; attaccanti con sessioni vere (`issueForUser`) e vittime vere (personaggio attivo, PendingQuest, QuestResult). SDL invariato.

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | mondo della matrice e righe HTTP | f142481 | `test/authz/matrix-victims.ts`, `test/authz/authorization-matrix.int-spec.ts` |
| 2 | righe WS (subscription) | a603cda | `test/authz/authorization-matrix.int-spec.ts` |
| 3 | bookkeeping | (questo commit) | ROADMAP, STATE, VALIDATION, SUMMARY |

## Casi per gruppo (85 totali, ~4,6 s)

| Gruppo | Casi |
|--------|------|
| innkeeper HTTP × `adventurer`/`guard` → `FORBIDDEN` | 20 (10 handler × 2) |
| innkeeper HTTP × bearer assente / non JWT / altro secret → `UNAUTHENTICATED` | 30 (10 × 3) |
| ownership HTTP, `adventurer` sulla vittima → `FORBIDDEN` | 17 |
| owner-only HTTP, `innkeeper` sulla vittima → `FORBIDDEN` | 7 |
| innkeeper WS (`pendingRequestsUpdated`) × `adventurer`/`guard` → `FORBIDDEN` alla subscribe | 2 |
| innkeeper WS, bearer assente / non JWT → `{ code: 4403, reason: 'Forbidden', acknowledged: false }` (C-1) | 2 |
| ownership WS (`characterUpdated`, `questResultReceived`), `adventurer` → `FORBIDDEN` | 2 |
| owner-only WS (`questResultReceived`), `innkeeper` → `FORBIDDEN` | 1 |
| completezza (chiavi = liste unite; 10/17/7 righe HTTP, 3 subscription) | 2 |
| controlli positivi (proprietario legge il suo personaggio; innkeeper legge `users`) | 2 |

## Fallimenti RED osservati

Nessun rosso di autorizzazione: le regole provate esistono dalle Phase 3/7 e i casi sono verdi al primo colpo (la spec stessa non esisteva prima del task 1). I controlli positivi provano che fixture e bearer sono validi, e ogni rifiuto è un `toEqual` sull'intero `extensions` con un solo errore per risposta (Pitfall 10), quindi un `GRAPHQL_VALIDATION_FAILED`, `NOT_FOUND` o `BAD_USER_INPUT` farebbe fallire la riga. Nessuna fixture corretta.

## Deviazioni dal piano

- **[Rule 1 - minore] controllo del `data` sul campo, non sull'intero `data`.** Il piano chiede `data ?? null` nullo; per un campo nullable GraphQL risponde `{ field: null }`. Asserzione scritta come `data?.[field] ?? null` nullo (stessa intenzione, robusta per entrambe le forme).
- **STATE**: scritto `Plan: 8 of 10` (formato del file, come da brief); il verify del task 3 che cerca `Plan: 08 of 10` non trova riscontro.

## Osservazioni (fuori scope)

- `bootRealApp().close()` esegue `dropDatabase` prima di `app.close()`: ogni change stream logga una volta `chiusura inattesa: riapertura n. 1` (8 righe ERROR a fine suite). Succede identico in `test/app.int-spec.ts` (preesistente dal piano 07); i test restano verdi.

## Gate

- `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`: 85/85.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 79/79.
- Wave: `npx jest src/auth test/auth test/authz --selectProjects unit` 27 suite / 273 test; `--selectProjects integration --runInBand` 17 suite / 304 test (~29 s).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier `--check` ed eslint puliti sui due file.
- `git diff origin/develop -- src/schema.gql` vuoto.

## Self-Check: PASSED

- `test/authz/matrix-victims.ts`, `test/authz/authorization-matrix.int-spec.ts` presenti; commit f142481 e a603cda nel log.
