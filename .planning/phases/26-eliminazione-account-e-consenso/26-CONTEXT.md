# Phase 26: Eliminazione account e consenso - Context

**Raccolto:** 2026-11-24 (discuss interattivo, congiunto con la FE Phase 25 «Account Deletion and Legal Consent»). Il file autorevole è `Klimmeck-Guide/.planning/phases/25-account-deletion-and-legal-consent/25-CONTEXT.md`: stessa numerazione D-01..D-16; qui la parte che tocca il BE. Le attese dell'app sono in `BACKEND-NOTES.md` della stessa cartella FE.
**Emendato:** 2026-11-24 dopo la ricerca (`26-RESEARCH.md`, C1–C4, N1–N6) e le decisioni dell'utente dello stesso giorno: D-13 sostituita, D-17..D-25 aggiunte. Numerazione allineata al CONTEXT del FE fino a D-23; D-24 e D-25 sono solo del BE.
**Stato:** pronto per la pianificazione — ramo `feat/26-eliminazione-account-e-consenso` da `develop`.

<domain>
## Confine della fase

1. Una mutation autenticata cancella definitivamente l'account di chi la chiama.
2. Una mutation riservata all'oste cancella l'account di un giocatore a partire dal nome utente Twitch (richieste via email delle pagine legali).
3. Il login registra sull'utente la versione accettata di termini e privacy e la data, e rifiuta chi non la porta.

Le pagine legali pubbliche (repo `LucaTabbia/klimmeck-guide-legal`, clone `~/Personale/Code/klimmeck-guide-legal`) promettono già tutto questo.

Fuori ambito: esportazione dei dati, riaccettazione al cambio dei documenti, attesa prima di una nuova registrazione, verifica dell'età, modifica dei TTL esistenti.

</domain>

<decisions>
## Decisioni

### Portate avanti (non richieste)
- Cosa si cancella lo fissano il goal di roadmap e `elimina-account.md`: utente (Twitch ID, saldo punti), tutti i personaggi anche archiviati con ciò che portano, esiti delle quest e ogni documento legato all'utente o ai suoi personaggi, sessioni e ticket di login, device push, ritratto su Cloudinary. Restano ai loro TTL: registro delle azioni dell'oste (90 giorni), registro EventSub (7 giorni), backup (30 giorni).
- La cancellazione è immediata; corsie e richieste si liberano come fa l'archiviazione (`CharacterArchiver`, `seat-release.ts`).
- Cambi non additivi dell'SDL dichiarati nel handoff; migratori one-shot fuori dal repo dopo il boot reale; nessun file di contenuto.

### Cancellazione
- **D-04 (utente):** lo stesso account Twitch può rifare subito il login e riparte da zero. Nessuna traccia del Twitch ID cancellato, nessuna attesa.
- **D-06/D-03:** alla riuscita tutte le sessioni dell'utente sono revocate subito (anche le subscription WS aperte). L'app deve poter distinguere «account eliminato» dagli altri motivi di revoca, per mostrare il proprio avviso anche a chi viene eliminato dall'oste mentre è online; se non è fattibile va detto nel handoff (ripiego: sessione scaduta).
- **D-13 (utente, 2026-11-24 — SOSTITUISCE il «Segnaposto anonimo» del discuss; la ricerca (C2) ha mostrato che oggi il segnaposto combatte con le statistiche di un documento che non esisterebbe più):** verbatim: «La missione viene annullata automaticamente e i giocatori vengono riportati gratuitamente alla città di partenza con una notifica. Vengono rimborsati del cibo speso per il tragitto» e «Con quest già avviata si intende che tutti i personaggi hanno già raggiunto il luogo della quest, gli slot erano pieni e quindi è effettivamente cominciata la quest. In caso contrario i giocatori attendono semplicemente che un nuovo utente riempia lo slot lasciato vuoto».
  - Quest effettivamente cominciata (gruppo pieno, tutti sul luogo): annullata per tutti; i compagni rimasti tornano subito e gratis alla città da cui erano partiti per quella quest, ricevono un push e sono rimborsati di **cibo del tragitto, punti spesi per accettare la quest e punti vita persi per fame nel viaggio** (utente, «Cibo, punti e vita persa per fame»); la quest **torna sul tabellone** non avviata, libera per un nuovo gruppo (utente, «Torna sul tabellone»; `startedQuestResetOf`).
  - Eccezione (utente, «Si risolve come oggi»): un soccorso (`aid`) già avviato il cui unico ferito è il personaggio cancellato si conclude con le regole di oggi, senza rientro né rimborso dei soccorritori.
  - Quest non effettivamente cominciata: il posto si libera e gli altri restano in attesa di un nuovo giocatore.
  - Solo per la cancellazione dell'account (propria o dell'oste): l'archiviazione del personaggio conserva il segnaposto di oggi.
  - Nessuna opzione A/B della ricerca: niente statistiche copiate nella registrazione, niente `QuestRegistration.vacant`. I dettagli (predicato di «cominciata», città di partenza, cibo, routine di rilascio) sono nell'addendum della ricerca.
- **D-14 (default tecnico):** tutto il resto segue l'archiviazione: posti non avviati liberati, richieste GM del personaggio cancellate, ferito tolto dalle aid aperte, soccorritori rilasciati, missione guidata in corso che perde quel partecipante. Gli esiti sono uno per personaggio e per utente: quelli altrui non portano il suo nome.
- **Default tecnico:** il ritratto su Cloudinary si cancella con l'account; un fallimento di Cloudinary non deve lasciare l'account mezzo cancellato né il ritratto orfano per sempre (strategia a discrezione della ricerca: ordine delle operazioni, ritentativo, registro).

### Cancellazione da parte dell'oste
- **D-15 (utente, «Azione nel pannello oste»):** mutation riservata all'oste che riceve il **nome utente Twitch**; il BE lo risolve nel Twitch ID (a DB c'è solo l'ID numerico) ed esegue la stessa identica cancellazione, scritta nel registro delle azioni dell'oste. Errori distinti: nome Twitch inesistente, nessun account per quell'utente, bersaglio oste, Twitch non raggiungibile.
- **D-16 (utente, «No, pulsante nascosto»):** l'oste non può cancellare il proprio account dall'app: la mutation propria rifiuta il ruolo oste con un codice d'errore suo, e l'azione dell'oste rifiuta un bersaglio oste. L'account dell'oste si toglie solo a mano.

### Consenso
- **D-09 (utente, «Sì, versione e data»):** sull'utente si registrano la versione accettata dei documenti e la data dell'accettazione (orologio del BE). Il login porta la versione; un login senza versione è rifiutato con un codice d'errore suo.
- **D-12 (default tecnico):** la versione è una stringa che l'app manda; il BE salva ciò che riceve (validazione di forma). Nessun endpoint che serve la versione corrente, nessuna riaccettazione.
- **D-11 (utente, verbatim):** «Non è pubblicata l'app, caso impossibile» — nessun utente pregresso da gestire: nessuna migrazione nel repo. Gli utenti di sviluppo già a DB sono affare dell'orchestratore al boot reale.
- Da decidere in ricerca: in quale passo del flusso Twitch viaggia la versione (avvio del login o scambio del ticket) e come la porta il bypass di sviluppo (`DEV_AUTH_*`).

### Aggiunte dopo la ricerca
- **D-17 (utente, «Solo in Impostazioni»):** chi non ha un personaggio non ha «Elimina account» nell'app; il suo account si cancella per la via dell'email (D-15). Nessun effetto sul BE: la mutation propria non richiede un personaggio.
- **D-18 (ricerca, N3):** nuovo motivo di revoca `accountDeleted`. Le sessioni dell'utente cancellato si revocano (non si cancellano) con scadenza accorciata a 15 minuti: in quella finestra il refresh risponde `SESSION_REVOKED` con `extensions.reason = "accountDeleted"` e le socket si chiudono con 4409; dopo, il refresh ricade su `SESSION_EXPIRED` (ripiego dichiarato). Una lista in memoria di 15 minuti degli id cancellati fa fallire con `UNAUTHENTICATED` le chiamate HTTP con un access token ancora valido; a un riavvio dentro la finestra la lista si perde (accettato).
- **D-19 (ricerca, N4):** la versione accettata viaggia come `termsVersion` su `GET /auth/twitch/start` (formato `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`), firmata nello state OAuth e scritta nell'unico upsert del callback: nessun utente nasce senza consenso. Versione mancante o malformata → redirect all'app con `?error=terms_not_accepted`. Il bypass di sviluppo è esente, nessuna variabile d'ambiente nuova.
- **D-20 (ricerca, N1/N2):** `deleteMyAccount: Boolean!` (errori `INNKEEPER_ACCOUNT_PROTECTED`, `UNAUTHENTICATED`) e `deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!` con `DeletedAccount { twitchId: String! }` (errori `TWITCH_USER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `INNKEEPER_ACCOUNT_PROTECTED`, `TWITCH_UNAVAILABLE`). La risoluzione del nome usa un app token Twitch costruito dalle credenziali dell'auth (quello di EventSub vale solo in modalità gestita). Tutti cambi additivi dell'SDL.
- **D-24 (ricerca, C1):** il personaggio non registra il proprietario: solo `User.currentCharacter` lega utente e personaggio, quindi gli archiviati non sono riconducibili all'utente. Si aggiunge un campo interno `Character.user` scritto alla creazione. I dati di sviluppo già a DB (1 archiviato senza proprietario derivabile, 1 attivo senza utente) sono dell'orchestratore al boot reale: nessuna migrazione nel repo (D-11).
- **D-25 (ricerca, C3 e C4):** dopo il commit i token push dell'utente si disiscrivono dal topic FCM `streamer-live` (cancellare le righe non basta); l'interceptor del registro dell'oste non deve salvare il nome utente Twitch (la privacy §2 dice che non è conservato): argomenti oscurati, bersaglio del registro = Twitch ID risolto.
- **D-26 (addendum della ricerca, A1–A8):** «effettivamente cominciata» = `Quest.startedAt != null` e `concludedAt == null` con un personaggio dell'utente registrato (corsia standard: `boss`, `enemy`, `aid`; `story` e `worldMission` non partono mai). Nessuna routine esistente annulla una quest avviata: serve una funzione di sessione nuova (`cancelStartedQuestWithin`) eseguita PRIMA di `archiveWithinReporting` e solo dalla cancellazione dell'account. Città di partenza = la città che contiene il segnalino della quest (`City.markerLocation`): nessun campo nuovo. Il cibo mangiato e i punti vita persi per fame nel tragitto oggi non sono registrati: si annotano sulla `PendingQuest` (campo interno, es. `travelFoodSpent` più la vita persa per fame) nella stessa transazione del pasto, in un piano che precede l'annullamento; i punti spesi per accettare sono già `pointsSpent`. All'app arrivano il push `questCancelled` esistente con un testo nuovo, `characterUpdated` per ogni membro rientrato e `questUpdated` per la quest tornata sul tabellone. Nessuna registrazione pendente resta mai: nessun cambio di SDL oltre a D-20.
- **N6:** i device push si cancellano lato server dentro la transazione; l'app non fa unregister.

### Discrezione di Claude
- Nomi di mutation, campi e codici d'errore; struttura dei moduli; transazione e ordine delle cancellazioni; come il motivo di revoca raggiunge l'app.

</decisions>

<canonical_refs>
## Riferimenti canonici

**Gli agenti a valle DEVONO leggerli prima di pianificare o implementare.**

- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/25-account-deletion-and-legal-consent/25-CONTEXT.md` — decisioni autorevoli D-01..D-16
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/25-account-deletion-and-legal-consent/BACKEND-NOTES.md` — ciò che l'app si aspetta
- `~/Personale/Code/klimmeck-guide-legal/elimina-account.md`, `privacy.md` §6–§7, `termini.md` — la promessa da mantenere
- `CLAUDE.md` del repo BE e le sue regole

</canonical_refs>

<code_context>
## Codice esistente

### Riusabile
- `src/characters/deletion/character-archiver.ts`, `seat-release.ts`, `character-deletion.service.ts` — archiviazione dentro la transazione del chiamante, rilascio di posti, aid e soccorritori.
- `src/auth/session/` — sessioni con TTL e revoca; `src/auth/login-ticket/` — ticket del login Twitch; `src/auth/twitch/` — client Twitch (risoluzione nome → ID).
- `src/push/push-device.registry.ts` — registro dei device.
- `src/authz/audit/admin-audit-log.model.ts` — registro delle azioni dell'oste (TTL 90 giorni); `@Roles(RoleType.innkeeper)`.
- `src/models/user.model.ts` — `twitchId` unico, `twitchPoints`, `role`, `currentCharacter`: qui i campi del consenso.

### Riferimenti a utente e personaggio da ripulire
- `questresults` (`character`, `user`), `ambush-snapshot` (`user`), `sessions`, `logintickets`, `pushdevices`, `quest-registration` e `quest-rescue` (`character`), `mission-draft` (quattro riferimenti a `Character`), `pending-quest`/`pending-request`. L'inventario completo è compito della ricerca.

### Punti d'innesto
- Flusso di login Twitch (avvio → callback → ticket → sessione) per la versione accettata.
- Pubblicazione degli aggiornamenti di quest dopo il commit, come fa oggi l'archiviazione (`questCancelled` per le aid che liberano qualcuno).

</code_context>

<specifics>
## Idee specifiche

- Quest avviata annullata (D-13): le due citazioni dell'utente valgono parola per parola.

</specifics>

<deferred>
## Idee rimandate

- Riaccettazione al cambio dei documenti (la versione registrata ne è la base).
- Attesa prima di una nuova registrazione dello stesso Twitch.
- Esportazione dei dati.

</deferred>

---

*Phase: 26-eliminazione-account-e-consenso*
*Contesto raccolto: 2026-11-24*
