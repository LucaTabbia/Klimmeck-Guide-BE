---
phase: 04-integrita-economica-atomics
reviewed: 2026-10-18T12:00:00Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - src/economy/coins.ts
  - src/economy/coins.expressions.ts
  - src/economy/wallet.service.ts
  - src/economy/economy.module.ts
  - src/economy/trade/trade-line.ts
  - src/economy/trade/trade-pricing.ts
  - src/economy/trade/trade-inventory.ts
  - src/economy/trade/catalog-prices.reader.ts
  - src/economy/trade/shop-transaction.service.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.module.ts
  - src/characters/characters.service.ts
  - src/characters/characters.resolver.ts
  - src/characters/characters.module.ts
  - src/characters/character-id.ts
  - src/characters/spells/active-spell.updates.ts
  - src/characters/equipment/equip-item.updates.ts
  - src/characters/spell-recovery.processor.ts
  - src/models/character/active-spell-slots.ts
  - src/models/character/character-status.model.ts
  - src/mongo/document-id.ts
  - src/authz/resource-not-found.exception.ts
  - src/app.module.ts
  - src/economy/wallet.service.int-spec.ts
  - src/economy/trade/shop-transaction.service.int-spec.ts
  - src/economy/trade/do-transaction.int-spec.ts
  - src/economy/trade/catalog-prices.reader.int-spec.ts
  - src/economy/trade/trade-pricing.spec.ts
  - src/economy/trade/trade-inventory.spec.ts
  - src/economy/coins.spec.ts
  - src/economy/coins.expressions.spec.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/characters/spells/equip-spell.int-spec.ts
  - src/characters/spells/use-spell.int-spec.ts
  - src/characters/equipment/equip-item.int-spec.ts
  - src/characters/spell-recovery.processor.cap.int-spec.ts
  - src/characters/spell-recovery.processor.int-spec.ts
  - src/characters/spell-recovery.processor.archived.int-spec.ts
  - src/characters/characters.service.spec.ts
  - src/characters/spells/active-spell.updates.spec.ts
  - test/fixtures/catalog-item.fixture.ts
  - test/authz/characters-test-app.ts
  - test/app.int-spec.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-10-18T12:00:00Z
**Depth:** standard
**Files Reviewed:** 45
**Status:** issues_found

## Summary

Reviewed the Phase 04 diff (`develop...HEAD`) of the backend. `npx tsc --noEmit -p tsconfig.build.json` is clean and `npx eslint` on the phase files reports 0 errors; the only warnings are the pre-existing change-stream `any` warnings in `characters.service.ts` (listed below, not counted).

The atomic design holds up. Checked and found sound:

- **Coins pipeline.** `coinsDeltaStages` normalises through a total-copper `$add` with `$ifNull` on every denomination and casts each output with `$toInt`, so BSON type stays int and a zero delta is a real no-op. The debit filter `hasAtLeastCopper(-delta)` is the authority on funds; there is no read-modify-write left on `status.coins`. Failure classification is fail-closed: `exists(activeCharacterById)` in the same session separates `NOT_FOUND` from `INSUFFICIENT_FUNDS`. `debitUserPoints` correctly fails closed for users without `twitchPoints` (missing field does not satisfy `$gte`).
- **Transactions.** `ShopTransactionService.applyTrade` and `QuestAcceptanceService.accept` have no side effects and no `Promise.all` inside the callback, so the driver can retry on `WriteConflict`. In `accept`, `pendingQuestId` is generated outside the callback and reused across retries, which is safe because a retried attempt always follows an abort. Claim, insert and debit abort together: no orphan `PendingQuest` on `INSUFFICIENT_FUNDS`. The loser of a race re-runs, sees `pendingQuest != null`, and answers `QUEST_SLOT_BUSY`.
- **Server-side pricing.** Zero total is handled (`amount === 0 ? 0`, so `isTotalPositive` is irrelevant at zero), sign is derived from the flag only when `amount > 0`, duplicates and buy+sell of the same `kind:id` are rejected for both directions, quantities are `isSafeInteger > 0`, totals are re-checked as safe integers, client denominations must be non-negative safe integers. Ids are validated by `objectIdFromHex` (lowercase 24-hex) before any query, so no `CastError` is reachable from client input.
- **Spells and equipment.** `equipSpellFilter` evaluates capacity on the live document (`$size` vs the shared slot table), `useSpellFilter`/`recoverSpellFilter` use `$elemMatch` on the same array element the positional `$` then targets (so the `$` always points at the element that satisfied the guard). The processor is idempotent and capped at the catalog maximum. Compensation in `useSpell` is bounded: `restoreUsage` uses the capped recovery filter, so it can never produce a usage above `maxUsages`; a failed compensation is logged with ids only and the caller still gets `SPELL_RECOVERY_UNAVAILABLE`.
- **Information leakage and logs.** `GameRuleException` messages carry no ids; logs carry ids only at server level.
- **Tests.** Concurrency cases are deterministic: outcomes follow from `WriteConflict` plus driver retry (shop, quest) or from single-document atomicity (wallet, spells), never from timing. `jest.restoreAllMocks()` is in the shop `afterEach`; every int-spec cleans its collections.

No Critical issue was found. Four Warnings concern places where a guard, its classifier, or a neighbouring invariant is less strict than the rest of the design.

## Warnings

### WR-01: `soldQuantityGuards` matches `item` as ObjectId only, while the snapshot logic accepts legacy string ids

**File:** `src/economy/trade/trade-inventory.ts:79-92` (consumer: `src/economy/trade/shop-transaction.service.ts:110-127`)
**Issue:** `applyTradeToInventory` locates the entry with `sameId`, which deliberately handles legacy entries whose `item` was stored as a string (Pitfall 1; the model comment says these `@Prop({ type: Types.ObjectId })` paths are Mixed). The write guard instead filters `$elemMatch: { item: line.itemId (ObjectId), quantity: { $gte } }`. On Mixed paths Mongoose does not cast, so a legacy string entry never matches: the sale passes the in-memory check, the `updateOne` matches nothing, and the client gets a misleading `INSUFFICIENT_ITEM_QUANTITY` for an item it owns. The player cannot sell that item at all (fail-closed, but a functional bug on legacy data).
Additionally the guard cannot do what its comment says ("uno snapshot superato non scrive"): inside a transaction the update filter is evaluated at the same snapshot as the preceding read, and a concurrent commit after the snapshot raises `WriteConflict` (retried by the driver), not a stale match. So the guard is redundant for staleness and its only observable effect is this legacy false negative. The concurrent-sell test passes thanks to snapshot isolation plus retry, not thanks to the guard.
**Fix:** Either drop the guard (the transaction is the concurrency control) or make it id-form agnostic:
```ts
item: { $in: [line.itemId, line.itemId.toHexString()] },
quantity: { $gte: line.quantity },
```
and add an int-spec case that sells a legacy string-id entry.

### WR-02: Selling a worn item leaves `wearedEquipment` pointing at an item no longer owned

**File:** `src/economy/trade/shop-transaction.service.ts:104-128`, `src/economy/trade/trade-inventory.ts:36-44`
**Issue:** Phase 04 closed the "equipped implies owned" invariant at equip time (`equipItemFilter` requires `assets.ownedEquipments.item`), but the trade path that removes the last copy (`entries.splice`) does not clear the slot that references it. The stale reference is masked on read (`findOne` maps unowned worn ids to `null`) but persists in the document and silently re-activates if the item is bought again. The pre-existing `doTransaction` had the same gap, so this is not a regression, but the phase's stated goal is integrity of the economy/inventory and the fix fits in the same single update.
**Fix:** When a sell line drops an equipment entry to zero, add `$set: { 'assets.wearedEquipment.<slot>': null }` for every slot whose value equals that id (read `assets.wearedEquipment` in `TRADE_SNAPSHOT_PROJECTION`, compute the slots in `applyTradeToInventory`, include them in the same `updateOne`).

### WR-03: Unbounded owned quantity can exceed GraphQL `Int` and make the character unreadable

**File:** `src/economy/trade/trade-inventory.ts:46-56`, `src/economy/trade/trade-pricing.ts:42-45`
**Issue:** `buy` does `entries[index].quantity += line.quantity` with no ceiling. Each line is a safe integer, but `AssetQuantity.quantity` is exposed as `Int` (32-bit). For items with `buyPrice` 0 (allowed: `toCopper` of a zero price is valid) or at very low prices, repeated buys push the stored quantity past 2^31-1; from then on every serialisation of the character (`findOne`, `characterUpdated` subscription) fails with an Int-representation error. Only the owner is affected, but the failure is persistent and not recoverable through the API.
**Fix:** Reject in `buy`/`toTradeLine` when the resulting quantity would exceed a named constant (`MAX_OWNED_QUANTITY = 2_147_483_647` or a lower game cap) with `GameRuleException.invalidQuantity()`, and cover it in `trade-inventory.spec.ts`.

### WR-04: Filters and failure classifiers disagree on the id form, so legacy string ids produce wrong error codes

**File:** `src/characters/spells/active-spell.updates.ts:7-23, 45-55, 89-135`
**Issue:** The filters match `status.spells`, `assets.activeSpells.spell` and `$elemMatch.spell` with an ObjectId (no cast on Mixed paths), but the classifiers use `sameId`, which also accepts string ids. For a character with a legacy string id: `equipSpell` fails the filter (`status.spells: spellId`), the classifier then finds the spell "known" and not active and answers `MAX_ACTIVE_SPELLS_REACHED`; `useSpell` fails the filter, the classifier finds it active and answers `SPELL_NO_USAGES_LEFT`. Fail-closed, but the user sees a false rule violation forever and the recovery processor silently skips the same character (it logs a warning). The final `return GameRuleException.maxActiveSpellsReached()` fallback also reports a capacity error when the real cause was a race that changed the state (spell unequipped meanwhile), which the comment on line 109 describes as "codice di contesa" but which is not a distinct code.
**Fix:** Make the builders id-form agnostic (`{ $in: [spellId, spellId.toHexString()] }` for the match, `$nin` for the `$ne`), or run a one-off migration that casts legacy string ids and document that no legacy remains. At minimum make the classifier return a dedicated retry-style code (or `spellRecoveryUnavailable`-like) when no guard is observably violated instead of `MAX_ACTIVE_SPELLS_REACHED`.

## Info

### IN-01: Pipeline arithmetic has an unbounded upper end

**File:** `src/economy/coins.expressions.ts:36-52`
**Issue:** `coinsDeltaStages` accepts any safe integer. The gold component is cast with `$toInt`, which raises a server error when gold exceeds 2^31-1 (about 2.1e13 copper), and `$floor($divide(total, 10000))` can round up by one in double precision for totals above roughly 5e15. Neither is reachable with real prices, and failure is fail-closed (no write), but the contract "safe integer" is wider than what the pipeline can represent.
**Fix:** Bound the credit side with a named constant (for example `MAX_PURSE_COPPER`) in `coinsDeltaStages`, or compute gold exactly with `$divide: [{ $subtract: [total, { $mod: [total, COPPER_PER_GOLD] }] }, COPPER_PER_GOLD]`.

### IN-02: Catalog prices are trusted without validation

**File:** `src/economy/trade/trade-pricing.ts:62-68`
**Issue:** `lineCopper` multiplies whatever the catalog holds. A negative denomination (the `Coins` schema has no `min`) turns a purchase into a credit and a fractional price makes `netCopper` non-integer, which is then reported as `INVALID_QUANTITY` (misleading code). Catalog writes are admin-only, so this is hardening, not an exploit.
**Fix:** In `lineCopper`, reject a unit whose `toCopper` is not a non-negative safe integer with `GameRuleException.itemNotTradable()`; add a case to `trade-pricing.spec.ts`.

### IN-03: `useSpell` can lose a usage between decrement and enqueue

**File:** `src/characters/characters.service.ts:306-351`
**Issue:** The decrement and the Bull `add` are not atomic. A process crash between them loses the usage permanently (no job will recover it); an `add` that throws after Redis actually enqueued (timeout) both restores the usage and leaves a live job, giving one early recovery (still capped at `maxUsages`). Both are accepted trade-offs of D-13 and bounded by the cap, but they are not documented in the code.
**Fix:** Note the residual window next to `scheduleRecovery`, or move to an outbox/sweeper if the crash window matters.

### IN-04: Helpers without production callers

**File:** `src/economy/coins.ts:33-45`, `src/economy/wallet.service.ts:67-108`
**Issue:** `add`, `subtract`, `compare` (and `normalize`) have no production consumer, and `debitUserPoints`/`creditUserPoints` are only exercised by tests (Phase 6 groundwork). They are covered by specs, but are dead code until used.
**Fix:** Keep only what a plan consumes, or leave a one-line pointer to the phase that will use them.

### IN-05: `sameId` duplicated

**File:** `src/economy/trade/trade-inventory.ts:26-31`, `src/characters/spells/active-spell.updates.ts:90-95`
**Issue:** Identical helper in two modules.
**Fix:** Move one implementation next to `objectIdFromHex` in `src/mongo/document-id.ts`.

### IN-06: Empty trade is accepted as a successful no-op

**File:** `src/economy/trade/shop-transaction.service.ts:53-68`
**Issue:** A request with no lines and a zero total passes every check, opens a transaction, writes nothing and answers success. Harmless, but it spends a transaction and reports a trade that never happened.
**Fix:** Optionally reject with `invalidQuantity()` when `lines.length === 0`.

## Pre-existing issues (not counted)

- `src/characters/characters.service.ts:78-108`: change-stream setup produces 11 `@typescript-eslint` `any`/`require-await` warnings; unchanged by the phase.
- `src/mongo/mongo.module.ts`, `src/mongo/mongo.service.ts`: 21 prettier errors (double quotes), untouched by the phase.
- `src/characters/characters.service.ts:89`: the change-stream handler calls `findOne(id)` with an ObjectId typed as `string`.
- `src/models/request/transaction-request.model.ts`, `transaction-items.model.ts`: not prettier-formatted (double quotes, no trailing newline).

## Verdict

No blockers. The conditional-update, pipeline and transaction mechanics are correct, error classification is fail-closed, and the concurrency tests are deterministic. Address WR-01 first (a guard that is redundant under snapshot isolation and wrong for legacy ids), then WR-02/WR-03 (inventory invariants), then WR-04 (error-code accuracy for legacy ids) before or shortly after merge; the Info items can ride along.

---

_Reviewed: 2026-10-18T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
