---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 02
subsystem: characters
tags: [injuries, innkeeper, potion, cure, write-guard]
requires:
  - "innkeeperInjuriesOf(status) (25-01)"
provides:
  - "cureInjuries(injuries, canHeal, untouchable = []): le ferite dell'oste restano e non contano fra le guarite"
  - "bevuta dal Diario che rispetta le ferite dell'oste, guardata su status.innkeeperInjuries come letto"
affects: [25-03, 25-04, 25-06, 25-09]
tech-stack:
  added: []
  patterns:
    - "la protezione vive nella primitiva: i chiamanti passano solo la lista delle ferite dell'oste"
key-files:
  created: []
  modified:
    - src/quests/outcomes/injuries/cure-injuries.ts
    - src/quests/outcomes/injuries/cure-injuries.spec.ts
    - src/characters/items/item-use.plan.ts
    - src/characters/items/item-use.plan.spec.ts
    - src/characters/items/use-item.int-spec.ts
key-decisions:
  - "la guardia di scrittura pinna il campo grezzo status.innkeeperInjuries (assente = null), non la lista normalizzata"
requirements: [BE-WOUND-02]
metrics:
  tasks: 3
  files: 5
  completed: 2026-11-21
---

# Phase 25 Plan 02: La regola delle cure in un solo posto e la pozione Summary

`cureInjuries` ha un terzo parametro `untouchable` (default lista vuota): i tipi protetti escono dai curabili prima dei due filtri, quindi restano con tutte le copie e non entrano in `healed` (D-11, D-14). La pozione dal Diario è il primo chiamante che glielo passa (`innkeeperInjuriesOf(snapshot.status)`) e la sua scrittura è guardata anche sull'origine come letta (D-16).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 862ff265 | test(quests): expect cures to skip the innkeeper wounds |
| 1 GREEN | daad26b4 | feat(quests): let cures skip the innkeeper wounds |
| 2 RED | bc09562b | test(characters): expect potions to skip the innkeeper wounds |
| 2 GREEN | 7b78aed9 | feat(characters): keep the innkeeper wounds through a potion |
| 3 | (questo commit) | docs(phase-25): record plan 02 progress |

## Cosa è stato fatto

- `cure-injuries.ts`: parametro `untouchable: readonly InjuryType[] = []`; commento aggiornato. I chiamanti `outcome-plan.ts` e `heal-no-effect.ts` NON sono cambiati (piani 03 e 04).
- `item-use.plan.ts`: `ItemUseCharacterSnapshot.status.innkeeperInjuries?: unknown[] | null`; `drinkEffectOf` passa `innkeeperInjuriesOf(snapshot.status)`; `writeGuardOf` aggiunge `'status.innkeeperInjuries': innkeeperInjuries ?? null`. `refuseWithoutEffect`, il set della bevuta e `planPetPotion` sono invariati: la bevuta non scrive mai l'origine.
- La proiezione `{ status: 1, assets: 1 }` portava già il campo: nessun cambio al servizio.

## Fallimenti RED attesi e osservati

- Task 1: 3 rossi su 12, tutti asserzioni (ferita protetta tolta e contata fra le guarite): `leaves an innkeeper wound where it is (D-11)`, `never reports an innkeeper wound as healed (D-14)`, `keeps every copy of a duplicated innkeeper wound (D-11)`.
- Task 2 unit: 6 rossi su 85, tutti asserzioni: il caso esistente del filtro intero (chiave nuova), `leaves an innkeeper wound after the drink (D-14)`, `still drinks for the life points… (D-14)`, i due di `guards the write on the innkeeper wounds as read (D-16)`, `refuses a potion that would heal only innkeeper wounds at full life (D-14)`.
- Task 2 int: 2 rossi su 34: `keeps an innkeeper wound through a potion (D-11, D-14)` (ferita dell'oste fra le guarite), `refuses with ITEM_NO_EFFECT…  (D-14)` (bevuta accettata, codice `undefined`).

## Casi verdi al primo colpo

- `cure-injuries.spec.ts`: `heals as before without innkeeper wounds (D-14)` e `ignores a protected wound the character does not carry (D-14)`: sono casi di non regressione, il terzo argomento vuoto o estraneo non cambia nulla nemmeno prima.
- `item-use.plan.spec.ts`: `never writes the origin of a wound (D-16)`: prova di assenza (T-25-06), vera prima e dopo.

## Casi esistenti aggiornati per la chiave nuova del filtro

- `item-use.plan.spec.ts` › `guards the write with the snapshot: identity, no aid, life points, injuries, recovery and stack (D-22)`: aggiunta `'status.innkeeperInjuries': null` all'atteso. È l'unico caso che confronta l'intero filtro con `toEqual`; `item-use.service.int-spec.ts` e gli altri casi non sono stati toccati.

## Test eseguiti

- `npx jest src/quests/outcomes/injuries/cure-injuries.spec.ts --selectProjects unit`: 12/12.
- `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit`: 85/85.
- `npx jest src/characters/items/use-item.int-spec.ts src/characters/items/item-use.service.int-spec.ts --selectProjects integration --runInBand --forceExit`: 2 suite, 42/42.
- `npx jest src/characters/items src/quests/outcomes --selectProjects unit` (non regressione dei chiamanti): 45 suite, 1091/1091.
- `npx tsc --noEmit -p tsconfig.json`: 0. `git diff --exit-code src/schema.gql`: pulito. `pgrep -fl 'bin/jest'`: vuoto.

## Deviations from Plan

Nessuna sulla sostanza. Note:

- Le spec RED usano il terzo argomento e il campo dello snapshot prima che esistano nei tipi: i commit RED non passano `tsc` (jest non controlla i tipi); `tsc` è 0 a ogni GREEN.
- Integration lanciate con `--forceExit` (ammesso dal brief).
- STATE.md: aggiornati posizione, stato e attività; i contatori del frontmatter (`total_plans`, `completed_plans`, `percent`) sono rimasti com'erano, su indicazione dell'orchestratore.
- Nessun `npm run build`, nessun avvio del BE, nessun accesso al DB reale, nessun `requirements mark-complete`.

## Per i piani seguenti

- Ogni via di cura passa le ferite dell'oste come terzo argomento di `cureInjuries`; nessun chiamante filtra da sé (regola dura 1). Restano da collegare `heal-no-effect.ts` (03) e `outcome-plan.ts` (04, con le ferite dell'oste calcolate DOPO la correzione: regola dura 2).
- La guardia della bevuta pinna il campo grezzo: un piano che scrive `status.innkeeperInjuries` fa fallire una bevuta concorrente letta prima (voluto, T-25-05).
- Nei test d'integrazione `playerWith({ status: { innkeeperInjuries: [...] } })` semina l'origine attraverso lo schema.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File modificati presenti; commit 862ff265, daad26b4, bc09562b, 7b78aed9 presenti in `git log`.
