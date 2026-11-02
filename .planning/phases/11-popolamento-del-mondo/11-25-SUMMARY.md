---
phase: 11-popolamento-del-mondo
plan: 25
subsystem: content
tags: [content, runbook, handoff, requirements, BE-CONTENT-07, BE-CONTENT-02, BE-CONTENT-05, BE-CONTENT-06]
requires: ["11-24"]
provides:
  - "docs/runbooks/content-seeding.md: sequenza sul database unico, ricariche, immagini, ambiente separato, prune, rollback con `mongorestore`, codici d'uscita e report"
  - ".planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md: azione FE prima della merge (`lore_queries.dart:9`, `lore.dart`), inventario per collezione/regno/fascia/zona, pet, unici, cibo, config, fix, D-31/D-32/D-33/D-34, misura D-12, note Phase 12/13/14/16"
  - "REQUIREMENTS BE-CONTENT-05/06 e ROADMAP criteri 5/6 emendati (D-15, D-21)"
affects: [11-26]
tech-stack:
  added: []
  patterns:
    - "inventario dell'handoff estratto dai file con uno script usa-e-getta (loader, mapper ed `enemyFactsOf` del repo) nello scratchpad: nessuna lettura del database"
key-files:
  created:
    - docs/runbooks/content-seeding.md
    - .planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md
  modified:
    - content/README.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - "Il runbook documenta `--prune <collezione>` come modalità a sé (il parser accetta esattamente una modalità); corretta la riga di `content/README.md` che lo combinava con `--apply`"
  - "La misura D-12 dell'handoff riporta sia `11-12-stats.json` (catalogo esportato) sia `--stats` offline sul catalogo finale: stessi ordini di grandezza, `winChance` 0.21/0.44/0.78/0.87"
  - "BE-CONTENT-05 porta il numero reale degli unici (27) oltre al testo delle magie; il criterio 5 della ROADMAP cambia solo per le magie, come scritto nel piano"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 3
  files: 5
---

# Phase 11 Plan 25: runbook del contenuto, handoff della fase e requisiti allineati — Summary

Runbook `docs/runbooks/content-seeding.md` per le ricariche dell'utente (backup → `--verify` → `--dry-run` → `--apply` → `--verify` → seconda `--apply`, rollback con `mongorestore` sulle sole collezioni toccate), handoff `BACKEND-NOTES.md` con l'azione FE richiesta prima della merge e l'inventario completo del mondo caricato, testi di BE-CONTENT-05/06 allineati a D-15 e D-21.

## Commit

| Task | Commit | Messaggio | Subject (car.) |
| --- | --- | --- | ---: |
| 1 | `80f4e52` | `docs(content): add the content seeding runbook` | 46 |
| 2 | `51e765f` | `docs(phase-11): add the backend handoff with the content inventory` | 66 |
| 3 | `0b7a67b` | `docs(phase-11): align the content requirements with the decisions` | 65 |

Dopo ogni commit `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`.

## Task 1 — runbook

Nove sezioni `##`: Perché, Prerequisiti, Sequenza sul database unico, Ricaricare dopo modifiche ai file, Immagini, Ambiente separato futuro, Prune, Rollback, Codici d'uscita e report. Solo placeholder (`<uri>`, `<db>`, `<cartella>`, `<file env>`).

```
VERIFY_OK            (mongodump, mongorestore, probableIdDivergence presenti; URI reali 0)
grep -c "^## "       → 9
grep -c -- "--verify" → 14
grep segreti (URI/host) → 0
```

## Task 2 — handoff

13 sezioni `##` (0 TL;DR + 1–12). Righe FE verificate in sola lettura sul repo FE: `lore_queries.dart:9` (`unlocked` nel frammento `_LoreFields.full`), `lore.dart` righe 12, 21, 31, 41, 52, 61, 73; nessun altro uso di `unlocked` in `lib/`. Il frammento delle quest del FE è in `lib/graphql/fragments/quest_fragment.dart` (citato per `description`).

```
VERIFY_OK            (QuestInfos.description, lore_queries.dart:9, spellDraw, winChance; URI 0)
grep -c "^## "                                → 13
grep -c "Phase 12\|Phase 13\|Phase 14\|Phase 16" → 11
grep -n "PRIMA della merge"                   → righe 14, 22
grep segreti (URI/host)                       → 0
```

### Tabelle richieste (riassunto; il dettaglio è nell'handoff)

| Collezione | Totale | Nuove |
| --- | ---: | ---: |
| lore | 405 | 393 |
| enemies | 150 | 149 |
| pets | 13 | 12 |
| spells | 88 | 11 |
| equipmentitems | 172 | 27 |
| lootitems | 101 | 18 |
| quests | 581 | 581 |

| Fascia | rookie | adventurer | paladin | mage | hero | legend |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| nemici | 23 | 35 | 27 | 20 | 23 | 22 |

| Gruppo | Città | guard | crime | study | hunt | dungeon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regno di Drustea | 21 | 10 | 5 | 3 | 10 | 3 |
| Repubblica dei Valan | 23 | 13 | 6 | 3 | 11 | 4 |
| Teocrazia di Mirwa | 29 | 15 | 8 | 5 | 14 | 9 |
| Unione delle Fiamme | 27 | 13 | 7 | 9 | 13 | 5 |
| Regno della Madre | 9 | 5 | 2 | 4 | 4 | 3 |
| Liberia | 16 | 10 | 5 | 4 | 8 | 3 |
| fuori dai regni (10 tipi) | 42 | 2 | 1 | 2 | 17 | 13 |

Fatti emersi dai file correnti (dopo i fix D-33 rivisto e D-34):
- **hunt (77):** tutte consigliano la sola «Pozione di guarigione» — nessuna arma `common` colpisce le debolezze delle prede.
- **dungeon (40):** solo le 2 di Necrorian (Drago d'ombra giovane) hanno armi consigliate (2 ciascuna); le altre 38 cura + cibo + 2 esplorazione (in 11-27 erano 7 con equipaggiamento, prima della restrizione alle armi).
- Talmvere: job `6ae80db9da5c5f8cc55265db` «Un aiuto alla locanda di Talmvere».
- `--stats` offline sul catalogo finale (nessun database): `winChance` Lupo 0.21, Troll 0.44 (0.45 in 11-12), Drago rosso adulto 0.78, Tarrasque 0.87; cibo fino a 600 minuti (Pane di Elfo esportato, `power` 200).

## Task 3 — requisiti

- REQUIREMENTS BE-CONTENT-05: «le 77 magie esistenti più al massimo 10 nuove dal saggio sulla magia (sciamanesimo e Vuoto)», «27 equipaggiamenti unici» (richiesto dal §1 del Task 2), `_(emendato 2026-11-02, D-15)_`.
- REQUIREMENTS BE-CONTENT-06 e ROADMAP criterio 6: «quest di servizio (heal, job, guard, crime, study) sul marker della città, hunt e dungeon su POI distinti», `_(emendato 2026-11-02, D-21)_`.
- ROADMAP criterio 5: stessa correzione delle magie con D-15.

```
VERIFY_OK  (D-15 e D-21 in REQUIREMENTS, D-21 in ROADMAP)
grep -c "\- \[ \] \*\*BE-CONTENT-0" .planning/REQUIREMENTS.md → 7   (checkbox invariate)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `content/README.md` documentava `--apply --prune <collezione>`**
- **Found during:** Task 1 (lettura di `src/content/cli-args.ts`: esattamente una modalità per corsa, quindi quel comando esce 2)
- **Fix:** riga della tabella «Comandi» → `--prune <collezione>` come modalità a sé; il runbook lo dice esplicitamente
- **Files modified:** `content/README.md`
- **Commit:** `80f4e52`

**2. [Rule 1 - Bug] Causa del Pitfall 1 nel runbook**
- **Found during:** Task 2 (rilettura di `11-RESEARCH.md` §Pitfall 1)
- **Issue:** la prima stesura attribuiva il `data: null` a un motivo impreciso
- **Fix:** frase dei prerequisiti corretta (populate di `relatedLore` assente sul codice precedente); stesso testo preciso nell'handoff
- **Files modified:** `docs/runbooks/content-seeding.md`
- **Commit:** `51e765f`

Nessun comando sul database (nessun `--env-file`); nessun file di codice toccato, quindi niente tsc/jest/prettier per task (`npm run build` eseguito una volta solo per `--stats` offline).

## Punti per l'utente

- Criterio 5 della ROADMAP dice ancora «circa 20 equipaggiamenti unici» (il piano chiedeva di cambiare lì solo le magie): i reali sono 27, come ora in BE-CONTENT-05.
- Calibrazioni aperte riportate nel §11 dell'handoff (Beholder/Goristro, Lich/Demilich, Hobgoblin, Slaad, HP dei pet nuovi vs Cavallo da viaggio, prezzi dei cavalli, titolo doppio di Necrorian, hunt senza armi consigliate).

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: solo documenti. T-11-85 (solo placeholder, grep URI = 0 su runbook e handoff), T-11-86 (azione FE in testa all'handoff, PR in draft), T-11-87 (backup e `--verify` primi passi, rollback documentato) mitigate.

## Self-Check: PASSED

- file: `docs/runbooks/content-seeding.md`, `.planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md` presenti
- commit: `80f4e52`, `51e765f`, `0b7a67b` presenti
