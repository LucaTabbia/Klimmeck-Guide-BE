# BACKEND-NOTES — Phase 2 Auth & Identity Foundation (handoff per il FE)

- **Fase BE:** 02-auth-identity-foundation (requisiti BE-AUTH-01..06, decisioni D-01..D-34 in `02-CONTEXT.md`)
- **Data:** 2026-10-06
- **Branch:** `feat/02-auth-identity-foundation` (PR verso `develop`)
- **Stato:** contratto implementato e coperto da integration test (HTTP, REST e WebSocket reali). Le chiavi Twitch **non** esistono ancora: il login reale end-to-end resta una verifica manuale (vedi §8).
- **Consumatori:** FE Phase 11 (auth-session-bootstrap) per il contratto di sessione, FE Phase 3 per il contratto `connection_init` delle subscription.
- **Fonte:** ogni nome qui sotto (operazioni, argomenti, campi, codici, close code, env, path) è copiato dal codice: `src/schema.gql`, `src/auth/**`, `src/config/auth-config.ts`, `.env.example`. Se questo documento e lo schema divergono, **vince `src/schema.gql`**.

---

## 0. TL;DR per il FE

- **Login mediato dal BE con ticket + binding S256.** L'app apre `GET {BE}/auth/twitch/start?challenge=<S256>` nel browser di sistema, riceve `klimmeck://auth?ticket=<ticket>` e lo riscatta con la mutation `exchangeLoginTicket(ticket, codeVerifier)`. Il binding S256 è **nostro** (app ↔ BE), non è PKCE Twitch.
- **Nessun token Twitch e nessun `client_secret` arriva mai all'app.** Il BE scambia il code, legge l'identità e revoca subito il token Twitch. Scope Twitch richiesti: **nessuno**.
- **Bearer ovunque:** `Authorization: Bearer <accessToken>` su GraphQL HTTP e su tutti gli endpoint REST (Cloudinary incluso); su WebSocket il token viaggia nel payload di `connection_init`.
- **Sessione first-party:** access JWT da **15 min** (`accessTokenExpiresAt` nella risposta) + refresh token opaco **rotante**, scadenza sliding **30 giorni**. `refreshSession(refreshToken)` restituisce sempre una coppia nuova; **solo l'ultima coppia emessa è valida** → single-flight obbligatorio.
- **Codici d'errore stabili** in `errors[0].extensions.code`: `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `LOGIN_TICKET_INVALID`. Su un refresh, **solo** `SESSION_EXPIRED` / `SESSION_REVOKED` sono terminali (anche un refresh token malformato o sconosciuto risponde `SESSION_EXPIRED`).
- **WebSocket:** subprotocol `graphql-transport-ws`; close **4403** `Forbidden` = rifiutato al connect, **4401** `Token expired` = JWT scaduto su socket vivo → refresh, poi riconnessione con il token corrente.
- **Dev bypass identico allo stub FE:** stessi nomi `DEV_AUTH_*`, stesso `DEV_AUTH_ACCESS_TOKEN` sui due lati; vale su HTTP, REST e WS. Il BE parte oggi **senza chiavi Twitch** (§7).
- **I plan FE Phase 11 basati su PKCE lato app verso Twitch vanno ripianificati** (D-01): Twitch non supporta PKCE e richiede `client_secret` per l'authorization code grant, quindi lo scambio del code può farlo solo il BE. (Il FE ha già emendato `11-CONTEXT.md` il 2026-10-06 in questa direzione: questo documento ne è la conferma lato BE, vedi §11.)

---

## 1. Flusso di login (BE-AUTH-01)

Sequenza (`{BE}` = base URL del backend, es. `http://localhost:3000`; nessun prefisso globale sulle rotte REST):

1. **L'app genera la coppia S256** (una nuova per ogni tentativo di login):
   - `code_verifier`: 43–128 caratteri nell'alfabeto `[A-Za-z0-9._~-]` (regex BE `CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/`, `src/auth/crypto/token-crypto.ts`). Consigliato: 32 byte random → base64url senza padding (43 char).
   - `challenge = base64url(sha256(code_verifier))` senza padding: esattamente 43 caratteri `[A-Za-z0-9_-]` (regex `CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/`).
2. **L'app apre nel browser di sistema** (no WebView) `GET {BE}/auth/twitch/start?challenge=<challenge>`.
3. **Il BE risponde 302** verso `https://id.twitch.tv/oauth2/authorize` con query `response_type=code`, `client_id`, `redirect_uri` (= `TWITCH_REDIRECT_URI`, la callback del BE), `scope=` **presente e vuoto**, `force_verify=true` (Twitch chiede sempre conferma dell'account → cambio account pulito), `state` = JWT firmato dal BE che contiene il challenge (TTL **600 s**, audience dedicata).
4. **Twitch reindirizza il browser** su `{BE}/auth/twitch/callback?code=…&state=…` (oppure `?error=access_denied&state=…`).
5. **Il BE**: verifica `state` (prima di ogni altra azione, anti-CSRF) → scambia il `code` con Twitch → valida il token su `/oauth2/validate` → verifica che il `client_id` restituito coincida con il proprio → risolve o crea lo `User` per `twitchId` (upsert atomico; un utente nuovo nasce con `role: adventurer`, `twitchPoints: 0`, `currentCharacter: null`) → **revoca il token Twitch** (best-effort, mai persistito) → emette un **login ticket** (opaco, TTL **60 s**, monouso, salvato solo come hash) → 302 verso `klimmeck://auth?ticket=<ticket>`.
   - La base `klimmeck://auth` è `APP_AUTH_REDIRECT_URL` (default `klimmeck://auth`, validata al boot: deve essere un deep link `scheme://…`, mai `http(s)`). La base non arriva mai dalla request (niente open redirect).
6. **L'app riscatta il ticket** con la mutation pubblica `exchangeLoginTicket` → `AuthSession`.
   - Il ticket è consumato **prima** del controllo del verifier: un tentativo con verifier errato brucia il ticket (`LOGIN_TICKET_INVALID`) → ricominciare dal punto 1.

### Errori del redirect `klimmeck://auth?error=<code>`

Ogni esito della danza OAuth è un 302 verso l'app (mai una pagina d'errore HTML). Valori di `TwitchLoginErrorCode` (`src/auth/twitch/twitch-login-error-code.enum.ts`):

| `error` | Quando | Azione FE suggerita |
|---|---|---|
| `twitch_not_configured` | Manca almeno una tra `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` (sia su `/start` sia su `/callback`). **È lo stato attuale finché non arrivano le chiavi.** | Messaggio dedicato ("Login con Twitch non ancora disponibile.") |
| `invalid_request` | `/start` senza `challenge` o con challenge che non rispetta `CODE_CHALLENGE_PATTERN`; `/callback` con `state` valido ma senza `code` | Bug lato app (challenge mal formato): errore generico, riprovare con una coppia nuova |
| `invalid_state` | `state` assente, manomesso, firmato con un'altra audience o scaduto (> 600 s tra `/start` e `/callback`) | Errore generico, riprovare |
| `access_denied` | Twitch ha rediretto con `error` (l'utente ha negato il consenso o annullato) | Silenzioso, come un annullamento |
| `twitch_client_mismatch` | Il token restituito da Twitch appartiene a un altro `client_id` | Errore generico |
| `twitch_exchange_failed` | Qualunque errore nello scambio/validazione con Twitch (non-2xx, rete, timeout, JSON non valido, utente non creabile) | Errore generico, riprovare |

### Esempio completo della mutation

```graphql
mutation ExchangeLoginTicket($ticket: String!, $codeVerifier: String!) {
  exchangeLoginTicket(ticket: $ticket, codeVerifier: $codeVerifier) {
    accessToken
    accessTokenExpiresAt
    refreshToken
    user { id twitchId role twitchPoints }
  }
}
```

```json
{ "ticket": "<ticket dal deep link>", "codeVerifier": "<code_verifier generato al punto 1>" }
```

Firma esatta nello schema: `exchangeLoginTicket(codeVerifier: String!, ticket: String!): AuthSession!` (pubblica: nessun bearer richiesto). Errore unico: `LOGIN_TICKET_INVALID` (ticket sconosciuto, scaduto, già usato, verifier errato o malformato, utente cancellato nel frattempo).

---

## 2. AuthSession e sessione

Shape esatta da `src/schema.gql`:

```graphql
type AuthSession {
  accessToken: String!
  accessTokenExpiresAt: DateTime!
  refreshToken: String!
  user: User!
}

type User {
  currentCharacter: Character
  id: ID!
  role: RoleType!
  twitchId: String!
  twitchPoints: Int!
}

enum RoleType { adventurer guard innkeeper }
```

Operazioni di sessione nello schema:

```graphql
type Mutation {
  exchangeLoginTicket(codeVerifier: String!, ticket: String!): AuthSession!   # pubblica
  refreshSession(refreshToken: String!): AuthSession!                        # pubblica
  logout: Boolean!                                                           # autenticata
}
type Query {
  me: User!                                                                  # autenticata
}
```

**Access token** (`accessToken`):
- JWT HS256 firmato con `JWT_SECRET`, `aud: klimmeck-api`, `iss: klimmeck-guide-be`, TTL **900 s** (15 min).
- Claims: `{ sub, twitchId, role, sid }` (+ `iat`, `exp`): `sub` = id Mongo dello `User`, `sid` = id della sessione.
- Il FE **non deve** decodificarlo per decidere quando rinnovare: usa `accessTokenExpiresAt` (scalar `DateTime`, stringa ISO 8601 UTC, es. `2026-10-06T18:45:00.000Z`; coincide con `exp`).
- `role` nel JWT è uno snapshot: un cambio di ruolo a DB diventa effettivo **al refresh successivo** (D-10), quando il ruolo viene riletto dal DB.

**Refresh token** (`refreshToken`):
- Opaco (256 bit random, base64url), salvato dal BE solo come hash SHA-256 nella collection `sessions`. Una sessione per device (multi-device consentito).
- Scadenza **sliding 30 giorni** (`REFRESH_TOKEN_TTL_SECONDS = 2_592_000`): ogni rotazione sposta la scadenza.
- Conservarlo solo in storage cifrato; l'access token può restare in memoria.

**`refreshSession(refreshToken)`** (pubblica, l'header `Authorization` eventualmente presente viene ignorato):
- Restituisce sempre una **coppia nuova** (access + refresh) e lo `User` aggiornato. Il nuovo refresh token va **persistito prima** di dimenticare il vecchio.
- **Grace window 30 s** (`REFRESH_TOKEN_GRACE_SECONDS = 30`, D-26): il refresh token *immediatamente precedente* può ancora ruotare entro 30 s dalla prima rotazione (copre la risposta persa su rete mobile). Attenzione: una rotazione in grace **ritira** il token emesso dalla rotazione precedente — resta valido solo l'ultimo emesso, e ripresentare quel token orfano è trattato come riuso (sotto).
- **Reuse detection (D-08):** la sessione ricorda gli hash SHA-256 degli ultimi **10** refresh token ritirati (ruotati oppure orfanati da una rotazione in grace). Ripresentarne uno — il token precedente fuori dalla grace, un token più vecchio, o il token orfano di una rotazione in grace, anche entro i 30 s — è trattato come furto: **l'intera sessione viene revocata** e la risposta è `SESSION_REVOKED`. Un token mai emesso, o ritirato da più di 10 rotazioni, risponde `SESSION_EXPIRED`. Per il FE non cambia nulla: entrambi i codici sono già terminali.
- **Single-flight del refresh lato FE obbligatorio:** un solo refresh in volo per volta, tutte le richieste concorrenti attendono lo stesso risultato. Due refresh paralleli con lo stesso token producono due coppie, e la prima diventa inutilizzabile.
- Esiti d'errore (verificati in `src/auth/session/session.service.ts` e `src/auth/auth-session.service.ts`):

| Situazione | `extensions.code` |
|---|---|
| Token sconosciuto (mai emesso o ritirato da più di 10 rotazioni), **malformato**, stringa vuota, o di una sessione scaduta | `SESSION_EXPIRED` |
| Token già ritirato (precedente fuori dalla grace, più vecchio, o orfano di una rotazione in grace) riusato (reuse detection → sessione revocata ora) | `SESSION_REVOKED` |
| Token di una sessione già revocata (es. dopo `logout` o dopo una reuse detection) | `SESSION_REVOKED` |
| Sessione valida ma `User` cancellato dal DB (la sessione viene revocata) | `SESSION_REVOKED` |
| Errore infrastrutturale (DB giù, timeout, 5xx) | nessun codice auth (`INTERNAL_SERVER_ERROR` o errore di rete) |

  → **Sul refresh il FE deve trattare come terminali SOLO `SESSION_EXPIRED` e `SESSION_REVOKED`** (teardown + sign-in). Tutto il resto è transitorio (retry con backoff). `refreshSession` non risponde mai `UNAUTHENTICATED` (è pubblica). Questo chiude il dubbio "codice per refresh token malformato" della FE Phase 11.

**`me: User!`** (autenticata): restituisce lo `User` dell'identità corrente letto dal DB (`id`, `twitchId`, `role`, `twitchPoints`, `currentCharacter`). Da usare al bootstrap per riallineare l'utente, e con il dev bypass per scoprire l'`id` reale dello User stub.

**`logout: Boolean!`** (autenticata, nessun argomento): revoca la sessione corrente (`sid` dell'access token) e restituisce `true`; è idempotente. Richiede un access token **valido**: se è scaduto la risposta è `UNAUTHENTICATED` → fare prima il refresh (il FE lo fa già, D-36 FE) oppure saltare il passo (la sessione muore da sola a 30 gg dall'ultima rotazione). Non esiste una variante che accetti il solo refresh token. Con l'identità dev (nessuna sessione) è un no-op che restituisce `true`.

---

## 3. HTTP e REST

- **Header:** `Authorization: Bearer <accessToken>` (lo schema `Bearer` è case-insensitive; il token non deve contenere spazi) su:
  - `POST {BE}/api/graphql` (tutte le query e mutation, tranne le due pubbliche);
  - tutti gli endpoint REST, **Cloudinary incluso**: `POST /cloudinary/getUrls`, `POST /cloudinary/getSubfoldersUrls`, `POST /cloudinary/uploadImage`.
- **Guard globale deny-by-default** (`src/auth/guards/auth.guard.ts`): passa solo ciò che è marcato `@Public()`. Gli handler pubblici sono **esattamente 5**, asseriti da `test/app.int-spec.ts` (`EXPECTED_PUBLIC_HANDLERS`):

| Handler | Superficie |
|---|---|
| `AppController.getHello` | `GET /` (health/hello) |
| `AuthResolver.exchangeLoginTicket` | mutation `exchangeLoginTicket` |
| `AuthResolver.refreshSession` | mutation `refreshSession` |
| `TwitchAuthController.start` | `GET /auth/twitch/start` |
| `TwitchAuthController.callback` | `GET /auth/twitch/callback` |

  (Introspection e landing page Apollo non passano dai guard e sono pubbliche fino a Phase 10: vedi §9.)
- **Errori GraphQL non autenticati:** HTTP **200**, `data: null`, `errors[0].extensions.code = "UNAUTHENTICATED"`:

```json
{
  "errors": [
    { "message": "Authentication required", "locations": [{ "line": 1, "column": 3 }], "path": ["me"], "extensions": { "code": "UNAUTHENTICATED" } }
  ],
  "data": null
}
```

- **Errori REST non autenticati:** HTTP **401** con body

```json
{ "statusCode": 401, "error": "Unauthorized", "message": "Authentication required", "code": "UNAUTHENTICATED" }
```

---

## 4. WebSocket (BE-AUTH-03 — chiude il contratto `connection_init`, Open Question #1 FE Phase 11)

- **URL:** `ws(s)://{host}/api/graphql` (stesso path di GraphQL HTTP, `GRAPHQL_PATH` in `src/graphql/graphql-context.ts`).
- **Subprotocol:** solo `graphql-transport-ws` (libreria `graphql-ws` 6.x). Non esiste alcun canale legacy `subscriptions-transport-ws`:
  - un client che offre il vecchio subprotocol `graphql-ws` non riceve mai `connection_ack` (lato client si osserva 1006, handshake abortito);
  - una connessione senza subprotocol viene chiusa con 4406 `Subprotocol not acceptable`.
- **Autenticazione:** payload del messaggio `connection_init`:

```json
{ "type": "connection_init", "payload": { "Authorization": "Bearer <accessToken>" } }
```

  È accettata anche la chiave minuscola `authorization`. Gli header della richiesta di upgrade **non** vengono letti: nessun header sull'upgrade è richiesto o usato.
- **Close code** (`src/auth/ws/ws-close-codes.ts`):

| Close code | Reason | Quando | Azione FE |
|---|---|---|---|
| **4403** | `Forbidden` | Rifiuto al connect: payload assente, token assente/malformato/con firma estranea/**scaduto**, token di un'altra audience, dev token con bypass spento. Mai 4500, la reason non contiene mai testo d'eccezione. | Refresh, poi riconnessione (con retry limitati) |
| **4401** | `Token expired` | Il JWT con cui il socket è stato aperto raggiunge `exp` mentre il socket è vivo (timer lato server). Non si applica all'identità dev, che non scade. | Refresh, poi riconnessione con il token nuovo |

- **Requisiti FE:**
  - (a) `initialPayload` deve leggere il token **corrente** a ogni (ri)connessione, mai un valore catturato una volta al boot. Il client Dart `graphql` 5.2.1 rivaluta `initialPayload` se è una funzione.
  - (b) Su 4401/4403 fare il refresh **prima** di riconnettere e limitare i retry: con `autoReconnect: true` il client Dart riconnette per qualunque close code, quindi senza un limite si entra in un loop con un token morto. `onConnectionLost(code, reason)` è il punto d'aggancio.
  - Stato del FE alla data di questo documento (letto in sola lettura): `lib/repository/services/graphql/graphql_client_provider.dart` usa già `WsReconnectPolicy`, che legge il token corrente in `buildInitialPayload` e su 4401/4403 passa da `UnauthorizedRecovery` con backoff limitato → **conforme a questo contratto**. Il vecchio `bootstrapToken` catturato una volta non esiste più.
- **Eventi persi durante la riconnessione:** gli eventi pubblicati mentre il socket è chiuso (es. nel gap del 4401 ogni ~15 min) **non vengono ripetuti**. Il refetch-on-reconnect (riallineare lo stato dopo una riconnessione) è un tema di **Phase 3** su entrambi i lati.
- **Identità sulle subscription:** il guard rilegge l'identità risolta in `onConnect` a ogni `subscribe`; se il token è scaduto nel frattempo (race con il timer 4401) la subscription riceve un errore `UNAUTHENTICATED`.

---

## 5. Codici d'errore

`AuthErrorCode` (`src/auth/auth-error-code.enum.ts`), messaggi esatti da `src/auth/auth.exception.ts`:

| `extensions.code` | `message` | Quando | Azione FE raccomandata |
|---|---|---|---|
| `UNAUTHENTICATED` | `Authentication required` | Bearer assente, malformato, firma non valida, audience/issuer errati, **access token scaduto**, claims incompleti | Refresh (single-flight) e retry della richiesta **una volta**; se il refresh fallisce in modo terminale → sign-in |
| `SESSION_EXPIRED` | `Session expired, sign in again` | `refreshSession` con token sconosciuto, malformato o di una sessione scaduta | Teardown + sign-in (messaggio neutro "sessione scaduta") |
| `SESSION_REVOKED` | `Session revoked, sign in again` | `refreshSession` dopo logout, dopo reuse detection, o per un utente cancellato | Teardown + sign-in |
| `LOGIN_TICKET_INVALID` | `Login ticket is invalid or expired` | `exchangeLoginTicket` con ticket sconosciuto/scaduto/già usato o verifier errato | Ricominciare il login dal punto 1 (nuova coppia S256) |

Note:
- Gli errori auth GraphQL contengono in `extensions` **solo** `code` (nessun `originalError`, nessuno `stacktrace`): il formatter `src/auth/format-auth-error.ts` li riduce a `{ message, locations, path, extensions: { code } }`. Gli altri errori (es. `NotFoundException`) passano invariati.
- Su REST lo stesso `code` è nel body 401 (§3).
- I codici del redirect di login (`twitch_not_configured`, …) sono un insieme separato: viaggiano come query param `error` del deep link, non in GraphQL (§1).

---

## 6. Comportamento dopo refresh e logout (Open Question #1/#2 FE Phase 11)

- **Dopo `refreshSession`:** il vecchio access token resta valido fino al suo `exp` (nessuna revoca per-request in Phase 2). Il socket WS aperto con il vecchio token **non** viene aggiornato: alla scadenza di quel token il server lo chiude con **4401** e va riaperto con il token nuovo (il link WS non va ricreato dopo il refresh: basta che `initialPayload` legga il token corrente). In alternativa il FE può riaprire il socket subito dopo il refresh, ma non è necessario.
- **Dopo `logout`:** la sessione è revocata (il refresh token non ruota più → `SESSION_REVOKED`), ma l'access JWT già emesso resta **tecnicamente valido fino a `exp` (≤ 15 min, D-27)**, su HTTP e su un eventuale socket ancora aperto. Il FE lo scarta subito e chiude il client GraphQL/WS (teardown D-12 FE).
- **Dopo un cambio di ruolo a DB:** il ruolo nell'access token cambia solo al refresh successivo (≤ 15 min).
- **Scope Twitch:** **nessuno** (`scope=` vuoto). Nessun token Twitch è mai esposto all'app né conservato dal BE.
- **Account switch:** il BE invia sempre `force_verify=true`, quindi Twitch chiede ogni volta di confermare l'account anche con SSO del browser attivo: dal lato BE `preferEphemeral: false` (default FE, Open Question #2 della FE Phase 11) è sufficiente. La conferma su device reale resta nella UAT (§8).

---

## 7. Avvio in modalità dev bypass (senza chiavi Twitch) — BE-AUTH-05

### Regole del bypass

- Attivo **solo** con `DEV_AUTH_ENABLED=true` (stringa esatta: `TRUE`, `1`, `yes` = spento) **e** `NODE_ENV` diverso da `production`.
- Con `NODE_ENV=production` e `DEV_AUTH_ENABLED=true` il BE **rifiuta di avviarsi** (errore esplicito al boot, exit code 1). In più la strategia ricontrolla `NODE_ENV` a runtime. **Mai in produzione.**
- Validazioni al boot quando il bypass è attivo (`src/config/auth-config.ts`): `DEV_AUTH_ACCESS_TOKEN` lungo **almeno 16 caratteri**; `DEV_AUTH_TWITCH_ID` non vuoto; `DEV_AUTH_ROLE` uno tra `guard`, `adventurer`, `innkeeper`. Se una manca il BE non parte.
- Un bearer uguale a `DEV_AUTH_ACCESS_TOKEN` (confronto timing-safe) risolve all'identità stub in modo **identico su GraphQL HTTP, REST e `connection_init` WS**. Il token non deve contenere spazi (il parser del bearer prende un solo token).
- Lo User stub è **reale a DB**: al primo uso viene creato o aggiornato per `DEV_AUTH_TWITCH_ID` con `role = DEV_AUTH_ROLE` (se esiste già uno User con quel `twitchId` il suo ruolo viene **sovrascritto**: non usare il `twitchId` di un utente reale).
- L'identità dev è risolta una volta e tenuta in cache: **cambiare `DEV_AUTH_ROLE` richiede un riavvio del BE** (anche la config è letta solo al boot).
- L'identità dev non scade e non ha sessione: nessun 4401 sul socket, `logout` è un no-op che restituisce `true`, `refreshSession` non c'entra (il FE stub non lo chiama).
- `DEV_AUTH_USER_ID` esiste **solo lato FE** ed è ignorato dal BE (l'id è quello Mongo dello User stub) → il FE usa `me` per riallineare l'id; `DEV_AUTH_USER_ID` resta un fallback offline.
- A ogni boot con bypass attivo il BE logga il warning `DEV AUTH BYPASS ENABLED — bearer DEV_AUTH_ACCESS_TOKEN resolves to twitchId=… role=…` (il token non viene mai loggato). Senza chiavi Twitch logga anche `Twitch OAuth not configured (…)`: atteso.
- Tutto il codice del bypass è greppabile con il prefisso `DevAuth` (`src/auth/dev/dev-auth.strategy.ts`) e va rimosso prima della GA.

### Righe `.env` del BE (da copiare in `.env`, placeholder da sostituire)

```dotenv
NODE_ENV=development
PORT=3000
MONGO_URI=<uri mongo, replica set: es. mongodb://localhost:27017/?replicaSet=rs0>
DB_NAME=<nome db>
REDIS_HOST=localhost
REDIS_PORT=6379
CLOUDINARY_CLOUD_NAME=<opzionale: serve solo agli endpoint /cloudinary/*>
CLOUDINARY_API_KEY=<opzionale>
CLOUDINARY_API_SECRET=<opzionale>
JWT_SECRET=<almeno 32 caratteri, generato con uno dei comandi sotto>
APP_AUTH_REDIRECT_URL=klimmeck://auth
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=
DEV_AUTH_ENABLED=true
DEV_AUTH_ACCESS_TOKEN=<stesso valore di DEV_AUTH_ACCESS_TOKEN nel .env FE, almeno 16 caratteri, senza spazi>
DEV_AUTH_TWITCH_ID=<stesso valore di DEV_AUTH_TWITCH_ID nel .env FE, non il twitchId di un utente reale>
DEV_AUTH_ROLE=<guard | adventurer | innkeeper, stesso valore del FE>
```

Generare i valori (mai committarli, mai incollarli in documenti o chat):

```bash
openssl rand -hex 32   # JWT_SECRET (64 caratteri esadecimali)
# oppure: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
openssl rand -hex 16   # DEV_AUTH_ACCESS_TOKEN (32 caratteri), da copiare identico nel .env FE
```

Note:
- `JWT_SECRET` è **obbligatoria su ogni ambiente**, anche in dev bypass: senza (o sotto i 32 caratteri) il BE esce al boot con `JWT_SECRET is required and must be at least 32 characters`.
- Con le tre `TWITCH_*` vuote (basta che ne manchi una) il BE parte normalmente e `GET /auth/twitch/start` reindirizza a `klimmeck://auth?error=twitch_not_configured`.
- `APP_AUTH_REDIRECT_URL` può essere omessa (default `klimmeck://auth`); se valorizzata deve essere un deep link `scheme://…`, mai `http(s)`.

### Righe `.env` dell'app FE corrispondenti

```dotenv
DEV_AUTH_ENABLED=true
DEV_AUTH_ACCESS_TOKEN=<stesso valore del BE>
DEV_AUTH_TWITCH_ID=<stesso valore del BE>
DEV_AUTH_ROLE=<stesso valore del BE>
DEV_AUTH_USER_ID=<opzionale: solo fallback offline, il valore reale arriva da `me`>
DEV_AUTH_START_SIGNED_OUT=false   # true = l'app parte sul sign-in e "Login con Twitch" entra con l'identità dev
```

Corrispondenza: stessi nomi `DEV_AUTH_*` sui due lati; `DEV_AUTH_ACCESS_TOKEN` **deve coincidere** byte per byte; `DEV_AUTH_TWITCH_ID` / `DEV_AUTH_ROLE` lato FE sono solo valori di fallback, quelli effettivi sono del BE (letti via `me`); `DEV_AUTH_USER_ID` e `DEV_AUTH_START_SIGNED_OUT` esistono solo nel FE.

Verifica rapida a BE avviato:

```bash
curl -s http://localhost:3000/api/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $DEV_AUTH_ACCESS_TOKEN" \
  -d '{"query":"{ me { id twitchId role } }"}'
# atteso: data.me con twitchId = DEV_AUTH_TWITCH_ID e role = DEV_AUTH_ROLE
```

---

## 8. Quando arrivano le chiavi Twitch (console, chiavi, verifica end-to-end)

Checklist da eseguire una volta, nell'ordine:

1. **Console Twitch** (dev.twitch.tv → Applications → l'app di Klimmeck): registrare gli **OAuth Redirect URLs** del BE (non dell'app):
   - locale: `http://localhost:3000/auth/twitch/callback`
   - staging/prod: `https://<host-staging>/auth/twitch/callback` (e l'equivalente di produzione)
   - Regole Twitch: match **esatto** (schema, host, porta e path inclusi), solo `https://` oppure `http://localhost`, nessun custom scheme (`klimmeck://` non è accettato: per questo il BE fa da ponte e poi reindirizza al deep link). Il BE valida la stessa regola al boot (`TWITCH_REDIRECT_URI must use https or http://localhost`).
   - Scope da richiedere: **nessuno**.
2. **`.env` del BE:** valorizzare le tre variabili (il `client_secret` resta solo sul BE, mai nell'app):

```dotenv
TWITCH_CLIENT_ID=<client id dalla console Twitch>
TWITCH_CLIENT_SECRET=<client secret dalla console Twitch>
TWITCH_REDIRECT_URI=<identico a uno degli OAuth Redirect URL registrati, es. http://localhost:3000/auth/twitch/callback>
```

3. **Spegnere il bypass su entrambi i lati:** `DEV_AUTH_ENABLED=false` nel `.env` del BE **e** nel `.env` dell'app (con il flag FE spento l'app usa il servizio di sessione reale). Riavviare il BE: il warning `DEV AUTH BYPASS ENABLED` e quello `Twitch OAuth not configured` non devono più comparire.
4. **Raggiungibilità della callback dal device:**
   - iOS Simulator: condivide la rete dell'host → `http://localhost:3000` funziona.
   - Android Emulator: `localhost` è l'emulatore stesso → `adb reverse tcp:3000 tcp:3000` e `BASE_URL=http://localhost:3000/` nell'app.
   - Device fisici: tunnel https (ngrok/cloudflared) registrato in console come redirect URL, oppure staging.
5. **Verifica manuale end-to-end** (`02-VALIDATION.md` §Manual-Only):
   - generare una coppia S256 e aprire nel browser `GET {BE}/auth/twitch/start?challenge=<challenge>` → atteso 302 verso `https://id.twitch.tv/oauth2/authorize?...&scope=&force_verify=true&state=...`;
   - completare il consenso su Twitch → atteso 302 finale verso `klimmeck://auth?ticket=…` (con un errore, leggere `?error=` e la tabella in §1);
   - **confermare che `scope=` vuoto è accettato da Twitch** e che `/oauth2/validate` restituisce `user_id` (Assumption A1 della research): se Twitch rifiutasse lo scope vuoto la callback arriverebbe con `error` → `klimmeck://auth?error=access_denied`, e va aperto un fix BE;
   - riscattare il ticket con `exchangeLoginTicket` entro 60 s → `AuthSession`; poi `me`, `refreshSession`, `logout` e una subscription WS con il token reale;
   - dall'app: login reale su device, cambio account (verificare che `force_verify=true` mostri la conferma dell'account), sessione scaduta → sign-in.
6. **Dati esistenti:** prima del primo avvio su un DB con utenti reali eseguire il controllo duplicati di §10.

---

## 9. Limiti noti (by design in Phase 2)

- **(a) Introspection e landing page Apollo pubbliche fino a Phase 10** (D-30): non passano dai guard Nest; asserito in `test/app.int-spec.ts`.
- **(b) Access JWT valido fino a ≤ 15 min dopo `logout`** o dopo un cambio di ruolo (D-10, D-27): nessun controllo per-request sulla sessione. Il FE scarta il token subito.
- **(c) `createUser` / `updateUser` / `deleteUser` invocabili da QUALUNQUE utente autenticato**, incluso il cambio di `role` e di `twitchId` → ownership e role guard in **Phase 3** (BE-AUTHZ). Lo stesso vale per le altre mutation di gioco: Phase 2 aggiunge solo l'autenticazione (D-15).
- **(d) Le subscription non filtrano ancora per identità:** `characterUpdated(id)` consegna gli aggiornamenti di qualunque `id` a qualunque socket autenticato → **Phase 3**.
- **(e) Nessun rate limiting** sugli endpoint pubblici di auth (`/auth/twitch/start`, `/auth/twitch/callback`, `exchangeLoginTicket`, `refreshSession`), né CORS dedicato → **Phase 10**.
- **(f) Grace window di 30 s sul refresh** (D-26): scelta raccomandata dalla research, **da confermare con l'utente**; cambiarla tocca solo `REFRESH_TOKEN_GRACE_SECONDS`, non il contratto.
- **(g) Revoca lato Twitch non rilevata:** i token Twitch non sono conservati, quindi se l'utente revoca l'app da Twitch la sessione BE resta valida fino a scadenza o logout → **Phase 10** (deferred). Il contratto FE non cambierà: arriverà come `SESSION_REVOKED` su un refresh.
- **(h) Eventi WS persi durante una riconnessione** non vengono ripetuti → refetch-on-reconnect in **Phase 3** (§4).
- **(i) Nessun "esci da tutti i dispositivi"** né elenco sessioni → backlog.

---

## 10. Deploy note — indice unico `users.twitchId` (D-32) e secret obbligatoria

- Lo schema `User` ha ora un **indice unico** su `twitchId` (necessario all'upsert del login). Su un DB esistente con duplicati l'indice non si costruisce.
- **Prima del primo avvio** su un DB con dati esistenti (dev condiviso, staging, produzione), eseguire in `mongosh` sul database dell'app:

```javascript
db.users.aggregate([{ $group: { _id: "$twitchId", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }])
```

  Risultato vuoto = ok. Altrimenti deduplicare **manualmente** (scegliere lo User da tenere, riassegnare o cancellare gli altri) prima di avviare.
- All'avvio `TwitchIdIndexVerifier` prova a costruire gli indici; se fallisce non blocca il boot ma logga `Unique index on users.twitchId could not be built. Duplicated twitchId: <id> (<count>), …` → in quel caso il login Twitch su quei `twitchId` non è affidabile finché non si deduplica.
- Dopo l'avvio verificare:

```javascript
db.users.getIndexes()   // deve comparire { key: { twitchId: 1 }, name: "twitchId_1", unique: true }
```

- **`JWT_SECRET` è ora obbligatoria su ogni ambiente** (locale, CI, staging, produzione), almeno 32 caratteri: senza, il BE esce con codice 1. Usare un valore diverso per ogni ambiente; cambiarlo invalida tutti gli access token emessi (i refresh token restano validi e ne emettono di nuovi).
- **CI:** ogni PR che cambia lo schema GraphQL deve committare `src/schema.gql` rigenerato (lo rigenera `npm run test:int` tramite `test/app.int-spec.ts`); lo step `Schema up to date` di `.github/workflows/ci.yml` fallisce altrimenti. Per il FE: `src/schema.gql` sul branch è sempre lo schema reale.

---

## 11. Impatto sul FE e prossimi passi

1. **Ripianificare i plan FE Phase 11 basati su PKCE lato app verso Twitch.** Il FE non parla mai con `id.twitch.tv` per i token: apre solo `{BE}/auth/twitch/start` nel browser di sistema e riscatta il ticket con `exchangeLoginTicket`; nessun `TWITCH_CLIENT_ID` nell'app. Alla data di questo documento `11-CONTEXT.md` FE è già stato emendato (2026-10-06, D-15/D-26 amended) e la sezione OAuth/PKCE di `11-RESEARCH.md` di aprile è marcata obsoleta: qualunque plan FE ancora scritto sul flusso PKCE diretto va riallineato a §1.
2. **Open Questions FE Phase 11:**
   - **Open Question #1** (BACKEND-NOTES mancante; nomi/tipi esatti, codice per refresh token malformato, `logout` col solo refresh token) → **chiusa**: nomi e tipi in §1–§2 (copiati da `src/schema.gql`), contratto `connection_init` in §4, refresh malformato = `SESSION_EXPIRED` (§2), `logout` richiede un access token valido e non accetta il refresh token (§2).
   - **Open Question #2** (`preferEphemeral`, comportamento dopo refresh) → lato BE chiusa da §2, §6 e §8: `force_verify=true` sempre inviato, scope Twitch nessuno, comportamento post-refresh/logout in §6.
   - **Open Question #8** (eventi persi nel gap di riconnessione WS) → Phase 3, su entrambi i lati (§4, §9h).
3. **Le fasi FE 2–10 continuano sullo stub** `DEV_AUTH_ACCESS_TOKEN` grazie a §7, senza chiavi Twitch.
4. **FE Phase 3 (subscription):** il contratto `connection_init` è stabile (§4); il filtro per identità e il refetch-on-reconnect arrivano con BE Phase 3.
5. **Test BE che provano ogni punto di questo documento:**
   - `test/auth/http-guard.int-spec.ts` — bearer su GraphQL HTTP e REST, 401 body, `UNAUTHENTICATED` con `data: null`, dev bypass, `me`, `logout` e finestra dei 15 min dopo logout;
   - `test/auth/ws-auth.int-spec.ts` — `graphql-transport-ws` su socket reali, 4403 al connect, 4401 `Token expired`, legacy subprotocol mai acknowledged, 4406 senza subprotocol, dev token su WS;
   - `test/auth/login-flow.int-spec.ts` — flusso completo start → callback → ticket → `exchangeLoginTicket` → `refreshSession`;
   - `test/app.int-spec.ts` — boot del vero `AppModule` senza chiavi Twitch, whitelist dei 5 handler pubblici, introspection pubblica (limite noto);
   - `src/auth/twitch/twitch-auth.controller.int-spec.ts` — tutti i codici `error=` del redirect, `force_verify`, `scope=` vuoto, revoca del token Twitch;
   - `src/auth/session/session.service.int-spec.ts` — rotazione, grace 30 s, reuse detection (token precedente, più vecchio e orfano della grace), `SESSION_EXPIRED` per token sconosciuto;
   - `src/auth/dev/dev-auth.strategy.int-spec.ts` — upsert dello User stub e regole del bypass.
