---
phase: 14-viaggio-e-cibo
group: B
reviewed: 2026-11-05T12:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/models/travel-food-item.model.ts
  - src/models/travel-preview.model.ts
  - src/quests/acceptance/quest-acceptance.resolver.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.updates.ts
  - src/schema.gql
  - test/travel/travel-food.fixture.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

## Summary

Rivisti per intero i 9 file del gruppo B, più `travel-planner.service.ts` (`autoRoute`/`planAuto`) e `travel-pantry.reader.ts` (`previewOf`/`foodItemsOf`) come contesto di lettura, e le spec di copertura (`quest-acceptance.service.int-spec.ts`, `accept-quest.resolver.int-spec.ts`, `quest-acceptance.updates.spec.ts`, `test/app.int-spec.ts`).

Nessun problema di correttezza o sicurezza trovato. Verificato:

- Ordine dei rifiuti in `accept`: NOT_FOUND, costo/posti, eligibility, città, movimento, `fedOrReject` (solo `kind: 'travel'`, fuori sessione), poi transazione. Nel callback `planFor` in sessione è la prima operazione; `claimLane` rifiuta per fame PRIMA di qualunque scrittura (punti, `PendingQuest`, registrazione, job). `starvingOrRace` dà la fame solo se il claim è ancora possibile, altrimenti `classifyUnclaimed`. Il callback non ha side effect prima del claim e `registration.before` è azzerato a ogni riesecuzione.
- Consumo del cibo e HP nello stesso `findOneAndUpdate` del claim: le guardie (`mealGuardsOf`) sono spalmate per ultime nel filtro, il `$set` di `mealSetOf` per ultimo nell'update. Jump, marker uguale, story e worldMission passano `meal = null` e non leggono la dispensa (D-13). `movementTo` riusa `autoRequestOf`/`planAuto` e il WARN del salto resta solo lì.
- `previewTravel`: `null` solo per story, lane diversa da standard, marker nullo/uguale, nessuna strada. `QUEST_NOT_IN_CITY` e `NOT_FOUND` come l'accettazione. `QUEST_NOT_ACCEPTABLE` ereditato da `autoRoute` per marker senza POI. Nessun codice di fame (risponde `arrivesAlive: false`), nessuna scrittura, nessun log del salto (usa `autoRoute`, non `planAuto`). Il `null` non nasconde errori reali.
- Resolver: `@OwnsCharacter(..., { ownerOnly: true })`, `@Query(() => TravelPreview, { nullable: true })`, `AcceptQuestRequest` riusato. La riga della query nel diff di `schema.gql` coincide carattere per carattere con le REPO-RULES e con l'asserzione di `test/app.int-spec.ts:618`.
- Modelli: `TravelFoodItem { item: LootItem!, quantity: Int! }`, `TravelPreview.food/hpLost/arrivesAlive` non nullable, `hpAfter/needed/covered` assenti dallo schema. Il diff di `schema.gql` è puramente additivo e il blocco `TravelPreview` è ordinato. `foodItemsOf` idrata i documenti (niente `lean`), con populate a profondità 1.
- Codice `TRAVEL_STARVING` nell'enum e nella factory, con il messaggio esatto «Non hai cibo a sufficienza per il viaggio».
- Fixture: nessun id reale né segreto, helper deterministici.
- Copertura: la fame prima di ogni scrittura, la fame in transazione quando il cibo sparisce, la corsa che vince sulla fame, le esenzioni D-13, la concorrenza di due partenze sullo stesso cibo, tutti i rifiuti di `questTravelPreview` sul filo e i controlli owner-only sono coperti da int-spec.

## Critical

Nessuno.

## Warning

Nessuno.

## Info

### B-IN-01: il parametro `cost` di `laneClaimUpdate` collide con il «costo in punti» del dominio

**File:** `src/quests/acceptance/quest-acceptance.updates.ts:80`
**Issue:** il quarto parametro, che porta le chiavi `$set` di cibo e HP (`mealSetOf`), si chiama `cost`. Nello stesso modulo di accettazione (`accept`, `costOrReject`, `pointsSpent: cost`) `cost` indica il costo in punti canale.
**Why it matters:** solo leggibilità: chi legge `laneClaimUpdate(..., cost)` può scambiare il cibo per un addebito di punti, proprio dove la regola è che nulla di economico viene scritto prima del rifiuto. Nessun effetto sul comportamento.
**Suggested fix:** rinominare in `mealSet` (o `foodEffects`), con `Record<string, unknown> = {}`; la spec `quest-acceptance.updates.spec.ts:166` passa i valori in posizione, quindi non cambia.

### B-IN-02: `Model<any>` nella fixture del cibo

**File:** `test/travel/travel-food.fixture.ts:10`
**Issue:** `persistFood(model: Model<any>, ...)` usa `any` esplicito.
**Why it matters:** solo stile: nasconde il tipo del documento, ed è l'unica deroga al tipo forte in questa fixture. Nessun rischio funzionale.
**Suggested fix:** allinearsi alla firma di `persistLootItem` in `test/fixtures` (riusarne il tipo di `model` con `Parameters<typeof persistLootItem>[0]`) invece di `Model<any>`.

---

_Reviewed: 2026-11-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
