# BACKEND-NOTES — Phase 10 Hardening Trasversale (handoff per FE Phase 10, FE Phase 12, quick task FE e deploy)

- **Fase BE:** 10-hardening-trasversale (requisiti BE-HARD-01, BE-HARD-02, BE-HARD-03, BE-HARD-04, BE-HARD-05, BE-HARD-06, BE-HARD-07, BE-HARD-08; decisioni D-01..D-24 in `10-CONTEXT.md`, emendato il 2026-10-29 dopo la ricerca e autoritativo su `10-RESEARCH.md`).
- **Data:** 2026-10-30. Documento di fine fase (piano 10-30), scritto dopo i piani 10-01..10-29 e prima del gate finale 10-31.
- **Risponde a:** `Klimmeck-Guide/.planning/phases/10-admin-panel-innkeeper/BACKEND-NOTES.md` (proposta FE: §2 richiesta BE-HARD-08, §3 comportamento del pannello, §4 domande aperte, §5 piano UAT). Le risposte numerate sono in §4.
- **Branch:** `feat/10-hardening` (rebasato su `develop`) → PR verso `develop`, **in draft** finché la migrazione dei ref non è verificata in produzione (`docs/runbooks/mixed-refs-migration.md`, §10 e §11). Il piano gated della FE Phase 10 che seleziona `pendingQuest` parte dopo la merge.
- **Schema:** `src/schema.gql` è **solo additivo** rispetto a `origin/develop`: 0 righe `-`, una sola riga `+` (`  pendingQuest: ID` in `type PendingRequestCharacter`, §1). Tutto il resto della fase cambia codici d'errore, comportamento e infrastruttura, non la forma dello schema.
- **Fonte:** ogni nome, codice, messaggio e riga di SDL è copiato dal codice (`src/schema.gql`, `src/validation/bad-user-input.exception.ts`, `src/throttling/too-many-requests.exception.ts`, `src/moderation/image-moderation.exceptions.ts`, `src/moderation/image-policy.ts`, `src/gameRules/game-rule.exception.ts`, `src/graphql/production-errors.ts`, `src/config/*-config.ts`) e dai SUMMARY 10-01..10-29. **Lo schema generato `src/schema.gql` vince su questo documento.**
- **Regola dei letterali:** operatori Mongo e identificatori di gate compaiono qui solo in code span o blocchi di codice; nessun valore reale (chiavi, URI, id): solo placeholder fra `<…>` o valori finti evidenti.

---

## 0. TL;DR per il FE

1. **Validazione (BE-HARD-01):** ogni input GraphQL e REST passa da una `ValidationPipe` globale; una violazione risponde `extensions.code = 'BAD_USER_INPUT'` con il messaggio `Input non valido: <campi>` (solo i percorsi dei campi, mai i valori). Gli id malformati rispondono `BAD_USER_INPUT` ovunque (prima `NOT_FOUND` o codici di dominio): tabella completa in §3. Le proprietà non dichiarate vengono scartate in silenzio (il deprecato `EquipSpellRequest.usages` non arriva più al service).
2. **Superficie di produzione (BE-HARD-02):** con `NODE_ENV=production` introspection e landing page sono spente (anche su WS), gli errori di validazione non suggeriscono campi e ogni errore imprevisto diventa `INTERNAL_SERVER_ERROR` con `message: 'Errore interno'` ed `extensions.requestId`. Il FE controlla lo schema su `src/schema.gql`, mai con l'introspection (§5).
3. **Throttling (BE-HARD-02):** solo login (`exchangeLoginTicket`, `refreshSession`), avvio e callback OAuth, webhook EventSub e REST Cloudinary; oltre il limite `TOO_MANY_REQUESTS` (REST 429 con `Retry-After`); l'OAuth redirige al deep link con `error=rate_limited`. Nessuna mutation di gioco è limitata (§7).
4. **Moderazione (BE-HARD-05):** `POST /cloudinary/uploadImage` modera il ritratto con Sightengine prima di caricarlo: rifiuto 422 `IMAGE_REJECTED`, servizio giù 503 `IMAGE_MODERATION_UNAVAILABLE`; `imagePath` resta facoltativo nella creazione. Quick task FE con il copy di §2 e §6.
5. **Coda del GM (BE-HARD-08):** `PendingRequestCharacter.pendingQuest: ID` (id della PendingQuest standard, `null` se la corsia è libera); `completePendingRequest` rifiuta con `QUEST_IN_PROGRESS` senza scritture finché un partecipante ha la corsia standard occupata (§4).
6. **Seat holder (BE-HARD-07, D-21):** i registrati archiviati dopo l'avvio di una quest combattono ancora nel boss e nel soccorso di gruppo («posto pieno»), ma non ricevono risultati né premi (§8).
7. **Avvio da soli (BE-HARD-07, D-22):** il primo `characterUpdated` dopo l'arrivo su una quest da soli porta già `quests.pendingQuest.startDate`; ogni membro di un party riceve un `characterUpdated` all'avvio (§8).
8. **Audit:** `completePendingRequest` registra il target `{ type: 'PendingQuest', id: <pendingQuestId> }`, anche sui rifiuti (§9).

---

## 1. Contratto GraphQL (additivo)

Unica riga nuova di tutta la fase rispetto a `origin/develop` (piano 10-01). Blocco verbatim da `src/schema.gql`:

```graphql
type PendingRequestCharacter {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  id: ID!
  location: ID!
  name: String!
  pendingQuest: ID
  title: String!
}
```

- `pendingQuest` = id della PendingQuest della **corsia standard** del personaggio (`quests.pendingQuest`), `null` se la corsia è libera. È solo un id: il FE lo usa come «occupato / libero».
- Nessun'altra riga dello SDL è cambiata: nessun tipo, campo, argomento o enum nuovo o rimosso. I codici nuovi di §2 viaggiano in `extensions.code` (GraphQL) o nel corpo JSON (REST), fuori dallo schema.

Esempio di query della coda con il campo nuovo (forma; il FE la registra nel suo piano gated):

```graphql
query GetPendingRequests {
  pendingRequests {
    id
    startDate
    quest { id }
    character {
      id
      name
      activeTravel { endTime }
      awaitingAid { since }
      pendingQuest
    }
  }
}
```

---

## 2. Codici nuovi

Il FE mappa il **codice**, mai il messaggio. Su GraphQL `extensions` è esattamente `{ code }` (più `requestId` solo per `INTERNAL_SERVER_ERROR`).

| Codice | Dove | Forma | Messaggio | Copy FE suggerito |
|--------|------|-------|-----------|-------------------|
| `BAD_USER_INPUT` | GraphQL (ogni query, mutation e subscription con input) e REST (`/cloudinary/*`) | GraphQL: `extensions: { code: 'BAD_USER_INPUT' }`; REST 400 `{ statusCode: 400, error: 'Bad Request', code: 'BAD_USER_INPUT', message }` | `Input non valido: <campi>` con i percorsi separati da virgola, es. `Input non valido: outcomes.0.hpAfter`, `Input non valido: boughtItems.equipAssets.0.quantity`, `Input non valido: id` | generico, «Richiesta non valida, riprova» (nessun id malformato nasce da un uso lecito dell'app); nei form con vincoli il FE resta il primo filtro |
| `TOO_MANY_REQUESTS` | GraphQL (`exchangeLoginTicket`, `refreshSession`) e REST (`/cloudinary/*`, webhook EventSub) | GraphQL: `{ message: 'Troppe richieste', extensions: { code: 'TOO_MANY_REQUESTS' } }`; REST 429 `{ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Troppe richieste' }` con header `Retry-After` (secondi) | `Troppe richieste` | «Troppi tentativi, riprova fra un minuto»; il refresh di sessione in sessione attiva ritenta in silenzio dopo `Retry-After` (nessun loading bloccante) |
| `rate_limited` | redirect OAuth di `GET /auth/twitch/start` e `GET /auth/twitch/callback` (navigazioni del browser, niente JSON) | 302 verso `<APP_AUTH_REDIRECT_URL>?error=rate_limited` (nuovo valore `TwitchLoginErrorCode.RATE_LIMITED`; gli altri redirect invariati) | — | «Troppi tentativi di accesso, riprova fra un minuto» sulla schermata di login |
| `IMAGE_REJECTED` | REST `POST /cloudinary/uploadImage` | 422 `{ statusCode: 422, code: 'IMAGE_REJECTED', message: 'Immagine non ammessa', reasons: [<categorie>] }`, senza punteggi; nessun upload su Cloudinary | `Immagine non ammessa` | «Immagine non ammessa, scegline un'altra» (D-14); `reasons` solo per log o telemetria, non da mostrare |
| `IMAGE_MODERATION_UNAVAILABLE` | REST `POST /cloudinary/uploadImage` | 503 `{ statusCode: 503, code: 'IMAGE_MODERATION_UNAVAILABLE', message }`; nessun upload | `Moderazione delle immagini non disponibile, riprova più tardi` | «Riprova o procedi senza immagine» (D-14): `imagePath` è facoltativo |
| `INTERNAL_SERVER_ERROR` + `requestId` | GraphQL HTTP e WS in produzione; REST in produzione | GraphQL: `{ message: 'Errore interno', locations, path, extensions: { code: 'INTERNAL_SERVER_ERROR', requestId } }`; REST 500 `{ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'Errore interno', requestId }`; header `x-request-id` | `Errore interno` | «Qualcosa è andato storto, riprova»; il FE può loggare `requestId` per il supporto |
| `QUEST_IN_PROGRESS` (sul completamento del GM) | `completePendingRequest` | `extensions: { code: 'QUEST_IN_PROGRESS' }`, nessuna scrittura | `Il personaggio è impegnato in una missione in corso` | pannello: ricaricare la coda e nascondere il partecipante occupato (§4); il codice esisteva già per viaggio e teleport, il messaggio di completamento è nuovo |
| `NOT_FOUND` del catalogo | `lore`, `pet`, `city`, `enemy`, `lootItem`, `equipmentItem`, `pointOfInterest`, `spell` (e `getPath` con un luogo ben formato ma inesistente) | `extensions: { code: 'NOT_FOUND' }` | messaggi fissi senza id: `Lore non trovata`, `Compagno non trovato`, `Città non trovata`, `Nemico non trovato`, `Oggetto non trovato`, `Equipaggiamento non trovato`, `Luogo non trovato`, `Magia non trovata` | come gli altri `NOT_FOUND`: elemento sparito, ricaricare |

Note:

- **`requestId`:** l'header `x-request-id` in ingresso è riusato se rispetta `/^[A-Za-z0-9._-]{1,64}$/`, altrimenti il BE genera un uuid; il middleware REST lo restituisce sempre nell'header `x-request-id` della risposta. Su GraphQL `extensions.requestId` compare su ogni `INTERNAL_SERVER_ERROR` (anche fuori produzione, dove però il messaggio originale non viene sanificato). Il server logga l'errore completo con lo stesso id.
- **Ordine dei codici sul completamento del GM:** `UNAUTHENTICATED` → `FORBIDDEN` → `BAD_USER_INPUT` → `NOT_FOUND` → `QUEST_IN_PROGRESS` → `OUTCOME_*`.
- **REST, contratto completo di `POST /cloudinary/uploadImage`:** 201 `{ url }`; 400 `BAD_USER_INPUT` con `Input non valido: file` (file mancante, non immagine JPEG/PNG/WEBP per firma, due file) o `Input non valido: folder` sulle liste; 413 oltre 5 MiB; 422 `IMAGE_REJECTED`; 503 `IMAGE_MODERATION_UNAVAILABLE`; 429 `TOO_MANY_REQUESTS`; 500 codificato in produzione; `x-request-id` su ogni risposta. Il tipo reale è letto dai primi byte: il FE può continuare a inviare `application/octet-stream`.

---

## 3. Codici spostati

Un id malformato non nasce da un uso lecito dell'app: il FE mostra un **copy generico** per `BAD_USER_INPUT` e non distingue i casi. I codici di dominio restano per gli id ben formati ma inesistenti.

| Operazione | Caso | Prima | Dopo dalla Phase 10 |
|------------|------|-------|---------------------|
| `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`, `character`, `equipment` | id del personaggio malformato (avventuriero e innkeeper) | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `characterUpdated` | id del personaggio malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `doTransaction` | quantità negativa | `INVALID_QUANTITY` | `BAD_USER_INPUT` (es. `boughtItems.equipAssets.0.quantity`) |
| `doTransaction` | id di item malformato | `ITEM_NOT_FOUND` | `BAD_USER_INPUT` (es. `boughtItems.equipAssets.0.item`) |
| `doTransaction` | monete negative nel totale | `TRANSACTION_TOTAL_MISMATCH` | `BAD_USER_INPUT` (es. `total.copper`) |
| `equipItem` | `itemId` malformato | `ITEM_NOT_OWNED` | `BAD_USER_INPUT` `Input non valido: itemId` |
| `createCharacter` | tetti di FORMA (fix C-WR-01 della code review, 2026-10-30): `name` oltre 200 caratteri; `background` oltre 4000 unità di codice; `imagePath` oltre 2048. Entro i tetti restano le regole di dominio (nome 2–20, background ≤ 500 grafemi, `imagePath` https) | `name` 21..200 → `CHARACTER_NAME_INVALID` (invariato); `background`/`imagePath` oltre il dominio → `BAD_USER_INPUT` con il messaggio di dominio | oltre i tetti di forma: `BAD_USER_INPUT` `Input non valido: name` / `background` / `imagePath` (stesso codice per background e imagePath, messaggio della pipe al posto di quello di dominio) |
| `equipSpell` | `spellId` malformato | `SPELL_NOT_KNOWN` | `BAD_USER_INPUT` `Input non valido: spellId` |
| `unequipSpell` | `spellId` malformato | `SPELL_NOT_ACTIVE` | `BAD_USER_INPUT` `Input non valido: spellId` |
| `useSpell` | `spellId` malformato | `SPELL_NOT_ACTIVE` | `BAD_USER_INPUT` `Input non valido: spellId` |
| `acceptQuest` | `questId` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: questId` |
| `acceptQuest` | `id` del personaggio malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `startTravel` / `travelPreview` | `poiId` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: poiId` |
| `startTravel` / `travelPreview` | `id` del personaggio malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `teleportCharacter` | `poiId` o `id` malformato (audit con esito `BAD_USER_INPUT`) | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: poiId` / `id` |
| `completePendingRequest` | `pendingQuestId` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: pendingQuestId` |
| `completePendingRequest` | `outcomes[].characterId` malformato | `OUTCOME_NOT_PARTICIPANT` | `BAD_USER_INPUT` `Input non valido: outcomes.0.characterId` |
| `completePendingRequest` | `hpAfter` negativo, quantità o usi negativi | `OUTCOME_OVERRIDE_INVALID` | `BAD_USER_INPUT` (es. `outcomes.0.hpAfter`) |
| `completePendingRequest` | più di 50 voci in `outcomes` (o in una delle sue liste, col percorso della lista) | `OUTCOME_OVERRIDE_INVALID` | `BAD_USER_INPUT` `Input non valido: outcomes` |
| `pendingQuest` | `id` malformato (avventuriero e innkeeper) | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `questResult` | `id` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `acknowledgeQuestResult` | `id` malformato (nessuna lettura del DB) | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `quest` | `id` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `questUpdated` | `questId` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: questId` |
| `user` (innkeeper; l'avventuriero riceve `FORBIDDEN` prima) | `id` malformato | `NOT_FOUND` | `BAD_USER_INPUT` `Input non valido: id` |
| `getPath` | `from` / `to` malformati | `INTERNAL_SERVER_ERROR` (cast di Mongoose) | `BAD_USER_INPUT` `Input non valido: from` / `to` |
| `getPath` | luogo ben formato ma inesistente | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` `Luogo non trovato` |
| `lore`, `pet`, `pointOfInterest`, `spell`, `lootItem`, `city`, `equipmentItem`, `enemy` | `id` malformato | `INTERNAL_SERVER_ERROR` (cast di Mongoose) | `BAD_USER_INPUT` `Input non valido: id` |
| stessi otto | `id` ben formato inesistente | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` con il messaggio fisso di §2 |
| `lootItemsByIds`, `equipmentItemsByIds` | più di 100 id | accettato | `BAD_USER_INPUT` `Input non valido: ids` |
| `lootItemsByIds`, `equipmentItemsByIds` | un id malformato nella lista | `INTERNAL_SERVER_ERROR` (cast) | `BAD_USER_INPUT` `Input non valido: ids` |
| `sendTestPush` | `targetUserId` malformato (anche nel broadcast `streamerLive`) | `NOT_FOUND` (ignorato nel broadcast) | `BAD_USER_INPUT` `Input non valido: targetUserId` |
| `sendTestPush` | `id` oltre 2000 caratteri | accettato | `BAD_USER_INPUT` `Input non valido: id` |

**Invariati** (codici di dominio per valori ben formati): `INVALID_QUANTITY` per la quantità 0 in `doTransaction`; `CHARACTER_NAME_INVALID` e gli altri codici della creazione; `imagePath` non https → `BAD_USER_INPUT` del dominio con il suo messaggio `L'immagine deve essere un URL https valido`; `PUSH_INVALID_DEVICE_ID`; `OUTCOME_OVERRIDE_INVALID` per lo 0 nei consumi, gli HP oltre il massimo, i duplicati e i possessi insufficienti; `NOT_FOUND`, `SPELL_NOT_KNOWN`, `SPELL_NOT_ACTIVE`, `ITEM_NOT_OWNED`, `ITEM_NOT_FOUND` per gli id ben formati inesistenti. Il servizio di equip conserva `ITEM_NOT_OWNED` come difesa se un id malformato arrivasse oltre la pipe (caso solo interno).

---

## 4. Coda del GM e corsia standard (BE-HARD-08)

Regola dell'utente (verbatim, 2026-10-29): *«Nessun personaggio che ha accetato una quest, che sia in viaggio o in combattimento, non deve comparire nella lista dei pending che l'admin può gestire. Se sei in viaggio da una città all'altra invece questa regola non vale»*. Chiarito con l'utente: la quest è quella della **corsia standard** (`quests.pendingQuest`), sia in viaggio verso di essa sia nel suo tempo di attesa o combattimento; il viaggio libero fra città non nasconde.

- **Campo:** `PendingRequestCharacter.pendingQuest` (§1). La voce **resta nella lista**: il FE la nasconde o la attenua (scelta dell'utente nel discuss FE: campo additivo più rifiuto, non filtro server-side). La coda esclude ora i personaggi archiviati (filtro sui soli attivi).
- **Rifiuto:** `completePendingRequest` risponde `QUEST_IN_PROGRESS` con `Il personaggio è impegnato in una missione in corso` finché **un qualsiasi partecipante registrato attivo** (titolare della story; ogni titolare attivo della worldMission) ha la corsia standard occupata. Pre-controllo sugli snapshot letti e ricontrollo nella transazione (la stessa clausola di corsia standard libera di `teleportCharacter` e `startTravel`, applicata solo alle corsie del GM): **nessuna scrittura** su personaggi, PendingQuest, risultati o quest. Un viaggio libero continua a **non** bloccare il completamento (il FE disabilita il pulsante come UX).
- **Ordine dei codici:** `UNAUTHENTICATED` → `FORBIDDEN` → `BAD_USER_INPUT` → `NOT_FOUND` → `QUEST_IN_PROGRESS` → `OUTCOME_*`. Due completamenti concorrenti: uno riesce, l'altro `NOT_FOUND` come prima, oppure `QUEST_IN_PROGRESS` se nel frattempo un partecipante ha occupato la corsia.
- **Liveness:** ogni transizione della corsia standard inserisce o elimina la PendingQuest nella stessa transazione, quindi `pendingRequestsUpdated` riemette la lista intera da sola: accettazione, risoluzione, abbandono, scioglimento del party (int-spec `standard lane liveness of the innkeeper queue (D-24)`). Dal piano 10-01 la coda si ricalcola anche quando un personaggio viene **archiviato** (prima restava in lista fino al refetch).

### Risposte alle domande della FE Phase 10 (§4)

1. **Emissione al cambio di posizione o di viaggio (§2.3):** **no**. `pendingRequestsUpdated` continua a riemettere solo agli inserimenti ed eliminazioni di PendingQuest e, dalla Phase 10, all'archivio di un personaggio; un teleport o l'inizio e la fine di un viaggio libero non riemettono. Il FE tiene i refetch del suo §3.5 come pianificato. Fonte: piano 10-01 (`ArchivedCharacterQueueRefresher`), nessun publisher sulla posizione.
2. **Messaggio di `QUEST_IN_PROGRESS` sul completamento:** **dedicato**, stesso codice: `Il personaggio è impegnato in una missione in corso` (factory `participantQuestInProgress`, piano 10-02). Il messaggio del viaggio (`questInProgress`) resta per viaggio e teleport. Il FE mappa il codice.
3. **`startDate == null` per story o worldMission:** **no** per ogni PendingQuest scritta dal codice attuale: le corsie del GM sono avviate all'accettazione (`startDate` = `arrivedAt` = istante dell'accettazione, nessun viaggio automatico; `initialLaneDatesOf` in `src/quests/party/party-rules.ts`). Il FE può tenerlo come informazione d'ordine; un documento storico scritto a mano senza la data resta l'unica eccezione teorica, e il FE lo tratta già come solo informativo.

Domande lasciate all'utente: nessuna (le tre del §4 FE sono chiuse).

---

## 5. Superficie di produzione

- **Introspection e landing page:** spente con `NODE_ENV=production`, anche sul WS (regola di validazione che vieta l'introspection nelle opzioni graphql-ws). Attive in `development` e `test`. Una riga di log al boot dichiara la modalità (`Modalità <mode>: introspection e landing page spente|attive`); con `NODE_ENV` vuoto il boot avvisa (`NODE_ENV vuoto: avvio in development. In produzione impostare NODE_ENV=production`).
- **Nessun suggerimento di campi:** in produzione gli errori di validazione GraphQL non contengono «Did you mean…»; sul WS sono ricreati con il codice `GRAPHQL_VALIDATION_FAILED` senza suggerimenti.
- **Errori sanificati:** ogni errore privo di codice di dominio o di autenticazione diventa `{ message: 'Errore interno', extensions: { code: 'INTERNAL_SERVER_ERROR', requestId } }` (HTTP; sul WS la stessa forma nel payload `next` o nel messaggio `error`), senza stack; i codici di dominio passano invariati. Fuori produzione tutto come prima.
- **CORS chiuso per scelta (D-06, «Chiuso e basta»):** nessun header CORS, nessuna variabile `CORS_*`. L'app mobile, il webhook EventSub (server-to-server) e la callback OAuth (navigazione top-level) non ne risentono; un futuro client web richiederà una modifica di codice.
- **Schema check del FE:** sempre su `src/schema.gql` del BE (`origin/develop`), mai con l'introspection contro un server di produzione.

---

## 6. Moderazione delle immagini

- **Flusso:** `POST /cloudinary/uploadImage` → validazione del file (firma JPEG/PNG/WEBP, ≤ 5 MiB, un solo file) → moderazione del buffer con Sightengine (`POST https://api.sightengine.com/1.0/check.json`, timeout 5 s) → upload su Cloudinary **solo se approvata** → 201 `{ url }`. Nessuna immagine respinta tocca Cloudinary. Chiude il debito BE-CHAR-04 della Phase 2.1.
- **Modelli (verbatim, D-12):** `nudity-2.1,offensive-2.0,text-content,face-age,gore-2.0,text,qr-content,self-harm`.
- **Tabella di policy** (`src/moderation/image-policy.ts`, soglia uniforme `MODERATION_THRESHOLD = 0.5`, confronto «maggiore di»):

| Categoria | Regola | Azione |
|-----------|--------|--------|
| `nudity` | max di `sexual_activity`, `sexual_display`, `erotica`, `very_suggestive` > 0.5 | rifiuto |
| `offensive` | una classe fra `nazi`, `asian_swastika`, `confederate`, `supremacist`, `terrorist`, `middle_finger` > 0.5 | rifiuto |
| `gore` | `gore.prob` > 0.5 | rifiuto |
| `self-harm` | `self-harm.prob` > 0.5 | rifiuto |
| `minor` | un volto **reale** con `attributes.age.minor` > 0.5 | rifiuto |
| `minor-artificial` | un volto artificiale (disegno, ritratto generato) con `attributes.age.minor` > 0.5 | solo log (A3) |
| `text-profanity` / `text-personal` | lista non vuota sotto `text` | rifiuto |
| `qr` | una lista non vuota fra `personal`, `link`, `social`, `profanity`, `spam` sotto `qr` | rifiuto (A4) |
| `text-present` | `text.has_artificial` o `text.has_natural` > 0.5 | solo log |
| `text-<categoria>` | `link`, `social`, `extremism`, `medical`, `drug`, `weapon`, `content-trade`, `money-transaction`, `spam`, `violence`, `self-harm` non vuote sotto `text` | solo log (A5) |

- **Immagine illeggibile per Sightengine** (errore media): 422 `IMAGE_REJECTED` con `reasons: ['unreadable']`.
- **Fail-closed (D-14):** Sightengine irraggiungibile, timeout, 5xx o quota → 503 `IMAGE_MODERATION_UNAVAILABLE`, nessun upload. Chiavi assenti con `NODE_ENV=production` → boot rifiutato. In `development`/`test` con le due chiavi vuote la moderazione è **disattivata** (approva sempre) con un WARN al boot.
- **Log:** INFO con esito e categorie, mai l'immagine, i punteggi completi o le chiavi; nessun audit (non è un'azione admin).
- **Per il FE:** `imagePath` resta facoltativo in `createCharacter`; un **quick task FE** mappa nella creazione del personaggio `IMAGE_REJECTED` («Immagine non ammessa, scegline un'altra») e `IMAGE_MODERATION_UNAVAILABLE` («Riprova o procedi senza immagine»), e `TOO_MANY_REQUESTS` sull'upload con il copy di §2. Nessun cambio ai codici di `createCharacter`.

---

## 7. Throttling

- **Handler limitati (8, enumerati dal boot reale):** `AuthResolver.exchangeLoginTicket`, `AuthResolver.refreshSession`, `CloudinaryController.getSubfoldersUrls`, `CloudinaryController.getUrls`, `CloudinaryController.uploadImage`, `EventSubController.receive`, `TwitchAuthController.callback`, `TwitchAuthController.start`.
- **Default (D-08):** finestra `THROTTLE_TTL_MS` vuota = 60 000 ms; `THROTTLE_LIMIT` vuota = 20 richieste per IP e per handler nella finestra; il webhook EventSub ha un bucket proprio 50 volte più alto (1 000 con i default), perché l'HMAC è verificato dopo le guard e il throttler non deve far perdere redemption legittime.
- **Storage in memoria** (una sola istanza); Redis per il throttler è nel backlog v1.1.
- **Dietro un proxy:** `THROTTLE_TRUST_PROXY` vuota = spenta (default, topologia non ancora decisa: tutti i client dietro un proxy condividerebbero un bucket); un numero = hop fidati; altrimenti un elenco di indirizzi. Quando è attiva il boot logga `Trust proxy attivo per il throttling` (senza il valore).
- **OAuth:** start e callback oltre il limite redirigono a `<APP_AUTH_REDIRECT_URL>?error=rate_limited` invece del 429 JSON.
- **Nessuna mutation di gioco limitata** (provato da un caso dedicato con un limite di 2).

---

## 8. Combattimento con i seat holder e avvio da soli (BE-HARD-07)

Utente (verbatim, 2026-10-29): *«Il nemico dovrebbe venir combattuto come se ci fossero ancora entrambi i personaggi, non solo Reavor. Altrimenti se tutti se ne andassero da una missione con un mostro forte sarebbe sconfitta automatica per chi resta. Per quello lasciamo il posto pieno»*.

- **Supera la 9.2 D-07** («la risoluzione scarta i registrati archiviati e combatte con chi resta»): alla risoluzione di una quest **avviata** i registrati archiviati dopo l'avvio («seat holder», segnaposto di posto) combattono con la fotografia del personaggio archiviato, nel boss e nel soccorso di gruppo.
- **Nessun risultato** è scritto per i seat holder e **nessun premio** è assegnato; le loro PendingQuest sono eliminate nella stessa transazione; risultati, premi e push solo per i posti vivi. Il FE non vede differenze sul filo (nessun campo nuovo); la registrazione resta in `registeredAdventurers` come già dalla 9.2.
- Invariati: con un boss perso il gruppo libera i posti e la quest torna non avviata; «tutti archiviati ⇒ quest non avviata» resta la regola dell'archivio.
- **Avvio da soli (D-22):** per una quest **senza posti** `startDate` è scritto nella stessa transazione dell'arrivo (o del claim sul marker all'accettazione), quindi:
  - il primo `characterUpdated` dopo l'arrivo porta già `quests.pendingQuest.startDate` = `arrivedAt` = `endTime` del viaggio;
  - all'accettazione direttamente sul marker (o dopo un teletrasporto) l'evento del claim porta `startDate` = istante dell'accettazione;
  - all'avvio di un **party** (completo o dallo sweep) ogni membro riceve un `characterUpdated` con `startDate` valorizzato.
  Il FE non resta più su «arrivato, non avviato» per le quest da soli (difetto F3 della UAT della FE Phase 9). Schema invariato.
- **Realtime più robusto:** tutti i change stream (personaggi, utenti, quest, risultati, coda del GM) si riaprono da soli con backoff esponenziale (1 s → 30 s) e riprendono dal token; nessuna azione FE oltre alle riconnessioni WS già previste.

---

## 9. Audit

- `completePendingRequest` registra il target `{ type: 'PendingQuest', id: <pendingQuestId> }` dichiarato con `@AuditTarget` e letto dall'interceptor, **anche sui rifiuti** (`OUTCOME_*`, `QUEST_IN_PROGRESS`, e `BAD_USER_INPUT` con l'id uguale alla stringa ricevuta). Prima era `{ type: 'QuestResult', id: null }`.
- L'interceptor dell'audit gira prima della pipe: gli input malformati delle mutation admin sono registrati con esito `BAD_USER_INPUT`.
- Gli altri target dell'audit sono invariati.

---

## 10. Checklist di deploy

Da completare **prima** di marcare pronta la PR e di rilasciare (D-10, D-18):

- [ ] **`NODE_ENV`** ∈ {`development`, `test`, `production`}; ogni altro valore rifiuta il boot (`NODE_ENV must be one of development, test, production (staging uses production)`); vuoto = `development` con WARN. **Uno staging usa `production`** a tutti gli effetti: bypass dev vietato, introspection spenta, chiavi obbligatorie.
- [ ] **Chiavi obbligatorie in produzione** (boot rifiutato senza, messaggi esatti di `validateEnv`):
  - `FIREBASE_SERVICE_ACCOUNT` — `FIREBASE_SERVICE_ACCOUNT is required when NODE_ENV=production`;
  - `SIGHTENGINE_USER_ID` e `SIGHTENGINE_API_SECRET` — `SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET are required when NODE_ENV=production` (una sola delle due, ovunque: `SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET must be set together`);
  - `JWT_SECRET` (almeno 32 caratteri, ovunque);
  - Twitch: `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET`, richieste dal callback EventSub https (`TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required when TWITCH_EVENTSUB_CALLBACK_URL is https …`) e necessarie al login; `TWITCH_REDIRECT_URI` e `APP_AUTH_REDIRECT_URL` (deep link validato al boot) con i valori di produzione;
  - EventSub: `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_BROADCASTER_ID` — `TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID are required when NODE_ENV=production`;
  - `DEV_AUTH_ENABLED` diverso da `true` (con `production` il bypass rifiuta il boot).
- [ ] **Redis:** `maxmemory-policy noeviction` (con una policy di eviction i delayed job delle code possono sparire; reconciler e sweep li compensano, ma non vanno persi in silenzio). I job falliti restano al massimo 7 giorni o 1 000 per coda (`removeOnFail` limitato, `FAILED_JOBS_KEPT`).
- [ ] **Throttling:** `THROTTLE_TTL_MS` e `THROTTLE_LIMIT` vuote = default (§7); `THROTTLE_TRUST_PROXY` vuota finché la topologia non è nota; dietro un reverse proxy impostarla (numero di hop o elenco di indirizzi) e controllare nel log del boot `Trust proxy attivo per il throttling`.
- [ ] **MongoDB ≥ 4.2** in produzione (`db.version()`; assunzione A1 da verificare per prima cosa: sotto 4.2 lo script di migrazione si ferma senza scrivere).
- [ ] **Migrazione dei ref** secondo `docs/runbooks/mixed-refs-migration.md`, nell'ordine: backup (`mongodump`) → ripristino su una copia e prova (`--dry-run`, `--apply`, `--verify`, seconda `--apply` con 0 modificati) → produzione **col codice attuale** `--dry-run`, `--apply`, `--verify` (exit 0) **PRIMA del deploy** → allegare alla PR i report JSON di `--verify` di copia e produzione e solo allora marcare la PR pronta → deploy → **subito dopo il deploy** di nuovo `--apply` + `--verify` → nel log del primo boot nessun ERROR `Ref stringa ancora da migrare: …` (altrimenti rieseguire `--apply` + `--verify`). Rollback = ridistribuire il codice precedente (legge sia `ObjectId` sia stringhe); la migrazione non si annulla, il dump si ripristina solo se lo script ha prodotto dati sbagliati. Forma dei comandi: `node --env-file=<file env fuori repo> dist/migrations/run-mixed-refs.js --verify`.
- [ ] **Primo scan completo dei secret:** dopo il push del branch, `gh workflow run gitleaks.yml --ref feat/10-hardening` (workflow `Secret scan`, gitleaks 8.24.3) e lettura del summary e del SARIF. Push e PR scansionano solo i commit dell'evento; la storia completa gira con `workflow_dispatch` e ogni lunedì (schedule).
- [ ] **Rotazione dei secret trovati (D-10):** per ogni finding reale ruotare il secret **alla fonte** (Mongo, JWT, Twitch, Cloudinary, Firebase, Sightengine) e aggiungere la fingerprint in `.gitleaksignore` (formato `commit:file:rule-id:line`) con un commento datato; **mai riscrivere la storia**. Falsi positivi nella documentazione di `.planning/`: aggiungere `'''^\.planning/'''` ai `paths` dell'allowlist. La fase non può verificare la rotazione: spetta all'utente.
- [ ] **CI:** il job ora esegue `Lint` → `Build` → `Type check` (`npx tsc --noEmit -p tsconfig.json`) → `Tests with coverage` (`npm run test:cov`, unit + integration, soglie per area di §12) → `Schema up to date`. Il CLI di migrazione è provato in forma compilata: `npm run build` deve precedere i test (già così in CI).
- [ ] **Flaky del boot reale** (`test/app.int-spec.ts` › global auth guard; 1 fallimento su 3 al 10-24, poi verde in ogni run successivo): se riappare in CI catturare l'errore completo e aprire un fix della sola spec; altrimenti nessuna azione.
- [ ] Indici nuovi (8, con nome) costruiti al boot in background da `SweepIndexVerifier`: un fallimento è solo loggato (lo sweep resta corretto ma più lento). Nessuna dipendenza di sistema nuova.

---

## 11. Da confermare prima della PR

Default scelti durante l'esecuzione o assunzioni della ricerca che l'utente conferma (o cambia) **prima** di aprire la PR. Per ciascuno: dove si cambia.

| # | Default / assunzione | Valore attuale | Dove si cambia |
|---|----------------------|----------------|----------------|
| 1 | Tabella di policy Sightengine (D-13), soglia uniforme | 0.5 per ogni classe, tabella di §6 | `src/moderation/image-policy.ts` (`MODERATION_THRESHOLD`, `IMAGE_POLICY`) |
| 2 | A2 — `text-content` (legacy) e `text` condividono la chiave `text` della risposta: fusione | rifiuto per `profanity`/`personal`, log per il resto | `src/moderation/image-policy.ts`; **serve una chiamata reale con le chiavi vere** (dall'utente, fuori dai test) per confermare la forma della risposta |
| 3 | A3 — `face-age`: rifiuto solo per volti reali stimati minorenni, volti artificiali solo log | confermato dall'utente il 2026-10-29 («Solo volti reali stimati minorenni»), da rivedere sulla tabella finale | `src/moderation/image-policy.ts` (`minor`, `minor-artificial`) |
| 4 | A4 — «qualunque QR» = una lista non vuota sotto `qr` (`personal`, `link`, `social`, `profanity`, `spam`) | rifiuto | `src/moderation/image-policy.ts` (`QR_CLASSES`) |
| 5 | A5 — categorie di `text` diverse da volgarità e dati personali | solo log | `src/moderation/image-policy.ts` (`LOGGED_TEXT_CLASSES`) |
| 6 | Moderazione disattivata fuori produzione con chiavi vuote | approva tutto con WARN al boot | `src/moderation/moderation.module.ts` (`createImageModerator`), `src/config/moderation-config.ts` |
| 7 | A6 — throttle: finestra, limite, fattore del webhook | 60 000 ms, 20 richieste, ×50 | `src/config/throttle-config.ts` (`DEFAULT_THROTTLE_TTL_MS`, `DEFAULT_THROTTLE_LIMIT`, `WEBHOOK_LIMIT_FACTOR`) o le variabili `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` |
| 8 | A7 — topologia del proxy | `THROTTLE_TRUST_PROXY` vuota = spenta | variabile `THROTTLE_TRUST_PROXY` (§7) |
| 9 | Nuovo `error=rate_limited` sul deep link OAuth (codice additivo per il FE) | attivo | `src/auth/twitch/` (`TwitchLoginErrorCode.RATE_LIMITED`), `src/throttling/oauth-rate-limit-redirect.filter.ts` |
| 10 | A8 — sintassi dell'allowlist con gitleaks 8.24.3: tabella singola `[allowlist]` (non `[[allowlists]]`) | `.gitleaks.toml` | verificare nel primo `workflow_dispatch` che `.env.example` e le fixture di test non producano finding; altrimenti adeguare `.gitleaks.toml` |

---

## 12. Coverage

Soglie per area (statements / branches / lines) in `package.json` (`coverageThreshold`), misurate con `npm run test:cov` (unit + integration) e mai abbassate (tabella finale del SUMMARY 10-25):

| Area | Baseline RESEARCH | Misura finale | Soglia finale |
|------|-------------------|---------------|---------------|
| `./src/auth/` | 99.66 / 85.05 / 99.81 | 99.83 / 86.71 / 100 | 97 / 84 / 98 |
| `./src/economy/` | 99.62 / 91.84 / 99.57 | 100 / 93.88 / 100 | 98 / 91 / 98 |
| `./src/characters/spells/` | 98.53 / 88.56 / 98.89 | 99.26 / 90.05 / 99.45 | 97 / 88 / 97 |
| `./src/characters/equipment/` | 100 / 100 / 100 | 100 / 100 / 100 | 98 / 98 / 98 |
| `./src/characters/characters.service.ts` | 96.24 / 86.20 / 96.77 | 98.26 / 90.38 / 100 | 96 / 88 / 98 |
| `./src/quests/acceptance/` | 99.39 / 91.94 / 100 | 99.41 / 93.25 / 100 | 97 / 91 / 98 |
| `./src/eventsub/` | 98.80 / 91.64 / 99.32 | 99.40 / 94.03 / 99.49 | 97 / 92 / 97 |
| `./src/travel/` | 99.53 / 85.10 / 99.48 | 99.55 / 86.96 / 100 | 97 / 84 / 98 |

Ultimo gate (10-29): `npm run test:cov` 278 suite / 3667 test, soglie rispettate, totale S 96.55 / B 85.14 / L 97.1.

---

## 13. Deviazioni e punti aperti

**Precisazioni dopo la code review (2026-10-30):**
- D-14 (fail-closed): una risposta Sightengine `success` senza alcuna sezione dei modelli ora vale «indisponibile» (503 `IMAGE_MODERATION_UNAVAILABLE`), non «approvata»; la tolleranza per singola sezione mancante (nessuna rilevazione) resta.
- D-17a (change stream): alla perdita della storia (codice 286) la base espone un hook di risincronizzazione; i publisher della coda del GM chiedono un refresh completo della coda, gli altri publisher restano sul solo WARN (nessuna ripubblicazione totale economica).
- D-04/C4: tetti di forma su `createCharacter` (riga in §3).


**Deviazioni registrate nei SUMMARY 10-01..10-29** (nessuna cambia il contratto verso il FE o una decisione utente):

- Inventario dei ref `Mixed`: **34 percorsi in 10 collection** (non 33 in 9 come nel RESEARCH; la collection delle lore si chiama `lore`), derivato dagli schemi reali e fissato da una spec (10-26).
- `tsc --noEmit` con i tipi jest: 64 errori latenti in 26 spec (non 56 in 23), corretti solo nei test; il type check è ora un gate della CI (10-20).
- Sul WS gli errori di validazione sono ricreati con `GRAPHQL_VALIDATION_FAILED` senza suggerimenti (aggiunta di correttezza al piano, 10-11).
- Il broadcast `streamerLive` di `sendTestPush` rifiuta ora un `targetUserId` malformato invece di ignorarlo (10-08).
- Un test instabile della manutenzione dei risultati è stato corretto nella sola spec (10-24); il flaky del boot reale resta annotato (§10).
- Un subject di commit di 73 caratteri (d9d7984), imposto dal piano, non riscritto.

**Punti aperti:**

- **Migrazione dei ref in produzione:** PENDENTE (utente), bloccante per marcare la PR pronta (§10, runbook).
- **Primo scan gitleaks della storia e rotazione** dei secret eventualmente trovati: PENDENTE (utente).
- **Default di §11:** da confermare dall'utente prima della PR.
- **Open Question 6 della 9.2** (registrati attivi senza PendingQuest su una quest avviata in cui tutti gli altri sono archiviati): non affrontata dalla Phase 10, resta aperta.

**Backlog v1.1:**

- Rimozione dei lettori tolleranti (`refIdOf`, `idForms`, `sameId`, `objectIdFromHex`) dopo la verifica della migrazione in produzione.
- Storage Redis del throttler (più istanze).
- Sweep delle morti mai confermate (rinviato dall'utente il 2026-10-29, «Rinvia al backlog»).
- Moderazione dei testi liberi (nome, background) con `text-content`.
- Allowlist CORS da env quando esisterà un client web; scansione completa della storia a ogni PR e hook pre-commit gitleaks se serviranno.
