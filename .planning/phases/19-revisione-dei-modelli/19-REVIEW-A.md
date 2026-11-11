# BE Phase 19 — Code review, AREA A (catalogue, pets, companion xp, pet lore, generated pet prizes)

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/19-revisione-dei-modelli`
- Range: `git diff 12a47d1f..HEAD -- src test`, restricted to area A
- Depth: standard (read-only: git / grep / Read; no jest, tsc, build, lint, backend, `.env`)
- Reviewed: 2026-11-11
- Findings: **0 critical, 3 warning, 8 info**

Paths below are relative to the repo root.

## Files reviewed (sources; specs sampled for title/assertion honesty)

- `src/models/pet.model.ts`, `src/models/enemy.model.ts`, `src/models/common/weaknesses.model.ts`, `src/models/character/owned-pet.model.ts`, `src/models/character/character-assets.model.ts`, `src/models/character/ambush-snapshot.model.ts`, `src/models/quest-result/quest-result.model.ts`
- `src/characters/pets/{owned-pet-entry,owned-pets.mapper,equip-pet.updates}.ts`, `src/characters/characters.service.ts` (read paths)
- `src/economy/trade/{catalog-prices.reader,shop-transaction.service,trade-pets,trade-pool,trade-pricing,trade-line,trade-inventory}.ts`, `src/shops/shop-pool.rules.ts`
- `src/quests/outcomes/pets/{companion-xp,pet-xp}.ts`, `src/quests/outcomes/{outcome-plan,combatant-plan,rescue-plan,unrewarded-plan,resolution-loader.service,outcome-writer.service,gm-completion.service}.ts`, `src/quests/outcomes/conclusion/conclusion-plan.ts`, `src/quests/outcomes/guard/guard-outcome.ts`, `src/quests/outcomes/rewards/quest-rewards.ts`
- `src/travel/ambush/{ambush-plan,ambush-results,ambush-resolution.service}.ts`
- `src/lore/{related-lore.resolvers,related-lore-ids,lore-visibility,lore-visibility.module,viewer-knowledge.service,knowledge-addition}.ts`, `src/quests/outcomes/victory-knowledge.ts`
- `src/quests/generation/{pet-prize,pet-candidate,generated-prizes,quest-generator.service,enemy-candidate,enemy-pool}.ts`
- `src/enemies/{enemies.service,enemies.module}.ts`, `src/quests/quest-catalog.populate.ts`, `src/quests/results/{quest-result.populate,quest-results.service}.ts`
- Skimmed (outside the listed scope, same data): `src/migrations/model-review/{owned-pets,pet-catalog,enemy-weaknesses,enemy-spells}.step.ts`
- Specs sampled: `pet-prize.spec.ts`, `companion-xp.spec.ts`, `pet-xp.spec.ts`, `owned-pets.mapper.spec.ts`, `quest-pet-prize.int-spec.ts`, `shop-transaction.service.int-spec.ts` (pet blocks), `lore-related.int-spec.ts` (titles), `character-updated.subscription.int-spec.ts` (titles)

## Summary

No critical defect found. The points the brief asked to attack hold up:

- **Atomic writes.** Every outcome path writes `assets.ownedPets` once, as a whole array built from the snapshot read in the transaction session (`outcome-plan.ts:337-344, 485`; `ambush-plan.ts:218-220`). The companion award and the pet won in the same outcome are merged into one array (`ownedPetsAfterOutcome`), pinned by `quest-pet-prize.int-spec.ts:205`. The shop does the same inside its own transaction (`shop-transaction.service.ts:242-282`) and re-asserts ownership in the write filter (`trade-pets.ts:89-98`). Because all snapshots are read with the session, a concurrent trade, outcome or `equipPet` produces a WriteConflict and a retry, not a lost update. Concurrent double purchase is pinned (`shop-transaction.service.int-spec.ts:1649`).
- **Ownership / inflation.** `doTransaction` keeps `@OwnsCharacter`; prices, life points and lore come only from the catalogue; `petXpGained` is server-computed from `Enemy.xp`; pet quantity is forced to 1 and duplicate lines are rejected (`trade-pricing.ts:47-63`).
- **Companion xp (D-04, D-17, D-18, D-19).** One insertion point (`planParticipant`) covers individual, party, dungeon, GM completion, rescue win and guard win; ambush has its own (`foughtOutcomeOf`). Enemies-only xp, cap, "never lower", invalid `maxXp` = no award, held ambush report with `?? 0` are all implemented.
- **Lore (D-26).** `Pet.relatedLore` is resolved on the type through the per-viewer filter for every path that serves a `Pet`; ids are filtered before the lore query, so locked lore never reaches the wire. Purchase and prize add only the fresh lore in the same write that adds the entry; sale removes nothing.
- **Pet prize (D-28).** Band boundaries are rounded to 1e-6 (0.1 / 0.15 / 0.2 exact, pinned at the edges), one band roll always, one index roll only with candidates, no fall-through, rarity cap and "no rarity = not a candidate" implemented.
- **Populate.** `Enemy.spells` is populated at the three wire points (`enemies.service.ts`, `QUEST_CATALOG_POPULATE`, `QUEST_RESULT_POPULATE`); list populate drops dangling refs; orphan owned pets are filtered in `findOne`, which is also the source of the `characterUpdated` payload and snapshot.

The three warnings are robustness and rule-consistency issues, not broken flows.

---

## Warnings

### A-WR-01 — An out-of-enum weakness now nulls the enemy (and every list that contains it) on the wire

**File:** `src/models/common/weaknesses.model.ts:9-15`, served by `src/enemies/enemies.service.ts:24-39`, `src/quests/quest-catalog.populate.ts:11-16`, `src/quests/results/quest-result.populate.ts:22-27`

**Why:** Before the phase the two fields were `[String!]!` on the SDL, so any stored value serialised. Now they are `[DamageType!]!` / `[EnergyType!]!` inside `Enemy.weaknesses: Weaknesses!`. A single stored value outside the enum (typo from a content script; Mongoose `enum` only validates on `save`) makes the enum serialiser throw, and the null propagates through non-null fields: `Weaknesses.base` -> `Weaknesses!` -> `Enemy!` -> `QuestEnemy!` -> `[QuestEnemy!]!` -> `QuestInfos` ... up to `quests: [Quest!]!`, and likewise `enemys: [Enemy!]!` and `QuestResult.enemies`. The migrator already knows the risk ("un valore fuori enum annullerebbe il nemico sul filo: si conta, non si corregge", `enemy-weaknesses.step.ts:29`) but nothing protects the wire afterwards. The lean readers do sanitise (`combat-context.ts:253-255` `knownOf`, `enemy-candidate.ts:35-38`), and the same class of problem was handled for `prizes.cure` (`quest-catalog.populate.ts:84-85`) and `Pet.rarity` (nullable + int-spec). Today the DB has no such value (inventory in `19-REPO-RULES.md`), so this is latent, but the blast radius is the whole quest board.

**Fix:** sanitise on the type, so every path is covered, e.g. a small resolver next to the model:

```ts
@Resolver(() => Weaknesses)
export class WeaknessesResolver {
    @ResolveField('base', () => [DamageType])
    base(@Parent() w: Weaknesses) {
        return (w.base ?? []).filter((v) => KNOWN_DAMAGE_TYPES.has(v));
    }
    @ResolveField('energy', () => [EnergyType])
    energy(@Parent() w: Weaknesses) {
        return (w.energy ?? []).filter((v) => KNOWN_ENERGY_TYPES.has(v));
    }
}
```

(reuse the `KNOWN_*` sets of `combat-context.ts`), plus one int-spec "drops a weakness stored outside the enum instead of nulling the enemy (D-01)". Alternative, weaker: a boot-time count with a WARN.

### A-WR-02 — Legendary pets can be offered by hero boss quests, against the invariant written in D-28

**File:** `src/quests/generation/pet-prize.ts:79-90` with `src/quests/generation/generated-prizes.ts:76-80` (`HERO_BOSS_POOL` has a `legendary` slot); pinned by `src/quests/generation/pet-prize.spec.ts:77`

**Why:** D-28 (CONTEXT and REPO-RULES) says the cap is the widest rarity of `LOOT_POOLS[type][rank]` and then states the consequence: "i `legendary` non escono dalle quest generate finché nessun pool li prevede". A pool does include them: boss/hero. So `petRarityCapOf(boss, hero)` is `legendary` and the third band ("any non sellable pet") can offer Pegaso, Grifone and the like on every repeatable hero boss quest (5 % offer, then 20 % on win). The code follows the mechanical half of the rule and the plan (`19-22-PLAN.md:149` pins boss hero -> legendary; `19-22-SUMMARY.md:163` records "I `legendary` escono solo dai boss hero"), but that contradicts the sentence of the decision the user approved. This is a product rule, so it needs a ruling rather than a silent choice.

**Fix (one of):**
- if legendary pets must never come from generated quests: clamp the cap, e.g. `const PET_PRIZE_MAX_RARITY = RarityType.ultrarare` and `min(cap, PET_PRIZE_MAX_RARITY)` in `petRarityCapOf`, update the `it.each` row to `ultrarare` and add "never offers a legendary pet, even on a hero boss (D-28)";
- if "only from hero bosses" is what the user wants: amend the D-28 sentence in `19-CONTEXT.md` / `19-REPO-RULES.md` and the handoff so the documents and the code say the same thing.

### A-WR-03 — A malformed owned-pet entry nulls the whole character on the wire, and the writers copy it forward

**File:** `src/characters/pets/owned-pets.mapper.ts:4-13`, `src/models/character/owned-pet.model.ts:18-24`; writers `src/quests/outcomes/pets/companion-xp.ts:41-43`, `src/quests/outcomes/outcome-plan.ts:343`, `src/economy/trade/trade-pets.ts:52`

**Why:** `OwnedPet.xp` and `OwnedPet.currentLifePoints` are `Int!`. `ownedPetsOnTheWire` only drops entries whose `pet` is not populated. An entry stored with `xp: null`, a missing or null `currentLifePoints`, or a non-integer number (`required: true` is not enforced by update operators or by native-driver scripts; Mongoose defaults do not replace an explicit `null`) fails `Int!`, and the null climbs `OwnedPet!` -> `[OwnedPet!]!` -> `assets` -> `Character`: the `character` query, the `characterUpdated` snapshot and every later event for that character fail. Pet life is exactly the field the user's combat engine and hand-run DB scripts will start writing. The writers make it sticky: outcome and shop rewrite the array from the lean snapshot and keep every other entry verbatim, so a bad entry is never healed. Related edge: an entry whose `pet` cannot be cast to ObjectId makes the `$set` of the whole array throw a CastError inside the outcome transaction, which would fail that character's resolution on every retry.

**Fix:** make the wire mapper total, as was done for orphans (D-23):

```ts
const isCount = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export function ownedPetsOnTheWire(entries) {
    return (entries ?? []).filter(
        (entry) =>
            isPopulated(entry?.pet) &&
            isCount(entry.xp) &&
            isCount(entry.currentLifePoints),
    );
}
```

(or coerce invalid numbers to 0 instead of dropping, whichever the product prefers), and normalise entries in one shared helper of `owned-pet-entry.ts` when outcome/shop rebuild the array (`pet: refIdOf(entry.pet)`, numbers through the same guard, unreadable entries left out and counted in a WARN with the character id only). Add unit cases to `owned-pets.mapper.spec.ts`.

---

## Info

### A-IN-01 — Import cycle `generated-prizes.ts` <-> `pet-prize.ts` (and value imports used only as types)

**File:** `src/quests/generation/generated-prizes.ts:8`, `src/quests/generation/pet-prize.ts:3-8`; also `src/quests/generation/pet-candidate.ts:6`, `src/quests/generation/quest-generator.service.ts:39`

**Why:** `generated-prizes` imports `petPrizeOf`; `pet-prize` imports `LOOT_POOLS`, `RARITY_RANK`, `indexOf`, `GeneratedQuestType` back. It works only because no cross-module binding is read at module top level (checked: `SAME_ENEMY_BAND_END` etc. use local constants only). The first top-level use (e.g. a constant derived from `LOOT_POOLS` in `pet-prize.ts`) becomes `undefined` at load depending on import order. Already noted in `19-22-SUMMARY.md` as a candidate for review.

**Fix:** move `LootSlot`, `LOOT_POOLS`, `RARITY_RANK`, `indexOf`, `GeneratedQuestType` to a leaf module (e.g. `src/quests/generation/loot-pools.ts`) imported by both; switch `PetCandidate` imports to `import type`.

### A-IN-02 — `readPetMaxXp` reads the whole pet catalogue where the result cannot be used

**File:** `src/quests/outcomes/resolution-loader.service.ts:448-458, 493-504`; second call via `src/quests/outcomes/conclusion/conclusion-event.drawer.ts:63` discarded by `src/quests/outcomes/guard/guard-outcome.ts:80-90`

**Why:** the read runs before the `enemies.length === 0` early return, although without enemies the award is always 0; and the guard-encounter catalogue reads it a second time only for `encounterCatalogOf` to keep the quest's map. Not a correctness issue (one small query, same cost class as the `readSpellMaxUsages` it replaced), just wasted reads on every resolution and ambush.

**Fix:** return `petMaxXp: new Map()` in the no-enemies branch and read below it; optionally take the caps as a separate loader call used by `readCatalog` and the ambush service only.

### A-IN-03 — "Zone" of the pet band differs from the generator's own notion of zone

**File:** `src/quests/generation/pet-prize.ts:65-67` vs `src/quests/generation/enemy-pool.ts:33-39`

**Why:** for enemies, "nei dintorni" means POI types plus the `city` habitat, with `all` only as a fallback. The pet zone band is a plain `includes` on the POI types: a pet whose linked enemy lives in `city` (in every generated quest's zone pool) or `all` is never a zone candidate. This matches the literal text of D-28 ("ha fra le `locations` il tipo del POI"), so it is not a defect, but the two definitions will surprise whoever curates `Pet.enemy`.

**Fix:** either reuse `livesIn` semantics or state the difference in the handoff / content runbook (the note in `19-22-SUMMARY.md:163` does not mention `city`/`all`).

### A-IN-04 — An unreadable companion xp is treated as 0 and then overwritten

**File:** `src/quests/outcomes/pets/companion-xp.ts:18-23, 38-43`

**Why:** `experienceOf` maps a non-integer or negative stored xp to 0, and the award then writes `0 + share`. A hand-written `xp: 120.5` becomes e.g. `xp: 4` after one fight, which breaks "mai sotto" (D-04) for that edge and reports `petXpGained: 4`. The spec title "starts from 0 when the entry carries no valid experience" pins this on purpose for missing values; for a present-but-fractional value it loses data.

**Fix:** only default a missing/`null` xp to 0; for a finite number use `Math.max(0, Math.floor(xp))`; otherwise return `NO_AWARD`.

### A-IN-05 — `isObjectId` type guard copied three times

**File:** `src/lore/related-lore-ids.ts:4`, `src/quests/generation/pet-candidate.ts:25`, `src/quests/outcomes/victory-knowledge.ts:37`

**Fix:** export one guard from `src/mongo/document-id.ts` (two of the three copies are new in this phase).

### A-IN-06 — `characters` and `User.currentCharacter` serve owned pets unpopulated and unfiltered

**File:** `src/characters/characters.service.ts:91-96`, `src/users/users.service.ts:18-21`

**Why:** only `findOne` populates `assets.ownedPets.pet` and applies `ownedPetsOnTheWire`. On the other two paths a client selecting `assets { ownedPets { pet { id } } }` gets a raw ObjectId under `Pet!` and a nulled character. The shape of the problem predates the phase (`ownedPets: [Pet!]!` was just as unpopulated there, as were spells), so no regression; listed because the type changed and the FE fragment for `OwnedPet` is new.

**Fix:** none required if the FE never selects assets on those paths (worth one line in the handoff); otherwise share the populate list and the mapper.

### A-IN-07 — `Pet.rarity` silently joins the shop veto, with no pet-specific test

**File:** `src/economy/trade/catalog-prices.reader.ts:41-46, 119-131`, `src/shops/shop-pool.rules.ts:29-31`

**Why:** the price projection already read `rarity` for pets; with D-27 the field now exists, so a `legendary` pet curated in a city pool is hidden from `cityShop` and refused by `doTransaction` with `ITEM_NOT_IN_SHOP`. Listing and purchase stay consistent and this agrees with D-05/D-27 (shop pets are common/uncommon), but the pet block of `shop-transaction.service.int-spec.ts` only pins the `sellable: false` veto (`:1470`).

**Fix:** add "refuses a legendary pet curated in the pool with ITEM_NOT_IN_SHOP (D-05, D-27)" and the matching `cityShop` case, or note the behaviour in the handoff.

### A-IN-08 — No spec pins a shop trade racing an outcome on `assets.ownedPets`

**File:** `src/quests/outcomes/quest-pet-prize.int-spec.ts`, `src/economy/trade/shop-transaction.service.int-spec.ts:1571-1680`

**Why:** the whole-array write is safe only because both sides read their snapshot in the transaction session (analysis above). The existing race specs cover trade vs trade. A future refactor that moves the outcome snapshot out of the session would turn into "sold pet comes back / bought pet disappears" with no red test.

**Fix:** one int-spec: start a resolution, sell (or buy) a pet between the in-session snapshot and the write (same hook technique as `:1571`), expect the final array to reflect both operations exactly once.

---

## Checked and found correct (no finding)

- Band boundaries: `boundaryAfter` yields exactly 0.1, 0.15, 0.2; edges pinned at 0.0999/0.1/0.1499/0.15/0.1999/0.2 (`pet-prize.spec.ts:146-157`).
- Draw count: one band roll for every generated quest (enemy quests now consume one more draw than before, documented in `generated-prizes.ts:166-167` and `quest-generator.service.ts:193-197`), index roll only with candidates, pinned (`pet-prize.spec.ts:201-213`).
- `Pet.enemy` read as ObjectId or hex string (`pet-candidate.ts:33`), vanished enemy = no zone, missing/unknown/prototype-named rarity = not a candidate.
- `Math.round(enemiesXp * 0.1)`: for integer xp the product never falls below an exact `.5`, so rounding is stable; non-finite and negative inputs give 0.
- Guard win keeps the quest catalogue's `petMaxXp` (`encounterCatalogOf` spreads the quest catalogue); guard defeat and arrest report `petXpGained: 0`.
- `AmbushReportSnapshot.petXpGained` has its `@Prop`, so strict mode keeps it in both the `$push` (victory) and the rewritten travel (defeat).
- `QuestResult.petXpGained` is `Int!` with default 0: old results hydrate to 0; `unpopulatedResultOf` carries it through the draft spread.
- `Pet.attack` / `Pet.defense` default with a function; the catalogue step uses `$ifNull`, so an explicit `null` cannot survive the migration.
- `equipPet` filter on `assets.ownedPets.pet`; selling the equipped pet empties the slot in the same write; error codes of trade and equip unchanged.
- Lore: per-viewer cache keyed by request or event root and by viewer; no lore ids or lore documents leak for locked lore; orphan lore ids are dropped by the id lookup.
- Logs in the reviewed code carry only ids, counts and spell names (migration), no tokens, URIs or twitch ids.
- Specs sampled: titles match their assertions; no assertion-free test found.

---

_Reviewer: Claude (gsd-code-reviewer), depth standard, area A_
