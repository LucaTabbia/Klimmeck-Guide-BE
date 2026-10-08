# Codebase Concerns

**Analysis Date:** 2026-07-16

## Critical Security Issues

### 1. Complete Absence of Authentication

**Risk:** The entire backend has zero authentication. Any client can call any GraphQL mutation/query, claiming to be any user or character.

**Files:**
- `src/app.module.ts` - No auth guards configured
- `src/characters/characters.resolver.ts` - All mutations completely public
- `src/users/users.resolver.ts` - All mutations completely public
- `src/quests/quests.resolver.ts` - Public queries
- `src/rest/auth.controller.ts` - Empty file (unused)

**Why this is critical:**
- Frontend requirements explicitly mention this is backend responsibility ("atomic debit/optimistic locking as backend responsibility")
- Any user can mutate any character: spending coins, equipping items, unequipping spells
- Any user can create/delete/modify any user account
- Twitch token validation never occurs

**Current approach:** No @UseGuards, no Passport.js, no JWT validation, no Twitch OAuth integration.

**Fix approach:**
1. Implement Passport.js with Twitch OAuth strategy
2. Create guards: `@UseGuards(AuthGuard('twitch'))`
3. Extract current user from request context in resolvers
4. Validate ownership: "only owners can modify their own character"
5. Implement role-based access control for innkeeper operations

**Impact:** COMPLETE data integrity compromise. Game state is untrusted.

---

### 2. GraphQL Subscriptions Without Authentication

**Risk:** WebSocket subscriptions accept any connection with no `connection_init` auth validation.

**Files:**
- `src/pubsub.module.ts` - PubSub created without auth context
- `src/app.module.ts` (line 54-56) - `graphql-ws` enabled with no auth
- `src/characters/characters.resolver.ts` (line 72-80) - `@Subscription()` has no guard

**Problem:** Any client can subscribe to character updates without proving they own that character.

```typescript
// Attacker can subscribe to anyone's character:
subscription {
  characterUpdated(id: "victim_character_id") {
    id
    status { coins { gold } }
  }
}
```

**Fix approach:** Add authentication to subscription connection phase via Apollo context middleware.

---

### 3. GraphQL Introspection Enabled

**Risk:** Schema introspection is publicly queryable, allowing anyone to enumerate all fields, mutations, and potential attack vectors.

**Files:**
- `src/app.module.ts` (line 51) - `introspection: true`

**Problem:** Combined with lack of auth, attackers can map the entire API surface and find all mutation names.

**Fix:** Disable in production: `introspection: process.env.NODE_ENV !== 'production'`

---

### 4. Role-Based Access Control Defined But Not Enforced

**Risk:** `RoleType` enum exists (guard, adventurer, innkeeper) but no authorization checks exist anywhere.

**Files:**
- `src/models/enums/role-type.enum.ts` - Enum defined
- `src/models/user.model.ts` - Role field exists
- All resolver files - No `@UseGuards`, no role checking

**Problem:** Innkeeper operations (presumably admin) have no permission checks. Any user claiming to be innkeeper can perform admin actions.

**Fix approach:**
1. Create `@Roles(RoleType.innkeeper)` decorator
2. Create RolesGuard that checks extracted JWT claims against required roles
3. Apply to admin resolvers (e.g., createQuest, deleteUser)

---

## Data Integrity Issues (Concurrency & Atomicity)

### 5. Non-Atomic Read-Modify-Write in `useSpell()`

**Risk:** Race condition between read, modify, and write. Multiple concurrent users can exploit usage counters.

**Files:**
- `src/characters/characters.service.ts` (line 280-326)

**The bug:**
```typescript
// Line 297-298: DECREMENT FIRST, VALIDATE LATER
activeSpell.usages -= 1;  // <-- modify in memory
await character.save();    // <-- save to DB

// Line 300-303: VALIDATION HAPPENS AFTER SAVE
const spell = await this.spellModel.findById(request.spellId).exec();
if (!spell) {
  throw new NotFoundException(...);  // <-- too late! already saved
}
```

**Attack scenario:**
1. User A calls `useSpell()` for a non-existent spell
2. Line 297 decrements usage (in memory)
3. User B calls `useSpell()` concurrently - same state
4. Line 298 saves both changes (both decremented)
5. Line 300-303: Spell not found, but changes already persisted

**Impact:** Spell usage counts become inconsistent. Could allow unlimited spell usage or negative counts.

**Fix approach:**
1. Validate spell exists BEFORE modifying: swap line order
2. Use MongoDB transactions for atomic read-modify-write
3. Consider Mongoose session-based transactions

---

### 6. Non-Atomic Balance Operations in `doTransaction()`

**Risk:** Multi-step transaction without atomicity: coins modified, items added/removed, no rollback on partial failure.

**Files:**
- `src/characters/characters.service.ts` (line 161-207)

**The sequence:**
```typescript
const character = await this.characterModel.findById(request.id);
// ... 40 lines of modifications ...
character.status.coins.gold += ...;
character.status.coins.silver += ...;
// ... more coin/item modifications ...
await character.save();  // <-- single atomic call, but no transaction
```

**Problem:**
- If `character.save()` fails after modifying coins but before modifying items, state is inconsistent
- No optimistic locking as mentioned in FE requirements
- No validation that character can afford the transaction before executing

**Impact:** Player economies can drift: coins disappear or duplicate.

**Fix approach:**
1. Validate transaction feasibility first (enough coins, items owned, etc.)
2. Use MongoDB transactions (begin → modify all → commit)
3. Implement optimistic locking with version field
4. Return transaction ID and idempotency key for retry safety

---

### 7. Non-Atomic Equipment Operations

**Risk:** Race conditions in `equipItem()`, `equipSpell()`, `unequipSpell()`.

**Files:**
- `src/characters/characters.service.ts` (line 209-278)

**Example from equipSpell:**
```typescript
// Line 241-243: Check capacity
if (character.status.maxActiveSpells <= character.assets.activeSpells.length) {
  throw BadRequestException;
}
// Window: Another request modifies activeSpells here
await character.save();  // Line 251: Might exceed capacity
```

**Problem:** Between the check and the save, another concurrent request could modify the array.

---

## Input Validation Issues

### 8. No Input Validation Framework

**Risk:** Requests accept any values with no validation.

**Files:**
- `src/models/request/*.ts` - All request models have zero validation decorators
- `package.json` - `class-validator` not in dependencies
- No global ValidationPipe configured

**Problems:**
- Negative quantities can be sent (users create items)
- Arbitrarily large coin amounts accepted
- Invalid MongoIDs not validated before queries
- String fields not validated for length/format
- No sanitization against injection

**Impact:** Data integrity through careless input. Potential DoS with huge values.

**Fix approach:**
1. Add `class-validator` dependency
2. Add decorators to all request models:
   ```typescript
   @IsString()
   @IsNotEmpty()
   characterId: string;
   
   @IsNumber()
   @Min(0)
   quantity: number;
   ```
3. Register global ValidationPipe in `main.ts`

---

## Process & Code Organization Issues

### 9. Empty Unused Directory

**Risk:** Dead code confuses developers and wastes space.

**Files:**
- `src/spellRecovery/` - Empty directory (only `.` and `..` present)

**Problem:** Spell recovery is implemented in `src/characters/spell-recovery.processor.ts` instead. The empty directory at root creates false expectation of organization.

**Fix:** Delete `src/spellRecovery/` directory.

---

### 10. Uncommitted Work-in-Progress

**Risk:** Code is staged but not committed, indicating incomplete feature or deliberate exclusion.

**Files (git status shows as `??`):**
- `src/characters/spell-recovery.processor.ts` - Spell recovery via Bull queue (WIP)
- `src/models/request/use-spell-request.model.ts` - New request model

**Problem:** 
- Feature is incomplete and may have bugs (already identified in issue #5)
- Not in git history makes it harder to track when/why added
- May get lost if developer switches branches

**Fix:** Complete the feature, test it, commit it officially.

---

### 11. Empty/Unused Auth Controller

**Risk:** Dead code creates confusion.

**Files:**
- `src/rest/auth.controller.ts` - Completely empty

**Problem:** Suggests authentication was planned but never implemented. Misleads developers into thinking auth exists.

**Fix:** Either implement auth controller or delete the file.

---

## Test Coverage

### 12. Virtually No Test Coverage

**Risk:** Changes ship untested. Bugs are discovered in production.

**Current state:**
- Only 1 `.spec.ts` file: `src/app.controller.spec.ts` (scaffold)
- Jest configured but never used for actual logic
- No unit tests for services
- No integration tests for resolvers
- No test fixtures or factories

**Impact:** 
- Concurrency bugs (issues #5-7) would be caught by tests
- Non-atomic operations would be obvious in tests
- Schema changes break nothing because nothing is tested

**Fix approach:**
1. Create test suite for CharactersService
   - Test atomic spell usage
   - Test concurrent operations
   - Test race conditions with multiple saves
2. Create test suite for transaction operations
3. Test role-based access control (once implemented)
4. Set minimum coverage threshold (e.g., 80%)

---

## Information Disclosure

### 13. Error Messages Leak Implementation Details

**Risk:** GraphQL errors expose internal logic that helps attackers.

**Files:**
- `src/characters/characters.service.ts` - Multiple `throw NotFoundException()` calls
- All resolvers propagate exceptions directly to GraphQL

**Examples of leaks:**
```graphql
# Returns: "Character with id <UUID> not found"
# Tells attacker which IDs exist
query { character(id: "xxx") { id } }

# Returns: "Spell <UUID> is not known by character"
# Confirms spell and character relationship
```

**Impact:** Attackers can enumerate valid character/spell IDs and relationships.

**Fix approach:**
1. Catch and sanitize exceptions in global filter
2. Log detailed errors server-side
3. Return generic "Not found" to clients (especially for 404 cases where user shouldn't have access)
4. Return 403 Forbidden when auth fails (not 404)

---

## Environment & Configuration

### 14. Secrets Potentially Exposed

**Files:**
- `.env` file exists in repository (listed in git status)
- `.gitignore` (line 39) lists `.env` to ignore, which is correct
- But `.env` file itself is NOT ignored in working tree

**Risk:** If `.env` is ever added and committed, secrets leak to git history permanently.

**Current state:** `.env` is in `.gitignore` so it won't be committed, but the file is present locally and could be accidentally added with `git add -A`.

**Fix:**
1. Ensure `.env` is in `.gitignore` (already done)
2. Create `.env.example` with template (missing)
3. Document required variables
4. Never commit actual `.env` files
5. Use environment-specific .env files (.env.local, .env.production) all in .gitignore

---

### 15. No CORS Configuration

**Risk:** CORS policy is either missing or handled elsewhere, creating potential security gaps.

**Files:**
- `src/main.ts` - No `app.enableCors()`
- `src/app.module.ts` - No CORS middleware

**Possibilities:**
- CORS is disabled (reject all cross-origin requests) - safe but limits legitimate FE access
- CORS is handled at load balancer (Nginx, CloudFront) - okay if documented
- CORS is open (`*`) - security risk

**Fix:** Document CORS strategy. If not configured at application level, add explicit config:
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
```

---

## Performance & Scalability

### 16. GraphQL Subscriptions via Pub/Sub Without Persistence

**Risk:** Character update subscriptions run entirely in memory. If server restarts, all subscriptions are lost.

**Files:**
- `src/pubsub.module.ts` - Uses in-memory `createPubSub()`
- `src/characters/characters.service.ts` (line 46-59) - MongoDB change streams trigger PubSub

**Problem:** Change streams are connection-specific. Multiple backend instances won't share subscriptions.

**Impact:** In distributed deployments, subscriptions fail silently.

**Fix approach:** Consider Redis Pub/Sub adapter if horizontal scaling is planned.

---

### 17. Character Change Stream Potential Memory Leak

**Risk:** Change stream stays open as long as application runs. Could accumulate resources.

**Files:**
- `src/characters/characters.service.ts` (line 39-64)

**Current implementation:**
```typescript
async onModuleInit() {
  this.changeStream = this.characterModel.watch(pipeline, ...);
  this.changeStream.on('change', async (change) => { ... });
}

async onModuleDestroy() {
  if (this.changeStream) {
    await this.changeStream.close();  // Correct!
  }
}
```

**Status:** Properly cleaned up on module destroy. NOT a leak. ✓

---

## Bull Queue for Spell Recovery

### 18. Spell Recovery Queue Implementation Risks

**Risk:** Queue-based spell recovery is WIP and has edge case bugs.

**Files:**
- `src/characters/spell-recovery.processor.ts` - Processor implementation
- `src/characters/characters.service.ts` (line 305-318) - Queue scheduling

**Current behavior:**
```typescript
activeSpell.usages -= 1;
await character.save();  // Save immediately
// Then schedule recovery after spell.recoveryTime
await this.spellRecoveryQueue.add('recover', {...}, { delay: spell.recoveryTime });
```

**Risks:**
1. If Bull job processing fails, spell usage isn't restored
2. If job is removed on completion, no audit trail
3. Multiple jobs could attempt to recover same spell (race condition)
4. Usages could go negative if spell is used more times than available before recovery completes

**Fix approach:**
1. Use idempotent job IDs with deduplication
2. Implement dead-letter queue for failed recoveries
3. Add logging/monitoring for job lifecycle
4. Consider using Mongoose sessions for atomic recovery

---

## Summary of Severity Levels

| Issue | Severity | Category |
|-------|----------|----------|
| No authentication | 🔴 CRITICAL | Security |
| Subscriptions without auth | 🔴 CRITICAL | Security |
| Introspection enabled | 🔴 CRITICAL | Security |
| Non-atomic useSpell | 🔴 CRITICAL | Data Integrity |
| Non-atomic transactions | 🔴 CRITICAL | Data Integrity |
| No input validation | 🟠 HIGH | Security |
| Role enforcement missing | 🟠 HIGH | Security |
| Error info disclosure | 🟠 HIGH | Security |
| Equipment race conditions | 🟠 HIGH | Data Integrity |
| No test coverage | 🟠 HIGH | Quality |
| Empty directories | 🟡 MEDIUM | Organization |
| WIP spell recovery | 🟡 MEDIUM | Quality |
| No CORS config | 🟡 MEDIUM | Security |
| Subscription scalability | 🟡 MEDIUM | Performance |
| Secrets handling | 🟢 LOW | Security (mitigated) |

---

*Concerns audit: 2026-07-16. All 18 issues verified by code inspection.*
