---
phase: 11-popolamento-del-mondo
plan: 19
subsystem: content
tags: [content, lore, enemies, pets, BE-CONTENT-01, BE-CONTENT-03, BE-CONTENT-04, BE-CONTENT-05]
requires: ["11-13", "11-14", "11-16"]
provides:
  - "content/lore/animali.yaml: 22 lore `animal` (una per scheda della sezione «Animali»), id `6ae8065202a77381730f280e`..`…2823`"
  - "content/lore/piante.yaml: 9 lore `plant`, id `6ae8065202a77381730f2824`..`…282c`"
  - "content/enemies/animali.yaml: 23 nemici `category: animal` (Cavallo leggero e Cavallo da guerra separati), id `6ae806b55093fb43140756d1`..`…56e7`; 14 con PE ≤ `hunt.maxAnimalPe` (200) = prede delle hunt"
  - "content/pets/cavalcature.yaml: Cavallo da viaggio invariato + 12 cavalcature nuove, id `6ae8070540e5e6676b7d6f8d`..`…6f98`"
affects: [11-23, 11-24]
tech-stack:
  added: []
  patterns:
    - "generatori usa e getta nello scratchpad: `gen15/gen.js` con le spec `gen19/animali.js` e `gen19/piante.js` per le lore, `gen19/enemies.js` (copia di `gen18/enemies.js` con `category: animal` e tabella delle prede), `gen19/pets.js` che accoda le cavalcature e stampa la tabella; non committati"
key-files:
  created:
    - content/lore/animali.yaml
    - content/lore/piante.yaml
    - content/enemies/animali.yaml
  modified:
    - content/pets/cavalcature.yaml
decisions:
  - "Analoghi delle tre schede NON TROVATO assenti dal bestiario offline, statistiche SRD 5.1 a memoria: Sciame di Insetti pf 22, morsi 10 pierce (100 PE); Squalo Gigante pf 126, morso 22 pierce (1800); Squalo Cacciatore pf 45, morso 13 pierce (450)"
  - "PF dal bestiario anche dove il PE del documento è molto più alto del GS SRD (regola di 11-REPO-RULES): Piovra gigante hero 4800 PE con 5200 lifePoints e 10 blunt, Orso grigio e Cinghiale gigante paladin 1200 PE con 3400/4200 lifePoints; da rivedere a occhio"
  - "Coccodrillo anche su `temistosLake` (il testo: paludi e rive dei fiumi, «principalmente» Paludi e Belleholm): senza, le 10 città del lago (Mirwen e la Teocrazia) non avrebbero nessuna preda di hunt"
  - "Cavallo leggero e Cavallo da guerra sono `animal` con PE 50/100 e quindi prede possibili delle hunt sulle `valanPlains`, come vuole la regola del generatore (categoria animal + PE ≤ 200)"
  - "Pet: lo schema `PetEntry` non ha `description` (campo sconosciuto rifiutato): la descrizione di 1–2 frasi con la zona d'uso è un commento YAML sopra ogni voce; `imagePath` `pets/<slug>.png` come il Cavallo da viaggio esportato (`pets/horse.png`)"
  - "Pet: danni della Tartaruga gigante dall'analogo Cinghiale gigante (10 cut × 100), del Cammello dal Cavallo da guerra (11 blunt × 100); multiattacchi sommati per tipo come per i nemici"
  - "Lore: Worg collegato anche alla lore Goblin `6ae804947fe539950fad17c8`; Cavallo anche allo stato Repubblica dei Valan; Lumella a Nydos e al Culto delle fiamme; Lacrime della vergine a Mirwa e alla Teocrazia di Mirwa; Carissia a «La magia di Klimmeck»; Protettori ancestrali alla Foresta di Minnely e alla città Ko Shaeras; Bandiera mortuaria senza collegamenti (cresce presso cimiteri, nessuna regione)"
metrics:
  duration: "~30 min"
  completed: 2026-11-02
---

# Phase 11 Plan 19: Animali, piante e cavalcature Summary

Ventidue lore `animal`, nove lore `plant`, ventitré nemici `category: animal` (quattordici prede da hunt con PE ≤ 200 distribuite sui `PoiType` comuni, 163 città su 167 con almeno una preda) e dodici cavalcature nuove accanto al Cavallo da viaggio invariato, con `speedModifier` da 1.2 a 4, HP dal bestiario × 100 e prezzi in `Coins` normalizzati.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Lore degli animali e delle piante | d8c543b | content/lore/animali.yaml, content/lore/piante.yaml |
| 2 | Animali come nemici (`category: animal`) | 98d8ba3 | content/enemies/animali.yaml |
| 3 | Cavalcature (`pets`) | 42f1af3 | content/pets/cavalcature.yaml |

## Verifiche

- Task 1: `grep -c "type: animal"` → `22`; `grep -c "type: plant"` → `9`; `--check` exit 0 (`errors: []`, 155 warning `città senza lore`, invariati; lore 232); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 2: `grep -c "category: animal"` → `23`; `grep -cE "^\s+pe: ([0-9]|[1-9][0-9]|1[0-9]{2}|200)$"` → `14`; `grep -cE "^\s+(xp|lifePoints):"` → `0`; `--check` exit 0 (enemies 107, 155 warning); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 3: `grep -c "^- id:"` → `13`; `grep -c "name: Cavallo da viaggio"` → `1`; `grep -c "speedModifier: null"` → `0`; `git diff` del file solo aggiunte (0 righe rimosse); `--check` exit 0 (pets 13); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Nessun codice `.ts` toccato: niente build, tsc o prettier; `git diff --exit-code src/schema.gql` exit 0.

## Tabella di revisione dei nemici

Valori di `content/config.yaml`: `xp = max(1, round(PE × 0.14084507))`, `lifePoints = PF × 100`; fascia da `tiers` sul livello del documento (limite inferiore degli intervalli).

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Pegaso | 4 | adventurer | 450 | 63 | 5900 | - |
| Formiche giganti assassine | 2 | rookie | 125 | 18 | 2500 | Sciame di Insetti (100 PE, f 1.12) |
| Aquila gigante | 3 | adventurer | 200 | 28 | 2600 | - |
| Worg | 2 | rookie | 100 | 14 | 2600 | - |
| Serpente stritolatore gigante | 4 | adventurer | 450 | 63 | 6000 | - |
| Megalodonte | 20 | hero | 6400 | 901 | 23800 | Squalo Gigante (1800 PE, f 1.89) |
| Piovra gigante | 18 | hero | 4800 | 676 | 5200 | - |
| Lupo invernale | 6 | paladin | 700 | 99 | 7500 | - |
| Lupo | 1 | rookie | 50 | 7 | 1100 | - |
| Orso grigio | 10 | paladin | 1200 | 169 | 3400 | - |
| Alce | 4 | adventurer | 450 | 63 | 1300 | - |
| Cinghiale | 1 | rookie | 50 | 7 | 1100 | - |
| Cinghiale gigante | 10 | paladin | 1200 | 169 | 4200 | - |
| Squalo tropicale | 2 | rookie | 100 | 14 | 2200 | - |
| Squalo di sabbia | 13 | mage | 2300 | 324 | 10200 | Squalo Cacciatore (450 PE, f 2.26) |
| Cavallo leggero | 1 | rookie | 50 | 7 | 1300 | - |
| Cavallo da guerra | 2 | rookie | 100 | 14 | 1900 | - |
| Pantera | 1 | rookie | 50 | 7 | 1300 | - |
| Iena | 1 | rookie | 10 | 1 | 500 | - |
| Coccodrillo | 2 | rookie | 100 | 14 | 1900 | - |
| Vespa gigante | 2 | rookie | 100 | 14 | 1300 | - |
| Avvoltoio | 1 | rookie | 10 | 1 | 500 | - |
| Tigre | 3 | adventurer | 200 | 28 | 3700 | - |

Danni per round (× `damageScale` 100 nel loader): Pegaso 11 blunt; Formiche 11.2 pierce; Aquila 6 pierce + 10 cut; Worg 10 pierce; Serpente 13 blunt (stritolare, nessun multiattacco); Megalodonte 41.58 pierce; Piovra 10 blunt; Lupo invernale 11 pierce (soffio con ricarica escluso); Lupo 7 pierce; Orso grigio 11 cut + 8 pierce; Alce 8 blunt; Cinghiale 4 cut; Cinghiale gigante 10 cut; Squalo tropicale 6 pierce; Squalo di sabbia 29.38 pierce; Cavallo leggero 8 blunt; Cavallo da guerra 11 blunt; Pantera 5 pierce; Iena 3 pierce; Coccodrillo 7 pierce; Vespa 5 pierce + 10 poison; Avvoltoio 2 pierce; Tigre 8 pierce. Debolezze: solo Lupo invernale → `fire` (creatura di ghiaccio, immune al freddo); nessuna magia (animali).

## Prede delle hunt (PE ≤ `hunt.maxAnimalPe` = 200, input del generatore 11-23)

| nome | id | PE | locations |
| --- | --- | --- | --- |
| Formiche giganti assassine | `6ae806b55093fb43140756d2` | 125 | hills, drusteaPlains, valanPlains |
| Aquila gigante | `6ae806b55093fb43140756d3` | 200 | mountainTemistos, mountainLamstone, hills, drusteaPlains, valanPlains |
| Worg | `6ae806b55093fb43140756d4` | 100 | forest, hills, drusteaPlains, valanPlains, mountainLamstone, mountainTemistos |
| Lupo | `6ae806b55093fb43140756d9` | 50 | forest, minnelyForest, mountainLamstone, mountainTemistos, farNorth |
| Cinghiale | `6ae806b55093fb43140756dc` | 50 | forest, minnelyForest |
| Squalo tropicale | `6ae806b55093fb43140756de` | 100 | delants, ladows, liberiaIsland |
| Cavallo leggero | `6ae806b55093fb43140756e0` | 50 | valanPlains |
| Cavallo da guerra | `6ae806b55093fb43140756e1` | 100 | valanPlains |
| Pantera | `6ae806b55093fb43140756e2` | 50 | belleholmIsland |
| Iena | `6ae806b55093fb43140756e3` | 10 | valanPlains, desert, belleholmIsland |
| Coccodrillo | `6ae806b55093fb43140756e4` | 100 | swamp, belleholmLake, belleholmIsland, temistosLake |
| Vespa gigante | `6ae806b55093fb43140756e5` | 100 | valanPlains, oasis, belleholmIsland |
| Avvoltoio | `6ae806b55093fb43140756e6` | 10 | belleholmIsland, desert, oasis |
| Tigre | `6ae806b55093fb43140756e7` | 200 | valanPlains |

Copertura sullo snapshot (POI non marker e non dungeon con almeno una preda): 163 città su 167. Restano senza hunt Balkuldir e Candelaria (nessun POI cacciabile), Frekti (`graveyard`/`undergroundTemistos`) e Kom Dural (`graveyard`/`undergroundLamstone`): nessun animale del documento vive sottoterra o nei cimiteri.

## Cavalcature

| nome | id | speedModifier | velocità | PF da | maxLifePoints | danni | buyPrice | sellPrice |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cavallo leggero | `6ae8070540e5e6676b7d6f8d` | 2.5 | 25 | Cavallo da Galoppo | 1300 | blunt 800 | 40 arg | 20 arg |
| Cavallo da guerra | `6ae8070540e5e6676b7d6f8e` | 2 | 20 | Cavallo da Guerra | 1900 | blunt 1100 | 80 arg | 40 arg |
| Alce | `6ae8070540e5e6676b7d6f8f` | 2 | 20 | Alce | 1300 | blunt 800 | 30 arg | 15 arg |
| Cammello del Mar Sabbioso | `6ae8070540e5e6676b7d6f90` | 2 | 20 | analogo Cavallo da Guerra | 1900 | blunt 1100 | 35 arg | 17 arg 50 rame |
| Worg | `6ae8070540e5e6676b7d6f91` | 2.5 | 25 | Worg | 2600 | pierce 1000 | 1 oro | 50 arg |
| Lupo invernale addestrato | `6ae8070540e5e6676b7d6f92` | 2.5 | 25 | Lupo Invernale | 7500 | pierce 1100 | 2 oro | 1 oro |
| Cinghiale gigante da sella | `6ae8070540e5e6676b7d6f93` | 1.5 | 15 | Cinghiale Gigante | 4200 | cut 1000 | 1 oro 50 arg | 75 arg |
| Tartaruga gigante delle isole | `6ae8070540e5e6676b7d6f94` | 1.2 | 12 | analogo Cinghiale Gigante, PF × 1.5 | 6300 | cut 1000 | 1 oro | 50 arg |
| Ippogrifo | `6ae8070540e5e6676b7d6f95` | 3 | 30 | Ippogrifo | 1900 | cut 1000 + pierce 800 | 3 oro | 1 oro 50 arg |
| Aquila gigante | `6ae8070540e5e6676b7d6f96` | 3 | 30 | Aquila Gigante | 2600 | pierce 600 + cut 1000 | 4 oro | 2 oro |
| Grifone | `6ae8070540e5e6676b7d6f97` | 3.5 | 35 | Grifone | 5900 | cut 1100 + pierce 800 | 6 oro | 3 oro |
| Pegaso | `6ae8070540e5e6676b7d6f98` | 4 | 40 | Pegaso | 5900 | blunt 1100 | 10 oro | 5 oro |

Tutti con `xp: 0`, `maxXp: 100`, `currentLifePoints = maxLifePoints`, `energy: []`. Velocità massima 40 (Pegaso, 10 oro), come vuole la mitigazione T-11-67.

## Da rivedere (utente)

- Scala degli HP dei pet: il Cavallo da viaggio esportato ha 30 HP e nessun danno, le cavalcature nuove 1 300–7 500 HP (PF × 100 come chiede il piano, scala dei nemici). Se i pet combattono, il cavallo esistente è molto più fragile dei nuovi.
- Prezzi: Cavallo leggero (40 argento, velocità 25) costa meno del Cavallo da viaggio (1 oro, velocità 20); Alce, Cammello e Cavallo da guerra costano meno di un oro con la stessa velocità del Cavallo da viaggio. Tabella del piano applicata alla lettera.
- Piovra gigante (hero, 4 800 PE) con soli 5 200 lifePoints e 10 blunt; Orso grigio e Cinghiale gigante (paladin, 1 200 PE) con 3 400/4 200 lifePoints: PF del bestiario (GS SRD molto più basso del PE del documento). Un override `lifePoints`/`damages` nel file li allineerebbe alla fascia.
- Cavalli come prede di hunt sulle `valanPlains`: la regola del generatore li ammette; se non li si vuole cacciare, alzare il loro `pe` sopra 200 non è corretto (è il documento): servirebbe una regola del generatore (fuori da questo piano).
- Coccodrillo su `temistosLake` (estensione dell'habitat per coprire le città del lago).

## Riconciliazione del conteggio delle schede

Il documento ha 62 intestazioni di mostri (il «63» della roadmap conta un `[IMG]` doppio sotto «Draghi cucciolo - giovani») e 13 leggendarie (non 14); i «99» di ROADMAP/REQUIREMENTS sono 62 + 22 animali + 13 leggendari + 2 arrotondamenti. Questo piano copre le 22 schede «Animali» (23 varianti: la scheda «Cavallo e Cavallo da guerra» ne ha due) e le 9 «Piante», senza schede inventate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Statistiche dei tre analoghi assenti dal bestiario offline**
- **Trovato durante:** Task 2
- **Problema:** il bestiario indica gli analoghi Sciame di Insetti, Squalo Gigante e Squalo Cacciatore, ma `bestiary-stats.md` non ha le loro schede.
- **Fix:** statistiche SRD 5.1 note (nessuna rete), scalate con la regola della radice; elencate nel frontmatter `decisions`.
- **File:** content/enemies/animali.yaml
- **Commit:** 98d8ba3

**2. [Rule 3 - Blocking] Descrizione dei pet senza campo nello schema**
- **Trovato durante:** Task 3
- **Problema:** il piano chiede descrizioni di 1–2 frasi, ma `PetEntry` (e il modello `Pet`) non ha `description` e la validazione rifiuta i campi sconosciuti.
- **Fix:** descrizione come commento YAML sopra ogni voce (i commenti non sono dati); nessun cambio di schema.
- **File:** content/pets/cavalcature.yaml
- **Commit:** 42f1af3

**3. [Rule 2 - Copertura] Coccodrillo esteso a `temistosLake`**
- **Trovato durante:** Task 2 (controllo di copertura chiesto dal piano)
- **Problema:** con i soli habitat del testo 14 città (10 sul lago) non avevano nessuna preda di hunt.
- **Fix:** `temistosLake` aggiunto al Coccodrillo; copertura da 153 a 163 città su 167.
- **Commit:** 98d8ba3

## Known Stubs

Nessuno: `imagePath` provvisori (D-13/D-24), le immagini arrivano nel passaggio di `images.yaml`.

## Threat Flags

Nessuna superficie nuova: solo YAML di contenuto validati da `--check`. T-11-67 (velocità massima 4, prezzo massimo 10 oro), T-11-68 (`--check` su tutti i campi non-null) e T-11-69 (Cavallo da viaggio invariato, diff solo aggiunte) mitigati.

## Self-Check: PASSED

- FOUND: content/lore/animali.yaml
- FOUND: content/lore/piante.yaml
- FOUND: content/enemies/animali.yaml
- FOUND: content/pets/cavalcature.yaml
- FOUND: d8c543b
- FOUND: 98d8ba3
- FOUND: 42f1af3
