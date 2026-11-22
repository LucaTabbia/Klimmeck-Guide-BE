---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 03
subsystem: quests
tags: [injuries, innkeeper, heal, no-effect, acceptance]
requires:
  - "innkeeperInjuriesOf(status) (25-01)"
  - "cureInjuries(injuries, canHeal, untouchable) (25-02)"
provides:
  - "HealSubject.innkeeperInjuries (chiave obbligatoria, valore tollerante)"
  - "healHasNoEffect che ignora le ferite dell'oste: QUEST_NO_EFFECT e Quest.noEffect con lo stesso predicato"
affects: [25-04, 25-13]
tech-stack:
  added: []
  patterns:
    - "il predicato legge l'origine con innkeeperInjuriesOf: i chiamanti passano il campo grezzo, nessuno filtra per conto suo"
key-files:
  created: []
  modified:
    - src/quests/outcomes/injuries/heal-no-effect.ts
    - src/quests/outcomes/injuries/heal-no-effect.spec.ts
    - src/quests/no-effect/viewer-vitals.service.ts
    - src/quests/no-effect/viewer-vitals.service.spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/quests.resolver.int-spec.ts
key-decisions:
  - "i due chiamanti passano status.innkeeperInjuries come letto (anche undefined/null): la normalizzazione vive solo in innkeeperInjuriesOf dentro il predicato"
requirements: [BE-WOUND-03]
metrics:
  tasks: 2
  files: 7
  completed: 2026-11-21
---

# Phase 25 Plan 03: «Senza effetto» ignora le ferite dell'oste Summary

`HealSubject` porta la chiave obbligatoria `innkeeperInjuries` e `healHasNoEffect` la passa a `cureInjuries` come lista intoccabile (`innkeeperInjuriesOf(character)`): una heal che troverebbe solo ferite dell'oste, a vita già al tetto, è senza effetto sia per il rifiuto di `acceptQuest` (`QUEST_NO_EFFECT`) sia per `Quest.noEffect` (D-14).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | f92887fb | test(quests): expect no-effect checks to ignore innkeeper wounds |
| 1 GREEN | 77d68537 | feat(quests): ignore innkeeper wounds in the no-effect checks |
| 2 | (questo commit) | docs(phase-25): record plan 03 progress |

## Cosa è stato fatto

- `heal-no-effect.ts`: chiave nuova di `HealSubject`; terzo argomento di `cureInjuries` = `innkeeperInjuriesOf(character)`; commento di testa aggiornato.
- `quest-acceptance.service.ts`: `'status.innkeeperInjuries': 1` in `CHARACTER_PROJECTION`, campo `innkeeperInjuries?: unknown[] | null` in `CharacterAcceptanceSnapshot`, soggetto di `effectiveOrReject` con il campo come letto. Nessun'altra regola dell'accettazione toccata.
- `viewer-vitals.service.ts`: stessa aggiunta a `VIEWER_VITALS_PROJECTION`, `VitalsCharacter` e al soggetto restituito. `quest-no-effect.resolver.ts` non cambia (passa già il soggetto intero).
- Nessun cambio allo SDL.

## Fallimenti RED attesi e osservati

Quattro rossi, tutti asserzioni:

- `heal-no-effect.spec.ts` › `has no effect when the cure matches only innkeeper wounds (D-14)` (1 su 21).
- `viewer-vitals.service.spec.ts` › `carries the innkeeper wounds of the viewer's character (D-14)` (1 su 8: soggetto senza la lista, proiezione senza la chiave).
- `quest-acceptance.service.int-spec.ts` › `refuses a heal quest that would heal only innkeeper wounds (D-14)` (accettata invece di rifiutata).
- `quests.resolver.int-spec.ts` › `marks a heal quest as without effect when only innkeeper wounds match (D-14)` (`noEffect` falso).

Il fallimento di compilazione di ts-jest atteso dal piano NON si è visto: jest in questo repo non controlla i tipi (come già annotato al piano 02), quindi il commit RED non passa `tsc` ma i rossi sono solo asserzioni. `tsc` è 0 al GREEN.

## Casi verdi al primo colpo

- `has an effect when an ordinary wound is curable beside an innkeeper one (D-14)`, `has an effect below the life ceiling whatever the wounds (D-14)`, `reads a missing origin (undefined|null) as no innkeeper wound (D-16)`: non regressione, la risposta è «ha effetto» anche senza conoscere l'origine.
- `accepts a heal quest with a curable ordinary wound beside an innkeeper one (D-14)` (int): stesso motivo.

## Casi esistenti toccati per la chiave obbligatoria

- `heal-no-effect.spec.ts`: l'helper `subject(hp, injuries, max)` ora mette sempre `innkeeperInjuries` (default `undefined`); tutti i casi `(D-25)` esistenti passano da lì senza altre modifiche.
- `viewer-vitals.service.spec.ts`: nessun caso esistente modificato; i due `toEqual` del soggetto (`reads a legacy character…`, `returns the viewer title…`) restano verdi perché la chiave vale `undefined` sui personaggi senza il campo.
- Spec d'integrazione: nessun caso esistente modificato. Il caso `reads the character once per request for a board of heals (D-25)` continua a riconoscere la lettura dei vitali da `'status.injuries'`.

## Test eseguiti

- `npx jest src/quests/outcomes/injuries/heal-no-effect.spec.ts src/quests/no-effect/viewer-vitals.service.spec.ts --selectProjects unit`: 2 suite, 28/28.
- `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand --forceExit`: 2 suite, 213/213.
- `npx jest src/quests/no-effect src/quests/acceptance src/quests/outcomes/injuries --selectProjects unit` (non regressione): 10 suite, 380/380.
- `npx tsc --noEmit -p tsconfig.json`: 0. `git diff --exit-code src/schema.gql`: pulito. `pgrep -fl 'bin/jest'`: vuoto. Prettier ed eslint puliti sui sette file.

## Deviations from Plan

Nessuna sulla sostanza. Note:

- Il caso del resolver prova anche i due lati della regola nello stesso test (falso prima che la ferita diventi dell'oste, di nuovo falso sotto il tetto della vita), per coprire la verità «resta falso appena c'è una ferita normale curabile o vita da recuperare».
- Il RED fallisce per asserzioni e non per compilazione (vedi sopra).

## Threat model

- T-25-07 (mitigate): un solo `healHasNoEffect` con tre soli file che lo nominano fuori dalle spec (`heal-no-effect.ts`, `quest-acceptance.service.ts`, `quest-no-effect.resolver.ts`); la chiave è obbligatoria in `HealSubject`, verificato da `tsc`.
- T-25-08 (accept): nessuna lettura nuova; la proiezione dei vitali del viewer guadagna un campo dello stesso personaggio.

## Per i piani successivi

- `outcome-plan.ts` (piano 04) è l'ultimo chiamante di `cureInjuries` ancora senza il terzo argomento.
- Chi costruisce un `HealSubject` deve passare `innkeeperInjuries` (anche `undefined`): il campo grezzo, non la lista normalizzata.

## Self-Check: PASSED

- File modificati presenti; commit f92887fb e 77d68537 in `git log`.
