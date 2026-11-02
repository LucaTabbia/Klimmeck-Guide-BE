---
phase: 11-popolamento-del-mondo
plan: 16
subsystem: content
tags: [content, lore, enemies, BE-CONTENT-01, BE-CONTENT-03, BE-CONTENT-04]
requires: ["11-13", "11-14"]
provides:
  - "content/lore/creature-a.yaml: 20 lore `enemy` (una per scheda, Aboleth … Lung Wang giovane), id `6ae8018831ec3185a9e09920`..`…33`"
  - "content/enemies/mostri-a.yaml: 27 nemici `category: monster` (uno per variante), id `6ae8018892c2bed7f939c6e6`..`…c700`, con `source` e senza override"
affects: [11-17, 11-18, 11-19, 11-22, 11-23]
tech-stack:
  added: []
  patterns:
    - "generatore usa e getta nello scratchpad per i nemici: tabella JS → YAML (`source` con `damagePerRound` in flow, `analog` calcolato con la radice, `relatedLore` in linea con `# nome`, `spells` in block list con `# nome` risolto da `content/spells`, slug di `imagePath`) e stampa della tabella di revisione; non committato"
key-files:
  created:
    - content/lore/creature-a.yaml
    - content/enemies/mostri-a.yaml
  modified: []
decisions:
  - "Statistiche di Ombra e Drago di Bronzo Giovane (analoghi indicati dal bestiario ma senza scheda propria nel file offline) prese dall'SRD 5.1: Ombra pf 16, Risucchio di Forza 9 necrotic; Drago di Bronzo Giovane pf 142, morso 16 pierce + 2 artigli 12 cut"
  - "Drago d'ombra giovane: il danno energetico del morso dell'analogo (3 fire del drago rosso) diventa necrotic (il documento: soffio necrotico), scalato come gli altri"
  - "Soffi dei draghi di rame e d'argento esclusi dal danno per round anche senza «(Ricarica …)» nel bestiario: il parser ha perso la ricarica, che nell'SRD c'è per tutti i soffi"
  - "Driade: dal randello si prende la variante con randello incantato (8 blunt), non la somma delle due righe del parser"
  - "Debolezze dedotte (D-12): non morti e creature d'ombra → radiant (Banshee, Demone d'ombra, Drago d'ombra giovane); draghi rossi → cold; draghi d'argento (gelo) → fire; Cumulo strisciante e Driade (legata agli alberi) → fire; nessuna vulnerabilità esplicita nel bestiario per questo gruppo"
  - "Incantatori: Aboleth, Arpia, Banshee, Beholder, Demone d'ombra, Driade (poteri psichici, canto, urlo, raggi, possessione, incantesimi innati); Quasit, Imp e Doppelganger restano senza magie (invisibilità e mutaforma non sono magie del catalogo)"
  - "Lore: `relatedLore` verso le regioni dell'habitat; collegamenti tematici suggeriti da 11-15 per demoni (Il Vuoto f7e, Jur'gath), draghi (Amaerith) e driade (Enayr, Culto dell'armonia); Doppelganger senza regione (vive solo nelle città)"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
---

# Phase 11 Plan 16: Mostri A Summary

Venti lore `enemy` e ventisette nemici `monster` da Aboleth a Lung Wang giovane, con livello e PE dal documento, PF e danni dal bestiario offline, sei voci NON TROVATO scalate dall'analogo con `f = (PE_doc / PE_analogo)^0.5`; `xp`, `lifePoints` e `damages` restano derivati dal loader.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Lore delle 20 schede (`type: enemy`) | 942febe | content/lore/creature-a.yaml |
| 2 | Nemici per variante (`category: monster`) | 0ce4b97 | content/enemies/mostri-a.yaml |

## Verifiche

- Task 1: `grep -c "type: enemy"` → `20`; `grep -c "^  relatedLore:"` → `20`; `--check` exit 0 (`errors: []`, 155 warning `città senza lore`, invariati); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 2: `grep -c "category: monster"` → `27`; `grep -c "^  source:"` → `27`; `grep -cE "^\s+(xp|lifePoints):"` → `0`; `grep -c "analog:"` → `6`; `grep -c "enhancing\|dungeon"` → `0`; `--check` exit 0 (`errors: []`, 155 warning, nessun warning nuovo); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Nessun codice `.ts` toccato: niente build, tsc o prettier.

## Tabella di revisione dei nemici

Valori di `content/config.yaml`: `xp = max(1, round(PE × 0.14084507))`, `lifePoints = PF × 100`; fascia da `tiers` sul livello del documento (limite inferiore degli intervalli).

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Aboleth | 18 | hero | 5900 | 831 | 13500 | - |
| Ankheg | 4 | adventurer | 450 | 63 | 3900 | - |
| Arpia | 3 | adventurer | 200 | 28 | 3800 | - |
| Banshee | 9 | paladin | 1100 | 155 | 5200 | Wraith (1800 PE, f 0.78) |
| Basilisco | 6 | paladin | 700 | 99 | 5200 | - |
| Beholder | 20 | hero | 10000 | 1408 | 17600 | Aboleth (5900 PE, f 1.3) |
| Belva distorcente | 6 | paladin | 700 | 99 | 6800 | Manticora (700 PE, f 1) |
| Bulette | 11 | mage | 1800 | 254 | 9400 | - |
| Chimera | 13 | mage | 2300 | 324 | 11400 | - |
| Chuul | 9 | paladin | 1100 | 155 | 9300 | - |
| Cumulo strisciante | 11 | mage | 1800 | 254 | 13600 | - |
| Demone d'ombra | 9 | paladin | 1100 | 155 | 5300 | Ombra (100 PE, f 3.32) |
| Hezrou | 17 | hero | 3900 | 549 | 13600 | - |
| Quasit | 3 | adventurer | 200 | 28 | 700 | - |
| Imp | 3 | adventurer | 200 | 28 | 1000 | - |
| Doppelganger | 6 | paladin | 700 | 99 | 5200 | - |
| Drago d'ombra giovane | 20 | hero | 10000 | 1408 | 23100 | Drago Rosso Giovane (5900 PE, f 1.3) |
| Drago di rame cucciolo | 3 | adventurer | 200 | 28 | 2200 | - |
| Drago d'argento cucciolo | 4 | adventurer | 450 | 63 | 4500 | - |
| Drago blu cucciolo | 6 | paladin | 700 | 99 | 5200 | - |
| Drago rosso cucciolo | 9 | paladin | 1100 | 155 | 7500 | - |
| Drago di rame giovane | 15 | mage | 2900 | 408 | 11900 | - |
| Drago d'argento giovane | 19 | hero | 5000 | 704 | 16800 | - |
| Drago blu giovane | 19 | hero | 5000 | 704 | 15200 | - |
| Drago rosso giovane | 20 | hero | 5900 | 831 | 17800 | - |
| Driade | 3 | adventurer | 200 | 28 | 2200 | - |
| Lung Wang giovane | 17 | hero | 3900 | 549 | 14200 | Drago di Bronzo Giovane (3900 PE, f 1) |

Danni per round (× `damageScale` 100 nel loader): Aboleth 36 blunt (tre tentacoli); Ankheg 10 cut + 3 acid; Arpia 6 cut + 3 blunt; Banshee 16.38 necrotic; Basilisco 10 pierce + 7 poison; Beholder 46.8 blunt; Belva 12 cut + 7 pierce; Bulette 30 pierce; Chimera 10 blunt + 11 cut + 11 pierce; Chuul 22 blunt; Cumulo 26 blunt; Demone d'ombra 29.88 necrotic; Hezrou 22 cut + 15 pierce; Quasit 5 pierce + 5 poison; Imp 5 pierce + 10 poison; Doppelganger 14 blunt; Drago d'ombra 33.8 cut + 22.1 pierce + 3.9 necrotic; cuccioli rame 7 pierce, argento 9 pierce, blu 8 pierce + 3 lightning, rosso 9 pierce + 3 fire; giovani rame 22 cut + 15 pierce, argento 26 cut + 17 pierce, blu 24 cut + 16 pierce + 5 lightning, rosso 26 cut + 17 pierce + 3 fire; Driade 8 blunt; Lung Wang 24 cut + 16 pierce.

Da rivedere a occhio: il Beholder eredita dall'analogo Aboleth solo danno `blunt` (i raggi sono magie: Pietrificazione, Ipnosi di Massa, Piaga Necrotica); il Demone d'ombra con fattore 3.32 ha PF 53 ma danno alto (29.88) per un paladin.

## Riconciliazione del conteggio delle schede

Il documento ha 62 intestazioni di mostri (il «63» della roadmap conta il `[IMG]` doppio sotto «Draghi cucciolo - giovani») e 13 leggendarie (non 14); i «99» di ROADMAP/REQUIREMENTS sono 62 + 22 animali + 13 leggendari + 2 arrotondamenti. Questo piano copre 20 delle 62 schede di mostri (27 varianti: la scheda dei draghi ne ha 8), senza schede inventate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Statistiche di due analoghi assenti dal bestiario offline**
- **Trovato durante:** Task 2
- **Problema:** il bestiario indica come analoghi «Ombra» (Demone d'ombra) e «Drago di Bronzo Giovane» (Lung Wang giovane), ma `bestiary-stats.md` non ha una scheda per nessuno dei due: niente PF né attacchi da scalare.
- **Fix:** statistiche SRD 5.1 note (nessuna rete): Ombra pf 16, Risucchio di Forza 9 necrotic, PE 100; Drago di Bronzo Giovane pf 142, multiattacco morso 16 pierce + due artigli 12 cut, PE 3900. Scalate con la regola della radice come gli altri analoghi; l'utente può ritoccarle nel file.
- **File:** content/enemies/mostri-a.yaml
- **Commit:** 0ce4b97

Le altre scelte di stesura (tipo di energia del Drago d'ombra, soffi dei draghi metallici, randello della Driade, debolezze dedotte) sono nel frontmatter `decisions`.

## Known Stubs

Nessuno: `imagePath` punta allo slug atteso, le immagini arrivano nel passaggio di D-24.

## Threat Flags

Nessuna superficie nuova: solo file YAML di contenuto validati da `--check`.

## Self-Check: PASSED

- FOUND: content/lore/creature-a.yaml
- FOUND: content/enemies/mostri-a.yaml
- FOUND: 942febe
- FOUND: 0ce4b97
