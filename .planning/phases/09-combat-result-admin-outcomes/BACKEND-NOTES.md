# BACKEND-NOTES — Phase 9 Combat Result & Admin Outcomes (handoff per la FE Phase 9, la FE Phase 10, la FE Phase 7 e la BE Phase 10)

- **Fase BE:** 09-combat-result-admin-outcomes (requisiti BE-COMBAT-01, BE-COMBAT-02, BE-COMBAT-03, BE-ADMIN-01, BE-ADMIN-02; BE-COMBAT-03 e BE-ADMIN-02 emendati il 2026-10-24; decisioni D-01..D-29 in `09-CONTEXT.md`, con i rulings C1–C10 di `09-RESEARCH.md` §"Conflitti con il CONTEXT").
- **Data:** 2026-10-24. Documento di fine fase, scritto prima della UAT su device (manual-only: richiede la FE Phase 9/10 e i dati di §12).
- **Branch:** `feat/09-combat-result-admin-outcomes` (PR verso `develop`). **Nessuna dipendenza da una PR FE** (D-28): le FE Phase 7, 9 e 10 consumano lo schema dopo la merge.
- **Schema:** `src/schema.gql` è **solo additivo** rispetto a `develop` (`git diff origin/develop...HEAD -- src/schema.gql | grep -cE '^-[^-]'` = 0). Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0. Nello schema non compaiono `grade`, `concludedAt`, `startedAt`, `rescue`, `CombatResolver`, `approvePendingRequest`, `rejectPendingRequest`, `combatResult`.
- **Stato:** implementato e coperto da test. Gate di fine fase (09-16): unit **121 suite / 1765 test**, integration **72 suite / 913 test** (replica set + Redis effimero, `--runInBand`, ~160 s), `npm run build` exit 0, lint filtrato 0 righe, `eslint` e `prettier --check` puliti sui 174 `.ts` toccati dalla fase, nessuna dipendenza nuova in `package.json`. Baseline di inizio fase: unit 96 / 1424, integration 57 suite. Gate rieseguito dopo 09-17 (verdetto unico, A3): unit **121 suite / 1776 test**, integration **72 suite / 915 test**, build exit 0, `src/schema.gql` senza diff. Gate rieseguito dopo 09-18 (aid di gruppo): unit **121 suite / 1790 test**, integration **72 suite / 924 test**, build exit 0, `src/schema.gql` rigenerato dal boot reale (il riferimento singolo al salvato diventa la lista `rescuedCharacters`; era nato in questa PR, quindi il diff vs `develop` resta additivo). Gate rieseguito dopo 09-19 (avvio a party completo): unit **122 suite / 1827 test**, integration **75 suite / 967 test**, build exit 0, `src/schema.gql` rigenerato dal boot reale con le sole aggiunte di §1 (attesa del gruppo).
- **Fonte:** ogni nome, codice, messaggio e riga di SDL qui sotto è copiato dal codice: `src/schema.gql`, `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/authz/resource-not-found.exception.ts`, `src/authz/authorization.exception.ts`, `src/auth/auth.exception.ts`, `src/quests/outcomes/**`, `src/quests/results/**`, `src/quests/pending-requests/**`, `src/config/quest-config.ts`, `src/push/push-events.ts`. **Lo schema vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Gli esiti li decide il server.** La corsia standard (`pendingQuest`: hunt, enemy, boss, dungeon, heal, aid, job, study, crime, guard) **si risolve da sola** alla scadenza del countdown (`startDate + waitingTime`). Story e worldMission **le completa solo il GM**, e solo con esito positivo (niente rifiuto, niente rimborso, niente timeout).
2. **Un risultato per personaggio** (`QuestResult`), sempre, combattimento o no: anche per il soccorso e per la morte.
3. **Foreground:** subscription `questResultReceived(characterId)` (payload completo). **Background:** push `questEnd` con `data.id` = **id del risultato** → `questResult(id)` al tap. Nessuno snapshot alla subscribe: i risultati persi si leggono solo con la query.
4. **Esiti:** `outcome` ∈ `success | failure | rescued | death | gmCompleted` (il campo si chiama `outcome`, non `kind`).
5. **Morte** = personaggio archiviato e `currentCharacter` dell'utente a `null` (arriva su `userUpdated`) → popup di morte → flusso di creazione personaggio. Il risultato `death` resta leggibile dall'utente.
6. **`status.awaitingAid`** non nullo = personaggio ferito in attesa di soccorso: blocca viaggio, preview, accettazione e negozio (`AWAITING_AID`, `SHOP_NOT_IN_CITY`); il teleport del GM resta ammesso. Un combattimento perso genera **una sola aid** per tutti i feriti, con gli stessi posti della quest fallita (slot di rango compresi, piano 09-20); il foglio di ogni soccorritore vittorioso elenca i salvati in `rescuedCharacters: [ID!]!`.
7. **Negozio solo sul marker di una città** (`SHOP_NOT_IN_CITY`), mai in viaggio, mai in attesa di soccorso.
8. **Coda del GM** (`pendingRequests` / `pendingRequestsUpdated`) e **`completePendingRequest`** per il pannello admin (FE Phase 10).
9. **Attesa del gruppo (piano 09-19):** boss, aid ed enemy cominciano solo a posti pieni e con tutti sul marker. `PendingQuest.startDate == null && arrivedAt != null` = in attesa del gruppo; `abandonQuest` lascia il gruppo; dopo 24 ore senza posti pieni il party è sciolto con push `questCancelled` (§5).
10. **Contatore del party live (piano 09-20):** `questUpdated(questId: String!): Quest!` — snapshot alla subscribe, poi un evento a ogni accettazione, abbandono, scioglimento o avvio (§5, §10). La aid ha gli **stessi posti** della quest fallita (§6).

---

## 1. Contratto GraphQL (additivo)

Blocchi copiati da `src/schema.gql` (`sortSchema: true`, i campi sono in ordine alfabetico).

```graphql
type AwaitingAid {
  aidQuest: ID!
  quest: ID!
  since: DateTime!
}

type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
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

type QuestPrizes {
  prizeCoins: Coins
  prizeItem: AssetQuantity
  randomLoot: [AssetQuantity!]!
  spell: Spell
  xpPrize: Int
}

type QuestResult {
  character: ID!
  consumablesUsed: [AssetQuantity!]!
  enemy: Enemy
  hpAfter: Int!
  hpBefore: Int!
  id: ID!
  injuriesAdded: [InjuryType!]!
  levelAfter: Int!
  levelBefore: Int!
  maxLifePoints: Int!
  outcome: QuestOutcome!
  quest: QuestResultQuest!
  rescuedCharacters: [ID!]!
  resolvedAt: DateTime!
  rewards: QuestRewards!
  spellLearned: Spell
  spellsUsed: [SpellUsage!]!
  titleAfter: String!
  titleBefore: String!
  user: ID!
  xpAfter: Int!
  xpBefore: Int!
  xpGained: Int!
}

type QuestResultQuest {
  id: ID!
  title: String!
  type: String!
}

type QuestRewards {
  coins: Coins!
  items: [AssetQuantity!]!
}

type SpellUsage {
  spell: Spell
  usages: Int!
}

enum QuestOutcome {
  death
  failure
  gmCompleted
  rescued
  success
}

type PendingRequest {
  character: PendingRequestCharacter!
  id: ID!
  pointsSpent: Int!
  quest: PendingRequestQuest!
  startDate: DateTime
  user: PendingRequestUser!
}

type PendingRequestCharacter {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  id: ID!
  location: ID!
  name: String!
  title: String!
}

type PendingRequestQuest {
  id: ID!
  registeredAdventurers: [QuestRegistration!]!
  requiredAdventurers: [QuestPartySlot!]!
  title: String!
  type: String!
}

type PendingRequestUser {
  id: ID!
  twitchId: String!
}

input CompletePendingRequestInput {
  outcomes: [ParticipantOverrideInput!]
  pendingQuestId: ID!
}

input ParticipantOverrideInput {
  characterId: ID!
  consumablesUsed: [ItemUsageInput!]
  hpAfter: Int
  injuries: [InjuryType!]
  spellsUsed: [SpellUsageInput!]
}

input ItemUsageInput {
  item: ID!
  quantity: Int!
}

input SpellUsageInput {
  spell: ID!
  usages: Int!
}
```

Righe nuove di `type Query`:

```graphql
  pendingRequests: [PendingRequest!]!
  questResult(id: String!): QuestResult!
```

Righe nuove di `type Mutation`:

```graphql
  completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]!
```

Righe nuove di `type Subscription`:

```graphql
  pendingRequestsUpdated: [PendingRequest!]!
  questResultReceived(characterId: String!): QuestResult!
```

**Contatore del party (piano 09-20, decisione dell'utente del 2026-10-26), riga aggiunta a `type Subscription` copiata da `src/schema.gql`:**

```graphql
  questUpdated(questId: String!): Quest!
```

Stesso tipo `Quest` della board; ogni utente autenticato (l'assenza del bearer chiude la `connection_init` con 4403). Selezione consigliata per il contatore:

```graphql
subscription OnQuestUpdated($questId: String!) {
  questUpdated(questId: $questId) {
    id
    registeredAdventurers { character title registeredAt }
    requirements { requiredAdventurers { title count } }
  }
}
```

Tipi esistenti riusati (invariati): `AssetQuantity { item: ItemUnion! quantity: Int! }`, `Coins { copper gold silver }`, `Spell`, `Enemy`, `ActiveTravel`, `QuestRegistration`, `QuestPartySlot`, `InjuryType`.

**Attesa del gruppo (piano 09-19, aggiunte additive copiate da `src/schema.gql`):**

```graphql
type PendingQuest {
  arrivedAt: DateTime
  id: ID!
  pointsSpent: Int!
  quest: Quest!
  startDate: DateTime
  waitingTime: Float!
}

type QuestRegistration {
  character: ID!
  registeredAt: DateTime
  title: String!
}

input AbandonQuestRequest {
  id: String!
  questId: String!
}

enum PushEventType {
  questCancelled
  questEnd
  streamerLive
  travelEnd
}
```

```graphql
type Mutation {
  abandonQuest(request: AbandonQuestRequest!): CommonResponse!
}
```

- `abandonQuest` è **owner-only** (nessun bypass innkeeper, come `acceptQuest`): `id` = personaggio, `questId` = quest della corsia standard; risponde `{ successful: true, response: "Missione abbandonata" }`.
- `arrivedAt`: arrivo sul marker (accettazione sul marker o arrivo del viaggio da quest); `startDate`: avvio della quest. `registeredAt`: istante della registrazione (assente sulle registrazioni precedenti al deploy finché lo sweep non le retrodata). Il marcatore di avvio della quest (`startedAt`) è interno e non compare nello schema.

**Nessuna riga rimossa (D-28).** Campi interni mai sul filo: il marcatore di quest conclusa e il riferimento di soccorso della aid restano solo a DB (il boot reale verifica che non compaiano nello schema).

**Documenti FE di esempio** (frammento completo del foglio esiti):

```graphql
fragment QuestResultSheet on QuestResult {
  id
  outcome
  resolvedAt
  character
  user
  quest { id type title }
  hpBefore
  hpAfter
  maxLifePoints
  injuriesAdded
  consumablesUsed { quantity item { ... on LootItem { id name rarity } ... on EquipmentItem { id name rarity } } }
  spellsUsed { usages spell { id name } }
  rewards { coins { gold silver copper } items { quantity item { ... on LootItem { id name rarity } ... on EquipmentItem { id name rarity } } } }
  xpBefore
  xpGained
  xpAfter
  levelBefore
  levelAfter
  titleBefore
  titleAfter
  spellLearned { id name }
  enemy { id name imagePath lifePoints xp }
  rescuedCharacters
}

subscription OnResult($characterId: String!) {
  questResultReceived(characterId: $characterId) { ...QuestResultSheet }
}

query Result($id: String!) {
  questResult(id: $id) { ...QuestResultSheet }
}
```

- Selezionare dell'`enemy` solo campi scalari (`id name imagePath lifePoints xp`, eventualmente `damages`): **non selezionare `locations`** (bug del modello `Enemy`, §14) né `relatedLore`/`spells` (non popolati sul risultato).
- `item` è la union `ItemUnion` (`LootItem` / `EquipmentItem`): selezionare con i frammenti inline già usati per l'inventario (né `LootItem` né `EquipmentItem` hanno `imagePath`).
- `quest` è una **fotografia** (`id`, `type`, `title`) presa all'esito: resta valida anche quando la quest sparisce dalla board.

---

## 2. Codici di rifiuto

Ogni rifiuto ha `errors[0].extensions` **esattamente** `{ "code": "<CODICE>" }` e un messaggio italiano. Il FE mappa il **codice**, mai il messaggio. Un rifiuto **non scrive nulla**.

| Codice | Messaggio | Operazioni | Quando | Azione FE |
|--------|-----------|------------|--------|-----------|
| `AWAITING_AID` | `Il tuo personaggio è in attesa di soccorso` | `startTravel`, `travelPreview`, `acceptQuest` | `status.awaitingAid` non nullo (anche se lo diventa fra lettura e scrittura) | disabilitare viaggio e board; mostrare lo stato "in attesa di soccorso" |
| `SHOP_NOT_IN_CITY` | `Il negozio è disponibile solo in città` | `doTransaction` (anche lo scambio vuoto) | `status.location` non è il `markerLocation` di una città, **oppure** `activeTravel` presente, **oppure** `awaitingAid` presente | banner del negozio; il FE resta il primo filtro (Phase 7 D-12) |
| `OUTCOME_NOT_PARTICIPANT` | `Il personaggio non partecipa a questa missione` | `completePendingRequest` | un override nomina un personaggio che non partecipa alla richiesta (o un `characterId` malformato) | ricaricare la coda; bug del pannello |
| `OUTCOME_OVERRIDE_INVALID` | `Esito non valido per questo personaggio` | `completePendingRequest` | `hpAfter` non intero o fuori da `1..maxLifePoints` (massimo **prima** della ricompensa), ferita fuori catalogo, consumi oltre il posseduto o non `LootItem`, magie non attive o usi oltre i residui, quantità/usi non interi ≥ 1, due override per lo stesso personaggio, più di 50 voci in `outcomes` o in `injuries`/`consumablesUsed`/`spellsUsed` di un override (controllato per primo, prima di `OUTCOME_NOT_PARTICIPANT`) | correggere il form; validare lato FE con gli stessi limiti |
| `NOT_FOUND` | `Risultato non trovato` | `questResult` | id malformato o inesistente (senza accesso al DB se malformato) | ignorare la push; nessun retry |
| `NOT_FOUND` | `Missione in attesa non trovata` | `completePendingRequest` | `pendingQuestId` malformato o inesistente, nessun personaggio attivo con quella PendingQuest in una corsia del GM, quest assente o della corsia standard, **oppure completamento concorrente perso** | ricaricare la coda (la voce è già sparita) |
| `NOT_FOUND` | `Missione non trovata` | `quest(id)`, `acceptQuest` | quest **conclusa** (sparita dalla board, D-06) oltre ai casi di Phase 7/8 | ricaricare la board |
| `NOT_FOUND` | `Personaggio non trovato` | `questResultReceived` e tutte le owner-only | personaggio inesistente o archiviato | flusso di creazione se `currentCharacter` è `null` |
| `FORBIDDEN` | `Questo risultato non ti appartiene` | `questResult` | il risultato è di un altro utente (**anche per l'innkeeper**: nessun bypass) | errore generico |
| `FORBIDDEN` | `Questo personaggio non ti appartiene` | `questResultReceived` | `characterId` non è il personaggio del chiamante (**anche per l'innkeeper**) | errore generico |
| `FORBIDDEN` | `Operazione riservata al locandiere` | `pendingRequests`, `pendingRequestsUpdated`, `completePendingRequest` | chiamante non innkeeper (alla subscribe: nessuno snapshot) | nascondere il pannello admin |
| `QUEST_NOT_WAITING` | `La missione non è in attesa del gruppo` | `abandonQuest` | la PendingQuest della corsia standard è già avviata (`startDate` valorizzato) o il personaggio è ancora in viaggio (`arrivedAt` nullo) | nascondere "Abbandona il gruppo" fuori dall'attesa; ricaricare il personaggio |
| `NOT_FOUND` | `Missione non trovata` | `abandonQuest` | nessuna corsia standard, oppure la PendingQuest della corsia è di un'altra quest (anche un abbandono concorrente già riuscito) | ricaricare il personaggio |
| `QUEST_FULL` | (Phase 7) | `acceptQuest` | **anche** quando la quest registrata è già avviata (piano 09-19): un posto liberato dopo l'avvio non fa entrare nessuno | ricaricare la board |
| `UNAUTHENTICATED` | `Authentication required` | tutte | nessun bearer valido | flusso di refresh/login esistente |

**Ordine di valutazione di `acceptQuest`** (emenda Phase 8 §2): guard e ownership come prima → pre-verifica: quest inesistente **o conclusa** `NOT_FOUND` → `QUEST_NOT_ACCEPTABLE` → personaggio `NOT_FOUND` → **`AWAITING_AID`** → `TRAVEL_IN_PROGRESS` → `QUEST_ALREADY_TAKEN` → `QUEST_TITLE_MISMATCH` → `QUEST_SLOT_BUSY` → `QUEST_FULL` → `QUEST_NOT_IN_CITY` → marker senza POI `QUEST_NOT_ACCEPTABLE`. In transazione (solo in corsa) il claim della corsia rinomina **`AWAITING_AID` prima di `TRAVEL_IN_PROGRESS`**; una quest registrata conclusa nel frattempo → `NOT_FOUND`.

**Ordine di valutazione di `startTravel` / `travelPreview`** (emenda Phase 8 §2, punto 4): `TRAVEL_DESTINATION_NOT_ALLOWED` → **`AWAITING_AID`** → `TRAVEL_IN_PROGRESS` → `QUEST_IN_PROGRESS` → `TRAVEL_SAME_LOCATION` → `TRAVEL_NO_PATH`; scrittura persa in corsa: `NOT_FOUND` → **`AWAITING_AID`** → `TRAVEL_IN_PROGRESS` → `QUEST_IN_PROGRESS` → `TRAVEL_IN_PROGRESS`.

**Ordine di valutazione di `doTransaction`:** id e quantità (`INVALID_QUANTITY`) → catalogo (`ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`) → cross-check del totale (`TRANSACTION_TOTAL_MISMATCH`) → personaggio (`NOT_FOUND`) → **città (`SHOP_NOT_IN_CITY`)** → possesso (`ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`) → fondi (`INSUFFICIENT_FUNDS`). Un articolo inesistente fuori città risponde quindi `ITEM_NOT_FOUND`, non `SHOP_NOT_IN_CITY`.

**Ordine di valutazione di `completePendingRequest`:** `UNAUTHENTICATED` → `FORBIDDEN` (non innkeeper) → `NOT_FOUND` (`Missione in attesa non trovata`) → override: `OUTCOME_NOT_PARTICIPANT` / `OUTCOME_OVERRIDE_INVALID` (validati prima della transazione e di nuovo sugli snapshot in sessione) → completamento concorrente perso: `NOT_FOUND`.

---

## 3. Foglio esiti (FE Phase 9)

> **Emendato dalla Phase 9.2 (2026-10-27):** «nessuno snapshot, nessuna lista» è superato: la lista dei non confermati (`unacknowledgedQuestResults`) e la conferma idempotente (`acknowledgeQuestResult`) consegnano ogni risultato anche ad app chiusa; ogni risultato nasce con la conferma nulla. La morte non porta più `currentCharacter` a `null`: lo stacco avviene alla conferma del risultato `death`. Vedi `.planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md` §0–§3.

**Semantica di `outcome`:**

| `outcome` | Chi lo riceve | Significato | Campi notevoli |
|-----------|---------------|-------------|----------------|
| `success` | il partecipante della corsia standard (combattimento vinto o quest senza nemico) e il **soccorritore** di una aid riuscita | quest completata | premi, XP, livello, titolo (story no: è `gmCompleted`), magia appresa (study); `rescuedCharacters` = id dei feriti liberati, solo sul risultato dei soccorritori (lista vuota altrove; un ferito scollegato non c'è) |
| `failure` | il partecipante che perde un combattimento (anche il soccorritore di una aid fallita) | **ferito in attesa di soccorso**: corsia standard svuotata, `status.awaitingAid` valorizzato, nasce — o già esiste per il gruppo — la aid "Soccorso: <titolo>" sulla board (una sola per combattimento perso) | `hpAfter` ≥ 1, ferite, consumi e magie usati; nessun premio, `xpGained` 0 |
| `rescued` | ogni **ferito** liberato da una aid riuscita | "sei stato salvato": `awaitingAid` = `null`, riportato al marker della città della aid, **nessuna cura** | valori prima = dopo, nessun premio; `quest` = la aid |
| `death` | ogni **ferito** della aid quando fallisce o scade il timeout (§6) | **morte**: personaggio archiviato, `currentCharacter` = `null` | valori prima = dopo (fotografia del defunto), nessun premio; `quest` = la aid |
| `gmCompleted` | ogni partecipante di una story o worldMission completata dal GM | completamento positivo deciso dal GM | premi e XP dal catalogo; HP/ferite/consumi/magie dagli override (senza override HP intatti, nessuna ferita); titolo successivo solo per la story del titolo esatto |

**Campi:**

- `hpBefore` / `hpAfter` / `maxLifePoints`: HP prima e dopo l'esito; `maxLifePoints` è il massimo **dopo** l'esito (cresce col livello, §7). `hpAfter` non scende mai sotto 1: il motore non uccide mai direttamente.
- `injuriesAdded`: solo le ferite nuove (le esistenti restano su `status.injuries`); `InjuryType` già sul filo → etichette leggibili lato FE (COMBAT-04).
- `consumablesUsed`: pozioni (`LootItem`) consumate; `spellsUsed`: magie usate con il numero di usi (una magia orfana di catalogo → `spell: null`, voce comunque presente).
- `rewards.coins` (monete accreditate) e `rewards.items` (premio fisso `prizeItem` + al massimo un oggetto del loot a cascata, §8). Voci di oggetti orfane scartate.
- `xpBefore`, `xpGained`, `xpAfter`: `xpGained` è il guadagno **effettivo** (`xpAfter − xpBefore`, al tetto di 50000 può essere minore del premio nominale). `levelBefore`/`levelAfter`, `titleBefore`/`titleAfter`.
- `spellLearned`: la magia imparata con una study (§7), altrimenti `null`.
- `enemy`: il nemico combattuto (popolato; orfano → `null`); `null` per le quest senza combattimento.
- `resolvedAt`: istante dell'esito; `user`: utente proprietario del risultato (resta valido dopo la morte).

**Consegna e coda (COMBAT-01, COMBAT-07):**

- **Più risultati possono arrivare insieme** (es. boss di gruppo, catena di soccorso, reconciler al boot): accodarli e mostrarli in ordine di `resolvedAt` nel momento sicuro.
- **Nessuno snapshot alla subscribe**: un risultato arrivato mentre l'app era chiusa si recupera dalla push (`data.id`) con `questResult(id)`. Non esiste (ancora) una lista dei risultati del personaggio (§14).
- La subscription filtra per **utente e personaggio del risultato**: se il FE era già iscritto, il risultato `death` arriva anche se nel frattempo il personaggio è stato archiviato. Una nuova subscribe sul personaggio morto risponde `NOT_FOUND`: usare la query.
- Lo stato del personaggio (HP, inventario, XP, corsie, `awaitingAid`) arriva come sempre su `characterUpdated`; il foglio esiti è un riepilogo, non la fonte dello stato.

**Flusso morte → creazione personaggio:** risultato `death` (subscription o push) → popup di morte con il foglio → `userUpdated` con `currentCharacter: null` → flusso di creazione personaggio esistente (Phase 02.1). L'ordine fra i due eventi non è garantito: il FE deve gestire `currentCharacter: null` anche prima del foglio.

**Flusso soccorso:** per ciascun ferito della aid, risultato `rescued` → "sei stato salvato" → `characterUpdated` con `awaitingAid: null` e la nuova `location` (marker della città della aid, nessun viaggio, nessuna push di viaggio).

---

## 4. Push questEnd

- **`data.id` = id del risultato** (`QuestResult.id`). **Emenda il handoff Phase 5 §2**, dove `id` era il pendingQuestId: a esito avvenuto la PendingQuest non esiste più. Al tap: `questResult(id: data.id)`.
- Payload invariato (Phase 5 §2): `type: "questEnd"`, `title: "Missione conclusa"`, `body: "La tua missione è terminata: scopri com'è andata."`, `sentAt`, `id`; TTL 1 h; data-only.
- **Una push per risultato**, all'utente del risultato: a ogni partecipante, al ferito liberato (`rescued`) e al **defunto** (`death`).
- Best-effort **dopo il commit**: mai su una transazione abortita; un fallimento del push non annulla l'esito.
- **Nessun tipo push nuovo** (il `combatResult` previsto in Phase 5 §8 non esiste) e **nessun toggle nuovo** lato FE.
- `sendTestPush(input: { type: questEnd, id: "<questResultId>" })` per la prova E2E.
- **Push `questCancelled` (piano 09-19):** party sciolto dopo 24 ore senza posti pieni, o soccorritori liberati alla scadenza del timeout della aid. `data.id` = **id della quest** (o della aid); `title: "Missione annullata"`, `body: "Il gruppo non si è formato in tempo: la missione è stata annullata."`, TTL 1 h, data-only, a ogni proprietario dei personaggi liberati, best-effort dopo il commit. Al tap: mappa. `sendTestPush(input: { type: questCancelled, id: "<questId>" })` per la prova.

---

## 5. Ciclo di vita degli esiti

- **Scadenza della corsia standard** = `PendingQuest.startDate + waitingTime`. Con `startDate: null` la scadenza non esiste ancora (personaggio in viaggio, o in attesa del gruppo).
- **Avvio (piano 09-19, utente 2026-10-25: "Per quanto riguarda le missioni boss: per poterle cominciare il party dev'essere al completo, quindi tutti restano in attesa. Lo stesso vale per le missioni aid legate a chi fallisce la missione boss."):** una quest registrata della corsia standard (boss, aid, enemy) comincia quando tutti i posti sono pieni e tutti sono sul marker; `PendingQuest.arrivedAt` = arrivo (accettazione sul marker o `endTime` pianificato del viaggio, D-13), `startDate` = avvio, uguale per tutto il party, = arrivo più tardo (default tecnico proposto all'utente, 2026-10-25); per hunt/dungeon/job/heal/study avvio = arrivo; story/worldMission invariate (`startDate` = accettazione). Una enemy ha un posto: comincia all'arrivo. Una quest avviata non accetta altre registrazioni (`QUEST_FULL`), e un posto liberato dopo l'avvio non la ferma (si combatte con chi resta). Fonte unica: `QuestStartService` (`src/quests/party/quest-start.service.ts`), chiamato dall'accettazione, dall'arrivo del viaggio e dallo sweep. Phase 8 §6 (countdown all'arrivo) va letto con questo emendamento.
- **Attesa (utente 2026-10-25: "bisogna dare la possibilità di abbandonare la quest boss durante il momento dell'attesa. Se entro 24 ore i posti non diventano pieni, allora la missione viene annullata in automatico per tutti. Il timer si cancella solo a party completo."):** `startDate` null e `arrivedAt` valorizzato = in attesa del gruppo (`registeredAdventurers` dice quanti sono); `abandonQuest` ammesso solo in questo stato (PendingQuest cancellata, corsia svuotata, posto liberato, nessun esito né rimborso); **24 ore** dalla prima registrazione del party corrente (`QuestRegistration.registeredAt`) senza posti pieni ⇒ party sciolto (corsie svuotate, PendingQuest cancellate, registrazioni azzerate, push `questCancelled`), quest ancora sulla board; chi era in viaggio arriva comunque, come viaggio da quest senza countdown. Un party pieno con un membro ancora in viaggio non scade. La finestra non si riavvia dopo un abbandono (default tecnico proposto all'utente, 2026-10-25). Trigger: job `party-timeout` (jobId `party-<questId>-<sinceMs>`) alla prima registrazione + sweep.
- **Contatore del party (piano 09-20, utente 2026-10-26: "il counter degli avventurieri mancanti deve aggiornarsi nel momento in cui qualcuno accetta la missione, non quando arriva sul marker."):** k = `registeredAdventurers.length` (accettazioni), N = somma dei `count` di `requiredAdventurers`; live via `questUpdated(questId)`: snapshot alla subscribe, un evento a ogni update della quest (registrazione, abbandono, scioglimento, avvio, posto liberato); una quest conclusa non emette più e una nuova subscribe risponde `NOT_FOUND`. Fonte: change stream su `quests` (`src/quests/quests.publisher.ts`), quest riletta con lo stesso populate della board; nessun publish manuale nei servizi. Ordine garantito (review 09-20): una sola rilettura alla volta per quest, quindi l'**ultimo evento riflette sempre lo stato più recente**; una raffica di update ravvicinati può arrivare come meno eventi (al più uno in corso e uno in coda), mai con uno stato vecchio per ultimo. Il FE sostituisce la quest a ogni evento senza confrontare versioni.
- **Trigger:** job Bull `resolve` sulla coda `quest-resolution` alla scadenza (jobId `quest-<pendingQuestId>-<startMs>`), accodato da `QuestStartService` quando scrive `startDate` (piano 09-19); **reconciler al boot** e **sweep periodico** ogni `QUEST_SWEEP_INTERVAL_MS` (default 60 000 ms). Job duplicati, obsoleti o in anticipo sono no-op; un job mancato è coperto dallo sweep entro un intervallo.
- **Quest senza nemico** (`infos.enemy` nullo: job, heal, study e qualunque altra) → **successo** con premi. Un ref `infos.enemy` **orfano** vale come quest senza nemico (WARN lato server con i soli id, C6).
- **Quest con nemico** → motore di combattimento (§11, regola **segnaposto**): esito unico del combattimento per chi combatte insieme (`success` o `failure`), effetti per partecipante.
- **heal** completata: tutte le ferite tolte e HP al massimo.
- **Boss di gruppo:** comincia a party completo (sopra) e si risolve quando **tutti i registrati** hanno finito il countdown, che è lo stesso per tutti. Un solo combattimento con tutti e **un solo verdetto** (se uno vince, vincono tutti — decisione utente 2026-10-25), **un risultato per ciascuno** diverso negli effetti (HP, ferite, consumi, loot, premi). Boss vinto → concluso per tutti; boss perso ⇒ tutti i posti liberati, quest di nuovo non avviata (un nuovo party può formarsi) e **una sola aid** con gli stessi posti del boss (decisioni dell'utente del 2026-10-25 e del 2026-10-26, piani 09-18 e 09-20).
- **Registrate (enemy, boss, worldMission, aid):** successo → la quest **sparisce dalla board per tutti** e non è più accettabile (`NOT_FOUND`); fallimento → posto liberato, quest di nuovo disponibile, nasce la aid. Una aid si conclude sempre (riuscita o fallita).
- **Ripetibili (hunt, dungeon e le altre non registrate):** restano sulla board; un fallimento con nemico crea comunque la aid per il ferito (un posto).
- **Story e worldMission** non sono mai risolte dal server: restano nella coda del GM finché non le completa (§9).
- **Effetti comuni:** corsia svuotata (`pendingQuest`/`activeStoryQuest`/`activeWorldMissionQuest` = `null`), PendingQuest eliminata, `completedQuests` cresce solo per chi vince, monete via wallet, inventario, magie, XP/livello/HP massimi, titolo, tutto in **una transazione** per esito. Dopo il commit: push `questEnd` e, per ogni uso di magia, un job `recover` sulla coda `spell-recovery` (gli usi tornano col `recoveryTime` della magia, come `useSpell`).
- La corsia standard svuotata **sblocca viaggio libero e teleport**; il ritorno in città dopo un successo resta un viaggio libero scelto dal giocatore.

---

## 6. Soccorso e morte

> **Emendato dalla Phase 9.2 (2026-10-27):** alla morte (aid fallita o timeout) il personaggio è archiviato ma resta `currentCharacter` del suo utente fino alla conferma del risultato `death`, che lo stacca nella stessa transazione; dopo l'avvio l'archivio non libera più i posti (segnaposto). Vedi `.planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md` §3 e §5.

- **`status.awaitingAid { quest, aidQuest, since }`**: `quest` = quest fallita, `aidQuest` = id della aid creata per il combattimento perso, **condiviso dai feriti dello stesso combattimento**, `since` = istante del fallimento. Default `null` (documenti legacy inclusi).
- Il ferito **resta sul marker** della quest con gli HP dell'esito; non può viaggiare, accettare quest né usare il negozio. **Il teleport del GM resta ammesso** (sposta il personaggio ma non lo libera: `awaitingAid` resta).
- **La aid:** una sola per combattimento perso, riferita a tutti i feriti (`rescue { characters, failedQuest }`, interno, mai sul filo) — utente 2026-10-25: "Non deve comparire una missione aid per ogni personaggio, ma solo una missione aid. Adesso che ci penso, le missioni aid per le missioni boss andate male devono accettare lo stesso numero di partecipanti della missione boss". Quest `type: aid`, titolo `"Soccorso: <titolo originale>"` (il prefisso non si raddoppia nelle catene), stesso marker, nemico, `minTitle`, `timeToComplete` e premi della quest originale, **gli stessi posti della quest fallita** (piano 09-20, utente 2026-10-26: "I posti della aid sono identici a quelli della missione da cui è nata."): `requiredAdventurers` copiato così com'è, slot di rango e jolly compresi; senza slot validi (hunt, dungeon, catalogo malformato) ⇒ `[{ title: null, count: 1 }]`, **gratuita** (`requiredPoints: null`), appare sulla board come le altre, mai ripetibile. Si risolve come il boss, con un solo combattimento e un solo verdetto, e **comincia con le stesse regole** (piano 09-19): party dei soccorritori completo e sul marker, 24 ore per riempire i posti — scaduto il termine il party dei soccorritori è sciolto con push `questCancelled` e la aid **resta aperta**, i feriti continuano ad attendere —, abbandono durante l'attesa.
- **Aid riuscita:** ogni soccorritore riceve premi e `success` con `rescuedCharacters`; ogni ferito riceve `rescued`, `awaitingAid` = `null`, **nessuna cura**, `status.location` = marker della città i cui `pointsOfInterest` contengono il marker della aid (se nessuna città lo contiene resta dov'è, WARN lato server).
- **Aid fallita:** tutti i feriti **muoiono** (archivio con `DeletionReason.death` nella **stessa transazione** dell'esito: posti liberati, `currentCharacter` = `null`) e ricevono `death`; i soccorritori diventano a loro volta feriti (`failure`) con **una** nuova aid clonata dalla quest **originale** (catena, stessi posti). Il claim della aid precede liberazioni e morti.
- **Ferito già scollegato** (es. l'utente punta a un altro personaggio): nessuna liberazione o morte da registrare, no-op loggato con i soli id.
- **Ferito cancellato:** tolto da `rescue.characters`; la aid resta aperta finché c'è qualcuno da soccorrere; senza più feriti è conclusa e un soccorritore già in corsia si risolve come individuale.
- **Timeout:** 7 giorni dal `since` più vecchio fra i feriti della aid senza esito → **morte** di **tutti** i feriti della aid (`death`, push a ogni defunto) e aid conclusa (lo sweep valuta ogni aid una volta sola). Trigger: job `aid-timeout` (jobId `aid-<aidQuestId>`) + reconciler + sweep.
  - **C5 rivista (piano 09-19, utente 2026-10-25: "Il timer si cancella solo a party completo."):** il timeout resta sospeso **solo dalla aid in corso** — avviata e con soccorritori registrati (`AID_TIMEOUT_NOT_IN_PROGRESS`, `aidTimeoutSuspended` in `src/quests/outcomes/aid/aid-timeout.ts`). Alla scadenza con party incompleto (o avviato ma svuotato dall'archivio) i feriti muoiono, la aid si conclude e i soccorritori registrati sono liberati (corsia e PendingQuest) con push `questCancelled`, senza un risultato. Test: `keeps the rescue timeout suspended only while the rescue is in progress (C5 rivista 2026-10-25)`, `releases an incomplete rescue party when the timeout expires`, `times out a started rescue whose rescuers were all archived`.
  - **Testo precedente (C5 confermata il 2026-10-25, superato da 09-19):** il timeout **non scatta finché la aid ha un soccorritore registrato** (il soccorso in corso decide l'esito; altrimenti il soccorritore combatterebbe per un ferito già morto); lo sweep ricontrolla a ogni giro; se il soccorritore sparisse il timeout torna valutabile. Lettura dell'utente: "Il timeout parte alla sconfitta dell'avventuriero. Quei 7 giorni sono i giorni in cui un altro avventuriero può accettare la quest aid. Se non accetta nessuno la quest prima dello scadere del timer, l'avventuriero muore, altrimenti il timeout viene cancellato" — la sospensione equivale alla cancellazione. Regola allora in `AID_TIMEOUT_REQUIRES_NO_RESCUER`, sostituita da `AID_TIMEOUT_NOT_IN_PROGRESS`.

---

## 7. Progressione

Tabella unica `LEVEL_TABLE` (`src/quests/outcomes/progression/level-table.ts`), unico scrittore di `level` e `maxLifePoints`:

| Livello | XP minima | HP massimi |
|---------|-----------|------------|
| 1 | 0 | 1000 |
| 2 | 250 | 1200 |
| 3 | 800 | 1600 |
| 4 | 1600 | 2250 |
| 5 | 2650 | 3050 |
| 6 | 3950 | 4100 |
| 7 | 5500 | 5300 |
| 8 | 7350 | 6750 |
| 9 | 9450 | 8400 |
| 10 | 11850 | 10250 |
| 11 | 14450 | 12300 |
| 12 | 17350 | 14550 |
| 13 | 20550 | 17000 |
| 14 | 23950 | 19700 |
| 15 | 27650 | 22550 |
| 16 | 31600 | 25650 |
| 17 | 35800 | 28900 |
| 18 | 40250 | 32400 |
| 19 | 45000 | 36100 |
| 20 | 50000 | 40000 |

- **XP massima 50000** (clamp); XP = `prizes.xpPrize` + `Enemy.xp` del nemico sconfitto (senza nemico solo `xpPrize`; combattimento perso: 0).
- **HP iniziali 1000** per i personaggi nuovi (`STARTING_LIFE_POINTS = LEVEL_TABLE[0].maxLifePoints`).
- **Nessuna cura al level up:** sale solo il massimo, `currentLifePoints` resta quello dell'esito (clamp fra 1 e il nuovo massimo).
- **Titolo:** avanza al successivo **solo completando la story del titolo esatto** (rookie → adventurer → paladin → mage → hero → legend; `legend` resta). Nessun avanzamento per XP.
- **Slot magia solo dal rango mage:** `maxActiveSpells` = 0 sotto `mage`; da `mage` in su le soglie XP di prima (20000 → 1, 25000 → 2, 30000 → 3, 40000 → 4). Sotto mage `equipSpell` risponde `MAX_ACTIVE_SPELLS_REACHED`.
- **Magie dalle study:** una `study` completata con `prizes.spell` e `status.xp ≥ spell.minXpToLearn` (XP valutata **dopo** il premio `xpPrize`) aggiunge la magia a `status.spells` se non già nota e il risultato porta `spellLearned`; altrimenti solo XP. Nessun controllo di città nel codice: il catalogo mette `prizes.spell` solo sulle study di Valantar. Una magia premio senza `minXpToLearn` numerico non si insegna mai.

---

## 8. Premi e loot

- **Monete:** `prizes.prizeCoins` → `Character.coins` via `WalletService` (unico scrittore dei saldi); in `rewards.coins`.
- **Premio fisso:** `prizes.prizeItem` → inventario (`ownedEquipments`/`ownedItems` per `itemType`, quantità intera); in `rewards.items`. Un item orfano è scartato.
- **Loot a cascata** (`prizes.randomLoot`, `rollLoot` in `src/quests/outcomes/rewards/cascading-loot.ts`): si parte dalla **rarità più alta presente** fra le voci, si tira con il drop rate di quella rarità; se il tiro fallisce si scende alla rarità inferiore presente; se riesce si estrae a caso una voce di quella rarità (quantità della voce). **Al massimo un oggetto**; se tutti i tiri falliscono nessun loot. **Rarità assente sull'item = `common`.**
- Drop rate (`DROP_RATES`, default tecnico **provvisorio**, §11):

| Rarità | Drop rate |
|--------|-----------|
| `legendary` | 2% |
| `ultrarare` | 5% |
| `rare` | 15% |
| `uncommon` | 35% |
| `common` | 60% |

- `rewards.items` = premio fisso + l'eventuale oggetto del loot; un fallito non riceve premi.

---

## 9. Coda e completamento del GM (FE Phase 10)

**Coda (BE-ADMIN-01, FE ADMIN-02):**

- `pendingRequests` (query) e `pendingRequestsUpdated` (subscription), **solo innkeeper**. La subscription emette uno **snapshot alla subscribe** e poi la **lista completa** a ogni inserimento/eliminazione di una PendingQuest (ricalcolo single-flight).
- **Una voce per personaggio** e per corsia GM (story o worldMission): una worldMission con tre registrati = tre voci con lo stesso `quest.id` (raggruppamento a discrezione del FE).
- `PendingRequest.id` = **id della PendingQuest** (va passato come `pendingQuestId`); `startDate` (null = in viaggio, in coda), `pointsSpent`; `quest { id type title requiredAdventurers registeredAdventurers }`; `character { id name title location activeTravel awaitingAid }`; `user { id twitchId }`.
- **Filtro FE su `character.activeTravel`** (ADMIN-02): il BE non filtra. I cambi di `activeTravel` del personaggio arrivano all'emissione successiva della coda o da `characterUpdated`/`characters` dell'innkeeper (il FE può incrociare per `character.id`).
- Ordine: `startDate` crescente, `null` in coda, poi id. Voci incomplete (PendingQuest, quest, utente o location mancanti) escluse con un WARN di soli id.

```graphql
subscription Queue {
  pendingRequestsUpdated {
    id startDate pointsSpent
    quest { id type title requiredAdventurers { title count } registeredAdventurers { character title } }
    character { id name title location activeTravel { endTime to } awaitingAid { since } }
    user { id twitchId }
  }
}
```

**Completamento (BE-ADMIN-02 emendato, FE ADMIN-03/05/06):**

- `completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]!`, **solo innkeeper**, **solo esito positivo** (nessun reject, nessun rimborso, nessun grade). Ritorna i risultati creati (uno per personaggio).
- **Story:** un solo personaggio (il titolare). **WorldMission:** **una chiamata chiude la richiesta per tutti i registrati** (tutti i personaggi attivi la cui corsia punta a una PendingQuest della stessa quest), un risultato `gmCompleted` per ciascuno, anche diversi; la worldMission **sparisce dalla board per tutti**.
- **Premi e XP dal catalogo** (anche `Enemy.xp` se la quest ha un nemico). **Senza override:** HP intatti, nessuna ferita, nessun consumo. **Con override** il GM racconta il combattimento della live: `hpAfter` (intero in `1..maxLifePoints`, se assente restano gli HP attuali), `injuries` (duplicati rimossi), `consumablesUsed` (`LootItem` entro il posseduto), `spellsUsed` (magie attive entro gli usi residui; il recupero parte come per `useSpell`).
- Una sola transazione per l'intera richiesta: due completamenti concorrenti → uno riesce, l'altro `NOT_FOUND`. Override non validi → nessuna scrittura (§2). Nessun blocco se il partecipante è in viaggio (il filtro è UX del pannello); l'esito non cambia la posizione.
- Effetti: corsia svuotata, `completedQuests`, titolo successivo per la story del titolo esatto, push `questEnd` a ciascuno.

Variabili di esempio:

```json
{ "input": { "pendingQuestId": "<pendingQuestId>" } }
```

```json
{
  "input": {
    "pendingQuestId": "<pendingQuestId>",
    "outcomes": [
      { "characterId": "<characterIdA>", "hpAfter": 650, "injuries": ["brokenLeftArm"], "consumablesUsed": [{ "item": "<lootItemId>", "quantity": 1 }] },
      { "characterId": "<characterIdB>", "spellsUsed": [{ "spell": "<spellId>", "usages": 1 }] }
    ]
  }
}
```

(seconda forma: worldMission con override per due personaggi; il terzo registrato senza override chiude con HP intatti.)

**Audit** automatico in `admin_audit_logs` (Phase 3): `action: 'completePendingRequest'`, `target: { type: 'QuestResult', id: null }`, la PendingQuest in `args.input.pendingQuestId`, esito `ok` o il codice del rifiuto.

**Teleport:** `teleportCharacter` è già pronto dalla Phase 8 (§7 di quel handoff): ammesso anche per un personaggio in attesa di soccorso, rifiutato con `QUEST_IN_PROGRESS` solo con una `pendingQuest`.

**Indicatore `awaitingAid`:** nella coda (`character.awaitingAid`) e su `characters`/`characterUpdated` (`status.awaitingAid`) per mostrare al GM i feriti.

**Emendamenti FE da fare nel discuss (lato FE, non in questo repo):** ADMIN-03 "approve or reject" → **solo completa** (nessun reject); ADMIN-05 "set the quest grade, select monsters, assign rewards" → **nessun grade**, mostri e premi sono dati di catalogo; il GM assegna solo override di HP, ferite, consumi e magie (ADMIN-06).

---

## 10. Negozio e viaggio (FE Phase 7)

- **`SHOP_NOT_IN_CITY` consegnato** (richiesta FE Phase 7 `BACKEND-NOTES.md` §2, accolta come D-18): `doTransaction` risponde solo con `status.location` = `markerLocation` di una città (un POI fra i `pointsOfInterest` **non basta**), senza `activeTravel` e senza `awaitingAid`; vale **anche per lo scambio vuoto**. Pre-verifica e riaffermazione nel filtro della scrittura. Il FE resta il primo filtro e mappa il codice nel banner.
- **`AWAITING_AID`** su `startTravel`, `travelPreview` e `acceptQuest` (§2 per l'ordine): il FE disabilita viaggio e board quando `status.awaitingAid` non è nullo.
- **Rallentamento da ferite:** ogni viaggio (libero e da quest) moltiplica la velocità per il fattore delle ferite (`travelSpeedFactorOf`, valore **segnaposto**, §11), fotografato alla partenza come il pet: es. una gamba rotta → velocità × 0,8 (durata × 1,25); due gambe mancanti → × 0,64. La durata della preview lo include già.
- **Board:** le quest concluse non compaiono più in `quests`/`quest(id)` (`NOT_FOUND`); le aid "Soccorso: …" compaiono come quest `aid`.
- **Attesa del gruppo (piano 09-19; FE Phase 6/7, **in corso sul branch FE `feat/party-waiting`**):** `startDate == null && arrivedAt != null` ⇒ "In attesa del gruppo (k/N)"; pulsante "Abbandona il gruppo" (`abandonQuest`) solo in quello stato; `characterUpdated` con `pendingQuest: null` senza esito (party sciolto); push `questCancelled` (tap ⇒ mappa). `registeredAt` e `arrivedAt` sono additivi.
- **Contatore del party live (piano 09-20):** mentre la corsia è in attesa del gruppo iscriversi a `questUpdated(quest.id)` e aggiornare la quest nella lista; alla partenza o allo svuotamento della corsia disiscriversi; il FE non deve più rileggere la lista per il contatore (k/N in §5).

---

## 11. Regole segnaposto

**PROVVISORIE:** la formula del combattimento e le regole delle ferite sono dell'utente (D-02) e arriveranno dopo. Tutto ciò che è "formula" vive in due soli file (`grep -rlE "PROVVISORIO|SEGNAPOSTO" src` = `placeholder-combat-resolver.ts`, `injury-rules.ts` più la descrizione della spec del resolver); ciclo di vita, applicazione, consegna e test di contratto non cambiano quando si sostituiscono.

| Cosa | Dove | Valore attuale | Come sostituirlo |
|------|------|----------------|------------------|
| Regola del combattimento | `src/quests/outcomes/combat/placeholder-combat-resolver.ts` (`PlaceholderCombatResolver`, `PLACEHOLDER_RULES`) | probabilità di vittoria tirata **una volta per combattimento** = potenza del gruppo (danni di equipaggiamento indossato + magie attive con usi, × `damageFactor` delle ferite) / (potenza + HP del nemico); HP persi = danni del nemico divisi fra i partecipanti (× 0,5 in vittoria, × 1 in sconfitta, / `lifePointsFactor`), mai sotto 1; ferita nuova al 20%; pozione heal sotto il 30% degli HP; una carica per ogni magia attiva con usi | scrivere un'altra classe che estende `CombatResolver` (`src/quests/outcomes/combat/combat-resolver.ts`: contesto puro idratato → `CombatResolution` (un `verdict` per il combattimento + un `ParticipantEffects` per partecipante, `hpAfter ≥ 1`), RNG solo dal `ChanceSource` iniettato) e cambiare il provider `{ provide: CombatResolver, useClass: … }` in `src/quests/outcomes/quest-outcomes.module.ts` |
| Ferite → effetti → malus e fattore di viaggio | `src/quests/outcomes/injuries/injury-rules.ts` (`INJURY_EFFECTS`, `EFFECT_MODIFIERS`, `MIN_INJURY_FACTOR`) | 28 ferite → 10 effetti → `{ damageFactor, lifePointsFactor, speedFactor }` (es. `movementImpairment` velocità 0,8, `paralysis` danni 0,8 e velocità 0,9), prodotto con minimo 0,1 | cambiare le tabelle (le funzioni `injuryModifiersOf` / `travelSpeedFactorOf` restano) |
| Drop rate del loot | `src/quests/outcomes/rewards/cascading-loot.ts` (`DROP_RATES`) | legendary 0,02 · ultrarare 0,05 · rare 0,15 · uncommon 0,35 · common 0,6 | cambiare i valori |

Testi italiani dei quattro codici nuovi (A1): `src/gameRules/game-rule.exception.ts`; cambiarli non cambia il contratto (il FE mappa il codice).

---

## 12. Dati a DB per la UAT (da preparare a mano dopo il deploy)

**Nessuna migrazione e nessun seed (D-29):** i documenti legacy leggono i default (`awaitingAid: null`, quest non concluse, `prizes.spell: null`). Comandi `mongosh` con soli placeholder (`<…>`); gli id reali si leggono con le `find` indicate.

**(a) HP dei personaggi esistenti alla scala nuova** (i personaggi creati prima della fase hanno 100 HP). Allinea livello e massimo alla tabella di §7 partendo dall'XP; gli HP attuali restano quelli che sono (clamp a 1..max), oppure si portano al massimo con la seconda riga:

```js
const LEVELS = [[0,1000],[250,1200],[800,1600],[1600,2250],[2650,3050],[3950,4100],[5500,5300],[7350,6750],[9450,8400],[11850,10250],[14450,12300],[17350,14550],[20550,17000],[23950,19700],[27650,22550],[31600,25650],[35800,28900],[40250,32400],[45000,36100],[50000,40000]];
db.characters.find({ deletedAt: null }).forEach((c) => { const xp = Math.min(50000, c.status.xp ?? 0); let level = 1, max = 1000; LEVELS.forEach(([minXp, hp], i) => { if (xp >= minXp) { level = i + 1; max = hp; } }); const hp = Math.min(max, Math.max(1, c.status.currentLifePoints ?? max)); db.characters.updateOne({ _id: c._id }, { $set: { 'status.xp': xp, 'status.level': level, 'status.maxLifePoints': max, 'status.currentLifePoints': hp } }); });
// opzionale, per partire a HP pieni:
db.characters.updateMany({ deletedAt: null }, [{ $set: { 'status.currentLifePoints': '$status.maxLifePoints' } }])
```

**(b) Nemici riscalati** (il nemico di sviluppo è alla scala vecchia: 100 HP, 25 xp):

```js
db.enemies.find({}, { name: 1, lifePoints: 1, xp: 1, damages: 1 })
db.enemies.updateOne({ _id: ObjectId('<enemyId>') }, { $set: { lifePoints: 1000, xp: 100, 'damages.base': [{ type: 'cut', power: 100 }] } })
```

(`damages.base[].type` ∈ `blunt | cut | pierce`; `damages.energy` invariato. Non scrivere `locations` come array finché il bug del modello non è corretto, §14.)

**(c) I 2 ref `infos.enemy` orfani** (sul DB di sviluppo 3 quest hanno `infos.enemy`: 1 risolvibile, 2 orfani; oggi valgono come quest senza nemico, con WARN):

```js
db.quests.find({ 'infos.enemy': { $ne: null } }, { 'infos.title': 1, 'infos.type': 1, 'infos.enemy': 1 }).forEach((q) => { if (!db.enemies.findOne({ _id: q.infos.enemy })) print('orfano:', q._id, q.infos.type); })
db.quests.updateOne({ _id: ObjectId('<questId>') }, { $set: { 'infos.enemy': ObjectId('<enemyId>') } })   // con un nemico esistente
db.quests.updateOne({ _id: ObjectId('<questId>') }, { $set: { 'infos.enemy': null } })                  // oppure senza nemico
```

**(d) Una study a Valantar con `prizes.spell`** (oggi 0 study a Valantar e 0 `prizes.spell`):

```js
db.cities.findOne({ name: 'Valantar' }, { markerLocation: 1, pointsOfInterest: 1 })
db.spells.find({}, { name: 1, minXpToLearn: 1 }).sort({ minXpToLearn: 1 }).limit(5)
db.quests.updateOne({ _id: ObjectId('<studyId>') }, { $set: { 'infos.markerLocation': ObjectId('<poiDiValantar>'), 'prizes.spell': ObjectId('<spellId>') } })
```

Il marker deve essere uno dei `pointsOfInterest` di Valantar (QUEST_NOT_IN_CITY altrimenti). Per vedere `spellLearned` il personaggio deve avere `status.xp + xpPrize ≥ minXpToLearn` (sul DB di sviluppo `minXpToLearn` va da 4000 a 50000); per equipaggiarla deve essere almeno `mage` (§7).

**(e) Rarità sugli item:** già presenti su tutti gli item di sviluppo (loot: common 41, uncommon 28, rare 9, ultrarare 5, **nessun loot `legendary`**; equipaggiamenti con tutte le rarità). Un item senza `rarity` vale `common`. Per provare la cascata mettere nel `randomLoot` di una quest voci di rarità diverse (`{ itemType: 'LootItem' | 'EquipmentItem', item: ObjectId('<itemId>'), quantity: 1 }`).

**(f) Una quest per tipo e `prizes.xpPrize`:** il DB di sviluppo ha già una quest per tipo (`hunt`, `boss`, `aid`, `heal`, `worldMission`, `crime`, `dungeon`, `guard`, `enemy`, `job`, `study`, due `story`); `xpPrize` è su 11/13. I documenti d'esempio completi per tipo sono in Phase 8 `BACKEND-NOTES.md` §10. Per il combattimento servono `boss`/`enemy`/`hunt` con un `infos.enemy` valido (c); per provare l'avanzamento di titolo serve una story con `requirements.minTitle` = titolo del personaggio.

```js
db.quests.find({ 'prizes.xpPrize': null }, { 'infos.title': 1, 'infos.type': 1 })
db.quests.updateOne({ _id: ObjectId('<questId>') }, { $set: { 'prizes.xpPrize': 50 } })
```

**(g) Primo boot dopo il deploy:** il personaggio di sviluppo ha tre corsie occupate e scadute. Il **reconciler** risolve subito la corsia standard (`job`, senza nemico) → successo, premi, push `questEnd`; story e worldMission compaiono nella **coda del GM** (§9) e restano lì finché non vengono completate.

**(h) Provare il timeout di soccorso** senza aspettare 7 giorni: con un personaggio in attesa di soccorso e la sua aid **non in corso** (nessun soccorritore, oppure un party di soccorritori incompleto: alla scadenza i soccorritori sono liberati con push `questCancelled`; C5 rivista, piano 09-19), retrodatare `since` di ogni ferito della aid e attendere lo sweep (≤ 60 s con il default):

```js
db.characters.updateMany({ _id: { $in: [ObjectId('<characterId>'), ObjectId('<otherCharacterId>')] } }, { $set: { 'status.awaitingAid.since': new Date(Date.now() - 7 * 24 * 3600 * 1000 - 60000) } })
```

**(i) Provare l'attesa del gruppo** (piano 09-19): un boss a 2 posti (`requirements.requiredAdventurers: [{ title: null, count: 2 }]`) accettato da un solo personaggio sul marker ⇒ la sua PendingQuest ha `arrivedAt` valorizzato e `startDate: null`; registrare il secondo personaggio sul marker ⇒ `startDate` uguale per entrambi (= arrivo più tardo) e countdown in corso.

```js
db.pendingquests.find({ quest: ObjectId('<bossId>') }, { arrivedAt: 1, startDate: 1 })
```

**(j) Provare lo scioglimento a 24 ore:** con un party incompleto in attesa, retrodatare `registeredAt` delle registrazioni e attendere lo sweep (≤ 60 s): corsie svuotate, PendingQuest cancellate, registrazioni azzerate, push `questCancelled`.

```js
db.quests.updateOne({ _id: ObjectId('<bossId>') }, { $set: { 'registeredAdventurers.$[].registeredAt': new Date(Date.now() - 24 * 3600 * 1000 - 60000) } })
```

---

## 13. Checklist UAT differita (FE Phase 9/10)

1. **Foreground:** accettare una `job` vicina; allo scadere del countdown il foglio esiti appare dalla subscription (`success`, premi, XP).
2. **Background:** app in background allo scadere; push "Missione conclusa"; al tap il foglio si apre da `questResult(data.id)`.
3. **Coda di più risultati:** boss con due personaggi (o reconciler al boot con più scadenze): i fogli si mostrano uno dopo l'altro, senza interrompere un modal (COMBAT-07), dismiss solo col tap (COMBAT-06).
4. **Fallimento:** combattimento perso → `failure`, `awaitingAid` valorizzato, viaggio/board/negozio bloccati (`AWAITING_AID`, `SHOP_NOT_IN_CITY`), aid "Soccorso: …" sulla board.
5. **Soccorso:** uno o più personaggi vincono la aid → ogni soccorritore `success` con `rescuedCharacters`, ogni ferito `rescued` e riportato in città; con un boss perso da più personaggi la aid è una sola, con i posti del boss, e comincia solo quando i posti dei soccorritori sono pieni (09-19).
6. **Morte:** la aid fallisce (o timeout, §12 h) → `death`, popup di morte, `currentCharacter: null`, flusso di creazione personaggio.
7. **Study a Valantar** con `prizes.spell` → `spellLearned` sul foglio.
8. **Coda del GM live** (FE Phase 10): accettare una story e una worldMission con due personaggi → voci nella coda in tempo reale; filtro su `activeTravel`.
9. **Completamento:** story senza override (titolo successivo se è la story del titolo esatto); worldMission con override diversi per personaggio → risultati diversi, quest sparita dalla board per tutti; override su un personaggio non registrato → `OUTCOME_NOT_PARTICIPANT`, `hpAfter: 0` → `OUTCOME_OVERRIDE_INVALID`.
10. **Teleport** di un personaggio in attesa di soccorso: spostato, ancora in attesa.
11. **FE Phase 7:** `doTransaction` dal POI di una quest o in viaggio → banner `SHOP_NOT_IN_CITY`.
12. **Attesa del gruppo (09-19):** boss a 2 posti con un solo registrato ⇒ "In attesa del gruppo (1/2)", nessun countdown; il secondo registrato sul marker ⇒ countdown uguale per entrambi (§12 i).
13. **Abbandono:** dall'attesa "Abbandona il gruppo" ⇒ corsia libera, posto liberato, nessun foglio; in viaggio o dopo l'avvio ⇒ `QUEST_NOT_WAITING`.
14. **Scioglimento a 24 ore:** §12 j ⇒ push "Missione annullata", corsia libera, quest ancora sulla board.

---

## 14. Note per la BE Phase 10

> **Emendato dalla Phase 9.2 (2026-10-27):** la lista `questResults` resta YAGNI, ma la lista dei non confermati dell'utente esiste, con l'indice `quest_result_unacknowledged` su `questresults`. Vedi `.planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md` §6 e §10.

- **Indici** per lo sweep e le letture, se i volumi crescono (oggi scansione accettabile): `pendingquests.startDate`, `characters.status.awaitingAid.since`, `questresults.user` / `questresults.character`; dal piano 09-19 anche le query dello sweep sui party (`pendingquests.arrivedAt`, `quests.startedAt` con `infos.type`, `registeredAdventurers.registeredAt`).
- **Validazione input** GraphQL (`ValidationPipe` / class-validator): oggi `CompletePendingRequestInput` è validato a mano in `src/quests/outcomes/gm-overrides.ts`.
- **Ritipizzazione dei ref `Mixed`** (`PendingQuest.quest`, `User.currentCharacter`, `QuestInfos.enemy`, `status.location`, `quests.*`) a `MongooseSchema.Types.ObjectId`: oggi letti con `refIdOf`/`idForms`.
- **Bug `Enemy.locations`** (`deferred-items.md`, 09-04): `src/models/enemy.model.ts` dichiara `@Prop({ type: String, enum: Object.values(PoiType) })` mentre TS e GraphQL vogliono `[PoiType]`; un array fallisce il cast e un valore stringa romperebbe il campo lista sul filo. Fix atteso: `@Prop({ type: [String], enum: Object.values(PoiType), default: [] })` (file non Prettier-clean: commit `style(...)` separato prima). Fino ad allora il FE non seleziona `enemy.locations`.
- **Flaky del boot reale** (`deferred-items.md`, 09-14): `global auth guard › rejects an existing query without a bearer or with a forged one` è fallito una volta su cinque run in 09-14; **non riprodotto** nel gate 09-16 (suite completa + due run isolati del boot reale, 43/43). Ipotesi da verificare se ricompare: concorrenza con il reconciler al boot, mai atteso, su DB vuoto.
- **Lista `questResults`** del personaggio (storico dei fogli): non necessaria oggi (YAGNI), eventuale.
- `Enemy.spells` / `relatedLore` non popolati sul risultato: se il FE li vorrà, aggiungerli a `QUEST_RESULT_POPULATE`.

---

## 15. Deploy

> **Emendato dalla Phase 9.1 (2026-10-27):** i job `recover` degli esiti portano `dueAt` e un `jobId` deterministico; gli usi spesi negli esiti sono istanti in `status.spellStates`, restituiti anche dallo sweep.

- **Variabile nuova, opzionale:** `QUEST_SWEEP_INTERVAL_MS` (già in `.env.example`, vuota = 60 000 ms; `0` spegne lo sweep periodico, il reconciler al boot gira sempre; valore malformato → boot rifiutato). Non è un segreto. In produzione tenere lo sweep attivo.
- **Coda Redis nuova:** `bull:quest-resolution:*` (job `resolve`, `aid-timeout` e, dal piano 09-19, `party-timeout`); job `recover` aggiuntivi su `bull:spell-recovery:*` per le magie usate negli esiti.
- **Redis in produzione:** verificare la **`maxmemory-policy`** (blocker in STATE): con una policy di eviction i delayed job possono sparire; reconciler e sweep li compensano. Consigliata `noeviction`.
- **Redis giù:** accettazione e arrivo vanno a buon fine comunque (timeout di coda 2 s, WARN); gli esiti arrivano con lo sweep.
- **Nessuna migrazione** (D-29): dati a mano, §12. **Nessuna dipendenza nuova**, **nessun indice nuovo**.
- Collection nuova `questresults` (creata da Mongoose all'avvio).
- Moduli: `QuestOutcomesModule` (risoluzione, processor, sweeper, porte `CombatResolver`/`ChanceSource`) montato in `AppModule` prima di `QuestResultsModule`; `PendingRequestsModule` (coda e completamento).

---

## 16. Deviazioni e punti aperti

> **Emendato dalla Phase 9.2 (2026-10-27):** il punto delle quest avviate con posti liberati dall'archivio è chiuso dalla regola del segnaposto («Il BE non libera i posti delle quest avviate», utente 2026-10-27). Vedi `.planning/phases/09.2-quest-result-delivery-contract/BACKEND-NOTES.md` §5.

**Deviazioni registrate nei SUMMARY 09-01..09-15, 09-17 e 09-18** (nessuna cambia il contratto o una decisione utente):

- 09-01: commento dell'enum riformulato (grep); `characters.service.spec.ts` con `title: 'mage'` per il gate degli slot; `QuestPrizesInput.spell` aggiunto ma non stampato (input non referenziato).
- 09-02: nessuna deviazione.
- 09-03: nessuna deviazione.
- 09-04: orfani di catalogo esclusi dal contesto di combattimento; fixture `Enemy` senza `locations` (bug del modello in `deferred-items.md`); un subject di 73 caratteri.
- 09-05: `xpGained` sul foglio = guadagno effettivo dopo il clamp.
- 09-06: `QuestResultsModule` registra anche il modello per il publisher; nemico del test senza `locations`.
- 09-07: ref `Mixed` letti in entrambe le forme; voce con location illeggibile saltata.
- 09-08: rapporto delle durate del viaggio ferito confrontato al millisecondo; due subject oltre 72 caratteri.
- 09-09: `archived-character-visibility.int-spec.ts` invariato (il `NOT_FOUND` precede la guard).
- 09-10: commento senza il letterale NOW di Mongo; import relativi nelle spec; testo del WARN di viaggio conservato.
- 09-11: export di `CharacterDeletionService` rimosso (la morte passa da `CharacterArchiveModule`).
- 09-12: chiamata al resolver estratta in un metodo (grep); harness condiviso in `test/quests/outcome-world.ts`.
- 09-13: piano per combattente condiviso in `combatant-plan.ts`; `$pull` degli incoerenti come opzione di `questUpdateOf`; **un solo punto di morte** (`dieWithin` → `archiveWithin`) per aid fallita e timeout.
- 09-14: helper di harness esportati; flaky del boot reale annotato (§14).
- 09-15: tempi di recupero delle magie degli override letti con `recoveryTimesOf` (senza, gli usi non sarebbero mai tornati); override più severi (ferite fuori catalogo, `hpAfter` negativo); audit `outcome: 'ok'`.
- 09-17: porta ridisegnata (CombatResolution, verdetto unico A3), fake con willEnd, C5 marcata confermata; nessun cambiamento di SDL.
- 09-19: vedi la riga 09-19 qui sotto e `09-19-SUMMARY.md`.
- 09-20: vedi `09-20-SUMMARY.md` (posti della aid identici all'originale, subscription `questUpdated`).
- 09-18: una sola aid per combattimento perso (rescue.characters, posti = posti della quest fallita), soccorso di gruppo sul roster condiviso, rescuedCharacters nel risultato (SDL additivo vs develop). La aid vecchia di un soccorso fallito conserva `rescue.characters` come storico (il claim la conclude prima che l'archivio passi); `quest-outcome-fields.schema.spec.ts` aggiornato fuori dalla lista del piano.

**Decisioni dell'utente (2026-10-25):** avvio a party completo, abbandono durante l'attesa, 24 ore per riempire i posti, timer della aid sospeso solo a party completo (piano 09-19, §5/§6: "Per quanto riguarda le missioni boss: per poterle cominciare il party dev'essere al completo, quindi tutti restano in attesa. Lo stesso vale per le missioni aid legate a chi fallisce la missione boss." e "bisogna dare la possibilità di abbandonare la quest boss durante il momento dell'attesa. Se entro 24 ore i posti non diventano pieni, allora la missione viene annullata in automatico per tutti. Il timer si cancella solo a party completo."); C5 confermata e poi rivista da 09-19 (§6); A3 corretta — verdetto unico del combattimento (§5, piano 09-17); A2 — i valori segnaposto (§11) restano **provvisori**: li definirà l'utente ("I valori segnaposto verranno risolti da me in futuro.").

**Decisioni dell'utente (2026-10-26, piano 09-20):** posti della aid identici a quelli della quest fallita ("I posti della aid sono identici a quelli della missione da cui è nata."; il default di 09-18 con i posti jolly è superato); contatore del party live via `questUpdated(questId)` ("il counter degli avventurieri mancanti deve aggiornarsi nel momento in cui qualcuno accetta la missione, non quando arriva sul marker.").

**Riga 09-19 (avvio a party completo):** `QuestStartService` unico scrittore di `startDate` della corsia standard, `arrivedAt`/`registeredAt` sul filo, `startedAt` interno, `abandonQuest`, job `party-timeout` e scioglimento, push `questCancelled`, C5 rivista, archivio che azzera `startedAt` a roster vuoto. Default tecnici proposti all'utente il 2026-10-25: `startDate` = arrivo più tardo; abbandono solo sul marker (confermato dall'utente il 2026-10-26: "L'abbandono solo sul marker mi va bene."); finestra ancorata alla registrazione più vecchia, non riavviata dopo un abbandono, legacy retrodatate a `now` una volta; party pieno con un membro in viaggio non scade; posto liberato dopo l'avvio non ferma la quest; arrivo dopo uno scioglimento senza countdown; `tryStart` su quest inesistente ⇒ WARN con soli id.
- **Query dello sweep non indicizzate:** indici differiti alla Phase 10 (§14). Candidati dalla review 09-17/18/19 (IN-15): `characters { deletedAt: 1, 'quests.pendingQuest': 1 }`, `characters { deletedAt: 1, 'status.awaitingAid.since': 1 }`, `quests { 'infos.type': 1, concludedAt: 1, startedAt: 1 }`, `quests { 'registeredAdventurers.character': 1 }` (archivio), `pendingquests { quest: 1, startDate: 1, arrivedAt: 1 }`; da decidere se il backfill di `registeredAt` resti in ogni tick o giri una volta dopo il deploy.
- **Nota di deploy:** i party in volo prima di 09-19 (membri con `startDate` scritto e `startedAt` nullo) vanno ripuliti a mano con mongosh o allineati con `startedAt = max(startDate)` — lo scioglimento a 24 h non tocca le corsie dei membri con `startDate` scritto.
- **La board mostra ancora le quest avviate con posti liberi:** l'accettazione risponde `QUEST_FULL` — nascondere le avviate è un follow-up FE/BE.

**Ancora aperti:**

- **A1** — testi italiani dei codici nuovi (§2).
- UAT su device dopo la FE Phase 9/10 (§12, §13; vedi `09-VALIDATION.md`, Manual-Only Verifications).
