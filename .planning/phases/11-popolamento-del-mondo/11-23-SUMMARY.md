---
phase: 11-popolamento-del-mondo
plan: 23
subsystem: content
tags: [content, quests, generator, BE-CONTENT-01, BE-CONTENT-06]
requires: ["11-08", "11-10", "11-11", "11-19", "11-21", "11-22"]
provides:
  - "src/content/run-generate-quests.ts: runGenerateQuests(contentDir, newId?) → GenerateQuestsReport, main(argv, out) → Promise<number>, GENERATE_QUESTS_EXIT = { ok: 0, errors: 1, usage: 2 }, GENERATE_QUESTS_USAGE, GENERATED_QUESTS_HEADER, OrphanedQuest"
  - "src/content/generation/city-profile.ts: GENERATED_QUEST_FILES (drustea, valan, mirwa, fiamme, madre, liberia, speciali, dungeon)"
  - "script npm content:generate-quests (offline, nessun env)"
  - "content/quests/{drustea,valan,mirwa,fiamme,madre,liberia,speciali,dungeon}.yaml: 581 quest fisse"
  - ".planning/phases/11-popolamento-del-mondo/reports/11-23-generate.json"
affects: [11-24, 11-25, 11-26]
tech-stack:
  added: []
  patterns:
    - "entrypoint offline come `run-content`: `main(argv, out)` senza ambiente, report JSON su una riga, `require.main === module`"
    - "id riusati per chiave solo dai file del generatore: i file di quest scritti a mano non prestano id e non vengono riscritti"
key-files:
  created:
    - src/content/run-generate-quests.ts
    - src/content/run-generate-quests.spec.ts
    - content/quests/drustea.yaml
    - content/quests/valan.yaml
    - content/quests/mirwa.yaml
    - content/quests/fiamme.yaml
    - content/quests/madre.yaml
    - content/quests/liberia.yaml
    - content/quests/speciali.yaml
    - content/quests/dungeon.yaml
    - .planning/phases/11-popolamento-del-mondo/reports/11-23-generate.json
  modified:
    - src/content/generation/city-profile.ts
    - package.json
decisions:
  - "Quest esistenti la cui chiave non viene più generata: segnalate nel campo `orphaned` del report (`{ file, id, title }`), tolte dal file riscritto, nessun errore (exit 0); a DB restano orfane e le mostra `--verify`"
  - "`existingQuests` = solo le voci dei file del generatore (`GENERATED_QUEST_FILES`), non tutto `quests/*.yaml`: una quest scritta a mano con la stessa chiave non cede il suo id (altrimenti id doppio)"
  - "I POI dei marker sono commentati come nell'export: `<città> — POI <tipi>` (`namesById` dell'indice esclude i POI)"
  - "`main` resta `Promise<number>` (come `runCli`) ma senza `async` (lint `require-await`): il lavoro è sincrono"
  - "Totale 581 quest, oltre la forbice 400–560 dell'acceptance: le regole D-17..D-22/D-31 sono bloccate e già implementate; il numero alto viene da 166 città servite (heal + job ciascuna = 332)"
metrics:
  duration: "~35 min"
  completed: 2026-11-02
  tasks: 2
  files: 13
---

# Phase 11 Plan 23: generazione reale delle quest fisse Summary

Comando offline `npm run content:generate-quests` (`node dist/content/run-generate-quests.js [--content-dir <path>]`) che rifiuta un albero con errori, genera col seme del config e scrive `content/quests/<regno>.yaml` + `dungeon.yaml` con intestazione «File generato» e commenti `# nome`; eseguito sul mondo reale ha congelato 581 quest fisse, rigenerabili a byte identici, con `--check` a 0 errori.

## Task

| # | Task | Commit | Esito |
|---|------|--------|-------|
| 1 RED | spec dell'entrypoint | `65f99e7` test(content): expect the fixed quest files generated | fallimento atteso: `Cannot find module 'src/content/run-generate-quests'` |
| 1 GREEN | entrypoint + script npm | `8617508` feat(content): add the fixed quest generator command | 11/11 test, `src/content/generation` compreso 7 suite / 75 test |
| 2 | generazione reale + report | `29de261` feat(content): generate the fixed quests of every city and dungeon | `--check` exit 0, content-tree spec 2/2 |

Durante il GREEN due casi della spec erano scritti male e sono stati corretti nella spec (nessun cambio di regola): (1) i `markerLocation` restavano senza commento perché `namesById` esclude i POI → aggiunta la mappa dei nomi dei POI nel formato dell'export; (2) la quest «scaduta» del test usava una chiave che il generatore produce ancora (heal della Capitale di Prova: la città senza lore riceve comunque i servizi e viene solo segnalata) → sostituita con una `guard` nel villaggio (D-17: niente guard nei villaggi).

## Quest generate (seme 11)

| file | heal | job | guard | crime | study | hunt | dungeon | totale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| drustea.yaml | 21 | 21 | 10 | 5 | 3 | 10 | 0 | 70 |
| dungeon.yaml | 0 | 0 | 0 | 0 | 0 | 0 | 40 | 40 |
| fiamme.yaml | 27 | 27 | 13 | 7 | 9 | 13 | 0 | 96 |
| liberia.yaml | 16 | 16 | 10 | 5 | 4 | 8 | 0 | 59 |
| madre.yaml | 9 | 9 | 5 | 2 | 4 | 4 | 0 | 33 |
| mirwa.yaml | 29 | 29 | 15 | 8 | 5 | 14 | 0 | 100 |
| speciali.yaml | 41 | 41 | 2 | 1 | 2 | 17 | 0 | 104 |
| valan.yaml | 23 | 23 | 13 | 6 | 3 | 11 | 0 | 79 |
| **totale** | **166** | **166** | **68** | **34** | **30** | **77** | **40** | **581** |

- Quest saltate: **0** (ogni città ha la sua lore, ogni POI dungeon ha un mostro compatibile). Quest orfane: **0** (prima generazione). 581 id unici, tutti nuovi (`new ObjectId()`, prefisso `6ae80db9da5c5f8cc55`).
- `minTitle`: guard/crime/study `adventurer` 59/25/21 nelle città, `paladin` 9/9/9 nelle capitali; dungeon rookie 2, adventurer 20, paladin 11, mage 4, hero 3 (27 mostri diversi; i più frequenti Ankheg 4, Manticora 4, Grifone 3).
- Prede delle hunt (14 animali diversi): Aquila gigante 13, Squalo tropicale 10, Worg 9, Lupo 8, Coccodrillo 7, Pantera 6, Formiche giganti assassine 5, Avvoltoio 5, Vespa gigante 5, Cinghiale 3, Iena 2, Cavallo leggero 2, Cavallo da guerra 1, Tigre 1.

## Controlli delle regole (Task 2 punto 3)

| Controllo | Atteso | Misurato |
|---|---|---|
| N città dello snapshot | 167 | 167 |
| D POI con `dungeon` | 40 | 40 |
| `byType.heal` = `byType.job` = N − 1 (Necrorian) | 166 | 166 = 166; nessuna città servita senza heal o job |
| `byType.dungeon` = D − saltate | 40 | 40 (0 saltate) |
| Necrorian solo dungeon | sì | `Necrorian: dungeon, dungeon` (due POI dungeon) |
| crime a Ferrion | 0 | 0 (Ferrion: dungeon ×2, heal, job, guard, study); crime totali 34 |
| `spellDraw` | 1 | 1: **`6ae80db9da5c5f8cc5526781`** «Studi arcani a Valantar» (`content/quests/valan.yaml`, `minTitle: paladin`, nessun `prizes.spell`) |
| hunt ≤ `floor(n × maxShareOfRegion)` per gruppo | ok | ok in tutti i 16 gruppi (es. drustea 10/21, mirwa 14/29, flame 13/27, valan 11/23, liberia 8/16; gruppi di una città 0) ; al più una hunt per città |
| seconda corsa a byte identici | sì | `git diff --exit-code content/quests` pulito dopo la seconda corsa |

## Verifiche

- `npx jest src/content/run-generate-quests.spec.ts src/content/generation --selectProjects unit` → 7 suite, 75 test verdi.
- `npm run build` ok, `dist/content/run-generate-quests.js` presente; `npx tsc --noEmit -p tsconfig.json` exit 0; `npx eslint` pulito sui file toccati; `grep -n "process\.env" src/content/run-generate-quests.ts` vuoto.
- `node dist/content/run-generate-quests.js > reports/11-23-generate.json` → `exit 0`; grep URI sul report = 0.
- `node dist/content/run-content.js --check` → exit 0; conteggi lore 405, spells 87, equipmentitems 172, lootitems 101, enemies 150, pets 13, quests 581; 0 errori, **1 warning** (vedi sotto).
- Gate del piano: `node -e … spellDraw===1 && heal===job && errors.length===0` → 0; `npx jest src/content/content-tree.spec.ts --selectProjects unit` → 2/2.
- Acceptance: `grep -c "spellDraw: true"` sommato = 1; `grep -c "type: dungeon" content/quests/dungeon.yaml` = 40; `^- id:` = **581** (forbice del piano 400–560, vedi deviazioni); `head -1 content/quests/dungeon.yaml` contiene `File generato`; `grep -n '"content:generate-quests"' package.json` = 1 riga.
- `git diff --exit-code src/schema.gql` 0; `pgrep -fl jest` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] `existingQuests` limitato ai file del generatore**
- **Trovato durante:** Task 1 (prova sul mini-albero: `quests/esempio.yaml` ha una heal sul marker del Borgo, stessa chiave della heal generata → l'id veniva riusato due volte).
- **Fix:** nuova costante `GENERATED_QUEST_FILES` in `city-profile.ts`; solo le voci di quei file prestano l'id. Test `leaves the hand-written quest files alone`.
- **Commit:** `8617508`

**2. [Rule 2 - Correttezza] report delle quest non più generate (`orphaned`)**
- **Trovato durante:** Task 1 (punto lasciato aperto dalle note di 11-08).
- **Fix:** campo `orphaned: { file, id, title }[]` nel report, exit 0; test `reports the generated quests that are no longer produced (D-01)`.
- **Commit:** `8617508`

**3. [Rule 1 - Bug] marker POI senza commento**
- **Trovato durante:** Task 1 (test D-02 rosso).
- **Fix:** `questNamesOf(index)` aggiunge i POI con l'etichetta dell'export `<città> — POI <tipi>`.
- **Commit:** `8617508`

**4. Totale fuori forbice (non corretto, regole bloccate)**
- L'acceptance chiedeva 400–560 voci; ne escono 581 (stima del piano ~475). Le regole D-17..D-22/D-31 sono bloccate e il controllo regola per regola è verde: è la stima del piano a essere bassa. Punto per l'utente, non bloccante.

## Punti per l'utente

- **Titolo doppio (warning di `--check`):** le due dungeon di Necrorian hanno estratto lo stesso mostro → due quest «Dungeon: Drago d'ombra giovane presso Necrorian» (`quests/dungeon.yaml` riga 522, id `6ae80db9da5c5f8cc552680c`). Il warning non blocca; si risolve cambiando il seme o correggendo a mano il mostro (ma la rigenerazione lo riporterebbe).
- 581 quest invece delle ~475 stimate.
- I file sono generati: le modifiche a mano vengono sovrascritte alla prossima corsa di `content:generate-quests` (lo dice l'intestazione); i cambi durevoli si fanno in `config.yaml` o nel generatore.
- Alcune dungeon hanno solo consumabili nel `recommendedLoot` (es. Ankheg ad Anden: una pozione) quando nessun equipaggiamento colpisce le debolezze del mostro entro la rarità della fascia.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/content/run-generate-quests.ts`, `src/content/run-generate-quests.spec.ts`, gli 8 `content/quests/*.yaml`, `reports/11-23-generate.json`.
- Commit presenti: `65f99e7`, `8617508`, `29de261`.
