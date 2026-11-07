---
phase: 16-lore-sbloccabili
plan: 08
subsystem: lore (viewer, query filtrate, field resolver di relatedLore)
tags: [lore, cities, enemies, shops, viewer, BE-LORE-05, D-07, D-10, D-13]
requires: ["16-01", "16-02", "16-03", "16-07"]
provides:
  - "`viewerCacheKeyOf(context, info?)` (rootValue se oggetto, altrimenti context) e `ViewerKnowledgeService.of(identity, context, info?)` con cache `WeakMap<object, Promise<LoreVisibility>>` in `src/lore/viewer-knowledge.service.ts`"
  - "`LoreVisibilityModule` (`forFeature` User, Character, Lore; provider `ViewerKnowledgeService` + `LoreRelatedLoreResolver`, `CityRelatedLoreResolver`, `EnemyRelatedLoreResolver`; esporta `ViewerKnowledgeService`)"
  - "`LoreService.findAll(visibility)` / `findOne(id, visibility)`; `LoreResolver.lores/lore` con `@CurrentUser()`, `@Context()`, `@Info()`"
  - "`LoreModule`, `CitiesModule`, `EnemiesModule` importano `LoreVisibilityModule`"
affects: [16-09, 16-10, 16-11, 16-12]
tech-stack:
  added: []
  patterns:
    - "Filtro per viewer sul tipo (field resolver), non sulla query: copre `cityShop.city`, `PointOfInterest.city`, le lore annidate"
    - "Promise memoizzata per chiave `rootValue`-o-context: una lettura per richiesta HTTP e per evento WS (Pitfall 1)"
key-files:
  created:
    - src/lore/viewer-knowledge.service.ts
    - src/lore/viewer-knowledge.service.int-spec.ts
    - src/lore/related-lore.resolvers.ts
    - src/lore/lore-visibility.module.ts
  modified:
    - src/lore/lore.service.ts
    - src/lore/lore.resolver.ts
    - src/lore/lore.module.ts
    - src/lore/lore-related.int-spec.ts
    - src/cities/cities.module.ts
    - src/cities/cities.resolver.int-spec.ts
    - src/enemies/enemies.module.ts
    - src/shops/city-shop.resolver.int-spec.ts
decisions:
  - "`findAll` filtra con l'operatore `$in` sugli esadecimali dell'insieme (cast di Mongoose sul path `_id`); insieme vuoto → `[]` senza query; innkeeper senza filtro"
  - "`findOne` lancia `ResourceNotFoundException.lore()` prima della query se `!isVisible(visibility, id)`: stesso codice `NOT_FOUND` e messaggio `Lore non trovata` di una lore inesistente"
  - "`CityRelatedLoreResolver` controlla `isResolvedRef` prima di leggere il viewer: un orfano risponde `null` anche all'innkeeper senza toccare il DB"
  - "Il caso «blind» di `city-shop` usa un bearer nuovo che conosce la lore (`playerKnowing`) invece dell'innkeeper: così il caso nuovo `hides the shop city lore…` riusa il giocatore senza personaggio del `beforeEach`"
metrics:
  duration: "~25 min"
  completed: 2026-11-07
  tasks: 3
  files: 12
---

# Phase 16 Plan 08: Biblioteca e mappa per il personaggio del bearer Summary

`ViewerKnowledgeService` legge una sola volta per richiesta (chiave `rootValue`-o-context in una `WeakMap`) la conoscenza del bearer: innkeeper tutto senza DB, giocatore i due insiemi del personaggio corrente attivo (`activeCharacterById`, il morto in attesa del foglio non vede nulla), nessuno nulla. `lores`/`lore(id)` sono filtrate con un `NOT_FOUND` identico per le chiuse; i field resolver di `relatedLore` su `Lore`, `City` ed `Enemy` vivono in `LoreVisibilityModule`, importato da `LoreModule`, `CitiesModule` ed `EnemiesModule`. SDL invariato; `Quest.infos.relatedLore` non toccata.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 0a208f4 | test(lore): pin the viewer knowledge read once per request (D-07) |
| 1 GREEN | 29d4a8d | feat(lore): read the viewer knowledge once per request |
| 2 style | 802c665 | style(lore): format lore.module.ts |
| 2 style | 26cdfef | style(cities): format cities.module.ts |
| 2 RED | baa889f | test(lore): expect the lore filtered by the bearer (D-10) |
| 2 GREEN | 39f245d | feat(lore): filter the lore by the bearer's character |
| 3 | (questo) | docs(phase-16): record plan 08 progress |

## Fallimenti RED osservati

- Task 1 (`viewer-knowledge.service.int-spec.ts`): la suite non parte, «Cannot find module './lore-visibility.module'» (0 test eseguiti).
- Task 2: 7 falliti su 22 nelle tre spec — `serves a player only the lore they unlocked (D-10)`, `filters the nested related lore to the unlocked set (D-10)`, `answers NOT_FOUND for a locked lore exactly like a missing one (D-10)`, `serves nothing to a user without a current character (D-10)`, `filters the related lore of every enemy (D-10)`, `hides the city lore until the player knows the city (D-10)`, `hides the shop city lore from a player who does not know it (D-10)`.
- Verdi in RED, con il motivo: `serves the innkeeper every lore and every related lore (D-10)` (senza filtro tutti vedono tutto; resta come guardia del bypass), `answers null for an orphan city lore (D-10)` (il populate di un orfano dà già `null`; resta come guardia del ramo `isResolvedRef`), i quattro casi esistenti di `lore-related` e il caso `(D-18, D-10)` di `city-shop` (senza filtro passano; dopo il GREEN passano solo perché il giocatore conosce le lore).

## I due test «ciechi» aggiornati (Pitfall 10)

- `src/lore/lore-related.int-spec.ts`: il `beforeEach` persisteva il giocatore con `createPlayer` senza lore; ora persiste A, B, C e poi `playerKnowing(harness, { twitchId: 'twitch-lore-reader', lore: [A, B] })`. Con il filtro i quattro casi esistenti avrebbero visto liste vuote. Titoli con `D-10` aggiunto; la costante `LORE` è diventata la selezione FE verbatim (`query lore($id: String!) { lore(id: $id) { id image type name description relatedLore { id name } } }`).
- `src/shops/city-shop.resolver.int-spec.ts`: il caso `resolves the marker, the lore and the points of interest of the shop city (D-18, D-10)` usava il giocatore senza personaggio del `beforeEach` e con il filtro avrebbe visto `relatedLore: null`; ora usa `playerKnowing(… 'twitch-city-shop-reader', lore: [lore._id])`. La costruzione della città è estratta in `persistValantar()` e condivisa con il caso nuovo.

## Deviazioni dal piano

- **[Regola repo] Due commit `style` prima della modifica**: `src/lore/lore.module.ts` e `src/cities/cities.module.ts` fallivano già `npx prettier --check`.
- **Bookkeeping:** `Plan: 8 of 12` in STATE.md (formato dell'orchestratore, senza zero iniziale) invece di `Plan: 08 of 12` del piano: il grep di verifica del Task 3 del piano non passa per scelta.
- **Grep di accettazione:** `grep -c "LoreVisibilityModule"` stampa `2` sui tre moduli (import + array `imports`), soglia `≥ 1` rispettata. `grep -c "D-10" src/lore/lore-related.int-spec.ts` = 11 (10 titoli + il commento del `beforeEach`). `git diff HEAD~4 -- src/quests` sostituito con `git diff ca23948 -- src/quests` (i commit del piano sono 6, non 4): 0 righe.
- **Casi aggiunti oltre il `<behavior>`:** nel caso dei tre «nothing» del Task 1 anche un `userId` esadecimale di uno User inesistente; nel caso della cache una delle tre chiamate passa `{ rootValue: undefined }` (stessa chiave del context).
- In più rispetto alla verifica del piano: `test/shops/city-shops.e2e.int-spec.ts` e `src/validation/catalog-ids.int-spec.ts` (altri consumatori di `CitiesModule`/`EnemiesModule`/`LoreModule`) verdi, e la unit di `src/lore src/cities src/enemies src/shops` verde.

## Gate

- `npx jest src/lore/viewer-knowledge.service.int-spec.ts --selectProjects integration --runInBand`: 6/6.
- `npx jest src/lore src/cities src/shops src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand`: 10 suite, 66/66.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 76/76; `git diff --exit-code src/schema.gql` 0.
- `npx jest test/shops/city-shops.e2e.int-spec.ts src/validation/catalog-ids.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 23/23.
- `npx jest src/lore src/cities src/enemies src/shops --selectProjects unit`: 9 suite, 81/81.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui 12 file `.ts` toccati.
- Schema vs origin/develop: 2 righe aggiunte (`unlockedLore: [ID!]!`, `loreUnlocked: [Lore!]!`, dal 16-02), 0 tolte.

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit 0a208f4, 29d4a8d, 802c665, 26cdfef, baa889f, 39f245d nel log; `src/lore/viewer-knowledge.service.ts`, `src/lore/viewer-knowledge.service.int-spec.ts`, `src/lore/related-lore.resolvers.ts`, `src/lore/lore-visibility.module.ts` presenti.
