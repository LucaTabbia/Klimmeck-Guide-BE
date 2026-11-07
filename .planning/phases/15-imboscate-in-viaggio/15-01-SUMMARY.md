---
phase: 15-imboscate-in-viaggio
plan: 01
subsystem: travel (fondazioni pure delle imboscate) + config
tags: [travel, ambush, config, BE-AMBUSH-01, BE-AMBUSH-03, BE-AMBUSH-04, D-01, D-03, D-04, D-08, D-10]
requires: []
provides:
  - "`AMBUSH_CONFIG`, `DEFAULT_AMBUSH_TIMEZONE`, `AMBUSH_ENV_KEYS`, `AmbushEnv`, `AmbushConfig { timeZone }`, `parseAmbushConfig`, `readAmbushEnv`, `ambushConfigProvider` in src/config/ambush-config.ts"
  - "`AMBUSH_RULES`, `AMBUSH_MAX_ATTEMPTS = 3`, `isNightHour`, `hazardAt`, `prizeRankOf`, `ambushPrizesOf` in src/travel/ambush/ambush-rules.ts"
  - "`LevelBandRow`, `LEVEL_BANDS` (20 righe in PE), `xpBandOf(level): XpBand` in src/travel/ambush/level-bands.ts"
  - "`hourFormatterOf(timeZone)`, `localHourOf(formatter, instant)` in src/travel/ambush/ambush-clock.ts"
affects: [15-02, 15-03, 15-04, 15-06, 15-07, 15-08]
tech-stack:
  added: []
  patterns:
    - "Config opzionale validata al boot con `Intl.DateTimeFormat(...).resolvedOptions().timeZone` (valore canonico), errore fisso senza il valore"
    - "Ora locale con formatter `hourCycle: 'h23'` costruito una volta e `formatToParts`"
key-files:
  created:
    - src/config/ambush-config.ts
    - src/config/ambush-config.spec.ts
    - src/travel/ambush/ambush-rules.ts
    - src/travel/ambush/ambush-rules.spec.ts
    - src/travel/ambush/level-bands.ts
    - src/travel/ambush/level-bands.spec.ts
    - src/travel/ambush/ambush-clock.ts
    - src/travel/ambush/ambush-clock.spec.ts
  modified:
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - .env.example
decisions:
  - "`ambushPrizesOf` tratta `enemiesXp` negativo come 0 (`Math.max(0, enemiesXp)`)"
  - "`xpBandOf` clampa con `Math.floor` e i limiti 1..20; NaN/Infinity → riga del livello 1"
metrics:
  duration: "~12 min"
  completed: 2026-11-06
  tasks: 3
  files: 11
---

# Phase 15 Plan 01: fondazioni pure delle imboscate Summary

Variabile d'ambiente opzionale `AMBUSH_TIMEZONE` (vuota = `Europe/Rome`, validata con `Intl` al boot, valore salvato in forma canonica, errore senza il valore), costanti di dominio `AMBUSH_RULES` con il tasso per ora (0,2% di giorno, 0,6% di notte 22–06), premi della vittoria (`GENERATED_PRIZES.enemy` × `TIER_MULTIPLIER`, legend come hero, + xp dei nemici), fasce [Facile, Medio] per livello in xp (`LEVEL_BANDS` × `XP_SCALE` importato) e ora locale con `Intl.DateTimeFormat` `hourCycle: 'h23'`. Nessun I/O, nessun caso, nessuna dipendenza nuova.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | f3cbc3b | test(config): pin the optional ambush time zone |
| 1 GREEN | 502b184 | feat(config): add the optional AMBUSH_TIMEZONE |
| 2 RED | 8039df4 | test(ambush): pin the hazard rules, level bands and local hour |
| 2 GREEN | 1c9197b | feat(ambush): add hazard rules, level bands and local hour |
| 3 | (questo commit) | docs(phase-15): record plan 01 progress |

## Fallimenti RED osservati

- Task 1: `src/config/ambush-config.spec.ts` non si carica («Could not locate module src/config/ambush-config», suite in errore); `env.validation.spec.ts › ambush time zone › throws on an invalid AMBUSH_TIMEZONE (D-04)` rosso perché `validateEnv` non leggeva la chiave (1 failed, 245 passed).
- Task 2: le tre suite `ambush-rules`, `level-bands`, `ambush-clock` non si caricano («Could not locate module src/travel/ambush/…»), 0 test eseguiti.
- Sonda della piattaforma: il caso ICU `reads the local hour in Rome across the daylight saving changes (D-01)` è verde appena il modulo esiste (nove istanti → `[1, 3, 2, 2, 22, 6, 6, 22, 0]`, cambi d'ora CEST/CET compresi); `America/New_York` 2026-07-01T20:00Z → 16.

## Verifiche

- `npx jest src/config src/travel/ambush --selectProjects unit`: 19 suite, 260 test verdi (drift di `.env.example` compreso).
- `npx tsc --noEmit -p tsconfig.json`: 0.
- prettier `--check`/`--write` + eslint sui sette `.ts` toccati: puliti (i due file preesistenti erano già formattati, nessun commit `style`).
- `git diff --exit-code src/schema.gql`: 0 (schema non toccato).
- Tabella PE ricontrollata su `world-building.md` righe 156–177: coincide con l'`<interfaces>` del piano; le 20 fasce in xp attese coincidono con il calcolo (nessuna attesa ri-derivata).

## Deviations from Plan

- **Oggetto d'ambiente valido in `env.validation.spec.ts`:** il piano chiede di usare «l'oggetto d'ambiente valido già definito nella spec», che non esiste; il caso nuovo usa `{ JWT_SECRET: VALID_SECRET, AMBUSH_TIMEZONE: 'Mars/Base' }` come i casi vicini (`travel sweep`).
- **STATE.md:** scritto `Plan: 1 of 12` come da brief dell'orchestratore (il formato della riga esistente era `Plan: 0 of 12`); il verify del Task 3 del piano cerca `Plan: 01 of 12` e quindi non passa alla lettera.
- **VALIDATION:** oltre allo stato `✅ green`, la colonna «File Exists» delle righe 15-01-01/02 passa da `❌ W0` a `✅`.
- Nelle spec i titoli sono passati come `TitleType.legend` ecc. invece delle stringhe nude (`'legend'`), per il type check di `prizeRankOf(title: TitleType)`.

## Known Stubs

Nessuno.

## Self-Check: PASSED
