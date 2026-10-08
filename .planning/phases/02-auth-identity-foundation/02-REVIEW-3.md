---
phase: 02-auth-identity-foundation
reviewed: 2026-10-06T21:08:10Z
depth: deep
scope: "gap-closure 02-10 (D-35), commit 9f2f92d..HEAD"
files_reviewed: 5
files_reviewed_list:
  - src/auth/crypto/refresh-token-derivation.ts
  - src/auth/session/session.model.ts
  - src/auth/session/session.service.ts
  - src/auth/auth-session.service.ts
  - test/fixtures/session.fixture.ts
findings:
  critical: 0
  warning: 1
  info: 7
  total: 8
status: issues_found
---

# Phase 2: Code Review Report, terzo passaggio (plan 02-10, D-35)

**Reviewed:** 2026-10-06T21:08:10Z
**Depth:** deep
**Files Reviewed:** 5 sorgenti. Letti anche, come contesto: `refresh-token-derivation.spec.ts`, `session.service.int-spec.ts`, `auth-session.service.int-spec.ts`, `token-crypto.ts`, `auth-config.ts`, BACKEND-NOTES, plan e summary 02-10. Lato FE è stato letto `session_auth_token_service.dart`, per capire quando il client rinnova.
**Status:** issues_found

## Summary

D-35 è implementato correttamente e chiude WR-05 nella forma in cui era stato descritto. In quel caso le richieste sono due e presentano lo stesso token: il retry viene elaborato prima, l'originale bloccato dopo. Ora entrambe ricevono lo stesso token e il client non resta con un token orfano.

In tutti gli interleaving fra il token corrente e quello immediatamente precedente resta un solo token corrente, e ogni richiesta riceve quel token. Gli interleaving verificati sono:
- risposta persa seguita da retry;
- due refresh concorrenti;
- richiesta bloccata elaborata dopo il retry;
- triplo retry;
- sessione legacy contesa.

La ri-emissione non scrive niente e verifica l'hash prima di restituire il token. Quando non può ricostruirlo risponde `SESSION_EXPIRED` senza revocare la sessione. La crittografia è adeguata. Il seed e il token non escono mai: niente log, niente GraphQL, niente errori che li contengano.

Verifiche eseguite:
- `npx jest src/auth/crypto/refresh-token-derivation.spec.ts --selectProjects unit`: 10/10.
- `npx jest src/auth/session src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand`: 51/51.
- `npx tsc --noEmit -p tsconfig.build.json`: pulito.
- Uno script con Mongoose 8 e mongodb-memory-server, eseguito nello scratchpad, conferma che un documento senza `rotationCount` viene idratato con il default `0`. Con `.lean()` il campo resta invece `undefined`.

Resta un caso residuo di lockout, che però non va trattato come difetto di D-35. Un duplicato di T0 elaborato **dopo** che il client ha già ruotato T1→T2 trova T0 nella lista dei ritirati, non nel campo `previous`, e revoca la sessione. Il problema è che la documentazione e il summary dichiarano la convergenza "in qualunque ordine" e chiudono il limite (j). Il summary, inoltre, sottostima la probabilità del caso: parla di uno "stall ≥ 15 min", ma in realtà basta un cold start del FE (WR-01).

## Verdetti per domanda

### 1. Convergenza: **OK per la coppia {corrente, precedente}; resta un caso di lockout quando, nel frattempo, il client ha già ruotato (WR-01)**

Riferimenti: `findRotatable` (`session.service.ts:59-79`), `rotate` (`:84-94`), `rotateCurrent` (`:107-152`), `reissueWithinGrace` (`:156-176`).

- **Risposta persa + retry.** Il primo `rotateCurrent` scrive T1 e il client non lo riceve. Il retry con T0: `rotateCurrent` non trova nulla, quindi `reissueWithinGrace` trova `previousRefreshTokenHash = h(T0)` e `rotatedAt > requestedAt − 30 s`. Ricostruisce `derive(id, 1, seed)`, l'hash coincide e il retry riceve T1. Esiste un solo token corrente. ✓
- **Due refresh concorrenti.** Entrambi leggono T0 come corrente e derivano lo stesso T1, perché seed e contatore sono identici. Il CAS del perdente fallisce sul filtro `refreshTokenHash: h(T0)` e la ri-emissione restituisce T1. ✓
- **Richiesta bloccata elaborata dopo il retry (WR-05).** R1 arriva a t=0 e si blocca dopo `findRotatable`. R2 arriva a t=10 e ruota a T1, che il client salva. R1 riprende a t=15 con `requestedAt=0` e ottiene la ri-emissione, perché `rotatedAt=10 > −30`, quindi riceve T1. Il successivo `rotate(T1)` riesce. ✓ Il caso è coperto dai test in `session.service.int-spec.ts:280` e `auth-session.service.int-spec.ts` ("reverse order").
- **Triplo retry dentro 30 s.** Una richiesta ruota, le altre due ricevono T1 in ri-emissione. ✓
- **Retry in corsa con una rotazione in avanti di T1 (il caso indicato nella domanda).**
  1. A ruota T0→T1 a t=0.
  2. Il client riceve T1 e a t=5 lo ruota (T1→T2): ora `previous = h(T1)` e `rotatedAt = 5`.
  3. Un duplicato tardivo con T0 viene elaborato a t=8.

  Esito: `rotateCurrent` non trova nulla e il filtro grace fallisce, perché `previous` è h(T1). `rejectRefresh` trova h(T0) in `retiredRefreshTokenHashes` sulla sessione attiva: **revoca la sessione + `SESSION_REVOKED`**. La risposta va alla connessione abbandonata, e al refresh successivo il client riceve a sua volta `SESSION_REVOKED`, quindi logout. Il server non sa distinguere questo caso da un furto. Il comportamento è coerente con D-08, ma è un lockout di un client onesto e la documentazione dice il contrario. Vedi WR-01.
- **Due token validi diversi?** No. Durante la finestra T0 è "accettato", ma porta sempre a T1. Non esiste un interleaving che produca due hash correnti, e l'unique index su `refreshTokenHash` è un'ulteriore garanzia.
- **`requestedAt` vs `rotatedAt`.** L'uso è coerente: `findRotatable` e `reissueWithinGrace` usano lo stesso `withinGraceFilter(presentedHash, requestedAt)`, mentre i filtri di stato attivo usano `now`. `rotatedAt` è l'istante dell'**ultima** rotazione in avanti, e la ri-emissione non lo modifica. La grace vale quindi solo per il token immediatamente precedente, per 30 s dall'ultima rotazione.

### 2. Atomicità e race in `rotateCurrent`: **OK**

- **Due rotazioni in avanti concorrenti non possono riuscire entrambe.** Il filtro del CAS (`session.service.ts:127-131`) contiene `refreshTokenHash: presentedHash`: dopo il primo `$set` l'hash è cambiato, quindi il secondo update trova 0 documenti. Non c'è rischio ABA, perché un token derivato da `(id, n+k, seed)` non può tornare uguale a T0.
- **Revoca o scadenza tra la lettura e l'update.** Il filtro del CAS include `activeFilter(now)`, quindi l'update fallisce. Anche la ri-emissione filtra sullo stato attivo, quindi si arriva a `rejectRefresh` → `isRevokedSessionToken` → `SESSION_REVOKED`, oppure `SESSION_EXPIRED`. ✓
- **Sessione legacy senza seed, con due rotazioni concorrenti.** Ciascuna genera un seed diverso (S_A, S_B). Vince A e scrive `tokenSeed=S_A` e `rotationCount=1`. Il CAS di B fallisce. La ri-emissione di B legge il documento così com'è ora, cioè con S_A, e ricostruisce T1_A con l'hash verificato. Il perdente riceve quindi sempre il token del vincitore. ✓
- **`rotationCount` assente nei documenti legacy.** Verificato empiricamente con Mongoose 8: un `findOne` idratato applica il default `0`, quindi `0 + 1 = 1` e non `NaN`. Il service non usa mai `.lean()`, per cui oggi il comportamento è corretto. Non esiste però un test che lo fissi: la fixture imposta sempre `rotationCount: 0` (IN-02). Con `.lean()` o con una proiezione si otterrebbe `NaN`. Siccome `JSON.stringify(NaN)` vale `null`, ogni rotazione produrrebbe lo stesso token, che non ruoterebbe mai.

### 3. Percorso di ri-emissione: **OK**

- **Nessuna scrittura.** Le operazioni sono solo `findOne`, più un `logger.warn` che contiene il solo `sessionId` (`:161-175`). ✓
- **Il token viene restituito solo se l'hash coincide.** La verifica è `sha256Hex(rebuilt) === session.refreshTokenHash` (`:186`). Il confronto con `===` non è a tempo costante, ma entrambi gli operandi sono dati lato server: nessun valore controllato dall'attaccante entra nel confronto, quindi non c'è un oracolo di timing. ✓
- **Ricostruzione impossibile.** Senza seed, con un token non derivato o dopo un cambio di secret, la risposta è `SESSION_EXPIRED` senza revoca. ✓ È coperto dai test (`:317`, `:335`).
- **Raggiungibilità.** Il filtro richiede `previousRefreshTokenHash` uguale all'hash presentato, `rotatedAt` dentro la finestra, `revokedAt: null` e `expiresAt > now`. Un token precedente di una sessione revocata o scaduta, oppure fuori dalla finestra, non arriva alla ri-emissione. Anche un token più vecchio del precedente non ci arriva.
- **`AuthSessionService.refresh()`** (`auth-session.service.ts:45-62`) segue l'ordine find → user → sign → rotate. Se `rotate` lancia un errore, l'access JWT firmato viene scartato e non restituito. Il `sessionId` usato per la firma coincide con quello della sessione ruotata o ri-emessa, perché l'hash corrente è unico e il token derivato contiene il `sessionId`. ✓ Un dettaglio minore è in IN-07.

### 4. Crittografia: **OK**

- **HKDF senza salt.** Il salt vuoto è ammesso da RFC 5869 §3.1 (si usano HashLen byte a zero). Con un IKM ad alta entropia, l'unico ruolo di HKDF qui è la separazione di dominio, e l'`info` dedicata `klimmeck/refresh-token/v1` la fornisce. JWT HS256 usa il secret grezzo come chiave HMAC, mentre i refresh token usano `HMAC(PRK, info‖0x01)` con `PRK = HMAC(0^32, secret)`: sono chiavi indipendenti. ✓
- **Input dell'HMAC.** `JSON.stringify([string, number, string])` non è ambiguo: le stringhe sono quotate ed escapate, il numero è un letterale. ✓
- **Lunghezza.** L'output è di 256 bit, cioè 43 caratteri base64url: identico per formato ed entropia al vecchio `generateOpaqueToken`. ✓
- **Chi ha solo accesso in lettura al DB** (hash, seed, contatore, id) non può derivare un token senza la chiave. **Chi ha solo il secret** non può derivarlo senza il seed casuale a 256 bit. Ha però già pieno potere, perché può firmare access JWT arbitrari: per i refresh token la protezione in più conta solo nel caso di leak del solo DB. Una nota, priva di impatto pratico, è in IN-05: un leak del DB diventa un verificatore offline per `JWT_SECRET`.
- **Esposizione.** `Session` è solo uno `@Schema` Mongoose, non un `@ObjectType`, e nessun resolver o controller restituisce documenti di sessione (solo `SessionService` usa il model). Il log stampa solo il `sessionId`, e `AuthException` non contiene il token. ✓ Un hardening facoltativo è in IN-06.

### 5. Reuse detection e handoff: **la detection è intatta; la documentazione è parzialmente imprecisa**

- **Detection.** Lo stato è il seguente:
  - token precedente fuori dalla finestra → revoca + `SESSION_REVOKED` (test `:512`);
  - token ritirato tra gli ultimi 10 → revoca (test `:390`, `:459`);
  - token mai emesso → `SESSION_EXPIRED` (test `:528`).

  `rejectRefresh` è invariata, salvo l'estrazione di `activeFilter`. ✓
- **BACKEND-NOTES.** §2 descrive correttamente la derivazione, la ri-emissione senza scrittura, la scadenza non spostata e il fail-closed. §10 tratta correttamente il cambio di `JWT_SECRET` e le sessioni pre-D-35, e §11 il fatto che il FE non cambia (token opaco, stessi codici). Due punti non sono veritieri o mancano:
  - (j) è dichiarato "chiuso … in qualunque ordine vengano elaborati", e §2 dice "non esistono token orfani … in qualunque ordine". Il caso residuo di WR-01, una rotazione in avanti intervenuta nel frattempo, non è documentato.
  - Il rischio accettato T-2-refresh-replay non compare in BACKEND-NOTES §2/§9: chi presenta il token precedente entro 30 s riceve il token **corrente**. Compare solo nel threat model del plan (IN-03).

### 6. Test: **solidi sul comportamento richiesto, con due lacune non vacue (IN-01, IN-02)**

- **Se `reissueWithinGrace` emettesse un token nuovo**, fallirebbero `toEqual(t1)` (`:249`, `:260`, `:277`), `stale.refreshToken === retried.refreshToken` (`:291`) e il test di concorrenza (`:562`).
- **Se scrivesse sul documento**, fallirebbe `readSession(...)` `toEqual(afterRotation)` (`:250`, `:265`, `:329`, `:359`). La lean copre tutti i campi, incluso `updatedAt`, che Mongoose aggiorna con l'orologio reale a ogni update.
- **Scenario inverso.** È verificato sia a livello di service sia di `AuthSessionService`, ed è seguito da una rotazione riuscita. ✓
- **Cambio di secret e sessioni legacy.** Il fail-closed è verificato, e dopo il cambio di secret si verifica anche che il token corrente continui a ruotare. ✓
- **Lacune:**
  - nessun test fissa l'esito del duplicato tardivo dopo una rotazione in avanti (WR-01);
  - nessun test copre il token precedente in grace su una sessione **revocata**;
  - nessun test copre un documento legacy **privo** del campo `rotationCount` (IN-02).

  Nessun test è diventato vacuo.

### 7. Qualità: **pulita**

`rotateWithinGrace` e la pipeline sono stati rimossi, e `RETIRED_REFRESH_TOKEN_HASHES_LIMIT` e `generateOpaqueToken` sono ancora in uso. I commenti sono accurati, tranne quello della fixture (IN-04). Nessun errore viene ingoiato: la ri-emissione impossibile lancia `SESSION_EXPIRED` e lo registra nel log.

## Warnings

### WR-01: un duplicato del token T0 elaborato dopo una rotazione in avanti del client revoca la sessione, mentre handoff e summary dichiarano la convergenza "in qualunque ordine"

**File:**
- `src/auth/session/session.service.ts:156-167` (filtro grace solo su `previousRefreshTokenHash`) e `:191-209` (`rejectRefresh`);
- `.planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md:123` e `:357`;
- `02-10-SUMMARY.md:132`.

**Issue:** la ri-emissione riconosce solo il token **immediatamente precedente**. Se, mentre un duplicato di T0 è ancora in volo, il client legittimo ha già ruotato T1→T2, T0 non è più `previous` ma è nella lista dei ritirati, e la sua elaborazione revoca la sessione.

Il summary afferma che serve "uno stall in-server ≥ 15 min". Non è così: basta che il client faccia una nuova rotazione prima che il duplicato venga elaborato. Il FE (`session_auth_token_service.dart`) rinnova:
- a ogni cold start;
- in modo proattivo a `durata JWT − 60 s`;
- su 401 tramite `UnauthorizedRecovery`.

Lo scenario più breve passa quindi per un cold start.

Sequenza concreta (stall in-server, FE conforme al single-flight):

1. t=0: R1 (T0) arriva. `requestedAt=0`, `findRotatable` OK, poi `UsersService.findOne` resta bloccata (failover del replica set).
2. Il FE va in timeout. Con il backoff manda R2 (T0) a t=10: `rotateCurrent` ruota T0→T1 (`rotatedAt=10`) e il FE salva T1.
3. t=15: l'utente chiude e riapre l'app. Il cold start presenta T1, che viene ruotato a T2 (`previous = h(T1)`, `rotatedAt=15`). Il FE salva T2.
4. t=20: R1 si sblocca e chiama `rotate(T0, requestedAt=0)`. `rotateCurrent` non trova nulla e la ri-emissione nemmeno, perché `previous ≠ h(T0)`. `rejectRefresh` trova h(T0) in `retiredRefreshTokenHashes` → **`revokedAt = now`**.
5. Al refresh successivo il FE presenta T2 → `SESSION_REVOKED` → logout forzato.

La stessa cosa succede con un duplicato di rete, quando la richiesta originale arriva al server dopo il cold start. In quel caso `requestedAt` è l'arrivo, quindi il filtro grace fallisce comunque.

Che il server non distingua questo caso da un furto è una scelta legittima (OAuth BCP). Due cose però non lo sono:
- (a) BACKEND-NOTES §2 ("non esistono token orfani … in qualunque ordine") e §9 (j) "chiuso" presentano il problema come risolto per intero;
- (b) l'unico scenario di lockout per cui D-35 era stato scelto (stall + retry) ha una variante a tre richieste che resta aperta, e senza tempi irrealistici.

**Fix (in ordine di preferenza):**

1. **Grace per token ritirato** (chiude anche questo caso, con la stessa esposizione di T-2-refresh-replay). Si salva l'istante di ritiro accanto a ogni hash e si ri-emette il token corrente per **qualunque** token ritirato meno di 30 s prima di `requestedAt`:
   ```ts
   // model
   @Prop({ type: [{ hash: String, retiredAt: Date }], default: [] })
   retiredRefreshTokens: { hash: string; retiredAt: Date }[];

   // rotateCurrent
   $push: { retiredRefreshTokens: { $each: [{ hash: presentedHash, retiredAt: now }], $slice: -RETIRED_REFRESH_TOKEN_HASHES_LIMIT } }

   // reissueWithinGrace: sostituisce withinGraceFilter
   {
       retiredRefreshTokens: {
           $elemMatch: { hash: presentedHash, retiredAt: { $gt: this.graceStartFrom(requestedAt) } },
       },
       ...this.activeFilter(now),
   }
   ```
   Con questa modifica, al passo 4, `retiredAt(T0) = 10 > requestedAt(0) − 30` → ri-emissione di T2, nessuna revoca. Per uno stall in-server la convergenza vale per qualunque durata, perché la finestra è ancorata all'arrivo. Servono una migrazione/compatibilità per `retiredRefreshTokenHashes` e l'aggiornamento di `rejectRefresh`.
2. **Se si accetta il comportamento attuale**, va documentato con onestà:
   - in BACKEND-NOTES §9 (j) va scritto "chiuso per il retry del token corrente; resta aperto se il client ha già ruotato di nuovo prima che la richiesta duplicata venga elaborata → `SESSION_REVOKED`";
   - va corretta la frase di §2;
   - va corretta la nota "≥ 15 min" nel summary (il cold start del FE basta);
   - va aggiunto un test che fissi l'esito:
     ```ts
     it('a duplicate of the previous-but-one token, processed after the client rotated again within 30 s, revokes the session (documented residual)', async () => {
         const t0 = await service.create(USER_ID);
         const t1 = await service.rotate(t0.refreshToken);
         clock.advanceSeconds(5);
         await service.rotate(t1.refreshToken);
         clock.advanceSeconds(3);
         await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(sessionRevoked);
     });
     ```

## Info

### IN-01: mancano i test per il token precedente in grace su una sessione revocata e per l'esito di WR-01

**File:** `src/auth/session/session.service.int-spec.ts:480-494`

**Issue:** il test sulla sessione revocata usa T0 **fuori** dalla finestra (+60 s). Nessun test verifica che un token precedente **dentro** la finestra, su una sessione revocata, non venga ri-emesso e risponda `SESSION_REVOKED`. Oggi il comportamento è corretto grazie al filtro `activeFilter` in `reissueWithinGrace`, ma un refactor che lo togliesse non verrebbe rilevato da nessun test.

**Fix:** rotate(T0), poi `revoke`, poi `+10 s`, poi `rotate(T0)`, e verificare `rejects.toMatchObject(sessionRevoked)` con il documento invariato. Per WR-01, vedi il test proposto sopra.

### IN-02: nessun test copre un documento legacy senza il campo `rotationCount`

**File:**
- `test/fixtures/session.fixture.ts:20`;
- `src/auth/session/session.service.int-spec.ts:365-388`;
- `src/auth/session/session.service.ts:119`.

**Issue:** la fixture imposta sempre `rotationCount: 0`, quindi `session.rotationCount + 1` non viene mai esercitato su un documento privo del campo. Oggi funziona perché Mongoose applica il default al momento dell'idratazione (verificato: `findOne` → `0`, `.lean()` → `undefined`). Se un domani si passasse a `.lean()` o a una proiezione, si otterrebbe `NaN`, e `JSON.stringify` lo trasforma in `null`. Il risultato sarebbe un token che non cambia più a ogni rotazione: `refreshTokenHash` resterebbe uguale a `previous` e il token risulterebbe perpetuo.

**Fix:** inserire il documento grezzo con `SessionModel.collection.insertOne({...})` senza `rotationCount` e `tokenSeed`, poi verificare `rotate` → `rotationCount === 1` e il token uguale a `derive(id, 1, seed)`. In difesa, nel codice: `const rotationCount = (session.rotationCount ?? 0) + 1;`.

### IN-03: il rischio accettato T-2-refresh-replay non è dichiarato in BACKEND-NOTES

**File:** `.planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md:123`, `:353`

**Issue:** il threat model del plan dichiara che chi presenta il token precedente entro 30 s riceve il token **corrente**, e che il furto viene rilevato solo quando i due detentori ruotano a più di 30 s di distanza. §2 e §9 (f) non lo dicono: §9 (f) parla solo della durata della finestra.

**Fix:** aggiungere a §9 (f) una frase, ad esempio: "Chi presenta il token immediatamente precedente entro 30 s dalla rotazione riceve il token corrente (rischio accettato, T-2-refresh-replay): il furto viene rilevato quando uno dei due detentori ripresenta un token ritirato fuori dalla finestra."

### IN-04: il commento della fixture è impreciso

**File:** `test/fixtures/session.fixture.ts:10-12`

**Issue:** il commento dice "it cannot be re-issued inside the grace window". In realtà, dopo la prima rotazione di una sessione di fixture, il nuovo token corrente è derivato da `'fixture-token-seed'` e la ri-emissione funziona. Non è ri-emettibile solo una fixture creata con un `previousRefreshTokenHash` già impostato via override.

**Fix:** "The fake current token is not derived from tokenSeed: a fixture session created with a previousRefreshTokenHash cannot re-issue it; once rotated, its new token is derived and re-issuable."

### IN-05: un leak del DB fornisce ora un verificatore offline per `JWT_SECRET`

**File:** `src/auth/crypto/refresh-token-derivation.ts:8-30`

**Issue:** con `refreshTokenHash`, `tokenSeed`, `rotationCount` e `_id` si può verificare offline un tentativo di `JWT_SECRET`, calcolando `sha256(HMAC(HKDF(guess), …))`. Prima di D-35 l'hash di un token casuale non dava informazioni sul secret. Il rischio pratico è nullo: qualunque access JWT HS256 emesso, che ogni utente possiede, è già un verificatore offline dello stesso secret. Inoltre il boot impone almeno 32 caratteri e la documentazione consiglia `openssl rand -hex 32`.

**Fix:** nessuna modifica al codice. Facoltativo: in §10 precisare che `JWT_SECRET` deve essere generato in modo casuale e non scelto a mano.

### IN-06: `tokenSeed` è selezionato di default

**File:** `src/auth/session/session.model.ts:24-26`

**Issue:** oggi nessun percorso espone i documenti di sessione. Una futura feature "elenco sessioni" o "esci da tutti i dispositivi" (§9 (i)) potrebbe però serializzare il documento con il seed incluso. Il seed da solo non basta a forgiare un token, ma è comunque materiale crittografico.

**Fix (hardening):** `@Prop({ type: String, select: false })` e `.select('+tokenSeed')` nelle due letture di `rotateCurrent` e `reissueWithinGrace`.

### IN-07: `findRotatable` accetta un token precedente non ri-emettibile, e `refresh()` esegue lookup e firma prima di fallire

**File:** `src/auth/session/session.service.ts:59-79`, `src/auth/auth-session.service.ts:47-60`

**Issue:** per una sessione legacy, o dopo un cambio di secret, `findRotatable` accetta il token precedente in grace. `refresh()` esegue quindi `findOne` sull'utente e firma un access JWT, poi `rotate` lancia `SESSION_EXPIRED`. Il JWT viene scartato e non c'è alcun effetto visibile: si spreca solo lavoro, e il caso è raro.

**Fix:** nessuno necessario. Se si vuole, si può far verificare a `findRotatable` la ricostruibilità quando il match avviene tramite `previousRefreshTokenHash`.

---

_Reviewed: 2026-10-06T21:08:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
