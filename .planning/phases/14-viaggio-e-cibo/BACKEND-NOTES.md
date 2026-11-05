# BACKEND-NOTES — Phase 14 Viaggio e cibo (handoff per la FE Phase 15)

- **Fase BE:** 14-viaggio-e-cibo (requisiti BE-FOOD-01..06; decisioni D-01..D-20 in `14-CONTEXT.md`; nomi del contratto fissati in `14-REPO-RULES.md`).
- **Data:** 2026-11-05. Documento di fine fase, scritto prima della UAT su device (richiede la FE Phase 15 e i dati di §7).
- **Branch:** `feat/14-viaggio-e-cibo` (da `develop` `698ae82`) → PR verso `develop` a cura dell'orchestratore. La FE Phase 15 esegue su mock e consuma lo schema dopo la merge.
- **Schema:** `src/schema.gql` è **puramente additivo** (D-14): rispetto a `origin/develop` aggiunge 8 righe e non ne toglie nessuna. Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate (piano 14-07): `npm run test:cov` **341 suite / 4333 test** verdi (526,5 s); coverage `src/travel/` 99,68 / 87,67 / 100 (statements / branches / lines, soglie 97 / 84 / 98), `src/quests/acceptance/` 99,25 / 93,13 / 100 (soglie 97 / 91 / 98), `src/travel/food/` 100 / 90,41 / 100; boot reale 76/76; `npx tsc --noEmit` exit 0; prettier ed eslint puliti sui file toccati (un solo warning preesistente in `test/app.int-spec.ts`). Nessuna dipendenza nuova, nessuna variabile d'ambiente nuova.
- **Fonte:** ogni nome, codice, messaggio e riga di SDL è copiato dal codice: `src/schema.gql`, `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/travel/food/*.ts`, `src/travel/travel.service.ts`, `src/quests/acceptance/quest-acceptance.service.ts`, `src/quests/acceptance/quest-acceptance.resolver.ts`. **Lo schema vince su questo documento.**

---

## 0. TL;DR per il FE

1. **SDL solo additivo:** `TravelPreview` guadagna `food`, `hpLost`, `arrivesAlive`; nuovo tipo `TravelFoodItem`; nuova query owner-only **nullable** `questTravelPreview`. Niente cambia su `Character`, `ActiveTravel`, `PendingQuest`, `Quest`.
2. **Il server sceglie e consuma il cibo alla partenza**: viaggio libero (`startTravel`) o viaggio automatico dell'accettazione di una quest della corsia standard (`acceptQuest`). Nello stesso update scala gli HP della vita persa sui km non coperti.
3. **Rifiuto `TRAVEL_STARVING`** («Non hai cibo a sufficienza per il viaggio») se il personaggio non arriverebbe con almeno 1 HP. Un rifiuto non scrive nulla (nessun cibo, nessun HP, nessun punto canale, nessun viaggio).
4. **Le anteprime rispondono coi numeri e `arrivesAlive`, mai col codice di fame** (D-09): con `arrivesAlive: false` il FE spegne «Parti» / lo swipe e mostra la frase.
5. **La verità arriva su `characterUpdated`** (D-10): inventario (`assets.ownedItems`) e `status.currentLifePoints` cambiano solo da lì. L'anteprima è informativa: la partenza ricalcola sul cibo del momento.
6. **Il FE non calcola nulla**: fabbisogno, selezione, km scoperti, vita persa e soglia sono regole del server (§3, solo per capire e per la UAT).
7. Teleport dell'oste e salto istantaneo non consumano; story e worldMission non viaggiano; **nessun rimborso**, mai.

---

## 1. Contratto GraphQL (additivo)

Blocchi copiati verbatim da `src/schema.gql` (`sortSchema: true`, campi in ordine alfabetico, tipi nell'ordine del file):

Riga di `type Query`:

```graphql
  questTravelPreview(request: AcceptQuestRequest!): TravelPreview
```

```graphql
type TravelFoodItem {
  item: LootItem!
  quantity: Int!
}

type TravelPreview {
  arrivesAlive: Boolean!
  distance: Float!
  duration: Float!
  food: [TravelFoodItem!]!
  hpLost: Int!
  road: TravelPath!
}
```

Le 8 righe aggiunte rispetto a `develop` (`git diff origin/develop -- src/schema.gql`), nessuna tolta:

```diff
+  questTravelPreview(request: AcceptQuestRequest!): TravelPreview
+type TravelFoodItem {
+  item: LootItem!
+  quantity: Int!
+}
+  arrivesAlive: Boolean!
+  food: [TravelFoodItem!]!
+  hpLost: Int!
```

Input **riusati, non duplicati**: `TravelRequest { id, poiId }` per `travelPreview` / `startTravel` (invariati), `AcceptQuestRequest { id, questId }` per `questTravelPreview` / `acceptQuest`. `travelPreview(request: TravelRequest!): TravelPreview!` resta non nullable.

**Documenti FE di esempio:**

```graphql
query GetQuestTravelPreview($request: AcceptQuestRequest!) {
  questTravelPreview(request: $request) {
    distance
    duration
    hpLost
    arrivesAlive
    food { quantity item { id name } }
  }
}

query GetTravelPreview($request: TravelRequest!) {
  travelPreview(request: $request) {
    distance
    duration
    road { coordinates distance }
    hpLost
    arrivesAlive
    food { quantity item { id name } }
  }
}
```

```json
{ "request": { "id": "<characterId>", "questId": "<questId>" } }
```

- `food[].item` è un `LootItem` **completo** (idratato: `id`, `name`, `power`, `effect`, `description`, `rarity`, prezzi, …); `name` è nullable a schema come per ogni `LootItem`.
- `food[].quantity` = unità di quello stack che il server mangerebbe (un'unità usata in parte è consumata intera).
- `hpLost` = HP che la partenza scalerebbe (0 se il cibo copre tutto). Può essere enorme quando `arrivesAlive` è `false` (es. 20 910): la FE mostra solo la frase (FE 15 D-10).
- `arrivesAlive` = `currentLifePoints − hpLost ≥ 1`.
- `duration` resta in millisecondi, `distance` in km di gioco (Phase 8 §1).
- **Nessun campo nuovo** su `Character`, `ActiveTravel`, `PendingQuest`, `Quest`; `needed`, `covered`, `hpAfter` restano interni.

---

## 2. Codici

Ogni rifiuto ha `errors[0].extensions` **esattamente** `{ "code": "<CODICE>" }` e un messaggio italiano; il FE mappa il **codice**. Forma della risposta:

- `startTravel` / `acceptQuest` rifiutati (campi non nullable) → `data: null` + `errors`.
- `questTravelPreview` rifiutata (campo **nullable**) → `data: { questTravelPreview: null }` + `errors`: il FE legge solo `errors[0].extensions.code` (un `null` **senza** `errors` significa invece «nessun viaggio», §4).

| Codice | Messaggio | Dove | Quando | Azione FE |
|--------|-----------|------|--------|-----------|
| `TRAVEL_STARVING` | `Non hai cibo a sufficienza per il viaggio` | `startTravel`, `acceptQuest` (corsia standard con viaggio reale su strada) | quando `currentLifePoints − hpLost < 1` sul cibo del momento (D-11) | mostrare «Non hai cibo a sufficienza per il viaggio» nel banner; `startTravel`: foglio aperto e anteprima rinfrescata; `acceptQuest`: foglio ricomposto e anteprima rinfrescata (FE 15 D-03, D-05, D-06) |
| `NOT_FOUND` | `Missione non trovata` / `Personaggio non trovato` | `questTravelPreview` | quest inesistente; personaggio inesistente o archiviato | ricaricare board / personaggio |
| `FORBIDDEN` | `Questo personaggio non ti appartiene` | `questTravelPreview` | `request.id` non è il `currentCharacter` del chiamante (owner-only, anche per l'innkeeper) | errore generico |
| `QUEST_NOT_IN_CITY` | `Devi trovarti nella città della missione` | `questTravelPreview` | corsia standard o worldMission fuori dalla città del marker (stessa regola di `acceptQuest`) | nessuna riga «Viaggio»; lo swipe risponderà lo stesso codice |
| `QUEST_NOT_ACCEPTABLE` | `Missione non disponibile` | `questTravelPreview` | corsia standard con `markerLocation` che punta a un POI senza documento (difetto di catalogo, ereditato da `autoRoute`) | nessuna riga «Viaggio»; segnalare al GM |
| `BAD_USER_INPUT` | `Input non valido: questId` / `Input non valido: id` | `questTravelPreview` | id malformati (validation pipe, Phase 10) | errore generico |
| `UNAUTHENTICATED` | `Authentication required` | `questTravelPreview` | nessun bearer valido | flusso di refresh/login esistente |

- `travelPreview` mantiene **esattamente** i codici della Phase 8 §2 (con gli emendamenti della Phase 10): nessun codice nuovo, **mai `TRAVEL_STARVING` nelle anteprime**.
- `questTravelPreview` **non** valuta corsia occupata, titolo, posti né punti canale (sono dello swipe, D-08); non risponde `TRAVEL_IN_PROGRESS` né `AWAITING_AID`.
- I codici della Phase 7/8 su `startTravel` e `acceptQuest` restano invariati; `TRAVEL_STARVING` si aggiunge **dopo** di loro.

**Ordine di valutazione di `startTravel`:** regole della Phase 8 (§2 punto 4: `TRAVEL_DESTINATION_NOT_ALLOWED` → `TRAVEL_IN_PROGRESS` → `QUEST_IN_PROGRESS` → `TRAVEL_SAME_LOCATION` → `TRAVEL_NO_PATH`) → transazione: lettura della dispensa in sessione → **`TRAVEL_STARVING`** solo se la partenza è ancora possibile; se nel frattempo un movimento concorrente ha vinto, risponde il codice di `classifyUnstarted` (`NOT_FOUND` → `TRAVEL_IN_PROGRESS` → `QUEST_IN_PROGRESS` → `TRAVEL_IN_PROGRESS`) **prima** della fame.

**Ordine di valutazione di `acceptQuest`:** pre-verifica della Phase 7/8 (§2 punto 2: `NOT_FOUND` → `QUEST_NOT_ACCEPTABLE` (costo, posti) → personaggio → idoneità (`AWAITING_AID`, `TRAVEL_IN_PROGRESS`, `QUEST_ALREADY_TAKEN`, `QUEST_TITLE_MISMATCH`, `QUEST_SLOT_BUSY`, `QUEST_FULL`) → `QUEST_NOT_IN_CITY` (esente la story) → movimento (marker senza POI → `QUEST_NOT_ACCEPTABLE`)) → **`TRAVEL_STARVING`** in pre-verifica (solo con viaggio reale su strada; prima di qualunque scrittura: nessun punto scalato, nessuna `PendingQuest`, nessuna registrazione, nessun job) → transazione: claim (in corsa il codice di `classifyUnclaimed` — `AWAITING_AID` > `TRAVEL_IN_PROGRESS` > `QUEST_SLOT_BUSY` > `QUEST_ALREADY_TAKEN` > `QUEST_TITLE_MISMATCH` > `QUEST_NOT_IN_CITY` — **prima** della fame, poi `TRAVEL_STARVING` se il cibo è cambiato fra pre-verifica e transazione), registrazione (`QUEST_ALREADY_TAKEN` / `QUEST_FULL`), debito (`INSUFFICIENT_POINTS`). La verifica in transazione fa fede (D-11).

---

## 3. Semantica

Tutto server-side (D-07: modulo puro `src/travel/food/travel-food.ts`, costanti `FOOD_RULES = { minutesPerPower: 3, minLifePoints: 1 }` in codice, nessuna variabile d'ambiente).

- **Fabbisogno (D-01):** ⌈`durationMs` / 180 000⌉ power (1 power = 3 minuti di marcia) sulla **durata del pianificatore** della Phase 8, che già comprende terreno (`speedFactor` delle strade), pet (`speedModifier`) e ferite (`movementImpairment`). Un pet ×2 dimezza il fabbisogno, Pegaso ×4 lo divide per quattro; una ferita che allunga il tempo allunga il cibo.
- **Selezione (D-05, D-06):** fra gli `assets.ownedItems` di tipo `LootItem` con `effect: hunger` (unità = stack espansi per quantità) vince la combinazione che copre il fabbisogno con **lo scarto minimo** → poi **meno unità** → poi **minor valore di vendita totale** → poi **id più basso** (deterministica, nessun caso). Un'unità usata in parte è **consumata intera**. **Se può coprire, copre sempre**, anche sprecando (nessun tetto). **Se tutto il cibo non basta si mangia tutto** (D-04) e il resto del fabbisogno è scoperto.
- **Km scoperti (D-03):** ⌈(fabbisogno − coperto) × distanza / fabbisogno⌉, per eccesso, con `distanza` = `TravelPreview.distance` arrotondata al metro e aritmetica intera (nessun epsilon). Fabbisogno coperto → 0 km.
- **Vita persa (D-02):** triangolare, il km scoperto n-esimo costa n HP: `hpLost` = n(n+1)/2. Costo in HP assoluti, non in percentuale dei massimi.
- **Soglia (D-04, D-11):** la partenza è ammessa solo se `currentLifePoints − hpLost ≥ 1` (`arrivesAlive`); altrimenti `TRAVEL_STARVING` senza scritture.
- **Quando:** cibo e HP sono scalati **alla partenza** (`startTravel`) **o al claim** (`acceptQuest`), nello stesso update condizionale che scrive `activeTravel`; **mai all'arrivo** (completamento, reconciler e sweep invariati).

**Esempi numerici del discuss (CONTEXT D-01..D-06, DB di sviluppo, senza pet):**

| Caso | Numeri |
|------|--------|
| città → città più vicina (mediana 2,7 h, ≈ 16 km) | 55 power |
| città → marker di quest (2,6 h) | 52 power |
| città → città qualsiasi (mediana 35 h, 204 km) | 700 power |
| attraversata massima (82 h, 506 km) | 1646 power |
| 60 richiesti, posseduti un 50 e tre 20 | mangia i tre 20 (scarto 0) |
| 60 richiesti, posseduti 50, 10 e tre 20 | mangia 50 + 10 (scarto 0, meno unità) |
| 10 richiesti, posseduto solo il «Pane di Elfo» 200 | mangia il 200 (D-05) |
| 55 richiesti, 40 coperti, 16 km | 15/55 × 16 = 4,36 → **5 km** scoperti → **15 HP** |
| senza cibo: 16 / 50 / 100 / 204 / 506 km scoperti | 136 / 1275 / 5050 / 20 910 / **128 271** HP |
| rookie (1000 HP) | regge ≤ 44 km scoperti |
| legend (40 000 HP) | regge ≤ 282 km scoperti |

A catalogo: 33 cibi `hunger` da 5 a 200 power (es. «Razione da viaggio» 100, «Pane di Elfo» 200).

---

## 4. Anteprime

- **`travelPreview`** (invariata nell'input e nei codici, Phase 8 §4): `{ distance, duration, road }` più `food`, `hpLost`, `arrivesAlive` calcolati sul cibo e sugli HP correnti, **nessuna scrittura**.
- **`questTravelPreview(request: AcceptQuestRequest!): TravelPreview`** — **owner-only** come `travelPreview`, stessa forma, **nullable**. Calcola il movimento come l'accettazione (`movementTo` / `autoRoute`) sul personaggio corrente, senza scrivere e senza log del salto. Risponde **`null` senza errori** quando l'accettazione non comporta un viaggio:
  - quest **story** (nessun viaggio, nessun controllo di città);
  - quest **worldMission** (in città: non muove il personaggio; fuori città: `QUEST_NOT_IN_CITY`);
  - **marker uguale alla posizione** del personaggio;
  - **salto istantaneo**: nessuna strada verso il marker (Phase 8 D-03).
- **Viaggio o soccorso in corso:** la stima parte dalla posizione corrente senza codici in più (D-08); il FE non la chiede in quei casi (lo swipe è già spento da `activeTravel` / `awaitingAid`).
- **Ordine di `food` (D-17):** la lista segue l'**ordine di `assets.ownedItems`** del personaggio (non l'ordine di selezione né un ordinamento per nome): il FE la mostra così com'è.
- `food` è `[]` quando il personaggio non ha cibo o il fabbisogno è 0; con cibo insufficiente elenca **tutto** il cibo (verrebbe mangiato tutto) e `hpLost` > 0.
- **L'anteprima è informativa (D-10):** `startTravel` / `acceptQuest` **ricalcolano sul cibo del momento** e partono con la nuova selezione; nessun codice «cibo cambiato», nessun passaggio dell'anteprima nella mutation. Se nel frattempo il cibo è sparito, la partenza può rispondere `TRAVEL_STARVING` anche dopo un'anteprima con `arrivesAlive: true`.

---

## 5. Concorrenza

- **Partenza e claim in transazione** (D-12 rivisto): la dispensa (`assets.ownedItems` con i `LootItem` `hunger`, `status.currentLifePoints`) è letta **in sessione** dentro la transazione; il `findOneAndUpdate` della partenza o del claim riafferma nel filtro quantità degli stack consumati e HP (rete di sicurezza) e scrive nello stesso update inventario ricalcolato (stack a 0 rimossi), `status.currentLifePoints` e `activeTravel`.
- **Due partenze con lo stesso cibo → una sola riesce** e il cibo è mangiato una volta: `startTravel` concorrenti → il perdente riceve `TRAVEL_IN_PROGRESS`; `acceptQuest` concorrenti → il perdente riceve `QUEST_SLOT_BUSY` o `TRAVEL_IN_PROGRESS` (provato in integration, piani 14-04 e 14-06).
- **In corsa il codice della corsa viene prima della fame** (§2): un perdente non vede mai `TRAVEL_STARVING` se ha perso la corsa.
- **Nessun retry manuale**: sul WriteConflict il driver riesegue da solo il callback della transazione; un filtro non matchato si classifica coi codici esistenti.
- **Un acquisto concorrente non va perso (D-20):** un acquisto al negozio (oggetto non-cibo) scritto dopo la lettura della dispensa fa ripartire la transazione e sopravvive alla partenza / al claim. Provato con una prova di mutazione nei piani 14-04 e 14-06: togliendo la sessione dalla lettura il test diventa rosso (lost update dell'inventario), con la sessione è verde e il callback gira più volte.

---

## 6. Esenzioni

- **Teleport dell'oste** (`teleportCharacter`) e **salto istantaneo** senza strada: non leggono la dispensa, non consumano, non scalano HP (D-13).
- **Story e worldMission**: nessun viaggio, nessun consumo.
- **Completamento, reconciler, sweep, push `travelEnd`**: invariati, l'arrivo non tocca cibo né HP.
- **Nessun rimborso**, mai: né dopo un teleport a viaggio iniziato, né dopo l'imboscata della BE Phase 15 (BE-AMBUSH-05). **Nota per la BE Phase 15:** la deviazione verso la città più vicina non deve rifare il piano del cibo né restituire nulla.

---

## 7. Dati per la UAT

**Nessun seeder, nessuna migrazione, nessuna variabile d'ambiente in questa fase.** Il cibo e gli HP del personaggio di prova li scrive **l'orchestratore a DB con uno script fuori dal repo**, dopo build e riavvio del BE dal branch (§8). Sul DB di sviluppo i personaggi di prova hanno oggi 0–2 unità di cibo: senza dati la UAT vede quasi solo il caso «senza cibo».

**Campi da scrivere** sul personaggio di prova (`<characterId>`):

- `assets.ownedItems`: voci `{ itemType: 'LootItem', item: <id di un LootItem con effect 'hunger'>, quantity: <n> }` (`item` come ObjectId, mai stringa), **mantenendo le voci esistenti** (pozioni, munizioni, …).
- `status.currentLifePoints`: intero fra 1 e `status.maxLifePoints`.
- Cibi a catalogo citati nel CONTEXT: «Razione da viaggio» (`power` 100), «Pane di Elfo» (`power` 200); per la copertura parziale servono cibi piccoli (`power` 5–20).

**Ordini di grandezza** (discuss, §3): città → città più vicina ≈ 55 power / 16 km; senza cibo su quella tratta **136 HP**. Il rifiuto per fame si ottiene con **HP bassi** (sotto `hpLost` + 1) **o con una strada lunga** (204 km senza cibo = 20 910 HP: rifiuto anche per un legend). I numeri esatti per la tratta scelta li dà l'anteprima stessa.

| Caso | Dati | Atteso |
|------|------|--------|
| (a) coperto | una «Razione da viaggio» (100) verso la città più vicina | anteprima: `food` = 1× Razione, `hpLost` 0, `arrivesAlive` true; partenza: razione sparita, HP invariati su `characterUpdated` |
| (b) parziale | due cibi da 20 (40 coperti su ≈ 55) e HP pieni | anteprima: `food` = tutto il cibo, `hpLost` > 0 (≈ 15 sui numeri del discuss); partenza: cibo sparito, HP scalati alla partenza |
| (c) rifiutato | niente cibo e HP bassi (es. `currentLifePoints` 100 con `hpLost` 136), oppure una meta lontana | anteprima: `arrivesAlive: false` (riga rossa, «Parti» spento); `startTravel` → `TRAVEL_STARVING`, nessuna scrittura, foglio aperto con anteprima rinfrescata |
| (d) quest standard | quest della corsia standard con marker raggiungibile su strada: una volta con cibo che copre, una volta senza cibo e HP bassi | riga «Viaggio» del foglio da `questTravelPreview`; coperto: accettata, cibo mangiato al claim; rifiutato: `TRAVEL_STARVING`, nessun punto canale scalato, foglio ricomposto |
| (e) esenzioni | salto (quest con marker senza strada, o marker = posizione), story/worldMission, teleport dell'oste | `questTravelPreview` `null` (nessuna riga); nessun consumo né HP scalati; teleport a viaggio iniziato: nessun rimborso |

---

## 8. Deploy

- **Nessuna variabile d'ambiente nuova** (`.env.example` invariato), **nessuna migrazione**, **nessun one-off al boot**, **nessun seeder**, nessun indice nuovo, nessuna dipendenza nuova.
- **Runbook post-merge = solo build + riavvio:** `npm run build` e riavvio da `dist/`, a cura dell'utente o dell'orchestratore **a BE fermo** (mai `npm run build` mentre il processo gira da `dist/`: `deleteOutDir` lo cancellerebbe). Nessun passo di dati: il cibo della UAT (§7) è una semina dell'orchestratore, non parte del deploy.
- Moduli: `TravelPantryReader` vive nel `TravelPlanningModule` (registra `LootItem`), già importato da `TravelModule` e `QuestAcceptanceModule`.

---

## 9. Deviazioni e punti aperti

**Deviazioni registrate nei SUMMARY 14-01..14-07** (nessuna cambia il contratto):

- **Km scoperti in metri interi** (D-07 emendato dal checker, 14-01): moltiplicare prima di dividere non bastava in virgola mobile (55 / 5 / 1,1 km dava 2 km invece di 1); la distanza è arrotondata al metro e il calcolo è intero, senza epsilon.
- **Numeri della fixture dei test** (D-18 emendato, 14-03..14-06): la ricerca aveva letto i gradi della mappa di prova come km. Numeri reali: A→B ≈ 0,4448 km, fabbisogno 2, senza cibo −1 HP; marker di quest ≈ 0,22 km, fabbisogno 1. Con i 100 HP di default la partenza senza cibo non è rifiutata: i casi di fame nelle spec usano 1 HP, quelli di copertura un default «robusto» (`HARDY_LIFE_POINTS` = 1000) dove serve; le attese sono calcolate con le funzioni pure, mai letterali. I modificatori (pet, ferita, strada lenta) sono asseriti come rapporti fra fabbisogni.
- **Query nullable rifiutata** (14-05): risponde `data: { questTravelPreview: null }` + `errors`, non `data: null`; helper di test dedicato.
- **Spia della prova D-20** (14-04, 14-06): scrive l'acquisto concorrente alla prima lettura della dispensa (partenza) o alla seconda (accettazione, dopo la pre-verifica fuori sessione).
- **Commenti riformulati** (14-05) per un grep di gate; testo del WARN del salto invariato (resta solo sull'accettazione).
- Formato `Plan: N of 8` in STATE.md al posto di `Plan: 0N of 8` scritto nei piani.

**Punti aperti:**

- BE Phase 15 (imboscate): la deviazione del viaggio non rifà il piano del cibo e non rimborsa (§6).
- Fuori fase (deferred del CONTEXT): scelta manuale del cibo, tetto allo spreco, fame fuori dal viaggio, `hpAfter` sul filo.
- UAT su device: dopo la merge, con la FE Phase 15 e i dati di §7.
