---
phase: 11-popolamento-del-mondo
plan: 13
subsystem: content
tags: [content, lore, BE-CONTENT-01, BE-CONTENT-03]
requires: ["11-12"]
provides:
  - "content/lore/regni.yaml: 8 lore `state` con commento `# CityType:` sulla riga `type`"
  - "content/lore/regioni.yaml: 17 lore `region` con commento `# PoiType:` sulla riga `type`, collegate ai regni in entrambe le direzioni"
  - "content/lore/storia.yaml (10 `knowledge`), content/lore/materiali.yaml (9 `material`), content/lore/magia.yaml (3 `knowledge`)"
affects: [11-14, 11-15, 11-16, 11-17, 11-18, 11-19, 11-20, 11-21, 11-22, 11-23]
tech-stack:
  added: []
  patterns:
    - "tabella di corrispondenza come commento YAML sulla riga `type` (`type: region # PoiType: …`, `type: state # CityType: …`)"
    - "file di lore scritti da uno script usa e getta nello scratchpad (mai committato) che consuma in ordine gli id di un solo `--new-id 47`"
key-files:
  created:
    - content/lore/regni.yaml
    - content/lore/regioni.yaml
    - content/lore/storia.yaml
    - content/lore/materiali.yaml
    - content/lore/magia.yaml
  modified: []
decisions:
  - "Regno di Drustea: oltre a `drustea*` anche `elfCapital` (Ko Shaeras, «considerata parte del regno») e `talmvereVillage` (Talmvere)"
  - "Tipi di città generici assegnati al regno della coorte di id e dei POI dello snapshot: `desertVillage` → Valan, `tropicalVillage` → Unione delle Fiamme, `mountainVillage` e `aarakocraVillage` → Regno della Madre; `forestVillage` e `northVillage` restano senza regno (divisi fra Drustea/Minnely e Lontano Nord/Madre)"
  - "Legami regno ↔ regione presi dal testo e corretti coi POI reali dello snapshot: Paludi maledette → Drustea (8 POI `swamp` in città drustea*), Unione delle Fiamme → Oceano Delants (16 POI `delants` nelle sue città, contro il testo che pone il Belleholm a sud ovest), Mirwa → Pianure di Drustea e Pianure dei Valan (POI `drusteaPlains`/`valanPlains` in città mirwa*)"
  - "Regioni senza `PoiType`: Coste del meridione e Stretto di Stratwin portano `# PoiType: (nessuno)`"
  - "Storia: «Le origini» e «La creazione dei piani e delle prime razze» come due voci (10 in tutto, il piano chiedeva ~10 e almeno 9)"
  - "Materiali: 9 voci (Sundenim, Rune magiche, Liberica, Ossidiana del Belleholm, Vino Mirwanese, Birra di Drustea, Pietre preziose del Lamstone, Rugiada notturna, Legname e pellicce del Minnely)"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 2
  files: 5
---

# Phase 11 Plan 13: lore di regni, regioni, storia, materiali e magia Summary

47 schede di lore nuove in 5 file (8 regni, 17 regioni, 10 voci di storia ed economia, 9 materiali, 3 voci sulla magia), scritte in italiano dal documento di world building, con id da `--new-id`, rete `relatedLore` regno ↔ regione simmetrica e tabelle zona ↔ `PoiType` / regno ↔ `CityType` in commento per i piani di nemici, città e quest.

## Cosa è stato fatto

- **Task 1** (`8bdefbc`): `content/lore/regni.yaml` (8 `state`) e `content/lore/regioni.yaml` (17 `region`). Ogni regno elenca in `relatedLore` le regioni del suo territorio, ogni regione i regni che la toccano: controllo di simmetria con uno script `yaml` → `asym 0`, nessuna regione senza regno.
- **Task 2** (`08923ef`): `content/lore/storia.yaml` (le origini, la creazione delle razze, le sei ere, «La Liberica e il cambio» con `10000 rame = 100 argento = 1 oro` e il listino, «Il potere economico degli stati»), `content/lore/materiali.yaml` (9 materiali, ognuno legato al regno e alla regione di provenienza), `content/lore/magia.yaml` («La magia di Klimmeck», «Lo sciamanesimo», «Il Vuoto e l'Abisso dei Diavoli», collegate fra loro e a «Rune magiche»).
- Fonte letta solo nelle righe indicate dal piano: 34-108, 1479-1555, 1638-1685 di `source/world-building.md`, più il `grep` dei materiali.

## Tabella regione ↔ `PoiType`

| Regione | id | `PoiType` | Regni collegati |
| --- | --- | --- | --- |
| Lamstone | `6ae7fc3ed1f6494f3dc89f58` | `mountainLamstone`, `undergroundLamstone` | Drustea, Madre |
| Temistos | `6ae7fc3ed1f6494f3dc89f59` | `mountainTemistos`, `undergroundTemistos` | Drustea, Valan, Mirwa |
| Lago Nanfail e Hingtos | `6ae7fc3ed1f6494f3dc89f5a` | `temistosLake` | Mirwa |
| Mar Sabbioso | `6ae7fc3ed1f6494f3dc89f5b` | `desert`, `oasis` | Valan |
| Belleholm | `6ae7fc3ed1f6494f3dc89f5c` | `belleholmIsland`, `belleholmLake`, `vulcano` | Unione delle Fiamme |
| Calemark | `6ae7fc3ed1f6494f3dc89f5d` | `liberiaIsland` | Liberia |
| Harken | `6ae7fc3ed1f6494f3dc89f5e` | `harkenIsland` | Harken e Ferrion |
| Glounet | `6ae7fc3ed1f6494f3dc89f5f` | `glounet` | Necrorian e il Glounet |
| Foresta di Minnely | `6ae7fc3ed1f6494f3dc89f60` | `minnelyForest` | Drustea |
| Pianure di Drustea | `6ae7fc3ed1f6494f3dc89f61` | `drusteaPlains`, `hills` | Drustea, Mirwa |
| Pianure dei Valan | `6ae7fc3ed1f6494f3dc89f62` | `valanPlains` | Valan, Mirwa |
| Lontano Nord | `6ae7fc3ed1f6494f3dc89f63` | `farNorth` | Drustea, Madre, Harken e Ferrion |
| Paludi maledette | `6ae7fc3ed1f6494f3dc89f64` | `swamp` | Drustea |
| Coste del meridione | `6ae7fc3ed1f6494f3dc89f65` | (nessuno) | Valan |
| Oceano Ladows | `6ae7fc3ed1f6494f3dc89f66` | `ladows` | Valan, Mirwa, Madre, Liberia |
| Oceano Delants | `6ae7fc3ed1f6494f3dc89f67` | `delants` | Drustea, Mirwa, Unione, Harken e Ferrion, Necrorian |
| Stretto di Stratwin | `6ae7fc3ed1f6494f3dc89f68` | (nessuno) | Valan, Unione |

`PoiType` senza regione (non sono zone geografiche): `all`, `city`, `dungeon`, `ruins`, `graveyard`, `battleground`, `demonicPortal`, `forest` (foreste generiche).

## Tabella regno ↔ `CityType`

| Regno | id | `CityType` | Città nello snapshot |
| --- | --- | --- | --- |
| Regno di Drustea | `6ae7fc3ed1f6494f3dc89f50` | `drusteaCapital`, `drusteaCity`, `drusteaSeaCity`, `drusteaVillage`, `elfCapital`, `talmvereVillage` | 1 + 6 + 3 + 11 + 1 + 1 |
| Repubblica dei Valan | `6ae7fc3ed1f6494f3dc89f51` | `valanCapital`, `valanCity`, `valanSeaCity`, `valanVillage`, `desertVillage` | 1 + 6 + 6 + 10 + 7 |
| Teocrazia di Mirwa | `6ae7fc3ed1f6494f3dc89f52` | `mirwaCapital`, `mirwaCity`, `mirwaSeaCity`, `mirwaVillage` | 1 + 11 + 3 + 14 |
| Unione delle Fiamme | `6ae7fc3ed1f6494f3dc89f53` | `flameNorthCapital`, `flameCenterCapital`, `flameSouthCapital`, `flameCity`, `flameVillage`, `tropicalVillage` | 3 + 10 + 14 + 8 |
| Regno della Madre | `6ae7fc3ed1f6494f3dc89f54` | `motherCapital`, `motherCity`, `motherVillage`, `mountainVillage`, `aarakocraVillage` | 1 + 4 + 4 + 3 + 3 |
| Liberia | `6ae7fc3ed1f6494f3dc89f55` | `liberiaCapital`, `liberiaCity`, `liberiaVillage` | 1 + 9 + 6 |
| Harken e Ferrion | `6ae7fc3ed1f6494f3dc89f56` | `ferrionCity` | 1 |
| Necrorian e il Glounet | `6ae7fc3ed1f6494f3dc89f57` | `necrorianCity` | 1 |

Senza regno (da scegliere per POI): `forestVillage` (8: Agosbert, Capofoce, Jok in coorte drustea con POI `forest`; Al Anore, Lehadorei, Naellond, Rae Thelar, Thanlenor nel Minnely) e `northVillage` (9, tutti con POI `farNorth`; Andogan, Bosa, Kliever in coorte madre, gli altri sei in coorte Ferrion/nord con `hills`). Per le lore di città: regione dal `PoiType` dei POI della città, regno da questa tabella.

## Altre schede

| Tipo | Voci |
| --- | --- |
| `knowledge` (storia) | Le origini `…f69`, La creazione dei piani e delle prime razze `…f6a`, La prima era `…f6b`, La seconda era `…f6c`, La terza era `…f6d`, La quarta era `…f6e`, La quinta era `…f6f`, La sesta era `…f70`, La Liberica e il cambio `…f71`, Il potere economico degli stati `…f72` |
| `material` | Sundenim `…f73`, Rune magiche `…f74`, Liberica `…f75`, Ossidiana del Belleholm `…f76`, Vino Mirwanese `…f77`, Birra di Drustea `…f78`, Pietre preziose del Lamstone `…f79`, Rugiada notturna `…f7a`, Legname e pellicce del Minnely `…f7b` |
| `knowledge` (magia) | La magia di Klimmeck `…f7c`, Lo sciamanesimo `…f7d`, Il Vuoto e l'Abisso dei Diavoli `…f7e` |

(prefisso comune degli id: `6ae7fc3ed1f6494f3dc89`)

## Verifica

- `node dist/content/run-content.js --check` → exit 0 dopo ogni task; conteggi finali `lore: 59` (12 + 47), 0 errori, 155 warning tutti `città senza lore` (invariati).
- `npx jest src/content/content-tree.spec.ts --selectProjects unit` → `Tests: 2 passed, 2 total` dopo ogni task; `pgrep -fl jest` vuoto.
- Criteri di accettazione Task 1: `type: state` = 8, `type: region` = 17, `# PoiType:` = 17, `# CityType:` = 8, blocchi `description: |-` = 25.
- Criteri Task 2: `type: knowledge` in storia = 10 (≥ 9), in magia = 3; `type: material` = 9 (≥ 6); `name: Lo sciamanesimo` = 1.
- Nessun codice `.ts` toccato: niente `npm run build`, niente `tsc` (nessun task di codice). Nessun accesso al database.

## Deviations from Plan

### Auto-fixed Issues

Nessuna correzione di bug. Scelte di contenuto non dettate dal piano (documentate in `decisions`):

**1. [Rule 2 - Correttezza dei dati] Legami regno ↔ regione allineati ai POI reali**
- **Trovato durante:** Task 1
- **Problema:** il testo pone il Belleholm a sud ovest (oceano Ladows), ma nello snapshot le città dell'Unione hanno 16 POI `delants` e nessun `ladows`; le città mirwa* hanno POI `drusteaPlains` e `valanPlains`.
- **Correzione:** Unione delle Fiamme ↔ Oceano Delants, Mirwa ↔ entrambe le pianure; le regioni seguono i `PoiType` che i piani dei nemici e delle quest useranno davvero.
- **File:** `content/lore/regni.yaml`, `content/lore/regioni.yaml` — **Commit:** `8bdefbc`

**2. [Rule 2] `CityType` generici attribuiti ai regni**
- **Trovato durante:** Task 1
- **Problema:** il piano assegna solo i prefissi `drustea*`/`valan*`/…; 8 tipi (`elfCapital`, `talmvereVillage`, `desertVillage`, `tropicalVillage`, `mountainVillage`, `aarakocraVillage`, `forestVillage`, `northVillage`) restavano scoperti.
- **Correzione:** assegnati quelli univoci per testo o per POI dello snapshot; `forestVillage` e `northVillage` lasciati senza regno (divisi fra due regni) e documentati qui sopra.
- **Commit:** `8bdefbc`

## Known Stubs

Nessuno. `image: null` su tutte le 47 voci è voluto (D-24: immagini dal passaggio Cloudinary).

## Note per i piani successivi

- La Rugiada notturna cita il Vespro Argenteo (pianta, riga 1037 del documento): il piano delle piante può collegare la lore `plant` a `6ae7fc3ed1f6494f3dc89f7a`.
- Gli id `…f50`..`…f7e` sono stati consumati tutti (47 su 47 di un solo `--new-id 47`).

## Self-Check: PASSED

- 5 file `content/lore/{regni,regioni,storia,materiali,magia}.yaml` presenti.
- Commit `8bdefbc` e `08923ef` presenti in `git log`.
