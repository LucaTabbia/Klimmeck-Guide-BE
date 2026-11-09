# Phase 17: Autorizzazione e sessioni - Context

**Gathered:** 2026-11-09 (discuss congiunto con la FE Phase 12 Hardening, condotto dal repo FE; fase inserita lo stesso giorno come companion BE; branch `feat/17-autorizzazione-e-sessioni` da `develop` `31dba96`, la merge della PR #26 dei quick task 261109-inj/inj2)
**Amended:** 2026-11-09 dopo la ricerca (`17-RESEARCH.md`, C-1..C-7, Open Questions 1–9, Pitfall 1–10): D-01, D-03, D-06 rivisti; D-11..D-16 aggiunti. Questo CONTEXT prevale sulla RESEARCH dove differiscono.
**Status:** Ready for planning — fase di regole server-side e di prova: i nomi del contratto (enum del motivo di revoca, close code WS della sessione revocata) sono default tecnici da fissare in `17-REPO-RULES.md` prima della ricerca (pattern 15/16-REPO-RULES); nessun one-off né migrazione (il campo nuovo sulla `Session` è additivo e nullable). La FE Phase 12 consuma il contratto nei suoi piani gated dalla merge di questa fase.

<domain>
## Phase Boundary

Il server prova la propria autorizzazione e governa le sessioni per device. (1) **Matrice di autorizzazione table-driven**: un solo int-spec itera le liste già enumerate dal boot reale (`EXPECTED_INNKEEPER_HANDLERS`, 11 handler; `EXPECTED_OWNERSHIP_HANDLERS`, 19 handler) e prova per ogni handler innkeeper `FORBIDDEN` con un JWT `adventurer` e uno `guard` e `UNAUTHENTICATED` senza bearer o con bearer invalido, e per ogni handler owner-only `FORBIDDEN` sul personaggio altrui — la prova richiesta dal requisito FE HARDEN-02. (2) **«L'ultimo login caccia l'altro»**: il login revoca le altre sessioni attive dell'utente e chiude subito le loro connessioni WS con un close code dedicato; l'access JWT residuo resta valido fino alla scadenza naturale (900 s), nessuna lookup per richiesta. (3) **Motivo della revoca sul filo**: il rifiuto del refresh resta `SESSION_REVOKED` e porta `extensions.reason` (enum), la stessa stringa viaggia nella reason del close WS. (4) **Cambio di ruolo → revoca delle sessioni** dell'utente (motivo dedicato), così un JWT col ruolo stantio (T-10-19 della FE Phase 10) non sopravvive oltre la finestra del token. (5) Logout invariato (chiude solo la sessione corrente). (6) Handoff per la FE Phase 12.

Fuori scope: «esci da tutti i dispositivi» (resta a backlog, superato dalla regola dell'ultimo login), verifica della sessione a ogni richiesta HTTP (il JWT resta stateless), nuove mutation admin per i ruoli, classificazione di tutto lo SDL in pubblico/owner/innkeeper, cambiamenti al dev bypass del BE (`DEV_AUTH_*`, già fail-closed in produzione), CI della FE.

</domain>

<decisions>
## Implementation Decisions

### Matrice di autorizzazione (BE-SESSION-01 → FE HARDEN-02)
- **D-01 (utente, «Innkeeper + ownership, table-driven»):** un int-spec dedicato (progetto `integration`, harness `createAuthTestApp`/`createCharactersTestApp`) **alimentato dalle stesse due liste** di `test/app.int-spec.ts` (estratte in un modulo di test condiviso, così le liste non divergono): per ogni handler innkeeper → `FORBIDDEN` con JWT `adventurer` e con JWT `guard`, `UNAUTHENTICATED` senza bearer e con bearer invalido; per ogni handler owner-only → `FORBIDDEN` su un personaggio di un altro utente (l'innkeeper resta esente e auditato, Phase 3 D-09); le **subscription** della lista (`pendingRequestsUpdated`, `characterUpdated`, `questResultReceived`) passano dall'harness WS esistente (`FORBIDDEN` alla subscribe). Ogni riga della matrice porta gli argomenti minimi validi dell'handler (fixture per handler, tabella in codice): un handler nuovo nelle liste senza riga di fixture **fa fallire la spec** (completezza imposta dal tipo o da un'asserzione sulle chiavi). La spec del boot reale continua a garantire che le liste coincidano coi metadati `@Roles`/ownership. **Rivisto dopo la ricerca (C-1, C-2, OQ6, OQ7, OQ8):** la matrice gira sul **boot reale di `AppModule`** (`listen(0)`, ~2 s) tramite un helper condiviso `test/harness/real-app-boot.ts` estratto da `test/app.int-spec.ts` — gli harness `createAuthTestApp`/`createCharactersTestApp` non montano i 30 handler (code Bull); gli attaccanti usano **sessioni vere** emesse con `issueForUser`; le vittime sono un personaggio attivo, una `PendingQuest` e un `QuestResult` veri (altrimenti l\'ownership risponde `NOT_FOUND`, Pitfall 9); la matrice include anche le **8 righe innkeeper × owner-only** che pinnano l\'esenzione auditata (Phase 3 D-09); le **tre** liste (`EXPECTED_INNKEEPER_HANDLERS`, `EXPECTED_OWNERSHIP_HANDLERS`, `EXPECTED_OWNER_ONLY_HANDLERS`) si spostano in `test/authz/expected-handlers.ts`; per l\'unica subscription innkeeper (`pendingRequestsUpdated`) un bearer assente o invalido non produce `UNAUTHENTICATED` ma la chiusura `4403 \'Forbidden\'` alla `connection_init`: si pinna com\'è; le asserzioni sono `toEqual({ code: \'FORBIDDEN\' })`, mai `not.toBeUndefined()` (Pitfall 10).

### Sessioni per device (BE-SESSION-02 → FE HARDEN-06)
- **D-02 (utente, «L'ultimo login caccia l'altro»):** il login (scambio del ticket, `AuthResolver` mutation che emette la `AuthSession`) **revoca tutte le altre sessioni attive dell'utente** (`revokedAt` + motivo `newLogin`) nello stesso passo in cui crea la nuova sessione; la sessione appena creata non è mai toccata; idempotente (una sessione già revocata resta com'è). Il dev bypass non ha sessioni: nessun effetto.
- **D-03 (utente, «WS chiuso subito, JWT fino a scadenza»):** le connessioni WS autenticate con una sessione revocata vengono **chiuse subito** con un **close code dedicato** (default tecnico `4409`, nome in `17-REPO-RULES.md`) e reason = la stringa del motivo (D-05). Serve un registro dei socket vivi per `sessionId` (l'`identity.sessionId` è già su `extra` in `WsConnectionAuthenticator`) o un canale di eventi fra `SessionService` e il layer WS: **a discrezione della ricerca**, single-node (nessun bus esterno). Una nuova `connection_init` con un JWT della sessione revocata viene rifiutata (`4403`) finché il JWT vive? **No**: il JWT è stateless (D-04) — la connessione rientra e verrà chiusa di nuovo solo se la sessione è ancora revocata al momento della verifica; per evitare il ping-pong il `WsConnectionAuthenticator` **verifica lo stato della sessione alla `connection_init`** (una lettura per connessione, non per richiesta) e rifiuta con il close code dedicato se revocata. Questa è l'unica lookup ammessa. **Rivisto dopo la ricerca (F-3, F-7, C-5, OQ1, OQ2, OQ3, Pitfall 1):** la chiusura dall\'esterno è `extra.socket.close(4409, reason)` dal registro `WsSessionRegistry` (`Map<sessionId, Set<socket>>`, probe P2: arriva in ~1 ms anche con due socket sulla stessa sessione); in `onConnect` l\'ordine è **bearer risolto → controllo di `extra.closed` → registrazione del socket → lettura della sessione**: se revocata, `socket.close(4409, reason)` e poi `return false` (il 4403 di graphql-ws diventa un no-op); il registro si svuota in **`onClose`** (l\'unico hook cablato in `graphql-options.factory.ts`; `onDisconnect` non scatta per le connessioni rifiutate); una sessione **assente** a DB (documento cancellato, TTL, JWT di test) **non chiude**: chiude solo `revokedAt != null`; una sessione revocata **senza motivo** (legacy, utente cancellato) chiude con `4409` e reason `\'\'` (la FE ricade sul messaggio neutro); **`userLogout` e `reuseDetected` non chiudono i socket vivi** (al logout la FE smonta da sé il WS, un 4409 durante il teardown innescherebbe un refresh inutile; sul riuso resta comunque la finestra del JWT): le `connection_init` successive sono rifiutate con `4409` in ogni caso. Da scrivere nel handoff §1.
- **D-04 (utente):** l'**access JWT resta stateless**: le richieste HTTP col token residuo passano fino alla scadenza (`ACCESS_TOKEN_TTL_SECONDS` = 900); nessuna verifica della sessione nel guard HTTP; documentato nel handoff come finestra accettata.
- **D-07 (utente, «Solo quel device»):** `logout` invariato: revoca la sola sessione corrente, motivo `userLogout`.

### Motivo della revoca sul filo (BE-SESSION-03 → FE D-12)
- **D-05 (utente, «SESSION_REVOKED + reason»):** il rifiuto del refresh conserva il codice `SESSION_REVOKED` e aggiunge **`extensions.reason`** con un enum nuovo (default tecnico `SessionRevokeReason`: `newLogin`, `roleChanged`, `reuseDetected`, `userLogout`; nomi fissati in `17-REPO-RULES.md`); la reuse detection della Phase 2 D-08 scrive `reuseDetected`; `SESSION_EXPIRED` resta senza reason. La stessa stringa è la reason del close WS dedicato (D-03). La FE legge in modo tollerante (ignoto → messaggio neutro).
- **D-08 (tecnico):** `Session` guadagna il campo **additivo e nullable `revokeReason`** (enum sopra), scritto insieme a `revokedAt`; nessuna migrazione (le sessioni già revocate restano senza motivo); nessuna riga SDL (il motivo viaggia nelle `extensions`, non nello schema): il boot reale dichiara **SDL invariato**.

### Cambio di ruolo (BE-SESSION-04 → T-10-19)
- **D-06 (utente, «Cambio ruolo revoca le sessioni»):** quando il `role` di un utente cambia a DB, il BE **revoca tutte le sessioni di quell'utente** con motivo `roleChanged`: trigger dal **change stream della collection `users`** filtrato su `updateDescription.updatedFields.role` (pattern `ChangeStreamPublisher` con backoff, come i publisher esistenti) **più** il percorso di servizio (`UsersService.upsertWithRole` quando cambia il ruolo di un utente esistente), idempotente; il ruolo si cambia a mano a DB (nessuna mutation admin oggi e nessuna nuova). Il guard dei ruoli continua a leggere `identity.role` dal claim. **Rivisto dopo la ricerca (F-4, C-3, C-4, OQ9, Pitfall 2, 3):** il watcher `UserRoleChangesPublisher` vive in **`src/auth/session/user-role-changes.publisher.ts`** come provider di `AuthModule` (che già importa `UsersModule`; `MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])`): un provider in `UsersModule` che inietti `SessionRevocationService` creerebbe un ciclo; pipeline `$match` su `operationType: update` + `updateDescription.updatedFields.role` (probe P4: emette solo quando il valore cambia; lo stesso valore, anche via `upsertWithRole`, insert, replace o unset non emettono), modello `ArchivedCharacterQueueRefresher` (legge `documentKey`, senza `updateLookup`); **nessuna chiamata esplicita in `UsersService.upsertWithRole`** (stesso ciclo; unico chiamante `DevAuthStrategy`): il percorso di servizio è coperto dal change stream e **provato da una int-spec** (utente esistente con sessione, `upsertWithRole` con un ruolo diverso → `roleChanged`; stesso ruolo → sessione intatta); il priming del watcher nei test usa un utente sentinella con sessione (poll su `sessions`).

### Gate, boot reale, handoff (BE-SESSION-05)
- **D-09:** handoff `BACKEND-NOTES.md` per la FE Phase 12: close code e reason, enum dei motivi, finestra del JWT, matrice (handler × ruolo) come evidenza di HARDEN-02, note per la UAT dual-device (login reale su telefono + emulatore: il secondo login caccia il primo; il dev bypass non partecipa) e per la UAT della release FE via tunnel TLS (il BE non cambia: CORS chiuso non riguarda l'app; la redirect URI Twitch del tunnel è a carico dell'utente).
- **D-10 (default tecnico, come le fasi precedenti):** TDD; gate `tsc --noEmit`, `test:cov` con soglie per cartella (`auth` è già area critica), lint solo sui file toccati; boot reale con `git diff --exit-code src/schema.gql` vuoto e whitelist del boot invariata (nessun handler nuovo); PR a `develop` con il handoff, `requirements mark-complete` solo nel piano di chiusura.

### Aggiunte dopo la ricerca (2026-11-09)
- **D-11 (C-6, F-9):** `SessionService.revoke(sessionId, reason: SessionRevokeReason | null)` con il secondo parametro **obbligatorio ma nullable**: il refresh di un utente cancellato (`auth-session.service.ts:53`) passa `null` e il rifiuto resta `sessionRevoked()` senza `reason`; i chiamanti esistenti (`session.service.int-spec.ts:157,165,170,575,590,652`) passano il motivo (RED da `tsc`); l'enum resta chiuso a quattro valori. `revokeReasonOf`/`rejectRefresh` normalizzano con `?? null` (i documenti legacy hanno `undefined`, Pitfall 4); il tipo `SessionRevokeReason` nei parametri è l'unica barriera (gli enum Mongoose non si validano negli update, Pitfall 5).
- **D-12 (OQ4, OQ5):** `revokeOthersOf(userId, keepSessionId, reason)` revoca le sessioni attive dell'utente con `_id` **minore** di quella da tenere (ObjectId monotoni: fra due login concorrenti vince l'ultimo e nessuno dei due caccia l'altro), nello stesso passo del login dopo la creazione della nuova; se la revoca fallisce **il login fallisce** (errore propagato, sanitizzato in produzione; la sessione orfana scade da sola). Test «(D-02) a concurrent later login is not revoked by an earlier one».
- **D-13 (C-7, F-2):** `extensions.reason` oggi non arriva mai via HTTP: `formatDomainError` (`src/graphql/format-domain-error.ts:17-22`) e `sanitizeFormattedError` (`src/graphql/production-errors.ts:19`) ricostruiscono le extensions come `{ code }`; entrambi conservano la **sola chiave `reason`** (allowlist di una chiave, mai lo spread delle extensions originali), con RED nei due spec unitari e in `production-surface.int-spec.ts` (refresh revocato in produzione → `{ code: 'SESSION_REVOKED', reason: 'newLogin' }`, `SESSION_EXPIRED` senza `reason`).
- **D-14 (F-9, Pitfall 2):** due spec esistenti diventano instabili col watcher attivo in ogni harness che importa `AuthModule`: `src/auth/auth-session.service.int-spec.ts:173-185` (D-10) riceve l'override del provider `UserRoleChangesPublisher` (D-10 resta provato come rete di sicurezza; il comportamento nuovo va nella spec D-06 dedicata); `src/users/user-updated.subscription.int-spec.ts:232-245` è riscritta col bearer dev (identità senza sessione, mai chiusa) più una riga D-06 nella spec nuova. `ws-connection-authenticator.spec.ts:51` aggiorna il costruttore (lookup della sessione + registro, due fake).
- **D-15 (F-8, Pitfall 8):** coverage di `./src/auth/` oggi 99,83 / 86,71 / 100 con le sole suite di auth (32 s); le soglie 97/84/98 restano; il ripiego per cartella del gate usa `--coverageThreshold='{}'` e legge il `json-summary` (senza l'override esce 1 per le cartelle non raccolte).
- **D-16 (F-11, Pitfall 6, 7 — per il handoff):** la UAT dual-device della FE gira con **un solo processo BE** (il registro dei socket è per processo: il «secondo BE per gli sweep» delle UAT passate va spento); il token dev in UAT usa un `twitchId` distinto da quello reale (altrimenti `DEV_AUTH_ROLE` diverso dal ruolo a DB cambierebbe il ruolo e revocherebbe le sessioni vere); tunnel TLS: nessuna modifica BE, `TWITCH_REDIRECT_URI` = `https://<host-del-tunnel>/auth/twitch/callback` nel `.env` dell'utente e registrata su Twitch, `APP_AUTH_REDIRECT_URL` resta `klimmeck://auth`, throttler da annotare (stesso IP per i due device).

### Claude's Discretion
- Risolti dopo la ricerca: registro dei socket (`WsSessionRegistry`, D-03), close code `4409`, enum e campo come nelle REPO-RULES, modulo condiviso delle liste e fixture per handler (D-01), nessuna cache alla `connection_init` (una `findById` con proiezione, F-7). Restano a discrezione del planner: il nome della spec di filo di D-02/D-03/D-05 (`test/auth/session-revocation.int-spec.ts` suggerito), la forma dell'helper di priming del watcher, il taglio dei piani.

</decisions>

<specifics>
## Specific Ideas

- L'utente ha preferito la fase completa al quick task per HARDEN-02 e ha scelto due regole di prodotto contro il default: l'ultimo login caccia l'altro, e il messaggio specifico quando il BE sa il motivo.
- La finestra dei 15 minuti del JWT è accettata esplicitamente: niente lookup per richiesta.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fase e requisiti
- `.planning/ROADMAP.md` §"Phase 17: Autorizzazione e sessioni" — goal, BE-SESSION-01..05, criteri, branch.
- `.planning/REQUIREMENTS.md` §"Authorization audit & sessioni per device (BE-SESSION)".
- `../Klimmeck-Guide/.planning/phases/12-hardening/12-CONTEXT.md` — la FE che consuma: D-09 (reazione al close dedicato), D-11 (reset della shell), D-12 (notice per `newLogin`/`roleChanged`, parsing tollerante), D-06 (UAT dual-device), D-04 (UAT release via tunnel).
- `../Klimmeck-Guide/.planning/REQUIREMENTS.md` — HARDEN-02, HARDEN-06 (emendati 2026-11-09).
- `../Klimmeck-Guide/.planning/phases/10-admin-panel-innkeeper/10-SECURITY.md` — T-10-19 (ruolo stantio).

### Decisioni BE vincolanti
- `.planning/phases/02-auth-identity-foundation/02-CONTEXT.md` — D-08 (una sessione per device, rotazione, reuse detection), D-35 (finestra di riuso 30 s); `BACKEND-NOTES.md` §3.
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/03-CONTEXT.md` — D-09 (bypass innkeeper auditato), D-12 (`@Roles`), subscription filtrate per identità fail-closed.
- `.planning/phases/10-hardening-trasversale/10-CONTEXT.md` — D-05..D-08 (sanitizzazione degli errori: `extensions` consentite), D-16 (soglie di coverage per cartella).
- `test/app.int-spec.ts` — `EXPECTED_INNKEEPER_HANDLERS`, `EXPECTED_OWNERSHIP_HANDLERS`, whitelist del boot reale.

### Regole del repo
- `CLAUDE.md` — TDD, branch + PR, lint sui soli file toccati, nessun secret.
- `.planning/phases/16-lore-sbloccabili/16-REPO-RULES.md` — modello per `17-REPO-RULES.md` (nomi del contratto prima della ricerca).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/auth/session/session.service.ts` — `create(userId)`, `findRotatable`, `rotate`, `revoke(sessionId)` (scrittura condizionale di `revokedAt` sulle sole sessioni ancora attive), `isRevokedSessionToken`, filtro «attiva» (`revokedAt: null, expiresAt > now`); `session.model.ts` — `userId` (indicizzato), `refreshTokenHash`, `retiredRefreshTokens`, `tokenSeed`, `rotationCount`, `revokedAt`, `expiresAt`: D-02 aggiunge una revoca per `userId` con esclusione della sessione nuova, D-08 il campo del motivo.
- `src/auth/auth.resolver.ts` — mutation di login (ticket + codeVerifier → `AuthSession`), refresh (`refreshToken` → `AuthSession`), query `me`, mutation `logout` (Boolean); `src/auth/auth-session.service.ts` — il flusso; `src/auth/auth-error-code.enum.ts` — `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `LOGIN_TICKET_INVALID`; `src/auth/auth.exception.ts` — dove entrano le `extensions`.
- `src/auth/ws/ws-connection-authenticator.ts` — `onConnect` scrive `extra.identity` (con `sessionId`), pianifica la chiusura `4401` alla scadenza del JWT (`scheduleExpiryClose`), `onDisconnect` pulisce; `ws-close-codes.ts` — `4401`, `4403`: punto d'innesto di D-03.
- `src/auth/request-identity.ts`, `src/auth/auth-identity.ts` — `{ userId, role, sessionId? }` dal JWT.
- `src/authz/roles/roles.guard.ts` (claim `identity.role`), `src/authz/ownership/*` (`OwnershipGuard`, `CharacterAccessPolicy`), `src/authz/audit/*` (interceptor degli handler innkeeper).
- `src/mongo/change-stream-publisher.ts` — base astratta con `pipeline`, backoff e riapertura; usata da `users/user-updates.publisher.ts`, `characters/*`, `quests/*`: modello per il watcher del ruolo (D-06).
- `src/users/users.service.ts` — `upsertWithRole(twitchId, role)`, unico scrittore del ruolo nel codice; `users.resolver.ts` — solo `users`/`user` innkeeper e `userUpdated`.
- Harness di test: `createAuthTestApp`/`createCharactersTestApp`, fixture JWT per ruolo (`test/auth/http-guard.int-spec.ts`, `test/auth/ws-auth.int-spec.ts`), spec `FORBIDDEN` esistenti per singoli handler (es. `src/quests/pending-requests/*.int-spec.ts`, `src/users/users-authz.int-spec.ts`, `src/pendingQuests/pending-quests-authz.int-spec.ts`).

### Established Patterns
- «Il filtro è la regola» (Phase 4): update condizionali, nessun read-modify-write; revoca con `revokedAt: null` nel filtro.
- Change stream con backoff e riapertura (Phase 10 BE-HARD-06).
- Errori con codice stabile + `extensions`, sanitizzati in produzione (Phase 10).
- Boot reale che enumera gli handler per metadati e pinna lo SDL; coverage per cartella come gate.

### Integration Points
- `AuthSessionService` (login → revoca delle altre sessioni; refresh → reason), `SessionService` (revoca per utente, motivo), `Session` model.
- Layer WS (`WsConnectionAuthenticator`, registro/evento di chiusura, verifica della sessione alla `connection_init`).
- Nuovo watcher sul change stream di `users` (modulo utenti o auth).
- Nuovo int-spec della matrice + modulo condiviso delle liste con `test/app.int-spec.ts`.

</code_context>

<deferred>
## Deferred Ideas

- «Esci da tutti i dispositivi» (mutation + voce FE) — backlog, superata dalla regola dell'ultimo login.
- Verifica della sessione a ogni richiesta HTTP — rifiutata (JWT stateless, finestra di 15 min accettata).
- Mutation admin per cambiare il ruolo di un utente — non richiesta (ruolo curato a DB).
- Classificazione di tutto lo SDL in pubblico/owner/innkeeper con whitelist — non scelta («Tutto lo schema classificato»).

</deferred>

---

*Phase: 17-autorizzazione-e-sessioni*
*Context gathered: 2026-11-09*
