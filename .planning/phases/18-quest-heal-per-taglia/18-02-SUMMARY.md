---
phase: 18-quest-heal-per-taglia
plan: 02
subsystem: models/quests-outcomes
tags: [heal, cure, quest-prizes, quest-result, sdl, tdd]
requires: ["18-01"]
provides:
  - "QuestCure, QuestCureSchema, QuestPrizes.cure (nullable, default null)"
  - "QuestCureInput, QuestPrizesInput.cure (fuori dallo SDL, D-24)"
  - "QuestResult.injuriesHealed: [InjuryType!]! (default vuota)"
  - "QuestResultDraft.injuriesHealed"
affects: [18-03, 18-07, 18-11]
tech-stack:
  added: []
  patterns: ["sotto-documento `_id: false` nullable con default null", "SDL additivo rigenerato col boot reale nello stesso commit"]
key-files:
  created:
    - src/models/quest/quest-prizes.schema.spec.ts
  modified:
    - src/models/quest/quest-prizes.model.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/results/quest-result.populate.spec.ts
    - test/quests/quest-result.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Le ferite guarite del foglio nascono da `cureInjuries(snapshot.status.injuries ?? [], healed ? Object.values(InjuryType) : [])`: la regola della Phase 9 D-15 resta invariata fino al 18-03"
  - "STATE.md registra `Plan: 2 of 11` (formato del brief), non `Plan: 02 of 11` del verify del piano"
metrics:
  duration: "~20 min"
  completed: 2026-11-10
  tasks: 3
  files: 14
---

# Phase 18 Plan 02: modello della cura e ferite guarite — Summary

`QuestPrizes.cure` è un sotto-documento `QuestCure` (`_id: false`, nullable, default null) con `lifePointsShare` obbligatoria in [0, 1] e `canHeal` validata dall'enum `InjuryType`; `QuestCureInput` esiste ma resta fuori dallo SDL; la aid clonata non eredita la cura; `QuestResult.injuriesHealed` (default vuota) è su modello, draft del piano d'esito, foglio di soccorso e di morte, fixture e SDL.

## Firme create

```typescript
// src/models/quest/quest-prizes.model.ts
@ObjectType() @Schema({ _id: false })
export class QuestCure {
    @Field(() => Float) @Prop({ type: Number, required: true, min: 0, max: 1 }) lifePointsShare: number;
    @Field(() => [InjuryType]) @Prop({ type: [String], enum: Object.values(InjuryType), default: [] }) canHeal: InjuryType[];
}
export const QuestCureSchema = SchemaFactory.createForClass(QuestCure);
// QuestPrizes.cure?: QuestCure | null  (dopo pet, prima di spellDraw)
@InputType() export class QuestCureInput { lifePointsShare: number /* Float */; canHeal: InjuryType[] }
// QuestPrizesInput.cure?: QuestCureInput | null

// src/models/quest-result/quest-result.model.ts — subito dopo injuriesAdded
injuriesHealed: InjuryType[];   // [InjuryType!]!, default []

// src/quests/outcomes/outcome-plan.ts — QuestResultDraft.injuriesHealed: InjuryType[] (dopo injuriesAdded)
// src/quests/outcomes/aid/aid-quest.ts — AidSourceQuest['prizes'].cure?: unknown; clonedPrizesOf invariata (sei chiavi)
```

## SDL aggiunto (solo righe nuove rispetto a `origin/develop`)

```graphql
type QuestCure {
  canHeal: [InjuryType!]!
  lifePointsShare: Float!
}
# in type QuestPrizes:  cure: QuestCure
# in type QuestResult:  injuriesHealed: [InjuryType!]!
```

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 RED | 6bc5f388 | test(models): pin the quest cure sub-document |
| 1 GREEN | 5664a2ae | feat(models): add the cure sub-document to the quest prizes |
| 2 RED | 1e77905b | test(outcomes): pin the healed injuries on the result sheet |
| 2 GREEN | a8302179 | feat(outcomes): record the healed injuries on the quest result |
| 3 | (questo commit) | docs(phase-18): record plan 02 progress |

## Fallimenti RED osservati

- Task 1 (unit): 8 falliti su 78 — `prizes.cure` `undefined` (campo non dichiarato, scartato dallo strict di Mongoose) per default null, cura salvata, `canHeal` vuota, tre quote fuori scala, quota mancante, ferita fuori enum. Il caso dei bordi 0 e 1 (D-02) era verde al primo colpo (nessun errore perché il campo era scartato: diventa significativo col GREEN). `tsc` rosso solo nella spec nuova (`Property 'cure' does not exist on type 'QuestPrizes'`).
- Task 1 (boot reale): 2 falliti su 80 — blocco `type QuestPrizes` diverso, `type QuestCure` assente.
- **Caso della aid (D-23):** compila e verde al primo colpo (la sorgente è una variabile, non un letterale: nessun controllo di proprietà in eccesso) — `clonedPrizesOf` copia già solo sei chiavi; il caso pinna il comportamento.
- Task 2 (unit): 7 falliti su 535 — default e rifiuto dell'enum sullo schema, `drafts the result sheet`, heal vinta, caso nuovo `lists no healed injury…`, due `toEqual` sul foglio di soccorso e di morte. Boot reale: 1 fallito (blocco `type QuestResult`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Costruttore di `QuestResultDraft` in una spec non elencata**
- **Found during:** Task 2 GREEN
- **Issue:** `tsc` rosso in `src/quests/results/quest-result.populate.spec.ts:14` (`draftWith` costruisce un `QuestResultDraft` senza `injuriesHealed`)
- **Fix:** `injuriesHealed: []` dopo `injuriesAdded: []` nell'helper della spec
- **Files modified:** src/quests/results/quest-result.populate.spec.ts
- **Commit:** a8302179

Nessun costruttore di produzione aggiuntivo: `src/travel` non toccato (`git diff HEAD~2 --stat -- src/travel` vuoto).

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni GREEN.
- Unit mirate verdi (78 e 535), boot reale verde (80/80), suite unit completa 250 suite / 3105 test verdi.
- Prettier pulito e eslint senza errori sui file toccati (un warning preesistente `no-base-to-string` in `test/app.int-spec.ts:926`, non toccato).
- `git diff origin/develop -- src/schema.gql` contiene solo righe aggiunte.

## Known Stubs

Nessuno: la regola di cura resta quella della Phase 9 fino al 18-03 per disegno del piano.

## Self-Check: PASSED
