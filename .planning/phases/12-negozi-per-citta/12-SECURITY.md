---
phase: 12-negozi-per-citta
audited_at: 2026-11-03
branch: feat/12-negozi-per-citta
head: 090fea0
base: origin/develop (65ba3d7)
asvs_level: 1
threats_total: 54
threats_mitigated: 47
threats_partially_mitigated: 0
threats_not_mitigated: 0
threats_accepted: 7
threats_open: 0
unregistered_flags: 0
---

# Audit di sicurezza — Phase 12 «Negozi per città» (BE)

Audit in sola lettura del registro STRIDE dei piani `12-01`…`12-19` (54 ID `T-12-NN`, comprese le varianti `b`/`c`) sul branch `feat/12-negozi-per-citta` a `090fea0`, cioè dopo i 7 fix della review (`12-REVIEW-FIX.md`: A-WR-01, B-WR-01, B-IN-01, A-IN-01, A-IN-02, B-IN-02, B-IN-03) e i 3 `not_needed` di `REVIEW-RULINGS.md`. Nessun file sorgente modificato, nessun commit, nessun comando sul database, nessuna lettura di `.env` o dell'ambiente, nessun jest: le evidenze sono `file:riga` del codice finale e nomi di spec presenti nel repo. Le decisioni di prodotto del CONTEXT (D-05 «la mano vince», D-11/D-12 vendita libera, D-15 `unequipPet` idempotente) sono trattate come scelte volute, non come difetti.

## Riepilogo

| Esito | Conteggio |
| --- | --- |
| mitigated | 47 |
| partially mitigated | 0 |
| not mitigated / open | 0 |
| accepted | 7 |
| **Totale** | **54** |

Disposizioni dichiarate nei piani: 47 `mitigate`, 7 `accept`, 0 `transfer`. Il Threat Flags dei SUMMARY non contiene flag senza mappatura (`unregistered_flags: 0`).

## Registro delle minacce

| Threat ID | STRIDE | Componente | Disposizione | Esito | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- | --- |
| T-12-01 | I/DoS | `type City` | mitigate | mitigated | `src/models/city.model.ts:50-66` (i tre pool sono solo `@Prop`, senza `@Field`); `grep -nE 'shopEquipment|shopLoot|shopPets' src/schema.gql` vuoto; `test/app.int-spec.ts:535-536` fissa il blocco `type City` verbatim (`hasShop`, `size`, nessun pool) |  |
| T-12-01b | T | `hasShopOf` su liste curate a mano | accept | accepted | `src/shops/shop-pool.rules.ts:14-18` conta solo la lunghezza; `cityShop` filtra con `shelfInPoolOrder` (`:31-44`), il report segnala (`shop-pool.report.spec.ts` «marks an unreadable pool entry by its position») | Rischio accettato nel piano 12-01 (D-05, «la mano vince») |
| T-12-02 | T | taglia della città | mitigate | mitigated | `src/cities/city-size.ts:5-39` (`as const satisfies Record<CityType, CitySize>`), `cities.resolver.ts:23-31` `@ResolveField`; spec `city-size.spec.ts` «sizes the special types of the explicit table (D-01)» |  |
| T-12-03 | T | filtro `sellable` di `equipmentAssetsQuantity` | mitigate | mitigated | `src/equipmentItems/equipment-items.service.ts:31` (`where({ sellable: true })`); `test/shops/catalog-sellable.int-spec.ts:130` «keeps filtering equipmentAssetsQuantity by sellable true (D-20)»; `shop-fields.schema.spec.ts:71` (nessun default) |  |
| T-12-03b | I | `Pet.sellable` esposto | accept | accepted | `src/models/interfaces/asset-item.model.ts:36-39`, `catalog-sellable.int-spec.ts:80` | D-18: catalogo pubblico per gli autenticati |
| T-12-04 | I | `assets.ownedPets` servito | accept | accepted | `src/models/character/character-assets.model.ts:40-43`; letto solo da operazioni owner-aware (`EXPECTED_OWNERSHIP_HANDLERS`, `test/app.int-spec.ts:126-145`) | Accettato nel piano 12-03; `OwnershipGuard` invariato |
| T-12-05 | DoS | `characterUpdated` | mitigate | mitigated | `Pet` registrato in `src/economy/economy.module.ts:28` e `src/characters/characters.module.ts:35`; `character-updated.subscription.int-spec.ts:437` «carries the equipped and the owned pets populated in the snapshot» |  |
| T-12-05b | T | lettura legacy senza `ownedPets` | mitigate | mitigated | default implicito `[]` (`character-assets.model.ts:40-43`); `shop-fields.schema.spec.ts:90`; `character-updated.subscription.int-spec.ts:477` «serves a legacy character without owned pets as an empty list» |  |
| T-12-06 | I | messaggi dei rifiuti | mitigate | mitigated | `src/gameRules/game-rule.exception.ts` messaggi statici italiani senza id o prezzi (es. «Possiedi già questo compagno», «Compagno non posseduto», «Questo oggetto non è in vendita in questa città»); `game-rule.exception.spec.ts:241` |  |
| T-12-07 | I | costanti della semina | mitigate | mitigated | `src/shops/shop-pool.constants.ts` solo id di catalogo e nomi di città; `src/shops/seeded-random.ts:1-6` sha256 come hash di seme; `shop-pool.constants.spec.ts`; drift test `src/config` invariato (nessun `process.env.` nuovo) |  |
| T-12-07b | T | prevedibilità del sorteggio | accept | accepted | `seeded-random.spec.ts`; `shop-pool.draw.spec.ts:174` «replays the same pool for the same city and catalogue (D-24)» | D-18/D-24: i pool non sono segreti, l'autorità è `doTransaction` |
| T-12-08 | T | semina di oggetti vietati | mitigate | mitigated | `shop-pool.rules.ts:58-64` `isSeedCandidate` = `isShelfEligible` + `buyPrice != null` + fascia; `shop-pool.draw.spec.ts:132` «never draws a legendary, a sellable false or a priceless item (D-05)»; `shop-pool.seeder.int-spec.ts:167` |  |
| T-12-08b | DoS | pool vuoti per catalogo scarso | mitigate | mitigated | `shop-pool.draw.spec.ts:148,164,273` (completamento con la fascia inferiore, `missingGuarantees` senza eccezioni); `shop-pool.seeder.ts:103,106` rinvia le liste vuote; `seeder.int-spec.ts:269` |  |
| T-12-09 | T | `Pet.sellable` curato a mano | mitigate | mitigated | `pet-sellable.migrator.ts:13` filtro `{ sellable: { $nin: [true, false] } }` (assente o null); `pet-sellable.migrator.int-spec.ts:95` «never overwrites a sellable chosen in the database», `:112` idempotenza |  |
| T-12-09b | I | log della migrazione | mitigate | mitigated | `pet-sellable.migrator.ts:42-46` solo conteggi; `pet-sellable.migrator.int-spec.ts:122` «logs counts only» |  |
| T-12-10 | T/E | `assets.ownedPets` | mitigate | mitigated | `owned-pets.migrator.ts:36,43-47` aggiunge solo il pet già equipaggiato, guardia `$nin` con `idForms`; `owned-pets.migrator.int-spec.ts:66,85,140`; fix B-IN-01: `normalizeNullLists` (`:58-63`), spec `:123` |  |
| T-12-10b | I | log del migratore dei pet posseduti | mitigate | mitigated | `owned-pets.migrator.ts:50-54` solo il conteggio; nessun id nei messaggi |  |
| T-12-11 | T | pool curati a mano | mitigate | mitigated | `shop-pool.seeder.ts:180` (lettura con `$exists: false`) e `:206` (scrittura con lo stesso filtro); `seeder.int-spec.ts:228` «never touches a pool list already present even when empty (D-03, D-22)» |  |
| T-12-11b | I | log della semina | mitigate | mitigated | `shop-pool.seeder.ts:216-248` solo nomi/id/conteggi; `seeder.int-spec.ts:428` «logs ids, names and counts only (D-24)»; `grep Logger src/shops | grep -i mongodb` vuoto |  |
| T-12-11c | DoS | rumore nei log | mitigate | mitigated | `shop-pool.seeder.ts:215-224` `SHOP_REPORT_WARNINGS_LIMIT = 50` (`constants.ts:108`); rinvii in una sola riga (`:246-249`); `seeder.int-spec.ts:385` |  |
| T-12-12 | DoS | negozi vuoti permanenti | mitigate | mitigated | `shop-pool.seeder.ts:95` (`[]` solo per Necrorian), `:103,106` (equip/loot vuoti → `undefined` = rinviati), `:79-86` e fix B-WR-01 per i compagni; `seeder.int-spec.ts:215,269,302` |  |
| T-12-13 | I | WARN del report e log di errore | mitigate | mitigated | `shop-boot.ts:38-40` usa `describeError` (nome/codice, mai URI); `shop-pool.report.ts` `describeViolation`, marcatore `invalid@<indice>` (fix A-IN-02, `shop-pool.report.spec.ts:151`); `shop-boot.spec.ts:92` «logs the error code only» |  |
| T-12-14 | DoS | boot bloccato da un passo | mitigate | mitigated | `shop-boot.ts:31-42` ogni passo in try/catch, ordine fisso `:23-28`; `shop-boot.spec.ts:79,92` «keeps booting when a step fails» |  |
| T-12-14b | T | semina delle fixture negli harness | mitigate | mitigated | `shop-maintenance.module.ts:13` importato solo da `AppModule`; `shop-boot.int-spec.ts:136` «never seeds from the shops module used by the harnesses (D-24)» |  |
| T-12-14c | T | report che corregge la cura | mitigate | mitigated | `shop-pool-report.service.ts:47-61` solo `find`/`lean`; `shop-pool-report.service.int-spec.ts:130` «never writes to the database (D-06)» |  |
| T-12-15 | T/I | contenuto servito | mitigate | mitigated | `city-shop.service.ts:68-80` + `shelfInPoolOrder` (`shop-pool.rules.ts:31-44`) applica il veto D-05; `city-shop.service.int-spec.ts:139` «never serves a legendary, a sellable false item or a quest-only pet (D-05)», `:170` (la mano vince) |  |
| T-12-16 | DoS | query ripetuta | mitigate | mitigated | `city-shop.service.ts:38-46` tre `find({ _id: { $in } })` limitate alle liste, `:74` lista vuota → nessuna lettura; nessun populate dei pool in `cities`; `city-shop.service.int-spec.ts:223` |  |
| T-12-17 | T | `cityId` | mitigate | mitigated | `city-shop.resolver.ts:13` `ObjectIdPipe` (`src/validation/object-id.pipe.ts:17-23`); `city-shop.service.ts:37` `ResourceNotFoundException.city()`; `city-shop.resolver.int-spec.ts:274` «answers BAD_USER_INPUT on a malformed city id and NOT_FOUND on an unknown one» |  |
| T-12-17b | S | accesso anonimo | mitigate | mitigated | `cityShop` senza `@Public`; guard JWT globale; `city-shop.resolver.int-spec.ts:291` «refuses an anonymous request»; `EXPECTED_PUBLIC_HANDLERS` (`test/app.int-spec.ts:94`) non lo include |  |
| T-12-18 | E | `shopPoolReport` | mitigate | mitigated | `shop-admin.resolver.ts:12` `@Roles(RoleType.innkeeper)` (unico uso in `src/shops`); `test/app.int-spec.ts:121` in `EXPECTED_INNKEEPER_HANDLERS`; `shop-admin.resolver.int-spec.ts:194` «refuses an adventurer and a guard with FORBIDDEN» |  |
| T-12-18b | I | contenuto del report | accept | accepted | `shop-pool-report.service.ts:26-33` proietta solo città e cataloghi, nessun dato di personaggi | D-18: i pool non sono segreti |
| T-12-18c | T | correzioni involontarie | mitigate | mitigated | `shop-admin.resolver.ts` solo `@Query`; `shop-admin.resolver.int-spec.ts:212` «never writes while reporting» |  |
| T-12-19 | T/DoS | query deprecate | mitigate | mitigated | `equipment-items.resolver.ts` e `loot-items.resolver.ts` solo `deprecationReason`, firma invariata; `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` = le due righe D-20; `test/app.int-spec.ts:543-550` |  |
| T-12-20 | T | prezzo del pet | mitigate | mitigated | `catalog-prices.reader.ts` legge `Pet` dal catalogo; `trade-pricing.ts` `assertClientTotalMatches` invariato; `catalog-prices.reader.int-spec.ts:157` «reads the pet prices from the pet catalogue (D-17)»; `trade-pricing.spec.ts:264` |  |
| T-12-21 | T | quantità e input dei pet | mitigate | mitigated | `trade-pricing.ts` `INVALID_QUANTITY` per quantità diversa da 1; `transaction-items.model.ts` `@IsOptional @IsArray @ArrayMaxSize(MAX_TRANSACTION_LINES = 100) @ValidateNested @Type`; `@IsObjectIdHex` in `asset-quantity.model.ts:41`; `trade-pricing.spec.ts:194,202`, `input-decorators.spec.ts` |  |
| T-12-21b | T | stato intermedio del branch | accept | accepted | righe pet prezzate ma non inventariate fino a 12-16; chiuso da `trade-pets.ts` e `do-transaction.int-spec.ts:689` | Solo sul branch, PR unica, nessun rilascio intermedio |
| T-12-22 | T | acquisto fuori pool / leggendario / `sellable: false` | mitigate | mitigated | `trade-pool.ts:36-50` `assertBuysInShop`, chiamato in `shop-transaction.service.ts:199` prima di `writeInventory` e del wallet; `shop-transaction.service.int-spec.ts:973,982,1002,1018,1128`; `do-transaction.int-spec.ts:622`; `trade-pool.spec.ts` |  |
| T-12-22b | E | innkeeper che compra per un personaggio | accept | accepted | stesso bypass di `@OwnsCharacter` già auditato (`admin-audit.interceptor.ts:74,113`); il pool vale anche per lui | Accettato nel piano 12-15 |
| T-12-23 | T | gara con la cura del pool | mitigate | mitigated | `shop-transaction.service.ts:169-176` pool letto con `.session(session)` nella stessa lettura della città; `shop-transaction.service.int-spec.ts:1146` «reads the pool with the session of the transaction (D-19)» |  |
| T-12-24 | T | doppio acquisto concorrente dello stesso pet | mitigate | mitigated | `trade-pets.ts:19-30` (snapshot in sessione), `:55-64` guardia `$nin` nel filtro di `writeInventory` (`shop-transaction.service.ts:237`), `matchedCount === 0` → errore (`:243-245`); `trade-pets.spec.ts:120`; `shop-transaction.service.int-spec.ts:1249` | Nessuna spec di concorrenza dedicata ai pet: la contesa è coperta dal WriteConflict della transazione, provato per gli oggetti da `do-transaction.int-spec.ts:442` |
| T-12-25 | T | vendita del pet equipaggiato | mitigate | mitigated | `trade-pets.ts:49` `unequip`, `shop-transaction.service.ts:106` `'assets.pet': null` nello stesso `$set`; `trade-pets.spec.ts:99`; `city-shops.e2e.int-spec.ts:355` |  |
| T-12-25b | T | vendita di un pet non posseduto | mitigate | mitigated | `trade-pets.ts:47` `itemNotOwned`, guardia `$in` (`:58-63`); `trade-pets.spec.ts:108` |  |
| T-12-25c | E | equipaggiamento automatico | mitigate | mitigated | `trade-pets.ts:32-52` e `inventoryChanges` non scrivono `assets.pet` in acquisto; `trade-pets.spec.ts:78`, `shop-transaction.service.int-spec.ts:1230` |  |
| T-12-26 | E | personaggio altrui | mitigate | mitigated | `characters.resolver.ts:73,82` `@OwnsCharacter` su `equipPet`/`unequipPet`; `EXPECTED_OWNERSHIP_HANDLERS` (`test/app.int-spec.ts:130,133`); `characters-ownership.int-spec.ts:77,84` e `archived-character-visibility.int-spec.ts:68,74` |  |
| T-12-26b | T | id malformati | mitigate | mitigated | `equip-pet-request.model.ts` e `unequip-pet-request.model.ts` con `@IsObjectIdHex()`; `input-rules.spec.ts:182-189`, `input-decorators.spec.ts:42,52` |  |
| T-12-27 | T | pet non posseduto | mitigate | mitigated | `equip-pet.updates.ts:8-16` filtro `'assets.ownedPets': { $in: idForms(petId) }` nell'`updateOne` (`characters.service.ts:210-213`); `PET_NOT_OWNED` senza scritture; `equip-pet.int-spec.ts:168`; `equip-pet.updates.spec.ts` |  |
| T-12-28 | R | azione dell'oste per conto di un personaggio | mitigate | mitigated | `admin-audit.interceptor.ts:74` audita le mutation, `:113` ruolo innkeeper; `equip-pet.int-spec.ts:219` «lets the innkeeper equip for a character (D-15, C1)» | Stesso meccanismo di `equipItem` |
| T-12-29 | T | SDL | mitigate | mitigated | `test/app.int-spec.ts:535-569` (blocchi `City`, `CityShop`, `equipPet`, `EquipPetRequest`, deprecazioni) nel real boot; gate C2 = due righe |  |
| T-12-29b | T | regole del negozio | mitigate | mitigated | `test/shops/city-shops.e2e.int-spec.ts:291,306,324,355` |  |
| T-12-30 | I | segreti nel branch | mitigate | mitigated | `git diff --name-only origin/develop | grep -c '^\.env'` = 0; nessun URI Mongo in `.planning/phases/12-negozi-per-citta`; `process.env.` in `src` fuori dagli spec = 0 |  |
| T-12-31 | R | attribuzione dei commit | mitigate | mitigated | `git log origin/develop..HEAD --format=%B | grep -iE 'co-authored-by|generated with' | grep -viE 'regenerated with'` vuoto (134 commit) |  |
| T-12-31b | T | regressioni di copertura | mitigate | mitigated | `package.json:193-197` soglia `./src/shops/` 97/82/98 aggiunta; nessuna soglia esistente abbassata (`git diff origin/develop -- package.json` solo `+`); gate `test:cov` registrato in BACKEND-NOTES §12 e `12-REVIEW-FIX.md` |  |
| T-12-32 | I | runbook e handoff | mitigate | mitigated | `BACKEND-NOTES.md` §9(g) solo placeholder `<uri>`, `<db>`, `<id città>`; grep di URI Mongo nella cartella della fase vuoto; `grep -c cityShop BACKEND-NOTES.md` = 11 |  |
| T-12-32b | T | operazioni manuali sul DB | mitigate | mitigated | `BACKEND-NOTES.md` §9: unico comando di scrittura `updateOne` con `$unset` di un solo campo di pool della città; spiega che solo le liste assenti si ri-seminano |  |

## Controlli trasversali

| Comando (da `Klimmeck-Guide-BE/Klimmeck-Guide-BE`) | Output | Esito |
| --- | --- | --- |
| `grep -rn "process\.env\." src \| grep -v spec` | vuoto | OK |
| `grep -rlE "enableCors\|FileTypeValidator\|introspection: true\|ParseObjectIdPipe\|IsObjectIdPipe\|@IsMongoId\(" src \| grep -v spec` | vuoto | OK |
| `grep -rn "@Roles(RoleType.innkeeper)" src/shops` | `src/shops/shop-admin.resolver.ts:12` (solo `shopPoolReport`) | OK |
| `grep -n "OwnsCharacter" src/characters/characters.resolver.ts` | include `equipPet` (`:73`) e `unequipPet` (`:82`) | OK |
| `git diff origin/develop -- src/schema.gql \| grep -E '^-[^-]'` | `-  equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]!` e `-  lootAssetsQuantity: [AssetQuantity!]!` (le due righe D-20, sostituite dalle versioni `@deprecated`) | OK |
| `grep -rn "Logger\|logger\." src/shops src/economy/trade \| grep -iE "uri\|mongodb\|password\|token"` | vuoto; i log stampano solo id, conteggi e nomi | OK |
| `grep -rn "jest.mock(" src test \| grep -v node_modules \| wc -l` | 0; nel diff una sola riga contiene la stringa, ed è prosa di documentazione, non codice | OK |
| `git log origin/develop..HEAD --format=%B \| grep -iE "co-authored-by\|generated with" \| grep -viE "regenerated with"` | vuoto | OK |
| `git diff --name-only origin/develop \| grep -c '^\.env'` | 0 | OK |
| URI Mongo in `.planning/phases/12-negozi-per-citta` (`grep -rniE "mongodb(\+srv)?://"`) | vuoto | OK |

## Aperte

Nessuna. Nessuna minaccia `open` o `not_mitigated`.

## Accettate

- `T-12-01b` — `hasShopOf` su liste curate a mano: Rischio accettato nel piano 12-01 (D-05, «la mano vince»)
- `T-12-03b` — `Pet.sellable` esposto: D-18: catalogo pubblico per gli autenticati
- `T-12-04` — `assets.ownedPets` servito: Accettato nel piano 12-03; `OwnershipGuard` invariato
- `T-12-07b` — prevedibilità del sorteggio: D-18/D-24: i pool non sono segreti, l'autorità è `doTransaction`
- `T-12-18b` — contenuto del report: D-18: i pool non sono segreti
- `T-12-21b` — stato intermedio del branch: Solo sul branch, PR unica, nessun rilascio intermedio
- `T-12-22b` — innkeeper che compra per un personaggio: Accettato nel piano 12-15

Osservazione non bloccante: per `T-12-24` manca una spec di concorrenza dedicata ai pet; la protezione è la guardia `$nin` nel filtro di scrittura più il WriteConflict della transazione, già provato per gli oggetti. Il caso residuo (guardia fallita senza conflitto → `INSUFFICIENT_ITEM_QUANTITY`) è il C-IN-01 `not_needed`, documentato nell'handoff §6.
