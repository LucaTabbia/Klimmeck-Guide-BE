# Phase 2: Auth & Identity Foundation - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning
**Mode:** `--auto` (decisioni raccomandate auto-selezionate; direttiva utente sul bypass riportata in D-16)

<domain>
## Phase Boundary

Il backend acquisisce un **seam di autenticazione a JWT di sessione proprio** che protegge ogni operazione GraphQL (HTTP + WS) e REST: login tramite Twitch OAuth mediato dal BE, sessione con access JWT a TTL breve + refresh token rotante, guard globale `APP_GUARD` con whitelist `@Public()`, identità disponibile ai resolver via `@CurrentUser()`, **dev bypass fail-closed** compatibile con lo stub FE, e handoff `BACKEND-NOTES.md` per il FE.

Requirements: BE-AUTH-01, BE-AUTH-02, BE-AUTH-03, BE-AUTH-04, BE-AUTH-05, BE-AUTH-06.

**Vincolo operativo dichiarato dall'utente (2026-10-06):** le chiavi Twitch (`client_id` / `client_secret`) **non sono ancora disponibili**. Il login Twitch va implementato ora, ma l'intero sistema deve restare utilizzabile tramite bypass finché le chiavi non arrivano (vedi D-16..D-21).

**Fuori dal boundary:** ownership sulle mutation, role guard `@Roles(innkeeper)`, filtro delle subscription per identità, audit log admin (Phase 3); rate limiting / CORS / introspection off (Phase 10); EventSub e app access token Twitch (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Flusso OAuth Twitch (BE-AUTH-01)

> **Fatto verificato il 2026-10-06 su `dev.twitch.tv/docs/authentication/getting-tokens-oauth/`:** Twitch **non supporta PKCE** e l'authorization code grant **richiede `client_secret`** nel POST a `/oauth2/token`. I "public client" possono usare solo il Device Code Flow. I plan FE Phase 11 di aprile (PKCE + scambio token dall'app) poggiano quindi su una premessa errata. Thread storici del forum Twitch indicano inoltre che i redirect URI con custom scheme (`klimmeck://`) non sono accettati (solo `https` o `http://localhost`) — **da confermare in research**.

- **D-01:** Il flusso è **Authorization Code mediato dal BE**. Il FE non vede mai né il `client_secret` né i token Twitch. Questo emenda la formulazione di BE-AUTH-01 ("`twitchAccessToken → JWT`"): l'intento resta identico (una prova d'identità Twitch scambiata **una tantum** per una sessione BE, zero chiamate Twitch per-request), cambia solo chi esegue lo scambio.
- **D-02:** Due endpoint REST `@Public()`:
  - `GET /auth/twitch/start?challenge=<S256>` → 302 verso `https://id.twitch.tv/oauth2/authorize` con `response_type=code`, `client_id`, `redirect_uri` = callback BE, **scope vuoto** (serve solo l'identità), `force_verify=true` (garantisce l'account switch pulito richiesto dal FE, D-16 FE), `state` firmato dal BE che incapsula il `challenge`.
  - `GET /auth/twitch/callback?code&state` → verifica `state`, scambia il `code` (con `client_secret`), chiama `/oauth2/validate`, risolve/crea lo User, emette un **login ticket monouso a TTL breve (≤ 60s)** e fa 302 verso il deep link dell'app `klimmeck://auth?ticket=<ticket>`. Errori/annullamento utente → 302 `klimmeck://auth?error=<codice>` (mai una pagina d'errore morta nel browser di sistema).
- **D-03:** La tratta app↔BE è protetta con un **binding stile PKCE (S256)**: il FE genera `code_verifier`/`code_challenge`, passa il challenge a `/auth/twitch/start`, e il ticket è riscattabile solo presentando il verifier. Un deep link intercettato da un'app ostile (custom-scheme hijacking) è così inutilizzabile. Mutation `@Public()` `exchangeLoginTicket(ticket, codeVerifier)` → `AuthSession`.
- **D-04:** Identità = campo `user_id` di `/oauth2/validate` (→ `User.twitchId`). Il BE verifica che il `client_id` restituito da validate coincida con il proprio. Resolve-or-create dello User per `twitchId` (upsert atomico, indice unico su `twitchId`); un nuovo User nasce con `role: adventurer`, `twitchPoints: 0`, `currentCharacter: null`. Il ruolo `innkeeper` resta un'assegnazione manuale a DB (single channel: un solo innkeeper).
- **D-05:** I token Twitch **non vengono persistiti**: letti per risolvere l'identità, poi scartati (revoke best-effort con timeout breve; un fallimento del revoke non blocca il login).
- **D-06:** **Twitch non configurato** (manca uno tra `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`): l'app **si avvia normalmente** con un warning al boot; `/auth/twitch/start` risponde con 302 `klimmeck://auth?error=twitch_not_configured`. Nessun crash, nessuna dipendenza dalle chiavi per build, test o avvio.

### Sessione: access JWT + refresh token (BE-AUTH-01, BE-AUTH-04)

- **D-07:** Access token = **JWT firmato** con secret da env (`JWT_SECRET`, obbligatorio al boot, lunghezza minima validata), **TTL 15 minuti**, claims `{ sub: userId, twitchId, role, sid: sessionId }`.
- **D-08:** Refresh token **opaco** (random 256 bit), persistito **solo come hash SHA-256** in una collection `sessions` (una sessione per device; multi-device consentito). **Rotazione a ogni refresh** con reuse detection (riuso di un token già ruotato → revoca dell'intera sessione). Scadenza sliding **30 giorni** con TTL index Mongo.
- **D-09:** Mutation `@Public()` `refreshSession(refreshToken)` → nuova coppia access+refresh. Mutation autenticata `logout` → invalida la sessione corrente (`sid`). La strategia di refresh era stata deferita dalla research di milestone "da rivedere con l'handoff FE Phase 11": quel momento è adesso, perché FE Phase 11 (refresh silente, AUTH-06 FE) non può atterrare senza.
- **D-10:** `role` nel JWT è uno snapshot: un cambio ruolo a DB diventa effettivo al refresh successivo (staleness massima = TTL access token). Accettato.
- **D-11:** Errori tipizzati su `extensions.code` GraphQL, stabili e documentati nell'handoff: `UNAUTHENTICATED` (token assente/invalido/scaduto), `SESSION_EXPIRED`, `SESSION_REVOKED` (refresh rifiutato → il FE torna al sign-in), `LOGIN_TICKET_INVALID`. Su REST: HTTP 401 con body JSON coerente.

### Guard globale e seam d'identità (BE-AUTH-02, BE-AUTH-03, BE-AUTH-06)

- **D-12:** **Un solo punto di risoluzione dell'identità** (bearer → identità), riusato da guard HTTP (GraphQL + REST) e da `onConnect` WS. Guard globale `APP_GUARD` transport-aware. Whitelist `@Public()` **esplicita ed enumerata**: `exchangeLoginTicket`, `refreshSession`, `GET /auth/twitch/start`, `GET /auth/twitch/callback`, health `GET /`. Tutto il resto — incluso il controller REST Cloudinary — richiede un'identità valida.
- **D-13:** Decorator `@CurrentUser()` → `{ userId, twitchId, role, sessionId? }` uniforme su HTTP e WS. Nuova query `me: User` come primo consumer reale (serve al FE per riallineare l'utente al bootstrap).
- **D-14:** WS: il JWT viaggia nel payload di `connection_init` come `{ "Authorization": "Bearer <jwt>" }` (il FE Phase 1 lo invia già con questa chiave). Assente/invalido → connessione rifiutata in `onConnect`. **Scadenza enforced sul socket**: il server chiude la connessione quando il JWT scade, così il FE riconnette in silenzio con un token fresco (chiude Pitfall 1 della research). Codice di chiusura esatto e meccanismo (timer per-socket vs sweep) a discrezione di research/planner.
- **D-15:** Phase 2 è **solo autenticazione**: i resolver esistenti non vengono riscritti per l'ownership (Phase 3). L'unica modifica ai resolver esistenti è che ora richiedono un'identità valida.

### Dev bypass fail-closed (BE-AUTH-05)

- **D-16:** **Direttiva utente (2026-10-06):** *"per la login su Twitch, di cui non abbiamo ancora le chiavi, per adesso inizia l'implementazione ma permetti di bypassare il tutto finché non si ha tutto il necessario."* Il bypass è quindi un cittadino di prima classe finché le chiavi non arrivano, non un ripiego nascosto.
- **D-17:** Attivazione: flag **booleano esplicito** `DEV_AUTH_ENABLED=true` **e** `NODE_ENV !== 'production'`. "Variabile presente" non significa mai "abilitato". Con `NODE_ENV=production` e flag attivo l'app **rifiuta di avviarsi** (fail-closed al boot, errore esplicito); in più il resolver d'identità ignora comunque il token dev in produzione (defense in depth).
- **D-18:** Variabili con **gli stessi nomi dello stub FE**: `DEV_AUTH_ACCESS_TOKEN`, `DEV_AUTH_TWITCH_ID`, `DEV_AUTH_ROLE`. Un bearer uguale a `DEV_AUTH_ACCESS_TOKEN` (confronto timing-safe) risolve all'identità stub. Lo User stub è **reale a DB**: risolto/creato per `DEV_AUTH_TWITCH_ID` con `role = DEV_AUTH_ROLE`, così `me` e tutti i resolver lavorano su un documento vero. Il BE non richiede `DEV_AUTH_USER_ID`: il FE riallinea l'id via `me`.
- **D-19:** Il bypass vale in modo identico su GraphQL HTTP, REST e WS `connection_init`.
- **D-20:** Strategia unica, iniettabile e greppabile (prefisso `DevAuth`), rimovibile prima della GA; warning rumoroso a ogni boot quando attiva.
- **D-21:** L'intera suite di test usa un **client Twitch finto/iniettabile**: nessuna chiave reale è richiesta per `npm test` o per la CI.

### Rollout e handoff (BE-AUTH-04)

- **D-22:** Ordine di atterraggio nei plan: prima seam d'identità + dev bypass, **poi** il guard globale (il bypass è la rampa di migrazione — Pitfall 5).
- **D-23:** Creare `.env.example` con tutte le variabili nuove (`JWT_SECRET`, `TWITCH_*`, `DEV_AUTH_*`, `APP_DEEP_LINK_SCHEME`…), senza valori reali. `.env` resta fuori dal VCS.
- **D-24:** `BACKEND-NOTES.md` nella phase directory documenta: flusso login completo, shape di `AuthSession`, header HTTP, payload `connection_init`, comportamento a scadenza/refresh, codici d'errore, variabili dev bypass, scope Twitch (nessuno) e redirect URI da registrare nella console Twitch. Chiude le Open Questions #1 e #2 di FE Phase 11 e **segnala esplicitamente che i plan FE Phase 11 basati su PKCE lato app vanno ripianificati**.
- **D-25:** Aggiornare con nota datata il testo di BE-AUTH-01 in `REQUIREMENTS.md` e il success criterion 1 della Phase 2 in `ROADMAP.md` per riflettere D-01 (fatto in questa sessione di discuss).

### Affinamenti post-research (2026-10-06, auto-accettati — vedi 02-RESEARCH.md)

- **D-26 (affina D-08):** reuse detection con **finestra di grazia di 30 secondi**: il refresh token immediatamente precedente può ancora ruotare entro 30s dalla rotazione (copre la risposta persa su rete mobile); fuori dalla finestra il suo riuso revoca l'intera sessione. Scelta raccomandata dalla research (Assumption A3), **da far confermare all'utente** a fine fase: tornare alla variante stretta significa rimuovere un solo ramo.
- **D-27 (affina D-09):** dopo `logout` l'access JWT già emesso resta tecnicamente valido fino alla scadenza (≤ 15 min): accettato e documentato nell'handoff (il FE lo scarta subito). Nessun check `sid` per-request in questa fase.
- **D-28 (chiude la discrezione di D-14):** close code WS **4403** quando la connessione è rifiutata in `onConnect` (si ritorna `false`, **mai `throw`**: il throw chiuderebbe con 4500 esponendo il messaggio d'errore), **4401** con reason `Token expired` quando il JWT scade su un socket vivo (timer per-socket, ripulito in `onClose`).
- **D-29 (affina D-23):** una sola variabile per la destinazione del redirect finale: `APP_AUTH_REDIRECT_URL` (default `klimmeck://auth`), validata al boot come **non** `http(s)` per evitare open redirect da configurazione. Sostituisce `APP_DEEP_LINK_SCHEME`.
- **D-30 (affina D-12):** introspection e landing page Apollo non passano dai guard Nest: restano pubbliche fino a Phase 10. Va scritto nell'handoff come limite noto, non corretto qui.
- **D-31:** `@nestjs/jwt` va fissato a `^11.0.2` (la 12.x è ESM-only e rompe ts-jest in CJS). `graphql-ws` diventa dipendenza dichiarata; `ws` e `@types/ws` devDependencies per i test WS reali.
- **D-32:** l'indice unico su `User.twitchId` può fallire su dati esistenti con duplicati: il plan deve prevedere una verifica dei duplicati documentata nell'handoff/deploy note.
- **D-33:** `installSubscriptionHandlers: true` va rimosso (già ignorato quando `subscriptions` è impostato, rimosso in `@nestjs/graphql` v14). `GraphQLModule` passa a `forRootAsync` con una options factory condivisa tra `AppModule` e i test.
- **D-34:** shape di sessione: `AuthSession { accessToken, accessTokenExpiresAt, refreshToken, user }`.

### Decisione utente su D-26 (2026-10-06) — opzione A: grazia con ri-emissione idempotente

- **D-35 (sostituisce la meccanica di D-26, scelta dall'utente tra tre opzioni):** dentro la finestra di grazia di 30 secondi il refresh token immediatamente precedente **non ruota più una seconda volta**: il BE risponde con **lo stesso refresh token corrente** (più un access JWT appena firmato) e non scrive nulla sulla sessione. Così non può più esistere un token "orfano": due richieste con lo stesso token — retry dopo una risposta persa, richieste concorrenti, richiesta bloccata e poi consegnata in ritardo — convergono tutte sullo stesso token corrente, in qualunque ordine arrivino.
  - Per poter ri-emettere un token di cui a DB esiste solo l'hash, il refresh token diventa **derivato in modo deterministico**: `base64url(HMAC-SHA256(chiave, sessionId ":" rotationCount ":" tokenSeed))`, dove `chiave` è derivata da `JWT_SECRET` con HKDF-SHA256 e un'etichetta dedicata (separazione di dominio dall'uso come secret dei JWT), `tokenSeed` è un valore casuale per sessione salvato a DB e `rotationCount` un contatore sulla sessione. Per ricostruire un token servono **sia** la chiave (env) **sia** il seed (DB): un leak del solo DB o della sola chiave non basta. A DB continua a esserci solo l'hash SHA-256 del token; il token resta opaco per il client (nessun cambio di contratto, nessuna modifica al FE).
  - Resta invariato tutto il resto: rotazione a ogni refresh con il token corrente; il token precedente fuori dalla finestra e qualunque token ritirato (ultimi 10) revocano l'intera sessione con `SESSION_REVOKED`; token sconosciuto → `SESSION_EXPIRED`; finestra valutata all'arrivo della richiesta; scadenza sliding 30 giorni (la ri-emissione non la sposta).
  - Se il token corrente non è ricostruibile (sessione creata prima di questa modifica, oppure `JWT_SECRET` cambiato tra la rotazione e il retry) la ri-emissione non è possibile: risposta `SESSION_EXPIRED` senza revocare (fail-closed).
  - Chiude il rilievo WR-05 della seconda code review e la voce 4 di `02-HUMAN-UAT.md`. Implementato dal plan di gap-closure `02-10`.

### Claude's Discretion

- Libreria JWT: `@nestjs/jwt` con guard custom **oppure** `@nestjs/passport` + `passport-jwt`. Lean: guard custom su `@nestjs/jwt`, dato che il path WS e il dev bypass scavalcano comunque Passport e un solo resolver d'identità serve entrambi i trasporti.
- Rappresentazione di `state` e login ticket: stateless firmati (JWT con `jti` monouso) vs documenti Mongo con TTL — purché il ticket sia realmente **monouso** e legato al challenge.
- Naming e layout del modulo (`src/auth/…`), shape esatta dei DTO GraphQL, nome della collection sessioni.
- Sorte di `test/app.e2e-spec.ts` (scaffold fuori CI che importa `AppModule`): adattarlo o rimuoverlo.
- Rimozione/riuso del file vuoto `src/rest/auth.controller.ts` (Boy Scout Rule).
- Validazione della config al boot (schema Joi/zod vs validazione manuale minimale).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Progetto BE
- `.planning/PROJECT.md` — vincoli (rate limit Twitch → JWT di sessione), Key Decisions, Workflow Conventions (branch + PR verso `develop`).
- `.planning/REQUIREMENTS.md` §Authentication (BE-AUTH-01..06) — criteri di accettazione; BE-AUTH-01 emendato da D-01.
- `.planning/ROADMAP.md` §"Phase 2: Auth & Identity Foundation" — goal, success criteria, research flag.
- `.planning/STATE.md` — decisioni accumulate (harness test Phase 1).
- `CLAUDE.md` — stack, convenzioni di naming e stile (4 spazi, single quote).

### Research di milestone
- `.planning/research/SUMMARY.md` — pattern auth "un seam, due forme" (HTTP `req.user` / WS `ctx.extra.user`).
- `.planning/research/STACK.md` §auth — `@nestjs/jwt`, alternativa senza Passport, note WS `onConnect`, dev bypass.
- `.planning/research/PITFALLS.md` Pitfall 1–6 — expiry su WS long-lived, guard che non girano sulle subscription, bypass che trapela in prod, retrofit big-bang, REST Cloudinary scoperto.
- `.planning/research/ARCHITECTURE.md` — collocazione del modulo auth.

### Codebase map
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md`, `.planning/codebase/CONCERNS.md`.

### Phase 1 (harness test da riusare)
- `.planning/phases/01-fondazione-test-consolidamento-spell-wip/01-CONTEXT.md` e `01-VERIFICATION.md` — MongoMemoryReplSet condiviso, split Jest unit/integration, fixture `buildX`/`persistX`.

### Contratto lato FE (repo separato, sola lettura)
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/repository/services/auth/auth_token_service.dart` — contratto `AuthTokenService` che il FE deve poter soddisfare con questo BE.
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/repository/services/auth/dev_auth_token_service.dart` e `.env.example` — nomi delle variabili `DEV_AUTH_*` dello stub FE.
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/repository/services/graphql/graphql_client_provider.dart` — il FE invia già `Authorization: Bearer <token>` su HTTP e in `connection_init`.
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/11-auth-session-bootstrap/11-CONTEXT.md` e `11-RESEARCH.md` §Open Questions — requisiti FE (refresh silente, logout, account switch, revoca) da abilitare.

### Twitch (esterni)
- `https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/` — grant flow supportati (no PKCE, secret obbligatorio).
- `https://dev.twitch.tv/docs/authentication/validate-tokens/` — shape di `/oauth2/validate`.
- `https://dev.twitch.tv/docs/authentication/revoke-tokens/` — revoke.
- `https://dev.twitch.tv/docs/authentication/register-app/` — registrazione app e redirect URL.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/models/user.model.ts` — `User { twitchId, twitchPoints, role, currentCharacter }` e `RoleType { guard, adventurer, innkeeper }`: già sufficienti per i claims; manca solo l'indice unico su `twitchId`.
- `src/users/users.service.ts` — CRUD esistente; il resolve-or-create per `twitchId` va aggiunto qui (o in un service auth dedicato) come upsert atomico.
- `test/setup/*`, `test/fixtures/*` (Phase 1) — MongoMemoryReplSet condiviso, `buildUser`/`persistUser` riusabili per i test auth.
- `ConfigModule.forRoot({ isGlobal: true })` in `src/app.module.ts` — `ConfigService` già disponibile ovunque per le nuove env.

### Established Patterns
- Moduli feature `{feature}.module.ts` + `{feature}.service.ts` + `{feature}.resolver.ts`; GraphQL code-first con `autoSchemaFile` (`src/schema.gql` rigenerato).
- PubSub globale (`PUB_SUB`, graphql-yoga) per le subscription; unica subscription esistente: `characterUpdated(id)` in `src/characters/characters.resolver.ts`.
- Test: unit `*.spec.ts`, integration `*.int-spec.ts` (Jest projects), TDD Red → Green → Refactor obbligatorio.

### Integration Points
- `src/app.module.ts` → `GraphQLModule.forRoot`: `subscriptions: { "graphql-ws": true }` senza `onConnect` e senza `context` è **l'esatto punto d'innesto** dell'auth WS; `installSubscriptionHandlers: true` (legacy `subscriptions-transport-ws`) va valutato/rimosso perché aprirebbe un secondo canale non autenticato.
- `src/app.module.ts` → `providers`: registrazione `APP_GUARD`.
- `src/rest/cloudinary/cloudinary.controller.ts` — REST oggi totalmente aperto; deve risultare coperto dal guard.
- `src/rest/auth.controller.ts` — file **vuoto** (CONCERNS #11): candidato naturale per `/auth/twitch/*` oppure da rimuovere a favore di `src/auth/`.
- `src/app.controller.ts` → `GET /` — health da marcare `@Public()`.
- `src/main.ts` — bootstrap minimale; eventuale validazione config fail-closed al boot.

</code_context>

<specifics>
## Specific Ideas

- Deep link dell'app: `klimmeck://auth` (già scelto nei plan FE); query `ticket=` in caso di successo, `error=` in caso di fallimento/annullamento.
- Il FE invia già `Authorization: Bearer <token>` sia come header HTTP sia nel payload di `connection_init`: il contratto BE deve combaciare senza richiedere modifiche al wiring FE di Phase 1.
- Nomi delle variabili dev identici tra FE e BE (`DEV_AUTH_ENABLED`, `DEV_AUTH_ACCESS_TOKEN`, `DEV_AUTH_TWITCH_ID`, `DEV_AUTH_ROLE`) per ridurre a zero l'attrito di configurazione.
- Per il test del login reale in locale (quando arriveranno le chiavi): `TWITCH_REDIRECT_URI` configurabile; `http://localhost:<port>/auth/twitch/callback` è il candidato per simulatore/emulatore (da confermare in research).

</specifics>

<deferred>
## Deferred Ideas

- **Rilevazione della revoca lato Twitch** (validate orario con token Twitch persistiti e cifrati at-rest) → Phase 10 (Hardening). Il contratto FE è già stabile: un refresh rifiutato con `SESSION_REVOKED` riporta al sign-in; la meccanica BE potrà atterrare dopo senza toccare il FE. Non verificabile senza chiavi reali.
- **Ownership, role guard, filtro subscription per identità, audit log** → Phase 3.
- **Rate limiting sugli endpoint pubblici di auth, CORS, introspection off** → Phase 10.
- **App Links / Universal Links** come destinazione del redirect al posto del custom scheme → hardening (il binding S256 di D-03 copre già l'intercettazione del deep link).
- **Gestione multi-sessione lato utente** ("esci da tutti i dispositivi", elenco sessioni) → backlog.
- **Assegnazione automatica del ruolo innkeeper** via configurazione → backlog (oggi manuale a DB).

</deferred>

---

*Phase: 02-auth-identity-foundation*
*Context gathered: 2026-10-06*
