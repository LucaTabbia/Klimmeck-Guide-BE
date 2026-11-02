---
phase: 11-popolamento-del-mondo
plan: 06
subsystem: content
tags: [content, mapping, canonical, idempotency, BE-CONTENT-02, BE-CONTENT-04, BE-CONTENT-06]
requires: ["11-04"]
provides:
  - "src/content/mapping/canonical.ts: MappedDocument, CityLoreUpdate, toObjectId(hex), toObjectIds(hexes), assertNoUndefined(value, path?)"
  - "src/content/mapping/catalog.mapper.ts: ImageUrls, imageUrlsOf(links), coinsOf, damagesOf, spellFieldsOf, mapLore, cityLoreOf, mapSpell, mapEquipment, mapLoot, mapPet"
  - "src/content/mapping/enemy.mapper.ts: mapEnemy(entry, spellsById, config, images)"
  - "src/content/mapping/quest.mapper.ts: mapQuest(entry, config)"
  - "src/content/mapping/map-content.ts: MappedContent, mapContentTree(tree) (+ riesporta i tipi MappedDocument, CityLoreUpdate)"
affects: [11-07, 11-08, 11-09, 11-10, 11-11, 11-23, 11-24]
tech-stack:
  added: []
  patterns:
    - "ogni (sotto)documento è un letterale nell'ordine dei `@Prop` dello schema, mai uno spread della voce"
    - "ref sempre `ObjectId` del driver nativo `mongodb` (validato come esadecimale a 24 minuscolo)"
    - "tabella `MAPPERS` per collezione + contesto unico (config, indice delle magie, immagini per sezione)"
key-files:
  created:
    - src/content/mapping/canonical.ts
    - src/content/mapping/canonical.spec.ts
    - src/content/mapping/catalog.mapper.ts
    - src/content/mapping/catalog.mapper.spec.ts
    - src/content/mapping/enemy.mapper.ts
    - src/content/mapping/enemy.mapper.spec.ts
    - src/content/mapping/quest.mapper.ts
    - src/content/mapping/quest.mapper.spec.ts
    - src/content/mapping/map-content.ts
    - src/content/mapping/map-content.spec.ts
  modified: []
decisions:
  - "`MappedDocument` e `CityLoreUpdate` vivono in `canonical.ts` (servono già ai mapper del Task 1) e `map-content.ts` li riesporta come tipi: l'interfaccia del piano è rispettata"
  - "`toObjectId` rifiuta con `RangeError` tutto ciò che non è un esadecimale a 24 minuscolo (`isObjectIdHex`): `new ObjectId` accetterebbe anche stringhe di 12 caratteri"
  - "`assertNoUndefined` scende solo in array e oggetti semplici: `ObjectId` e altre istanze sono foglie; messaggio `Valore undefined in <path>` (`TypeError`)"
  - "Immagini: il link di `images.yaml` vince sul valore del file (`Lore.image`, `Enemy.imagePath`, `Pet.imagePath`); senza link resta il valore del file (`image` assente → `null`)"
  - "Nemici: override espliciti (`xp`, `lifePoints`, `damages`) vincono campo per campo sui valori derivati da `source`; una magia referenziata assente dal catalogo lancia (`Magia assente dal catalogo: <id>`)"
  - "Quest: `prizeCoins` override riordinato in `gold, silver, copper`; `prizeItem` e `spell` assenti → `null`; `spellDraw` assente → `false`; `setOnInsert` è un letterale nuovo a ogni chiamata (nessun array condiviso fra documenti)"
  - "`mapContentTree` lancia `config.yaml non valido: …` se `tree.config` è `null`; non riesegue i controlli (il chiamante passa da `checkContent`)"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 3
  files: 10
---

# Phase 11 Plan 06: mapper canonici voce → documento Summary

Funzioni pure che trasformano ogni voce controllata in `{ _id, set, setOnInsert }` con chiavi nell'ordine dei `@Prop`, ref `ObjectId`, nessun `undefined`: i nemici derivano `xp`/`lifePoints`/`damages` dal blocco `source` e dal config e copiano le magie intere, le quest calcolano premi e tempi (ore × 3 600 000) dal `minTitle` e tengono i campi runtime solo all'inserimento, le lore di città producono l'aggiornamento di sola `relatedLore` e `images.yaml` sovrascrive immagini di lore, nemici e pet.

## Commit

| Task | Fase TDD | Commit | Subject |
| ---- | -------- | ------ | ------- |
| 1 | RED | 9bd5c05 | `test(content): expect canonical catalog documents` |
| 1 | GREEN | 6654437 | `feat(content): map catalog entries to canonical documents` |
| 2 | RED | 24c1c1b | `test(content): expect canonical enemy and quest documents` |
| 2 | GREEN | e1cc429 | `feat(content): map enemies and fixed quests to canonical documents` |
| 3 | RED | 275cbcc | `test(content): expect the whole tree mapped` |
| 3 | GREEN | 13e3579 | `feat(content): map the whole content tree` |

Ogni commit verificato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject fra 41 e 66 caratteri (contati con `wc -c` prima del commit). Nessun REFACTOR separato (la pulizia di `setOnInsert` in una funzione è avvenuta prima del commit GREEN del Task 2).

## Fallimenti attesi (RED)

- Task 1: `npx jest src/content/mapping --selectProjects unit` → `Test Suites: 2 failed, 2 total`, `Tests: 0 total` (moduli `canonical` e `catalog.mapper` inesistenti).
- Task 2: stessa riga → `Test Suites: 2 failed, 2 passed, 4 total`, `Tests: 14 passed, 14 total` (moduli `enemy.mapper` e `quest.mapper` inesistenti).
- Task 3: `npx jest src/content/mapping/map-content.spec.ts --selectProjects unit` → `Test Suites: 1 failed, 1 total`, `Could not locate module src/content/mapping/map-content`.
- Nessun caso verde in RED (moduli assenti); dopo il GREEN tutti verdi al primo colpo.

## Verifiche (output chiave)

- Task 1: `npx jest src/content/mapping --selectProjects unit` → `Tests: 14 passed, 14 total`; `npx tsc --noEmit -p tsconfig.json` → exit 0; `grep -n "\.\.\.entry\|\.\.\.raw" src/content/mapping/*.ts | grep -v spec` → nessuna riga; `export function assertNoUndefined` → 1 riga.
- Task 2: `npx jest src/content/mapping --selectProjects unit` → `Test Suites: 4 passed, 4 total`, `Tests: 29 passed, 29 total`; tsc exit 0; `registeredAdventurers` in `quest.mapper.ts` solo alla riga 25 (dentro `runtimeFieldsOnInsert`); conteggio `D-1[129]|D-31|Pitfall` nelle due spec → `1` (≥ 6).
- Task 3: `npx jest src/content --selectProjects unit` → `Test Suites: 20 passed, 20 total`, `Tests: 224 passed, 224 total`; tsc exit 0; `export function mapContentTree` → 1 riga.
- `npx prettier --write` e `npx eslint` sui 10 `.ts` del piano (nominati uno per uno) → puliti.
- `git diff --exit-code src/schema.gql` → 0; vs `origin/develop`: righe `-` = 1, righe `+` = 0; `grep -rn "process\.env\." src/content` → 0 righe; `pgrep -fl jest` vuoto a fine di ogni task.

## Ordini canonici scritti

| Collezione | Chiavi del `set` (in ordine) |
| --- | --- |
| lore | `type, image, name, description, relatedLore` |
| spells | `name, description, useType, energyDamage{type, power}, requiredLearnTime, minXpToLearn, recoveryTime, maxUsages` |
| equipmentitems | `name, itemType, description, sellPrice, buyPrice, rarity, equipType, addedSpell, damages{base, energy}` (+ `sellable` se nel file) |
| lootitems | `name, itemType, description, sellPrice, buyPrice, rarity, power, effect` (+ `sellable` se nel file) |
| enemies | `name, locations, energyWeaknesses, baseWeaknesses, relatedLore, xp, spells[_id + campi magia], lifePoints, imagePath, damages` |
| pets | `name, damages, buyPrice, sellPrice, xp, maxXp, currentLifePoints, maxLifePoints, imagePath, speedModifier` |
| quests | `infos{timeToComplete, title, enemy, type, markerLocation, relatedLore}, requirements{requiredPoints: null, requiredAdventurers: [], recommendedLoot, minTitle}, prizes{prizeCoins, xpPrize, prizeItem, randomLoot, spell, spellDraw}`; `setOnInsert` = `{ registeredAdventurers: [], concludedAt: null, startedAt: null, rescue: null }` |
| cities (`cityLore`) | `{ cityId, relatedLore }` → il sync scriverà solo `relatedLore` |

Coins sempre `gold, silver, copper`; `AssetQuantity` sempre `itemType, item, quantity`. Mai nei documenti: `id`, lore `city`, nemici `category`/`tier`/`source`, quest `city`.

## Esempi verificati

| Caso | Valore |
| --- | --- |
| Lupo di Prova (PE 50, PF 11, pierce 7) | `xp: 7`, `lifePoints: 1100`, `damages.base: [{ type: pierce, power: 700 }]` |
| Golem di Prova (override) | `xp: 63`, `lifePoints: 5000`, `damages.base: [{ type: blunt, power: 1000 }]`, `spells[0]._id` = `…b1` |
| guard paladin | `prizeCoins { gold: 0, silver: 10, copper: 0 }`, `xpPrize: 200` |
| job | `xpPrize: 0` |
| heal | `timeToComplete: 18000000` |
| mini-albero intero | 3 lore, 1 spell, 1 equip, 1 loot, 2 nemici, 1 pet, 2 quest; `cityLore` = `[{ c1, a2 }]` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] Casi in più rispetto al minimo del piano**
- `catalog.mapper.spec.ts`: default della lore senza `image`/`relatedLore`, ordine delle chiavi di magia, equipaggiamento (con `buyPrice: null`) e pet (con `speedModifier` assente → `null`), `addedSpell` come `ObjectId`. `enemy.mapper.spec.ts`: magia referenziata assente dal catalogo → errore. `quest.mapper.spec.ts`: ordine delle chiavi di `infos`/`requirements`/`prizes` con ref `ObjectId`, `prizes.spell` di una study come `ObjectId`. `map-content.spec.ts`: link di `images.yaml` applicati sull'albero intero, albero con config `null` rifiutato. `canonical.spec.ts`: id non esadecimale → `RangeError`.
- **Commit:** 9bd5c05, 24c1c1b, 275cbcc

**2. [Rule 3 - Struttura] Tipi `MappedDocument`/`CityLoreUpdate` in `canonical.ts`**
- **Issue:** il piano li elenca fra gli export di `map-content.ts` (Task 3), ma i mapper del Task 1 li restituiscono già.
- **Fix:** definiti in `canonical.ts`, riesportati come tipi da `map-content.ts` (`export type { CityLoreUpdate, MappedDocument }`).
- **Commit:** 6654437, 13e3579

**3. [Nota] Export ausiliari**
- `toObjectIds`, `imageUrlsOf`/`ImageUrls`, `coinsOf`, `damagesOf`, `spellFieldsOf` sono esportati per il riuso fra mapper (copie delle magie nei nemici, monete delle quest): nessuna duplicazione.

## Note per i piani successivi

- Il sync (diff BSON, upsert) riceve `MappedContent`: `documents[collection][i]._id` nel filtro, `set` nel `$set`, `setOnInsert` (solo quest, altrimenti `null`) nel `$setOnInsert`; `cityLore` va scritto con un update di sola `relatedLore` sulla collezione `cities`.
- Due chiamate di `mapContentTree` sullo stesso albero danno documenti `toEqual`; i documenti non condividono array o oggetti con la voce sorgente (`locations` e debolezze copiate).

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: funzioni pure senza DB né env. T-11-19 (runtime solo in `setOnInsert`, test «writes runtime fields only on insert»), T-11-20 (`CityLoreUpdate` di sola `relatedLore`), T-11-21 (ogni ref `ObjectId`, test con `toBeInstanceOf(ObjectId)`), T-11-22 (`assertNoUndefined` in ogni test e sull'output intero) mitigati.

## Self-Check: PASSED

- File creati presenti: 10 `.ts` in `src/content/mapping/`.
- Commit presenti: 9bd5c05, 6654437, 24c1c1b, e1cc429, 275cbcc, 13e3579.
