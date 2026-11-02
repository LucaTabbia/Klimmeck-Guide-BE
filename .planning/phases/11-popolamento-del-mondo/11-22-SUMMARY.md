---
phase: 11-popolamento-del-mondo
plan: 22
subsystem: content
tags: [content, lore, enemies, BE-CONTENT-01, BE-CONTENT-03, BE-CONTENT-04]
requires: ["11-14", "11-15", "11-18"]
provides:
  - "content/lore/leggendari.yaml: 13 lore `enemy` (una per scheda leggendaria), id `6ae80b5b2e7351b494ecc85c`..`…868`"
  - "content/enemies/leggendari.yaml: 22 nemici `category: legendary` (fascia `legend`, nessun `level`), id `6ae80b5b2e7351b494ecc869`..`…87e`"
  - "content/lore/umani.yaml: 5 lore `enemy` di gruppo, id `6ae80bf6947d6a423521c708`..`…70c`"
  - "content/enemies/umani.yaml: 14 nemici `category: humanoid`, id `6ae80bf6947d6a423521c70d`..`…71a`"
  - "content/enemies/giganti-orchi.yaml: 7 nemici `category: humanoid`, id `6ae80c244f0a8e8287e5f5de`..`…5e4`"
affects: [11-23, 11-25]
tech-stack:
  added: []
  patterns:
    - "generatore usa e getta `gen22/enemies.js` (spec per file con `category`, lore lette da tutti i file di `content/lore`, `relatedLore` multiple) + `gen22/helpers.js` (`analog`, `st`, `E`); lore con `gen15/gen.js`; non committati"
key-files:
  created:
    - content/lore/leggendari.yaml
    - content/lore/umani.yaml
    - content/enemies/leggendari.yaml
    - content/enemies/umani.yaml
    - content/enemies/giganti-orchi.yaml
  modified: []
decisions:
  - "PE dei leggendari dal documento anche dove diverge dal bestiario: Lich 19200 (bestiario 33000), Drago di rame adulto 11000 (11500), Drago d'ombra adulto 38400 e anziano 204800 (oltre il Tarrasque: xp 28845, sotto il limite Int32)"
  - "Sacerdote corrotto con PE 450 dal CONTEXT D-07 e dal piano, benché il Sacerdote del bestiario valga 1800 PE (GS 5): livello 4, adventurer"
  - "Analoghi assenti dal bestiario offline, statistiche SRD 5.1 a memoria (Rule 3): Marilith pf 189, 6 spade lunghe 13 cut + coda 15 blunt (15000 PE); Testuggine dragona pf 341, morso 26 pierce + 2 artigli 16 cut (18000 PE). PE dei goblinoidi/orchi NON TROVATO dal Monster Manual a memoria: Orog 450 (GS 2), Capo goblin 200 (GS 1), Capitano hobgoblin 700 (GS 3)"
  - "Analoghi in catena: Urvinass = Dracolich adulto (a sua volta Drago rosso adulto, f 1) scalato a 155000 (f 2.93); Lung Wang anziano = Lung Wang adulto scalato a 41000 (f 1.51); Orgeal = Lich scalato a 208000 (f 2.51); Sciamano goblin = profilo del Cultista (analog `Cultista`, f 1) per tracciabilità"
  - "Drago d'ombra adulto/anziano: il morso infuocato dell'analogo rosso è ritipizzato `necrotic` (il documento: soffio che causa necrosi); Dracolich adulto e Urvinass tengono `fire` (fuoco nero)"
  - "Golem di ferro: schianto + spada (20 blunt + 23 cut, il documento: forza fisica e armi); nessuna debolezza (D-12)"
  - "Attacchi contati: Tarrasque morso + 2 artigli + corna + coda; Kraken 3 tentacoli (60 blunt, tempesta di fulmini esclusa: azione leggendaria); draghi morso + 2 artigli (soffio a ricarica escluso); Bandito la balestra (5 pierce, la più alta, ritipizzata); Combattente tribale e Veterano la variante a una mano; Gladiatore 2 lance + botta di scudo (22 pierce + 9 blunt); Assassino 2 spade corte con veleno (12 pierce + 48 poison)"
  - "Locations: Drago di rame adulto/antico e Tarrasque `[all]` (habitat ignoto per la regola D-13); Kraken `ladows`; Lung Wang `ladows, delants`; draghi rossi `vulcano, belleholmIsland`; d'argento `mountainLamstone, hills`; blu `desert`; non morti di Necrorian `glounet`"
  - "Debolezze: non morti `radiant` (Artropal, Dracolich, draghi d'ombra, Urvinass, Lich, Demilich, Orgeal); draghi rossi `cold`; draghi d'argento `fire` (soffio gelido)"
metrics:
  duration: "~35 min"
  completed: 2026-11-02
---

# Phase 11 Plan 22: Leggendari, umani ostili, orchi e gigante delle colline Summary

Tredici lore leggendarie e ventidue boss `legendary` (fascia `legend`, livello derivato), cinque lore di gruppo e ventuno `humanoid` dell'intake dell'utente (14 umani ostili, 7 fra orchi, goblinoidi e il solo gigante delle colline): il bestiario della fase sale a 150 nemici.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Leggendari (13 lore + 22 nemici `legendary`) | 5975ec6 | content/lore/leggendari.yaml, content/enemies/leggendari.yaml |
| 2 | Umani ostili (5 lore + 14 nemici) | 5293de3 | content/lore/umani.yaml, content/enemies/umani.yaml |
| 3 | Orchi, goblinoidi e gigante delle colline (7) | c5e4eb7 | content/enemies/giganti-orchi.yaml |

## Verifiche

- Task 1: `grep -c "category: legendary"` → `22`; `grep -c "type: enemy"` (lore) → `13`; `grep -cE "^\s+level:"` → `0`; `--check` exit 0 (`errors: []`, 0 warning; lore 400, enemies 129); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 2: `grep -c "category: humanoid" content/enemies/umani.yaml` → `14`; `grep -c "type: enemy" content/lore/umani.yaml` → `5`; `--check` exit 0 (`errors: []`, 0 warning; lore 405, enemies 143); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 3: `grep -c "category: humanoid" content/enemies/giganti-orchi.yaml` → `7`; `grep -ci "ettin"` → `0`; `cat content/enemies/*.yaml | grep -c "^- id:"` → `150` (≥ 140); `--check` exit 0 (`errors: []`, 0 warning; enemies 150); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Nessun codice `.ts` toccato: niente build, tsc o prettier. `git diff --exit-code src/schema.gql` exit 0. Nessun accesso al DB (solo `--check` e `--new-id`, offline).
- Id: `--new-id 35` (13 + 22), `--new-id 20` (5 + 14, l'ultimo `6ae80bf6947d6a423521c71b` non usato), `--new-id 7`.

## Riconciliazione dei conteggi (62/13)

Il documento ha 62 intestazioni di mostri (il «63» della roadmap conta un `[IMG]` doppio sotto «Draghi cucciolo - giovani») e 13 schede leggendarie, non 14: Tarrasque, Kraken, Artropal, Goristro, Dracolich adulto, Drago d'ombra adulto - anziano, Draghi adulti - antichi, Urvinass, Lung Wang adulto e anziano, Golem di ferro, Lich, Demilich, Re lich Orgeal. I «99» di ROADMAP/REQUIREMENTS sono 62 + 22 animali + 13 leggendari + 2 arrotondamenti. Nessuna scheda inventata: le 13 lore leggendarie diventano 22 varianti (D-09). Bestiario della fase: 84 mostri (Arbusto incluso) + 23 animali + 22 leggendari + 21 umanoidi = 150 nemici; lore 405.

## Tabella di revisione dei nemici

Valori di `content/config.yaml`: `xp = max(1, round(PE × 0.14084507))`, `lifePoints = PF × 100`; livello derivato dalla colonna Medio (`mediumPeByLevel`) perché nessuna voce ha `level`; i leggendari sono `legend` per `category`.

### Leggendari

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Tarrasque | 20 (derivato) | legend | 155000 | 21831 | 67600 | - |
| Kraken | 20 (derivato) | legend | 50000 | 7042 | 47200 | - |
| Artropal | 20 (derivato) | legend | 155000 | 21831 | 29300 | Lich (33000 PE, f 2.17) |
| Goristro | 20 (derivato) | legend | 18000 | 2535 | 20800 | Marilith (15000 PE, f 1.1) |
| Dracolich adulto | 20 (derivato) | legend | 18000 | 2535 | 25600 | Drago rosso adulto (18000 PE, f 1) |
| Drago d'ombra adulto | 20 (derivato) | legend | 38400 | 5408 | 37400 | Drago rosso adulto (18000 PE, f 1.46) |
| Drago d'ombra anziano | 20 (derivato) | legend | 204800 | 28845 | 99400 | Drago rosso antico (62000 PE, f 1.82) |
| Drago rosso adulto | 20 (derivato) | legend | 18000 | 2535 | 25600 | - |
| Drago blu adulto | 20 (derivato) | legend | 15000 | 2113 | 22500 | - |
| Drago d'argento adulto | 20 (derivato) | legend | 15000 | 2113 | 24300 | - |
| Drago di rame adulto | 20 (derivato) | legend | 11000 | 1549 | 18400 | - |
| Drago rosso antico | 20 (derivato) | legend | 62000 | 8732 | 54600 | - |
| Drago blu antico | 20 (derivato) | legend | 50000 | 7042 | 48100 | - |
| Drago d'argento antico | 20 (derivato) | legend | 50000 | 7042 | 48700 | - |
| Drago di rame antico | 20 (derivato) | legend | 33000 | 4648 | 35000 | - |
| Urvinass il non-morto | 20 (derivato) | legend | 155000 | 21831 | 75000 | Dracolich adulto (18000 PE, f 2.93) |
| Lung Wang adulto | 20 (derivato) | legend | 18000 | 2535 | 34100 | Testuggine dragona (18000 PE, f 1) |
| Lung Wang anziano | 20 (derivato) | legend | 41000 | 5775 | 51500 | Lung Wang adulto (18000 PE, f 1.51) |
| Golem di ferro | 20 (derivato) | legend | 15000 | 2113 | 21000 | - |
| Lich | 20 (derivato) | legend | 19200 | 2704 | 13500 | - |
| Demilich | 20 (derivato) | legend | 24500 | 3451 | 11600 | Lich (33000 PE, f 0.86) |
| Orgeal il Re lich | 20 (derivato) | legend | 208000 | 29296 | 33900 | Lich (33000 PE, f 2.51) |

### Umani ostili

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Bandito | 1 (derivato) | rookie | 25 | 4 | 1100 | - |
| Picchiatore | 2 (derivato) | rookie | 100 | 14 | 3200 | - |
| Capo dei Banditi | 4 (derivato) | adventurer | 450 | 63 | 6500 | - |
| Assassino | 17 (derivato) | hero | 3900 | 549 | 7800 | - |
| Cultista | 1 (derivato) | rookie | 25 | 4 | 900 | - |
| Cultista fanatico | 4 (derivato) | adventurer | 450 | 63 | 3300 | - |
| Sacerdote corrotto | 4 (derivato) | adventurer | 450 | 63 | 2700 | - |
| Mago rinnegato | 13 (derivato) | mage | 2300 | 324 | 4000 | - |
| Arcimago | 20 (derivato) | hero | 8400 | 1183 | 9900 | - |
| Combattente tribale | 1 (derivato) | rookie | 25 | 4 | 1100 | - |
| Berserker | 4 (derivato) | adventurer | 450 | 63 | 6700 | - |
| Veterano | 6 (derivato) | paladin | 700 | 99 | 5800 | - |
| Cavaliere rinnegato | 6 (derivato) | paladin | 700 | 99 | 5200 | - |
| Gladiatore | 11 (derivato) | mage | 1800 | 254 | 11200 | - |

### Orchi, goblinoidi e gigante delle colline

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Orco | 2 (derivato) | rookie | 100 | 14 | 1500 | - |
| Orog capo orco | 4 (derivato) | adventurer | 450 | 63 | 3200 | Orco (100 PE, f 2.12) |
| Bugbear | 3 (derivato) | adventurer | 200 | 28 | 2700 | - |
| Capo goblin | 3 (derivato) | adventurer | 200 | 28 | 2700 | Bugbear (200 PE, f 1) |
| Capitano hobgoblin | 6 (derivato) | paladin | 700 | 99 | 5800 | Veterano (700 PE, f 1) |
| Sciamano goblin | 1 (derivato) | rookie | 25 | 4 | 900 | Cultista (25 PE, f 1) |
| Gigante delle colline | 11 (derivato) | mage | 1800 | 254 | 10500 | - |

## Deviazioni dal piano

**1. [Rule 3 - Bloccante] Statistiche di analoghi assenti dal bestiario offline**
- **Trovato durante:** Task 1 e 3
- **Problema:** Marilith (analogo del Goristro) e Testuggine dragona (analogo dei Lung Wang) non hanno una voce in `bestiary-stats.md`; Orog, Capo goblin e Capitano hobgoblin sono NON TROVATO senza PE.
- **Soluzione:** statistiche SRD 5.1 e PE del Monster Manual a memoria (vedi decisioni), registrate in `source.analog`.
- **Commit:** 5975ec6, c5e4eb7

**2. [Rule 1 - Coerenza] Sacerdote corrotto a 450 PE** — il piano e D-07 dicono 450, il bestiario 1800: tenuto 450 (scelta dell'utente), da confermare.

## Da far rivedere all'utente

- Lich (13500 lifePoints, 10 cold) e Demilich (11600) sono boss `legend` più fragili di molti mostri hero: con i PE del documento e il PF del bestiario restano bassi; valutare un override `lifePoints` o il fattore PE.
- Drago d'ombra anziano 204800 PE (più del Tarrasque) e Orgeal 208000: valori del documento.
- Goristro con le spade della Marilith (85.8 cut): il documento dice che combatte solo con il corpo; si può ritipizzare in `blunt`.
- Drago di rame adulto/antico e Tarrasque `[all]`: il documento non dà un habitat.
- Capo goblin = Bugbear (f 1) e Capitano hobgoblin = Veterano (f 1): stesse statistiche dell'analogo.

## Known Stubs

Nessuno oltre agli `imagePath` provvisori `assets/images/<slug>.png` (D-13, sostituiti dal passaggio immagini D-24).

## Self-Check: PASSED

- File creati presenti: content/lore/leggendari.yaml, content/lore/umani.yaml, content/enemies/leggendari.yaml, content/enemies/umani.yaml, content/enemies/giganti-orchi.yaml.
- Commit presenti: 5975ec6, 5293de3, c5e4eb7.
