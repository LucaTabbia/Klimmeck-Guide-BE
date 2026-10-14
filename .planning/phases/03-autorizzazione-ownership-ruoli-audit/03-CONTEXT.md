# Phase 3: Autorizzazione: Ownership, Ruoli, Audit - Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Il backend passa da "autenticato" ad "autorizzato": ogni operazione agisce solo su ciò che appartiene all'identità del bearer, le operazioni amministrative sono riservate al ruolo `innkeeper`, le subscription emettono solo al proprietario (o all'innkeeper), e ogni azione amministrativa lascia un record di audit persistente. La fase assorbe inoltre il **contratto real-time richiesto dalla FE Phase 3** (decisione utente 2026-10-14, nessuna fase companion decimale): una nuova subscription `userUpdated` senza argomenti, lo **snapshot iniziale** a ogni (ri)sottoscrizione e il rifiuto `FORBIDDEN` di `characterUpdated` su id altrui. Questo contratto atterra **nella prima wave** perché sblocca il FE.

In scope: ownership sulle mutation e query del personaggio (BE-AUTHZ-01), decorator/guard `@Roles(innkeeper)` applicati alle operazioni amministrative già esistenti e pronti per quelle future (BE-AUTHZ-02), subscription filtrate per identità + `userUpdated` + snapshot (BE-AUTHZ-03, BE-SYNC-01, BE-SYNC-02), audit log admin su collection Mongo con TTL (BE-AUTHZ-04), rimozione delle mutation legacy `createUser`/`updateUser`/`deleteUser`, handoff `BACKEND-NOTES.md` per il FE.

Fuori dal boundary: atomicità economica (Phase 4), le mutation admin vere e proprie — CRUD quest/enemy/POI/road, teleport, outcome, approve/reject — che arrivano nelle Phase 7–9 e si limiteranno a decorare con `@Roles(innkeeper)`, FCM (Phase 5), EventSub (Phase 6), introspection off/CORS (Phase 10), una mutation di cancellazione del personaggio (non è in roadmap: vedi Deferred), una query GraphQL di lettura dell'audit log (rinviata), il ruolo `guard` (moderatore della futura sezione forum, senza scope in v1).

</domain>

<decisions>
## Implementation Decisions

### Contratto real-time per il FE (BE-SYNC-01, BE-SYNC-02, BE-AUTHZ-03) — prima wave
- **D-01:** Nuova subscription **`userUpdated: User!` senza argomenti**: l'identità è quella risolta in `connection_init` (`extra.identity`); emette il documento `User` dell'utente autenticato (`id`, `twitchId`, `twitchPoints`, `role`, `currentCharacter` popolato a un livello come `me`) a ogni modifica. Nessun client può ascoltare un altro utente.
- **D-02:** `userUpdated` è prodotto da un **change stream Mongo su `users`** (`update`/`replace`, `fullDocument: 'updateLookup'`) → `pubSub.publish('userUpdated')`, stesso pattern di `CharactersService`; il resolver filtra `payload.userUpdated._id === identity.userId`. Così emettono anche le modifiche manuali a DB (il ruolo `innkeeper` si assegna a mano, D-04 Phase 2) e i futuri accrediti EventSub, senza publish sparsi nei service.
- **D-03:** **Snapshot su subscribe** per entrambe le subscription: appena la sottoscrizione è accettata il BE emette il documento corrente, poi gli eventi live. È il meccanismo con cui il FE chiude il gap degli eventi persi durante le riconnessioni WS (4401 ogni ~15 min, cadute di rete): il client Dart ri-invia le operazioni al reconnect e lo snapshot rimette in pari. Nessun replay né cursore. Lo snapshot si emette **solo dopo** che il filtro identità è passato. Meccanica (`Repeater.merge`, async generator, ecc.) a discrezione di research/planner.
- **D-04 (nota wire, post-research 2026-10-14):** su graphql-ws un'eccezione lanciata dal guard o dal metodo `@Subscription` arriva al client come messaggio `next` con `errors[0].extensions.code` seguito da `complete` (nessun messaggio `error`); `formatDomainError` non gira su WS, quindi l'eccezione deve impostare `this.extensions = { code }` come `AuthException`. L'handoff deve dire al FE di **non ritentare** una sottoscrizione rifiutata con `FORBIDDEN`.
- **D-04:** **`characterUpdated(id: String!)` mantiene l'argomento** (il documento FE non cambia). Se `id` non è il `currentCharacter` del bearer e il bearer non è `innkeeper`, la **sottoscrizione è rifiutata subito con `FORBIDDEN`**; il filtro per identità resta comunque nel resolver per ogni evento (difesa in profondità: un cambio di proprietà a stream aperto non fa trapelare nulla).
- **D-05:** L'**innkeeper può sottoscrivere qualunque personaggio** (vista live dell'admin panel, FE Phase 10 / BE-ADMIN-01): riceve snapshot ed eventi del personaggio richiesto.
- **D-06:** La cancellazione di un personaggio non emette `characterUpdated` (il change stream osserva solo update/replace): il FE la apprende da `userUpdated` con `currentCharacter: null`. Qualunque futuro percorso di cancellazione (Impostazioni FE Phase 4, morte in combattimento BE Phase 9) deve azzerare `User.currentCharacter` nella stessa operazione atomica. In questa fase **non** si aggiunge una mutation di cancellazione (vedi Deferred).
- **D-07:** **Ordine di atterraggio:** la prima wave consegna `userUpdated`, snapshot e rifiuto/filtro per identità con `src/schema.gql` rigenerato e committato, così il FE Phase 3 può verificare i propri documenti contro il branch e fare l'E2E contro il BE del branch in locale. Ownership, ruoli e audit seguono nella stessa fase e nella stessa PR; **PR BE prima della PR FE** (come Phase 2.1).

### Ownership sulle operazioni del personaggio (BE-AUTHZ-01)
- **D-08:** Le mutation giocatore (`doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`) **mantengono l'id del character nella request** (`request.id`, `request.characterId`): contratto GraphQL invariato. Il BE verifica che l'id coincida con `User.currentCharacter` del bearer; altrimenti **`FORBIDDEN`**. Il JWT non porta il personaggio: serve una lettura dello User per operazione protetta; collocazione del check (guard/decorator riusabile vs service) a discrezione del planner, purché la logica non sia duplicata nei resolver.
- **D-09:** **L'innkeeper bypassa l'ownership** sulle mutation giocatore (decisione utente: può equipaggiare, comprare, usare magie per conto di chiunque). Ogni chiamata innkeeper su un personaggio non suo è **auditata** (D-16).
- **D-10:** Query: `character(id)` ed `equipment(id)` rispondono solo al proprietario o all'innkeeper (`FORBIDDEN` altrimenti); `characters` (lista) è **innkeeper-only**; `pendingQuests` (lista) è **innkeeper-only**; `pendingQuest(id)` risponde solo se l'id è il `quests.pendingQuest` del personaggio del bearer (o se innkeeper) — `PendingQuest` non ha un riferimento al character, quindi la proprietà si risolve dal personaggio del bearer. Le query di catalogo (`quests`, `quest`, `enemies`, `cities`, `lore`, `spells`, `pets`, `equipmentItems*`, `lootItems*`, `getPath`, `raceTraits`) restano leggibili da **ogni autenticato** (contenuto di gioco; nessuna obiezione dell'utente).
- **D-11:** Errori: `extensions.code = FORBIDDEN` (HTTP 403 su REST) con messaggio italiano stabile, nello stesso pattern di `formatDomainError` (eccezione tipizzata `extends ForbiddenException` con `code`); un id inesistente risponde **`NOT_FOUND`**. *(Precisazione post-research 2026-10-14: oggi `NotFoundException` arriva sul wire GraphQL HTTP come `code: INTERNAL_SERVER_ERROR` con `status: 404` e su WS senza codice; per rispettare l'intento "403 e 404 distinguibili" questa fase introduce un'eccezione tipizzata con `extensions.code = NOT_FOUND` sui percorsi di autorizzazione toccati — policy di accesso e query/mutation protette; il resto dei service può seguire come Boy Scout se in scope.)* Nessuna mascheratura 403/404.

### Ruoli e perimetro admin (BE-AUTHZ-02)
- **D-12:** Decorator **`@Roles(RoleType.innkeeper)`** + guard che legge `role` dall'identità del JWT (**snapshot, D-10 Phase 2 invariato**): l'utente è l'unico innkeeper in v1, nessuno scenario di revoca, nessun profilo `guard` attivo. Niente rilettura da DB.
- **D-13:** Il ruolo **`guard` è il moderatore della futura sezione forum** dell'app (evolutiva): in questa fase non ha alcuno scope ed è trattato come `adventurer` ovunque (ownership e `@Roles` lo escludono dall'admin). Nessuna semantica inventata ora.
- **D-14:** **Rimuovere dallo schema `createUser`, `updateUser`, `deleteUser`** (gli utenti nascono dal login; permetterebbero di scrivere `role`/`twitchPoints` a mano); `users` e `user(id)` restano, **innkeeper-only**. `UserInput` si rimuove se non ha più consumatori (planner). Il cambio ruolo resta manuale a DB.
- **D-15:** Oggi non esiste alcuna mutation admin: la fase consegna decorator e guard, li applica alle operazioni di D-10/D-14 e **documenta la convenzione** (ogni futura mutation admin delle Phase 7–9 si decora con `@Roles(innkeeper)` e viene auditata automaticamente). Il rifiuto di ruolo usa lo stesso codice `FORBIDDEN`.

### Audit log admin (BE-AUTHZ-04)
- **D-16:** **Automatico via interceptor**: ogni mutation decorata `@Roles(innkeeper)` e ogni mutation giocatore in cui l'innkeeper agisce su un personaggio non suo (bypass D-09). Le query admin **non** sono auditate.
- **D-17:** Record: `at`, `actor { userId, twitchId, role }`, `action` (nome dell'operazione/resolver), `target { type, id }`, **`args` completi** così come ricevuti (sono piccoli: id, quantità, enum; nessun segreto transita), `outcome` (`ok` oppure il codice d'errore). Nome della collection a discrezione del planner (es. `admin_audit_logs`).
- **D-18:** Collection Mongo con **indice TTL a 90 giorni** (decisione utente: "non voglio riempire il DB con troppo noise per motivi di costi"; la prima scelta "1 anno" è stata rivista). **Nessuna query GraphQL di lettura in questa fase**: si consulta a DB (Compass/mongosh); `adminAuditLogs` innkeeper-only è rinviata alle fasi dell'admin panel.
- **D-19 (non discussa, default raccomandato):** la scrittura dell'audit è **best-effort e asincrona rispetto all'esito**: si registra anche l'esito negativo; un errore di scrittura dell'audit viene loggato e non cambia l'esito dell'operazione. Il planner può proporre fail-closed se emergono ragioni in research.

### Claude's Discretion
- Meccanica dello snapshot su subscribe (`Repeater.merge`, generator) e sua copertura con i test WS reali di `test/auth/ws-test-client.ts`.
- Collocazione del check di ownership (guard parametrico, decorator `@OwnsCharacter`, helper nel service) e della risoluzione di `currentCharacter` (una sola lettura per operazione, nessuna duplicazione nei resolver).
- Layout dei moduli (es. `src/authz/` per roles/ownership/audit) e nome della collection di audit.
- Interceptor vs decorator per l'audit, forma del `target` quando l'operazione non ha un id naturale.
- Rimozione di `UserInput` e di `UsersService.create/update/delete` se non più usati.
- Come esporre all'adventurer la propria `pendingQuest(id)` (lookup su `Character.quests.pendingQuest`).
- Gestione dei fallimenti di scrittura dell'audit (D-19).
- Ordine interno dei plan oltre al vincolo di D-07.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope e requisiti BE
- `.planning/ROADMAP.md` §"Phase 3: Autorizzazione: Ownership, Ruoli, Audit" — goal, success criteria 1–6 (5 e 6 aggiunti il 2026-10-14 per il contratto real-time), branch `feat/03-autorizzazione-ownership-ruoli-audit`.
- `.planning/REQUIREMENTS.md` — BE-AUTHZ-01..04 (BE-AUTHZ-01 emendato: innkeeper esente e auditato; BE-AUTHZ-04: TTL 90 giorni) e la nuova sezione BE-SYNC-01/02.
- `.planning/PROJECT.md` — core value (nessun client altera uno stato che non gli appartiene), vincolo single channel / unico innkeeper.

### Decisioni delle fasi precedenti da rispettare
- `.planning/phases/02-auth-identity-foundation/02-CONTEXT.md` — D-04 (ruolo innkeeper assegnato a mano a DB), D-10 (ruolo nel JWT come snapshot: **confermato**), D-12/D-13 (seam d'identità, `@CurrentUser()`), D-14/D-28 (WS: `extra.identity`, close 4403/4401), D-15 (i resolver non sono stati riscritti per l'ownership: è questa fase), D-30 (introspection ancora pubblica fino a Phase 10).
- `.planning/phases/02-auth-identity-foundation/BACKEND-NOTES.md` — contratto `connection_init`, codici d'errore auth esistenti, dev bypass (`DEV_AUTH_ROLE` permette di testare l'innkeeper in locale).
- `.planning/phases/02.1-character-creation-contract/02.1-CONTEXT.md` — D-14 (tooling: prettier/eslint solo sui file toccati, jest paths prima di `--selectProjects`, rigenerazione `src/schema.gql`), D-16 (`formatDomainError` + eccezioni tipizzate con `code`), D-20 (trappole dei modelli: ref `Mixed`, `wearedEquipment`), D-21 (moduli dedicati senza Bull, `createAuthTestApp({ imports, overrides })`, `createAuthenticatedUser`).
- `.planning/phases/02.1-character-creation-contract/BACKEND-NOTES.md` — stile dell'handoff da replicare.

### Contratto lato FE (repo separato, sola lettura — fonte della richiesta)
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/BACKEND-NOTES.md` — la proposta FE (TL;DR, tabella eventi, domande aperte 1–5 da chiudere nel nostro handoff).
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/03-CONTEXT.md` — D-01..D-07 (contratto), D-12..D-15 (refetch, watchdog 3 minuti: il BE non riceve `logout` in quel caso).
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/graphql/fragments/user_fragment.dart` e `lib/graphql/fragments/character_fragment.dart` — i campi che il FE seleziona (nessun campo nuovo richiesto in questa fase).

### Codice esistente (punti d'innesto)
- `src/characters/characters.resolver.ts` — `characterUpdated(id)` con filtro solo per id; mutation giocatore con `request.id`; query `character(id)`, `equipment(id)`, `characters`.
- `src/characters/characters.service.ts` — change stream su `characters` → `pubSub.publish('characterUpdated')`: modello per `userUpdated` (D-02).
- `src/pubsub.module.ts` — `PUB_SUB` e `PubSubEvents` (da estendere con `userUpdated`).
- `src/auth/guards/auth.guard.ts`, `src/auth/decorators/current-user.decorator.ts`, `src/auth/decorators/public.decorator.ts` — pattern guard/decorator da affiancare con `@Roles`.
- `src/auth/ws/ws-connection-authenticator.ts`, `src/graphql/graphql-context.ts`, `src/graphql/graphql-options.factory.ts` — identità WS in `extra.identity`, `formatDomainError`.
- `src/auth/auth.exception.ts`, `src/auth/auth-error-code.enum.ts`, `src/characters/creation/*exception*` — pattern delle eccezioni tipizzate con `extensions.code`.
- `src/users/users.resolver.ts`, `src/users/users.service.ts`, `src/models/user.model.ts` — CRUD legacy da rimuovere/limitare, `UserInput`.
- `src/pendingQuests/pending-quests.resolver.ts`, `src/models/pending-quest.model.ts` (nessun ref al character), `src/models/character/character-quests.model.ts`.
- `src/models/request/*.ts` — `id` / `characterId` nelle request.
- `test/auth/auth-test-app.ts`, `test/auth/ws-test-client.ts`, `test/auth/ws-auth.int-spec.ts`, `test/fixtures/*` — harness per i test WS reali e le identità di test.
- `.planning/codebase/CONCERNS.md` — "subscription aperte" tra i 5 problemi critici: questa fase lo chiude.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuthIdentity { userId, twitchId, role, expiresAt? }` disponibile su HTTP (`request.user`) e WS (`extra.identity`); `@CurrentUser()` già uniforme.
- `AuthGuard` deny-by-default con whitelist `@Public()`: `@Roles` si affianca come secondo guard (o estende il primo) leggendo i metadata con `Reflector`.
- `CharactersService.onModuleInit` — change stream con `fullDocument: 'updateLookup'`, `findOne` popolato prima del publish, chiusura in `onModuleDestroy`: template per `UsersService`.
- `formatDomainError` + eccezioni tipizzate (`AuthException`, `CharacterCreationException`): aggiungere il codice `FORBIDDEN` nello stesso stile.
- `UsersService.findOne(id)` popola `currentCharacter` a un livello (shape di `me`): riusabile per lo snapshot di `userUpdated` e per la risoluzione dell'ownership.
- Harness: `createAuthTestApp`, `createAuthenticatedUser`, `WsTestClient` (connect con `connection_init`, attesa di `next`/`error`/close code), fixture `buildUser`/`persistCharacter`.
- Dev bypass: `DEV_AUTH_ROLE=innkeeper` permette di provare a mano il perimetro admin con lo stub FE.

### Established Patterns
- Code-first GraphQL, moduli Nest per dominio, test `*.spec.ts` (unit) e `*.int-spec.ts` (integration su MongoMemoryReplSet + Redis effimero).
- Errori: mai `GraphQLError` grezze; eccezioni Nest con `extensions.code` stabile, messaggi italiani.
- Tooling: `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati; `npx jest <paths> --selectProjects unit|integration [--runInBand]`; `src/schema.gql` rigenerato con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e committato (la CI fallisce sul drift).
- Branch per fase dal template `feat/{phase}-{slug}` (creato: `feat/03-autorizzazione-ownership-ruoli-audit`), PR verso `develop`.

### Integration Points
- `src/characters/characters.resolver.ts` — rifiuto `FORBIDDEN` alla subscribe, filtro identità, snapshot; ownership su mutation/query.
- `src/users/` — `userUpdated` resolver + change stream, rimozione delle mutation CRUD, `@Roles` su `users`/`user(id)`.
- `src/pendingQuests/pending-quests.resolver.ts` — `@Roles` su `pendingQuests`, ownership su `pendingQuest(id)`.
- `src/pubsub.module.ts` — nuovo evento.
- Nuovo modulo authz (roles guard, ownership, audit interceptor + schema Mongo con TTL) registrato in `AppModule` (`APP_GUARD`/`APP_INTERCEPTOR`).
- `src/schema.gql` — rigenerato dopo la wave 1 e a fine fase.
- `BACKEND-NOTES.md` della fase — handoff finale per il FE (chiude le domande aperte 1–5 del FE).

### Gaps found during scouting
- Nessuna mutation admin esiste ancora (CRUD contenuti, teleport, outcome): il perimetro `@Roles` reale oggi è `users`, `user`, `characters`, `pendingQuests`.
- `PendingQuest` non referenzia il character: l'ownership di `pendingQuest(id)` va risolta dal personaggio del bearer.
- Il FE non usa `users`, `user`, `characters`, `pendingQuests`, né le mutation CRUD utenti: rimuoverle/limitarle non rompe nulla lato app.

</code_context>

<specifics>
## Specific Ideas

- "guard è un moderatore. Attualmente il ruolo non ha scope in quanto non serve allo stato attuale, avrà un utilizzo quando ci sarà la sezione forum dell'app (evolutiva futura)."
- "Io sarò il solo innkeeper, quindi il ruolo non mi può essere revocato e in questa prima versione non ci saranno profili guard. Possiamo quindi tenere tutto com'è adesso" (ruolo dal JWT).
- "Sono accessibili solo le pendingQuests dell'utente stesso per i ruoli adventurer. La lista character è solo per l'innkeeper e tutte le pendingQuests solo per l'innkeeper."
- "I log restano attivi per 90 giorni. Le diagnostiche non mi saranno eccessivamente utili in un primo momento e non voglio riempire il DB con troppo noise per motivi di costi."
- Lato FE (stessa giornata): nessun admin-swap di personaggio; la cancellazione avviene solo dalle Impostazioni o per morte in combattimento (risultato mostrato prima del ritorno alla creazione).

</specifics>

<deferred>
## Deferred Ideas

- **Mutation di cancellazione del personaggio** (richiesta implicita dalla FE Phase 4 Impostazioni e dalla morte in combattimento): non è in nessuna delle due roadmap. Da inserire come requisito/fase BE (unset atomico di `User.currentCharacter` + delete del character, emesso via `userUpdated`) quando la FE Phase 4 verrà discussa.
- **Query `adminAuditLogs` innkeeper-only** — rinviata alle fasi dell'admin panel (BE Phase 9 / FE Phase 10).
- **Audit delle query admin** — escluso per rumore; rivalutare se servirà compliance.
- **Ruolo `guard` come moderatore** — scope definito con la futura sezione forum dell'app.
- **Rilettura del ruolo da DB per `@Roles`** — non necessaria con un solo innkeeper; rivalutare se i ruoli diventano assegnabili dall'app.
- **Replay/cursori sulle subscription** — non necessari grazie allo snapshot su subscribe; BE-FUT-02 (Redis PubSub) resta fuori scope.

</deferred>

---

*Phase: 03-autorizzazione-ownership-ruoli-audit*
*Context gathered: 2026-10-14*
