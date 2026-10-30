# BACKEND-NOTES — Phase 9.2 Quest Result Delivery Contract (handoff per la FE Phase 9 e la BE Phase 10)

- **Fase BE:** 09.2-quest-result-delivery-contract (requisiti BE-RESULT-01, BE-RESULT-02, BE-RESULT-03, BE-RESULT-04; decisioni D-01..D-12 in `09.2-CONTEXT.md`, emendato dopo la ricerca; D-12 aggiunta lo stesso giorno).
- **Data:** 2026-10-28. Documento di fine fase, scritto prima della UAT su device (manual-only: appartiene alla FE Phase 9, con i dati di §7 e la checklist di §9).
- **Risponde a:** `Klimmeck-Guide/.planning/phases/09-combat-result-sheet/BACKEND-NOTES.md` (proposta FE: §2.1–§2.4 contratto, §2.5 le 5 domande, §3 comportamento FE, §4 dati UAT). Le risposte numerate sono in §6.
- **Branch:** `feat/09.2-quest-result-delivery-contract` → PR verso `develop` **prima** del piano FE che seleziona il campo nuovo e registra i documenti nuovi (il piano schema-gated legge questo file da `origin/develop`). La BE Phase 10 (`feat/10-hardening`) si sposta sopra questo branch e apre la sua PR dopo la merge.
- **Schema:** `src/schema.gql` è **solo additivo** rispetto a `origin/develop`: 0 righe `-`, esattamente 3 righe `+` (il campo sul risultato, la query, la mutation; §1). Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate di fine fase (09.2-07): unit **135 suite / 1991 test** (~6 s), integration **82 suite / 1096 test** (replica set + Redis effimero, `--runInBand`, ~198 s), `npm run build` exit 0, `eslint` e `prettier --check` puliti sui 38 `.ts` toccati dalla fase, nessuna dipendenza né variabile d'ambiente nuova. Baseline di inizio fase: unit 133 / 1974, integration 78 / 1029.
- **Fonte:** ogni nome, codice, messaggio e riga di SDL qui sotto è copiato dal codice (`src/schema.gql`, `src/quests/results/**`, `src/characters/deletion/**`, `src/users/users.service.ts`, `src/authz/resource-not-found.exception.ts`, `src/authz/authorization.exception.ts`, `src/characters/creation/character-creation.exception.ts`). **Lo schema generato `src/schema.gql` vince su questo documento.**
- **Regola dei letterali:** gli identificatori nuovi compaiono qui solo in code span o blocchi di codice; nel testo si scrive «conferma», «non confermati», «segnaposto», «marcatore», «istante di avvio».

---

## 0. TL;DR per il FE

1. **Lista dei non confermati:** `unacknowledgedQuestResults` restituisce i risultati dell'utente del bearer non ancora confermati, dal più vecchio, al massimo 50. Il FE la legge al cold start (dopo `me`), a ogni resume e dopo ogni riconnessione WS, e deduplica per `id` con quanto già arrivato da `questResultReceived` e dalla push. Scelta dell'utente (2026-10-27): «Companion BE 9.2: risultati non confermati + ack».
2. **Conferma alla chiusura del foglio:** `acknowledgeQuestResult(id)` risponde `{ response: "Risultato confermato", successful: true }` ed è idempotente (una seconda chiamata o una concorrente rispondono uguale senza scrivere): il FE può ritentare best-effort. Momento scelto dall'utente (2026-10-27): «Alla chiusura col tasto».
3. **Campo nuovo sul risultato:** `QuestResult.acknowledgedAt: DateTime` nullable, `null` su ogni risultato appena scritto (quindi anche su `questResultReceived` e su `questResult` di un risultato nuovo). I risultati precedenti al deploy vengono confermati al primo boot (§6 Domanda 2): il primo cold start non riceve lo storico.
4. **Morte (D-12):** la morte archivia il personaggio ma **non** lo stacca dall'utente: `me` e `userUpdated` restituiscono il morto come `currentCharacter` finché il FE non conferma il suo risultato `death`; la conferma lo stacca nella stessa transazione e solo allora `userUpdated` emette `currentCharacter: null`. `createCharacter` è rifiutato (`CHARACTER_ALREADY_EXISTS`) fino alla conferma. Domanda e scelta dell'utente (2026-10-27), verbatim: *«Non puoi settare currentCharacter a null solo quando ricevi la conferma di presa visione del risultato?»* → **«BE: currentCharacter resta sul morto fino alla conferma»**. Dettagli in §3.
5. **Quest avviate:** l'archivio di un partecipante (cancellazione o morte) non libera più il suo posto dopo l'avvio: la registrazione resta come segnaposto, i posti restano pieni, k/N non scende. Utente (2026-10-27), verbatim: *«finché una missione non è conclusa il foglio resta strappato sulla board una volta che i posti sono pieni (e che quindi la quest è cominciata)»* e, sul posto liberato dopo l'avvio, **«Il BE non libera i posti delle quest avviate»**. Nessun cambiamento lato FE (§5).
6. **Nomi:** quelli proposti dal FE, invariati. Nessun nuovo tipo push, nessun evento sulla conferma del risultato.

---

## 1. Contratto GraphQL (additivo)

Le tre righe aggiunte rispetto a `origin/develop` (`git diff origin/develop -- src/schema.gql`, ordine di `sortSchema`):

```graphql
  acknowledgeQuestResult(id: String!): CommonResponse!
  unacknowledgedQuestResults: [QuestResult!]!
  acknowledgedAt: DateTime
```

Blocchi completi, copiati da `src/schema.gql`:

```graphql
type QuestResult {
  acknowledgedAt: DateTime
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

type Query {
  # …
  questResult(id: String!): QuestResult!
  unacknowledgedQuestResults: [QuestResult!]!
}

type Mutation {
  # …
  acknowledgeQuestResult(id: String!): CommonResponse!
}

type Subscription {
  # … invariata
  questResultReceived(characterId: String!): QuestResult!
}

type CommonResponse {
  response: String!
  successful: Boolean!
}
```

**Query** (il frammento `QuestResultSheet` è quello del §1 della proposta FE, con il campo nuovo selezionato):

```graphql
query UnacknowledgedQuestResults {
  unacknowledgedQuestResults {
    ...QuestResultSheet
  }
}
```

```json
{
  "data": {
    "unacknowledgedQuestResults": [
      {
        "id": "<questResultId>",
        "outcome": "failure",
        "resolvedAt": "2026-10-28T09:12:00.000Z",
        "acknowledgedAt": null,
        "character": "<characterId>",
        "user": "<userId>",
        "quest": { "id": "<questId>", "type": "boss", "title": "<titolo>" }
      },
      {
        "id": "<questResultId2>",
        "outcome": "death",
        "resolvedAt": "2026-10-28T10:40:00.000Z",
        "acknowledgedAt": null,
        "character": "<characterId>",
        "user": "<userId>",
        "quest": { "id": "<aidQuestId>", "type": "aid", "title": "Soccorso: <titolo>" }
      }
    ]
  }
}
```

(campi del foglio troncati nell'esempio; senza risultati pendenti la lista è `[]`).

**Mutation:**

```graphql
mutation AcknowledgeQuestResult($id: String!) {
  acknowledgeQuestResult(id: $id) {
    response
    successful
  }
}
```

```json
{ "id": "<questResultId>" }
```

```json
{ "data": { "acknowledgeQuestResult": { "response": "Risultato confermato", "successful": true } } }
```

La stessa risposta arriva alla seconda chiamata sullo stesso id (nessuna scrittura).

---

## 2. Semantica

**Lista dei non confermati:**

- Solo i risultati il cui `user` è l'utente del bearer (non il personaggio): un risultato `death` resta nella lista dopo l'archivio del personaggio e anche dopo la creazione del nuovo.
- Solo quelli con la conferma nulla.
- Ordine: `resolvedAt` crescente, spareggio sull'id (deterministico): il FE li accoda in quest'ordine.
- Tetto **50**. Un arretrato maggiore si svuota rileggendo la lista dopo le conferme (resume o riconnessione successivi).
- Qualunque ruolo autenticato; **nessun bypass innkeeper**: l'innkeeper vede solo i propri. Senza bearer: `UNAUTHENTICATED`. Un bearer con un userId illeggibile riceve `[]`.
- Nessun argomento, nessuna paginazione.

**Conferma:**

- Owner-only per **utente**: la proprietà la verifica il guard `@OwnsQuestResult` (la stessa policy di `questResult`); l'innkeeper non conferma risultati altrui.
- Un solo update condizionale (scrive solo se la conferma è ancora nulla, l'istante viene dall'orologio del server). Seconda chiamata o due chiamate concorrenti: una sola scrittura, entrambe rispondono `successful: true`.
- Nessuna voce di audit (non è un'azione admin).
- **Nessun evento sul risultato:** `questResultReceived` emette solo sugli insert, mai sulla conferma. Il FE toglie il foglio dalla sua coda da sé, alla chiusura. L'unico evento conseguente è `userUpdated` alla conferma di una morte (§3).
- Un risultato `death` resta confermabile dopo l'archivio del suo personaggio.

**Campo sul risultato:**

- `null` alla creazione per ogni esito (`success`, `failure`, `rescued`, `death`, `gmCompleted`): c'è un solo scrittore dei risultati e il default del modello basta.
- `questResult(id)` e `questResultReceived` lo restituiscono come ogni altro campo: `null` per un risultato nuovo, l'istante della conferma dopo, l'istante di `resolvedAt` per un risultato precedente al deploy (backfill, §6 Domanda 2).
- `questResultReceived` resta senza snapshot: una subscription già aperta sul personaggio riceve anche il risultato della sua morte. Una **nuova** subscribe su un personaggio morto ma ancora corrente (morte non confermata, §3) è **accettata** e resta muta (nessuno snapshot, nessun evento spontaneo); risponde `NOT_FOUND` «Personaggio non trovato» solo dopo che la conferma della morte ha staccato il personaggio. Il FE non deve contare su quel `NOT_FOUND`: la lista è la fonte al cold start.

---

## 3. Morte e personaggio corrente (D-12)

Sequenza dal punto di vista del FE (aid fallita o timeout dei 7 giorni):

1. **Alla morte:** il personaggio è archiviato (invisibile come da Phase 3.1) e il suo utente riceve un risultato `death` non confermato (push `questEnd`, `questResultReceived` se la subscription è già aperta). Il documento `users` **non cambia**: nessun `userUpdated` alla morte.
2. **Fino alla conferma:**
   - `me.currentCharacter` e `userUpdated.currentCharacter` restituiscono il **morto**: l'intero `Character` (id compreso) com'era all'archivio. Lo stesso vale per la lista `users` dell'innkeeper.
   - Ogni altro percorso lo vede inesistente: `character(id)`, `characterUpdated` (subscribe nuova), `equipment` e ogni mutation owner sul personaggio rispondono `NOT_FOUND` «Personaggio non trovato»; la lista `characters` dell'innkeeper non lo mostra.
   - **Eccezione:** una nuova subscribe a `questResultReceived` sul suo id è **accettata** e resta muta (il guard riconosce il proprietario del personaggio corrente; senza snapshot non c'è nulla da rifiutare). Risponde `NOT_FOUND` solo dopo la conferma della morte, che stacca il personaggio. Il FE non deve contare su un `NOT_FOUND` da questa subscription: il recupero dei risultati non confermati viene dal `NOT_FOUND` di `character(id)` al cold start e dalla lista dei non confermati.
   - `createCharacter` risponde `CHARACTER_ALREADY_EXISTS` «Hai già un personaggio».
   - **Come il FE riconosce «morto, foglio in attesa»:** nella lista dei non confermati (o sull'evento) c'è un risultato `outcome: death` il cui `character` è uguale all'id di `me.currentCharacter`.
3. **Alla conferma del risultato `death`:** nella stessa transazione della conferma il BE stacca il personaggio corrente, **solo se l'utente punta ancora a quel personaggio** (mai un personaggio diverso). Il change stream degli utenti emette `userUpdated` con `currentCharacter: null`; `me` risponde `currentCharacter: null`; `createCharacter` torna possibile. Il FE passa alla creazione su questo evento (nessun hold lato FE).
4. **Seconda conferma della stessa morte:** nessuna scrittura, nessun evento, `successful: true`.
5. **Conferma di un risultato non `death`:** non tocca mai il personaggio corrente.

**Nessuna rete di sicurezza oltre la conferma in questa fase:** una morte mai confermata lascia l'utente collegato al morto. Via d'uscita già esistente: `deleteCharacter` su un utente collegato a un morto lo scollega con il ramo della Phase 3.1 (risposta normale di successo; lato server un log di livello informativo con soli id, «Utente <id> scollegato dal personaggio morto <id> senza conferma», non un WARN: è la via d'uscita prevista, non un'anomalia; il WARN resta per un riferimento a un personaggio mancante o cancellato), poi `createCharacter` funziona. Uno sweep di sicurezza è annotato per la Phase 10 (§10).

**Compatibilità col FE vecchio:** fra il deploy BE e il rilascio della FE Phase 9 un giocatore che muore resta collegato al morto e il FE vecchio non conferma: il FE vecchio vede un personaggio che risponde `NOT_FOUND` e la creazione rifiutata. Può uscirne solo con `deleteCharacter` dalle Impostazioni o con il comando mongosh del §7. Per questo BE e FE Phase 9 vanno rilasciati il più vicini possibile (§8).

**La cancellazione volontaria** (`deleteCharacter`) è invariata: archivia e stacca subito, `userUpdated` emette `currentCharacter: null` come in Phase 3.1, nessun risultato.

---

## 4. Codici di rifiuto

> **Emendato dalla Phase 10 (2026-10-29):** `acknowledgeQuestResult(id)` e `questResult(id)` con un id malformato rispondono `BAD_USER_INPUT` (`Input non valido: id`, senza leggere il DB) e non più `NOT_FOUND`; `NOT_FOUND` resta per gli id ben formati inesistenti o altrui. Vedi `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §3.

Codici in `extensions.code`, messaggi fissi copiati dal codice.

| Codice | Messaggio | Operazione | Quando |
|--------|-----------|------------|--------|
| `NOT_FOUND` | «Risultato non trovato» | conferma (e `questResult`, invariato) | id malformato (risposta senza accesso al DB) o risultato inesistente |
| `FORBIDDEN` | «Questo risultato non ti appartiene» | conferma (e `questResult`, invariato) | risultato di un altro utente, **innkeeper compreso** |
| `UNAUTHENTICATED` | messaggio del guard globale, invariato | lista e conferma | richiesta senza bearer o con un bearer non valido |
| `CHARACTER_ALREADY_EXISTS` | «Hai già un personaggio» | `createCharacter` | l'utente è ancora collegato al morto: la sua morte non è stata confermata |
| `NOT_FOUND` | «Personaggio non trovato» | `character(id)`, `characterUpdated`, `equipment`, mutation owner | personaggio morto (o cancellato), anche se ancora corrente (§3) |
| `NOT_FOUND` | «Personaggio non trovato» | nuova subscribe a `questResultReceived` | personaggio cancellato, o morto **dopo** la conferma che lo ha staccato; un morto ancora corrente è accettato e la subscription resta muta (§3) |

La lista non ha rifiuti propri oltre a `UNAUTHENTICATED`: senza risultati risponde `[]`.

---

## 5. Posti delle quest avviate (regola dell'utente)

> **Emendato dalla Phase 10 (2026-10-29):** la D-07 di questa fase («la risoluzione combatte con chi resta») è superata dalla D-21: la risoluzione combatte **a posti pieni**, con i registrati archiviati dopo l'avvio come seat holder (fotografia del personaggio archiviato) nel boss e nel soccorso di gruppo; nessun risultato né premio per loro; il WARN «scartato» diventa un INFO. Il resto del §5 è invariato. All'avvio di un party ogni membro riceve un `characterUpdated` con `quests.pendingQuest.startDate` valorizzato (D-22). Vedi `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §8.

Utente, 2026-10-27, verbatim: *«finché una missione non è conclusa il foglio resta strappato sulla board una volta che i posti sono pieni (e che quindi la quest è cominciata)»*; sul caso limite di un posto liberato dopo l'avvio l'utente ha scelto **«Il BE non libera i posti delle quest avviate»**.

- **Prima dell'avvio:** invariato rispetto alla Phase 8 D-30. L'archivio (cancellazione o morte) libera il posto, k/N scende, la finestra delle 24 ore è invariata.
- **Dopo l'avvio** (party completo, piano 09-19): la registrazione del personaggio archiviato **resta** fra `registeredAdventurers` come segnaposto.
  - I posti restano pieni: il foglio resta strappato sulla board per la regola Phase 6 D-08, nessun cambiamento FE.
  - Un'accettazione risponde `QUEST_FULL` come prima.
  - `questUpdated` emette comunque (l'archivio scrive un marcatore interno sulla registrazione) con il segnaposto ancora nella lista: il contatore k/N resta invariato.
- **Risoluzione:** la quest si risolve con chi resta; il segnaposto è scartato con un WARN lato server con soli id (lo stesso «dropped» del piano 09-13). Boss vinto con un solo combattente rimasto: un solo risultato, per lui. Boss perso: quest di nuovo non avviata e una sola aid per il combattente.
- **Roster di soli segnaposto** (o di id che non sono più personaggi attivi): la quest torna **non avviata** e le registrazioni sono azzerate, così un nuovo party può formarsi; il foglio si «srotola» sulla board con k/N a 0.
- **Aid:** il roster dei soccorritori segue la stessa regola (soccorso di gruppo con un soccorritore archiviato: si risolve con chi resta; aid azzerata dall'archivio del suo unico soccorritore: il timeout dei 7 giorni torna a correre e scade normalmente con `death`). I feriti (`rescue.characters`, interno) restano come in Phase 9.
- **Quest concluse:** mai toccate dall'archivio.
- **Interni, mai sul filo:** il marcatore del segnaposto e l'istante di avvio della quest. Si vedono solo con mongosh (§7). Lo SDL non li contiene (asserito dal boot reale).

Il FE vede sul filo solo una registrazione in più fra `registeredAdventurers` di `questUpdated`/`quests`, indistinguibile da un registrato attivo.

---

## 6. Risposte alle domande della FE (§2.5)

### Domanda 1

**Tetto e ordinamento della lista, indice.** Tetto **50**; ordine `resolvedAt` crescente con spareggio sull'id (`{ resolvedAt: 1, _id: 1 }`). Indice aggiunto in questa fase: `quest_result_unacknowledged` su `{ user: 1, acknowledgedAt: 1, resolvedAt: 1, _id: 1 }` (con lo spareggio il piano della query non ha stadi di sort), dichiarato sul modello e verificato al boot (§8). Niente indice parziale: dipende dalla versione di MongoDB di produzione, non verificata.

### Domanda 2

**Risultati precedenti al deploy:** backfill al boot, idempotente. A ogni avvio il BE conferma i risultati senza il campo all'istante della loro risoluzione (`acknowledgedAt = resolvedAt`); al secondo boot non trova più nulla. Effetto sul primo cold start del FE: la lista contiene solo i risultati scritti **dopo** il deploy BE. Restano non confermati i risultati prodotti fra il deploy BE e il rilascio della FE Phase 9 (il FE vecchio non conferma): accettato, il comando mongosh per confermarli prima della UAT è in §7.

### Domanda 3

**Forma della risposta:** `CommonResponse`, come proposto: `{ "response": "Risultato confermato", "successful": true }`, uguale alla prima e alle chiamate successive. Il risultato aggiornato non viene restituito: se serve, `questResult(id)`.

### Domanda 4

**Istante di avvio sul filo:** no. Resta interno (il FE non ne ha bisogno con la regola del §5: i posti restano pieni). La UAT lo controlla con mongosh (§7).

### Domanda 5

**Populate del personaggio corrente archiviato:** sì. Il populate di `User.currentCharacter` include i personaggi attivi **e** quelli archiviati per morte; `me`, `userUpdated` e la lista `users` dell'innkeeper restituiscono l'intero `Character` del morto (non solo `{ id }`) finché la morte non è confermata. Un personaggio cancellato volontariamente non è mai corrente (la cancellazione stacca subito). Il FE distingue «morto, foglio in attesa» da «nessun personaggio» come descritto in §3.

---

## 7. Dati UAT e comandi mongosh

Tutti i comandi usano placeholder (`<…>`); gli id si leggono con le `find`. Da eseguire a mano sul DB di sviluppo, **prima** della UAT dove indicato. La preparazione dei dati di combattimento (HP, nemici, quest) è quella del handoff Phase 9 §12.

**Prima della UAT — confermare tutti i risultati pendenti** (quelli prodotti mentre girava il FE vecchio):

```js
db.questresults.updateMany({ acknowledgedAt: null }, [{ $set: { acknowledgedAt: '$resolvedAt' } }])
```

**Prima della UAT — staccare gli utenti rimasti collegati a un morto** (morti avvenute col FE vecchio):

```js
const dead = db.characters.find({ deletionReason: 'death' }, { _id: 1 }).toArray().map((c) => c._id);
db.users.updateMany({ currentCharacter: { $in: dead } }, { $set: { currentCharacter: null } })
```

I due comandi «Prima della UAT» vanno eseguiti **insieme e in quest'ordine** (prima la conferma dei risultati pendenti, poi lo stacco degli utenti collegati a un morto): il primo da solo lascerebbe un utente collegato al morto con il risultato `death` già confermato, e una nuova conferma dal FE non scriverebbe nulla (idempotenza, D-03), quindi non lo staccherebbe più.

**Ispezionare una quest** (istante di avvio e registrazioni, segnaposto compresi):

```js
db.quests.findOne({ _id: ObjectId('<questId>') }, { startedAt: 1, registeredAdventurers: 1 })
```

**Ispezionare i risultati non confermati di un utente:**

```js
db.questresults.find({ user: ObjectId('<userId>'), acknowledgedAt: null }, { outcome: 1, character: 1, resolvedAt: 1 }).sort({ resolvedAt: 1, _id: 1 })
```

**(a) Un risultato per esito** sul personaggio di sviluppo:

1. job → `success`;
2. combattimento perso → `failure`, con la aid «Soccorso: <titolo>» sulla board;
3. aid vinta da un secondo personaggio → `rescued` per il ferito e `success` (con `rescuedCharacters`) per il soccorritore;
4. timeout della aid (o aid persa) → `death`;
5. completamento del GM di una story o worldMission → `gmCompleted`.

Ogni foglio compare una sola volta; dopo la chiusura il risultato ha la conferma valorizzata (mongosh) e non torna al resume.

**(b) Risultato prodotto ad app chiusa senza push:** push disattivate per il dispositivo (toggle «fine quest» o permesso negato), force stop dell'app, poi risoluzione di una quest (arrivo sul marker di un job o risoluzione del combattimento). Al cold start il foglio arriva dalla lista dei non confermati; chiuso il foglio, la lista non lo restituisce più.

**(c) Morte ad app uccisa:** personaggio ferito con la aid aperta, app uccisa, poi morte (aid persa da un soccorritore oppure timeout: per anticiparlo, retrodatare `status.awaitingAid.since` di più di 7 giorni e attendere lo sweep).

```js
db.characters.updateOne({ _id: ObjectId('<characterId>') }, { $set: { 'status.awaitingAid.since': new Date(Date.now() - 8 * 24 * 3600 * 1000) } })
```

Al cold start `me.currentCharacter` è ancora il morto, `character(id)` risponde `NOT_FOUND`, il foglio della morte appare (dalla lista), `createCharacter` non è ancora raggiungibile; alla chiusura del foglio arriva `userUpdated` con `currentCharacter: null` e il FE apre la creazione.

**(d) Boss avviato con un partecipante eliminato:** quest boss con due posti, due personaggi (due utenti) registrati e arrivati: la quest è avviata. Uno dei due chiama `deleteCharacter` dalle Impostazioni. Sulla board dell'altro (e di un terzo utente) il foglio resta strappato, k/N invariato (2/2), un'accettazione risponde `QUEST_FULL`. Con mongosh (comando «Ispezionare una quest») la registrazione eliminata porta il marcatore e la quest ha ancora l'istante di avvio. Alla risoluzione solo il rimasto riceve un risultato. Variante: se si eliminano entrambi, la quest torna non avviata e si srotola con k/N 0/2.

**(e) Tap sulla push:**

```graphql
mutation { sendTestPush(input: { type: questEnd, id: "<questResultId>" }) { targeted sent failed pruned } }
```

Con un id già confermato il tap apre solo la Mappa; con uno non confermato apre il foglio.

---

## 8. Deploy

- **Indice:** `quest_result_unacknowledged` su `questresults`, costruito da Mongoose e verificato al boot dal provider di manutenzione dei risultati. Un errore non blocca il boot: log `Indici di questresults non costruiti (<nome e codice>)…`, la lista resta corretta ma più lenta.
- **Backfill:** a ogni boot (scansione completa di `questresults`, idempotente). Log `Risultati precedenti alla conferma marcati come confermati: <n>` solo se ne trova; errore → log con nome e codice, boot prosegue.
- **Nessuna** variabile d'ambiente, coda, tipo push o dipendenza nuova; `.env.example` invariato.
- **MongoDB ≥ 4.2** in produzione (update pipeline del backfill, `arrayFilters` del marcatore; già richiesto dalle fasi precedenti): da confermare prima del deploy (A1).
- **Quest avviate prima del deploy** con un posto già liberato dalla regola vecchia restano come sono (nessuna migrazione).
- **Ordine di rilascio:** BE e FE Phase 9 il più vicini possibile (§3, compatibilità col FE vecchio); prima della UAT eseguire i due comandi «Prima della UAT» del §7.

---

## 9. Checklist UAT differita (FE Phase 9)

Manual-only, su device, dopo la merge di questa PR e del piano FE schema-gated:

- [ ] (a) un foglio per ogni esito (`success`, `failure`, `rescued`, `death`, `gmCompleted`), ognuno una sola volta, confermato alla chiusura
- [ ] (b) risultato prodotto ad app chiusa con le push disattivate, ritrovato nella lista al cold start, non riproposto dopo la conferma
- [ ] (c) morte ad app uccisa: al cold start il morto è ancora corrente, il foglio della morte precede la creazione, `userUpdated` null alla conferma
- [ ] (d) boss avviato con un partecipante eliminato: foglio strappato, k/N invariato, `QUEST_FULL`, marcatore visibile con mongosh, risultato solo per chi resta
- [ ] (e) tap sulla push `questEnd` con `sendTestPush`: foglio per un id non confermato, solo Mappa per uno confermato

---

## 10. Note per la BE Phase 10

> **Emendato dalla Phase 10 (2026-10-29):** risposte: id malformato della conferma → `BAD_USER_INPUT` (quarto punto, risolto); backfill dei risultati e delle registrazioni una volta per processo al boot, non atteso e non più a ogni tick; sweep delle morti mai confermate rinviato al backlog dall'utente (2026-10-29); Open Question 6 non affrontata, resta aperta; `questResults` resta YAGNI. Vedi `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §3, §13.

- **Open Question 6:** registrati attivi **senza** PendingQuest della quest, su una quest avviata in cui tutti gli altri sono archiviati, possono restare bloccati (la quest non si risolve e non torna non avviata). Caso limite preesistente, fuori scope qui.
- **Scansione del backfill a ogni boot:** dopo il primo deploy non trova più nulla; rimuoverla o renderla mirata (o protetta da un indice) quando i volumi crescono.
- **Sweep di sicurezza per le morti mai confermate** (D-12): oggi la conferma è l'unica via di stacco automatica; valutare uno stacco dopo un termine.
- **`@IsMongoId` sull'argomento della conferma** con il `ValidationPipe` della Phase 10: oggi l'id malformato è rifiutato dal guard con `NOT_FOUND`; il codice sul filo deve restare `NOT_FOUND` o cambiare in modo documentato per il FE.
- La lista storica dei risultati (`questResults`) resta YAGNI (handoff Phase 9 §14), ora che esiste la lista dei non confermati.

---

## 11. Deviazioni e punti aperti

**Deviazioni registrate nei SUMMARY 09.2-01..09.2-06** (nessuna cambia il contratto o una decisione utente):

- 09.2-01: nessuna.
- 09.2-02: ordine delle tre righe del diff di schema dettato da `sortSchema` (Mutation, Query, tipo); il caso del tetto confronta con i primi 50 letti con lo stesso ordinamento.
- 09.2-03: il caso dell'abort con boss avviato era verde già al RED (un abort non scrive con nessuna delle due regole): resta come regressione; helper di fixture spostati a livello di suite; un caso concorrente perso da un ripristino durante una sonda è stato riscritto identico prima del commit.
- 09.2-04: errore del backfill simulato con un mock che restituisce `{ exec }`; il caso di montaggio del provider è stato scritto nel piano 04 con uno scheletro non montato, anziché nel Wave 0 (la spec deve compilare).
- 09.2-05: avvio esplicito ridondante tenuto come precondizione dichiarata; marcatore asserito prima della risoluzione; orologio dell'archivio nel timeout = ora del soccorso.
- 09.2-06: copertura aggiunta per `characterUpdated` (Rule 2) e per la lista `characters` dell'innkeeper; test concorrente morte/cancellazione ripetuto 5 volte; la prova di `userUpdated` alla conferma usa una seconda subscription aperta dopo la morte.
- 09.2-07: un commit di pianificazione precedente all'esecuzione (`254a7ae`, 74 caratteri) supera il limite di 72 caratteri del subject; la storia non viene riscritta.

**Punti aperti:**

- **A1:** versione MongoDB di produzione (≥ 4.2) da confermare prima del deploy.
- **A3:** arretrato di risultati non confermati fra il deploy BE e il rilascio della FE Phase 9 (e utenti collegati a un morto): comandi in §7.
- UAT su device rinviata alla FE Phase 9 (§9).
