---
phase: 04-integrita-economica-atomics
plan: 08
subsystem: economy
tags: [trade, shop, wire, concurrency, graphql, cleanup, tdd]
requires:
  - 04-05 (CharactersService senza altri read-modify-write)
  - 04-06 (ShopTransactionService.execute, EconomyModule, fixture di catalogo)
provides:
  - "CharactersResolver.doTransaction → ShopTransactionService.execute (stessa firma, stesso @OwnsCharacter)"
  - "CharactersModule e createCharactersTestApp importano EconomyModule"
  - "src/economy/trade/do-transaction.int-spec.ts: codici stabili e SC2 sul wire"
  - "CharactersService senza doTransaction né save(); src/utils.ts cancellato"
affects: [04-09 (BACKEND-NOTES / requirements BE-ATOM-02)]
tech-stack:
  added: []
  patterns:
    - "Il resolver resta l'unico punto di ownership e delega lo scambio al modulo economy (SoC)"
key-files:
  created:
    - src/economy/trade/do-transaction.int-spec.ts
  modified:
    - src/characters/characters.resolver.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - src/characters/characters-ownership.int-spec.ts
    - src/characters/archived-character-visibility.int-spec.ts
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
  deleted:
    - src/utils.ts
decisions:
  - "I fixture doTransaction di ownership/archived diventano uno scambio vuoto a totale zero (A2): resta una no-op valida per il proprietario, quindi i casi di guard restano significativi"
  - "La copertura 'archiviato → NOT_FOUND' di doTransaction passa dallo unit test al wire (archived-character-visibility + do-transaction int-spec)"
metrics:
  duration: ~12 min
  completed: 2026-10-18
  tasks: 2
  files: 9
---

# Phase 4 Plan 08: doTransaction sul wire Summary

`doTransaction` ora passa da `ShopTransactionService.execute`. Il contratto GraphQL è identico: stesso nome, stessi argomenti, `CommonResponse` e `@OwnsCharacter`. Cambia ciò che succede sotto: i prezzi vengono dal catalogo, inventario e coins si scrivono in un'unica transazione e gli errori portano codici stabili in `extensions.code`. `CharactersModule` e l'harness `createCharactersTestApp` importano `EconomyModule`. Il vecchio read-modify-write è stato rimosso: non ci sono più `CharactersService.doTransaction`, `normalizeCoins` né `src/utils.ts`, e in `CharactersService` non resta nessun `save()`. `src/schema.gql` è byte-identico a `develop`.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | doTransaction sul wire tramite ShopTransactionService | 66ddecd | 99cf9a8 |
| 2 | Rimozione di CharactersService.doTransaction, normalizeCoins, src/utils.ts | 7c2698b | 7d03898 (refactor) |

## RED evidence

- **Task 1:** `npx jest src/economy/trade/do-transaction.int-spec.ts --selectProjects integration --runInBand` dà 8 failed / 10. Il resolver chiamava ancora il vecchio `CharactersService.doTransaction`, che usava il totale del client, quindi tutte e 7 le righe di rifiuto rispondevano `{ successful: true }` (nessun codice). Il caso concorrente ha avuto 5 vincitori su 5 (`Expected length: 1, Received length: 5`). Erano già verdi sul vecchio codice "buys at catalog prices" (il totale del client coincideva col catalogo) e "empty zero-total no-op".
- **Task 2:** `npx jest src/characters/characters.service.spec.ts --selectProjects unit` dà 1 failed / 17, `no longer exposes doTransaction on CharactersService` (`Received: [Function doTransaction]`).

## Verification (GREEN)

- Task 1: `npx jest src/economy src/characters src/authz test/app.int-spec.ts --selectProjects integration --runInBand` dà 20 suite / 267 passed. `git diff --exit-code src/schema.gql` = 0. eslint pulito sui 6 file.
- Task 2:
  - `npx jest src test --selectProjects unit`: 54 suite / 625 passed.
  - `npx jest src/characters src/economy src/authz src/quests test/app.int-spec.ts --selectProjects integration --runInBand`: 21 suite / 277 passed.
  - `npm run build` ok; `git diff --exit-code src/schema.gql` = 0.
  - eslint: 0 errori. Gli 11 warning già esistenti stanno nel codice del change stream di `onModuleInit`, che non è stato toccato.
- Regressione completa: `npx jest --selectProjects integration --runInBand` dà 41 suite / 472 passed. Include ownership, archived-visibility, `character-updated.subscription`, audit, economy e quests.
- **SC2 sul wire:** 5 `doTransaction` concorrenti, con lo stesso bearer, comprano la spada (150 rame) con coins `{0,1,50}`. Risultato: esattamente 1 `successful: true` e 4 `INSUFFICIENT_FUNDS`. Coins grezzi `{0,0,0}`, `ownedEquipments` = spada ×1.
- Codici sul wire: ognuna delle 7 righe ha `extensions` esattamente `{ code }` (niente `stacktrace`), il messaggio costante atteso e il documento grezzo `toEqual(before)`.
- Acceptance grep:
  - `this.shopTransactions.execute(request)`: 1
  - `@OwnsCharacter<{ request: TransactionRequest }>`: 1
  - `EconomyModule` nel modulo e nell'harness: 2 righe ciascuno
  - `silver: 1, copper: 0 },` nelle due suite: vuoto
  - `isTotalPositive: false`: 1 per suite
  - `INTRUDER_MUTATION`: invariata rispetto a `develop`
  - `test -f src/utils.ts`: exit 1
  - `normalizeCoins` in `src` e `test`: vuoto
  - `\.save()` in service e processor: vuoto; `grep -c "\.save("` = 0
  - `doTransaction` nel service: vuoto
  - spec di 351 righe (≥ 120)
  - `git diff --exit-code develop -- src/schema.gql` = 0
  - trailer `Co-Authored-By`: 0

## Deviations from Plan

None nel comportamento. Nota di forma: lo spec sul wire raggruppa le 7 righe di rifiuto in una tabella `REJECTIONS` tipizzata, in cui ogni riga costruisce coins, inventario e request partendo dal catalogo creato nel `beforeEach`. Il caso di successo e il no-op verificano in più che `errors` sia `undefined`.

## Known Stubs

None.

## Threat Flags

None. Nessun resolver né tipo GraphQL nuovo e schema invariato. T-04-08-01..04 e 06 sono mitigati e provati dalle righe `TRANSACTION_TOTAL_MISMATCH`, dal caso concorrente, dalle suite ownership/boot verdi, dalle `extensions` esatte e dai grep `.save()`/`normalizeCoins` vuoti. T-04-08-05 è accettato (audit invariato).

## Self-Check: PASSED

- FOUND: src/economy/trade/do-transaction.int-spec.ts; src/utils.ts assente (atteso)
- FOUND commits: 66ddecd, 99cf9a8, 7c2698b, 7d03898
