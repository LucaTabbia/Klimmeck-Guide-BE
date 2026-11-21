---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 08
subsystem: gm
tags: [injuries, innkeeper, guided-mission, mission-draft, wire, sdl]
requires:
  - "MissionFightEffectsRecord.injuriesRemoved e MissionFightOutcomeRecord.innkeeperInjuriesBefore sullo schema della bozza (25-07)"
  - "handInflictedOf(corrected, simulatedAdded) in innkeeper-injuries.ts (25-07)"
provides:
  - "MissionFightOutcome.innkeeperInjuriesBefore sul filo"
  - "MissionFightEffects.injuriesRemoved e MissionFightEffects.innkeeperInjuries sul filo"
  - "mapper tollerante: bozze di prima servite con liste vuote"
affects: [25-09, 25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "l'origine servita è derivata nel mapper da simulated e corrected con la regola del completamento, mai salvata"
    - "due funzioni distinte per l'effetto simulato e per quello corretto, nessun flag"
key-files:
  created: []
  modified:
    - src/quests/guided/mission-draft.wire.ts
    - src/quests/guided/mission-draft.mapper.ts
    - src/quests/guided/mission-draft.mapper.spec.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
key-decisions:
  - "l'effetto simulato si serve con `injuriesRemoved: []` e `innkeeperInjuries: []` qualunque cosa porti il record: il motore non toglie ferite e non ne infligge a nome dell'oste"
requirements: [BE-WOUND-06]
metrics:
  tasks: 2
  files: 6
  completed: 2026-11-21
---

# Phase 25 Plan 08: Bozza sul filo — rimozioni e origine Summary

La bozza del flusso guidato serve all'oste, per ogni scontro e personaggio, le ferite dell'oste portate all'inizio (`innkeeperInjuriesBefore`), le ferite tolte dalla correzione (`corrected.injuriesRemoved`) e quelle inflitte di suo pugno (`corrected.innkeeperInjuries`, derivata con `handInflictedOf`, la stessa regola dell'effetto effettivo): la FE disegna ciò che riceve e non deduce mai l'origine (D-12, D-13, D-16).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | d1c618d1 | test(gm): expect wound removals and origins on the served draft |
| 1 GREEN | c9d4bf37 | feat(gm): serve wound removals and origins on the mission draft |
| 2 | (questo commit) | docs(phase-25): record plan 08 progress |

## Cosa cambia

- **Filo.** Tre `@Field(() => [InjuryType])` non annullabili in `mission-draft.wire.ts`, coi commenti del contratto.
- **Mapper.** `effectsOf(effects, innkeeperInjuries)` riceve l'origine già calcolata; `simulatedEffectsOf(outcome)` serve sempre liste vuote; `correctedEffectsOf(outcome)` legge `injuriesRemoved ?? []` e calcola `handInflictedOf(corrected, outcome.simulated?.injuriesAdded ?? [])`; `outcomeOf` legge `innkeeperInjuriesBefore ?? []`. Una sola chiamata a `handInflictedOf(` nel file.
- **SDL** rigenerato col boot reale di test, tre righe aggiunte e nessuna tolta:

```graphql
# type MissionFightEffects
  injuriesRemoved: [InjuryType!]!
  innkeeperInjuries: [InjuryType!]!
# type MissionFightOutcome
  innkeeperInjuriesBefore: [InjuryType!]!
```

- Nessun handler nuovo (`test/authz/expected-handlers.ts` senza diff rispetto a `e87339bb`); il caso «never serves the draft to a player (D-10)» resta verde (T-25-22).

## Fallimenti RED attesi e osservati

- `mission-draft.mapper.spec.ts`: 7 rossi su 12, tutti con `Received: undefined` sui campi nuovi: i sei casi nuovi e il caso esistente «maps a draft record to the wire with hex ids (D-17)», la cui attesa dell'intero record riceve `innkeeperInjuriesBefore: []`, `injuriesRemoved: []`, `innkeeperInjuries: []`.
- `guided-mission.resolver.int-spec.ts`: `Cannot query field "innkeeperInjuriesBefore" on type "MissionFightOutcome"` e gli analoghi su `MissionFightEffects` (`GRAPHQL_VALIDATION_FAILED`).
- `test/app.int-spec.ts`: «adds the guided mission draft to the schema (D-17)» rosso sui due blocchi pinnati.
- **Nessun caso nuovo verde al primo colpo.**

## Casi nuovi

| Spec | Caso |
|------|------|
| mapper | serves the innkeeper wounds carried before the fight (D-13) |
| mapper | serves the wounds removed by the correction (D-13) |
| mapper | serves the hand-inflicted wounds of a corrected fight (D-12) |
| mapper | serves a wound removed and added again as the innkeeper's (D-16) |
| mapper | serves empty lists on the simulated effects (D-12) |
| mapper | serves empty lists for a draft opened before the fields (D-13) |
| resolver (wire) | serves the removals and the origin of the wounds over the wire (D-12, D-13) |

Il caso sul filo semina a DB `status.injuries` e `status.innkeeperInjuries` con `deepCut`, simula il primo scontro e salva una correzione `{ injuries: [fracturedRib], injuriesRemoved: [deepCut] }`: la risposta porta `innkeeperInjuriesBefore: [deepCut]`, `corrected.injuriesRemoved: [deepCut]`, `corrected.innkeeperInjuries: [fracturedRib]` e le due liste del simulato vuote. In `describe('mission draft save')` la simulazione del primo scontro è stata estratta in `simulateFirst(first, oste)` (riusata da `simulatedPair`).

## Deviations from Plan

Nessuna deviazione di codice: piano eseguito com'è scritto.

Nota operativa: la verifica finale (unit intero + integrazione larga in un solo comando) ha superato i 180 s ed è stata spostata in background dall'ambiente; è stata attesa fino alla fine prima di proseguire e nessun processo jest è rimasto vivo.

## Verifica

- `mission-draft.mapper.spec.ts`: 12 verdi. Unit, intero progetto: 4638 verdi (312 suite).
- Integrazione del piano (`guided-mission.resolver.int-spec.ts` + `test/app.int-spec.ts`): 134 verdi; larga (`src/quests src/gm test/app test/authz`): 1123 verdi (49 suite).
- `npx tsc --noEmit -p tsconfig.json` esce 0; `git diff --exit-code src/schema.gql` esce 0 dopo la rigenerazione.
- Accettazione: `git diff e87339bb -- src/schema.gql` 6 righe aggiunte e 0 tolte; `handInflictedOf(` 1 nel mapper; `D-13)` 3 e `D-12)` 2 nella spec del mapper; i due `awk` dello SDL stampano 2 e 1.
- Prettier ed eslint sui file toccati: nessun errore (un warning preesistente in `test/app.int-spec.ts:1282`, fuori dal diff).
- Nessun `npm run build`, nessun riavvio del BE, nessuna lettura di `.env`.

## Threat Flags

Nessuna superficie nuova: tre campi sugli stessi tipi serviti dai soli handler `@Roles(innkeeper)`.

## Per i piani successivi

- **09 (completamento):** il mapper serve l'origine con `handInflictedOf` sul record grezzo; il completamento deve arrivare allo stesso risultato da `effectiveSequenceOf` (T-25-24: una sola regola). `aggregateEffectsOf` unisce ancora le ferite e `overrideInputOf` perde ancora le rimozioni.
- **11 / 12:** i blocchi pinnati di `MissionFightEffects` e `MissionFightOutcome` in `test/app.int-spec.ts` sono già quelli finali della fase.
- **14 (handoff):** le tre righe dello SDL e la regola «sul simulato sempre vuote» vanno in `BACKEND-NOTES.md`.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File modificati presenti e commit d1c618d1, c9d4bf37 nel log.
