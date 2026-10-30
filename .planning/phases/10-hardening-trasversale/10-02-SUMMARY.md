---
phase: 10-hardening-trasversale
plan: 02
subsystem: quests/outcomes
tags: [gm-completion, standard-lane, quest-in-progress, BE-HARD-08]
requires:
  - "10-01: PendingRequestCharacter.pendingQuest e coda del GM"
provides:
  - "STANDARD_LANE_FREE e isStandardLaneBusy in src/quests/acceptance/quest-lanes.ts"
  - "GameRuleException.participantQuestInProgress() (QUEST_IN_PROGRESS, messaggio del completamento)"
  - "participantFilter con la corsia standard libera solo per le corsie del GM"
  - "GmCompletionService: pre-check, ricontrollo in sessione, riclassificazione del perdente"
affects: [10-07, 10-08, 10-21, 10-22, 10-23, 10-30]
tech-stack:
  added: []
  patterns:
    - "predicato di filtro condiviso più gemello in memoria nello stesso modulo"
    - "gara simulata con una spia su ResolutionLoader.readCatalog che scrive col driver grezzo e poi delega all'originale"
key-files:
  created:
    - .planning/phases/10-hardening-trasversale/10-02-SUMMARY.md
  modified:
    - src/quests/acceptance/quest-lanes.ts
    - src/quests/acceptance/quest-lanes.spec.ts
    - src/travel/travel.updates.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts
decisions:
  - "Factory dedicata participantQuestInProgress con lo stesso codice QUEST_IN_PROGRESS e un messaggio di completamento (C21): questInProgress resta il messaggio del viaggio"
  - "Il caso della factory nuova vive in un it dedicato fuori dalla tabella cases di game-rule.exception.spec.ts: la tabella verifica che ogni codice compaia una sola volta"
  - "OutcomeCharacterSnapshot.quests dichiara anche pendingQuest (la proiezione legge già tutto quests): serve al type check del pre-check e del ricontrollo"
metrics:
  duration: "~10 min"
  completed: 2026-10-29
  tasks: 3
  files: 10
---

# Phase 10 Plan 02: rifiuto del completamento del GM con la corsia standard occupata Summary

`completePendingRequest` risponde `QUEST_IN_PROGRESS` («Il personaggio è impegnato in una missione in corso») senza scritture quando un partecipante attivo ha la corsia standard occupata, con tre difese (pre-check sugli snapshot letti, ricontrollo sullo snapshot in sessione, corsia standard libera nel filtro di scrittura delle sole corsie del GM) e un solo predicato `STANDARD_LANE_FREE` condiviso con teleport e avvio del viaggio (D-24).

## Commit

| Task | Commit | Tipo | Descrizione |
|------|--------|------|-------------|
| 1 RED | 3f54b8c | test | predicato condiviso, gemello in memoria e factory attesi |
| 1 GREEN | fe42ccd | refactor | `STANDARD_LANE_FREE`, `isStandardLaneBusy`, `participantQuestInProgress`; teleport e viaggio usano il predicato |
| 2 RED | 9dbd384 | test | rifiuto nel service, nel filtro di scrittura e sul filo |
| 3 GREEN | 243626f | feat | pre-check, ricontrollo in sessione, filtro del GM, riclassificazione del perdente |

## TDD

**Task 1 RED (3f54b8c):** 8 casi rossi su 55 — `requires the standard lane to be free with one shared predicate (D-24)` (import inesistente), i 4 casi della corsia libera, i 2 casi `treats the standard lane as busy only when it points to a pending quest (D-23)` e `refuses the completion of a busy participant with QUEST_IN_PROGRESS (D-24)` (`participantQuestInProgress is not a function`). GREEN: unit `quest-lanes.spec.ts` + `src/gameRules` + `src/travel` 7 suite / 119 test; integration `src/travel` 6 suite / 102 test, spec di travel non toccate.

**Task 2 RED (9dbd384):**
- unit: `requires a free standard lane in the write filter of the game master lanes only (D-24)` rosso (manca la chiave della corsia standard nel filtro della story), 41 verdi.
- integration (23 test): rossi `refuses a story whose holder has the standard lane busy and writes nothing`, `refuses a world mission when one active participant has the standard lane busy`, `answers QUEST_IN_PROGRESS before an invalid override` (riceveva `OUTCOME_OVERRIDE_INVALID`), `refuses with QUEST_IN_PROGRESS when a standard acceptance lands between the read and the write`, e sul filo `audits a completion refused for a busy participant with QUEST_IN_PROGRESS (D-24)` (la mutation completava).
- **Verde al primo colpo:** `completes a story whose holder only travels between cities` — il codice di oggi non guarda il viaggio (D-23: il viaggio libero non blocca), il caso fissa che il nuovo rifiuto non lo cambi.

**Task 3 GREEN (243626f):** unit `src/quests/outcomes` + `src/quests/acceptance` 23 suite / 511 test; integration `src/quests/outcomes` + `src/quests/pending-requests` 12 suite / 119 test; verifica di piano completa: unit `src/quests/outcomes src/quests/acceptance src/gameRules src/travel` 29 suite / 606 test, integration `src/travel` 6 / 102; `npm run build` esce 0; `git diff --exit-code src/schema.gql` esce 0 dopo ogni commit (schema identico, nessuna riga rimossa contro `origin/develop`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test obsoleto] Caso esistente della story del GM contrario a D-24**
- **Trovato durante:** Task 3
- **Problema:** `guards and empties the story lane` (outcome-plan.spec.ts) asseriva l'assenza della chiave della corsia standard nel filtro della story: la regola pre-D-24.
- **Fix:** l'asserzione sul filtro diventa `toEqual` sull'oggetto intero con la corsia standard libera (regola del repo: assenza e presenza si provano sull'oggetto intero); l'asserzione sull'update resta invariata. Entrato nel commit GREEN invece che nel RED perché emerso solo eseguendo l'intera suite.
- **Commit:** 243626f

**2. [Rule 1 - Bug nel test RED] Conteggio della spia azzerato da `mockRestore`**
- **Trovato durante:** Task 3
- **Problema:** il caso della gara verificava `toHaveBeenCalledTimes(1)` dopo `mockRestore()`, che azzera le chiamate registrate.
- **Fix:** contatore locale `acceptances` incrementato dall'implementazione della spia.
- **Commit:** 243626f

**3. [Rule 3 - Bloccante] Tipo di `OutcomeCharacterSnapshot.quests`**
- **Trovato durante:** Task 3 (`npm run build`, TS2345 weak type)
- **Fix:** il tipo dichiara anche `pendingQuest?: unknown` (la proiezione legge già l'intero `quests`); nessun cambio di runtime.
- **Commit:** 243626f

**4. Nessuna modifica alla tabella `cases` di game-rule.exception.spec.ts:** la factory nuova riusa un codice esistente e il caso `covers every GameRuleErrorCode exactly once` fallirebbe; il behavior del piano è coperto da un `it` dedicato.

## Note per i piani successivi

- Il ramo «perdente con la corsia occupata» di `lostCompletionError` non ha un caso di integrazione dedicato: in pratica un'accettazione concorrente dopo lo snapshot in sessione produce un WriteConflict e il retry incontra il ricontrollo; il filtro è provato dalla unit di `planParticipant`.
- La nota datata nel §9 del handoff della Phase 9 e la riga dell'ordine dei codici nel handoff FE restano al piano 10-30.

## Known Stubs

Nessuno.

## Self-Check: PASSED
