---
phase: 01-fondazione-test-consolidamento-spell-wip
reviewed: 2026-07-23T20:42:16Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - .github/workflows/ci.yml
  - eslint.config.mjs
  - package.json
  - src/app.module.ts
  - src/characters/characters.module.ts
  - src/characters/characters.resolver.ts
  - src/characters/characters.service.spec.ts
  - src/characters/characters.service.ts
  - src/characters/spell-recovery.processor.int-spec.ts
  - src/characters/spell-recovery.processor.ts
  - src/models/request/use-spell-request.model.ts
  - src/mongo/mongo.module.ts
  - src/roads/roads.service.ts
  - src/schema.gql
  - test/fixtures/character.fixture.ts
  - test/fixtures/fixtures.int-spec.ts
  - test/fixtures/fixtures.spec.ts
  - test/fixtures/index.ts
  - test/fixtures/poi.fixture.ts
  - test/fixtures/quest.fixture.ts
  - test/fixtures/road.fixture.ts
  - test/fixtures/spell.fixture.ts
  - test/fixtures/user.fixture.ts
  - test/harness/character-changestream.int-spec.ts
  - test/harness/replset.int-spec.ts
  - test/setup/after-env.ts
  - test/setup/global-setup.ts
  - test/setup/global-teardown.ts
  - test/setup/mongo-replset.ts
  - test/setup/redis.ts
findings:
  critical: 0
  warning: 6
  info: 13
  total: 19
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-23T20:42:16Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Re-review of the phase 01 deliverables after gap-closure plan 01-05. Scope: the consolidated spell WIP (equipSpell/unequipSpell/useSpell mutations, Bull `spell-recovery` processor), the test foundation (MongoMemoryReplSet harness, unit/integration Jest split, deterministic fixtures, GitHub Actions CI), plus the three files touched by 01-05: `package.json` (serialized `test` script), `eslint.config.mjs` (pre-existing type-safety debt downgraded to `warn` repo-wide, `no-unsafe-*` family off for test files), and `.github/workflows/ci.yml` (MONGOMS_DOWNLOAD_DIR aligned to the actions/cache path).

**Resolved since previous review:** WR-06 (mongodb-memory-server binary cache never populated) is correctly fixed — `MONGOMS_DOWNLOAD_DIR: /home/runner/.cache/mongodb-memory-server` (ci.yml:17) now matches the `actions/cache` path `~/.cache/mongodb-memory-server` on ubuntu-latest, with the version pinned via `MONGOMS_VERSION` and included in the cache key. The 01-05 changes themselves are sound: the serialized `test` script avoids the parallel unit+integration race, and the ESLint downgrade is explicitly documented as pre-existing debt deferred to Phase 10 (non-masking: still reported as warnings in CI logs).

Overall assessment unchanged on the core: the test foundation is solid — the unit/integration split via `testMatch` globs is correct, fixtures are deterministic and well-documented, the change-stream and transaction harness tests are carefully guarded against leaked handles, and the D-06 validation-order bug (spell fetched before usage decrement) is correctly fixed in `useSpell`.

Remaining concerns are concentrated in the spell state machine: all usage mutations are non-atomic read-modify-write cycles over `assets.activeSpells`, the recovery increment is uncapped at `maxUsages`, and `equipSpell` trusts a client-supplied `usages` value — a direct tension with the project's core value ("il backend è la fonte di verità... ogni valore mostrato dal frontend è calcolato e garantito server-side"). None of these are exploitable beyond the already-documented absence of an auth layer (planned in a later phase), so they remain Warning, not Critical — but they should be fixed before the spell economy goes live.

New (Info-level) findings from the 01-05 files: no warning ratchet on ESLint (warning count can silently grow in new src code), `test:cov`/`test:watch` run the integration project without `--runInBand`, and the `startRedis` env passthrough combined with `queue.empty()` can wipe a shared local Redis queue.

No hardcoded secrets, no injection vectors, no unsafe deserialization found. Performance is out of scope per v1. Original finding IDs are preserved for traceability with 01-VERIFICATION.md and follow-up plans (WR-06 is retired as resolved).

## Warnings

### WR-01: Non-atomic read-modify-write on `activeSpells.usages` (lost updates / VersionError under concurrency)

**File:** `src/characters/characters.service.ts:302-303`, `src/characters/spell-recovery.processor.ts:42-43`
**Issue:** Both `useSpell` (decrement) and `SpellRecoveryProcessor.handleSpellRecovery` (increment) load the full Character document, mutate `activeSpells[i].usages` in memory, and `save()`. Two concurrent operations on the same character (e.g., a recovery job firing while the player casts, or two rapid `useSpell` calls) will either lose one update or throw an unhandled Mongoose `VersionError` (versioning kicks in on array-path modifications). In the processor, an unhandled throw leaves the job in the failed queue (`removeOnFail: false`, no retry config) and the usage is never recovered. The backend is the source of truth for the game economy, so lost usages are permanent state corruption.
**Fix:** Use an atomic conditional update instead of document save, e.g. in the processor:
```typescript
const result = await this.characterModel.updateOne(
    { _id: characterId, 'assets.activeSpells.spell': new Types.ObjectId(spellId) },
    { $inc: { 'assets.activeSpells.$.usages': 1 } },
);
if (result.matchedCount === 0) {
    this.logger.warn(`Spell ${spellId} not active for character ${characterId}, skipping recovery`);
}
```
Mirror the same pattern in `useSpell` with a guard `'assets.activeSpells.usages': { $gt: 0 }` via `arrayFilters`, treating `matchedCount === 0` as the "no usages left / not active" error path.

### WR-02: Spell recovery increments usages without capping at `spell.maxUsages`

**File:** `src/characters/spell-recovery.processor.ts:42`
**Issue:** `activeSpell.usages += 1` is unconditional. Delayed recovery jobs survive unequip: sequence "useSpell (3→2, job scheduled) → unequipSpell → equipSpell(usages: 3) → job fires" yields `usages = 4 > maxUsages`. The processor has no access to the Spell model, so it cannot enforce the cap.
**Fix:** Inject the Spell model into the processor, load `spell.maxUsages`, and only increment when below the cap (or use an atomic conditional update per WR-01 with `usages: { $lt: maxUsages }` in the array filter). Alternatively, cancel pending recovery jobs on `unequipSpell` (requires deterministic jobIds — see WR-04 note on `Date.now()` in the jobId).

### WR-03: `equipSpell` trusts client-supplied `usages` and defaults to 0

**File:** `src/characters/characters.service.ts:245`
**Issue:** `const usages = request.usages ?? 0;` — two problems:
1. The client controls `usages` with no upper bound: any caller can equip a spell with `usages: 999`, bypassing `spell.maxUsages`. Even after the planned JWT layer lands, this value would remain client-controlled, violating "nessun client può alterare uno stato che non gli appartiene". Note `equipSpell` never loads the Spell document, so it cannot validate.
2. The default of `0` produces a permanently dead slot: an equipped spell with 0 usages can never be used (`useSpell` rejects at `usages <= 0`) and no recovery job is ever scheduled to restore it.
**Fix:** Load the spell and derive the value server-side:
```typescript
const spell = await this.spellModel.findById(request.spellId).exec();
if (!spell) throw new NotFoundException(`Spell ${request.spellId} not found`);
const usages = Math.min(request.usages ?? spell.maxUsages, spell.maxUsages);
```
Ideally remove `usages` from `EquipSpellRequest` entirely (breaking-change caveat: coordinate with FE contract per CLAUDE.md constraints).

### WR-04: Crash window between `character.save()` and `queue.add()` permanently loses a usage

**File:** `src/characters/characters.service.ts:303-318`
**Issue:** `useSpell` persists the decrement first, then enqueues the recovery job. If the process crashes or Redis is unavailable between the two calls (queue.add rejects → mutation returns 500 but the decrement is already saved), the usage is lost forever — there is no reconciliation path. The jobId embeds `Date.now()`, so it also cannot be deterministically re-enqueued or cancelled.
**Fix:** Reverse the order — enqueue first with a recovery handler made idempotent and capped (WR-01 + WR-02 make the increment safe even if the decrement never lands), or use a deterministic jobId (`${characterId}-${spellId}` plus a per-slot counter) so a retry path can detect the missing job. Long-term: a startup reconciliation that restores `usages` to `maxUsages` for slots with no pending job.

### WR-05: PubSub typed as the wrong class; declared event payload shape diverges from what is actually published

**File:** `src/characters/characters.service.ts:6,31`; `src/pubsub.module.ts:5-7`; `test/harness/character-changestream.int-spec.ts:38`
**Issue:** The `PUB_SUB` token provides `createPubSub<PubSubEvents>()` from `@graphql-yoga/subscription`, but `CharactersService` types the injected instance as `PubSub` from `graphql-subscriptions` (line 6/31) — a different class that happens to share the `publish(name, payload)` shape. This wrong typing masks a second inconsistency: `PubSubEvents` declares `characterUpdated: [character: Character]` (bare Character), but the service publishes the wrapped shape `{ characterUpdated: character }` — which is the shape the resolver's `filter` (characters.resolver.ts:75) and the default GraphQL field resolver actually require. The harness test publishes the bare document per the declared type, so the harness and production publish different payload shapes; a future refactor "fixing" the service to match the declared type would silently break the subscription filter.
**Fix:** In `characters.service.ts` import `type { PubSub } from '@graphql-yoga/subscription'` and inject as `PubSub<PubSubEvents>`; change `PubSubEvents` to declare the real wire shape:
```typescript
export type PubSubEvents = {
    characterUpdated: [payload: { characterUpdated: Character }];
};
```
and align the harness test's `publish` call accordingly.

### WR-07: `getShortestPath` sums an arbitrary parallel edge on the multigraph

**File:** `src/roads/roads.service.ts:153-162`
**Issue:** The graph is built with `multi: true` (line 82), so two nodes can be connected by parallel edges with different `weight`/`speedFactor` (e.g., two roads sharing a segment). Dijkstra minimizes over the cheapest edge, but the reconstruction loop takes `edgeKeys[0]` — an arbitrary parallel edge — so `distance`/`time` can be computed from a different (worse) edge than the one the path actually used, returning inflated totals to the FE.
**Fix:** Select the minimum-weight edge among parallels:
```typescript
const edgeKey = edgeKeys.reduce((best, k) =>
    this.graph.getEdgeAttribute(k, 'weight') <
    this.graph.getEdgeAttribute(best, 'weight')
        ? k
        : best,
);
```

## Info

### IN-01: Stale "RED (bug D-06)" comment describes a bug that is already fixed

**File:** `src/characters/characters.service.spec.ts:257-259`
**Issue:** The comment states "With the current (buggy) order the usage is lost" — but `characters.service.ts:293-303` already validates spell existence before decrementing, so the test is GREEN. The stale TDD comment misleads future readers into thinking the bug is still open.
**Fix:** Reword to document the invariant, e.g. "Regression guard (D-06): spell existence is validated BEFORE the usage is decremented."

### IN-02: `mongo.module.ts` injects ConfigService but ignores it, reading `process.env` directly

**File:** `src/mongo/mongo.module.ts:25-31`
**Issue:** `inject: [ConfigService]` is declared but the factory takes no parameters and reads `process.env.MONGO_URI` / `DB_NAME` directly (plus a redundant `import * as process from "process"`). This is dead injection and bypasses ConfigModule (env overrides in tests won't flow through ConfigService). File also uses double quotes vs the project single-quote convention.
**Fix:** `useFactory: (config: ConfigService) => ({ uri: config.get<string>('MONGO_URI'), dbName: config.get<string>('DB_NAME') })`.

### IN-03: Leftover scaffolding comments and undocumented magic constant in RoadsService

**File:** `src/roads/roads.service.ts:4,9,16`
**Issue:** Placeholder comments ("Assicurati che questi import siano corretti...", "Assumi che questo sia corretto") are generation artifacts. `private readonly R = 127.42` (planet radius used by haversine) is undocumented — a reader will assume Earth's 6371 km and think it a bug.
**Fix:** Remove the scaffolding comments; rename/document the constant, e.g. `private readonly WORLD_RADIUS_KM = 127.42; // raggio del pianeta di gioco`.

### IN-04: CI runs twice per PR, lints with `--fix`, and mixes npm/yarn

**File:** `.github/workflows/ci.yml:3-5,49-50`; `package.json:15,134`
**Issue:** (a) `on: push` + `pull_request` with no branch filter double-runs every PR commit. (b) `npm run lint` invokes eslint with `--fix`, which silently auto-corrects in CI instead of failing on fixable violations. (c) CI uses `npm ci`/npm cache while `package.json` declares `packageManager: yarn@1.22.22` — works today because the lockfile is npm-format, but invites drift.
**Fix:** Filter push to `develop`/`main`; add a fix-less `lint:check` script for CI; pick one package manager story and align CI, `packageManager`, and lockfile.

### IN-05: Inconsistent request field naming: `characterId` vs `id`

**File:** `src/models/request/use-spell-request.model.ts:5-6`; `src/schema.gql:168-172,441-444`
**Issue:** `UseSpellRequest` names the character reference `characterId` while `EquipSpellRequest`, `EquipItemRequest`, and `TransactionRequest` all use `id`. Minor API inconsistency the FE must special-case.
**Fix:** Standardize (prefer the explicit `characterId` going forward, but changing existing inputs breaks FE contracts — document the convention and apply to new inputs).

### IN-06: Unbounded commit-retry loop in the transaction harness test

**File:** `test/harness/replset.int-spec.ts:39-52`
**Issue:** `for (;;)` retries `commitTransaction()` forever on `UnknownTransactionCommitResult`. If the replSet is genuinely wedged, the test hangs until the Jest timeout instead of failing with a diagnostic.
**Fix:** Bound the retries (e.g., max 10 attempts with a short delay), throwing the last error afterwards.

### IN-07: Failed spell-recovery jobs accumulate in Redis with no retention policy

**File:** `src/characters/characters.service.ts:316`
**Issue:** `removeOnFail: false` with no `attempts`/`backoff` means every failed recovery job (e.g., transient Mongo error) stays in Redis forever and is never retried — combining silent usage loss (see WR-01) with unbounded growth.
**Fix:** Add `attempts: 3, backoff: { type: 'exponential', delay: 1000 }` and `removeOnFail: 100` (keep last N for inspection).

### IN-08: Pre-existing integrity gaps in `doTransaction`/`equipItem` (backlog note)

**File:** `src/characters/characters.service.ts:161-219`
**Issue:** Pre-existing code in a reviewed file, noted for the backlog: `doTransaction` never checks the resulting balance (coins can go negative) nor that sold items exist in sufficient quantity (selling a non-owned item silently no-ops); `equipItem` does not verify the item is in `ownedEquipments` or matches the slot type. All conflict with the backend-source-of-truth core value.
**Fix:** Add server-side validation when these flows are touched in a future phase (Boy Scout Rule).

### IN-09: `getShortestPath` throws "Nessun percorso trovato" when origin and destination snap to the same node

**File:** `src/roads/roads.service.ts:144`
**Issue:** `path.length < 2` treats a single-node path (from === to, or two POIs snapping to the same road node) as "no path found", a misleading error for a legitimate zero-distance trip.
**Fix:** Handle `path.length === 1` explicitly by returning `{ distance: 0, time: 0 }`.

### IN-10: Legacy `installSubscriptionHandlers` alongside `graphql-ws`

**File:** `src/app.module.ts:50,54-56`
**Issue:** `installSubscriptionHandlers: true` enables the deprecated `subscriptions-transport-ws` path while `subscriptions: { 'graphql-ws': true }` configures the modern protocol; the legacy flag is redundant (and deprecated in @nestjs/graphql 13).
**Fix:** Remove `installSubscriptionHandlers: true` after confirming the Flutter client speaks `graphql-ws`.

### IN-11: ESLint downgrade to `warn` has no ratchet — new src violations accumulate silently

**File:** `eslint.config.mjs:27-47`; `.github/workflows/ci.yml:49-50`
**Issue:** The repo-wide downgrade of the type-safety rules (`no-floating-promises`, `no-unsafe-*`, etc.) to `warn` is a deliberate, well-documented choice for PRE-EXISTING debt (comment references Phase 10 / 01-VERIFICATION.md gap #2). However the override applies to all `src/` code, including code written from now on, and CI runs eslint with its default warning tolerance (no `--max-warnings`, no baseline count). Net effect: a NEW floating promise or unsafe cast introduced tomorrow produces only a log line and a green build — the debt can grow unbounded and Phase 10 inherits a moving target. Particularly relevant for `no-floating-promises`, which catches real bug classes (unawaited `save()`/`queue.add()`) in this async-heavy codebase.
**Fix:** Freeze the debt with a ratchet: record the current warning count and fail CI when it increases, e.g. a `lint:ci` script that runs `eslint -f json` and compares total warnings against a committed baseline number (or adopt a baseline tool). Cheapest viable option: `--max-warnings <current-count>` in the CI lint step, lowered as debt is paid down.

### IN-12: `test:cov` and `test:watch` run the integration project without `--runInBand`

**File:** `package.json:19-20,103-127`
**Issue:** The primary scripts are correct after 01-05 (`test` = `test:unit && test:int`, with `test:int` serialized via `--runInBand`). But `test:cov` and `test:watch` run ALL Jest projects — including `integration` — with default parallel workers. All integration workers share one MongoMemoryReplSet URI (globalSetup env propagates to workers) and `after-env.ts:10-15` wipes every collection in `afterEach`, so a worker can delete another worker's in-flight documents mid-test. Coverage runs (and watch-mode reruns) are therefore flaky in a way `npm test` is not.
**Fix:** Scope the convenience scripts to the safe project or serialize them:
```json
"test:watch": "jest --selectProjects unit --watch",
"test:cov": "jest --coverage --runInBand"
```

### IN-13: `startRedis` env passthrough + `queue.empty()` can wipe a shared local Redis queue

**File:** `test/setup/redis.ts:6-8`; `src/characters/spell-recovery.processor.int-spec.ts:56-58`
**Issue:** `startRedis()` short-circuits to `REDIS_HOST`/`REDIS_PORT` whenever both are set — intended for the CI service container, but it also fires on a developer machine where those vars are exported for the dev backend. In that case the integration test attaches to the shared dev Redis and `afterAll` calls `queue.empty()` on the real `spell-recovery` queue, silently destroying any pending recovery jobs of the running dev environment (permanent usage loss per WR-01/WR-04). There is no test-scoped isolation (no dedicated DB index or key prefix).
**Fix:** Gate the passthrough on an explicit opt-in (e.g. only when `CI=true` or a dedicated `REDIS_TEST_HOST`/`REDIS_TEST_PORT` pair is set), and/or isolate with a Bull key `prefix` (e.g. `bull-test`) so `queue.empty()` cannot touch dev/prod keys.

---

_Reviewed: 2026-07-23T20:42:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
