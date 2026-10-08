---
phase: 02-auth-identity-foundation
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - src/app.controller.ts
  - src/app.module.ts
  - src/main.ts
  - src/auth/auth-error-code.enum.ts
  - src/auth/auth-identity.resolver.ts
  - src/auth/auth-identity.ts
  - src/auth/auth-session.service.ts
  - src/auth/auth-startup.reporter.ts
  - src/auth/auth.exception.ts
  - src/auth/auth.module.ts
  - src/auth/auth.resolver.ts
  - src/auth/bearer-token.ts
  - src/auth/clock.ts
  - src/auth/crypto/token-crypto.ts
  - src/auth/decorators/current-user.decorator.ts
  - src/auth/decorators/public.decorator.ts
  - src/auth/dev/dev-auth.strategy.ts
  - src/auth/dto/auth-session.model.ts
  - src/auth/format-auth-error.ts
  - src/auth/guards/auth.guard.ts
  - src/auth/login-ticket/login-ticket.model.ts
  - src/auth/login-ticket/login-ticket.service.ts
  - src/auth/session/session.model.ts
  - src/auth/session/session.service.ts
  - src/auth/token/access-token.service.ts
  - src/auth/token/token-audiences.ts
  - src/auth/twitch/app-redirect-url.ts
  - src/auth/twitch/http-twitch-oauth.client.ts
  - src/auth/twitch/oauth-state.service.ts
  - src/auth/twitch/twitch-auth.controller.ts
  - src/auth/twitch/twitch-authorize-url.ts
  - src/auth/twitch/twitch-login-error-code.enum.ts
  - src/auth/twitch/twitch-login.service.ts
  - src/auth/twitch/twitch-oauth.client.ts
  - src/auth/ws/ws-close-codes.ts
  - src/auth/ws/ws-connection-authenticator.ts
  - src/config/auth-config.ts
  - src/config/env.validation.ts
  - src/graphql/graphql-context.ts
  - src/graphql/graphql-options.factory.ts
  - src/models/user.model.ts
  - src/users/twitch-id-index.verifier.ts
  - src/users/users.module.ts
  - src/users/users.service.ts
  - .env.example
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 3
  info: 8
  total: 11
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

Review statica (nessun test eseguito; `npx tsc --noEmit -p tsconfig.build.json` pulito) del seam di autenticazione di Phase 2, letta alla luce di `02-CONTEXT.md` (D-01..D-34) e `BACKEND-NOTES.md`. I limiti documentati (introspection pubblica, JWT valido ≤ 15 min dopo logout, niente ownership/role guard, niente rate limiting, revoca Twitch non rilevata, token orfano dopo una rotazione in grace, single-flight a carico del FE) **non** sono riportati come difetti.

Valutazione complessiva: buona. Nessun percorso di bypass dell'autenticazione individuato.

- **Guard:** deny-by-default su REST, GraphQL HTTP e WS. Esattamente 5 handler `@Public()`, tutti a livello di handler. Su WS l'identità arriva da `extra.identity` (mai dagli header dell'upgrade), con un controllo di `expiresAt` come difesa in profondità.
- **`onConnect`:** non lancia mai eccezioni (ritorna `false`, quindi 4403). Il timer 4401 viene ripulito in `onClose`, che `graphql-ws` 6 chiama sempre.
- **Token confusion:** state OAuth e access JWT condividono il secret ma impongono audience distinte, `algorithms: ['HS256']` e la shape dei claims. Ticket e refresh token sono opachi e salvati solo come hash.
- **Ticket:** monouso atomico (`findOneAndDelete` con controllo di `expiresAt`). Verifier controllato con `safeEqual` (confronto timing-safe su digest SHA-256).
- **Dev bypass:** fail-closed al boot con ricontrollo a runtime. Confronto timing-safe; il token non viene mai loggato.
- **Log:** nessun secret nei log (`TwitchLoginService` logga solo `error.name`, il client HTTP non interpola mai code/token/secret).

I tre warning riguardano:

1. un lockout evitabile del client legittimo causato dall'ordine "rotazione prima del lookup utente" nel refresh;
2. una reuse detection più debole di quanto dichiarato da D-08;
3. la validazione al boot di `APP_AUTH_REDIRECT_URL`, che si aggira e accetta valori che poi fanno fallire ogni redirect.

## Warnings

### WR-01: La rotazione del refresh token viene committata prima del lookup utente: un errore transitorio, seguito da un backoff > 30 s, diventa `SESSION_REVOKED`

**File:** `src/auth/auth-session.service.ts:41-49` (con `src/auth/session/session.service.ts:40-54`)

**Issue:** `refresh()` chiama prima `sessionService.rotate()`, che **persiste** il nuovo hash e sposta il vecchio token in `previousRefreshTokenHash` con `rotatedAt = now`. Solo dopo esegue `findUserOrNull()` (una `findById().populate()`) e `accessTokenService.sign()`. Se uno di questi passi fallisce per un motivo infrastrutturale (timeout Mongo, failover del replica set, errore nella populate), il client riceve un errore senza codice auth. `BACKEND-NOTES.md` §2 gli dice esplicitamente di trattarlo come transitorio e di riprovare "con backoff". Ma il server ha già ruotato: il client possiede ancora solo T0, che ora è il token *precedente*.

Scenario concreto:

1. `refreshSession(T0)` → `rotate` OK (corrente = T1, mai consegnato) → `findById` va in timeout → `INTERNAL_SERVER_ERROR`.
2. Il FE applica il backoff esponenziale: 1 s, 2 s, 4 s, 8 s, 16 s… Il primo retry che parte dopo `rotatedAt + 30 s` ripresenta T0.
3. `rotateCurrent` fallisce, `rotateWithinGrace` fallisce (fuori finestra). `rejectRefresh` trova `previousRefreshTokenHash = T0`, quindi **revoca la sessione** e risponde `SESSION_REVOKED`. L'utente legittimo viene buttato fuori e nei log compare un falso allarme "reuse detected".

La grace window di D-26 copre la risposta persa *in rete*. Qui invece è il server stesso a bruciare il token per un proprio errore interno, e lo trasforma in un evento di furto.

**Fix:** eseguire tutto ciò che può fallire **prima** della scrittura atomica, e rendere la rotazione l'ultimo passo. Ad esempio:

```ts
async refresh(refreshToken: string): Promise<AuthSession> {
    const candidate = await this.sessionService.findActiveByToken(refreshToken); // sola lettura, nessuna mutazione
    const user = candidate ? await this.findUserOrNull(candidate.userId) : null;
    if (candidate && !user) {
        await this.sessionService.revoke(candidate.sessionId);
        throw AuthException.sessionRevoked();
    }
    const rotated = await this.sessionService.rotate(refreshToken); // CAS atomico: resta la fonte di verità
    // se rotated.userId !== user.id (corsa improbabile) rileggere; poi sign + buildSession
    return this.buildSession(user ?? (await this.usersService.findOne(rotated.userId)), rotated.sessionId, rotated.refreshToken);
}
```

In alternativa, minima: firmare l'access token e leggere l'utente prima di `rotate` (l'utente si ricava con una lettura della sessione per hash), così dopo la rotazione resta solo codice che non fa I/O. Aggiungere un test: `usersService.findOne` che lancia un errore generico dopo `rotate` non deve mai portare a `SESSION_REVOKED` sul retry con il token originale.

### WR-02: La reuse detection copre solo il token immediatamente precedente: i token più vecchi o orfani rispondono `SESSION_EXPIRED` senza revocare, in contrasto con D-08

**File:** `src/auth/session/session.service.ts:117-136` (e `93-115`)

**Issue:** D-08 dice: "riuso di un token già ruotato → revoca dell'intera sessione". Il documento di sessione però ricorda un solo hash precedente, e `rejectRefresh` revoca solo se `previousRefreshTokenHash === presentedHash`. Restano fuori due casi:

- **Token più vecchi di uno step.** Dopo T0→T1→T2, un T0 rubato e presentato più tardi non coincide né con il token corrente né con il precedente. Risponde `SESSION_EXPIRED` e la sessione resta viva: il furto non viene rilevato.
- **Token orfani della grace.** Un attaccante con T0 rubato arriva entro 30 s dalla rotazione legittima T0→T1. `rotateWithinGrace` gli emette T2 e orfana T1, che è in mano al client legittimo. Quando il client legittimo presenta T1, la risposta è `SESSION_EXPIRED`, non `SESSION_REVOKED`. L'attaccante tiene la sessione per 30 giorni (sliding) e **nessuna** reuse detection scatta, perché T1 non è registrato da nessuna parte.

Il token orfano dopo una rotazione in grace è documentato in BACKEND-NOTES §2 come effetto atteso per il client. Il fatto che il suo riuso sia un segnale di compromissione ignorato non è documentato, e contraddice D-08.

**Fix:** tenere traccia degli hash già emessi per la sessione e trattarne la ripresentazione come riuso. Per esempio un array limitato `retiredRefreshTokenHashes` (indice multikey), in cui finiscono sia il token ruotato sia quello orfanato dalla grace:

```ts
// rotateCurrent
$set: { previousRefreshTokenHash: presentedHash, refreshTokenHash: nextHash, rotatedAt: now, expiresAt },
$push: { retiredRefreshTokenHashes: { $each: [presentedHash], $slice: -20 } },
// rotateWithinGrace: sposta anche l'hash corrente (che diventa orfano)
// pipeline update o lettura+CAS su refreshTokenHash
// rejectRefresh
findOneAndUpdate({ retiredRefreshTokenHashes: presentedHash, revokedAt: null }, { $set: { revokedAt: now } })
```

Mantenendo la regola che il token precedente entro la grace non revoca. Se la scelta resta volutamente "solo uno step", documentarla come limite noto in BACKEND-NOTES §9 e allineare il testo di D-08.

### WR-03: La validazione al boot di `APP_AUTH_REDIRECT_URL` si aggira, e un valore valido al boot può far fallire ogni redirect con una pagina d'errore

**File:** `src/config/auth-config.ts:162-176` (consumato da `src/auth/twitch/app-redirect-url.ts:18-22`)

**Issue:** il controllo è testuale (`/^https?:/i` + `includes('://')`), mentre l'uso a runtime passa da `new URL(base)`. Le due cose divergono (verificato con node):

- `" https://evil.com/x"` oppure `"\thttps://evil.com"`: il whitespace iniziale fa fallire `/^https?:/`, ma il parser WHATWG lo rimuove. Risultato: un 302 verso `https://evil.com/x?ticket=<ticket>`. È proprio l'open redirect da configurazione che D-29 vuole impedire, e il ticket finisce a un host web. Un valore quotato in `.env` o una variabile del provider di deploy con spazio iniziale bastano.
- `"javascript://%0aalert(1)"` passa la validazione (schema non http(s), contiene `://`).
- `"klimmeck_app://auth"` (schema non valido per WHATWG) passa il boot, ma poi `new URL()` lancia `TypeError: Invalid URL` in **ogni** `errorRedirect`/`buildAppTicketRedirect`. `/auth/twitch/start` e `/auth/twitch/callback` rispondono così con un 500 JSON nel browser di sistema, in contrasto con D-02 ("mai una pagina d'errore morta nel browser di sistema"). In più, nella callback l'utente risulta già creato e il token Twitch già revocato.

**Fix:** validare con lo stesso parser usato a runtime, su una allowlist di schemi:

```ts
function parseAppAuthRedirectUrl(env: AuthEnv): string {
    const raw = env.APP_AUTH_REDIRECT_URL || DEFAULT_APP_AUTH_REDIRECT_URL;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('APP_AUTH_REDIRECT_URL must be an absolute deep link (scheme://...)');
    }
    if (raw !== raw.trim() || !raw.includes('://')) throw new Error('APP_AUTH_REDIRECT_URL must be an absolute deep link (scheme://...)');
    if (['http:', 'https:', 'javascript:', 'data:', 'file:', 'blob:'].includes(url.protocol)) {
        throw new Error('APP_AUTH_REDIRECT_URL must be an app deep link, http(s) is not allowed');
    }
    return raw;
}
```

Aggiungere i casi `" https://…"`, `"javascript://…"` e `"klimmeck_app://auth"` alla spec di `auth-config`.

## Info

### IN-01: `TWITCH_REDIRECT_URI` validato per prefisso: `http://localhost.evil.com` e `http://localhost@evil.com` passano

**File:** `src/config/auth-config.ts:155-160`

**Issue:** `startsWith('http://localhost')` accetta host diversi da `localhost` e URL malformati. L'impatto è limitato, perché Twitch impone il match esatto con gli URL registrati in console. Il messaggio d'errore però promette una regola più stretta di quella applicata.

**Fix:** parsare con `new URL()` e controllare `protocol === 'https:' || (protocol === 'http:' && hostname === 'localhost')`.

### IN-02: Corsa `onConnect` / `onClose`: il timer di scadenza può essere creato dopo la chiusura del socket

**File:** `src/auth/ws/ws-connection-authenticator.ts:27-46`

**Issue:** `onConnect` è asincrono (la prima risoluzione dell'identità dev fa un upsert su DB). Se il client chiude mentre `resolveBearer` è in attesa, `graphql-ws` chiama `onClose` quando `expiryTimer` non esiste ancora. Il timer creato subito dopo resta vivo fino a `exp` (≤ 15 min) e trattiene `extra`/socket. È innocuo (`unref()`, `close()` su un socket chiuso non fa nulla) e limitato nel tempo, ma è una piccola perdita.

**Fix:** dopo `resolveBearer`, non pianificare il timer se `context.extra.socket.readyState !== WebSocket.OPEN` (oppure segnare `extra.closed = true` in `onClose` e controllarlo prima di `scheduleExpiryClose`).

### IN-03: `TwitchIdIndexVerifier` scarta qualunque errore di `createIndexes` e lo attribuisce ai duplicati

**File:** `src/users/twitch-id-index.verifier.ts:16-32`

**Issue:** il `catch {}` non distingue E11000 da altri errori (permessi, opzioni di indice in conflitto, rete). Se l'errore non riguarda i duplicati, il log dice `Duplicated twitchId: .` con lista vuota, cioè fuorviante. Se poi anche `findDuplicateTwitchIds()` fallisce, l'eccezione esce da `onApplicationBootstrap` e il boot si interrompe con un messaggio che non cita la causa originale.

**Fix:** catturare `error`, loggare `error.name`/`code` e lanciare `reportDuplicates()` solo per `code === 11000`; avvolgere `reportDuplicates` in un try/catch che logghi senza bloccare (coerente con BACKEND-NOTES §10, "non blocca il boot").

### IN-04: L'identità dev in cache sopravvive alla cancellazione dello User stub

**File:** `src/auth/dev/dev-auth.strategy.ts:24-37`

**Issue:** `stubIdentity` è memoizzata per tutta la vita del processo. Oggi qualunque utente autenticato può chiamare `deleteUser` (limite noto, Phase 3). Se lo User stub viene cancellato, il bearer dev continua a risolvere a un `userId` inesistente: `me` risponde `NotFoundException` fino al riavvio. BACKEND-NOTES §7 documenta il riavvio solo per il cambio di `DEV_AUTH_ROLE`.

**Fix:** invalidare la cache quando il lookup dello User fallisce con NotFound, oppure documentare anche questo caso in §7.

### IN-05: La CI esegue il lint con `--fix`: gli errori correggibili automaticamente non fanno mai fallire la pipeline

**File:** `.github/workflows/ci.yml:49-50` (script `lint` in `package.json:15`)

**Issue:** in CI `eslint --fix` corregge la working copy e termina con exit 0 per tutti i problemi fixabili (formattazione prettier inclusa). Codice non formattato arriva così su `develop` senza segnalazioni. Lo step `Schema up to date` controlla solo `src/schema.gql`.

**Fix:** aggiungere `"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\""` e usarlo in CI, oppure aggiungere dopo il lint `git diff --exit-code`.

### IN-06: Costanti duplicate e magic number nel modulo auth

**File:** `src/auth/token/access-token.service.ts:34,60,71`; `src/config/auth-config.ts:55`; `src/auth/session/session.service.ts:11`; `src/auth/login-ticket/login-ticket.service.ts:20`

**Issue:**

- `ROLE_VALUES` è definita due volte.
- `MILLISECONDS_PER_SECOND` è duplicata in due service, mentre `access-token.service.ts` usa direttamente `* 1000`.

**Fix:** spostare `ROLE_VALUES` accanto a `RoleType` e `MILLISECONDS_PER_SECOND` (con un helper `addSeconds(date, seconds)`) in un modulo condiviso, ad esempio `src/auth/clock.ts`.

### IN-07: `.env.example` propone un `MONGO_URI` senza replica set

**File:** `.env.example:4`

**Issue:** `MONGO_URI=mongodb://localhost:27017` non funziona con le change stream già in uso (servono a `characterUpdated`), e BACKEND-NOTES §7 indica `mongodb://localhost:27017/?replicaSet=rs0`. Chi copia il template ottiene un BE che parte ma con subscription rotte.

**Fix:** allineare il template a `mongodb://localhost:27017/?replicaSet=rs0` con un commento.

### IN-08: Validazione della config al boot limitata alle chiavi auth; `GraphQLRequestContext.req` tipato `any`

**File:** `src/config/env.validation.ts:3-8`; `src/graphql/graphql-context.ts:13`

**Issue:**

- `validateEnv` valida solo le chiavi auth: `MONGO_URI`/`DB_NAME` mancanti emergono solo come errore di connessione a runtime, non come errore esplicito al boot.
- `req: any` nel contesto GraphQL fa perdere il controllo dei tipi proprio nel punto in cui guard e `@CurrentUser()` leggono `user` e `headers`.

**Fix:** estendere `validateEnv` con un controllo di presenza per `MONGO_URI`/`DB_NAME` (anche fuori dallo scope stretto di Phase 2, Boy Scout Rule) e tipare `req` come `Request | IncomingMessage` con un'interfaccia condivisa con `GuardedRequest`.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
