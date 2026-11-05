---
phase: 13-generazione-quest
plan: 11
subsystem: quests (generazione, premi e testi puri)
tags: [quests, generation, prizes, loot, templates, BE-QGEN-06, BE-QGEN-07, BE-QGEN-10, D-19, D-20, D-21, D-22, D-27, D-31]
requires: ["13-10"]
provides:
  - "`prizesOf(input): GeneratedPrizes` in src/quests/generation/generated-prizes.ts: monete e XP × moltiplicatore, pool di `randomLoot` per tipo e rango (D-20), pet all'1% sui soli boss (D-21)"
  - "`recommendedLootOf(input)` in src/quests/generation/recommended-loot.ts: fino a 2 armi contro le debolezze dei nemici + la miglior cura entro la rarità della fascia (D-27)"
  - "`titleOf`, `announcementOf`, `enemyListOf`, `relatedLoreOf`, `TIME_TO_COMPLETE_MS` in src/quests/generation/quest-templates.ts (D-22)"
affects: [13-13]
tech-stack:
  added: []
  patterns:
    - "Funzioni pure deterministiche dato il `ChanceSource`: candidati ordinati per (itemType, id), ordine dei tiri fisso, prove su 100 semi di `SeededChanceSource`"
key-files:
  created:
    - src/quests/generation/generated-prizes.ts
    - src/quests/generation/generated-prizes.spec.ts
    - src/quests/generation/recommended-loot.ts
    - src/quests/generation/recommended-loot.spec.ts
    - src/quests/generation/quest-templates.ts
    - src/quests/generation/quest-templates.spec.ts
  modified: []
decisions:
  - "Una rarità del catalogo `null` o sconosciuta non entra in nessun pool né fra i consigliati (fail-closed; la cascata della Phase 9 la tratta come common, il generatore no)"
  - "Il tiro del conteggio di uno slot (`min < max`) si consuma anche se il catalogo non ha candidati; ogni estrazione consuma un tiro anche con un solo candidato"
  - "Il cibo (`effect: hunger`) è escluso da qualunque voce del catalogo da `rare` in su, non solo dai LootItem"
  - "I pet candidati vengono riordinati per id prima dell'estrazione; il tiro dell'indice si consuma solo se il tiro del pet è vinto e il catalogo pet non è vuoto"
  - "`RARITY_RANK` (common 0 … legendary 4) esportato da generated-prizes.ts e riusato dai consigliati"
metrics:
  duration: "~20 min"
  completed: 2026-11-04
  tasks: 3
  files: 6
---

# Phase 13 Plan 11: premi, oggetti consigliati e testi delle quest generate Summary

Le quest generate hanno ora premi dalla tabella dell'utente (150/600 rame e 40/120 XP × 1/2/5/12/25, legend come hero), pool ampi di `randomLoot` per tipo e rango con legendary solo nei boss hero e nelle enemy legend e senza cibo da `rare` in su, il pet all'1% sui soli boss, gli oggetti consigliati contro le debolezze dei nemici e titoli/annunci/lore/tempi da template; tutto in moduli puri con RNG iniettato.

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | 85f64eb | `test(generation): pin the generated prizes and loot pools` |
| 1 GREEN | c8e7c63 | `feat(generation): draw the prizes of generated quests` |
| 2 RED | 8019ef0 | `test(generation): pin the recommended loot recipe` |
| 2 GREEN | c9e0b0a | `feat(generation): recommend gear against the enemy weaknesses` |
| 3 RED | afbe4cd | `test(generation): pin the quest title and announcement templates` |
| 3 GREEN | b2f8ccf | `feat(generation): write titles and announcements from templates` |

## RED osservati

- Task 1: suite fallita al caricamento, `Could not locate module src/quests/generation/generated-prizes`, 0 test eseguiti.
- Task 2: suite fallita al caricamento, `Could not locate module src/quests/generation/recommended-loot`, 0 test eseguiti.
- Task 3: suite fallita al caricamento, `Could not locate module src/quests/generation/quest-templates`, 0 test eseguiti.

## Nomi e firme

- src/quests/generation/generated-prizes.ts: `export type GeneratedQuestType = QuestType.enemy | QuestType.boss`; `export interface PrizeCatalogItem { itemType: ItemReferenceType; id: string; rarity: string | null; effect?: string | null; power?: number | null; equipType?: string | null; damages?: unknown }`; `export interface PetCandidate { id: string }`; `export interface GeneratedAssetRef { itemType: ItemReferenceType; item: string; quantity: 1 }`; `export interface GeneratedPrizes { prizeCoins: CoinPurse; xpPrize: number; randomLoot: GeneratedAssetRef[]; pet: string | null }`; `export interface PrizesInput { type; rank: GeneratedRank; catalog: readonly PrizeCatalogItem[]; pets: readonly PetCandidate[]; chance: ChanceSource }`; `export interface LootSlot { rarity: RarityType; min: number; max: number }`; `GENERATED_PRIZES` (enemy 150/40, boss 600/120), `TIER_MULTIPLIER` (1/2/5/12/25/25), `LOOT_POOLS` (Record tipo → rango → slot, tabella D-20), `BOSS_PET_PRIZE_CHANCE = 0.01`, `RARITY_RANK`; `export function prizesOf(input: PrizesInput): GeneratedPrizes`.
- Ordine dei tiri di `prizesOf`: per ogni slot nell'ordine della tabella, un tiro del conteggio solo se `min < max` (`min + floor(next × (max − min + 1))`), poi un tiro per estrazione senza ripetizioni (`min(len − 1, floor(next × len))`) dai candidati della rarità ordinati per (itemType, id); poi, solo boss, `next() < 0.01` e, se vinto con pet a catalogo, un tiro per l'indice sui pet ordinati per id.
- src/quests/generation/recommended-loot.ts: `RECOMMENDED_LOOT_RARITY` (rookie common, adventurer uncommon, paladin rare, mage ultrarare, hero legendary, legend legendary); `RECOMMENDED_WEAPONS = 2`; `export interface RecommendedLootInput { rank: GeneratedRank; enemies: readonly EnemyCandidate[]; catalog: readonly PrizeCatalogItem[] }`; `export function recommendedLootOf(input: RecommendedLootInput): GeneratedAssetRef[]` (armi `EquipmentItem` con `equipType: weapon` e potenza utile > 0 sull'unione di `baseWeaknesses`/`energyWeaknesses`, ordine potenza desc poi id, poi la cura `LootItem` `effect: heal` con `power` maggiore, pari → id minore; nessun tiro).
- src/quests/generation/quest-templates.ts: `export interface TitledEnemy { name: string; quantity: number }`; `ENEMY_ANNOUNCEMENTS`, `BOSS_ANNOUNCEMENTS` (3 varianti ciascuno, segnaposti `{città}` e `{nemici}`); `TIME_TO_COMPLETE_MS` (enemy 3 600 000, boss 10 800 000); `enemyListOf(entries)`; `titleOf(type, entries, cityName)`; `announcementOf(type, entries, cityName, chance)` (un tiro, `min(2, floor(next × 3))`; per il boss `{nemici}` = nome senza quantità); `relatedLoreOf(cityLore: string | null, enemies: readonly { relatedLore: readonly string[] }[]): string[]` (città prima, poi nemici, senza doppioni).

## Verifiche

- `npx jest src/quests/generation --selectProjects unit`: 7 suite, 51 test verdi (9 + 4 + 6 nuovi).
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier ed eslint puliti sui sei file, uno per uno.
- Acceptance: `BOSS_PET_PRIZE_CHANCE = 0.01` 1; `D-20)` 6, `D-21)` 1, `D-31)` 1 nella spec dei premi; `export function recommendedLootOf` 1 e `D-27)` 4; i due titoli attesi 1 ciascuno, `10_800_000` 1, `D-22)` 6; `Math.random` 0 in src/quests/generation.
- Schema invariato: `git diff origin/develop -- src/schema.gql` toglie solo le due righe `  enemy: Enemy`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] La spec RED dei premi passava i ranghi come stringhe**
- **Found during:** Task 1 (GREEN, tsc)
- **Issue:** `GeneratedRank` è un sottoinsieme di `TitleType` (enum): `'paladin'` non è assegnabile, tsc falliva (ts-jest non lo vede); il parametro `chance` dell'helper era inferito come `SequenceChance` e rifiutava `SeededChanceSource`.
- **Fix:** ranghi come `TitleType.x`, parametro tipizzato `ChanceSource`; corretto nello stesso commit GREEN (la spec RED resta com'era nella storia).
- **Files modified:** src/quests/generation/generated-prizes.spec.ts
- **Commit:** c8e7c63

## Known Stubs

Nessuno.

## Self-Check: PASSED

- I sei file creati esistono; i commit 85f64eb, c8e7c63, 8019ef0, c9e0b0a, afbe4cd, b2f8ccf sono nella storia del branch.
