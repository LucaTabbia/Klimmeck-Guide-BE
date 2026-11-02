---
phase: 11-popolamento-del-mondo
plan: 12
subsystem: content
tags: [content, export, seeder, stats, BE-CONTENT-01, BE-CONTENT-02, BE-CONTENT-05, BE-CONTENT-07]
requires: ["11-10", "11-11"]
provides:
  - "src/content/analysis/catalog-stats.ts: catalogStats(tree) → CatalogStats, distributionOf(values) → Distribution, winChance(partyPower, lifePoints)"
  - "CLI offline `--stats` (`parseCliArgs(['--stats'])` → `{ mode: 'stats', contentDir }`), exit 0 oppure 1 con il report di `--check` se l'albero ha errori"
  - "content/: catalogo reale esportato (145 equipaggiamenti, 83 loot, 77 magie, 1 pet, 1 nemico, 12 lore di città) + snapshot world/cities.yaml (167 città, 642 POI) allineato ai fix + fixes/delete-test-quests.yaml (16 id)"
  - "reports/11-12-export.json, reports/11-12-verify-baseline.json, reports/11-12-stats.json (senza URI)"
affects: [11-13, 11-14, 11-15, 11-16, 11-17, 11-18, 11-19, 11-20, 11-21, 11-22, 11-23, 11-24, 11-25]
tech-stack:
  added: []
  patterns:
    - "misura del catalogo offline dai soli file (stessa formula del resolver segnaposto, resolver invariato)"
    - "correzioni ai dati esportati fatte nel file con commento `# corretto in 11-12: <motivo>` sulla riga"
key-files:
  created:
    - src/content/analysis/catalog-stats.ts
    - src/content/analysis/catalog-stats.spec.ts
    - content/equipment/*.yaml (9 file per equipType)
    - content/loot/*.yaml (5 file per effect)
    - content/spells/*.yaml (8 file per useType)
    - content/pets/cavalcature.yaml
    - content/enemies/esistenti.yaml
    - content/lore/citta-esistenti.yaml
    - content/world/cities.yaml
    - content/fixes/delete-test-quests.yaml
    - .planning/phases/11-popolamento-del-mondo/reports/11-12-export.json
    - .planning/phases/11-popolamento-del-mondo/reports/11-12-verify-baseline.json
    - .planning/phases/11-popolamento-del-mondo/reports/11-12-stats.json
  modified:
    - src/content/cli-args.ts
    - src/content/cli-args.spec.ts
    - src/content/run-content.ts
    - src/content/fixes/fix-runner.spec.ts
decisions:
  - "`--stats` su un albero con errori stampa il report di `--check` ed esce 1 (misure su dati invalidi ingannerebbero)"
  - "Distribuzione vuota = `{count: 0, min: 0, median: 0, max: 0}`; gruppi ordinati alfabeticamente; valore di gruppo assente → `(senza valore)`"
  - "Tarrasque: `partyPower` = mediana legendary × 45 (5 legend × 9 pezzi)"
  - "3 `addedSpell` pendenti (magie assenti a DB) messi a `null` nel file; `locations` vuoto dell'Arbusto Maligno → `[all]` (habitat ignoto, D-13)"
  - "La cartella temporanea di export è nello scratchpad della sessione (al posto di `mktemp -d`), cancellata dopo la copia"
metrics:
  duration: "~30 min"
  completed: 2026-11-02
  tasks: 3
  files: 37
---

# Phase 11 Plan 12: export reale, snapshot del mondo, baseline `--verify` e misura D-12 Summary

Export di sola lettura del database reale nei file di `content/` (conteggi identici all'inventario del 2026-11-01), snapshot del mondo allineato ai fix dichiarati (6 POI normalizzati, Kliever), lista delle 16 quest di prova di Talmvere, baseline `--verify` senza URI e modalità offline `--stats` che misura la potenza del catalogo e ricalcola la tabella di `winChance` per l'handoff.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | `0a73b36` | `test(content): expect the catalog power statistics` |
| 1 GREEN | `5ad5b17` | `feat(content): measure the catalog power offline` |
| 2 | `c38ef18` | `feat(content): export the existing catalog and world snapshot` |
| 3 | `a46b13b` | `docs(phase-11): record the read-only verify baseline and catalog stats` |

## Task 1 — `--stats` (TDD)

- RED: `catalog-stats.spec.ts` falliva per modulo assente (`Cannot find module 'src/content/analysis/catalog-stats'`), `cli-args.spec.ts` per `['--stats']` → `null` (1 test rosso, 27 verdi).
- GREEN: `npx jest src/content/analysis src/content/cli-args.spec.ts --selectProjects unit` → 2 suite, 37 test verdi. `node dist/content/run-content.js --stats --content-dir test/content-fixtures` → exit 0 (mini-albero: Lupo 500 vs 1100 → `winChance` 0.31). `npx tsc --noEmit` 0, eslint/prettier puliti sui 5 file. Int-spec del CLI `src/content/run-content.cli.int-spec.ts` ancora verde (7 test) dopo la modifica di `CONTENT_USAGE`.
- Casi verdi al primo colpo: `['--stats', '--check']` → `null` era già rifiutato dal parser (due modalità), annotato.

## Task 2 — export reale (sola lettura)

`node --env-file=.env dist/content/run-content.js --export <scratchpad>` → `exit 0`; controllo segreti sul report → `0`.

| Collezione | Report | Inventario | Δ |
|------------|-------:|-----------:|--:|
| lore | 12 | 12 | 0 |
| enemies | 1 | 1 | 0 |
| pets | 1 | 1 | 0 |
| spells | 77 | 77 | 0 |
| equipmentitems | 145 | 145 | 0 |
| lootitems | 83 | 83 | 0 |
| cities | 167 | 167 | 0 |
| pointsofinterest | 642 | 642 | 0 |
| quests | 16 | 16 | 0 |

- `droppedFields`: solo `lootitems: [canHeal]` (campo fuori schema, scartato dall'export).
- `normalized`: 1 voce, equipaggiamento `68c19536541d89c481b83250` con `damages.base` oggetto singolo → lista.
- File: 27 (9 equipment, 5 loot, 8 spells, pets, enemies, lore città, world, fixes). Copia con `cp -Rn`: solo file nuovi, nessun `M` su `config.yaml`, `images.yaml`, `README.md`, fix esistenti.
- `content/fixes/delete-test-quests.yaml`: tutti i 16 id esportati hanno Talmvere come città del marker (12 tipi + 1 aid originale + 3 aid clonate + 1 story) → nessun id tolto; commento di testa del piano aggiunto.
- Snapshot allineato a mano: 6 POI con la mappa di `poi-types.yaml` (righe 676, 739, 754, 1027, 2233, 2626), città `690961bf952cc57d174677d7` → `name: Kliever` (più il commento del suo `markerLocation`). Il grep dei tipi sporchi non stampa nulla.
- Acceptance: città `167`, equipment `145`, loot `83`, spells `77`, `name: Kliever` `1`, id in `delete-test-quests.yaml` `16`.
- `--check` sul vero albero: dopo le correzioni sotto, exit 0, 0 errori, 155 warning tutti `città senza lore` (le 155 città senza lore, attese fino ai piani delle lore). `content-tree.spec.ts` + `fix-runner.spec.ts` → 7 test verdi.

### Correzioni ai dati esportati (commento `# corretto in 11-12` sulla riga)

| File | Voce | Problema | Correzione |
|------|------|----------|------------|
| `equipment/chestPiece.yaml` | `68c19536541d89c481b8326c` Armatura incantata della bufera | `addedSpell` `68c19570541d89c481b8325a` non esiste fra le magie | `addedSpell: null` |
| `equipment/helm.yaml` | `68c19536541d89c481b8325c` Elmo del Guardiano di Ghiaccio | stessa magia assente | `addedSpell: null` |
| `equipment/greaves.yaml` | `68c19536541d89c481b8328a` Gambali del Berserker | `addedSpell` `68c19570541d89c481b8327e` assente | `addedSpell: null` |
| `enemies/esistenti.yaml` | `68c28e9789b2155e53b835b5` Arbusto Maligno | `locations: []` (lo schema chiede almeno un luogo) | `locations: [all]` |

Da far rivedere all'utente: se le due magie mancanti vanno ricreate (piano 11-14), gli `addedSpell` si possono ripuntare.

## Task 3 — baseline `--verify` e misure

`node --env-file=.env dist/content/run-content.js --verify` → `exit 1` (deriva attesa), controllo segreti → `0`. Nessuna scrittura (`--verify` è di sola lettura).

| Collezione | inserted | modified | unchanged | orfani | fixes |
|------------|---------:|---------:|----------:|-------:|------:|
| lore | 0 | 0 | 12 | 0 | 12 |
| spells | 0 | 0 | 77 | 0 | 0 |
| equipmentitems | 0 | 4 | 141 | 0 | 0 |
| lootitems | 0 | 0 | 83 | 0 | 0 |
| enemies | 0 | 1 | 0 | 0 | 0 |
| pets | 0 | 0 | 1 | 0 | 0 |
| quests | 0 | 0 | 0 | 7 | 16 |

- Le 5 modifiche sono quelle introdotte da questo piano: i 3 `addedSpell` → `null`, il `damages.base` normalizzato in lista, le `locations` dell'Arbusto. Nessuna modifica di tipo numerico (Pitfall 3 non si è presentato sul catalogo).
- `cities.relatedLore`: `modified 0, unchanged 12, missing []`.
- Fix: `rename-flinas-north-village` pending (1), `lore-unset-unlocked` pending (12), i 6 `poi-type-*` pending (1 ciascuno); **`delete-talmvere-test-quests` `blocked`**: la quest `6ada3608b3dad669f2c257cf` (`[boss] Il Cuore della Caverna`) è tenuta dalla pending `6ae30ca93a20a4350c47ef60` del personaggio `6ae30a623a20a4350c47eda5` (corsia `pendingQuest`); gli altri 15 id sono liberi (`pendingQuestsDeleted: 1`, `poiBackLinksCleared: 0`, `questResultsKept: 24`, `aidReferences: []`).
- `errors`: solo i 6 valori fuori enum dei POI (`file: '(database)'`, `path: pointsofinterest.type`), come atteso.
- `warnings`: 155 `città senza lore` + 7 `snapshot non allineato` (i 6 POI e Kliever: lo snapshot è già nello stato post-fix, spariscono dopo l'`--apply` del piano 11-24).
- `probableIdDivergence`: `[]` (nessun blocker).
- Orfani quest: 7 (le quest fisse aperte di prova: hunt, dungeon, study, heal, job, crime, guard di Talmvere), previsto; nessun orfano nelle collezioni di catalogo.

### Misure del catalogo (`reports/11-12-stats.json`, `--stats` exit 0)

Somma dei `power` (`damages.base` + `damages.energy`) per pezzo:

| Rarità | n | min | mediana | max |
|--------|--:|----:|--------:|----:|
| common | 30 | 50 | 300 | 900 |
| uncommon | 28 | 400 | 1 000 | 1 900 |
| rare | 30 | 300 | 2 250 | 3 600 |
| ultrarare | 28 | 1 000 | 4 275 | 8 300 |
| legendary | 29 | 4 500 | 10 000 | 18 500 |

Per slot (mediana): boots 2 100, chestPiece 1 775, gloves 1 450, greaves 2 950, helm 1 800, necklace 1 000, ring 1 000, shield 3 250, weapon 2 800.

Magie (`energyDamage.power`, 77): min 50, mediana 800, max 5 000; per `useType` (mediana): attack 1 500 (19), charm 400 (3), confuse 800 (5), control 750 (13), defense 800 (13), enhance 650 (10), illusion 450 (4), infuse 700 (10).

Loot (`power` per effetto, mediana/max): heal 2 000 / 40 000, hunger 50 / 100, munition 22 / 60, exploration 0, none 0. Minuti di marcia del cibo (power × 3, D-16): 21 voci, min 15, mediana 150, max 300 (nessun cibo oltre le 5 h; il «60 power = 3 h» del D-16 cade fra mediana e massimo).

`winChance` ricalcolata (formula del resolver segnaposto, D-12):

| Scontro | lifePoints | Party | partyPower | winChance |
|---------|-----------:|-------|-----------:|----------:|
| Lupo | 1 100 | rookie, 1 pezzo mediano common | 300 | 0.21 |
| Troll | 8 400 | paladin, 3 pezzi mediani rare | 6 750 | 0.45 |
| Drago rosso adulto | 25 600 | hero, 9 pezzi mediani legendary | 90 000 | 0.78 |
| Tarrasque | 67 600 | 5 legend × 9 pezzi mediani legendary | 450 000 | 0.87 |

Lettura per l'handoff (11-25) e per 11-14: gli scontri rookie col solo equipaggiamento common sono duri (21 %), quelli eroici e leggendari sono facili col catalogo legendary attuale (la mediana legendary è 10 000, molto sopra la stima di 1 800 della ricerca); il resolver non si tocca.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dati esportati non conformi allo schema**
- **Found during:** Task 2 (`--check` exit 1, 4 errori)
- **Issue:** 3 `addedSpell` pendenti, 1 nemico con `locations` vuoto
- **Fix:** correzione nella voce del file come previsto dal passo 6 del piano (tabella sopra)
- **Commit:** `c38ef18`

**2. [Rule 3 - Blocking] Test `accepts the repository fix files`**
- **Found during:** Task 2
- **Issue:** il nuovo `delete-test-quests.yaml` aggiunge `deleteQuests` in testa a `tree.fixes` (ordine alfabetico dei file)
- **Fix:** attesa aggiornata (`deleteQuests` prima di `renameCity`, il controllo dei `replacements` parte dal quarto fix)
- **Files modified:** `src/content/fixes/fix-runner.spec.ts`
- **Commit:** `c38ef18`

**3. Cartella di export** nello scratchpad della sessione invece di `mktemp -d` (stesso effetto: cartella nuova, vuota, fuori dal repo, cancellata dopo la copia).

## Per il piano 11-24

- L'`--apply` reale troverà `delete-talmvere-test-quests` bloccato finché il personaggio `6ae30a623a20a4350c47eda5` tiene la pending `6ae30ca93a20a4350c47ef60` sulla quest boss `6ada3608b3dad669f2c257cf`: serve liberarla (o accettare il blocco su quell'id) prima di arrivare a `--verify` a zero differenze.

## Threat model

T-11-46: solo `node --env-file=.env`, tre report con grep dei segreti = 0, nessun output con URI. T-11-47: usate solo `--export`, `--verify`, `--stats`, `--check`. T-11-48: lista di cancellazione rivista (16 id, tutti di Talmvere). T-11-49: l'export contiene solo catalogo, città, POI, id e titoli delle quest.

## Self-Check: PASSED

- File creati presenti (`src/content/analysis/catalog-stats.ts`, `content/world/cities.yaml`, `content/fixes/delete-test-quests.yaml`, tre report).
- Commit `0a73b36`, `5ad5b17`, `c38ef18`, `a46b13b` presenti in `git log`.
