---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 04
subsystem: combat
tags: [combat, pets, dungeon, guard, placeholder]
requires: ["23-03"]
provides:
  - "ParticipantEffects.companionLifeAfter (porta del combattimento)"
  - "compagno nel contesto col massimo del compagno e la vita salvata"
  - "segnaposto che danneggia il compagno senza tiri"
  - "dungeon e guardia con lo sconfitto fuori dagli scontri seguenti"
affects: ["23-05", "23-06", "23-15", "23-16"]
tech-stack:
  added: []
  patterns: ["spread condizionale per una chiave opzionale degli effetti", "lastCompanionLifeOf condiviso da dungeon e guardia"]
key-files:
  created: []
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/characters/pets/companion-life.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
    - src/quests/outcomes/dungeon/dungeon-resolver.ts
    - src/quests/outcomes/guard/guard-outcome.ts
    - src/quests/outcomes/conclusion/conclusion-plan.ts
decisions:
  - "Danno del compagno nel segnaposto = perdita del personaggio prima della pozione, clampata a [1, max], nessun tiro (A5, D-03)"
  - "Effetti fusi: companionLifeAfter dell'ultimo scontro che lo porta (lastCompanionLifeOf in combat-resolver.ts)"
  - "foughtSnapshotOf riceve la mappa dei pet a catalogo e scrive il livello sulla voce riscritta, così una voce legacy non rientra piena nello scontro di guardia (D-23)"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 23 Plan 04: porta del combattimento — vita del compagno dopo lo scontro Summary

`ParticipantEffects.companionLifeAfter?: number` è l'unico campo nuovo della porta. Il segnaposto lo valorizza con la perdita del personaggio calcolata prima della pozione, senza consumare la `ChanceSource`. Il compagno entra nel contesto col massimo del suo livello (`companionMaxLifeOf`) e con la vita di `companionStoredLifeOf`, quindi una voce legacy entra piena. Nel dungeon e nello scontro della guardia il compagno arrivato a 1 resta fuori dagli scontri seguenti.

## Task e commit

| Task | Commit | Note |
|------|--------|------|
| 1 RED | 8161c6bd `test(combat): pin the companion damage of the placeholder` | 7 casi rossi |
| 1 GREEN | a025e9ac `feat(combat): report the companion life after a fight` | porta, contesto, loader, segnaposto, `companionLifeNow` esportato |
| 2 RED | 04e814af `test(combat): pin the defeated companion across fights in sequence` | 6 casi rossi |
| 2 GREEN | e6accd2a `feat(combat): keep a defeated companion out of later fights` | dungeon, guardia, `lastCompanionLifeOf` |
| 3 | commit `docs(phase-23): record plan 04 progress` | bookkeeping |

## Fallimenti RED attesi

- Segnaposto: `damages the companion…` (manca `companionLifeAfter`) e `never takes the companion below 1` (Received undefined).
- Contesto: legacy 0 → 0 invece di 80; 250 non clampato; massimo 80 invece di 160; voce mai toccata 80 invece di 160 (i casi D-03, D-23, D-38).
- `companion-life.spec.ts`: `companionLifeNow is not a function`, perché non era ancora esportato.
- Dungeon: i 3 casi D-12 (il compagno non cambiava fra le tappe e mancava negli effetti fusi). Guardia: `starts the guard fight…`, `fights the guard without…` e `merges the companion life…`.

## Casi verdi al primo colpo

- `draws the same sequence with or without a companion (D-20)`: il segnaposto già ignorava il compagno, quindi le sequenze coincidevano anche prima.
- `leaves companionLifeAfter absent without a companion (D-03)`: le cinque chiavi di oggi c'erano già.
- `leaves the companion untouched by a quest fight without it (D-26)` (caso aggiunto): `foughtSnapshotOf` non toccava ancora `assets`.

## Tiri invariati

`git diff <record plan 03> -- placeholder-combat-resolver.ts | grep -cE '^\+.*chance\.'` stampa 0. Le spec a seme fisso (50 sequenze D-07, determinismo, `adds no chance draw of its own`) restano verdi senza toccare le sequenze. Nel caso del danno, la sequenza registrata è identica con e senza compagno.

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 1 - Bug] La voce riscritta per lo scontro di guardia rientrava piena**
- **Trovato durante:** Task 2
- **Problema:** `companionOf` legge una voce senza `level` né `lifeAsOf` come legacy, cioè piena (D-23). Riscrivendo la sola vita, il secondo scontro sarebbe ripartito dalla vita piena e non da `companionLifeAfter`.
- **Fix:** `foughtSnapshotOf(snapshot, effects, pets)` riceve la mappa dei pet a catalogo (`encounter.pets` in `conclusion-plan.ts`, che ora porta `maxXp`) e scrive anche `level: companionStoredLevelOf(entry, pet)` sulla voce del compagno. Il caso `starts the guard fight…` lo prova con `companionOf(fought, pets)` → 30.
- **File:** `src/quests/outcomes/guard/guard-outcome.ts`, `src/quests/outcomes/conclusion/conclusion-plan.ts` (fuori da `files_modified`), `guard-outcome.spec.ts` (i due inviti esistenti ora passano `new Map()`).

**2. [Rule 3 - Blocking] Attese delle spec sul compagno legacy e sul catalogo**
- `resolution-loader.service.spec.ts`: la mappa `pets` ora porta `maxXp` (2 attese).
- `ambush-resolution.int-spec.ts` e `mission-simulation.service.int-spec.ts` (casi D-20 «hands the equipped companion»): le semine erano legacy, quindi ora entrano piene (D-23). Le semine ora hanno `level: 1`. In mission-simulation la vita seminata era 40 su un massimo di 10 e ora sarebbe clampata, per cui è scesa a 7. La voce riscritta dall'imboscata conserva `level: 1`.
- `combat-context.spec.ts` «carries the equipped companion»: alla semina è stato aggiunto `level: 1` perché tenga la vita salvata 30.
- **Commit:** a025e9ac

**3. Helper condiviso:** il piano proponeva un helper `companionLifeOf` dentro il dungeon. Per evitare un doppione con la guardia è diventato `lastCompanionLifeOf(earlier, later)`, esportato da `combat-resolver.ts`.

Nota: `companionLifeNow` era già usata da `companionLifeAt` (una sola regola): è bastato aggiungere `export`.

## Verifiche

- Unit `src/quests src/travel src/characters`: 147 suite / 2 210 test verdi.
- Int: mission-simulation, guided-completion, quest-resolution, gm-completion, ambush-resolution (111), ambush-lifecycle, boss-resolution, quest-result.resolver, quest-pet-prize (67), quest-dungeon, quest-combat, crime-guard-conclusion, dungeon-aid (61): tutte verdi.
- `tsc` 0; SDL invariato (`git diff --exit-code src/schema.gql`); nessun processo jest residuo.
- Bookkeeping: `Plan: 4 of 18` senza zero iniziale, come da brief dell'orchestratore. Il grep del piano su `Plan: 04 of 18` non combacia, ed è atteso.

## Known Stubs

Nessuno. La sconfitta (vita 1 → `defeatedUntil`, slot svuotato) la deduce il piano dell'esito (piano 05).

## Self-Check: PASSED
