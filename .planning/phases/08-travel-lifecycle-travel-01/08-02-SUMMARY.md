---
phase: 08-travel-lifecycle-travel-01
plan: 02
subsystem: gameRules
tags: [travel, quests, capacity, error-codes, pure]
requires: []
provides:
  - "GameRuleErrorCode QUEST_IN_PROGRESS, TRAVEL_IN_PROGRESS, TRAVEL_SAME_LOCATION, TRAVEL_DESTINATION_NOT_ALLOWED, TRAVEL_NO_PATH + factory omonime"
  - "ResourceNotFoundException.pointOfInterest() 'Luogo non trovato'"
  - "refIdOf condiviso in src/mongo/document-id.ts"
  - "src/quests/acceptance/quest-capacity.ts: slotsOf, slotRuleOf, hasSeatFor, isFullForEveryone, seatAvailableExpr (D-32)"
affects: [08-05, 08-06, 08-08]
tech-stack:
  added: []
  patterns:
    - "regola pura + specchio $expr generato dalla stessa SlotRule, asserito per forma esatta"
key-files:
  created:
    - src/quests/acceptance/quest-capacity.ts
    - src/quests/acceptance/quest-capacity.spec.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
    - src/mongo/document-id.ts
    - src/mongo/document-id.spec.ts
key-decisions:
  - "Messaggi D-19: TRAVEL_IN_PROGRESS 'Sei già in viaggio', TRAVEL_SAME_LOCATION 'Sei già in questo luogo', TRAVEL_DESTINATION_NOT_ALLOWED 'Puoi viaggiare solo verso una città', TRAVEL_NO_PATH 'Nessuna strada porta a questa meta', QUEST_IN_PROGRESS 'Non puoi muoverti durante una missione in corso'"
  - "Capienza D-32 in modulo puro: slot esatti prima dei jolly, overflow = Σ max(0, reg(U) − exact(U)); slotsOf fail-closed su forme assenti/vuote/numeriche/invalid; titoli registrati sconosciuti non contano"
metrics:
  duration: 3 min
  completed: 2026-10-21
  tasks: 2
  files: 9
---

# Phase 8 Plan 02: Codici del viaggio, refIdOf e capienza per rango Summary

Primitive pure della Phase 8 senza consumatori: cinque codici di rifiuto con messaggi italiani fissi (D-19), il NOT_FOUND `Luogo non trovato`, l'helper `refIdOf` condiviso e il modulo `quest-capacity.ts` con l'algoritmo D-32 (caso canonico FE nominato nella spec) e il suo specchio `$expr` per il filtro di registrazione.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Codici del viaggio, NOT_FOUND del luogo, refIdOf condiviso | 4309bca (RED), 5c52eed (GREEN) |
| 2 | Modulo puro della capienza per rango (D-32) con specchio $expr | 49199e3 (RED), 03fd522 (GREEN) |

## TDD evidence

**Task 1 RED** (`4309bca`): `npx jest src/gameRules src/authz/resource-not-found.exception.spec.ts src/mongo/document-id.spec.ts --selectProjects unit` → 3 suite fallite, 15 failed / 50 passed: le 5 nuove righe della tabella `GameRuleException` (factory inesistenti), 'covers every GameRuleErrorCode exactly once' (codici non in enum), `pointOfInterest` e gli 8 casi `refIdOf` (`is not a function`).

**Task 1 GREEN** (`5c52eed`): stesso comando 65/65, `npm run build` ok, `git diff --exit-code src/schema.gql` 0, eslint pulito sui 7 file.

**Task 2 RED** (`49199e3`): `npx jest src/quests/acceptance/quest-capacity.spec.ts --selectProjects unit` → 36 failed / 36 (`not implemented` dello stub tipizzato).

**Task 2 GREEN** (`03fd522`): 36/36, build ok, schema.gql invariato, eslint pulito. Verifica di piano: `npx jest src/gameRules src/authz src/mongo src/quests/acceptance/quest-capacity.spec.ts --selectProjects unit` → 12 suite / 207 test verdi.

## Deviations from Plan

None - plan executed exactly as written. (Nella spec del Task 2 la regola del describe `isFullForEveryone` è costruita dentro i test e non a livello di describe, così il RED fallisce per test anziché in fase di raccolta; nessun impatto sul comportamento specificato.)

La copia privata di `refIdOf` in `quest-acceptance.service.ts` resta: la rimuove 08-06 come da piano.

## Threat model

- T-08-07: messaggi fissi senza parametri (tabella `game-rule.exception.spec.ts`).
- T-08-08: `seatAvailableExpr` generato dalla stessa `SlotRule` di `hasSeatFor`, asserito per forma esatta; prova di concorrenza in 08-06.
- T-08-09: `slotsOf` → `'invalid'` per assenti, vuoti, numerici legacy, titolo sconosciuto, count non intero sicuro ≥ 1; un solo slot invalido invalida la lista.
- T-08-10: `refIdOf` delega a `objectIdFromHex` (maiuscolo → null, testato).

## Known Stubs

None.

## Self-Check: PASSED
