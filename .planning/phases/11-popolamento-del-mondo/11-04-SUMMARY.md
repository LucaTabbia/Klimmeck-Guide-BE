---
phase: 11-popolamento-del-mondo
plan: 04
subsystem: content
tags: [content, schema, class-validator, fixtures, BE-CONTENT-01, BE-CONTENT-02]
requires: ["11-03"]
provides:
  - "src/content/schema/common.content.ts: decoratori composti (Text, IdField, IdList, NonEmptyIdList, IntBetween, PositiveNumber, OneOf, EachOneOf, Flag, Nested, NestedList, RecordOf, Optional, Nullable, OptionalNullable) e voci CoinsEntry, BaseDamageEntry, EnergyDamageEntry, DamagesEntry, AssetQuantityEntry"
  - "src/content/schema/catalog.content.ts: LoreEntry, SpellEntry, EquipmentEntry, LootEntry, PetEntry, MAX_SPELL_XP_TO_LEARN"
  - "src/content/schema/enemy.content.ts: EnemyEntry, EnemySourceEntry, EnemyAnalogEntry, ENEMY_CATEGORIES"
  - "src/content/schema/quest.content.ts: QuestEntry, QuestInfosEntry, QuestRequirementsEntry, QuestPrizesEntry (riesporta FIXED_QUEST_TYPES)"
  - "src/content/schema/fix.content.ts: FIX_KINDS (4 classi), fixEntryIssues(entry)"
  - "src/content/schema/world.content.ts: WorldCityEntry, WorldPoiEntry, ImageLinkEntry, CLOUDINARY_URL"
  - "src/content/schema/validate-entry.ts: validateEntry(cls, entry), EntrySource"
  - "src/content/schema/validate-tree.ts: validateTreeEntries(tree), ENTRY_CLASSES"
  - "ContentTree.worldEntries (voci dello snapshot con la riga) e controllo strutturale di images.yaml nel loader"
  - "test/content-fixtures/: mini-albero valido (3 lore, 1 magia, 1 equipaggiamento, 1 loot, 2 nemici, 1 pet, 2 quest, 4 fix, 2 città, images vuoto)"
affects: [11-05, 11-06, 11-07, 11-08, 11-09, 11-10, 11-11]
tech-stack:
  added: []
  patterns:
    - "decoratori composti con `applyDecorators` e messaggi italiani: ogni vincolo del formato è una riga leggibile nella classe"
    - "`Optional()` = facoltativo ma mai null; `Nullable()` = obbligatorio con null ammesso; `OptionalNullable()` = `IsOptional`"
    - "un issue per percorso: i messaggi di più vincoli dello stesso campo si uniscono con `; `"
key-files:
  created:
    - src/content/schema/common.content.ts
    - src/content/schema/catalog.content.ts
    - src/content/schema/enemy.content.ts
    - src/content/schema/quest.content.ts
    - src/content/schema/fix.content.ts
    - src/content/schema/world.content.ts
    - src/content/schema/validate-entry.ts
    - src/content/schema/validate-tree.ts
    - src/content/schema/validate-entry.spec.ts
    - src/content/schema/catalog.content.spec.ts
    - src/content/schema/enemy.content.spec.ts
    - src/content/schema/quest.content.spec.ts
    - src/content/schema/fix-world.content.spec.ts
    - src/content/schema/validate-tree.spec.ts
    - test/content-fixtures/lore/esempio.yaml
    - test/content-fixtures/spells/esempio.yaml
    - test/content-fixtures/equipment/esempio.yaml
    - test/content-fixtures/loot/esempio.yaml
    - test/content-fixtures/enemies/esempio.yaml
    - test/content-fixtures/pets/esempio.yaml
    - test/content-fixtures/quests/esempio.yaml
    - test/content-fixtures/fixes/esempio.yaml
    - test/content-fixtures/world/cities.yaml
    - test/content-fixtures/images.yaml
  modified:
    - src/content/loading/content-tree.ts
    - src/content/loading/content-tree.spec.ts
decisions:
  - "La regola «source oppure xp + lifePoints + damages» è un `ValidateIf` sul campo `source` (nessun caso speciale in `validateEntry`)"
  - "`validateEntry(cls, entry)` senza il terzo parametro `collection` del piano: non serviva a nulla"
  - "Ogni stringa obbligatoria rifiuta il newline finale (prosa scritta con `|` invece di `|-`)"
  - "Lo snapshot accetta tipi di POI non nell'enum (sono i valori sporchi da normalizzare col fix `normalizePoiTypes`), ma `CityType` della città è stretto"
  - "`city` di una lore è ammesso solo con `type: city`; `currentLifePoints ≤ maxLifePoints` sui pet"
metrics:
  duration: "~35 min"
  completed: 2026-11-02
  tasks: 3
  files: 26
---

# Phase 11 Plan 04: schema dei file di contenuto e mini-albero di test Summary

Classi class-validator per ogni tipo di file della fase (catalogo, nemici con blocco `source`, quest fisse, 4 fix chiusi, snapshot del mondo, link Cloudinary) con `whitelist` + `forbidNonWhitelisted`, errori annidati appiattiti in percorsi puntati con file, riga e id, e un mini-albero `test/content-fixtures/` valido che i piani successivi riusano.

## Commit

| Task | Fase TDD | Commit | Subject |
| ---- | -------- | ------ | ------- |
| 1 | RED | c8e1c71 | `test(content): expect the catalog entries validated` |
| 1 | GREEN | d62a421 | `feat(content): validate the catalog entries` |
| 2 | RED | 73f6fd5 | `test(content): expect enemies, quests, fixes and world validated` |
| 2 | GREEN | 239fbb3 | `feat(content): validate enemies, quests, fixes and the world snapshot` |
| 3 | RED | 5ef28eb | `test(content): expect the test content tree to be valid` |
| 3 | GREEN | 302d86c | `feat(content): validate the whole content tree` |

Ogni commit verificato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject fra 43 e 69 caratteri (contati con `wc -c` prima del commit).

## Fallimenti attesi (RED)

- Task 1: `npx jest src/content/schema --selectProjects unit` → `Test Suites: 2 failed, 2 total`, `Tests: 0 total` (`src/content/schema/catalog.content` e `validate-entry` inesistenti).
- Task 2: stesso comando → `Test Suites: 3 failed, 2 passed, 5 total`, `Tests: 29 passed` (moduli `enemy.content`, `quest.content`, `fix.content`, `world.content` inesistenti).
- Task 3: `npx jest src/content --selectProjects unit` → `Test Suites: 2 failed, 9 passed, 11 total`, `Tests: 2 failed, 146 passed` (`validate-tree` inesistente; `worldEntries` assente; link malformati di `images.yaml` scartati in silenzio).
- Verdi al primo colpo dopo il GREEN: tutti; nessun caso verde già in RED (i moduli non esistevano).

## Verifiche (output chiave)

- Task 1: `npx jest src/content/schema --selectProjects unit` → `Tests: 29 passed, 29 total`; `npx tsc --noEmit -p tsconfig.json` → exit 0; `grep -c "export class" catalog.content.ts` → 5; `forbidNonWhitelisted: true` → 1 riga; `Object.values(` in common + catalog → 7 (≥ 6).
- Task 2: `npx jest src/content/schema --selectProjects unit` → `Tests: 76 passed, 76 total`; tsc exit 0; `grep -c "normalizePoiTypes\|renameCity\|deleteQuests\|unsetLoreUnlocked" fix.content.ts` → 12; `grep -c "res.cloudinary.com" world.content.ts` → 1.
- Task 3: `npx jest src/content --selectProjects unit` → `Test Suites: 11 passed, 11 total`, `Tests: 151 passed, 151 total`; con il drift test (`src/config/env-example.drift.spec.ts`) → `Tests: 154 passed, 154 total`; tsc exit 0; `ls test/content-fixtures/{…}/*.yaml | wc -l` → 9; `grep -c "kind:" fixes/esempio.yaml` → 4; `export function validateTreeEntries` → 1 riga.
- `npx eslint` e `npx prettier --check` sui file `.ts` toccati → puliti.
- `cmp content/config.yaml test/content-fixtures/config.yaml` → identici; `git diff --exit-code src/schema.gql` → 0; `grep -rn "process.env\." src/content` → nessuna riga.
- `pgrep -fl jest` vuoto a fine di ogni task; `git status --short` vuoto.

## Vincoli coperti dai test

| Collezione | Casi rifiutati |
| ---------- | -------------- |
| lore | `type: town`, senza `description`, `unlocked` (campo sconosciuto, D-25), `city` su una lore non di città |
| magie | `maxUsages: 0`, `minXpToLearn: 60000` |
| equipaggiamento/loot | `itemType` incoerente, `damages.base` oggetto, `Coins` negativi o frazionari, `effect: food`, `sellable` non booleano |
| pet | senza `imagePath`, `speedModifier: 0`, `currentLifePoints > maxLifePoints` |
| nemici | senza `source` né override, `category: dragon`, `locations: []` o fuori `PoiType`, debolezza `enhancing`, debolezza base fuori `DamageType`, `damagePerRound` con chiave ignota/`enhancing`/valore 0, `source.pe: 0`, `source.level: 21`, chiave ignota in `source`, `tier: boss`, `imagePath` vuoto, `xp: 0` |
| quest | `infos.type: enemy`, `minTitle: legend`, `quantity: 0`, `spellDraw: 'yes'`, `prizeCoins.gold: -1`, marker non id, chiave ignota in `prizes`, senza `city` |
| fix | `kind` fuori dall'insieme chiuso, `renameCity` senza `to`, `deleteQuests` con `ids: []`, sostituzione fuori `PoiType`, `key` vuota, campo di un altro `kind` |
| snapshot/immagini | città senza `markerLocation`, `location` di 3 numeri, `CityType` ignoto, URL non Cloudinary |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] Il loader espone le voci dello snapshot e controlla la struttura di `images.yaml`**
- **Found during:** Task 3
- **Issue:** `loadContentTree` restituiva lo snapshot come cast senza righe e scartava in silenzio i link di `images.yaml` senza `id`/`url` stringa: `validateTreeEntries` non poteva né riportare la riga di una città né vedere un link malformato (D-28, T-11-15).
- **Fix:** `ContentTree.worldEntries: LoadedEntry[]` (voci con riga, radice non lista → `il file deve essere una lista di voci`); in `images.yaml` restano tutti i link a forma di mappa, mentre sezione non lista (`deve essere una lista`), voce non mappa (`la voce non è una mappa chiave: valore`, path `lore.1`) e sezione sconosciuta (`sezione sconosciuta`) sono issue del loader. Due test nuovi in `content-tree.spec.ts`.
- **Files modified:** src/content/loading/content-tree.ts, src/content/loading/content-tree.spec.ts
- **Commit:** 5ef28eb, 302d86c

**2. [Rule 1 - Pulizia] `FIXED_QUEST_TYPES` riesportato, non ridichiarato**
- **Found during:** Task 2
- **Issue:** il piano chiede `export const FIXED_QUEST_TYPES` in `quest.content.ts`, ma la costante esiste già in `src/content/rules/content-config.ts` (piano 11-03), che ne prezza i premi; spostarla creerebbe un import circolare fra regole e schema.
- **Fix:** `export { FIXED_QUEST_TYPES };` in `quest.content.ts` (stesso simbolo). Il grep di accettazione `export const FIXED_QUEST_TYPES` sul file non trova righe: il simbolo è comunque esportato da lì.
- **Files modified:** src/content/schema/quest.content.ts
- **Commit:** 239fbb3

**3. [Rule 1 - Pulizia] `validateEntry` senza il parametro `collection`**
- **Found during:** Task 1
- **Issue:** la firma del piano `validateEntry(cls, entry, collection)` aveva un parametro senza uso.
- **Fix:** `validateEntry(cls, entry: EntrySource)`; `EntrySource` ammette `line: null` per i link di `images.yaml`. L'id della voce è `raw.id`, o `raw.key` per i fix.
- **Commit:** d62a421

**4. [Rule 1 - Tipi] Spec del catalogo non compilava con tsc**
- **Found during:** Task 1 (GREEN)
- **Issue:** ts-jest non fa type check: nel commit RED `catalog.content.spec.ts` passava una unione di classi a `validateEntry` (TS2345).
- **Fix:** `validateEntry<object>(…)` nella spec, incluso nel commit GREEN.
- **Commit:** d62a421

**5. [Rule 2 - Correttezza] Vincoli in più rispetto al minimo del piano**
- Stringhe obbligatorie senza newline finale (regola della prosa della RESEARCH §Pattern 4); `city` solo su lore `type: city`; `currentLifePoints ≤ maxLifePoints`; `xp`/`lifePoints` ≤ Int a 32 bit; `CityType` stretto sullo snapshot. Ognuno con un test.

## Note per i piani successivi

- Gli id malformati delle voci radice sono riportati due volte se il CLI unisce `tree.issues` (loader, piano 11-03) e `validateTreeEntries` (`IdField`): deduplicare per `file + line + path` o filtrare `path: 'id'` nel report.
- I controlli trasversali (ref esistenti, id unici, marker della città, hunt su animali, `key` dei fix uniche) non sono qui: restano a `--check`/`--verify`.
- Il Wave 0 della VALIDATION indica «3 lore» (il task dice 3 voci, la truth del piano «2»): il mini-albero ne ha 3.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti (14 `.ts` in `src/content/schema/`, 10 `.yaml` in `test/content-fixtures/`).
- Commit presenti: c8e1c71, d62a421, 73f6fd5, 239fbb3, 5ef28eb, 302d86c.
