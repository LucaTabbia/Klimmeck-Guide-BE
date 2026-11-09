---
phase: quick-261109-inj2
plan: 01
subsystem: models
tags: [injuries, injury-type, enum, schema, injury-rules]
requirements: [BE-CONTENT-05]
key-files:
  created:
    - src/models/enums/injury-type.enum.spec.ts
  modified:
    - src/models/enums/injury-type.enum.ts
    - src/quests/outcomes/injuries/injury-rules.ts
    - src/quests/outcomes/injuries/injury-rules.spec.ts
    - src/schema.gql
commits:
  - { hash: c4e92da, message: "test(models): expect the nine new injury types" }
  - { hash: f46fc18, message: "style(models): format injury-type.enum.ts" }
  - { hash: 8f3232d, message: "feat(models): add nine injury types with their effects" }
---

# Quick 261109-inj2: nove ferite nuove

`InjuryType` ha 37 valori: i nove nuovi — contusion, punctureWound, muscleTear, exhaustion, sprain, dislocatedShoulder, brokenNose, hypothermia, stunned — sono in coda dopo `spinalInjury`, nell'ordine deciso dall'utente (2026-11-09, «Aggiungiamo tutte le ferite»). `INJURY_EFFECTS` ha le nove righe con gli effetti provvisori della tabella del piano (D-02 resta provvisorio): combattimento e viaggio continuano a passare da `EFFECT_MODIFIERS` per effetto, nessun'altra tabella per ferita esiste nel codice (`grep -rn "InjuryType\." src` fuori da spec, enum e injury-rules: vuoto). Il sorteggio della ferita in combattimento è uniforme su `Object.values(InjuryType)`: i nove entrano da soli, nessuna pesatura. Sul filo `enum InjuryType` in `src/schema.gql` elenca i nove nella posizione in cui li stampa `sortSchema` (riga inserite a mano: l'orchestratore conferma al boot reale che `git diff --exit-code src/schema.gql` resta vuoto). Nessuna migrazione: nessun personaggio ha ancora queste ferite. Il contenuto (quali pozioni le curano, `effectedInjuries`) lo scrive l'orchestratore a DB; etichette, gravità ed effetti nella FE arrivano dal quick task gemello sullo stesso nome di branch.

## Modifiche
- `injury-type.enum.ts`: nove valori `contusion = 'contusion'`, …, `stunned = 'stunned'` in coda all'enum. Il file non passava Prettier (virgolette doppie): formattato prima in un commit di stile separato (29 righe, solo le virgolette), come da regola (precedente 261105-hea / 261109-inj).
- `injury-rules.ts`: nove righe in `INJURY_EFFECTS` — contusion `[pain]`, punctureWound `[bleeding, pain]`, muscleTear `[pain, staminaDrain]`, exhaustion `[staminaDrain]`, sprain `[pain, movementImpairment]`, dislocatedShoulder `[pain, movementImpairment]`, brokenNose `[pain, bleeding]`, hypothermia `[movementImpairment, staminaDrain]`, stunned `[consciousnessLoss]`. Il tipo `Record<InjuryType, …>` impone la completezza: senza queste righe `tsc` non compila.
- `injury-type.enum.spec.ts` (nuovo, progetto `unit`, 3 casi): pin dei 37 valori nell'ordine (i nove dopo `spinalInjury`, nessun duplicato per costruzione); il blocco `enum InjuryType {…}` di `src/schema.gql` contiene i nove nomi; il blocco è identico a `Object.values(InjuryType)` ordinato per code unit (`Array.sort`, lo stesso ordine di `naturalCompare` di graphql per nomi senza cifre) — così il boot non riscrive il file.
- `injury-rules.spec.ts`: `it.each` sui nove con gli effetti attesi dalla tabella (la spec esistente «ogni ferita ha almeno un effetto noto» itera già su `Object.values(InjuryType)` e copre i nove da sola: 37 casi).
- `schema.gql`: nove righe inserite nel blocco `enum InjuryType` (`brokenNose` prima di `brokenRightArm`, `contusion` dopo `brokenRightLeg`, `dislocatedShoulder` ed `exhaustion` dopo `deepCut`, `hypothermia` dopo `headConcussion`, `muscleTear` dopo `missingRightLeg`, `punctureWound` prima di `puncturedLung`, `sprain` e `stunned` dopo `spinalInjury`); `LC_ALL=C sort -c` verde sulle 37 righe dei valori; nessun newline finale aggiunto (il file non lo aveva, ultimo byte `}`); nessun'altra riga toccata.

## RED
`npx jest src/models/enums/injury-type.enum.spec.ts src/quests/outcomes/injuries/injury-rules.spec.ts --selectProjects unit` prima della modifica: `Test Suites: 2 failed, 2 total · Tests: 11 failed, 46 passed, 57 total`.
- `InjuryType › pins the 37 injuries, the nine of quick 261109-inj2 after spinalInjury`: `- Expected - 9 / + Received + 0` (28 valori).
- `InjuryType › exposes the nine new injuries in the InjuryType SDL enum`: `Expected: ArrayContaining ["contusion", "punctureWound", …, "stunned"]  Received: ["blackEye", "blindness", …]`.
- `InjuryType › keeps the InjuryType SDL enum as sortSchema prints it`: verde anche in RED (il file di partenza era già ordinato): è la guardia contro una riga fuori posto nel GREEN.
- `injury tables › maps undefined to its provisional effects` ×9 (`InjuryType.contusion` ecc. valevano `undefined`, `isolatedModules`): `Expected: ["pain"] Received: undefined`, `Expected: ["bleeding", "pain"] Received: undefined`, … `Expected: ["consciousnessLoss"] Received: undefined`.

## Gate
- `npx jest src/models/enums src/quests/outcomes/injuries --selectProjects unit`: 3 suite, 68/68 (`injury-type.enum.spec.ts` 3/3, `injury-rules.spec.ts` 63/63, `use-type.enum.spec.ts` 2/2).
- `npx tsc --noEmit`: 0 errori.
- `npx prettier --check` ed `npx eslint` su `injury-type.enum.ts`, `injury-rules.ts`, `injury-type.enum.spec.ts`, `injury-rules.spec.ts`: puliti (0 warning).
- `git diff 53c0065..HEAD -- src/schema.gql`: nove righe aggiunte (`+  brokenNose`, `+  contusion`, `+  dislocatedShoulder`, `+  exhaustion`, `+  hypothermia`, `+  muscleTear`, `+  punctureWound`, `+  sprain`, `+  stunned`), nessuna rimossa; `tail -c 4` = `t!\n}` (nessun newline finale). `git status --short` vuoto dopo i commit. Subject ≤ 72 byte (46, 41, 54), nessun trailer; `dist/` non toccato (nessun build eseguito), nessun accesso a DB, `.env` o processo BE.

## Deviazioni
- **Posizione di `punctureWound` nel SDL** (correzione del piano, non del codice): il piano indicava «`punctureWound` dopo `puncturedLung`», ma `sortSchema` (graphql 16 `lexicographicSortSchema` → `naturalCompare`, confronto per code unit) mette `punctureWound` **prima** di `puncturedLung` (`W` 0x57 < `d` 0x64). Verificato empiricamente con `lexicographicSortSchema` su uno schema di prova con i 37 nomi: l'ordine stampato coincide con `Array.sort`. Seguito l'intento del piano («in posizione alfabetica (sortSchema) così il boot non riscrive il file») invece della lettera; la spec del SDL pinna proprio questo ordine. Gli altri otto sono dove il piano diceva.
- Nessun'altra deviazione. Pesatura del sorteggio, migrazioni, contenuto a DB e FE restano fuori scope come da piano.
