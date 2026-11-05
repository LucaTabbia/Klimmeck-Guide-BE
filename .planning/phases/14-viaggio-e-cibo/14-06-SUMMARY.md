---
phase: 14-viaggio-e-cibo
plan: 06
subsystem: acceptance (claim della corsia standard con viaggio automatico)
tags: [acceptance, travel, food, BE-FOOD-03, BE-FOOD-05, BE-FOOD-06, D-01, D-03, D-04, D-06, D-11, D-12, D-13, D-18, D-19, D-20]
requires: [14-02, 14-03, 14-05]
provides:
  - "`acceptQuest` con viaggio automatico mangia e scala gli HP nello stesso update condizionale del claim, dispensa letta in sessione prima di `claimLane`"
  - "`TRAVEL_STARVING` in pre-verifica (prima della transazione) e nel callback (che fa fede), codice della corsa prima della fame"
affects: [14-07, 14-08]
tech-stack:
  added: []
  patterns:
    - "fame solo se il claim è ancora possibile (`starvingOrRace` con `exists` sul filtro del claim senza guardie), altrimenti `classifyUnclaimed`"
    - "rilettura del codice estratta in un metodo che restituisce l'errore (`unclaimedError`), lanciato dal chiamante"
key-files:
  created: []
  modified:
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
decisions:
  - "Casi ridisegnati sui numeri reali della fixture (questPoi da A ≈ 0,22 km → fabbisogno 1): attese sempre con le funzioni pure, rifiuto per fame con `lifePoints: 1`"
  - "Copertura parziale su una strada lunga dedicata: `markerB` aggiunto ai pointsOfInterest della città A (A→B, fabbisogno 2), `persistTravelWorld` invariata"
  - "Spia D-20 sulla SECONDA chiamata di `TravelPantryReader.read` (la prima del callback; la prima è la pre-verifica fuori sessione)"
metrics:
  duration: "~25 min"
  completed: 2026-11-05
  tasks: 3
  files: 3
---

# Phase 14 Plan 06: l'accettazione mangia nel claim — Summary

`acceptQuest` della corsia standard con viaggio automatico valuta la fame due volte (pre-verifica fuori sessione dopo eligibility, città e movimento; callback con la dispensa riletta in sessione come prima operazione) e consuma cibo e HP nello stesso `findOneAndUpdate` del claim con quantità e HP riaffermati nel filtro; in corsa risponde il codice della corsa prima della fame; salto, marker = posizione, story e worldMission non leggono la dispensa.

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 RED | 0519f43 | test(acceptance): expect the quest travel to eat or refuse |
| 1 GREEN | 02ea1a2 | feat(acceptance): eat the food and charge the life in the claim (D-12) |
| 2 | ab0161a | test(acceptance): pin the food race, purchase and wire refusal |
| 3 | (bookkeeping) | docs(phase-14): record plan 06 progress |

## Fallimenti RED osservati

- Task 1: 4 rossi su 95. «eats the food … (D-06, D-12)» e «… partial cover … (D-03, D-04)»: `ownedItems` e HP invariati (il claim non consumava); «refuses a starving quest travel before any write (D-11)» e «refuses with TRAVEL_STARVING inside the transaction …»: `Received promise resolved instead of rejected`.
- Verdi al primo colpo nel RED del Task 1 (motivo): «answers the race code before the hunger …» (senza logica della fame il claim falliva già con `QUEST_SLOT_BUSY`: il caso blinda l'ordine dopo il GREEN), i due casi D-13 (senza codice nessuno leggeva la dispensa: blindano le esenzioni).
- Task 2: tutti verdi al primo colpo (il Task 1 ha già la transazione e le guardie). La prova di mutazione D-20 è stata eseguita PRIMA del commit (vedi sotto).

## Prova di mutazione D-20

Con `session` sostituito da `null` nella chiamata `pantry.planFor(..., movement.travel, session)` del callback (modifica temporanea, ripristinata, mai committata) il caso «keeps a concurrent non-food purchase made after the pantry read of the claim (D-20)» diventa ROSSO: la pozione sparisce da `assets.ownedItems` (lost update dell'array riscritto). Con la sessione: WriteConflict, il driver riesegue il callback, `read` chiamato ≥ 3 volte (pre-verifica, callback, callback rieseguito), resta `[foodStack(cibo1, 3), foodStack(pozione, 1)]`.

## Nomi e firme

- `src/quests/acceptance/quest-acceptance.service.ts`:
  - `interface LaneClaim` + `meal: PlannedMeal | null`; `type ClaimTarget = Pick<LaneClaim, 'characterId' | 'quest' | 'claim'>`.
  - `accept`: dopo `movement`, `await this.fedOrReject(characterId, movement)`; nel callback, dopo `registration.before = null`, `const meal = movement?.kind === 'travel' ? await this.pantry.planFor(characterId, movement.travel, session) : null` passato a `claimLane`.
  - `private async fedOrReject(characterId, movement: LaneMovement | null): Promise<void>` (solo `kind: 'travel'`, `planFor` senza sessione, `!arrivesAlive` ⇒ `GameRuleException.travelStarving()`).
  - `private async claimLane({ characterId, quest, claim, pendingQuestId, movement, meal }, session)`: `meal && !meal.plan.arrivesAlive` ⇒ `throw await this.starvingOrRace(target, session)`; filtro `laneClaimFilter(..., meal ? mealGuardsOf(meal.plan, meal.pantry.hpRaw) : {})`, update `laneClaimUpdate(lane, pendingQuestId, movement, meal ? mealSetOf(meal.plan, meal.pantry.assets) : {})`; non matchato ⇒ `throw await this.unclaimedError(target, session)`.
  - `private async starvingOrRace(target: ClaimTarget, session): Promise<Error>` (`characterModel.exists(laneClaimFilter(...senza guardie)).session(session)`).
  - `private async unclaimedError({ characterId, quest, claim }: ClaimTarget, session): Promise<Error>` (rilettura in sessione con `CHARACTER_PROJECTION` + `classifyUnclaimed`).
  - `previewTravel`, `register`, `startOnMarker` e il flusso dopo il commit invariati.
- `quest-acceptance.service.int-spec.ts`: `characterAt(location, title, questsState, extra: { lifePoints?; ownedItems? } = {})` con HP di default `HARDY_LIFE_POINTS` (current e max) e `assets.ownedItems` = `extra.ownedItems ?? []`; `TRAVEL_COLLECTIONS` + `'lootitems'`; costante `LARDER = 500`; describe `food on the automatic travel (D-12)` dentro `automatic travel to the quest marker (D-02, D-03, D-21)` con `lootItems`, `route` (A→questPoi), `needed`, helper `foodOf(id)` e `longHunt()` (markerB nella città A, `longRoute` A→B).
- `accept-quest.resolver.int-spec.ts`: caso «rejects a starving acceptance on the wire with the hunger message (D-11)» prima di `describe('questTravelPreview (wire)')`.

## Rami nuovi → test (D-19)

| Ramo | Test |
| ---- | ---- |
| pre-verifica senza viaggio (movement null / jump) | does not eat on an instant jump nor on a marker at the position (D-13); does not eat on story and world mission quests (D-13) |
| pre-verifica con viaggio sazio | eats the food of the automatic travel in the claim (D-06, D-12) |
| pre-verifica affamata | refuses a starving quest travel before any write (D-11); rejects a starving acceptance on the wire … (D-11) |
| callback con `meal` nullo | i due casi D-13, tutti i casi esistenti story/worldMission/salto |
| callback sazio (guardie + costo) | eats the food … (D-06, D-12); eats all the food and lowers the life points of a partial cover … (D-03, D-04); feeds the slower march … (D-01); lets exactly one of two concurrent quest departures … (D-12); keeps a concurrent non-food purchase … (D-20) |
| callback affamato con claim possibile | refuses with TRAVEL_STARVING inside the transaction when the food vanishes (D-11) |
| callback affamato in corsa (`unclaimedError` da `starvingOrRace`) | answers the race code before the hunger when the lane is taken in the meantime (D-11) |
| claim non matchato con pasto | lets exactly one of two concurrent quest departures eat the same food (D-12) |
| claim non matchato senza pasto | casi esistenti di concorrenza (QUEST_SLOT_BUSY, TRAVEL_IN_PROGRESS, AWAITING_AID, QUEST_FULL…) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Numeri della fixture del piano sbagliati (deviazione sanzionata dall'orchestratore)**
- **Found during:** Task 1
- **Issue:** il piano assume questPoi ≈ 11,12 km / 45 power (cibo 50 + 20×3, HP 10 e 30 come fame, `uncoveredKmOf(needed, 20, …)`). Reale: questPoi da A ≈ 0,22 km, fabbisogno 1; senza cibo 1 HP.
- **Fix:** titoli e invarianti invariati. Coperto: `[foodStack(cibo1, needed), foodStack(cibo5, 1)]` → resta `[foodStack(cibo5, 1)]` (scarto 0), HP 100. Parziale: con fabbisogno 1 non esiste copertura parziale, quindi strada lunga dedicata (`markerB` aggiunto ai pointsOfInterest della città A con `$push` sul driver, A→B fabbisogno 2 asserito `> 1`) e `[foodStack(cibo1, 1)]` → `[]`, HP `100 - hpLostFor(uncoveredKmOf(longNeeded, 1, longRoute.distanceKm))`. Fame (pre-verifica, in transazione, in corsa, filo): `lifePoints: 1`; nel caso in transazione il cibo che copre in pre-verifica è `foodStack(cibo1, needed)`. Concorrenza e D-20 con cibo 1. D-13 con `foodStack(cibo20, 3)` (HP 100 per salto/marker, HP 1 per story/worldMission). Nessun letterale per km/HP/fabbisogno.
- **Files modified:** src/quests/acceptance/quest-acceptance.service.int-spec.ts, src/quests/acceptance/accept-quest.resolver.int-spec.ts
- **Commit:** 0519f43, ab0161a

**2. [Rule 2] Asserzioni più forti delle attese del piano**
- «refuses a starving quest travel before any write (D-11)» usa una quest `enemy` con `requiredAdventurers` count 2 (una `hunt` ignora gli slot: la lista vuota sarebbe banale) e verifica anche `connection.transaction` mai chiamata e la coda delle risoluzioni vuota.
- I due casi D-13 spiano `TravelPantryReader.read` e verificano che non sia mai chiamata («non leggono la dispensa»).

**3. Spia D-20 sulla seconda chiamata**
- Il piano dice «alla prima chiamata con una sessione non nulla»; la spia scrive alla SECONDA chiamata (la prima del callback, dopo la pre-verifica fuori sessione) e asserisce `read.mock.calls[1][1]` non nullo: così la prova di mutazione (callback senza sessione) diventa rossa per il lost update e non per l'assenza della scrittura.

**4. Import non usato nel commit RED**
- `persistLootItem` è stato importato nel commit 0519f43 (warning eslint `no-unused-vars`, 0 errori) e usato dal Task 2 (ab0161a); nessun amend.

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni task.
- Task 1: `src/quests/acceptance src/quests/pending-requests src/quests/party` integration 179/179 (9 suite); `src/quests/acceptance` unit 185/185 (4 suite).
- Task 2: `src/quests/acceptance` integration 133/133 (2 suite).
- prettier `--write` + eslint puliti sui tre file toccati (a fine piano).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` solo righe aggiunte (quelle dei piani 03/05).
- Grep di accettazione: `planFor(` 2, `travelStarving()` 2, `mealGuardsOf(` 1, `mealSetOf(` 1; titoli 1 ciascuno; `D-13)` 2.

## Threat model

T-14-26 (D-20 con prova di mutazione), T-14-27 (pre-verifica senza transazione, punti/PendingQuest/registrati/job invariati; rifiuto in transazione senza scritture), T-14-28 (due accettazioni, un solo consumo), T-14-29 (codice della corsa prima della fame), T-14-30 (esenzioni provate dai due casi D-13).

## Self-Check: PASSED
