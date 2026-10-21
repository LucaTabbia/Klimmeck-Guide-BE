# BACKEND-NOTES — Phase 8 Travel Lifecycle (TRAVEL-01) (handoff per la FE Phase 7, la FE Phase 6 e le fasi BE 9/10)

- **Fase BE:** 08-travel-lifecycle-travel-01 (requisiti BE-TRAVEL-01, BE-TRAVEL-02, BE-TRAVEL-03, BE-TRAVEL-04; decisioni D-01..D-32 in `08-CONTEXT.md`, con i rulings C1–C10 di `08-RESEARCH.md` §"Conflitti con il CONTEXT").
- **Data:** 2026-10-21. Documento di fine fase, scritto prima della UAT su device (manual-only: richiede la FE Phase 7 e i dati di §11).
- **Branch:** `feat/08-travel-lifecycle-travel-01` (PR verso `develop`). **Nessuna dipendenza da una PR FE** (D-25): le FE Phase 6 e 7 consumano lo schema dopo la merge.
- **Schema:** `src/schema.gql` è **additivo con tre eccezioni dichiarate** (D-20, §1): rispetto a `develop` rimuove esattamente 5 righe, nessun documento FE le selezionava. Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate di 08-14: unit **95 suite / 1415 test**, integration **57 suite / 739 test** (replica set + Redis effimero, `--runInBand`, ~104 s), `npm run build` exit 0, lint filtrato 0 righe, `eslint` (0 errori; 1 warning preesistente in `RoadsService.getShortestPath`, intoccabile per D-11) e `prettier --check` puliti sugli 82 `.ts` toccati dalla fase, nessuna dipendenza nuova in `package.json`. Baseline di inizio fase: unit 85 / 1264, integration 49 / 610.
- **Fonte:** ogni nome, codice, messaggio e riga di SDL qui sotto è copiato dal codice: `src/schema.gql`, `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/authz/resource-not-found.exception.ts`, `src/authz/authorization.exception.ts`, `src/auth/auth.exception.ts`, `src/travel/*.ts`, `src/quests/acceptance/quest-capacity.ts`, `src/quests/acceptance/quest-eligibility.ts`, `src/quests/quest-catalog.populate.ts`, `src/config/travel-config.ts`, `src/push/push-events.ts`. **Lo schema vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Viaggio libero solo verso il marker di una città** (`City.markerLocation`), partendo da una città o dal POI di una quest. Qualunque altro POI → `TRAVEL_DESTINATION_NOT_ALLOWED`.
2. **`travelPreview`** (query) per il dialog di conferma: `{ distance, duration, road }`, nessuna scrittura. **`startTravel`** (mutation) per confermare. Entrambe **owner-only**; `startTravel` risponde solo `CommonResponse` (`{ response: "Viaggio iniziato", successful: true }`): il viaggio arriva sulla subscription **`characterUpdated`** come `status.activeTravel`.
3. **Accettare una quest della corsia standard avvia da sé il viaggio** verso il marker della quest (se diverso dalla posizione): `pendingQuest.startDate == null` = **"In viaggio"**. Story e worldMission non muovono il personaggio.
4. **Arrivo** = `characterUpdated` con `activeTravel: null` e la nuova `location`. Il marker sulla mappa si sposta solo a quell'evento.
5. **Push `travelEnd` solo per i viaggi liberi**: mai per quelli automatici da quest, mai per il teleport.
6. **Nessun annullamento** né cambio meta (D-05). Il GM ha `teleportCharacter` dal pannello admin.
7. **Interpolazione con `serverTime`** (offset device↔server, §5): la posizione sulla polilinea si calcola sull'ora del server stimata, mai sull'orologio del device.

---

## 1. Contratto GraphQL (additivo con tre eccezioni dichiarate)

Blocchi copiati da `src/schema.gql` (`sortSchema: true`, i campi sono in ordine alfabetico).

```graphql
type ActiveTravel {
  duration: Float!
  endTime: DateTime!
  road: TravelPath!
  startTime: DateTime!
  to: ID!
}

type TravelPath {
  coordinates: [[Float!]!]!
  distance: Float!
}

type TravelPreview {
  distance: Float!
  duration: Float!
  road: TravelPath!
}

type CharacterStatus {
  activeTravel: ActiveTravel
  coins: Coins!
  currentLifePoints: Int!
  injuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  spells: [Spell!]!
  title: String!
  xp: Int!
}

type PendingQuest {
  id: ID!
  pointsSpent: Int!
  quest: Quest!
  startDate: DateTime
  waitingTime: Float!
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
  speedModifier: Float
  xp: Int!
}

type Quest {
  id: ID!
  infos: QuestInfos!
  prizes: QuestPrizes!
  registeredAdventurers: [QuestRegistration!]!
  requirements: QuestRequirements!
}

type QuestRegistration {
  character: ID!
  title: String!
}

type QuestPartySlot {
  count: Int!
  title: String
}

type QuestRequirements {
  minTitle: String!
  recommendedLoot: [AssetQuantity!]!
  requiredAdventurers: [QuestPartySlot!]!
  requiredPoints: Int
}

input TravelRequest {
  id: String!
  poiId: String!
}
```

Righe di `type Mutation`:

```graphql
  startTravel(request: TravelRequest!): CommonResponse!
  teleportCharacter(request: TravelRequest!): CommonResponse!
```

Righe di `type Query`:

```graphql
  serverTime: DateTime!
  travelPreview(request: TravelRequest!): TravelPreview!
```

**Le tre eccezioni (D-20)** — le uniche righe rimosse rispetto a `develop` (`git diff origin/develop...HEAD -- src/schema.gql | grep -E '^-[^-]' | sort`):

```diff
-  party: [QuestPartySlot!]!
-  registeredAdventurers: [String!]!
-  requiredAdventurers: Int!
-  startDate: DateTime!
-  title: String!
```

1. `PendingQuest.startDate` da `DateTime!` a `DateTime` (D-15): `null` = personaggio in viaggio verso il marker della quest.
2. `Quest.registeredAdventurers` da `[String!]!` a `[QuestRegistration!]!` (D-28): oggetti `{ character, title }`.
3. `QuestRequirements.requiredAdventurers` da `Int!` a `[QuestPartySlot!]!` con la rimozione di `party` (D-28); `QuestPartySlot.title` diventa nullable (`title: String!` → `title: String`, `null` = qualsiasi rango).

Motivazione: nessun documento FE selezionava questi campi al momento della fase (il FE parsa già `startDate` come `DateTime?` in `lib/models/pending_quest.dart`). Tutto il resto è additivo. `kind` (libero/quest), `party` e `registrations` **non esistono sul filo** (il boot reale lo verifica).

**Documenti FE di esempio:**

```graphql
query Preview($request: TravelRequest!) {
  travelPreview(request: $request) { duration distance road { coordinates distance } }
}

mutation Start($request: TravelRequest!) {
  startTravel(request: $request) { response successful }
}
```

```json
{ "request": { "id": "<characterId>", "poiId": "<cityMarkerPoiId>" } }
```

Frammento da aggiungere a `CharacterFragment.statusFields`:

```graphql
status { activeTravel { road { coordinates distance } startTime endTime duration to } }
```

- `id` è il **characterId**; `poiId` è l'id del POI di arrivo (per il viaggio libero: il `markerLocation` di una città).
- `to` è l'**id esadecimale del POI di arrivo** (`ID!`, nessun populate): per disegnarlo usare la città/POI già caricati sulla mappa.
- `duration` è in **millisecondi** (come `waitingTime`), `duration = endTime − startTime`.
- `road.distance` e `TravelPreview.distance` sono in km di gioco (stessa unità di `getPath`); `road.coordinates` è la polilinea `[lon, lat]` orientata dalla partenza alla meta.

---

## 2. Codici di rifiuto

Ogni rifiuto ha `errors[0].extensions` **esattamente** `{ "code": "<CODICE>" }` e un messaggio italiano. Il FE mappa il **codice**, mai il messaggio. Un rifiuto **non scrive nulla**: nessun `activeTravel`, nessun job, nessuna quest.

| Codice | Messaggio | Operazioni | Quando | Azione FE |
|--------|-----------|------------|--------|-----------|
| `TRAVEL_IN_PROGRESS` | `Sei già in viaggio` | `startTravel`, `travelPreview`, `acceptQuest` | `status.activeTravel` presente (anche se il viaggio è partito fra lettura e scrittura) | disabilitare viaggio e board finché c'è `activeTravel`; mostrare il viaggio in corso |
| `TRAVEL_SAME_LOCATION` | `Sei già in questo luogo` | `startTravel`, `travelPreview` | meta = `status.location` attuale | non offrire come meta la città in cui ci si trova |
| `TRAVEL_DESTINATION_NOT_ALLOWED` | `Puoi viaggiare solo verso una città` | `startTravel`, `travelPreview` | il POI non è il `markerLocation` di nessuna città | offrire come mete solo i marker delle città |
| `TRAVEL_NO_PATH` | `Nessuna strada porta a questa meta` | `startTravel`, `travelPreview` | nessun cammino stradale (o personaggio senza posizione) | mostrare l'errore; **segnalare al GM** (dati stradali) |
| `QUEST_IN_PROGRESS` | `Non puoi muoverti durante una missione in corso` | `startTravel`, `travelPreview`, `teleportCharacter` | `quests.pendingQuest` popolata (solo la corsia standard; story e worldMission non bloccano) | disabilitare il viaggio finché la corsia standard è occupata; nel pannello admin: teleport non disponibile |
| `QUEST_FULL` | `Non ci sono più posti per il tuo rango` | `acceptQuest` | quest registrata (worldMission, boss, enemy, aid) senza posto per il titolo del personaggio secondo D-32 (§9) | mostrare la scheda "strappata" |
| `QUEST_NOT_ACCEPTABLE` | `Missione non disponibile` | `acceptQuest` | catalogo difettoso: story/worldMission senza `requiredPoints` valido, **oppure** quest registrata con `requiredAdventurers` assente, vuoto, numerico o con uno slot non valido | "missione non disponibile" e segnalare al GM (WARN col solo id della quest) |
| `NOT_FOUND` | `Personaggio non trovato` / `Luogo non trovato` / `Missione non trovata` | tutte | personaggio inesistente o archiviato; POI inesistente; quest inesistente; **anche id malformati**, senza accesso al DB | ricaricare personaggio / mappa / board |
| `FORBIDDEN` | `Questo personaggio non ti appartiene` / `Operazione riservata al locandiere` | owner-only / `teleportCharacter` | `startTravel`/`travelPreview`/`acceptQuest` su un personaggio che non è il `currentCharacter` del chiamante (**anche per l'innkeeper**); teleport chiamato da un non innkeeper | errore generico; l'innkeeper muove gli altri solo col teleport |
| `UNAUTHENTICATED` | `Authentication required` | tutte | nessun bearer valido | flusso di refresh/login esistente |

Restano invariati i codici di Phase 7 su `acceptQuest` (`QUEST_SLOT_BUSY`, `QUEST_ALREADY_TAKEN`, `QUEST_TITLE_MISMATCH`, `QUEST_NOT_IN_CITY` — quest'ultimo **solo per la corsia standard**, §10 —, `INSUFFICIENT_POINTS`).

**Ordine di valutazione di `startTravel` / `travelPreview`** (guard, resolver, `TravelPlanner.planFree` + `classifyFreeTravel`, poi `classifyUnstarted`):

1. `UNAUTHENTICATED` (guard globale), poi ownership owner-only su `request.id`: `FORBIDDEN` o `NOT_FOUND` (personaggio).
2. Resolver: `request.id` malformato → `NOT_FOUND` (personaggio); `poiId` malformato → `NOT_FOUND` (`Luogo non trovato`).
3. Letture: personaggio inesistente o archiviato → `NOT_FOUND`; POI inesistente → `NOT_FOUND` (`Luogo non trovato`).
4. Regole, in ordine fisso: `TRAVEL_DESTINATION_NOT_ALLOWED` → `TRAVEL_IN_PROGRESS` → `QUEST_IN_PROGRESS` → `TRAVEL_SAME_LOCATION` → `TRAVEL_NO_PATH`.
5. Solo `startTravel`, scrittura persa in corsa (un solo `findOneAndUpdate` condizionale): `NOT_FOUND` → `TRAVEL_IN_PROGRESS` (viaggio partito) → `QUEST_IN_PROGRESS` (quest accettata) → `TRAVEL_IN_PROGRESS` (posizione cambiata da un movimento concorrente).

**Ordine di valutazione di `acceptQuest`** (Phase 7 emendato, `QuestAcceptanceService.accept`):

1. Guard, ownership owner-only e id malformati come in Phase 7.
2. Pre-verifica: quest inesistente → `NOT_FOUND` → `QUEST_NOT_ACCEPTABLE` (costo, poi slot) → personaggio inesistente/archiviato `NOT_FOUND` → **`TRAVEL_IN_PROGRESS`** → `QUEST_ALREADY_TAKEN` → `QUEST_TITLE_MISMATCH` → `QUEST_SLOT_BUSY` → `QUEST_FULL` → (solo corsia standard) `QUEST_NOT_IN_CITY`.
3. Transazione (solo in corsa): claim della corsia (`NOT_FOUND` → `TRAVEL_IN_PROGRESS` → `QUEST_SLOT_BUSY` → `QUEST_ALREADY_TAKEN` → `QUEST_TITLE_MISMATCH` → `QUEST_NOT_IN_CITY` se la posizione era attesa), registrazione (`QUEST_ALREADY_TAKEN` o `QUEST_FULL`), debito (`INSUFFICIENT_POINTS`).

**Ordine di valutazione di `teleportCharacter`:** `UNAUTHENTICATED` → `FORBIDDEN` (non innkeeper) → `poiId` malformato `NOT_FOUND` (`Luogo non trovato`) → `request.id` malformato `NOT_FOUND` → POI inesistente `NOT_FOUND` → personaggio inesistente o archiviato `NOT_FOUND` → `QUEST_IN_PROGRESS`.

---

## 3. Semantica del viaggio

- **Mete (D-01):** il viaggio libero va solo verso il `markerLocation` di una città esistente, da qualunque posizione (città o POI di una quest).
- **Viaggio automatico da quest (D-02):** accettare una quest della **corsia standard** (`pendingQuest`: hunt, enemy, boss, dungeon, heal, aid, job, study, crime, guard) avvia il viaggio verso `infos.markerLocation`:
  - marker **diverso** dalla posizione → `activeTravel` scritto nello **stesso update** del claim della corsia, `PendingQuest.startDate = null`, job accodato dopo il commit;
  - marker **uguale** alla posizione → nessun viaggio, `startDate` = ora dell'accettazione (countdown subito);
  - **nessuna strada** verso il marker (D-03) → **salto istantaneo**: `status.location` = marker nello stesso update, nessun `activeTravel`, `startDate` = ora, WARN lato server con i soli id. (Il viaggio libero senza strada invece rifiuta `TRAVEL_NO_PATH`.)
- **Story e worldMission** non muovono il personaggio, non bloccano il viaggio libero e sono accettabili da qualunque città (D-26).
- **Guard sull'accettazione (D-06):** `acceptQuest` con `activeTravel` presente → `TRAVEL_IN_PROGRESS`, su tutte e tre le corsie.
- **Blocchi del viaggio libero (D-04):** `TRAVEL_IN_PROGRESS` con un viaggio attivo; `QUEST_IN_PROGRESS` con `pendingQuest` popolata (il personaggio resta sul marker finché la Phase 9 non chiude la quest).
- **Nessun annullamento né cambio meta (D-05).**
- **Velocità (D-08):** `velocità = 10 × Pet.speedModifier` del pet equipaggiato (`assets.pet`); pet assente o `speedModifier: null` → 10; modificatore ≤ 0 o non finito → 10 con WARN. **Durata = durata base × 10 / velocità**: `speedModifier: 2` → velocità 20 → metà tempo. Vale per **tutti** i viaggi, liberi e automatici.
- **Fotografata alla partenza (D-09):** `endTime` persistito è la fonte di verità; cambiare o togliere il pet in viaggio non ricalcola nulla.
- **Polilinea (D-10):** `road.coordinates` è il cammino Dijkstra attraverso più strade, orientato dalla partenza alla meta, con le **coordinate dei POI di partenza e di arrivo come estremi**; km e durata contano solo gli archi stradali (fra il POI e il nodo agganciato, entro 5 km, non si conta nulla). Fra strade parallele vale la più veloce.
- **Durata (D-07):** ore reali, `duration = endTime − startTime` in ms. Ordini di grandezza in §8.

---

## 4. Preview e dialog di conferma

- `travelPreview(request: TravelRequest!): TravelPreview!` → `{ distance, duration, road { coordinates distance } }`: stesse letture, **stesse regole e stessi codici** di `startTravel` (§2), **nessuna scrittura**. Il FE può disegnare la rotta prima della conferma.
- `TravelPreview` **non ha `startTime`**: l'ETA da mostrare nel dialog è `serverNow + duration`, con `serverNow = now() + offset` (§5).
- Alla conferma `startTravel` ricalcola tutto da zero: può rifiutare con un **codice diverso** se lo stato è cambiato nel frattempo (es. `TRAVEL_IN_PROGRESS` o `QUEST_IN_PROGRESS` dopo un'accettazione su un altro device) e l'ETA reale è quella di `activeTravel.endTime` su `characterUpdated` (può differire di qualche secondo da quella della preview).
- Dialog consigliato: meta (nome della città), distanza, durata in ore/minuti, ETA (ora locale ricavata dall'ora del server), pulsanti "Parti" / "Annulla" (l'annulla chiude il dialog: il viaggio confermato non è annullabile).

---

## 5. Interpolazione e ricostruzione dopo kill

- Interrogare `serverTime` al **bootstrap** e al **resume** dell'app e calcolare `offset = serverTime − now()` (come Phase 7 §5).
- **Progresso** = `clamp((now() + offset − startTime) / duration, 0, 1)`.
- Posizione = punto della polilinea `road.coordinates` alla frazione `progresso` della lunghezza totale, **interpolando per lunghezza dei segmenti** (lunghezze cumulative dei segmenti, poi interpolazione lineare dentro il segmento trovato). Basta il rapporto: le lunghezze si calcolano dalle coordinate.
- **Dopo un kill** basta rileggere `character` (o la snapshot di `characterUpdated`): `activeTravel` è persistito e contiene tutto (polilinea, `startTime`, `endTime`, `duration`, `to`).
- **A `progresso = 1` attendere l'evento di arrivo** (`activeTravel: null` + nuova `location`): non spostare il marker prima. Normalmente arriva entro pochi secondi da `endTime`; se il job Bull è andato perso arriva con lo sweep, fino a un intervallo dopo (§6).
- La polilinea viaggia su **ogni** `characterUpdated` durante il viaggio (anche centinaia di punti sulle tratte lunghe): non ricalcolarla a ogni evento se `startTime` non è cambiato.

---

## 6. Completamento, reconciler, sweep e push

- **DB fonte di verità:** il completamento è un solo update condizionale sul personaggio (attivo, stesso viaggio per `startTime`/`endTime`, `endTime ≤ now`) che imposta `status.location` = meta e `activeTravel` = `null`; il change stream emette `characterUpdated`.
- **Trigger:** job Bull `complete` sulla coda `travel` con delay fino a `endTime` (jobId deterministico `travel-<characterId>-<startTimeMs>`); **reconciler al boot** che completa ogni viaggio scaduto; **sweep periodico** ogni `TRAVEL_SWEEP_INTERVAL_MS` (default 60 000 ms, `0` = sweep spento, il reconciler al boot gira sempre). Job duplicati, rieseguiti od obsoleti sono no-op; un job arrivato prima di `endTime` non scrive e lascia il lavoro allo sweep (C10).
- **Push `travelEnd`** (payload di Phase 5 §2: `type: "travelEnd"`, `title: "Viaggio completato"`, `body: "Il tuo personaggio è arrivato a destinazione."`, `sentAt`, `id` = **characterId**, TTL 1 h) al proprietario **solo per i viaggi liberi**, una volta sola, best-effort dopo il commit; **mai** per i viaggi da quest né per il teleport.
- **Viaggio da quest:** nella stessa transazione del completamento `PendingQuest.startDate` = **`endTime` pianificato** (se ancora `null`): il countdown della quest parte dall'arrivo previsto e non perde tempo per un downtime del server. Il FE riceve `characterUpdated` con `pendingQuest.startDate` valorizzato e mostra il countdown `startDate + waitingTime` (Phase 7 §5).

---

## 7. Teleport (pannello admin)

- `teleportCharacter(request: TravelRequest!): CommonResponse!` — **stesso input `{ id, poiId }` di `startTravel`**, `id` = personaggio da spostare, `poiId` = **qualsiasi `PointOfInterest`** esistente (non solo città). Risponde `{ response: "Personaggio teletrasportato", successful: true }`.
- **Solo innkeeper** (`@Roles(innkeeper)`), altrimenti `FORBIDDEN` (`Operazione riservata al locandiere`).
- **Rifiutato con `QUEST_IN_PROGRESS`** se il personaggio ha una `pendingQuest` (story e worldMission non bloccano).
- Un solo update condizionale: `status.location` = POI e `activeTravel` = `null` insieme; il viaggio in corso è cancellato e il suo job rimosso best-effort (un job sopravvissuto non trova più il viaggio ed esce senza scrivere). **Nessuna push**, nessuna scrittura sulle quest.
- **Audit** automatico in `admin_audit_logs`: `target` `{ type: 'CommonResponse', id: null }`, il personaggio è in `args.request.id` (anche per i rifiuti, con l'esito).

---

## 8. Scala delle durate — decisione dell'utente

Misure sul DB di sviluppo (08-RESEARCH §Q1, script di sola lettura che ricostruisce il grafo esattamente come `RoadsService.buildGraph` e calcola Dijkstra fra i marker delle città; velocità 10, nessun pet):

| Misura | Valore |
|---|---|
| Collection | 964 `roads`, 642 `pointsofinterest`, 167 `cities`, 4 `quests`, **0 `pets`**, 1 `characters`, 0 `pendingquests` |
| `speedFactor` | min 3, p25 4,5, mediana 5, p75 5, max 7; nessuno mancante o 0 |
| Grafo | 2529 nodi, 3231 archi, **1 componente connesso** |
| Marker delle città | 167/167 **nodi esatti**; nessuna coppia sullo stesso nodo; 0 coppie irraggiungibili |
| POI in generale | 176 nodi esatti, 466 agganciati entro 5 km, 0 non agganciabili |
| Città → città più vicina | **ore** min 0,37 · p25 1,75 · **mediana 2,72** · p75 3,72 · max 9,72; km mediana 15,8 |
| Città → città qualsiasi (27 722 coppie ordinate) | **ore** p25 22,8 · **mediana 35,4** · p75 48,0 · **max 82,3**; km mediana 204, max 506 |
| Città → marker delle 4 quest | **2,64 h**, 12,4 km (tutte e 4 sullo stesso cammino; marker nodi esatti) |
| `timeToComplete` delle quest | `job` 7 200 000 ms (2 h), `heal` 18 000 000 ms (5 h), `worldMission`/`enemy` assente |

Lettura: i viaggi fra città vicine stanno "in ore"; l'attraversata della mappa arriva a ~3,4 giorni; il viaggio automatico verso il marker di una quest (2,64 h) è più lungo della quest `job` (2 h).

**D-07 resta com'è: ore reali, nessuna scala, nessun clamp, nessuna variabile d'ambiente; le sole leve di regolazione sono `Road.speedFactor` a DB e la geometria delle strade.** Durata base di un arco = km dell'arco / `speedFactor` (ore); raddoppiare lo `speedFactor` di una strada ne dimezza il tempo.

- Un pet con **`speedModifier: 2`** dimezza **tutte** le durate (velocità 20).
- **Come rimisurare** dopo un ritocco: rieseguire lo stesso script di sola lettura (Dijkstra fra i marker delle città, durate in ore = Σ km / `speedFactor`) oppure, per una coppia, la query esistente `getPath(from, to)` (`time` in ore a velocità 10).
- Il grafo è costruito **all'avvio del server**: dopo aver modificato strade o `speedFactor` a DB serve un riavvio.

---

## 9. Nota per la FE Phase 6

- **`PendingQuest.startDate` ora è nullable** (`DateTime`): `null` = quest della corsia standard accettata, personaggio **in viaggio verso il marker** → mostrare **"In viaggio"** al posto del countdown. Il countdown (`startDate + waitingTime`, con l'offset di `serverTime`) parte solo con `startDate` non nullo; all'arrivo `startDate` = `endTime` pianificato. Story/worldMission e quest senza viaggio hanno `startDate` = ora dell'accettazione come prima.
- **Populate del catalogo (D-31):** `quests` e `quest(id)` popolano ora `infos.markerLocation`, **`infos.enemy`**, **`infos.relatedLore`**, **`requirements.recommendedLoot.item`**, **`prizes.prizeItem.item`**, **`prizes.randomLoot.item`** (SDL invariato). Orfani: `enemy` → `null`; voci orfane di `relatedLore`, `recommendedLoot`, `randomLoot` **scartate**; `prizeItem` con item orfano → `prizeItem: null`. La lista `quests` non fallisce mai per un ref orfano. `quest(id)` inesistente o malformato → `NOT_FOUND` (`Missione non trovata`).
- **Algoritmo di capienza per rango (D-32), riferimento unico BE/FE** — verbatim: dati `requiredAdventurers = [{ title, count }]`: `exact(T)` = somma dei `count` degli slot con `title = T`; `any` = somma dei `count` degli slot con `title` nullo; `reg(T)` = registrati di titolo `T`; `overflow` = Σ_T max(0, reg(T) − exact(T)). Un personaggio di titolo `T` può registrarsi se **`reg(T) < exact(T)` oppure `overflow < any`**; altrimenti `QUEST_FULL`. Totale = Σ `count`; la quest è piena per tutti quando Σ_T reg(T) ≥ totale. (Gli slot esatti si riempiono prima dei jolly.)
  - **Caso canonico** (test nominato lato BE, da replicare lato FE): slot `[{ hero, 1 }, { null, 2 }]`, registrati `[paladin, mage]` → `overflow` = 2 = `any`: un terzo **`paladin` riceve `QUEST_FULL`**, un **`hero` riesce** (`reg(hero)` 0 < `exact(hero)` 1).
  - Scheda "strappata per tutti" se Σ reg ≥ totale; "strappata per me" se il mio titolo non ha posto secondo la regola sopra; altrimenti intera.
- **D-26:** story e worldMission sono accettabili **da qualunque città** (nessun controllo di posizione); il vincolo `QUEST_NOT_IN_CITY` resta solo per la corsia standard.
- **Selezioni:** `registeredAdventurers { character title }` (`character` = id del personaggio, `title` = rango al momento della registrazione) e `requiredAdventurers { title count }` (`title` nullo = qualsiasi rango). `party` e `registrations` non esistono più: i modelli FE `QuestRequirements` / `Quest.fromJson` vanno adeguati.

---

## 10. Emendamenti alla Phase 7

Il handoff Phase 7 §2/§6 è **superato** sul vincolo di città per story/worldMission e sulla forma di `party` / `registeredAdventurers` / `requiredAdventurers`.

- **D-26 — città:** story e worldMission accettabili da qualunque città; la definizione "in città" (marker della città o uno dei suoi `pointsOfInterest`) vale solo per la corsia standard.
- **D-27 — tipi registrati:** **registrati** (posto sulla Quest, capienza, `QUEST_FULL`): `worldMission`, `boss`, `enemy`, `aid`. **Non registrati** (nessuna capienza, più personaggi in contemporanea): `hunt`, `dungeon`, `job`, `heal`, `study` (e `crime`, `guard`). Story: corsia propria, non registrata. Una quest registrata **senza slot validi** (`requiredAdventurers` assente, `[]`, numerico legacy, `count` non intero ≥ 1, `title` non in `rookie|adventurer|paladin|mage|hero|legend|null`) → **`QUEST_NOT_ACCEPTABLE`** fail-closed, nessuna scrittura, WARN con il solo id. I tipi non registrati ignorano gli slot.
- **D-28 — forme:** `registeredAdventurers: [{ character, title }]` (unica fonte, `registrations` rimosso); `requiredAdventurers: [{ title, count }]` (`party` rimosso), `title: null` = qualsiasi rango. Esempi: enemy `[{ title: null, count: 1 }]`; worldMission `[{ title: 'hero', count: 5 }, { title: 'paladin', count: 4 }]`.
- **Slot esatti prima dei jolly (D-32, §9):** un hero occupa prima un posto `hero`, poi un jolly; un paladin senza slot `paladin` occupa solo un jolly.
- **D-29 — "strappata per tutti":** piena quando i registrati raggiungono Σ `count` oppure quando i posti del rango del giocatore (slot del suo titolo + jolly) sono esauriti → `QUEST_FULL`. Gli esiti (successo, fallimento, quest `aid` automatiche, morte) sono Phase 9 (§12).
- **D-30 — cancellazione:** `deleteCharacter` libera i posti del personaggio (`$pull` da `registeredAdventurers` di ogni quest), nella stessa transazione dell'archivio; il `PendingQuest` e l'eventuale `activeTravel` restano sul documento archiviato (job e sweep lo ignorano).
- **D-31 / D-32:** populate del catalogo e algoritmo di capienza, §9.

**Un documento d'esempio completo per tipo** (`mongosh`; sostituire i placeholder; `registeredAdventurers: []` sempre; `timeToComplete` in ms; i marker della corsia standard devono stare nei `pointsOfInterest` di una città e raggiungibili da strada):

```js
// story — corsia activeStoryQuest, non registrata, titolo esatto, costo in punti canale obbligatorio
db.quests.insertOne({ infos: { title: 'La prima prova', type: 'story', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: null, enemy: null, relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: 500, requiredAdventurers: [], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 1, silver: 0, copper: 0 }, xpPrize: 100, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// worldMission — corsia activeWorldMissionQuest, registrata, costo in punti canale obbligatorio
db.quests.insertOne({ infos: { title: 'Assedio al nord', type: 'worldMission', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: null, enemy: null, relatedLore: [] }, requirements: { minTitle: 'paladin', requiredPoints: 1000, requiredAdventurers: [{ title: 'hero', count: 5 }, { title: 'paladin', count: 4 }], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 5, silver: 0, copper: 0 }, xpPrize: 500, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// boss — corsia standard, registrata
db.quests.insertOne({ infos: { title: 'Il drago della palude', type: 'boss', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 14400000, enemy: ObjectId('<enemyId>'), relatedLore: [] }, requirements: { minTitle: 'mage', requiredPoints: null, requiredAdventurers: [{ title: 'hero', count: 1 }, { title: null, count: 2 }], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 10, silver: 0, copper: 0 }, xpPrize: 1000, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// enemy — corsia standard, registrata (un solo posto, qualsiasi rango)
db.quests.insertOne({ infos: { title: 'Il bandito del ponte', type: 'enemy', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 3600000, enemy: ObjectId('<enemyId>'), relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: null, requiredAdventurers: [{ title: null, count: 1 }], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 0, silver: 50, copper: 0 }, xpPrize: 50, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// aid — corsia standard, registrata (in Phase 9 nascerà in automatico dal fallimento di un'altra quest)
db.quests.insertOne({ infos: { title: 'Soccorso al bandito del ponte', type: 'aid', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 3600000, enemy: null, relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: null, requiredAdventurers: [{ title: null, count: 1 }], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 0, silver: 30, copper: 0 }, xpPrize: 30, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// hunt — corsia standard, non registrata, ripetibile
db.quests.insertOne({ infos: { title: 'Caccia ai lupi', type: 'hunt', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 3600000, enemy: null, relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: null, requiredAdventurers: [], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 0, silver: 20, copper: 0 }, xpPrize: 20, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// dungeon — corsia standard, non registrata, ripetibile
db.quests.insertOne({ infos: { title: 'Le cripte dimenticate', type: 'dungeon', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 10800000, enemy: null, relatedLore: [] }, requirements: { minTitle: 'adventurer', requiredPoints: null, requiredAdventurers: [], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 1, silver: 0, copper: 0 }, xpPrize: 150, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// job — corsia standard, non registrata, ripetibile
db.quests.insertOne({ infos: { title: 'Lavoro al porto', type: 'job', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 7200000, enemy: null, relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: null, requiredAdventurers: [], recommendedLoot: [] }, prizes: { prizeCoins: { gold: 0, silver: 10, copper: 0 }, xpPrize: 10, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// heal — corsia standard, non registrata, ripetibile
db.quests.insertOne({ infos: { title: 'Cure al tempio', type: 'heal', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 18000000, enemy: null, relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: null, requiredAdventurers: [], recommendedLoot: [] }, prizes: { prizeCoins: null, xpPrize: null, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
// study — corsia standard, non registrata, ripetibile
db.quests.insertOne({ infos: { title: 'Studio in biblioteca', type: 'study', markerLocation: ObjectId('<markerPoiId>'), timeToComplete: 7200000, enemy: null, relatedLore: [] }, requirements: { minTitle: 'rookie', requiredPoints: null, requiredAdventurers: [], recommendedLoot: [] }, prizes: { prizeCoins: null, xpPrize: 30, prizeItem: null, randomLoot: [] }, registeredAdventurers: [] })
```

Note: `minTitle` è `String!` sul filo, quindi va sempre valorizzato; `markerLocation` deve puntare a un POI esistente; `enemy`/`relatedLore`/item possono restare vuoti (orfani tollerati, §9).

---

## 11. Dati a DB per la UAT (da preparare a mano subito dopo il deploy)

> Mappa delle sezioni: dati UAT in §11; il handoff della Phase 7 li aveva in §8 (la FE 06-CONTEXT D-16 cita "§8": in questo documento è §11).

**(a) Le 4 quest di sviluppo (ruling C2).** Da eseguire **subito dopo il deploy**: finché `requiredAdventurers` è numerico la query `quests` risponde **`data: null`** (il `count: Int!` dello slot idratato è nullo e annulla tutta la lista).

```js
db.quests.updateOne({ 'infos.type': 'worldMission' }, { $set: { 'requirements.requiredAdventurers': [{ title: 'hero', count: 5 }, { title: 'paladin', count: 4 }], registeredAdventurers: [] }, $unset: { 'requirements.party': '', registrations: '' } })
db.quests.updateOne({ 'infos.type': 'enemy' }, { $set: { 'requirements.requiredAdventurers': [{ title: null, count: 1 }], registeredAdventurers: [] }, $unset: { 'requirements.party': '', registrations: '' } })
db.quests.updateOne({ 'infos.type': 'job' }, { $set: { 'requirements.requiredAdventurers': [], registeredAdventurers: [] }, $unset: { 'requirements.party': '', registrations: '' } })
db.quests.updateOne({ 'infos.type': 'heal' }, { $set: { 'requirements.requiredAdventurers': [], registeredAdventurers: [] }, $unset: { 'requirements.party': '', registrations: '' } })
db.quests.countDocuments({ 'requirements.requiredAdventurers': { $not: { $type: 'array' } } }) // atteso 0
```

Verificare anche che la worldMission abbia `requirements.requiredPoints` **intero > 0** (Phase 7 D-09), altrimenti `acceptQuest` risponde `QUEST_NOT_ACCEPTABLE`:

```js
db.quests.find({ 'infos.type': 'worldMission' }, { 'requirements.requiredPoints': 1 }) // se assente o 0:
db.quests.updateOne({ 'infos.type': 'worldMission' }, { $set: { 'requirements.requiredPoints': 1000 } })
```

**(b) Un pet completo (ruling C5).** La collection `pets` è vuota; `Pet` ha campi non nulli sul filo, quindi il documento va scritto **completo** (altrimenti `pets`/`pet(id)` falliscono):

```js
db.pets.insertOne({ name: 'Cavallo da viaggio', damages: { base: [], energy: [] }, buyPrice: { gold: 1, silver: 0, copper: 0 }, sellPrice: { gold: 0, silver: 50, copper: 0 }, xp: 0, maxXp: 100, currentLifePoints: 30, maxLifePoints: 30, imagePath: 'pets/horse.png', speedModifier: 2 })
db.characters.updateOne({ _id: ObjectId('<characterId>') }, { $set: { 'assets.pet': ObjectId('<petId>') } })
```

- `assets.pet` va scritto come **ObjectId**, mai come stringa.
- Avviso: `assets.pet` **non è popolato** da `character`/`characters`: **non selezionare `assets { pet { … } }`** nel FE (il valore grezzo non è un `Pet` sul filo). L'effetto si vede sulla durata dei viaggi (metà tempo con `speedModifier: 2`).
- `speedModifier: null` (o assente) = pet non cavalcabile = nessun bonus.

**(c) Strade, città e marker.**

- `Road.speedFactor` numerico > 0 su ogni strada (oggi 3–7, §8); è l'unica leva di durata a DB. Dopo una modifica: **riavviare il server** (il grafo si costruisce all'avvio).
- Ogni città ha un `markerLocation` che è un POI nella propria lista `pointsOfInterest` (167/167 oggi): i marker delle città sono le sole mete del viaggio libero.
- Il `markerLocation` di ogni quest della corsia standard deve essere tra i `pointsOfInterest` di una città (altrimenti `QUEST_NOT_IN_CITY`) e agganciabile alla rete stradale entro 5 km (altrimenti salto istantaneo, §3).
- Il personaggio di prova deve avere `status.location` su un POI (es. il marker di una città), altrimenti il viaggio libero risponde `TRAVEL_NO_PATH`.

**(d) Checklist UAT manuale** (dopo la FE Phase 7):

1. Da una città scegliere un'altra città: il dialog mostra distanza, durata ed ETA (`travelPreview`); confermare (`startTravel`).
2. Il marker si muove sulla polilinea con l'interpolazione basata su `serverTime`; spostare l'orologio del device non cambia la posizione.
3. Kill dell'app a metà viaggio, riapertura: il viaggio riprende dalla posizione corretta (`activeTravel` riletto).
4. All'arrivo: snap alla nuova `location` all'evento `characterUpdated` e **push "Viaggio completato"**.
5. Accettare una quest della corsia standard con marker diverso dalla posizione: "In viaggio" (`startDate` nullo), viaggio automatico, **nessuna push** all'arrivo, countdown che parte dall'arrivo.
6. Durante un viaggio: `startTravel` e `acceptQuest` rifiutati con `TRAVEL_IN_PROGRESS`; con una `pendingQuest` `startTravel` rifiutato con `QUEST_IN_PROGRESS`.
7. Teleport dal pannello admin (innkeeper) su un personaggio in viaggio libero: viaggio cancellato, nuova `location`, nessuna push; su un personaggio con `pendingQuest`: `QUEST_IN_PROGRESS`.
8. Con il pet `speedModifier: 2` equipaggiato: durata della preview dimezzata.

---

## 12. Note per le fasi BE 9 e 10

**Phase 9 (fine quest e coda del GM):**

- A missione risolta la corsia standard si svuota (`pendingQuest: null`): questo **sblocca viaggio libero e teleport** (oggi `QUEST_IN_PROGRESS`).
- Il **ritorno in città** è un viaggio libero scelto dal giocatore dal marker della quest (nessun viaggio automatico di ritorno).
- Complete/reject del GM con `startDate` ancora `null` (quest "in viaggio", `activeTravel` di tipo quest ancora attivo) **da definire**: oggi il completamento del viaggio scrive `startDate` solo se la `PendingQuest` esiste ancora con `startDate: null`.
- Esiti delle quest registrate (D-29): successo → la quest sparisce dalla board per tutti (serve un marcatore globale); fallimento di enemy/hunt/boss/dungeon → posto liberato e **quest `aid` automatica**; se chi accetta l'`aid` fallisce, il personaggio che aveva fallito la prima quest **muore**.
- La morte passa da `archiveCurrentCharacter(…, DeletionReason.death)`, che **libera già i posti** (D-30); il `$pull` oggi vale su tutte le quest che contengono il personaggio (non esiste ancora un marcatore di quest conclusa).
- **BE-ADMIN-01:** `activeTravel` arriva già su `characters`/`characterUpdated` dell'innkeeper: nessuna query dedicata necessaria per la vista dei viaggi.

**Phase 10 (hardening):**

- Indice su `status.activeTravel.endTime` per lo sweep, se i volumi crescono (oggi pochi personaggi, scansione accettabile).
- Retype dei ref `Mixed` (`status.location`, `assets.pet`, `quests.*`) a `MongooseSchema.Types.ObjectId`.
- Validazione degli input GraphQL (class-validator o equivalente).

---

## 13. Deploy

- **Variabile nuova, opzionale:** `TRAVEL_SWEEP_INTERVAL_MS` (già in `.env.example`, vuota = default 60 000 ms; `0` spegne lo sweep periodico; valore non intero o oltre 2147483647 → boot rifiutato). Non è un segreto.
- **Coda Redis nuova:** `bull:travel:*` (job `complete` con delay fino a `endTime`).
- **Redis in produzione:** verificare la **`maxmemory-policy`** (blocker in STATE): con una policy di eviction i delayed job possono sparire; lo sweep li compensa entro un intervallo. Consigliata `noeviction`.
- con `TRAVEL_SWEEP_INTERVAL_MS=0` un job arrivato in anticipo per skew dell'orologio resta incompleto fino al prossimo boot: in produzione tenere lo sweep attivo.
- **Nessuna migrazione:** aggiornamento dati **manuale** dell'utente (§11), subito dopo il deploy. I documenti legacy leggono i default (`activeTravel: null`; i `PendingQuest` esistenti restano con `startDate` valorizzato).
- **Nessuna dipendenza nuova**, **nessun indice nuovo**.
- Moduli: `TravelModule` (completamento, sweep, processor, resolver `startTravel`/`travelPreview`/`teleportCharacter`) montato in `AppModule` dopo `QuestAcceptanceModule`; `TravelPlanningModule` (planner, scheduler, coda `travel`, senza il modulo push) importato da `QuestAcceptanceModule` e da `TravelModule`; `RoadsModule` e `QuestsModule` ora registrano da sé i modelli che usano.

---

## 14. Deviazioni e punti aperti

**Deviazioni registrate nei SUMMARY 08-01..08-13** (nessuna cambia il contratto oltre le tre eccezioni dichiarate):

- 08-01: rimosso un import inutilizzato in `pet.model.ts` (Boy Scout); `ActiveTravel.to` esposto come `ID!` senza populate, `kind` persistito ma mai sul filo; rimosso anche `QuestInput.registeredAdventurers` (mai dal client).
- 08-02: nessuna deviazione; `quest-capacity.ts` conta solo i titoli registrati noti.
- 08-03: populate tramite cloni di `AssetQuantitySchema` con refPath assoluto (`assetQuantitySchemaAt`), schema originale invariato per personaggi e negozio; import inutilizzati rimossi in `quest-prizes.model.ts`; `quest(id)` ora risponde `NOT_FOUND` tipizzato invece di `INTERNAL_SERVER_ERROR`.
- 08-04: il test sulle strade parallele ripete il caso con entrambi gli ordini di inserimento (graphology elenca gli archi dal più recente); `getShortestPath`/`getPath` invariati (D-11) e il loro warning eslint resta.
- 08-05: commento riformulato per una grep di accettazione; esportato anche `TELEPORT_PROJECTION`.
- 08-06: rimossi i casi Phase 7 sui dati legacy a stringhe (ora `QUEST_NOT_ACCEPTABLE`, coperti dal caso fail-closed); alcuni casi di concorrenza erano verdi già dal task precedente (caratterizzazione).
- 08-07: nessuna deviazione.
- 08-08: nessuna deviazione.
- 08-09: `import type` per `TravelConfig` (TS1272 con `nest build`); `codeOf` del log dello sweep senza stringificazione di oggetti.
- 08-10: commento riformulato; nel boot reale `TRAVEL_SWEEP_INTERVAL_MS: '0'` per non lasciare timer.
- 08-11: il RED previsto sul filo non si è verificato (caratterizzazione del Task 1); le accettazioni standard esistenti con marker non persistito ora saltano sul marker (WARN atteso, D-03).
- 08-12: `TravelRequest` nasce riusabile; harness con `PUSH_CONFIG` sovrascritto.
- 08-13: il teleport **riusa `TravelRequest`** (nessun input dedicato) in un `TravelAdminResolver` separato.
- 08-14: nessuna deviazione.

**Note:**

- **BE-FUT-03 (pet speed modifiers) è stato anticipato in questa fase (D-08).**
- Scala delle durate: decisione dell'utente (§8).
- UAT su device: dopo la FE Phase 7, con i dati di §11 (vedi `08-VALIDATION.md`, Manual-Only Verifications).
- Fuori fase: annullamento/cambio meta (escluso by design), admin CRUD di pet/strade/POI, velocità base come attributo del personaggio, ricalcolo dell'ETA al cambio pet.
