# BE Phase 19 — Code review, AREA B (character: worn equipment, single spell list, computed slots)

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/19-revisione-dei-modelli`, range `12a47d1f..HEAD`
- Depth: standard. Read-only: code read with git/grep/Read. Nothing was executed (no jest, tsc, build, lint, backend), so every finding below comes from reading the code, not from a run.
- Findings: 0 critical, 1 warning, 6 info.

## Summary

The area implements D-06, D-07, D-08, D-16, D-21, D-22 and D-24 as written. No defect found in the steady state (all documents migrated). The one warning is about the boot window of the one-off migration, where the new readers and writers of this area meet documents still in the old shape.

Checked and found sound:

- **`equipSpell` capacity under concurrency.** One `updateOne` whose filter holds both the `$elemMatch { spell, active: { $ne: true } }` and the `$expr` count of active entries `<` `maxActiveSpellsExpression()` (`src/characters/spells/active-spell.updates.ts:17-38`). The predicate is evaluated on the live document inside the same write, so two parallel equips cannot both pass. Covered by `equip-spell.int-spec.ts:409` and `:444`.
- **Entry without flag.** `$ne: true` in the filter, `$eq: [.., true]` in the count, `=== true` in the classifiers, combat, GM overrides and `spellsSpent`: a missing flag reads as not equipped everywhere, consistently.
- **Refusal codes and precedence.** Same order as before for the three mutations (malformed id, catalogue `NOT_FOUND`, character `NOT_FOUND`, `SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`; `SPELL_NOT_ACTIVE` before `SPELL_NO_USAGES_LEFT`).
- **`useSpell` on a non-active entry.** Refused by the filter (`active: true` in the same `$elemMatch` as `usages >= 1`, `spell-state.updates.ts:16-18`) and classified `SPELL_NOT_ACTIVE`.
- **Recovery credits and Bull processor.** Filters and updates only lost the mirror; index `character_spell_recoveries` is still on `status.spellStates.recoveries` (`character.model.ts:102-105`). Credits are one conditional update each, so replay and the sweep race neither lose nor double them.
- **Trim pipeline (D-21).** Keeps `active` (`spell-state.migration.ts:112`), adds no flag to an entry stored without one, never rebuilds from other lists; `migrateOne` before each credit is a no-op in range.
- **Wire mapper.** Orphan spell refs are filtered before serialisation, so `[SpellState!]!` and `spell: Spell!` cannot be nulled; order is the stored order.
- **Order (D-16).** Equip and unequip only set a flag, outcomes write the whole array in stored order, learning appends, the trim uses `$map`.
- **`maxActiveSpells`.** Resolve field registered in `CharactersModule` and in `test/authz/characters-test-app.ts`. Both the query and the subscription payloads come from `CharactersService.findOne` (hydrated), and the resolver only reads `xp` and `title`, so a lean parent would work too. Both paths have a wire test.
- **`feet` and slot filters.** Every slot path is built from `Object.values(SlotType)`; `EquipItemRequest.slotType` is validated against the enum; the sale frees `assets.wornEquipment.<slot>` from a snapshot projected on the new name.
- **Authorization.** `characters.resolver.ts` is not in the diff; the new field resolver adds no entry point.
- **Removed names.** No reader of `wearedEquipment`, `foots`, `status.spells`, `assets.activeSpells` or `spellMaxUsages` is left in `src` or `test` outside `src/migrations/model-review/`. `CombatParticipant.activeSpells` stays, as D-22 says.
- **Tests.** A heuristic scan of the changed specs found no test without an assertion.

## Warnings

### B-WR-01: outcomes resolved during the first boot run on non-migrated characters, and the spell step can then discard what they wrote

**Files:**
- `src/quests/outcomes/combat/combat-context.ts:128-141` (`wornOf`, `activeSpellsOf`)
- `src/quests/outcomes/outcome-plan.ts:407-435` (learning appends to `status.spellStates` only)
- `src/migrations/model-review/spell-states.step.ts:91-93, 147, 170-197` (cross-area: the one-off step)
- `src/migrations/model-review/model-review.boot.ts:25-29`, `model-review.module.ts:30-40` (spell step is last of nine, worn equipment eighth)

**Issue:** the fallbacks for pre-migration snapshots were removed (correctly, per D-21), so the new lean readers treat an old-shape character as having nothing worn and no active spell. That is only safe if nothing resolves before the one-off steps finish, and the boot does not guarantee it:

- The Bull processors (`RESOLVE_QUEST_JOB`, `AMBUSH_JOB`, `TRAVEL_COMPLETE_JOB`) attach at module init, before any `onApplicationBootstrap` hook.
- The quest, travel and ambush sweepers start un-awaited in their own bootstrap hooks.
- The runbook stops the user's process for the backup, so jobs that came due during the downtime are exactly the ones that fire at boot.

Consequences for a character resolved in that window:

1. Combat reads `assets.wornEquipment` (absent, the data is still under `wearedEquipment`) and entries without `active`: the character fights with no equipment and no spells. A defeat it would not otherwise have suffered is then written (`awaitingAid`, wounds, detour).
2. A spell learned in that outcome is appended to `status.spellStates` but not to `status.spells`. The spell step builds the merged list from `status.spells` and drops every state not matched from it (counted as `droppedStates`, line 147). The `QuestResult` says the spell was learned; the character no longer has it.
3. The step reads all characters, then writes each with `{ _id }` as the only filter (lines 170-197). An outcome committed between the read and the write has its `status.spellStates` overwritten by the merge of the stale read.

The same applies, for longer, if a step throws: `ModelReviewBoot` logs and continues by design, and the app then serves traffic on old-shape documents until the next boot. In that case `equipSpell` flags set by players are also overwritten, because `active` is taken from the old `assets.activeSpells` whenever that list is still present (line 134-136).

Exposure in the real data is small (7 characters, 2 with spells, 2 with a `foots` slot), but the trigger is the normal runbook, not an exotic race.

**Fix:** two parts, the first is enough for the real boot.

1. Runbook (orchestrator), before the first boot of the Phase 19 code: add a dry-run count of work that is already due and require 0, or let the pre-19 process drain it before stopping. That means characters with a quest lane, an `activeTravel.endTime` or an `activeTravel.ambush` due at or before the expected boot time. After the boot, require `stati lasciati fuori 0` in the spell step line and no WARN from it.
2. Harden the step so a late run cannot destroy new-code writes:

```ts
// spell-states.step.ts, mergeSpellLists: after the loop over `learned`
for (const state of states) {
    const spell = refIdOf(state?.spell);
    if (!spell || usedStates.has(state) || merged.has(spell.toHexString())) continue;
    usedStates.add(state);
    merged.set(spell.toHexString(), {
        spell,
        usages: usagesOf(state) ?? maxUsagesOf.get(spell.toHexString()) ?? 0,
        recoveries: recoveriesOf(state),
        active: state.active === true,
    });
}
// and in the loop: a flag already written by the new code wins over the old mirror
active: state?.active === true || (equippedIsKnown && equippedEntry !== undefined),
```

and guard the write against a concurrent change: add the `status.spellStates` value that was read to the `updateOne` filter and re-read on `matchedCount === 0`. The step's unit spec pins «stati lasciati fuori» for states outside `spells`, so this needs a ruling: it changes what the step does with a state the old data model considered unknown.

## Info

### B-IN-01: the array filter matches on the spell id only, so duplicate entries are all written

**File:** `src/characters/spells/spell-state.updates.ts:5-7` (used by `active-spell.updates.ts:41-43, 55-57` and by spend and credit)
**Issue:** the query selects one entry with `$elemMatch`, the update writes every entry matching `s.spell`. With two entries for the same spell: `equipSpell` activates both and the active count passes the capacity; `useSpell` decrements both, including one at 0 usages; a credit increments and pops both. No code path creates duplicates (learning checks the states, the one-off step dedupes), and nothing in the schema forbids them, so this needs a hand edit at DB to happen. For spend and credit it predates the phase; equip and unequip are new on this filter.
**Fix:** repeat the guard in the array filter where it exists (`{ 's.spell': spellId, 's.active': { $ne: true } }` for equip, `{ 's.spell': spellId, 's.active': true }` for unequip and use), or add a boot check that counts characters with a repeated `status.spellStates.spell`.

### B-IN-02: an active entry whose spell left the catalogue holds a slot the player cannot see

**File:** `src/characters/spells/active-spell.updates.ts:17-24`, `src/characters/spells/spell-state.mapper.ts:4-14`
**Issue:** the wire drops orphan entries, the capacity count does not. A character with an orphan active entry sees a free slot and gets `MAX_ACTIVE_SPELLS_REACHED`; the client has no id to unequip it. Same behaviour as with the old mirror, carried over.
**Fix:** none needed for the phase. If wanted later: have the catalogue deletion of a spell clear `active` on its entries, or exclude orphans from the count.

### B-IN-03: `findOne` throws a TypeError on a character without `assets.wornEquipment`

**File:** `src/characters/characters.service.ts:133-148`
**Issue:** `wornEquipment[slot]` is read without a guard and the `@Prop` has no default (`character-assets.model.ts:28-30`). Same shape as before the rename, but now every non-migrated character is in this state until the worn-equipment step runs: the `character` query and each `characterUpdated` publish for it fail with a 500 instead of a typed error. Tied to B-WR-01; harmless once the step has run.
**Fix:** `if (!wornEquipment) throw …` with the house exception, or `default: () => ({})` on the `@Prop` (check `shop-fields`-style schema specs first).

### B-IN-04: `overrideParticipantOf` dereferences a state entry without the guard used in combat

**File:** `src/quests/outcomes/gm-overrides.ts:54-55`
**Issue:** `state.active` here, `state?.active` in `combat-context.ts:137` for the same list. A `null` element in a hand-edited array throws in the GM completion and not in combat.
**Fix:** `state?.active === true` and `state?.usages`.

### B-IN-05: classifier and filter disagree on a spell ref stored as a string

**File:** `src/characters/spells/spell-state.snapshot.ts:23-28`, `src/characters/spells/active-spell.updates.ts:33-35`
**Issue:** `stateEntryOf` compares with `sameId` (ObjectId or hex string) while the filters match the cast ObjectId only. For an entry whose `spell` is a string, the update never matches and the classifier finds no violated guard twice, so the answer is the fallback (`MAX_ACTIVE_SPELLS_REACHED` or `SPELL_NO_USAGES_LEFT`), which names the wrong cause. Needs a hand-written string at DB: the path is typed and the one-off step writes ObjectIds.
**Fix:** none required; if touched, drop the string case from the reader and its test (`spell-state.snapshot.spec.ts:23-27`) so both sides state the same rule.

### B-IN-06: leftovers of the contraction

**Files:**
- `test/fixtures/character.fixture.ts:73-75`: `spellBook()` now only wraps `spellStatesOf()` in an object. Two helpers for one thing; callers can spread `spellStatesOf` directly.
- `src/characters/spells/spell-state.migrator.ts:22-26`: `StoredSpellState` does not list `active`, although the class comment and the pipeline are about preserving it.
- `src/characters/spells/spell-recovery.service.ts:26`, `spell-recovery.sweeper.ts:73`: «nessun filtro sullo slot / sugli slot» still reads correctly, but the thing not filtered is now the `active` flag; one word would align them with `spell-state.updates.ts:37`.
**Fix:** tidy in the same commit as any other touch of these files; none of it affects behaviour.

---

_Reviewer: Claude (gsd-code-reviewer), depth standard, 2026-11-11_
