---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 16
subsystem: quests/guided
tags: [guided, gm-completion, overrides, companion, sdl]
requires: ["23-15"]
provides:
  - "ParticipantOverrideInput.companionLifeAfter: Int (bozza e completePendingRequest)"
  - "OverrideParticipant.companion { lifeBefore, maxLifePoints } e validazione 1..massimo del compagno"
  - "aggregateEffectsOf e overrideInputOf portano companionLifeAfter"
affects: [guided-completion, mission-draft-save, gm-completion, plan 23-17, plan 23-18]
tech-stack:
  added: []
  patterns: ["una sola regola dei limiti del compagno: overrideParticipantOf, riusata da fightStartOf"]
key-files:
  created: []
  modified:
    - src/models/request/complete-pending-request.model.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/quests/outcomes/gm-overrides.spec.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/guided/fight-state.ts
    - src/quests/guided/guided-outcome.ts
    - src/quests/guided/guided-outcome.spec.ts
    - src/quests/guided/mission-draft-save.service.ts
    - src/quests/guided/mission-draft-save.service.int-spec.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "`overrideParticipantOf(snapshot, petCatalog)` ha il catalogo OBBLIGATORIO; massimo del compagno non servibile (pet senza maxLifePoints valido) = `companion: null`, come in companionAfterFight e nel vecchio fightCompanionOf"
  - "`fightStartOf` prende i limiti del compagno da `overrideParticipantOf(...).companion` (una sola regola); aggiunge solo pet e nome mostrato"
  - "`overrideInputOf` porta anche `companionLifeAfter`: al completamento guidato la vita del compagno di ogni scontro è rivalidata sullo stato sovrapposto, come hpAfter"
  - "Completamento legacy: la lettura del catalogo (`readCatalog`) ora precede la prima `validateOverrides` per avere `catalog.pets`; resta prima di ogni scrittura (T-09-74), nessuna lettura in più"
metrics:
  duration: "~45 min"
  completed: 2026-11-14
---

# Phase 23 Plan 16: correzione della vita del compagno e completamento guidato Summary

L'oste corregge la vita del compagno (`companionLifeAfter`, 1..massimo del livello, 1 = sconfitto) nella bozza e nel legacy `completePendingRequest`; il completamento applica `companionAfterFight` con lo slot svuotato e il ritorno datato.

## Task

| Task | Commit | Esito |
|------|--------|-------|
| 1 RED | 1a0953b0 `test(quests): pin the innkeeper correction of the companion life` | 10 casi rossi (limiti, rifiuti, aggregato) |
| 1 GREEN | 7f2a3d44 `feat(quests): validate the companion life corrections` | unit outcomes+guided 51/929 |
| 2 RED | 7f553144 `test(quests): pin the companion correction at completion` | verdi al primo colpo (vedi sotto) |
| 2 GREEN | 7221815a `feat(quests): complete a mission with the corrected companion` | solo `src/schema.gql` rigenerato |
| 3 | commit `docs(phase-23): record plan 16 progress` | bookkeeping |

## Fallimenti RED attesi (Task 1)

- gm-overrides.spec: 9 casi (`companion` assente su OverrideParticipant, `companionLifeAfter` ignorato quindi nessun rifiuto). «leaves the companion life out» verde già allora (chiave non prodotta).
- guided-outcome.spec: «aggregates the companion life of the last fight that had it» (chiave assente nell'aggregato).

## Chiamanti aggiornati

- `gm-completion.service.ts`: entrambe le `validateOverrides` con `catalog.pets` (la prima spostata dopo `readCatalog`).
- `mission-draft-save.service.ts` `corrected`: `overrideParticipantOf(overlay, petCatalog)` (catalogo già letto dal piano 15).
- `guided-completion.service.ts` `assertSequenceAllowed`: `overrideParticipantOf(overlay, petCatalog)`.
- `fight-state.ts` `fightStartOf`: `overrideParticipantOf(state, petCatalog)`; `fightCompanionOf(state, bounds, petCatalog)`; import di `companionMaxLifeOf` / `companionStoredLifeOf` rimossi.

## Wiring (a) e (b): già corretti dopo il Task 1

- (a) `corrected` → `effectsRecordOf(entry)` scriveva già `companionLifeAfter` (piano 15): appena `effectsOf` produce la chiave, la bozza la salva. Provato da «saves the innkeeper correction of the companion life (D-17)».
- (b) `seatOutcomeOf` passa `aggregateEffectsOf(draft.fights, hex)` come `battle` e `completeWith` riceve `petCatalog: combat.pets` (piani 05/15): bastava che l'aggregato portasse la chiave (Task 1). Prova di sensibilità: togliendo a mano `...companionLifeOf(sequence)` i 4 casi Phase 23 di guided-completion.service.int-spec diventano rossi; file ripristinato (diff vuoto).
- Per questo i casi del Task 2 sono verdi al primo colpo e il commit GREEN del Task 2 contiene solo lo SDL.

## Pin SDL

Il pin di `input ParticipantOverrideInput` non è andato RED: il campo era già nel modello dal Task 1 (come ordina il piano) e il boot reale rigenera `src/schema.gql` prima di leggerlo (trappola nota dal piano 11). SDL vs 2c462cbe: solo `+  companionLifeAfter: Int` in questo piano; righe tolte solo useItem.

## Verifiche

- `npx jest src/quests --selectProjects unit`: 87 suite / 1 455 test verdi.
- `npx jest src/quests/guided src/quests/outcomes/gm-completion.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 7 suite / 223 verdi (boot 102/102).
- Non regressione: complete-pending-request.resolver, companion-defeat-rescue, aid-rescue, companion-defeat: 4 suite / 44 verdi.
- `tsc` 0; `git diff --exit-code src/schema.gql` pulito; diff di gm-completion.service.int-spec vs record plan 15: 0 righe tolte.
- `grep "Plan: 0K of 18"` del brief non combacia (si scrive senza zero): atteso.

## Deviations from Plan

None - plan executed exactly as written (salvo il pin SDL non RED, spiegato sopra). Il warning eslint `no-base-to-string` a test/app.int-spec.ts:1232 è preesistente.

## Known Stubs

Nessuno.

## Self-Check: PASSED
