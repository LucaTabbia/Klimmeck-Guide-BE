# BACKEND-NOTES — Phase 26 Eliminazione account e consenso (handoff per la FE Phase 25 e per l'orchestratore)

- **Fase BE:** 26-eliminazione-account-e-consenso (requisiti BE-DEL-01..09 e BE-CONSENT-01..02; decisioni D-03..D-26 di `26-CONTEXT.md`, numerazione condivisa col CONTEXT della FE Phase 25 fino a D-23, che è autorevole; D-24..D-26 solo del BE; nomi e ruling in `26-REPO-RULES.md`). **Companion:** FE Phase 25 «Account Deletion and Legal Consent», ramo FE `feat/25-account-deletion-and-legal-consent`.
- **Data:** 2026-11-25. Scritto dopo il gate 26-13 (`26-13-SUMMARY.md`), sulla HEAD del ramo più i soli commit di documentazione.
- **Branch:** `feat/26-eliminazione-account-e-consenso`, da `develop`; base dei diff `9a084248`. PR verso `develop` a cura dell'orchestratore (§7).
- **Gate 26-13:** `npx tsc --noEmit` 0; unit **326 suite / 4 867 test**; integration **170 suite** in sette blocchi `--runInBand`, tutti verdi (`src/account` + `test/account` 4 / 64, `src/auth` + `test/auth` + `src/users` 24 / 463, `src/quests/outcomes` 17 / 291, resto di `src/quests` 31 / 670, `src/characters` 30 / 494, `src/travel` 13 / 285, resto 55 / 766; quattro suite di `authz` contate in due blocchi, unione identica a `--listTests`).
- **Gate 26-13 (boot e SDL):** boot reale più matrice authz 2 suite / 255 test; SDL rigenerato identico al committato, **cinque righe aggiunte e nessuna tolta** dalla base.
- **Gate 26-13 (coverage):** `src/auth` 99,24 / 87,06 / 99,46 (soglia 97 / 84 / 98), `src/eventsub` 99,40 / 94,31 / 99,49 (97 / 92 / 97), `src/travel` 98,80 / 87,99 / 99,43 (97 / 84 / 98); senza soglia `src/account` 96,73 / 82,38 / 97,15 e `src/quests/party` 93,20 / 81,64 / 95,81; lint mirato pulito su 98 file; invarianti 1–9 delle REPO-RULES verificati. **`npm run test:cov` completo: a cura dell'orchestratore.**
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, migratore o file di contenuto. **Due** handler GraphQL nuovi (`deleteMyAccount` per ogni utente autenticato, `deleteAccountByTwitchLogin` solo oste, una riga in `test/authz/expected-handlers.ts`). Nuove collection: solo `portrait_deletions` (outbox interno dei ritratti, nessun legame con l'utente).
- **Fonte:** nomi, percorsi, testi e titoli dei casi copiati da `src/schema.gql`, dal codice e dai SUMMARY 26-01..26-13. **Il codice vince su questo documento.**

---

## 0. TL;DR per la FE

1. **SDL solo additivo:** cinque righe aggiunte (`type DeletedAccount` e le due mutation), nessuna tolta, nessun tipo cambiato (§1). La FE di oggi continua a funzionare contro il BE nuovo.
2. **`deleteMyAccount: Boolean!`** — nessun argomento, il bersaglio è chi chiama (bearer). `true` alla riuscita; errori `INNKEEPER_ACCOUNT_PROTECTED` (oste) e `UNAUTHENTICATED` (utente già sparito) (§2a).
3. **`deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!`** — solo oste; risponde `{ twitchId }`; errori `TWITCH_USER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `INNKEEPER_ACCOUNT_PROTECTED`, `TWITCH_UNAVAILABLE` (§2b).
4. **Revoca con motivo `accountDeleted`** per **15 minuti**: refresh → `SESSION_REVOKED` con `extensions.reason = "accountDeleted"`; socket vivi e riconnessioni → close **4409** con reason `accountDeleted`; HTTP con access token ancora vivo → `UNAUTHENTICATED`. Dopo la finestra il refresh ricade su `SESSION_EXPIRED` (§2c).
5. **Consenso:** query `termsVersion` su `GET /auth/twitch/start` (forma `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`); assente o malformata → redirect all'app con `?error=terms_not_accepted`; il bypass di sviluppo è esente (§2d).
6. **Quest cominciata annullata** (D-13): i compagni rimasti ricevono il push `questCancelled` col testo nuovo, `characterUpdated` (in città, corsia libera, cibo e vita restituiti) e `userUpdated` (punti restituiti); la quest arriva con `questUpdated` di nuovo sul tabellone. Nessun cambio di SDL, nessuna registrazione penzolante (§2e).
7. **Device push cancellati dal BE** nella transazione e token disiscritti dal topic `streamer-live` dopo il commit: l'app **non** fa unregister (N6, §2g).

---

## 1. Diff SDL (verbatim da `src/schema.gql`)

Blocchi copiati dal file (ordine alfabetico di `sortSchema`).

```graphql
type DeletedAccount {
  twitchId: String!
}
```

Dentro `type Mutation` (righe vicine lasciate per contesto):

```graphql
  createCharacter(input: CreateCharacterInput!): User!
  deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!
  deleteCharacter: User!
  deleteMyAccount: Boolean!
  discardMissionDraft(pendingQuestId: ID!): CommonResponse!
```

Le cinque righe di `git diff 9a084248 -- src/schema.gql`:

```
+type DeletedAccount {
+  twitchId: String!
+}
+  deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!
+  deleteMyAccount: Boolean!
```

**Nessuna riga tolta.** Il motivo di revoca (`SessionRevokeReason.accountDeleted`) e i codici del login (`TwitchLoginErrorCode.TERMS_NOT_ACCEPTED`) **non sono nello schema**: viaggiano nelle `extensions` degli errori, nella reason del close WS e nella query del redirect. I campi interni nati nella fase (`Character.user`, `User.acceptedTermsVersion`, `User.termsAcceptedAt`, `PendingQuest.travelFoodSpent`, `PendingQuest.travelHungerLifeLost`) non sono mai sul filo: una selezione di `user` su `Character` è rifiutata in validazione (`Cannot query field "user"`).

---

## 2. Semantica per area

### (a) Cancellazione propria (D-04, D-16, D-17, D-20; BE-DEL-05)

- **Chi:** ogni utente autenticato (nessun `@Roles`, nessun `@Throttled`). Identità **solo dal bearer** (`identity.userId`), nessun argomento: `deleteMyAccount(x: …)` è rifiutata in validazione (`GRAPHQL_VALIDATION_FAILED`). Nessun personaggio richiesto (D-17: chi non ne ha non vede il pulsante nell'app, ma la mutation lo accetta).
- **Riuscita:** `true`. Lo stesso account Twitch può rifare subito il login e riparte da zero: utente nuovo con id nuovo, 0 punti, nessun personaggio, consenso registrato di nuovo (D-04).
- **Oste:** il ruolo si legge dal DB dentro la transazione (mai dal JWT) → `INNKEEPER_ACCOUNT_PROTECTED`, nulla scritto (D-16). L'account dell'oste si toglie solo a mano.
- **Utente già sparito** (doppio tap, seconda cancellazione concorrente, id del bearer non esadecimale) → `UNAUTHENTICATED`, senza scritture.
- **Ordine sul filo (Pitfall 10):** dopo il commit il BE chiude **per primo** i socket dell'utente (4409 `accountDeleted`), poi manda i push ai compagni, disiscrive i token dal topic e prova a distruggere i ritratti su Cloudinary; **la risposta HTTP parte solo alla fine** di questi passi. Il 4409 sul socket della stessa app arriva quindi di norma **prima** della risposta `true`: la FE tratta i due eventi come la stessa uscita (teardown locale e login con «Il tuo account è stato eliminato.»), qualunque arrivi per primo. Un fallimento dei passi dopo il commit non cambia la risposta (la cancellazione è già scritta).

### (b) Cancellazione dall'oste (D-15, D-16, D-25; BE-DEL-07)

- **Chi:** solo oste (`@Roles(RoleType.innkeeper)`). Avventuriero o guardia → `FORBIDDEN` dal guard dei ruoli, prima di qualunque risoluzione e senza voce di registro; bearer assente o invalido → `UNAUTHENTICATED`.
- **Normalizzazione del nome** (`normalizedTwitchLoginOf`): testo grezzo oltre **64 caratteri** → rifiutato; poi `trim`, una `@` iniziale tolta, forma `^[A-Za-z0-9_]{1,25}$` controllata **prima** del minuscolo (un carattere non ASCII che diventerebbe ASCII resta fuori), infine minuscolo. Un nome impossibile risponde `TWITCH_USER_NOT_FOUND` **senza chiamare Twitch**.
- **Risoluzione:** `GET https://api.twitch.tv/helix/users?login=<nome>` con un token app costruito dalle **credenziali del login Twitch** (`AUTH_CONFIG.twitch`), indipendente dalla modalità di EventSub. Utente sconosciuto (lista vuota) o 400 di Helix → `TWITCH_USER_NOT_FOUND`; rete giù, 5xx, 401 ripetuto, risposta malformata o credenziali Twitch assenti → `TWITCH_UNAVAILABLE`.
- **Poi:** utente cercato per `twitchId` → assente: `ACCOUNT_NOT_FOUND`; presente: **la stessa identica cancellazione** della via propria (stesso servizio, stessa transazione, stessi passi dopo il commit, socket del giocatore chiusi con 4409 `accountDeleted`). Bersaglio oste → `INNKEEPER_ACCOUNT_PROTECTED` (anche l'oste che prova a cancellare sé stesso).
- **Risposta:** `{ twitchId: "<twitchId>" }`, il Twitch ID risolto, per conferma all'oste.
- **Registro dell'oste (D-25):** voce senza chiave `args` (argomenti oscurati), `target = { type: 'User', id: <twitchId risolto> }` alla riuscita e `id: null` su ogni rifiuto del servizio, `outcome` = `ok` o il codice. **Il nome utente Twitch non è salvato in nessuna collection né scritto in nessun log applicativo** (provato con un dump di tutte le collection e con l'intercettazione dei log).
- **Limite dichiarato:** un account Twitch sospeso o cancellato non si risolve più con Helix (`TWITCH_USER_NOT_FOUND`): l'oste lo toglie a mano.

### (c) Revoca (D-03, D-06, D-18; BE-DEL-06)

Dentro la transazione della cancellazione ogni sessione attiva dell'utente riceve `revokedAt` e `revokeReason: accountDeleted`, e **ogni** sessione dell'utente ha `expiresAt` accorciato ad adesso + 900 s con l'operatore `$min` (mai allungato). Dopo il commit i socket di quelle sessioni si chiudono con 4409 `accountDeleted` e l'id utente entra in un **registro in memoria** di 15 minuti (`DeletedAccountRegistry`, finestra = vita dell'access token, solo id utente, mai Twitch ID).

| Canale | Nella finestra di 15 minuti | Dopo la finestra |
|--------|-----------------------------|------------------|
| `refreshSession` | `SESSION_REVOKED` con `extensions.reason = "accountDeleted"` | `SESSION_EXPIRED` (sessione tolta dal TTL di Mongo), senza reason |
| Socket vivo | close **4409**, reason `accountDeleted` (subito dopo il commit) | — (già chiuso) |
| Riconnessione WS | close **4409** `accountDeleted` (la sessione revocata è letta a DB) | access token scaduto: bearer rifiutato in `onConnect` → close 4403 |
| HTTP (GraphQL e REST) con access token ancora vivo | `UNAUTHENTICATED` (registro in memoria) | access token scaduto → `UNAUTHENTICATED` di oggi |

**Ripieghi dichiarati:**
- **Riavvio del BE dentro la finestra:** il registro in memoria si perde. Refresh e riconnessione WS restano corretti (leggono la sessione revocata a DB: `SESSION_REVOKED` + `accountDeleted`, 4409). Una chiamata HTTP con un access token ancora vivo invece supera il guard e arriva al resolver, che non trova l'utente: risposte caso per caso (per esempio `me` → `NOT_FOUND` «Utente non trovato»). La FE che riceve un errore così deve comunque finire nel refresh, che risponde col motivo giusto.
- **TTL di Mongo:** il monitor gira circa una volta al minuto, quindi il passaggio da `SESSION_REVOKED` a `SESSION_EXPIRED` avviene fra 15 e circa 16 minuti dopo la cancellazione. In quell'intervallo l'access token è comunque già scaduto.
- Con access token TTL e finestra entrambi a 900 s non c'è un momento in cui un access token vivo incontra una sessione già sparita.

### (d) Consenso (D-09, D-11, D-12, D-19; BE-CONSENT-01, BE-CONSENT-02)

- **Parametro:** `termsVersion` in query su `GET /auth/twitch/start`, accanto a `challenge`. Forma `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$` (1–32 caratteri, primo alfanumerico; per esempio `2026-11-24`). Il BE salva ciò che riceve: nessun endpoint della versione corrente, nessun confronto con una versione «giusta», nessuna riaccettazione (D-12).
- **Firma:** la versione è firmata nello state OAuth accanto alla challenge; il callback la legge **solo** dallo state firmato, mai dalla query.
- **Ordine dei rifiuti allo start:** `twitch_not_configured` → `invalid_request` (challenge) → `terms_not_accepted` (versione assente o malformata).
- **Ordine al callback:** `twitch_not_configured` → `invalid_state` (state nullo o senza challenge) → `terms_not_accepted` (state senza versione) → `access_denied` → `invalid_request` (codice mancante) → scambio con Twitch.
- **Rifiuto:** redirect 302 all'URL dell'app (`appAuthRedirectUrl` della config) con `?error=terms_not_accepted`, come gli altri codici del login.
- **Scrittura (ruling dell'orchestratore, vetabile dall'utente, §7):** versione e data (orologio del BE) si scrivono **alla creazione dell'utente**, nell'upsert del callback (nessun utente nasce senza consenso), e poi **solo quando la versione cambia**: un login con la stessa versione lascia `acceptedTermsVersion` e `termsAcceptedAt` intatti, quindi la data è quella dell'accettazione, non dell'ultimo login. Un utente di sviluppo senza consenso che rifà il login col flusso Twitch lo riceve in quel momento.
- **Mai sul filo:** `acceptedTermsVersion` e `termsAcceptedAt` sono solo a DB.
- **Bypass di sviluppo esente:** il token `DEV_AUTH_*` non porta versione, non ne scrive e non è rifiutato; il refresh di una sessione di un utente senza consenso funziona (D-11). Nessuna variabile d'ambiente nuova.

### (e) Quest cominciata annullata (D-13, D-26; BE-DEL-02, BE-DEL-03)

- **Predicato «cominciata»:** `startedAt` valorizzato, `concludedAt` nullo, e almeno un personaggio dell'account (corrente o archiviato) fra `registeredAdventurers`. Riguarda la corsia standard (`boss`, `enemy`, `aid`); `story` e `worldMission` non partono mai. Le registrazioni, le corsie, le `PendingQuest` e il proprietario salvati con l'id in **forma stringa** (dati legacy) sono trovati come gli altri (driver nativo, piano 13).
- **Quando:** dentro la transazione, PRIMA dell'archivio del personaggio corrente (regola dura 2).
- **Ogni compagno rimasto** (registrato attivo che non è dell'account cancellato), nello stesso update guardato sulla corsia:
  - torna al `markerLocation` della **città che contiene il marker della quest** (nessun campo nuovo) e impara la geografia di quella città come in un arrivo;
  - `quests.pendingQuest` torna nullo e la sua `PendingQuest` è cancellata;
  - **cibo del tragitto** (`travelFoodSpent`, annotato dal pasto del viaggio verso la quest) rimesso nella borsa **fuso per oggetto** e **limitato al massimo di una riga dell'inventario** (`MAX_ITEM_QUANTITY`): il rimborso non fa mai fallire la cancellazione;
  - **vita persa per fame** nel tragitto (`travelHungerLifeLost`) restituita **entro il massimo** di vita (mai sotto la vita attuale);
  - **`pointsSpent`** (punti spesi per accettare la quest) accreditati dal `WalletService` al **saldo dell'utente** che gioca il compagno (`User.twitchPoints`): arrivano all'app con **`userUpdated`**.
- **Quest:** `startedAt` nullo e `registeredAdventurers` vuoto (`startedQuestResetOf`): **di nuovo sul tabellone**, libera per un gruppo nuovo. Le `PendingQuest` di quella quest dei personaggi cancellati e dei segnaposto archiviati spariscono senza rientro né rimborso.
- **Ciò che riceve l'app di ogni compagno rientrato:**
  - push `questCancelled` (data-only) con `id` = quest e il testo di `startedQuestCancelled` in `src/push/push-events.ts`: titolo «Missione annullata», corpo **«Un compagno ha lasciato il mondo: la missione è annullata e sei tornato in città, con cibo, punti e vita restituiti.»**, TTL 1 h;
  - `characterUpdated` (posizione in città, `quests.pendingQuest` nullo, borsa e vita aggiornate) e `userUpdated` (saldo) dai change stream di oggi;
  - `questUpdated(questId)` con `registeredAdventurers: []`. **`startedAt` non è nello SDL**: la FE non lo vede e non deve cercarlo; la quest «non avviata» si riconosce dalle registrazioni vuote.
- **Terzi:** un giocatore che non è nel gruppo e ha il tabellone aperto vede la quest tornata **alla prossima rilettura** di `quests` (non esiste una subscription del tabellone), o subito se è iscritto a `questUpdated` di quella quest.
- **Eccezione dell'aid** («Si risolve come oggi»): un `aid` avviato i cui feriti sono **tutti** personaggi dell'account cancellato non passa dall'annullamento: l'archivio toglie il ferito e conclude l'aid all'istante della cancellazione, come per «Elimina personaggio» e la morte; i soccorritori non rientrano, non sono rimborsati e non ricevono il push dell'annullamento. Vale anche se un personaggio archiviato dello stesso account vi è soccorritore. Un aid avviato con altri feriti resta aperto (l'archivio toglie solo il cancellato).
- **Quest non cominciata:** l'archivio libera solo il posto; gli altri restano in attesa di un nuovo giocatore (D-13). Un aid non avviato concluso dall'archivio libera i soccorritori, che ricevono il `questCancelled` di oggi (corpo «Il gruppo non si è formato in tempo: la missione è stata annullata.»).
- **Nessuna registrazione penzolante:** alla cancellazione dell'account non resta mai un segnaposto; il segnaposto di oggi resta solo per «Elimina personaggio» e la morte (regola dura 3).
- **Dati rotti:** un marker che non appartiene a nessuna città lascia i compagni sul posto (corsia libera e rimborsi comunque, WARN); un compagno in viaggio o con la corsia su un'altra quest resta intatto (WARN, pulizia manuale) e non riceve push.

### (f) Cosa si cancella e cosa resta (D-04, D-14; BE-DEL-04)

Una sola transazione Mongo (`AccountEraser.eraseWithin`), nell'ordine:

| Collection / oggetto | Azione |
|----------------------|--------|
| `users` | l'utente (Twitch ID, saldo, ruolo, consenso) cancellato per ultimo |
| `characters` | tutti i personaggi dell'account: trovati da `Character.user` (archiviati compresi) più `User.currentCharacter` (il corrente di prima della fase, D-24); cancellati dopo l'archivio del corrente |
| `quests` cominciate | annullate come in §2e |
| `quests` non avviate e aid aperti | posti liberati, ferito tolto, soccorritori rilasciati e richieste GM cancellate dall'archivio del corrente, come «Elimina personaggio» (D-14) |
| `quests` concluse | registrazioni e feriti dell'account tolti (nessun lettore conta i posti di una quest conclusa) |
| `pendingquests` | le richieste di ogni corsia dei personaggi (standard, `activeStoryQuest`, `activeWorldMissionQuest`) |
| `missiondrafts` | personaggi tolti da partecipanti, premi, aggiunte ai background ed esiti degli scontri, revisione incrementata (un completamento guidato in volo viene annullato); la bozza rimasta senza partecipanti è cancellata |
| `questresults` | esiti con `user` = utente o `character` fra i suoi personaggi; nei fogli altrui `rescuedCharacters` conserva la lunghezza: ogni id cancellato diventa un **id anonimo** nuovo (uno per cancellazione) |
| `sessions` | **revocate**, non cancellate, con scadenza accorciata a 15 minuti (§2c); poi le toglie il TTL |
| `login_tickets` | cancellati |
| `push_devices` | cancellati (token letti prima, per la disiscrizione dopo il commit) |
| `channel_access_checks` | cancellate per Twitch ID |
| `portrait_deletions` | una riga per ogni ritratto caricato dall'app dei personaggi cancellati (§2g) |

**Restano ai loro TTL:** registro dell'oste `admin_audit_logs` 90 giorni (con il Twitch ID come bersaglio della voce di cancellazione, e le voci di prima della cancellazione che possono riferire personaggi dell'account), registro EventSub `eventsub_messages` 7 giorni, backup 30 giorni, sessioni revocate fino a ~16 minuti. I job Bull già in coda (recupero magie, viaggi, imboscate, risoluzioni) portano solo ObjectId e diventano no-op quando rileggono il DB.

Un test d'integrazione scorre **ogni** collection con `listCollections` e cerca gli id esadecimali di utente e personaggi e il Twitch ID nella serializzazione EJSON di ogni documento: nessun residuo tranne le eccezioni elencate; l'utente estraneo e la sua quest restano identici.

### (g) Dopo il commit (D-25, N6; BE-DEL-08)

`erase` → `connection.transaction(eraseWithin)` → `afterCommitSafely(report)`, in ordine fisso:

1. chiusura dei socket con 4409 `accountDeleted` e segno nel registro in memoria (try/catch suo);
2. push `startedQuestCancelled` ai compagni rientrati, quest per quest;
3. push `questCancelled` di oggi ai soccorritori liberati dall'archivio;
4. disiscrizione dei token dell'utente dal topic FCM **`streamer-live`** con una sola chiamata (cancellare le righe non basta: il topic vive su Firebase);
5. `flush` dell'outbox dei ritratti su Cloudinary.

Ogni passo è best-effort e isolato: un errore lascia un WARN (mai un token, un public id o un nome utente nel messaggio) e **non** annulla la cancellazione né cambia la risposta della mutation o l'esito del registro dell'oste.

**Ritratti:** si accodano solo i ritratti caricati dall'app (`https://res.cloudinary.com/<cloud>/image/upload/[v<cifre>/]characters_profile/<id>.<ext>`, URL identico alla sua forma normalizzata), mai un'immagine di preset o estranea, mai un ritratto ancora mostrato da un personaggio che resta. L'outbox `portrait_deletions` porta solo `publicId` (unico), `queuedAt` e `attempts`: nessun legame con l'utente. La riga si chiude a ogni risposta di Cloudinary senza errore (anche «not found»); un errore incrementa `attempts` e la riga resta allo **sweeper**, che ritenta al boot e a ogni `QUEST_CONFIG.sweepIntervalMs` (default 60 s), senza un tetto di tentativi.

**L'app non fa unregister** del device alla cancellazione (con la sessione morta la mutation fallirebbe) e non deve fallire se non può farlo.

---

## 3. Codici e rifiuti

| Codice | Operazione | Quando | `extensions` |
|--------|-----------|--------|--------------|
| `INNKEEPER_ACCOUNT_PROTECTED` | `deleteMyAccount`, `deleteAccountByTwitchLogin` | chi chiama (via propria) o il bersaglio (via dell'oste) ha ruolo oste a DB; nulla scritto (D-16) | `{ code }`, messaggio «L'account dell'oste non si elimina dall'app» |
| `UNAUTHENTICATED` | `deleteMyAccount` | utente del bearer già sparito o id non valido (D-20) | `{ code }` |
| `UNAUTHENTICATED` | ogni operazione autenticata | bearer assente o invalido; access token ancora vivo di un account cancellato da meno di 15 minuti (D-18) | `{ code }`, «Authentication required» |
| `TWITCH_USER_NOT_FOUND` | `deleteAccountByTwitchLogin` | nome impossibile (oltre 64 caratteri, fuori forma; nessuna chiamata a Twitch), o Twitch non conosce il nome (D-15) | `{ code }`, «Utente Twitch inesistente» |
| `ACCOUNT_NOT_FOUND` | `deleteAccountByTwitchLogin` | nessun utente con quel Twitch ID (anche se sparisce fra la lettura e la transazione) | `{ code }`, «Nessun account per questo utente Twitch» |
| `TWITCH_UNAVAILABLE` | `deleteAccountByTwitchLogin` | Helix irraggiungibile, 5xx, 401 ripetuto, risposta malformata, credenziali Twitch del login assenti | `{ code }`, «Twitch non risponde: riprova più tardi» |
| `FORBIDDEN` | `deleteAccountByTwitchLogin` | chi chiama non è oste (guard dei ruoli, prima di tutto) | `{ code }` |
| `SESSION_REVOKED` | `refreshSession` | sessione revocata dalla cancellazione, nei 15 minuti (D-18) | `{ code, reason: "accountDeleted" }`, «Session revoked, sign in again» |
| `SESSION_EXPIRED` | `refreshSession` | dopo la finestra (sessione tolta dal TTL) | `{ code }`, «Session expired, sign in again» |
| close 4409 | WS | socket vivo alla cancellazione o riconnessione nei 15 minuti | reason `accountDeleted` |
| redirect `terms_not_accepted` | `GET /auth/twitch/start`, callback | versione assente o malformata allo start; state senza versione al callback (D-19) | query `?error=terms_not_accepted` |

Esempi in §4 per ciascuno, tranne `FORBIDDEN` e `UNAUTHENTICATED` da bearer assente (forma di oggi, invariata).

---

## 4. Esempi

Segnaposto: `<twitchLogin>`, `<twitchId>`, `<questId>`, `<characterId>`, `<cityMarkerId>`, `<itemId>`, `<appRedirectUrl>`, `<challenge>`, `<twitchAuthorizeUrl>`.

### 4.1 `deleteMyAccount` riuscita

```graphql
mutation DeleteMyAccount {
  deleteMyAccount
}
```

Variabili: nessuna. Header: `Authorization: Bearer <accessToken>`.

```json
{ "data": { "deleteMyAccount": true } }
```

### 4.2 `deleteMyAccount` dell'oste

```json
{
  "data": null,
  "errors": [
    {
      "message": "L'account dell'oste non si elimina dall'app",
      "path": ["deleteMyAccount"],
      "extensions": { "code": "INNKEEPER_ACCOUNT_PROTECTED" }
    }
  ]
}
```

Utente già sparito: stessa forma con `"extensions": { "code": "UNAUTHENTICATED" }`.

### 4.3 `deleteAccountByTwitchLogin` riuscita

```graphql
mutation DeleteAccountByTwitchLogin($twitchLogin: String!) {
  deleteAccountByTwitchLogin(twitchLogin: $twitchLogin) {
    twitchId
  }
}
```

```json
{ "twitchLogin": " @<twitchLogin> " }
```

```json
{ "data": { "deleteAccountByTwitchLogin": { "twitchId": "<twitchId>" } } }
```

Il nome si può mandare com'è scritto nell'email (spazi, `@`, maiuscole): il BE lo normalizza.

### 4.4 Errori della via dell'oste

```json
{
  "data": null,
  "errors": [
    {
      "message": "Utente Twitch inesistente",
      "path": ["deleteAccountByTwitchLogin"],
      "extensions": { "code": "TWITCH_USER_NOT_FOUND" }
    }
  ]
}
```

```json
{
  "data": null,
  "errors": [
    {
      "message": "Nessun account per questo utente Twitch",
      "path": ["deleteAccountByTwitchLogin"],
      "extensions": { "code": "ACCOUNT_NOT_FOUND" }
    }
  ]
}
```

```json
{
  "data": null,
  "errors": [
    {
      "message": "Twitch non risponde: riprova più tardi",
      "path": ["deleteAccountByTwitchLogin"],
      "extensions": { "code": "TWITCH_UNAVAILABLE" }
    }
  ]
}
```

Bersaglio oste: come §4.2 con `"path": ["deleteAccountByTwitchLogin"]`.

### 4.5 Refresh rifiutato nella finestra

```graphql
mutation Refresh($refreshToken: String!) {
  refreshSession(refreshToken: $refreshToken) {
    accessToken
    refreshToken
  }
}
```

```json
{ "refreshToken": "<refreshToken>" }
```

```json
{
  "data": null,
  "errors": [
    {
      "message": "Session revoked, sign in again",
      "path": ["refreshSession"],
      "extensions": { "code": "SESSION_REVOKED", "reason": "accountDeleted" }
    }
  ]
}
```

Dopo la finestra: `"extensions": { "code": "SESSION_EXPIRED" }`, messaggio «Session expired, sign in again», nessuna `reason`.

### 4.6 Close del socket

```
close code: 4409
reason:     accountDeleted
```

### 4.7 Login con e senza versione

Start accettato:

```
GET /auth/twitch/start?challenge=<challenge>&termsVersion=2026-11-24
→ 302 Location: <twitchAuthorizeUrl>   (state firmato con challenge e versione)
```

Start senza versione (o con una versione malformata, per esempio `termsVersion=-x` o oltre 32 caratteri):

```
GET /auth/twitch/start?challenge=<challenge>
→ 302 Location: <appRedirectUrl>?error=terms_not_accepted
```

### 4.8 Quest cominciata annullata: push e personaggio

Push FCM data-only a ogni proprietario di un compagno rientrato:

```json
{
  "type": "questCancelled",
  "id": "<questId>",
  "title": "Missione annullata",
  "body": "Un compagno ha lasciato il mondo: la missione è annullata e sei tornato in città, con cibo, punti e vita restituiti.",
  "sentAt": "2026-11-25T10:00:00.000Z"
}
```

Frammento di `characterUpdated(id: "<characterId>")` del compagno rientrato:

```graphql
subscription CompanionBack($id: String!) {
  characterUpdated(id: $id) {
    id
    status { location { id } currentLifePoints }
    quests { pendingQuest { id } }
    assets { ownedItems { item { ... on LootItem { id } } quantity } }
  }
}
```

```json
{
  "data": {
    "characterUpdated": {
      "id": "<characterId>",
      "status": { "location": { "id": "<cityMarkerId>" }, "currentLifePoints": 46 },
      "quests": { "pendingQuest": null },
      "assets": { "ownedItems": [{ "item": { "id": "<itemId>" }, "quantity": 3 }] }
    }
  }
}
```

Le scritture della transazione arrivano in raffica: la FE legge fino all'evento che porta lo stato finale (i valori 46 e 3 sono quelli del caso di `test/account/account-deletion-flow.int-spec.ts`). `questUpdated(questId: "<questId>")` porta la quest con `"registeredAdventurers": []`; `userUpdated` porta il saldo con i punti restituiti.

---

## 5. Finestra FE e compatibilità

- **Tutto additivo:** la FE di oggi funziona contro il BE nuovo, nessun riavvio coordinato. I piani FE che selezionano `deleteMyAccount` e `deleteAccountByTwitchLogin` sono gated **solo sul merge** di questa fase (registro dei documenti della FE 55 → 57) e sul riavvio del BE dal ramo per la UAT.
- **Da cambiare nella FE:** il login manda `termsVersion` su `/auth/twitch/start` (altrimenti, col BE nuovo, **ogni login Twitch è rifiutato** con `terms_not_accepted`: il cambio della FE va consegnato insieme al riavvio del BE); la mappa dei codici del redirect riceve `terms_not_accepted`; la mappa dei motivi di revoca riceve `accountDeleted` (refresh e 4409).

### Risposte al handoff della FE

Una risposta per ogni voce di «What the app needs» del `BACKEND-NOTES.md` della FE Phase 25, nell'ordine di quel documento.

1. **Cancellazione propria** — `deleteMyAccount: Boolean!`, nessun argomento, bersaglio = chi chiama; `true` alla riuscita; tutte le sessioni revocate subito (socket 4409 `accountDeleted`, che può arrivare prima della risposta); oste rifiutato con `INNKEEPER_ACCOUNT_PROTECTED`; utente già sparito `UNAUTHENTICATED`. §2a, §4.1, §4.2; `src/account/deletion/account-deletion.resolver.int-spec.ts` (`describe('deleteMyAccount (wire)')`).
2. **Cancellazione dall'oste** — `deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!` con `DeletedAccount { twitchId: String! }`; i quattro codici distinti richiesti: nome Twitch sconosciuto `TWITCH_USER_NOT_FOUND`, nessun account `ACCOUNT_NOT_FOUND`, bersaglio oste `INNKEEPER_ACCOUNT_PROTECTED`, Twitch non raggiungibile `TWITCH_UNAVAILABLE`; voce nel registro dell'oste senza il nome. §2b, §3, §4.3, §4.4; stessa spec (`describe('deleteAccountByTwitchLogin')`).
3. **Motivo di revoca** — **fattibile:** `accountDeleted` in `extensions.reason` di `SESSION_REVOKED` e come reason del close 4409, per 15 minuti dalla cancellazione, anche per il giocatore cancellato dall'oste mentre è online; dopo la finestra o dopo un riavvio del BE (per le sole chiamate HTTP) vale il ripiego «sessione scaduta» (`SESSION_EXPIRED`). §2c, §4.5, §4.6; `test/auth/session-revocation.int-spec.ts`, `src/account/deletion/account-deletion.resolver.int-spec.ts` (`describe('revocation after deleteMyAccount (D-18)')`, «closes the live socket of the deleted player with 4409 accountDeleted (D-15, D-18)»).
4. **Consenso al login** — la versione viaggia all'**avvio del login**, come query `termsVersion` su `GET /auth/twitch/start` (non allo scambio del ticket), firmata nello state; senza versione → redirect `?error=terms_not_accepted` (il «codice suo» richiesto). Il **bypass di sviluppo non la porta ed è esente**: nessun rifiuto, nessuna scrittura. Versione e data si scrivono alla creazione e poi solo al cambio di versione. §2d, §4.7; `src/auth/twitch/twitch-auth.controller.int-spec.ts`, `src/auth/dev/dev-auth.strategy.int-spec.ts`.
5. **Segnaposto anonimo** — **superato dalla D-13** (ruling dell'utente del 2026-11-24): nessuna registrazione anonima, nessun `QuestRegistration.vacant`, nessun cambio di SDL. La quest cominciata si annulla per tutti (rientro, rimborsi, push, quest sul tabellone); quella non cominciata libera il posto. §2e, §4.8; `src/quests/party/started-quest-canceller.int-spec.ts`, `src/account/deletion/account-eraser.int-spec.ts`.

Riscontro con N1–N6 della ricerca BE (`26-RESEARCH.md` §Q8), come chiusi nel codice:

- **N1** — come proposto, senza differenze.
- **N2** — come proposto, con una differenza: **nessun `BAD_USER_INPUT`** per un nome oltre il tetto di forma; un nome oltre 64 caratteri risponde `TWITCH_USER_NOT_FOUND` (la D-20 elenca quattro codici; vetabile, §7).
- **N3** — come proposto; il registro in memoria vale per HTTP (GraphQL e REST), la riconnessione WS è chiusa dalla sessione revocata a DB.
- **N4** — come proposto.
- **N5** — superata (sopra).
- **N6** — come proposto: righe `push_devices` cancellate nella transazione, token disiscritti da `streamer-live` dopo il commit, l'app non fa unregister.

---

## 6. Comportamenti provati

Ogni voce: comportamento, decisione, spec che lo fissa.

**BE-DEL-01 — proprietario del personaggio**
- Campo `Character.user` con indice `character_user`, assente = `null`, fuori da GraphQL (D-11, D-24) — `src/models/character/character.model.spec.ts`.
- Scritto dalla creazione nella transazione del claim, mai servito (D-24) — `src/characters/creation/character-creation.resolver.int-spec.ts`.
- Flusso intero: personaggio creato sul filo con `user` = utente (D-24) — `test/account/account-deletion-flow.int-spec.ts`.

**BE-DEL-02 — spese del tragitto sulla `PendingQuest`**
- Forma e assenza dal filo dei due campi interni (D-26) — `src/models/pending-quest.schema.spec.ts`, `src/travel/food/quest-travel-spending.spec.ts`.
- Scritte nella transazione del pasto dallo sweep, dall'arrivo e dall'imboscata vinta; nulla su un viaggio libero, su un gruppo sciolto, su un'imboscata persa (D-13, D-26) — `src/travel/food/travel-food.sweep.int-spec.ts`, `src/travel/travel-completion.int-spec.ts`, `src/travel/ambush/ambush-resolution.int-spec.ts`.

**BE-DEL-03 — quest cominciata annullata**
- Regole pure: predicato, città del marker, cibo fuso per oggetto e limitato al tetto, vita entro il massimo, testo del push (D-13, D-26) — `src/quests/party/started-quest-cancel.spec.ts`, `src/push/push-events.spec.ts`.
- Boss, enemy, aid col cancellato soccorritore: rientro, `PendingQuest` cancellate, rimborsi, quest sul tabellone; non avviata, conclusa, segnaposto, marker senza città, compagno in viaggio, abort (D-13, D-26) — `src/quests/party/started-quest-canceller.int-spec.ts`.
- Id legacy in forma stringa: registrazioni, corsie, `PendingQuest.quest` e `currentCharacter` (D-13, D-26) — `src/quests/party/started-quest-canceller.int-spec.ts` (`describe('legacy ids stored as strings')`), `src/account/deletion/account-eraser.int-spec.ts`.
- Dentro la cancellazione prima dell'archivio; aid del solo ferito risolta come oggi, anche con un soccorritore archiviato dell'account; aid con altri feriti aperta; story senza annullamento (D-13, D-14) — `src/account/deletion/account-eraser.int-spec.ts`.

**BE-DEL-04 — una transazione, niente resta**
- Codici e regole pure (corsie, bozze, quest concluse, conteggi anonimi) (D-14, D-15, D-16) — `src/account/deletion/account-deletion.exception.spec.ts`, `src/account/deletion/account-erasure.plan.spec.ts`.
- Inventario su ogni collection, utente estraneo identico, oste rifiutato senza scritture, quest concluse ripulite anche con id in stringa (D-04, D-14, D-16, D-24) — `src/account/deletion/account-eraser.int-spec.ts` («leaves nothing tied to the deleted account in any collection (D-04, D-14)»).
- Archivio invariato (regola dura 3) — `src/characters/deletion/character-archiver.int-spec.ts`, `src/characters/deletion/character-deletion.resolver.int-spec.ts`, `src/quests/outcomes/boss-resolution.int-spec.ts`, `src/quests/outcomes/aid-rescue.int-spec.ts`, verdi senza modifiche.

**BE-DEL-05 — `deleteMyAccount`**
- `true`, senza personaggio, oste `INNKEEPER_ACCOUNT_PROTECTED` senza scritture, utente sparito `UNAUTHENTICATED`, nessun argomento (D-04, D-16, D-17, D-20) — `src/account/deletion/account-deletion.resolver.int-spec.ts`.
- Pin dello SDL e bearer assente `UNAUTHENTICATED` (D-20) — `test/app.int-spec.ts`.
- Rientro dello stesso Twitch da zero (D-04) — `test/account/account-deletion-flow.int-spec.ts`.

**BE-DEL-06 — revoca `accountDeleted`**
- Revoca in transazione, scadenza accorciata con `$min`, id non valido ignorato (D-18) — `src/auth/session/session.service.int-spec.ts`.
- Registro di 15 minuti col `Clock`, nuova finestra a ogni segno (D-18) — `src/auth/session/deleted-account.registry.spec.ts`.
- Guard HTTP che consulta il registro, mai sul ramo WS (D-18) — `src/auth/guards/auth.guard.spec.ts`, `test/auth/http-guard.int-spec.ts`.
- Socket 4409, refresh `SESSION_REVOKED` + `accountDeleted`, ripiego `SESSION_EXPIRED` dopo il TTL (D-03, D-18) — `test/auth/session-revocation.int-spec.ts`, `src/auth/session/session-revocation.service.int-spec.ts`.
- Pin dei motivi di revoca del contratto — `src/auth/session/session.model.spec.ts`.
- Sul filo dopo `deleteMyAccount`: socket, refresh, HTTP, riconnessione, altri utenti intatti (D-18) — `src/account/deletion/account-deletion.resolver.int-spec.ts`.

**BE-DEL-07 — cancellazione dall'oste**
- Normalizzazione del nome, tetto di 64 caratteri, segno Kelvin rifiutato (D-15) — `src/auth/twitch/twitch-login-name.spec.ts`.
- Helix: 400 = utente inesistente, errori = `TwitchUserLookupError` senza nome né segreti nel messaggio, token dalle credenziali del login (D-15, D-20, D-25) — `src/auth/twitch/http-twitch-user-directory.spec.ts`, `src/eventsub/helix/twitch-app-token.cache.spec.ts`.
- Registro con argomenti oscurati e bersaglio dal risultato (D-25) — `src/authz/audit/admin-audit.interceptor.spec.ts`, `src/authz/audit/audit-target.decorator.spec.ts`.
- Riuscita, i quattro codici, non-oste rifiutato, voce di registro senza `args`, nome in nessuna collection né log, socket 4409 (D-15, D-16, D-18, D-20, D-25) — `src/account/deletion/account-deletion.resolver.int-spec.ts`.
- Matrice delle autorizzazioni — `test/authz/authorization-matrix.int-spec.ts`.

**BE-DEL-08 — dopo il commit**
- Id dei soli ritratti caricati, `destroyPortrait` con `invalidate` (portrait default) — `src/account/deletion/portrait/portrait-public-id.spec.ts`, `src/rest/cloudinary/cloudinary.service.spec.ts`.
- Outbox, `flush` che non lancia mai, sweeper al boot e periodico (portrait default) — `src/account/deletion/portrait/portrait-deletion.service.int-spec.ts`, `src/account/deletion/portrait/portrait-deletion.sweeper.spec.ts`.
- Disiscrizione dal topic in una chiamata, errore con il solo conteggio (D-25) — `src/push/push.service.spec.ts`.
- Ritratti accodati nella transazione, guardia dei sopravvissuti, nessuna riga su un rifiuto (D-16) — `src/account/deletion/account-eraser.int-spec.ts`.
- Push ai compagni e ai soccorritori, disiscrizione, ritratto, fallimenti isolati, pubblicazioni `characterUpdated` e `questUpdated`, via dell'oste (D-13, D-14, D-15, D-25, D-26) — `src/account/deletion/account-deletion.resolver.int-spec.ts` (`describe('after the commit (D-25)')`).

**BE-DEL-09 — SDL additivo, gate e handoff**
- Boot reale, SDL rigenerato uguale al committato (cinque righe) — `test/app.int-spec.ts`; gate `26-13-SUMMARY.md`; questo documento.

**BE-CONSENT-01 — `termsVersion` allo start**
- Forma della versione, state con due claim (D-19) — `src/auth/twitch/terms-version.spec.ts`, `src/auth/twitch/oauth-state.service.spec.ts`.
- Ordine dei rifiuti allo start e al callback (D-19) — `src/auth/twitch/twitch-auth.controller.int-spec.ts`.
- Pin dei codici del redirect consumati dall'app — `src/auth/twitch/twitch-urls.spec.ts`.

**BE-CONSENT-02 — scrittura del consenso**
- Upsert con versione e data, stessa versione = intatto, versione nuova = riscritta (D-09) — `src/users/users.service.int-spec.ts`, `src/auth/twitch/twitch-auth.controller.int-spec.ts`.
- Refresh di un utente senza consenso, bypass esente (D-11, D-19) — `test/auth/login-flow.int-spec.ts`, `src/auth/dev/dev-auth.strategy.int-spec.ts`.
- Flusso intero col consenso (D-09) — `test/account/account-deletion-flow.int-spec.ts`.

---

## 7. Compiti dell'orchestratore, UAT, decisioni vetabili

### Compiti dell'orchestratore

1. `npm run test:cov` in background e soglie di coverage.
2. Verifica e audit della fase.
3. PR verso `develop` (mai `main`).
4. Build e riavvio del BE dal ramo. **NESSUN migratore nel repo (D-11).** Al boot reale:
   - **Indici nuovi** costruiti da Mongoose: `characters.character_user` (`{ user: 1 }`), `portrait_deletions.publicId` (unico) e `portrait_deletions.queuedAt`. La collection `portrait_deletions` nasce vuota.
   - **Dati di sviluppo orfani (D-24):** un personaggio **archiviato** senza proprietario derivabile e uno **attivo** senza utente (`Character.user` assente su tutti i personaggi di prima della fase). Il corrente di un utente resta raggiungibile da `User.currentCharacter`, quindi la cancellazione lo trova; un archiviato senza `user` invece **non** sarebbe cancellato con l'account. Decidere fuori dal repo: uno script può valorizzare `user` dagli esiti (`questresults.user` / `character`), oppure i due documenti si tolgono a mano.
   - **Utenti di sviluppo senza consenso (D-11):** nessun effetto su refresh e bypass; ricevono versione e data al primo login Twitch con la FE nuova. Nessuna azione obbligata.
   - Controllare se a DB esistono registrazioni in forma stringa (`quests.registeredAdventurers.character` di tipo stringa): la cancellazione dell'account le gestisce, l'archivio del personaggio no (punti aperti).
5. Verifica del permesso IAM dei topic FCM (`roles/firebasecloudmessaging.admin`) per la disiscrizione da `streamer-live`: senza, la cancellazione riesce e la disiscrizione lascia solo un WARN col conteggio.
6. Credenziali del login Twitch presenti nell'ambiente del BE: senza, `deleteAccountByTwitchLogin` risponde sempre `TWITCH_UNAVAILABLE`.
7. Brief della FE con §0–§5 di questo documento.

### UAT su device (un passo per messaggio)

Prerequisiti: BE riavviato dal ramo, build della FE Phase 25 sul device, un secondo telefono (o un secondo account) per i passi 3 e 6.

1. Login con la casella spuntata: a DB `users.acceptedTermsVersion` e `users.termsAcceptedAt` valorizzati; un secondo login con la stessa versione non cambia la data.
2. Login senza versione (build vecchia o URL a mano): l'app riceve `?error=terms_not_accepted` e mostra l'errore inline.
3. «Elimina account» da un telefono mentre l'altro ha l'app aperta con lo stesso account: avviso «Il tuo account è stato eliminato.» su entrambi (4409 / refresh `accountDeleted`).
4. Rientro dello stesso Twitch: utente nuovo, 0 punti, creazione personaggio.
5. Cancellazione dall'oste per nome utente: nome inesistente `TWITCH_USER_NOT_FOUND`, nome esistente senza account `ACCOUNT_NOT_FOUND`, nome dell'oste `INNKEEPER_ACCOUNT_PROTECTED`, riuscita con il Twitch ID in risposta; `TWITCH_UNAVAILABLE` solo simulabile (rete del BE).
6. Quest boss cominciata (gruppo pieno, tutti sul luogo) con un compagno che cancella l'account: gli altri tornano in città con push, cibo, punti e vita restituiti; la quest è di nuovo sul tabellone.
7. Aid avviato il cui solo ferito cancella l'account: si conclude come oggi, nessun rientro dei soccorritori.
8. Ritratto caricato: dopo la cancellazione l'URL risponde 404 e `portrait_deletions` è vuota.

Diagnosi a DB coi soli nomi di collection e campi: `users` (`acceptedTermsVersion`, `termsAcceptedAt`, `twitchPoints`), `characters` (`user`, `status.location`, `status.currentLifePoints`, `quests.pendingQuest`, `assets.ownedItems`), `pendingquests` (`pointsSpent`, `travelFoodSpent`, `travelHungerLifeLost`), `quests` (`startedAt`, `concludedAt`, `registeredAdventurers`), `sessions` (`revokedAt`, `revokeReason`, `expiresAt`), `push_devices`, `portrait_deletions` (`attempts`), `admin_audit_logs` (`action`, `target`, `outcome`).

### Decisioni di disegno vetabili

Default tecnici o ruling dell'orchestratore che l'utente può ancora cambiare:

- **Testo del push dell'annullamento** — «Un compagno ha lasciato il mondo: la missione è annullata e sei tornato in città, con cibo, punti e vita restituiti.»; provvisorio, vive solo in `startedQuestCancelled` (`src/push/push-events.ts`).
- **Tetto del rimborso del cibo** — il cibo restituito che porterebbe una riga della borsa oltre `MAX_ITEM_QUANTITY` si ferma al tetto (l'eccedenza si perde) invece di far fallire la cancellazione.
- **Id anonimo nei `rescuedCharacters` altrui** — al posto del cancellato invece di toglierlo: il foglio altrui conserva «avete salvato N» senza riferire il cancellato.
- **Nome utente oltre 64 caratteri** — risponde `TWITCH_USER_NOT_FOUND`, nessun `BAD_USER_INPUT` (la D-20 elenca quattro codici).
- **Regola della data d'accettazione** — versione e data scritte alla creazione e poi solo quando la versione cambia (la data resta quella dell'accettazione, non dell'ultimo login).
- **Vita rimborsata entro il massimo** — mai oltre `maxLifePoints`, mai sotto la vita attuale.
- **Bersaglio del registro nullo nei rifiuti** della via dell'oste (il Twitch ID risolto c'è solo alla riuscita).
- **Registro in memoria perso al riavvio** e finestra dipendente dal monitor TTL di Mongo (§2c).

### Punti aperti

- **Id legacy nell'archivio del personaggio:** la cancellazione dell'account gestisce registrazioni, corsie e `PendingQuest` salvate con l'id in forma stringa (driver nativo); l'archivio di «Elimina personaggio» e della morte (`src/characters/deletion/`, invariato per regola dura 3) usa filtri del modello e **non** vede una registrazione legacy in stringa. Limite di prima della fase, da valutare in una fase futura o al boot reale (compito 4).
- **Riavvio del BE dentro la finestra:** HTTP con access token vivo arriva ai resolver (`me` → `NOT_FOUND`), §2c.
- **Bypass di sviluppo:** l'identità del bypass è tenuta in memoria dopo il primo uso e non ha una sessione: se l'utente del bypass si cancella, il suo socket non riceve 4409 e, finita la finestra, il bypass continua a puntare all'id cancellato (`me` → `NOT_FOUND`) fino al riavvio del BE. Solo sviluppo.
- **Outbox dei ritratti senza tetto di tentativi:** una riga che fallisce per sempre è ritentata a ogni giro dello sweeper; inoltre il `flush` dopo il commit prova **tutte** le righe in coda, quindi con Cloudinary giù la risposta della mutation attende anche i tentativi delle righe rimaste da cancellazioni precedenti.
- **`userUpdated` dei punti restituiti:** viene dal publisher di oggi (change stream su ogni update dell'utente); la fase prova l'accredito a DB, non l'evento sul filo.
- **Nessun limite di frequenza** sulle due mutation (non sono fra gli handler `@Throttled`).

### Deviazioni dai piani e casi verdi al primo colpo

- **02:** secondo passo del consenso con `findOneAndUpdate` (ruling dell'orchestratore: stessa versione = documento dell'upsert); controller toccato già nel task 1.
- **05:** tetto del rimborso del cibo (Rule 2); testo del push non ripetuto nella spec.
- **06:** pulizie delle quest concluse e conteggi altrui col driver nativo (forme stringa legacy, Rule 1).
- **07:** eccezione dell'aid esplicita nell'eraser (`resolvesAsToday`), scoperta da un caso in più con un soccorritore archiviato dell'account (Rule 1).
- **08:** `afterCommit` sincrono finché conteneva solo i socket (poi asincrono nel 12).
- **10:** chiave `args` assente invece di `args: {}` (minimize di Mongoose); conteggio della matrice aggiornato nel RED.
- **12:** `PortraitStore` via `useFactory` invece di `useExisting` (ruling dell'orchestratore); `questUpdated` provato sul filo senza `startedAt`.
- **13:** forme stringa legacy nel canceller corrette (ordine dell'orchestratore); due pin di contratto (`TwitchLoginErrorCode`, `SessionRevokeReason`) aggiornati al gate.
- **Verdi al primo colpo (guardie di assenza o di non-regressione):** campi interni fuori da GraphQL (01, 04), refresh e bypass senza consenso (02), guard sul ramo WS (03), nessuna spesa su viaggio libero, gruppo sciolto o imboscata persa (04), aid del solo ferito e quest non cominciata (07), i cinque casi della revoca sul filo (08), pubblicazioni dai change stream (12), flusso intero (13).
- Nessun `npm run build`, nessun riavvio del BE, nessun accesso al DB reale né lettura di `.env` in tutta la fase.
