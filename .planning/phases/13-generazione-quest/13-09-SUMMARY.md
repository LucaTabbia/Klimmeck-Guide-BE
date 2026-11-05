---
phase: 13-generazione-quest
plan: 09
subsystem: quests (generazione, fondamenta pure)
tags: [quests, generation, prng, BE-QGEN-02, BE-QGEN-03, BE-QGEN-05, D-05, D-06, D-07, D-15, D-17]
requires: ["13-08"]
provides:
  - "`SeededChanceSource` (mulberry32, `next`/`pick`/`shuffle`) e `keyedChance(seed, key)` in src/quests/generation/seeded-chance.ts"
  - "Costanti e funzioni pure del generatore in src/quests/generation/generation-rules.ts: fasce xp per rango (legend 1098–3212), medie del party, `bossSeatsOf`, `isBossCandidate`, `isGeneratedRank`, `leastCoveredRank`, quote e limiti dei branchi"
affects: [13-10, 13-11, 13-12, 13-13, 13-17]
tech-stack:
  added: []
  patterns:
    - "Regole di gioco come costanti TypeScript pure, provate con i casi reali del CONTEXT (Troll, Licantropo pipistrello, Idra, Beholder, Megalodonte)"
key-files:
  created:
    - src/quests/generation/seeded-chance.ts
    - src/quests/generation/seeded-chance.spec.ts
    - src/quests/generation/generation-rules.ts
    - src/quests/generation/generation-rules.spec.ts
  modified: []
decisions:
  - "`seeded-chance.ts` ripristinato identico a `e857802^:src/content/generation/seeded-chance.ts` (solo il commento di testa D-17 in più); la spec storica ripristinata con i titoli `(D-17)` più i due casi nuovi del piano (seme 13, chiavi 'a'/'b')"
  - "`leastCoveredRank` scorre `GENERATED_RANKS` in ordine e sostituisce solo su conteggio strettamente minore: la parità va al rango più basso; un rango assente conta 0"
  - "`isBossCandidate` è false per ogni rango senza media in `BOSS_PARTY_AVERAGE_PE` (rookie, legend); `LEGEND_PARTY_AVERAGE_PE` resta solo documentata"
metrics:
  duration: "~10 min"
  completed: 2026-11-04
  tasks: 2
  files: 4
---

# Phase 13 Plan 09: PRNG seminato e regole numeriche del generatore Summary

Il generatore ha ora le sue fondamenta pure: un PRNG mulberry32 seminato riproducibile con flussi per chiave (D-17) e le regole numeriche del bilanciamento (fasce xp per i sei ranghi con legend, medie del party, posti del boss con la correzione −0,5, quote, limiti dei branchi, rango meno coperto) come costanti TypeScript testate.

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | 3d9e399 | `test(generation): restore the seeded chance spec` |
| 1 GREEN | b230c30 | `feat(generation): restore the seeded chance source` |
| 2 RED | a0b4641 | `test(generation): pin the rank bands and the boss seats` |
| 2 GREEN | 068da39 | `feat(generation): add the rank bands and the boss seat rules` |

## RED osservati

- Task 1: suite fallita al caricamento, `Could not locate module src/quests/generation/seeded-chance` (modulo assente), 0 test eseguiti.
- Task 2: suite fallita al caricamento, `Could not locate module src/quests/generation/generation-rules`, 0 test eseguiti.

## Nomi e firme

- src/quests/generation/seeded-chance.ts: `export class SeededChanceSource extends ChanceSource { constructor(seed: number); next(): number; pick<T>(items: readonly T[]): T | undefined; shuffle<T>(items: readonly T[]): T[] }`; `fnv1a32` privato; `export function keyedChance(seed: number, key: string): SeededChanceSource` (seme `(seed ^ fnv1a32(key)) >>> 0`).
- src/quests/generation/generation-rules.ts: `XP_SCALE = 0.14084507`; `GENERATED_RANKS` (rookie…legend, `as const`); `type GeneratedRank`; `interface XpBand { min; max }`; `RANK_XP_BANDS: Readonly<Record<GeneratedRank, XpBand>>`; `BOSS_PARTY_AVERAGE_PE` (adventurer 400, paladin 1500, mage 4000, hero 6000); `LEGEND_PARTY_AVERAGE_PE = 15_000`; `MIN_BOSS_SEATS = 2`; `MAX_BOSS_SEATS = 6`; `BOSS_SHARE = 0.1`; `SINGLE_FORM_SHARE = 0.5`; `MAX_PACK_UNITS = 8`; `MAX_PACK_TYPES = 3`; `PACK_ATTEMPTS = 20`; `LEGEND_PACK_UNITS = { min: 2, max: 4 }`; `bossSeatsOf(xp, average) = Math.ceil((xp - 0.5) / XP_SCALE / average)`; `isBossCandidate(xp, rank): boolean`; `isGeneratedRank(title: unknown): title is GeneratedRank`; `leastCoveredRank(counts): GeneratedRank`.

## Verifiche

- `npx jest src/quests/generation/generation-rules.spec.ts src/quests/generation/seeded-chance.spec.ts --selectProjects unit`: 2 suite, 16 test verdi (9 + 7).
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier ed eslint puliti sui quattro file, uno per uno.
- Acceptance: `export function keyedChance` 1; `Math.random` 0 in entrambi i moduli; `D-17)` 9 nella spec del PRNG; `legend: { min: 1098, max: 3212 }` 1 (Prettier non ha spezzato l'oggetto); `D-05)` 2 e `D-15)` 2 nella spec delle regole.
- Schema invariato: `git diff origin/develop -- src/schema.gql` toglie solo le due righe `  enemy: Enemy`.

## Deviations from Plan

None - plan executed exactly as written. (Aggiunto un test `pins the party averages of the boss ranks (D-05)` per le medie e i limiti dei posti, coerente con il behavior del piano.)

## Known Stubs

Nessuno.

## Self-Check: PASSED

- I quattro file creati esistono; i commit 3d9e399, b230c30, a0b4641, 068da39 sono nella storia del branch.
