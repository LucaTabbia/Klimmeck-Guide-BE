# BACKEND-NOTES — Phase 12 Negozi per città (handoff per la FE Phase 13 e runbook del primo boot)

- **Fase BE:** 12-negozi-per-citta (requisiti BE-SHOP-01..BE-SHOP-06; decisioni D-01..D-24 in `12-CONTEXT.md`).
- **Data:** 2026-11-03. Documento di fine fase (piano 12-19), scritto dopo il gate 12-18.
- **Branch:** `feat/12-negozi-per-citta` → PR verso `develop` (la apre l'orchestratore dopo la review post-esecuzione).
- **Schema:** rispetto a `origin/develop` lo SDL ha **45 righe aggiunte e 2 tolte**; le due tolte sono le query di catalogo globali, riaggiunte identiche con `@deprecated(reason: "Phase 12: use cityShop")` (D-20). Nessun'altra modifica non additiva. Lo schema generato `src/schema.gql` vince su questo documento.
- **Consumatore:** FE Phase 13 (`../Klimmeck-Guide/.planning/phases/13-city-shops/13-CONTEXT.md`, FE D-01..D-16); i piani gated 13-10/13-11 partono dopo la merge di questa PR su `develop` (FE D-12, D-16).
- **Regola dei letterali:** operatori Mongo e letterali GraphQL solo in code span o blocchi di codice; nessun URI, host, nome di database né id reale del database: solo placeholder (`<uri>`, `<db>`, `<id città>`, `<id personaggio>`, `<id pet>`).

---

## 0. TL;DR per il FE

1. **Una query per il negozio:** `cityShop(cityId: ID!): CityShop!` restituisce il pool della città (equip, loot, compagni) già filtrato dai veti; le due query di catalogo globali sono deprecate, non rimosse (§1–§3).
2. **Taglia e negozio dal server:** `City.size: CitySize!` e `City.hasShop: Boolean!` entrano nella query `cities`; il FE non deduce più la taglia (Ferrion è `city`) e disabilita la cella Negozio quando `hasShop` è `false` (Necrorian) (§4).
3. **Compagni posseduti vs equipaggiato:** `CharacterAssets.ownedPets: [Pet!]!` accanto a `pet: Pet` (l'equipaggiato, l'unico che il viaggio legge); due mutation nuove `equipPet` / `unequipPet` (§5).
4. **I pet si comprano e si vendono in `doTransaction`** con `TransactionItems.petAssets` (nullable, quantità sempre 1); comprare non equipaggia; vendere il compagno equipaggiato svuota lo slot nella stessa transazione (§5–§6).
5. **Tre codici nuovi:** `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED`; acquisto fuori pool rifiutato, vendita ammessa in ogni città, leggendari posseduti inclusi (§6).
6. **Ordine dei rilasci:** la PR BE va mergiata su `develop` PRIMA dei piani gated della FE Phase 13; dal piano dei documenti in poi il branch FE ha bisogno del BE di questa fase su device (cold start con `size`/`hasShop`, fragment con `ownedPets`) (FE D-12, D-16). Al primo boot sul database reale il BE semina i pool: runbook in §9.

---

## 1. SDL nuovo (copiato da `src/schema.gql`)

Query e mutation nuove:

```graphql
type Query {
  cityShop(cityId: ID!): CityShop!
  shopPoolReport: [ShopPoolReportEntry!]!
}

type Mutation {
  equipPet(request: EquipPetRequest!): CommonResponse!
  unequipPet(request: UnequipPetRequest!): CommonResponse!
}
```

Tipi nuovi o cambiati (le righe nuove sono `hasShop`, `size`, `ownedPets`, `sellable`, `petAssets`):

```graphql
type CityShop {
  city: City!
  equipment: [AssetQuantity!]!
  loot: [AssetQuantity!]!
  pets: [Pet!]!
}

enum CitySize {
  capital
  city
  village
}

type City {
  area: [[Float!]!]!
  hasShop: Boolean!
  id: ID!
  markerLocation: PointOfInterest!
  name: String!
  pointsOfInterest: [PointOfInterest!]
  relatedLore: Lore
  size: CitySize!
  type: CityType!
}

type CharacterAssets {
  activeSpells: [ActiveSpell!]!
  ownedEquipments: [AssetQuantity!]!
  ownedItems: [AssetQuantity!]!
  ownedPets: [Pet!]!
  pet: Pet
  wearedEquipment: Equipment!
}

type Pet {
  buyPrice: Coins!
  currentLifePoints: Int!
  damages: Damages!
  id: ID!
  imagePath: String!
  maxLifePoints: Int!
  maxXp: Int!
  name: String!
  sellPrice: Coins!
  sellable: Boolean
  speedModifier: Float
  xp: Int!
}

input TransactionItems {
  equipAssets: [AssetQuantityInput!]!
  lootAssets: [AssetQuantityInput!]!
  petAssets: [AssetQuantityInput!]
}

input EquipPetRequest {
  id: String!
  petId: String!
}

input UnequipPetRequest {
  id: String!
}
```

`EquipmentItem` e `LootItem` ricevono la stessa riga `sellable: Boolean` (nullable: assente = vendibile, solo `false` vieta).

`TransactionItems.petAssets` è **nullable**: un client che lo omette continua a funzionare (le transazioni senza pet restano identiche).

Report dei pool, **solo per l'oste** (`innkeeper`; un giocatore riceve `FORBIDDEN`):

```graphql
type ShopPoolReportEntry {
  cityId: ID!
  cityName: String!
  emptyPool: Boolean!
  missing: [ID!]!
  outOfSize: [ShopPoolReportItem!]!
  size: CitySize!
  vetoed: [ShopPoolReportItem!]!
}

type ShopPoolReportItem {
  id: ID!
  name: String
  rarity: String
}
```

---

## 2. SDL deprecato

```graphql
  equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")
  lootAssetsQuantity: [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")
```

- Le due query restano funzionanti e con la stessa firma (D-20): un'app già rilasciata non si rompe.
- Il FE smette di usarle (FE D-01, D-15: i due documenti escono dal registro, 43 documenti dopo la fase).
- La rimozione arriva in una fase futura, quando nessuna app rilasciata le seleziona più (§11).

---

## 3. `cityShop`

Query d'esempio con la selezione del FE (FE D-01, D-07, D-11):

```graphql
query CityShop($cityId: ID!) {
  cityShop(cityId: $cityId) {
    city { id name size hasShop }
    equipment { quantity item { ... on EquipmentItem { id name rarity sellable buyPrice { gold silver copper } sellPrice { gold silver copper } } } }
    loot { quantity item { ... on LootItem { id name rarity sellable buyPrice { gold silver copper } sellPrice { gold silver copper } } } }
    pets { id name buyPrice { gold silver copper } sellPrice { gold silver copper } speedModifier sellable }
  }
}
```

| Aspetto | Comportamento |
| --- | --- |
| Veti in lettura | escono dalle liste solo gli oggetti `legendary` e quelli con `sellable: false` (D-05, D-17). Nessun altro filtro: **la mano vince** sulla taglia (un oggetto `rare` messo a mano nel pool di un villaggio viene servito, il report lo segnala) |
| Ordine | l'ordine della lista a DB (lo scaffale come curato) |
| `quantity` | sempre `1`, solo forma per riusare `AssetQuantity`: le scorte sono infinite, il negozio non scala nulla |
| Città non seminata / Necrorian / pool vuotato a mano | tre liste `[]` e `city.hasShop: false` |
| `cityId` malformato | `BAD_USER_INPUT` |
| Città inesistente | `NOT_FOUND` |
| Autenticazione | serve un utente autenticato (guard globale); la query **non** è owner-aware: i pool non sono segreti, il guard autorevole è `doTransaction` (D-18, D-19) |

---

## 4. Taglia e negozio in `cities`

- `City.size` è calcolato dal server sul `CityType` (D-01): suffisso `Village` → `village`, `City` e `SeaCity` → `city`, `Capital` → `capital`; eccezioni esplicite `elfCapital` → `capital`, `talmvereVillage` → `village`, `ferrionCity` → `city` (**Ferrion è `city`, non capitale**: la mappa `CityType.cityClass` del FE resta solo per il rendering dei marker), `necrorianCity` → `city`.
- `City.hasShop` = almeno una delle tre liste del pool non vuota. Necrorian è sempre `false` (solo la dungeon, Phase 11 D-17); qualunque città svuotata a mano diventa `false`.
- La query `cities` del cold start **non** carica i pool (nessun peso in più): il pool arriva solo da `cityShop` all'apertura del negozio (FE D-03).
- Entrambi i campi sono non-null: un BE senza questa fase risponde con un errore di validazione se il FE li seleziona (FE D-16, accettato by design).

---

## 5. Compagni (pet)

- `assets.ownedPets` = i compagni **posseduti**; `assets.pet` = il compagno **equipaggiato** (al più uno, sempre fra i posseduti), l'unico che il viaggio legge per la velocità.
- Fragment del personaggio (FE D-11), mai `imagePath`:

```graphql
fragment PetFields on Pet {
  id
  name
  buyPrice { gold silver copper }
  sellPrice { gold silver copper }
  speedModifier
  sellable
}

# nel fragment del personaggio
assets { pet { ...PetFields } ownedPets { ...PetFields } }
```

- `speedModifier` è nullable: un gatto o un cane non è una cavalcatura (FE D-07). Il FE stampa il valore servito, non calcola velocità.
- `equipPet(request: { id: <id personaggio>, petId: <id pet> })` → `{ response: "Compagno equipaggiato", successful: true }`. Rieseguito sullo stesso pet è idempotente; su un altro pet posseduto sostituisce l'equipaggiato.
- `unequipPet(request: { id: <id personaggio> })` → `{ response: "Compagno lasciato a riposo", successful: true }`. **Idempotente:** senza compagno equipaggiato risponde comunque successo; non controlla il possesso.
- Entrambe guardate come `equipItem` (`@OwnsCharacter`: il proprietario del personaggio o l'oste), **ammesse anche durante un viaggio** senza effetto sul viaggio in corso (D-15: `status.activeTravel` non cambia, la velocità nuova vale dal viaggio successivo).
- **Comprare non equipaggia** (FE D-08): il pet entra solo in `ownedPets`.
- **Vendere il pet equipaggiato** lo toglie da `ownedPets` e mette `assets.pet` a `null` nella stessa transazione; la subscription del personaggio porta entrambe le modifiche nello stesso evento.
- Le modifiche di `equipPet` / `unequipPet` arrivano anche dalla subscription del personaggio (come `equipItem`).

---

## 6. `doTransaction`

**Pet nella transazione.** `boughtItems.petAssets` / `soldItems.petAssets` con `{ item: <id pet>, quantity: 1 }`; una quantità diversa da 1 → `INVALID_QUANTITY`. I prezzi vengono dal catalogo (`buyPrice` / `sellPrice` del pet), come per equip e loot.

**Ordine dei rifiuti (D-19)** — il primo che scatta vince:

| # | Controllo | Codice |
| ---: | --- | --- |
| 1 | id e quantità delle righe | `ITEM_NOT_FOUND`, `INVALID_QUANTITY` |
| 2 | catalogo (oggetto esistente, commerciabile) | `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE` |
| 3 | totale dichiarato vs prezzi del catalogo | `TRANSACTION_TOTAL_MISMATCH` |
| 4 | personaggio | `NOT_FOUND` |
| 5 | il personaggio sta sul marker di una città | `SHOP_NOT_IN_CITY` |
| 6 | ogni acquisto è nel pool di quella città (veti inclusi) | `ITEM_NOT_IN_SHOP` |
| 7 | pet comprato già posseduto | `PET_ALREADY_OWNED` |
| 8 | possesso di ciò che si vende | `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY` |
| 9 | fondi | `INSUFFICIENT_FUNDS` |

**Codici nuovi:**

| Codice | Quando | Messaggio | Mappatura FE |
| --- | --- | --- | --- |
| `ITEM_NOT_IN_SHOP` | acquisto di un oggetto o pet fuori dal pool della città, di un `legendary` o di un `sellable: false` (gara dopo una cura a DB); ogni acquisto a Necrorian | — | fumetto del mercante + ricarica del pool (FE D-05, D-03) |
| `PET_ALREADY_OWNED` | acquisto di un pet già in `ownedPets` | «Possiedi già questo compagno» | fumetto del mercante (FE D-06, D-08) |
| `PET_NOT_OWNED` | `equipPet` su un pet non posseduto, o con un `petId` malformato che supera la validazione GraphQL | — | banner del Journal (FE D-06) |

Il FE mappa solo `extensions.code`, mai il messaggio.

**Casi limite:**

- **Vendita ammessa ovunque** (in ogni città con il personaggio sul marker): anche oggetti fuori pool e i **leggendari posseduti** (FE D-09). Solo gli acquisti passano dal pool.
- **Guardia pet fallita in scrittura → `INSUFFICIENT_ITEM_QUANTITY`.** Le guardie sui pet (doppione in acquisto, possesso in vendita) sono riaffermate nel filtro della scrittura: se due transazioni concorrenti si sovrappongono (write skew), la seconda non trova il documento atteso e risponde `INSUFFICIENT_ITEM_QUANTITY`, non `PET_ALREADY_OWNED` / `ITEM_NOT_OWNED`. Al retry il controllo in lettura dà il codice giusto. Per il FE è un rifiuto da fumetto come gli altri.
- Risposta di successo invariata: `{ response: "Transazione avvenuta con successo", successful: true }`.

**Codici di `equipPet` / `unequipPet`:**

| Mutation | Codici |
| --- | --- |
| `equipPet` | `PET_NOT_OWNED`, `NOT_FOUND` (personaggio), `FORBIDDEN` (né proprietario né oste), `BAD_USER_INPUT` (id non ObjectId) |
| `unequipPet` | `NOT_FOUND` (personaggio), `FORBIDDEN`, `BAD_USER_INPUT` |

---

## 7. Città per la UAT (FE D-12)

I 4 pet in vendita e le loro città (D-10, costante `SELLABLE_PET_PLACEMENTS`; le città si risolvono per nome + `CityType`, A5):

| Pet | Acquisto | Vendita | `speedModifier` | Città (tipo) |
| --- | --- | --- | ---: | --- |
| Cavallo leggero | 40 ag | 20 ag | 2.5 | Fineglen (`valanVillage`) + Valantar (`valanCapital`) |
| Cammello del Mar Sabbioso | 35 ag | 17 ag 50 ra | 2 | Shadmus (`desertVillage`) + Valantar (`valanCapital`) |
| Tartaruga gigante delle isole | 1 oro | 50 ag | 1.2 | Croce Marina (`tropicalVillage`) + Bellport (`flameNorthCapital`) |
| Cavallo da viaggio | 1 oro | 50 ag | 2 | Talmvere (`talmvereVillage`) + Cliffbreak (`drusteaCapital`) |

Prezzi dal catalogo caricato nella Phase 11 (§5 del suo handoff): se l'utente li cambia a DB, vince il DB.

Percorso suggerito (teletrasporto della Locanda sul personaggio di prova):

1. **Villaggio:** Fineglen → pool 10 equip / 12 loot, solo `common` e `uncommon`, Cavallo leggero fra i compagni.
2. **Città:** una `*SeaCity` (es. una `drusteaSeaCity`) → 16 / 18, fino a `rare`, nessun compagno in vendita.
3. **Capitale:** Valantar → 24 / 24, fino a `ultrarare`, Cavallo leggero e Cammello.
4. In nessuno dei tre pool compare un `legendary`.
5. Comprare un compagno dove è in vendita (es. Talmvere → Cavallo da viaggio), equipaggiarlo nel Journal, venderlo in un'altra città (la vendita è ammessa ovunque).
6. **Necrorian** (`necrorianCity`): `hasShop: false`, cella Negozio disabilitata; un acquisto forzato risponde `ITEM_NOT_IN_SHOP`.

---

## 8. Costanti della semina (`src/shops/shop-pool.constants.ts`)

Quote per taglia e pesi di rarità (D-08), in punti percentuali interi sul numero di oggetti della lista:

| Taglia | Equip | Loot | `common` | `uncommon` | `rare` | `ultrarare` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `village` | 10 | 12 | 75 | 25 | — | — |
| `city` | 16 | 18 | 50 | 35 | 15 | — |
| `capital` | 24 | 24 | 35 | 35 | 20 | 10 |

- `legendary` mai in vendita, a nessuna taglia; un oggetto con `sellable: false` mai seminato né servito.
- **Garanzie di loot (D-09):** ogni lista di loot contiene almeno 2 oggetti `hunger` e 1 `heal` (le garanzie stanno dentro la quota e si pescano nella fascia ammessa più bassa che ha l'effetto; se il catalogo non ne ha abbastanza, la lista si scrive comunque e il boot avvisa con una WARN).
- **Compagni:** solo i 4 pet di §7, nelle città indicate; ogni altra città ha la lista dei compagni vuota.
- **Seme:** sorteggio deterministico senza reinserimento con seme da `SHOP_SEED_VERSION` (`v1`) + id della città + nome della lista: a catalogo invariato la stessa città riceve sempre la stessa lista. Cambiare `SHOP_SEED_VERSION` non ri-semina nulla da solo: la semina tocca solo le liste assenti (§9 d).
- **Pet solo da quest:** gli altri 9 pet del catalogo (Cavallo da guerra, Alce, Worg, Lupo invernale addestrato, Cinghiale gigante da sella, Ippogrifo, Aquila gigante, Grifone, Pegaso) ricevono `sellable: false` dalla migrazione; arriveranno come premio delle quest (§11).
- `SHOP_REPORT_WARNINGS_LIMIT = 50`: tetto delle WARN per tipo al boot (il resto è riassunto in una riga).

---

## 9. Runbook per l'utente (primo boot dopo la merge)

Nessun esecutore della fase ha compilato il BE né lo ha avviato sul database reale: la build e il riavvio li fa l'utente, e il primo boot dopo la merge è il **primo** momento in cui questa fase scrive sul database reale. Tutto ciò che segue gira dentro `ShopBoot.onApplicationBootstrap` (`src/shops/maintenance/shop-boot.ts`), non blocca mai il boot e non richiede CLI.

**(a) Build (passo dell'utente).** Dal repo BE, dopo la merge della PR:

```bash
git checkout develop && git pull
npm ci
npm run build
```

**(b) Riavvio.** Fermare il processo BE in esecuzione e riavviarlo da `dist/` come al solito (stessa configurazione, nessuna variabile d'ambiente nuova).

**(c) Cosa scrive il primo boot, nell'ordine.** Ogni passo è idempotente e scrive solo dove il campo manca:

| # | Passo | Scrittura | Log atteso (solo se scrive qualcosa) |
| ---: | --- | --- | --- |
| 1 | `PetSellableMigrator.migrate` | `pets.sellable` dove manca: `true` sui 4 pet di §7, `false` sugli altri 9 | LOG `Compagni: 4 in vendita e 9 solo da quest valorizzati` |
| 2 | `OwnedPetsMigrator.migrate` | `characters.assets.ownedPets` riceve il compagno equipaggiato se non c'è già | LOG `Compagni: N personaggi ricevono il compagno equipaggiato fra i posseduti` |
| 3 | `ShopPoolSeeder.seedAll` | i tre campi del pool (`shopEquipment`, `shopLoot`, `shopPets`) sulle città che non li hanno: tutte le 167 al primo giro, Necrorian con tre liste vuote | LOG `Negozi: seminate X liste di equipaggiamenti, Y di loot, Z di compagni` |
| 4 | report dei pool | nessuna scrittura | una WARN per città fuori regola (tetto 50) + riepilogo |

WARN possibili durante la semina:

- `Negozi: N liste rinviate al prossimo boot, catalogo senza candidati` — il catalogo non ha candidati per quella lista: la lista resta assente e il boot successivo riprova.
- `Negozi: <città> (<tipo>) senza le garanzie di loot hunger, heal` — lista scritta senza il cibo o la cura garantiti (§8).
- `Piazzamento del compagno <pet>: città <nome> (<tipo>) trovata N volte` — atteso 1 per Fineglen, Valantar, Shadmus, Croce Marina, Bellport, Talmvere, Cliffbreak; un valore diverso indica un nome o un tipo diverso a DB (A5, §10).

WARN del report: `Negozio di <città> (<id città>, <taglia>): X fuori taglia, Y vietati, Z mancanti[, pool vuoto]` e la riga finale `Negozi: N città con pool fuori regola, M non seminate`. Al primo boot su catalogo completo il riepilogo atteso è assente o con pochi casi (garanzie mancanti, liste rinviate).

Un passo che fallisce scrive `ERROR Negozi: <passo> fallita (<nome e codice dell'errore>), il boot prosegue` (passi: `valorizzazione di Pet.sellable`, `compagni posseduti`, `semina dei pool`, `report dei pool`); il BE resta su e il riavvio successivo riprova.

**Riavvii successivi:** non scrivono nulla e non loggano nulla dai passi 1–3 (idempotenti); il report riscrive le sue WARN solo se ci sono violazioni. Una lista presente, **anche vuota**, non viene mai toccata: la mano vince (D-05).

**(d) Ri-seminare una lista.** Cancellare a DB il campo della città e riavviare; a catalogo invariato la semina ridà la stessa lista (seme deterministico):

```javascript
// mongosh, collegato a <uri>/<db>
db.cities.updateOne(
  { _id: ObjectId("<id città>") },
  { $unset: { shopLoot: "" } }
)
```

Lo stesso per `shopEquipment` o `shopPets`. Non serve altro: nessun comando distruttivo oltre al singolo campo della singola città. Per svuotare il negozio di una città senza che venga ri-seminato, impostare la lista a `[]` (non cancellarla).

**(e) Curare un pool.** Modificare a DB `shopEquipment` / `shopLoot` / `shopPets` della città con id del catalogo (`equipmentitems`, `lootitems`, `pets`); la modifica vale alla prossima apertura del negozio, senza riavvio. Oggetti `legendary` o `sellable: false` messi a mano non vengono serviti né venduti (il report li elenca in `vetoed`); oggetti fuori taglia vengono serviti (il report li elenca in `outOfSize`).

> **Quando aggiungi un pet a DB imposta `sellable` esplicitamente:** la migrazione marca `false` ogni pet senza flag fuori dai 4 in vendita a ogni riavvio.

**(f) Leggere il report.** Come oste (`innkeeper`), dall'Admin Panel o da un client GraphQL autenticato:

```graphql
query {
  shopPoolReport {
    cityId
    cityName
    size
    emptyPool
    outOfSize { id name rarity }
    vetoed { id name rarity }
    missing
  }
}
```

Elenca solo le città con almeno una violazione: `emptyPool` (tutte e tre le liste vuote, Necrorian esclusa), `outOfSize` (rarità oltre la taglia), `vetoed` (`legendary` o `sellable: false`), `missing` (id non più nel catalogo). È sola lettura: segnala, non corregge.

**(g) Segreti.** Solo placeholder in questo documento (`<uri>`, `<db>`, `<id città>`): i valori reali stanno nell'ambiente del processo, mai nel repo.

---

## 10. Assunzioni da verificare dopo il primo boot

| # | Assunzione | Come verificarla | Se fallisce |
| --- | --- | --- | --- |
| A1 | `sellable` assente su un equipaggiamento o loot = vendibile (solo `false` vieta) | i pool hanno le quote piene (10/12, 16/18, 24/24) e `shopPoolReport` non mostra molti `vetoed` | se i pool risultano corti o il report mostra molti `vetoed`, rivedere `sellable` a DB e ri-seminare le liste interessate (§9 d) |
| A2 | i 13 pet hanno tutti i campi non-null di `Pet` (`imagePath`, `xp`, …) | query `pets { id name imagePath xp }` senza errori | completare i campi a DB; il FE non seleziona `imagePath` (FE D-11), il rischio è solo per altri client |
| A5 | le 7 città dei pet si risolvono per nome + `CityType` | nessuna WARN `Piazzamento del compagno …` al primo boot; `cityShop` di Talmvere elenca il Cavallo da viaggio | correggere il nome o il tipo della città a DB (o il compagno nella lista `shopPets` a mano, §9 e) |

---

## 11. Note per le fasi successive

- **Pet premio delle quest (BE Phase 13):** i 9 pet con `sellable: false` arrivano in `ownedPets` come ricompense; la scrittura deve rispettare il doppione (`PET_ALREADY_OWNED` o premio alternativo).
- **Cibo nei viaggi (BE Phase 14):** le garanzie `hunger` sono già in ogni lista di loot, quindi ogni negozio vende cibo prima che i viaggi lo consumino.
- **Rimozione delle query deprecate:** `equipmentAssetsQuantity` e `lootAssetsQuantity` si tolgono quando nessuna app rilasciata le seleziona più (dopo il rilascio della FE Phase 13).
- **Prezzi dei cavalli:** il Cavallo da viaggio costa quanto la Tartaruga (1 oro) con 30 HP fuori scala (Phase 11 §11); i prezzi dei cavalli vanno rivisti a DB, la fase li legge dal catalogo senza toccarli.
- **Id delle città dei pet (A5):** se l'utente fornisce gli id, `SELLABLE_PET_PLACEMENTS` passa agli id senza altri cambi.

---

## 12. Numeri del gate (piano 12-18)

| Gate | Esito |
| --- | --- |
| `npm run test:cov` | 307 suite (193 unit + 114 integration), 4006 test verdi |
| Coverage totale | statements 97.04, branches 85.43, functions 92.92, lines 97.59 |
| Soglia `./src/shops/` | statements 97, branches 82, lines 98 (baseline 99.5 / 84.5 / 100.0) |
| Real boot `test/app.int-spec.ts` | 70 test, contratto FE della Phase 13 fissato nello schema generato |
| End-to-end `test/shops/city-shops.e2e.int-spec.ts` | 6 casi sul mondo di prova seminato |
| Lint | 85 file `.ts` del diff puliti con prettier/eslint (1 warning preesistente `no-base-to-string` in `test/app.int-spec.ts`) |
| SDL vs `origin/develop` | +45 / −2 (solo le due righe D-20, riaggiunte deprecate) |
| `npx tsc --noEmit -p tsconfig.json` | 0 errori |
