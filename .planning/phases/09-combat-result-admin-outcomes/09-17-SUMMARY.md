---
phase: 09-combat-result-admin-outcomes
plan: 17
subsystem: quest-outcomes
tags: [combat, boss, aid, user-decisions, docs]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-04, 09-05, 09-12, 09-13, 09-15, 09-16)
    provides: porta CombatResolver e resolver segnaposto, piano dell'esito, risoluzione standard/boss/soccorso, override del GM, handoff di fase
provides:
  - CombatResolver.resolve restituisce CombatResolution { verdict, participants: ParticipantEffects[] } (un verdetto per combattimento, A3)
  - resolver segnaposto con un solo tiro di vittoria per combattimento
  - ScriptedCombatResolver.willEnd(verdict) per i test
  - C5 marcata confermata dall'utente nel codice e nei documenti; A2 dichiarata provvisoria
affects: [09-18 (aid di gruppo unica per il boss perso), BE Phase 10, resolver di combattimento dell'utente]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verdetto del combattimento separato dagli effetti per partecipante: l'esito misto di un gruppo non è rappresentabile nel tipo"

key-files:
  created:
    - .planning/phases/09-combat-result-admin-outcomes/09-17-SUMMARY.md
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/quests/outcomes/gm-overrides.spec.ts
    - src/quests/outcomes/quest-outcome-plan.ts
    - src/quests/outcomes/quest-outcome-plan.spec.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/boss-resolution.service.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
    - src/quests/outcomes/aid/aid-timeout.ts
    - test/quests/scripted-combat-resolver.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-CONTEXT.md
    - .planning/phases/09-combat-result-admin-outcomes/09-RESEARCH.md
    - .planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VALIDATION.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VERIFICATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "A3 corretta dall'utente: un combattimento ha un solo verdetto condiviso; HP, ferite, consumi, magie e loot restano per partecipante"
  - "battleOf restituisce CombatantBattle { verdict, effects } (null solo senza combattimento): un partecipante assente dalla risoluzione eredita comunque il verdetto del gruppo"
  - "C5 confermata: la sospensione del timeout con un soccorritore registrato equivale alla cancellazione; nessun cambiamento di codice oltre ai commenti"
  - "A2 resta provvisoria: i valori segnaposto (§11) li definirà l'utente"
  - "La aid unica di gruppo per il boss perso (stessi posti del boss) è rimandata al piano 09-18: a fine 09-17 il codice crea ancora una aid per partecipante"

patterns-established: []

requirements-completed: [BE-COMBAT-03]

# Metrics
duration: 35min
completed: 2026-10-25
---

# Phase 9 Plan 17: verdetto unico del combattimento (A3), C5 confermata Summary

**Ora `CombatResolver` restituisce `CombatResolution { verdict, participants: ParticipantEffects[] }`: il gruppo vince o perde insieme, mentre HP, ferite, consumi e loot restano per partecipante. Il resolver segnaposto tira la vittoria una volta per combattimento. Nei documenti sono registrate le decisioni dell'utente del 2026-10-25: A3 corretta, C5 confermata, A2 provvisoria e la aid di gruppo rimandata a 09-18.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-25T12:27:03Z
- **Completed:** 2026-10-25
- **Tasks:** 2
- **Files modified:** 26 (19 di codice/test, 7 documenti) + questo SUMMARY

## Accomplishments

- Porta ridisegnata: `ParticipantOutcome` sparisce (nessun alias), al suo posto `ParticipantEffects` (senza `outcome`) e `CombatResolution` con un solo `verdict`.
- `PlaceholderCombatResolver`: `victory = chance.next() < winChance` una sola volta, prima del map sui partecipanti; `resolveParticipant` riceve `victory` e calcola solo danni, ferite e pozioni.
- `combatant-plan.ts`: `CombatantBattle` e `battleOf(resolution | null, characterId)`; `planCombatant` legge il verdetto da `battle?.verdict` e passa a `planParticipant` solo gli effetti.
- Boss: una sola `combat.resolve` per il gruppo, verdetto dalla `CombatResolution`; vinto → concluso per tutti con premi e senza aid; perso → posti liberati e (per ora) una aid per partecipante.
- `gm-overrides.ts`: `outcomeOf` → `effectsOf`, mappa `ParticipantEffects | null`; `quest-outcome-plan.ts`: `someoneWon` → `won` con il commento della regola dell'utente.
- C5: commenti di `AID_TIMEOUT_REQUIRES_NO_RESCUER` e di `timeoutAid` marcati "confermata dall'utente il 2026-10-25"; `grep -rn "da confermare" src` vuoto.
- Documenti di fase, ROADMAP (17/17) e STATE allineati alle decisioni dell'utente.

## Task Commits

1. **Task 1 RED:** `49373f6` test(outcomes): share one combat verdict across the party
2. **Task 1 GREEN:** `10e65fd` feat(outcomes): resolve a fight with one verdict for the party
3. **Task 2:** `5fbc44d` docs(phase-9): record the user decisions on A3, C5 and placeholders

Non serviva un REFACTOR.

## Gate (Task 1)

- `npm run test:unit`: **121 suite / 1776 test** passati
- `npm run test:int`: **72 suite / 915 test** passati (foreground, `--runInBand`; il flaky del boot reale non si è presentato)
- `npm run build`: exit 0
- `git diff --exit-code src/schema.gql`: pulito (la porta è interna)
- `grep -rn "ParticipantOutcome" src test` vuoto; `grep -rn "da confermare" src` vuoto; `grep -c "chance.next() < "` sul segnaposto = 1, fuori da `resolveParticipant`; 2 test `(A3)`; 1 `willEnd(` nel fake

## Deviations from Plan

### Istruzione dell'orchestratore durante l'esecuzione

**1. Aid di gruppo per il boss perso (decisione dell'utente del 2026-10-25, piano 09-18)**
- **Found during:** Task 2, prima di toccare i documenti
- **Issue:** l'utente ha deciso: "Non deve comparire una missione aid per ogni personaggio, ma solo una missione aid. Le missioni aid per le missioni boss andate male devono accettare lo stesso numero di partecipanti della missione boss". Il piano 09-17 descriveva ancora "una aid per ciascun partecipante" come regola.
- **Fix:** il Task 1 è rimasto come da piano (il test "leaves the boss open when the party loses, one aid each" resta). Nei documenti (CONTEXT D-05 e header, RESEARCH Open Q 13, BACKEND-NOTES §5/§6/§16, VALIDATION Manual-Only, VERIFICATION, STATE) il boss perso libera tutti i posti, e la forma della aid di gruppo (una sola aid con gli stessi posti del boss) è indicata come in arrivo con 09-18. In §16 è stato aggiunto il punto aperto "09-18 — una sola aid di gruppo per il boss perso, posti = posti del boss". D-08/D-09 sono invariati.
- **Commit:** `5fbc44d`

### Scelte minori

- `quest-outcome-plan.spec.ts`: il titolo "concludes a boss with one winner and frees the losers" ora è "concludes a registered quest when the fight is won and frees any loser". Le attese non cambiano.
- `gm-overrides.spec.ts`: le variabili `outcomes` sono state rinominate `effects` (Boy Scout, in scope).
- BACKEND-NOTES: nel campo "Stato" ora ci sono i conteggi del gate di 09-17, e il titolo delle deviazioni dice "09-01..09-15 e 09-17".

Nessun'altra deviazione: il piano è stato eseguito come scritto.

## Known Stubs

Nessuno nuovo. Il resolver di combattimento e le tabelle restano segnaposto per scelta dell'utente (A2, BACKEND-NOTES §11).

## Next Phase Readiness

- Piano 09-18: una sola aid di gruppo per il boss perso, con posti = posti del boss.
- Dopo il push dell'orchestratore, la PR #13 riceve i tre commit di 09-17 più questo SUMMARY.

## Self-Check: PASSED
