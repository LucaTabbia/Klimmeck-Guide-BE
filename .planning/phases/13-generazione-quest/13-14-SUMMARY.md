---
phase: 13-generazione-quest
plan: 14
subsystem: quests (generazione: trigger, sweep, mutation dell'oste)
tags: [quests, generation, sweeper, graphql, authz, audit, BE-QGEN-02, BE-QGEN-08, D-16, D-17, D-30]
requires: ["13-13"]
provides:
  - "`QuestGenerationSweeper` (corsa al boot + sweep `unref`, stop che attende `whenIdle()`) in src/quests/generation/quest-generation.sweeper.ts"
  - "`regeneratesAfter(quest, update)` in src/quests/outcomes/quest-outcome-plan.ts; `CommittedOutcome.regenerate?: boolean`; `OutcomeWriter.deliver` chiede `trigger.request()`"
  - "mutation `generateQuests: GenerateQuestsResult!` (`QuestGenerationResolver`, innkeeper, auditata) e `type GenerateQuestsResult { created: Int! }`"
  - "`QuestGenerationModule` importato solo da AppModule (D-30)"
  - "`IDLE_GENERATION_SWEEPER`, `QUIET_GENERATION_OVERRIDES` in test/quests/generation-world.ts"
affects: [13-15, 13-18, 13-19, 13-20]
tech-stack:
  added: []
  patterns:
    - "Hook best-effort dopo il commit: flag calcolato nella transazione (`regenerate`), richiesta fire-and-forget in try/catch in `deliver`, recupero affidato allo sweep"
key-files:
  created:
    - src/quests/generation/quest-generation.sweeper.ts
    - src/quests/generation/quest-generation.sweeper.spec.ts
    - src/quests/generation/quest-generation-trigger.int-spec.ts
    - src/models/quest/generate-quests-result.model.ts
    - src/quests/generation/quest-generation.resolver.ts
    - src/quests/generation/quest-generation.resolver.int-spec.ts
    - src/quests/generation/quest-generation.module.ts
  modified:
    - src/quests/outcomes/quest-outcome-plan.ts
    - src/quests/outcomes/quest-outcome-plan.spec.ts
    - src/quests/outcomes/outcome-writer.service.ts
    - src/quests/outcomes/outcome-writer.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/boss-resolution.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/app.module.ts
    - src/schema.gql
    - test/quests/generation-world.ts
    - test/app.int-spec.ts
decisions:
  - "`OutcomeWriter` riceve `trigger: QuestGenerationTrigger` come ULTIMO argomento del costruttore (dopo `clock`)"
  - "`emptyCommitted()` restituisce anche `regenerate: false`; i `committed` costruiti a mano (soccorso, GM) restano senza il campo (opzionale = nessuna richiesta)"
  - "Il sweeper non ha un proprio `inFlight`: `onModuleDestroy` attende `generator.whenIdle()`; dopo `stopping` i tick del timer non chiedono corse"
  - "La int-spec del resolver importa anche `AuthzModule` (l'interceptor di audit globale non è nell'harness base), come `createCharactersTestApp`"
metrics:
  duration: "~40 min"
  completed: 2026-11-04
  tasks: 3
  files: 19
---

# Phase 13 Plan 14: trigger del generatore Summary

I tre trigger di D-17 sono attivi: `QuestGenerationSweeper` chiede una corsa al boot (non attesa) e a ogni intervallo con timer `unref` (0 = solo la corsa al boot), e allo stop ferma il timer e attende la corsa in volo; `OutcomeWriter.deliver` chiede una corsa dopo il commit di un esito che conclude una quest `generated: true` (enemy vinta, boss vinto dal party); la mutation `generateQuests` (solo oste, auditata con target `QuestGeneration`) esegue una corsa normale e risponde `{ created }`. Tutto passa dallo stesso single-flight del `QuestGenerator`; `QuestOutcomesModule` importa solo il modulo leggero (D-30).

## Firme esatte

```typescript
// src/quests/generation/quest-generation.sweeper.ts
@Injectable() export class QuestGenerationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
    constructor(@Inject(QUEST_GENERATION_CONFIG) config: QuestGenerationConfig, generator: QuestGenerator);
    onApplicationBootstrap(): void;      // setInterval(...).unref() se sweepIntervalMs > 0, poi generator.request()
    onModuleDestroy(): Promise<void>;    // stopping, clearInterval, await generator.whenIdle()
}
// src/quests/outcomes/quest-outcome-plan.ts
export function regeneratesAfter(quest: { generated?: unknown }, update: Record<string, unknown> | null): boolean;
// src/quests/outcomes/outcome-writer.service.ts
export interface CommittedOutcome { results; aids; spellRecoveries; regenerate?: boolean }
// costruttore: (..., timeoutMs, clock, trigger: QuestGenerationTrigger)
// WARN: `Generatore: richiesta di corsa dopo l'esito non inviata (${describeError(error)})`
// src/quests/outcomes/resolution-loader.service.ts: RESOLUTION_QUEST_PROJECTION + generated: 1; ResolutionQuest.generated?: unknown
// src/models/quest/generate-quests-result.model.ts
@ObjectType() export class GenerateQuestsResult { @Field(() => Int) created: number }
// src/quests/generation/quest-generation.resolver.ts
@Resolver() export class QuestGenerationResolver { generateQuests(): Promise<GenerateQuestsResult> } // @Roles(innkeeper), @AuditTarget('QuestGeneration', () => null)
// src/quests/generation/quest-generation.module.ts
@Module({ imports: [QuestGenerationTriggerModule], providers: [QuestGenerationSweeper, QuestGenerationResolver] })
// test/quests/generation-world.ts
export const IDLE_GENERATION_SWEEPER = { onApplicationBootstrap: () => undefined, onModuleDestroy: () => undefined };
export const QUIET_GENERATION_OVERRIDES: ProviderOverride[]; // sweeper idle + QUEST_GENERATION_CONFIG = QUIET_GENERATION_CONFIG
```

SDL (real boot): `type GenerateQuestsResult {\n  created: Int!\n}` e `generateQuests: GenerateQuestsResult!` in `type Mutation`; `'QuestGenerationResolver.generateQuests'` in `EXPECTED_INNKEEPER_HANDLERS` fra `PushResolver.sendTestPush` e `ShopAdminResolver.shopPoolReport`.

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 RED | e2cde1c | test(generation): pin the generation sweep and boot run |
| 1 GREEN | decd164 | feat(generation): run the generator at boot and on a sweep |
| 2 RED | 53b5879 | test(generation): pin the regeneration after a generated quest ends |
| 2 GREEN | 0aae028 | feat(generation): request a run when a generated quest ends |
| 3 RED | 767cefe | test(generation): pin the generateQuests mutation |
| 3 GREEN | 9699335 | feat(generation): let the innkeeper run the generator |

## Fallimenti RED osservati

- Task 1: la spec dello sweeper non carica (`Cannot find module './quest-generation.sweeper'`).
- Task 2: unit 6 rossi su 39 (`regeneratesAfter` non esiste ⇒ «is not a function», `trigger.request` mai chiamato, `emptyCommitted()` senza `regenerate: false`); int-spec 2 rossi su 3 (`Expected number of calls: 1, Received: 0` per enemy e boss generati). Il caso `does not request a run for a fixed quest or a defeat (D-17)` è verde al primo colpo: prova un'assenza, che prima del codice è vera per costruzione; resta come guardia contro richieste spurie.
- Task 3: la int-spec del resolver non carica (modulo mancante); app.int-spec 2 rossi su 72 (lista degli handler innkeeper e test dello SDL della mutation).

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 a fine di ogni task.
- Unit: sweeper 4/4; outcome-writer + quest-outcome-plan 39/39; `src/quests src/models test/fixtures` 65 suite / 868 test.
- Integration: trigger int-spec 3/3 + `src/quests/outcomes` → 11 suite / 116 test; resolver int-spec 4 + app.int-spec 72 → 76/76; regressione `src/quests src/characters src/pendingQuests src/push` 54 suite / 756 test.
- Prettier + eslint per file su tutti i `.ts` toccati: puliti (solo il warning preesistente `no-base-to-string` di test/app.int-spec.ts).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` → solo le due righe `  enemy: Enemy`.
- Accettazione: `.unref()` 1 nello sweeper; `D-17)` 4 nella spec dello sweeper e 3 nella trigger int-spec; `this.trigger.request` 1; `regeneratesAfter` presente nei due servizi; `QuestGenerationSweeper` 0 in quest-outcomes.module.ts; `D-16)` 4 nella int-spec del resolver; `QuestGenerationModule` fuori da app.module/modulo/int-spec: 0.

## Deviations from Plan

1. **[Rule 3 - gate] Commento di quest-outcomes.module.ts riformulato nel commit del Task 3.** Il commento scritto nel Task 2 nominava `QuestGenerationModule` e faceva fallire il grep di accettazione del Task 3 (`grep -rln "QuestGenerationModule" src | grep -v ...` stampava 1); ora dice «restano nel modulo completo del generatore». File: src/quests/outcomes/quest-outcomes.module.ts, commit 9699335.
2. **[Rule 3 - harness] `AuthzModule` importato nella int-spec del resolver.** `createAuthTestApp` non monta l'interceptor globale di audit (vive in `AuthzModule`); senza, il test sull'audit non poteva passare. Nessun cambio al codice di produzione (in AppModule `AuthzModule` c'è già).
3. **Esecuzione: la regressione integration ampia (54 suite) è stata spostata in background dallo strumento dopo 180 s**, nonostante fosse lanciata in foreground con timeout 600 000: atteso il completamento (exit 0) senza lanciare altre copie; nessun jest residuo.
4. Nota fuori scope (non toccata): `GmCompletionService` e `RescueResolutionService` non impostano `regenerate`; una generata conclusa dal GM o dal soccorso viene ripresa dallo sweep periodico. Il piano limita l'hook a enemy e boss.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie fuori dal threat model (T-13-14/15/16/16b mitigati come da piano).
