---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 15
subsystem: quests/guided
tags: [guided, mission-draft, simulation, companion, sdl]
requires: ["23-14"]
provides:
  - "FightStart.companion (FightCompanion) e stato sovrapposto col compagno fra gli scontri della bozza"
  - "MissionCompanion sul filo, MissionFightOutcome.companion, MissionFightEffects.companionLifeAfter"
  - "ResolutionLoader.readPetCatalog() (catalogo dei pet da solo)"
affects: [guided-completion, mission-draft-save, plan 23-16]
tech-stack:
  added: []
  patterns: ["una sola regola del compagno fra scontri in sequenza (companionAssetsAfter della guardia, ora esportata e generica)"]
key-files:
  created: []
  modified:
    - src/quests/guided/fight-state.ts
    - src/quests/guided/fight-state.spec.ts
    - src/quests/guided/mission-draft.model.ts
    - src/quests/guided/mission-draft.wire.ts
    - src/quests/guided/mission-draft.mapper.ts
    - src/quests/guided/mission-draft.mapper.spec.ts
    - src/quests/guided/mission-simulation.service.ts
    - src/quests/guided/mission-simulation.service.int-spec.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/mission-draft-save.service.ts
    - src/quests/guided/mission-draft-save.service.int-spec.ts
    - src/quests/outcomes/guard/guard-outcome.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "`stateBeforeFight(snapshot, previous, petCatalog)` prende il catalogo dei pet: dopo uno scontro la voce del compagno riceve vita E `level` (companionStoredLevelOf), altrimenti una voce legacy tornerebbe piena allo scontro seguente"
  - "La regola è quella della guardia (`companionAssetsAfter`, esportata da guard-outcome.ts e resa generica `<S extends OutcomeCharacterSnapshot>`), non una copia"
  - "I campi nuovi dei record della bozza sono opzionali in TS (`companion?`, `companionLifeAfter?`): le bozze si leggono `lean` e quelle aperte prima del deploy non li hanno"
  - "La simulazione legge il catalogo di combattimento sugli snapshot reali, poi sovrappone: lo stato sovrapposto consuma e non aggiunge riferimenti"
  - "`MissionDraftSaveService` legge il catalogo dei pet con `ResolutionLoader.readPetCatalog()` a ogni salvataggio degli scontri (catalogo piccolo)"
metrics:
  duration: "~50 min"
  completed: 2026-11-14
---

# Phase 23 Plan 15: Flusso guidato, proposta della vita del compagno Summary

Per ogni scontro simulato della missione guidata l'oste riceve, per ogni partecipante, il compagno equipaggiato a inizio scontro (`MissionCompanion { lifeBefore, maxLifePoints, name, pet }`, massimo del suo livello e nome mostrato fotografato) e la vita simulata (`MissionFightEffects.companionLifeAfter`). Lo stato sovrapposto porta la vita lasciata dallo scontro precedente; un compagno arrivato a 1 è fuori dagli scontri seguenti (`companion` null). La simulazione non scrive nulla fuori dalla bozza e non tira sulla `ChanceSource` condivisa.

## Cosa è cambiato

- `fight-state.ts`: `FightCompanion`, `FightStart.companion`; `fightStartOf(state, petCatalog)` (helper privato `fightCompanionOf`: `companionMaxLifeOf` → null = nessun compagno, `companionStoredLifeOf`, `companionDisplayName`); `afterFight` applica `companionAssetsAfter`; `stateBeforeFight(snapshot, previous, petCatalog)`; `effectsRecordOf` scrive `companionLifeAfter` (null senza), `participantEffectsOf` lo omette se null.
- `mission-draft.model.ts`: `MissionCompanionRecord` + schema (pet ref Pet, name, lifeBefore, maxLifePoints required); `MissionFightOutcomeRecord.companion?` e `MissionFightEffectsRecord.companionLifeAfter?` con default null; zero `@Field`.
- `mission-draft.wire.ts` / `mission-draft.mapper.ts`: `MissionCompanion`, campi nuovi, helper `companionOf`; assenti → null.
- `mission-simulation.service.ts`: `draftCharactersOf` → `readCombatCatalog` sugli snapshot reali → `overlaidParticipants(characters, draft, k, catalog.pets)` → `fightRecordOf(..., catalog.pets)`. Nessun riferimento a `this.chance`.
- `guided-completion.service.ts`: `GuidedCatalogs.petCatalog = combat.pets`, passato ad `assertSequenceAllowed`.
- `mission-draft-save.service.ts`: inietta `ResolutionLoader`, `corrected(fights, index, corrections, { characters, petCatalog })` (interfaccia privata `DraftParticipants`).
- `resolution-loader.service.ts`: `readPetCatalog(): Promise<ReadonlyMap<string, CombatPetSnapshot>>`.

## SDL (aggiunte, verbatim dal piano)

`type MissionCompanion { lifeBefore: Int! maxLifePoints: Int! name: String! pet: ID! }`, `companionLifeAfter: Int` in `type MissionFightEffects`, `companion: MissionCompanion` in `type MissionFightOutcome`. Righe tolte vs 2c462cbe: solo quella di `useItem`.

## TDD

- Task 1 RED (8f1cd243): 8 casi di fight-state.spec falliti (firma a 3 argomenti, `companion` assente, `companionLifeAfter` undefined).
- Task 2 RED (aed4c102): mapper.spec 3 falliti, boot reale 1 fallito (blocchi `MissionCompanion`, `MissionFightEffects`, `MissionFightOutcome`). I 3 casi nuovi dell'int-spec della simulazione sono verdi al primo colpo: il Task 1 aveva già collegato `fightStartOf(state, catalog.pets)` e `effectsRecordOf` nella simulazione (file nel Task 1 del piano); i casi pinnano il record salvato.

## Deviations from Plan

1. **[Rule 1 - Bug] Voce legacy piena di nuovo allo scontro seguente** — Found during Task 1. «Altre chiavi invariate» avrebbe lasciato legacy una voce senza `level` né `lifeAsOf`, riletta piena al massimo nello scontro dopo. Fix: `stateBeforeFight` riceve il catalogo e la voce riceve anche `level` (stessa regola della guardia, ora condivisa). Caso aggiunto: «carries a companion never touched by the phase with its level so it is not read full again (D-17, D-23)». Commit e9df7b2f.
2. **[Rule 3 - Blocking] Chiamanti fuori files_modified** — `mission-draft-save.service.ts` (chiamante di `stateBeforeFight`, ora con lettura del catalogo dei pet), `resolution-loader.service.ts` (`readPetCatalog`), `guard-outcome.ts` (export generico), attese con `companion: null` / `companionLifeAfter: null` in `mission-draft-save.service.int-spec.ts` e `mission-simulation.service.int-spec.ts`. Commit e9df7b2f.
3. **Tipo dei record** — `companion?` / `companionLifeAfter?` opzionali invece di obbligatori come nel contratto: riflettono le bozze lette `lean` senza i campi (D-33) ed evitano di toccare le fixture esistenti.
4. Il caso di spec «proposes the companion life...» usa il segnaposto e verifica `companionLifeAfter = max(1, 60 − perdita)` con la perdita letta da `900 − hpAfter` del secondo iscritto (senza pozioni).

## Verifica

- Unit `src/quests/guided` 12 suite / 67 test; + guard 83 nel giro del Task 1.
- Int: mission-simulation + mission-draft.service + boot reale 128/128 (blocchi del boot aggiornati, nessun test nuovo nel boot); tutte le spec di `src/quests/guided` (unit + int) + guard 17 suite / 172; crime-guard-conclusion + companion-defeat-rescue 16/16.
- `tsc` 0; `git diff --exit-code src/schema.gql` pulito; `pgrep -fl 'bin/jest'` vuoto.
- Grep: `companionLifeAfter` in fight-state.ts 4, `companionMaxLifeOf(` 1, `@Field` nel model 0, `D-12, D-26)` 1, `D-17` 6, `this.chance` 0, `D-33)` nel mapper.spec 2. Il grep `Plan: 0K of 18` non combacia (STATE scrive `Plan: 15 of 18`), atteso.

## Threat Flags

Nessuna superficie nuova: i record restano senza `@Field`, il filo resta sulle operazioni innkeeper di Phase 22.

## Self-Check: PASSED
