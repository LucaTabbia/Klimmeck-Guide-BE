# Phase 2: Auth & Identity Foundation - Research

**Researched:** 2026-10-06
**Domain:** Autenticazione NestJS 11 (JWT di sessione, guard globale transport-aware HTTP/REST/graphql-ws), OAuth Twitch authorization code mediato dal BE, sessioni rotanti su Mongoose 8, dev bypass fail-closed
**Confidence:** HIGH (stack e meccanica Nest/graphql-ws verificati leggendo il codice installato in `node_modules`), MEDIUM sulle regole della console Twitch (fonti forum, docs ufficiali silenti)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Flusso OAuth Twitch (BE-AUTH-01)

> **Fatto verificato il 2026-10-06 su `dev.twitch.tv/docs/authentication/getting-tokens-oauth/`:** Twitch **non supporta PKCE** e l'authorization code grant **richiede `client_secret`** nel POST a `/oauth2/token`. I "public client" possono usare solo il Device Code Flow. I plan FE Phase 11 di aprile (PKCE + scambio token dall'app) poggiano quindi su una premessa errata. Thread storici del forum Twitch indicano inoltre che i redirect URI con custom scheme (`klimmeck://`) non sono accettati (solo `https` o `http://localhost`) — **da confermare in research**.

- **D-01:** Il flusso è **Authorization Code mediato dal BE**. Il FE non vede mai né il `client_secret` né i token Twitch. Questo emenda la formulazione di BE-AUTH-01 ("`twitchAccessToken → JWT`"): l'intento resta identico (una prova d'identità Twitch scambiata **una tantum** per una sessione BE, zero chiamate Twitch per-request), cambia solo chi esegue lo scambio.
- **D-02:** Due endpoint REST `@Public()`:
  - `GET /auth/twitch/start?challenge=<S256>` → 302 verso `https://id.twitch.tv/oauth2/authorize` con `response_type=code`, `client_id`, `redirect_uri` = callback BE, **scope vuoto** (serve solo l'identità), `force_verify=true` (garantisce l'account switch pulito richiesto dal FE, D-16 FE), `state` firmato dal BE che incapsula il `challenge`.
  - `GET /auth/twitch/callback?code&state` → verifica `state`, scambia il `code` (con `client_secret`), chiama `/oauth2/validate`, risolve/crea lo User, emette un **login ticket monouso a TTL breve (≤ 60s)** e fa 302 verso il deep link dell'app `klimmeck://auth?ticket=<ticket>`. Errori/annullamento utente → 302 `klimmeck://auth?error=<codice>` (mai una pagina d'errore morta nel browser di sistema).
- **D-03:** La tratta app↔BE è protetta con un **binding stile PKCE (S256)**: il FE genera `code_verifier`/`code_challenge`, passa il challenge a `/auth/twitch/start`, e il ticket è riscattabile solo presentando il verifier. Un deep link intercettato da un'app ostile (custom-scheme hijacking) è così inutilizzabile. Mutation `@Public()` `exchangeLoginTicket(ticket, codeVerifier)` → `AuthSession`.
- **D-04:** Identità = campo `user_id` di `/oauth2/validate` (→ `User.twitchId`). Il BE verifica che il `client_id` restituito da validate coincida con il proprio. Resolve-or-create dello User per `twitchId` (upsert atomico, indice unico su `twitchId`); un nuovo User nasce con `role: adventurer`, `twitchPoints: 0`, `currentCharacter: null`. Il ruolo `innkeeper` resta un'assegnazione manuale a DB (single channel: un solo innkeeper).
- **D-05:** I token Twitch **non vengono persistiti**: letti per risolvere l'identità, poi scartati (revoke best-effort con timeout breve; un fallimento del revoke non blocca il login).
- **D-06:** **Twitch non configurato** (manca uno tra `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`): l'app **si avvia normalmente** con un warning al boot; `/auth/twitch/start` risponde con 302 `klimmeck://auth?error=twitch_not_configured`. Nessun crash, nessuna dipendenza dalle chiavi per build, test o avvio.

#### Sessione: access JWT + refresh token (BE-AUTH-01, BE-AUTH-04)

- **D-07:** Access token = **JWT firmato** con secret da env (`JWT_SECRET`, obbligatorio al boot, lunghezza minima validata), **TTL 15 minuti**, claims `{ sub: userId, twitchId, role, sid: sessionId }`.
- **D-08:** Refresh token **opaco** (random 256 bit), persistito **solo come hash SHA-256** in una collection `sessions` (una sessione per device; multi-device consentito). **Rotazione a ogni refresh** con reuse detection (riuso di un token già ruotato → revoca dell'intera sessione). Scadenza sliding **30 giorni** con TTL index Mongo.
- **D-09:** Mutation `@Public()` `refreshSession(refreshToken)` → nuova coppia access+refresh. Mutation autenticata `logout` → invalida la sessione corrente (`sid`). La strategia di refresh era stata deferita dalla research di milestone "da rivedere con l'handoff FE Phase 11": quel momento è adesso, perché FE Phase 11 (refresh silente, AUTH-06 FE) non può atterrare senza.
- **D-10:** `role` nel JWT è uno snapshot: un cambio ruolo a DB diventa effettivo al refresh successivo (staleness massima = TTL access token). Accettato.
- **D-11:** Errori tipizzati su `extensions.code` GraphQL, stabili e documentati nell'handoff: `UNAUTHENTICATED` (token assente/invalido/scaduto), `SESSION_EXPIRED`, `SESSION_REVOKED` (refresh rifiutato → il FE torna al sign-in), `LOGIN_TICKET_INVALID`. Su REST: HTTP 401 con body JSON coerente.

#### Guard globale e seam d'identità (BE-AUTH-02, BE-AUTH-03, BE-AUTH-06)

- **D-12:** **Un solo punto di risoluzione dell'identità** (bearer → identità), riusato da guard HTTP (GraphQL + REST) e da `onConnect` WS. Guard globale `APP_GUARD` transport-aware. Whitelist `@Public()` **esplicita ed enumerata**: `exchangeLoginTicket`, `refreshSession`, `GET /auth/twitch/start`, `GET /auth/twitch/callback`, health `GET /`. Tutto il resto — incluso il controller REST Cloudinary — richiede un'identità valida.
- **D-13:** Decorator `@CurrentUser()` → `{ userId, twitchId, role, sessionId? }` uniforme su HTTP e WS. Nuova query `me: User` come primo consumer reale (serve al FE per riallineare l'utente al bootstrap).
- **D-14:** WS: il JWT viaggia nel payload di `connection_init` come `{ "Authorization": "Bearer <jwt>" }` (il FE Phase 1 lo invia già con questa chiave). Assente/invalido → connessione rifiutata in `onConnect`. **Scadenza enforced sul socket**: il server chiude la connessione quando il JWT scade, così il FE riconnette in silenzio con un token fresco (chiude Pitfall 1 della research). Codice di chiusura esatto e meccanismo (timer per-socket vs sweep) a discrezione di research/planner.
- **D-15:** Phase 2 è **solo autenticazione**: i resolver esistenti non vengono riscritti per l'ownership (Phase 3). L'unica modifica ai resolver esistenti è che ora richiedono un'identità valida.

#### Dev bypass fail-closed (BE-AUTH-05)

- **D-16:** **Direttiva utente (2026-10-06):** *"per la login su Twitch, di cui non abbiamo ancora le chiavi, per adesso inizia l'implementazione ma permetti di bypassare il tutto finché non si ha tutto il necessario."* Il bypass è quindi un cittadino di prima classe finché le chiavi non arrivano, non un ripiego nascosto.
- **D-17:** Attivazione: flag **booleano esplicito** `DEV_AUTH_ENABLED=true` **e** `NODE_ENV !== 'production'`. "Variabile presente" non significa mai "abilitato". Con `NODE_ENV=production` e flag attivo l'app **rifiuta di avviarsi** (fail-closed al boot, errore esplicito); in più il resolver d'identità ignora comunque il token dev in produzione (defense in depth).
- **D-18:** Variabili con **gli stessi nomi dello stub FE**: `DEV_AUTH_ACCESS_TOKEN`, `DEV_AUTH_TWITCH_ID`, `DEV_AUTH_ROLE`. Un bearer uguale a `DEV_AUTH_ACCESS_TOKEN` (confronto timing-safe) risolve all'identità stub. Lo User stub è **reale a DB**: risolto/creato per `DEV_AUTH_TWITCH_ID` con `role = DEV_AUTH_ROLE`, così `me` e tutti i resolver lavorano su un documento vero. Il BE non richiede `DEV_AUTH_USER_ID`: il FE riallinea l'id via `me`.
- **D-19:** Il bypass vale in modo identico su GraphQL HTTP, REST e WS `connection_init`.
- **D-20:** Strategia unica, iniettabile e greppabile (prefisso `DevAuth`), rimovibile prima della GA; warning rumoroso a ogni boot quando attiva.
- **D-21:** L'intera suite di test usa un **client Twitch finto/iniettabile**: nessuna chiave reale è richiesta per `npm test` o per la CI.

#### Rollout e handoff (BE-AUTH-04)

- **D-22:** Ordine di atterraggio nei plan: prima seam d'identità + dev bypass, **poi** il guard globale (il bypass è la rampa di migrazione — Pitfall 5).
- **D-23:** Creare `.env.example` con tutte le variabili nuove (`JWT_SECRET`, `TWITCH_*`, `DEV_AUTH_*`, `APP_DEEP_LINK_SCHEME`…), senza valori reali. `.env` resta fuori dal VCS.
- **D-24:** `BACKEND-NOTES.md` nella phase directory documenta: flusso login completo, shape di `AuthSession`, header HTTP, payload `connection_init`, comportamento a scadenza/refresh, codici d'errore, variabili dev bypass, scope Twitch (nessuno) e redirect URI da registrare nella console Twitch. Chiude le Open Questions #1 e #2 di FE Phase 11 e **segnala esplicitamente che i plan FE Phase 11 basati su PKCE lato app vanno ripianificati**.
- **D-25:** Aggiornare con nota datata il testo di BE-AUTH-01 in `REQUIREMENTS.md` e il success criterion 1 della Phase 2 in `ROADMAP.md` per riflettere D-01 (fatto in questa sessione di discuss).

### Claude's Discretion

- Libreria JWT: `@nestjs/jwt` con guard custom **oppure** `@nestjs/passport` + `passport-jwt`. Lean: guard custom su `@nestjs/jwt`, dato che il path WS e il dev bypass scavalcano comunque Passport e un solo resolver d'identità serve entrambi i trasporti.
- Rappresentazione di `state` e login ticket: stateless firmati (JWT con `jti` monouso) vs documenti Mongo con TTL — purché il ticket sia realmente **monouso** e legato al challenge.
- Naming e layout del modulo (`src/auth/…`), shape esatta dei DTO GraphQL, nome della collection sessioni.
- Meccanismo di chiusura del socket WS a scadenza e codice di chiusura.
- Rimozione/riuso del file vuoto `src/rest/auth.controller.ts` (Boy Scout Rule).
- Validazione della config al boot (schema Joi/zod vs validazione manuale minimale).

### Deferred Ideas (OUT OF SCOPE)

- **Rilevazione della revoca lato Twitch** (validate orario con token Twitch persistiti e cifrati at-rest) → Phase 10 (Hardening). Il contratto FE è già stabile: un refresh rifiutato con `SESSION_REVOKED` riporta al sign-in; la meccanica BE potrà atterrare dopo senza toccare il FE. Non verificabile senza chiavi reali.
- **Ownership, role guard, filtro subscription per identità, audit log** → Phase 3.
- **Rate limiting sugli endpoint pubblici di auth, CORS, introspection off** → Phase 10.
- **App Links / Universal Links** come destinazione del redirect al posto del custom scheme → hardening (il binding S256 di D-03 copre già l'intercettazione del deep link).
- **Gestione multi-sessione lato utente** ("esci da tutti i dispositivi", elenco sessioni) → backlog.
- **Assegnazione automatica del ruolo innkeeper** via configurazione → backlog (oggi manuale a DB).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-AUTH-01 | Login Twitch OAuth mediato dal BE → login ticket monouso → JWT BE a TTL breve `{userId,twitchId,role}` + refresh token rotante; resolve/create User per `twitchId` | §Q1 (contratto Twitch verificato), Pattern 5–7 (ticket Mongo TTL + S256, sessioni rotanti, `TwitchOAuthClient` iniettabile), Pitfall 7–10 |
| BE-AUTH-02 | `APP_GUARD` globale: mutation senza JWT → errore auth; `@Public()` passa; copre HTTP GraphQL e REST Cloudinary | §Q3 (guard gira su HTTP/REST/WS, `getType()`), Pattern 2 (guard transport-aware), Pattern 8 (codici errore), Pitfall 3–4 |
| BE-AUTH-03 | WS autenticato in `connection_init` (`Authorization: Bearer`), rifiuto in `onConnect`, identità ai resolver, verificato con integration test reale | §Q2 (sorgente graphql-ws 6.0.6 + @nestjs/graphql 13.2.0 letti), Pattern 3–4 (`forRootAsync` + `onConnect` + context + timer di scadenza), Pitfall 1–2 |
| BE-AUTH-04 | Handoff `BACKEND-NOTES.md` per FE (login, header, connection_init, post-refresh, scope, codici chiusura WS) | §Q1, §Q2 (comportamento client Dart `graphql` 5.2.1 verificato), sezione "Contenuto minimo BACKEND-NOTES" |
| BE-AUTH-05 | Dev bypass fail-closed `DEV_AUTH_ENABLED` + `NODE_ENV` | §Q7 (`ConfigModule` `validate` sincrono, `timingSafeEqual` su digest), Pattern 9 |
| BE-AUTH-06 | Identità da `@CurrentUser()` (mai da argomenti); REST coperto dallo stesso guard | Pattern 2 + `@CurrentUser` uniforme via `req.user`, test REST 401 con `CloudinaryService` mockato |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack non negoziabile:** NestJS 11 + Mongoose 8 + Apollo GraphQL code-first + Bull/ioredis. Nessun upgrade di major (NestJS 12 / @nestjs/graphql 14 / Apollo Server 5 sono usciti ma **fuori scope**).
- **TDD obbligatorio:** Red → Green → Refactor per ogni feature/bugfix; test scritto prima dell'implementazione.
- **Clean Code / SoC / Boy Scout Rule:** una responsabilità per classe; rimuovere codice morto toccato (es. `src/rest/auth.controller.ts` vuoto, `installSubscriptionHandlers`).
- **Stile:** 4 spazi, single quote, trailing comma `all`, import assoluti `src/...`; file `{feature}.service.ts` / `.resolver.ts` / `.module.ts`; unit `*.spec.ts`, integration `*.int-spec.ts`.
- **Errori:** eccezioni Nest (`NotFoundException`, `BadRequestException`…) con messaggio descrittivo; log via `Logger`.
- **Security:** nessun secret in repo; `.env` fuori VCS; creare `.env.example`. Backend fonte di verità.
- **Workflow:** branch `feat/02-auth-foundation` da `develop`, PR verso `develop`, Conventional Commits con scope `phase-2`, **nessun trailer `Co-Authored-By`**.
- **GSD:** modifiche al repo solo dentro un workflow GSD.

## Summary

Il punto tecnico più delicato della fase — l'autenticazione delle subscription graphql-ws — è stato verificato **leggendo il codice effettivamente installato** (`@nestjs/graphql@13.2.0`, `@nestjs/apollo@13.1.0`, `graphql-ws@6.0.6`, `ws@8.18.3`, `@apollo/server@4.12.2`), non solo la documentazione. Risultati chiave: (1) `onConnect` che ritorna `false` chiude con **4403 Forbidden**, mentre `throw` (il pattern della doc Nest e della research di milestone STACK.md) chiude con **4500 Internal Server Error** e in non-produzione inoltra il messaggio dell'eccezione al client — quindi **si usa `return false`**; (2) il `context` top-level di `GraphQLModule` viene passato a graphql-ws e invocato a ogni `subscribe` con il `Context` graphql-ws (`{ connectionParams, extra: { socket, request } }`) come primo argomento, quindi un'unica funzione `context` può normalizzare HTTP e WS; (3) i guard globali (`APP_GUARD`) **girano** sulle `@Subscription` al momento del `subscribe` (il `subscribe` è avvolto da `ExternalContextCreator` con `contextType 'graphql'`, guard abilitati) e `context.getType()` vale `'graphql'` sia per HTTP sia per WS; (4) con `subscriptions` valorizzato, `installSubscriptionHandlers: true` è **già ignorato** (nessun secondo canale `subscriptions-transport-ws` registrato), ma va rimosso perché opzione morta e rimossa in `@nestjs/graphql` v14.

Sul lato Twitch, la documentazione ufficiale conferma il contratto `authorize` / `token` / `validate` / `revoke` (form-urlencoded, `client_secret` obbligatorio, `error=access_denied` sul redirect in caso di diniego). Le regole sugli OAuth Redirect URL non sono documentate nelle pagine ufficiali; più fonti del forum Twitch (2020, 2023, ottobre 2025) concordano: **solo `https://` oppure `http://localhost`, URI statici con match esatto (porta inclusa), nessun custom scheme** → D-02 (callback sul BE che poi fa 302 a `klimmeck://auth`) è confermato come l'unica strada per il flow mediato. Inoltre D-05 (token Twitch scartati e revocati subito) **elimina l'obbligo di validate orario** imposto dalla doc Twitch alle app che *mantengono* token.

Per lo stack: `@nestjs/jwt` è la scelta giusta con guard custom, ma **va pinnato a `^11.0.2`**: l'ultima `12.0.2` (agosto–settembre 2026) è **ESM-only** (`"type": "module"`, exports solo `import`) e romperebbe Jest/ts-jest CJS del progetto. Niente Passport (non serve: il path WS e il dev bypass lo scavalcherebbero comunque). Per la sessione: collection `sessions` con hash SHA-256 del refresh token, rotazione atomica `findOneAndUpdate` filtrata sull'hash corrente, TTL index su `expiresAt`; login ticket come documento Mongo TTL riscattato con `findOneAndDelete` (monouso atomico) + verifica S256; `state` OAuth come JWT firmato con `audience` dedicata (stateless).

**Primary recommendation:** Modulo `src/auth/` con un unico `AuthIdentityResolver` (bearer → `AuthIdentity`, include il `DevAuthStrategy`), guard globale custom su `@nestjs/jwt@^11.0.2`, `GraphQLModule.forRootAsync` (per iniettare il resolver in `onConnect`) con opzioni prodotte da una factory condivisa tra `AppModule` e i test di integrazione, e test WS reali con `ws` grezzo + `graphql-ws` client su porta effimera.

## Risposte puntuali alle domande di ricerca

### Q1 — Twitch OAuth oggi

| Punto | Risposta | Confidenza |
|---|---|---|
| Redirect URI custom scheme (`klimmeck://`) | **Non accettati.** Solo `https://…`; `http://` solo per `localhost`. URI **statici, match esatto, porta inclusa** (porte dinamiche non supportate). Le pagine ufficiali (`register-app`) non elencano le regole: la conferma viene dal forum Twitch (BarryCarlyon dic-2020 "Only localhost is supported for http"; thread iOS feb-2023 "Twitch only accepts the https protocol and not the Apple 'myApp://' scheme" con workaround "redirect to a website, then to your custom handler"; moderatore ott-2025 "Twitch only supports static Redirect URIs"). D-02 confermato. [CITED: discuss.dev.twitch.com, più thread concordi] | MEDIUM |
| Authorize URL | `GET https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&force_verify=true&state=…`. `scope` è marcato **Required** (lista space-delimited, URL-encoded); `force_verify` opzionale boolean; `state` "strongly encouraged". [CITED: dev.twitch.tv/docs/authentication/getting-tokens-oauth/] | HIGH |
| Scope vuoto | La doc dice `scope` required; forum storici confermano che `scope=` (stringa vuota) produce un token senza scope sufficiente per `/oauth2/validate`. **Raccomandazione: inviare sempre il parametro `scope=` presente ma vuoto** (non ometterlo). Da confermare col primo login reale quando arrivano le chiavi. [CITED: forum "Scope for just username?"; ASSUMED per il comportamento 2026] | MEDIUM |
| Redirect di successo | `?code=…&scope=…&state=…` | HIGH |
| Redirect di diniego | `?error=access_denied&error_description=…&state=…` | HIGH |
| Token exchange | `POST https://id.twitch.tv/oauth2/token`, `Content-Type: application/x-www-form-urlencoded`, body `client_id, client_secret, code, grant_type=authorization_code, redirect_uri` (identico a quello dell'authorize). Risposta JSON `{ access_token, refresh_token, expires_in, scope: string[], token_type: "bearer" }`. | HIGH |
| Validate | `GET https://id.twitch.tv/oauth2/validate` con header `Authorization: OAuth <token>` (anche `Bearer` accettato). 200 → `{ client_id, login, scopes, user_id, expires_in }`; 401 → `{ status: 401, message: "invalid access token" }`. **Tollerare `scopes` null/assente** per token senza scope [ASSUMED]. [CITED: dev.twitch.tv/docs/authentication/validate-tokens/] | HIGH |
| Obbligo validate orario | La doc impone validate "when it starts and on an hourly basis thereafter" alle app che usano token utente, con audit. **Con D-05 (token mai persistiti, revocati subito) non si applica**: nessun token Twitch vive oltre la callback. Coerente con il deferral in Phase 10. | HIGH |
| Revoke | `POST https://id.twitch.tv/oauth2/revoke`, form-urlencoded `client_id, token`; 200 senza body; 400 `{status:400,message:"Invalid token"}`; 404 `client does not exist`. | HIGH |
| PKCE | Nessuna menzione nella doc del code grant (conferma la verifica dell'orchestratore). | HIGH |

**Sviluppo locale:** registrare in console `http://localhost:3000/auth/twitch/callback` (porta fissa). iOS Simulator condivide la rete dell'host → funziona. **Android Emulator: `localhost` è l'emulatore stesso** → serve `adb reverse tcp:3000 tcp:3000` (oppure un tunnel https). Device fisici → tunnel https (ngrok/cloudflared) o staging. Più redirect URL possono essere registrati sulla stessa app [ASSUMED — UI console].

### Q2 — graphql-ws + @nestjs/graphql 13.2.0 / @nestjs/apollo 13.1.0 (codice installato letto)

1. **Cablaggio:** `ApolloDriver.start()` crea `GqlSubscriptionService({ schema, path, context: options.context, ...options.subscriptions })`; questo chiama `useServer({ schema, execute, subscribe, context: this.options.context, ...graphqlWsOptions }, wss)`. Quindi `subscriptions['graphql-ws'].onConnect/onClose` arrivano a graphql-ws, e il **`context` top-level di GraphQLModule** è usato anche per WS (a meno di un `context` dentro `graphql-ws`, che lo sovrascrive). [VERIFIED: node_modules/@nestjs/graphql/dist/services/gql-subscription.service.js, @nestjs/apollo/dist/drivers/apollo.driver.js]
2. **Come arrivano `connectionParams`/`extra`:** graphql-ws invoca `context(ctx, id, payload, execArgs)` a **ogni `subscribe`**, con `ctx = { connectionParams, extra: { socket, request }, acknowledged, subscriptions }`. Nest avvolge il `context` (`wrapContextResolver`): chiama la funzione utente con gli stessi argomenti e, se il risultato non ha un `req` oggetto, assegna `req = args[0]` (cioè il ctx graphql-ws). Senza `context` custom, su WS `getContext().req` **è** il ctx graphql-ws — la fonte della confusione di nestjs/graphql#1756 (`connection` undefined con graphql-ws). [VERIFIED: apollo-base.driver.js `wrapContextResolver`/`assignReqProperty`]
3. **Rifiutare la connessione:** in `onConnect` `return false` → `socket.close(4403, 'Forbidden')`. **Non lanciare**: un'eccezione in `onConnect` è catturata dal message handler di `use/ws` → `close(4500, …)` e, con `NODE_ENV !== 'production'`, il `reason` contiene il messaggio dell'errore. `onConnect` può essere `async`. Timeout di `connection_init` default 3s → 4408. [VERIFIED: graphql-ws/dist/server-3ewaJSjp.js, use/ws.js]
4. **Chiudere un socket vivo a scadenza JWT:** timer per-socket creato in `onConnect` (`setTimeout(() => ctx.extra.socket.close(4401, 'Token expired'), expMs - now)`, `unref()`), salvato su `ctx.extra`, cancellato in `onClose(ctx, code, reason)` (hook graphql-ws chiamato sempre alla chiusura). Preferito allo sweep periodico: preciso, O(1), nessuno scheduler globale.
5. **Codici raccomandati:** `4403` per rifiuto al connect (nativo graphql-ws, nessun hack), `4401` + reason `Token expired` per scadenza su socket vivo. Il client JS di riferimento tratta 4401 come fatale (niente retry) e 4403 come ritentabile [VERIFIED: graphql-ws/dist/client.js `shouldRetryConnectOrThrow`]; **il client Dart del FE (`graphql` 5.2.1, `SocketClient`) riconnette con `autoReconnect: true` per qualunque close code**, rivaluta `initialPayload` se è una funzione a ogni connect, e invoca `onConnectionLost(code, reason)` permettendo di ritardare/preparare la riconnessione [VERIFIED: ~/.pub-cache/hosted/pub.dev/graphql-5.2.1/lib/src/links/websocket_link/websocket_client.dart]. Conseguenza per l'handoff: il FE Phase 11 deve (a) leggere il token corrente dentro la closure `initialPayload` (oggi cattura `bootstrapToken` una volta sola — ok per il token dev statico, non per JWT da 15 min), (b) su 4401/4403 fare refresh prima di riconnettere e limitare i retry, altrimenti loop di riconnessione con token morto.
6. **`installSubscriptionHandlers: true`:** con `subscriptions` valorizzato è **ignorato** (`subscriptionsOptions = options.subscriptions || {'subscriptions-transport-ws': {}}` → il fallback legacy scatta solo senza `subscriptions`). Nessun secondo canale non autenticato oggi; un client con subprotocol legacy `graphql-ws` viene instradato al server graphql-ws e chiuso 4406. **Rimuoverlo comunque** (Boy Scout: opzione morta, `subscriptions-transport-ws` rimosso in `@nestjs/graphql` v14 [CITED: docs.nestjs.com/graphql/subscriptions]). [VERIFIED: apollo.driver.js]
7. **Upgrade path:** l'handler `upgrade` accetta solo `req.url.startsWith('/api/graphql')` (path WS = path GraphQL). Test: `ws://127.0.0.1:<port>/api/graphql`, subprotocol `graphql-transport-ws`.

### Q3 — Guard globali su HTTP / REST / WS

- `APP_GUARD` gira su: controller REST (`getType() === 'http'`), query/mutation GraphQL HTTP e `@Subscription` WS (`getType() === 'graphql'` in entrambi i casi). Per le subscription il guard gira **una volta al `subscribe`**, non per evento emesso; il `filter` gira per evento. **Non** gira sui field resolver (`@ResolveField`; `fieldResolverEnhancers` default vuoto) né sui campi di introspezione (`__schema`), risolti da graphql-js: **l'introspection resta pubblica** finché Phase 10 non la spegne. [VERIFIED: @nestjs/graphql/dist/services/resolvers-explorer.service.js]
- `GqlExecutionContext.create(ctx).getContext()`: HTTP → `{ req, res }` (Apollo `expressMiddleware`); WS → ciò che restituisce la funzione `context` per il ctx graphql-ws. Con la factory raccomandata (Pattern 3) i due shape diventano `{ req, res }` vs `{ req: extra.request, extra }`, e il guard discrimina con la presenza di `extra`.
- **Guard più pulito:** un unico `AuthGuard` che (1) esce subito se `@Public()` (Reflector su handler+class); (2) `http` → estrae bearer da `req.headers.authorization`, chiama `AuthIdentityResolver.resolve()` e imposta `req.user`; (3) `graphql` HTTP → idem su `getContext().req`; (4) `graphql` WS → legge `extra.identity` (già risolta in `onConnect`), ricontrolla `expiresAt` (difesa in profondità contro race col timer), copia in `req.user`. `@CurrentUser()` legge sempre `req.user` → uniforme.
- L'ordine Nest è middleware → **guard** → interceptor → pipe: su `POST /cloudinary/uploadImage` il guard rifiuta **prima** che `FileInterceptor` (multer) legga il file. [ASSUMED — ordine documentato di Nest, non riverificato oggi]

### Q4 — Libreria JWT

**`@nestjs/jwt@^11.0.2` + guard custom. Niente Passport.** Motivi: (a) il path WS non può usare Passport (nessuna `req` HTTP in `onConnect`), (b) il dev bypass deve stare nello stesso resolver d'identità per HTTP/REST/WS (D-12, D-19), (c) Passport aggiungerebbe 3 dipendenze per incapsulare 5 righe di estrazione bearer. **Versione:** `@nestjs/jwt` latest è `12.0.2` (2026-09-14) ma è **ESM-only** (`"type": "module"`, `exports` con sole condizioni `import`/`default`) → ts-jest in CJS fallirebbe; `11.0.2` (2025-12-05) è CJS, peer `@nestjs/common ^8–^11`, dipende da `jsonwebtoken 9.0.3`. [VERIFIED: npm registry]. Questo **supera** STACK.md di milestone (che raccomandava Passport per il path HTTP).

### Q5 — Sessioni/refresh su Mongoose 8

Schema e operazioni in Pattern 6. Punti chiave: hash SHA-256 (il token è 256 bit random → nessun bisogno di salt/bcrypt), indice **unico** su `refreshTokenHash`, indice su `previousRefreshTokenHash`, **TTL index** `{ expiresAt: 1 }, { expireAfterSeconds: 0 }` (sliding: ogni rotazione sposta `expiresAt`), rotazione atomica `findOneAndUpdate` con l'hash corrente nel filtro **e** `expiresAt > now` e `revokedAt: null` nel filtro (il TTL monitor gira ogni ~60 s, la cancellazione non è immediata). **Race:** due refresh concorrenti con lo stesso token → solo uno matcha il filtro (atomicità a livello documento); l'altro trova il token come `previous`. Raccomandazione: **grace window di 30 s** in cui il token immediatamente precedente può ancora ruotare (copre la risposta persa per rete instabile, frequente su mobile) senza revocare; fuori dalla finestra → reuse detection → revoca dell'intera sessione. Vedi Assumptions A3: è un affinamento di D-08 da confermare.

### Q6 — Login ticket + `state`

- **Ticket → documento Mongo TTL** (`login_tickets`): `{ ticketHash (unique), userId, codeChallenge, expiresAt (TTL) }`, riscatto con **`findOneAndDelete({ ticketHash, expiresAt: { $gt: now } })`** → monouso garantito atomicamente dal DB anche sotto concorrenza; poi verifica `base64url(sha256(codeVerifier)) === codeChallenge` con confronto timing-safe. Il ticket è consumato anche se il verifier è sbagliato (niente brute-force sul verifier). Un JWT stateless con `jti` richiederebbe comunque uno store per il "monouso": Mongo da solo è più semplice e testabile su MongoMemoryReplSet.
- **`state` → JWT stateless** firmato con `JWT_SECRET` ma con `audience: 'twitch-oauth-state'` (diversa da quella dell'access token), TTL 10 min, payload `{ challenge, nonce }`. Non serve monouso: il `code` Twitch è già monouso e il ticket è legato al challenge; il login-CSRF (attaccante che fa atterrare il proprio `code` nel browser della vittima) produce un ticket legato al challenge dell'attaccante, irriscattabile dall'app della vittima.

### Q7 — Config fail-closed al boot

`ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnv })`: la funzione `validate` è **sincrona**, riceve l'oggetto merge di `.env` + `process.env`, e **se lancia l'app non fa bootstrap** [CITED: docs.nestjs.com/techniques/configuration]. Raccomandata **funzione pura scritta a mano** (`src/config/env.validation.ts`), nessuna nuova dipendenza (Joi richiede ora v18; zod 4 aggiungerebbe una dipendenza per ~10 chiavi): regole → `JWT_SECRET` obbligatorio ≥ 32 caratteri; `DEV_AUTH_ENABLED` parsato come booleano esplicito (`'true'` → true, tutto il resto → false); se `DEV_AUTH_ENABLED && NODE_ENV === 'production'` → throw; se dev abilitato richiede `DEV_AUTH_ACCESS_TOKEN` (≥ 16 char), `DEV_AUTH_TWITCH_ID`, `DEV_AUTH_ROLE ∈ RoleType`; `TWITCH_*` tutti opzionali (mancanza di uno qualsiasi → `twitchConfigured = false` + warning al boot, D-06). **`timingSafeEqual`:** lancia `RangeError` se i buffer hanno lunghezze diverse → confrontare i **digest SHA-256** dei due valori (sempre 32 byte), mai le stringhe grezze.

### Q8 — Codici errore GraphQL

- Installato: `@apollo/server@4.12.2` (dipendenza transitiva di `@nestjs/apollo`; `app.module.ts` lo importa senza dichiararlo — vedi Pitfall 12).
- Un `UnauthorizedException` lanciato dal guard esce sul wire HTTP come `errors[0].extensions.code = 'UNAUTHENTICATED'` (mappa `apolloPredefinedExceptions` di `@nestjs/apollo`: 400→`BAD_REQUEST`, 401→`UNAUTHENTICATED`, 403→`FORBIDDEN`, altri → `INTERNAL_SERVER_ERROR` + `status`), con `extensions.originalError = { message, error: 'Unauthorized', statusCode: 401 }`, HTTP status **200** (errore di esecuzione GraphQL). [VERIFIED: apollo-base.driver.js `createTransformHttpErrorFn`]
- Per i codici custom (`SESSION_EXPIRED`, `SESSION_REVOKED`, `LOGIN_TICKET_INVALID`): **non** lanciare `GraphQLError` grezzo dai resolver — Nest lo logga come `ExceptionsHandler` error con stack (solo le `HttpException`, che estendono `IntrinsicException`, non vengono loggate) e su REST diventerebbe 500. Raccomandato: `AuthException extends UnauthorizedException` con `code` + proprietà `extensions = { code }`, più un `formatError` che, se l'errore originale (`unwrapResolverError`) è `AuthException`, ripristina `extensions.code = code` (il formatter utente gira **dopo** la trasformazione Nest). Su REST la stessa eccezione produce 401 `{ statusCode, error, message, code }`. Su WS (graphql-ws non usa `formatError` di Apollo) graphql-js copia automaticamente `originalError.extensions` nel `GraphQLError` [VERIFIED: graphql@16.11.0 GraphQLError.js]. Confidenza MEDIUM finché l'integration test non lo dimostra.

### Q9 — Strategia di test (vedi Validation Architecture)

`graphql-ws@6.0.6` e `ws@8.18.3` **sono presenti** in `node_modules` ma solo come dipendenze transitive di `@nestjs/graphql` (che li pinna esattamente) → **dichiararli**: `graphql-ws@6.0.6` in `dependencies` (il `src` importa `CloseCode`/`Context`), `ws@8.18.3` + `@types/ws` in `devDependencies`. graphql-ws ha export duali (`require` → `index.cjs`) → `createClient` funziona sotto Jest CJS con `webSocketImpl: WebSocket` di `ws`. Redis: i test auth **non importano `AppModule`** (che porta `BullModule.forRootAsync` + `CharactersModule` con change stream e queue) ma un modulo di test dedicato che riusa la **stessa factory delle opzioni GraphQL** dell'app, coerente con la decisione Phase 1 "processor test senza CharactersService".

### Q10 — Cosa si rompe con il guard globale

| Elemento | Impatto | Azione |
|---|---|---|
| `AppController GET /` (health) | Riceverebbe 401 | `@Public()` (D-12) |
| `CloudinaryController` (3 POST) | Diventa protetto (voluto) | Test 401 senza token; FE deve inviare bearer (dio lo fa già) |
| Tutti i 12 resolver esistenti + `characterUpdated` | Richiedono identità (voluto, D-15) | Nessuna modifica di codice; dev bypass = rampa (D-22) |
| Bull `@Process` (`SpellRecoveryProcessor`) | **Non impattati**: `@nestjs/bull` lega l'handler con `instance[key].bind(instance)`, nessun enhancer | Nessuna [VERIFIED: @nestjs/bull/dist/bull.explorer.js] |
| Change stream (`CharactersService.onModuleInit`), `RoadsService.onModuleInit` | Non impattati (lifecycle hook, non request pipeline) | Nessuna |
| Introspection / landing page Apollo | Restano pubbliche (non passano dai resolver Nest) | Documentare; spegnimento in Phase 10 |
| `src/app.controller.spec.ts` (unit, chiama il metodo) | Non impattato | Nessuna |
| `test/app.e2e-spec.ts` (fuori CI, importa `AppModule` → Redis+Mongo reali, `.env`) | Già fragile; con `validateEnv` fallisce senza `JWT_SECRET` | Rimuovere o lasciare documentato come non in CI (Boy Scout) |
| `createUser`/`updateUser`/`deleteUser` | Qualunque utente autenticato può impostare `role: innkeeper` | **Fuori scope (Phase 3)** ma da segnalare in BACKEND-NOTES / STATE come gap noto |
| `User.twitchId` senza indice unico | Upsert concorrenti → duplicati | Aggiungere `unique: true`; vedi Runtime State Inventory (dati esistenti) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/jwt` | `^11.0.2` (NON 12.x) | Firma/verifica access JWT e `state` | Wrapper ufficiale Nest su `jsonwebtoken@9.0.3`; 11.x è CJS e compatibile Nest 11 [VERIFIED: npm view, 12.0.2 è `"type":"module"`] |
| `graphql-ws` | `6.0.6` (esatto, dedup con `@nestjs/graphql`) | Tipi `Context`, enum `CloseCode` in `src`; client nei test | Già il protocollo usato dal server; pin identico evita una seconda copia [VERIFIED: @nestjs/graphql deps `graphql-ws: 6.0.6`] |
| `node:crypto` | built-in (Node 22.12) | `randomBytes`, `createHash('sha256')`, `timingSafeEqual`, digest `base64url` | Nessuna libreria serve per hash/random/compare |
| `fetch` + `AbortSignal.timeout` | built-in Node 22 | Client HTTP Twitch (`token`/`validate`/`revoke`) | Tre chiamate form/JSON; niente axios/twurple |

### Supporting (dev)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ws` | `^8.18.3` (dedup) | WebSocket client nei test (raw protocol per close code; `webSocketImpl` per `createClient`) | Integration test WS |
| `@types/ws` | `^8.18.2` | Tipi | Con `ws` |
| `supertest` | `7.1.4` (già installato) | HTTP GraphQL + REST + redirect 302 (non segue i redirect di default) | Integration test HTTP |
| `mongodb-memory-server` | già installato (replSet Phase 1) | Mongo reale per sessioni/ticket/upsert | Integration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| guard custom | `@nestjs/passport@12.0.0` + `passport-jwt@4.0.1` | Ceremonia + 3 dipendenze; non copre WS né il dev bypass; scartato |
| `validate` manuale | `zod@4.6.5` / `joi@18.2.9` | Utile se la config cresce molto; oggi ~12 chiavi → funzione pura testabile basta |
| Ticket Mongo TTL | JWT stateless con `jti` + store `jti` usati | Serve comunque uno store per il monouso → due meccanismi invece di uno |
| Timer per-socket | Sweep periodico su `wss.clients` | Meno preciso, scheduler globale da gestire nei test |
| `fetch` nativo | `@twurple/auth` | Utile in Phase 6 (EventSub); per 3 endpoint OAuth è peso inutile |

**Installation:**
```bash
npm install @nestjs/jwt@^11.0.2 graphql-ws@6.0.6
npm install -D ws@^8.18.3 @types/ws@^8.18.2
```
Nota: il progetto dichiara `packageManager: yarn` ma il lockfile è `package-lock.json` e la CI usa `npm ci` → usare **npm** e committare `package-lock.json`.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth/
│   ├── auth.module.ts                 # JwtModule.registerAsync, providers, APP_GUARD, controller, resolver
│   ├── auth.config.ts                 # AUTH_CONFIG provider tipizzato (da ConfigService) — override nei test
│   ├── auth-identity.ts               # type AuthIdentity { userId, twitchId, role, sessionId?, expiresAt? }
│   ├── auth-identity.resolver.ts      # UNICO punto bearer → AuthIdentity (JWT + DevAuth)
│   ├── auth.exception.ts              # AuthException extends UnauthorizedException { code }
│   ├── auth-error-code.enum.ts        # UNAUTHENTICATED, SESSION_EXPIRED, SESSION_REVOKED, LOGIN_TICKET_INVALID
│   ├── guards/auth.guard.ts           # APP_GUARD transport-aware
│   ├── decorators/public.decorator.ts
│   ├── decorators/current-user.decorator.ts
│   ├── dev/dev-auth.strategy.ts       # prefisso DevAuth greppabile (D-20)
│   ├── session/session.model.ts       # @Schema sessions
│   ├── session/session.service.ts     # create / rotate / revoke
│   ├── login-ticket/login-ticket.model.ts
│   ├── login-ticket/login-ticket.service.ts
│   ├── twitch/twitch-oauth.client.ts  # abstract class + HttpTwitchOAuthClient (fetch)
│   ├── twitch/twitch-auth.controller.ts   # GET /auth/twitch/start, /callback (@Public)
│   ├── twitch/twitch-login.service.ts     # orchestrazione callback
│   ├── ws/ws-connection-authenticator.ts  # onConnect / onClose + timer scadenza
│   ├── auth.resolver.ts               # exchangeLoginTicket, refreshSession, logout, me
│   └── dto/auth-session.model.ts      # @ObjectType AuthSession
├── config/env.validation.ts           # validateEnv (puro)
└── graphql/graphql-options.factory.ts # createGraphQLOptions(wsAuth, { autoSchemaFile }) condiviso app/test
test/
├── auth/auth-test-app.ts              # builder Nest app di test (Mongo replSet, fake Twitch, AUTH_CONFIG test)
├── auth/fake-twitch-oauth.client.ts
├── auth/ws-test-client.ts             # helper ws grezzo: connect, init, await close code
└── fixtures/session.fixture.ts        # buildSession/persistSession (pattern two-tier Phase 1)
```
`src/rest/auth.controller.ts` (vuoto) → **eliminare** (Boy Scout, CONCERNS #11). Le rotte `/auth/twitch/*` vivono in `src/auth/twitch/`.

### Pattern 1: Resolver d'identità unico (D-12)
**What:** un solo servizio converte `Authorization: Bearer <x>` in `AuthIdentity` o lancia `AuthException(UNAUTHENTICATED)`. Ordine: dev strategy (se abilitata e non production) → JWT verify (`algorithms: ['HS256']`, `audience: 'klimmeck-api'`, `issuer`). Nessun accesso DB per il path JWT (D-07); il path dev usa l'utente stub risolto una volta (memoized promise).
```typescript
// Fonte: pattern raccomandato (non da doc ufficiale)
@Injectable()
export class AuthIdentityResolver {
    constructor(
        private readonly jwtService: JwtService,
        private readonly devAuthStrategy: DevAuthStrategy,
    ) {}

    async resolveBearer(authorization: unknown): Promise<AuthIdentity> {
        const token = extractBearerToken(authorization);
        if (!token) throw AuthException.unauthenticated();
        const devIdentity = await this.devAuthStrategy.tryResolve(token);
        if (devIdentity) return devIdentity;
        return this.verifyAccessToken(token);
    }

    private async verifyAccessToken(token: string): Promise<AuthIdentity> {
        try {
            const claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
                algorithms: ['HS256'],
                audience: ACCESS_TOKEN_AUDIENCE,
            });
            return {
                userId: claims.sub,
                twitchId: claims.twitchId,
                role: claims.role,
                sessionId: claims.sid,
                expiresAt: claims.exp * 1000,
            };
        } catch {
            throw AuthException.unauthenticated();
        }
    }
}
```

### Pattern 2: Guard globale transport-aware
```typescript
// Fonte: verificato contro resolvers-explorer.service.js (guard su subscribe, getType 'graphql')
@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly identityResolver: AuthIdentityResolver,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (this.isPublic(context)) return true;
        const request = this.getRequest(context);
        request.user = await this.resolveIdentity(context, request);
        return true;
    }

    private isPublic(context: ExecutionContext): boolean {
        return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) === true;
    }

    private getRequest(context: ExecutionContext) {
        if (context.getType() === 'http') return context.switchToHttp().getRequest();
        return GqlExecutionContext.create(context).getContext().req;
    }

    private async resolveIdentity(context: ExecutionContext, request): Promise<AuthIdentity> {
        const wsExtra = this.getWsExtra(context);
        if (wsExtra) return assertNotExpired(wsExtra.identity);
        return this.identityResolver.resolveBearer(request?.headers?.authorization);
    }

    private getWsExtra(context: ExecutionContext): AuthenticatedWsExtra | undefined {
        if (context.getType<GqlContextType>() !== 'graphql') return undefined;
        return GqlExecutionContext.create(context).getContext().extra;
    }
}
// registrazione (in AuthModule): { provide: APP_GUARD, useClass: AuthGuard }
```
`@CurrentUser()` = `createParamDecorator` che per `'http'` legge `switchToHttp().getRequest().user` e per `'graphql'` `GqlExecutionContext.create(ctx).getContext().req.user`.

### Pattern 3: `GraphQLModule.forRootAsync` + factory condivisa
**What:** `onConnect` ha bisogno di DI (resolver d'identità) → `forRoot` statico non basta. Le opzioni vengono da una factory pura riusata dall'integration test, così il test esercita **la stessa** config di produzione (onConnect, context, formatError).
```typescript
// src/graphql/graphql-options.factory.ts
export function createGraphQLOptions(
    wsAuth: WsConnectionAuthenticator,
    autoSchemaFile: string | boolean,
): ApolloDriverConfig {
    return {
        path: '/api/graphql',
        autoSchemaFile,
        sortSchema: true,
        playground: false,
        introspection: true,
        plugins: [ApolloServerPluginLandingPageLocalDefault()],
        context: ({ req, res, extra }) =>
            extra ? { req: extra.request, extra } : { req, res },
        formatError: formatAuthError,
        subscriptions: {
            'graphql-ws': {
                onConnect: (ctx) => wsAuth.onConnect(ctx),
                onClose: (ctx) => wsAuth.onClose(ctx),
            },
        },
        // installSubscriptionHandlers rimosso
    };
}

// app.module.ts
GraphQLModule.forRootAsync<ApolloDriverConfig>({
    driver: ApolloDriver,
    imports: [AuthModule],
    inject: [WsConnectionAuthenticator],
    useFactory: (wsAuth: WsConnectionAuthenticator) =>
        createGraphQLOptions(wsAuth, join(process.cwd(), 'src/schema.gql')),
}),
// test: createGraphQLOptions(wsAuth, true)  → schema in memoria, src/schema.gql intatto
```

### Pattern 4: `onConnect` + timer di scadenza
```typescript
// Fonte: graphql-ws 6.0.6 server (return false → 4403; onClose sempre invocato)
@Injectable()
export class WsConnectionAuthenticator {
    constructor(private readonly identityResolver: AuthIdentityResolver) {}

    async onConnect(ctx: Context<ConnectionParams, AuthenticatedWsExtra>): Promise<boolean> {
        try {
            const authorization = ctx.connectionParams?.Authorization ?? ctx.connectionParams?.authorization;
            const identity = await this.identityResolver.resolveBearer(authorization);
            ctx.extra.identity = identity;
            ctx.extra.expiryTimer = this.scheduleExpiryClose(ctx.extra.socket, identity.expiresAt);
            return true;
        } catch {
            return false; // → close 4403 Forbidden
        }
    }

    onClose(ctx: Context<ConnectionParams, AuthenticatedWsExtra>): void {
        if (ctx.extra.expiryTimer) clearTimeout(ctx.extra.expiryTimer);
    }

    private scheduleExpiryClose(socket: WebSocket, expiresAt?: number) {
        if (!expiresAt) return undefined; // identità dev: nessuna scadenza
        const timer = setTimeout(
            () => socket.close(WS_TOKEN_EXPIRED_CLOSE_CODE, 'Token expired'), // 4401
            Math.max(0, expiresAt - Date.now()),
        );
        timer.unref();
        return timer;
    }
}
```

### Pattern 5: Flow Twitch con client iniettabile (D-06, D-21)
- `abstract class TwitchOAuthClient { exchangeCode(code): Promise<TwitchTokens>; validate(accessToken): Promise<TwitchTokenInfo>; revoke(accessToken): Promise<void> }` come **token DI** (classe astratta); `HttpTwitchOAuthClient` usa `fetch` con `AbortSignal.timeout(5000)` (revoke: 2000, errori ignorati con `warn`). Nei test: `overrideProvider(TwitchOAuthClient).useValue(fakeTwitchClient)`.
- `AUTH_CONFIG.twitch` è `null` se manca una qualsiasi `TWITCH_*` → `start` fa 302 `klimmeck://auth?error=twitch_not_configured`; nessuna chiamata a Twitch possibile.
- Controller: usare `@Redirect()` e restituire `{ url }` (testabile senza `@Res()`), oppure `@Res() res.redirect(302, url)`. Validare `challenge` con `/^[A-Za-z0-9_-]{43}$/` (output base64url di SHA-256) → altrimenti `error=invalid_request`.
- Callback, in ordine: `error` presente → verifica `state` comunque → 302 `error=access_denied` (o `invalid_state`); verifica `state` (JWT aud `twitch-oauth-state`) → `exchangeCode` → `validate` → `client_id === TWITCH_CLIENT_ID` (altrimenti `error=twitch_client_mismatch`) → upsert User → crea ticket (TTL 60 s) → revoke best-effort **non awaited sul percorso critico o con timeout breve** → 302 `klimmeck://auth?ticket=<ticket>`. Qualunque eccezione → 302 `error=twitch_exchange_failed`. **Mai** loggare `code`, token, ticket o verifier.

### Pattern 6: Sessioni rotanti (D-08, D-09)
```typescript
@Schema({ collection: 'sessions', timestamps: true, versionKey: false })
export class Session {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId: Types.ObjectId;
    @Prop({ required: true, unique: true }) refreshTokenHash: string;
    @Prop({ index: true, sparse: true }) previousRefreshTokenHash?: string;
    @Prop() rotatedAt?: Date;
    @Prop({ default: null }) revokedAt: Date | null;
    @Prop({ required: true }) expiresAt: Date;
}
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// rotate (atomico, grace window 30 s sul token precedente)
const rotated = await this.sessionModel.findOneAndUpdate(
    {
        revokedAt: null,
        expiresAt: { $gt: now },
        $or: [
            { refreshTokenHash: presentedHash },
            { previousRefreshTokenHash: presentedHash, rotatedAt: { $gt: graceStart } },
        ],
    },
    [ /* pipeline update: prev = (current === presented ? presented : prev), current = newHash,
         rotatedAt = now, expiresAt = now + 30d */ ],
    { new: true },
);
if (!rotated) return this.handleRejectedRefresh(presentedHash); // reuse → revoke → SESSION_REVOKED; sconosciuto → SESSION_EXPIRED
```
Se la pipeline update risulta poco leggibile, alternativa equivalente: due `findOneAndUpdate` sequenziali (prima sul `refreshTokenHash` corrente, poi sul `previous` in finestra di grazia). `handleRejectedRefresh`: se `presentedHash` corrisponde a un `previousRefreshTokenHash` (fuori finestra) → `updateOne({ revokedAt: now })` → `SESSION_REVOKED`; se la sessione trovata è già revocata → `SESSION_REVOKED`; altrimenti → `SESSION_EXPIRED`. `logout` → `revokedAt = now` sulla `sid` dell'identità corrente.

### Pattern 7: Login ticket monouso
```typescript
const ticket = randomBytes(32).toString('base64url');
await this.ticketModel.create({ ticketHash: sha256(ticket), userId, codeChallenge, expiresAt: now + 60_000 });
// riscatto
const doc = await this.ticketModel.findOneAndDelete({ ticketHash: sha256(ticket), expiresAt: { $gt: now } });
if (!doc || !safeEqual(s256(codeVerifier), doc.codeChallenge)) throw AuthException.loginTicketInvalid();
```

### Pattern 8: Errori di dominio auth
`AuthException extends UnauthorizedException` con `code: AuthErrorCode` e `extensions = { code }`; `formatAuthError(formatted, error)` → `const original = unwrapResolverError(error); if (original instanceof AuthException) return { ...formatted, extensions: { ...formatted.extensions, code: original.code } }`. Non includere `originalError`/`stacktrace` nel payload auth (AS4 include `stacktrace` quando `NODE_ENV !== 'production'`).

### Pattern 9: Dev bypass (D-17..D-20)
`DevAuthStrategy.tryResolve(token)`: ritorna `null` se `!config.devAuth.enabled || process.env.NODE_ENV === 'production'` (difesa in profondità, oltre al rifiuto al boot) o se `!timingSafeEqual(sha256(token), sha256(devToken))`; altrimenti risolve (memoized) lo User stub con upsert `{ twitchId: DEV_AUTH_TWITCH_ID }` → `$set: { role: DEV_AUTH_ROLE }`, `$setOnInsert: { twitchPoints: 0, currentCharacter: null }` e ritorna identità **senza** `sessionId` né `expiresAt`. `onApplicationBootstrap` logga un `warn` rumoroso se attivo.

### Anti-Patterns to Avoid
- **`throw` in `onConnect`:** chiude 4500 e inoltra il messaggio dell'eccezione al client in non-prod. Usare `return false`.
- **`subscriptions['graphql-ws'].context` separato dal `context` top-level:** due funzioni divergenti → guard che legge shape diversi. Una sola funzione `context`.
- **Leggere l'header HTTP dell'upgrade in WS:** il client Dart non invia `Authorization` sull'upgrade; il token è solo in `connectionParams`.
- **Stesso secret e stessa audience per access JWT e `state`:** un `state` firmato varrebbe come access token. Audience distinte, verificate sempre.
- **`DEV_AUTH_ACCESS_TOKEN` presente ⇒ abilitato:** vietato (D-17).
- **Importare `AppModule` nei test auth:** trascina Redis/Bull, change stream e `.env` locale.
- **Jest fake timers con il driver Mongo:** bloccano/rompono le operazioni del driver; per le scadenze usare un `Clock` iniettabile o TTL brevi reali.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Firma/verifica JWT | HMAC + base64 a mano | `@nestjs/jwt@^11` (`jsonwebtoken`) | `alg`, `exp`/`nbf`, `aud`, clock, errori tipizzati |
| Random/hash/compare | `Math.random`, `===` su segreti | `crypto.randomBytes`, `createHash('sha256')`, `timingSafeEqual` su digest | Entropia, timing attack |
| Monouso del ticket | flag `used` + update separato | `findOneAndDelete` atomico | Race tra due riscatti |
| Scadenza documenti | cron di pulizia | TTL index Mongo (+ filtro `expiresAt > now`) | Già nel DB |
| Protocollo WS | parsing `connection_init` a mano | `graphql-ws` `useServer` (via Nest) hooks `onConnect`/`onClose` | Close code, timeout, ping già gestiti |
| Mappatura HttpException → codice GraphQL | filtro custom generale | trasformazione built-in `@nestjs/apollo` + piccolo `formatError` solo per `AuthException` | Non rompere gli shape d'errore esistenti consumati dal FE |
| Client Twitch typed | wrapper generico | 3 funzioni `fetch` dietro classe astratta | Niente dipendenza per 3 endpoint |

**Key insight:** in questo dominio i bug costosi sono di *integrazione* (shape del context WS, codici di chiusura, ordine dei filtri d'errore), non di algoritmo — per questo ogni comportamento va provato con integration test sullo stack reale, non con context mockati.

## Runtime State Inventory

Non è una fase di rename, ma introduce un indice unico e nuove collection su DB esistenti.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users` su DB dev/staging potrebbe contenere `twitchId` duplicati o mancanti (oggi nessun vincolo; `createUser` aperto). L'aggiunta di `unique: true` fa fallire la build dell'indice (Mongoose `autoIndex` logga l'errore, l'indice non nasce → upsert non più protetti) | Task: script/check di dedup prima del deploy + verifica che l'indice esista dopo il boot (`syncIndexes`/`listIndexes`). Collection nuove `sessions`, `login_tickets`: nessuna migrazione |
| Live service config | Console sviluppatori Twitch: app non ancora registrata (chiavi assenti); quando arriveranno serve registrare il redirect URL esatto (`https://<host-staging>/auth/twitch/callback`, `http://localhost:3000/auth/twitch/callback`) | Documentare in BACKEND-NOTES; nessuna azione in codice |
| OS-registered state | Nessuno — verificato: nessun scheduler/launchd/pm2 nel repo | Nessuna |
| Secrets/env vars | Nuove: `JWT_SECRET` (obbligatoria → **l'app non parte più senza**: aggiornare `.env` locale, staging e CI), `TWITCH_CLIENT_ID/SECRET/REDIRECT_URI` (opzionali), `DEV_AUTH_*` (stessi nomi del FE), `APP_DEEP_LINK_SCHEME`/`APP_AUTH_REDIRECT_URL` | `.env.example` (D-23); la CI non avvia `AppModule` quindi non serve il secret in CI se i test auth usano `AUTH_CONFIG` di test |
| Build artifacts | `src/schema.gql` rigenerato da `autoSchemaFile` (nuovi tipi `AuthSession`, query `me`, mutation) | Committare lo schema rigenerato; i test usano `autoSchemaFile: true` per non sporcarlo |

## Common Pitfalls

### Pitfall 1: `throw` in `onConnect` (contraddice STACK.md di milestone)
**What goes wrong:** il socket chiude con 4500 "Internal server error" e, fuori produzione, con il messaggio interno nel `reason`. Il FE non distingue un errore server da un token invalido.
**How to avoid:** `try/catch` → `return false` (4403). Test che asserisce il close code esatto.

### Pitfall 2: Token WS letto una volta sola lato FE
**What goes wrong:** con JWT a 15 min, la riconnessione dopo 4401 rimanda lo stesso token scaduto → 4403 in loop (il client Dart riconnette per qualunque codice).
**How to avoid:** handoff esplicito: `initialPayload` deve leggere il token corrente a ogni connect, e su 4401/4403 fare refresh prima di riconnettere (`onConnectionLost` restituisce il delay).

### Pitfall 3: Guard che legge `req.headers` su WS
**What goes wrong:** `getContext().req` su WS è l'`IncomingMessage` dell'upgrade (con la factory raccomandata) o il ctx graphql-ws (default): nessun bearer → subscription sempre rifiutate o, peggio, guard che fa no-op.
**How to avoid:** ramo WS esplicito su `getContext().extra.identity`; integration test con client graphql-ws reale.

### Pitfall 4: Codici custom sovrascritti o loggati come errori
**What goes wrong:** `GraphQLError` grezzo → log `ExceptionsHandler` con stack per ogni ticket sbagliato e 500 su REST; `UnauthorizedException` con code custom → Nest lo riscrive in `UNAUTHENTICATED`.
**How to avoid:** `AuthException` + `formatError` (Pattern 8); test che asserisce `extensions.code` sul wire per ciascun codice.

### Pitfall 5: Confusione di token (state / access / refresh)
**What goes wrong:** un JWT `state` accettato come bearer.
**How to avoid:** `audience` diverse e sempre verificate; refresh token opaco (non JWT); test negativo "state usato come bearer → UNAUTHENTICATED".

### Pitfall 6: TTL index usato come unica scadenza
**What goes wrong:** il TTL monitor gira ~ogni 60 s; un ticket "scaduto" resta riscattabile fino alla pulizia.
**How to avoid:** filtro `expiresAt: { $gt: now }` in ogni query; non testare la cancellazione TTL (lenta), testare il filtro.

### Pitfall 7: Upsert User concorrente
**What goes wrong:** due callback simultanee per lo stesso nuovo utente → E11000 duplicate key.
**How to avoid:** indice unico + `findOneAndUpdate({ twitchId }, { $setOnInsert: … }, { upsert: true, new: true })` + un retry su E11000 (il server Mongo ritenta già certi upsert su indice unico [ASSUMED], il retry applicativo è la cintura).

### Pitfall 8: `.env` locale che inquina i test
**What goes wrong:** `ConfigModule.forRoot({ envFilePath: '.env' })` legge il `.env` dello sviluppatore (es. `DEV_AUTH_ENABLED=true`) e i test diventano non deterministici; `--runInBand` condivide `process.env` tra file.
**How to avoid:** il modulo di test non usa il `.env` (`ignoreEnvFile: true`) e fa `overrideProvider(AUTH_CONFIG).useValue(testAuthConfig)`; `validateEnv` testata come funzione pura.

### Pitfall 9: Pulizia DB nei test integration con connessione Nest
**What goes wrong:** `test/setup/after-env.ts` svuota solo le collection della connessione mongoose **di default**; `MongooseModule.forRoot` di Nest crea una connessione separata → `sessions`/`login_tickets`/`users` restano tra i test.
**How to avoid:** `afterEach` che svuota le collection via `app.get(getConnectionToken())`, oppure `dbName` dedicato per suite + `dropDatabase()` in `afterAll`.

### Pitfall 10: Redirect URI non identico
**What goes wrong:** `redirect_uri` nel `token` exchange diverso da quello dell'authorize o da quello registrato (slash finale, porta) → errore Twitch.
**How to avoid:** una sola sorgente `TWITCH_REDIRECT_URI` usata in entrambe le chiamate; test sul fake client che asserisce il valore passato.

### Pitfall 11: Logout e access token stateless
**What goes wrong:** dopo `logout`, l'access JWT resta valido fino a 15 min (D-07: nessun DB per richiesta); un socket WS aperto resta vivo fino alla scadenza.
**How to avoid:** comportamento accettato e **documentato** nell'handoff (il FE scarta i token al logout). Se non accettabile → check `sid` attiva in `onConnect` (1 query per connessione) — vedi Open Question 2.

### Pitfall 12: Dipendenze transitive usate dal codice
**What goes wrong:** `app.module.ts` importa `@apollo/server` e il nuovo codice importerebbe `graphql-ws`/`ws`, nessuno dichiarato in `package.json` → un upgrade di `@nestjs/*` li sposta/rimuove.
**How to avoid:** dichiarare `graphql-ws@6.0.6` (dep), `ws` (devDep); valutare `@apollo/server@4.12.2` come dep esplicita (Boy Scout, stessa PR).

## Code Examples

### Helper WS grezzo per i close code (test)
```typescript
// Fonte: protocollo graphql-transport-ws (graphql-ws 6.0.6)
export function connectAndAwaitClose(url: string, payload?: Record<string, unknown>) {
    return new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const socket = new WebSocket(url, 'graphql-transport-ws');
        socket.on('open', () => socket.send(JSON.stringify({ type: 'connection_init', payload })));
        socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
        socket.on('error', reject);
    });
}
// expect((await connectAndAwaitClose(wsUrl, {})).code).toBe(4403);
```

### Client graphql-ws in Jest (happy path)
```typescript
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

const client = createClient({
    url: `ws://127.0.0.1:${port}/api/graphql`,
    webSocketImpl: WebSocket,
    connectionParams: { Authorization: `Bearer ${accessToken}` },
    retryAttempts: 0,
});
const iterator = client.iterate({ query: 'subscription { authProbe }' });
const { value } = await iterator.next();
expect(value.data.authProbe).toBe('twitch-test-1');
await iterator.return?.();
await client.dispose();
```
`authProbe` è un resolver **definito solo nel file di test** (`@Subscription(() => String) authProbe(@CurrentUser() user)` che restituisce un async iterator con `user.twitchId`): prova guard + context + `@CurrentUser` sul WS reale senza dipendere da `CharactersModule` (Bull/Redis/change stream).

### App di test su porta effimera
```typescript
const moduleRef = await Test.createTestingModule({
    imports: [
        MongooseModule.forRoot(process.env.MONGO_TEST_URI as string),
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
            driver: ApolloDriver,
            imports: [AuthModule],
            inject: [WsConnectionAuthenticator],
            useFactory: (wsAuth) => createGraphQLOptions(wsAuth, true),
        }),
    ],
    controllers: [AppController /* + CloudinaryController */],
    providers: [AppService, AuthProbeResolver, { provide: CloudinaryService, useValue: cloudinaryMock }],
})
    .overrideProvider(AUTH_CONFIG).useValue(testAuthConfig)
    .overrideProvider(TwitchOAuthClient).useValue(fakeTwitchClient)
    .compile();
const app = moduleRef.createNestApplication();
await app.listen(0, '127.0.0.1');
const port = (app.getHttpServer().address() as AddressInfo).port;
```

### S256
```typescript
export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
export const safeEqual = (a: string, b: string) =>
    timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
```

## Contenuto minimo BACKEND-NOTES.md (D-24)

1. Flusso login: app genera `code_verifier` (43–128 char) + `challenge = base64url(sha256(verifier))` → apre nel browser di sistema `GET {BE}/auth/twitch/start?challenge=…` → Twitch → `{BE}/auth/twitch/callback` → 302 `klimmeck://auth?ticket=…` | `?error=<access_denied|invalid_state|invalid_request|twitch_not_configured|twitch_client_mismatch|twitch_exchange_failed>` → mutation `exchangeLoginTicket(ticket, codeVerifier)` → `AuthSession { accessToken, accessTokenExpiresAt, refreshToken, user }`.
2. HTTP: `Authorization: Bearer <accessToken>` su GraphQL e REST (Cloudinary incluso).
3. WS: `connection_init` payload `{ "Authorization": "Bearer <accessToken>" }`; close `4403` = rifiutato al connect; `4401` reason `Token expired` = scaduto su socket vivo; `initialPayload` deve leggere il token **corrente**; su 4401/4403 → refresh → riconnessione; limite retry.
4. Refresh: `refreshSession(refreshToken)` (@Public) → nuova coppia; il refresh token precedente resta valido 30 s (grace) poi il suo riuso revoca la sessione; single-flight lato FE resta raccomandato.
5. Codici: `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `LOGIN_TICKET_INVALID`; errori GraphQL con HTTP 200, REST con 401 `{ statusCode, message, code }`.
6. Logout: `logout` revoca la sessione; l'access token resta tecnicamente valido fino a scadenza (≤ 15 min) → il FE lo scarta.
7. Scope Twitch: nessuno. Redirect URL da registrare (staging https + `http://localhost:3000/...`; Android emulator → `adb reverse`).
8. Dev bypass: `DEV_AUTH_ENABLED=true`, `DEV_AUTH_ACCESS_TOKEN` (stesso valore FE/BE), `DEV_AUTH_TWITCH_ID`, `DEV_AUTH_ROLE`; `DEV_AUTH_USER_ID` ignorato dal BE → usare `me`.
9. **I plan FE Phase 11 basati su PKCE lato app vanno ripianificati** (Twitch non supporta PKCE; nessun token Twitch arriva al FE).
10. Gap noto (Phase 3): `createUser/updateUser` permettono a qualunque utente autenticato di cambiare ruolo.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `subscriptions-transport-ws` / `installSubscriptionHandlers` | solo `graphql-ws` (`graphql-transport-ws`) | rimosso in `@nestjs/graphql` v14 | Rimuovere l'opzione ora |
| `@nestjs/jwt` CJS | `@nestjs/jwt@12` ESM-only | 2026-08-27 | Pin `^11.0.2` finché il progetto è CJS |
| Joi validationSchema | Standard Schema (Joi ≥18, zod…) in `@nestjs/config` recente | 2026 | Irrilevante con `validate` manuale |
| Passport per JWT HTTP | guard custom + `JwtService` quando servono più trasporti | — | Meno dipendenze, un solo seam |

**Deprecated/outdated:** milestone STACK.md "reject by throwing in onConnect" e "keep Passport for HTTP" → superati da questa research; ARCHITECTURE.md "`login(twitchToken)` mutation" → superato da D-01.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `scope=` vuoto accettato oggi da Twitch e `/validate` restituisce `user_id` (con `scopes` vuoto/null) | Q1 | Basso: fallback a uno scope minimo innocuo (es. `user:read:email` NO — meglio nessuno); verificabile al primo login reale |
| A2 | Più OAuth Redirect URL registrabili sulla stessa app nella console | Q1 | Basso: in alternativa app Twitch separata per dev |
| A3 | Grace window 30 s sul refresh token precedente (affinamento di D-08 "riuso → revoca") | Q5, Pattern 6 | Medio: se l'utente vuole reuse detection stretta, rimuovere il ramo `$or` (più semplice) a costo di logout forzati su risposte perse. **Da confermare** |
| A4 | Access token non revocato per-request dopo logout (finestra ≤ 15 min) | Pitfall 11 | Medio: se inaccettabile, check `sid` in guard/onConnect (1 query) |
| A5 | Ordine guard → interceptor protegge multer prima del parse del file | Q3 | Basso: coperto dal test REST 401 su `uploadImage` |
| A6 | Retry server-side Mongo degli upsert su indice unico | Pitfall 7 | Nullo: il retry applicativo copre comunque |
| A7 | `AuthException` + `formatError` produce `extensions.code` stabile su HTTP e WS | Q8 | Medio: dimostrare con integration test prima di documentare nell'handoff |

## Open Questions

1. **Grace window del refresh (A3)** — Cosa sappiamo: strict è conforme alla lettera di D-08; grace riduce logout forzati su mobile. Raccomandazione: implementare grace 30 s, confermare con l'utente in plan-check.
2. **Logout e access token vivo (A4)** — Raccomandazione: accettare (coerente con D-07/D-10) e documentare; opzionale check `sid` solo in `onConnect`.
3. **Destinazione del redirect finale** — `APP_DEEP_LINK_SCHEME` (D-23) vs URL completo `APP_AUTH_REDIRECT_URL=klimmeck://auth`. Raccomandazione: una variabile con l'URL completo (default `klimmeck://auth`), validata come non-`http(s)` per evitare open redirect configurazionali.
4. **`test/app.e2e-spec.ts`** — fuori CI, importa `AppModule` (Redis/Mongo reali). Raccomandazione: rimuoverlo o adattarlo; decidere in plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime/test | ✓ | v22.12.0 | — |
| npm registry | install `@nestjs/jwt`, `graphql-ws`, `ws`, `@types/ws` | ✓ | — | — |
| MongoMemoryReplSet | integration (sessioni, ticket, upsert) | ✓ (harness Phase 1) | binari 8.0.4 in CI | — |
| Redis | **non richiesto** dai test auth | n/a | — | modulo di test senza Bull |
| Credenziali Twitch | login reale | ✗ | — | `FakeTwitchOAuthClient` nei test; dev bypass a runtime (D-16) |
| Cloudinary | REST test | non necessario | — | `CloudinaryService` mockato via DI |

**Missing dependencies with no fallback:** nessuna.
**Missing dependencies with fallback:** credenziali Twitch → fake client + dev bypass.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29, projects `unit` / `integration` (`package.json`) |
| Config file | `package.json` → `jest.projects`; setup integration `test/setup/*` |
| Quick run command | `npx jest --selectProjects unit src/auth src/config` |
| Full suite command | `npm test` (= `test:unit` + `test:int --runInBand`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-AUTH-01 | authorize URL corretto (`response_type=code`, `scope=` vuoto, `force_verify=true`, `state` firmato, `redirect_uri`) | unit | `npx jest --selectProjects unit src/auth/twitch` | ❌ Wave 0 |
| BE-AUTH-01 | `start` senza Twitch configurato → 302 `error=twitch_not_configured`; challenge invalido → `invalid_request` | integration | `npx jest --selectProjects integration --runInBand src/auth/twitch` | ❌ |
| BE-AUTH-01 | callback con fake client → upsert User (adventurer, 0 punti) → 302 `ticket=`; `client_id` diverso → errore; `access_denied` → errore; state invalido → `invalid_state`; revoke fallito non blocca | integration | idem | ❌ |
| BE-AUTH-01 | `exchangeLoginTicket`: verifier giusto → `AuthSession` con JWT claims `{sub,twitchId,role,sid}` TTL 15 min; secondo riscatto / verifier errato / scaduto → `LOGIN_TICKET_INVALID` | integration | `npx jest --selectProjects integration --runInBand src/auth/auth.resolver` | ❌ |
| BE-AUTH-01 | `refreshSession`: rotazione, hash-only a DB, riuso fuori grace → `SESSION_REVOKED` e sessione revocata; sconosciuto/scaduto → `SESSION_EXPIRED`; due refresh concorrenti non producono due sessioni valide divergenti; `logout` revoca | integration (Mongo reale) | `npx jest --selectProjects integration --runInBand src/auth/session` | ❌ |
| BE-AUTH-02 | mutation/query senza bearer → `extensions.code === 'UNAUTHENTICATED'`; bearer valido → ok; `@Public` (`refreshSession`, `exchangeLoginTicket`) senza bearer → raggiunge il resolver; `GET /` 200; `state` usato come bearer → rifiutato | integration (supertest) | `npx jest --selectProjects integration --runInBand test/auth/http-guard` | ❌ |
| BE-AUTH-02/06 | `POST /cloudinary/getUrls` e `/uploadImage` senza token → 401 JSON; con token → service mock chiamato | integration | idem | ❌ |
| BE-AUTH-03 | WS: `connection_init` senza token / token invalido / scaduto → close **4403**; valido → `connection_ack` + `authProbe` restituisce l'identità; scadenza (TTL di test 2 s) → close **4401** `Token expired`; nessun timer pendente dopo close (`--detectOpenHandles` pulito) | integration (ws reale, porta effimera) | `npx jest --selectProjects integration --runInBand test/auth/ws-auth` | ❌ |
| BE-AUTH-03 | `installSubscriptionHandlers` rimosso; subprotocol legacy `graphql-ws` → 4406 | integration | idem | ❌ |
| BE-AUTH-04 | `BACKEND-NOTES.md` presente con le 10 sezioni elencate | manual + grep | `grep -c "connection_init\|SESSION_REVOKED\|4401\|4403\|PKCE" .planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md` | ❌ |
| BE-AUTH-05 | `validateEnv`: prod + dev → throw; `JWT_SECRET` mancante/corto → throw; `TWITCH_*` mancanti → ok + `twitchConfigured=false`; `DEV_AUTH_ENABLED='1'`/assente → disabilitato; ruolo non valido → throw | unit | `npx jest --selectProjects unit src/config` | ❌ |
| BE-AUTH-05 | `DevAuthStrategy`: token giusto → identità stub reale a DB con ruolo configurato; token di lunghezza diversa → null senza eccezioni; `NODE_ENV=production` a runtime → null | unit + integration | `npx jest src/auth/dev` | ❌ |
| BE-AUTH-05 | token dev accettato identico su HTTP GraphQL, REST, WS | integration | `test/auth/http-guard`, `test/auth/ws-auth` | ❌ |
| BE-AUTH-06 | `me` restituisce lo User dell'identità (HTTP e dev); `@CurrentUser` uniforme HTTP/WS (`authProbe`) | integration | `test/auth/*` | ❌ |

### Sampling Rate
- **Per task commit:** `npx jest --selectProjects unit src/auth src/config` (+ il singolo int-spec toccato)
- **Per wave merge:** `npm test`
- **Phase gate:** `npm run lint && npm test` verdi prima di `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Install: `npm install @nestjs/jwt@^11.0.2 graphql-ws@6.0.6 && npm install -D ws@^8.18.3 @types/ws@^8.18.2`
- [ ] `test/auth/auth-test-app.ts` — builder app di test (Mongo replSet, `ignoreEnvFile`, `AUTH_CONFIG` di test con access TTL configurabile, fake Twitch, Cloudinary mock, `listen(0)`, pulizia collection via `getConnectionToken()`)
- [ ] `test/auth/fake-twitch-oauth.client.ts` — fake configurabile (successo, client_id diverso, errore exchange, revoke che fallisce)
- [ ] `test/auth/ws-test-client.ts` — helper raw ws (close code) + factory `createClient` con `webSocketImpl`
- [ ] `test/auth/auth-probe.resolver.ts` — `@Subscription authProbe` + `@Query whoAmI` solo per test
- [ ] `test/fixtures/session.fixture.ts` — `buildSession`/`persistSession` (pattern two-tier Phase 1)
- [ ] `src/graphql/graphql-options.factory.ts` estratto **prima** dei test WS (serve al test per usare la config reale)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | OAuth code grant lato server, `client_secret` solo BE, binding S256 app↔BE, ticket monouso 60 s |
| V3 Session Management | yes | access JWT 15 min HS256 con `aud`/`iss`; refresh opaco 256 bit, hash SHA-256, rotazione + reuse detection, TTL sliding 30 gg, logout = revoca; chiusura WS a scadenza |
| V4 Access Control | parziale | guard globale deny-by-default + `@Public` enumerato; ownership/ruoli → Phase 3 |
| V5 Input Validation | yes | validazione `challenge`/`codeVerifier` (regex base64url, lunghezze RFC 7636), `state` firmato, `connectionParams` trattati come untrusted |
| V6 Cryptography | yes | `node:crypto` (`randomBytes`, `sha256`, `timingSafeEqual` su digest), `jsonwebtoken` via `@nestjs/jwt`; `JWT_SECRET` ≥ 32 char |
| V7 Error/Logging | yes | mai loggare token/code/ticket/verifier; warning boot per dev bypass e Twitch non configurato; niente stack negli errori auth |
| V14 Configuration | yes | fail-closed al boot (`validateEnv`), `.env` fuori VCS, `.env.example` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Custom-scheme hijacking del deep link | Spoofing | Ticket legato a S256 challenge, monouso, TTL 60 s |
| Login CSRF / state forgery | Spoofing/Tampering | `state` JWT firmato con audience dedicata, contiene il challenge |
| Refresh token rubato | Spoofing | Rotazione + reuse detection → revoca sessione |
| Token confusion (state usato come access) | Elevation | Audience distinte, verifica `aud` + `algorithms` |
| Dev bypass in produzione | Elevation | Boot fail-closed + check runtime `NODE_ENV` + flag booleano esplicito |
| Timing attack sul token dev | Info disclosure | `timingSafeEqual` su digest SHA-256 |
| Socket WS che sopravvive alla scadenza | Elevation | Timer per-socket → close 4401; re-check `expiresAt` al subscribe |
| Errori che rivelano dettagli interni via WS | Info disclosure | `return false` in `onConnect` (no 4500 con messaggio) |
| Upload anonimo su Cloudinary | DoS/Tampering | Guard globale su REST, test 401 |
| Open redirect via callback | Tampering | Destinazione del redirect solo da config (mai da query param) |

## Sources

### Primary (HIGH confidence)
- Codice installato in `node_modules` (letto 2026-10-06): `@nestjs/graphql@13.2.0` (`services/gql-subscription.service.js`, `services/resolvers-explorer.service.js`, `services/gql-execution-context.js`), `@nestjs/apollo@13.1.0` (`drivers/apollo.driver.js`, `drivers/apollo-base.driver.js`), `graphql-ws@6.0.6` (`dist/server-*.js`, `dist/use/ws.js`, `dist/client.js`, `dist/common-*.js`), `graphql@16.11.0` (`error/GraphQLError.js`), `@nestjs/core@11.1.6` (`exceptions/external-exception-filter.js`), `@nestjs/common` (`http.exception.js`), `@nestjs/bull` (`bull.explorer.js`)
- Client Dart `graphql@5.2.1` (`~/.pub-cache/.../websocket_client.dart`) — comportamento riconnessione e `initialPayload`
- npm registry (`npm view`, 2026-10-06): `@nestjs/jwt` 12.0.2 ESM-only / 11.0.2 CJS, `graphql-ws` 6.3.0, `ws` 8.22.0, `@types/ws` 8.18.2, `@nestjs/passport` 12.0.0, `passport-jwt` 4.0.1, `joi` 18.2.9, `zod` 4.6.5, `@nestjs/apollo`/`@nestjs/graphql` 14.0.3 (Nest 12), `@apollo/server` 5.5.1
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/ — parametri authorize/token, risposta di diniego
- https://dev.twitch.tv/docs/authentication/validate-tokens/ — request/response validate, obbligo orario
- https://dev.twitch.tv/docs/authentication/revoke-tokens/ — revoke
- https://docs.nestjs.com/graphql/subscriptions — pattern `onConnect`/`extra`, rimozione `subscriptions-transport-ws` in v14
- https://docs.nestjs.com/techniques/configuration — `validate` sincrono, fallimento del bootstrap, `ignoreEnvFile`

### Secondary (MEDIUM confidence)
- https://discuss.dev.twitch.com/t/i-need-to-use-a-http-redirect-for-an-appliction-oauth/29569 — "Only localhost is supported for http" (2020)
- https://discuss.dev.twitch.com/t/getting-a-user-token-inside-ios-app/43626 — custom scheme non accettato, workaround redirect via web (2023)
- https://discuss.dev.twitch.com/t/authorization-code-grant-flow-dynamic-port-in-redirect-uri/64355 — redirect URI statici, porta fissa (ott-2025)
- https://discuss.dev.twitch.com/t/scope-for-just-username/7622 — token senza scope
- https://github.com/nestjs/graphql/issues/1756 — `connection` undefined con graphql-ws (chiusa)
- https://docs.nestjs.com/techniques/configuration

### Tertiary (LOW confidence)
- https://discuss.dev.twitch.com/t/will-twitch-api-support-custom-redirect-uris/31871 — richiesta 2021 senza risposta staff

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versioni e formato modulo verificati su npm e in `node_modules`
- Architecture (WS/guard/context): HIGH — derivata dal codice sorgente installato; MEDIUM solo su `formatError`+`AuthException` finché non c'è il test
- Twitch contract: HIGH per endpoint (doc ufficiale), MEDIUM per regole redirect URI e scope vuoto (forum)
- Pitfalls: HIGH per quelli verificati nel codice (onConnect throw, installSubscriptionHandlers, cleanup DB, ESM jwt), MEDIUM per race Mongo

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (stack stabile pinnato; ricontrollare le regole console Twitch all'arrivo delle chiavi)
