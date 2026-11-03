# Phase 12: Negozi per città - Research

**Researched:** 2026-11-02
**Domain:** NestJS 11 code-first GraphQL (campi calcolati con `@ResolveField`, deprecazioni additive), Mongoose 8 (array di ref tipati, default impliciti degli array, migrazioni al boot idempotenti), transazione unica del negozio (Phase 4) estesa a pool e pet, sorteggio deterministico senza dipendenze
**Confidence:** HIGH sul codice e sul comportamento di Mongoose/GraphQL (letti e verificati con probe sull'harness in memoria, probe cancellata), MEDIUM sulla disponibilità di candidati per fascia nel catalogo reale (solo conteggi aggregati del handoff Phase 11), LOW/ASSUMED su `sellable` degli equipaggiamenti a DB e su `imagePath` dei 13 pet

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Taglia della città (BE-SHOP-01)
- **D-01 (utente, 2026-10-29 «campo esplicito size» confermato il 2026-11-02 come campo esposto dal server):** `City.size: CitySize!` (enum `village | city | capital`, additivo a schema) **dedotto dal `CityType`**: suffisso `Village` → village, `City` e `SeaCity` → city, `Capital` → capital; tabella esplicita per i tipi che il suffisso non decide: `elfCapital` (Ko Shaeras) → capital, `talmvereVillage` → village, `ferrionCity` (Ferrion) → city, `necrorianCity` (Necrorian) → city. **Default tecnico:** campo calcolato nel resolver/modello, non colonna a DB (i 33 `CityType` codificano già la taglia, nessuna migrazione); il FE smette di dedurre la taglia da solo (oggi `CityType.cityClass` nel FE classifica Ferrion come capitale: vince il server).
- **D-02 (utente):** le 12 città di mare (`*SeaCity`) vendono come città.

#### Origine e cura dei pool (BE-SHOP-01/02)
- **D-03 (utente, «Semina server + cura a DB»):** il pool è **persistito sulla città** come tre liste di riferimenti tipati (equipaggiamenti, loot, pet; nome esatto dei campi a discrezione della ricerca, stile `pointsOfInterest`), additive a schema e a DB. Una **migrazione idempotente al boot** (stile delle migrazioni di Phase 9.1 e 10) riempie **solo le città il cui pool è assente** (campo mancante), **mai** quelle con pool presente anche se vuoto (`[]`), con un sorteggio deterministico (seme = `_id` della città + costante di versione del seme). Dopo la semina il server non tocca più i pool: la cura è a DB, a mano, dall'utente.
- **D-04 (utente, «Necrorian senza negozio»):** Necrorian riceve dalla semina un pool **vuoto esplicito** (`[]`): non ha negozio per motivi di lore (Phase 11 D-17). `City.hasShop: Boolean!` (additivo, = pool non vuoto, calcolato) viaggia con la query `cities` così il FE chiude la pagina del negozio su quel marker (FE 13 D-04). Se l'utente aggiunge oggetti a Necrorian a DB, il negozio si apre: vale D-05.
- **D-05 (utente, «La mano vince»):** la regola di taglia (D-08) **guida solo la semina**: ciò che sta a DB viene servito e venduto così com'è, anche se fuori regola (un ultrarare in un villaggio resta in vendita). **Veto assoluto**, indipendente dal DB: gli oggetti `legendary` e tutto ciò che ha `sellable: false` non vengono mai serviti dalla query del negozio né accettati in acquisto (`ITEM_NOT_IN_SHOP`).
- **D-06 (utente, report delle violazioni):** un **controllo di sola lettura** segnala i pool fuori regola senza correggerli: log `WARN` al boot dopo la semina (per città: oggetti con rarità non ammessa dalla taglia, pool vuoti) e una query innkeeper (nome a discrezione, es. `shopPoolReport`) con lo stesso contenuto. Sostituisce il `--verify` previsto il 2026-10-29 (nessun CLI dopo D-36).
- **D-07 (utente):** `sellable` **entra nello schema** come `Boolean` additivo su `EquipmentItem`, `LootItem` e `Pet` (oggi è un campo Mongo fuori schema filtrato da `equipmentAssetsQuantity(sellable)`): la semina e la query del negozio lo rispettano; sui pet lo valorizza la migrazione (D-11). Chiude la scelta «entra o sparisce» di BE-SHOP-02.

#### Composizione dei pool (BE-SHOP-04)
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

#### Pet: posseduti e compagno equipaggiato (BE-SHOP-06, nuovo)
- **D-13 (utente, verbatim: «Bisogna distinguere il pet equipaggiato dai pet posseduti»):** `assets.ownedPets: [Pet!]!` (additivo, ref a `Pet`, default `[]`) accanto ad `assets.pet`, che resta **il compagno equipaggiato**: è l'unico che conta per il viaggio (`travel-planner.service.ts` legge `assets.pet`, invariato) e per la fotografia della velocità alla partenza (Phase 8 D-09/D-15).
- **D-14 (utente, «niente sella automatica»):** comprare un pet lo aggiunge ai posseduti e **non lo equipaggia mai**; lo stesso pet non si compra due volte (`PET_ALREADY_OWNED`, verificato prima di ogni scrittura e riaffermato nel filtro della transazione); vendere un pet lo toglie dai posseduti e, se era equipaggiato, svuota `assets.pet` nella stessa transazione; mai durante un viaggio o in attesa di soccorso (`SHOP_NOT_IN_CITY` già copre il caso).
- **D-15 (utente, titolo «Compagno»/«Compagni» nel FE; qui i nomi restano `pet`):** mutation owner-only `equipPet(request: { id, petId })` e `unequipPet(request: { id })`, stesso stile e stesse guardie di `equipItem`: si equipaggia solo un pet posseduto (`PET_NOT_OWNED`), idempotenti; un pet con `speedModifier` null è un compagno non da sella (gatto, cane…) e lascia la velocità base. **Default tecnico:** equipaggiare durante un viaggio è ammesso e non cambia il viaggio in corso (velocità fotografata alla partenza).
- **D-16 (Claude, migrazione):** al boot, idempotente: i personaggi con `assets.pet` valorizzato e assente da `ownedPets` lo ricevono anche fra i posseduti (oggi 1 personaggio su 4 ha il Cavallo da viaggio); `Pet.sellable` valorizzato `true` sui 4 pet di D-10 e `false` sugli altri 9 solo dove il campo manca (la mano vince anche qui).
- **D-17 (Claude):** `TransactionItems.petAssets: [AssetQuantityInput!]` additivo (default `[]`) su acquisti e vendite, quantità obbligatoriamente 1 (`INVALID_QUANTITY` altrimenti); prezzi dal catalogo pet (`buyPrice`/`sellPrice`, letti da `CatalogPricesReader` esteso); cross-check del totale lato client invariato.

#### Contratto verso il client (BE-SHOP-02/03) — default tecnici, elencati per il veto dell'utente
- **D-18 (Claude):** una query autenticata **non owner-aware** `cityShop(cityId: ID!): CityShop!` che restituisce `{ city { id name size hasShop } equipment: [AssetQuantity!]! loot: [AssetQuantity!]! pets: [Pet!]! }` con i veti di D-05 già applicati in lettura; i pool non sono segreti e il guard autorevole sta in `doTransaction` (D-19). Preferita ai campi popolati su `City` perché la query `cities` del cold start FE non deve portare 167 pool; `City.size` e `City.hasShop` (scalari leggeri) viaggiano invece con `cities`.
- **D-19 (Claude):** ordine dei rifiuti di `doTransaction` esteso: id e quantità → catalogo → cross-check del totale → personaggio → città (`SHOP_NOT_IN_CITY`) → **pool della città del marker (`ITEM_NOT_IN_SHOP`, solo per gli acquisti: equip, loot e pet; include legendary e `sellable: false`)** → **doppione pet (`PET_ALREADY_OWNED`)** → possesso → fondi; il pool si rilegge **dentro** la transazione con la sessione (riaffermato come la città, Phase 4 D-10). Codici nuovi in `GameRuleErrorCode`: `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED`.
- **D-20 (Claude):** `equipmentAssetsQuantity(sellable)` e `lootAssetsQuantity` restano per compatibilità con `deprecationReason` («Phase 12: use cityShop»); dopo la FE Phase 13 non hanno consumer; rimozione in una fase futura (SDL additivo in questa fase, nessuna riga tolta).
- **D-21 (Claude):** nessun CLI e nessun file di contenuto (D-36): semina, migrazioni e report vivono nel server (boot + query innkeeper); il runbook del handoff spiega solo come ri-seminare una città (cancellare il campo del pool a DB e riavviare) e come leggere il report.

### Claude's Discretion
- Nome esatto dei campi del pool su `City`, del tipo `CityShop`, della query di report e della costante di versione del seme; struttura del modulo (`src/shops/` o dentro `src/economy/`); forma delle costanti (file `shop-pool.constants.ts`).
- Algoritmo del sorteggio deterministico (PRNG seminato) e regola di completamento quando una fascia è scarsa.
- Testo dei messaggi `GameRuleException` (il FE usa solo i codici).
- Indici Mongo eventuali per le ref dei pool; proiezioni lean; log del boot.

### Deferred Ideas (OUT OF SCOPE)
- **Premi pet dalle quest** (i 9 pet solo-quest: Cavallo da guerra, Alce, Worg, Lupo invernale addestrato, Cinghiale gigante da sella, Ippogrifo, Aquila gigante, Grifone, Pegaso): oggi `QuestPrizes` non ha un pet; da aggiungere nella Phase 13 (generazione) o come quest fisse — da decidere nel discuss della Phase 13.
- **Cura dei pool dall'app** (mutation innkeeper `setCityShop` + UI nella Locanda): l'utente ha scelto la cura a DB; idea per una fase futura.
- **Crescita e combattimento dei pet** (`xp`, `maxXp`, `damages`, HP dei pet): fuori scope.
- **Prezzi dei cavalli da rivedere** (handoff Phase 11 §5, §11: Cavallo da viaggio con 30 HP fuori scala): l'utente li ritocca a DB.
- **Rimozione di `equipmentAssetsQuantity` / `lootAssetsQuantity`** deprecate oggi: fase futura (Phase 12 Hardening FE o pulizia BE).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-SHOP-01 | `City.size` + `City.hasShop` a schema; pool (ref a EquipmentItem / LootItem / Pet) a DB seminato da migrazione idempotente al boot solo dove assente (taglia, cibo e cure, pet per lore, Necrorian vuoto), poi curato a DB; report di sola lettura (WARN al boot + query innkeeper) | §F1 (campi `shopEquipment`/`shopLoot`/`shopPets`, `default: undefined`, `@ResolveField`), §F2 (assente vs vuoto verificato con probe), §F3 (orchestratore di boot), §F4 (PRNG + quote + garanzie), §F8 (report) |
| BE-SHOP-02 | `cityShop(cityId)` con veti in lettura; `size`/`hasShop` in `cities`; query di catalogo deprecate; `sellable` a schema su EquipmentItem / LootItem / Pet | §F1, §Pattern 4 (`CityShopService`), §F7 (deprecazione: cambia 2 righe SDL, vedi Conflitti C2) |
| BE-SHOP-03 | `ITEM_NOT_IN_SHOP` su ogni acquisto fuori pool o vietato, prima di scrivere e riaffermato in transazione; vendita ovunque anche dei leggendari | §F5 (punto esatto in `applyTrade`, `findOne` in sessione al posto di `exists`, veto letto dal catalogo insieme ai prezzi) |
| BE-SHOP-04 | Scorte infinite, prezzi del catalogo, costanti per taglia, leggendari mai nei pool, «la mano vince» | §F4 (quote a resto maggiore, fallback alla fascia inferiore), §Pattern 4 (veto solo `legendary`/`sellable: false`, nient'altro filtrato) |
| BE-SHOP-05 | Integration villaggio / città / capitale, fuori pool e pet doppione senza scritture, vendita fuori pool e di un leggendario, ciclo di vita del pet; real boot con SDL additivo; handoff | §F9 (harness, `placeInCity` da estendere), §Validation Architecture, piano di gate + handoff |
| BE-SHOP-06 | `assets.ownedPets` distinto da `assets.pet`; `petAssets` quantità 1; `PET_ALREADY_OWNED`; vendita del pet equipaggiato svuota lo slot; `equipPet`/`unequipPet` (`PET_NOT_OWNED`); migrazioni `ownedPets` e `Pet.sellable` | §F5 (inventario pet), §F6 (mutation e populate mancante di `assets.pet`), §F3 (migrazioni) |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 12-REPO-RULES.md)

- Stack non negoziabile: NestJS 11 + Mongoose 8.18 + Apollo code-first; nessuna dipendenza nuova serve (PRNG con `node:crypto` + mulberry32).
- TDD obbligatorio: RED (`test(<scope>)`) → GREEN (`feat`/`fix`) → REFACTOR; ogni regola nuova ha un test che nomina la decisione (`(D-19)`).
- Commit Conventional in inglese, subject ≤ 72 caratteri, scope `shops`, `trade`, `pets`, `cities`, `characters`, `migrations`, documenti `phase-12`; nessun trailer di attribuzione; stage per path esplicito; mai amend/rebase/reset.
- MAI `npm run lint` né `npm run format`; solo `npx prettier --write <file>` + `npx eslint <file>` uno per uno; un file già non conforme riceve prima un commit `style(<scope>)`.
- Jest: percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl jest` vuoto a fine task; suite completa solo nel piano di gate.
- `npx tsc --noEmit -p tsconfig.json` a 0 a fine di ogni task di codice.
- Il database reale NON si tocca in questa fase: nessun avvio del BE contro `.env`; semina e migrazioni si provano solo su `MongoMemoryReplSet`; nessuna variabile d'ambiente nuova; mai la stringa `process.env.` sotto `src/`.
- `src/schema.gql` cambia solo dal boot reale (`test/app.int-spec.ts`) e si committa col codice che lo cambia; nomi del contratto FE stabili; `test/app.int-spec.ts` aggiornato in RED prima di montare la query innkeeper.
- Ref nei `@Prop` sempre `[{ type: MongooseSchema.Types.ObjectId, ref }]`; nessun nuovo percorso `Mixed` (lo verifica `mixed-ref-paths.spec.ts`).
- `.md` in italiano; operatori Mongo solo dentro code span; nessun letterale di gate nella prosa.
- Coverage: `./src/economy/` ha soglie 98/91/98 (statements/branches/lines), `./src/characters/characters.service.ts` 96/88/98 — le estensioni del negozio e di `findOne` devono restare sopra.

## Contratto FE fissato (coordinatore, 2026-11-02 — non negoziabile)

Nomi e forme già assunti dalla ricerca FE Phase 13, da usare alla lettera:

```graphql
input EquipPetRequest { id: String!  petId: String! }   # come EquipItemRequest: @Field(() => String) + @IsObjectIdHex()
input UnequipPetRequest { id: String! }
equipPet(request: EquipPetRequest!): CommonResponse!
unequipPet(request: UnequipPetRequest!): CommonResponse!
enum CitySize { village city capital }                   # valori minuscoli come CityType
```

- Il FE seleziona su `Pet` solo `id name buyPrice { gold silver copper } sellPrice { gold silver copper } speedModifier sellable` (mai `imagePath`): l'assunzione A2 non tocca il contratto FE.
- Il fragment del personaggio FE oggi **non** seleziona `assets.pet`: il payload di `characterUpdated` (e la query `character`) deve popolare sia `assets.pet` sia `assets.ownedPets` — path `assets.pet` e `assets.ownedPets`, `model: 'Pet'`, in `CharactersService.findOne` (Pattern 7, Pitfall 6).
- `petId` e `id` sono `String!` (non `ID!`), come in `EquipItemRequest` [VERIFIED: src/models/request/equip-item-request.model.ts].

## Summary

Il codice esistente offre già quasi tutti i punti di aggancio: `CitiesResolver` è `@Resolver(() => City)` e accetta due `@ResolveField` (`size`, `hasShop`) che il probe ha mostrato aggiunti al `type City` senza toccare la classe; `ShopTransactionService.shopLocationOrReject` legge la città del marker in sessione con `exists` e va trasformato in un `findOne` con proiezione dei pool; `CatalogPricesReader` legge già il catalogo prima della transazione e può portarsi dietro `rarity` e `sellable` per il veto, più il terzo catalogo `Pet`; il pattern di boot da imitare è `SpellStateMigrator` (Phase 9.1: `OnApplicationBootstrap` atteso, errori solo loggati), non la migrazione mixed-refs della Phase 10 (che è un CLI con un verificatore al boot).

Tre trappole sono emerse dai probe e dalla lettura: (1) **un array Mongoose senza `default` riceve `[]` implicito** sia su `create` sia su `save` di un documento letto senza il campo — se i pool nascessero così ogni città creata dalle fixture (e ogni città salvata da Mongoose) risulterebbe «presente ma vuota» e la semina non la toccherebbe mai: i tre campi del pool vanno dichiarati con `default: undefined`; (2) **`CharactersService.findOne` oggi non popola `assets.pet`** (nessun consumer FE lo selezionava): il FE 13 seleziona `assets { pet { … } ownedPets { … } }` dal fragment del personaggio, quindi `findOne` deve popolare entrambi e il modello `Pet` deve essere registrato anche nell'harness (`EconomyModule` lo registrerà comunque per i prezzi); (3) **la validazione globale usa `whitelist: true`**: un campo di input senza decoratori class-validator viene scartato in silenzio, e `input-decorators.spec.ts` pretende che ogni campo SDL di ogni input abbia una regola e un `@Type` sui nested — `petAssets` e i due input nuovi entrano lì.

Due fatti contraddicono il testo dei documenti: la deprecazione D-20 **cambia** due righe dello SDL (`@deprecated(reason: …)` si stampa sulla stessa riga), quindi il gate «nessuna riga tolta» di `12-REPO-RULES.md` non può stampare `0`; e D-15 chiama «owner-only» le mutation dei pet mentre `equipItem` — il modello dichiarato — è protetto da ownership con bypass innkeeper (nel repo «owner-only» è un flag preciso, `ownerOnly: true`). Entrambi sono in §Conflicts with CONTEXT con una raccomandazione.

**Primary recommendation:** nuovo modulo `src/shops/` (query `cityShop`, report, logica pura del sorteggio) + modulo separato di manutenzione al boot importato solo da `AppModule`; pool come tre array di ObjectId tipati con `default: undefined`, rilevati come assenti per campo con `$exists: false`; il pool si controlla in `applyTrade` subito dopo la città, con la stessa lettura in sessione.

## Standard Stack

### Core (tutto già installato, nessuna dipendenza nuova)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/graphql | 13.2.0 [VERIFIED: CLAUDE.md stack] | `@ResolveField`, `deprecationReason`, `registerEnumType` | già usati nel repo; il probe ha confermato l'SDL generato |
| mongoose | 8.18.1 [VERIFIED: CLAUDE.md stack] | array di ref tipati, `updateOne` con filtro `$exists`, `bulkWrite` | stessa versione dei probe di Phase 7/10 |
| node:crypto | runtime Node 26.12.1 [VERIFIED: `node --version`] | `createHash('sha256')` per derivare il seme a 32 bit | built-in, già usato in `src/auth/crypto/token-crypto.ts` |
| class-validator / class-transformer | già in uso [VERIFIED: codebase] | `@IsOptional @IsArray @ArrayMaxSize @ValidateNested @Type` su `petAssets`, `@IsObjectIdHex` sugli input dei pet | richiesto da `whitelist: true` e da `input-decorators.spec.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mongodb-memory-server (`MongoMemoryReplSet`) | già in uso [VERIFIED: test/setup] | int-spec di semina, migrazioni, transazione | ogni test che tocca DB |
| supertest + `createAuthTestApp`/`createCharactersTestApp` | già in uso | GraphQL end-to-end | `cityShop`, `shopPoolReport`, `doTransaction`, `equipPet` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| mulberry32 su sha256 | `seedrandom` (npm) | dipendenza nuova per 10 righe di codice; vietato dallo spirito «nessuna dipendenza» |
| tre array top-level su `City` | sottodocumento `shopPool { equipment, loot, pets }` | l'«assente» diventa ambiguo (sottodoc presente con lista mancante), lo stile `pointsOfInterest` chiesto da D-03 è l'array top-level |
| `@ResolveField` | getter sulla classe `City` | i documenti idratati non sono istanze della classe: il getter non esiste a runtime |

**Installation:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── models/
│   ├── enums/city-size.enum.ts               # CitySize + registerEnumType('CitySize')
│   ├── city.model.ts                         # + shopEquipment/shopLoot/shopPets (@Prop, niente @Field, default: undefined)
│   ├── interfaces/asset-item.model.ts        # + sellable?: boolean | null (@Field nullable, @Prop Boolean senza default)
│   ├── pet.model.ts                          # + sellable?: boolean | null (stesso)
│   ├── character/character-assets.model.ts   # + ownedPets (@Field [Pet], @Prop [{ ObjectId, ref: Pet.name }], default implicito [])
│   ├── request/transaction-items.model.ts    # + petAssets (nullable, decoratori completi)
│   ├── request/equip-pet-request.model.ts    # { id, petId } con @IsObjectIdHex
│   ├── request/unequip-pet-request.model.ts  # { id }
│   └── shop/
│       ├── city-shop.model.ts                # @ObjectType CityShop { city, equipment, loot, pets }
│       └── shop-pool-report.model.ts         # @ObjectType ShopPoolReportEntry / ShopPoolReportItem
├── cities/
│   ├── city-size.ts                          # citySizeOf(type) — Record<CityType, CitySize> esaustivo
│   └── cities.resolver.ts                    # + @ResolveField size / hasShop
├── shops/
│   ├── shop-pool.constants.ts                # SHOP_SEED_VERSION, quote per taglia, pesi, garanzie, piazzamento pet, tipi senza negozio
│   ├── shop-pool.rules.ts                    # puro: isShelfEligible, allowedRaritiesOf, hasShopOf, poolIdsOf
│   ├── seeded-random.ts                      # puro: seedOf(...parts), mulberry32
│   ├── shop-pool.draw.ts                     # puro: tierQuotas, drawShopPool (equip, loot, pet)
│   ├── shop-pool.report.ts                   # puro: violationsOf(city, catalogue)
│   ├── city-shop.service.ts / city-shop.resolver.ts   # cityShop(cityId)
│   ├── shop-pool-report.service.ts / shop-admin.resolver.ts  # shopPoolReport (innkeeper)
│   ├── shops.module.ts                       # query e report (importabile dagli harness)
│   └── maintenance/
│       ├── pet-sellable.migrator.ts          # Pet.sellable dove manca (D-16)
│       ├── owned-pets.migrator.ts            # assets.pet → ownedPets (D-16)
│       ├── shop-pool.seeder.ts               # semina per campo assente (D-03)
│       ├── shop-boot.ts                      # OnApplicationBootstrap: sellable → ownedPets → semina → report WARN
│       └── shop-maintenance.module.ts        # importato SOLO da AppModule
├── characters/pets/equip-pet.updates.ts      # puro: filtri/update/classificatore, come equipment/equip-item.updates.ts
└── economy/trade/*                           # Pet kind, petAssets, pool check, inventario pet
```

Perché due moduli: gli harness (`createCharactersTestApp`, `createAuthTestApp({ imports })`) chiamano `app.init()`, che esegue ogni `OnApplicationBootstrap` dei moduli importati. Tenendo seeder e migrazioni fuori da `ShopsModule` le int-spec della query non seminano mai le città delle fixture alle loro spalle (stesso motivo per cui `createCharactersTestApp` non importa `CharactersModule`, che registra Bull) [VERIFIED: test/authz/characters-test-app.ts].

### Pattern 1: campi calcolati su `City` con `@ResolveField` (F1)
**What:** `size` e `hasShop` non sono colonne: li calcola `CitiesResolver` dal documento padre. Il probe (schema costruito con `GraphQLSchemaFactory` sulla classe `City` reale) ha stampato `size: ProbeSize!` e `hasShop: Boolean!` dentro `type City` senza modifiche alla classe [VERIFIED: probe 2026-11-02]. Il resolver di campo vale per il tipo `City` ovunque compaia (`cities`, `city`, `CityShop.city`).
**Lettura attuale:** `CitiesService.findAll` restituisce documenti **idratati** (non lean) con `populate('relatedLore')` e `populate('markerLocation')`; `findOne` popola anche `pointsOfInterest.quest` [VERIFIED: src/cities/cities.service.ts]. I tre array del pool arrivano col documento (ObjectId nudi, ~50 per città: trascurabile) e non vanno mai popolati in `cities`.
```typescript
// src/cities/cities.resolver.ts (aggiunte)
@ResolveField('size', () => CitySize)
size(@Parent() city: City): CitySize {
    return citySizeOf(city.type);
}

@ResolveField('hasShop', () => Boolean)
hasShop(@Parent() city: City): boolean {
    return hasShopOf(city); // almeno una delle tre liste non vuota (D-04)
}
```
```typescript
// src/cities/city-size.ts — esaustivo: un CityType nuovo non compila senza taglia
export const CITY_SIZE_BY_TYPE = {
    drusteaCity: CitySize.city, drusteaVillage: CitySize.village, drusteaSeaCity: CitySize.city,
    drusteaCapital: CitySize.capital, ferrionCity: CitySize.city, necrorianCity: CitySize.city,
    elfCapital: CitySize.capital, talmvereVillage: CitySize.village, /* … tutti i 33 … */
} as const satisfies Record<CityType, CitySize>;
```
Nota: tutti i 33 valori di `CityType` finiscono già per `Village`, `City`, `SeaCity` o `Capital` [VERIFIED: src/models/enums/city-type.enum.ts], quindi la regola del suffisso e la tabella di D-01 coincidono; la mappa esaustiva resta preferibile (type safety, nessun parsing di stringhe) e lo spec verifica entrambe.

### Pattern 2: pool «assente» vs «vuoto» (F2)
**Probe 2026-11-02 su `MongoMemoryReplSet` [VERIFIED]:**

| Dichiarazione | `create({})` scrive il campo? | documento letto senza campo | `save()` di quel documento scrive il campo? | lean |
|---|---|---|---|---|
| `type: [{ ObjectId, ref }]` (senza `default`) | sì, `[]` | idratato: `[]` | **sì, `[]`** | campo assente |
| `type: [{ ObjectId, ref }]`, `default: undefined` | no | idratato: `undefined` | no | campo assente |

Inoltre: `instance` del path = `Array`, `caster.instance` = `ObjectId` (nessun `Mixed`); un id salvato a mano come stringa esadecimale viene castato a `ObjectId` sul documento idratato ma resta `string` in lean.

**Raccomandazione:**
- I tre campi del pool con `default: undefined`; la semina seleziona per **campo** con il filtro `{ shopEquipment: { $exists: false } }` (e analoghi), e scrive con `updateOne({ _id, <campo>: { $exists: false } }, { $set: { <campo>: ids } })`: idempotente anche con due boot concorrenti.
- Nessun codice applicativo scrive le città (nessun uso di `CityInput`, nessuna mutation di città: [VERIFIED: grep `CityInput` e `cityModel.` in `src/`]); una città aggiunta a DB dall'utente senza i campi viene seminata al boot successivo — comportamento voluto (D-03: «solo dove assente»).
- `ownedPets` invece **vuole** il default implicito `[]` (D-13): i personaggi nuovi nascono con la lista, quelli legacy la leggono come `[]` sul documento idratato (campo GraphQL non-null soddisfatto anche prima della migrazione).
- Le liste curate a mano possono contenere stringhe: ogni lettura lean normalizza con `refIdOf`, ogni filtro usa `idForms` [VERIFIED: src/mongo/document-id.ts].

### Pattern 3: manutenzione al boot (F3)
**Modello:** `SpellStateMigrator` — `async onApplicationBootstrap()` attende il lavoro, avvolge tutto in try/catch e logga con `describeError`, non blocca mai il boot [VERIFIED: src/characters/spells/spell-state.migrator.ts]. La migrazione mixed-refs della Phase 10 è invece un CLI (`src/migrations/run-mixed-refs.ts`) con un **verificatore** al boot (`MixedRefsVerifier`, `void this.verify()` non atteso) [VERIFIED]: per D-21 qui non c'è CLI.

**Ordine obbligato (un solo provider `ShopBoot` che chiama in sequenza, ciascun passo nel suo try/catch):**
1. `PetSellableMigrator` — due `updateMany` con filtro `sellable: { $nin: [true, false] }` (copre assente e `null`): `true` sugli id di D-10, `false` sugli altri.
2. `OwnedPetsMigrator` — per ogni personaggio con `assets.pet` non nullo: `updateOne({ _id, 'assets.ownedPets': { $nin: idForms(pet) } }, { $push: { 'assets.ownedPets': pet } })` (pochi personaggi: un ciclo è più leggibile di una pipeline; `$nin` è vero anche col campo assente).
3. `ShopPoolSeeder` — per campo assente (Pattern 2), catalogo letto una volta, `bulkWrite` di `updateOne` con filtro `$exists: false`.
4. Report WARN (F8), dopo la semina.

Gli hook `OnApplicationBootstrap` di provider diversi non hanno un ordine affidabile da cui dipendere: un orchestratore unico rende l'ordine testabile [ASSUMED su dettagli interni di Nest; l'orchestratore elimina il dubbio].

**Real boot (`test/app.int-spec.ts`):** il DB `app-boot-test` è vuoto al boot [VERIFIED: beforeAll] → i quattro passi trovano zero documenti e non scrivono nulla; il test esistente filtra le WARN per messaggio (`Unsupported route path`) e non fallisce per WARN nuove [VERIFIED: righe 352, 775, 833]. Il percorso col DB popolato si prova con un'int-spec dedicata che crea i documenti **prima** di `app.init()` di un modulo minimo con `ShopMaintenanceModule`.

**Fail-safe della semina (trappola, vedi Pitfall 2):** se il catalogo non ha candidati, la semina **non scrive** liste vuote per equipaggiamenti e loot (lascia il campo assente e logga WARN), così un ambiente nuovo col catalogo caricato dopo il primo boot si semina al boot successivo. Eccezioni scritte vuote di proposito: i tre campi di Necrorian (D-04) e `shopPets` delle città senza pet in D-10.

### Pattern 4: sorteggio deterministico (F4)
- **Seme:** `seedOf(SHOP_SEED_VERSION, cityId, list)` = primi 4 byte di `sha256('v1:<cityHex>:equipment')` come uint32; un flusso separato per lista, così ri-seminare una sola lista (cancellandone il campo) ridà lo stesso risultato della prima volta a catalogo invariato.
- **Candidati:** `rarity` ∈ fasce ammesse dalla taglia, `rarity !== 'legendary'`, `sellable !== false`, `buyPrice` non nullo (un oggetto senza prezzo darebbe `ITEM_NOT_TRADABLE`), ordinati per `_id` esadecimale prima del sorteggio (l'ordine di ritorno di Mongo non è garantito).
- **Quote per fascia:** metodo del resto maggiore, pareggi alla fascia più bassa. Risultato con le costanti di D-08: village equip 8/2, loot 9/3; city equip 8/6/2, loot 9/6/3; capital equip 9/8/5/2, loot 9/8/5/2.
- **Garanzie loot (D-09):** prima del resto, 2 `hunger` e 1 `heal` pescati dalla fascia ammessa più bassa che ha ancora quota e candidati di quell'effetto (poi la successiva); ogni pesca consuma una unità della quota della sua fascia. Se nessuna fascia ammessa ha l'effetto: WARN e si prosegue.
- **Resto:** per ogni fascia, Fisher–Yates parziale senza reinserimento sui candidati non ancora presi; se la fascia è corta, la differenza passa alla fascia inferiore (D-08); se anche la più bassa è esaurita, la lista resta più corta (il report la segnala solo se vuota).
- **Pet (D-10):** nessun sorteggio: `SELLABLE_PET_PLACEMENTS` = `[{ petId, cities: [{ name, type }] }]`; la città riceve i pet il cui piazzamento la nomina e che esistono a DB; i nomi delle 7 città sono unici fra le 167 del handoff e la coppia nome+tipo corrisponde [VERIFIED: handoff Phase 11 §3, 167 nomi distinti; Fineglen `valanVillage`, Valantar `valanCapital`, Shadmus `desertVillage`, Croce Marina `tropicalVillage`, Bellport `flameNorthCapital`, Talmvere `talmvereVillage`, Cliffbreak `drusteaCapital`]. Una città del piazzamento non trovata, o trovata due volte → WARN al boot.
- **Necrorian:** identificata dal tipo (`necrorianCity`, una sola città [VERIFIED: handoff §3]) tramite `NO_SHOP_CITY_TYPES`; i tre campi `[]`.

```typescript
// src/shops/seeded-random.ts — nessuna dipendenza
import { createHash } from 'node:crypto';

export function seedOf(...parts: readonly (string | number)[]): number {
    return createHash('sha256').update(parts.join(':')).digest().readUInt32BE(0);
}

export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
```
```typescript
// src/shops/shop-pool.draw.ts — quote a resto maggiore, pareggi alla fascia più bassa
export function tierQuotas(total: number, weights: readonly TierWeight[]): Map<RarityType, number> {
    const raw = weights.map(({ rarity, weight }) => ({ rarity, exact: total * weight }));
    const quotas = new Map(raw.map(({ rarity, exact }) => [rarity, Math.floor(exact)]));
    let left = total - [...quotas.values()].reduce((sum, n) => sum + n, 0);
    const byRemainder = [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1)); // sort stabile: a parità vince l'ordine common → ultrarare
    for (const { rarity } of byRemainder) {
        if (left-- <= 0) break;
        quotas.set(rarity, (quotas.get(rarity) ?? 0) + 1);
    }
    return quotas;
}

export function takeWithoutReplacement<T>(candidates: readonly T[], count: number, next: () => number): T[] {
    const pool = [...candidates];
    const taken: T[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const index = Math.floor(next() * pool.length);
        taken.push(pool[index]);
        pool[index] = pool[pool.length - 1];
        pool.pop();
    }
    return taken;
}
```

### Pattern 5: `cityShop` (D-18)
- `CityShopService.read(cityId)`: `findById` lean con proiezione `{ name, type, shopEquipment, shopLoot, shopPets }` → `NOT_FOUND` (`ResourceNotFoundException.city()`) se manca; poi tre letture `$in` sugli id normalizzati (le due forme con `idForms` per le stringhe curate a mano), equipaggiamento con `populate('addedSpell')` (il fragment FE `EquipmentItemFields` seleziona `addedSpell { … }` [VERIFIED: FE lib/graphql/fragments/equipment_fragment.dart]).
- Veto in lettura **solo** D-05: equip/loot con `rarity === 'legendary'` o `sellable === false`; pet con `sellable === false`. Nessun filtro su taglia, prezzo o rarità fuori regola («la mano vince»).
- Ordine di risposta = ordine della lista a DB (la cura dell'utente decide l'ordine), riordinando i risultati del `$in` con una `Map`; id che non esistono più a catalogo vengono saltati (e segnalati dal report).
- `equipment`/`loot` come `AssetQuantity { itemType, item, quantity: 1 }` (D-12); `ItemUnion.resolveType` distingue con `equipType` [VERIFIED: src/models/common/item.union.ts]; `CityShop.city` restituisce il documento con i campi del pool, così `size`/`hasShop` del Pattern 1 funzionano anche lì.
- Autenticata dal guard globale, nessun decoratore di ownership (D-18): non entra in nessuna enumerazione di `app.int-spec.ts`.

### Pattern 6: estensione di `doTransaction` (F5)
**Ordine reale oggi** [VERIFIED: src/economy/trade/shop-transaction.service.ts]: `planTradeLines` (id, quantità, duplicati) → `CatalogPricesReader.read` + `priceTrade` (`ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`) → `assertClientTotalMatches` → (scambio vuoto: personaggio + città, fine) → transazione: snapshot del personaggio in sessione (`NOT_FOUND`) → `shopLocationOrReject` (`SHOP_NOT_IN_CITY`, `exists` sul marker in sessione) → `applyTradeToInventory` (`ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`, `INVALID_QUANTITY`) → fondi (`INSUFFICIENT_FUNDS`) → `writeInventory` (filtro con città, viaggio, soccorso, `soldQuantityGuards`) → `WalletService`.

**Modifiche:**
1. `trade-line.ts`: `TradeItemKind = ItemReferenceType | 'Pet'`; `INVENTORY_FIELD` resta tipizzato su `ItemReferenceType` (non su `TradeItemKind`); **non** aggiungere `'Pet'` a `ItemReferenceType` (è l'enum del `refPath` di `AssetQuantity` a DB) [VERIFIED: src/models/common/asset-quantity.model.ts].
2. `trade-pricing.ts`: `tradeSources` aggiunge `['buy', 'Pet', request.boughtItems.petAssets ?? []]` e `['sell', 'Pet', request.soldItems.petAssets ?? []]`; `toTradeLine` per `Pet` rifiuta `quantity !== 1` con `INVALID_QUANTITY` (D-17).
3. `catalog-prices.reader.ts`: inietta `Pet`, proietta `{ buyPrice, sellPrice, rarity, sellable }`; `CatalogPrice` guadagna `rarity?` e `sellable?` (lettura fuori transazione, come i prezzi oggi). `EconomyModule` registra `Pet` in `forFeature`.
4. `shop-transaction.service.ts`: `shopLocationOrReject` diventa una lettura `findOne({ markerLocation: { $in: idForms(location) } }, POOL_PROJECTION).session(session).lean()` che restituisce location + pool; in `applyTrade`, **subito dopo** la città: `assertBuysInShop(lines, pool, catalogue)` → `ITEM_NOT_IN_SHOP` per ogni riga `buy` il cui id non sta nella lista del suo tipo (confronto con `sameId`, tollerante alle stringhe) o è vietata (D-05); poi `assertPetsNotOwned(lines, snapshot)` → `PET_ALREADY_OWNED`; poi possesso e fondi come oggi. Lo scambio vuoto non tocca il pool (nessuna riga).
5. `TRADE_SNAPSHOT_PROJECTION` + `'assets.ownedPets': 1` e `'assets.pet': 1`; `InventorySnapshot` + `ownedPets?: unknown[]`, `pet?: unknown`.
6. Inventario pet in una funzione separata (non `InventoryEntry`: niente quantità): acquisto → aggiunge `ObjectId`; vendita → `ITEM_NOT_OWNED` se assente, rimuove, `unequipPet = sameId(snapshot.pet, petId)`.
7. `inventoryChanges`: `assets.ownedPets` nel `$set` **solo se** lo scambio ha righe pet, `assets.pet: null` solo se il pet equipaggiato è venduto (vedi Pitfall 5).
8. Guardie nel filtro di `writeInventory`, accanto a `soldQuantityGuards` nello stesso `$and`: acquisto pet → `{ 'assets.ownedPets': { $nin: idForms(petId) } }`; vendita pet → `{ 'assets.ownedPets': { $in: idForms(petId) } }`.

Il pool è letto in sessione dentro la transazione (D-19): una cura a DB concorrente non crea `WriteConflict` (la città non viene scritta), ma la transazione vede uno snapshot coerente; è lo stesso livello di garanzia della città oggi.

### Pattern 7: `equipPet` / `unequipPet` (F6)
Speculare a `equipItem` [VERIFIED: src/characters/characters.service.ts, src/characters/equipment/equip-item.updates.ts]:
```typescript
// src/characters/pets/equip-pet.updates.ts
export const equipPetFilter = (characterId: Types.ObjectId, petId: Types.ObjectId) => ({
    ...activeCharacterById(characterId),
    'assets.ownedPets': { $in: idForms(petId) },
});
export const equipPetUpdate = (petId: Types.ObjectId | null) => ({ $set: { 'assets.pet': petId } });
export const classifyEquipPetFailure = (characterExists: boolean): Error =>
    characterExists ? GameRuleException.petNotOwned() : ResourceNotFoundException.character();
```
- `equipPet`: `updateOne(equipPetFilter, equipPetUpdate(petId))`; `matchedCount === 0` → `exists` del personaggio → `PET_NOT_OWNED` o `NOT_FOUND`. Idempotente: rieseguire sullo stesso pet fa match e risponde successo.
- `unequipPet`: filtro `activeCharacterById`, `$set` a `null`; `matchedCount === 0` → `NOT_FOUND`; idempotente.
- Nessun vincolo di viaggio/soccorso (D-15).
- Resolver: `@OwnsCharacter<{ request: EquipPetRequest }>(({ request }) => request.id)`; le due mutation entrano in `EXPECTED_OWNERSHIP_HANDLERS` di `test/app.int-spec.ts` (e in `EXPECTED_OWNER_ONLY_HANDLERS` solo se si sceglie `ownerOnly: true`, vedi C1).
- **Populate:** `CharactersService.findOne` oggi popola inventario, magie, posizione e quest ma **non** `assets.pet` [VERIFIED: src/characters/characters.service.ts]; `characterUpdated` (snapshot iniziale e ogni evento del change stream) passa da `findOne` [VERIFIED: characters.resolver.ts, character-updates.publisher.ts]. Aggiungere `.populate({ path: 'assets.pet', model: 'Pet' })` e `.populate({ path: 'assets.ownedPets', model: 'Pet' })`: con questo il FE riceve i due campi dal fragment senza altro lavoro. Il change stream non filtra per campo (solo `operationType` e `deletedAt`) [VERIFIED: character-changes.pipeline.ts]: le scritture di `equipPet` e della transazione pubblicano già.

### Pattern 8: report di sola lettura (F8)
- Funzione pura `violationsOf(city, catalogue)` → `{ cityId, cityName, size, emptyPool, outOfSize: Item[], vetoed: Item[], missing: ID[] }`: `outOfSize` = equip/loot con rarità non ammessa dalla taglia (o senza rarità); `vetoed` = presenti a DB ma mai serviti (legendary, `sellable: false`, pet `sellable: false`); `missing` = id che non esistono più a catalogo; `emptyPool` = tutte e tre le liste vuote **escluse** le città di `NO_SHOP_CITY_TYPES` (Necrorian vuota è la regola, non una violazione). Le città non ancora seminate (campo assente) si riportano come `unseeded` solo nel log.
- Boot: una WARN per città con violazioni, con un tetto (come `OUT_OF_RANGE_WARNINGS_LIMIT = 50` di `SpellStateMigrator`) e una riga di riepilogo; solo id, nomi e conteggi.
- Query: `@Roles(RoleType.innkeeper) @Query(() => [ShopPoolReportEntry]) shopPoolReport()` in un `ShopAdminResolver` (stile `TravelAdminResolver`), che restituisce solo le città con almeno una violazione. In `EXPECTED_INNKEEPER_HANDLERS` (ordinato): `'ShopAdminResolver.shopPoolReport'` fra `'PushResolver.sendTestPush'` e `'TravelAdminResolver.teleportCharacter'` — da aggiungere in RED prima del resolver.

### Anti-Patterns to Avoid
- **Array del pool senza `default: undefined`:** ogni `create`/`save` scrive `[]` e la semina li salta per sempre (probe).
- **Popolare i pool nella query `cities`:** 167 × ~50 documenti al cold start, contro D-18.
- **`$set` di `assets.ownedPets` a ogni transazione:** rompe gli `toEqual` sull'intero `assets` dei test esistenti (es. «buys for a legacy character stored without an inventory», `shop-transaction.service.int-spec.ts:494`) e scrive campi senza motivo.
- **Seeder nello stesso modulo della query:** semina le città delle fixture negli harness.
- **Equipaggiamento automatico all'acquisto** (D-14) o filtri di taglia in lettura (D-05).
- **Confronti di id con `===` o `includes` su ObjectId:** usare `sameId`/`idForms`; le liste curate a mano possono contenere stringhe.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Normalizzazione id ObjectId/stringa | confronti ad hoc | `refIdOf`, `sameId`, `idForms` (`src/mongo/document-id.ts`) | coprono già i dati legacy e i filtri `$in`/`$nin` |
| Atomicità di inventario + monete | due scritture separate | la transazione esistente (`connection.transaction`) + `WalletService` | unico scrittore dei coins (04 D-04), retry sui WriteConflict |
| Ownership delle mutation | controlli nel service | `@OwnsCharacter` + `OwnershipGuard` | audit e bypass innkeeper già gestiti e enumerati |
| Ruolo innkeeper | check manuale del ruolo | `@Roles(RoleType.innkeeper)` | enumerato dal real boot |
| Messaggi di errore di gioco | `BadRequestException` grezze | `GameRuleException.<factory>()` con codice in `extensions.code` | il FE legge solo i codici; spec «covers every GameRuleErrorCode exactly once» |
| Hash del seme | hash a mano (FNV, djb2) | `createHash('sha256')` | built-in, stabile, già usato nel repo |
| Log degli errori Mongo | `String(error)` | `describeError` (`src/mongo/mongo-errors.ts`) | niente URI/host nei log (regola dei segreti) |

**Key insight:** il negozio è già una transazione con guardie riaffermate; la fase aggiunge una lettura (pool in sessione) e una lista (pet) dentro la stessa struttura, non un secondo percorso di scrittura.

## Runtime State Inventory (stato a DB toccato al boot dopo la merge)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `cities` (167): tre campi nuovi assenti → seminati al primo boot; `characters`: `assets.ownedPets` assente sui legacy (1 su 4 con `assets.pet`, D-16); `pets` (13): `sellable` assente; `equipmentitems`/`lootitems`: `sellable` già presente su una parte (campo legacy fuori schema, distribuzione non nota) | migrazioni al boot (codice); nessuna migrazione dati per `sellable` degli oggetti |
| Live service config | nessuna — verificato: nessun CLI, nessuna config fuori repo per i negozi | nessuna |
| OS-registered state | nessuna — il BE gira da `dist/` riavviato dall'utente | riavvio manuale dopo la merge (runbook) |
| Secrets/env vars | nessuna variabile nuova (regola della fase) | nessuna |
| Build artifacts | `dist/` dell'utente | `npm run build` dell'utente prima del riavvio (runbook) |

## Common Pitfalls

### Pitfall 1: default implicito degli array Mongoose
**What goes wrong:** pool «presenti ma vuoti» ovunque; `placeInCity` delle fixture e qualunque `save()` scrivono `[]`.
**Why it happens:** Mongoose dà `[]` di default a ogni path array (probe).
**How to avoid:** `default: undefined` sui tre campi del pool; unit spec che crea un documento e verifica che `toObject()` non abbia la chiave.
**Warning signs:** `hasShop` falso su città appena seminate nei test; semina che conta 0.

### Pitfall 2: primo boot con catalogo vuoto
**What goes wrong:** un ambiente nuovo (o staging con catalogo caricato dopo) riceve pool `[]` permanenti.
**How to avoid:** non scrivere mai una lista equip/loot vuota tranne che per Necrorian; WARN «catalogo senza candidati, semina rinviata».

### Pitfall 3: i test esistenti del negozio comprano in città senza pool
**What goes wrong:** dopo il controllo del pool, ogni acquisto di `shop-transaction.service.int-spec.ts` e `do-transaction.int-spec.ts` risponde `ITEM_NOT_IN_SHOP`.
**Why it happens:** `placeInCity` (`test/economy/place-in-city.ts`) crea la città con `persistCity` senza pool.
**How to avoid:** `placeInCity(harness, character, pool?)` accetta `{ equipment, loot, pets }`; `persistTrader` delle due int-spec mette in pool le fixture del catalogo (`sword`, `potion`, `relic`) così i casi esistenti restano verdi; i casi nuovi creano oggetti fuori pool. Va fatto nel piano RED del controllo del pool.

### Pitfall 4: `whitelist: true` scarta `petAssets`
**What goes wrong:** `petAssets` arriva `undefined` al service, nessun pet si compra, nessun errore.
**How to avoid:** `@IsOptional() @IsArray() @ArrayMaxSize(MAX_TRANSACTION_LINES) @ValidateNested({ each: true }) @Type(() => AssetQuantityInput)`; `input-decorators.spec.ts` lo pretende (regole per ogni campo SDL, `@Type` sui nested) [VERIFIED].
**Trappola correlata:** con `defaultValue: []` l'SDL stampa `petAssets: [AssetQuantityInput!] = []` (probe) e `namedTypeOf` di `input-decorators.spec.ts` ricava `AssetQuantityInput = ` → il controllo `@Type` del campo verrebbe saltato in silenzio. Usare solo `nullable: true` (SDL `petAssets: [AssetQuantityInput!]`) e `?? []` nel codice (vedi C3).

### Pitfall 5: `$set` troppo largo in `writeInventory`
**What goes wrong:** test con `toEqual` sull'intero `assets` falliscono; personaggi legacy ricevono campi non toccati.
**How to avoid:** includere `assets.ownedPets` / `assets.pet` nel `$set` solo quando lo scambio ha righe pet.

### Pitfall 6: `assets.pet` non popolato
**What goes wrong:** il FE 13 seleziona `assets { pet { name speedModifier } }` e riceve un errore di campo non-null (il resolver di default legge `name` da un ObjectId).
**How to avoid:** populate di `assets.pet` e `assets.ownedPets` in `findOne`; `Pet` registrato nell'harness (lo garantisce `EconomyModule` con `forFeature` di `Pet`, importato da `createCharactersTestApp`).
**Warning signs:** `MissingSchemaError: Schema hasn't been registered for model "Pet"` nelle int-spec dei personaggi.

### Pitfall 7: sorteggio non deterministico
**What goes wrong:** due boot o due ambienti danno pool diversi a parità di catalogo.
**How to avoid:** ordinare i candidati per `_id` prima del sorteggio, un flusso PRNG per lista, nessun `Math.random`; spec che confronta due esecuzioni e una che verifica la località (cambiare il catalogo loot non cambia gli equipaggiamenti).

### Pitfall 8: veto in lettura più largo di D-05
**What goes wrong:** filtrare per taglia o rarità in `cityShop` tradisce «la mano vince».
**How to avoid:** spec con un ultrarare a mano in un villaggio: servito e acquistabile.

### Pitfall 9: enumerazioni del real boot e delle spec trasversali
Da aggiornare in RED: `EXPECTED_INNKEEPER_HANDLERS` (report), `EXPECTED_OWNERSHIP_HANDLERS` (`equipPet`, `unequipPet`), `OPERATIONS` di `characters-ownership.int-spec.ts` e di `archived-character-visibility.int-spec.ts`, `VALIDATED_INPUTS` di `input-decorators.spec.ts` (`EquipPetRequest`, `UnequipPetRequest`), `cases` di `game-rule.exception.spec.ts` («covers every GameRuleErrorCode exactly once»). Il conteggio «34 references in 10 collections» di `mixed-ref-paths.spec.ts` **non** cambia: i path nuovi nascono `ObjectId` e non si migrano; il test «leaves no Mixed reference» li copre comunque.

## Code Examples

### Campi del pool su `City`
```typescript
// Source: probe 2026-11-02 + stile pointsOfInterest (src/models/city.model.ts)
// solo Mongoose (niente @Field): il pool viaggia con cityShop, mai con cities (D-18)
@Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'EquipmentItem' }],
    default: undefined, // assente finché la semina non lo scrive (D-03)
})
shopEquipment?: Types.ObjectId[];
// shopLoot → ref 'LootItem', shopPets → ref 'Pet', stessa forma
```

### `ownedPets`
```typescript
// Source: src/models/character/character-assets.model.ts (stile di pet)
@Field(() => [Pet])
@Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: Pet.name }] }) // default implicito [] voluto (D-13)
ownedPets: (Types.ObjectId | Pet)[];
```

### `sellable` sui cataloghi
```typescript
// AssetItem (eredita EquipmentItem e LootItem) e Pet: nessun default, l'assenza resta leggibile
@Field(() => Boolean, { nullable: true })
@Prop({ type: Boolean })
sellable?: boolean | null;
```

### `petAssets`
```typescript
@Field(() => [AssetQuantityInput], { nullable: true })
@IsOptional()
@IsArray()
@ArrayMaxSize(MAX_TRANSACTION_LINES)
@ValidateNested({ each: true })
@Type(() => AssetQuantityInput)
petAssets?: AssetQuantityInput[] | null;
```

### Deprecazione (D-20)
```typescript
// SDL risultante (probe): equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")
@Query(() => [AssetQuantity], { deprecationReason: 'Phase 12: use cityShop' })
```

### Controllo del pool in transazione
```typescript
// dentro applyTrade, dopo shopLocationOrReject (D-19)
const { location, pool } = await this.shopOrReject(snapshot, session);
assertBuysInShop(lines, pool, catalogue);      // ITEM_NOT_IN_SHOP: fuori lista o legendary / sellable false
assertPetsNotOwned(lines, snapshot.assets);    // PET_ALREADY_OWNED
const inventory = applyTradeToInventory(snapshot.assets ?? {}, lines); // possesso, come oggi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| catalogo globale `equipmentAssetsQuantity(sellable: true)` + `lootAssetsQuantity` | `cityShop(cityId)` | Phase 12 | le due query restano deprecate fino a una fase futura |
| `sellable` fuori schema, filtrato con `strictQuery` false | `sellable: Boolean` nullable a schema | Phase 12 | il filtro esistente continua a funzionare identico |
| `assets.pet` unico (posseduto = equipaggiato) | `ownedPets` + `pet` equipaggiato | Phase 12 | il viaggio legge sempre e solo `assets.pet` |
| Migrazioni dati via CLI (Phase 10/11) | manutenzione al boot (D-21) | Phase 12 | il CLI non esiste più dopo D-36 |

**Deprecated/outdated:** i riferimenti del handoff Phase 11 a `citySizeOf`/`dungeonSizeKeyOf` e ai file `content/` non esistono più nel repo (D-36, [VERIFIED: `src/content` e `content/` assenti]); la taglia si ricostruisce in `src/cities/city-size.ts`.

## Conflicts with CONTEXT

| # | Decisione | Fatto trovato | Raccomandazione |
|---|-----------|---------------|-----------------|
| C1 | D-15 (e REQUIREMENTS BE-SHOP-06, ROADMAP SC5): mutation «owner-only … stesso stile e stesse guardie di `equipItem`» | `equipItem` è `@OwnsCharacter` **senza** `ownerOnly`: l'innkeeper può agire per conto del personaggio (con audit). Nel repo «owner-only» è il flag `ownerOnly: true` (nessun bypass innkeeper, lista `EXPECTED_OWNER_ONLY_HANDLERS`) [VERIFIED: ownership.decorators.ts, app.int-spec.ts 114–151] | Seguire `equipItem` (ownership con bypass innkeeper, entra solo in `EXPECTED_OWNERSHIP_HANDLERS`): coerente con `doTransaction` e `equipItem`, che l'innkeeper usa già da game master. Se l'utente intende davvero «nessun bypass», aggiungere `{ ownerOnly: true }` e la riga in `EXPECTED_OWNER_ONLY_HANDLERS`. L'orchestratore emenda D-15 con la parola esatta |
| C2 | D-20 «SDL additivo, nessuna riga tolta» e gate di `12-REPO-RULES.md` (`grep -cE '^-[^-]'` stampa `0`) | `deprecationReason` produce `… @deprecated(reason: "Phase 12: use cityShop")` **sulla stessa riga** della query (probe): il diff mostra 2 righe tolte e 2 aggiunte (righe 488 e 493 di `src/schema.gql`) | Gate corretto: le righe tolte sono esattamente 2 e sono le due query, che ricompaiono con `@deprecated`; nessun'altra riga tolta. Proposta: `git diff origin/develop -- src/schema.gql \| grep -E '^-[^-]'` stampa solo `-  equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]!` e `-  lootAssetsQuantity: [AssetQuantity!]!` |
| C3 | D-17 «`petAssets` … (default `[]`)» | un `defaultValue: []` code-first stampa `= []` nell'SDL e accieca il controllo `@Type` di `input-decorators.spec.ts` (Pitfall 4) | Default `[]` solo semantico nel codice (`?? []`), SDL `petAssets: [AssetQuantityInput!]` nullable. Il FE può omettere il campo; nessun impatto sul contratto |
| C4 | D-01 «tabella esplicita per i tipi che il suffisso non decide» | il suffisso decide già tutti i 33 tipi (`elfCapital`, `talmvereVillage`, `ferrionCity`, `necrorianCity` finiscono per `Capital`/`Village`/`City`) | Nessun cambio di comportamento: mappa esaustiva per type safety. Solo informativo |
| C5 | D-03 «stile delle migrazioni di Phase 9.1 e 10» | la Phase 10 (mixed-refs) è un CLI con verificatore al boot, non una migrazione al boot | Modello unico: `SpellStateMigrator` (Phase 9.1). Solo informativo |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sellable` assente su un equipaggiamento/loot va trattato come vendibile (solo `false` vieta) | Pattern 4/5 | se gran parte degli equipaggiamenti non leggendari avesse `sellable: false`, i pool sarebbero corti; il report e la query di catalogo esistente lo mostrerebbero subito. La distribuzione reale non è documentata (l'export della Phase 11 lo conserva «se presente») |
| A2 | I 13 pet hanno tutti i campi non-null del tipo `Pet` (`imagePath`, `xp`, …) | Pattern 5 | basso: il FE non seleziona `imagePath` (contratto fissato); resta solo per altri client della query `pets` |
| A3 | Ci sono almeno 2 loot `hunger` e 1 `heal` `common` vendibili | Pattern 4 | il handoff elenca 9 cibi regionali common e 2 cure common [CITED: handoff Phase 11 §5]; il fallback alla fascia successiva copre il resto |
| A4 | Gli hook `OnApplicationBootstrap` di provider diversi non vanno usati per imporre un ordine | Pattern 3 | nessuno: l'orchestratore unico rende l'ordine esplicito comunque |
| A5 | Abbinare le città di D-10 per nome + tipo è accettabile anche se la memoria dell'utente preferisce gli id | Pattern 4 | solo 4 dei 7 id sono documentati (Fineglen `6909620459bb3490e08d63fc`, Shadmus `690962041becd7b75e22f8ef`, Croce Marina `690961f202b81d16eecf4872` dal report 11-12, Valantar `6909620487db8bf7dca08934` dal handoff); Bellport, Talmvere e Cliffbreak no. Se l'utente fornisce gli id, la costante passa agli id senza altri cambi |

## Open Questions (RESOLVED)

1. **Nomi dei campi del pool** — RESOLVED: `shopEquipment`, `shopLoot`, `shopPets` (solo Mongoose, non nello SDL).
2. **Assente per città o per campo?** — RESOLVED: per campo, con flusso PRNG per lista (ri-seminare una lista non tocca le altre). Runbook: cancellare il campo a DB e riavviare.
3. **`hasShop` sul pool grezzo o servito?** — RESOLVED: grezzo (almeno una delle tre liste non vuota), calcolabile senza letture extra in `cities`; un pool con soli oggetti vietati apre un negozio vuoto e il report lo segnala come `vetoed` (D-06). Necrorian: tre liste vuote → `hasShop` falso (D-04).
4. **Città create a DB dopo la semina** — RESOLVED: nessuna mutation crea città; una città nuova senza campi viene seminata al boot successivo.
5. **Oggetti senza prezzo o senza rarità** — RESOLVED: esclusi dalla semina; se curati a mano vengono serviti (D-05) e il report li elenca (`outOfSize` per la rarità mancante); l'acquisto di un oggetto senza prezzo resta `ITEM_NOT_TRADABLE` come oggi, prima del controllo del pool.
6. **Arrotondamento delle quote** — RESOLVED: resto maggiore, pareggi alla fascia più bassa (tabella in Pattern 4).
7. **Le garanzie D-09 consumano la quota?** — RESOLVED: sì, una unità della fascia da cui vengono pescate.
8. **Necrorian nel report** — RESOLVED: esclusa da `emptyPool` (vuota per regola); compare solo se l'utente vi mette oggetti fuori regola.
9. **Nome della query di report e del tipo** — RESOLVED: `shopPoolReport: [ShopPoolReportEntry!]!` in `ShopAdminResolver` (`@Roles(innkeeper)`).
10. **Ordine delle voci in `cityShop`** — RESOLVED: l'ordine della lista a DB.
11. **`cityShop` su città non ancora seminata** — RESOLVED: liste vuote, `hasShop` falso, nessun errore.
12. **Owner-only o ownership per `equipPet`/`unequipPet`** — domanda di prodotto, vedi C1 (raccomandazione: come `equipItem`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, jest | ✓ | 26.12.1 | — |
| MongoMemoryReplSet | int-spec | ✓ | (probe eseguita 2026-11-02) | — |
| Redis effimero (`test/setup/redis.ts`) | `test/app.int-spec.ts` | ✓ (usato dal real boot) | — | — |
| Database reale | — | non usato in questa fase (regola) | — | — |

**Missing dependencies:** nessuna.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest, due progetti (`unit`: `*.spec.ts`, `integration`: `*.int-spec.ts` con `MongoMemoryReplSet` globale) |
| Config file | `package.json` → `jest.projects` |
| Quick run command | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| Full suite command | `npm run test:cov` (solo nel piano di gate) |
| Schema gate | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` poi `git diff --exit-code src/schema.gql` |
| Type gate | `npx tsc --noEmit -p tsconfig.json` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-SHOP-01 | `citySizeOf` per i 33 tipi + i 4 speciali (D-01, D-02) | unit | `npx jest src/cities/city-size.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-SHOP-01 | pool assente su create/save (`default: undefined`), `ownedPets` default `[]`, nessun `Mixed` | unit | `npx jest src/models/shop-fields.schema.spec.ts src/migrations/mixed-refs/mixed-ref-paths.spec.ts --selectProjects unit` | ❌ / ✅ |
| BE-SHOP-01 | `size`/`hasShop` in `cities` e `city` (Necrorian falso, non seminata falso) | integration | `npx jest src/cities/cities.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-01/04 | PRNG deterministico, quote, garanzie hunger/heal, fallback di fascia, pet per lore, Necrorian vuota, località per lista | unit | `npx jest src/shops/seeded-random.spec.ts src/shops/shop-pool.draw.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-SHOP-01 | semina solo dei campi assenti, mai dei presenti vuoti, idempotente, catalogo vuoto rinviato, stringhe tollerate | integration | `npx jest src/shops/maintenance/shop-pool.seeder.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-01 | report puro (fuori taglia, vietati, mancanti, vuoti, Necrorian esclusa) | unit | `npx jest src/shops/shop-pool.report.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-SHOP-01 | boot: ordine sellable → ownedPets → semina → WARN, errori non bloccanti | integration | `npx jest src/shops/maintenance/shop-boot.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-01 | `shopPoolReport` innkeeper ok, player `FORBIDDEN` | integration | `npx jest src/shops/shop-admin.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-02 | `cityShop`: veti D-05 in lettura, «la mano vince», ordine DB, `addedSpell` popolato, `NOT_FOUND`, non seminata vuota | integration | `npx jest src/shops/city-shop.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-02 | `sellable` a schema (EquipmentItem, LootItem, Pet) e deprecazioni nello SDL | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (asserzioni nuove) |
| BE-SHOP-03 | `ITEM_NOT_IN_SHOP` (fuori pool, legendary, `sellable: false`) senza scritture; vendita fuori pool e di un leggendario ammessa; ordine dei rifiuti (D-19) | integration | `npx jest src/economy/trade/shop-transaction.service.int-spec.ts src/economy/trade/do-transaction.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-SHOP-03/06 | righe pet, quantità 1, `Pet` nel reader, guardie pet | unit + integration | `npx jest src/economy/trade/trade-pricing.spec.ts src/economy/trade/trade-inventory.spec.ts --selectProjects unit` e `npx jest src/economy/trade/catalog-prices.reader.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-SHOP-03/06 | codici nuovi | unit | `npx jest src/gameRules/game-rule.exception.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-SHOP-06 | `petAssets` validato, input dei pet validati | unit | `npx jest src/validation/input-decorators.spec.ts src/validation/input-rules.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-SHOP-06 | migrazioni `Pet.sellable` e `ownedPets` idempotenti, «la mano vince» | integration | `npx jest src/shops/maintenance/pet-sellable.migrator.int-spec.ts src/shops/maintenance/owned-pets.migrator.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-06 | `equipPet`/`unequipPet`: solo posseduto, idempotenti, in viaggio ammesso, `NOT_FOUND` su archiviato | unit + integration | `npx jest src/characters/pets/equip-pet.updates.spec.ts --selectProjects unit` e `npx jest src/characters/pets/equip-pet.int-spec.ts src/characters/characters-ownership.int-spec.ts src/characters/archived-character-visibility.int-spec.ts --selectProjects integration --runInBand` | ❌ / ✅ |
| BE-SHOP-06 | `characterUpdated` e `character` portano `assets.pet` e `assets.ownedPets` popolati | integration | `npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-SHOP-05 | flusso completo villaggio / città / capitale seminati → `cityShop` → acquisto, fuori pool, pet comprato, equipaggiato, venduto altrove con slot svuotato | integration | `npx jest test/shops/city-shops.e2e.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SHOP-05 | superficie di autorizzazione + contratto SDL del FE | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |

**Nomi del contratto FE da asserire nel real boot (toContain sullo SDL):** `cityShop(cityId: ID!): CityShop!`, `type CityShop`, `enum CitySize`, `size: CitySize!`, `hasShop: Boolean!`, `ownedPets: [Pet!]!`, `petAssets: [AssetQuantityInput!]`, `sellable: Boolean` (in `EquipmentItem`, `LootItem`, `Pet`), `equipPet(request: EquipPetRequest!): CommonResponse!`, `unequipPet(request: UnequipPetRequest!): CommonResponse!`, `input EquipPetRequest` con `petId: String!`, `input UnequipPetRequest`, `enum CitySize` con `village`/`city`/`capital`; i codici `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED` si asseriscono via `extensions.code` nelle int-spec (non sono nello SDL).

### Sampling Rate
- **Per task commit:** solo le spec mirate del task (comandi sopra) + `npx tsc --noEmit -p tsconfig.json`.
- **Per piano che cambia lo SDL:** real boot + `git diff --exit-code src/schema.gql` dopo il commit.
- **Phase gate:** `npm run test:cov` verde con le soglie di coverage, gate SDL (C2), `pgrep -fl jest` vuoto.

### Wave 0 Gaps
- [ ] `test/economy/place-in-city.ts` — parametro `pool` (Pitfall 3)
- [ ] `test/fixtures/city.fixture.ts` — nessun cambio necessario (i campi restano assenti); eventuale `buildCityOfType(type, name)` per villaggio/città/capitale
- [ ] `test/fixtures/pet.fixture.ts` — override `sellable`
- [ ] `test/shops/` — helper per seminare villaggio, città e capitale con catalogo minimo per fascia
- [ ] spec nuove elencate sopra (❌)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sì (invariato) | guard JWT globale: `cityShop` e `shopPoolReport` mai `@Public` (enumerazione del real boot) |
| V3 Session Management | no | — |
| V4 Access Control | sì | `@OwnsCharacter` su `equipPet`/`unequipPet` e `doTransaction`; `@Roles(innkeeper)` su `shopPoolReport`; `cityShop` non owner-aware per decisione (D-18: i pool non sono segreti) |
| V5 Input Validation | sì | class-validator con `whitelist: true`: `@IsObjectIdHex` su `id`/`petId`, `ObjectIdPipe` su `cityId`, `@ArrayMaxSize` su `petAssets`, quantità 1 nel dominio |
| V6 Cryptography | no (sha256 solo come hash del seme, non di sicurezza) | `node:crypto` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Acquisto fuori pool / di un leggendario forzando la mutation | Tampering | pool e veto ricontrollati in sessione nella transazione (`ITEM_NOT_IN_SHOP`), indipendenti dal client |
| Doppio acquisto concorrente dello stesso pet | Tampering | controllo sullo snapshot + `$nin` nel filtro della scrittura + WriteConflict della transazione |
| Vendita concorrente del pet equipaggiato mentre si equipaggia | Tampering | vendita: `$in` nel filtro e `assets.pet` a null nella stessa scrittura; `equipPet` con filtro su `ownedPets`: una delle due fallisce |
| Prezzo del pet scelto dal client | Tampering | prezzo da `CatalogPricesReader` + cross-check del totale (04 D-06) |
| Equipaggiare un pet altrui / su un personaggio altrui | Elevation | `OwnershipGuard` + filtro su `ownedPets` del personaggio |
| Report che espone dati di personaggi | Information disclosure | il report legge solo città e cataloghi; log con id, nomi e conteggi |
| Query `cityShop` costosa ripetuta | DoS | tre letture `$in` limitate dal pool (~50 id), proiezioni lean |

## Suggested wave plan

Esecuzione sequenziale sull'albero principale (nessun worktree); le wave indicano le dipendenze. 19 piani.

**Wave 1 — schema e modello**
- **12-01 Taglia della città e campi del pool** — `src/models/enums/city-size.enum.ts`, `src/cities/city-size.ts` (+ `.spec.ts`), `src/models/city.model.ts` (tre campi, `default: undefined`), `src/shops/shop-pool.rules.ts` (`hasShopOf`, + spec), `src/cities/cities.resolver.ts` (`@ResolveField`), `src/cities/cities.resolver.int-spec.ts`, `src/models/shop-fields.schema.spec.ts`, `src/schema.gql`.
- **12-02 `sellable` a schema** — `src/models/interfaces/asset-item.model.ts`, `src/models/pet.model.ts`, `src/models/shop-fields.schema.spec.ts`, `src/schema.gql`.
- **12-03 `assets.ownedPets` e populate dei pet** — `src/models/character/character-assets.model.ts`, `src/characters/characters.service.ts` (populate `assets.pet` + `assets.ownedPets`), `src/characters/creation/starting-character.ts` (+ spec), `src/economy/economy.module.ts` (`Pet` in `forFeature`), `src/characters/character-updated.subscription.int-spec.ts`, `src/schema.gql`.
- **12-04 Codici di gioco nuovi** — `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/gameRules/game-rule.exception.spec.ts`.

**Wave 2 — logica pura della semina**
- **12-05 Costanti e PRNG** — `src/shops/shop-pool.constants.ts`, `src/shops/seeded-random.ts` (+ spec).
- **12-06 Sorteggio dei pool** — `src/shops/shop-pool.draw.ts` (+ spec: quote, garanzie, fallback, pet, Necrorian, località), `src/shops/shop-pool.rules.ts` (`isShelfEligible`, `allowedRaritiesOf`, + spec).

**Wave 3 — manutenzione al boot**
- **12-07 Migrazione `Pet.sellable`** — `src/shops/maintenance/pet-sellable.migrator.ts` (+ int-spec).
- **12-08 Migrazione `ownedPets`** — `src/shops/maintenance/owned-pets.migrator.ts` (+ int-spec).
- **12-09 Semina dei pool** — `src/shops/maintenance/shop-pool.seeder.ts` (+ int-spec), `test/shops/shop-world.fixture.ts`.
- **12-10 Report puro, orchestratore di boot e modulo** — `src/shops/shop-pool.report.ts` (+ spec), `src/shops/shop-pool-report.service.ts`, `src/shops/maintenance/shop-boot.ts` (+ int-spec), `src/shops/maintenance/shop-maintenance.module.ts`, `src/app.module.ts`.

**Wave 4 — query e deprecazioni**
- **12-11 `cityShop`** — `src/models/shop/city-shop.model.ts`, `src/shops/city-shop.service.ts`, `src/shops/city-shop.resolver.ts` (+ int-spec), `src/shops/shops.module.ts`, `src/app.module.ts`, `src/schema.gql`.
- **12-12 `shopPoolReport` (innkeeper)** — RED in `test/app.int-spec.ts` (`EXPECTED_INNKEEPER_HANDLERS`), `src/models/shop/shop-pool-report.model.ts`, `src/shops/shop-admin.resolver.ts` (+ int-spec), `src/shops/shops.module.ts`, `src/schema.gql`.
- **12-13 Deprecazione delle query di catalogo** — `src/equipmentItems/equipment-items.resolver.ts`, `src/lootItems/loot-items.resolver.ts`, `test/app.int-spec.ts` (asserzione `@deprecated`), `src/schema.gql` (le 2 righe di C2).

**Wave 5 — transazione**
- **12-14 Righe pet e `petAssets`** — `src/models/request/transaction-items.model.ts`, `src/economy/trade/trade-line.ts`, `src/economy/trade/trade-pricing.ts` (+ spec), `src/economy/trade/catalog-prices.reader.ts` (+ int-spec), `src/validation/input-decorators.spec.ts`, `src/schema.gql`.
- **12-15 Controllo del pool (`ITEM_NOT_IN_SHOP`)** — `test/economy/place-in-city.ts` (pool), `src/economy/trade/shop-transaction.service.ts`, `src/shops/shop-pool.rules.ts` (`assertBuysInShop` o predicato condiviso), `src/economy/trade/shop-transaction.service.int-spec.ts`, `src/economy/trade/do-transaction.int-spec.ts`.
- **12-16 Inventario dei pet (`PET_ALREADY_OWNED`, vendita del pet equipaggiato)** — `src/economy/trade/trade-inventory.ts` (+ spec), `src/economy/trade/shop-transaction.service.ts`, le due int-spec del negozio.

**Wave 6 — mutation dei pet**
- **12-17 `equipPet` / `unequipPet`** (forme del contratto FE fissato) — RED in `test/app.int-spec.ts` (`EXPECTED_OWNERSHIP_HANDLERS`), `src/models/request/equip-pet-request.model.ts`, `src/models/request/unequip-pet-request.model.ts`, `src/characters/pets/equip-pet.updates.ts` (+ spec), `src/characters/characters.service.ts`, `src/characters/characters.resolver.ts`, `src/characters/pets/equip-pet.int-spec.ts`, `src/characters/characters-ownership.int-spec.ts`, `src/characters/archived-character-visibility.int-spec.ts`, `src/validation/input-decorators.spec.ts`, `src/validation/input-rules.spec.ts`, `src/schema.gql`.

**Wave 7 — gate e handoff**
- **12-18 Integration gate BE-SHOP-05** — `test/shops/city-shops.e2e.int-spec.ts` (villaggio / città / capitale seminati, fuori pool e pet doppione senza scritture, vendita fuori pool e di un leggendario, compra → equipaggia → vendi altrove), `test/app.int-spec.ts` (contratto SDL del FE), suite completa, gate SDL (C2), requisiti BE-SHOP-01..06 completati.
- **12-19 Handoff per il FE Phase 13** — `.planning/phases/12-negozi-per-citta/BACKEND-NOTES.md`: SDL nuovo e deprecato, codici e ordine dei rifiuti, forma di `cityShop`, fragment `assets { pet ownedPets }`, città dei pet per la UAT (Talmvere → Cavallo da viaggio, Cliffbreak, Necrorian chiusa), runbook (build, riavvio, cosa scrive il primo boot, come ri-seminare una lista cancellandone il campo, come leggere `shopPoolReport`), Assumptions A1/A2 da controllare dopo il primo boot.

## Sources

### Primary (HIGH confidence)
- Codice del repo BE su `feat/12-negozi-per-citta` (da `65ba3d7`): `src/models/city.model.ts`, `src/cities/*`, `src/economy/trade/*`, `src/economy/economy.module.ts`, `src/characters/characters.{service,resolver}.ts`, `src/characters/equipment/equip-item.updates.ts`, `src/characters/spells/spell-state.migrator.ts`, `src/migrations/mixed-refs/*`, `src/models/common/asset-quantity.model.ts`, `src/models/request/*`, `src/validation/*`, `src/gameRules/*`, `test/app.int-spec.ts`, `test/authz/characters-test-app.ts`, `test/economy/place-in-city.ts`, `test/fixtures/*`, `package.json` (jest e coverage).
- Probe 2026-11-02 sull'harness (`MongoMemoryReplSet` + `GraphQLSchemaFactory`), file cancellato: SDL di `@ResolveField` su `City`, `deprecationReason`, input nullable con e senza `defaultValue`; default degli array Mongoose su create/save/lean; cast delle stringhe nei ref tipati.
- `.planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md` §2, §3, §5, §11 e `reports/11-12-verify-baseline.json` (nomi e id delle città).
- FE (sola lettura): `13-CONTEXT.md`, `lib/graphql/fragments/equipment_fragment.dart`.

### Secondary (MEDIUM confidence)
- Conteggi per rarità/effetto del catalogo (handoff Phase 11, non riletti dal DB).

### Tertiary (LOW confidence)
- Distribuzione di `sellable` sugli equipaggiamenti e completezza dei campi dei pet a DB (A1, A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, versioni del repo.
- Architecture: HIGH — punti di aggancio letti nel codice, comportamenti Mongoose/GraphQL provati.
- Pitfalls: HIGH — ciascuno ricavato da codice o probe; MEDIUM solo sulla disponibilità reale di candidati per fascia.

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (codice stabile; da rivedere se cambia `ShopTransactionService` o il catalogo prima dell'esecuzione)
