---
phase: 11-popolamento-del-mondo
plan: 21
subsystem: content
tags: [content, lore, cities, BE-CONTENT-01, BE-CONTENT-03]
requires: ["11-13", "11-20"]
provides:
  - "content/lore/citta-fiamme.yaml: 24 lore `city` (tutte le `flame*` tranne Bellport, Virnen, Telobren), id `6ae809f29778fd827199f2f9`.. (24 consecutivi)"
  - "content/lore/citta-madre.yaml: 8 lore `city` (tutte le `mother*` tranne Morrulir)"
  - "content/lore/citta-liberia.yaml: 15 lore `city` (tutte le `liberia*` tranne Liberia)"
  - "content/lore/citta-speciali.yaml: 38 lore `city` (aarakocraVillage 3, desertVillage 7, forestVillage 8, mountainVillage 3, northVillage 9, tropicalVillage 8)"
  - "tutte le 167 città dello snapshot hanno esattamente una lore `city`: `--check` 0 warning `città senza lore`"
affects: [11-23, 11-24]
tech-stack:
  added: []
  patterns:
    - "generatore usa e getta `gen21/gen.js` nello scratchpad (non committato), esteso da `gen20`: mappa PoiType → regione con belleholmIsland/belleholmLake/vulcano → Belleholm, liberiaIsland → Calemark, harkenIsland → Harken, glounet → Glounet; ORDER con `f5b`..`f5f`; spec con `types` (lista esatta di CityType) e `stateOf(c)` per i file a più regni"
key-files:
  created:
    - content/lore/citta-fiamme.yaml
    - content/lore/citta-madre.yaml
    - content/lore/citta-liberia.yaml
    - content/lore/citta-speciali.yaml
  modified: []
decisions:
  - "Città dell'Unione e villaggi tropicali collegano sempre Belleholm `…f5c` (anche Ruldilen, che ha solo POI `delants`); città di Liberia collegano sempre Calemark `…f5d` (anche Iriesa, solo `ladows`)"
  - "northVillage: Andogan, Bosa, Kliever → Regno della Madre (coorte di id `690961bf` della Madre; Andogan ha il molo sul Ladows, coerente coi moli occidentali del regno); gli altri sei → Regno di Drustea"
  - "aarakocraVillage e mountainVillage → Regno della Madre; desertVillage → Repubblica dei Valan; tropicalVillage → Unione delle Fiamme; forestVillage → Regno di Drustea (Minnely per i cinque villaggi elfici, Pianure di Drustea per Agosbert, Capofoce e Jok che hanno solo POI `forest` generico)"
  - "Regioni = tutte quelle mappate dai PoiType dei POI (regola di 11-20): i northVillage con POI `hills` collegano anche Pianure di Drustea, compresa Andogan (Madre)"
metrics:
  duration: "~20 min"
  completed: 2026-11-02
---

# Phase 11 Plan 21: Lore di città, parte 2 (Fiamme, Madre, Liberia, tipi speciali) Summary

Ottantacinque lore `type: city` nuove, una per ogni città ancora senza scheda (Unione delle Fiamme 24, Regno della Madre 8, Liberia 15, tipi speciali 38), ciascuna collegata al proprio regno e alle regioni dei suoi POI tramite il campo solo-file `city:`; ora tutte le 167 città hanno una lore e i warning `città senza lore` sono 0. Le 12 lore di `citta-esistenti.yaml` non sono state toccate.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1a | Città dell'Unione delle Fiamme | fdc3b8f | content/lore/citta-fiamme.yaml |
| 1b | Città del Regno della Madre | 6055b76 | content/lore/citta-madre.yaml |
| 1c | Città di Liberia | e2dfd7e | content/lore/citta-liberia.yaml |
| 2 | Città dei tipi speciali e chiusura | a3adb6f | content/lore/citta-speciali.yaml |

## Copertura

| Gruppo | CityType | Città nello snapshot | Lore esistente | Lore nuove | Stato | File |
| --- | --- | --- | --- | --- | --- | --- |
| Unione delle Fiamme | flameCity 10, flameVillage 14, 3 capitali | 27 | Bellport, Virnen, Telobren | 24 | `…f53` | citta-fiamme.yaml |
| Regno della Madre | motherCity 4, motherVillage 4, capitale | 9 | Morrulir | 8 | `…f54` | citta-madre.yaml |
| Liberia | liberiaCity 9, liberiaVillage 6, capitale | 16 | Liberia | 15 | `…f55` | citta-liberia.yaml |
| Aarakocra | aarakocraVillage | 3 | — | 3 | Madre `…f54` | citta-speciali.yaml |
| Deserto | desertVillage | 7 | — | 7 | Valan `…f51` | citta-speciali.yaml |
| Foreste | forestVillage | 8 | — | 8 | Drustea `…f50` | citta-speciali.yaml |
| Monti | mountainVillage | 3 | — | 3 | Madre `…f54` | citta-speciali.yaml |
| Nord | northVillage | 9 | — | 9 | Madre (Andogan, Bosa, Kliever) / Drustea (6) | citta-speciali.yaml |
| Tropicali | tropicalVillage | 8 | — | 8 | Unione `…f53` | citta-speciali.yaml |
| Unici | elfCapital, ferrionCity, necrorianCity, talmvereVillage | 4 | Ko Shaeras, Ferrion, Necrorian, Talmvere | 0 | — | — |

Totale: 85 nuove + 12 esistenti + 70 di 11-20 = 167 lore `city`. Nessun file supera le 40 voci (speciali 38): niente suffissi `-1`/`-2`. Nessuna città è rimasta con sola regione: per ogni tipo speciale il testo (righe 58-91, 109-146) o la coorte di id hanno permesso di scegliere il regno.

## Verifiche

- `node dist/content/run-content.js --check` → exit 0, `errors` 0, `warnings` 0; lore 387 (302 + 85); warning `città senza lore` 85 → 38 (task 1) → 0 (task 2).
- Verify del task 1: nessun warning per `(flame|mother|liberia)`; verify del task 2: nessun warning `città senza lore`.
- `npx jest src/content/content-tree.spec.ts --selectProjects unit` → `Tests: 2 passed, 2 total` dopo ogni task; `pgrep -fl jest` vuoto.
- `cat content/lore/citta-fiamme*.yaml content/lore/citta-madre*.yaml content/lore/citta-liberia*.yaml | grep -c "type: city"` → 47 = 24 + 8 + 15.
- `node dist/content/run-content.js --check | grep -c "città senza lore"` → 0; `cat content/lore/citta-*.yaml | grep -c "^  city: '"` → 167.
- Controllo dei commenti: ogni `# nome` dopo un id in `content/lore/*.yaml` coincide col nome della voce o della città puntata: 0 discrepanze.
- `git diff --exit-code src/schema.gql` → 0. Ogni commit senza trailer (`grep -ciE` → 0), subject 59/57/43/49 caratteri.

## Deviations from Plan

None - plan executed exactly as written. (I commit del task 1 sono tre, uno per regno, come chiede il piano.) Nessun codice `.ts` toccato (nessun build, tsc non necessario), nessun accesso al database.

## Known Stubs

`image: null` in tutte le 85 lore nuove: atteso (D-24, immagini da `content/images.yaml` dopo il caricamento su Cloudinary).

## Self-Check: PASSED

- File presenti: content/lore/citta-fiamme.yaml, citta-madre.yaml, citta-liberia.yaml, citta-speciali.yaml.
- Commit presenti: fdc3b8f, 6055b76, e2dfd7e, a3adb6f.
