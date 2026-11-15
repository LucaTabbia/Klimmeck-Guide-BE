---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 09
subsystem: generation
tags: [necrorian, rank-floor, quest-generator, mixed-boss]
requires: ["24-08"]
provides:
  - "CITY_RANK_FLOORS (necrorianCity → mage), rankFloorOf, allowsRank, allowsMixedLower in generation-rules.ts"
  - "GenerationWorld.poiRankFloor: marker e POI di ogni città con pavimento → pavimento"
  - "GenerationWorldOptions.cityTypes nell'harness di test"
affects: [24-10, 24-11, 24-12]
tech-stack:
  added: []
  patterns: ["pavimento per POI applicato filtrando i ranghi prima di composeQuest; guardia del boss misto prima di ogni tiro"]
key-files:
  created: []
  modified:
    - src/quests/generation/generation-rules.ts
    - src/quests/generation/generation-rules.spec.ts
    - src/quests/generation/quest-generator.service.ts
    - src/quests/generation/quest-generator.int-spec.ts
    - test/quests/generation-world.ts
decisions:
  - "Mappa POI → pavimento costruita da una funzione pura (poiRankFloorOf) su tutte le città lette, prima del ciclo di readWorld: equivale a «prima dei continue»"
  - "Sotto un pavimento il boss resta a titolo unico senza consumare il cancello né la proporzione del misto"
metrics:
  completed: 2026-11-15
  tasks: 3
  commits: 5
---

# Phase 24 Plan 09: pavimento di titolo di Necrorian nel generatore — Summary

Tabella pura `CITY_RANK_FLOORS` (`necrorianCity → mage`) in `generation-rules.ts`; `readWorld` costruisce `poiRankFloor` dal marker e da ogni `pointsOfInterest` delle città con un pavimento; `compositionFor` prova solo i ranghi ammessi (nessuno componibile → POI fuori dalla corsa, come oggi) e `mixedOf` restituisce la bozza senza tirare quando il titolo inferiore è sotto il pavimento. Senza pavimento il flusso e i tiri sono identici: le spec a seme fisso restano verdi senza toccarne le attese. SDL invariato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | f3d07243 | test(generation): pin the rank floor of the Necrorian city type |
| 1 GREEN | 1f2225e3 | feat(generation): add the rank floor by city type |
| 2 RED | 0cea064b | test(generation): expect no quest below mage on a Necrorian poi |
| 2 GREEN | 8d527a49 | feat(generation): keep the Necrorian quests at mage or above |
| 3 | (questo) | docs(phase-24): record plan 09 progress |

## Fallimenti RED attesi e osservati

- **Task 1** (unit, 10 rossi su 30): `TypeError: … is not a function` / `CITY_RANK_FLOORS` indefinito per tutti i casi nuovi (ts-jest non segnala i simboli mancanti: rosso a runtime).
- **Task 2** (integration, 13 rossi su 17 del nuovo describe): 11 semi su 12 con quest `rookie`/`adventurer`/`paladin` su POI di Necrorian (il seme 3 era verde per caso nel mondo da 3 POI); «never mixes … paladin seats» rosso (posti `paladin`); «leaves a Necrorian poi empty…» rosso (quest create).

## Semi e quest di Necrorian osservate

- Semi 1–12, mondo di 4 capitali × 6 POI (città 0 `necrorianCity`), target 24: 48 quest generate sui POI di Necrorian in totale, tutte `mage` o `hero`; fra queste 2 boss `mage` a titolo unico (`mage×2`), nessun posto `paladin`. La guardia del misto è quindi esercitata.
- Nelle città senza pavimento dello stesso mondo compaiono tutti e cinque i ranghi.

## Casi verdi al primo colpo (col motivo)

- «writes generated quests on the Necrorian pois over the seeds (D-12)» e «still generates every rank in the cities without a floor… (D-12)»: garanzie di non vacuità, vere anche prima.
- «keeps a world without Necrorian identical draw by draw (D-12)»: confronta la corsa di riferimento (mondo `drustea*` di «repeats the same quests for the same seed», seme 7, target 8) con lo stesso mondo in cui la città 0 è `ferrionCity` (capitale senza pavimento): stesse quest e stesso numero di tiri, prima e dopo. La prova forte resta `ENEMY_RUN_BEFORE_MIXED_BOSSES` e `MIXED_BOSS_RUN` (con il conteggio dei tiri), verdi e intatti.

## Deviations from Plan

- **[Rule 1 - Bug di test] Mondo «solo ranghi inferiori»:** con `enemyXps` delle fasce rookie–paladin (8…120) un branco fino a 8 unità raggiunge la fascia mage (es. 4 × 120 = 480) e il generatore componeva 2 quest mage legittime. Il caso usa ora `[8, 12, 22]` (8 × 22 = 176 < 225), commentato; correzione nel commit GREEN.
- **Mondo dei semi ingrandito** (3 → 6 POI, target 12 → 24) nel commit GREEN e asserzione «almeno un boss a Necrorian» aggiunta al caso del misto: con 3 POI nessun boss nasceva a Necrorian e la guardia del misto restava non esercitata.
- **Posti senza titolo:** le enemy hanno un posto con `title: null`; l'asserzione sui posti controlla i soli titoli non nulli (`minTitle` copre il resto).
- Il caso dei semi è un `it.each` per seme più un caso separato che pretende `> 0` quest di Necrorian sull'insieme (corse in cache per seme nel describe).

## Verifiche

- `npx jest src/quests/generation --selectProjects unit`: 15 suite, 158/158.
- `npx jest src/quests/generation/quest-generator.int-spec.ts src/quests/generation/quest-generation.resolver.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 51/51.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui file toccati; `git diff --exit-code src/schema.gql` pulito.
- Accettazione: `export const CITY_RANK_FLOORS` 1, `export function allowsMixedLower` 1, `D-12)` 6 nella spec unitaria e 7 nell'int-spec; `allowsRank(` 1 e `allowsMixedLower(` 1 nel servizio, `poiRankFloor` 5; `cityTypes` 2 nell'harness; `chance.next(` aggiunti 0; righe tolte dall'int-spec rispetto a `HEAD~2` 0; `pgrep -fl 'bin/jest'` vuoto.

## Threat model

T-24-26 (guardia del misto prima di ogni tiro, asserzioni su `minTitle` e posti su 12 semi), T-24-27 (`rankFloorOf` nullo per tipi sconosciuti, non stringa o chiavi di prototipo come `toString`), T-24-28 (nessun tiro aggiunto, seme fisso intatto) mitigati come da piano.

## Self-Check: PASSED
