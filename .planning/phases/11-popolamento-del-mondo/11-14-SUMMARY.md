---
phase: 11-popolamento-del-mondo
plan: 14
subsystem: content
tags: [content, spells, equipment, loot, BE-CONTENT-01, BE-CONTENT-05]
requires: ["11-12"]
provides:
  - "content/spells/sciamanesimo.yaml: 5 magie dello sciamanesimo (elementi e preghiere)"
  - "content/spells/vuoto.yaml: 5 magie del Vuoto (maledizioni, patti, bolle di caos)"
  - "content/equipment/unici.yaml: 27 equipaggiamenti unici (18 culti, 5 figure, 4 parti di mostri), 16 con `addedSpell`"
  - "content/loot/cibo-regionale.yaml (12 `hunger`) e content/loot/pozioni.yaml (6 `heal`)"
  - "content/loot/hunger.yaml: 4 `power` tarati sulla regola della Phase 14, ciascuno con commento"
affects: [11-16, 11-17, 11-18, 11-19, 11-22, 11-23, 11-25]
tech-stack:
  added: []
  patterns:
    - "file di catalogo scritti da script usa e getta nello scratchpad (mai committati) che consumano in ordine gli id di un solo `--new-id N`"
    - "correzione di un valore esportato = commento in coda alla riga (`power: 100 # power corretto in 11-14: 70 → 100 (1 power = 3 min, D-16)`)"
key-files:
  created:
    - content/spells/sciamanesimo.yaml
    - content/spells/vuoto.yaml
    - content/equipment/unici.yaml
    - content/loot/cibo-regionale.yaml
    - content/loot/pozioni.yaml
  modified:
    - content/loot/hunger.yaml
decisions:
  - "Le due magie assenti a DB (`68c19570541d89c481b8325a`, `68c19570541d89c481b8327e`) NON sono state ricreate: il piano non lo chiede nei task, i 145 equipaggiamenti esportati restano invariati (D-16) e un id non generato da `--new-id` va deciso dall'utente; gli `addedSpell` restano `null` come in 11-12"
  - "Danni degli unici fissati vicino alla mediana misurata della rarità (rare 2 200–2 300, ultrarare 4 200–4 500, legendary 10 000), entro ± 25 %"
  - "Prezzi degli unici: rare 7 argento 50 / 3 argento 75, ultrarare 1 oro 50 argento / 75 argento, legendary 8 oro / 4 oro con `sellable: false` (stessa struttura dei leggendari esportati)"
  - "Taratura del cibo: corrette solo 4 voci palesemente fuori banda (razione da viaggio, pane elfico, mela, acqua); i pasti abbondanti fra 60 e 100 (tra pasto e razione) restano"
  - "Pozioni: `power` 800–40 000 nella scala delle cure esportate; la Pozione di guarigione costa 60 rame come dal listino"
metrics:
  duration: "~30 min"
  completed: 2026-11-02
  tasks: 3
  files: 6
---

# Phase 11 Plan 14: magie mancanti, unici, cibo tarato e pozioni Summary

Dieci magie nuove (sciamanesimo e Vuoto) nella scala delle 77 esistenti, 27 equipaggiamenti unici di culti, figure e mostri tarati sulle mediane di `--stats`, 12 cibi regionali e 6 pozioni per fascia, e 4 `power` del cibo esportato riportati nella banda della regola della Phase 14 (1 power = 3 minuti di marcia).

## Commit

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Magie dello sciamanesimo e del Vuoto | `e6269b8` | `content/spells/sciamanesimo.yaml`, `content/spells/vuoto.yaml` |
| 2 | Equipaggiamenti unici | `25b0c8b` | `content/equipment/unici.yaml` |
| 3 | Cibo tarato, cibo regionale e pozioni | `7419a5d` | `content/loot/hunger.yaml`, `content/loot/cibo-regionale.yaml`, `content/loot/pozioni.yaml` |

## Magie nuove (10)

Scala delle esistenti (`spellPowerByUseType` di 11-12): attack mediana 1 500, control 750, defense 800, enhance 650, confuse 800, charm 400, infuse 700.

| id | Nome | File | useType | Energia | power | minXpToLearn | maxUsages | requiredLearnTime | recoveryTime |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `6ae7fd90c38631a8efd3f730` | Richiamo della fiamma ancestrale | sciamanesimo | attack | fire | 1 100 | 12 000 | 3 | 150 000 | 15 000 |
| `6ae7fd90c38631a8efd3f731` | Soffio del gelo dei monti | sciamanesimo | control | cold | 600 | 6 000 | 3 | 80 000 | 18 000 |
| `6ae7fd90c38631a8efd3f732` | Tuono degli antenati | sciamanesimo | attack | thunder | 1 400 | 20 000 | 2 | 190 000 | 30 000 |
| `6ae7fd90c38631a8efd3f733` | Preghiera della terra madre | sciamanesimo | defense | radiant | 900 | 15 000 | 2 | 120 000 | 30 000 |
| `6ae7fd90c38631a8efd3f734` | Spirito guida | sciamanesimo | enhance | enhancing | 500 | 4 000 | 4 | 60 000 | 15 000 |
| `6ae7fd90c38631a8efd3f735` | Maledizione del Vuoto | vuoto | confuse | necrotic | 900 | 18 000 | 2 | 120 000 | 30 000 |
| `6ae7fd90c38631a8efd3f736` | Sussurro dei Diavoli | vuoto | charm | psychic | 500 | 10 000 | 3 | 70 000 | 20 000 |
| `6ae7fd90c38631a8efd3f737` | Bolla di caos | vuoto | control | force | 1 200 | 28 000 | 1 | 160 000 | 45 000 |
| `6ae7fd90c38631a8efd3f738` | Patto dell'Abisso | vuoto | infuse | necrotic | 1 000 | 22 000 | 2 | 130 000 | 35 000 |
| `6ae7fd90c38631a8efd3f739` | Marchio infernale | vuoto | attack | fire | 2 000 | 38 000 | 1 | 180 000 | 60 000 |

Le due più forti del Vuoto (Marchio infernale 38 000, Bolla di caos 28 000) hanno `minXpToLearn` ≥ 25 000; tutte hanno `minXpToLearn` e `maxUsages` validi (sorteggiabili dalla study di Valantar, D-31).

## Equipaggiamenti unici (27)

| id | Nome | Legame | Rarità | equipType | Somma `power` | addedSpell |
| --- | --- | --- | --- | --- | --- | --- |
| `6ae7fdeea808802d838972cd` | Asta delle mani scheletriche | Orgeal | legendary | weapon | 10 000 | Piaga Necrotica |
| `6ae7fdeea808802d838972ce` | Anello dal volto mutevole | Teheia | ultrarare | ring | 4 200 | Bolla di caos |
| `6ae7fdeea808802d838972cf` | Filo del destino | Mobus | rare | necklace | 2 200 | — |
| `6ae7fdeea808802d838972d0` | Scudo dorato di Aphine | Aphine | ultrarare | shield | 4 500 | Aura Radiosa |
| `6ae7fdeea808802d838972d1` | Corazza della fiamma eterna | Nydos | legendary | chestPiece | 10 000 | Piaga Celestiale |
| `6ae7fdeea808802d838972d2` | Velo della luna nera | Wirasil | ultrarare | helm | 4 200 | Incubo ad occhi aperti |
| `6ae7fdeea808802d838972d3` | Anello della passione | Ymone | rare | ring | 2 200 | Voce Ammaliante |
| `6ae7fdeea808802d838972d4` | Monocolo di Ixelia | Ixelia | rare | helm | 2 200 | — |
| `6ae7fdeea808802d838972d5` | Spilla piumata di Iarus | Iarus | rare | necklace | 2 200 | — |
| `6ae7fdeea808802d838972d6` | Tiara delle Lacrime della vergine | Mirwa | ultrarare | helm | 4 300 | Barricata di Gelo |
| `6ae7fdeea808802d838972d7` | Spada del lupo grigio | Lizdum | rare | weapon | 2 300 | — |
| `6ae7fdeea808802d838972d8` | Martello della Madre | Naleala | ultrarare | weapon | 4 300 | Pelle di Roccia |
| `6ae7fdeea808802d838972d9` | Anello delle gemme di Bitya | Bitya | rare | ring | 2 200 | — |
| `6ae7fdeea808802d838972da` | Manto di scaglie prismatiche | Ueyar | rare | chestPiece | 2 300 | Richiamo della fiamma ancestrale |
| `6ae7fdeea808802d838972db` | Guanti di corteccia di Enayr | Enayr | rare | gloves | 2 200 | — |
| `6ae7fdeea808802d838972dc` | Stivali del viandante verde | Edite | rare | boots | 2 300 | Scatto fulmineo |
| `6ae7fdeea808802d838972dd` | Spadone del trono d'ossa | Xellmar | legendary | weapon | 10 000 | — |
| `6ae7fdeea808802d838972de` | Anello dei quattro | quattro dei della fortuna | ultrarare | ring | 4 200 | — |
| `6ae7fdeea808802d838972df` | Lama di Hilword Valantar | Valantar | legendary | weapon | 10 000 | Luce Punente |
| `6ae7fdeea808802d838972e0` | Elmo di Wismund Drustea | Drustea | ultrarare | helm | 4 300 | — |
| `6ae7fdeea808802d838972e1` | Guanti runici di Monteaspro | Monteaspro | legendary | gloves | 10 000 | Infusione di Fiamma |
| `6ae7fdeea808802d838972e2` | Sigillo della Banca Faris | Faris | ultrarare | ring | 4 200 | Maschera Illusoria |
| `6ae7fdeea808802d838972e3` | Medaglione del Bardo delle leggende | Millhelm | ultrarare | necklace | 4 300 | Stordimento Sonoro |
| `6ae7fdeea808802d838972e4` | Scaglia di drago rosso | drago rosso | ultrarare | chestPiece | 4 300 | Respiro del Drago |
| `6ae7fdeea808802d838972e5` | Cuore di golem | golem | ultrarare | necklace | 4 300 | — |
| `6ae7fdeea808802d838972e6` | Zanna di troll | troll | rare | weapon | 2 200 | — |
| `6ae7fdeea808802d838972e7` | Occhio di beholder | beholder | ultrarare | necklace | 4 200 | Controllo Psichico |

Distribuzione: 10 rare, 12 ultrarare, 5 legendary. `--stats` dopo l'aggiunta: rare mediana 2 200 (era 2 250), ultrarare 4 300 (era 4 275), legendary 10 000 (invariata).

## Taratura del cibo esportato (`content/loot/hunger.yaml`)

Bande (D-16, 1 power = 3 minuti): spuntino/bevanda 10–20, pasto 40–60, razione 80–120, scorta/banchetto 160–240.

| id | Nome | Vecchio `power` | Nuovo `power` | Marcia | Motivo |
| --- | --- | --- | --- | --- | --- |
| `68c193b5541d89c481b83243` | Razione da viaggio | 70 | 100 | 5 h | è una razione: centro della banda 80–120 |
| `68c193b5541d89c481b83336` | Pane di Elfo | 100 | 200 | 10 h | «sazia completamente un uomo per un giorno»: scorta 160–240 |
| `68c193b5541d89c481b8334f` | Mela Selvatica | 8 | 15 | 45 min | spuntino sotto la banda 10–20 |
| `68c193b5541d89c481b83311` | Acqua Fresca | 5 | 15 | 45 min | bevanda sotto la banda 10–20 |

Lasciate com'erano: la Borsa di Sale Marino (5, «non sazia», non è un pasto) e i pasti abbondanti fra 60 e 100 (Minestrone 80, Spezzatino 65, Pollo arrosto 90, Razione Concentrata 100, Razione di carne in scatola 85), non palesemente fuori banda. Nessun altro campo cambiato.

## Cibo regionale (12) e pozioni (6)

| id | Nome | Rarità | `power` | Marcia / cura | Prezzo (rame) |
| --- | --- | --- | --- | --- | --- |
| `6ae7fe69f3bf62d7f784ce23` | Frutti del Protettore ancestrale | uncommon | 40 | 2 h | 12 |
| `6ae7fe69f3bf62d7f784ce24` | Pesce del Nanfail | common | 50 | 2 h 30 | 15 |
| `6ae7fe69f3bf62d7f784ce25` | Vino di Mirwa | uncommon | 15 | 45 min | 8 |
| `6ae7fe69f3bf62d7f784ce26` | Datteri del Mar Sabbioso | common | 15 | 45 min | 4 |
| `6ae7fe69f3bf62d7f784ce27` | Pane nero di Drustea | common | 40 | 2 h | 10 |
| `6ae7fe69f3bf62d7f784ce28` | Carne affumicata del Lontano Nord | uncommon | 120 | 6 h | 50 |
| `6ae7fe69f3bf62d7f784ce29` | Funghi delle grotte del Lamstone | common | 20 | 1 h | 6 |
| `6ae7fe69f3bf62d7f784ce2a` | Frutti tropicali di Belleholm | common | 15 | 45 min | 5 |
| `6ae7fe69f3bf62d7f784ce2b` | Formaggio di capra del Temistos | common | 45 | 2 h 15 | 15 |
| `6ae7fe69f3bf62d7f784ce2c` | Gallette di bordo di Liberia | common | 80 | 4 h | 30 |
| `6ae7fe69f3bf62d7f784ce2d` | Birra delle Fiamme | common | 10 | 30 min | 3 |
| `6ae7fe69f3bf62d7f784ce2e` | Miele delle Pianure dei Valan | uncommon | 20 | 1 h | 8 |
| `6ae7fe69f3bf62d7f784ce2f` | Tintura del guaritore di campo | common | 800 | cura | 30 |
| `6ae7fe69f3bf62d7f784ce30` | Pozione di guarigione | common | 1 500 | cura | 60 |
| `6ae7fe69f3bf62d7f784ce31` | Pozione di guarigione superiore | uncommon | 4 000 | cura | 300 |
| `6ae7fe69f3bf62d7f784ce32` | Pozione di guarigione maggiore | rare | 10 000 | cura | 1 500 |
| `6ae7fe69f3bf62d7f784ce33` | Pozione di guarigione suprema | ultrarare | 25 000 | cura | 30 000 |
| `6ae7fe69f3bf62d7f784ce34` | Elisir dei Protettori | legendary | 40 000 | cura | 80 000 (`sellable: false`) |

Il prezzo di vendita è circa i 2/3 dell'acquisto (cibo e pozioni minori) o la metà (pozioni rare e oltre), come nei file esportati.

## Verifiche

- Task 1: `--check` exit 0 (`spells: 87`, 0 errori, 155 warning `città senza lore` invariati); `content-tree.spec.ts` «Tests: 2 passed, 2 total»; `grep -c "^- id:"` sui due file = 10; diff delle magie esportate = 0.
- Task 2: `--check` exit 0 (`equipmentitems: 172`); spec 2/2; `^- id:` = 27; common/uncommon = 0; `addedSpell` per id = 16 (≥ 8).
- Task 3: `--check` exit 0 (`lootitems: 101`); `--stats` `hungerMarchMinutes` = `{"count":33,"min":15,"median":120,"max":600}` (gate min ≥ 15, max ≤ 720: exit 0); `lootPowerByEffect.heal` max 40 000; spec 2/2; cibo regionale 12, pozioni 6, `effect: heal` 6.
- Dopo ogni task `pgrep -fl jest` vuoto; nessun `.ts` toccato (nessun build/tsc necessario); nessun accesso al DB.

## Deviations from Plan

Nessuna deviazione dai task. Nota fuori task: il briefing permetteva di ricreare le due magie mancanti a DB e ripuntare i tre `addedSpell`; il piano non lo prevede nei task e richiede i 145 esportati invariati, quindi non è stato fatto (vedi decisioni): resta una scelta per l'utente.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `content/spells/sciamanesimo.yaml`, `content/spells/vuoto.yaml`, `content/equipment/unici.yaml`, `content/loot/cibo-regionale.yaml`, `content/loot/pozioni.yaml`.
- Commit presenti: `e6269b8`, `25b0c8b`, `7419a5d`.
