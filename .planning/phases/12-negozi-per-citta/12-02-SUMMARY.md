---
phase: 12-negozi-per-citta
plan: 02
subsystem: shops/catalogue
tags: [shops, catalogue, graphql, schema, BE-SHOP-02, D-05, D-07, D-16, D-20]
requires: ["12-01"]
provides:
  - "AssetItem.sellable?: boolean | null (ereditato da EquipmentItem e LootItem), @Field Boolean nullable, @Prop({ type: Boolean }) senza default"
  - "Pet.sellable?: boolean | null, stesso campo; PetInput invariato"
  - "SDL: sellable: Boolean su type EquipmentItem, type LootItem, type Pet"
  - "test/shops/catalog-sellable.int-spec.ts: contratto di filo di sellable e filtro equipmentAssetsQuantity(sellable: true)"
affects: [12-06, 12-09, 12-11, 12-13, 12-15, 12-16]
tech-stack:
  added: []
  patterns:
    - "campo booleano opzionale senza default: l'assenza resta distinguibile da false (D-16)"
key-files:
  created:
    - test/shops/catalog-sellable.int-spec.ts
  modified:
    - src/models/interfaces/asset-item.model.ts
    - src/models/pet.model.ts
    - src/models/shop-fields.schema.spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Il test di dichiarazione confronta le tre `instance` in un unico `toEqual` (EquipmentItemSchema, LootItemSchema, PetSchema)"
  - "Il blocco `type Pet` fissato da `writes the travel contract into the generated schema` in test/app.int-spec.ts include ora `sellable: Boolean`"
metrics:
  duration: "~15 min"
  completed: 2026-11-02
  tasks: 2
  files: 6
---

# Phase 12 Plan 02: `sellable` nello schema del catalogo Summary

`sellable` entra a schema come `Boolean` nullable senza default su `AssetItem` (quindi `EquipmentItem` e `LootItem`) e su `Pet` (D-07); il filo serve il valore a DB (`true`, `false`, `null` se assente) e il filtro della query `equipmentAssetsQuantity(sellable: true)` resta identico.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| pre | Prettier sul modello già non conforme (REPO-RULES) | `aa5979b` style(shops): format src/models/interfaces/asset-item.model.ts |
| 1 RED | spec di schema del catalogo | `cd0223c` test(shops): pin sellable on the catalogue schemas |
| 1 GREEN | `sellable` su `AssetItem` e `Pet`, SDL, pin di `type Pet` | `cf0ac33` feat(shops): add sellable to the catalogue schemas |
| 2 | contratto di filo | `9b31fc0` test(shops): pin sellable on the catalogue wire |

## Fallimenti RED osservati

- Task 1 unit: fallisce `declares sellable as an optional Boolean on the catalogue schemas (D-07)` (i tre path assenti, `instance` `undefined`); 1 rosso, 7 verdi. In RED anche `tsc` falliva su `pet.sellable` (proprietà inesistente su `Pet`), risolto dal GREEN.
- Verdi al primo colpo (annotati): `leaves sellable absent when a catalogue document has none (D-16)` — senza campo nessuna chiave viene scritta; dopo il GREEN prova che il `@Prop` non ha default. `keeps a stored false (D-05)` — `hydrate` non applica lo strict e conserva il valore; dopo il GREEN prova che il cast Boolean conserva `false`.
- Task 2 integration: i 3 casi verdi al primo colpo, come previsto dal piano: il codice di produzione esiste dal Task 1; la spec fissa il contratto di filo che il FE seleziona (`Pet.sellable`) e il filtro esistente (T-12-03).

## Nomi e firme

- `src/models/interfaces/asset-item.model.ts`: `@Field(() => Boolean, { nullable: true }) @Prop({ type: Boolean }) sellable?: boolean | null;` dopo `rarity`
- `src/models/pet.model.ts`: stesso campo dopo `speedModifier`; `PetInput` invariato
- `src/models/shop-fields.schema.spec.ts`: `describe('catalogue sellable')`, probe `model('ShopFieldsPetProbe', PetSchema)` e `model('ShopFieldsEquipmentProbe', EquipmentItemSchema)`
- `test/shops/catalog-sellable.int-spec.ts`: `describe('catalogue sellable on the wire')`, harness `createAuthTestApp({ imports: [PetsModule, EquipmentItemsModule, LootItemsModule, MongooseModule.forFeature([{ name: Spell.name, schema: SpellSchema }])] })`, player `twitch-catalog-sellable`, helper `sortedByName`
- SDL: `sellable: Boolean` dopo `sellPrice` in `type EquipmentItem`, `type LootItem`, `type Pet`

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0
- unit: `shop-fields.schema.spec.ts` 8/8
- integration: `test/app.int-spec.ts` 68/68, `test/shops/catalog-sellable.int-spec.ts` 3/3 (`--runInBand`)
- prettier + eslint sui file `.ts` toccati: puliti; warning `no-base-to-string` preesistente a `test/app.int-spec.ts:836`
- `grep -c '^  sellable: Boolean$' src/schema.gql` → 3; `git diff --exit-code src/schema.gql` → 0; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → 0

## Deviations from Plan

### Auto-fixed Issues

**1. [REPO-RULES] Commit `style` preliminare**
- **Trovato durante:** Task 1
- **Problema:** `src/models/interfaces/asset-item.model.ts` falliva già `npx prettier --check` (doppia riga vuota dopo gli import)
- **Fix:** commit separato `style(shops): format …` prima della modifica, come prescrivono le REPO-RULES
- **Commit:** `aa5979b`

**2. [Rule 3 - Blocco] Pin di `type Pet` nel real boot**
- **Trovato durante:** Task 1 GREEN
- **Problema:** `writes the travel contract into the generated schema` (test/app.int-spec.ts:512) fissa l'intero blocco `type Pet` e falliva con il nuovo campo
- **Fix:** aggiunto `sellable: Boolean` all'atteso, nello stesso commit GREEN
- **File:** `test/app.int-spec.ts`
- **Commit:** `cf0ac33`

## Known Stubs

Nessuno. `sellable` resta assente sui pet finché la migrazione (D-16) non lo valorizza: comportamento voluto.

## Self-Check: PASSED

File creati presenti; commit `aa5979b`, `cd0223c`, `cf0ac33`, `9b31fc0` presenti in `git log`.
