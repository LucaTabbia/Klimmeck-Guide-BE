# BACKEND-NOTES — Phase 4 Integrità Economica (Atomics) (handoff per FE e fasi BE successive)

- **Fase BE:** 04-integrita-economica-atomics (requisiti BE-ATOM-01, BE-ATOM-02, BE-ATOM-03, BE-ATOM-04, BE-ATOM-05; decisioni D-01..D-20 in `04-CONTEXT.md`)
- **Data:** 2026-10-18. Documento finale di fine fase.
- **Branch:** `feat/04-integrita-economica-atomics` (PR verso `develop`). **Nessuna dipendenza da una PR FE** (D-20): la PR BE si fonde in autonomia, perché il contratto GraphQL non cambia.
- **Schema:** `src/schema.gql` **non cambia in questa fase**. L'ultimo commit che lo modifica resta `eff8485` (Phase 3.1). Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code develop -- src/schema.gql` esce 0. **Lo schema vince su questo documento.**
- **Stato:** implementato e coperto da integration test sul replica set (41 suite / 472 test di integrazione, 54 suite / 625 unit). Moduli nuovi: `EconomyModule` (`src/economy/`, importato da `CharactersModule`) e `QuestAcceptanceModule` (`src/quests/acceptance/`, montato in `AppModule` senza resolver).
- **Consumatori:** FE di oggi (shop: `doTransaction`; equip: `equipItem`, `equipSpell`, `unequipSpell`), FE Phase 8 (magie: `useSpell`, codici `SPELL_*`), FE Phase 6 (quest: codici di accettazione, quando la BE Phase 7 esporrà la mutation); BE Phase 6/7/8/9 (primitive `WalletService` e `QuestAcceptanceService`).
- **Fonte:** ogni nome qui sotto (operazioni, codici, messaggi, firme) è copiato dal codice: `src/schema.gql`, `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/authz/resource-not-found.exception.ts`, `src/economy/**`, `src/quests/acceptance/**`, `src/characters/characters.service.ts`, `src/characters/spells/active-spell.updates.ts`, `src/characters/equipment/equip-item.updates.ts`, `src/characters/spell-recovery.processor.ts`.

---

## 0. TL;DR per il FE

1. **Nessun documento GraphQL del FE cambia.** Stesse mutation, stessi argomenti, stessi input e stessa risposta `CommonResponse { response successful }`. I documenti in `lib/graphql/mutations/character_mutations.dart` restano validi così come sono.
2. **Il BE prezza dal catalogo.** In `doTransaction` il prezzo lo decide il BE (`buyPrice`/`sellPrice` del catalogo). `total` + `isTotalPositive` inviati dal client servono solo come **controllo incrociato**.
3. **`TRANSACTION_TOTAL_MISMATCH` → mostrare l'errore e ricaricare il catalogo.** Vuol dire che il FE ha prezzato con un catalogo stantio: dopo il refetch dei prezzi l'utente può riprovare.
4. **`EquipSpellRequest.usages` è ignorato** (deprecato). Gli usages iniziali di una magia equipaggiata sono sempre `spell.maxUsages` del catalogo. Il campo resta nello schema per compatibilità; il FE Phase 8 smetta di inviarlo.
5. **`unequipSpell` su una magia non attiva risponde `SPELL_NOT_ACTIVE`** (prima `NOT_FOUND`).
6. **Ogni rifiuto ha un `extensions.code` stabile e un messaggio in italiano** (§2). Il FE mappa il codice, mai il messaggio. `errors[0].extensions` è esattamente `{ "code": "<CODICE>" }`.
7. **`characterUpdated` continua a portare il nuovo stato** dopo ogni scrittura riuscita: il change stream emette anche sugli update condizionali. Un rifiuto non scrive nulla e quindi non emette nulla.

---

## 1. Contratto (invariato)

SDL verbatim da `src/schema.gql` (invariato rispetto a `develop`, ultimo commit che lo tocca `eff8485`).

```graphql
type Mutation {
  ...
  doTransaction(request: TransactionRequest!): CommonResponse!
  equipItem(request: EquipItemRequest!): CommonResponse!
  equipSpell(request: EquipSpellRequest!): CommonResponse!
  ...
  unequipSpell(request: EquipSpellRequest!): CommonResponse!
  useSpell(request: UseSpellRequest!): CommonResponse!
  ...
}
```

```graphql
input TransactionRequest {
  boughtItems: TransactionItems!
  id: String!
  isTotalPositive: Boolean!
  soldItems: TransactionItems!
  total: CoinsInput!
}

input TransactionItems {
  equipAssets: [AssetQuantityInput!]!
  lootAssets: [AssetQuantityInput!]!
}

input AssetQuantityInput {
  item: ID
  quantity: Int!
}

input CoinsInput {
  copper: Int!
  gold: Int!
  silver: Int!
}

input EquipSpellRequest {
  id: String!
  spellId: String!
  usages: Int
}

input EquipItemRequest {
  id: String!
  itemId: String
  slotType: SlotType!
}

input UseSpellRequest {
  characterId: String!
  spellId: String!
}

type CommonResponse {
  response: String!
  successful: Boolean!
}
```

Le cinque mutation restano sotto `@OwnsCharacter` (Phase 3): owner o `innkeeper`, altrimenti `FORBIDDEN`. Nessun `registerEnumType`: i codici della §2 viaggiano solo in `extensions.code` e non compaiono nello schema.

### Esempio di rifiuto

```json
{"errors":[{"message":"Il totale non corrisponde ai prezzi attuali del negozio","path":["doTransaction"],"extensions":{"code":"TRANSACTION_TOTAL_MISMATCH"}}],"data":null}
```

---

## 2. Codici d'errore

I 15 codici di `GameRuleErrorCode` (HTTP 400, `GameRuleException`) più quelli invariati di Phase 2/3. I messaggi sono copiati da `src/gameRules/game-rule.exception.ts` e `src/authz/resource-not-found.exception.ts`.

| Codice | Mutation / primitiva | Quando | Messaggio | Azione FE |
|---|---|---|---|---|
| `INSUFFICIENT_FUNDS` | `doTransaction`; `WalletService.applyCharacterCoinsDelta`; `QuestAcceptanceService.accept` | il netto dello scambio (o il costo della quest) supera il rame posseduto | `Monete insufficienti` | messaggio non bloccante; il saldo vero arriva da `characterUpdated` |
| `INSUFFICIENT_POINTS` | **solo primitive interne (Phase 6/7)**: `WalletService.debitUserPoints` | `twitchPoints` < importo | `Punti canale insufficienti` | nessuna oggi (nessuna mutation lo espone) |
| `TRANSACTION_TOTAL_MISMATCH` | `doTransaction` | `total`/`isTotalPositive` del client diversi dal netto calcolato dal catalogo; denominazioni negative o non intere | `Il totale non corrisponde ai prezzi attuali del negozio` | mostrare l'errore e **ricaricare il catalogo** |
| `ITEM_NOT_FOUND` | `doTransaction` | `item` nullo/malformato o assente dal catalogo del suo tipo (un equipaggiamento in `lootAssets` non viene trovato) | `Oggetto non trovato nel catalogo` | ricaricare il catalogo |
| `ITEM_NOT_TRADABLE` | `doTransaction` | `buyPrice` (acquisto) o `sellPrice` (vendita) nullo nel catalogo | `Oggetto non scambiabile` | nascondere/disabilitare l'oggetto per quel verso |
| `ITEM_NOT_OWNED` | `doTransaction` (vendita), `equipItem` | vendita o equip di un oggetto non posseduto (anche `itemId` malformato in `equipItem`) | `Oggetto non posseduto` | riallinearsi con `characterUpdated` / refetch del personaggio |
| `INSUFFICIENT_ITEM_QUANTITY` | `doTransaction` (vendita) | quantità venduta > posseduta, anche per una vendita concorrente che ha già consumato lo stock | `Quantità posseduta insufficiente` | riallinearsi con lo stato del personaggio |
| `INVALID_QUANTITY` | `doTransaction` | quantità ≤ 0 o non intera; stesso oggetto ripetuto o presente sia in acquisto sia in vendita; totale fuori dagli interi sicuri | `Quantità non valida` | bug del client: non dovrebbe accadere con la UI attuale |
| `QUEST_SLOT_BUSY` | **solo primitive interne (Phase 7)**: `QuestAcceptanceService.accept` | `quests.pendingQuest` già occupato (anche dal vincitore di un'accettazione concorrente) | `Hai già una missione in corso` | FE Phase 6, quando la BE Phase 7 esporrà la mutation |
| `SPELL_NOT_KNOWN` | `equipSpell` | la magia non è in `status.spells` (anche `spellId` malformato) | `Magia non conosciuta` | refetch del personaggio |
| `SPELL_ALREADY_ACTIVE` | `equipSpell` | la magia è già in `assets.activeSpells` (anche come perdente di un equip concorrente della stessa magia) | `Magia già attiva` | riallinearsi, nessun errore bloccante |
| `MAX_ACTIVE_SPELLS_REACHED` | `equipSpell` | `activeSpells` ha già `maxActiveSpells` voci (calcolato sull'xp vivo) | `Hai raggiunto il numero massimo di magie attive` | chiedere di disequipaggiarne una |
| `SPELL_NOT_ACTIVE` | `unequipSpell`, `useSpell` | magia non attiva (anche `spellId` malformato); **per `unequipSpell` prima era `NOT_FOUND`** | `Magia non attiva` | riallinearsi con lo stato del personaggio |
| `SPELL_NO_USAGES_LEFT` | `useSpell` | magia attiva con `usages` = 0 (anche come perdente di un use concorrente sull'ultimo usage) | `Magia senza utilizzi rimasti` | mostrare il recupero in corso |
| `SPELL_RECOVERY_UNAVAILABLE` | `useSpell` | l'accodamento del job di recupero (Redis/Bull) è fallito: l'usage viene restituito | `Recupero della magia non disponibile, riprova` | messaggio + possibilità di riprovare |
| `NOT_FOUND` (invariato) | tutte | personaggio inesistente/archiviato/id malformato (`Personaggio non trovato`); spell assente dal catalogo in `equipSpell`/`useSpell` (`Magia non trovata`); quest inesistente in `accept` (`Missione non trovata`); utente inesistente nelle primitive punti (`Utente non trovato`) | vedi colonna Quando | refetch / riallineamento come in Phase 3 |
| `FORBIDDEN` (invariato, Phase 3) | le 5 mutation | personaggio non del chiamante e chiamante non `innkeeper` | `Questo personaggio non ti appartiene` | come Phase 3 |
| `UNAUTHENTICATED` (invariato, Phase 2) | tutte | bearer mancante o non valido | invariato | come Phase 2 |

Le primitive interne lanciano anche `RangeError` (mai sul wire, sono errori di programmazione) quando ricevono un importo/costo non intero, non sicuro o del segno sbagliato.

---

## 3. doTransaction

**Prezzo autorevole (D-06).** Il BE legge `buyPrice`/`sellPrice` dal catalogo (`equipmentItems` per `equipAssets`, `lootItems` per `lootAssets`) con una query lean che proietta solo i prezzi:

- `totalBuy = Σ buyPrice × qty` sugli acquisti, `totalSell = Σ sellPrice × qty` sulle vendite;
- netto in rame = `totalSell − totalBuy` (1 oro = 100 argento = 10 000 rame);
- netto > 0: il personaggio riceve rame; netto < 0: lo paga.

**Controllo incrociato del totale del client.** `clientNet = (isTotalPositive ? +1 : −1) × toCopper(total)`, e deve valere `clientNet === netto` altrimenti `TRANSACTION_TOTAL_MISMATCH`. È la stessa regola del FE (`transaction_modal.dart`: `isPositive = totalSell > totalBuy`, `total = |sell − buy|`). In dettaglio:

- un totale zero vale per qualunque segno (il FE manda `isTotalPositive: false` per un netto 0);
- le denominazioni non normalizzate sono accettate (`{0, 0, 150}` = `{0, 1, 50}`);
- denominazioni negative o non intere → mismatch.

**Ordine dei rifiuti** (il primo che scatta vince):

1. id e quantità (puro): `ITEM_NOT_FOUND` per id nullo o malformato, `INVALID_QUANTITY`;
2. catalogo: `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`;
3. controllo incrociato: `TRANSACTION_TOTAL_MISMATCH`;
4. personaggio (in sessione): `NOT_FOUND`;
5. possesso: `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`;
6. fondi: `INSUFFICIENT_FUNDS`.

L'id malformato del personaggio dà `NOT_FOUND` prima di tutto.

**Un'unica transazione Mongo.** Inventario e coins si scrivono nella stessa `connection.transaction`. La scrittura dell'inventario riafferma nel filtro le quantità vendute (`$elemMatch … quantity: { $gte }`); i coins li muove solo `WalletService` con una guard `$expr` sul rame. Qualunque fallimento annulla tutto: **mai stato parziale** (provato con un fallimento indotto dopo la scrittura dei coins: il documento resta identico).

**Semantica degli array (D-08) invariata.** Le voci che scendono a quantità 0 vengono rimosse; un acquisto incrementa la voce esistente o ne inserisce una nuova con l'`itemType` corretto.

**Scambio vuoto a totale zero = no-op valido (A2).** Risponde `successful: true` e non scrive nulla.

**Divergenze dal FE (nessuna richiede modifiche FE oggi):**

1. Il FE prezza a 0 un oggetto con prezzo nullo (`getTotalAmount` salta i null); il BE lo rifiuta con `ITEM_NOT_TRADABLE`.
2. Il FE abilita il pulsante di conferma con `canAfford(total)` anche quando il netto è positivo (`transaction_modal.dart:71`). È un quirk solo FE, senza impatto sul BE: un netto positivo non richiede fondi.
3. Dopo uno scambio riuscito che tocca inventario **e** coins arrivano due `characterUpdated` ravvicinati, uno per scrittura (entrambe nella stessa transazione, emesse al commit). L'ultimo porta lo stato finale.

---

## 4. Equip e magie attive

**`equipSpell`** è un solo `updateOne` condizionale. Nello stesso update verifica:

- la magia è conosciuta (`status.spells`), altrimenti `SPELL_NOT_KNOWN`;
- non è già attiva, altrimenti `SPELL_ALREADY_ACTIVE`;
- c'è capacità: `$size` di `activeSpells` < `maxActiveSpells`, altrimenti `MAX_ACTIVE_SPELLS_REACHED`.

La capacità si calcola con un `$switch` sull'xp vivo, con la stessa tabella della virtual `maxActiveSpells`: xp < 20000 → 0, ≥ 20000 → 1, ≥ 25000 → 2, ≥ 30000 → 3, ≥ 40000 → 4 (`src/models/character/active-spell-slots.ts`).

- Gli usages iniziali valgono sempre `spell.maxUsages` del catalogo: `request.usages` è **ignorato**.
- Una spell assente dal catalogo dà `NOT_FOUND` (`Magia non trovata`) prima di qualunque scrittura.
- Se l'update non matcha, una rilettura leggera serve solo a scegliere il codice; se il personaggio non esiste la risposta è `NOT_FOUND`.

**`unequipSpell`** è un `$pull` condizionato alla magia attiva, altrimenti `SPELL_NOT_ACTIVE` (prima `NOT_FOUND`). Tre unequip concorrenti danno un successo e due `SPELL_NOT_ACTIVE`.

**`equipItem`** fa il `$set` dello slot solo se l'oggetto è in `assets.ownedEquipments`, altrimenti `ITEM_NOT_OWNED`; prima equipaggiava qualunque id. Un `itemId` null o assente sveste lo slot. La compatibilità `equipType` ↔ slot **non** è verificata (deferred, fuori scope di questa fase).

---

## 5. useSpell e recovery

1. La spell si valida nel catalogo **prima** di toccare gli usages; se manca → `NOT_FOUND`.
2. Decremento condizionato: `$inc: -1` su `$elemMatch { spell, usages: { $gte: 1 } }`. Gli usages non scendono mai sotto 0 e c'è un solo vincitore per usage. I rifiuti sono `SPELL_NOT_ACTIVE` / `SPELL_NO_USAGES_LEFT`.
3. Il job di recupero Bull si accoda **dopo** la scrittura, con `jobId = <characterId>-<spellId>-<randomUUID()>`. Prima era `Date.now()`: due usi nello stesso millisecondo perdevano un recupero.
4. Se l'accodamento fallisce, l'usage viene restituito con lo stesso update idempotente del recovery e la risposta è `SPELL_RECOVERY_UNAVAILABLE` (il client può riprovare). Se fallisce anche la compensazione, il BE registra un `logger.error` con i soli id: è l'unico caso in cui un usage si perde, e resta tracciato.
5. Il job incrementa solo se `usages < spell.maxUsages` del catalogo: è idempotente e, rieseguito o lanciato in parallelo, non supera mai il massimo. I salti vengono loggati con `warn`:
   - job malformato;
   - spell cancellata dal catalogo;
   - personaggio archiviato o mancante, spell non attiva o già al massimo.

Il payload del job `{ characterId, spellId }` non cambia, quindi i job già in Redis restano compatibili.

Nota FE: oggi `character_mutations.dart` non ha un documento `useSpell`; arriverà con la FE Phase 8.

---

## 6. Concorrenza: le prove

Tutte sull'harness replica set (`MongoMemoryReplSet`), con `Promise.all` / `Promise.allSettled` di chiamate concorrenti.

| SC | Requisito | File di test | Prova |
|---|---|---|---|
| SC1 | BE-ATOM-01 | `src/economy/wallet.service.int-spec.ts` | 10 debiti da 30 rame su 100 → 3 vincitori, 7 `INSUFFICIENT_FUNDS`, saldo 10; 4 debiti da 20 punti su 50 → 2 vincitori, 2 `INSUFFICIENT_POINTS`, saldo 10; rollback in sessione |
| SC2 | BE-ATOM-02 | `src/economy/trade/shop-transaction.service.int-spec.ts` | 4 acquisti concorrenti con fondi per uno → 1 riuscito, 3 `INSUFFICIENT_FUNDS`, saldo 0, una sola spada; 3 vendite dell'unica spada → 1 riuscita, coins accreditati una volta; fallimento indotto dopo la scrittura dei coins → documento identico a prima |
| SC2 (wire) | BE-ATOM-02 | `src/economy/trade/do-transaction.int-spec.ts` | 5 `doTransaction` concorrenti sullo stesso bearer, fondi per uno → 1 `successful: true`, 4 `INSUFFICIENT_FUNDS`; ogni codice di rifiuto con `extensions` esattamente `{ code }` e documento invariato |
| SC3 | BE-ATOM-03 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` | 3 accept concorrenti → 1 `PendingQuest`, 1 debito, 2 `QUEST_SLOT_BUSY`; `INSUFFICIENT_FUNDS` libera lo slot senza `PendingQuest` orfani |
| SC4 | BE-ATOM-04 | `src/characters/spells/equip-spell.int-spec.ts` | 4 equip a capacità 1 → 1 successo; 6 equip a capacità 2 → 2 successi su due magie distinte; 3 unequip → 1 successo |
| SC5 | BE-ATOM-05 | `src/characters/spells/use-spell.int-spec.ts` | 4 use con 1 usage → 1 successo, 3 `SPELL_NO_USAGES_LEFT`, usages 0, un solo job; 2 use con 2 usages → 2 successi e 2 jobId distinti; Redis che rifiuta l'accodamento → usage restituito e `SPELL_RECOVERY_UNAVAILABLE` |
| SC5 | BE-ATOM-05 | `src/characters/spell-recovery.processor.cap.int-spec.ts` | al massimo resta al massimo; job rieseguito due volte da 2 (max 3) → 3; 3 replay paralleli con max 1 da 0 → 1; spell fuori catalogo e job malformato → nessuna scrittura |

---

## 7. Primitive per le fasi BE successive

**`WalletService`** (`src/economy/wallet.service.ts`, esportato da `EconomyModule`) è **l'unico scrittore dei saldi** (D-04). Nessun altro service fa `$inc`/`$set` su `status.coins` o `twitchPoints`: il gate della Phase 4 lo verifica con un grep (solo `src/economy/wallet.service.ts` e `src/economy/coins.expressions.ts`).

```ts
applyCharacterCoinsDelta(characterId: Types.ObjectId, deltaCopper: number, session?: ClientSession): Promise<CoinPurse>
debitUserPoints(userId: Types.ObjectId, amount: number, session?: ClientSession): Promise<number>
creditUserPoints(userId: Types.ObjectId, amount: number, session?: ClientSession): Promise<number>
```

- Ognuna è un solo `findOneAndUpdate` condizionale e restituisce il saldo aggiornato. Il debito di coins fallisce con `INSUFFICIENT_FUNDS` o `NOT_FOUND` (personaggio archiviato/inesistente); il debito di punti con `INSUFFICIENT_POINTS` o `NOT_FOUND`.
- Gli importi devono essere **interi, calcolati dal server**, mai presi dal client. `deltaCopper` non intero → `RangeError`. `amount` dei punti deve essere un intero positivo, altrimenti `RangeError`. Un delta coins 0 è un no-op.
- `session` opzionale: passandola, la primitiva si compone dentro una `connection.transaction` del chiamante. Nel callback della transazione niente side effect e niente `Promise.all`: il driver può rieseguirlo sui `WriteConflict`.
- Nessun publish: `characterUpdated` / `userUpdated` arrivano dai change stream.

**`QuestAcceptanceService`** (`src/quests/acceptance/quest-acceptance.service.ts`, esportato da `QuestAcceptanceModule`, nessun resolver, D-09):

```ts
accept(characterId: Types.ObjectId, questId: Types.ObjectId, costCopper: number): Promise<Types.ObjectId>
```

Restituisce l'id del `PendingQuest`. In una transazione: claim condizionale di `quests.pendingQuest: null`, insert del `PendingQuest` (`startDate` = ora del server, `waitingTime` da `waitingTimeOf`) e debito via wallet nella stessa sessione. Costo non intero o negativo → `RangeError`; costo 0 → nessun debito.

**Per fase:**

- **Phase 6 (EventSub / punti canale):** accreditare con `creditUserPoints(userId, amount)`. La **dedup sul `message_id` di EventSub resta a carico della Phase 6** (il wallet non è idempotente per messaggio). `userUpdated` arriva dal change stream `users`.
- **Phase 7 (quest):** montare la mutation lane-aware sopra `accept`.
  - Generalizzare il percorso dello slot (`pendingQuest` / `activeStoryQuest` / `activeWorldMissionQuest`).
  - Scegliere il saldo da debitare: coins con `applyCharacterCoinsDelta`, oppure `debitUserPoints` **nella stessa sessione**.
  - Definire il cost model per tipologia.
  - `waitingTime = quest.infos.timeToComplete ?? 0` vive in un solo punto, `waitingTimeOf` (A1): se la Phase 7 sceglie un'altra fonte basta cambiare una riga.
- **Phase 8 (viaggi):** teleport/clear atomico con lo stesso stile "il filtro è la regola" (un `updateOne` condizionale, rilettura solo per scegliere il codice) e `session` se si compone con un movimento di saldo.
- **Phase 9 (combattimento/ricompense):** accreditare con `applyCharacterCoinsDelta(…, session)` **dentro** la transazione dell'esito, mai fuori.
- **Regola trasversale (Pitfall 1):** i path ref `@Prop({ type: Types.ObjectId })` sono `Mixed` fino al retype della Phase 10, quindi Mongoose non fa cast. Ai filtri e agli update passare sempre `Types.ObjectId`, convertendo gli id del client con `objectIdFromHex` (`src/mongo/document-id.ts`, che restituisce `null` se l'id è malformato) o con `requireCharacterObjectId` (`src/characters/character-id.ts`, che dà `NOT_FOUND` se l'id è malformato). Ogni filtro sul personaggio usa `activeCharacterById(id)`.

---

## 8. Note di deploy

- **Replica set obbligatorio.** `doTransaction` e l'accettazione quest usano transazioni Mongo, che richiedono un **replica set**. Il blocker "verificare topologia MongoDB prod" in `STATE.md` **resta aperto** (D-19, A4): verificare `rs.status()` sull'istanza di produzione prima del rilascio. Equip, magie e wallet senza sessione sono update a documento singolo e non dipendono dalla topologia.
- **Limite `$toInt` (A3).** Le pipeline sui coins convertono con `$toInt`, quindi il massimo è 2 147 483 647 rame per personaggio (circa 214 748 oro). Oltre, la scrittura fallisce con un errore del server. Se l'economia cresce, passare a `$toLong`.
- **Dati legacy non migrati (A6).** Il vecchio `doTransaction` non controllava i fondi e il vecchio `equipSpell` salvava gli `usages` del client, quindi possono esistere coins negativi e usages oltre `maxUsages`. Il nuovo codice non può peggiorarli: il debito fallisce su un totale negativo e il recovery non incrementa oltre il massimo. Controllo opzionale:
  ```js
  db.characters.countDocuments({ $or: [{ 'status.coins.gold': { $lt: 0 } }, { 'status.coins.silver': { $lt: 0 } }, { 'status.coins.copper': { $lt: 0 } }] })
  ```
  Per gli usages oltre il massimo serve un confronto fra `assets.activeSpells.usages` e `spells.maxUsages`, ad esempio un'aggregazione con `$lookup`.
- **Job Bull già in Redis:** il payload `{ characterId, spellId }` è compatibile con il nuovo processor.
- **Nessuna nuova variabile d'ambiente**, nessuna modifica allo schema, nessun indice nuovo.

---

## 9. Impatto sul FE e divergenze

- **Nessun file FE da modificare** per questa fase: i documenti GraphQL e i tipi generati restano validi.
- **Shop (oggi):** mappare i codici della §2 relativi a `doTransaction`. `TRANSACTION_TOTAL_MISMATCH` e `ITEM_NOT_FOUND` → ricaricare il catalogo; `INSUFFICIENT_FUNDS`, `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY` → messaggio e riallineamento con `characterUpdated`. Finché il FE non li mappa, un rifiuto arriva come errore generico, ma il saldo e l'inventario non vengono mai corrotti.
- **FE Phase 8 (magie):** mappare `SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`, `SPELL_NOT_ACTIVE`, `SPELL_NO_USAGES_LEFT`, `SPELL_RECOVERY_UNAVAILABLE`; **smettere di inviare `usages`** in `EquipSpellRequest` (ignorato); `unequipSpell` non attiva = `SPELL_NOT_ACTIVE`, non più `NOT_FOUND`.
- **FE Phase 6 (quest):** mapperà `QUEST_SLOT_BUSY`, `INSUFFICIENT_FUNDS` e `INSUFFICIENT_POINTS` quando la BE Phase 7 esporrà la mutation di accettazione. Oggi non esiste.
- **`equipItem`:** un oggetto non posseduto ora risponde `ITEM_NOT_OWNED` (prima veniva equipaggiato qualunque id).
- **Divergenze di comportamento** (dettaglio in §3): prezzo nullo → `ITEM_NOT_TRADABLE` invece di 0; `canAfford` con netto positivo è un quirk del FE; possono arrivare due `characterUpdated` dopo uno scambio.

Deviazioni registrate nei SUMMARY 04-01..04-08, rilevanti per il contratto:

- `spellId` malformato: in `equipSpell` → `SPELL_NOT_KNOWN`, in `unequipSpell`/`useSpell` → `SPELL_NOT_ACTIVE`, senza toccare il DB. `itemId` malformato in `equipItem` → `ITEM_NOT_OWNED`.
- Una vendita battuta da una vendita concorrente può rispondere `ITEM_NOT_OWNED` oppure `INSUFFICIENT_ITEM_QUANTITY`, a seconda del momento dello snapshot.
- La copertura "archiviato → `NOT_FOUND`" di `doTransaction` è passata dallo unit test al wire. Le fixture ownership/archived usano uno scambio vuoto a totale zero (A2).
- Le altre deviazioni dei SUMMARY sono di forma (lint, nomi di helper) e non toccano il wire.

---

## 10. Checklist di verifica per il FE

- [ ] Documenti GraphQL verificati con `tool/schema_check` contro `Klimmeck-Guide-BE/src/schema.gql` di questa fase: **nessuna differenza attesa** (schema invariato da `eff8485`).
- [ ] Prova manuale shop su device: acquisto con catalogo aggiornato → `successful: true` e `characterUpdated` con coins e inventario nuovi.
- [ ] Prova manuale shop con catalogo stantio (prezzo cambiato lato BE dopo l'apertura dello shop) → `TRANSACTION_TOTAL_MISMATCH`, poi refetch del catalogo e acquisto riuscito.
- [ ] (FE Phase 8) `usages` non più inviato in `EquipSpellRequest`; codici `SPELL_*` e `MAX_ACTIVE_SPELLS_REACHED` mappati.

### Checklist pre-PR BE (eseguita in 04-09)

- [x] `npm run test:unit` → 54 suite / 625 test verdi
- [x] `npm run test:int` → 41 suite / 472 test verdi (Redis reale incluso)
- [x] `npm run build` ok
- [x] eslint (0 errori) e `prettier --check` sui 58 file `.ts` toccati dalla fase
- [x] `git diff --exit-code develop -- src/schema.gql` → 0
- [x] invarianti: nessun `.save()` in `CharactersService`/`SpellRecoveryProcessor`, nessun `normalizeCoins`, `src/utils.ts` rimosso, nessun `Date.now()` né `BadRequestException` in `characters.service.ts`, saldi scritti solo da `src/economy/wallet.service.ts` / `src/economy/coins.expressions.ts`
