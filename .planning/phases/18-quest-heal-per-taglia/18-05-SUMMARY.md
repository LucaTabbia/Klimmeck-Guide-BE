---
phase: 18-quest-heal-per-taglia
plan: 05
subsystem: lore
tags: [lore, loot-item, viewer, field-resolver, tdd]
requires: ["18-04"]
provides:
  - "visibleLoreIdsOf(visibility, refs): id delle lore visibili fra ref non popolati (ordine dei ref, niente duplicati, illeggibili scartati)"
  - "LootItemRelatedLoreResolver: LootItem.relatedLore per viewer, caricata per id"
affects: [18-08, 18-10, 18-11]
tech-stack:
  added: []
  patterns: ["field resolver sul tipo con caricamento per id delle sole lore visibili (RESEARCH Pattern 5)"]
key-files:
  created: []
  modified:
    - src/lore/lore-visibility.ts
    - src/lore/lore-visibility.spec.ts
    - src/lore/related-lore.resolvers.ts
    - src/lore/lore-visibility.module.ts
    - src/lore/lore-related.int-spec.ts
decisions:
  - "visibleLoreIdsOf passa da refHexOf + objectIdFromHex: refIdOf da solo non legge un documento popolato `{ _id }`"
  - "Nessuna memo per richiesta: l'N+1 dell'oste su `lootItems { relatedLore }` è dichiarato (T-18-21 accept), da riportare nel handoff"
  - "STATE.md registra `Plan: 5 of 11` (formato del brief), non `Plan: 05 of 11` del verify del piano"
metrics:
  duration: "~20 min"
  completed: 2026-11-10
  tasks: 3
  files: 5
---

# Phase 18 Plan 05: `LootItem.relatedLore` filtrata per viewer — Summary

`LootItem.relatedLore` è leggibile sul filo su ogni percorso che espone un oggetto (catalogo, negozio, inventario, premi, fogli): un resolver sul tipo calcola dagli id grezzi le sole lore visibili al viewer (giocatore le sbloccate, oste tutte, senza personaggio corrente nessuna) e le carica con una sola `find` per id, nell'ordine dei ref, scartando gli orfani. Nessuna query se non ci sono lore visibili; costo zero se il campo non è selezionato.

## Forma del codice

- `src/lore/lore-visibility.ts`: `export function visibleLoreIdsOf(visibility: LoreVisibility, refs: readonly unknown[] | null | undefined): Types.ObjectId[]` — `Set` degli esadecimali via `refHexOf` (legge ObjectId, stringa esadecimale minuscola a 24, documento popolato `{ _id }`), riconversione con `objectIdFromHex`, filtro `isVisible`. Nessun I/O. Import `type { Types }` da 'mongoose' e `objectIdFromHex` da 'src/mongo/document-id'.
- Forma di ref letta da `refIdOf`: solo `Types.ObjectId` e stringa esadecimale; un documento `{ _id: b }` dà `null`. Per questo la funzione passa da `refHexOf` (che prova prima `documentIdOf`).
- `src/lore/related-lore.resolvers.ts`: `@Resolver(() => LootItem) export class LootItemRelatedLoreResolver` con `constructor(private readonly viewers: ViewerKnowledgeService, @InjectModel(Lore.name) private readonly loreModel: Model<LoreDocument>)`; `@ResolveField('relatedLore', () => [Lore]) relatedLore(@Parent() loot: LootItem, @CurrentUser() identity, @Context() context, @Info() info): Promise<Lore[]>` → `this.viewers.of(identity, context, info)`, `visibleLoreIdsOf(viewer, loot.relatedLore)`, lista vuota → `[]`, altrimenti `find({ _id: { $in: ids } }).exec()` idratata e riordino per esadecimale (`lore.id`). Commento di testa aggiornato con `LootItem`.
- `src/lore/lore-visibility.module.ts`: `LootItemRelatedLoreResolver` fra i providers (il modello `Lore` era già registrato).
- Nessun file sotto `src/lootItems`, `src/shops`, `src/characters`, `src/quests` toccato.

## TDD

| Task | RED | Fallimento osservato | GREEN |
|------|-----|----------------------|-------|
| 1 | `90316fcf` | 5 casi nuovi rossi: `TypeError: visibleLoreIdsOf is not a function` (5 failed, 5 passed) | `fdf90d23` — 10/10 |
| 2 | `72a195be` | 7 casi rossi sul filo: `ID cannot represent value: { type: "Buffer", data: [Array] }` su `relatedLore.0.id` (id grezzi nel `[Lore!]!`), anche nel caso della stringa (il documento idratato casta la stringa in ObjectId) | `9edf4bae` — 17/17 |

Casi della spec sul filo (`src/lore/lore-related.int-spec.ts`, describe 'the related lore of a loot item'): giocatore solo le sbloccate, oste tutte nell'ordine dei ref, senza personaggio `[]`, orfano scartato, query singola `lootItem`, nessuna `find` sul modello `Lore` iniettato senza lore visibili (spy con `mockRestore` nel finally), id scritto come stringa dal driver nativo letto.

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni GREEN (il RED del task 1 aveva tsc rosso per il solo import mancante nella spec).
- `npx jest src/lore --selectProjects unit` 4 suite / 20 test verdi; `npx jest src/lore --selectProjects integration --runInBand` 4 suite / 40 test verdi (~9 s).
- `lore-related` + `viewer-knowledge.service` + boot reale: 3 suite / 105 test verdi; `git diff --exit-code src/schema.gql` 0.
- Extra (non richiesto): integration `src/shops src/lootItems src/characters test/shops` 28 suite / 376 test verdi in 95 s.
- Prettier `--write` + eslint puliti su ognuno dei cinque file.
- Acceptance: `D-19)` 3 / `D-23)` 2 in lore-visibility.spec; `D-19)` 6 / `D-23)` 1 in lore-related.int-spec; `visibleLoreIdsOf` 2 nel resolver; `LootItemRelatedLoreResolver` 2 nel modulo; `.populate(` 0; diff stat sulle quattro cartelle vuoto.

## N+1 dichiarato

Una `find` per oggetto con lore visibili, solo quando `relatedLore` è selezionato: per l'oste su `lootItems { relatedLore }` sono oggi 28 query (le pozioni collegate a «Il limite del corpo»); per un giocatore zero finché non sblocca la lore. La FE non seleziona il campo. Nessuna memo nuova (T-18-20: la visibilità passa dalla cache per evento e per viewer di `ViewerKnowledgeService`). Da scrivere nel handoff (BACKEND-NOTES §4 o note).

## Deviations from Plan

- Il caso `returns nothing for a viewer that sees nothing (D-19)` controlla `null` e `undefined` con `SEES_EVERYTHING` invece di `SEES_NOTHING`: prova più forte (la lista assente dà `[]` anche per chi vede tutto).
- La scrittura grezza del caso D-23 usa `modelOf(LootItem.name, LootItemSchema).collection.updateOne(...)` invece di un nome di collezione scritto a mano.
- Nessun'altra deviazione.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File modificati presenti; commit `90316fcf`, `fdf90d23`, `72a195be`, `9edf4bae` presenti in `git log`.
