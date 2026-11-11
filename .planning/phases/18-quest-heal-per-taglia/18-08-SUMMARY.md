---
phase: 18-quest-heal-per-taglia
plan: 08
subsystem: characters
tags: [characters, items, potions, graphql, transaction, tdd]
requires: ["18-07", "18-06", "18-05", "18-04"]
provides:
  - "mutation useItem(itemId: ID!): UseItemResult! sul currentCharacter del bearer (nessun id del personaggio, nessun ruolo, nessuna ownership)"
  - "ItemUseService.useItem(userId, itemId): catalogo letto una volta, transazione con snapshot in sessione e una sola updateOne condizionale, lore idratate dopo il commit"
  - "UseItemResult (ObjectType) e ItemUseModule (sibling senza Bull) importato da CharactersModule"
  - "SDL additivo: useItem nel blocco Mutation e type UseItemResult"
affects: [18-09, 18-10, 18-11]
tech-stack:
  added: []
  patterns: ["identità dal solo bearer come deleteCharacter (03.1 D-01)", "transazione con snapshot in sessione e scrittura unica come il negozio (Phase 4)"]
key-files:
  created:
    - src/characters/items/use-item-result.model.ts
    - src/characters/items/item-use.service.ts
    - src/characters/items/item-use.resolver.ts
    - src/characters/items/item-use.module.ts
    - src/characters/items/use-item.int-spec.ts
    - src/characters/items/item-use.service.int-spec.ts
  modified:
    - src/characters/characters.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Oggetto di catalogo letto lean fuori dalla transazione con ITEM_USE_CATALOG_PROJECTION (il catalogo non cambia con la bevuta); null passato al piano puro, che decide l'ordine dei rifiuti"
  - "matchedCount 0 della scrittura condizionale → ITEM_NOT_OWNED (RESEARCH A3), copre anche un potionRecoveryUntil non Date scritto dal driver nativo"
  - "Lore di loreUnlocked lette idratate dopo il commit con una find per id, riordinate sugli id, orfane scartate (non passano dal resolver filtrato di LootItem.relatedLore)"
  - "STATE.md registra `Plan: 8 of 11` (formato del brief), non `Plan: 08 of 11` del verify del piano"
metrics:
  duration: "~35 min"
  completed: 2026-11-10
  tasks: 3
  files: 9
---

# Phase 18 Plan 08: mutation `useItem` sul filo — Summary

La bevuta dal Diario è sul filo: `useItem(itemId: ID!): UseItemResult!` agisce sul `currentCharacter` del bearer (oste compreso, nessun bypass), legge il catalogo una volta, apre una `connection.transaction` con lo snapshot in sessione, chiama `planItemUse` del 18-07 e fa UNA `updateOne` condizionale; dopo il commit carica le lore nuove. Nessuna pubblicazione a mano: `characterUpdated` lo riemette il change stream. Lo SDL guadagna la mutation e `type UseItemResult`, il boot reale prova il rifiuto senza bearer, la matrice di autorizzazione non cambia.

## Cosa è stato costruito

- `src/characters/items/use-item-result.model.ts`: `@ObjectType() export class UseItemResult { hpBefore: Int; hpAfter: Int; injuriesHealed: [InjuryType]; quantityLeft: Int; recoveryUntil: Date; loreUnlocked: [Lore] }` (nessuno schema Mongoose).
- `src/characters/items/item-use.service.ts`: `@Injectable() export class ItemUseService`, costruttore `(@InjectConnection() connection, @InjectModel(User.name) userModel, @InjectModel(Character.name) characterModel, @InjectModel(LootItem.name) lootItemModel, @InjectModel(Lore.name) loreModel, clock: Clock)`; `useItem(userId: string, itemId: string): Promise<UseItemResult>`; privati `currentCharacterOf(userId)` (lean di `User.currentCharacter` per `objectIdFromHex`, `refIdOf`, assente → `ResourceNotFoundException.character()`), `drinkWithin(characterId, itemId, item, session)` (snapshot `findOne(activeCharacterById, ITEM_USE_CHARACTER_PROJECTION).session(session).lean()`, `planItemUse`, `updateOne(plan.filter, plan.update, { session })`, `matchedCount === 0` → `GameRuleException.itemNotOwned()`), `loreInOrder(ids)`.
- `src/characters/items/item-use.resolver.ts`: `@Resolver() export class ItemUseResolver` con `@Mutation(() => UseItemResult) useItem(@Args('itemId', { type: () => ID }, ObjectIdPipe) itemId: string, @CurrentUser() identity: AuthIdentity)`.
- `src/characters/items/item-use.module.ts`: `ItemUseModule` con `forFeature` di User, Character, LootItem, Lore; providers `ItemUseService`, `ItemUseResolver`, `{ provide: Clock, useClass: SystemClock }`; nessun export.
- `src/characters/characters.module.ts`: `ItemUseModule` fra gli imports.

## SDL (rigenerato dal boot reale, ordine uguale all'atteso: Assumption A1 confermata)

- blocco `Mutation`: `  useItem(itemId: ID!): UseItemResult!` fra `unregisterPushDevice` e `useSpell`
- `type UseItemResult {` `hpAfter: Int!`, `hpBefore: Int!`, `injuriesHealed: [InjuryType!]!`, `loreUnlocked: [Lore!]!`, `quantityLeft: Int!`, `recoveryUntil: DateTime!` `}` (fra `UnequipPetRequest` e `UseSpellRequest`)

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 57eee362 | test(characters): pin useItem on the wire |
| 1 GREEN | 5b11153b | feat(characters): add the useItem mutation on the bearer character |
| 2 RED | 5436fa23 | test(characters): pin the single transactional write of useItem |
| 2 GREEN | a0f4551b | feat(characters): wire useItem into the app schema |
| 3 | (questo commit) | docs(phase-18): record plan 08 progress |

## Fallimenti RED osservati

- Task 1: suite rossa per modulo assente (`Cannot find module 'src/characters/items/item-use.module'`), 0 test eseguiti; tsc rosso per la sola spec (import mancante e handle dei modelli tipizzati come documenti, vedi deviazioni).
- Task 2: boot reale 2 rossi su 83 (`writes the useItem contract of the FE Phase 18 into the generated schema (D-17, D-21)` e `rejects useItem without a bearer (D-21)`: il modulo non era nell'app). I quattro casi D-22 della spec del servizio verdi al primo colpo: sono pin della transazione già scritta nel Task 1 (l'harness importa `ItemUseModule` direttamente).

## Test

- `use-item.int-spec.ts` (describe `useItem (wire)`): 17 test (15 casi + `it.each` a 3 righe); conteggi titoli D-17) 7, D-15) 2, D-19) 1, D-23) 3, D-21) 2.
- `item-use.service.int-spec.ts` (describe `ItemUseService (replSet)`): 4 test D-22): due bevute parallele (una `fulfilled`, una `POTION_RECOVERING`, pila 2 → 1, HP 700), una sola `updateOne` con `session` nelle opzioni, scrittura `$push` concorrente sulla collection non persa, `matchedCount: 0` spiato → `ITEM_NOT_OWNED` senza scrittura.
- `test/app.int-spec.ts`: costante `USE_ITEM`, caso del contratto SDL, caso `rejects useItem without a bearer (D-21)` nel blocco `global auth guard`; i casi `authorization surface` e le whitelist senza modifiche.

## Deviations from Plan

1. **[Rule 3 - Blocking] Tipi delle spec.** Gli handle `Model<LootItemDocument>` / `Model<LoreDocument>` della prima stesura della spec del Task 1 davano tsc rosso (incompatibilità fra `Schema<LootItem>` e `Model<LootItemDocument>`, `_id` unknown). Corretto nel commit GREEN del Task 1 con `Model<any>` e un'interfaccia locale `Persisted { _id; id }`, come in `src/lore/lore-related.int-spec.ts`. Nella spec del servizio la scrittura grezza `$push` passa da una collection nativa tipizzata (`harness.connection.db!.collection<ShelfDocument>(characters.collection.collectionName)`) perché `Collection<Document>` rifiuta il path puntato nel tipo del push.
2. **Clock della spec sul filo:** `FixedClock` non ha un setter; il `beforeEach` lo riporta a `NOW` con `advanceSeconds` del delta negativo (i casi D-15/D-19 avanzano di 1800 s).
3. Nessun'altra deviazione: nessun file fuori da `files_modified` toccato.

## Gate

- tsc 0 a fine di ogni task di codice.
- `npx jest src/characters/items --selectProjects unit`: 49 test verdi; integration `src/characters/items`: 2 suite / 21 test verdi; boot reale 83 test verdi con `git diff --exit-code src/schema.gql` 0; `test/authz` unit+integration 2 suite / 96 test verdi.
- Controllo di wave (characters, shops, lore, economy, models, lootItems, graphql, test/shops, test/quests, test/authz, test/fixtures, test/harness): 47 suite / 676 test verdi in 162 s.
- `test/authz/expected-handlers.ts`, `handler-fixtures.ts`, `characters-test-app.ts`, `src/quests/outcomes/combat`, `src/characters/characters.service.ts` senza diff rispetto a 3b8b838c; nessuna occorrenza di `potionRecoveryUntil` in combat e travel (D-16).
- prettier e eslint puliti sui file toccati (warning preesistente `no-base-to-string` in `test/app.int-spec.ts`, ora riga 949: non mio).

## Threat model

T-18-32 (IDOR) coperto da `acts only on the character of the bearer, innkeeper included (D-21)`; T-18-33 dal boot reale; T-18-34/35 dalla spec D-22; T-18-36 da `rejects a malformed item id with BAD_USER_INPUT (D-17)`; T-18-38: il servizio non logga nulla; T-18-39 dai diff vuoti. Nessuna superficie nuova fuori dal threat model.

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit 57eee362, 5b11153b, 5436fa23, a0f4551b presenti in `git log`.
