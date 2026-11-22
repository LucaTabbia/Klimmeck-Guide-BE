---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 01
subsystem: characters
tags: [injuries, innkeeper, graphql, sdl, mongoose]
requires: []
provides:
  - "innkeeperInjuriesOf(status): unica lettura dell'origine delle ferite"
  - "CharacterStatus.innkeeperInjuries: [InjuryType!]! su schema Mongoose e SDL"
affects: [25-02, 25-03, 25-04, 25-06, 25-07, 25-09]
tech-stack:
  added: []
  patterns:
    - "campo additivo con default lista vuota, letto tollerante da una sola funzione"
key-files:
  created:
    - src/quests/outcomes/injuries/innkeeper-injuries.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.spec.ts
  modified:
    - src/models/character/character-status.model.ts
    - src/schema.gql
    - src/characters/characters-ownership.int-spec.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - test/app.int-spec.ts
key-decisions:
  - "innkeeperInjuriesOf conserva l'ordine della lista dell'oste, non quello di injuries"
requirements: [BE-WOUND-01]
metrics:
  tasks: 3
  files: 7
  completed: 2026-11-21
---

# Phase 25 Plan 01: Origine delle ferite sul personaggio e sul filo Summary

`status.innkeeperInjuries` accanto a `status.injuries` (D-15, D-16): campo additivo con default lista vuota, servito da `character(id)` e da `characterUpdated`, letto nel dominio dalla sola `innkeeperInjuriesOf`.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | ed57f97b | test(quests): expect a normalised read of the innkeeper wounds |
| 1 GREEN | 89a57ab0 | feat(quests): read the innkeeper wounds of a character |
| 2 RED | 6ccdef95 | test(characters): expect the innkeeper wounds on the wire |
| 2 GREEN | 1dbc71af | feat(characters): serve the innkeeper wounds of a character |
| 3 | (questo commit) | docs(phase-25): record plan 01 progress |

## Cosa è stato fatto

- `src/quests/outcomes/injuries/innkeeper-injuries.ts`: `WoundStatus` e `innkeeperInjuriesOf(status)`. Lista dell'oste senza doppioni, soli tipi noti (`isInjuryType`), soli tipi presenti in `status.injuries`; campo assente o `null` = lista vuota; ordine della lista dell'oste; nessuna mutazione degli input. Nessun'altra funzione in questo piano.
- `CharacterStatus.innkeeperInjuries` subito dopo `injuries`, stessi decoratori (`@Field(() => [InjuryType])`, `@Prop` con enum e `default: []`), nessun `@ResolveField`.
- `CharacterStatusInput` NON è cambiato: nessun input porta il campo (T-25-01; `grep -c innkeeperInjuries src/schema.gql` = 1).
- SDL rigenerato dal boot reale di test: una sola riga aggiunta, nessuna tolta rispetto a `e87339bb`:
  `+  innkeeperInjuries: [InjuryType!]!` in `type CharacterStatus`. `test/authz/expected-handlers.ts` senza diff.

## Fallimenti RED attesi e osservati

- Task 1: atteso modulo inesistente; osservato `Cannot find module 'src/quests/outcomes/injuries/innkeeper-injuries'` (suite non avviata, 0 test).
- Task 2: 6 casi rossi, 193 verdi.
  - i tre casi di `characters-ownership.int-spec.ts` e quello della subscription: `Cannot query field "innkeeperInjuries" on type "CharacterStatus"`;
  - i due usi di `CHARACTER_STATUS_BLOCK` in `test/app.int-spec.ts`: blocco pinnato senza la riga nuova.

## Casi verdi al primo colpo

Nessuno al RED. Il caso della subscription («publishes the character when only the origin of a wound changes (D-15)») era rosso solo perché il campo non era interrogabile; col campo sullo schema è diventato verde senza toccare il publisher, che ascolta il change stream del personaggio (regola dura 8: provato, non riscritto). Lo stesso vale per il personaggio scritto senza il campo: basta il default dello schema sui documenti idratati (T-25-02).

## Test eseguiti

- `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts --selectProjects unit`: 8/8 verdi.
- `npx jest src/characters/characters-ownership.int-spec.ts src/characters/character-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand --forceExit`: 3 suite, 199/199 verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0.
- `git diff --exit-code src/schema.gql` dopo il commit: pulito.

## Deviations from Plan

Nessuna sulla sostanza. Note:

- Il piano cita `HEAD e87339bb`; l'esecuzione è partita da `cb0c2e99` (soli commit di documenti in mezzo). La base dei diff resta `e87339bb`.
- Le integration sono state lanciate con `--forceExit` (ammesso dal brief).
- `npx eslint test/app.int-spec.ts` segnala un warning preesistente alla riga 1282 (`no-base-to-string`), fuori scope: non toccato.
- Nessun `npm run build`, nessun avvio del BE, nessun accesso al DB reale.

## Per i piani seguenti

- Leggere l'origine sempre con `innkeeperInjuriesOf(status)`; sui documenti letti `lean` il campo grezzo è `undefined`.
- Le altre funzioni del modulo (`applyWoundCorrection`, `asInnkeeperHand`, `handInflictedOf`, `netWoundCorrectionOf`) arrivano nei piani 04, 06, 07, 09 e vanno nello stesso file e nella stessa spec.
- Semina di una ferita dell'oste nei test d'integrazione: `characters.collection.updateOne(..., { $set: { 'status.injuries': [...], 'status.innkeeperInjuries': [...] } })`.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit ed57f97b, 89a57ab0, 6ccdef95, 1dbc71af presenti in `git log`.
