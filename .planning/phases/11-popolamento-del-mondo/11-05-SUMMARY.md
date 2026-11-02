---
phase: 11-popolamento-del-mondo
plan: 05
subsystem: content
tags: [content, checks, offline, quests, BE-CONTENT-01, BE-CONTENT-02, BE-CONTENT-06]
requires: ["11-04"]
provides:
  - "src/content/rules/enemy-facts.ts: EnemyFacts, enemyFactsOf(raw, config)"
  - "src/content/checking/content-index.ts: IndexedEntry, IndexedPoi, ContentIndex (con `entries` in più rispetto al piano), indexContent(tree)"
  - "src/content/checking/check-content.ts: ContentCheck, checkContent(tree) → { errors, warnings }"
  - "test/fixtures/content-tree.fixture.ts: TEST_CONTENT_DIR, loadTestContentTree, entryOf, addEntry, addCity"
  - "content/README.md: formato, campi solo-file, regole derivate, regole delle quest fisse, comandi, prosa"
affects: [11-06, 11-08, 11-10, 11-11, 11-12, 11-13, 11-14, 11-15, 11-16, 11-17, 11-18, 11-19, 11-20, 11-21, 11-22, 11-23]
tech-stack:
  added: []
  patterns:
    - "controlli a famiglie piccole e separate (`duplicateIssues`, `refIssues`, `imageIssues`, `cityLoreErrors`/`cityLoreWarnings`, `questRuleIssues`, `proseIssues`, `nameWarnings`) sopra un indice unico"
    - "regole dei riferimenti in una tabella per collezione (`REF_RULES`) con un `RefChecker` che conosce indice e presenza dello snapshot"
    - "spec che mutano in memoria una copia fresca del mini-albero (`loadTestContentTree` + `entryOf`/`addEntry`/`addCity`)"
key-files:
  created:
    - src/content/rules/enemy-facts.ts
    - src/content/rules/enemy-facts.spec.ts
    - src/content/checking/content-index.ts
    - src/content/checking/content-index.spec.ts
    - src/content/checking/check-content.ts
    - src/content/checking/check-refs.spec.ts
    - src/content/checking/check-quest-rules.spec.ts
    - test/fixtures/content-tree.fixture.ts
    - content/README.md
  modified: []
decisions:
  - "`checkContent` deduplica per `file + line + path` gli issue di loader, schema e prosa (vince il primo messaggio): il CLI non deve deduplicare di nuovo"
  - "Con `config.yaml` invalido `checkContent` restituisce solo gli errori di schema (i controlli dell'indice richiedono il config); gli errori del config bastano a fallire"
  - "La coppia `(type, markerLocation)` ripetuta si controlla solo sui marker di città: sugli altri POI la regola «una quest fissa per POI» la comprende già (un solo errore, non due)"
  - "La fascia derivata di un nemico: `tier` esplicito > `category: legendary` → `legend` > `source.level` (1..20) > `levelFromPe(source.pe)`; senza `source` né `tier` → `null`"
  - "Il warning «città senza lore» è sul file `world/cities.yaml` con la riga della città e `entryId` = id della città"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 3
  files: 9
---

# Phase 11 Plan 05: controlli offline del contenuto e README del formato Summary

`checkContent(tree)` restituisce `{ errors, warnings }` senza database né env: schema e prosa (deduplicati), id doppi anche fra collezioni, riferimenti pendenti verso file e snapshot (con `itemType` coerente, Pitfall 9), immagini per id ignoti, lore di città (D-23) e tutte le regole delle quest fisse (D-17, D-18, D-20, D-21, D-31); `content/README.md` è il riferimento unico per chi scrive i contenuti.

## Commit

| Task | Fase TDD | Commit | Subject |
| ---- | -------- | ------ | ------- |
| 1 | RED | da95b90 | `test(content): expect the content index and enemy facts` |
| 1 | GREEN | bfa8db9 | `feat(content): index the content and derive the enemy facts` |
| 2 | RED | ff796d8 | `test(content): expect the offline content checks` |
| 2 | GREEN | 2070404 | `feat(content): check references and fixed quest rules offline` |
| 3 | — | e98e4f7 | `docs(content): document the content file format` |

Ogni commit verificato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject fra 47 e 61 caratteri (contati con `wc -c` prima del commit).

## Fallimenti attesi (RED)

- Task 1: `npx jest src/content/rules/enemy-facts.spec.ts src/content/checking --selectProjects unit` → `Test Suites: 2 failed, 2 total`, `Tests: 0 total` (moduli `enemy-facts` e `content-index` inesistenti).
- Task 2: `npx jest src/content/checking --selectProjects unit` → `Test Suites: 2 failed, 1 passed, 3 total`, `Tests: 4 passed, 4 total` (modulo `check-content` inesistente; passa solo `content-index.spec.ts`).
- Dopo il GREEN tutti i casi sono verdi al primo colpo; nessun caso era verde in RED (moduli assenti).

## Verifiche (output chiave)

- Task 1: `npx jest src/content/rules src/content/checking --selectProjects unit` → `Test Suites: 5 passed, 5 total`, `Tests: 66 passed, 66 total`; `npx tsc --noEmit -p tsconfig.json` → exit 0; `export function enemyFactsOf` e `export function indexContent` → 1 riga ciascuno.
- Task 2: `npx jest src/content --selectProjects unit` → `Test Suites: 15 passed, 15 total`, `Tests: 190 passed, 190 total`; tsc exit 0; `export function checkContent` → 1 riga; `grep -c "it('"` → 14 in `check-refs.spec.ts` (≥ 13), 16 in `check-quest-rules.spec.ts` (≥ 10); `grep -c "D-17\|D-18\|D-21\|D-31" check-quest-rules.spec.ts` → 28 (≥ 6).
- Task 3: i quattro `grep -q` del verify → ok; `grep -c "^## " content/README.md` → 8 (≥ 7); `mongodump` → 1 riga; `grep -ciE "mongodb(\+srv)?://"` → 0.
- `npx eslint` e `npx prettier --write` sui `.ts` toccati (nominati uno per uno) → puliti.
- `git diff --exit-code src/schema.gql` → 0; vs `origin/develop`: righe `-` = 1, righe `+` = 0; `grep -rn "process.env\." src/content` → nessuna riga; `pgrep -fl jest` vuoto a fine di ogni task; `git status --short` vuoto.

## Controlli e messaggi

| Famiglia | Errore / warning | Path |
| --- | --- | --- |
| id | `id doppio in <collezione>: <id>`; `id già usato in <collezione>: <id>` | `id` |
| riferimenti | `riferimento pendente: <id> non è in <collezione>` | es. `relatedLore.0`, `infos.enemy`, `prizes.spell` |
| `AssetQuantity` | `<id> è in <collezione> ma itemType è <itemType>` | `prizes.randomLoot.0.item` |
| città | `snapshot world/cities.yaml mancante`; `città assente dallo snapshot: <id>` | `city` |
| marker | `riferimento pendente: <id> non è un POI dello snapshot`; `il marker <id> non è un POI di <città>` | `infos.markerLocation` |
| immagini | `immagine per un id che non è in <sezione>: <id>` | `<sezione>.<i>.id` |
| lore di città | `seconda lore per la città <nome> (già in <id>)` (errore); `città senza lore: <nome> (<CityType>)` (warning) | `city` / `''` |
| nomi | `nome doppio in <collezione> (<tipo>): <nome>` (warning) | `name` / `infos.title` |
| prosa | `la prosa finisce con un a capo: usare |- invece di |` (o il messaggio dello schema sullo stesso path) | path del campo |
| D-17 | `a Necrorian solo dungeon (D-17)`; `mai crime a Ferrion (D-17)` | `infos.type` |
| D-18 | `la hunt vuole un animale, non <categoria> (D-18)`; `animale oltre 200 PE: <pe> (D-18)`; `animale senza PE nel source (D-18)`; `la hunt è sempre rookie (D-18)` | `infos.enemy` / `requirements.minTitle` |
| D-20 | `la dungeon vuole un mostro, non <categoria> (D-20)`; `la dungeon va su un POI di tipo dungeon (D-20)`; `la <tipo> vuole un nemico (D-18/D-20)` | `infos.enemy` / `infos.markerLocation` |
| D-21 | `la quest <tipo> sta sul marker della città (D-21)`; `la quest <tipo> non ha nemico (D-21)`; `la hunt va su un POI della zona, non sul marker della città (D-21)`; `la hunt non va su un POI dungeon (D-21)`; `POI già occupato dalla quest <id> (D-21)`; `<tipo> già presente su questo marker: <id> (D-21)` | `infos.markerLocation` / `infos.enemy` |
| D-31 | `il sorteggio della magia è solo sulla study di Valantar (D-31)`; `sorteggio della magia già sulla quest <id> (D-31)`; `prizes.spell solo su una study (D-31)` | `prizes.spellDraw` / `prizes.spell` |

Sul mini-albero `test/content-fixtures/`: `errors = []` e un solo warning, `città senza lore: Capitale di Prova (drusteaCapital)` (c2 non ha lore di città, voluto: il test D-23 lo usa).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloccante/pulizia] Helper condivisi del mini-albero in `test/fixtures/content-tree.fixture.ts`**
- **Found during:** Task 2 (RED)
- **Issue:** le due spec di `checkContent` e quella dell'indice ripetono caricamento del mini-albero, ricerca di una voce per id e aggiunta di voci/città; il piano non elenca un file di helper.
- **Fix:** `TEST_CONTENT_DIR`, `loadTestContentTree()`, `entryOf(tree, collection, id)`, `addEntry(tree, collection, raw)` (file `<collezione>/aggiunte.yaml`), `addCity(tree, city)`; importati con percorso relativo (`../../../test/fixtures/content-tree.fixture`), non riesportati da `test/fixtures/index.ts`.
- **Commit:** ff796d8

**2. [Rule 2 - Correttezza] Casi in più rispetto al minimo del piano**
- `check-refs.spec.ts`: «allows the same name across different types (D-02)». `check-quest-rules.spec.ts`: hunt sul marker della città o su un POI dungeon, nemico su una quest di servizio, study di Valantar col sorteggio accettata, magia fissa fuori da una study, dungeon su un animale, stesso tipo due volte sul marker della città. Regola in più nel codice: `hunt`/`dungeon` senza nemico (`la <tipo> vuole un nemico`).
- **Commit:** ff796d8, 2070404

**3. [Rule 1 - Pulizia] `ContentIndex.entries`**
- **Issue:** l'interfaccia del piano non ha un elenco piatto delle voci; `byCollection` tiene solo la prima voce per id e `allIds` le raggruppa per id, quindi i controlli per voce dovevano ricostruire l'ordine dei file.
- **Fix:** campo additivo `entries: IndexedEntry[]` (voci con id stringa, nell'ordine `CONTENT_COLLECTIONS` → file → riga). Il resto dell'interfaccia è quello del piano.
- **Commit:** bfa8db9

**4. [Nota] Spec di `enemyFactsOf` sul config del mini-albero**
- La spec legge il config con `loadContentTree(test/content-fixtures).config` (copia byte-identica di `content/config.yaml`) invece di duplicare una terza volta l'helper `parseYamlFile` + `parseContentConfig`.

## Note per i piani successivi

- Le `key` dei fix non sono controllate come uniche e non c'è un controllo che i `target` dei fix esistano nello snapshot: se servono, vanno nel piano del CLI/loader dei fix.
- Il README cita gli script `content:check`, `content:new-id`, `content:dry-run`, `content:verify`, `content:apply` (piano 11-11) e `content:generate-quests` (piano 11-23): ancora non in `package.json`.
- `namesById` contiene id delle voci (`name`, o `infos.title` per le quest) e delle città dello snapshot; i POI non hanno nome.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: solo codice offline su file del repo (T-11-16, T-11-17 mitigati con un test per regola; T-11-18: README senza URI).

## Self-Check: PASSED

- File creati presenti: 7 `.ts` in `src/content/rules` e `src/content/checking`, `test/fixtures/content-tree.fixture.ts`, `content/README.md`.
- Commit presenti: da95b90, bfa8db9, ff796d8, 2070404, e98e4f7.
