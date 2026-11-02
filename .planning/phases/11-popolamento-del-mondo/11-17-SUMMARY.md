---
phase: 11-popolamento-del-mondo
plan: 17
subsystem: content
tags: [content, lore, enemies, BE-CONTENT-01, BE-CONTENT-03, BE-CONTENT-04]
requires: ["11-13", "11-14"]
provides:
  - "content/lore/creature-b.yaml: 21 lore `enemy` (una per scheda, Elementali … Miconide), id `6ae802f65f3e1244a34ae376`..`…38a`"
  - "content/enemies/mostri-b.yaml: 30 nemici `category: monster` (uno per variante), id `6ae802f652eeaf280316c8bb`..`…c8d8`, con `source` e senza override"
  - "content/enemies/esistenti.yaml: Arbusto Maligno `68c28e9789b2155e53b835b5` con `source` (analogo Albero Risvegliato) e `relatedLore` verso la sua lore `…ae384`; override esportati invariati"
affects: [11-18, 11-19, 11-22, 11-23]
tech-stack:
  added: []
  patterns:
    - "stessi generatori usa e getta di 11-16 (`gen15/gen.js` per le lore, copia di `gen16/enemies.js` in `gen17/enemies.js` per i nemici); non committati"
key-files:
  created:
    - content/lore/creature-b.yaml
    - content/enemies/mostri-b.yaml
  modified:
    - content/enemies/esistenti.yaml
decisions:
  - "Statistiche di Fungo Violetto (analogo dei miconidi) e Albero Risvegliato (analogo dell'Arbusto Maligno), assenti dal bestiario offline, prese dall'SRD 5.1: Fungo Violetto pf 18, 1d4 tocchi marcescenti da 4 necrotic (media 2.5 tocchi = 10 necrotic); Albero Risvegliato pf 59, schianto 14 blunt"
  - "Licantropo pipistrello (documento: 7/8 PALADINO 800) non creato: il piano elenca 30 varianti senza di lui e il bestiario non ha la scheda"
  - "Arbusto Maligno: `locations: [all]` lasciato com'è (il piano tocca solo category, source e relatedLore; D-04); il documento direbbe `belleholmIsland`, `liberiaIsland`"
  - "Elementale del fuoco: si conta solo il danno del contatto (10 fire × 2), non i 5 fire del bersaglio in fiamme nei turni successivi; Idra: 5 teste dell'SRD × morso 10 = 50 pierce; licantropi: righe «+N» del parser trattate come alternative (spada corta, lancia), orso 2 artigli, tigre 2 artigli in forma ibrida; Manticora morso + 2 artigli (come la Belva di 11-16)"
  - "Debolezze: Elementale del fuoco → cold, Elementale della terra → thunder (vulnerabilità del bestiario), Fantasma e Fuoco fatuo (non morti) → radiant, Golem di carne → fire (documento), miconidi → fire; Arbusto invariato (fire + cut esportati)"
  - "Incantatori: Fantasma (possessione: Controllo Psichico, Rito Necrotico), Fomorian (occhio maledetto: Maledizione), Djinni (onda tonante, vortici: Boom Sonico, Collasso Atmosferico), Manto assassino (illusioni, grido: Incubo ad occhi aperti, Canto della Follia), Merrow (poteri sciamanici: Tuono degli antenati, Soffio del gelo dei monti), miconidi (poteri psichici: Controllo Psichico; il sovrano anche Stretta Psichica); golem, licantropi e Fuoco fatuo senza magie"
  - "Locations: Elementali, Djinni e Melma grigia `all` (documento: ovunque); grotte e caverne → `undergroundLamstone`, `undergroundTemistos`; mai `dungeon`"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
---

# Phase 11 Plan 17: Mostri B Summary

Ventuno lore `enemy` e trenta nemici `monster` da Elementali a Miconide, più `source` e `relatedLore` all'Arbusto Maligno esistente (override invariati, D-04); livello e PE dal documento, PF e danni dal bestiario offline, quattro voci NON TROVATO del file nuovo (Fomorian, Merrow, due miconidi) più l'Arbusto scalate dall'analogo con `f = (PE_doc / PE_analogo)^0.5`.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Lore delle 21 schede (`type: enemy`) | 51dc977 | content/lore/creature-b.yaml |
| 2 | Nemici per variante (`category: monster`) + Arbusto Maligno | 902a182 | content/enemies/mostri-b.yaml, content/enemies/esistenti.yaml |

## Verifiche

- Task 1: `grep -c "type: enemy"` → `21`; `grep -c "^  relatedLore:"` → `21`; `--check` exit 0 (`errors: []`, 155 warning `città senza lore`, invariati; lore 180); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 2: `grep -c "category: monster"` → `30`; `grep -c "^  source:"` → `30`; `grep -cE "^\s+(xp|lifePoints):"` → `0`; `grep -c "analog:"` → `4`; `grep -c "enhancing\|dungeon"` → `0`; `--check` exit 0 (`errors: []`, 155 warning, nessun warning nuovo; enemies 58); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Nessun codice `.ts` toccato: niente build, tsc o prettier.

## Tabella di revisione dei nemici

Valori di `content/config.yaml`: `xp = max(1, round(PE × 0.14084507))`, `lifePoints = PF × 100`; fascia da `tiers` sul livello del documento (limite inferiore degli intervalli).

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Elementale dell'aria | 11 | mage | 1800 | 254 | 9000 | - |
| Elementale dell'acqua | 11 | mage | 1800 | 254 | 11400 | - |
| Elementale del fuoco | 11 | mage | 1800 | 254 | 10200 | - |
| Elementale della terra | 11 | mage | 1800 | 254 | 12600 | - |
| Ettercap | 4 | adventurer | 450 | 63 | 4400 | - |
| Fantasma | 9 | paladin | 1100 | 155 | 4500 | - |
| Fauce gorgogliante | 4 | adventurer | 450 | 63 | 6700 | - |
| Fomorian | 17 | hero | 3900 | 549 | 16000 | Ettin (1100 PE, f 1.88) |
| Fuoco fatuo | 4 | adventurer | 450 | 63 | 2200 | - |
| Djinni | 20 | hero | 7200 | 1014 | 16100 | - |
| Gargoyle | 4 | adventurer | 450 | 63 | 5200 | - |
| Golem di carne | 11 | mage | 1800 | 254 | 9300 | - |
| Golem d'argilla | 20 | hero | 5000 | 704 | 13300 | - |
| Golem di pietra | 20 | hero | 5900 | 831 | 17800 | - |
| Grick | 4 | adventurer | 450 | 63 | 2700 | - |
| Grifone | 4 | adventurer | 450 | 63 | 5900 | - |
| Idra | 17 | hero | 3900 | 549 | 17200 | - |
| Ippogrifo | 3 | adventurer | 200 | 28 | 1900 | - |
| Licantropo ratto | 4 | adventurer | 450 | 63 | 3300 | - |
| Licantropo lupo | 6 | paladin | 700 | 99 | 5800 | - |
| Licantropo orso | 11 | mage | 1800 | 254 | 13500 | - |
| Licantropo cinghiale | 9 | paladin | 1100 | 155 | 7800 | - |
| Licantropo tigre | 9 | paladin | 1110 | 156 | 12000 | - |
| Manticora | 6 | paladin | 700 | 99 | 6800 | - |
| Manto assassino | 17 | hero | 3900 | 549 | 7800 | - |
| Melma grigia | 2 | rookie | 100 | 14 | 2200 | - |
| Merrow | 4 | adventurer | 450 | 63 | 5900 | Ogre (450 PE, f 1) |
| Mimic | 4 | adventurer | 450 | 63 | 5800 | - |
| Miconide adulto | 2 | rookie | 100 | 14 | 2500 | Fungo Violetto (50 PE, f 1.41) |
| Miconide sovrano | 4 | adventurer | 450 | 63 | 5400 | Fungo Violetto (50 PE, f 3) |
| Arbusto Maligno (esistente, `esistenti.yaml`) | 1 | rookie | 25 | 25 (override; derivato 4) | 100 (override; derivato 1400) | Albero Risvegliato (450 PE, f 0.24) |

Danni per round (× `damageScale` 100 nel loader): Elementale dell'aria 28 blunt; dell'acqua 26 blunt; del fuoco 20 fire; della terra 28 blunt; Ettercap 7 cut + 6 pierce + 4 poison; Fantasma 17 necrotic; Fauce gorgogliante 17 pierce; Fomorian 26.32 cut + 26.32 pierce; Fuoco fatuo 9 lightning; Djinni 36 cut + 9 lightning; Gargoyle 5 cut + 5 pierce; Golem di carne 26 blunt, d'argilla 32 blunt, di pietra 38 blunt; Grick 9 cut + 5 pierce; Grifone 11 cut + 8 pierce; Idra 50 pierce; Ippogrifo 10 cut + 8 pierce; Licantropo ratto 9 pierce, lupo 7 cut + 6 pierce, orso 26 cut, cinghiale 10 blunt + 10 cut, tigre 14 cut; Manticora 12 cut + 7 pierce; Manto assassino 7 cut + 10 pierce; Melma grigia 4 blunt + 7 acid; Merrow 13 blunt; Mimic 7 pierce + 4 acid; Miconide adulto 14.1 necrotic, sovrano 30 necrotic; Arbusto Maligno 3.36 blunt (solo nel `source`: a DB restano gli override esportati).

Da rivedere a occhio:
- Miconide sovrano (fattore 3 sul Fungo Violetto) fa 30 necrotic per round: alto per un adventurer (Ettercap e Fauce, stessi PE, 17).
- Idra 50 pierce (cinque teste) e Fomorian 52.64 totali: i più duri del gruppo fra gli hero insieme al Djinni (45).
- Manto assassino: PE da hero (3900) ma solo 78 PF (7800 `lifePoints`).
- Licantropo pipistrello non creato (vedi decisioni); Arbusto Maligno ancora `locations: [all]`.

## Riconciliazione del conteggio delle schede

Il documento ha 62 intestazioni di mostri (il «63» della roadmap conta il `[IMG]` doppio sotto «Draghi cucciolo - giovani») e 13 leggendarie (non 14); i «99» di ROADMAP/REQUIREMENTS sono 62 + 22 animali + 13 leggendari + 2 arrotondamenti. Questo piano copre 21 delle 62 schede di mostri (41 con le 20 di 11-16): 30 varianti nuove più l'Arbusto Maligno esistente, senza schede inventate. Il golem di ferro resta al piano dei leggendari (11-22).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Statistiche di due analoghi assenti dal bestiario offline**
- **Trovato durante:** Task 2
- **Problema:** il bestiario indica come analoghi «Fungo Violetto» (Miconide adulto e sovrano) e «Albero Risvegliato» (Arbusto Maligno), ma `bestiary-stats.md` non ha una scheda per nessuno dei due.
- **Fix:** statistiche SRD 5.1 note (nessuna rete): Fungo Violetto pf 18, PE 50, multiattacco di 1d4 tocchi marcescenti da 4 necrotic (2.5 tocchi medi = 10 necrotic); Albero Risvegliato pf 59, PE 450, schianto 14 blunt. Scalate con la regola della radice; l'utente può ritoccarle nel file.
- **File:** content/enemies/mostri-b.yaml, content/enemies/esistenti.yaml
- **Commit:** 902a182

Le altre scelte di stesura (attacchi contati, debolezze, magie, licantropo pipistrello, locations dell'Arbusto) sono nel frontmatter `decisions`.

## Known Stubs

Nessuno: `imagePath` punta allo slug atteso, le immagini arrivano nel passaggio di D-24 (l'Arbusto conserva il suo `assets/images/arbustoMaligno.png` esportato).

## Threat Flags

Nessuna superficie nuova: solo file YAML di contenuto validati da `--check`.

## Self-Check: PASSED

- FOUND: content/lore/creature-b.yaml
- FOUND: content/enemies/mostri-b.yaml
- FOUND: 51dc977
- FOUND: 902a182
