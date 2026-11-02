---
phase: 11-popolamento-del-mondo
plan: 18
subsystem: content
tags: [content, lore, enemies, BE-CONTENT-01, BE-CONTENT-03, BE-CONTENT-04]
requires: ["11-13", "11-14", "11-15", "11-17"]
provides:
  - "content/lore/creature-c.yaml: 21 lore `enemy` (una per scheda, Minotauro … Vampiro), id `6ae804947fe539950fad17b8`..`…17cc`"
  - "content/enemies/mostri-c.yaml: 25 nemici `category: monster` (uno per variante), id `6ae804ef033e23e10fe491d0`..`…91e8`, con `source` e senza override"
  - "content/enemies/mostri-b.yaml: Licantropo pipistrello `6ae8051d9d83064b7a8533da` (completamento di 11-17)"
affects: [11-19, 11-22, 11-23]
tech-stack:
  added: []
  patterns:
    - "stessi generatori usa e getta di 11-16/11-17 (`gen15/gen.js` con spec `gen18/lore.js`; `gen18/enemies.js` copia di `gen17/enemies.js` con `level` facoltativo); non committati"
key-files:
  created:
    - content/lore/creature-c.yaml
    - content/enemies/mostri-c.yaml
  modified:
    - content/enemies/mostri-b.yaml
decisions:
  - "Goblin e Hobgoblin `category: monster` come chiede il piano (25 voci monster), anche se 11-REPO-RULES elenca i goblinoidi fra gli `humanoid`: le schede del documento sono nella sezione mostri; i goblinoidi dell'intake (Capo goblin, Capitano hobgoblin, Sciamano goblin) restano `humanoid` in 11-22"
  - "Slaad della morte: il piano lo elenca ma il documento no (solo rosso, blu, verde, grigio); creato con `pe: 5900` (GS 10 dell'SRD, uguale all'analogo Aboleth) e senza `level`, che il loader deriva dalla colonna Medio (20 → hero)"
  - "Analoghi assenti dal bestiario offline, statistiche SRD 5.1 a memoria: Mantoscuro pf 22, stritolare 6 blunt (100 PE); Vrock pf 104, becco 10 pierce + artigli 14 cut (2300); Glabrezu pf 157, 2 chele 16 + 2 pugni 7 = 46 blunt (5000); Otyugh pf 114, morso 12 pierce + 2 tentacoli 7 blunt + 4 pierce = 14 blunt + 20 pierce (1800); Coboldo pf 5, pugnale 4 pierce (25)"
  - "Attacchi contati: Minotauro solo l'ascia (17 cut, nessun multiattacco); Viverna morso + pungiglione (22 pierce + 24 poison); Segugio infernale morso senza il soffio a ricarica; Treant 2 schianti (32 blunt); Hobgoblin spada lunga a una mano con scudo (5 cut); Ghoul il morso (9 pierce, attacco singolo più alto); Progenie artigli + morso; Vampiro colpo disarmato + morso; Slaad della morte 3 tentacoli dell'Aboleth (36 blunt)"
  - "Debolezze: Troll `[fire, acid]` energy e base `[]`; Scheletro base `[blunt]` (vulnerabilità) + radiant; Wraith, Ghoul, Progenie, Vampiro radiant; Segugio infernale cold; Treant fire (vulnerabilità + pianta); Yeti fire (creatura del gelo)"
  - "Incantatori: Nothic (sguardo che fa marcire: Soffio Necrotico), Slaad verde (Palla di fuoco, Velo di Fiamma), Slaad grigio (+ Incubo ad occhi aperti), Slaad della morte (Palla di fuoco, Nebbia Velenosa), Umber hulk (sguardo: Confusione Totale), Megera verde (Maschera Illusoria, Incubo ad occhi aperti), Progenie vampirica (ammaliare: Voce Ammaliante), Vampiro (Sussurro dei Diavoli, Patto dell'Abisso, Palla di fuoco)"
  - "Scheletro: documento «1 - AVVENTURIERO (50)», ma la fascia viene dal livello (1 → rookie); nessun `tier` esplicito"
metrics:
  duration: "~30 min"
  completed: 2026-11-02
---

# Phase 11 Plan 18: Mostri C Summary

Ventuno lore `enemy` e venticinque nemici `monster` da Minotauro a Vampiro, più il Licantropo pipistrello mancante da Mostri B; livello e PE dal documento, PF e danni dal bestiario offline, nove voci NON TROVATO (Nothic, cinque Slaad, Umber hulk, Yeti, Goblin) scalate dall'analogo con `f = (PE_doc / PE_analogo)^0.5`.

## Task

| Task | Nome | Commit | File |
| --- | --- | --- | --- |
| 1 | Lore delle 21 schede (`type: enemy`) | e3d3f28 | content/lore/creature-c.yaml |
| 2 | Nemici per variante (`category: monster`) | 05a8f8d | content/enemies/mostri-c.yaml |
| extra | Licantropo pipistrello (completamento di 11-17) | c3d9a0b | content/enemies/mostri-b.yaml |

## Verifiche

- Task 1: `grep -c "type: enemy"` → `21`; `grep -c "^  relatedLore:"` → `21`; `--check` exit 0 (`errors: []`, 155 warning `città senza lore`, invariati; lore 201); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Task 2: `grep -c "category: monster"` → `25`; `grep -c "^  source:"` → `25`; `grep -cE "^\s+(xp|lifePoints):"` → `0`; `grep -c "analog:"` → `9`; `grep -c "enhancing\|dungeon"` → `0`; `--check` exit 0 (`errors: []`, 155 warning, nessun warning nuovo; enemies 83); content-tree spec `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Extra: `--check` exit 0 (`errors: []`, 155 warning; enemies 84); content-tree spec `Tests: 2 passed, 2 total`.
- Nessun codice `.ts` toccato: niente build, tsc o prettier.

## Tabella di revisione dei nemici

Valori di `content/config.yaml`: `xp = max(1, round(PE × 0.14084507))`, `lifePoints = PF × 100`; fascia da `tiers` sul livello del documento (limite inferiore degli intervalli).

| nome | livello | fascia | PE | xp | lifePoints | analogo |
| --- | --- | --- | --- | --- | --- | --- |
| Minotauro | 6 | paladin | 700 | 99 | 7600 | - |
| Nothic | 4 | adventurer | 450 | 63 | 4700 | Mantoscuro (100 PE, f 2.12) |
| Ogre | 4 | adventurer | 450 | 63 | 5900 | - |
| Troll | 11 | mage | 1800 | 254 | 8400 | - |
| Orsogufo | 6 | paladin | 700 | 99 | 5900 | - |
| Viverna | 13 | mage | 2300 | 324 | 11000 | - |
| Scheletro | 1 | rookie | 50 | 7 | 1300 | - |
| Segugio infernale | 6 | paladin | 700 | 99 | 4500 | - |
| Slaad rosso | 11 | mage | 1800 | 254 | 8400 | Troll (1800 PE, f 1) |
| Slaad blu | 15 | mage | 2900 | 408 | 11600 | Vrock (2300 PE, f 1.12) |
| Slaad verde | 17 | hero | 3900 | 549 | 13600 | Hezrou (3900 PE, f 1) |
| Slaad grigio | 19 | hero | 5000 | 704 | 15700 | Glabrezu (5000 PE, f 1) |
| Slaad della morte | 20 (derivato) | hero | 5900 | 831 | 13500 | Aboleth (5900 PE, f 1) |
| Treant | 19 | hero | 5000 | 704 | 13800 | - |
| Umber hulk | 11 | mage | 1800 | 254 | 11400 | Otyugh (1800 PE, f 1) |
| Wraith | 11 | mage | 1800 | 254 | 6700 | - |
| Yeti | 6 | paladin | 700 | 99 | 5900 | Orsogufo (700 PE, f 1) |
| Cane della morte | 3 | adventurer | 200 | 28 | 3900 | - |
| Ragno fase | 6 | paladin | 700 | 99 | 3200 | - |
| Megera verde | 6 | paladin | 700 | 99 | 8200 | - |
| Goblin | 2 | rookie | 135 | 19 | 1200 | Coboldo (25 PE, f 2.32) |
| Hobgoblin | 3 | adventurer | 200 | 28 | 1100 | - |
| Ghoul | 4 | adventurer | 450 | 63 | 2200 | - |
| Progenie vampirica | 10 | paladin | 1200 | 169 | 8200 | - |
| Vampiro | 20 | hero | 10000 | 1408 | 14400 | - |
| Licantropo pipistrello (extra, `mostri-b.yaml`) | 7 | paladin | 800 | 113 | 6200 | Licantropo lupo (700 PE, f 1.07) |

Danni per round (× `damageScale` 100 nel loader): Minotauro 17 cut; Nothic 12.72 blunt; Ogre 13 blunt; Troll 22 cut + 7 pierce; Orsogufo 14 cut + 10 pierce; Viverna 22 pierce + 24 poison; Scheletro 5 pierce; Segugio infernale 7 pierce + 7 fire; Slaad rosso 22 cut + 7 pierce, blu 15.68 cut + 11.2 pierce, verde 22 cut + 15 pierce, grigio 46 blunt, della morte 36 blunt; Treant 32 blunt; Umber hulk 14 blunt + 20 pierce; Wraith 21 necrotic; Yeti 14 cut + 10 pierce; Cane della morte 10 pierce; Ragno fase 7 pierce + 18 poison; Megera verde 13 cut; Goblin 9.28 pierce; Hobgoblin 5 cut; Ghoul 9 pierce; Progenie vampirica 8 cut + 6 pierce + 7 necrotic; Vampiro 8 blunt + 7 pierce + 10 necrotic; Licantropo pipistrello 7.49 cut + 6.42 pierce.

Da rivedere a occhio:
- Viverna 46 danni per round (24 di veleno): la più dura dei mage, sopra il Troll (29).
- Slaad grigio 46 blunt (quattro attacchi del Glabrezu): più del Vampiro (25), che ha PE doppi; il Vampiro è debole in danni ma forte di magie e PF.
- Slaad della morte creato senza scheda nel documento (vedi decisioni): l'utente può cancellarlo o tenerlo.
- Goblin e Hobgoblin `monster` (piano) contro `humanoid` (REPO-RULES): da confermare.
- Scheletro rookie (livello 1) anche se il documento scrive «AVVENTURIERO»; Hobgoblin 11 PF per 200 PE (il bestiario lo dà a 100 PE).

## Riconciliazione del conteggio delle schede

Il documento ha 62 intestazioni di mostri (il «63» della roadmap conta il `[IMG]` doppio sotto «Draghi cucciolo - giovani») e 13 leggendarie (non 14); i «99» di ROADMAP/REQUIREMENTS sono 62 + 22 animali + 13 leggendari + 2 arrotondamenti. Questo piano copre le ultime 21 delle 62 schede di mostri (62 con le 20 di 11-16 e le 21 di 11-17): 25 varianti nuove, senza schede inventate (lo Slaad della morte è una variante in più della scheda Slaad, chiesta dal piano). Con il Licantropo pipistrello le varianti di Mostri B diventano 31.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Completamento del piano 11-17: Licantropo pipistrello**
- **Trovato durante:** passo extra ordinato dall'orchestratore
- **Problema:** il piano 11-17 ha omesso la variante «Pipistrello 7/8 - PALADINO (800)» della scheda Licantropo (documento riga 517; habitat riga 513: isole Glounet e Belleholm).
- **Fix:** voce extra in coda a `content/enemies/mostri-b.yaml`: `source.level: 7`, `pe: 800`, analogo Licantropo lupo (pf 58, 7 cut + 6 pierce) scalato con `f = 1.07` → pf 62, 7.49 cut + 6.42 pierce; `locations: [glounet, belleholmIsland]`; lore Licantropo; nessuna debolezza come gli altri licantropi; id da `--new-id`.
- **File:** content/enemies/mostri-b.yaml
- **Commit:** c3d9a0b

**2. [Rule 3 - Blocking] Statistiche di cinque analoghi assenti dal bestiario offline**
- **Trovato durante:** Task 2
- **Problema:** il bestiario indica come analoghi Mantoscuro, Vrock, Glabrezu, Otyugh e Coboldo, ma `bestiary-stats.md` non ha la loro scheda.
- **Fix:** statistiche SRD 5.1 note (nessuna rete), elencate nel frontmatter `decisions`, scalate con la regola della radice.
- **File:** content/enemies/mostri-c.yaml
- **Commit:** 05a8f8d

Le altre scelte di stesura (Slaad della morte, categoria dei goblinoidi, attacchi contati, debolezze, magie) sono nel frontmatter `decisions`.

## Known Stubs

Nessuno: `imagePath` punta allo slug atteso, le immagini arrivano nel passaggio di D-24.

## Threat Flags

Nessuna superficie nuova: solo file YAML di contenuto validati da `--check`.

## Self-Check: PASSED

- FOUND: content/lore/creature-c.yaml
- FOUND: content/enemies/mostri-c.yaml
- FOUND: e3d3f28
- FOUND: 05a8f8d
- FOUND: c3d9a0b
