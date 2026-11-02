---
phase: 11-popolamento-del-mondo
plan: 10
subsystem: content
tags: [content, export, yaml, round-trip, BE-CONTENT-01, BE-CONTENT-02]
requires: ["11-06", "11-07", "11-09"]
provides:
  - "src/content/export/yaml-writer.ts: entriesToYaml(entries, namesById, header?) → string, writeEntriesFile(path, entries, namesById, header?) (mkdir -p + writeFileSync utf8)"
  - "src/content/export/entry-from-document.ts: StoredDocument, ExportedEntry { entry, normalized, dropped }, hexOf, loreEntryOf(doc, cityByLore), spellEntryOf, equipmentEntryOf, lootEntryOf, enemyEntryOf, petEntryOf, worldCityOf(city, pois)"
  - "src/content/export/export-content.ts: exportContent(db, dir, now = new Date()) → ExportReport, ExportDirNotEmptyError, DELETE_TEST_QUESTS_FILE = 'fixes/delete-test-quests.yaml', DELETE_TEST_QUESTS_KEY = 'delete-talmvere-test-quests'"
affects: [11-11, 11-12, 11-23]
tech-stack:
  added: []
  patterns:
    - "scrittura YAML con `Document` + `visit` della libreria `yaml`: id a 24 esadecimali sempre `QUOTE_SINGLE`, commento ` <nome>` sui riferimenti noti (mai sul valore di una chiave `id`), liste di valori semplici in flow senza padding, `description` sempre blocco `|-`"
    - "inverso dei mapper: ogni voce esportata ricostruisce le chiavi nell'ordine del README e, ricaricata e rimappata, dà documenti byte-identici a quelli a DB"
    - "export di sola lettura: cartella non vuota rifiutata prima di qualunque lettura del DB; dalle quest solo `_id`, `infos.type`, `infos.title`, `infos.markerLocation`"
key-files:
  created:
    - src/content/export/yaml-writer.ts
    - src/content/export/yaml-writer.spec.ts
    - src/content/export/entry-from-document.ts
    - src/content/export/entry-from-document.spec.ts
    - src/content/export/export-content.ts
    - src/content/export/export-content.int-spec.ts
  modified: []
decisions:
  - "Tutti gli inversi restituiscono `ExportedEntry { entry, normalized, dropped }` (anche lore e magie, che nel piano restituivano la sola voce): così il report riporta in modo uniforme i campi fuori schema di ogni collezione"
  - "`__v`, `unlocked` e `_id` si tolgono senza segnalarli; `dropped` = solo campi fuori schema (es. `legacyStock`); `sellable` legacy resta in coda se presente"
  - "Default riempiti: lore `image: null`, `relatedLore: []`, `name`/`description`/`type` null; prezzi assenti → null, monete parziali → 0 sui tagli mancanti; `addedSpell` → null; `damages` assente → `{ base: [], energy: [] }`; pet `speedModifier` → null; liste del nemico assenti → `[]`"
  - "Il nemico esportato è `category: monster` con `xp`, `lifePoints` e `damages` espliciti e senza `source`; le copie embedded di `spells` tornano id del catalogo"
  - "File raggruppati per `equipType`/`effect`/`useType` solo se il valore è un identificatore semplice (`^[A-Za-z0-9_-]+$`), altrimenti `senza-tipo.yaml`: un valore del DB non diventa mai un percorso (Rule 2)"
  - "Gruppi vuoti non producono file; `world/cities.yaml` e `fixes/delete-test-quests.yaml` si scrivono sempre (il secondo vuoto `[]` se non ci sono quest, perché `deleteQuests` richiede almeno un id); file nel report in ordine alfabetico"
  - "Un POI appartiene alla città che lo elenca in `pointsOfInterest`, altrimenti a quella del suo campo `city`; i POI di nessuna città restano fuori dallo snapshot ma contano in `counts.pointsofinterest`"
  - "Etichette dei commenti: POI `<città> — POI <tipi separati da virgola>`, quest `[<tipo>] <titolo> — <città del marker>` (senza città se il marker non è noto); il primo nome per id vince"
  - "Ogni `description` esportata è un blocco `|-` anche su una riga sola (stile del README §Prosa); `null` resta `null`"
metrics:
  duration: "~35 min"
  completed: 2026-11-02
  tasks: 2
  files: 6
---

# Phase 11 Plan 10: export una tantum con commenti `# nome` Summary

Esportatore di sola lettura del catalogo a DB (lore, nemici, pet, magie, equipaggiamento, loot) più lo snapshot `world/cities.yaml` e la lista `fixes/delete-test-quests.yaml` precompilata con tutte le quest, scritto da un writer YAML che quota sempre gli id e mette il nome come commento accanto a ogni riferimento; provato solo sul replica set di test col mini-albero, con round-trip export → caricamento → mapper byte-identico ai documenti a DB.

## Cosa è stato fatto

- **Task 1 — writer e inverso dei mapper.** `entriesToYaml` costruisce un `Document` della libreria `yaml`, con `visit` marca gli id della voce (chiave `id`, a ogni livello) per escluderli dal commento, quota ogni stringa di 24 esadecimali (Pitfall 6: `'123e4567890123456789abcd'` resta stringa al ri-parse), commenta i riferimenti noti, mette in flow le liste di valori semplici (`locations: [forest, hills]`, `location: [9.1, 45.4]`), scrive l'intestazione come `commentBefore` e serializza con `lineWidth: 0`, `blockQuote: 'literal'`, `singleQuote: true`, `flowCollectionPadding: false`. `entry-from-document.ts` ricostruisce le voci nel formato del README da documenti del driver (ObjectId → hex, default dello schema, `damages.base`/`energy` oggetto → lista riportata in `normalized`, campi fuori schema in `dropped`, `city` delle lore ricavata da `cities.relatedLore`).
- **Task 2 — `exportContent`.** Rifiuta una cartella non vuota con `ExportDirNotEmptyError` prima di leggere il DB (la crea se manca), legge le 6 collezioni di catalogo, `cities`, `pointsofinterest` e `quests` (proiezione minima) ordinate per `_id`, scrive `equipment/<equipType>.yaml`, `loot/<effect>.yaml`, `spells/<useType>.yaml`, `pets/cavalcature.yaml`, `enemies/esistenti.yaml`, `lore/citta-esistenti.yaml`, `lore/esistenti.yaml`, `world/cities.yaml` (città per tipo poi nome, POI per id, `location` `[lng, lat]` invariata) e `fixes/delete-test-quests.yaml`, ognuno con l'intestazione `# Esportato da --export il <AAAA-MM-GG>: da qui in poi il file è la fonte di verità (D-04)`; la data arriva dal parametro `now`.

Estratto reale dell'export del mini-albero (int-spec):

```yaml
- key: delete-talmvere-test-quests
  kind: deleteQuests
  ids:
    - '64b000000000000000000301' # [heal] Cure al tempio del Borgo di Prova — Borgo di Prova
    - '64b000000000000000000302' # [hunt] Caccia al lupo nei boschi del Borgo di Prova — Borgo di Prova
```

## TDD

| Fase | Commit | Esito atteso / osservato |
| --- | --- | --- |
| RED Task 1 | `8565394` | 2 suite fallite: `Cannot find module './entry-from-document'` / `'./yaml-writer'` |
| GREEN Task 1 | `0782e0a` | 17/17 unit verdi |
| RED Task 2 | `025bd26` | 1 suite fallita: `Cannot find module './export-content'` |
| GREEN Task 2 | `91cb65d` | 5/5 int verdi |
| Rifinitura | `ba28845` | nuovo caso `writes every description as a literal block…` visto rosso (1 failed, 7 passed) prima dell'implementazione, poi 18/18 |

Nessun caso verde al primo colpo prima dell'implementazione.

## Verifiche

- `npx jest src/content/export --selectProjects unit` → `Tests: 18 passed, 18 total`
- `npx jest src/content/export --selectProjects integration --runInBand` → `Tests: 5 passed, 5 total` (export completo, cartella non vuota, round-trip, immagine Cloudinary, normalizzazione dei danni)
- `npx jest src/content --selectProjects unit` → `Test Suites: 31 passed`, `Tests: 329 passed, 329 total`
- `npx tsc --noEmit -p tsconfig.json` → exit 0; `npx eslint` e `npx prettier --check` puliti sui 6 file
- Acceptance: `lineWidth: 0` (1 riga), `export function entriesToYaml` (1 riga), `export class ExportDirNotEmptyError` (1 riga), nessuna operazione di scrittura Mongo in `export-content.ts`, 5 `it('` nella int-spec, nessun `process.env.` in `src/content/export/`
- `git diff --exit-code src/schema.gql` → exit 0; `pgrep -fl jest` vuoto

Il round-trip carica la cartella esportata (con `config.yaml` copiato dal mini-albero), verifica `checkContent(...).errors = []`, rimappa con `mapContentTree` e confronta ogni campo di ogni `set` con il documento a DB letto con `promoteValues: false` tramite `sameBson`, per lore, magie, equipaggiamento, loot, nemici e pet (conteggi uguali a quelli del DB).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Sicurezza] Nomi dei file di gruppo solo da identificatori semplici**
- **Trovato durante:** Task 2
- **Problema:** `equipType`/`effect`/`useType` letti dal DB finiscono nel percorso del file: un valore sporco con `/` o `..` scriverebbe fuori dalla cartella di export.
- **Fix:** `groupFile` accetta solo `^[A-Za-z0-9_-]+$`, altrimenti `senza-tipo.yaml`.
- **File:** `src/content/export/export-content.ts` — **Commit:** `91cb65d`

**2. [Rule 1 - Coerenza] Forma uniforme degli inversi**
- **Trovato durante:** Task 1
- **Problema:** l'interfaccia del piano faceva restituire a `loreEntryOf`/`spellEntryOf` la sola voce, perdendo i campi fuori schema di lore e magie nel report.
- **Fix:** tutti restituiscono `ExportedEntry { entry, normalized, dropped }`.
- **Commit:** `0782e0a`

**3. [Rule 2 - Stile del README] `description` sempre in blocco `|-`**
- **Trovato durante:** controllo dell'output dell'int-spec (le descrizioni su una riga uscivano plain).
- **Fix:** il writer forza `BLOCK_LITERAL` sulle stringhe sotto `description`; test dedicato. Il RED è stato osservato ma committato insieme al GREEN in un unico commit `feat`.
- **Commit:** `ba28845`

Aggiunte di test oltre il piano: `writes short lists of plain values on one line`, `creates the missing folders and writes the YAML text`, `exports a spell in the order of its schema`, `writes the world snapshot of a city with its points of interest by id (Pitfall 10)`.

## Note per i piani successivi

- 11-11 (CLI `--export <dir>`): chiamare `exportContent(db, dir)` e uscire con codice d'uso se lancia `ExportDirNotEmptyError` (messaggio `La cartella di export non è vuota: <dir>`); il report è serializzabile così com'è (nessun URI).
- 11-12 (export reale): la prima `--apply` dopo l'export modificherà i documenti scritti con mongosh (Pitfall 3); `normalized` e `droppedFields` del report vanno riportati nel SUMMARY; i tipi POI sporchi restano tali nello snapshot (li pulisce `normalizePoiTypes`); `fix-runner.spec.ts` va aggiornato quando arriva `delete-test-quests.yaml`.
- 11-23 (generatore): `writeEntriesFile(path, entries, namesById, header?)` è pronto; `namesById` può venire da `indexContent(tree).namesById`.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-11-38..T-11-41 mitigati: proiezione minima sulle quest, cartella non vuota rifiutata prima di ogni lettura, nessuna scrittura sul DB, id sempre fra apici con test di ri-parse).

## Self-Check: PASSED
