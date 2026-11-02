---
phase: 12-negozi-per-citta
plan: 04
subsystem: gameRules/trade
tags: [gameRules, trade, pets, errors, BE-SHOP-03, BE-SHOP-06, D-19]
requires: ["12-03"]
provides:
  - "GameRuleErrorCode.ITEM_NOT_IN_SHOP, PET_ALREADY_OWNED, PET_NOT_OWNED (in coda all'enum)"
  - "GameRuleException.itemNotInShop(), petAlreadyOwned(), petNotOwned() con messaggi italiani statici"
affects: [12-15, 12-16, 12-17]
tech-stack:
  added: []
  patterns:
    - "un codice di rifiuto nuovo = voce dell'enum + factory statica + caso in `cases` della spec di completezza"
key-files:
  created: []
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
decisions:
  - "Nessuna decisione nuova: codici, messaggi e commenti come prescritti dal piano (D-19)"
metrics:
  duration: "~3 min"
  completed: 2026-11-02
  tasks: 1
  files: 3
---

# Phase 12 Plan 04: codici di rifiuto del negozio e dei pet Summary

`GameRuleErrorCode` riceve `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED` e `PET_NOT_OWNED` (D-19), ciascuno prodotto da una factory di `GameRuleException` con un messaggio italiano statico senza id, prezzi né contenuto del pool (T-12-06); il test di completezza li copre.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | tre casi in `cases` + test dedicato D-19 | `3e7f61f` test(trade): pin the shop and pet refusal codes |
| 1 GREEN | enum + tre factory | `cb89bee` feat(trade): add the shop pool and pet refusal codes |

## Fallimenti RED osservati

- 5 rossi su 35 in `game-rule.exception.spec.ts`: i tre casi `itemNotInShop`/`petAlreadyOwned`/`petNotOwned` di `it.each`, `covers every GameRuleErrorCode exactly once` e `refuses a purchase outside the city pool with ITEM_NOT_IN_SHOP (D-19)`, tutti con `TypeError: GameRuleException.itemNotInShop is not a function` (e analoghi). In RED `tsc` falliva sulle factory e sulle voci dell'enum assenti, risolto dal GREEN.

## Nomi e firme

- `src/gameRules/game-rule-error-code.enum.ts`: `ITEM_NOT_IN_SHOP = 'ITEM_NOT_IN_SHOP'`, `PET_ALREADY_OWNED = 'PET_ALREADY_OWNED'`, `PET_NOT_OWNED = 'PET_NOT_OWNED'` dopo `QUEST_NOT_WAITING`
- `src/gameRules/game-rule.exception.ts`, in coda alla classe:
  - `static itemNotInShop(): GameRuleException` → `'Questo oggetto non è in vendita in questa città'` (D-05, D-19)
  - `static petAlreadyOwned(): GameRuleException` → `'Possiedi già questo compagno'` (D-14)
  - `static petNotOwned(): GameRuleException` → `'Compagno non posseduto'` (D-15)
- Tutte 400 `BadRequestException` con `extensions = { code }`

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0
- unit: `src/gameRules/game-rule.exception.spec.ts` 35/35
- prettier + eslint sui tre file, uno per uno: puliti (i tre file erano già conformi prima del RED)
- `git diff --exit-code src/schema.gql` → 0; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → 0 (i codici non sono nello SDL)
- Nessun altro `Record<GameRuleErrorCode, …>` né `Object.values(GameRuleErrorCode)` nel codice da aggiornare

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit `3e7f61f`, `cb89bee` presenti in `git log`; nessun file creato oltre a questo SUMMARY.
