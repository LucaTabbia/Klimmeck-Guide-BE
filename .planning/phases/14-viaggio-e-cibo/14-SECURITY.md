---
phase: 14
slug: viaggio-e-cibo
audited: 2026-11-05T22:20:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/14-viaggio-e-cibo
head: f906e27
base: origin/develop (698ae82)
threats_total: 38
threats_mitigated: 35
threats_accepted: 3
threats_transferred: 0
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
transferred_ids: []
updated: 2026-11-05T22:20:00Z
---

# Audit di sicurezza — Phase 14 «Viaggio e cibo» (BE)

Audit in sola lettura dei blocchi threat model dei piani `14-01`…`14-08` (38 ID `T-14-01`…`T-14-38`, tutti distinti) sul codice FINALE di `feat/14-viaggio-e-cibo` a `f906e27`, cioè dopo i fix di `REVIEW-FIX.md` (2 fixed, 2 `not_needed`). Nessun file modificato oltre a questo, nessun commit, nessuna suite integration, nessuna lettura di `.env` o dell'ambiente, nessun comando sul database, nessun `npm run build` (il processo BE dell'utente gira da `dist/`). Nessuna esecuzione di test: le spec citate sono state verificate per nome e posizione; il loro esito verde è quello registrato in `14-VERIFICATION.md` (unit 6 suite / 119 test, `travel.service.int-spec.ts` 20/20, `quest-acceptance.service.int-spec.ts` 98/98) e nel gate 14-07 (341 suite / 4333 test).

Disposizioni: `mitigated` 35, `accepted` 3, `transferred` 0, `deferred` 0, `open` 0.

Nessuna minaccia dei piani ha la mitigazione nella FE: nessuna è `transferred`. La UAT su device della FE (piano 15-09) verifica comportamenti di gioco (`14-VERIFICATION.md` `human_verification`), non mitigazioni dichiarate nei blocchi threat: nessuna è quindi `deferred`.

## Registro delle minacce

| ID | STRIDE | Componente | Disposizione | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- |
| T-14-01 | D | `selectFood` | mitigated | `src/travel/food/food-selection.ts`; spec `food-selection.spec.ts:137` «selects within the bound on huge stacks and needs (D-07)» | Costo indipendente dalle quantità |
| T-14-02 | T | `planTravelFood` | mitigated | `src/travel/food/travel-food.ts`; spec `travel-food.spec.ts:103` «arrives alive with exactly one life point left» e `:113` «refuses to arrive at zero life points» | `arrivesAlive = hpAfter >= 1` ai bordi |
| T-14-03 | T | ordine della selezione | mitigated | `food-selection.spec.ts:83` «breaks a full tie by the lowest item id (D-06)»; `grep -rn "Math\.random" src/travel` → 0 | DP deterministica |
| T-14-04 | T | arrotondamento in virgola mobile | mitigated | `travel-food.ts:44` (`Math.round(distanceKm * METRES_PER_KM)`, aritmetica intera); spec `travel-food.spec.ts:37` «counts the uncovered distance in whole metres, free of float error (D-03, D-07)» | |
| T-14-05 | T | `mealGuardsOf` / `mealSetOf` | mitigated | `src/travel/food/travel-food.updates.ts` (`soldQuantityGuards` sulle quantità vendute, `applyTradeToInventory` che lancia su piano incoerente); spec `travel-food.updates.spec.ts` | Rete di sicurezza nel filtro |
| T-14-06 | T | HP legacy assenti | mitigated | `travel-food.updates.ts` (`hpRaw ?? null`); spec `travel-food.updates.spec.ts:62` «guards a legacy character without life points with null (D-12)» | `null` e non `undefined` |
| T-14-07 | I | `TRAVEL_STARVING` | accepted | piano 14-02 (accept); `src/gameRules/game-rule.exception.ts:156-161` (messaggio fisso); spec `game-rule.exception.spec.ts:260-261` (`extensions` esattamente `{ code: 'TRAVEL_STARVING' }`) | Nessun dato del personaggio nell'errore |
| T-14-08 | T | builder esistenti | mitigated | `git diff origin/develop -- src/travel/travel.updates.ts` → unica riga tolta la firma di `startTravelUpdate` (parametro opzionale finale aggiunto); `quest-acceptance.updates.ts:80` (`mealSet = {}` di default); spec `travel.updates.spec.ts`, `quest-acceptance.updates.spec.ts` | Attese esistenti invariate |
| T-14-09 | I | `travelPreview` | mitigated | `src/travel/travel.resolver.ts:18,33` (`ownerOnly: true`); `test/app.int-spec.ts:148,159` (`TravelResolver.travelPreview` nelle liste); `src/travel/travel.resolver.int-spec.ts:620` «forbids the innkeeper on another character without auditing» | |
| T-14-10 | D | `food[].item` | mitigated | `travel-pantry.reader.ts` `foodItemsOf` (nessun `lean`, i `lean` stanno solo in `read` e `foodCatalogOf`); spec `travel-pantry.reader.int-spec.ts:244` «hydrates the eaten food as LootItem documents with their id (D-09)» | |
| T-14-11 | T | `src/schema.gql` | mitigated | controllo trasversale SDL (sotto): nessuna riga tolta; `test/app.int-spec.ts:593,610,618` stringhe esatte | |
| T-14-12 | T | lettura fuori dalla transazione | mitigated | `travel-pantry.reader.ts` `read(characterId, session)` con `.session(session)` su personaggio e catalogo; spec `travel-pantry.reader.int-spec.ts:166` «reads inside the session of a transaction (D-12)» | |
| T-14-13 | I | log | mitigated | `grep logger src/travel/food` → nessun log nel reader né nei moduli del cibo | |
| T-14-14 | T | lost update dell'inventario | mitigated | `src/travel/travel.service.ts` `startTravel`/`departWithMeal`: `connection.transaction`, `planFor(..., session)`, `mealGuardsOf`; spec `travel.service.int-spec.ts:488` «keeps a concurrent non-food purchase made after the pantry read (D-20)» | |
| T-14-15 | T | partenza gratis in corsa | mitigated | `departWithMeal` ricalcola nel callback; spec `travel.service.int-spec.ts:459` «lets exactly one of two concurrent departures eat the same food (D-12)» | |
| T-14-16 | T | rifiuto con scritture parziali | mitigated | `departWithMeal`: `throw` di `starvingOrRace` prima del `findOneAndUpdate`; spec `travel.service.int-spec.ts:360` «refuses a starving departure with TRAVEL_STARVING and writes nothing (D-11)» | |
| T-14-17 | T | HP sotto 1 | mitigated | `mealSetOf` scrive `hpAfter` solo dopo il controllo `arrivesAlive` (`departWithMeal`, `claimLane`); `mealGuardsOf` riafferma gli HP; spec `travel-food.spec.ts:103,113` | |
| T-14-18 | R | codice sbagliato in corsa (partenza) | mitigated | `travel.service.ts` `starvingOrRace` (`exists(startTravelFilter)` prima della fame); spec `travel.service.int-spec.ts:376` «answers the race code before the hunger when another movement wins (D-11)» | |
| T-14-19 | E | teleport come scorciatoia | accepted | piano 14-04 (accept, D-13); `travel.service.ts` `teleport` non referenzia la dispensa; spec `teleport.resolver.int-spec.ts:297` «teleports without eating nor refunding the food (D-13)» | |
| T-14-20 | I | `questTravelPreview` | mitigated | `quest-acceptance.resolver.ts:~40-46` (`@OwnsCharacter(..., { ownerOnly: true })`); `test/app.int-spec.ts:143,154` (handler nelle due liste, `:1164` uguaglianza esatta); spec `accept-quest.resolver.int-spec.ts:1233` «forbids the innkeeper and another adventurer on a foreign character (D-08)» | |
| T-14-21 | S | `questTravelPreview` | mitigated | guard JWT globale; `test/app.int-spec.ts:85,1050` «rejects questTravelPreview without a bearer (D-08)» | |
| T-14-22 | T | `AcceptQuestRequest` | mitigated | `@IsObjectIdHex` riusato, nessun input sul cibo; spec `accept-quest.resolver.int-spec.ts:1256` «answers BAD_USER_INPUT for malformed ids (D-08)» | |
| T-14-23 | D | WARN del salto | mitigated | `src/travel/travel-planner.service.ts` `autoRoute` senza WARN sul salto (commento in `:140`); il WARN resta in `planAuto` (accettazione); spec `accept-quest.resolver.int-spec.ts:1134` «answers null for an instant jump without warning (D-08)» | Il WARN sul marker inesistente porta solo id |
| T-14-24 | T | `src/schema.gql` | mitigated | `test/app.int-spec.ts:618` (`questTravelPreview(request: AcceptQuestRequest!): TravelPreview\n`); controllo SDL | Riga nullable |
| T-14-25 | T | anteprima che scrive | mitigated | `QuestAcceptanceService.previewTravel` e `TravelPantryReader.previewOf` senza scritture; spec `accept-quest.resolver.int-spec.ts:1035` «previews the automatic travel of a standard quest with its food (D-08, D-09)» (personaggio, quest e coda identici dopo l'anteprima) | |
| T-14-26 | T | lost update nel claim | mitigated | `quest-acceptance.service.ts` `acceptQuest`: `planFor(..., session)` come prima operazione del callback, guardie in `claimLane`; spec `quest-acceptance.service.int-spec.ts:1633` «keeps a concurrent non-food purchase made after the pantry read of the claim (D-20)» | |
| T-14-27 | T | rifiuto con punti scalati o registrazione | mitigated | `fedOrReject` prima della transazione; in `claimLane` il `throw` precede claim, `register`, `pendingQuestModel.create` e `debitUserPoints`; spec `quest-acceptance.service.int-spec.ts:1398` «refuses a starving quest travel before any write (D-11)», `:1431` «refuses with TRAVEL_STARVING inside the transaction when the food vanishes (D-11)» | Ordine verificato nel servizio |
| T-14-28 | T | quest gratis in corsa | mitigated | callback rieseguito sul cibo del momento; spec `quest-acceptance.service.int-spec.ts:1593` «lets exactly one of two concurrent quest departures eat the same food (D-12)» | |
| T-14-29 | R | codice sbagliato in corsa (claim) | mitigated | `quest-acceptance.service.ts` `starvingOrRace` (`exists(laneClaimFilter)`); spec `quest-acceptance.service.int-spec.ts:1463` «answers the race code before the hunger when the lane is taken in the meantime (D-11)» | |
| T-14-30 | E | esenzioni | accepted | piano 14-06 (accept, D-13); `meal` solo se `movement?.kind === 'travel'`; spec `quest-acceptance.service.int-spec.ts:1499` «does not eat on an instant jump nor on a marker at the position (D-13)», `:1544` «does not eat on story and world mission quests (D-13)» | |
| T-14-31 | T | `src/schema.gql` | mitigated | controllo SDL: `grep -E '^-[^-]'` vuoto; aggiunte solo `questTravelPreview`, `type TravelFoodItem` (2 campi) e i tre campi di `TravelPreview` | Le righe aggiunte sono 9 con `}` e riga vuota |
| T-14-32 | I | repo e documenti | mitigated | controlli trasversali: `.env.example` e `.env` fuori dal diff, nessun `process.env.` in `src` fuori spec, nessuna URI `mongodb://` nei `.md` della fase | |
| T-14-33 | R | commit | mitigated | `git log origin/develop..HEAD --format=%B \| grep -ciE "co-authored-by\|generated with"` → 0 | |
| T-14-34 | T | esenzioni D-13 | mitigated | `git diff origin/develop --name-only` non tocca completamento, sweep né processor; in `travel.updates.ts` l'unica riga tolta è la firma di `startTravelUpdate`; `teleport.resolver.int-spec.ts` solo con il caso aggiunto D-13 | |
| T-14-35 | D | soglie di coverage | mitigated | `git diff origin/develop -- package.json \| grep -c coverageThreshold` → 0; nessun file di configurazione jest nel diff | Gate 14-07 con soglie rispettate (14-VERIFICATION) |
| T-14-36 | I | handoff e dati della UAT | mitigated | `grep -rnE "mongodb(\+srv)?://" .planning/phases/14-viaggio-e-cibo/*.md` → nessuna riga | Solo segnaposto `<id>` |
| T-14-37 | T | storico delle decisioni | mitigated | `git diff origin/develop -- .planning/phases/08*` → solo `BACKEND-NOTES.md` con 6 inserimenti, 0 righe tolte; `14-CONTEXT.md` nuovo nel branch | Emendamenti solo in coda |
| T-14-38 | T | SDL nel handoff | mitigated | `BACKEND-NOTES.md:31-44` riporta `questTravelPreview`, `type TravelFoodItem`, `arrivesAlive`, `food` come in `src/schema.gql` | |

## Controlli trasversali

Tutti lanciati con `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && ...`, in sola lettura.

| Comando | Esito |
| --- | --- |
| `grep -rn "process\.env\." src \| grep -v spec` | nessuna riga |
| `grep -rn "Math\.random" src/travel \| wc -l` | `0` |
| `grep -rn "questTravelPreview" src test/app.int-spec.ts \| grep -v 'spec.ts:'` | `src/schema.gql:548` e `quest-acceptance.resolver.ts:46`; il handler è nelle due liste owner-only di `test/app.int-spec.ts` (`:143`, `:154`), query nullable (`TravelPreview` senza `!`), `FORBIDDEN` a innkeeper e avventuriero in `accept-quest.resolver.int-spec.ts:1233` |
| `grep -rn "travelStarving\|TRAVEL_STARVING" src \| grep -v spec` | un solo codice (`game-rule-error-code.enum.ts:22`, factory `game-rule.exception.ts:156`); lanciato in `travel.service.ts:120` (`starvingOrRace`, prima di ogni scrittura), `quest-acceptance.service.ts:332` (`fedOrReject`, prima della transazione) e `:480` (`starvingOrRace`, chiamato in `claimLane` prima del claim) |
| Transazioni | `startTravel` → `connection.transaction` → `planFor(..., session)`; `acceptQuest` → `connection.transaction` con `planFor(..., session)` prima di `claimLane`; filtri con `soldQuantityGuards` (quantità per voce) e HP riaffermati da `mealGuardsOf` solo se `hpLost > 0`; `hpAfter >= 1` garantito da `arrivesAlive` prima di ogni scrittura |
| `git diff origin/develop -- src/schema.gql \| grep -E '^-[^-]'` | vuoto; aggiunte: `questTravelPreview`, `TravelFoodItem { item, quantity }`, `TravelPreview.arrivesAlive/food/hpLost` |
| `grep -rn "logger\.\(log\|warn\|error\)" src/travel src/quests/acceptance` | solo id, conteggi, codici d'errore, nomi di job (`travel-scheduler.service.ts`, `travel-completion.*`, `travel-sweeper.ts`, `travel-planner.service.ts`, `quest-acceptance.service.ts:373,383`); nessuna URI né documento intero; Redis loggato solo col codice |
| `git log origin/develop..HEAD --format=%B \| grep -ciE "co-authored-by\|generated with"` | `0` |
| `git diff origin/develop --name-only -- .env.example` e `\| grep -iE 'migrat\|seed'` | entrambi vuoti (nessuna env nuova, nessun one-off) |
| `git diff origin/develop --name-only \| grep -v '^.planning'` | 29 file, tutti in `src/gameRules`, `src/models`, `src/quests/acceptance`, `src/travel`, `src/schema.gql`, `test/` |

## Open

Nessuna.

## Deferred

Nessuna. La UAT su device della FE (15-09, casi (a)–(e) di `BACKEND-NOTES.md` §7) è registrata in `14-VERIFICATION.md` come verifica umana non bloccante di comportamenti di gioco; nessun ID `T-14-NN` dipende da essa.

## Transferred

Nessuna.

## Flag di minaccia non registrati

Nessuno: i riepiloghi dei piani non segnalano superficie d'attacco fuori dal registro.
