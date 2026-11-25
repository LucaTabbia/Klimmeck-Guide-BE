---
phase: 26-eliminazione-account-e-consenso
plan: 04
subsystem: travel
tags: [account-deletion, travel-food, pending-quest, refund]
requires: ["26-03"]
provides:
  - "PendingQuest.travelFoodSpent: { item: ObjectId (ref LootItem), quantity }[] — solo @Prop, default [], mai nello SDL"
  - "PendingQuest.travelHungerLifeLost: number — solo @Prop, default 0, mai nello SDL"
  - "src/travel/food/quest-travel-spending.ts: QuestTravelSpending, questTravelSpendingOf(settlement, lifeBefore), questTravelSpendingUpdateOf(spending), recordQuestTravelSpendingWithin(pendingQuestModel, travel, pendingQuestRef, spending, session)"
  - "TravelPlanningModule registra il modello PendingQuest (iniettato in TravelFoodSweep)"
affects: [26-05]
tech-stack:
  added: []
  patterns:
    - "spese del tragitto scritte nella stessa sessione del pasto, solo dopo la scrittura guardata del personaggio"
    - "scrittura tollerante: PendingQuest assente = zero match, nessun errore"
key-files:
  created:
    - src/travel/food/quest-travel-spending.ts
    - src/travel/food/quest-travel-spending.spec.ts
    - src/models/pending-quest.schema.spec.ts
  modified:
    - src/models/pending-quest.model.ts
    - src/travel/food/travel-food.sweep.ts
    - src/travel/food/travel-food.sweep.int-spec.ts
    - src/travel/travel-planning.module.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel-completion.int-spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
decisions:
  - "La vita persa annotata è vita prima meno vita dopo (già limitata al minimo), e solo se il settlement ha fame: una vita sopra il massimo scende solo della fame e si annota quella"
  - "Nell'imboscata il tipo di viaggio si legge da inSession.status.activeTravel: OUTCOME_CHARACTER_PROJECTION proietta già tutto status, nessuna lettura in più"
  - "Lo sweep legge in sessione con SETTLE_PROJECTION (FOOD_LEG_PROJECTION + status.activeTravel.kind + quests.pendingQuest); FOOD_LEG_PROJECTION del teleport invariata"
metrics:
  duration: "35 min"
  completed: 2026-11-25
---

# Phase 26 Plan 04: spese del tragitto sulla PendingQuest — Summary

Cibo mangiato e punti vita persi per fame nel viaggio verso una quest restano scritti sulla `PendingQuest` (`travelFoodSpent`, `travelHungerLifeLost`) nella stessa transazione del pasto (sweep, arrivo, imboscata vinta), pronti per il rimborso dell'annullamento del piano 05 (D-13, D-26).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | d3414852 | test(travel): expect the trip spending of a pending quest |
| 1 GREEN | 3075305b | feat(travel): describe the trip spending of a pending quest |
| 2 RED | cefd39a2 | test(travel): expect the trip spending recorded with the meal |
| 2 GREEN | 896c2794 | feat(travel): record the trip spending of a quest with the meal |

## Fallimenti RED

- Task 1: `quest-travel-spending.spec.ts` → modulo inesistente; `pending-quest.schema.spec.ts` → 2 casi rossi (campi assenti: `travelFoodSpent` e `travelHungerLifeLost` undefined).
- Task 2: 5 casi rossi, tutti con `Received: undefined` (o `[]` all'arrivo) sui campi della `PendingQuest` dopo il pasto: sweep (pasto, fame, somma di due sweep), arrivo, imboscata vinta.

## Casi verdi al primo colpo (con motivo)

- `keeps the trip spending out of GraphQL (D-26)`: i campi nascono senza `@Field`; il test pinna la lista completa dei campi GraphQL della `PendingQuest` coi metadati (`LazyMetadataStorage.load` + `compileClassMetadata`), quindi resta una guardia di regressione.
- `records nothing for a free trip (D-26)` (sweep), `records nothing on arrival when the party was dissolved (D-26)` (arrivo), `records nothing when the ambush is lost (D-26)` (imboscata): provano l'assenza di scrittura e la tolleranza, già vere prima del codice; dopo il GREEN restano verdi (il codice filtra `kind`, PendingQuest assente non è errore, la sconfitta abbandona senza annotare).

## Come si legge `kind` nell'imboscata

`OUTCOME_CHARACTER_PROJECTION` proietta già `status` intero: `inSession.status.activeTravel` porta `kind`, quindi nessuna lettura minima in più e nessuna modifica alla proiezione condivisa. L'annotazione sta nel ramo `else` di «sconfitta o deviazione»: solo quando la quest non viene abbandonata. Vita prima = `statusFactsOf(inSession).currentLifePoints` (la stessa `lifeNow` di `ambushFoodOf`), settlement = `food.progress`.

## Modelli registrati

`PendingQuest` aggiunto a `MongooseModule.forFeature` di `src/travel/travel-planning.module.ts` (serviva a `TravelFoodSweep`). Arrivo e imboscata avevano già `pendingQuestModel` iniettato.

## Verifiche

- Unit: `pending-quest.schema.spec.ts` + `quest-travel-spending.spec.ts` 9/9; `quest-lanes.schema.spec.ts` 10/10; tutte le unit di `src/travel` 303/303 (27 suite).
- Integration (`--runInBand`): sweep + arrivo + imboscata + `test/app.int-spec.ts` 223/223 (4 suite); in più, come controllo di regressione, le altre 10 int-spec di `src/travel` 169/169.
- `src/schema.gql` invariato dopo il boot reale di test (`git diff --exit-code` pulito, 0 occorrenze dei campi nuovi). `npx tsc --noEmit -p tsconfig.json` 0.
- Gate del piano: 3 file con una sola chiamata a `questTravelSpendingOf(`; `travel-food-settlement.ts` e `outcome-plan.ts` senza diff dalla base `9a084248`; nessun tiro nuovo.

## Deviations from Plan

- **Spec di schema (aggiunta):** oltre ai due casi del piano c'è `stores the eaten lines as item refs with a quantity (D-26)` (cast dell'id esadecimale a ObjectId nella riga). Il caso GraphQL usa il pattern dei metadati del 26-01 anziché la sola prova dello SDL invariato (entrambe presenti).
- **Fixture della `PendingQuest` nelle int-spec di sweep e imboscata:** inserite con `collection.insertOne` senza i campi nuovi, per provare la lettura tollerante sui documenti di oggi (D-11); all'arrivo si usa l'helper esistente `persistPendingQuest`.
- Nessun'altra deviazione; nessuna regola 1–4 applicata.

## Known Stubs

Nessuno.

## Note per i piani successivi

- Il piano 05 legge `travelFoodSpent` e `travelHungerLifeLost` in modo tollerante (assenti = lista vuota / 0). Le righe vengono dall'unico pasto del viaggio, ma il campo è una lista in coda: il rimborso fonde comunque per `item` (stessa forma di `ownedItemsAfter`).
- Un pasto avviene una volta sola (`foodConsumedAt`), la fame si somma per tratti: sweep, imboscata vinta e arrivo contribuiscono tutti a `travelHungerLifeLost`.
- Teleport e sconfitta non annotano (corsia standard libera / quest abbandonata).

## Self-Check: PASSED

File creati presenti; commit d3414852, 3075305b, cefd39a2, 896c2794 presenti nella storia.
