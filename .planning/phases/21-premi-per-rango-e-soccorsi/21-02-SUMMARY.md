---
phase: 21-premi-per-rango-e-soccorsi
plan: 02
subsystem: models
tags: [models, quests, prizes, populate, pure-functions, tdd]
requires:
  - 21-01
provides:
  - QuestRankPrize / QuestRankPrizeSchema (solo Mongoose) in prizes.rankPrizes, default undefined
  - GROUP_PRIZE_TYPES, RankPrizeBlock, RankPrizesHolder, rankBlocksOf, prizeBlocksOf, prizeBlockFor in src/quests/prizes/rank-prizes.ts
  - quattro percorsi prizes.rankPrizes.* in QUEST_CATALOG_POPULATE e sanitizePrizeRefs per i campi di oggi e per ogni blocco
affects: [21-03, 21-04, 21-05, 21-07, 21-12]
tech-stack:
  added: []
  patterns:
    - blocco unico delle solitarie costruito campo per campo (mai lo spread di un sottodocumento idratato)
    - una sola regola di sanificazione dei ref premio applicata a campi di oggi e blocchi
key-files:
  created:
    - src/models/quest/quest-rank-prize.model.ts
    - src/models/quest/quest-cure.model.ts
    - src/quests/prizes/rank-prizes.ts
    - src/quests/prizes/rank-prizes.spec.ts
    - src/quests/quest-catalog.populate.int-spec.ts
  modified:
    - src/models/quest/quest-prizes.model.ts
    - src/models/quest/quest-prizes.schema.spec.ts
    - src/quests/quest-catalog.populate.ts
    - src/quests/quest-catalog.populate.spec.ts
decisions:
  - "QuestCure e QuestCureSchema spostati in src/models/quest/quest-cure.model.ts: il blocco usa la cura e quest-prizes.model importa il blocco, l'import circolare avrebbe lasciato QuestCureSchema undefined al decoratore (sortSchema attivo, SDL invariato)"
  - "rankPrizes con default undefined: le quest senza blocchi non ricevono la chiave (D-28)"
  - "prizeBlockFor con un titolo fuori da TITLE_RANK ripiega sul blocco più basso; dropOrphanCatalogRefs salta le voci non oggetto di rankPrizes"
metrics:
  duration: ~25 min
  completed: 2026-11-13
  tasks: 3
  files: 9
---

# Phase 21 Plan 02: Blocchi premio per titolo (schema, lettura e scelta) Summary

Blocchi `prizes.rankPrizes` a DB (solo Mongoose, titolo validato con `TitleType`, `refPath` assoluti `prizes.rankPrizes.prizeItem.itemType` / `prizes.rankPrizes.randomLoot.itemType`), modulo puro `src/quests/prizes/rank-prizes.ts` con l'unica lettura dei blocchi (`rankBlocksOf`), il blocco unico sul `minTitle` per solitarie e boss legacy (`prizeBlocksOf`) e l'unica regola di scelta per titolo (`prizeBlockFor`, D-04 e D-18), più populate e sanificazione dei ref di ogni blocco nel catalogo delle quest. Nessun comportamento di risoluzione cambia ancora; SDL invariato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 4e6f8015 | test(models): pin the rank prize blocks and their selection |
| 1 GREEN | 1958f072 | feat(models): add the rank prize blocks and their selection |
| 2 RED | 0fbc5967 | test(quests): pin the populate of the rank prize blocks |
| 2 GREEN | f895f6a0 | feat(quests): populate and sanitize the rank prize blocks |
| 3 | (questo commit) | docs(phase-21): record plan 02 progress |

## Firme nuove

```typescript
// src/quests/prizes/rank-prizes.ts
export const GROUP_PRIZE_TYPES: ReadonlySet<QuestType>; // boss, worldMission, aid
export interface RankPrizeBlock extends PrizesSnapshot { title: TitleType }
export interface RankPrizesHolder {
    infos?: { type?: QuestType | null } | null;
    requirements?: { minTitle?: TitleType | null } | null;
    prizes?: (PrizesSnapshot & { rankPrizes?: readonly unknown[] | null }) | null;
}
export function rankBlocksOf(quest: RankPrizesHolder): RankPrizeBlock[];
export function prizeBlocksOf(quest: RankPrizesHolder): RankPrizeBlock[];
export function prizeBlockFor(quest: RankPrizesHolder, title: TitleType | null | undefined): RankPrizeBlock | null;

// src/quests/quest-catalog.populate.ts
export interface PrizeRefsHolder { prizeItem?; randomLoot?; pet?; cure? }
// CatalogRefsHolder.prizes: (PrizeRefsHolder & { rankPrizes?: PrizeRefsHolder[] | null }) | null
// sanitizePrizeRefs(prizes) è privata al modulo
```

## RED (fallimenti attesi)

- `quest-prizes.schema.spec.ts`: 2 rossi — `stores rank prize blocks with the title enum (D-01, D-05)` (campo assente, `rankPrizes` undefined) e `points the block items at absolute ref paths (D-05)` (path inesistente). **Verde al primo colpo:** `leaves quests without blocks untouched (D-28)`, perché pinna l'assenza della chiave, vera già prima; resta come guardia del `default: undefined`.
- `rank-prizes.spec.ts`: suite rossa per modulo assente (`Cannot find module './rank-prizes'`).
- `quest-catalog.populate.spec.ts`: 3 rossi — il `toEqual` esistente sull'intera lista dei percorsi (esteso coi quattro nuovi), `populates the refs of every rank prize block (D-05)` e `drops orphan refs inside every block like the plain fields (D-05)`.
- `quest-catalog.populate.int-spec.ts`: 2 rossi — i quattro ref del blocco restavano id nudi; il pet cancellato non veniva annullato.

## Harness dell'int-spec del populate

`createAuthTestApp` (`test/auth/auth-test-app.ts`) con `MongooseModule.forFeature` di Quest, LootItem, EquipmentItem, Pet, Spell, Enemy, Lore e PointOfInterest (tutti i modelli che `QUEST_CATALOG_POPULATE` tocca), `clearDatabase` in `afterEach`, `close` in `afterAll`; nomi distinti (`Rank Block Potion`, `Rank Block Owl`, `Rank Block Spark`). Query vera `findOne().populate(QUEST_CATALOG_POPULATE).lean()`.

## Verifiche

- `npx jest src/models/quest src/quests/prizes --selectProjects unit`: 7 suite / 69 test verdi.
- `npx jest src/quests/quest-catalog.populate.spec.ts --selectProjects unit`: 13 test verdi.
- `npx jest src/quests/quest-catalog.populate.int-spec.ts src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 25 test verdi.
- Non regressione extra: `npx jest src/models src/quests --selectProjects unit` 91 suite / 1331 test; `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` 91 test verdi e `src/schema.gql` invariato dopo lo spostamento di `QuestCure`.
- `npx tsc --noEmit -p tsconfig.json` 0; `git diff --exit-code src/schema.gql` vuoto; prettier ed eslint puliti sui file toccati.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import circolare fra `quest-prizes.model.ts` e `quest-rank-prize.model.ts`**
- **Found during:** Task 1 (GREEN)
- **Issue:** il blocco usa `QuestCureSchema` (definito in `quest-prizes.model.ts`) e `quest-prizes.model.ts` importa `QuestRankPrizeSchema`: col ciclo uno dei due schemi sarebbe `undefined` al momento del decoratore.
- **Fix:** `QuestCure` / `QuestCureSchema` spostati senza modifiche in `src/models/quest/quest-cure.model.ts`; nessun altro file del codice li importava (solo stringhe SDL nelle spec). `sortSchema: true` rende lo SDL indipendente dall'ordine dei file: `test/app.int-spec.ts` verde e `src/schema.gql` invariato.
- **Files modified:** `src/models/quest/quest-cure.model.ts`, `src/models/quest/quest-prizes.model.ts`, `src/models/quest/quest-rank-prize.model.ts`
- **Commit:** 1958f072

**2. [Rule 2 - Robustezza] Voci non oggetto in `rankPrizes` nella sanificazione**
- **Found during:** Task 2 (GREEN)
- **Issue:** una voce `null` scritta a mano nell'array avrebbe fatto lanciare `sanitizePrizeRefs` e annullato la lista `quests` (T-21-05).
- **Fix:** `dropOrphanCatalogRefs` filtra le voci non oggetto prima di sanificare (la lettura dei blocchi le scarta già); provato da `tolerates missing sections` con `rankPrizes: null`.
- **Commit:** f895f6a0

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/models/quest/quest-rank-prize.model.ts`, `src/models/quest/quest-cure.model.ts`, `src/quests/prizes/rank-prizes.ts`, `src/quests/prizes/rank-prizes.spec.ts`, `src/quests/quest-catalog.populate.int-spec.ts`.
- Commit presenti: 4e6f8015, 1958f072, 0fbc5967, f895f6a0.
