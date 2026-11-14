---
phase: 22-completamento-guidato-missioni
plan: 06
subsystem: quests
tags: [refactor, gm-completion, rewards, transactions]
requires: ["22-05"]
provides:
  - "GmRequestReader (provider ed export di QuestOutcomesModule): read(pendingQuestHex) → GmRequest, lostCompletionError(request) → Error"
  - "assertNoBusyParticipant(characters) esportata da gm-request.reader.ts; interfacce GmSeat e GmRequest esportate"
  - "GmCompletionService.completeWith(plan: GmCommitPlan) → QuestResultDraft[]: transazione, errore del perdente, deliver"
  - "ResolutionLoader.readRewardCatalogFor(refs: RewardRefs, spellPoolSource: PrizesSnapshot | null | undefined) → RewardCatalog"
  - "validRewardItems(prizes: PrizesSnapshot) → RewardItem[] esportata da quest-rewards.ts"
affects: [22-07, 22-12, 22-15]
tech-stack:
  added: []
  patterns: ["ciclo transazionale parametrico con piano di commit (outcomesOf + afterSeats opzionale)"]
key-files:
  created:
    - src/quests/outcomes/gm-request.reader.ts
  modified:
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
decisions:
  - "Un posto senza esito nella mappa di outcomesOf lancia OUTCOME_OVERRIDE_INVALID dentro la transazione (nessuna scrittura parziale), non StaleResolution"
  - "Il vecchio completamento tira i premi dentro outcomesOf nell'ordine dei posti: planParticipant e il writer non usano la ChanceSource, quindi la sequenza dei tiri è identica a prima"
  - "GmCompletionService non inietta più i modelli Character e PendingQuest (tsc 0): le letture stanno tutte nel reader"
metrics:
  duration: "~20 min"
  completed: 2026-11-14
---

# Phase 22 Plan 06: lettore della richiesta, commit parametrico, catalogo dei premi Summary

Il completamento dell'oste ora passa da `GmRequestReader` (l'unica lettura di una richiesta del GM) e da `GmCompletionService.completeWith(plan)`, un ciclo transazionale che riceve dal piano l'esito di ogni posto e un gancio `afterSeats` per scrivere nella stessa transazione; `readRewardCatalogFor` e `validRewardItems` rendono leggibili catalogo e voci valide per ref arbitrari. Nessun comportamento nuovo: le guardie del completamento sono verdi senza modifiche.

## Contratto finale

```typescript
// src/quests/outcomes/gm-request.reader.ts
export interface GmSeat { character: ResolutionCharacter; pendingQuestId: Types.ObjectId; ownerId: Types.ObjectId; resultId: Types.ObjectId }
export interface GmRequest { quest: ResolutionQuest; lane: GmLane; seats: GmSeat[] }
export function assertNoBusyParticipant(characters: readonly { quests?: { pendingQuest?: unknown } | null }[]): void;
@Injectable() export class GmRequestReader {
    read(pendingQuestHex: string): Promise<GmRequest>;
    lostCompletionError(request: GmRequest): Promise<Error>;
}
// src/quests/outcomes/gm-completion.service.ts
export interface GmSeatOutcome { battle: ParticipantEffects | null; enemies: EnemyFacts | null; victory: VictoryKnowledge | null; rewards: DrawnRewards }
export interface GmCommitPlan {
    request: GmRequest;
    recoveryTimes: ReadonlyMap<string, number>;
    petMaxXp: ReadonlyMap<string, number>;
    now: Date;
    outcomesOf(snapshots: readonly ResolutionCharacter[]): ReadonlyMap<string, GmSeatOutcome>; // chiave = hex dell'_id del personaggio
    afterSeats?(session: ClientSession): Promise<void>;
}
completeWith(plan: GmCommitPlan): Promise<QuestResultDraft[]>;
```

Ordine dentro la transazione: snapshot in sessione per posto → `assertNoBusyParticipant(snapshots)` → `plan.outcomesOf(snapshots)` → per posto `planParticipant` (`gmCompleted`, `aid: null`) + `writeParticipant` + `deletePendingQuest` → `updateQuest(questUpdateOf(...), 'bestEffort')` → `plan.afterSeats?.(session)`. `StaleResolution` → `lostCompletionError`; `deliver` dopo il commit.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 | `GmRequestReader` e ciclo di commit parametrico | `50112b4c` refactor(gm): share the request reader and the commit loop |
| 2 RED | casi di `validRewardItems` e `readRewardCatalogFor` | `8923515a` test(rewards): pin the reward catalogue of arbitrary refs |
| 2 GREEN | funzioni rese pubbliche | `27ed1ea8` refactor(rewards): read the reward catalogue of any refs |

RED atteso e visto: `TypeError: loader.readRewardCatalogFor is not a function` e `(0 , quest_rewards_1.validRewardItems) is not a function`.

## Guardie eseguite

- Task 1: unit `src/quests/outcomes` 816/816; integration `gm-completion.service.int-spec.ts` + `complete-pending-request.resolver.int-spec.ts` + `quest-pet-prize.int-spec.ts` 43/43, spec non modificate; `tsc` 0; `schema.gql` invariato.
- Task 2: unit `src/quests/outcomes` 818/818; integration `gm-completion.service.int-spec.ts` + `quest-resolution.service.int-spec.ts` 50/50; `tsc` 0.
- Nessun caso verde al primo colpo (i due casi nuovi sono partiti RED).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: src/quests/outcomes/gm-request.reader.ts
- FOUND: 50112b4c, 8923515a, 27ed1ea8
