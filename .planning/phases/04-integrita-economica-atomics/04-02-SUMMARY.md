---
phase: 04-integrita-economica-atomics
plan: 02
subsystem: economy
tags: [wallet, atomics, findOneAndUpdate, pipeline-update, transactions, concurrency, tdd]
requires:
  - 04-01 (coins, coins.expressions, GameRuleException)
provides:
  - WalletService.applyCharacterCoinsDelta(characterId, deltaCopper, session?) → CoinPurse normalizzato
  - WalletService.debitUserPoints / creditUserPoints(userId, amount, session?) → nuovo saldo
  - EconomyModule (forFeature Character + User, exports WalletService)
affects: [04-04, 04-05, 04-06, 04-09, Phase 6, Phase 7, Phase 9]
tech-stack:
  added: []
  patterns:
    - "Un solo findOneAndUpdate condizionale per ogni movimento di saldo; null → rilettura in sessione per classificare NOT_FOUND vs INSUFFICIENT_*"
    - "Primitive componibili: session opzionale propagata a update e rilettura (session ?? null)"
key-files:
  created:
    - src/economy/economy.module.ts
    - src/economy/wallet.service.ts
    - src/economy/wallet.service.int-spec.ts
  modified: []
decisions:
  - "userModel iniettato solo al Task 2 (eslint segnalerebbe il campo inutilizzato nel Task 1), come previsto dal plan"
  - "Validazione importi punti (intero sicuro > 0) nel service: $inc accetterebbe 2.5"
  - "Nessun publish nel wallet: userUpdated arriva dal change stream users"
metrics:
  duration: ~10 min
  completed: 2026-10-18
  tasks: 2
  files: 3
---

# Phase 4 Plan 02: WalletService + EconomyModule Summary

`WalletService` è l'unico scrittore dei saldi: i coins del personaggio si muovono con un solo `findOneAndUpdate` (filtro `activeCharacterById` + `hasAtLeastCopper(-delta)` per i debiti, update a pipeline `coinsDeltaStages`) e i `twitchPoints` con un `$inc` condizionale (`$gte`). Entrambi accettano una session opzionale; concorrenza e rollback sono provati sul replica set.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | `applyCharacterCoinsDelta` — debito/credito condizionale dei coins | baa5d6c | 4bfd10a |
| 2 | `debitUserPoints` / `creditUserPoints` — `$inc` condizionale | 6989de0 | 9464bd3 |

Nessun commit REFACTOR necessario.

## RED evidence

- **Task 1:** `npx jest src/economy/wallet.service.int-spec.ts --selectProjects integration --runInBand` → 10 failed / 10. Tutti falliscono con `Error: applyCharacterCoinsDelta: not implemented`. Il plan si aspettava che i casi 8 (RangeError) e 9 (rollback) potessero passare per caso; falliscono anche loro perché lo stub lancia un `Error` generico, non un `RangeError`, e il messaggio non è `'abort'`.
- **Task 2:** stesso comando → 10 failed, 10 passed / 20. I 10 casi nuovi `twitchPoints` falliscono con `debitUserPoints: not implemented` / `creditUserPoints: not implemented`; i 10 casi coins del Task 1 restano verdi.

## Verification (GREEN)

- Task 1 verify: int 10/10, `npx jest src/economy --selectProjects unit` 22/22, `tsc --noEmit -p tsconfig.build.json` ok, eslint pulito sui 3 file.
- Task 2 verify: int 20/20, tsc ok, eslint pulito.
- Plan verification: `npx jest src/economy --selectProjects integration --runInBand` 20/20; `npx jest src/economy src/gameRules --selectProjects unit` 3 suite / 38 test; `git diff --exit-code develop -- src/schema.gql` = 0.
- Acceptance grep: `hasAtLeastCopper(-deltaCopper)` 1, `coinsDeltaStages(deltaCopper)` 1, `.save()` 0, `session ?? null` 2, `exports: [WalletService]` 1, `Promise.allSettled` 2, `'INSUFFICIENT_FUNDS'` 3, `$type: 'int'` 3, `twitchPoints: { $gte: amount }` 1, `$inc: { twitchPoints: -amount }` 1, `publish` 0, `'INSUFFICIENT_POINTS'` 3; spec di 382 righe (≥ 150).
- Concorrenza (SC1): 10 × −30 su 100 rame → 3 riusciti, 7 `INSUFFICIENT_FUNDS`, saldo 10; 4 × −20 su 50 punti → 2 riusciti, 2 `INSUFFICIENT_POINTS`, saldo 10.

## Deviations from Plan

### Auto-fixed Issues

None: plan eseguito come scritto. Note minori:
- Il controllo con grep di `$type: 'int'` va eseguito con `grep -F` (o con apici singoli): dentro i doppi apici la shell trasforma `\$` in `$`, che grep legge come ancora di fine riga e restituisce 0. Il file contiene 3 occorrenze.
- Lo stub RED aveva parametri con prefisso `_` (3 warning eslint `no-unused-vars`, non bloccanti). Sono stati eliminati con l'implementazione GREEN.
- Il caso 7 di Task 2 (`it.each([0, -5, 2.5])`) usa un titolo con `(%p)` per distinguere i tre casi.

## Known Stubs

None.

## Threat Flags

None: nessuna superficie nuova oltre al threat model (nessun resolver, schema invariato).

## Notes for later plans

- I chiamanti devono passare `Types.ObjectId` (path ref `Mixed`, Pitfall 1); l'helper è `objectIdFromHex` (04-01).
- Un delta coins 0 non scrive nulla di diverso e restituisce il saldo (no-op).
- I chiamanti futuri devono calcolare gli importi lato server (T-04-02-03, da riportare in BACKEND-NOTES nel plan 04-09).

## Self-Check: PASSED
