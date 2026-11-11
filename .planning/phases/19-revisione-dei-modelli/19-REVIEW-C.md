# BE Phase 19 — Review AREA C: one-off migrator and world models

Repo `Klimmeck-Guide-BE`, branch `feat/19-revisione-dei-modelli`, range `12a47d1f..HEAD`. Depth: deep on `src/migrations/model-review/**`, standard on world models. Read-only: nothing run (no jest/tsc/boot/DB), everything below comes from reading the code, `node_modules/@nestjs/core` 11.1.6, `@nestjs/bull`, and the phase docs.

Counts: **1 critical, 6 warnings, 7 info.**

Verified and fine (no finding):
- Every step takes the collection from `connection.model(X.name).collection` (no hard-coded names, `lore` included).
- Update pipelines (`$set` + `$unset` array stage, `$ifNull`, `$literal`) and the `$rename`s are valid on MongoDB 8.0; the three city renames and the slot rename inside the same parent do not conflict.
- Each step is idempotent on the inventoried data (guard no longer matches after its own write). The spell merge is a single atomic write per document; the two-write equipment rename resumes correctly after a crash between the writes.
- Logs carry only counts, character/enemy hex ids and spell names.
- No hard order dependency between steps: `OwnedPetsStep` reads only `maxLifePoints` (untouched by `PetCatalogStep`), equipment and spells are independent.
- HTTP/WS are NOT listening while the steps run: `main.ts` calls `app.listen`, which awaits all lifecycle hooks first. The concurrency exposure is only the in-process background work (C-CR-01).
- No `.save()` anywhere in `src/` (non-spec), so Mongoose never persists a default `weaknesses`/`attack`/`wornEquipment` on a legacy document behind a guard's back.
- `SpellStateMigrator` (trim only) runs before the one-off spell step, on legacy entries: benign. It rewrites only out-of-range entries as `{spell, usages, recoveries, active}`, a missing `active` is omitted, and the step recomputes the flag from `assets.activeSpells` afterwards.

---

## Critical

### C-CR-01 — Bull processors and boot sweeps resolve quests/ambushes on un-migrated characters before the character steps run

**Files:** `src/migrations/model-review/model-review.boot.ts:25-29`, `src/migrations/model-review/model-review.module.ts:30-40` (character steps are 8th and 9th), `src/quests/outcomes/quest-resolution.sweeper.ts:96-104`, `src/travel/travel-sweeper.ts:49-57`, `src/travel/ambush/ambush-sweeper.ts:66-73`, `src/quests/outcomes/combat/combat-context.ts:128-141`, `src/quests/outcomes/outcome-plan.ts:429-431,481`.

**Why.**
- Nest 11.1.6 runs `onApplicationBootstrap` module by module, deepest first, then in container insertion order (`nest-application-context.js:298-309`, sort `b.distance - a.distance`, stable). `ModelReviewMigrationModule` is a direct import of `AppModule` listed after `CharactersModule`, `SpellRecoveryModule`, `TravelModule`, `AmbushModule`, `QuestOutcomesModule`. Their hooks therefore fire first.
- Those hooks are fire-and-forget (`void this.sweepSafely()`), so the sweeps run concurrently with the nine steps.
- The four Bull processors (`quest-resolution`, `travel-completion`, `ambush`, `spell-recovery`) are registered in `BullExplorer.onModuleInit`, earlier still. Delayed jobs that came due while the user's process was stopped (backup + dry run) are consumed immediately.
- A quest or ambush resolved in that window reads a legacy character with the new readers: `snapshot.assets?.wornEquipment?.[slot]` is undefined (the field is still `wearedEquipment`) and no state has `active === true`. The character fights with no gear and no equipped spells, and the outcome (defeat, HP, injuries, push, `QuestResult`) is written for real.
- A study quest resolved in the window appends the learned entry to `status.spellStates` only; step 9 then drops it because it is not in the legacy `status.spells` (see C-WR-01).
- RESEARCH M-4 lists the window but its table omits `wornEquipment` and treats "no equipped spell until the step runs" as harmless. Its mitigation ("BE stopped, no client connected") does not cover processors and sweeps, which need no client.

Whether this triggers depends only on the state of the 3 active characters at boot time; the consequence is not repairable except from the dump.

**Fix.**
1. Operational, mandatory: pre-boot checklist item 1 below (nothing due or about to come due, in Mongo and in Redis). If something is pending, let the user's pre-19 process resolve it before stopping it.
2. Code hardening, small: run the steps in `onModuleInit` instead of `onApplicationBootstrap`. Nest completes every `onModuleInit` before the first `onApplicationBootstrap`, so all sweeps and the `SpellStateMigrator` trim wait for the migration. The Mongoose connection is already resolved (async provider).
3. This still does not gate the Bull processors. To gate those too, run the steps inside an async provider factory (`useFactory: async (...steps) => { for (...) await run }`), which Nest awaits before any lifecycle hook. Otherwise rely on fix 1 for the queues.

---

## Warnings

### C-WR-01 — Spell step destroys entries written by Phase 19 code and logs only counts

**File:** `src/migrations/model-review/spell-states.step.ts:91-93,134-136,147,191-197,203-206`.

**Why.** The step treats `status.spells` and `assets.activeSpells` as the truth whenever they still exist. If Phase 19 code has touched the character first (C-CR-01 window, or app left running after a failed step 9 and the step retried at the next boot):
- an entry appended by study that is not in the legacy `status.spells` is counted in `droppedStates` and removed by the `$set`;
- `active` flags set by `equipSpell`/`unequipSpell` are overwritten from the stale `assets.activeSpells`.

D-02/D-07 intent is "reported, never silently lost", but the WARN carries only three counters per character: no spell id, so the lost entry cannot be restored without diffing the dump.

**Fix.** Legacy entries never carry `active` (the old model had no such field; the trim omits it when missing), so a boolean `active` is a reliable "written by 19 code" marker:
- in `mergeSpellLists`, append unused states with `typeof state.active === 'boolean'` and a valid ref after the learned ones, instead of dropping them;
- when the matched state has a boolean `active`, let it win over `equippedOf`;
- include the hex ids of every dropped state and every unknown equipped spell in the WARN line.

### C-WR-02 — Read-everything-then-write with an unconditional `updateOne`

**Files:** `src/migrations/model-review/spell-states.step.ts:170-197`, `owned-pets.step.ts:56-75`, `enemy-spells.step.ts:114-127`.

**Why.** Each step loads all matching documents, computes in memory, then writes `{ _id }` with a whole-array `$set`. Any write landing between the read and the write is reverted: a spell-recovery credit (`$inc usages` / `$pop recoveries`, sweeper and processor are live, see C-CR-01), an outcome's spell usage, a pet prize. The recovery case self-heals (the instant comes back and is credited again); the others do not.

**Fix.** Put the guard in the write filter and check the result, e.g. `updateOne({ _id, ...WITH_OLD_LISTS, 'status.spellStates': character.status?.spellStates ?? { $exists: false } }, …)`. Count `matchedCount === 0` as "changed underneath, retry next boot" rather than migrated. Same pattern for `assets.ownedPets` and `spells`. Moot if C-CR-01 fix 3 is adopted.

### C-WR-03 — Equipment rename overwrites an existing `assets.wornEquipment`

**File:** `src/migrations/model-review/worn-equipment.step.ts:33-37`.

**Why.** `$rename` silently replaces an existing destination. The guard is only "old field present". If step 8 fails at the first boot and the app keeps running, `equipItem` (`equip-item.updates.ts:21`) creates `assets.wornEquipment.<slot>` next to the old field; the next boot replaces it with the old object, uncounted. The lore step handles the same case correctly ("both present" is counted, nobody chooses); this one does not.

**Fix.** Filter `{ 'assets.wearedEquipment': { $exists: true }, 'assets.wornEquipment': { $exists: false } }` and report `countDocuments({ both present })` as `unmatched`, as `lore-image-path.step.ts:12-21,39` does.

### C-WR-04 — Enemy spells: an unmatched copy is removed with only its name logged; divergent copies are replaced silently

**File:** `src/migrations/model-review/enemy-spells.step.ts:54-56,122-133`.

**Why.**
- The `$set: { spells: match.ids }` deletes the embedded copy, the only place that data lives. The WARN prints the name (or `<senza nome>`) and the enemy id: not the copy's `_id`, not its content. Curating it by hand afterwards means going back to the dump.
- A copy matched by `_id` whose fields differ from the catalogue (a per-enemy tweak of power/usages) is replaced by the reference with no trace. The inventory proves the 91 copies match by `_id`, not that they are equal to the catalogue.

**Fix.** For an enemy with `match.unmatched.length > 0`, skip the write (the document stays as it is, the guard finds it again, the count says so). At minimum log the copy `_id`. Add checklist item 3 (field-by-field diff of the 91 copies against the catalogue) before the boot.

### C-WR-05 — A failed step leaves the app serving traffic on half-migrated data, with no closing signal

**Files:** `src/migrations/model-review/model-review.boot.ts:31-39`; reader `src/characters/characters.service.ts:133-136`.

**Why.** "Never blocking" (D-12) is right for a permanent hook, but here a failure is not benign:
- step 8 failed: `character.assets.wornEquipment` is undefined (no schema default, `character-assets.model.ts:28-30`), and `wornEquipment[slot]` throws a TypeError on every `character` read;
- step 9 failed: the app runs into the C-WR-01 scenario;
- step 6 failed: all shops closed.

The only signal is one ERROR line among the boot logs.

**Fix.** After the loop log one summary line (`passi falliti: N`) at error level. Runbook: stop the process immediately on any `fallito` line, before any client connects; restore or fix, then boot again. If C-CR-01 fix 2 or 3 is adopted, consider letting a failure abort the boot (throw) for this one-off.

### C-WR-06 — `cities { pointsOfInterest { id } }` fails for every city that has POIs (latent defect noted in 19-12)

**Files:** `src/cities/cities.service.ts:12-18` versus `src/cities/city-relations.ts:4-10`.

**Why.** `findAll` duplicates two of the three populates by hand and skips `pointsOfInterest`. The wire gets raw ObjectIds for a `[PointOfInterest]` field and answers `ID cannot represent value: { type: "Buffer" … }` with `pointsOfInterest: null` plus an entry in `errors` (partial data). It predates this phase and the FE does not select the field on `cities`, so severity is low today, but the SDL advertises a selection that always errors, and the helper introduced to keep the two queries aligned is not used by one of them.

**Fix.** `this.cityModel.find().populate(cityRelations()).exec()`: one extra query for at most 642 small documents, and a single source for the relations. Add a case in `cities.resolver.int-spec.ts` selecting `pointsOfInterest { id }` on a city with a POI.

Not verified, same mechanism: `PointOfInterest.city` is not populated at depth 2, so `pointsOfInterest { city { id } }` would fail the same way on both `city(id)` and `cities`. Either leave it documented or resolve it with a field resolver.

---

## Info

### C-IN-01 — `ShopBoot` report runs before `CityShopStep` on the first boot
`src/shops/maintenance/shop-boot.ts:14-31`. `ShopMaintenanceModule` precedes the migrator, so the first boot logs `Negozi: 0 città con pool fuori regola, 167 senza pool` although the pools are about to be moved. Expected once (M-4); it must be absent on the second boot. Do not read it as a failure of step 6.

### C-IN-02 — Guards treat `null` as "present"
- `enemy-weaknesses.step.ts:14`: `weaknesses: null` is skipped, old lists left.
- `city-shop.step.ts:21-27`: `shop: null` makes `$rename` throw in the middle of the `updateMany` (cities before it renamed, the rest not; resumable once fixed).
- `worn-equipment.step.ts:17`: `wearedEquipment: null` is renamed to `wornEquipment: null`, then `characters.service.ts:136` throws.

The inventory says "no `weaknesses`", "no `shop`", "`wearedEquipment` present on 7" but does not state types: covered by checklist items 2, 3, 5.

### C-IN-03 — Silent normalisations that are not counted
- `pet-catalog.step.ts:24-30`: a pet with both `attack` and `damages` loses `damages` ("la mano vince") with `unmatched: 0`.
- `spell-states.step.ts:75-80`: non-`Date` recovery instants are dropped without a counter.
- `spell-states.step.ts:72-73`: any number is accepted as `usages` (negative, fractional).

None occurs in the inventory. If cheap, count the first two in `unmatched`.

### C-IN-04 — `alreadyDone` mixes "already migrated" and "never concerned"
`enemy-spells.step.ts:136`, `owned-pets.step.ts:79`: 161 enemies without spells and characters without pets are reported as `già a posto`. Harmless; keep it in mind when comparing with the expected counts below.

### C-IN-05 — Owned-pets guard also matches non-hex strings forever
`owned-pets.step.ts:24-26,71`: a non-id string in `assets.ownedPets` re-triggers the find at every boot with no write and no count. Irrelevant on real data (no owned pets) and the module is removed.

### C-IN-06 — `City.shop` "absent is not empty" holds in every reader
- `cityShop` (`city-shop.service.ts:38-47,69-73`): absent list gives an empty shelf.
- report (`shop-pool.report.ts:56-58,77`): `hasPool` requires the three lists `!== undefined`, an empty list counts as a pool.
- `hasShop` (`shop-pool.rules.ts:18-21`), purchase/sale (`trade-pool.ts:27-34`, projection `{ shop: 1 }` in `shop-transaction.service.ts:99`): absent sells nothing, sale stays free.
- `CityShopPool` keeps `default: undefined` on the three lists and on `City.shop`.

`Lore.imagePath` is consistent in model, input and SDL (`schema.gql:396`, nullable, so the 84 lore without image are fine). `PointOfInterest.quest` is gone from model, populate and the mixed-refs registry.

### C-IN-07 — Removal readiness: clean
Outside `src/migrations/model-review/` the only references are `src/app.module.ts:29` and `:117-118` (import, comment, entry) and `test/app.int-spec.ts:58,941-948` (the D-12 mount case that M-5 flips to RED first). No reference in `package.json`, jest config or CI files. `legacy-fixtures.ts` is imported only by the module's own specs. The module imports from the app (`newOwnedPetEntry`, `refIdOf`, `describeError`), never the reverse.

---

## Pre-boot checklist (read-only checks before the real boot)

1. **Nothing due (C-CR-01).**
   - Mongo: for every non-archived character, no `quests.pendingQuest` whose resolution is due or falls within the next minutes, no `status.activeTravel` with `endTime` at or before now plus a margin, no pending ambush instant on the travel, no `awaitingAid` about to time out, no forming party about to expire.
   - Redis: no waiting/delayed job in the quest-resolution and travel queues that is due.
   - If anything is pending: let the pre-19 process resolve it, then stop it and boot straight away.
2. **Characters (7).**
   - `assets.wearedEquipment` is of type object on all 7 (not null); `assets.wornEquipment` absent on all.
   - `status.spells`, `status.spellStates`, `assets.activeSpells` are arrays where present; same length and same ids in the same order for `spells` and `spellStates`.
   - No state carries an `active` key.
   - Note how many characters have `status.spells` or `assets.activeSpells` present: that is the expected "migrati" of step 9.
3. **Enemies (206).**
   - No `weaknesses` key at all (null included); both old lists are arrays or absent.
   - The 91 embedded copies: match by `_id` confirmed AND a field-by-field diff against the catalogue. List the divergences for the user before they are discarded (C-WR-04).
4. **Pets (44).** No `attack` or `defense` key; `damages` is an object on all 44.
5. **Cities (167).** No `shop` key (null included); the three old fields are arrays on all.
6. **Lore (522).** 0 with `imagePath`; 438 with `image` (note how many are null).
7. **POI (642).** `quest` present on 642, valued on 0.
8. **Backups** of `enemies`, `pets`, `characters`, `cities`, `lore`, `pointsofinterest` taken after the user's process is stopped.
9. **First boot, expected lines** (found / migrated / already done / unmatched):
   - debolezze 206 / 206 / 0 / 0
   - magie dei nemici 206 / 45 / 161 / 0
   - catalogo pet 44 / 44 / 0 / 0
   - pet posseduti 7 / 0 / 7 / 0
   - back-link POI 642 / 642 / 0 / 0
   - pool negozi 167 / 167 / 0 / 0
   - lore 522 / 438 / 84 / 0
   - equipaggiamento 7 / 7 / 0 / 0
   - lista magie 7 / (count from item 2) / rest / 0
   - No `fallito` line and no `senza corrispondenza` above 0. One `167 senza pool` WARN from `ShopBoot` is expected on this boot only (C-IN-01).
10. **Second boot:** every step "migrati 0", no `senza pool` warning; then no client until the logs are read. Never pre-19 code on the migrated DB.
