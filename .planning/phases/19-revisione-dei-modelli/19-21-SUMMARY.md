---
phase: 19-revisione-dei-modelli
plan: 21
subsystem: models
tags: [pet, rarity, RarityType, SDL additivo, D-27]
requires: [19-20]
provides:
  - "`Pet.rarity: RarityType` (enum esistente, Mongoose `enum`, default `null`, nullable sul filo) su modello e `PetInput`"
  - "blocco `enum RarityType` nello SDL (`common`, `legendary`, `rare`, `ultrarare`, `uncommon`)"
  - "fixture `buildPet` con `rarity: null` di default (override per le spec che vogliono una rarità)"
  - "costanti `CATALOGUE_PET_BLOCK` (con la riga nuova) e `RARITY_TYPE_BLOCK` in `test/app.int-spec.ts`"
affects: [19-22, 19-23]
tech-stack:
  added: []
  patterns: [campo enum nullable sul filo come rete per i valori fuori enum scritti a DB]
key-files:
  created:
    - src/pets/pet-rarity.int-spec.ts
  modified:
    - src/models/pet.model.ts
    - src/models/pet.schema.spec.ts
    - test/fixtures/pet.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "La verità «un pet senza rarità risponde `null` sul filo» e la mitigazione T-19-96 hanno una int-spec loro (`src/pets/pet-rarity.int-spec.ts`), non prevista dal `<behavior>`"
  - "`enum` di Mongoose con `default: null` accetta `null` così com'è: nessun `null` aggiunto ai valori ammessi"
metrics:
  duration: 20 min
  completed: 2026-11-11
  tasks: 2
  files: 6
---

# Phase 19 Plan 21: rarità dei pet — Summary

`Pet.rarity` è un campo additivo dell'enum ESISTENTE `RarityType`: `null` finché la cura a DB non lo scrive, validato dallo schema alla creazione, nullable sul filo. Nello SDL una riga in `type Pet` e il blocco nuovo `enum RarityType`, nient'altro. Nessun passo del migratore, nessun contenuto nel repo (D-25, D-36). BE-MODEL-11 lato codice.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `03402d86` | `test(models): pin the nullable rarity of a pet` (46) |
| 1 GREEN | `43e40d57` | `feat(models): add the rarity of a pet` (37) |
| 2 | (questo e il successivo) | `docs(phase-19): summarize plan 21`, `docs(phase-19): record plan 21 progress` |

Subject contati PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED (`03402d86`)

- **Unit, 8 rossi in 1 suite (273 suite, 3464 test in tutto):** `pet.schema.spec.ts` › `leaves the rarity of a pet null until it is curated (D-27)` (path assente: `undefined`), i cinque casi `stores a rarity of the existing enum: <valore> (D-27)` (lo strict scarta il campo), `rejects a rarity outside the enum (D-27)` (nessun errore di validazione), `declares no state on the catalogue pet (D-03)` (la lista esatta dei path attende `rarity`).
- **Boot reale, 3 rossi su 91:** `writes the nullable pet rarity into the generated schema (D-27)` e i due casi che confrontano `CATALOGUE_PET_BLOCK` (`writes the catalogue pet with attack and defense and without state (D-03, D-15)`, `writes the travel contract into the generated schema`).
- **Filo, 3 rossi su 3:** i casi di `src/pets/pet-rarity.int-spec.ts` (`Cannot query field "rarity" on type "Pet"`).
- Nessun caso verde al primo colpo.

## Cosa è cambiato

- **`src/models/pet.model.ts`:** `rarity?: RarityType | null` con `@Field(() => RarityType, { nullable: true })` e `@Prop({ type: String, enum: Object.values(RarityType), default: null })`, nella forma dell'`<interfaces>`; stessa riga di `@Field` su `PetInput`. `rarity-type.enum.ts` solo importato, non toccato.
- **`test/fixtures/pet.fixture.ts`:** `buildPet` con `rarity: null`; JSDoc aggiornato.
- **`test/app.int-spec.ts`:** `CATALOGUE_PET_BLOCK` con la riga `  rarity: RarityType`; costante nuova `RARITY_TYPE_BLOCK`; caso nuovo D-27 (blocco `type Pet`, blocco dell'enum, assenza di `input PetInput`).
- **`src/schema.gql`** rigenerato dal boot reale: 9 righe aggiunte, nessuna tolta, nessun altro tipo toccato.

### SDL (Assumption A1 confermata)

```graphql
type Pet {
  attack: Damages!
  buyPrice: Coins!
  defense: Damages!
  id: ID!
  imagePath: String!
  maxLifePoints: Int!
  maxXp: Int!
  name: String!
  rarity: RarityType
  relatedLore: [Lore!]!
  sellPrice: Coins!
  sellable: Boolean
  speedModifier: Float
}

enum RarityType {
  common
  legendary
  rare
  ultrarare
  uncommon
}
```

**Ordine reale dei valori dell'enum:** alfabetico (`sortSchema: true`), come atteso dal piano; il blocco sta fra `enum RaceType` e `input RegisterPushDeviceInput`. `EquipmentItem.rarity` e `LootItem.rarity` restano `String`: nessun altro tipo referenzia l'enum.

### Mongoose, `enum` e `null`

Con la versione in uso un `enum` di stringhe con `default: null` accetta `null`: `validateSync()` di un pet senza rarità è `undefined` e `persistPet` (fixture con `rarity: null`) crea il documento in tutte le int-spec. Nessun `null` aggiunto ai valori ammessi. Un valore fuori enum riporta l'errore sul solo path `rarity`.

## Esito delle prove

- `npx jest --selectProjects unit` → **273 suite, 3464 test** verdi prima del commit GREEN (+7: uno, cinque, uno).
- Progetto integration intero dalla HEAD di codice, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **148 suite, 2030 test, tutti verdi** (+1 suite, +4 test):
  - `src/characters test/app.int-spec.ts` → 24 suite, 472 test (77 s); boot reale **91** test; `git diff --exit-code src/schema.gql` a 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 420 test (107 s).
  - `src/quests` → 35 suite, 516 test (159 s).
  - resto (ora con `src/pets`) → 60 suite, 622 test (115 s).
- `npx tsc --noEmit -p tsconfig.json` → 0. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning pre-esistente `no-base-to-string` di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| riga `  rarity: RarityType` nel blocco `type Pet` | 1 |
| `^enum RarityType {` nello SDL; `input PetInput` | 1; 0 |
| righe tolte dallo SDL in `HEAD~2..HEAD` | 0 |
| `D-27)` in `pet.schema.spec.ts` | 3 |
| diff di `rarity-type.enum.ts` e di `src/migrations/model-review` | 0 righe |
| file `.mjs`/`.json`/`.yaml`/`.csv` nei commit del piano | 0 |
| `pgrep -fl 'bin/jest'` | vuoto |

## Deviazioni dal piano

**1. [Regola 2 - Copertura] int-spec sul filo `src/pets/pet-rarity.int-spec.ts` (fuori da `files_modified`)**
- La verità «un pet salvato senza rarità risponde `null` sul filo» e la mitigazione T-19-96 («un valore non serializzabile annulla il solo campo, non il pet né la lista») non avevano un caso nel `<behavior>`. Tre casi nel commit RED: `serves a null rarity for a pet stored without it (D-27)` (documento grezzo senza il campo), `serves the curated rarity of a pet (D-27)`, `nulls only the rarity of a pet stored outside the enum and keeps the list (D-27)` (valore fuori enum scritto col driver: la lista arriva intera, il solo campo è `null`, un solo errore sul path `rarity`).

**2. [Scelta dentro il `<behavior>`] titoli dei cinque casi dell'enum**
- `it.each` porta il valore nel titolo (`stores a rarity of the existing enum: %s (D-27)`); il caso del default verifica anche `validateSync()` senza errori (comportamento di Mongoose su `null` chiesto dal piano).

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **19-22 (D-28):** `Pet.rarity` è leggibile lean come stringa o `null`; un pet senza rarità non è candidato. A DB uno script potrebbe scrivere un valore fuori enum (lo schema valida solo alla creazione via modello): il tetto per rango deve trattare un valore sconosciuto come «senza rarità». `buildPet({ rarity: RarityType.rare })` per le fixture. Registro dei ref ancora a **32** (33 con `pets:enemy`).
- **19-23 (handoff FE):** SDL verbatim qui sopra. `Pet.rarity` è additivo e nullable: la FE deve reggere `null` (prima della cura a DB e per un valore fuori enum, che arriva `null` con un errore parziale nella risposta). L'enum sul filo ha i cinque nomi in minuscolo; le rarità di equipaggiamento e loot restano `String`.
- **19-23 (runbook, T-19-96):** lo script di contenuto scrive i soli cinque nomi dell'enum; controllo dopo lo script: nessun pet con `rarity` fuori dai cinque valori.
- **Conteggi:** unit 273 suite / 3464 test; integration 148 suite / 2030 test (pezzi 24/472, 29/420, 35/516, 60/622 — il «resto» ora comprende `src/pets`); boot reale 91 test; registro dei ref 32.
- BE-MODEL-11 lato codice è completo: nessuna spunta in REQUIREMENTS (piano di chiusura).

## Stub noti

Nessuno (`rarity: null` è lo stato voluto fino alla cura a DB, D-25).

## Threat flags

Nessuna superficie nuova fuori dal threat model. T-19-96 (campo nullable, `enum` sullo schema, caso del rifiuto e caso sul filo del valore fuori enum), T-19-97 (blocco esatto, diff di sole righe aggiunte, `git diff --exit-code` a 0), T-19-98 (nessun file né script di contenuto) mitigati; la parte «lo script scrive i soli nomi dell'enum» passa al runbook del 19-23.

## Self-Check: PASSED

- `src/pets/pet-rarity.int-spec.ts` esiste; i commit `03402d86` e `43e40d57` sono in `git log`; `git status --short` vuoto prima di questo documento.
