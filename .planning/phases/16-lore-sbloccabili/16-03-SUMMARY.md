---
phase: 16-lore-sbloccabili
plan: 03
subsystem: lore + characters (geografia del marker e nascita)
tags: [lore, characters, geography, BE-LORE-01, BE-LORE-02, D-03, D-04, D-05, D-12]
requires: ["16-01", "16-02"]
provides:
  - "`LoreGeographyReader.ofMarker(marker: Types.ObjectId | null, session?: ClientSession): Promise<Types.ObjectId[]>` in src/lore/lore-geography.reader.ts"
  - "`LoreGeographyModule` (forFeature City + Lore; providers/exports `[LoreGeographyReader]`) in src/lore/lore-geography.module.ts"
  - "`persistGeographyLore`, `persistGeography`, `playerKnowing`, `GeographyLoreWorld`, `GeographyWorld` in test/lore/lore-world.ts"
  - "`buildStartingCharacter(input, locationId, unlockedLore = [])` con `status.unlockedLore` (copia) e `status.knownEnemies: []`"
  - "`CharacterCreationService` inietta `LoreGeographyReader` e legge `ofMarker(locationId)` fuori dalla transazione"
affects: [16-04, 16-05, 16-07, 16-10]
tech-stack:
  added: []
  patterns:
    - "Città per marker col driver nativo e `idForms` (forma stringa legacy), lore con Mongoose `lean`"
    - "Ordine delle regioni preso dalle `relatedLore` della città, non dalla query; orfani scartati"
key-files:
  created:
    - src/lore/lore-geography.reader.ts
    - src/lore/lore-geography.module.ts
    - src/lore/lore-geography.reader.int-spec.ts
    - test/lore/lore-world.ts
  modified:
    - src/characters/creation/starting-character.ts
    - src/characters/creation/starting-character.spec.ts
    - src/characters/creation/character-creation.service.ts
    - src/characters/creation/character-creation.module.ts
    - src/characters/creation/character-creation.resolver.int-spec.ts
decisions:
  - "`GeographyWorld.city` tipizzato `CityDocument & { _id: Types.ObjectId }`: `CityDocument` è `City & Document` col `Document` globale (nessun import da mongoose in city.model.ts) e non porta `_id` nel tipo"
  - "La proiezione della lore di città è `{ type: 1, relatedLore: 1 }` (RESEARCH F2), non la sola `relatedLore` dello skeleton del piano: `geographyOf` legge solo `_id`, ma il tipo resta coerente con `GeographyLore`"
metrics:
  duration: "~14 min"
  completed: 2026-11-07
  tasks: 3
  files: 9
---

# Phase 16 Plan 03: lettore della geografia e nascita con la città natale Summary

Un solo lettore (`LoreGeographyReader.ofMarker`) trova la città dal suo `markerLocation` (anche nella forma stringa legacy), legge la sua lore e le region/state collegate nell'ordine della città e restituisce `[]` per territorio, città senza lore e lore orfane; il nuovo personaggio nasce con quella geografia della città natale e nessun nemico conosciuto, nello stesso inserimento in transazione.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 24b0b93 | test(lore): pin the geography reader of a city marker |
| 1 GREEN | e2aaa8b | feat(lore): read the geography of a city marker |
| 2 RED | cc902fe | test(characters): expect the home city geography at creation (D-04) |
| 2 GREEN | d4f2e39 | feat(characters): unlock the home city geography at creation |
| 3 | (questo) | docs(phase-16): record plan 03 progress |

## Fallimenti RED osservati

- Task 1 (integration): la suite non parte, «Cannot find module './lore-geography.module' from 'src/lore/lore-geography.reader.int-spec.ts'» (import relativo, quindi non il messaggio del moduleNameMapper). Al primo GREEN 6/7 verdi: `reads inside the given session (D-05)` era rosso per un errore della spec (attendevo la sola lore della città, ma la lore del mondo porta regione e stato) → aspettativa corretta in `world.geography` nel commit GREEN.
- Task 2 unit: 2 falliti su 118 — il `toEqual` di `builds the backend-owned starting state (D-09)` (mancano `unlockedLore` e `knownEnemies`) e `starts with the geography of the home city and no known enemy (D-04)` (`unlockedLore` undefined: ts-jest non controlla l'arità del terzo argomento).
- Task 2 integration: 2 falliti su 57 — `starts the character knowing its home city, regions and state and nothing else (D-04, D-12)` e `gives a new character only the geography of its own home city (D-12)`. `creates the character without lore when the home city has none (D-05)` era verde già in RED: il default `[]` di `@Prop` del piano 16-02 scrive i due insiemi vuoti alla creazione; il caso resta come guardia contro un'eccezione su città senza lore.

## Forma dell'harness del reader

`createAuthTestApp({ imports: [LoreGeographyModule] })`, `harness.app.get(LoreGeographyReader)`; modelli `City`/`Lore` da `harness.connection.models` (registrati dal modulo), `PointOfInterest` con `harness.connection.model(PointOfInterest.name, PointOfInterestSchema)`; `init()` dei tre modelli nel `beforeAll` prima della transazione; `clearDatabase()` in `beforeEach`. Il caso in sessione crea la città con `cities.create([...], { session })` dentro `harness.connection.transaction` e verifica che la stessa lettura senza sessione restituisca `[]`.

## Deviazioni dal piano

- **[Rule 3 - Blocco] Tipo di `GeographyWorld.city`.** `tsc` rifiutava `world.city._id` (`CityDocument` senza `_id`): tipo `CityDocument & { _id: Types.ObjectId }` nella fixture. Commit e2aaa8b.
- **Bookkeeping:** `Plan: 3 of 12` in STATE.md (formato del brief dell'orchestratore, senza zero iniziale) invece di `Plan: 03 of 12` scritto nel piano; il grep di verifica del Task 3 del piano (`Plan: 03 of 12`) quindi non passa per scelta.
- **Grep di accettazione:** `grep -c "export async function persistGeography" test/lore/lore-world.ts` stampa `2` (non `1`): il prefisso combacia anche con `persistGeographyLore`, entrambe richieste dal contratto del piano. `grep -c "LoreGeographyModule" character-creation.module.ts` stampa `2` (import + `imports`, il criterio è ≥ 1).

## Gate

- `npx jest src/lore --selectProjects integration --runInBand`: 11/11 (reader 7 + lore-related 4).
- `npx jest src/characters/creation --selectProjects unit`: 118/118.
- `npx jest src/characters/creation test/app.int-spec.ts --selectProjects integration --runInBand`: 4 suite, 133/133; `git diff --exit-code src/schema.gql` 0 (SDL invariato dal piano).
- Altri harness che importano `CharacterCreationModule` (`character-deletion.resolver.int-spec.ts`, `death-acknowledgement.int-spec.ts`, `user-updated.subscription.int-spec.ts`): 36/36.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier e eslint puliti sui 9 file `.ts` toccati (nessun file sporco in partenza, nessun commit style).
- Schema vs origin/develop: 2 righe aggiunte (`unlockedLore: [ID!]!`, `loreUnlocked: [Lore!]!`, dal 16-02), 0 tolte.
- `starting-location.service.ts` non toccato.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit 24b0b93, e2aaa8b, cc902fe, d4f2e39 nel log.
