---
phase: 11-popolamento-del-mondo
plan: 20
subsystem: content
tags: [content, lore, cities, BE-CONTENT-01, BE-CONTENT-03]
requires: ["11-13", "11-15"]
provides:
  - "content/lore/citta-esistenti.yaml: le 12 lore di città esistenti collegano in `relatedLore` stato e regione (più oceano e figure di governo dove pertinenti); id, nome, testo, `image`, `city` invariati"
  - "content/lore/citta-drustea.yaml: 20 lore `city` (tutte le `drustea*` tranne Cliffbreak), id `6ae8083e7bdab32d55c00e55`..`…0e68`"
  - "content/lore/citta-valan.yaml: 22 lore `city` (tutte le `valan*` tranne Valantar), id `6ae8083e4b590da5989f9fd8`..`…9fed`"
  - "content/lore/citta-mirwa.yaml: 28 lore `city` (tutte le `mirwa*` tranne Mirwen), id `6ae8083e97a4237bfaa4dcf4`..`…dd0f`"
affects: [11-21, 11-23, 11-24]
tech-stack:
  added: []
  patterns:
    - "generatore usa e getta `gen20/gen.js` nello scratchpad (non committato): legge le città del gruppo da `content/world/cities.yaml` (ordine per `type` poi nome), calcola le regioni dai `PoiType` dei POI, controlla 2–4 frasi, scrive `city: '<id>' # <nome>`; spec per regno con `prefix`, `state`, `existing`, `extraRegions`, `desc` per nome"
key-files:
  created:
    - content/lore/citta-drustea.yaml
    - content/lore/citta-valan.yaml
    - content/lore/citta-mirwa.yaml
  modified:
    - content/lore/citta-esistenti.yaml
decisions:
  - "Regioni di ogni città = tutte le regioni mappate dai `PoiType` dei suoi POI (non solo la più caratteristica), ordinate pianure → Temistos → lago → Lamstone → Minnely → nord → paludi → coste → oceani"
  - "Città senza POI di regione: Vindence (graveyard, forest) → Pianure di Drustea; Candelaria (nessun POI oltre al marker) → Temistos"
  - "Le `valanSeaCity` collegano anche «Coste del meridione» `…f65` (regione senza `PoiType`)"
  - "Lore esistenti: oltre a stato e regione, Liberia → Oceano Ladows, Venis Millhelm, Rufus Faris; Mirwen → Alexander Themoira XXI, Culto della vita; Cliffbreak → Wismund e Kolvar Drustea; Bellport → Oceano Delants, Raybaut Phalan; Ferrion → Lontano Nord; Morrulir → Skargen; Necrorian → Orgeal Indrek; Talmvere → Reavor Kyrell; Valantar → Hilword Valantar; Virnen → Guerin Kerring; Telobren → Oceano Delants, Azorius Telob; Ko Shaeras → Aravae Miel"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
---

# Phase 11 Plan 20: Lore di città, parte 1 (Drustea, Valan, Mirwa) Summary

Settanta lore `type: city` nuove, una per ogni città `drustea*` (20), `valan*` (22) e `mirwa*` (28) senza scheda, ciascuna collegata al proprio regno e alle regioni dei suoi POI tramite il campo solo-file `city:`; le 12 lore di città esistenti ricevono stato, regione e le figure di governo. I warning `città senza lore` scendono da 155 a 85.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Le 12 lore esistenti collegate a regno e regione | 4c48a41 | content/lore/citta-esistenti.yaml |
| 2a | Città del Regno di Drustea | c517b8b | content/lore/citta-drustea.yaml |
| 2b | Città della Repubblica dei Valan | 07dd77e | content/lore/citta-valan.yaml |
| 2c | Città della Teocrazia di Mirwa | 6bb2bc6 | content/lore/citta-mirwa.yaml |

## Copertura per regno

| Regno | Città nello snapshot | Lore esistente | Lore nuove | File |
| --- | --- | --- | --- | --- |
| Drustea (`drustea*`) | 21 | Cliffbreak | 20 | citta-drustea.yaml |
| Valan (`valan*`) | 23 | Valantar | 22 | citta-valan.yaml |
| Mirwa (`mirwa*`) | 29 | Mirwen | 28 | citta-mirwa.yaml |

Nessun file supera le 40 voci: niente suffissi `-1`/`-2`.

## Verifiche

- `node dist/content/run-content.js --check` → exit 0, `errors` 0; lore 302 (232 + 70); warning `città senza lore` 155 → 155 (task 1) → 135 → 113 → 85; nessuno fra i tipi `drustea|valan|mirwa`.
- `npx jest src/content/content-tree.spec.ts --selectProjects unit` → `Tests: 2 passed, 2 total` dopo ogni task; `pgrep -fl jest` vuoto.
- `cat content/lore/citta-drustea*.yaml content/lore/citta-valan*.yaml content/lore/citta-mirwa*.yaml | grep -c "type: city"` → 70 = 20 + 22 + 28.
- `git diff HEAD~1 -- content/lore/citta-esistenti.yaml | grep -cE "^\+\s+- '[0-9a-f]{24}'"` (sul commit del task 1) → 42 (≥ 24).
- Controllo dei commenti: ogni `# nome` dopo un id in `content/lore/*.yaml` (riferimenti e `city:`) coincide col nome della voce o della città puntata: 0 discrepanze.
- `git diff --exit-code src/schema.gql` → 0.

Warning restanti (piano 11-21): aarakocraVillage 3, desertVillage 7, flameCity 10, flameVillage 14, forestVillage 8, liberiaCity 9, liberiaVillage 6, motherCity 4, motherVillage 4, mountainVillage 3, northVillage 9, tropicalVillage 8.

## Deviations from Plan

**1. [Rule 3 - Blocking] Criterio «solo righe aggiunte» del task 1 non soddisfacibile alla lettera**
- **Trovato durante:** Task 1
- **Problema:** le 12 voci esportate hanno `relatedLore: []` in forma flow; aggiungere id richiede di sostituire quella riga con `relatedLore:` + block list, quindi `git diff HEAD~1 … | grep -cE "^-[^-]"` stampa 12, non 0.
- **Soluzione:** sostituite solo le 12 righe `relatedLore: []`; `id`, `name`, `description`, `image`, `city` intatti (diff: 54 righe aggiunte, 12 rimosse, tutte `relatedLore: []`).
- **Commit:** 4c48a41

Nessun'altra deviazione: niente codice `.ts` toccato (nessun build, tsc non necessario), nessun accesso al database.

## Known Stubs

`image: null` in tutte le 70 lore nuove: atteso (D-24, le immagini arrivano da `content/images.yaml` dopo il caricamento su Cloudinary).

## Self-Check: PASSED

- File presenti: content/lore/citta-drustea.yaml, citta-valan.yaml, citta-mirwa.yaml.
- Commit presenti: 4c48a41, c517b8b, 07dd77e, 6bb2bc6.
