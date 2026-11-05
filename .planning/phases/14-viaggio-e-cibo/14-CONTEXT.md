# Phase 14: Viaggio e cibo - Context

**Gathered:** 2026-11-05 (discuss congiunto con la FE Phase 15, condotto dal repo FE; branch `feat/14-viaggio-e-cibo` da `develop` `698ae82`, la merge delle PR #20/#21)
**Amended:** 2026-11-05 dopo la ricerca (`14-RESEARCH.md`, Pitfall 1–9, Open Questions 1–7): D-07, D-08, D-11, D-12 rivisti; D-16..D-20 aggiunti. Questo CONTEXT prevale sulla RESEARCH dove differiscono.
**Status:** Ready for planning — i nomi del contratto (tipi, campi, query, codice) restano a discrezione del planner e vengono fissati in `14-REPO-RULES.md` prima della pianificazione; la FE Phase 15 li consuma dopo la merge di questa fase su `develop`.

<domain>
## Phase Boundary

Viaggiare consuma cibo. Il fabbisogno è il tempo di marcia già calcolato dal pianificatore (terreno, pet e ferite compresi): 1 power ogni 3 minuti. Il server sceglie fra gli oggetti `hunger` del personaggio la combinazione che copre il fabbisogno con lo scarto minimo e la consuma alla partenza; la quota di fabbisogno non coperta si traduce in chilometri scoperti e ogni km scoperto costa vita in modo triangolare (il km n-esimo costa n HP); se il personaggio non arriverebbe con almeno 1 HP la partenza — libera (`startTravel`) o automatica dall'accettazione di una quest della corsia standard (`acceptQuest`) — è rifiutata senza scritture. Le anteprime (`travelPreview` e una nuova anteprima owner-only per la quest) espongono cibo, vita persa e un flag «arrivi vivo» senza scrivere nulla. Teleport dell'oste e salto istantaneo esenti.

Fuori scope: rimborso del cibo (mai: nemmeno dopo un'imboscata, BE Phase 15 BE-AMBUSH-05, né dopo un teleport a viaggio iniziato), fame fuori dal viaggio, scelta manuale del cibo da parte del giocatore, cibo per story/worldMission (nessun viaggio), modifiche al motore di combattimento, alla durata del viaggio (Phase 8 D-07/D-08) o al completamento/sweep.

</domain>

<decisions>
## Implementation Decisions

### Fabbisogno e vita (BE-FOOD-01, BE-FOOD-03)
- **D-01 (utente, confermato coi numeri reali):** **1 power = 3 minuti di marcia**: fabbisogno = ⌈`durationMs` / 180 000⌉ power, dove la durata è quella del pianificatore (`durationMsOf`: Σ km/`speedFactor`, velocità 10 × pet × fattore ferite). Ordini di grandezza sul DB (senza pet): città → città più vicina mediana 2,7 h → 55 power, città → marker quest 2,6 h → 52, città → città qualsiasi mediana 35 h → 700, attraversata massima 82 h → 1646; a catalogo 33 cibi `hunger` da 5 a 200 power («Razione da viaggio» 100, «Pane di Elfo» 200). Un pet ×2 dimezza, Pegaso ×4 divide per quattro; una ferita che allunga il tempo allunga il cibo.
- **D-02 (utente, confermato coi numeri):** **vita persa triangolare**: il km scoperto n-esimo costa n HP, totale n(n+1)/2. Senza cibo: 16 km → 136 HP, 50 → 1275, 100 → 5050, 204 → 20 910, 506 → 128 271; un rookie (1000 HP) regge ≤ 44 km scoperti, un legend (40 000) ≤ 282. Costo in HP assoluto, non in percentuale dei massimi.
- **D-03 (utente):** **km scoperti arrotondati per eccesso**: km scoperti = ⌈(fabbisogno − coperto) / fabbisogno × distanza⌉ con `distanza` = `TravelPreview.distance` (km di gioco della polilinea); esempio: fabbisogno 55, coperto 40, 16 km → 4,36 → 5 km → 15 HP. Fabbisogno coperto → 0 km → 0 HP.
- **D-04 (utente):** **cibo insufficiente con vita sufficiente → si parte lo stesso**: il server consuma tutto il cibo posseduto e il resto del fabbisogno è scoperto; il rifiuto scatta solo quando `currentLifePoints − hpLost < 1` (`MIN_LIFE_POINTS`). Gli HP sono scalati alla partenza (o al claim), mai sotto 1; l'arrivo non tocca nulla.
- **D-05 (utente):** **se può coprire, il server copre sempre**, anche quando l'unica combinazione che copre spreca molto (fabbisogno 10, unico cibo «Pane di Elfo» 200 → lo mangia). Il giocatore vede l'anteprima e può rinunciare o comprare cibo piccolo; nessun tetto allo spreco.

### Selezione del cibo (BE-FOOD-02)
- **D-06 (utente):** **scarto minimo, poi meno pezzi, poi minor valore di vendita.** Le unità sono gli `ownedItems` con `effect: hunger` espansi per quantità (uno stack da 2 = due unità separate); fra le combinazioni che coprono il fabbisogno vince lo scarto minimo (60 richiesti con un 50 e tre 20 → i tre 20); a parità di scarto vince quella con meno unità (60 con un 50, un 10 e tre 20 → 50+10); a parità di unità vince il minor `sellPrice` totale; poi ordine stabile per id. Un'unità usata in parte è consumata intera. Quando la somma di tutto il cibo non copre il fabbisogno si consuma tutto (D-04).
- **D-07 (default tecnico, per il veto):** **modulo puro con costanti in codice di dominio** (pattern `BASE_SPEED` in `travel-timing.ts`, `PLACEHOLDER_RULES`, `generation-rules.ts`): ad esempio `src/travel/food/travel-food.ts` con `FOOD_RULES = { minutesPerPower: 3, minLifePoints: 1 } as const` e funzioni pure (fabbisogno dalla durata, selezione dalle unità possedute, km scoperti, vita persa, piano completo `{ consumed: [{ item, quantity }], needed, covered, uncoveredKm, hpLost, hpAfter, arrivesAlive }`). Nessuna variabile d'ambiente. **Rivisto dopo la ricerca (Pattern 2, Pitfall 4):** algoritmo = DP «bounded knapsack» con splitting binario delle quantità e tetto `needed + maxPower − 1` (le quantità degli stack possono essere enormi: il limite non dipende da esse; caso peggiore misurato 12 ms); km scoperti calcolati moltiplicando prima di dividere, senza epsilon. **Emendato dal checker (2026-11-05):** i km scoperti si calcolano in metri interi (`Math.round(distanceKm × 1000)`, poi aritmetica intera, senza epsilon): 55/5/1,1 → 1 km, non 2.

### Anteprime (BE-FOOD-04)
- **D-08 (utente):** **query owner-only dedicata per la quest** (es. `questTravelPreview(request: AcceptQuestRequest!)`, nome definitivo nelle REPO-RULES): restituisce la stessa forma di `travelPreview` **nullable** — `null` quando l'accettazione non comporta un viaggio (marker uguale alla posizione, oppure salto istantaneo senza strada, Phase 8 D-03). Calcola il movimento come `movementTo`/`planAuto` dell'accettazione sul personaggio corrente, senza scrivere. Rifiuti: `NOT_FOUND` (quest, personaggio), `FORBIDDEN` (non owner), `QUEST_NOT_IN_CITY` come l'accettazione; **non** valuta corsia, titolo, posti e punti (sono dello swipe). Scartata l'alternativa del campo sulla `Quest` risolto per il viewer (fotografato al caricamento del Tabellone). **Rivisto dopo la ricerca (OQ 3/4, Pitfall 3/7):** l'anteprima riusa un `autoRoute` senza log estratto da `planAuto` (il WARN del salto resta solo sull'accettazione, così `travel-planning.int-spec.ts:420` resta verde); eredita `QUEST_NOT_ACCEPTABLE` quando il marker non ha un POI; nessun codice in più con `activeTravel`/`awaitingAid` presenti (stima dalla posizione corrente, il FE non la chiede in quei casi); `food[].item` è letto come documento idratato, mai `lean` (altrimenti `id` arriva null).
- **D-09 (utente):** **le anteprime rispondono coi numeri, mai col codice di fame**: `TravelPreview` guadagna in modo additivo `food: [TravelFoodItem!]!` (`{ item: LootItem!, quantity: Int! }`, `item` popolato per il nome), `hpLost: Int!`, `arrivesAlive: Boolean!` (nomi definitivi nelle REPO-RULES); con `arrivesAlive: false` il FE spegne «Parti»/lo swipe e mostra «Non hai cibo a sufficienza per il viaggio». Le altre regole e i codici di `travelPreview` restano quelli della Phase 8 D-11.
- **D-10 (utente):** **la partenza ricalcola sul cibo del momento e parte con la nuova selezione**: l'anteprima è informativa; nessun codice «cibo cambiato», nessun passaggio dell'anteprima nella mutation; la verità arriva via `characterUpdated`.

### Partenza, claim e rifiuto (BE-FOOD-03, BE-FOOD-05)
- **D-11 (utente/roadmap):** **un solo codice `TRAVEL_STARVING`** (`GameRuleErrorCode` + factory in `GameRuleException`, messaggio italiano «Non hai cibo a sufficienza per il viaggio») per `startTravel` e per `acceptQuest` con viaggio automatico; valutato dopo i rifiuti esistenti (`travel-rules.ts`: meta, soccorso, viaggio in corso, quest in corso, stessa posizione, nessuna strada; per la quest dopo `classifyEligibility`, città e movimento) e **prima di qualunque scrittura** (nessun punto canale scalato, nessuna registrazione). **Rivisto dopo la ricerca (OQ 6):** in `acceptQuest` il rifiuto per fame si valuta due volte — nella pre-verifica, prima di aprire la transazione (ordine D-11), e di nuovo dentro la transazione, che fa fede.
- **D-12 (default tecnico, per il veto):** **consumo nello stesso update condizionale della partenza o del claim.** **Rivisto dopo la ricerca (Pitfall 1–2, OQ 1–2): la lettura del cibo e degli HP avviene DENTRO una transazione** (pattern del negozio, `shop-transaction.service.ts:188-196`): `startTravel` diventa transazionale e legge in sessione `assets.ownedItems` (con i `LootItem` `hunger` → `power`, `sellPrice`) e `status.currentLifePoints`; nel claim la lettura precede `claimLane` nella stessa sessione (il `$set` dell'array intero letto fuori sessione perderebbe un acquisto concorrente non-cibo o le ricompense di una story risolta nel frattempo). Il `findOneAndUpdate` di `travel.updates.ts` guadagna nel filtro un `$elemMatch` per ogni stack consumato (`item` + `quantity` ≥ n, pattern `soldQuantityGuards` di `trade-inventory.ts`) e l'uguaglianza di `status.currentLifePoints`, e nell'update il `$set` dell'array `assets.ownedItems` intero ricalcolato (stack a 0 rimossi, pattern `applyTradeToInventory`/`outcome-plan.ts`) più `status.currentLifePoints` e `activeTravel`. `acceptQuest`: la proiezione del personaggio (`quest-acceptance.service.ts`) guadagna `assets.ownedItems` e `status.currentLifePoints`; `laneClaimFilter`/`laneClaimUpdate` estesi allo stesso modo dentro la transazione del claim; il salto (`kind: 'jump'`) e il «nessun movimento» non consumano nulla. Le guardie nel filtro restano come rete di sicurezza; un filtro non matchato si classifica coi codici esistenti (`classifyUnstarted` → `TRAVEL_IN_PROGRESS`, `classifyUnclaimed` → `QUEST_SLOT_BUSY`), nessun retry manuale (il driver ritenta già sul WriteConflict), documentato nel handoff. I builder di filtro/update ricevono un parametro opzionale finale (le asserzioni `toEqual` esistenti restano verdi); un lettore iniettabile del cibo posseduto vive nel `TravelPlanningModule`, che registra già `LootItem` ed è importato da viaggio e accettazione.
- **D-13 (utente/roadmap):** **teleport e salto istantaneo non consumano**; completamento, reconciler, sweep, push `travelEnd` e teleport invariati; il cibo mangiato resta mangiato anche se l'oste teletrasporta a viaggio iniziato o l'imboscata (Phase 15) devia il viaggio.
- **D-14 (default tecnico):** **SDL additivo** (tre campi su `TravelPreview`, tipo `TravelFoodItem`, una query nuova; riuso di `AcceptQuestRequest { id, questId }` come input), `EXPECTED_OWNER_ONLY_HANDLERS` e whitelist del boot reale aggiornate, `src/schema.gql` rigenerato e committato; nessun documento FE seleziona campi tolti. Handoff **`BACKEND-NOTES.md`** per la FE Phase 15: SDL verbatim, tabella dei codici con l'azione FE, semantica (fabbisogno, selezione, km scoperti, triangolare, soglia), esempi numerici del discuss, dati per la UAT (cibo da dare a DB al personaggio di prova: coperto, parziale, rifiutato).
- **D-15 (default tecnico):** **TDD.** Unit sul modulo puro (esempi della ROADMAP e del discuss: 60 con 50+20+20+20; 60 con 50+10+20×3; 10 con il 200; cibo zero; arrotondamento 4,36 → 5; triangolare; soglia 1 HP). Integration (replica set, fixture `persistCharacter`/`persistCity`/`persistQuest`/`persistRoad` esistenti): viaggio coperto, parziale (HP scalati), rifiutato; pet ×2 dimezza, ferita `movementImpairment` allunga, strada lenta costa più della pianura; concorrenza fra due partenze con lo stesso cibo → una sola riesce; `acceptQuest` coperto e rifiutato; teleport senza consumo; anteprima della quest `null` senza viaggio. Tooling: `npx prettier --write` + `npx eslint` solo sui file toccati, `npx tsc --noEmit` come gate di build (**mai `npm run build`** mentre il BE dell'utente gira da `dist/`), percorsi jest prima di `--selectProjects`, integration con `--runInBand`, `npm run test:cov` alla chiusura.

### Aggiunte dopo la ricerca (2026-11-05)
- **D-16 (ricerca, Pitfall 6):** asserzioni a stringa esatta da aggiornare RED prima del codice: in `test/app.int-spec.ts` il blocco `type TravelPreview` (:594-596), la riga `questTravelPreview(request: AcceptQuestRequest!): TravelPreview` seguita da `\n` (prova della nullabilità), `QuestAcceptanceResolver.questTravelPreview` nelle due liste di handler (:130-156) e il test UNAUTHENTICATED (:1018); in `src/gameRules/game-rule.exception.spec.ts` (:221-225) il caso `travelStarving`.
- **D-17 (ricerca, OQ 7):** la lista `food` dell'anteprima segue l'ordine di `assets.ownedItems`; da scrivere nel handoff.
- **D-18 (ricerca, Validation Architecture):** fixture: `persistLootItem(model, { effect: 'hunger', power, sellPrice })` esiste già (default `heal`); `ownedItems` passa da `characterOverrides.assets` con lo spread di `buildCharacter().assets` (sostituisce `assets` intero); HP di default 100/100 → senza cibo il viaggio A→B delle fixture (~23 km scoperti, 276 HP) è già un rifiuto: i casi coperto/parziale alzano gli HP o danno cibo.
- **D-19 (ricerca, Pitfall 8):** soglie di coverage per cartella — `src/travel/` 97/84/98 e `src/quests/acceptance/` 97/91/98 (statements/branches/lines): ogni ramo nuovo del claim e della partenza è coperto da integration o unit.
- **D-20 (ricerca, Assumptions A1):** l'assunzione «una scrittura non transazionale concorrente fa ripartire la transazione o viene salvata dalle guardie» si prova con un test RED («acquisto concorrente non-cibo sopravvive alla partenza»), non si assume.

### Claude's Discretion
- Nomi di funzioni e file del modulo puro (i nomi del contratto sono fissati nelle REPO-RULES), posizione esatta del rifiuto per fame nell'ordine dei codici, forma del lettore del cibo (populate vs `find` sugli id, purché idratato), log a INFO/WARN, forma delle fixture e dell'eventuale helper `persistFood`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap e requisiti
- `.planning/ROADMAP.md` §Phase 14 (criteri 1–4, decisioni 2026-10-29 e 2026-11-05) e `.planning/REQUIREMENTS.md` BE-FOOD-01..06 (emendati 2026-11-05)

### Viaggio e accettazione (Phase 8 e 7)
- `.planning/phases/08-travel-lifecycle-travel-01/08-CONTEXT.md` D-01..D-04 (mete, viaggio automatico, salto, rifiuti), D-07..D-09 (durata, velocità, fotografata alla partenza), D-11 (preview owner-only), D-16/D-17 (teleport), D-19 (codici), D-21 (partenza in un solo update)
- `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` §1–§4 (contratto, codici, semantica, preview), §8 (scala delle durate: numeri riusati sopra)
- `.planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md` §1–§3 (accettazione, codici, corsie e costi) e gli emendamenti in `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §3/§8
- `.planning/phases/13.1-correzioni-generazione-quest/BACKEND-NOTES.md` §6 (accettare avvia il viaggio, teleport bloccato da `activeTravel`)

### Contenuto e inventario (Phase 11, 12, 9)
- `.planning/phases/11-popolamento-del-mondo/11-CONTEXT.md` D-15 (loot `hunger` con `power` tarato su 1 power = 3 minuti)
- `.planning/phases/12-negozi-per-citta/12-CONTEXT.md` (transazione del negozio, guardie sulle quantità) e `src/economy/trade/trade-inventory.ts`
- La fase 9 (esiti): consumo dei consumabili e scrittura degli HP in `src/quests/outcomes/` (`outcome-plan.ts`, `outcome-writer.service.ts`), `MIN_LIFE_POINTS` in `level-table.ts`

### FE companion
- `../Klimmeck-Guide/.planning/phases/15-travel-food/15-CONTEXT.md` — decisioni FE (righe «Cibo»/«Vita», riga «Viaggio» del foglio quest, frase di fame, foglio aperto su rifiuto per fame)
- `../Klimmeck-Guide/.planning/phases/07-travel/BACKEND-NOTES.md` — cosa consuma oggi il FE di `travelPreview`/`startTravel`

### Regole del repo
- `CLAUDE.md`, `.planning/phases/13-generazione-quest/13-REPO-RULES.md` e `.planning/phases/13.1-correzioni-generazione-quest/13.1-REPO-RULES.md` (modello per le `14-REPO-RULES.md`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/travel/travel.service.ts` (`preview` :52-62, `startTravel` :65-86, `teleport` :89-118), `src/travel/travel-planner.service.ts` (`planFree` :94-136, `planAuto` :140-170, velocità :192-214), `src/travel/travel-timing.ts` (`BASE_SPEED`, `durationMsOf`, `buildActiveTravel`), `src/travel/travel-rules.ts` (ordine dei rifiuti :13-24), `src/travel/travel.updates.ts` (`startTravelFilter`/`Update` :39-54, `classifyUnstarted` :57-66, teleport :115-128)
- `src/models/travel-preview.model.ts` (`distance`, `duration` ms, `road`), `src/models/character/active-travel.model.ts` (`kind` solo Mongo), `src/models/request/travel-request.model.ts`, `AcceptQuestRequest { id, questId }`
- `src/quests/acceptance/quest-acceptance.service.ts` (`accept` :136-235, proiezione :103-111, `movementTo` :256-273, `claimLane` :342-368), `quest-acceptance.updates.ts` (`laneClaimFilter`/`laneClaimUpdate` :46-89), `quest-eligibility.ts` (:156-175)
- Inventario: `src/models/character/character-assets.model.ts` (`ownedItems: AssetQuantity[]` :28-30), `src/models/common/asset-quantity.model.ts` (`itemType`, `item` refPath, `quantity`), `src/models/loot-item.model.ts` (`power`, `effect`), `src/models/enums/effect-type.enum.ts` (`hunger`), `src/economy/trade/trade-inventory.ts` (`applyTradeToInventory` :104-117, `soldQuantityGuards` :120-137), `shop-transaction.service.ts` (`writeInventory` :224-246)
- HP: `status.currentLifePoints`/`maxLifePoints` (`character-status.model.ts` :68-74), `MIN_LIFE_POINTS`/`lifePointsWithin` (`src/quests/outcomes/progression/level-table.ts` :4, :52-55), scrittura degli HP solo in `outcome-plan.ts` :398-404 / `outcome-writer.service.ts`
- Codici: `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts` (factory statiche), `src/graphql/format-domain-error.ts`
- Costanti: `travel-timing.ts:6`, `src/quests/party/party-rules.ts`, `src/shops/shop-pool.constants.ts`, `src/quests/generation/generation-rules.ts`, `placeholder-combat-resolver.ts:17-25`

### Established Patterns
- «Il filtro è la regola»: un solo `findOneAndUpdate` condizionale con i valori riaffermati nel filtro; rilettura + classificazione quando non matcha (Phase 4/8)
- Letture lean fuori dalla scrittura; populate dei ref solo dove serve il nome (Phase 8 D-21, Phase 13 populate)
- Codici stabili `GameRuleException` con messaggio italiano, un rifiuto non scrive nulla (Phase 8 D-19)
- Moduli puri testati a unit, integration sul replica set con fixture `persist*`, `--runInBand`
- SDL additivo con eccezioni dichiarate; `git diff --exit-code src/schema.gql` in CI

### Integration Points
- `TravelPreview` è il tipo di ritorno di `travelPreview` e la base della nuova anteprima per la quest: i campi nuovi servono entrambe
- `startTravelFilter`/`laneClaimFilter` sono i due punti di scrittura della partenza: il consumo entra lì, in un solo update ciascuno
- `TravelPlannerService.planAuto` è già il calcolo del movimento dell'accettazione: l'anteprima della quest lo riusa senza scrivere
- `EXPECTED_OWNER_ONLY_HANDLERS` e la whitelist dei resolver del boot reale vanno aggiornate per la query nuova
- La FE Phase 15 aspetta la merge di questa fase: SDL e handoff chiudono la fase

</code_context>

<specifics>
## Specific Ideas

- Utente 2026-11-05 (free text sul foglio FE, vale anche per il messaggio del codice): «al posto di "Non arriveresti vivo" mettiamo "Non hai cibo a sufficienza per il viaggio"».
- Numeri usati per confermare le scale (DB di sviluppo, handoff Phase 8 §8): 964 strade, `speedFactor` 3–7 (mediana 5), città → città più vicina mediana 2,72 h / 15,8 km, qualsiasi 35,4 h / 204 km, max 82,3 h / 506 km; 4 personaggi di prova con 0–2 unità di cibo (per la UAT il cibo va dato a DB).
- Esempi di riferimento per i test: ROADMAP «60 richiesti con un 50 e tre 20 → i tre 20»; discuss «60 con 50, 10, tre 20 → 50+10»; «10 con il solo 200 → mangia il 200»; «55 richiesti, 20 posseduti → mangia i 20, 35/55 della distanza scoperti».

</specifics>

<deferred>
## Deferred Ideas

- **Scelta manuale del cibo** da parte del giocatore (lista nel foglio) — mai discussa come necessità; il server sceglie.
- **Tetto allo spreco / tutela del cibo raro** — scartato (D-05); eventuale costante futura.
- **Rimborso del cibo** su teleport o imboscata — no (D-13, BE-AMBUSH-05).
- **Fame fuori dal viaggio** (campeggio, attesa del party) — non in v1.0.
- **`hpAfter` esposto sul filo** — non serve al FE (ha `currentLifePoints` e `hpLost`).
- **HP sulla Mappa** — FE, fuori fase (la Mappa non mostra HP; il Diario sì).

</deferred>
