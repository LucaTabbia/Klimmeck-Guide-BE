---
phase: 13-generazione-quest
plan: 12
subsystem: quests (generazione, scelta della città e del POI)
tags: [quests, generation, city, poi, distribution, BE-QGEN-04, D-15, D-17, D-29]
requires: ["13-09", "13-11"]
provides:
  - "`neighboursOf`, `densityOf`, `cityWeightOf`, `pickCity`, `freePoisOf`, `pickPoi`, `NEIGHBOUR_COUNT`, `MAX_GENERATED_PER_CITY`, `CityNode` in src/quests/generation/city-picker.ts"
  - "Prova di distribuzione con `SeededChanceSource(13)` su una griglia 6 × 5 in src/quests/generation/city-distribution.spec.ts"
affects: [13-13, 13-18]
tech-stack:
  added: []
  patterns:
    - "Funzioni pure deterministiche dato il `ChanceSource`: città ordinate per id, vicini ordinati per distanza al quadrato poi id, ricalcolo dei pesi dopo ogni scelta"
key-files:
  created:
    - src/quests/generation/city-picker.ts
    - src/quests/generation/city-picker.spec.ts
    - src/quests/generation/city-distribution.spec.ts
  modified: []
decisions:
  - "I vicini escludono la città stessa; con meno di 6 città a mappa la lista ha meno di 5 voci"
  - "`pickCity` estrae solo fra i pesi > 0 (un id assente dalla mappa dei pesi vale 0): un tiro vicino a 1 con errore di arrotondamento cade sull'ultimo peso positivo, mai su una città a peso 0"
  - "`freePoisOf` restituisce i POI liberi ordinati per id, così `pickPoi` è deterministico qualunque sia l'ordine a DB"
  - "Il confronto degli id è lessicografico sul testo (hex di ObjectId), non `localeCompare`"
metrics:
  duration: "~10 min"
  completed: 2026-11-04
  tasks: 2
  files: 3
---

# Phase 13 Plan 12: scelta della città e del POI Summary

La città di una quest generata si sceglie ora con un'estrazione pesata `1 / (1 + D)²`, dove D somma le generate attive della città e dei suoi 5 marker più vicini (D-29), con peso 0 a tetto 3 o senza POI libero (D-15); il POI si sceglie uniforme fra i `pointsOfInterest` della città meno il marker e i POI con una quest non conclusa. Una simulazione seminata su 30 città prova che la distribuzione non si concentra.

## Firme esatte

```typescript
export const NEIGHBOUR_COUNT = 5;
export const MAX_GENERATED_PER_CITY = 3;
export interface CityNode { id: string; location: readonly [number, number]; freePoiIds: readonly string[] }
export function neighboursOf(nodes: readonly CityNode[], count = NEIGHBOUR_COUNT): Map<string, string[]>
export function densityOf(cityId: string, neighbours: ReadonlyMap<string, readonly string[]>, generated: ReadonlyMap<string, number>): number
export function cityWeightOf(node: CityNode, density: number, generated: number): number
export function pickCity(nodes: readonly CityNode[], weights: ReadonlyMap<string, number>, chance: ChanceSource): CityNode | null
export function freePoisOf(city: { markerLocation: string; pointsOfInterest: readonly string[] }, occupied: ReadonlySet<string>): string[]
export function pickPoi(freePoiIds: readonly string[], chance: ChanceSource): string
```

Ordine dei tiri per quest: un `next()` in `pickCity` (solo se almeno un peso > 0), poi un `next()` in `pickPoi`. `pickPoi` su lista vuota restituisce `undefined` (il chiamante non lo invoca mai: la città scelta ha peso > 0, quindi almeno un POI libero).

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec di vicini, densità, peso, POI libero, estrazioni | 167e34d |
| 1 GREEN | `city-picker.ts` | c75b4ea |
| 2 | prova di distribuzione | b1cb77e |

## RED osservati

- Task 1: `city-picker.spec.ts` falliva con «Cannot find module 'src/quests/generation/city-picker'» (modulo assente), 0 test eseguiti.
- Task 2: `city-distribution.spec.ts` **verde al primo colpo** (4/4), come previsto dal piano: è la prova della regola BE-QGEN-04 sul modulo del Task 1. **Seme usato: 13** (nessun ripiego sui semi 1..5); l'asserzione «D massima ≤ 12» passa con il seme 13.

Test aggiunti oltre al `<behavior>` del piano (stesse regole): `keeps fewer neighbours when the map has fewer cities (D-29)` e `never picks a city whose weight is zero even on the last roll (D-15)`; nella prova di distribuzione anche «30 scelte su 30 POI distinti» e «a target 90, dopo l'ultima scelta il peso residuo è 0».

## Deviations from Plan

Nessuna: piano eseguito come scritto.

## Gates

- `npx jest src/quests/generation --selectProjects unit`: 9 suite / 64 test verdi (baseline 7 / 51 + 9 + 4).
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier ed ESLint puliti sui tre file, uno per uno.
- Nessun `Math.random`, nessuna env, nessuna modifica SDL: `git diff origin/develop -- src/schema.gql` toglie solo le due righe `  enemy: Enemy`.

## Threat Flags

Nessuna superficie nuova: funzioni pure senza I/O. T-13-12 mitigata (tetto 3 nel peso, marker e POI occupati esclusi, prova seminata); T-13-12b accettata (O(n²) una volta per corsa).

## Self-Check: PASSED

- File creati presenti: city-picker.ts, city-picker.spec.ts, city-distribution.spec.ts.
- Commit presenti: 167e34d, c75b4ea, b1cb77e.
