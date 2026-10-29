---
phase: 10-hardening-trasversale
plan: 09
subsystem: validation
tags: [validation, authz, ObjectIdPipe, BAD_USER_INPUT, D-02, C1, BE-HARD-01]
requires:
  - "10-05: BadUserInputException.of(fields), ObjectIdPipe (campo = metadata.data)"
  - "10-08: ValidationModule montato in app e harness; codici già spostati dalla pipe sugli input"
provides:
  - "CharacterAccessPolicy: i tre rami !isObjectIdHex lanciano BadUserInputException.of(['id'])"
  - "ObjectIdPipe su quest(id), questUpdated(questId), user(id), getPath(from, to)"
  - "src/validation/scalar-ids.int-spec.ts: getPath malformato sul filo e ordine UNAUTHENTICATED → pipe"
affects: [10-10, 10-12, 10-30]
tech-stack:
  added: []
  patterns:
    - "le guard girano prima delle pipe: un id posseduto malformato è rifiutato dalla policy con lo stesso codice BAD_USER_INPUT della pipe"
key-files:
  created:
    - src/validation/scalar-ids.int-spec.ts
  modified:
    - src/authz/ownership/character-access.policy.ts
    - src/authz/ownership/character-access.policy.spec.ts
    - src/authz/ownership/quest-result-access.int-spec.ts
    - src/characters/characters-ownership.int-spec.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - src/quests/results/acknowledge-quest-result.int-spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - src/pendingQuests/pending-quests-authz.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
    - src/quests/quests.resolver.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/quests/quest-updated.subscription.int-spec.ts
    - src/users/users.resolver.ts
    - src/users/users-authz.int-spec.ts
    - src/roads/roads.resolver.ts
key-decisions:
  - "La policy riporta sempre il campo `id` (nome dell'argomento o del campo dell'input), anche per PendingQuest e risultato"
  - "Il commento C1 sta solo sul primo dei tre rami, per non duplicarlo"
  - "questResult(id) malformato passa da NOT_FOUND a BAD_USER_INPUT (riga non elencata dal piano, trovata dalla regressione mirata)"
requirements-completed: []
duration: ~25 min
completed: 2026-10-29
---

# Phase 10 Plan 09: Id posseduti e scalari malformati → BAD_USER_INPUT Summary

**I tre rami dell'id malformato di `CharacterAccessPolicy` (personaggio, PendingQuest, risultato) lanciano `BadUserInputException.of(['id'])` invece di `NOT_FOUND`; `quest`, `questUpdated`, `user` e `getPath` validano i loro id con `ObjectIdPipe`. `UNAUTHENTICATED` e `FORBIDDEN` restano prima della validazione; un id ben formato ma inesistente resta `NOT_FOUND`.**

## Performance

- **Durata:** ~25 min
- **Completato:** 2026-10-29
- **Task:** 2 (RED + GREEN), più un commit RED aggiuntivo per una riga trovata dalla regressione
- **File:** 1 creato, 16 modificati

## Accomplishments

- D-02 a piena fedeltà sugli id posseduti (C1): la guard decide prima della pipe, quindi il codice si sposta nella policy, prima di ogni lettura (nessuna lettura del DB per un id malformato, provato dalle spie del modello).
- Argomenti scalari non di catalogo validati con il nome dell'argomento nel messaggio (`Input non valido: questId`, `from`, `to`, `id`).
- 9.2 BACKEND-NOTES §10 punto 4 risolto: `acknowledgeQuestResult(id)` malformato risponde `BAD_USER_INPUT` senza leggere il DB (la nota nei handoff spetta al piano 10-30).
- SDL invariato: le pipe sugli `@Args` non cambiano lo schema.

## Task Commits

1. **Task 1 (RED): id malformati posseduti e scalari** — `0b4b32a` (test)
2. **RED aggiuntivo (regressione): `questResult(id)`** — `9ff7f32` (test)
3. **Task 2 (GREEN): policy e pipe scalari** — `cea324d` (feat)

## Fallimenti RED osservati

- Unit `character-access.policy.spec.ts`: 9 rossi su 44 (ricevuto `NOT_FOUND`): i due casi nuovi `answers BAD_USER_INPUT for a malformed character, pending quest or result id: %s (D-02, C1)` (`abc`, `64B000000000000000000001`) e i 7 casi esistenti del malformato riscritti con l'atteso nuovo.
- Integration: 17 rossi su 169 in 11 suite, tutti `NOT_FOUND` ricevuto al posto di `BAD_USER_INPUT`, salvo `getPath` (ricevuto `INTERNAL_SERVER_ERROR` con il messaggio di cast di Mongoose: l'id malformato arrivava fino al DB e ne trapelava il dettaglio, T-10-29).
- Verdi al primo colpo (ordine guard → pipe già garantito dalle guard globali): `forbids an adventurer before validating the id` (`users-authz`), `answers UNAUTHENTICATED before validating a malformed id` (`scalar-ids`), e le righe dell'id inesistente separate dai casi misti.
- RED aggiuntivo: `quest-result.resolver.int-spec.ts` › `answers BAD_USER_INPUT for a malformed id (D-02, C1)` 1 rosso su 11 (ricevuto `NOT_FOUND`), osservato con il codice di produzione temporaneamente accantonato (`git stash` dei soli quattro file del GREEN, poi ripristinato).

## Codici spostati sul filo (prima → dopo)

| Operazione | Argomento | Prima | Dopo | Messaggio | Spec / caso |
|---|---|---|---|---|---|
| `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`, `character`, `equipment` | id del personaggio | `NOT_FOUND` | `BAD_USER_INPUT` (avventuriero e innkeeper) | `Input non valido: id` | `characters-ownership.int-spec.ts` › `$name answers BAD_USER_INPUT for a malformed id (D-02, C1)` |
| `characterUpdated` | id del personaggio | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | `character-updated.subscription.int-spec.ts` › `rejects a missing id with NOT_FOUND and a malformed one with BAD_USER_INPUT (D-02)` |
| `acceptQuest` | `id` dell'input | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | `accept-quest.resolver.int-spec.ts` › `rejects a malformed character id with BAD_USER_INPUT` |
| `startTravel` / `travelPreview` | `id` dell'input | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | `travel.resolver.int-spec.ts` › `rejects a malformed character id with BAD_USER_INPUT and writes nothing` |
| `pendingQuest` | `id` | `NOT_FOUND` | `BAD_USER_INPUT` (avventuriero e innkeeper) | `Input non valido: id` | `pending-quests-authz.int-spec.ts` › `answers BAD_USER_INPUT for a malformed pending quest id (D-02, C1)` |
| `questResult` | `id` | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | `quest-result.resolver.int-spec.ts` › `answers BAD_USER_INPUT for a malformed id (D-02, C1)` |
| `acknowledgeQuestResult` | `id` | `NOT_FOUND` | `BAD_USER_INPUT`, nessuna lettura | `Input non valido: id` | `acknowledge-quest-result.int-spec.ts` › `answers BAD_USER_INPUT for a malformed id without reading the database (D-02)` |
| `quest` | `id` | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | `quests.resolver.int-spec.ts` › `answers BAD_USER_INPUT for a malformed quest id (D-02)` |
| `questUpdated` | `questId` | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: questId` | `quest-updated.subscription.int-spec.ts` › `answers BAD_USER_INPUT for a malformed quest id (D-02)` |
| `user` (innkeeper) | `id` | `NOT_FOUND` | `BAD_USER_INPUT`; avventuriero `FORBIDDEN` prima | `Input non valido: id` | `users-authz.int-spec.ts` › `answers BAD_USER_INPUT for a malformed id (D-02)`, `forbids an adventurer before validating the id` |
| `getPath` | `from` / `to` | `INTERNAL_SERVER_ERROR` (cast di Mongoose) | `BAD_USER_INPUT` | `Input non valido: from` / `to` | `scalar-ids.int-spec.ts` › `rejects malformed path endpoints with BAD_USER_INPUT (D-02)` |
| livello service | i tre metodi della policy | `NOT_FOUND` | `BAD_USER_INPUT` | `Input non valido: id` | `quest-result-access.int-spec.ts` › `reports a malformed id as bad input (D-02)`; `character-access.policy.spec.ts` |

Restano `NOT_FOUND`: ogni id ben formato inesistente (righe separate nelle stesse spec).

## Test

- Unit `src/authz`: 8 suite / 94 test verdi.
- Integration `src/authz src/characters src/quests src/users src/travel src/pendingQuests src/roads src/validation test/app.int-spec.ts`: 61 suite / 855 test verdi (boot reale incluso).
- `npm run build` 0; `git diff --exit-code src/schema.gql` 0; contro `origin/develop` lo SDL aggiunge solo `+  pendingQuest: ID` e non rimuove nulla.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Codice spostato non previsto] `questResult(id)` malformato**
- **Found during:** Task 2 (spec mirate del GREEN)
- **Issue:** `quest-result.resolver.int-spec.ts` attendeva `NOT_FOUND` per `not-an-id` in un `it.each` misto con l'id inesistente; il file non era elencato dal piano.
- **Fix:** riga separata in `answers NOT_FOUND for an unknown id` e `answers BAD_USER_INPUT for a malformed id (D-02, C1)`, rosso osservato e committato prima del GREEN.
- **Files modified:** src/quests/results/quest-result.resolver.int-spec.ts
- **Commit:** 9ff7f32

**2. Righe miste separate, non cancellate**
- `pending-quests-authz.int-spec.ts`: l'`it.each([MISSING, 'abc'])` del `NOT_FOUND` diventa il caso dell'id inesistente più il caso nuovo del malformato (avventuriero e innkeeper).
- `quests.resolver.int-spec.ts`: il ciclo `[MISSING_QUEST_ID, 'abc']` è separato allo stesso modo.
- `quest-updated.subscription.int-spec.ts`: `expectNotFound` delega al nuovo helper `expectRejectedWith(subscription, code)` che restituisce il messaggio.
- `character-access.policy.spec.ts`: oltre al caso nuovo del piano, i tre gruppi esistenti del malformato (con le varianti di ruolo e `aaaaaaaaaaaa`) attendono ora `BAD_USER_INPUT`.

**3. `getPath` prima del piano rispondeva `INTERNAL_SERVER_ERROR` con il messaggio di cast di Mongoose** (non `NOT_FOUND`): annotato nella tabella; la pipe chiude anche questa fuga di dettaglio (T-10-29).

## Issues Encountered

Nessuno oltre alle deviazioni.

## Next Phase Readiness

- 10-10 applica `ObjectIdPipe` agli argomenti del catalogo con lo stesso schema (`@Args('<nome>', ObjectIdPipe)`).
- 10-30 trova qui la tabella dei codici spostati della policy e degli scalari per i handoff (incluso il punto 4 della 9.2 §10).

## Self-Check: PASSED

- Commit `0b4b32a`, `9ff7f32`, `cea324d` presenti; `src/validation/scalar-ids.int-spec.ts` esiste; `grep -c "BadUserInputException.of(\['id'\])"` sulla policy = 3.
