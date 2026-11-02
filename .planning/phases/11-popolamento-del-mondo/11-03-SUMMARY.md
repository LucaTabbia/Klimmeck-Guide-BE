---
phase: 11-popolamento-del-mondo
plan: 03
subsystem: content
tags: [content, yaml, config, rules, BE-CONTENT-01, BE-CONTENT-02, BE-CONTENT-04, BE-CONTENT-05, BE-CONTENT-06]
requires: ["11-01", "11-02"]
provides:
  - "yaml@2.9.1 in `dependencies` (CLI compilato funzionante anche con `npm ci --omit=dev`)"
  - "src/content/content-issue.ts: ContentIssue { file, line, entryId, path, message }"
  - "src/content/content-paths.ts: DEFAULT_CONTENT_DIR, contentDirOf(flag)"
  - "src/content/loading/yaml-file.ts: parseYamlFile(file, text) → { value, entries, issues }"
  - "src/content/loading/content-tree.ts: loadContentTree(dir), CONTENT_COLLECTIONS, COLLECTION_DIRS, tipi World/Images/ContentTree"
  - "src/content/rules/content-config.ts: parseContentConfig(raw, file), ContentConfig, FIXED_QUEST_TYPES, RANKED_TIERS, CITY_SIZES"
  - "src/content/rules/enemy-stats.ts: levelFromPe, tierOfLevel, enemyXp, enemyLifePoints, enemyDamages, BASE_ORDER, ENERGY_ORDER"
  - "src/content/rules/quest-prizes.ts: questPrizeCoins, questXpPrize, timeToCompleteMs, dungeonLootRarity, marchMinutesOf"
  - "content/config.yaml, content/images.yaml, test/content-fixtures/config.yaml"
affects: [11-04, 11-05, 11-06, 11-07, 11-08, 11-09, 11-10, 11-11]
tech-stack:
  added: ["yaml 2.9.1"]
  patterns:
    - "parseDocument + LineCounter con uniqueKeys: ogni voce di una lista porta la riga del suo nodo"
    - "config validato chiave per chiave con il percorso (`prizes.heal`, `generator.crimeCityChance`): mai default silenziosi"
    - "regole numeriche pure che ricevono la scala o il ContentConfig, nessun I/O"
key-files:
  created:
    - src/content/content-issue.ts
    - src/content/content-paths.ts
    - src/content/loading/yaml-file.ts
    - src/content/loading/yaml-file.spec.ts
    - src/content/loading/content-tree.ts
    - src/content/loading/content-tree.spec.ts
    - src/content/rules/content-config.ts
    - src/content/rules/content-config.spec.ts
    - src/content/rules/enemy-stats.ts
    - src/content/rules/enemy-stats.spec.ts
    - src/content/rules/quest-prizes.ts
    - src/content/rules/quest-prizes.spec.ts
    - content/config.yaml
    - content/images.yaml
    - test/content-fixtures/config.yaml
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Un file YAML con errori di parsing non produce voci (`value: null`, `entries: []`): il resto del controllo lavora solo su file integri"
  - "Le regole ricevono la sola scala dove basta (`enemyXp(pe, xpScale)`, `enemyLifePoints(pf, hpScale)`, `enemyDamages(dpr, damageScale)`, `levelFromPe(pe, mediumPeByLevel)`, `tierOfLevel(level, tiers)`), il `ContentConfig` intero per i premi"
  - "`legend` non ha moltiplicatore né rarità: premi e rarità con fascia `legend` lanciano `RangeError`"
  - "Chiavi sconosciute alla radice del config sono un errore (un refuso come `prize:` non passa in silenzio)"
metrics:
  duration: "~30 min"
  completed: 2026-11-02
  tasks: 3
  files: 17
---

# Phase 11 Plan 03: fondamenta del seeder — YAML con posizioni, config validato, regole numeriche Summary

`yaml@2.9.1` in `dependencies`, lettura dei file di contenuto con la riga di ogni voce e validazione degli id (stringa, 24 esadecimali minuscoli), caricamento sincrono dell'albero `content/` nell'ordine D-27, `content/config.yaml` con tutte le costanti della fase e il suo parser senza default, e le regole pure (livello, fascia, XP, HP, danni, premi, tempi, cibo) verificate sugli esempi del CONTEXT.

## Commit

| Task | Fase TDD | Commit | Subject |
| ---- | -------- | ------ | ------- |
| 1 | build | b4f50b8 | `build(content): add the yaml parser` |
| 1 | RED | f24cf6a | `test(content): expect the content files loaded with positions` |
| 1 | GREEN | 3385157 | `feat(content): load the content tree with positions` |
| 2 | RED | 027115e | `test(content): expect the content constants validated` |
| 2 | GREEN | 02b2378 | `feat(content): add the content constants and their parser` |
| 3 | RED | 88c73b8 | `test(content): expect the derived enemy and quest numbers` |
| 3 | GREEN | c497847 | `feat(content): add the enemy and quest prize rules` |

Ogni commit verificato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject fra 34 e 61 caratteri (contati con `wc -c` prima del commit).

## Fallimenti attesi (RED)

- Task 1: `npx jest src/content/loading --selectProjects unit` → `Test Suites: 2 failed, 2 total`, `Tests: 0 total` (`Cannot find module 'src/content/content-paths'` / `src/content/loading/yaml-file`).
- Task 2: `npx jest src/content/rules/content-config.spec.ts --selectProjects unit` → `Tests: 17 failed, 1 passed, 18 total` (`content/config.yaml` assente, validazione assente). Verde al primo colpo: `rejects a config that is not a mapping, never a silent default` — il guscio del Task 1 già rifiutava una radice non-mappa (vedi deviazione 1).
- Task 3: `npx jest src/content/rules --selectProjects unit` → `Test Suites: 2 failed, 1 passed, 3 total` (moduli `enemy-stats` e `quest-prizes` inesistenti).

## Verifiche (output chiave)

- `npx jest src/content/loading --selectProjects unit` → `Tests: 13 passed, 13 total`
- `npx jest src/content/rules/content-config.spec.ts src/content/loading --selectProjects unit` → `Tests: 31 passed, 31 total`; `cmp content/config.yaml test/content-fixtures/config.yaml` → identici
- `npx jest src/content --selectProjects unit` → `Test Suites: 5 passed, 5 total`, `Tests: 70 passed, 70 total`
- `npx jest src/content src/config/env-example.drift.spec.ts --selectProjects unit` → `Tests: 73 passed, 73 total` (drift test verde: nessun `process.env.` in `src/content`)
- `npx tsc --noEmit -p tsconfig.json` → exit 0 dopo ogni task; `npx eslint` sui file toccati → 0 problemi
- `node -e "…dependencies.yaml"` → `^2.9.1`; `grep -n '"yaml"' package.json` → riga 56, dentro `dependencies`
- Gate SDL: `git diff --exit-code src/schema.gql` → 0; vs `origin/develop` righe `-` = 1, righe `+` = 0
- `pgrep -fl jest` vuoto a fine di ogni task; `git status --short` vuoto

## Esempi del CONTEXT coperti dai test

| Regola | Esempi |
| ------ | ------ |
| `enemyXp` (D-11) | Lupo 50 → 7, Goblin 135 → 19, Troll 1800 → 254, Beholder 10000 → 1408, Tarrasque 155000 → 21831, PE 1 → 1 |
| `levelFromPe` (D-10) | Bandito 25 → 1, Capo dei Banditi 450 → 4, Veterano 700 → 6, Gladiatore 1800 → 11, Assassino 3900 → 17, Tarrasque 155000 → 20 |
| `tierOfLevel` (D-10) | 1/2 rookie, 3/4 adventurer, 5/10 paladin, 11/16 mage, 17/20 hero; 21 → `RangeError` |
| `enemyLifePoints` / `enemyDamages` (D-12) | 11 × 100 → 1100; `{ pierce: 7, fire: 3.5, cut: 2 }` × 100 → base cut 200, pierce 700; energy fire 350; `enhancing`/sconosciuto → `RangeError` |
| premi (D-19) | guard paladin → `{ gold: 0, silver: 10, copper: 0 }`; hunt rookie → 1 argento; job rookie → 40 rame; dungeon hero → 1 oro; job hero → 0 XP; dungeon mage → 960 XP; `legend` → `RangeError` |
| tempi e cibo (D-21, D-16) | guard → 28800000 ms; hunt → 3600000 ms; `marchMinutesOf(60)` → 180 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Guscio di `content-config.ts` nel Task 1**
- **Found during:** Task 1
- **Issue:** `loadContentTree` deve chiamare `parseContentConfig` (key link del piano) ma il file appartiene al Task 2.
- **Fix:** nel Task 1 `content-config.ts` conteneva solo i tipi e il controllo «radice = mappa»; il Task 2 (RED → GREEN) ha aggiunto la validazione completa.
- **Files modified:** src/content/rules/content-config.ts
- **Commit:** 3385157, 02b2378

**2. [Rule 2 - Correttezza] Validazione del config più stretta del minimo del piano**
- **Found during:** Task 2
- **Issue:** il piano elenca le regole principali; un refuso di chiave o una scala a 0 sarebbero passati.
- **Fix:** anche chiavi sconosciute alla radice, scale/tempi > 0, premi interi ≥ 0, `randomLootQuantity` intero > 0, `seed` intero ≥ 0, `hunt.maxAnimalPe` intero > 0, `dungeonHeroZones[i]` ∈ `PoiType`; test dedicati (`rejects tiers that do not cover the levels 1..20 contiguously (D-10)`, `rejects a scale that is not a positive number`, `rejects a hero zone that is not a point of interest type`, `loads the config of the test content tree (D-19)`).
- **Files modified:** src/content/rules/content-config.ts, src/content/rules/content-config.spec.ts
- **Commit:** 027115e, 02b2378

**3. [Rule 1 - Lint] Tipo del config grezzo nella spec**
- **Found during:** Task 2 (GREEN)
- **Issue:** `npx eslint` segnalava `@typescript-eslint/no-array-delete` per un tipo di comodo `Record & unknown[]` nella spec del RED.
- **Fix:** tipo `RawConfig` corretto nella stessa commit GREEN; nessun cambio di asserzioni.
- **Commit:** 02b2378

### Note

- `npm install yaml@2.9.1` (npm 11) ha cambiato anche il marcatore di `is-stream` da `devOptional` a `dev` nel lockfile: rumore noto dello strumento, committato insieme a `package.json`.
- `ContentTier` è definito come `` `${TitleType}` `` (stessa unione del piano, derivata dall'enum).
- `images.yaml`: le voci senza `id`/`url` stringa vengono scartate in lettura; la validazione vera (id esistenti, URL) è dei controlli del piano 11-04.
- `world/cities.yaml` è letto senza validazione (piano 11-04).

## Known Stubs

Nessuno: `content/images.yaml` con liste vuote è voluto (D-24, lo compila l'utente dopo il caricamento su Cloudinary).

## Self-Check: PASSED

- File creati presenti: tutti i 15 file di `key-files.created` (verificati con `test -f`).
- Commit presenti: b4f50b8, f24cf6a, 3385157, 027115e, 02b2378, 88c73b8, c497847.
