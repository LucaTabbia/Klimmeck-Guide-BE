---
phase: 17-autorizzazione-e-sessioni
group: C
reviewed: 2026-11-09T17:57:17Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - test/authz/expected-handlers.ts
  - test/harness/real-app-boot.ts
  - test/app.int-spec.ts
  - test/authz/handler-fixtures.ts
  - test/authz/handler-fixtures.spec.ts
  - test/authz/matrix-victims.ts
  - test/authz/authorization-matrix.int-spec.ts
findings:
  critical: 0
  warning: 1
  info: 6
  total: 7
status: issues_found
---

## Summary

Rivisti i sette file del gruppo C (lettura integrale, piu guard/policy di ownership e client WS di test per giudicare cosa provano le righe). Nessun critical: le tre liste condivise sono identiche a quelle di `develop` (11/19/8, `as const`), `test/app.int-spec.ts` le confronta ancora coi metadati del boot reale (nessuna asserzione persa; aggiunti solo i due test di montaggio dei nuovi provider), l'ambiente finto del boot condiviso e identico a quello di prima, `AppModule` e importato in modo differito dopo l'ambiente e nessuna `*.spec.ts` unit lo importa, lo SDL e invariato (`git diff origin/develop -- src/schema.gql` vuoto). Le 30 fixture coprono ogni handler (Record su `ProtectedHandler` piu spec sulle chiavi), gli id delle variabili corrispondono ai `selectId` dei resolver (`request.id`, `request.characterId` per `useSpell`, `characterId` per `questResultReceived`, `id` per query/subscription) e le vittime sono vere. Il conto della matrice torna: 50 (innkeeper HTTP: 10 x (2 ruoli + 3 bearer)) + 17 + 7 + 2 + 2 + 2 + 1 + 2 (completezza) + 2 (controlli positivi) = 85. Un warning (gli attaccanti non hanno un personaggio proprio) e sei info (ordine di chiusura del boot, perdita di handle su compile fallita, prove WS piu sottili di quelle HTTP, spec dei target che non prova le variabili, controlli positivi mancanti per l'esenzione e per il WS).

## Critical

Nessuno.

## Warning

### C-WR-01: gli attaccanti della matrice non hanno personaggio, quindi le righe di ownership non distinguono «non e tuo» da «non hai un personaggio»

**File:** `test/authz/matrix-victims.ts:53-62` (usato da `test/authz/authorization-matrix.int-spec.ts:193-261`)
**Issue:** `persistAttacker` crea l'utente senza `currentCharacter` (e senza PendingQuest o QuestResult propri). In `CharacterAccessPolicy.authorizeCharacter` / `authorizePendingQuest` l'esito per un utente senza personaggio e quello del ramo «personaggio assente → esiste → notOwner»: la prova copre il caso degenere, non quello reale (un altro giocatore con il proprio personaggio attivo). Un'implementazione sbagliata che confrontasse solo «l'utente ha un personaggio» (o che usasse il primo personaggio trovato, o una corsia di un altro utente nel calcolo delle `pendingQuest`) passerebbe tutte le 41 righe di ownership e owner-only.
**Why it matters:** la matrice e l'evidenza di HARDEN-02: deve poter fallire per la regola di proprieta rotta piu probabile, cioe lo scambio fra due giocatori attivi. Per `questResult` la prova e gia sull'utente del risultato (non sul personaggio), quindi il buco riguarda character e pendingQuest.
**Suggested fix:** in `createMatrixWorld` dare ad `adventurer` (e `innkeeper`) un proprio personaggio attivo con una propria PendingQuest (riuso di `persistCharacter` come per la vittima, `currentCharacter` valorizzato) e un QuestResult proprio; la spec RED prima: una riga di controllo positivo «l'attaccante legge il proprio personaggio» piu le righe esistenti che restano FORBIDDEN. Una sessione per utente resta valida (D-02).

## Info

### C-IN-01: `close()` fa `dropDatabase` prima di `app.close()`

**File:** `test/harness/real-app-boot.ts:94-99`
**Issue:** il drop avviene con il change stream del watcher ancora aperto: lo stream si invalida e il watcher (riapertura con backoff ereditata) logga «chiusura inattesa: riapertura n. 1» a ogni fine suite (8 righe ERROR, rumore che nasconde errori veri). L'ordine inverso non si puo applicare tal quale: dopo `app.close()` la connessione dell'app e chiusa.
**Why it matters:** rumore nei log di CI e una riapertura inutile mentre l'app sta chiudendo.
**Suggested fix:** togliere il drop dal percorso con la connessione dell'app: `app.close()` poi `stopRedis()` e, se serve davvero pulire, un `mongoose.createConnection(uri, { dbName })` effimero per `dropDatabase()` e `close()` (l'uri va letto prima del ripristino di `process.env`). Ogni suite usa un `dbName` proprio dentro un replset che il globalTeardown butta, quindi il drop e solo igiene. Spec RED: la suite non emette righe ERROR (`Logger.prototype.error` spiato, `toHaveBeenCalledTimes(0)` dopo `close()`).

### C-IN-02: un compile fallito lascia aperte le connessioni

**File:** `test/harness/real-app-boot.ts:62-69,102-108`
**Issue:** `createApp` assegna `app` solo dopo `compile()`; se `compile()` lancia (provider asincroni di Mongoose/Bull gia connessi) il `catch` ha `app === undefined`, quindi `app?.close()` e un no-op e gli handle restano aperti (jest appeso: e la trappola 15-03 che il commento dice di evitare). Inoltre se `app.close()` nel `catch` lancia, `stopRedis()` e il ripristino di `process.env` vengono saltati.
**Why it matters:** su un boot rotto (il caso in cui piu serve che jest termini) il test si appende invece di fallire.
**Suggested fix:** far restituire a `createApp` anche il `moduleRef` (o chiuderlo nel `catch`: `await moduleRef?.close()`) e mettere ripristino env e `stopRedis` in un `finally`.

### C-IN-03: sul socket mancano le prove con JWT di un altro secret e con sessione valida

**File:** `test/authz/authorization-matrix.int-spec.ts:59-69,222-237`
**Issue:** i payload rifiutati alla `connection_init` sono due (assente, non-JWT); il JWT firmato con un altro secret, coperto sull'HTTP, qui non c'e. In piu le due righe girano su un solo handler e non dipendono dall'handler: il titolo non lo dice, ma l'`it.each` ne da l'impressione.
**Why it matters:** la verifica del JWT alla `connection_init` e un percorso separato da quello HTTP; una regressione sulla sola firma resterebbe non provata (il rifiuto `4403` e proprio quello pinnato da C-1).
**Suggested fix:** aggiungere a `INVALID_SOCKET_PAYLOADS` `{ payloadCase: 'a JWT signed by another secret', payload: { Authorization: foreignSecretBearer() } }` e iterare `wsRows` solo se serve (altrimenti una sola riga per payload).

### C-IN-04: la spec «targets a real victim» prova le etichette, non le variabili

**File:** `test/authz/handler-fixtures.spec.ts:134-153`
**Issue:** la spec confronta `fixture.target` con tre liste scritte a mano, ma non verifica che `variables(SAMPLE_VICTIMS)` contenga davvero l'id della vittima indicata dal target (e non `MATRIX_ANY_ID`). Oggi le fixture sono giuste (verificato a mano contro i `selectId`), ma un refactor di `C(v)` in `ANY` farebbe rispondere `NOT_FOUND` e lo scoprirebbe solo la spec di integrazione, lenta.
**Why it matters:** Pitfall 9 si puo provare in unit, in millisecondi.
**Suggested fix:** nella stessa spec, per ogni fixture: `const ids = JSON.stringify(fixture.variables(SAMPLE_VICTIMS))`; con target `character` deve contenere `SAMPLE_VICTIMS.characterId`, con `pendingQuest` `pendingQuestId`, con `questResult` `questResultId`, con `none` nessuno dei tre.

### C-IN-05: nessun controllo positivo per l'esenzione innkeeper sugli handler non owner-only

**File:** `test/authz/authorization-matrix.int-spec.ts:289-313`
**Issue:** i controlli positivi sono due (proprietario su `character`, innkeeper su `users`). Le 8 righe innkeeper x owner-only pinnano il rifiuto, ma non c'e la riga speculare «l'innkeeper passa on-behalf» su un handler ownership non owner-only (es. `character` della vittima): se `ownerOnly` diventasse il default per tutti gli handler, la matrice resterebbe verde (la lista owner-only del boot reale la fermerebbe, ma da un'altra parte).
**Why it matters:** l'esenzione (Phase 3 D-09) e la meta della coppia owner-only; provare solo un lato non blocca una regressione verso l'altro.
**Suggested fix:** aggiungere `it('lets the innkeeper read the character of another user on behalf (D-01)')` con `world.bearers.innkeeper`, `CHARACTER_QUERY` e `world.victims.characterId`, `body.errors` indefinito e `body.data` uguale a `{ character: { id } }`.

### C-IN-06: nessun controllo positivo sul socket

**File:** `test/authz/authorization-matrix.int-spec.ts:214-262`
**Issue:** le righe WS provano solo il rifiuto. Se una subscription autorizzata fosse rotta per una ragione diversa (variabili o documento che il server rifiuta in altro modo) il test continuerebbe a verificare solo `FORBIDDEN`, che e specifico: il rischio e basso, ma il lato «il proprietario si sottoscrive» non e mai provato in questa suite.
**Why it matters:** una fixture sottoscrizione sbagliata renderebbe vuota la prova senza che nessuno se ne accorga se un giorno il codice di errore cambiasse in modo compatibile.
**Suggested fix:** una riga positiva: `openSubscription` con `world.bearers.victim` su `CharactersResolver.characterUpdated` che resta aperta senza errori per una finestra breve (`expectSilence` va usata solo dopo un evento sentinella, Pitfall 12: meglio pubblicare un aggiornamento del personaggio e attendere `next()`).

---

_Reviewed: 
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
