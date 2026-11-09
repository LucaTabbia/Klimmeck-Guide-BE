---
phase: 17-autorizzazione-e-sessioni
reviewed: 2026-11-09T18:00:29Z
depth: standard (tre reviewer paralleli per area: A contratto/sessioni/refresh, B WebSocket/fan-out/watcher, C matrice/fixture/boot reale)
files_reviewed: 37
files_reviewed_list:
  - src/auth/auth-session.service.int-spec.ts
  - src/auth/auth-session.service.ts
  - src/auth/auth.exception.spec.ts
  - src/auth/auth.exception.ts
  - src/auth/auth.module.ts
  - src/auth/session/session-revocation.service.int-spec.ts
  - src/auth/session/session-revocation.service.ts
  - src/auth/session/session-revoke-reason.enum.ts
  - src/auth/session/session.model.spec.ts
  - src/auth/session/session.model.ts
  - src/auth/session/session.service.int-spec.ts
  - src/auth/session/session.service.ts
  - src/auth/session/user-role-changes.publisher.int-spec.ts
  - src/auth/session/user-role-changes.publisher.spec.ts
  - src/auth/session/user-role-changes.publisher.ts
  - src/auth/ws/ws-close-codes.ts
  - src/auth/ws/ws-connection-authenticator.spec.ts
  - src/auth/ws/ws-connection-authenticator.ts
  - src/auth/ws/ws-session-registry.spec.ts
  - src/auth/ws/ws-session-registry.ts
  - src/graphql/format-domain-error.spec.ts
  - src/graphql/format-domain-error.ts
  - src/graphql/production-errors.spec.ts
  - src/graphql/production-errors.ts
  - src/graphql/production-surface.int-spec.ts
  - src/users/user-updated.subscription.int-spec.ts
  - test/app.int-spec.ts
  - test/auth/session-revocation.int-spec.ts
  - test/auth/ws-auth.int-spec.ts
  - test/authz/authorization-matrix.int-spec.ts
  - test/authz/expected-handlers.ts
  - test/authz/handler-fixtures.spec.ts
  - test/authz/handler-fixtures.ts
  - test/authz/matrix-victims.ts
  - test/fixtures/session.fixture.ts
  - test/harness/real-app-boot.ts
  - test/harness/role-watcher.ts
findings:
  critical: 0
  warning: 3
  info: 15
  total: 18
status: issues_found
---
# Code review — Phase 17 Autorizzazione e sessioni (fusione dei gruppi A, B, C)

I tre report di gruppo (`17-REVIEW-A.md`, `17-REVIEW-B.md`, `17-REVIEW-C.md`) restano la fonte; questo file li fonde per severità.

## Summary

### Gruppo A
Gruppo A riletto per intero, con le spec. Il contratto regge: l'enum ha i quattro valori lower camel case, `revokeReason` è un enum nullable con default null scritto sempre insieme a `revokedAt` (revoke, revokeActive, reuse; utente cancellato con `null`). `AuthException.sessionRevoked(reason)` mette la reason solo nelle `extensions` e il body Nest resta invariato. I formatter conservano solo la chiave `reason` e solo se stringa. Gli update sono tutti condizionali su `revokedAt: null`, quindi una seconda revoca non sovrascrive data e motivo. `revokeOthersOf` usa `_id` `$lt` più il filtro delle sole sessioni attive. Il JWT resta stateless e l'unica lookup è `revokeReasonOf` alla `connection_init` (una `findById` con proiezione). Lo SDL non è toccato da questo gruppo. Le spec di filo provano davvero D-02, D-03, D-04 e D-05 con asserzioni `toEqual` esatte e fixture ripulite fra i casi. Nessun finding critico né warning. Restano sei osservazioni di qualità o robustezza, tutte con scenario stretto o già coperto da una scelta documentata.

### Gruppo B
Il gruppo B regge. L'ordine di `onConnect` è quello di D-03: bearer, `extra.closed`, `register`, `revokeReasonOf`, `extra.closed`, timer. Il timer non viene mai armato dopo un rifiuto 4409. `onClose` è l'unico hook cablato e svuota il registro. Il fan-out scrive prima a DB e poi chiude i socket, senza try/catch, quindi un errore DB lascia i socket aperti. Il watcher usa solo `documentKey` e non ha `updateLookup` né `onHistoryLost`. Il suo `.catch` logga solo id e `describeError`. È un provider di `AuthModule`, senza cicli DI. Lo SDL è invariato (`git diff 31dba96 -- src/schema.gql` è vuoto). Non ho trovato `Math.random`, `process.env`, `jest.mock(` o rete nei file del gruppo.

Il 4403 su errore DB della lookup è la decisione fail-closed di RESEARCH, non un finding.

Sulla race `find`/`updateMany` di `revokeActive`: il difetto sta in `session.service.ts` (gruppo A) e lo segnalo solo lì. Qui la reason passata a `closeSessions` è quella del chiamante, coerente con ciò che viene scritto a DB.

Restano due debolezze reali:
- La prova di assenza del watcher poggia su una barriera che non garantisce l'ordine (B-WR-01).
- Un evento di ruolo tardivo può revocare una sessione appena emessa (B-WR-02).

Più tre punti di qualità o copertura.

### Gruppo C
Rivisti i sette file del gruppo C (lettura integrale, piu guard/policy di ownership e client WS di test per giudicare cosa provano le righe). Nessun critical: le tre liste condivise sono identiche a quelle di `develop` (11/19/8, `as const`), `test/app.int-spec.ts` le confronta ancora coi metadati del boot reale (nessuna asserzione persa; aggiunti solo i due test di montaggio dei nuovi provider), l'ambiente finto del boot condiviso e identico a quello di prima, `AppModule` e importato in modo differito dopo l'ambiente e nessuna `*.spec.ts` unit lo importa, lo SDL e invariato (`git diff origin/develop -- src/schema.gql` vuoto). Le 30 fixture coprono ogni handler (Record su `ProtectedHandler` piu spec sulle chiavi), gli id delle variabili corrispondono ai `selectId` dei resolver (`request.id`, `request.characterId` per `useSpell`, `characterId` per `questResultReceived`, `id` per query/subscription) e le vittime sono vere. Il conto della matrice torna: 50 (innkeeper HTTP: 10 x (2 ruoli + 3 bearer)) + 17 + 7 + 2 + 2 + 2 + 1 + 2 (completezza) + 2 (controlli positivi) = 85. Un warning (gli attaccanti non hanno un personaggio proprio) e sei info (ordine di chiusura del boot, perdita di handle su compile fallita, prove WS piu sottili di quelle HTTP, spec dei target che non prova le variabili, controlli positivi mancanti per l'esenzione e per il WS).

## Critical

### Gruppo A

Nessuno.

### Gruppo B

Nessuno.

### Gruppo C

Nessuno.

## Warning

### Gruppo A

Nessuno.

### Gruppo B

### B-WR-01: la barriera `flushRoleWatcher` non garantisce che gli eventi precedenti siano stati elaborati

**File:** `test/harness/role-watcher.ts:111` e `src/auth/session/user-role-changes.publisher.ts:42-52`
**Issue:** Il commento dice che alla revoca della barriera «ogni evento precedente è già stato elaborato». `onChange` però è fire-and-forget: ogni evento avvia `revokeAllForRoleChange` (una `find` e poi una `updateMany`) senza attendere il precedente. Le catene di due eventi consecutivi girano quindi in concorrenza, e quella dell'evento N+1 (la barriera) può terminare prima di quella dell'evento N.
**Why it matters:** Le tre prove di assenza («stesso ruolo», «altro campo», «altri utenti e già revocate»; int-spec `:140-203`) usano `flushRoleWatcher` come unica garanzia. Se la revoca spuria arriva dopo la barriera, il test passa lo stesso. La prova diventa vuota proprio dove deve provare che non succede nulla. L'esposizione è piccola (le due catene hanno la stessa forma e partono in ordine), ma il commento promette più di quanto il codice dia.
**Suggested fix:** Serializzare le revoche nel publisher, con un effetto utile anche in produzione (ordine di rivocazione deterministico):
```ts
private tail: Promise<void> = Promise.resolve();
protected onChange(change: ChangeStreamEvent): void {
    const userId = documentIdOf(change.documentKey);
    if (!userId) return;
    this.tail = this.tail
        .then(() => this.revocation.revokeAllForRoleChange(userId))
        .catch((error: unknown) =>
            this.logger.error(`... ${describeError(error)}`),
        );
}
```
Spec RED prima, nel `user-role-changes.publisher.spec.ts`: due `onChange` con la prima `revokeAllForRoleChange` ritardata (promise controllata). Asserire che la seconda parte solo dopo che la prima è risolta e che un rifiuto della prima non salta la seconda. In alternativa, restando sui soli test, far attendere a `flushRoleWatcher` anche una seconda revoca-barriera, ma la serializzazione è la correzione vera.

### B-WR-02: un evento di cambio ruolo tardivo revoca anche la sessione emessa dopo il cambio

**File:** `src/auth/session/session-revocation.service.ts:26-32`, `src/auth/session/user-role-changes.publisher.ts:42-52`
**Issue:** `revokeAllForRoleChange` revoca ogni sessione attiva dell'utente, senza un limite temporale legato all'evento. Il token di ripresa è in memoria (`resumeToken`), e dopo una caduta dello stream l'evento viene consegnato alla riapertura, dopo il backoff.
Scenario: il ruolo cambia a T, lo stream è giù per N secondi, l'utente fa login a T+1 e ottiene un JWT con il ruolo nuovo. Alla riapertura arriva l'evento di T e la sessione nuova viene revocata con `roleChanged`. L'utente viene espulso senza motivo e al primo refresh trova `SESSION_REVOKED`. Lo stesso accade, con finestra di millisecondi, senza cadute dello stream.
**Why it matters:** È un logout spurio, non un buco di sicurezza (la direzione è fail-closed). È raggiungibile con un'operazione manuale concorrente a un login. Il costo di evitarlo è basso.
**Suggested fix:** Limitare la revoca alle sessioni create prima dell'evento. Il watcher legge `clusterTime` dall'evento (aggiungerlo a `ChangeStreamEvent`) e passa a `revokeAllOf` un limite `_id` o `createdAt` minore. Serve una modifica in `session.service.ts` (gruppo A), da coordinare. Spec RED prima, nella int-spec del watcher: sessione creata dopo `setRoleByHand` ma con l'evento ancora in volo (ritardato con un `await` sul publisher) deve restare attiva. Se si preferisce accettare il rischio, documentarlo nel handoff come limite noto accanto a D-10.

### Gruppo C

### C-WR-01: gli attaccanti della matrice non hanno personaggio, quindi le righe di ownership non distinguono «non e tuo» da «non hai un personaggio»

**File:** `test/authz/matrix-victims.ts:53-62` (usato da `test/authz/authorization-matrix.int-spec.ts:193-261`)
**Issue:** `persistAttacker` crea l'utente senza `currentCharacter` (e senza PendingQuest o QuestResult propri). In `CharacterAccessPolicy.authorizeCharacter` / `authorizePendingQuest` l'esito per un utente senza personaggio e quello del ramo «personaggio assente → esiste → notOwner»: la prova copre il caso degenere, non quello reale (un altro giocatore con il proprio personaggio attivo). Un'implementazione sbagliata che confrontasse solo «l'utente ha un personaggio» (o che usasse il primo personaggio trovato, o una corsia di un altro utente nel calcolo delle `pendingQuest`) passerebbe tutte le 41 righe di ownership e owner-only.
**Why it matters:** la matrice e l'evidenza di HARDEN-02: deve poter fallire per la regola di proprieta rotta piu probabile, cioe lo scambio fra due giocatori attivi. Per `questResult` la prova e gia sull'utente del risultato (non sul personaggio), quindi il buco riguarda character e pendingQuest.
**Suggested fix:** in `createMatrixWorld` dare ad `adventurer` (e `innkeeper`) un proprio personaggio attivo con una propria PendingQuest (riuso di `persistCharacter` come per la vittima, `currentCharacter` valorizzato) e un QuestResult proprio; la spec RED prima: una riga di controllo positivo «l'attaccante legge il proprio personaggio» piu le righe esistenti che restano FORBIDDEN. Una sessione per utente resta valida (D-02).

## Info

### Gruppo A

### A-IN-01: `revokeActive` restituisce anche gli id che l'`updateMany` non ha toccato

**File:** `src/auth/session/session.service.ts:164-179`
**Issue:** gli id restituiti sono quelli letti dalla `find` dei candidati, non quelli effettivamente modificati dall'`updateMany`. Scenario: fra la `find` e l'`updateMany` un logout concorrente scrive `userLogout` su una delle sessioni candidate. L'`updateMany` la salta, per via del filtro `revokedAt: null`. L'id viene comunque restituito a `SessionRevocationService`, che chiama `registry.closeSessions(ids, newLogin)` e chiude il socket vivo con `4409 newLogin`. A DB resta `userLogout`.
**Why it matters:** la sessione è revocata in ogni caso, quindi non c'è un buco di sicurezza. Cambia solo la reason sul filo, e solo con una finestra di corsa di pochi millisecondi. La riconnessione trova poi la reason di DB, quindi il FE vede due motivi diversi per la stessa sessione.
**Suggested fix:** filtrare gli id realmente scritti. Dopo l'`updateMany`, rileggere `find({ _id: { $in: ids }, revokedAt: now, revokeReason: reason }, { _id: 1 })` e restituire quelli. In alternativa usare l'esito `modifiedCount` quando coincide con `ids.length` e rileggere solo in caso contrario. Spec RED prima: stub del modello che fra `find` e `updateMany` revoca una candidata con `userLogout`, e attesa che l'id restituito non la contenga.

### A-IN-02: l'ordinamento per `_id` come criterio «ultimo login» vale solo in un processo

**File:** `src/auth/session/session.service.ts:119-130`
**Issue:** `revokeOthersOf` considera «più vecchia» ogni sessione con `_id` minore. Un ObjectId ordina per secondo, poi per valore casuale del processo, poi per contatore. Con due processi BE nello stesso secondo, un login successivo può avere `_id` minore del precedente. In quel caso non revoca la sessione che dovrebbe cacciare, e restano due sessioni attive (D-02 violata).
**Why it matters:** il registro dei socket è già dichiarato single-node (D-03), quindi oggi non è raggiungibile. Il vincolo però non è scritto accanto al criterio di D-12.
**Suggested fix:** aggiungere al commento di D-12 «ordine valido con un solo processo BE». Se un giorno nasce un secondo nodo, passare a un criterio su `createdAt` (già presente con `timestamps: true`) con `_id` come spareggio. Nessuna spec ora.

### A-IN-03: `revoke` usa `Types.ObjectId.isValid`, le altre guardie `isObjectIdHex`

**File:** `src/auth/session/session.service.ts:93`
**Issue:** `Types.ObjectId.isValid` accetta anche stringhe di 12 caratteri qualsiasi, mentre `revokeOthersOf`, `revokeAllOf` e `revokeReasonOf` usano `isObjectIdHex` (24 caratteri esadecimali). Una stringa di 12 caratteri passerebbe la guardia e Mongoose la convertirebbe in un ObjectId diverso da quello atteso.
**Why it matters:** il `sessionId` arriva sempre dal claim `sid` di un JWT firmato, quindi oggi non è raggiungibile. È solo un'incoerenza fra guardie nello stesso file.
**Suggested fix:** sostituire con `if (!isObjectIdHex(sessionId)) return;`. La spec esistente su `'not-an-object-id'` resta valida. Aggiungere un caso con `'abcdefghijkl'` per fissare il comportamento.

### A-IN-04: l'allowlist di `reason` non è legata a `SESSION_REVOKED` né ai valori dell'enum

**File:** `src/graphql/format-domain-error.ts:48-51`, `src/graphql/production-errors.ts:57-60`
**Issue:** `extensionsOf` conserva qualunque `reason` stringa di qualunque `HttpException` con `extensions.code`, e `sanitizeFormattedError` la conserva per ogni codice non interno. Oggi solo `AuthException.sessionRevoked` la produce, ma una futura eccezione di dominio con `extensions.reason` (testo libero, magari con dettagli interni) uscirebbe in produzione senza che nessun test fallisca. La spec `keeps only the reason among the extensions...` certifica proprio che `reason: 'probe'` su `PROBE_CODE` passi.
**Why it matters:** è difesa in profondità sul canale che D-13 voleva stretto. Il rischio è nel futuro, non nel codice attuale.
**Suggested fix:** conservare la reason solo quando `code === AuthErrorCode.SESSION_REVOKED` e il valore è in `Object.values(SessionRevokeReason)`. Spec RED prima: la `reason` di `PROBE_CODE` viene scartata e una `reason: 'zzz'` su `SESSION_REVOKED` viene scartata. Va adattato di conseguenza il test `keeps only the reason...`, che oggi prova il contrario.

### A-IN-05: `issueForUser` lascia a DB la sessione appena creata se la revoca fallisce

**File:** `src/auth/auth-session.service.ts:27-34`, `src/auth/auth-session.service.int-spec.ts:175-190`
**Issue:** se `revokeOthersOnLogin` solleva, la sessione nuova resta attiva a DB ma il suo refresh token non arriva mai al client. Il commento dice che «scade da sola», cioè dopo il TTL del refresh (30 giorni, nessun TTL breve). La spec `fails the login when the revocation fails` sostituisce l'intero `revokeOthersOnLogin` con un mock. Prova la propagazione dell'errore, ma non lo stato lasciato a DB né l'assenza di un token restituito.
**Why it matters:** la sessione orfana è inutilizzabile, perché il token non è mai stato consegnato, e il login successivo la revoca (ha l'`_id` più basso). Il costo è un documento in più per 30 giorni per ogni fallimento.
**Suggested fix:** o si accetta e si corregge il commento («resta attiva fino al TTL; il login successivo la revoca»), o si fa una revoca best-effort della nuova sessione nel ramo di errore, con `revoke(sessionId, null)` e sempre rilancio dell'errore originale. Nel secondo caso scrivere prima la spec: dopo il fallimento la sessione appena creata ha `revokedAt` valorizzato.

### A-IN-06: fragilità e buchi della prova di filo

**File:** `test/auth/session-revocation.int-spec.ts:22,149-160`, `src/graphql/production-surface.int-spec.ts:211-224`
**Issue:**
1. Il test di logout dimostra «nessuna chiusura» con una finestra fissa di 300 ms (`LOGOUT_SILENCE_MS`). Un fan-out che chiudesse dopo 300 ms (event loop carico, CI lenta) passerebbe come falso verde. Lo stesso costo di tempo fisso si paga a ogni run.
2. Su filo manca la `connection_init` con il JWT di una sessione `reuseDetected`, che è il caso D-03/OQ3 citato nel brief. Il test di logout copre solo `userLogout`.
3. In `production-surface` la reason su graphql-ws in produzione è provata solo a livello unitario (`production-errors.spec.ts:199`), non sul filo. Il caso HTTP è provato.

**Why it matters:** non sono bug. Il punto 1 è una prova per assenza con tempo fisso, e i punti 2 e 3 sono percorsi coperti solo indirettamente.
**Suggested fix:**
1. Dopo il logout, verificare anche che il socket sia ancora registrato e aperto (`socket.readyState === WebSocket.OPEN`) e ridurre la finestra, oppure chiudere il socket a mano e verificare che la `connection_init` successiva sia rifiutata (già presente). La finestra resta solo come sanity check.
2. Aggiungere un caso: far scattare il reuse con un token ritirato oltre la grace, poi `connectAndAwaitClose` con il JWT, attendendo `{ code: 4409, reason: 'reuseDetected', acknowledged: false }`.
3. Aggiungere un caso su `subscribeOnce` in produzione con una sessione revocata, oppure documentare che la copertura unitaria basta.

---

_Reviewed: 2026-11-09T17:56:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo B

### B-IN-01: nessuna prova che un socket rifiutato con 4409 esca dal registro

**File:** `test/auth/ws-auth.int-spec.ts:195-231` e `src/auth/ws/ws-connection-authenticator.spec.ts:187-220`
**Issue:** Alla `connection_init` di una sessione revocata il socket viene registrato prima della lettura (`ws-connection-authenticator.ts:83`), poi chiuso con 4409 e `return false`. Il tolto-dal-registro dipende interamente dal fatto che graphql-ws invochi `onClose` anche per le connessioni rifiutate (probe P2). La unit non chiama `onClose` dopo il rifiuto. La int-spec `forgets a socket closed by the client` copre solo il socket accettato. Un aggiornamento di graphql-ws che cambi questo comportamento farebbe crescere il registro senza che nessun test si rompa.
**Why it matters:** Il leak sarebbe silenzioso: un'entry per ogni tentativo con un JWT revocato.
**Suggested fix:** Spec RED nella int-spec «connection_init of a revoked session»: dopo `connectAndAwaitClose` del bearer di una sessione dopo logout, `await waitUntilUnregistered(registry, sessionId)` deve dare `true`. Nella unit: `onConnect` con sessione revocata, poi `onClose(context)` e `registry.unregister` chiamato con `('session-1', socket)`.

### B-IN-02: `closeSessions` non isola il fallimento di un singolo socket

**File:** `src/auth/ws/ws-session-registry.ts:34-39`
**Issue:** Se `socket.close` lancia, il ciclo si interrompe: i socket successivi e le sessioni successive restano aperti e registrati (la `delete` non è raggiunta). L'eccezione risale a `revokeOthersOnLogin`, quindi un login già revocato a DB fallisce per un problema del layer WS. Con codice 4409 e reason dell'enum `ws` non lancia, quindi non è raggiungibile oggi: è robustezza.
**Why it matters:** Il fan-out non deve poter rompere il login dopo che la revoca a DB è stata scritta.
**Suggested fix:** `try { socket.close(...) } catch { /* il socket è già andato: onClose lo toglierà */ }` per socket e `delete` fuori dal ciclo interno. Spec RED nel registry: un socket il cui `close` lancia non impedisce la chiusura del secondo e la sessione risulta dimenticata. Il try/catch ammette un commento solo per il «perché».

### B-IN-03: spec che mescolano due comportamenti e poll con numeri magici

**File:** `src/auth/ws/ws-session-registry.spec.ts:63-81` e `test/auth/ws-auth.int-spec.ts:39-40,55-66`
**Issue:** `forgets a socket that closed by itself` verifica due comportamenti in un test solo: `closeSessions` che salta il socket tolto, e `unregister` che svuota la sessione quando il Set resta vuoto, con un secondo registry creato a metà. Se il secondo fallisce, il titolo non dice quale. `waitUntilUnregistered` ha un budget fisso di 2 s (100 × 20 ms) con ultima lettura dopo il ciclo: va bene, ma le due costanti e `POLL_INTERVAL_MS` di `role-watcher.ts` ripetono lo stesso schema di poll in tre punti (`waitForRevocation`, `waitUntilUnregistered`, il priming).
**Why it matters:** Solo manutenzione: nessun rischio di correttezza.
**Suggested fix:** Spezzare il test del registry in due `it`. Estrarre un helper `pollUntil(predicate, { intervalMs, attempts })` in `test/harness/` e riusarlo nei tre punti.

---

_Reviewed: 2026-11-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo C

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
