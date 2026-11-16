---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 07
subsystem: quests
tags: [spell-draw, spell-origin, arcane, shamanic, void]
requires: ["24-06"]
provides:
  - "SpellPoolSource { prizes, questType } esportata da resolution-loader.service.ts"
  - "readSpellPool filtra per origine con schoolOriginOf(questType): { origin } per le tre scuole, {} per ogni altro tipo che sorteggia"
affects: [24-08, 24-12]
tech-stack:
  added: []
  patterns: ["filtro della query da una costante dell'enum restituita dalla tabella delle scuole, mai dalla stringa letta a DB"]
key-files:
  created: []
  modified:
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
decisions:
  - "La sorgente del pool diventa un oggetto { prizes, questType } | null; i due chiamanti dell'oste passano già null e non sono cambiati"
  - "Fuori dalle tre scuole il sorteggio resta sull'intero catalogo (ruling C-4); le magie dei soli nemici restano sorteggiabili (domanda aperta A3 per il handoff)"
metrics:
  completed: 2026-11-15
  tasks: 2
  commits: 3
---

# Phase 24 Plan 07: sorteggio della magia per origine — Summary

Una quest `arcane`, `shamanic` o `void` con `prizes.spellDraw: true` pesca ora solo fra le magie della propria origine: `readSpellPool` chiede alla collection `{ origin }` con la costante di `SpellOrigin` restituita da `schoolOriginOf(quest.infos?.type)`; ogni altro tipo che sorteggia (es. `study`) chiede `{}` come prima. Proiezione, `learnableSpellOf`, ordinamento per id e i due tiri di `spellDrawOf` sono invariati; lo SDL non cambia.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 9610a355 | test(quests): expect the spell draw filtered by the school origin |
| 1 GREEN | 4e4336e0 | feat(quests): draw the spell of a school quest from its origin |
| 2 | (questo) | docs(phase-24): record plan 07 progress |

## Fallimenti RED attesi e osservati

- **Unit** (11 rossi su 30): i tre casi «reads the spell pool of a school quest filtered by the origin of its type (D-10)» ricevevano `[{}]` invece di `[{ origin }]`; inoltre gli 8 casi esistenti che chiamano `readRewardCatalogFor` con il pool attivo (convertiti alla sorgente a oggetto `{ prizes: { spellDraw: true }, questType: QuestType.study }`) fallivano perché l'implementazione vecchia leggeva `spellDraw` sul primo livello e lasciava il pool vuoto (ts-jest non segnala la firma: il RED è a runtime, come previsto).
- **Integration** (11 rossi su 24): le tre coppie tipo/origine imparavano la prima magia per id dell'intero catalogo; la quest `shamanic` imparava una magia `arcane`/`void` su tutti e tre i tiri; il pool di scuola vuoto, l'origine `'fire'` (tre scuole) e il cancello a livello con una magia `arcane` imparabile davano una magia invece di nessuna.

## Casi verdi al primo colpo (col motivo)

- Unit «reads the whole spell catalogue for a drawing quest outside the schools (D-10)», «reads no spell pool without the draw flag, whatever the type (D-10)» (cinque tipi) e «reads no spell pool for a null source (D-10)»: descrivono il comportamento di oggi, che il piano conserva.
- Int «keeps the whole catalogue for a drawing study (D-10)» (tiri `[0, 0]` → prima per id, `[0, 0.99]` → ultima) e «does not filter the fixed spell of a school quest by origin (D-10)»: la study e la magia fissa non passano dal filtro, né prima né dopo.
- Il caso esistente «teaches an arcane quest the spell a study draws with the same seed (quick 261110-mag)» resta verde perché le sue magie nascono `arcane` (default della fixture): annotato con un commento nella spec.

## Scelte di scrittura dei casi

- «teaches a %s quest only a spell of the %s origin (D-10, D-20)»: la magia della scuola è scritta in mezzo per id fra le altre due origini, così il tiro 0 sull'intero catalogo prenderebbe un'altra magia per ognuna delle tre scuole (il RED fallisce su tutte e tre).
- «applies the level gate inside a school pool (D-07, D-10)»: oltre alla magia `void` di livello 3 c'è una magia `arcane` imparabile, così il caso fallisce al RED invece di essere verde per il solo cancello.

## Verifiche

- `npx jest src/quests/outcomes/resolution-loader.service.spec.ts src/quests/outcomes/rewards --selectProjects unit`: 3 suite, 116/116.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 74/74.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui tre file; `git diff --exit-code src/schema.gql` pulito.
- Accettazione: `schoolOriginOf(` 1 e `export interface SpellPoolSource` 1 nel loader; `D-10)` 6 nell'int-spec e 5 nella spec unitaria; `chance.next(` toccati 0; `mission-draft.service.ts` e `guided-completion.service.ts` invariati (0 righe di stat: compilano con `null` senza adattamenti); `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

Nessuna. Unica aggiunta: «reads no spell pool for a null source (D-10)» è un caso nuovo dedicato (il caso D-22 esistente resta com'è e passa anch'esso `null`).

## Threat model

T-24-20 (filtro da costante dell'enum), T-24-21 (origine sporca fuori da ogni pool, int-spec `'fire'`) e T-24-22 (tiri invariati: caso del pool vuoto e diff dei `chance.next(`) mitigati come da piano.

## Self-Check: PASSED
