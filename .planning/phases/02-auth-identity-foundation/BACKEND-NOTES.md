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
- **Grace window 30 s** (`REFRESH_TOKEN_GRACE_SECONDS = 30`, D-26): il refresh token *immediatamente precedente* può ancora ruotare entro 30 s dalla prima rotazione (copre la risposta persa su rete mobile). Attenzione: una rotazione in grace **invalida** il token emesso dalla rotazione precedente — resta valido solo l'ultimo emesso.
- Fuori dalla finestra, il riuso del token precedente è trattato come furto: **l'intera sessione viene revocata** e la risposta è `SESSION_REVOKED`.
- **Single-flight del refresh lato FE obbligatorio:** un solo refresh in volo per volta, tutte le richieste concorrenti attendono lo stesso risultato. Due refresh paralleli con lo stesso token producono due coppie, e la prima diventa inutilizzabile.
- Esiti d'errore (verificati in `src/auth/session/session.service.ts` e `src/auth/auth-session.service.ts`):

| Situazione | `extensions.code` |
|---|---|
| Token sconosciuto, **malformato**, stringa vuota, o di una sessione scaduta | `SESSION_EXPIRED` |
| Token precedente riusato fuori dalla grace (reuse detection → sessione revocata ora) | `SESSION_REVOKED` |
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
