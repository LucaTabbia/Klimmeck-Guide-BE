---
phase: 13-generazione-quest
plan: 15
subsystem: quests (esiti: premio pet)
tags: [quests, outcomes, rewards, pet, BE-QGEN-10, D-21]
requires: ["13-14"]
provides:
  - "`QUEST_PET_WIN_CHANCE = 0.2` e tiro del pet in `drawRewards` (dopo loot e magia, solo per un pet a catalogo) in src/quests/outcomes/rewards/quest-rewards.ts"
  - "`PrizesSnapshot.pet`, `RewardCatalog.pets: ReadonlySet<string>`, `RewardRefs.petId`, `DrawnRewards.pet`, `NO_REWARDS.pet = null`"
  - "`QuestResultDraft.rewards.pet: Types.ObjectId | null`; `'assets.ownedPets'` nel `$set` dell'esito solo se il pet è vinto e non posseduto"
  - "`ResolutionLoader.readPrizePets(petId)` (Pet nel forFeature di QuestOutcomesModule)"
  - "`OutcomeModels.pets` in test/quests/outcome-world.ts"
affects: [13-18, 13-19, 13-20]
tech-stack:
  added: []
  patterns:
    - "Tiro nuovo in coda e solo quando serve (Pitfall 7): le quest senza pet consumano la stessa sequenza di prima"
    - "Scrittura idempotente sullo snapshot in sessione (Pitfall 5 della Phase 12): campo fuori dall'update se non cambia"
key-files:
  created:
    - src/quests/outcomes/quest-pet-prize.int-spec.ts
  modified:
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - test/quests/outcome-world.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
decisions:
  - "Il tiro del pet usa `refIdOf(prizes.pet)` e il catalogo `pets` (hex): un ref orfano o malformato non consuma il tiro"
  - "Il pet vinto non equipaggia (`assets.pet` invariato), come l'acquisto (Phase 12 D-14)"
  - "GREEN unico per i due task: senza `pets` nel catalogo del loader tsc restava rosso (previsto dal piano)"
metrics:
  duration: "~25 min"
  completed: 2026-11-04
  tasks: 2
  files: 14
---

# Phase 13 Plan 15: Premio pet alla vittoria Summary

Il pet di `prizes.pet` si vince con un tiro del 20% per vincitore (costante `QUEST_PET_WIN_CHANCE`), tirato dopo loot e magia e solo se il pet esiste a catalogo; finisce in `assets.ownedPets` nello stesso aggiornamento condizionale dell'esito, mai due volte, ed è esposto come `rewards.pet` sul risultato (SDL invariato: il campo esisteva dal 13-02).

## Commit

| Task | Tipo | Hash | Subject |
|------|------|------|---------|
| 1 | RED | dfdbb9a | test(quests): pin the pet prize draw and its write |
| 2 | RED | 976b036 | test(quests): cover the pet prize end to end |
| 1+2 | GREEN | bd3123a | feat(quests): win the pet prize on victory |

## Nomi e firme creati

- `export const QUEST_PET_WIN_CHANCE = 0.2` (quest-rewards.ts)
- `PrizesSnapshot.pet?: unknown`; `DrawnRewards.pet: Types.ObjectId | null`; `RewardCatalog.pets: ReadonlySet<string>`; `RewardRefs.petId: Types.ObjectId | null`; `NO_REWARDS.pet: null`
- privata `petDrawOf(prizes, catalog, chance): Types.ObjectId | null` chiamata in `drawRewards` dopo `spellDrawOf`
- outcome-plan.ts: `OutcomeCharacterSnapshot.assets.ownedPets?: unknown[] | null`; `QuestResultDraft.rewards: { coins; items; pet: Types.ObjectId | null }`; privata `petWonBy(snapshot, won, pet)` (con `sameId`)
- rescue-plan.ts e `unpopulatedResultOf`: `rewards.pet: null`
- resolution-loader.service.ts: `@InjectModel(Pet.name) petModel`; privata `readPrizePets(petId): Promise<Set<string>>` (lettura lean `{ _id: 1 }`)
- quest-outcomes.module.ts: `{ name: Pet.name, schema: PetSchema }` nel forFeature
- test/quests/outcome-world.ts: `OutcomeModels.pets` = `modelOf(Pet.name)`

## RED osservati

- Task 1 (unit, 19 rossi): `drawRewards`/`NO_REWARDS` senza `pet`, `QUEST_PET_WIN_CHANCE` undefined, `rewardRefsOf` senza `petId`, `planParticipant` senza la scrittura in `ownedPets` e senza `rewards.pet` (undefined invece di null), `planRescued`/`deathResultOf` e `unpopulatedResultOf` senza `pet: null`.
- Task 2 (integration, 4 rossi su quest-pet-prize.int-spec): con il GREEN del Task 1 nell'albero ma senza il loader, la risoluzione falliva con `TypeError: Cannot read properties of undefined (reading 'has')` (catalogo senza `pets`).
- Verde al primo colpo: `serves the obtained pet on the result (D-21)` in quest-result.resolver.int-spec.ts, perché populate di `rewards.pet` e annullamento dell'orfano esistevano già dal piano 13-02; il caso fissa il contratto lato filo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GREEN dei due task in un solo commit**
- **Found during:** Task 1
- **Issue:** `RewardCatalog.pets` obbligatorio rende tsc rosso finché il loader non lo valorizza (previsto dal piano).
- **Fix:** RED del Task 2 committato prima, poi un solo commit GREEN `feat(quests): win the pet prize on victory` con il codice di entrambi i task; il subject `feat(quests): read the pet prize catalogue on resolution` non esiste.
- **Commit:** bd3123a

**2. [Rule 1 - Bug di spec] Attese del risultato con la forma nuova**
- **Found during:** Task 1
- **Issue:** `combatant-plan.spec.ts` (sconfitta della dungeon, D-12) e `rescue-plan.spec.ts` asserivano `rewards` senza `pet`; `combatant-plan.spec.ts` costruiva un `RewardCatalog` senza `pets`.
- **Fix:** aggiunti `pet: null` e `pets: new Set()` (file fuori da `files_modified`).
- **Commit:** dfdbb9a, bd3123a

**3. [Rule 2] Caso in più**
- `starts the owned pets from an empty list when the sheet has none (D-21)` in outcome-plan.spec.ts, `loses the pet prize on a roll of 20% (D-21)`, `pins the pet win chance at 20% (D-21)` e `lists the pet prize ref for the catalog reads (D-21)` in quest-rewards.spec.ts.

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0.
- Unit `src/quests src/models test/fixtures`: 65 suite / 879 test verdi.
- Integration `src/quests/outcomes src/quests/results src/quests/generation`: 20 suite / 194 test verdi.
- `test/app.int-spec.ts` (real boot): 72 verdi; `git diff --exit-code src/schema.gql` 0; vs origin/develop tolte solo le due righe `  enemy: Enemy`.
- prettier --check ed eslint puliti sui 14 file toccati.
- Copertura: il tiro passa da `drawRewards`, quindi vale per risoluzione standard, boss e completamento del GM (`GmCompletionService` chiama `drawRewards` con `catalog.rewards` del loader); il soccorso scrive sempre `pet: null`. Le int-spec coprono standard (enemy) e boss.

## Known Stubs

Nessuno.

## Self-Check: PASSED
