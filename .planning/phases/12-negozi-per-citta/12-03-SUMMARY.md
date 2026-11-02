---
phase: 12-negozi-per-citta
plan: 03
subsystem: characters/pets
tags: [characters, pets, graphql, schema, BE-SHOP-06, D-13, D-23]
requires: ["12-02"]
provides:
  - "CharacterAssets.ownedPets: (Types.ObjectId | Pet)[], @Field [Pet], @Prop [{ ObjectId, ref 'Pet' }] con default implicito []"
  - "SDL: ownedPets: [Pet!]! in type CharacterAssets fra ownedItems e pet"
  - "buildStartingCharacter: assets.ownedPets = [] accanto a pet: null"
  - "CharactersService.findOne popola assets.pet e assets.ownedPets con model 'Pet' (character e characterUpdated)"
  - "Pet registrato nel forFeature di EconomyModule e CharactersModule"
affects: [12-07, 12-08, 12-09, 12-10, 12-12, 12-14]
tech-stack:
  added: []
  patterns:
    - "lista di ref tipata senza default esplicito: il default implicito [] di Mongoose copre nuovi e legacy (idratazione)"
key-files:
  created: []
  modified:
    - src/models/character/character-assets.model.ts
    - src/models/shop-fields.schema.spec.ts
    - src/characters/creation/starting-character.ts
    - src/characters/creation/starting-character.spec.ts
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/characters.module.ts
    - src/economy/economy.module.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - src/schema.gql
decisions:
  - "`referenceListPath(path, schema = CitySchema)` in shop-fields.schema.spec: lo stesso helper legge anche CharacterAssetsSchema"
  - "La selezione dei pet negli int-spec include `speedModifier` anche su `ownedPets`, così il gatto con `speedModifier: null` è verificato sui posseduti"
  - "Nessun harness da aggiornare: `createCharactersTestApp` importa `EconomyModule`, che ora registra `Pet`; gli altri tre harness di `CharactersService` sono verdi senza modifiche"
metrics:
  duration: "~5 min"
  completed: 2026-11-02
  tasks: 2
  files: 10
---

# Phase 12 Plan 03: pet posseduti e compagno equipaggiato popolati Summary

`assets.ownedPets` entra a schema come lista di ref tipata a `Pet` (default implicito `[]`, letto `[]` anche sui legacy) accanto ad `assets.pet`, che resta il compagno equipaggiato letto dal viaggio (D-13); `CharactersService.findOne`, che alimenta `character` e `characterUpdated`, popola entrambi dal catalogo `Pet`, registrato in `EconomyModule` e `CharactersModule` (D-23).

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec di schema e del personaggio iniziale | `57e3663` test(characters): pin the owned pets of a character |
| 1 GREEN | `ownedPets` a schema, personaggio iniziale, SDL | `6734de9` feat(characters): add the owned pets next to the equipped pet |
| 2 RED | populate unit + wire di query e subscription | `7b421fd` test(characters): pin the populated pets of the character |
| 2 GREEN | populate in `findOne`, `Pet` nei due moduli | `dc0de2e` feat(characters): populate the equipped and the owned pets |

## Fallimenti RED osservati

- Task 1 unit: 4 rossi su 15. `defaults ownedPets to an empty list (D-13)` (ricevuto `undefined`), `stores ownedPets as typed references to Pet (D-13)` (`TypeError` sul path assente), `builds the backend-owned starting state (D-09)` (atteso aggiornato con `ownedPets: []`), `starts every character without owned pets (D-13)`. In RED `tsc` falliva su `assets.ownedPets` inesistente nel tipo `StartingCharacter`, risolto dal GREEN.
- Task 2 unit: 1 rosso su 27, `populates the equipped and the owned pets from the Pet catalogue (D-23)` (populate mai chiamato con i due path).
- Task 2 integration: 2 rossi su 13, `carries the equipped and the owned pets populated in the snapshot (D-13, D-23)` e `serves the owned pets with the character query (D-23)`, entrambi con `MissingSchemaError` per `Pet`.
- Verde al primo colpo (annotato): `serves a legacy character without owned pets as an empty list (D-13, D-23)`: dopo il Task 1 il default implicito `[]` di Mongoose si applica all'idratazione del documento senza il campo e `pet` è già `null`; la spec fissa la lettura legacy (T-12-05b) prima della migrazione del 12-08.

## Nomi e firme

- `src/models/character/character-assets.model.ts`: `@Field(() => [Pet]) @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: Pet.name }] }) ownedPets: (Types.ObjectId | Pet)[];` subito prima di `pet`; `CharacterAssetsInput` invariato
- `src/characters/creation/starting-character.ts`: `ownedPets: never[]` nel tipo, `ownedPets: []` nel builder, prima di `pet: null`
- `src/characters/characters.service.ts` `findOne`: `.populate({ path: 'assets.pet', model: 'Pet' })` e `.populate({ path: 'assets.ownedPets', model: 'Pet' })` dopo `assets.ownedItems.item`
- `src/economy/economy.module.ts` e `src/characters/characters.module.ts`: `{ name: Pet.name, schema: PetSchema }` in `forFeature`
- `src/models/shop-fields.schema.spec.ts`: probe `model('ShopFieldsAssetsProbe', CharacterAssetsSchema)`, `describe('character owned pets')`, helper `referenceListPath(path, schema = CitySchema)`
- `src/characters/character-updated.subscription.int-spec.ts`: costanti `CHARACTER_PETS_SELECTION`, `CHARACTER_PETS_UPDATED`, `CHARACTER_PETS_QUERY`; helper `giveAliceTheTravelPets()` (Cavallo da viaggio `speedModifier: 2`, Gatto `speedModifier: null`) ed `expectedPetsAssets(cavalloId, gattoId)`
- SDL: `ownedPets: [Pet!]!` in `type CharacterAssets`

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0
- unit: shop-fields + starting-character + mixed-ref-paths 53/53; `characters.service.spec.ts` 27/27
- integration (`--runInBand`): `character-updated.subscription.int-spec.ts`, `spell-recovery.processor.int-spec.ts`, `travel-completion.processor.int-spec.ts`, `equip-item.int-spec.ts` 32/32; `test/app.int-spec.ts` 68/68 (anche dopo il Task 2)
- prettier + eslint sui file `.ts` toccati, uno per uno: puliti
- `git diff --exit-code src/schema.gql` → 0; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → 0; `git diff --quiet origin/develop -- src/travel/travel-planner.service.ts` → 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tipo del filtro sul documento grezzo nella spec legacy**
- **Trovato durante:** Task 2 GREEN (tsc)
- **Problema:** `characters.collection.updateOne({ _id: alice.character?._id }, …)` del commit RED non passava `tsc` (`unknown` non assegnabile a `Condition<ObjectId>`); ts-jest non fa type check, quindi il RED girava
- **Fix:** cast `as Types.ObjectId` nel filtro, nello stesso commit GREEN
- **File:** `src/characters/character-updated.subscription.int-spec.ts`
- **Commit:** `dc0de2e`

**2. Estensione della selezione** — `speedModifier` selezionato anche su `ownedPets` negli int-spec (il piano lo indicava solo su `pet`), per verificare il gatto con `speedModifier: null` fra i posseduti.

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit `57e3663`, `6734de9`, `7b421fd`, `dc0de2e` presenti in `git log`; nessun file creato oltre a questo SUMMARY.
