---
phase: 02-auth-identity-foundation
reviewed: 2026-10-06T00:00:00Z
depth: deep
scope: re-review of fix commits 9decf23..HEAD (WR-01, WR-02, WR-03, IN-01, IN-02, IN-03, IN-07)
files_reviewed: 8
files_reviewed_list:
  - src/auth/auth-session.service.ts
  - src/auth/session/session.service.ts
  - src/auth/session/session.model.ts
  - src/config/auth-config.ts
  - src/auth/twitch/app-redirect-url.ts
  - src/auth/ws/ws-connection-authenticator.ts
  - src/users/twitch-id-index.verifier.ts
  - .env.example
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 2: Code Review Report (re-review delle fix)

**Reviewed:** 2026-10-06
**Depth:** deep (cross-file: `AuthSessionService` → `SessionService` → Mongo; `parseAuthConfig` → redirect builder; `graphql-ws` 6.0.6 `onConnect`/`onClose`)
**Files Reviewed:** 8 (più le spec toccate dai commit, lette per verificare che i test fissino il comportamento)
**Status:** issues_found

## Summary

Ho rivisto solo i commit `184b638..908f136`, cioè il diff `9decf23..HEAD` su `src`, `test` e `.env.example`, più gli aggiornamenti di `BACKEND-NOTES.md`.

Verifiche eseguite:

- `npx tsc --noEmit -p tsconfig.build.json`: pulito.
- Unit (`auth-config`, `twitch-urls`, `ws-connection-authenticator`): 69/69 verdi.
- Integration (`session.service`, `auth-session.service`, `twitch-id-index.verifier`): 41/41 verdi.
- Casi limite di `new URL()` provati con node.
- Ho controllato nel sorgente di `graphql-ws` 6.0.6 che `onClose` viene chiamato sempre, anche senza ack, e che `ctx.extra` è lo stesso oggetto per `onConnect` e `onClose`.

Esito: tutte e sette le fix eliminano il difetto originale, e ogni nuovo test fallirebbe se la fix venisse annullata.

La fix di WR-01 però sposta il controllo della grace window e il commit della rotazione **dopo** due operazioni di I/O (lettura utente con `populate`, firma). Questo apre due nuove strade per buttare fuori un client legittimo per colpa della lentezza del server. Con WR-02 entrambe finiscono in `SESSION_REVOKED` più un falso allarme "reuse detected", cioè la stessa classe di problema che WR-01 voleva eliminare. Le due strade sono riportate come warning.

Nessun bypass di sicurezza. Il refresh non consegna mai nulla al client prima che la rotazione sia persistita.

## Verdetto per finding originale

### WR-01: rotazione prima del lookup utente

**Verdetto: fix confermata, ma con un nuovo difetto (vedi WR-04, WR-05).**

- **Il difetto originale è eliminato.** `refresh()` esegue, in ordine:
  1. `findRotatable` (sola lettura);
  2. `findUserOrNull`;
  3. `signAccessToken`;
  4. `rotate`, l'ultimo passo e l'unica scrittura.

  Un errore ai passi 2 o 3 lascia il token intatto.
- **Il client non riceve nulla prima della persistenza.** Il JWT firmato al passo 3 resta in una variabile locale. Se `rotate` lancia, la funzione propaga l'errore e il JWT viene scartato. La firma non ha effetti collaterali.
- **Due refresh concorrenti con lo stesso token.** `rotate` resta un CAS atomico, quindi una sola sessione con un solo token corrente (test `concurrent:` ancora verde). Il primo commit vince con `rotateCurrent`, il secondo passa da `rotateWithinGrace` e orfana il token del primo: è il comportamento documentato. Non nascono mai due sessioni divergenti.
- **Sessione revocata o scaduta tra find e rotate.** Viene comunque rifiutata, perché i filtri di `rotateCurrent` e `rotateWithinGrace` includono `revokedAt: null` ed `expiresAt > now`. Poi `rejectRefresh` → `isRevokedSessionToken` risponde `SESSION_REVOKED`.
- **Utente cancellato.** Revoca della sessione + `SESSION_REVOKED`, invariato.
- **Test.** I casi `it.each` (`UsersService.findOne` e `AccessTokenService.sign` che falliscono una volta, poi retry a +31 s) falliscono con l'ordine precedente: il token sarebbe già ruotato e il retry fuori grace darebbe `SESSION_REVOKED`. Il test fissa quindi il comportamento.

### WR-02: reuse detection solo sul token precedente

**Verdetto: fix confermata (vedi IN-10 e IN-11 per i margini).**

**Atomicità.**

- `rotateCurrent` fa `$set` + `$push {$each, $slice: -10}` in una sola `findOneAndUpdate`, con filtro `refreshTokenHash = presented`, `revokedAt: null`, `expiresAt > now`.
- `rotateWithinGrace` usa una pipeline atomica che ritira `$refreshTokenHash` (il valore letto dal documento nel momento dell'update, quindi niente TOCTOU) e imposta il nuovo hash. Il filtro include l'hash presentato, la grace, `revokedAt: null` ed `expiresAt > now`.
- `rejectRefresh` revoca con `findOneAndUpdate`, filtro `retiredRefreshTokenHashes = presented`, `revokedAt: null`, `expiresAt > now`.

**Precedenza della grace.** Il token immediatamente precedente sta sia in `previousRefreshTokenHash` sia nella lista dei ritirati. Viene comunque ruotato entro i 30 s, perché il ramo grace è valutato prima di `rejectRefresh`.

**Retry doppio entro la grace.** Con T0→T1 e due retry consecutivi di T0 entro 30 s: il primo emette T2 e ritira T1, il secondo emette T3 e ritira T2. Il client possiede solo l'ultimo token ricevuto, quindi funziona.

**Abuso.** Revocare una sessione richiede un hash ritirato di **quella** sessione, cioè la preimmagine SHA-256 di un token casuale a 256 bit. Non è sfruttabile.

**Due device.** Due device sono due documenti di sessione distinti, senza interferenze.

**Indice.** È presente l'indice multikey `retiredRefreshTokenHashes_1`, usato da `rejectRefresh` e da `isRevokedSessionToken`.

**Segreti.** Il modello salva solo hash, e il test `retires only hashes` controlla che nessun token in chiaro finisca nel documento. Il log di reuse stampa solo il `_id` della sessione.

**Limite di 10 rotazioni.** Un token ritirato da più di 10 rotazioni risponde `SESSION_EXPIRED` e la sessione sopravvive. Il caso è documentato in BACKEND-NOTES §2 (bullet e tabella), ma non tra i limiti noti di §9 e non ha un test (IN-11).

**Test.** I casi `orphaned by a grace rotation` e `retired more than one rotation ago` falliscono sulla vecchia implementazione, che rispondeva `SESSION_EXPIRED`. Il caso `keeping the last 10` fissa `$slice`.

### WR-03: validazione al boot di `APP_AUTH_REDIRECT_URL`

**Verdetto: fix confermata (vedi IN-09 per la scelta denylist vs allowlist).**

**Bypass provati e respinti:**

- `JavaScript://x`: il regex ha il flag `i`, e `new URL` normalizza il protocollo in `javascript:`, che è nella denylist.
- ` https://…` e `\thttps://…`: respinti dal controllo su whitespace e caratteri di controllo, che copre anche lo whitespace Unicode via `trim()`.
- `klimmeck:auth`: non contiene `//`, quindi fallisce il pattern.
- `klimmeck_app://auth`: `new URL` lancia.
- `data:`, `file:`, `vbscript:`, `blob:`, `about:`, `ws(s):`, `ftp:`: tutti nella denylist.
- Gli schemi con `+ - .` (es. `com.klimmeck.app://`) sono accettati correttamente.

**Query string e fragment.** `new URL(base).searchParams.set` inserisce sempre il parametro nella query, **prima** del fragment:

- `klimmeck://auth#frag` → `klimmeck://auth?ticket=T#frag`;
- `klimmeck://auth?x=1` → `?x=1&ticket=T`;
- un `?ticket=` già configurato viene sovrascritto, non duplicato.

Unico effetto collaterale innocuo: la query esistente viene riserializzata (`%20` → `+`).

**Il builder non può lanciare.** `withQuery` ripete esattamente il `new URL(value)` già riuscito al boot, e `searchParams.set` e `toString` non lanciano. Il test `never throws … once it passed the boot validation` fallirebbe con la vecchia validazione, perché `klimmeck_app://auth` passava il boot e poi il builder lanciava.

### IN-01: `TWITCH_REDIRECT_URI` validato per prefisso

**Verdetto: fix confermata.**

- **Respinti:** `http://localhost.evil.com`, `http://127.0.0.1.evil.com` (hostname non esatto), `http://localhost@evil.com` e `http://localhost:3000@evil.com` (hostname `evil.com`), `http://[::1]` (hostname `[::1]`, che non è in lista; Twitch comunque non lo accetta), whitespace iniziale.
- **Accettato:** `http://localhost\@evil.com`, perché WHATWG legge `\` come `/` e quindi hostname = `localhost`. È innocuo: il valore grezzo viene inviato a Twitch, che pretende il match esatto con gli URL registrati, e un valore del genere non è registrabile.
- **Messaggio d'errore e §8 di BACKEND-NOTES** sono allineati.

### IN-02: timer WS creato dopo la chiusura del socket

**Verdetto: fix confermata.**

- In `graphql-ws` 6.0.6 `closed()` chiama sempre `onClose`, anche senza ack (`server-*.js:288`). `ctx.extra` è lo stesso oggetto passato a `onConnect` (`opened(socket, extra)`, riga 26-31).
- Il flag `closed` impostato in `onClose` viene quindi visto da `onConnect` dopo l'`await`.
- `onConnect` resta dentro il `try` e non lancia mai.
- Il test fallirebbe senza la guardia: `expiryTimer` sarebbe definito.

### IN-03: `TwitchIdIndexVerifier`

**Verdetto: fix confermata.**

- Solo `code === 11000` porta all'elenco dei duplicati. Il percorso è coperto anche dal test con Mongo reale e duplicati veri.
- Ogni altro errore viene loggato con name e code.
- `reportDuplicates` ha un proprio try/catch, e `describeError`/`errorCodeOf` non possono lanciare. `onApplicationBootstrap` quindi non lancia mai.
- Entrambi i nuovi test fallirebbero sulla vecchia implementazione: `findDuplicates` verrebbe chiamato e il secondo caso propagherebbe l'errore.

### IN-07: `MONGO_URI` senza replica set in `.env.example`

**Verdetto: fix confermata.** Il template ora usa `mongodb://localhost:27017/?replicaSet=rs0`, coerente con BACKEND-NOTES §7. Nessun secret introdotto.

## Warnings

### WR-04: la grace window viene valutata al momento della rotazione, non all'arrivo della richiesta: un retry legittimo vicino ai 30 s, unito a un server lento, revoca la sessione

**File:** `src/auth/auth-session.service.ts:44-51`, `src/auth/session/session.service.ts:70-78` e `130-141`

**Issue:**

- `findRotatable` valuta la grace con `now₁` (riga 48).
- `rotate` la rivaluta con un nuovo `now₂ = clock.now()` (riga 71), dopo `findById().populate('currentCharacter')` e la firma.
- Se tra i due istanti la finestra scade, `rotateWithinGrace` non trova il documento e `rejectRefresh` trova il token presentato in `retiredRefreshTokenHashes`, perché `rotateCurrent` lo aveva già ritirato. Risultato: **sessione revocata**.

Scenario concreto:

1. A t=0 `refreshSession(T0)` ruota in T1, ma la risposta si perde in rete.
2. A t=29,5 s il FE riprova con T0 (backoff 1+2+4+8+16 s ≈ 31 s: il confine è realistico). `findRotatable` lo accetta.
3. Il DB è lento (proprio lo scenario transitorio di WR-01) e la `populate` impiega 1 s.
4. A t=30,5 s `rotate(T0)` fallisce la grace, quindi `rejectRefresh` revoca la sessione e risponde `SESSION_REVOKED`, con il log `Refresh token reuse detected`.

Prima della fix la rotazione era il primo passo, quindi la grace veniva valutata all'arrivo e il retry passava.

Più in generale: se `findRotatable` è appena riuscito, un fallimento di `rotate` dovuto *solo* allo scadere della finestra è un artefatto della latenza del server, non un riuso.

**Fix:** valutare grace e scadenza rispetto a un unico istante di richiesta, catturato una sola volta e passato a `rotate`:

```ts
// AuthSessionService.refresh
const requestedAt = this.clock.now();
const session = await this.sessionService.findRotatable(refreshToken, requestedAt);
// ... user, sign ...
const rotated = await this.sessionService.rotate(refreshToken, requestedAt);

// SessionService
async rotate(refreshToken: string, requestedAt: Date = this.clock.now()) {
    // usare requestedAt per graceStartFrom(...) nel filtro di rotateWithinGrace;
    // rotatedAt/expiresAt possono continuare a usare clock.now()
}
```

Test (in `auth-session.service.int-spec.ts`):

1. ruotare T0;
2. avanzare il clock a +29 s;
3. fare in modo che lo spy su `UsersService.findOne` avanzi il clock di 2 s prima di risolvere;
4. `refresh(T0)` deve riuscire e la sessione non deve essere revocata.

### WR-05: tra lettura e rotazione si apre una finestra di riordino: un retry da timeout del client può ritrovarsi con un token orfano, e con WR-02 il suo uso revoca la sessione

**File:** `src/auth/auth-session.service.ts:44-51` (in combinazione con `src/auth/session/session.service.ts:130-170`)

**Issue:** prima della fix la rotazione era la prima scrittura, quindi le rotazioni concorrenti con lo stesso token venivano committate più o meno nell'ordine di arrivo. Ora tra arrivo e commit ci sono due operazioni di I/O, e una richiesta arrivata prima può committare **dopo** una arrivata più tardi.

Il client riceve la risposta della richiesta più recente, ma il suo token viene orfanato dalla rotazione in grace della richiesta più vecchia, che il client ha già abbandonato. Con WR-02 il token orfano è un token "ritirato": al refresh successivo, circa 15 minuti dopo, la sessione viene **revocata** con un falso allarme di reuse.

Scenario concreto, con un FE che rispetta il single-flight (una sola richiesta logica, con timeout e retry):

1. **Richiesta R1 (T0).** `findRotatable` OK, poi `populate` bloccata da un failover del replica set (~10 s di elezione).
2. **Il FE va in timeout** (es. 10 s) e riprova con T0 (richiesta R2). R1 resta in volo sul server.
3. **Fine dell'elezione.** R2 arriva, completa e committa per prima (`rotateCurrent`, T1). Il FE riceve e salva T1.
4. **R1 si sblocca** e chiama `rotate(T0)`: `rotateWithinGrace` riesce (T0 precedente, entro 30 s), emette T2 e **ritira T1**. La risposta di R1 va su una connessione già chiusa.
5. **Al refresh successivo** il FE presenta T1, che è in `retiredRefreshTokenHashes`: la sessione viene revocata (`SESSION_REVOKED`) e l'utente torna al sign-in.

L'esito è lo stesso tipo di lockout causato da un problema infrastrutturale che WR-01 voleva eliminare. La fix lo rende più probabile perché allarga la finestra, e WR-02 lo trasforma in un evento di furto.

Il "token orfano" è un limite già documentato, ma §2 lo presenta come conseguenza di refresh paralleli **senza** single-flight. Qui il FE è conforme.

**Fix (in ordine di preferenza):**

- **(a) Grace "a fratelli".** Durante la finestra di grace, una rotazione del token precedente non ritira il token corrente: lo aggiunge a un piccolo insieme `graceSiblingHashes`, i cui token restano tutti ruotabili. Alla prima rotazione di uno qualsiasi dei fratelli (via `rotateCurrent` esteso a `$or: [{refreshTokenHash}, {graceSiblingHashes}]`), gli altri vengono spostati in `retiredRefreshTokenHashes`. Così nessun ordine di commit lascia il client con un token morto, e la reuse detection resta valida per tutto ciò che è stato effettivamente sostituito da un uso.
- **(b) Alternativa minima.** Distinguere i token orfanati dalla grace (`graceOrphanHashes`), per i quali si risponde `SESSION_EXPIRED` senza revocare, dai token ruotati per uso effettivo, che restano reuse. È meno forte di D-08 per il caso "attaccante entro 30 s", quindi va documentato in §9.
- **In ogni caso,** aggiungere a BACKEND-NOTES §2 che il FE non deve ritentare un refresh finché la richiesta precedente può essere ancora in volo, e usare un timeout del client ben superiore alla latenza tipica.
- **Test:** con un `findOne` reso lento solo per R1, R2 completa per prima; poi il token restituito da R2 deve restare ruotabile.

## Info

### IN-09: `APP_AUTH_REDIRECT_URL` usa una denylist di schemi: `intent://…;S.browser_fallback_url=https://evil;end` passa

**File:** `src/config/auth-config.ts:57-70` e `186-202`

**Issue:** la denylist non copre `intent:` (Chrome Android). `intent://x#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fevil.com;end` supera la validazione e il builder lo rende `intent://x?ticket=T#Intent;…`. Se l'app non è installata, il browser di sistema apre `https://evil.com`: un open redirect da configurazione, cioè il caso che D-29 vuole escludere. Il ticket non viene inoltrato al fallback, quindi l'impatto è basso, e il valore è comunque controllato dall'operatore. Restano fuori anche `view-source:`, `chrome:`, `filesystem:`, `mailto:`, `sms:` e simili.

**Fix:** passare a un'allowlist. Ad esempio accettare solo lo schema dell'app (`klimmeck:`) o una lista esplicita `APP_DEEP_LINK_SCHEMES`, oppure almeno aggiungere `intent:` alla denylist.

### IN-10: le sessioni create prima del deploy perdono la reuse detection sul token precedente

**File:** `src/auth/session/session.service.ts:176-184` e `197-209`

**Issue:** `rejectRefresh` e `isRevokedSessionToken` non controllano più `previousRefreshTokenHash`, ma solo `retiredRefreshTokenHashes`. Un documento ruotato prima di `848fdbd` ha `previousRefreshTokenHash` valorizzato e nessun array. Il riuso del suo token precedente fuori dalla grace risponde quindi `SESSION_EXPIRED` invece di revocare, finché la sessione non ruota di nuovo. È una regressione temporanea, rilevante solo se esistono già sessioni in un ambiente condiviso.

**Fix:** in `rejectRefresh` usare `$or: [{ retiredRefreshTokenHashes: h }, { previousRefreshTokenHash: h }]`. È sicuro perché `rejectRefresh` viene raggiunto solo dopo che la grace è già fallita. In `isRevokedSessionToken` aggiungere lo stesso ramo, oppure eseguire una migrazione una tantum che copi `previousRefreshTokenHash` dentro `retiredRefreshTokenHashes`.

### IN-11: casi di WR-02 senza test

**File:** `src/auth/session/session.service.int-spec.ts`

**Issue:** non sono fissati da test:

- un token ritirato da più di 10 rotazioni risponde `SESSION_EXPIRED` e la sessione **non** viene revocata (comportamento documentato in §2);
- un token ritirato di una sessione già revocata risponde `SESSION_REVOKED` (ramo `retiredRefreshTokenHashes` di `isRevokedSessionToken`);
- un token ritirato di una sessione scaduta risponde `SESSION_EXPIRED` (filtro `expiresAt` di `rejectRefresh`);
- a livello di `AuthSessionService`, due `refresh` concorrenti dello stesso token (oggi la concorrenza è testata solo su `SessionService.rotate`).

**Fix:** aggiungere i quattro casi.

### IN-12: BACKEND-NOTES sottostima l'effetto dei refresh paralleli e non elenca il limite delle 10 rotazioni tra i limiti noti

**File:** `.planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md:125` e §9

**Issue:**

- Il bullet sul single-flight dice ancora "la prima diventa inutilizzabile". Dopo WR-02, presentarla **revoca l'intera sessione**, inclusa la coppia buona.
- Il limite delle 10 rotazioni (oltre il quale il furto non viene rilevato) compare in §2 ma non in §9.

**Fix:** aggiornare il bullet in "presentarla revoca l'intera sessione (reuse detection)" e aggiungere in §9 il limite delle 10 rotazioni, insieme all'eventuale scelta per WR-05.

### IN-13: `rotateWithinGrace` usa una update pipeline: da verificare in caso di upgrade di Mongoose

**File:** `src/auth/session/session.service.ts:143-166`

**Issue:** con Mongoose 8.18.1 funziona e i test passano. Le update pipeline però:

- saltano il casting di Mongoose;
- interpretano come field path qualunque stringa che inizi con `$`. Oggi `nextHash` è hex, quindi è sicuro.

Inoltre, per quanto risulta dal changelog, Mongoose 9 richiede l'opt-in esplicito `updatePipeline: true` per le update pipeline. Un upgrade romperebbe in silenzio solo il ramo grace.

**Fix:** aggiungere un commento accanto alla pipeline. In caso di upgrade, passare `{ new: true, updatePipeline: true }` e affidarsi al test di grace esistente.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
