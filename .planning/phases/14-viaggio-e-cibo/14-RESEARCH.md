# Phase 14: Viaggio e cibo - Research

**Researched:** 2026-11-05
**Domain:** NestJS 11 + Mongoose 8.18 + Apollo code-first — consumo condizionale dell'inventario e degli HP alla partenza del viaggio, anteprime GraphQL additive
**Confidence:** HIGH (tutto verificato sul codice del branch `feat/14-viaggio-e-cibo`, `df3d641`; nessuna libreria nuova)

## Summary

La fase è interamente codice di dominio dentro uno stack già in uso: nessuna dipendenza nuova, nessuna variabile d'ambiente, nessuna migrazione. Il lavoro si divide in quattro blocchi: (1) un modulo puro `src/travel/food/` (fabbisogno, selezione a scarto minimo, km scoperti, vita triangolare, piano completo) testato a unit; (2) un lettore iniettabile della «dispensa» (gli `ownedItems` `hunger` del personaggio con `power`/`sellPrice` dal catalogo `LootItem`, più gli HP) in `TravelPlanningModule`, già importato sia da `TravelModule` sia da `QuestAcceptanceModule`; (3) i due punti di scrittura — `startTravel` (`src/travel/travel.service.ts:65-86`) e il claim di `acceptQuest` (`src/quests/acceptance/quest-acceptance.service.ts:342-368`) — estesi con guardie sulle quantità e sugli HP nel filtro e con il `$set` di `assets.ownedItems` + `status.currentLifePoints`; (4) SDL additivo (`TravelFoodItem`, tre campi su `TravelPreview`, query nullable `questTravelPreview`) con le asserzioni a stringa esatta di `test/app.int-spec.ts` aggiornate RED prima.

La scoperta che cambia il CONTEXT è sulla concorrenza (D-12). Il `$set` dell'array `assets.ownedItems` intero, ricalcolato da una lettura lean fatta **fuori** da una transazione, può cancellare una scrittura concorrente che le guardie `$elemMatch` non vedono: un acquisto al negozio di un oggetto diverso dal cibo (le monete restano scalate e l'oggetto sparisce) oppure le ricompense di una story/worldMission risolta mentre il personaggio parte. Oggi gli unici altri scrittori di `assets.ownedItems` (negozio `shop-transaction.service.ts:182-246`, esiti `outcome-plan.ts:398-404`) leggono **dentro** la sessione e si affidano al WriteConflict della transazione: il commento di `trade-inventory.ts:119` dice proprio che le guardie sulle quantità sono solo «rete di sicurezza, la contesa la risolve il WriteConflict della transazione». `startTravel` invece non usa transazioni, e `accept` legge il personaggio prima di aprirla (`quest-acceptance.service.ts:145`, `:310-319`). La soluzione consigliata: in entrambi i casi la dispensa si legge **in sessione dentro il callback della transazione** e il piano del cibo si ricalcola lì, come fa il negozio. Le guardie restano nel filtro come rete di sicurezza.

Il resto del CONTEXT regge sul codice. La durata comprende già pet e ferite (`travel-planner.service.ts:192-197`, `travel-timing.ts:37-39`). `applyTradeToInventory` si riusa così com'è, esprimendo il consumo come righe `sell`. `soldQuantityGuards` accetta già le guardie extra (l'HP). `planAuto` è riusabile per l'anteprima della quest. La DP sul fabbisogno (fino a ~16 460 power nel caso peggiore con ferite) gira in ~12 ms anche su 33 stack da 2 miliardi di unità (probe nello scratchpad).

**Primary recommendation:** modulo puro `travel-food.ts` + `TravelPantryReader` in `TravelPlanningModule`. `startTravel` passa a una transazione con la lettura della dispensa in sessione (pattern `ShopTransactionService.applyTrade`). Il claim legge la dispensa nel callback prima di `claimLane`. Le guardie `soldQuantityGuards(sellLines, [hpGuard])` stanno nel filtro, `applyTradeToInventory` calcola il `$set`. Il rifiuto `TRAVEL_STARVING` arriva sia nella pre-verifica sia (in corsa) dentro il callback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Fabbisogno e vita (BE-FOOD-01, BE-FOOD-03)
- **D-01 (utente, confermato coi numeri reali):** **1 power = 3 minuti di marcia**: fabbisogno = ⌈`durationMs` / 180 000⌉ power, dove la durata è quella del pianificatore (`durationMsOf`: Σ km/`speedFactor`, velocità 10 × pet × fattore ferite). Ordini di grandezza sul DB (senza pet): città → città più vicina mediana 2,7 h → 55 power, città → marker quest 2,6 h → 52, città → città qualsiasi mediana 35 h → 700, attraversata massima 82 h → 1646; a catalogo 33 cibi `hunger` da 5 a 200 power («Razione da viaggio» 100, «Pane di Elfo» 200). Un pet ×2 dimezza, Pegaso ×4 divide per quattro; una ferita che allunga il tempo allunga il cibo.
- **D-02 (utente, confermato coi numeri):** **vita persa triangolare**: il km scoperto n-esimo costa n HP, totale n(n+1)/2. Senza cibo: 16 km → 136 HP, 50 → 1275, 100 → 5050, 204 → 20 910, 506 → 128 271; un rookie (1000 HP) regge ≤ 44 km scoperti, un legend (40 000) ≤ 282. Costo in HP assoluto, non in percentuale dei massimi.
- **D-03 (utente):** **km scoperti arrotondati per eccesso**: km scoperti = ⌈(fabbisogno − coperto) / fabbisogno × distanza⌉ con `distanza` = `TravelPreview.distance` (km di gioco della polilinea); esempio: fabbisogno 55, coperto 40, 16 km → 4,36 → 5 km → 15 HP. Fabbisogno coperto → 0 km → 0 HP.
- **D-04 (utente):** **cibo insufficiente con vita sufficiente → si parte lo stesso**: il server consuma tutto il cibo posseduto e il resto del fabbisogno è scoperto; il rifiuto scatta solo quando `currentLifePoints − hpLost < 1` (`MIN_LIFE_POINTS`). Gli HP sono scalati alla partenza (o al claim), mai sotto 1; l'arrivo non tocca nulla.
- **D-05 (utente):** **se può coprire, il server copre sempre**, anche quando l'unica combinazione che copre spreca molto (fabbisogno 10, unico cibo «Pane di Elfo» 200 → lo mangia). Il giocatore vede l'anteprima e può rinunciare o comprare cibo piccolo; nessun tetto allo spreco.

#### Selezione del cibo (BE-FOOD-02)
- **D-06 (utente):** **scarto minimo, poi meno pezzi, poi minor valore di vendita.** Le unità sono gli `ownedItems` con `effect: hunger` espansi per quantità (uno stack da 2 = due unità separate); fra le combinazioni che coprono il fabbisogno vince lo scarto minimo (60 richiesti con un 50 e tre 20 → i tre 20); a parità di scarto vince quella con meno unità (60 con un 50, un 10 e tre 20 → 50+10); a parità di unità vince il minor `sellPrice` totale; poi ordine stabile per id. Un'unità usata in parte è consumata intera. Quando la somma di tutto il cibo non copre il fabbisogno si consuma tutto (D-04).
- **D-07 (default tecnico, per il veto):** **modulo puro con costanti in codice di dominio** (pattern `BASE_SPEED` in `travel-timing.ts`, `PLACEHOLDER_RULES`, `generation-rules.ts`): ad esempio `src/travel/food/travel-food.ts` con `FOOD_RULES = { minutesPerPower: 3, minLifePoints: 1 } as const` e funzioni pure (fabbisogno dalla durata, selezione dalle unità possedute, km scoperti, vita persa, piano completo `{ consumed: [{ item, quantity }], needed, covered, uncoveredKm, hpLost, hpAfter, arrivesAlive }`). Algoritmo di selezione a discrezione del planner (subset-sum/DP sul power con limite fabbisogno + unità più grande è sufficiente: unità ≤ qualche decina, power ≤ 200). Nessuna variabile d'ambiente.

#### Anteprime (BE-FOOD-04)
- **D-08 (utente):** **query owner-only dedicata per la quest** (es. `questTravelPreview(request: AcceptQuestRequest!)`, nome definitivo nelle REPO-RULES): restituisce la stessa forma di `travelPreview` **nullable** — `null` quando l'accettazione non comporta un viaggio (marker uguale alla posizione, oppure salto istantaneo senza strada, Phase 8 D-03). Calcola il movimento come `movementTo`/`planAuto` dell'accettazione sul personaggio corrente, senza scrivere. Rifiuti: `NOT_FOUND` (quest, personaggio), `FORBIDDEN` (non owner), `QUEST_NOT_IN_CITY` come l'accettazione; **non** valuta corsia, titolo, posti e punti (sono dello swipe). Scartata l'alternativa del campo sulla `Quest` risolto per il viewer (fotografato al caricamento del Tabellone).
- **D-09 (utente):** **le anteprime rispondono coi numeri, mai col codice di fame**: `TravelPreview` guadagna in modo additivo `food: [TravelFoodItem!]!` (`{ item: LootItem!, quantity: Int! }`, `item` popolato per il nome), `hpLost: Int!`, `arrivesAlive: Boolean!` (nomi definitivi nelle REPO-RULES); con `arrivesAlive: false` il FE spegne «Parti»/lo swipe e mostra «Non hai cibo a sufficienza per il viaggio». Le altre regole e i codici di `travelPreview` restano quelli della Phase 8 D-11.
- **D-10 (utente):** **la partenza ricalcola sul cibo del momento e parte con la nuova selezione**: l'anteprima è informativa; nessun codice «cibo cambiato», nessun passaggio dell'anteprima nella mutation; la verità arriva via `characterUpdated`.

#### Partenza, claim e rifiuto (BE-FOOD-03, BE-FOOD-05)
- **D-11 (utente/roadmap):** **un solo codice `TRAVEL_STARVING`** (`GameRuleErrorCode` + factory in `GameRuleException`, messaggio italiano «Non hai cibo a sufficienza per il viaggio») per `startTravel` e per `acceptQuest` con viaggio automatico; valutato dopo i rifiuti esistenti (`travel-rules.ts`: meta, soccorso, viaggio in corso, quest in corso, stessa posizione, nessuna strada; per la quest dopo `classifyEligibility`, città e movimento) e **prima di qualunque scrittura** (nessun punto canale scalato, nessuna registrazione).
- **D-12 (default tecnico, per il veto):** **consumo nello stesso update condizionale della partenza o del claim.** `startTravel`: letture lean estese a `assets.ownedItems` (con i `LootItem` `hunger` → `power`, `sellPrice`) e `status.currentLifePoints`; il `findOneAndUpdate` di `travel.updates.ts` guadagna nel filtro un `$elemMatch` per ogni stack consumato (`item` + `quantity` ≥ n, pattern `soldQuantityGuards` di `trade-inventory.ts`) e l'uguaglianza di `status.currentLifePoints`, e nell'update il `$set` dell'array `assets.ownedItems` intero ricalcolato (stack a 0 rimossi, pattern `applyTradeToInventory`/`outcome-plan.ts`) più `status.currentLifePoints` e `activeTravel`. `acceptQuest`: la proiezione del personaggio (`quest-acceptance.service.ts`) guadagna `assets.ownedItems` e `status.currentLifePoints`; `laneClaimFilter`/`laneClaimUpdate` estesi allo stesso modo dentro la transazione del claim; il salto (`kind: 'jump'`) e il «nessun movimento» non consumano nulla. Filtro non matchato per cibo/HP cambiati: a discrezione del planner (un solo nuovo tentativo del piano oppure il codice esistente più vicino), documentato nel handoff.
- **D-13 (utente/roadmap):** **teleport e salto istantaneo non consumano**; completamento, reconciler, sweep, push `travelEnd` e teleport invariati; il cibo mangiato resta mangiato anche se l'oste teletrasporta a viaggio iniziato o l'imboscata (Phase 15) devia il viaggio.
- **D-14 (default tecnico):** **SDL additivo** (tre campi su `TravelPreview`, tipo `TravelFoodItem`, una query nuova; riuso di `AcceptQuestRequest { id, questId }` come input), `EXPECTED_OWNER_ONLY_HANDLERS` e whitelist del boot reale aggiornate, `src/schema.gql` rigenerato e committato; nessun documento FE seleziona campi tolti. Handoff **`BACKEND-NOTES.md`** per la FE Phase 15: SDL verbatim, tabella dei codici con l'azione FE, semantica (fabbisogno, selezione, km scoperti, triangolare, soglia), esempi numerici del discuss, dati per la UAT (cibo da dare a DB al personaggio di prova: coperto, parziale, rifiutato).
- **D-15 (default tecnico):** **TDD.** Unit sul modulo puro (esempi della ROADMAP e del discuss: 60 con 50+20+20+20; 60 con 50+10+20×3; 10 con il 200; cibo zero; arrotondamento 4,36 → 5; triangolare; soglia 1 HP). Integration (replica set, fixture `persistCharacter`/`persistCity`/`persistQuest`/`persistRoad` esistenti): viaggio coperto, parziale (HP scalati), rifiutato; pet ×2 dimezza, ferita `movementImpairment` allunga, strada lenta costa più della pianura; concorrenza fra due partenze con lo stesso cibo → una sola riesce; `acceptQuest` coperto e rifiutato; teleport senza consumo; anteprima della quest `null` senza viaggio. Tooling: `npx prettier --write` + `npx eslint` solo sui file toccati, `npx tsc --noEmit` come gate di build (**mai `npm run build`** mentre il BE dell'utente gira da `dist/`), percorsi jest prima di `--selectProjects`, integration con `--runInBand`, `npm run test:cov` alla chiusura.

### Claude's Discretion
- Algoritmo esatto della selezione, nomi di tipi/campi/query/funzioni (fissati nelle REPO-RULES), posizione del rifiuto per fame nell'ordine dei codici, gestione del filtro fallito per cibo/HP (D-12), forma del populate di `food.item`, log a INFO/WARN, forma delle fixture.

### Deferred Ideas (OUT OF SCOPE)
- **Scelta manuale del cibo** da parte del giocatore (lista nel foglio) — mai discussa come necessità; il server sceglie.
- **Tetto allo spreco / tutela del cibo raro** — scartato (D-05); eventuale costante futura.
- **Rimborso del cibo** su teleport o imboscata — no (D-13, BE-AMBUSH-05).
- **Fame fuori dal viaggio** (campeggio, attesa del party) — non in v1.0.
- **`hpAfter` esposto sul filo** — non serve al FE (ha `currentLifePoints` e `hpLost`).
- **HP sulla Mappa** — FE, fuori fase (la Mappa non mostra HP; il Diario sì).

### Nomi del contratto già fissati (`14-REPO-RULES.md`, 2026-11-05)
`type TravelFoodItem { item: LootItem!  quantity: Int! }`; `TravelPreview.food: [TravelFoodItem!]!`; `TravelPreview.hpLost: Int!`; `TravelPreview.arrivesAlive: Boolean!`; `questTravelPreview(request: AcceptQuestRequest!): TravelPreview` (nullable, owner-only); `TRAVEL_STARVING` con messaggio «Non hai cibo a sufficienza per il viaggio».
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-FOOD-01 | Modulo puro con costanti: fabbisogno = ⌈durata / 3 min⌉ power (durata già comprensiva di terreno, pet, ferite) | §Pattern 1. La durata comprende già pet e ferite (`travel-planner.service.ts:192-197`, `travel-timing.ts:37-39`, `injury-rules.ts:108-112`). Le costanti seguono il pattern di `travel-timing.ts:6` e `level-table.ts:4` |
| BE-FOOD-02 | Selezione a scarto minimo fra gli `ownedItems` `hunger`, poi meno unità, poi minor valore di vendita; consumato intero; cibo insufficiente → tutto | §Pattern 2: DP bounded-knapsack con splitting binario, provata sugli esempi (scratchpad `food-dp.mjs`). Il valore di vendita in rame viene da `toCopper` (`src/economy/coins.ts:13-19`) |
| BE-FOOD-03 | Km scoperti per eccesso, HP n(n+1)/2, soglia ≥ 1 HP, `TRAVEL_STARVING` senza scritture | §Pattern 1 e §Pitfall 4 (virgola mobile). Factory sul modello di `game-rule.exception.ts:148-153`. La spec `game-rule.exception.spec.ts:221-225` impone di aggiungere un caso |
| BE-FOOD-04 | `travelPreview` additivo (`food`, `hpLost`, `arrivesAlive`); query owner-only nullable per la quest | §Pattern 5/6: `TravelPreview` in `src/models/travel-preview.model.ts:5-15`. Gli `id` dei `LootItem` si risolvono solo da documenti idratati (§Pitfall 3). Le asserzioni RED stanno in `test/app.int-spec.ts:145,155,589-596` |
| BE-FOOD-05 | Consumo e HP nello stesso update condizionale di partenza/claim; teleport e salto esenti | §Pattern 3/4 e §Pitfall 1 (lost update): la lettura in sessione sta dentro la transazione. `applyTradeToInventory` (`trade-inventory.ts:104-117`) e `soldQuantityGuards` (`:120-137`) si riusano |
| BE-FOOD-06 | Integration su coperto, parziale, rifiutato, modificatori, concorrenza; handoff FE 15 | §Validation Architecture: `travel.service.int-spec.ts` (con `raceAfterPlanning` :105-118), `quest-acceptance.service.int-spec.ts` (`describe` :1003 sul viaggio automatico), `travel.resolver.int-spec.ts`, fixture `persistLootItem` (`test/fixtures/catalog-item.fixture.ts:29-48`) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack non negoziabile: NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis. Nessuna libreria nuova serve a questa fase.
- **TDD Red → Green → Refactor** obbligatorio. Clean Code, SoC, Boy Scout Rule.
- **Il backend è fonte di verità**: il FE non calcola né cibo né HP (FE 15 CONTEXT D-01/D-02).
- **Compatibilità FE**: i contratti GraphQL esistenti non si rompono; le aggiunte arrivano su develop prima delle fasi FE che le consumano (FE 15 D-09 aspetta la merge).
- Branch + PR verso `develop`, mai push diretto; Conventional Commits; **nessun trailer `Co-Authored-By` / `Generated with`** (regola dell'utente in `14-REPO-RULES.md`).
- Nessun secret in repo; mai leggere `.env`; `process.env.` solo nei provider di config (drift test `src/config/env-example.drift.spec.ts`).
- Da `14-REPO-RULES.md`: mai `npm run lint`/`npm run build`/`nest build`; `npx tsc --noEmit -p tsconfig.json` come gate; jest con i percorsi prima di `--selectProjects`, integration `--runInBand`, mai in background; SDL solo additivo (`git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` vuoto); operatori Mongo solo in code span nei `.md` e mai nei titoli dei test; nessuna migrazione o seeder; nessun `Math.random` nel modulo del cibo.

## Standard Stack

### Core (già installato, nessuna aggiunta)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | ^8.18.1 (`package.json:52`) | `findOneAndUpdate` condizionale, `connection.transaction`, `$elemMatch` | Lo stesso pattern di negozio, claim ed esiti [VERIFIED: codebase] |
| @nestjs/graphql | 13.2.0 | `@ObjectType`/`@Field`/`@Query(() => T, { nullable: true })` | Code-first, `sortSchema: true` (`src/graphql/graphql-options.factory.ts:54`) [VERIFIED: codebase] |
| class-validator | in uso | `@IsObjectIdHex` su `AcceptQuestRequest` (`src/models/request/accept-quest-request.model.ts:5-13`) | Input riusato, nessun input nuovo [VERIFIED: codebase] |
| jest 30 + ts-jest + mongodb-memory-server ^11.2.0 | `package.json:74-75` | unit + integration su replica set | Harness esistente [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Transazione con lettura in sessione + `$set` dell'array intero (consigliato) | Update a pipeline (`$map`/`$filter` su `$assets.ownedItems`, `$subtract` sugli HP) senza transazione | La pipeline è atomica sul documento corrente e tiene il «solo update» di Phase 8 D-21, ma tutto l'update diventa pipeline (`status.activeTravel` va avvolto in `$literal`, Mongoose non fa cast) e non riusa `applyTradeToInventory`. La transazione è il pattern già in uso (negozio, esiti, claim) |
| DP bounded-knapsack | Enumerazione delle combinazioni / greedy | Il greedy sbaglia il caso «60 con 50 + 20×3» (prende il 50 e poi un 20 → scarto 10). L'enumerazione è esponenziale e le quantità non hanno tetto (`MAX_ITEM_QUANTITY` = 2^31−1, `trade-inventory.ts:44`) |

**Installation:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/travel/food/
├── travel-food.ts             # FOOD_RULES + funzioni pure (fabbisogno, selezione, km, HP, piano)
├── travel-food.spec.ts        # unit: esempi ROADMAP/discuss, bordi, determinismo
├── travel-food.updates.ts     # puro: righe sell, guardie del filtro, $set (riusa trade-inventory)
├── travel-food.updates.spec.ts
├── travel-pantry.reader.ts    # @Injectable: dispensa (ownedItems hunger + catalogo) + HP, opz. in sessione
└── travel-pantry.reader.int-spec.ts
src/models/travel-food-item.model.ts   # @ObjectType TravelFoodItem { item: LootItem, quantity: Int }
```
`TravelPantryReader` va in `TravelPlanningModule` (`src/travel/travel-planning.module.ts:28-46`), che deve registrare `LootItem` in `forFeature` ed esportarlo. Il modulo è già importato da `TravelModule` (`travel.module.ts:40`) e da `QuestAcceptanceModule` (`quest-acceptance.module.ts:29`), quindi nessun ciclo nuovo. La query `questTravelPreview` va su `QuestAcceptanceResolver` (che ha già il service e `AuthzModule`): l'handler diventa `QuestAcceptanceResolver.questTravelPreview`.

### Pattern 1: modulo puro con costanti (BE-FOOD-01/03)
**What:** costanti `as const` nel modulo di dominio (come `BASE_SPEED` `travel-timing.ts:6`, `MIN_LIFE_POINTS` `level-table.ts:4`, `SHOP_ALLOWED_RARITIES` `shop-pool.constants.ts:6`).
```typescript
// src/travel/food/travel-food.ts — schema consigliato, nomi interni a discrezione
export const FOOD_RULES = { minutesPerPower: 3, minLifePoints: MIN_LIFE_POINTS } as const;
const MS_PER_POWER = FOOD_RULES.minutesPerPower * 60_000; // 180 000

export const foodNeededFor = (durationMs: number): number =>
    durationMs > 0 ? Math.ceil(durationMs / MS_PER_POWER) : 0;

// moltiplicare prima di dividere: 15 × 16 / 55 = 4,36 → 5 (D-03); bisogno 0 ⇒ 0 km
export const uncoveredKmOf = (needed: number, covered: number, distanceKm: number): number =>
    needed <= covered ? 0 : Math.ceil(((needed - covered) * distanceKm) / needed);

export const hpLostFor = (uncoveredKm: number): number => (uncoveredKm * (uncoveredKm + 1)) / 2;
```
`FOOD_RULES.minLifePoints` deve riusare `MIN_LIFE_POINTS` di `level-table.ts:4` invece di ripetere il letterale `1`. Gli HP «prima» si leggono con la semantica di `statusFactsOf` (`src/quests/outcomes/progression/status-facts.ts:23-35`: `currentLifePoints ?? maxLifePoints`, e `maxLifePoints` dalla tabella se manca).

### Pattern 2: selezione a scarto minimo (BE-FOOD-02, D-06)
**Algoritmo consigliato (provato):** bounded knapsack lessicografico.
1. Unità valide: voci di `ownedItems` con `itemType === 'LootItem'`, catalogo `effect === 'hunger'`, `power` intero > 0, `quantity` intero ≥ 1 (pattern `ownedLootOf` in `combat-context.ts:138-145`). Gli stack si ordinano per id esadecimale crescente, così l'esito è deterministico.
2. `total = Σ power × quantity`. Se `total < needed` si consuma tutto (D-04). Se `needed === 0` non si consuma nulla.
3. Tetto `C = needed + maxPower − 1`: una combinazione minima che copre ha somma `< needed + p` per ogni sua unità `p`, quindi non serve guardare oltre.
4. Per ogni stack le copie utili sono `min(quantity, ⌈C / power⌉)`, divise in pacchetti binari (1, 2, 4, …). Il costo è additivo (`count`, `sellCopper`), quindi lo splitting resta corretto.
5. Si fa una DP 0/1 su `s ∈ [0, C]` con valore `(count, sellCopper)` e confronto lessicografico; la cella si aggiorna solo con un miglioramento **stretto**, così vince l'ordine stabile per id. Una tabella di scelte `Uint8Array(C+1)` per pacchetto serve alla ricostruzione.
6. La somma coperta è il primo `s ≥ needed` raggiungibile: scarto minimo, poi meno unità, poi minor valore di vendita.

**Bound misurato** (`/private/tmp/claude-501/-Users-lucatabbia-Personale-Code-Klimmeck-Guide-Klimmeck-Guide/3715ef0b-39ac-49f8-8e8c-7d3d45b562d0/scratchpad/food-dp.mjs`, Node 26):
- Esempi: 60 con {50, 20×3} → 20×3; 60 con {50, 10, 20×3} → 50+10; 10 con {200} → 200; 55 con {20} → tutto, coperto 20.
- **Caso peggiore:** fabbisogno 16 460 power (attraversata 82 h × fattore ferite minimo 0,1, `MIN_INJURY_FACTOR` in `injury-rules.ts:80`, cioè durata ×10), 33 stack da 2·10^9 unità → **12,3 ms**.
- **Caso realistico:** 5 stack, fabbisogno 700 → 0,03 ms.

La quantità per stack non ha tetto di gioco (`MAX_ITEM_QUANTITY`, `trade-inventory.ts:44`). Il numero reale di unità per personaggio non l'ho misurato sul DB (vietato in questa ricerca); il CONTEXT dà 0–2 unità sui personaggi di prova. Non importa: il bound non dipende dalle quantità.

### Pattern 3: partenza libera in transazione (BE-FOOD-05) — consigliato, cambia D-12
**Oggi:** `planFree` fa letture lean, poi un `findOneAndUpdate(startTravelFilter, startTravelUpdate)` senza sessione, poi la rilettura `classifyUnstarted` (`travel.service.ts:65-86`, `travel.updates.ts:39-66`).
**Consigliato:** `planFree` resta fuori dalla transazione e rifiuta ancora con le regole di Phase 8. Nel callback di `connection.transaction`, nell'ordine:
1. `pantry = reader.read(characterId, session)`: lettura in sessione di `assets.ownedItems`, `status.currentLifePoints`, `status.maxLifePoints`, `status.xp` più il catalogo `LootItem`, in sequenza e mai con `Promise.all` in sessione (Pitfall 6 del negozio, `shop-transaction.service.ts:181`).
2. `food = planTravelFood({ durationMs: plan.travel.duration, distanceKm: plan.travel.road.distance, hpBefore, pantry })`.
3. `if (!food.arrivesAlive) throw GameRuleException.travelStarving()`: la transazione abortisce e non scrive nulla.
4. `findOneAndUpdate(startTravelFilter(id, location, departureGuards(food, hpRaw)), startTravelUpdate(travel, departureSet(food, ownedItems)), { session, projection: { _id: 1 } })`.
5. Se non matcha, rilettura in sessione e `classifyUnstarted` (invariato).

Il job (`scheduler.schedule`) resta dopo il commit, come oggi. Con un WriteConflict il driver riesegue il callback e la dispensa si rilegge: «la partenza ricalcola sul cibo del momento» (D-10) viene gratis e la gestione del «filtro fallito per cibo/HP» (D-12, a discrezione) si riduce al caso in cui le guardie di rete scattano, che dentro la transazione è irraggiungibile salvo bug.

**Preview:** `TravelService.preview` usa lo stesso `reader.read(characterId)` senza sessione e lo stesso `planTravelFood`. Non rifiuta mai per fame (D-09) e popola `food[].item` (Pattern 6).

### Pattern 4: claim dell'accettazione (BE-FOOD-05)
In `accept` (`quest-acceptance.service.ts:136-235`):
- **Pre-verifica** dopo `movementTo` (`:154-157`): se `movement?.kind === 'travel'`, il piano del cibo si calcola su una lettura della dispensa (fuori sessione) e se `!arrivesAlive` scatta `TRAVEL_STARVING` prima della transazione. Questo rispetta D-11: dopo eligibility, città e movimento, prima dei punti.
- **Nel callback**, prima di `claimLane` (`:182-191`): rilettura della dispensa in sessione e ricalcolo del piano. Se ora affama, scatta `TRAVEL_STARVING` (abort, nessuna scrittura né debito). Poi `laneClaimFilter(..., guards)` / `laneClaimUpdate(lane, pendingQuestId, movement, foodSet)`.
- Il salto (`kind: 'jump'`), il «nessun movimento» (`null`) e le corsie story/worldMission non leggono la dispensa e non toccano niente.
- Ordine: `TRAVEL_STARVING` arriva prima di `INSUFFICIENT_POINTS`, che sta nel callback dopo il claim (`:211-212`).

`laneClaimFilter`/`laneClaimUpdate` e `startTravelFilter`/`startTravelUpdate` vanno estesi con un **parametro opzionale finale** (default «nessun consumo» = `{}`). Così le asserzioni `toEqual` esistenti restano verdi: `travel.updates.spec.ts:39-61`, `quest-acceptance.updates.spec.ts:30-99`. `soldQuantityGuards` restituisce `{ $and: [...] }`, e nessuno dei due filtri ha già un `$and` (`travel.updates.ts:43-49`, `quest-acceptance.updates.ts:53-65`), quindi lo spread non collide.

### Pattern 5: anteprima della quest (BE-FOOD-04, D-08)
Il resolver riusa `AcceptQuestRequest` (gli id malformati danno `BAD_USER_INPUT` dalla validation pipe di Phase 10, nessun input nuovo, `input-decorators.spec.ts` invariata) e `@OwnsCharacter<{ request: AcceptQuestRequest }>(({ request }) => request.id, { ownerOnly: true })`, come `quest-acceptance.resolver.ts:17-20`. Il metodo del service consigliato, `previewTravel(characterId, questId)`:
1. `readQuest` (`:275-285`, `NOT_FOUND` missione), poi `readCharacter` (`:310-319`, `NOT_FOUND` personaggio).
2. `lane = laneOf(type)`; story → `null`; per standard e worldMission `locationInQuestCity` (`:322-340`, `QUEST_NOT_IN_CITY`); worldMission → `null`.
3. `movementTo` (`:256-273`): `null` (marker = posizione) → `null`; `jump` → `null`; `travel` → `TravelPreview` con `distance = travel.road.distance`, `duration`, `road` più i campi del cibo.
4. Niente `costOrReject`, `seatRuleOrReject` né `classifyEligibility` (D-08).

Ereditati da `planAuto`: un marker senza documento POI risponde `QUEST_NOT_ACCEPTABLE` (`travel-planner.service.ts:147-152`), da documentare nel handoff. Il salto senza strada **logga un WARN a ogni anteprima** (`:157-161`): vedi Open Question 3.

### Pattern 6: tipi GraphQL code-first
```typescript
// src/models/travel-food-item.model.ts
@ObjectType()
export class TravelFoodItem {
    @Field(() => LootItem)
    item: LootItem;

    @Field(() => Int)
    quantity: number;
}
// src/models/travel-preview.model.ts (aggiunte)
@Field(() => [TravelFoodItem]) food: TravelFoodItem[];
@Field(() => Int) hpLost: number;
@Field(() => Boolean) arrivesAlive: boolean;
// resolver
@Query(() => TravelPreview, { nullable: true })
questTravelPreview(@Args('request', { type: () => AcceptQuestRequest }) request: AcceptQuestRequest): Promise<TravelPreview | null>
```
SDL atteso con `sortSchema: true`, in ordine alfabetico:
`type TravelPreview {\n  arrivesAlive: Boolean!\n  distance: Float!\n  duration: Float!\n  food: [TravelFoodItem!]!\n  hpLost: Int!\n  road: TravelPath!\n}`
`type TravelFoodItem {\n  item: LootItem!\n  quantity: Int!\n}`
`questTravelPreview(request: AcceptQuestRequest!): TravelPreview`

`LootItem` è già un `@ObjectType` (`src/models/loot-item.model.ts:7-17`; SDL `src/schema.gql:337-348`). Lo si usa direttamente, senza l'`ItemUnion` di `AssetQuantity` (`src/models/common/item.union.ts`). Nota: `LootItem.effect` è `String!` sul filo, non l'enum. La modifica è puramente additiva: un tipo nuovo, tre campi di output nuovi, una query nuova, nessuna riga tolta [VERIFIED: lettura di `schema.gql` e di `app.int-spec.ts`].

### Anti-Patterns to Avoid
- **`$set` dell'array intero da una lettura fatta fuori dalla transazione:** è un lost update (Pitfall 1).
- **`lean()` sui `LootItem` restituiti in `food[].item`:** `id` arriva null (Pitfall 3).
- **Rifiutare l'anteprima con `TRAVEL_STARVING`:** D-09 lo vieta; l'anteprima risponde `arrivesAlive: false`.
- **Scrivere HP o inventario quando `hpLost === 0` / `consumed` è vuoto:** si aggiungerebbero guardie e conflitti inutili. In quel caso niente guardia e niente `$set` per quel campo.
- **Chiamare il piano del cibo da teleport, completamento, sweep o dalla deviazione dell'imboscata (Phase 15):** D-13.
- **Flag booleano su `planAuto` per «non loggare»:** Clean Code del progetto. Meglio separare il calcolo dal log (Open Question 3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Nuovo `ownedItems` dopo il consumo | Splice manuale degli stack | `applyTradeToInventory(assets, sellLines)` (`trade-inventory.ts:104-117`) con righe `{ direction: 'sell', kind: 'LootItem', itemId, quantity }` | Rimuove gli stack a 0, lancia `ITEM_NOT_OWNED`/`INSUFFICIENT_ITEM_QUANTITY` se il piano è incoerente, confronta gli id con `sameId` sui legacy stringa. `vacatedSlots` vale solo per `EquipmentItem` e qui è vuoto |
| Guardie sulle quantità nel filtro | `$elemMatch` scritti a mano | `soldQuantityGuards(sellLines, [hpGuard])` (`trade-inventory.ts:120-137`) | Copre già entrambe le forme dell'id (`idForms`) e accetta guardie extra |
| Valore di vendita | Somma di gold/silver/copper a mano | `toCopper` (`src/economy/coins.ts:13-19`) | Le denominazioni mancanti valgono 0 |
| HP «prima» di un legacy senza campo | `?? 0` | `statusFactsOf` (`status-facts.ts:23-35`) | Stessa semantica di combattimento ed esiti |
| Movimento verso il marker | Copia di `movementTo` | Lo stesso `movementTo`/`planAuto` (estratto in un helper condiviso fra `accept` e `previewTravel`) | D-08: «calcola il movimento come l'accettazione» |
| Codice d'errore | `BadRequestException` ad hoc | Factory statica `GameRuleException.travelStarving()` | `extensions` esattamente `{ code }` (Phase 8 §2) |

## Common Pitfalls

### Pitfall 1: lost update sul `$set` di `assets.ownedItems` (contraddice D-12 così com'è scritto)
**What goes wrong:** `startTravel` legge lean, il negozio fa commit di un acquisto di un oggetto non-cibo, poi `startTravel` scrive l'array ricalcolato dalla lettura vecchia: l'oggetto comprato sparisce e le monete restano scalate. Lo stesso succede con le ricompense di una story/worldMission risolta in quell'istante: story e worldMission non bloccano il viaggio (Phase 8 §3), l'esito scrive `assets.ownedItems` (`outcome-plan.ts:404`) e HP (`:402`). Le guardie `$elemMatch` coprono solo gli stack consumati; l'uguaglianza degli HP copre solo gli HP.
**Why it happens:** negozio ed esiti leggono in sessione e si fidano del WriteConflict (`shop-transaction.service.ts:190-196`, commento `trade-inventory.ts:119`). Un writer non transazionale con lettura vecchia è l'unico punto cieco.
**How to avoid:** lettura della dispensa in sessione dentro la transazione (Pattern 3/4), oppure update a pipeline (Alternatives).
**Warning signs:** un test di integrazione «compra un oggetto fra il piano e la scrittura» (helper `raceAfterPlanning`, `travel.service.int-spec.ts:105-118`, che scrive `$push` su `assets.ownedItems` di un oggetto non-cibo) deve trovare l'oggetto ancora presente dopo la partenza. È il test RED da scrivere per primo.

### Pitfall 2: la lettura del personaggio di `accept` è fuori dalla transazione
`readCharacter` (`quest-acceptance.service.ts:145`) precede `connection.transaction` (`:179`). La snapshot della transazione nasce alla prima operazione in sessione, cioè la lettura va **dentro** il callback e **prima** di `claimLane`, mai in parallelo. Il callback è rieseguibile: ogni stato locale si azzera all'inizio, come `registration.before = null` a `:181`.

### Pitfall 3: `LootItem.id` null dai documenti lean
`idTransformPlugin` (`src/mongoose.plugins.ts:3-23`, registrato in `app.module.ts:130`) agisce solo su `toJSON`/`toObject`. Un `lean()` restituisce `_id` senza `id`, e `LootItem.id: ID!` (`asset-item.model.ts:9-10`) fallisce con «Cannot return null for non-nullable field». Il negozio restituisce documenti **idratati** (`city-shop.service.ts:74-80`). Per `food[].item`: `lootItemModel.find({ _id: { $in: ids } })` senza `lean` (oppure lean con `id` mappato a mano). La selezione invece lavora su una proiezione lean `{ effect, power, sellPrice }` come `resolution-loader.service.ts:436-439`. Servono anche `description: String!` e `itemType: String!` a schema: un `LootItem` di catalogo senza `description` romperebbe l'anteprima, come oggi rompe `character`.

### Pitfall 4: virgola mobile nei km scoperti
`distance` è un float (somma di haversine, `roads.service.ts:43-60`). `⌈(needed − covered) / needed × distance⌉` può dare `⌈5,0000000001⌉ = 6`. Va calcolato come `Math.ceil(((needed − covered) * distance) / needed)` (multiply-then-divide). Un epsilon sarebbe una regola nuova: non introdurlo senza chiederlo (Open Question 5). Nei test i valori attesi si calcolano da `durationMsOf`/`routeBetween` (`travel.service.int-spec.ts:98-101`), mai a mano: la strada A→B di `persistTravelWorld` misura ~22,24 km a `speedFactor` 5 → 16 012 800 ms → 89 power.

### Pitfall 5: HP assente o uguaglianza su `undefined`
Mongoose rimuove le chiavi `undefined` dal filtro, quindi una guardia `{ 'status.currentLifePoints': undefined }` sparisce. Guardia consigliata, solo quando `hpLost > 0`: `{ 'status.currentLifePoints': hpRaw ?? null }` (`null` matcha anche il campo assente), e nel `$set` il valore `hpBefore − hpLost`, sempre ≥ 1 per costruzione. In transazione è solo rete di sicurezza.

### Pitfall 6: asserzioni a stringa esatta da aggiornare RED prima
`test/app.int-spec.ts`:
- `:594-596` `type TravelPreview` esatto → la nuova stringa del Pattern 6.
- `:589-591` elenco `travelPreview(...)`: aggiungere `expect(schema).toContain('questTravelPreview(request: AcceptQuestRequest!): TravelPreview\n')`. Con il `\n` finale si prova che è nullable: senza, la riga con `!` contiene la stessa sottostringa.
- `:130-146` `EXPECTED_OWNERSHIP_HANDLERS` e `:148-156` `EXPECTED_OWNER_ONLY_HANDLERS`: aggiungere `'QuestAcceptanceResolver.questTravelPreview'` dopo `'QuestAcceptanceResolver.acceptQuest'` (la lista è ordinata, `collectHandlersWithMetadata` fa `sort()` a `:208`).
- `:1018-1025`: un blocco «rejects … without a bearer» con una costante `QUEST_TRAVEL_PREVIEW` accanto a `TRAVEL_PREVIEW` (`:82-83`).
- `:487-489` `not.toMatch(/QuestAcceptance|…/)`: `questTravelPreview` non la viola; `:518` `not.toMatch(/TravelKind|\bkind\b/)`: nessun campo `kind`, ok.

`src/gameRules/game-rule.exception.spec.ts:221-225` («covers every GameRuleErrorCode exactly once») è rossa appena si aggiunge l'enum senza il caso: aggiungere il caso `travelStarving` nella stessa RED.

### Pitfall 7: WARN di `planAuto` a ogni anteprima di salto
`travel-planner.service.ts:157-161` logga a ogni `planAuto` senza strada, e `travel-planning.int-spec.ts:420-430` asserisce quel WARN. L'anteprima lo ripeterebbe a ogni apertura del foglio quest (Open Question 3).

### Pitfall 8: soglie di coverage
`package.json:152-210`: `./src/travel/` 97/84/98 e `./src/quests/acceptance/` 97/**91**/98 (statements/branches/lines). `src/travel/food/` ricade nella soglia del viaggio, i rami nuovi del claim in quella dell'accettazione (91% di branch). Ogni ramo va coperto: salto, nessun movimento, `hpLost` 0, nessun consumo, HP legacy assente, `needed` 0. `npm run test:cov` dura ~9 min (538 s in 13.1, `13.1-*-SUMMARY`).

### Pitfall 9: coerenza con il resto (verificato, nessuna contraddizione)
- `activeTravel.kind` resta solo Mongo (`active-travel.model.ts`; `app.int-spec.ts:518`). Il cibo non si persiste su `activeTravel`.
- Il completamento non tocca gli HP: `COMPLETION_UPDATE` imposta solo `location`/`activeTravel` (`travel.updates.ts:81-88`). Sweep e reconciler sono invariati.
- `abandonQuest` è vietato durante il viaggio («né in viaggio né dopo l'avvio», commento in `game-rule.exception.ts:198`). Nessun rimborso da gestire.
- Teleport (`travel.service.ts:89-118`): nessun cambiamento, nessuna lettura della dispensa.
- Phase 15 (imboscata): la deviazione verso la città più vicina non deve rifare il piano del cibo (D-13). Va annotato nel handoff per la BE 15.
- Il salto del claim scrive solo `status.location` (`quest-acceptance.updates.ts:84-86`): nessun consumo.

## Code Examples

### Factory da copiare (verbatim, `src/gameRules/game-rule.exception.ts:148-153`)
```typescript
    static travelNoPath(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRAVEL_NO_PATH,
            'Nessuna strada porta a questa meta',
        );
    }
```
→ `TRAVEL_STARVING = 'TRAVEL_STARVING'` nell'enum (`game-rule-error-code.enum.ts`, dopo `TRAVEL_NO_PATH` a `:21`) e `static travelStarving()` col messaggio `'Non hai cibo a sufficienza per il viaggio'`.

### Guardie e `$set` del consumo (riuso puro)
```typescript
// src/travel/food/travel-food.updates.ts — schema
const sellLinesOf = (consumed: readonly ConsumedFood[]): TradeLine[] =>
    consumed.map(({ itemId, quantity }) => ({ direction: 'sell', kind: 'LootItem', itemId, quantity }));

export function departureGuards(plan: TravelFoodPlan, hpRaw: number | undefined): Record<string, unknown> {
    const hp = plan.hpLost > 0 ? [{ 'status.currentLifePoints': hpRaw ?? null }] : [];
    return soldQuantityGuards(sellLinesOf(plan.consumed), hp);
}

export function departureSet(plan: TravelFoodPlan, assets: InventorySnapshot): Record<string, unknown> {
    return {
        ...(plan.consumed.length > 0
            ? { 'assets.ownedItems': applyTradeToInventory(assets, sellLinesOf(plan.consumed)).ownedItems }
            : {}),
        ...(plan.hpLost > 0 ? { 'status.currentLifePoints': plan.hpAfter } : {}),
    };
}
// travel.updates.ts
export function startTravelUpdate(travel: ActiveTravelDraft, cost: Record<string, unknown> = {}) {
    return { $set: { 'status.activeTravel': travel, ...cost } };
}
```

### Lettura in sessione (pattern del negozio, `shop-transaction.service.ts:188-196`)
```typescript
const snapshot = await this.characterModel
    .findOne(activeCharacterById(characterId), PANTRY_PROJECTION)
    .session(session)
    .lean<PantrySnapshot | null>()
    .exec();
```
`session` nullable per l'anteprima (`.session(null)` va bene, come `shopOrReject` a `:174`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `startTravel` = un solo `findOneAndUpdate` fuori transazione (Phase 8 D-21) | Transazione con lettura in sessione + un solo `findOneAndUpdate` condizionale | Phase 14 (proposta) | Il «solo update» resta vero dentro la transazione; il test «exactly one of two concurrent starts» (`travel.service.int-spec.ts:140-158`) deve restare verde (il secondo vede `activeTravel` → `TRAVEL_IN_PROGRESS`) |

**Deprecated/outdated:** nessuno.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Una scrittura non transazionale fatta dopo la snapshot di una transazione sullo stesso documento fa abortire la transazione con WriteConflict (TransientTransactionError, ritentata da `connection.transaction`) | Pattern 3, Pitfall 1 | Il negozio e gli esiti di oggi si basano già su questo (commento `trade-inventory.ts:119`). Va comunque provato con il test RED di Pitfall 1 [ASSUMED: comportamento MongoDB, non riverificato su docs in questa sessione] |
| A2 | Il numero reale di unità di cibo per personaggio in produzione è piccolo (0–2 sui personaggi di prova, dato del CONTEXT) | Pattern 2 | Nessuno: il bound della DP non dipende dalle quantità |
| A3 | Ordine di `food` sul filo = ordine di `assets.ownedItems` (il FE mostra «l'ordine del BE», FE 15 D-02) | Pattern 6 | Solo estetico; da fissare nel handoff |

## Open Questions (RESOLVED — tutte le raccomandazioni accolte nel CONTEXT il 2026-11-05: D-07/D-08/D-11/D-12 rivisti, D-16..D-20 aggiunti)

1. **Transazione o pipeline per `startTravel` (cambia D-12)?**
   - What we know: il `$set` dell'array intero letto fuori sessione perde scritture concorrenti (Pitfall 1). Entrambe le alternative lo risolvono.
   - Recommendation: **transazione con lettura in sessione** (pattern di negozio ed esiti, riuso di `applyTradeToInventory`, meno trappole). Il CONTEXT va emendato su D-12: «letture lean *in sessione nella transazione*».
2. **Filtro non matchato per cibo/HP (discrezione D-12).**
   - Recommendation: dentro la transazione è raggiungibile solo per bug. La rilettura classifica con i codici esistenti (`classifyUnstarted` → `TRAVEL_IN_PROGRESS`, `classifyUnclaimed` → `QUEST_SLOT_BUSY`). Nessun retry manuale, perché il retry lo fa già il driver sul WriteConflict. Da documentare nel handoff.
3. **WARN del salto nell'anteprima della quest.**
   - Recommendation: separare in `TravelPlanner` un metodo di calcolo senza log, `autoRoute(request)`, da cui `planAuto` deriva aggiungendo il WARN. L'anteprima usa `autoRoute`. `travel-planning.int-spec.ts:420` resta verde e non serve nessun flag booleano.
4. **`questTravelPreview` con `activeTravel`/`awaitingAid` presenti.**
   - What we know: D-08 elenca solo `NOT_FOUND`/`FORBIDDEN`/`QUEST_NOT_IN_CITY`; il FE non chiede l'anteprima durante un viaggio (FE 15 D-04: foglio di sola lettura).
   - Recommendation: nessun codice in più. La risposta calcola dalla `status.location` corrente, quindi è una stima innocua. Documentare `QUEST_NOT_ACCEPTABLE` (marker senza POI), ereditato da `planAuto`.
5. **Epsilon sull'arrotondamento per eccesso.**
   - Recommendation: nessun epsilon, solo multiply-then-divide (Pitfall 4). Il test con l'esempio 55/40/16 → 5 km → 15 HP si fa sulla funzione pura.
6. **Riuso della lettura della dispensa fra pre-verifica e callback dell'accettazione** (doppia lettura).
   - Recommendation: accettarla. La pre-verifica dà `TRAVEL_STARVING` prima di aprire la transazione, come vuole l'ordine D-11; il callback è la verità. Costo: una query in più solo sui viaggi reali.
7. **Ordine della lista `food`.**
   - Recommendation: l'ordine di `assets.ownedItems` (A3), da scrivere nel handoff.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | jest/tsc | ✓ | v26.12.1 | — |
| TypeScript (`npx tsc --noEmit -p tsconfig.json`) | gate di build | ✓ | 5.7.3 | — (misurato: 9,7 s, exit 0 su `df3d641`) |
| mongodb-memory-server (replica set) | integration | ✓ | ^11.2.0 | — (misurato: `travel.service.int-spec.ts` 10/10 verdi in 6,4 s) |
| redis-memory-server | `test/app.int-spec.ts` (boot reale) | ✓ (già usato dalle fasi precedenti) | ^0.17.0 | — |

**Missing dependencies:** nessuna.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest, progetti `unit` (`*.spec.ts`) e `integration` (`*.int-spec.ts`, `globalSetup` replica set) — `package.json:88-140` |
| Config file | `package.json` §`jest` |
| Quick run command | `npx jest src/travel/food --selectProjects unit` (pochi secondi) |
| Integration mirata | `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` (~6 s) |
| Full suite command | `npm run test:cov` (~9 min, gate di chiusura) |
| Boot reale / SDL | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (rigenera `src/schema.gql`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-FOOD-01 | ⌈ms/180 000⌉; 0 ms → 0; costanti | unit | `npx jest src/travel/food/travel-food.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-FOOD-02 | 60 → 20×3; 60 → 50+10; 10 → 200; cibo zero; tutto se insufficiente; parità di unità → minor `sellPrice`; ordine stabile per id; stack legacy con id stringa; non-hunger ignorati | unit | idem | ❌ Wave 0 |
| BE-FOOD-03 | 55/40/16 → 5 km → 15 HP; n(n+1)/2 (16 → 136, 506 → 128 271); soglia: hp − lost = 1 parte, = 0 rifiuta; factory `TRAVEL_STARVING` | unit | idem + `npx jest src/gameRules/game-rule.exception.spec.ts --selectProjects unit` | parziale (spec eccezioni esiste) |
| BE-FOOD-03/05 | guardie e `$set` (riga sell, guardia HP solo se `hpLost` > 0, nessun campo senza consumo) | unit | `npx jest src/travel/food/travel-food.updates.spec.ts src/travel/travel.updates.spec.ts src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit` | parziale |
| BE-FOOD-05 | `startTravel` coperto (stack scalati/rimossi, HP invariati), parziale (tutto il cibo, HP scalati), rifiutato (`TRAVEL_STARVING`, documento identico, nessun job); pet ×2 dimezza; `movementImpairment` allunga; strada lenta > pianura; acquisto concorrente non-cibo sopravvive (Pitfall 1); due partenze → una vince | integration | `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-FOOD-05 | `acceptQuest` con viaggio: coperto, rifiutato (nessun punto scalato, nessuna PendingQuest, nessuna registrazione); salto e marker = posizione non consumano; story/worldMission invariati | integration | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere, `describe` a `:1003`) |
| BE-FOOD-05 | teleport non consuma | integration | `npx jest src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-FOOD-04 | `travelPreview` sul filo con `food { item { id name } quantity } hpLost arrivesAlive`, nessuna scrittura, `arrivesAlive: false` senza errore | integration (wire) | `npx jest src/travel/travel.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere, `it` a `:516`) |
| BE-FOOD-04 | `questTravelPreview`: viaggio → numeri; marker = posizione → `null`; salto → `null`; story → `null`; `QUEST_NOT_IN_CITY`; `NOT_FOUND`; `FORBIDDEN` (anche innkeeper); `BAD_USER_INPUT` su id malformati | integration (wire) | `npx jest src/quests/acceptance/accept-quest.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-FOOD-04/06 | SDL esatto, handler owner-only, UNAUTHENTICATED | integration (boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ (RED prima) |
| BE-FOOD-06 | suite + soglie | full | `npx tsc --noEmit -p tsconfig.json && npm run test:cov` | ✅ |

Fixture: `persistLootItem(model, { effect: 'hunger', power: N, sellPrice })` esiste già (`test/fixtures/catalog-item.fixture.ts:29-48`; il default è `heal`). `ownedItems: [{ itemType: 'LootItem', item: lootId, quantity }]` passa da `characterOverrides.assets` (`buildCharacter` a `character.fixture.ts:46-52` sostituisce `assets` intero: va fatto lo spread di `buildCharacter().assets`). HP di default 100/100 (`:40-41`): senza cibo A→B (~23 km scoperti, 276 HP) è già un rifiuto. Un helper `foodStack(...)` / `persistFood(...)` in `test/travel/` è opzionale (discrezione).

### Sampling Rate
- **Per task commit:** spec mirata (unit o integration `--runInBand`) + `npx tsc --noEmit -p tsconfig.json`.
- **Per wave merge:** le integration di viaggio e accettazione toccate.
- **Phase gate:** `npm run test:cov` + `test/app.int-spec.ts` + `git diff --exit-code src/schema.gql` + SDL additivo.

### Wave 0 Gaps
- [ ] `src/travel/food/travel-food.spec.ts`: BE-FOOD-01/02/03
- [ ] `src/travel/food/travel-food.updates.spec.ts`: guardie e `$set`
- [ ] `src/travel/food/travel-pantry.reader.int-spec.ts` (o test dentro `travel.service.int-spec.ts`): proiezioni, filtri `hunger`, documenti idratati con `id`
- [ ] RED in `test/app.int-spec.ts` (Pitfall 6) e in `game-rule.exception.spec.ts`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sì (ereditato) | guard JWT globale; test UNAUTHENTICATED su `questTravelPreview` |
| V3 Session Management | no | — |
| V4 Access Control | sì | `@OwnsCharacter(..., { ownerOnly: true })` sulla query nuova; liste `EXPECTED_OWNERSHIP_HANDLERS`/`EXPECTED_OWNER_ONLY_HANDLERS` |
| V5 Input Validation | sì | `AcceptQuestRequest` con `@IsObjectIdHex` → `BAD_USER_INPUT`; nessun input del client sul cibo (il server sceglie, D-10) |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lost update dell'inventario per corsa partenza/negozio/esito | Tampering | Lettura in sessione + WriteConflict; guardie `$elemMatch` e HP come rete (Pitfall 1) |
| Partenza gratis in corsa (cibo venduto fra anteprima e partenza) | Tampering | Ricalcolo alla partenza (D-10) dentro la transazione; guardie sulle quantità |
| Anteprima della quest per il personaggio di un altro (fuga di inventario/HP) | Information disclosure | owner-only senza bypass innkeeper (07 D-11) |
| DoS da inventario enorme | DoS | DP limitata da `needed + maxPower` (≤ ~16 660) e copie utili per stack: ~12 ms nel caso peggiore |
| HP sotto 1 / NaN | Tampering | `hpAfter` = `hpBefore − hpLost` con rifiuto se < 1; HP «prima» da `statusFactsOf` |
| Log con dati del personaggio | Information disclosure | Log solo id/conteggi/nomi (REPO-RULES) |

## Sources

### Primary (HIGH confidence, codice del branch `feat/14-viaggio-e-cibo` `df3d641`)
- `src/travel/travel.service.ts:29-118`, `travel.updates.ts:39-66,81-88`, `travel-planner.service.ts:65-72,94-214`, `travel-timing.ts:6-64`, `travel-rules.ts:13-24`, `travel-planning.module.ts`, `travel.module.ts`
- `src/quests/acceptance/quest-acceptance.service.ts:103-111,136-235,256-368`, `quest-acceptance.updates.ts:46-89,129-152`, `quest-acceptance.resolver.ts:17-37`, `quest-eligibility.ts:148-177`, `quest-acceptance.module.ts`
- `src/economy/trade/trade-inventory.ts:33-137`, `trade-line.ts:9-36`, `shop-transaction.service.ts:123-246`, `src/economy/coins.ts:13-19`
- `src/quests/outcomes/outcome-plan.ts:306-404`, `progression/level-table.ts:1-70`, `progression/status-facts.ts:23-35`, `injuries/injury-rules.ts:65-112`, `combat/combat-context.ts:77,138-145`, `resolution-loader.service.ts:436-439`
- `src/models/travel-preview.model.ts`, `loot-item.model.ts`, `interfaces/asset-item.model.ts`, `common/asset-quantity.model.ts`, `common/item.union.ts`, `character/character-assets.model.ts:24-30`, `request/accept-quest-request.model.ts`, `src/mongoose.plugins.ts`, `src/shops/city-shop.service.ts:74-80`
- `src/gameRules/game-rule-error-code.enum.ts`, `game-rule.exception.ts:127-153`, `game-rule.exception.spec.ts:150-225`
- `test/app.int-spec.ts:66-156,470-596,1006-1025,1100-1136`, `test/fixtures/character.fixture.ts`, `test/fixtures/catalog-item.fixture.ts`, `test/travel/travel-world.ts`, `src/travel/travel.service.int-spec.ts:1-175`, `package.json:20-24,88-210`
- `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` §2–§8, `14-CONTEXT.md`, `14-REPO-RULES.md`, FE `15-travel-food/15-CONTEXT.md`

### Secondary
- Probe locale `food-dp.mjs` (scratchpad): correttezza degli esempi D-06 e tempi della DP
- Misure locali: `npx tsc --noEmit` 9,7 s; `travel.service.int-spec.ts` 6,4 s; `test:cov` 538 s (SUMMARY 13.1)

### Tertiary (LOW)
- A1 (semantica del WriteConflict fra scrittura non transazionale e transazione): su conoscenza pregressa, coerente con il commento del codice; da provare col test RED

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna libreria nuova, tutto verificato nel repo
- Architecture: HIGH — punti di scrittura, moduli e liste di test letti riga per riga
- Pitfalls: HIGH per Pitfall 3, 5–9 (codice); MEDIUM per Pitfall 1 (scenario dedotto dal codice, semantica Mongo A1 da provare col test RED)

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (codice stabile; da rivedere se la BE 15 tocca `startTravel` prima)

## RESEARCH COMPLETE

Sintesi dei risultati che cambiano il CONTEXT:
1. **D-12 da emendare:** il `$set` dell'array `assets.ownedItems` intero calcolato da letture lean fuori sessione perde scritture concorrenti (un acquisto non-cibo al negozio, le ricompense di una story/worldMission). Le guardie `$elemMatch` + HP non bastano.
2. Rimedio consigliato: lettura della dispensa **in sessione dentro la transazione** (pattern del negozio), sia per `startTravel` (che diventa transazionale) sia per il claim (lettura prima di `claimLane`). Le guardie restano come rete di sicurezza.
3. Il «filtro non matchato per cibo/HP» (discrezione D-12) diventa irraggiungibile: il retry lo fa il driver sul WriteConflict. Restano i codici esistenti, nessun retry manuale.
4. `TRAVEL_STARVING` si valuta due volte nell'accettazione: in pre-verifica (ordine D-11, prima di aprire la transazione) e nel callback (verità).
5. `food[].item` richiede documenti `LootItem` **idratati**: con `lean` il campo `id: ID!` è null e la query va in errore.
6. L'anteprima della quest eredita `QUEST_NOT_ACCEPTABLE` (marker senza POI) da `planAuto` e logga un WARN a ogni salto: si separa `autoRoute` (senza log) da `planAuto`.
7. La DP è bounded-knapsack con splitting binario e tetto `needed + maxPower − 1`; caso peggiore misurato 12 ms (fabbisogno 16 460 con ferite ×10). L'ipotesi del CONTEXT «unità ≤ qualche decina» non regge (quantità fino a 2^31−1), ma il bound non ne dipende.
8. Km scoperti da calcolare come multiply-then-divide (virgola mobile), senza epsilon.
9. RED obbligatori: `type TravelPreview` esatto, riga `questTravelPreview(...): TravelPreview\n`, due liste di handler (`QuestAcceptanceResolver.questTravelPreview`), UNAUTHENTICATED, caso `travelStarving` nella spec «covers every GameRuleErrorCode».
10. `TravelPantryReader` in `TravelPlanningModule` (registra `LootItem`); i builder dei filtri prendono un parametro opzionale finale, così le `toEqual` esistenti restano verdi.
