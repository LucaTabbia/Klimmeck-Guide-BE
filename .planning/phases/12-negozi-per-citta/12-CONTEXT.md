# Phase 12: Negozi per città - Context

**Gathered:** 2026-11-02 (discuss interattivo congiunto con la FE Phase 13, dal repo FE; branch `feat/12-negozi-per-citta` creato da `develop` `65ba3d7`, la merge della PR #17 della Phase 11)
**Amended:** 2026-11-02 dopo la ricerca (`12-RESEARCH.md`, conflitti C1–C3 e sonde sull'harness): D-15, D-17, D-20 rivisti; D-22..D-24 aggiunti. Questo CONTEXT è autoritativo sul RESEARCH dove differiscono.
**Status:** Ready for planning — PR diretta a `develop`; sblocca la FE Phase 13 (SHOP-02/03/04)

<domain>
## Phase Boundary

Ogni città vende un **pool proprio** di equipaggiamenti, loot e compagni (pet), coerente con la sua taglia (`City.size`: village / city / capital, esposta dal server e dedotta dal `CityType`), nato da una **semina server idempotente al boot** e poi **curato direttamente a DB** dall'utente (Phase 11 D-36: il mondo vive solo nel database, niente file di contenuto né CLI). Il server rifiuta l'acquisto di ciò che non sta nel pool della città in cui si trova il personaggio (`ITEM_NOT_IN_SHOP`); la vendita resta ammessa in ogni città; scorte infinite; prezzi del catalogo; leggendari e `sellable: false` mai sullo scaffale. I pet entrano nel commercio con la distinzione **posseduti vs compagno equipaggiato**: `assets.ownedPets` (nuovo) accanto ad `assets.pet` (lo slot che il viaggio già legge), mutation `equipPet` / `unequipPet`, nessun equipaggiamento automatico all'acquisto. Handoff `BACKEND-NOTES.md` per la FE Phase 13.

Fuori scope: UI o mutation di cura dei pool (si cura a DB), premi pet dalle quest (i 9 pet solo-quest attendono la Phase 13 di generazione o le quest fisse), crescita o combattimento dei pet, immagini, cibo nei viaggi (Phase 14), generazione delle quest (Phase 13), sblocco delle lore (Phase 16), modifiche ai prezzi del catalogo (da rivedere a DB dall'utente, handoff Phase 11 §5).

</domain>

<decisions>
## Implementation Decisions

### Taglia della città (BE-SHOP-01)
- **D-01 (utente, 2026-10-29 «campo esplicito size» confermato il 2026-11-02 come campo esposto dal server):** `City.size: CitySize!` (enum `village | city | capital`, additivo a schema) **dedotto dal `CityType`**: suffisso `Village` → village, `City` e `SeaCity` → city, `Capital` → capital; tabella esplicita per i tipi che il suffisso non decide: `elfCapital` (Ko Shaeras) → capital, `talmvereVillage` → village, `ferrionCity` (Ferrion) → city, `necrorianCity` (Necrorian) → city. **Default tecnico:** campo calcolato nel resolver/modello, non colonna a DB (i 33 `CityType` codificano già la taglia, nessuna migrazione); il FE smette di dedurre la taglia da solo (oggi `CityType.cityClass` nel FE classifica Ferrion come capitale: vince il server).
- **D-02 (utente):** le 12 città di mare (`*SeaCity`) vendono come città.

### Origine e cura dei pool (BE-SHOP-01/02)
- **D-03 (utente, «Semina server + cura a DB»):** il pool è **persistito sulla città** come tre liste di riferimenti tipati (equipaggiamenti, loot, pet; nome esatto dei campi a discrezione della ricerca, stile `pointsOfInterest`), additive a schema e a DB. Una **migrazione idempotente al boot** (stile delle migrazioni di Phase 9.1 e 10) riempie **solo le città il cui pool è assente** (campo mancante), **mai** quelle con pool presente anche se vuoto (`[]`), con un sorteggio deterministico (seme = `_id` della città + costante di versione del seme). Dopo la semina il server non tocca più i pool: la cura è a DB, a mano, dall'utente.
- **D-04 (utente, «Necrorian senza negozio»):** Necrorian riceve dalla semina un pool **vuoto esplicito** (`[]`): non ha negozio per motivi di lore (Phase 11 D-17). `City.hasShop: Boolean!` (additivo, = pool non vuoto, calcolato) viaggia con la query `cities` così il FE chiude la pagina del negozio su quel marker (FE 13 D-04). Se l'utente aggiunge oggetti a Necrorian a DB, il negozio si apre: vale D-05.
- **D-05 (utente, «La mano vince»):** la regola di taglia (D-08) **guida solo la semina**: ciò che sta a DB viene servito e venduto così com'è, anche se fuori regola (un ultrarare in un villaggio resta in vendita). **Veto assoluto**, indipendente dal DB: gli oggetti `legendary` e tutto ciò che ha `sellable: false` non vengono mai serviti dalla query del negozio né accettati in acquisto (`ITEM_NOT_IN_SHOP`).
- **D-06 (utente, report delle violazioni):** un **controllo di sola lettura** segnala i pool fuori regola senza correggerli: log `WARN` al boot dopo la semina (per città: oggetti con rarità non ammessa dalla taglia, pool vuoti) e una query innkeeper (nome a discrezione, es. `shopPoolReport`) con lo stesso contenuto. Sostituisce il `--verify` previsto il 2026-10-29 (nessun CLI dopo D-36).
- **D-07 (utente):** `sellable` **entra nello schema** come `Boolean` additivo su `EquipmentItem`, `LootItem` e `Pet` (oggi è un campo Mongo fuori schema filtrato da `equipmentAssetsQuantity(sellable)`): la semina e la query del negozio lo rispettano; sui pet lo valorizza la migrazione (D-11). Chiude la scelta «entra o sparisce» di BE-SHOP-02.

### Composizione dei pool (BE-SHOP-04)
- **D-08 (utente, «Pool più ampi»):** costanti configurabili del server (come il motore di combattimento), per taglia:

  | Taglia | Equipaggiamenti | Loot | Mix di rarità (pesi del sorteggio) |
  |---|---|---|---|
  | village | 10 | 12 | 75% common, 25% uncommon |
  | city (anche di mare) | 16 | 18 | 50% common, 35% uncommon, 15% rare |
  | capital | 24 | 24 | 35% common, 35% uncommon, 20% rare, 10% ultrarare |

  I pesi sono quote del sorteggio arrotondate per città; i pool possono sovrapporsi fra città (scorte infinite; il catalogo ha 30 equip common, 28 uncommon, 40 rare, 37 ultrarare; loot 51 / 33 / 10 / 6); se una fascia non ha abbastanza oggetti distinti si completa con la fascia inferiore. I `legendary` (37 equip, 1 loot) restano fuori.
- **D-09 (utente, «Cibo e cure sempre»):** ogni pool include **almeno 2 loot `hunger` e 1 loot `heal`** (dentro la quota loot, rarità ammesse dalla taglia), scelti prima del sorteggio del resto: la Phase 14 consumerà cibo nei viaggi e nessun villaggio deve lasciare il viaggiatore a piedi.
- **D-10 (utente, 2026-11-02, pet nei pool «posizionati in base alla lore e venduti in pochi posti»):** quattro pet in vendita, ciascuno in **due città** (villaggio o città + capitale) fissate come costanti del seme e cambiabili a DB:

  | Pet | Prezzo | Città |
  |---|---|---|
  | Cavallo leggero (`6ae8070540e5e6676b7d6f8d`) | 40 ag | Fineglen (`valanVillage`) + Valantar (`valanCapital`) |
  | Cammello del Mar Sabbioso (`6ae8070540e5e6676b7d6f90`) | 35 ag | Shadmus (`desertVillage`) + Valantar |
  | Tartaruga gigante delle isole (`6ae8070540e5e6676b7d6f94`) | 1 oro | Croce Marina (`tropicalVillage`) + Bellport (`flameNorthCapital`) |
  | Cavallo da viaggio (`6adfa18e6c2f93eb0b76d34a`) | 1 oro | Talmvere (`talmvereVillage`) + Cliffbreak (`drusteaCapital`) |

  Gli altri 9 pet (Cavallo da guerra, Alce, Worg, Lupo invernale addestrato, Cinghiale gigante da sella, Ippogrifo, Aquila gigante, Grifone, Pegaso) si ottengono **solo tramite quest**: `sellable: false`, mai nei pool (premio quest: fuori scope, vedi deferred).
- **D-11 (utente):** un oggetto `legendary` posseduto **si può vendere** in ogni città: `sellable: false` significa solo «mai sullo scaffale». La vendita resta quella di oggi; `ITEM_NOT_TRADABLE` continua a coprire solo gli oggetti senza prezzo.
- **D-12 (utente, 2026-10-29, confermato):** vendita ovunque, scorte infinite (ogni voce del pool ha quantità illimitata: `quantity` 1 nella risposta è solo forma), prezzi del catalogo identici in ogni città.

### Pet: posseduti e compagno equipaggiato (BE-SHOP-06, nuovo)
- **D-13 (utente, verbatim: «Bisogna distinguere il pet equipaggiato dai pet posseduti»):** `assets.ownedPets: [Pet!]!` (additivo, ref a `Pet`, default `[]`) accanto ad `assets.pet`, che resta **il compagno equipaggiato**: è l'unico che conta per il viaggio (`travel-planner.service.ts` legge `assets.pet`, invariato) e per la fotografia della velocità alla partenza (Phase 8 D-09/D-15).
- **D-14 (utente, «niente sella automatica»):** comprare un pet lo aggiunge ai posseduti e **non lo equipaggia mai**; lo stesso pet non si compra due volte (`PET_ALREADY_OWNED`, verificato prima di ogni scrittura e riaffermato nel filtro della transazione); vendere un pet lo toglie dai posseduti e, se era equipaggiato, svuota `assets.pet` nella stessa transazione; mai durante un viaggio o in attesa di soccorso (`SHOP_NOT_IN_CITY` già copre il caso).
- **D-15 (utente, titolo «Compagno»/«Compagni» nel FE; qui i nomi restano `pet`):** mutation `equipPet(request: EquipPetRequest { id, petId })` e `unequipPet(request: UnequipPetRequest { id })`, stesso stile e stesse guardie di `equipItem` (**rivisto dopo la ricerca, C1:** `@OwnsCharacter` con il bypass dell'oste come `equipItem`, non `ownerOnly`; input con `@IsObjectIdHex`, elencati in `input-decorators.spec.ts`): si equipaggia solo un pet posseduto (`PET_NOT_OWNED`), idempotenti; un pet con `speedModifier` null è un compagno non da sella (gatto, cane…) e lascia la velocità base. **Default tecnico:** equipaggiare durante un viaggio è ammesso e non cambia il viaggio in corso (velocità fotografata alla partenza).
- **D-16 (Claude, migrazione):** al boot, idempotente: i personaggi con `assets.pet` valorizzato e assente da `ownedPets` lo ricevono anche fra i posseduti (oggi 1 personaggio su 4 ha il Cavallo da viaggio); `Pet.sellable` valorizzato `true` sui 4 pet di D-10 e `false` sugli altri 9 solo dove il campo manca (la mano vince anche qui).
- **D-17 (Claude, rivisto dopo la ricerca, C3):** `TransactionItems.petAssets: [AssetQuantityInput!]` additivo e **nullable nello SDL** (il default `[]` vive solo nel codice con `?? []`, perché un `defaultValue` farebbe saltare il controllo del tipo annidato in `input-decorators.spec.ts`; `whitelist: true` impone i decoratori completi sul campo) su acquisti e vendite, quantità obbligatoriamente 1 (`INVALID_QUANTITY` altrimenti); prezzi dal catalogo pet (`buyPrice`/`sellPrice`, letti da `CatalogPricesReader` esteso); cross-check del totale lato client invariato.

### Contratto verso il client (BE-SHOP-02/03) — default tecnici, elencati per il veto dell'utente
- **D-18 (Claude):** una query autenticata **non owner-aware** `cityShop(cityId: ID!): CityShop!` che restituisce `{ city { id name size hasShop } equipment: [AssetQuantity!]! loot: [AssetQuantity!]! pets: [Pet!]! }` con i veti di D-05 già applicati in lettura; i pool non sono segreti e il guard autorevole sta in `doTransaction` (D-19). Preferita ai campi popolati su `City` perché la query `cities` del cold start FE non deve portare 167 pool; `City.size` e `City.hasShop` (scalari leggeri) viaggiano invece con `cities`.
- **D-19 (Claude):** ordine dei rifiuti di `doTransaction` esteso: id e quantità → catalogo → cross-check del totale → personaggio → città (`SHOP_NOT_IN_CITY`) → **pool della città del marker (`ITEM_NOT_IN_SHOP`, solo per gli acquisti: equip, loot e pet; include legendary e `sellable: false`)** → **doppione pet (`PET_ALREADY_OWNED`)** → possesso → fondi; il pool si rilegge **dentro** la transazione con la sessione (riaffermato come la città, Phase 4 D-10). Codici nuovi in `GameRuleErrorCode`: `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED`.
- **D-20 (Claude, rivisto dopo la ricerca, C2):** `equipmentAssetsQuantity(sellable)` e `lootAssetsQuantity` restano per compatibilità con `deprecationReason` («Phase 12: use cityShop»); dopo la FE Phase 13 non hanno consumer; rimozione in una fase futura. Lo SDL della fase è additivo **salvo le due righe di queste query, riscritte in place con `@deprecated(reason: …)`**: il diff contro `origin/develop` mostra esattamente 2 righe tolte e le stesse 2 riaggiunte con la direttiva; nessun'altra riga tolta.
- **D-21 (Claude):** nessun CLI e nessun file di contenuto (D-36): semina, migrazioni e report vivono nel server (boot + query innkeeper); il runbook del handoff spiega solo come ri-seminare una città (cancellare il campo del pool a DB e riavviare) e come leggere il report.

### Aggiunte dopo la ricerca (2026-11-02, sonde sull'harness in memoria)
- **D-22 (Claude, trappola del pool vuoto):** un array Mongoose senza `default` esplicito scrive `[]` su `create` e su `save()` di un documento letto senza il campo: le tre liste del pool (`shopEquipment`, `shopLoot`, `shopPets`) sono `@Prop` con `default: undefined` e la semina rileva l'assenza **per campo** con un filtro di esistenza sul campo (mai «array vuoto = assente»); `assets.ownedPets` tiene invece il default `[]`. La semina non scrive mai una lista equipaggiamenti o loot vuota (eccetto Necrorian, D-04): con un catalogo vuoto rimanda la semina al boot successivo.
- **D-23 (Claude, forme verificate):** `City.size` e `City.hasShop` sono `@ResolveField` nel resolver delle città (entrano in `type City` senza toccare la classe; `cities` carica documenti idratati e non popola mai i pool); `CharactersService.findOne` (che alimenta anche `characterUpdated`) popola `assets.pet` e `assets.ownedPets` con `model: 'Pet'`, e il modello `Pet` viene registrato in `EconomyModule` (altrimenti `MissingSchemaError` nell'harness); il controllo del pool in `applyTrade` sostituisce l'`exists` della città con un `findOne` in sessione che restituisce il pool; rarità e `sellable` arrivano da `CatalogPricesReader` insieme ai prezzi (esteso al catalogo `Pet`); `ownedPets`/`assets.pet` entrano nel `$set` solo quando lo scambio ha righe pet, con guardie `$nin` in acquisto e `$in` in vendita riaffermate nel filtro; `test/economy/place-in-city.ts` riceve un parametro `pool` perché ogni acquisto degli int-spec esistenti avviene in una città senza pool.
- **D-24 (Claude, semina e boot):** PRNG = sha256 di (versione del seme, id della città, nome della lista) → mulberry32; candidati ordinati per `_id`; quote per fascia con il metodo del resto maggiore; le scelte garantite hunger/heal contano nella quota loot; le città di D-10 si risolvono per **nome + `CityType`** (solo 4 dei 7 id sono documentati). Un solo orchestratore di boot in un modulo di manutenzione importato SOLO da `AppModule` (gli harness di test non seminano le città fixture) esegue nell'ordine: `Pet.sellable` → `ownedPets` → semina dei pool → report WARN; modello da copiare: `SpellStateMigrator` (la migrazione della Phase 10 era un CLI).
- **D-25 (utente, 2026-11-03, dopo l'esecuzione):** semina e migrazioni girano **una volta sola** sul database reale dal branch, prima della merge, poi **escono dal repo**: la PR non contiene `PetSellableMigrator`, `OwnedPetsMigrator`, `ShopPoolSeeder` né il sorteggio; al boot resta solo il report WARN (D-06). Da qui in avanti i pool, anche di una città nuova, si scrivono solo a mano a DB; le regole di D-08/D-09/D-10 restano documentate nel handoff §8 come guida alla cura.

### Claude's Discretion
- Nome esatto dei campi del pool su `City`, del tipo `CityShop`, della query di report e della costante di versione del seme; struttura del modulo (`src/shops/` o dentro `src/economy/`); forma delle costanti (file `shop-pool.constants.ts`).
- Algoritmo del sorteggio deterministico (PRNG seminato) e regola di completamento quando una fascia è scarsa.
- Testo dei messaggi `GameRuleException` (il FE usa solo i codici).
- Indici Mongo eventuali per le ref dei pool; proiezioni lean; log del boot.

</decisions>

<specifics>
## Specific Ideas

- Utente, 2026-11-02: «SI, terzo tipo nel pool. In questo caso però i pet sono posizionati in base alla lore (di cui hai il contesto) e venduti in pochi posti (un villaggio e la capitale o una città e la capitale) inoltre alcuni non possono rientrare nella lista, in quanto si possono ottenere solo tramite quest. In vendita ci sono: cavallo leggero, cavallo da viaggio, cammello del mar sabbioso, tartaruga gigante delle isole».
- Utente, 2026-11-02: «Bisogna distinguere il pet equipaggiato dai pet posseduti».
- Utente, 2026-11-02: «il pet non essendo necessariamente un animale da sella (può essere un gatto o un cane) deve avere un titolo diverso, cavalcatura non va bene» → «Compagno» / «Compagni» (FE).
- Phase 11 D-36 (utente): «il mondo esiste solo su DB» — nessun file di contenuto né CLI: la cura dei pool è a DB.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap e requisiti
- `.planning/ROADMAP.md` §Phase 12 — goal, success criteria e decisioni del 2026-10-29 come emendate oggi; §Phase 13–16 per i consumatori a valle (pet premio delle quest, cibo, lore).
- `.planning/REQUIREMENTS.md` §City Shops (BE-SHOP-01..06) — requisiti emendati il 2026-11-02.
- `.planning/PROJECT.md` — il backend è la fonte di verità; nessun valore calcolato dal client.

### Dati e handoff della Phase 11
- `.planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md` §2 (inventario: 167 città per `CityType`, 172 equip, 101 loot, 13 pet), §5 «Pet (cavalcature)» (prezzi, `speedModifier`, HP), note «Phase 12 (negozi)» e «Phase 12 (prune del catalogo)» (taglia e regno dal `CityType`, `sellable: false` sui leggendari, prezzi dei cavalli da rivedere).
- `.planning/phases/11-popolamento-del-mondo/11-CONTEXT.md` — D-17 (Necrorian ha solo la dungeon), D-36 (il mondo vive solo nel DB), D-01 (identità = `_id` Mongo).

### Contratti e codice esistenti
- `src/economy/trade/shop-transaction.service.ts` — ordine dei rifiuti, transazione unica, città riaffermata nel filtro (Phase 4 D-07/D-10, Phase 9 D-18).
- `src/economy/trade/catalog-prices.reader.ts`, `trade-pricing.ts`, `trade-line.ts`, `trade-inventory.ts` — prezzi dal catalogo, `ITEM_NOT_TRADABLE`, inventario.
- `src/models/city.model.ts`, `src/models/enums/city-type.enum.ts` — `City`, i 33 `CityType`.
- `src/models/pet.model.ts`, `src/models/character/character-assets.model.ts` — `Pet.speedModifier` (null = non cavalcabile), `assets.pet`.
- `src/models/request/transaction-request.model.ts`, `transaction-items.model.ts`, `equip-item-request.model.ts` — input da estendere (`petAssets`) e stile di `equipPet`.
- `src/travel/travel-planner.service.ts` — legge `assets.pet` per la velocità (invariato).
- `src/equipmentItems/equipment-items.resolver.ts`, `src/lootItems/loot-items.resolver.ts` — query di catalogo da deprecare.
- `src/gameRules/game-rule-error-code.enum.ts`, `game-rule.exception.ts` — codici stabili.
- `src/migrations/` — migrazioni al boot (mixed-refs, Phase 10) come modello per la semina e la migrazione dei pet.
- `src/schema.gql` — lo SDL generato vince; `test/app.int-spec.ts` enumera gli handler innkeeper-only (da aggiornare PRIMA di montare la query di report).

### Companion FE
- `../Klimmeck-Guide/.planning/phases/13-city-shops/13-CONTEXT.md` — cosa consuma il FE (query `cityShop`, `hasShop`, terza lista «Compagni», slot «Compagno» nel Diario).
- `../Klimmeck-Guide/.planning/phases/07-travel/07-CONTEXT.md` D-12, `09-combat-result-sheet/09-CONTEXT.md` D-16 — negozio chiuso fuori città / in viaggio / in soccorso.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ShopTransactionService.shopLocationOrReject` restituisce già la `location` del marker: il pool della città si legge dalla stessa `City` (`markerLocation` ∈ `idForms(location)`), con la sessione dentro la transazione.
- `CatalogPricesReader.read` per tipo (`EquipmentItem`/`LootItem`): si estende con `Pet` (`buyPrice`/`sellPrice` sono `Coins` anche sul pet).
- `applyTradeToInventory` / `soldQuantityGuards`: il pattern di guardie riaffermate nel filtro si replica per `ownedPets` (aggiunta e rimozione atomiche dall'array, `assets.pet` svuotato se venduto).
- Migrazioni al boot di Phase 9.1 (`spellStates`) e Phase 10 (`mixed-refs`): idempotenti, con log, modello per la semina dei pool e per `ownedPets`.
- `@OwnsCharacter` + `EquipItemRequest`: stesso decoratore e stesso input-style per `equipPet` / `unequipPet`.

### Established Patterns
- Rifiuti con `GameRuleException` e codici stabili letti dal FE solo da `extensions.code`; messaggi italiani liberi.
- Ref `ObjectId` nei `@Prop` array come `pointsOfInterest` (ref tipati, mai `Mixed`: trappola della ricerca di Phase 7).
- Nessun letterale di gate nei `.md` fuori dai blocchi di codice; `npx jest <percorsi> --selectProjects …` con i percorsi prima; mai `npm run lint`.
- `test/app.int-spec.ts` enumera gli handler innkeeper-only: va aggiornato (RED) prima di montare la query di report.

### Integration Points
- `City` (schema + `cities` query): `size`, `hasShop`, liste del pool.
- `doTransaction`: `petAssets`, `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, pool riaffermato in sessione.
- `CharacterAssets`: `ownedPets`; `Character` subscription porta il nuovo campo senza altro lavoro (il FE lo legge dal fragment).
- Nuove mutation `equipPet` / `unequipPet` nel resolver dei personaggi.
- Boot: solo il report WARN dei pool (semina e migrazioni eseguite una volta e rimosse, D-25).

</code_context>

<deferred>
## Deferred Ideas

- **Premi pet dalle quest** (i 9 pet solo-quest: Cavallo da guerra, Alce, Worg, Lupo invernale addestrato, Cinghiale gigante da sella, Ippogrifo, Aquila gigante, Grifone, Pegaso): oggi `QuestPrizes` non ha un pet; da aggiungere nella Phase 13 (generazione) o come quest fisse — da decidere nel discuss della Phase 13.
- **Cura dei pool dall'app** (mutation innkeeper `setCityShop` + UI nella Locanda): l'utente ha scelto la cura a DB; idea per una fase futura.
- **Crescita e combattimento dei pet** (`xp`, `maxXp`, `damages`, HP dei pet): fuori scope.
- **Prezzi dei cavalli da rivedere** (handoff Phase 11 §5, §11: Cavallo da viaggio con 30 HP fuori scala): l'utente li ritocca a DB.
- **Rimozione di `equipmentAssetsQuantity` / `lootAssetsQuantity`** deprecate oggi: fase futura (Phase 12 Hardening FE o pulizia BE).

</deferred>

---

*Phase: 12-negozi-per-citta*
*Context gathered: 2026-11-02*
