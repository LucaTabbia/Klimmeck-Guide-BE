---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 07
subsystem: gm
tags: [injuries, innkeeper, guided-mission, mission-draft, corrections]
requires:
  - "applyWoundCorrection e innkeeperInjuriesOf (25-01, 25-04)"
  - "ParticipantOverrideInput.injuriesRemoved e la convalida delle rimozioni in validateOverrides (25-06)"
provides:
  - "MissionFightEffectsRecord.injuriesRemoved e MissionFightOutcomeRecord.innkeeperInjuriesBefore sullo schema della bozza"
  - "assertWoundCorrectionAllowed(injuriesBefore, effects) al posto di assertAddsOnlyNewInjuries"
  - "FightStart.innkeeperInjuriesBefore; la sovrapposizione degli scontri porta status.innkeeperInjuries"
  - "handInflictedOf(corrected, simulatedAdded) in innkeeper-injuries.ts"
  - "effectiveParticipantEffectsOf(characterHex, outcome) in draft-invalidation.ts"
affects: [25-08, 25-09, 25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "chiave injuriesRemoved presente solo se non vuota nei due versi della conversione (bozza ↔ motore)"
    - "l'origine di una ferita non si salva nella bozza: si deriva da simulated e corrected"
key-files:
  created: []
  modified:
    - src/quests/guided/mission-draft.model.ts
    - src/quests/guided/fight-state.ts
    - src/quests/guided/fight-state.spec.ts
    - src/quests/guided/draft-invalidation.ts
    - src/quests/guided/draft-invalidation.spec.ts
    - src/quests/guided/guided-outcome.ts
    - src/quests/guided/guided-outcome.spec.ts
    - src/quests/guided/mission-draft-save.service.ts
    - src/quests/guided/mission-draft-save.service.int-spec.ts
    - src/quests/guided/mission-simulation.service.int-spec.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.spec.ts
key-decisions:
  - "il default di schema scrive `injuriesRemoved: []` su ogni effetto salvato (simulato e corretto): i confronti dell'intero record lo ricevono; la chiave resta assente solo negli effetti del motore"
  - "lo stato sovrapposto porta sempre `status.innkeeperInjuries` (lista anche vuota) dopo almeno uno scontro; lo snapshot senza scontri precedenti resta identico a quello letto"
requirements: [BE-WOUND-05, BE-WOUND-06]
metrics:
  tasks: 3
  files: 13
  completed: 2026-11-21
---

# Phase 25 Plan 07: Scontri guidati — rimozioni salvate e origine fra gli scontri Summary

La bozza del flusso guidato salva le ferite che l'oste toglie con una correzione (`corrected.injuriesRemoved`) e ogni scontro parte dallo stato lasciato dal precedente, origine compresa: una ferita tolta al primo scontro non c'è più al secondo, una ferita inflitta a mano conta fra quelle dell'oste (`innkeeperInjuriesBefore`), e l'origine si deriva da `simulated` e `corrected` senza mai salvarla (D-12, D-13, D-16).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 9920139c | test(gm): expect the guided corrections to remove wounds |
| 1 GREEN | da11eef9 | feat(gm): save the wounds removed by a guided correction |
| 2 RED | d59797ec | test(gm): expect wound origins to flow across guided fights |
| 2 GREEN | b0dbbb9a | feat(gm): carry wound origins across guided fights |
| 3 | (questo commit) | docs(phase-25): record plan 07 progress |

## Cosa cambia

- **Predicato a due liste.** `assertWoundCorrectionAllowed(injuriesBefore, effects)` rifiuta la rimozione di una ferita non portata all'inizio dello scontro e l'aggiunta di una ferita ancora portata; tolta e riaggiunta nella stessa correzione è accettata. `assertAddsOnlyNewInjuries` non esiste più; i due chiamanti (`mission-draft-save.service.ts`, `guided-completion.service.ts`) passano gli effetti interi.
- **Rimozioni nella bozza.** `effectsRecordOf` e `participantEffectsOf` portano `injuriesRemoved` solo se non vuota (lettura `?? []`: una bozza di prima si legge senza errori). `correctionOverSimulated` prende le rimozioni dalla sola correzione in arrivo: assente, `null` e `[]` valgono «nessuna rimozione», quindi rimandare la correzione con `[]` annulla una rimozione già salvata e azzera gli scontri successivi.
- **Trappola 1 chiusa.** `sameCorrections` e `effectsKeyOf` **non hanno cambiato riga**: la chiave di confronto cambia perché `participantEffectsOf` ora porta le rimozioni. Caso d'integrazione dedicato: correzione identica a quella salvata tranne `injuriesRemoved` → scritta, scontro 1 tornato non simulato.
- **Origine fra gli scontri.** `afterFight` applica `applyWoundCorrection(state.status, effects)`; `fightStartOf` fotografa `innkeeperInjuriesBefore: innkeeperInjuriesOf(state.status)`. `effectiveParticipantEffectsOf` marca con `handInflictedOf` le ferite di pugno di uno scontro corretto (aggiunte dal corretto e non dal simulato, oppure tolte e riaggiunte; chiave solo se non vuota); `previousEffectsOf` ed `effectiveSequenceOf` passano da lì. `effectiveEffectsOf` resta per chi legge il record grezzo.
- **La simulazione non ha cambiato riga** (`mission-simulation.service.ts` senza diff): `outcomeOf` spalma già `fightStartOf`.
- SDL senza diff; nessuna chiamata a `chance.next(` toccata; nessun handler nuovo.

## Fallimenti RED attesi e osservati

- Task 1: `assertWoundCorrectionAllowed is not a function` (4 casi unit), 2 casi unit sulle conversioni e 2 su `correctionOverSimulated`; in integrazione 7 rossi su 9 (nessun `injuriesRemoved` a DB, correzione di sole rimozioni scartata come invariata, rimozione di una ferita non portata accettata e persa invece che rifiutata). Verdi già al RED, come atteso: «accepts an explicit empty list» e «refuses a correction that adds again a wound still carried» (regola di prima, riscritta sul predicato nuovo).
- Task 2: `handInflictedOf` / `effectiveParticipantEffectsOf is not a function`, `innkeeperInjuriesBefore` assente da `FightStart`, scontro successivo che riparte con la ferita tolta; 16 rossi unit, 4 in integrazione.

## Spec esistenti riscritte o toccate

| Spec | Caso | Motivo |
|------|------|--------|
| `fight-state.spec.ts` | «refuses a correction that adds an injury the character already had (D-14)» → «refuses a correction that adds again a wound still carried (D-16)» | predicato nuovo a due liste (Phase 22 D-14 superata) |
| `mission-draft-save.service.int-spec.ts` | stesso caso (riga 387), spostato nel `describe('wound removals')` | idem |
| `fight-state.spec.ts` | «starts a fight from the corrected state of the previous one (D-02)» | lo stato sovrapposto porta `innkeeperInjuries: []` |
| `fight-state.spec.ts` | «serves the bounds at the start of a fight (D-06, D-17)» | `FightStart.innkeeperInjuriesBefore: []` |
| `draft-invalidation.spec.ts` | «collects the effective effects of the fights before k (D-02)» | la correzione del fixture aggiunge una ferita che il simulato non ha: `innkeeperInjuries: [blackEye]` |
| `mission-simulation.service.int-spec.ts` | «serves the start of the fight and the simulated effects (D-17, D-21)» | record dell'esito: `innkeeperInjuriesBefore: []` e `simulated.injuriesRemoved: []` |
| `mission-draft-save.service.int-spec.ts` | «corrects a fight within the bounds at its start (D-06)», «stores the explicit values of a correction over the simulated ones (A-08)» | `corrected.injuriesRemoved: []` dal default di schema |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Confronti dell'intero record degli effetti rotti dal default di schema**
- **Found during:** Task 1 (GREEN)
- **Issue:** il `default: []` prescritto dal contratto fa scrivere a Mongoose `injuriesRemoved: []` su ogni effetto salvato; tre casi esistenti con `toEqual` sull'intero record (due nel salvataggio, uno nella simulazione, file fuori dall'elenco del Task 1) diventavano rossi.
- **Fix:** le attese ricevono `injuriesRemoved: []`; i casi nuovi leggono la rimozione con `?? []`.
- **Commit:** da11eef9

Nient'altro: il resto del piano è eseguito com'è scritto. Il commento di testa di `guided-completion.service.ts` (riga 82, «D-07, D-14 … ruling W5») è rimasto: in questo piano quel file cambia solo per il nome del predicato (piano 09).

## Verifica

- Unit, intero progetto: 4632 verdi.
- Integrazione `src/quests/guided`: 113 verdi; larga (`src/quests src/gm test/app test/authz`): 1122 verdi.
- `npx tsc --noEmit -p tsconfig.json` esce 0; `git diff --exit-code src/schema.gql` esce 0.
- Grep di accettazione: `applyWoundCorrection(` 1 in `fight-state.ts`; `handInflictedOf(` 1 in `draft-invalidation.ts`; `innkeeperInjuries?` 0 e `innkeeperInjuriesBefore` 1 in `mission-draft.model.ts`; `assertAddsOnlyNewInjuries` 0 in `src`; nessun `chance.next(` nel diff.
- Nessun `npm run build`, nessun riavvio del BE.

## Per i piani successivi

- **08 (bozza sul filo):** a DB `injuriesRemoved` è sempre presente sugli effetti scritti da oggi (`[]` di default) e `undefined` sulle bozze di prima; `innkeeperInjuriesBefore` idem sugli esiti. `MissionFightEffects.innkeeperInjuries` si deriva nel mapper con `effectiveParticipantEffectsOf` / `handInflictedOf`: sul record non c'è.
- **09 (completamento):** `effectiveSequenceOf` porta già `injuriesRemoved` e `innkeeperInjuries` per scontro; `aggregateEffectsOf` unisce ancora le ferite e `overrideInputOf` perde ancora le rimozioni (trappole 2 e 3). La rivalidazione del completamento sovrappone già gli scontri con l'origine.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File modificati presenti e commit 9920139c, da11eef9, d59797ec, b0dbbb9a nel log.
