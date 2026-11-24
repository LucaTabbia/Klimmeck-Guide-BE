# Phase 26: Eliminazione account e consenso - Context

**Raccolto:** 2026-11-24 (discuss interattivo, congiunto con la FE Phase 25 «Account Deletion and Legal Consent»). Il file autorevole è `Klimmeck-Guide/.planning/phases/25-account-deletion-and-legal-consent/25-CONTEXT.md`: stessa numerazione D-01..D-16; qui la parte che tocca il BE. Le attese dell'app sono in `BACKEND-NOTES.md` della stessa cartella FE.
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
- **D-13 (utente, «Segnaposto anonimo»):** in una quest di gruppo già avviata il posto del personaggio cancellato resta occupato fino alla conclusione, come per l'archiviazione, ma senza più alcun personaggio dietro: niente nome, niente ritratto. La quest si risolve con le regole di oggi. Poiché il documento del personaggio sparisce davvero, il segnaposto non può dipenderne (oggi `activeRegistrantFilterOf` e la risoluzione leggono la collection dei personaggi): la forma della registrazione anonima va dichiarata al FE.
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

- Il testo del segnaposto («Un avventuriero scomparso») è del FE: il BE espone solo un posto senza personaggio.

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
