---
phase: 04-integrita-economica-atomics
fixed_at: 2026-10-18T16:48:00Z
review_path: .planning/phases/04-integrita-economica-atomics/04-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-10-18T16:48:00Z
**Source review:** .planning/phases/04-integrita-economica-atomics/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (WR-01..WR-04, plus IN-05 and IN-06 by explicit request)
- Fixed: 6
- Skipped: 0
- Accepted/deferred: 4 (IN-01..IN-04), plus the Pre-existing section

Every fix went TDD: a RED test commit first, then the GREEN `fix`/`refactor` commit. They were applied in this order: IN-05, WR-01, WR-04, WR-03, WR-02, IN-06.

## Fixed Issues

### IN-05: `sameId` duplicated

**Files modified:** `src/mongo/document-id.ts`, `src/mongo/document-id.spec.ts`, `src/economy/trade/trade-inventory.ts`, `src/characters/spells/active-spell.updates.ts`
**Commits:**
- `59800d4` test(mongo): specify the shared id equality helper (RED)
- `eb15c39` refactor(mongo): share the id equality helper (GREEN)

**Applied fix:** `sameId(value, id)` now lives once in `src/mongo/document-id.ts`, next to `documentIdOf`/`objectIdFromHex`. Both local copies are gone and both modules import the shared one. The unused `Types` import left in `trade-inventory.ts` was removed (Boy Scout). Unit tests cover: same ObjectId, legacy hex string, a different ObjectId, a different string, null and undefined.

### WR-01: `soldQuantityGuards` matched `item` as ObjectId only

**Files modified:** `src/mongo/document-id.ts`, `src/economy/trade/trade-inventory.ts`, `src/economy/trade/shop-transaction.service.ts`, `src/mongo/document-id.spec.ts`, `src/economy/trade/trade-inventory.spec.ts`, `src/economy/trade/shop-transaction.service.int-spec.ts`
**Commits:**
- `f3c7470` test(economy): require the sale guard to accept a legacy string item id (RED)
- `4e94a29` fix(economy): match a sold item by either id form in the sale guard (WR-01) (GREEN)

**Applied fix:** a new `idForms(id)` in `document-id.ts` returns `[ObjectId, hexString]`, the two forms a ref can be stored in on a Mixed path. The guard is kept as belt-and-braces (D-07) and now matches `$elemMatch: { item: { $in: idForms(itemId) }, quantity: { $gte } }`, so the write filter accepts exactly the entries that `sameId` accepts in memory. The comments in the guard and in `writeInventory` no longer claim the guard is what stops a stale snapshot. They now say it is a safety net and that contention is resolved by the transaction's `WriteConflict`.
**Tests added:** int-spec "sells a legacy entry whose item id was stored as a string". The entry is written raw with `collection.updateOne`, the sale succeeds, and the string id is kept with quantity 1 and +10 copper. Before the fix the sale was rejected with `INSUFFICIENT_ITEM_QUANTITY`. Also added: the `idForms` unit test and the updated `soldQuantityGuards` expectation.

### WR-04: spell filters and classifiers disagreed on the id form

**Files modified:** `src/characters/spells/active-spell.updates.ts`, `src/characters/characters.service.ts`, `src/characters/spells/active-spell.updates.spec.ts`, `src/characters/characters.service.spec.ts`, `src/characters/spells/equip-spell.int-spec.ts`, `src/characters/spells/use-spell.int-spec.ts`
**Commits:**
- `537c4d7` test(characters): require spell guards and classifiers to agree on legacy string ids (RED)
- `690cd28` fix(characters): match legacy string spell ids in the guards and reclassify a changed state once (WR-04) (GREEN)

**Applied fix:**
- **Id-form tolerance.** These builders now use `$in: idForms(spellId)`: `equipSpellFilter` (`status.spells`, and `$nin` for "not already active"), `unequipSpellFilter`, the `$pull` of `unequipSpellUpdate`, the `$elemMatch` of `useSpellFilter`, and `recoverSpellFilter`. The recovery processor and the `useSpell` compensation therefore match legacy entries too. Writes (`$push`) still store ObjectIds.
- **Honest fallback.** `classifyEquipSpellFailure` and `classifyUseSpellFailure` now return `Error | undefined`. `undefined` means no guard is visibly violated on the snapshot. For equip, "full" is now checked explicitly: `activeSpells.length >= maxActiveSpellsFor(xp)`, with `status.xp` added to `ACTIVE_SPELL_SNAPSHOT_PROJECTION` and the slot table shared. For use, "no usages" is now `usages < 1`. `CharactersService.classifySpellFailure` rereads and classifies up to `SPELL_FAILURE_CLASSIFICATION_READS = 2` times. Only if neither fresh snapshot shows a violated guard does it fall back to `MAX_ACTIVE_SPELLS_REACHED` (equip) or `SPELL_NO_USAGES_LEFT` (use). `unequipSpell` keeps its single classifier, because its only guard is "active". This fallback is documented in BACKEND-NOTES §4/§5 and in the table in §2.

**Tests added:**
- Int-specs: equip a spell known only by a legacy string id (success); re-equip a spell already active by a legacy string id (`SPELL_ALREADY_ACTIVE`, document unchanged; before the fix the `$ne` let a duplicate in); unequip a legacy string active spell (success, entry pulled); use a legacy string active spell (success, usages 2→1, one job queued).
- Unit: builder expectations, classifier `undefined` cases, and in the service the second reread that finds a real violation plus the fallback after two clean rereads, for both equip and use.

### WR-03: unbounded owned quantity could exceed GraphQL `Int`

**Files modified:** `src/economy/trade/trade-inventory.ts`, `src/economy/trade/trade-inventory.spec.ts`
**Commits:**
- `d4ff34d` test(economy): require a ceiling on owned item quantities (RED)
- `f11bfca` fix(economy): reject a buy that would push an owned quantity past the GraphQL Int limit (WR-03) (GREEN)

**Applied fix:** exported `MAX_ITEM_QUANTITY = 2_147_483_647`. `buy` computes the resulting quantity for both a new and an existing entry and throws `GameRuleException.invalidQuantity()` above the limit. This runs inside the pure planner, which executes before any write in the session.
**Tests added:** the constant value; a buy that reaches exactly the limit is accepted; a buy above it on an owned entry and a new entry above it are both rejected with `INVALID_QUANTITY`.

### WR-02: selling a worn item left `wearedEquipment` pointing at an unowned item

**Files modified:** `src/economy/trade/trade-inventory.ts`, `src/economy/trade/shop-transaction.service.ts`, `src/economy/trade/trade-inventory.spec.ts`, `src/economy/trade/shop-transaction.service.int-spec.ts`, `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md`
**Commits:**
- `4435abf` test(economy): require selling the last worn copy to clear its equipment slot (RED)
- `873bf07` fix(economy): clear the slots wearing an equipment sold down to zero in the same write (WR-02) (GREEN)
- `5e8bb9c` docs(phase-4): record the review fixes in the backend notes

**Applied fix:**
- `InventorySnapshot` gains `wearedEquipment` and `InventoryOutcome` gains `vacatedSlots: SlotType[]`.
- The planner is split into `applyLines` and `slotsWearingSoldOut`. Every `SlotType` whose value `sameId`-matches an equipment sold down to zero becomes a vacated slot, including legacy string values.
- `TRADE_SNAPSHOT_PROJECTION` reads `assets.wearedEquipment`. `ShopTransactionService` builds the `$set` with `inventoryChanges(inventory)`, which adds `assets.wearedEquipment.<slot>: null` (the same empty value `equipItem` stores) to the same `updateOne`, so it lands in the same transaction.
- BACKEND-NOTES §3 has one line on this.

**Tests added:**
- Int-spec: a worn sword in `rightHand` whose last copy is sold leaves the slot `null` and removes the entry, while a worn helmet in `head` stays. Selling one of two copies keeps the slot.
- Unit: vacated slots for both id forms, and no vacated slot while copies remain. The exact-shape outcome expectations were extended with `vacatedSlots: []`.

### IN-06: empty trade accepted as a successful no-op inside a transaction

**Files modified:** `src/economy/trade/shop-transaction.service.ts`, `src/economy/trade/shop-transaction.service.int-spec.ts`, `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md`
**Commits:**
- `3854184` test(economy): require an empty zero-total trade to skip the transaction (RED)
- `28dd272` fix(economy): answer an empty zero-total trade without opening a transaction (IN-06) (GREEN)
- `a7f747e` test(economy): keep NOT_FOUND for an empty trade on a missing or archived character (RED)
- `a207005` fix(economy): check the character still exists before answering an empty trade (IN-06) (GREEN + BACKEND-NOTES)

**Applied fix:** when `lines.length === 0`, which after `assertClientTotalMatches` means a zero total, `execute` returns the success response without opening `connection.transaction` and without writing. The redundant `lines.length > 0` branch in `applyTrade` was removed, and the response is now a shared `TRADE_SUCCEEDED` constant.

**Deviation from the brief ("without touching the DB"):** the first GREEN broke 3 wire tests in the ownership and archived-visibility suites. The innkeeper skips the ownership read, and a user can still point at an archived character, so in both cases an empty trade must still answer `NOT_FOUND`. The short-circuit therefore does one lean `exists(activeCharacterById)` read. It still opens no transaction and writes nothing.

**Tests:**
- The no-op test now spies on `connection.transaction`, expects it not to be called, and checks that the raw document is unchanged.
- The service-level `NOT_FOUND` test now uses a non-empty trade for the missing id, and also checks that empty trades on a missing or an archived character answer `NOT_FOUND` with no transaction.

## Accepted / Deferred (not changed)

- **IN-01** (unbounded upper end of the pipeline arithmetic): accepted. A3 already accepts a purse ceiling of about 214 748 gold, real prices are far below it, and an overflow fails closed with no write.
- **IN-02** (catalog prices trusted without validation): deferred to the Phase 10 input/catalog validation work. Catalog writes are admin-only.
- **IN-03** (`useSpell` can lose a usage between decrement and enqueue): residual risk explicitly accepted in D-13. It is bounded by the `maxUsages` cap, and a failed compensation is logged.
- **IN-04** (wallet/coins helpers without production callers): by design. Per D-03/D-04 these are the primitives that BE Phases 6/7/8/9 consume.
- **Pre-existing section** (change-stream eslint warnings in `characters.service.ts`, prettier debt in `mongo.module.ts`/`mongo.service.ts`/transaction request models, `findOne(ObjectId)` typing): out of scope and untouched.

## Verification

- `npx jest --selectProjects unit`: 54 suites / 645 tests passed (baseline 625, +20).
- `npx jest --selectProjects integration --runInBand`: 41 suites / 479 tests passed (baseline 472, +7).
- `npx tsc --noEmit -p tsconfig.build.json`: clean.
- `npx eslint <12 touched source/spec files>`: 0 errors. The 11 warnings are the pre-existing change-stream ones in `characters.service.ts`.
- `npx prettier --check <touched files>`: clean.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`, then `git diff --exit-code develop -- src/schema.gql`: no diff.
- No `Co-Authored-By` trailer in any commit of this run.

---

_Fixed: 2026-10-18T16:48:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
