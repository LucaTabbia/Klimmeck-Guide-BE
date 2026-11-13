---
phase: 21-premi-per-rango-e-soccorsi
plan: 03
subsystem: quests
tags: [quests, rewards, prizes, resolution, tdd]
requires:
  - 21-02
provides:
  - RewardRefs { items; spellIds; petIds } e rewardRefsOf(blocks) sull'unione deduplicata dei blocchi
  - readRewardCatalog(quest) sui blocchi di prizeBlocksOf; readFixedSpells(spellIds); readPrizePets(petIds)
  - DrawnRewards.cure (copiata dal blocco tirato, nessun tiro; NO_REWARDS.cure = null)
  - planCombatant e GmCompletionService.commit tirano da prizeBlockFor(quest, snapshot.status.title)
affects: [21-04, 21-07, 21-10, 21-12]
tech-stack:
  added: []
  patterns:
    - la cura viaggia col blocco tirato dentro DrawnRewards, mai riletta dalla quest
    - catalogo dei premi letto una volta sull'unione dei ref di tutti i blocchi
key-files:
  created: []
  modified:
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
decisions:
  - "ResolutionQuest.prizes allargato a RankPrizesHolder['prizes'] (campi di oggi più rankPrizes opzionale): tipo strutturale, nessun cast; la proiezione prizes: 1 legge già i blocchi"
  - "Magie fisse e pet in premio letti con un solo find ciascuno sugli id dell'unione; nessuna query se l'elenco è vuoto (come prima con findById condizionato)"
  - "Un blocco non ha spellDraw (schema del piano 02): il sorteggio della magia resta solo sulle solitarie, readSpellPool(quest.prizes) invariato"
metrics:
  duration: ~40 min
  completed: 2026-11-13
  tasks: 3
  files: 12
---

# Phase 21 Plan 03: Ognuno vince il blocco del proprio titolo Summary

Le due sole porte che tirano un premio (`planCombatant` per individuali, boss e soccorsi; `GmCompletionService.commit` per story e worldMission) passano a `drawRewards` il blocco `prizeBlockFor(quest, snapshot.status.title)`: decide il titolo del personaggio letto in sessione (D-04, D-18). Il catalogo dei premi conosce rarità, magie fisse e pet di tutti i blocchi (Pitfall 9); la cura viaggia col blocco tirato in `DrawnRewards.cure` e `planParticipant` la legge da lì. Nessun tiro nuovo: il blocco cambia cosa si tira, non quante volte. `QuestResult.rewards` invariato (D-08), SDL invariato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 8358d5d8 | test(rewards): pin the reward catalog of the rank blocks |
| 1 GREEN | 2338166b | feat(rewards): read the reward catalog of every rank block |
| 2 RED | b40fc3ef | test(quests): pin the rank block of each participant |
| 2 GREEN | 99842fff | feat(quests): draw each participant prize from the title block |
| 3 | (questo commit) | docs(phase-21): record plan 03 progress |

## Firme

```typescript
// src/quests/outcomes/rewards/quest-rewards.ts
export interface RewardRefs {
    items: { itemType: ItemReferenceType; item: Types.ObjectId }[]; // dedup per priceKey
    spellIds: Types.ObjectId[]; // dedup per esadecimale, ordine di prima apparizione
    petIds: Types.ObjectId[];
}
export function rewardRefsOf(blocks: readonly (PrizesSnapshot | null | undefined)[]): RewardRefs;
export interface DrawnRewards { /* ...campi di prima */ cure: unknown }
// drawRewards(...) restituisce cure: prizes.cure ?? null; NO_REWARDS.cure = null

// src/quests/outcomes/resolution-loader.service.ts (privati)
readRewardCatalog(quest: ResolutionQuest): Promise<RewardCatalog>; // rewardRefsOf(prizeBlocksOf(quest))
readFixedSpells(spellIds: readonly Types.ObjectId[]): Promise<RewardCatalog['spells']>;
readPrizePets(petIds: readonly Types.ObjectId[]): Promise<Pick<RewardCatalog, 'pets' | 'petLore'>>;
// ResolutionQuest.prizes?: RankPrizesHolder['prizes']
```

## Fallimenti RED attesi

- Task 1: i 5 casi di `rewardRefsOf` falliscono per la forma (`spellIds`/`petIds` assenti, argomento elenco); i 2 casi del loader per la lettura del solo `quest.prizes` (mappa dei pet vuota, magie fisse assenti).
- Task 2 (unit): `drawRewards` senza `cure` (i due confronti dell'oggetto intero e il caso D-05); 12 casi della cura di `outcome-plan.spec.ts` (la cura ora arriva in `rewards.cure`, la quest non la porta); `combatant-plan` boss misto: xp 300 invece di 120.
- Task 2 (integration): boss misto (xp 150 dei campi di oggi invece di 500), legend su posti hero (150 invece di 350), worldMission a mano (50 invece di 300), cura per blocco (il mage guariva al 100 % coi campi di oggi, 1000 punti vita, invece del 50 % del blocco, 500).

Verdi al primo colpo, perché descrivono il comportamento di oggi (non regressione voluta dal piano): `draws the minimum title prize of a solo quest for any title (D-01)` (unit), `gives the minimum title prize of a solo quest to any winner (D-01)` (integration) e `reads a legacy boss without blocks as its minimum title prize (D-28)`: oggi tutti leggono `quest.prizes`, e dopo il GREEN il blocco unico di `prizeBlocksOf` dà lo stesso premio.

## Casi esistenti della cura aggiornati (Phase 18, `outcome-plan.spec.ts`)

Nel `describe('the cure of a won quest')` la cura passa da `questOf(type, null, cure)` a `rewards: curing(cure)` (helper locale `curing(cure, overrides)` = `rewardsWith({ ...overrides, cure })`):
raises the life points to the share of the maximum...; never lowers life points already above the floor; cures only the injuries with a share of 0; computes the floor on the maximum after the level up (xpPrize 300 fuso in `curing`); cures a won job/story/study that carries a cure; cures a game master completion like a success; cures nothing on a defeat (la cura nel premio non vale se si perde); cures after the fight and after the progression (xpPrize 300 fuso); keeps on the sheet a wound taken and healed in the same outcome; reads a share outside the scale as 0; ignores a malformed cure; keeps the write filter unchanged when curing; never writes the potion recovery from an outcome.

## Ordine dei tiri nel boss misto

`gives each seat the block of its own title in a mixed boss (D-04, D-05, D-05a)`: posti `[mage, paladin]`, blocco mage con pet a catalogo e nessun loot, blocco paladin senza pet. Un vincitore alla volta nell'ordine dei posti: loot del suo blocco (nessun tiro qui), poi il pet solo se il suo blocco ne ha uno a catalogo. `SequenceChance([0.1, 0.1])`: il mage consuma il primo tiro e vince il pet, il paladin nessuno; `chance.drawn` = `[0.1]`.

## Deviazioni dal piano

### Tipi allargati

**1. [Rule 3 - Blocking] `ResolutionQuest.prizes` allargato a `RankPrizesHolder['prizes']`**
- **Trovato durante:** Task 2
- **Problema:** le spec tipizzate di `combatant-plan` scrivono `rankPrizes` sulla quest (excess property); il tipo strutturale non lo prevedeva
- **Fix:** tipo dei premi di `ResolutionQuest` = campi di oggi più `rankPrizes` opzionale, senza cast
- **File:** `src/quests/outcomes/resolution-loader.service.ts` (nel `files_modified` del piano, non nell'elenco del task 2)
- **Commit:** 99842fff

Nessuna spec fuori dai file del piano è caduta. Altro: nessuno.

## Verifiche

- Unit `npx jest src/quests/outcomes --selectProjects unit`: 35 suite / 677 test verdi
- Integration del piano (boss, GM, risoluzione individuale, pet, guard): 5 suite / 84 test verdi
- Non regressione extra (aid-rescue, aid-timeout, quest-combat, quest-dungeon, processor, sweeper, study-lore, study-spell, complete-pending-request resolver, ambush, quest-result resolver): 11 suite / 152 test verdi
- `npx tsc --noEmit -p tsconfig.json` = 0; `git diff --exit-code src/schema.gql` vuoto
- Grep di accettazione: `prizeBlocksOf(` = 1 nel loader; `spellIds|petIds` = 4 in quest-rewards.ts; `prizeBlockFor(` = 1 in combatant-plan.ts e in gm-completion.service.ts; nessun `drawRewards(quest.prizes`; `quest.prizes?.cure` = 0 in outcome-plan.ts

## Known Stubs

Nessuno.

## Self-Check: PASSED
