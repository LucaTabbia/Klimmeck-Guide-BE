---
phase: 04-integrita-economica-atomics
plan: 01
subsystem: economy
tags: [errors, coins, mongo-expressions, spell-slots, object-id, tdd]
requires: []
provides:
  - GameRuleErrorCode (15 codici D-15) + GameRuleException (factory statiche, extensions.code)
  - ResourceNotFoundException.quest()
  - modulo puro coins (toCopper, fromCopper, normalize, add, subtract, compare, CoinPurse)
  - TOTAL_COPPER_EXPRESSION, hasAtLeastCopper, coinsDeltaStages ($toInt/$ifNull)
  - ACTIVE_SPELL_SLOT_THRESHOLDS, maxActiveSpellsFor, maxActiveSpellsExpression ($switch)
  - objectIdFromHex
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09]
tech-stack:
  added: []
  patterns:
    - "Eccezione di dominio BadRequestException con code + extensions.code, portata sul wire da formatDomainError invariato"
    - "Rame totale come unità unica; update pipeline $set con $toInt per denominazione"
    - "Tabella soglie unica condivisa tra virtual Mongoose ed espressione aggregation"
key-files:
  created:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/economy/coins.ts
    - src/economy/coins.spec.ts
    - src/economy/coins.expressions.ts
    - src/economy/coins.expressions.spec.ts
    - src/models/character/active-spell-slots.ts
    - src/models/character/active-spell-slots.spec.ts
  modified:
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
    - src/graphql/format-domain-error.spec.ts
    - src/models/character/character-status.model.ts
    - src/mongo/document-id.ts
    - src/mongo/document-id.spec.ts
decisions:
  - "GameRuleErrorCode resta un enum TypeScript puro (nessun registerEnumType): schema.gql byte-identico"
  - "coinsDeltaStages tipizzato UpdateWithAggregationPipeline (tsc lo accetta, fallback PipelineStage.Set[] non necessario)"
  - "Limite $toInt: 2 147 483 647 rame per personaggio (A3), accettato per il v1.0"
metrics:
  duration: ~15 min
  completed: 2026-10-18
  tasks: 3
  files: 15
---

# Phase 4 Plan 01: Fondamenta pure (errori, coins, slot magie, id) Summary

15 codici di rifiuto di gioco tipizzati (`GameRuleException`, 400 + `extensions.code`) portati sul wire dal `formatDomainError` invariato, modulo puro `coins` in rame totale con espressioni Mongo `$ifNull`/`$toInt`, tabella unica delle soglie `maxActiveSpells` condivisa da virtual e `$switch`, e `objectIdFromHex` per gli id del client.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | Contratto d'errore di gioco + `ResourceNotFoundException.quest()` | d4c2bb9 | 20210a8 |
| 2 | Modulo puro coins + espressioni Mongo del rame totale | 4b3471b | 3aa487a |
| 3 | Tabella condivisa maxActiveSpells + objectIdFromHex | c9b54f1 | ea0edea |

Nessun commit REFACTOR necessario.

## RED evidence

- **Task 1:** `npx jest src/gameRules src/authz/resource-not-found src/graphql/format-domain-error --selectProjects unit` → 3 suite FAIL: `Could not locate module src/gameRules/game-rule.exception` (game-rule.exception.spec, format-domain-error.spec) e `TypeError: ResourceNotFoundException.quest is not a function` (resource-not-found.exception.spec).
- **Task 2:** `npx jest src/economy --selectProjects unit` → 2 suite FAIL: `Could not locate module src/economy/coins` / `src/economy/coins.expressions`.
- **Task 3:** `npx jest src/models/character/active-spell-slots src/mongo/document-id --selectProjects unit` → 2 suite FAIL: `Could not locate module src/models/character/active-spell-slots` e `objectIdFromHex is not a function` (7 failed, 11 passed).

## Verification (GREEN)

- Task 1 verify: 36/36 test, eslint pulito; `format-domain-error.ts` invariato (`git diff --quiet` = 0).
- Task 2 verify: 22/22 test, `tsc --noEmit -p tsconfig.build.json` ok, eslint pulito; `$toInt` = 3, `$ifNull` = 3, nessun import Nest/Mongoose in `coins.ts`, `src/utils.ts` conservato.
- Task 3 verify: `npx jest src/models src/mongo --selectProjects unit` 79/79, tsc ok, eslint pulito; nessuna riga `@Prop` cambiata rispetto a `develop`.
- Plan verification: `npx jest src/gameRules src/economy src/models src/mongo src/authz src/graphql --selectProjects unit` → 20 suite, 221 test verdi; suite unit completa 49 suite / 552 test verdi; `git diff --exit-code develop -- src/schema.gql` = 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance] Commento con `$toInt` in coins.expressions.ts**
- **Found during:** Task 2
- **Issue:** il commento del plan ("$toInt su ogni denominazione") portava `grep -c "\$toInt"` a 4 invece del 3 richiesto.
- **Fix:** commento riformulato in "cast a int su ogni denominazione" (commit GREEN emendato prima di proseguire).
- **Commit:** 3aa487a

**2. [Boy Scout] Pulizia di character-status.model.ts**
- **Found during:** Task 3
- **Issue:** import `Float` inutilizzato (warning eslint) e riga vuota finale non conforme a prettier, entrambi preesistenti.
- **Fix:** rimosso `Float` dall'import, prettier applicato (unico diff: la riga vuota finale). Nessun `@Prop`/`@Field` toccato.
- **Commit:** ea0edea

**3. [Adattamento minore] Import con alias `src/`**
- `coins.expressions.ts` importa da `src/economy/coins` (convenzione del repo) invece di `./coins`; `character-status.model.ts` usa `./active-spell-slots` come i suoi import relativi esistenti.

## Known Stubs

None.

## Notes for later plans

- `src/utils.ts` (`normalizeCoins`) resta fino al plan 04-08.
- `ResourceNotFoundException.activeSpell()` resta fino al plan 04-03.
- Limite `$toInt` (A3): oltre 2 147 483 647 rame totali la conversione fallisce lato Mongo.

## Self-Check: PASSED
