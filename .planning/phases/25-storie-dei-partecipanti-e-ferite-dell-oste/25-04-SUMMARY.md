---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 04
subsystem: quests
tags: [injuries, innkeeper, correction, outcome-plan, cure]
requires:
  - "innkeeperInjuriesOf(status) (25-01)"
  - "cureInjuries(injuries, canHeal, untouchable) (25-02)"
provides:
  - "applyWoundCorrection(status, effects): correzione pura in due passi (toglie, poi aggiunge con origine)"
  - "ParticipantEffects.injuriesRemoved? e ParticipantEffects.innkeeperInjuries? (opzionali, il motore non li valorizza)"
  - "planParticipant: correzione, cura che salta le ferite dell'oste, 'status.innkeeperInjuries' scritto solo se cambia"
  - "QuestResultDraft.injuriesRemoved (sempre valorizzato da planParticipant)"
affects: [25-05, 25-06, 25-07, 25-09]
tech-stack:
  added: []
  patterns:
    - "la cura riceve l'origine calcolata DOPO la correzione, mai quella dello snapshot"
    - "chiave del $set in spread condizionale: si scrive solo se la lista finale differisce da quella letta"
key-files:
  created: []
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
key-decisions:
  - "il confronto «l'origine è cambiata» si fa con la lista normalizzata da innkeeperInjuriesOf: una lista sporca a DB (doppioni, tipi non portati) non viene ripulita da un esito senza correzioni"
  - "un segno «a mano» su una ferita non aggiunta in questo esito è ignorato: l'origine nasce solo dalle ferite davvero aggiunte"
requirements: [BE-WOUND-02, BE-WOUND-04, BE-WOUND-05]
metrics:
  tasks: 3
  files: 6
  completed: 2026-11-21
---

# Phase 25 Plan 04: Correzione pura delle ferite e piano d'esito Summary

`applyWoundCorrection` applica la correzione dell'oste in due passi (toglie dalle ferite e dall'origine, poi aggiunge le sole ferite non più presenti marcando quelle inflitte a mano) e `planParticipant` la usa al posto di `woundsAfter`, passando alla cura l'origine risultante: nessuna cura dello stesso esito raggiunge una ferita dell'oste, nemmeno quella appena inflitta (D-12, D-13, D-14, D-16).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 4d4e15db | test(quests): expect a pure correction of the wounds |
| 1 GREEN | 30337719 | feat(quests): apply a wound correction as a pure function |
| 2 RED | 7ccf8583 | test(quests): expect the outcome plan to respect innkeeper wounds |
| 2 GREEN | 1c1a4982 | feat(quests): keep innkeeper wounds out of the outcome cure |
| 3 | (questo commit) | docs(phase-25): record plan 04 progress |

## Firma finale

```typescript
// src/quests/outcomes/injuries/innkeeper-injuries.ts
export type WoundEffects = Pick<
    ParticipantEffects,
    'injuriesAdded' | 'injuriesRemoved' | 'innkeeperInjuries'
>;
export interface CorrectedWounds {
    injuries: InjuryType[];
    innkeeperInjuries: InjuryType[];
    added: InjuryType[]; // tipi assenti prima e presenti dopo
    removed: InjuryType[]; // tipi presenti prima e assenti dopo
}
export function applyWoundCorrection(
    status: WoundStatus,
    effects: WoundEffects | null,
): CorrectedWounds;
```

Algoritmo come da piano. Le stringhe legacy dentro `status.injuries` restano dove sono; i tipi sconosciuti nelle rimozioni e nelle aggiunte sono ignorati. Import di solo tipo da `combat-resolver` (nessun ciclo a runtime).

## Cosa è stato fatto

- `combat-resolver.ts`: i due campi opzionali di `ParticipantEffects`, nient'altro.
- `innkeeper-injuries.ts`: `WoundEffects`, `CorrectedWounds`, `applyWoundCorrection` e tre piccole funzioni locali (`carriedWoundsOf`, `knownTypesOf`, `without`).
- `outcome-plan.ts`: `status.innkeeperInjuries?` nello snapshot, `injuriesRemoved?` in `QuestResultDraft`, calcolo `fought`/`cured` con i nomi vincolanti, predicato locale `sameWounds`, spread condizionale di `'status.innkeeperInjuries'`, `injuriesRemoved: fought.removed` sul foglio. `woundsAfter` senza diff e ancora esportata.
- Nessun cambio allo SDL, nessun `chance.next(` toccato; `unrewarded-plan.ts`, `guard/`, `src/travel` senza diff.

## Fallimenti RED attesi e osservati

- Task 1: 22 rossi su 30, tutti `TypeError: applyWoundCorrection is not a function`. Il fallimento di compilazione atteso dal piano non si vede: jest qui non controlla i tipi (già annotato ai piani 02 e 03); il commit RED non passa `tsc` né eslint sulla spec, entrambi 0 al GREEN.
- Task 2 unit: 9 rossi su 169, tutti asserzioni: i due «always fills the removed wounds», «drafts the result sheet» (manca `injuriesRemoved`), «drops a removed innkeeper wound», «heals the ordinary wounds beside an innkeeper one», i due «leaves … to the cure of the prize», «removes a wound taken off», «reports nothing for a wound removed and added again».
- Task 2 int: 1 rosso su 47, `keeps an innkeeper wound through the cure of a won quest (D-11, D-14)` (la cura toglieva la ferita dell'oste).

Verdi al primo colpo (non regressione): `still heals an ordinary wound added in the same outcome (D-14)` e i tre `writes the origin list only when it changes (D-16)`.

## Casi esistenti toccati

- Per `injuriesRemoved` sul foglio: un solo caso, `planParticipant › a won quest without a fight › drafts the result sheet` (`outcome-plan.spec.ts`), che riceve `injuriesRemoved: []`. Nessun'altra spec del repo confronta l'intero foglio di `planParticipant` (l'intero progetto unit è verde senza altre modifiche).
- Per il set: nessun caso esistente è cambiato. In particolare `never writes the potion recovery from an outcome (D-16)`, che confronta tutte le chiavi del `$set`, resta verde senza modifiche.

## Test eseguiti

- `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts --selectProjects unit`: 30/30.
- `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/unrewarded-plan.spec.ts src/quests/outcomes/injuries src/quests/guided --selectProjects unit`: 17 suite, 408/408.
- `npx jest --selectProjects unit` (tutto il progetto unit): 312 suite, 4594/4594.
- `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand --forceExit`: 2 suite, 47/47.
- `npx jest src/quests src/gm --selectProjects integration --runInBand --forceExit` (non regressione): 47 suite, 861/861.
- `npx tsc --noEmit -p tsconfig.json`: 0. `git diff --exit-code src/schema.gql`: pulito. `pgrep -fl 'bin/jest'`: vuoto. Prettier ed eslint puliti sui sei file.

## Deviations from Plan

Nessuna sulla sostanza. Note:

- Il RED fallisce a runtime e per asserzioni, non per compilazione (vedi sopra).
- Un caso in più nella spec della correzione: `ignores an unknown wound type among the additions (D-12)`.
- La corsa d'integrazione larga su `src/quests` e `src/gm` è finita in background per il limite di tempo dello strumento (una sola copia, terminata da sé; nessun processo jest rimasto).

## Threat model

- T-25-09 (mitigate): la cura riceve `fought.innkeeperInjuries`; caso `leaves a wound inflicted by hand in this same outcome to the cure of the prize (D-14)`.
- T-25-10 (mitigate): rimozione dalle due liste nella stessa funzione; sei casi `keeps the innkeeper list inside the carried wounds (D-16)`.
- T-25-11 (mitigate): spread condizionale; tre casi sulle chiavi del set; piani automatici senza diff.

## Per i piani successivi

- `QuestResultDraft.injuriesRemoved` esiste solo sulla bozza: lo schema Mongoose e lo SDL di `QuestResult` arrivano col piano 05 (oggi il campo cade alla scrittura).
- Nessuno valorizza ancora `battle.injuriesRemoved` / `battle.innkeeperInjuries`: lo fanno i piani 06 (flusso semplice) e 09 (guidato). Le due chiavi vanno messe sugli effetti solo se non vuote.
- Un segno «a mano» conta solo sulle ferite davvero aggiunte nell'esito (assenti dopo le rimozioni): per trasformare una ferita normale già portata in ferita dell'oste bisogna toglierla e riaggiungerla nella stessa correzione.
- Un esito senza correzioni non ripulisce un `status.innkeeperInjuries` sporco a DB: il confronto è sulla lista normalizzata.

## Self-Check: PASSED

- File modificati presenti; commit 4d4e15db, 30337719, 7ccf8583 e 1c1a4982 in `git log`.
