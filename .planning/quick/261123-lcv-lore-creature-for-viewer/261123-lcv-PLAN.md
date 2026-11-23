---
phase: quick-261123-lcv
plan: 01
type: tdd
autonomous: true
branch: feat/lore-creature-for-viewer
files_modified:
  - src/lore/lore-creature.ts
  - src/lore/lore-creature.spec.ts
  - src/lore/lore-creature.loader.ts
  - src/lore/lore-creature.resolver.ts
  - src/lore/lore-creature.resolver.int-spec.ts
  - src/lore/lore-visibility.module.ts
  - src/schema.gql
  - test/app.int-spec.ts
---

# Quick 261123-lcv: la lore porta con sé il suo nemico o il suo pet, solo per chi l'ha sbloccata

## Parole dell'utente (2026-11-23)

Il Bestiario dell'app mostra «Attacca con / Debole a» sulle voci dei nemici e «Attacca con / Difende con» su quelle dei pet. Oggi la FE legge `enemys` e `pets` per intero e incrocia con `relatedLore`: i tipi di ogni creatura arrivano al client anche se non sbloccati.

> «Facciamo la modifica per ottenere solo ciò che il giocatore ha sbloccato. Non ci dovrebbe essere più di una lore per nemico. I nemici conosciuti sono tutti i nemici con la propria lore sbloccata, non c'è un altro modo per sbloccarli».

## Stato di partenza

- `Lore` sul filo: `description, id, imagePath, name, relatedLore, type`. Nessun legame dalla lore alla creatura: il legame vive su `Enemy.relatedLore` e `Pet.relatedLore`.
- La visibilità per chi guarda è una sola: `ViewerKnowledgeService.of` (una lettura per richiesta HTTP e per evento WS) + `isVisible` di `src/lore/lore-visibility.ts`. L'oste (`innkeeper`) vede tutto; senza personaggio corrente attivo non si vede nulla.
- Nel repo non c'è `dataloader`: i field resolver di oggi memorizzano per richiesta con una `WeakMap` sulla chiave `viewerCacheKeyOf(context, info)`.
- `enemys` e `pets` non cambiano.

## Design

1. **Filo:** `Lore.enemy: Enemy` e `Lore.pet: Pet`, nullable, come field resolver sul tipo (coprono ogni percorso che serve una `Lore`).
2. **Regola:** la creatura esce solo se `isVisible(viewer, lore)`; nessuna seconda definizione di «sbloccata». L'eccezione dell'oste resta identica perché è dentro la stessa regola.
3. **Legame:** il nemico di una lore è l'`Enemy` che l'ha fra le sue `relatedLore` (idem `Pet`). Più d'uno: vince l'id più piccolo, senza errore.
4. **Niente N+1:** caricamento a blocchi per richiesta. Le lore visibili dello stesso giro si raccolgono e si leggono con una sola `find` per i nemici e una sola per i pet; una lore chiusa non genera nessuna lettura.
5. **Forma del nemico:** la stessa di `enemys` (`ENEMY_WIRE_POPULATE`, ref orfani scartati); quella del pet la stessa di `pets`.
6. Nessun migratore, nessun seeder, nessun file di contenuto; il DB vero non si tocca.

## Task

1. **Documenti** — questo piano.
2. **RED** (`test(lore): …`), titoli con «(quick 261123-lcv)»:
   - `lore-creature.spec.ts`: sbloccata → creatura; chiusa → null; lore senza creatura → null; più creature → id più piccolo; oste → sempre.
   - `lore-creature.resolver.int-spec.ts`: due personaggi (uno ha sbloccato, uno no), oste, lore non di creatura con i due campi null, più nemici sulla stessa lore, id scritto come stringa, una lista di lore non moltiplica le query.
   - `test/app.int-spec.ts`: `enemy: Enemy` e `pet: Pet` nel blocco `Lore`.
3. **GREEN** (`feat(lore): …`) con `src/schema.gql` rigenerato da `test/app.int-spec.ts`.
4. **Chiusura** — SUMMARY e riga in «Quick Tasks Completed» di `.planning/STATE.md`.

## Vincoli

- Il BE dell'utente gira da `dist/` sulla 3001 e `nest build` cancella `dist/`: niente `npm run lint/format`; prettier ed eslint sui soli file toccati.
- Mai stampare `.env`; nessun push, nessuna PR.
