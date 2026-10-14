# Phase 3: Autorizzazione: Ownership, Ruoli, Audit - Research

**Researched:** 2026-10-14
**Domain:** Autorizzazione NestJS 11 (guard/decorator/interceptor) su Apollo code-first + graphql-ws, subscription con snapshot (`@graphql-yoga/subscription` / Repeater), change stream Mongo, audit log Mongoose con TTL
**Confidence:** HIGH (ogni meccanismo critico è stato verificato leggendo i sorgenti installati in `node_modules` e con test probe temporanei eseguiti sull'harness reale, poi rimossi: working tree pulito)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Contratto real-time per il FE (BE-SYNC-01, BE-SYNC-02, BE-AUTHZ-03) — prima wave
- **D-01:** Nuova subscription **`userUpdated: User!` senza argomenti**: l'identità è quella risolta in `connection_init` (`extra.identity`); emette il documento `User` dell'utente autenticato (`id`, `twitchId`, `twitchPoints`, `role`, `currentCharacter` popolato a un livello come `me`) a ogni modifica. Nessun client può ascoltare un altro utente.
- **D-02:** `userUpdated` è prodotto da un **change stream Mongo su `users`** (`update`/`replace`, `fullDocument: 'updateLookup'`) → `pubSub.publish('userUpdated')`, stesso pattern di `CharactersService`; il resolver filtra `payload.userUpdated._id === identity.userId`. Così emettono anche le modifiche manuali a DB (il ruolo `innkeeper` si assegna a mano, D-04 Phase 2) e i futuri accrediti EventSub, senza publish sparsi nei service.
- **D-03:** **Snapshot su subscribe** per entrambe le subscription: appena la sottoscrizione è accettata il BE emette il documento corrente, poi gli eventi live. È il meccanismo con cui il FE chiude il gap degli eventi persi durante le riconnessioni WS (4401 ogni ~15 min, cadute di rete): il client Dart ri-invia le operazioni al reconnect e lo snapshot rimette in pari. Nessun replay né cursore. Lo snapshot si emette **solo dopo** che il filtro identità è passato. Meccanica (`Repeater.merge`, async generator, ecc.) a discrezione di research/planner.
- **D-04:** **`characterUpdated(id: String!)` mantiene l'argomento** (il documento FE non cambia). Se `id` non è il `currentCharacter` del bearer e il bearer non è `innkeeper`, la **sottoscrizione è rifiutata subito con `FORBIDDEN`**; il filtro per identità resta comunque nel resolver per ogni evento (difesa in profondità: un cambio di proprietà a stream aperto non fa trapelare nulla).
- **D-05:** L'**innkeeper può sottoscrivere qualunque personaggio** (vista live dell'admin panel, FE Phase 10 / BE-ADMIN-01): riceve snapshot ed eventi del personaggio richiesto.
- **D-06:** La cancellazione di un personaggio non emette `characterUpdated` (il change stream osserva solo update/replace): il FE la apprende da `userUpdated` con `currentCharacter: null`. Qualunque futuro percorso di cancellazione (Impostazioni FE Phase 4, morte in combattimento BE Phase 9) deve azzerare `User.currentCharacter` nella stessa operazione atomica. In questa fase **non** si aggiunge una mutation di cancellazione (vedi Deferred).
- **D-07:** **Ordine di atterraggio:** la prima wave consegna `userUpdated`, snapshot e rifiuto/filtro per identità con `src/schema.gql` rigenerato e committato, così il FE Phase 3 può verificare i propri documenti contro il branch e fare l'E2E contro il BE del branch in locale. Ownership, ruoli e audit seguono nella stessa fase e nella stessa PR; **PR BE prima della PR FE** (come Phase 2.1).

#### Ownership sulle operazioni del personaggio (BE-AUTHZ-01)
- **D-08:** Le mutation giocatore (`doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`) **mantengono l'id del character nella request** (`request.id`, `request.characterId`): contratto GraphQL invariato. Il BE verifica che l'id coincida con `User.currentCharacter` del bearer; altrimenti **`FORBIDDEN`**. Il JWT non porta il personaggio: serve una lettura dello User per operazione protetta; collocazione del check (guard/decorator riusabile vs service) a discrezione del planner, purché la logica non sia duplicata nei resolver.
- **D-09:** **L'innkeeper bypassa l'ownership** sulle mutation giocatore (decisione utente: può equipaggiare, comprare, usare magie per conto di chiunque). Ogni chiamata innkeeper su un personaggio non suo è **auditata** (D-16).
- **D-10:** Query: `character(id)` ed `equipment(id)` rispondono solo al proprietario o all'innkeeper (`FORBIDDEN` altrimenti); `characters` (lista) è **innkeeper-only**; `pendingQuests` (lista) è **innkeeper-only**; `pendingQuest(id)` risponde solo se l'id è il `quests.pendingQuest` del personaggio del bearer (o se innkeeper) — `PendingQuest` non ha un riferimento al character, quindi la proprietà si risolve dal personaggio del bearer. Le query di catalogo (`quests`, `quest`, `enemies`, `cities`, `lore`, `spells`, `pets`, `equipmentItems*`, `lootItems*`, `getPath`, `raceTraits`) restano leggibili da **ogni autenticato** (contenuto di gioco; nessuna obiezione dell'utente).
- **D-11:** Errori: `extensions.code = FORBIDDEN` (HTTP 403 su REST) con messaggio italiano stabile, nello stesso pattern di `formatDomainError` (eccezione tipizzata `extends ForbiddenException` con `code`); un id inesistente **resta `NOT_FOUND`** come oggi. Nessuna mascheratura 403/404.

#### Ruoli e perimetro admin (BE-AUTHZ-02)
- **D-12:** Decorator **`@Roles(RoleType.innkeeper)`** + guard che legge `role` dall'identità del JWT (**snapshot, D-10 Phase 2 invariato**): l'utente è l'unico innkeeper in v1, nessuno scenario di revoca, nessun profilo `guard` attivo. Niente rilettura da DB.
- **D-13:** Il ruolo **`guard` è il moderatore della futura sezione forum** dell'app (evolutiva): in questa fase non ha alcuno scope ed è trattato come `adventurer` ovunque (ownership e `@Roles` lo escludono dall'admin). Nessuna semantica inventata ora.
- **D-14:** **Rimuovere dallo schema `createUser`, `updateUser`, `deleteUser`** (gli utenti nascono dal login; permetterebbero di scrivere `role`/`twitchPoints` a mano); `users` e `user(id)` restano, **innkeeper-only**. `UserInput` si rimuove se non ha più consumatori (planner). Il cambio ruolo resta manuale a DB.
- **D-15:** Oggi non esiste alcuna mutation admin: la fase consegna decorator e guard, li applica alle operazioni di D-10/D-14 e **documenta la convenzione** (ogni futura mutation admin delle Phase 7–9 si decora con `@Roles(innkeeper)` e viene auditata automaticamente). Il rifiuto di ruolo usa lo stesso codice `FORBIDDEN`.

#### Audit log admin (BE-AUTHZ-04)
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

### Deferred Ideas (OUT OF SCOPE)
- **Mutation di cancellazione del personaggio** (richiesta implicita dalla FE Phase 4 Impostazioni e dalla morte in combattimento): non è in nessuna delle due roadmap. Da inserire come requisito/fase BE (unset atomico di `User.currentCharacter` + delete del character, emesso via `userUpdated`) quando la FE Phase 4 verrà discussa.
- **Query `adminAuditLogs` innkeeper-only** — rinviata alle fasi dell'admin panel (BE Phase 9 / FE Phase 10).
- **Audit delle query admin** — escluso per rumore; rivalutare se servirà compliance.
- **Ruolo `guard` come moderatore** — scope definito con la futura sezione forum dell'app.
- **Rilettura del ruolo da DB per `@Roles`** — non necessaria con un solo innkeeper; rivalutare se i ruoli diventano assegnabili dall'app.
- **Replay/cursori sulle subscription** — non necessari grazie allo snapshot su subscribe; BE-FUT-02 (Redis PubSub) resta fuori scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-AUTHZ-01 | Ownership: solo il proprietario muta il proprio Character; altrui → 403; innkeeper esente e auditato | `@OwnsCharacter(selector)` = `SetMetadata` + `UseGuards(OwnershipGuard)` (§Pattern 4); `CharacterAccessPolicy` con **una** lettura `users` per operazione; `NOT_FOUND` preservato con check di esistenza solo nel ramo di rifiuto; decisione "on behalf" passata all'interceptor via `WeakMap` keyed su `info` (verificato: guard e interceptor ricevono lo stesso array di argomenti) |
| BE-AUTHZ-02 | `@Roles(innkeeper)` sulle operazioni admin; non-innkeeper → 403 | `@Roles` = `applyDecorators(SetMetadata(ROLES_KEY), UseGuards(RolesGuard))`: gira **dopo** il guard globale `AuthGuard` per costruzione (ordine global → class → method verificato in `@nestjs/core`), niente dipendenza dall'ordine degli `APP_GUARD`; applicato a `users`, `user`, `characters`, `pendingQuests`; rimozione di `createUser/updateUser/deleteUser/UserInput` (nessun altro consumatore, verificato) |
| BE-AUTHZ-03 | Subscription filtrate per identità | Rifiuto alla subscribe via `@OwnsCharacter` sulla `@Subscription` (verificato sul wire: `next` con `errors[0].extensions.code = FORBIDDEN` + `complete`); filtro per evento con `pipe(pubSub.subscribe(...), filter(...))` chiuso sull'identità; `userUpdated` senza argomenti con identità da `@CurrentUser()` |
| BE-AUTHZ-04 | Audit persistente (who/what/when/target/args/esito), TTL 90 giorni | `AdminAuditInterceptor` come `APP_INTERCEPTOR` filtrato su `info.parentType.name === 'Mutation'` (verificato: gli interceptor globali girano anche su query e subscription); schema `admin_audit_logs` con `index({ at: 1 }, { expireAfterSeconds: 7_776_000 })` come `sessions`/`login_tickets`; scrittura che non altera mai l'esito |
| BE-SYNC-01 | `userUpdated: User!` senza argomenti da change stream su `users` | `UserUpdatesPublisher` (provider in `UsersModule`) modellato su `CharactersService.onModuleInit`; verificato che gli upsert no-op del login (`$setOnInsert` su documento esistente, `$set: { role }` allo stesso valore) **non** producono eventi |
| BE-SYNC-02 | Snapshot su ogni (ri)sottoscrizione | `subscribeWithSnapshot(live, loadSnapshot)`: aggancia il listener PubSub **prima** di leggere lo snapshot (il Repeater del PubSub è lazy: verificato), emette snapshot → eventi bufferizzati → live; teardown immediato via `Repeater` (un async generator resta appeso: verificato); verificato end-to-end su graphql-ws reale |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack non negoziabile:** NestJS 11 + Mongoose 8 + Apollo GraphQL code-first + Bull/ioredis. Nessuna libreria nuova serve in questa fase.
- **Compatibilità FE:** i contratti GraphQL consumati dal FE non si rompono. `characterUpdated(id: String!)` e le firme delle mutation giocatore restano invariate; `createUser/updateUser/deleteUser` non sono usate dal FE (verificato in CONTEXT).
- **TDD obbligatorio:** Red → Green → Refactor per ogni feature/bugfix.
- **Workflow:** branch `feat/03-autorizzazione-ownership-ruoli-audit` (già attivo), PR verso `develop`, mai push diretto; Conventional Commits con scope `phase-3` (memoria progetto); nessun trailer `Co-Authored-By` (memoria utente).
- **Security:** nessun secret in repo; backend fonte di verità.
- **Principi:** Clean Code, SoC, Boy Scout Rule.
- **Errori:** mai `GraphQLError` grezze o sottoclassi; eccezioni Nest tipizzate con `extensions.code` + `formatDomainError`; messaggi utente in italiano, codici stabili.
- **Import:** path assoluti `src/...`; Prettier single quote, trailing comma `all`, 4 spazi.
- **Tooling (memoria progetto, vincolante):** MAI `npm run lint` (riscrive file non correlati) → `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati; jest: path **prima** di `--selectProjects` (`npx jest <paths> --selectProjects unit|integration [--runInBand]`); `JWT_SECRET` ≥ 32 caratteri al boot; `src/schema.gql` si rigenera con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e va committato (la CI fa `git diff --exit-code src/schema.gql`).
- **GSD:** modifiche al repo solo dentro un workflow GSD.

## Summary

Tutto ciò che la fase richiede si costruisce con primitive già installate: guard e decorator Nest (`applyDecorators`, `SetMetadata`, `UseGuards`, `Reflector`), un interceptor globale, gli operatori `pipe`/`filter`/`Repeater` già esportati da `@graphql-yoga/subscription@5.0.5`, un change stream Mongoose identico a quello di `CharactersService`, e un modello Mongoose con indice TTL come `sessions`. Nessuna dipendenza nuova.

Le tre domande tecnicamente rischiose sono state chiuse con prove eseguite sull'harness reale (`createAuthTestApp` + client `graphql-ws` vero). (1) **Snapshot:** `pubSub.subscribe()` restituisce un Repeater **lazy**: il listener si aggancia solo al primo `next()`, quindi un generator "yield snapshot poi `for await`" perde gli eventi pubblicati durante la lettura dello snapshot; un async generator, inoltre, non si chiude finché non arriva un evento (leak del listener). La soluzione verificata è un helper `subscribeWithSnapshot` che chiama `next()` sul live **prima** di leggere lo snapshot e restituisce un `Repeater` (teardown immediato). (2) **Rifiuto alla subscribe:** un'eccezione lanciata da un guard o dal metodo `@Subscription` arriva al client come messaggio `next` con `{ errors: [{ message, path, extensions: { code: 'FORBIDDEN' } }] }` seguito da `complete` (non un messaggio `error`); `formatDomainError` **non** si applica su WS, ma il codice arriva lo stesso perché graphql-js copia `originalError.extensions`. (3) **Interceptor globale:** un `APP_INTERCEPTOR` gira anche su query e subscription e non rompe l'iteratore della subscription; deve quindi filtrare da sé le sole mutation.

Due scoperte cambiano il piano. **(a)** Oggi un `NotFoundException` su GraphQL HTTP arriva come `extensions.code = INTERNAL_SERVER_ERROR` con `status: 404` e `originalError` esposto (verificato sul wire): il "`NOT_FOUND` come oggi" di D-11 e della bozza di BACKEND-NOTES non corrisponde al comportamento reale. Raccomando un'eccezione tipizzata con codice `NOT_FOUND` almeno nei percorsi di autorizzazione (Open Question 1). **(b)** `UsersModule` è importato da `AuthModule`: appena `UsersModule` inietta `PUB_SUB`, ogni test basato su `createAuthTestApp` fallisce la DI finché l'harness non importa `PubSubModule`. È il primo task della Wave 0.

**Primary recommendation:** modulo `src/authz/` con `@Roles` e `@OwnsCharacter`/`@OwnsPendingQuest` come decorator composti (metadata + `UseGuards`), una `CharacterAccessPolicy` unica, `AdminAuditInterceptor` globale che legge i metadata `@Roles` e le decisioni "on behalf" del guard; `subscribeWithSnapshot` in `src/graphql/`; `UserUpdatesPublisher` in `src/users/`. Wave 1 = harness + snapshot + `userUpdated` + `characterUpdated` protetta + schema rigenerato.

## Risposte puntuali alle domande di ricerca

### Q1 — Snapshot su subscribe con `@Subscription` code-first + yoga PubSub
- `createPubSub().subscribe(topic)` restituisce `new Repeater(executor)`; l'executor, che fa `addEventListener`, parte solo al primo `next()` [VERIFIED: `node_modules/@graphql-yoga/subscription/cjs/create-pub-sub.js` + probe: un evento pubblicato prima del primo `next()` viene perso].
- Un async generator `yield snapshot; for await (const e of live) yield e` ha due difetti: (i) il listener si aggancia **dopo** lo snapshot, quindi gli eventi pubblicati durante la lettura vanno persi; (ii) `return()` chiamato mentre il generator è sospeso su un `await` resta appeso finché non arriva un evento: il listener resta attaccato [VERIFIED: probe, `async generator return while idle: STUCK`].
- `Repeater.merge([snapshot, live])` aggancia il listener subito ma non garantisce l'ordine: un evento live (più recente) può uscire **prima** di uno snapshot più vecchio, lasciando il client su uno stato vecchio [ASSUMED: deduzione dalla semantica di merge, non provata; motivo sufficiente per non usarlo].
- **Raccomandato:** `subscribeWithSnapshot(live, loadSnapshot)`: `iterator.next()` sul live (aggancia il listener), `await loadSnapshot()` (un errore, es. NOT_FOUND, esce **alla subscribe** e il live viene chiuso), poi un `Repeater` che emette snapshot → eventi bufferizzati → live. Ordine verificato `[snapshot, live-during-snapshot, live-after]`; `return()` a vuoto risolve in 0 ms e stacca il listener [VERIFIED: probe in Node e via graphql-ws reale]. I payload sono documenti completi (state-based): un duplicato è innocuo, un evento perso no.
- Il buffer interno del Repeater accoda i push non ancora consumati (limite 1024 push pendenti) [ASSUMED: costante di `@repeaterjs/repeater`, non riletta; irrilevante ai volumi di un canale singolo].
- **Opzione `filter` di `@Subscription`:** `@nestjs/apollo` la implementa avvolgendo l'iteratore restituito dal metodo (`createAsyncIterator`) e chiamando `filter(payload, variables, context, info)` su **ogni** valore, snapshot compreso; un'eccezione nel filtro è assorbita come `false` [VERIFIED: `apollo-base.driver.js#subscriptionWithFilter`, `@nestjs/graphql/dist/utils/async-iterator.util.js`]. `context` è `{ req, extra }` di `buildGraphQLContext`, quindi l'identità sarebbe `context.extra.identity` (oppure `context.req.user`, impostato da `AuthGuard`).
- **Raccomandato:** niente opzione `filter`; il filtro va nel metodo con `pipe(pubSub.subscribe(topic), filter(predicate))` chiuso sull'identità presa da `@CurrentUser()`: tipizzato, testabile unitariamente, applicato solo agli eventi live (lo snapshot è già autorizzato dal guard). `pipe`/`filter` aggancia il listener sorgente al primo `next()` come il Repeater base [VERIFIED: probe]. **Attenzione:** un predicato di yoga `filter` che lancia **chiude lo stream con errore** [VERIFIED: probe] → il predicato va avvolto in try/catch e deve restituire `false` (fail-closed).
- `@CurrentUser()` funziona nei metodi `@Subscription` (lo usa già `AuthProbeResolver`; `AuthGuard` imposta `req.user` su `extra.request`) [VERIFIED: `test/auth/ws-auth.int-spec.ts`].

### Q2 — Rifiuto alla subscribe e forma dell'errore
- Guard e metodo `@Subscription` girano dentro `subscribe` di graphql-js; un'eccezione → `locatedError` → `createSourceEventStream` restituisce `{ errors: [...] }` (non un iterabile) [VERIFIED: `node_modules/graphql/execution/subscribe.js`].
- graphql-ws 6.0.6, per un risultato non iterabile, invia **`next`** con il risultato e poi **`complete`**; il messaggio `error` è riservato a errori di validazione/`onSubscribe` e ad eccezioni durante l'iterazione [VERIFIED: `node_modules/graphql-ws/dist/server-3ewaJSjp.js`].
- Wire reale (probe): `[{"next":{"errors":[{"message":"Non è tuo","locations":[…],"path":["probeDenied"],"extensions":{"code":"FORBIDDEN"}}]}},"complete"]`; `sink.error` **non** viene chiamato [VERIFIED: probe con `graphql-ws` client].
- `formatDomainError` **non** gira su WS: `GqlSubscriptionService` passa a `useServer` solo `schema/execute/subscribe/context` + le opzioni `graphql-ws` [VERIFIED: `@nestjs/graphql/dist/services/gql-subscription.service.js`]. Il codice arriva perché `GraphQLError` copia `originalError.extensions`: l'eccezione **deve** valorizzare `this.extensions = { code }` come `AuthException`. Su WS non esce `stacktrace`/`originalError` (`toJSON` serializza solo message/locations/path/extensions).
- Su HTTP lo stesso `ForbiddenException` codificato arriva pulito: `extensions: { code: 'FORBIDDEN' }` [VERIFIED: probe].
- Guard su subscription: sì, `AuthGuard` (globale) gira a ogni subscribe; i guard a livello di metodo girano dopo [VERIFIED: `@nestjs/core/helpers/context-creator.js`, ordine `[...global, ...class, ...method]`].
- **Nota FE (handoff):** il FE si aspettava "id altrui non riceve nulla, nessun errore" (FE BACKEND-NOTES §0.2); D-04 sceglie il rifiuto. Il client Dart riceverà un risultato con `errors` e poi la chiusura dello stream: il FE **non** deve ritentare su `FORBIDDEN` (con il backoff silenzioso di FE D-14 sarebbe un loop). Da scrivere nel BACKEND-NOTES.

### Q3 — `userUpdated` da change stream su `users`
- Template: `CharactersService.onModuleInit` (`watch([{ $match: { operationType: { $in: ['update','replace'] } } }], { fullDocument: 'updateLookup' })`, `findOne` popolato, `publish`, `close` in `onModuleDestroy`) [VERIFIED: sorgente].
- Gli upsert del login (`findOrCreateByTwitchId` con solo `$setOnInsert`, `upsertWithRole` con `$set: { role }` invariato) **non** producono eventi; un `$set: { twitchPoints: 5 }` sì [VERIFIED: probe su MongoMemoryReplSet]. Il login non genera rumore su `userUpdated`; l'insert del primo login non è nel `$match` (corretto: nessun subscriber può esistere prima del primo token).
- `createCharacter` aggiorna `users.currentCharacter` in una transazione → l'evento parte al commit (i change stream vedono solo scritture committate) [ASSUMED: semantica standard dei change stream; coperta da un test d'integrazione raccomandato].
- Payload: `{ userUpdated: await usersService.findOne(id) }` (popola `currentCharacter` a un livello, shape di `me`) [VERIFIED: `UsersService.findOne`].
- **Collocazione:** un provider dedicato `UserUpdatesPublisher` in `UsersModule` (SoC: `UsersService` resta CRUD/upsert), non dentro `UsersService`.
- `PubSubEvents` oggi è tipizzato male: dichiara `characterUpdated: [character: Character]` ma `CharactersService` pubblica `{ characterUpdated: character }`, e inietta `PubSub` da `graphql-subscriptions` (tipo sbagliato) [VERIFIED: sorgente]. Boy Scout: `characterUpdated: [payload: { characterUpdated: Character }]`, `userUpdated: [payload: { userUpdated: User }]`, e `CharactersService` inietta `PubSub<PubSubEvents>` di `@graphql-yoga/subscription`. **Il test `test/harness/character-changestream.int-spec.ts` pubblica `change.fullDocument` grezzo** e va aggiornato insieme (altrimenti `tsc`/ts-jest fallisce).
- MongoMemoryReplSet (count 1) supporta i change stream: `test/harness/character-changestream.int-spec.ts` lo dimostra [VERIFIED].
- **Impatto sull'harness:** `AuthModule` importa `UsersModule` → appena `UserUpdatesPublisher` inietta `PUB_SUB`, `createAuthTestApp` (che non importa `PubSubModule`) fallisce la risoluzione DI in **tutti** i test auth esistenti [VERIFIED: `test/auth/auth-test-app.ts` imports + `src/auth/auth.module.ts`]. Wave 0: aggiungere `PubSubModule` agli import di base dell'harness.

### Q4 — Ownership (D-08..D-11)
- Le request non cambiano: `TransactionRequest.id`, `EquipItemRequest.id`, `EquipSpellRequest.id`, `UseSpellRequest.characterId`; query `character(id)`, `equipment(id)`, `pendingQuest(id)`; subscription `characterUpdated(id)` [VERIFIED: `src/models/request/*.ts`, resolver].
- **Raccomandato:** decorator composti `@OwnsCharacter(selector)` / `@OwnsPendingQuest(selector)` = `SetMetadata(OWNERSHIP_KEY, rule)` + `UseGuards(OwnershipGuard)`; il selettore (`({ request }) => request.id`) è tipizzato e dichiarativo; nessuna logica nei resolver; lo stesso decorator protegge mutation, query e la subscription `characterUpdated`.
- `CharacterAccessPolicy.authorizeCharacter(identity, characterId)`: **una** lettura `users.findById(userId, { currentCharacter: 1 }).lean()`; uguale → owner; diverso + innkeeper → on-behalf; altrimenti check di esistenza del character (solo in questo ramo) → `NOT_FOUND` se assente, `FORBIDDEN` se esiste (D-11, nessuna mascheratura). L'enumerazione degli ObjectId che ne deriva è accettata da D-11.
- `pendingQuest(id)`: innkeeper → passa senza letture (query, non auditata); altrimenti `users` → `characters.findById(currentCharacter, { 'quests.pendingQuest': 1 }).lean()` → confronto con `String(...)`; mismatch → esistenza della pending quest → `NOT_FOUND`/`FORBIDDEN`.
- I ref sono `Types.ObjectId` usati come `type` → salvati come `Mixed`/ObjectId senza cast (trappola D-20 di 02.1): confrontare sempre con `String(value) === id`.
- Id malformati: `Types.ObjectId.isValid` accetta qualunque stringa di 12 caratteri [ASSUMED: comportamento noto di bson]. Usare `/^[0-9a-f]{24}$/i` e trattare il malformato come `NOT_FOUND` (oggi `findById('abc')` produce un CastError → `INTERNAL_SERVER_ERROR`) [ASSUMED: non provato sul wire].
- Passaggio della decisione all'audit: guard e interceptor ricevono **lo stesso** array `args` (`fnCanActivate(args)` poi `interceptorsConsumer.intercept(interceptors, args, …)`) [VERIFIED: `@nestjs/core/helpers/external-context-creator.js`], quindi `GqlExecutionContext.getInfo()` è lo stesso oggetto: una `WeakMap<GraphQLResolveInfo, OnBehalfDecision>` in un provider singleton (`AuthorizationDecisions`) collega guard → interceptor per campo, anche con più mutation aliasate nella stessa operazione (che condividono `req`, quindi `req` non va usato come chiave).

### Q5 — `@Roles` e ordine rispetto ad `AuthGuard`
- Gli `APP_GUARD` sono applicati nell'ordine di scansione dei moduli (`applicationProvidersApplyMap`, inserimento durante lo scan) [VERIFIED: `@nestjs/core/scanner.js`]: un secondo `APP_GUARD` in un altro modulo dipende dall'ordine degli import, fragile.
- **Raccomandato:** `@Roles(...roles)` = `applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard))`. Un guard a livello di metodo gira **sempre dopo** i guard globali [VERIFIED: `context-creator.js`], quindi `req.user` è già valorizzato. `RolesGuard` resta comunque fail-closed: identità assente → `AuthException.unauthenticated()`.
- `RolesGuard` legge i metadata con `reflector.getAllAndOverride(ROLES_KEY, [handler, class])`; in questa fase solo a livello di metodo (con `@Roles` sia su classe sia su metodo il guard girerebbe due volte: innocuo ma inutile).
- I guard usati con `@UseGuards(Classe)` vengono istanziati nell'injector del modulo che ospita il resolver: le loro dipendenze (`CharacterAccessPolicy`, `AuthorizationDecisions`) devono essere esportate da `AuthzModule` e `AuthzModule` importato da `CharactersModule`, `UsersModule`, `PendingQuestsModule` [CITED: docs.nestjs.com/guards — binding guards; ASSUMED per il dettaglio dell'injector].
- Identità: `req.user` (HTTP REST e GraphQL HTTP) o `ctx.req.user` (GraphQL, anche WS dove `req = extra.request`) [VERIFIED: `AuthGuard`, `CurrentUser`, `buildGraphQLContext`]. Boy Scout: estrarre `readRequestIdentity(context)` in `src/auth/request-identity.ts` e riusarlo in `CurrentUser`, `RolesGuard`, `OwnershipGuard` e nell'interceptor.

### Q6 — Audit interceptor
- Gli interceptor globali girano su **ogni** resolver (query, mutation, subscription) [VERIFIED: probe, `seen = ['Subscription.probe']`] e un pass-through non rompe l'iteratore della subscription [VERIFIED: probe snapshot + live con `APP_INTERCEPTOR`].
- Condizione d'audit: `context.getType() === 'graphql'` **e** `info.parentType.name === 'Mutation'` **e** (`ROLES_KEY` include `innkeeper` **oppure** `AuthorizationDecisions` ha una decisione on-behalf per `info`).
- I guard girano prima degli interceptor: un non-innkeeper rifiutato da `@Roles` non produce record (l'audit registra le azioni admin, non i tentativi) [VERIFIED: ordine in `external-context-creator.js`].
- Record (D-17): `at`, `actor` dall'identità, `action = info.fieldName` (stabile, uguale allo schema), `target`, `args = gql.getArgs()` così come ricevuti, `outcome = 'ok' | <codice>`; codice d'errore: `extensions.code` dell'eccezione → altrimenti nome dello status HTTP → altrimenti `INTERNAL_SERVER_ERROR`.
- `target`: on-behalf → `{ type: 'Character', id }` dal guard; `@Roles` senza id naturale → default `{ type: <nome del tipo di ritorno>, id: args.id ?? null }`, sovrascrivibile in futuro con un `@AuditTarget(type, selector)` opzionale (non serve ora).
- TTL: `AdminAuditLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })` (= 7 776 000), stesso stile di `SessionSchema`/`LoginTicketSchema` [VERIFIED: modelli esistenti]. Il monitor TTL di MongoDB passa circa ogni 60 secondi: la cancellazione è approssimata [CITED: mongodb.com/docs/manual/core/index-ttl].
- D-19: `AdminAuditLogService.record()` non lancia mai (catch + `logger.error`). Raccomando di **attendere** la scrittura dentro la pipeline rxjs (`concatMap`) prima di restituire l'esito: l'esito non cambia comunque, i test diventano deterministici e nessun record si perde allo shutdown; la latenza aggiunta riguarda solo le rare azioni admin. Il fire-and-forget puro resta un'alternativa valida (i test dovrebbero fare polling). Nessuna ragione emersa per il fail-closed.

### Q7 — Rimozione di `createUser`/`updateUser`/`deleteUser` e `UserInput`
- Consumatori di `UserInput` e di `UsersService.create/update/delete`: solo `users.resolver.ts` e `users.service.ts` [VERIFIED: grep su `src/` e `test/`]. Rimozione sicura di mutation, metodi e `UserInput` (Boy Scout).
- **Trappola:** `test/app.int-spec.ts` usa `CREATE_INTRUDER = mutation { createUser(...) }` per provare che una mutation senza bearer è `UNAUTHENTICATED`; dopo la rimozione la richiesta fallisce in **validazione** (`GRAPHQL_VALIDATION_FAILED`), non nel guard → il test va riscritto con una mutation esistente (es. `doTransaction`) e affiancato da `expect(schema).not.toContain('createUser(')` [VERIFIED: sorgente del test].
- Rigenerazione: `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (boot del vero `AppModule`, Redis effimero) poi commit di `src/schema.gql`; CI: `git diff --exit-code src/schema.gql` [VERIFIED: `.github/workflows/ci.yml`].

### Q8/Q9 — Test e ordine delle wave: vedi §Validation Architecture e §Ordine delle wave raccomandato.

## Standard Stack

### Core (tutto già installato, nessuna installazione)
| Library | Version (installata) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/core / common | 11.1.6 | `applyDecorators`, `SetMetadata`, `UseGuards`, `Reflector`, `APP_INTERCEPTOR` | primitive ufficiali per authz e interceptor |
| @nestjs/graphql | 13.2.0 | `GqlExecutionContext`, `@Subscription` | già in uso |
| @nestjs/apollo | 13.1.0 | driver; `formatError` solo HTTP | già in uso |
| @graphql-yoga/subscription | 5.0.5 | `createPubSub`, `pipe`, `filter`, `Repeater` (re-export di `@repeaterjs/repeater` 3.0.6) | snapshot + filtro senza dipendenze nuove |
| graphql-ws | 6.0.6 | trasporto WS (server via `@nestjs/graphql`, client nei test) | già in uso |
| graphql | 16.11.0 | `subscribe`/`createSourceEventStream` | — |
| mongoose / @nestjs/mongoose | 8.18.1 / 11.0.3 | change stream, schema audit, indice TTL | già in uso |
| rxjs | 7.8.x | pipeline dell'interceptor (`concatMap`, `catchError`, `from`, `throwError`) | già dipendenza di Nest |

### Supporting (test)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jest / ts-jest | 30 / 29 | progetti `unit` / `integration` | tutti i test |
| mongodb-memory-server | 11.2.0 (binario locale mongod 8.2.6, CI 8.0.4) | replica set per change stream e transazioni | integration |
| ws + graphql-ws client | 8.x / 6.0.6 | subscription reali | test WS |
| supertest | 7 | GraphQL HTTP | integration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `subscribeWithSnapshot` (Repeater) | async generator | perde eventi durante lo snapshot e non si chiude a vuoto (leak verificato) |
| `subscribeWithSnapshot` | `Repeater.merge` | ordine non garantito snapshot/live |
| `@Roles` composto con `UseGuards` | secondo `APP_GUARD` | ordine dipendente dalla scansione dei moduli |
| filtro yoga nel metodo | opzione `filter` di `@Subscription` | il filtro Nest si applica anche allo snapshot e richiede di leggere l'identità dal `context` non tipizzato; accettabile ma meno pulito |
| topic singolo + filtro | topic per id (`publish('userUpdated', userId, payload)`) | ottimizzazione possibile, inutile su canale singolo; D-02 descrive il filtro |
| `nest-access-control` / CASL | — | sovradimensionati per un solo ruolo admin e una regola di ownership |

**Installazione:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth/
│   └── request-identity.ts              # readRequestIdentity(context): unica estrazione (CurrentUser, guard, interceptor)
├── authz/
│   ├── authz.module.ts                  # forFeature(User, Character, PendingQuest, AdminAuditLog); APP_INTERCEPTOR; exports policy + decisions
│   ├── authorization-error-code.enum.ts # FORBIDDEN (+ NOT_FOUND se si accetta Open Question 1)
│   ├── authorization.exception.ts       # extends ForbiddenException, extensions.code
│   ├── roles/roles.decorator.ts         # ROLES_KEY, Roles(...)
│   ├── roles/roles.guard.ts
│   ├── ownership/ownership.decorators.ts        # OwnsCharacter, OwnsPendingQuest, OWNERSHIP_KEY
│   ├── ownership/ownership.guard.ts
│   ├── ownership/character-access.policy.ts     # authorizeCharacter, authorizePendingQuest, mayReceiveCharacterEvent
│   ├── ownership/authorization-decisions.ts     # WeakMap<info, OnBehalfDecision>
│   └── audit/
│       ├── admin-audit-log.model.ts     # collection admin_audit_logs, TTL 90 giorni
│       ├── admin-audit-log.service.ts   # record(): best-effort, non lancia
│       └── admin-audit.interceptor.ts
├── graphql/
│   └── subscribe-with-snapshot.ts
├── users/
│   ├── user-updates.publisher.ts        # change stream users → PUB_SUB
│   └── users.resolver.ts                # + userUpdated, − CRUD, @Roles su users/user
└── pubsub.module.ts                     # PubSubEvents con payload corretti
test/
├── auth/auth-test-app.ts                # + PubSubModule tra gli import di base
├── auth/ws-test-client.ts               # + openSubscription (coda di risultati con timeout)
├── authz/characters-test-app.ts         # CharactersService/Resolver con coda Bull finta, senza Redis
└── authz/admin-probe.resolver.ts        # mutation @Roles solo-test per l'audit
```

### Pattern 1: eccezione di autorizzazione tipizzata
```typescript
// Modello: src/auth/auth.exception.ts, src/characters/creation/character-creation.exception.ts
import { ForbiddenException } from '@nestjs/common';
import { AuthorizationErrorCode } from 'src/authz/authorization-error-code.enum';

export class AuthorizationException extends ForbiddenException {
    readonly code: AuthorizationErrorCode;
    readonly extensions: { code: AuthorizationErrorCode };

    private constructor(message: string) {
        const code = AuthorizationErrorCode.FORBIDDEN;
        super({ statusCode: 403, error: 'Forbidden', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions anche su WS, dove formatDomainError non gira
        this.extensions = { code };
    }

    static notOwner(): AuthorizationException {
        return new AuthorizationException('Questo personaggio non ti appartiene');
    }

    static innkeeperOnly(): AuthorizationException {
        return new AuthorizationException('Operazione riservata al locandiere');
    }
}
```
`formatDomainError` già accetta qualunque `HttpException` con `extensions.code` stringa: nessuna modifica [VERIFIED: `src/graphql/format-domain-error.ts`]. Il testo dei messaggi è un esempio [ASSUMED]: il FE mappa il codice, mai il messaggio.

### Pattern 2: snapshot su subscribe
```typescript
// src/graphql/subscribe-with-snapshot.ts — verificato con probe (ordine, teardown, errore alla subscribe)
import { Repeater } from '@graphql-yoga/subscription';

// il Repeater del PubSub aggancia il listener solo al primo next(): va forzato PRIMA di leggere lo snapshot
export async function subscribeWithSnapshot<T>(
    live: AsyncIterable<T>,
    loadSnapshot: () => Promise<T>,
): Promise<AsyncIterableIterator<T>> {
    const iterator = live[Symbol.asyncIterator]();
    const firstLive = iterator.next();
    let snapshot: T;
    try {
        snapshot = await loadSnapshot();
    } catch (error) {
        await iterator.return?.();
        throw error;
    }
    return new Repeater<T>(async (push, stop) => {
        void stop.then(() => iterator.return?.());
        await push(snapshot);
        for (let result = await firstLive; !result.done; result = await iterator.next()) {
            await push(result.value);
        }
        stop();
    });
}
```

### Pattern 3: le due subscription
```typescript
// src/users/users.resolver.ts
@Subscription(() => User, { name: 'userUpdated' })
userUpdated(@CurrentUser() identity: AuthIdentity) {
    const live = pipe(
        this.pubSub.subscribe('userUpdated'),
        filter(({ userUpdated }) => documentIdOf(userUpdated) === identity.userId),
    );
    return subscribeWithSnapshot(live, async () => ({
        userUpdated: await this.usersService.findOne(identity.userId),
    }));
}

// src/characters/characters.resolver.ts — firma GraphQL invariata: characterUpdated(id: String!): Character!
@OwnsCharacter<{ id: string }>(({ id }) => id)
@Subscription(() => Character, { name: 'characterUpdated' })
characterUpdated(@Args('id') id: string, @CurrentUser() identity: AuthIdentity) {
    const live = pipe(
        this.pubSub.subscribe('characterUpdated'),
        filter(async ({ characterUpdated }) =>
            documentIdOf(characterUpdated) === id &&
            (await this.characterAccess.mayReceiveCharacterEvent(identity, id)),
        ),
    );
    return subscribeWithSnapshot(live, async () => ({
        characterUpdated: await this.charactersService.findOne(id),
    }));
}
```
`documentIdOf(doc) = String(doc._id)`: i payload sono documenti idratati da `findOne`; l'`idTransformPlugin` è registrato solo nel costruttore di `AppModule` e non nell'harness, quindi non affidarsi a `toJSON`. `mayReceiveCharacterEvent` = innkeeper → `true`; altrimenti una lettura `users.currentCharacter` confrontata con `id`; **try/catch → `false`** (un predicato che lancia chiude lo stream). La lettura avviene solo per gli eventi del personaggio sottoscritto e solo per i subscriber non innkeeper (di norma uno).

### Pattern 4: decorator composti e guard
```typescript
// src/authz/roles/roles.decorator.ts
export const ROLES_KEY = 'authz:roles';
export const Roles = (...roles: RoleType[]) =>
    applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard));

// src/authz/roles/roles.guard.ts
canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleType[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
    ]);
    if (!roles?.length) return true;
    const identity = readRequestIdentity(context);
    if (!identity) throw AuthException.unauthenticated();
    if (!roles.includes(identity.role)) throw AuthorizationException.innkeeperOnly();
    return true;
}

// src/authz/ownership/ownership.decorators.ts
export const OwnsCharacter = <A>(selectId: (args: A) => string) =>
    applyDecorators(
        SetMetadata(OWNERSHIP_KEY, { resource: OwnedResource.character, selectId }),
        UseGuards(OwnershipGuard),
    );

// src/authz/ownership/ownership.guard.ts
async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.get<OwnershipRule | undefined>(OWNERSHIP_KEY, context.getHandler());
    if (!rule) return true;
    const identity = readRequestIdentity(context);
    if (!identity) throw AuthException.unauthenticated();
    const gql = GqlExecutionContext.create(context);
    const targetId = rule.selectId(gql.getArgs());
    const access = await this.policy.authorize(identity, rule.resource, targetId);
    if (access === ResourceAccess.onBehalf) {
        this.decisions.recordOnBehalf(gql.getInfo(), { type: 'Character', id: targetId });
    }
    return true;
}
```
Applicazione: `doTransaction`/`equipItem`/`equipSpell`/`unequipSpell` → `({ request }) => request.id`; `useSpell` → `({ request }) => request.characterId`; `character`/`equipment`/`characterUpdated` → `({ id }) => id`; `pendingQuest` → `@OwnsPendingQuest(({ id }) => id)`; `@Roles(RoleType.innkeeper)` su `users`, `user`, `characters`, `pendingQuests`. `OwnershipGuard` lavora solo in contesto GraphQL (nessuna ownership su REST in questa fase).

### Pattern 5: policy con una sola lettura
```typescript
async authorizeCharacter(identity: AuthIdentity, characterId: string): Promise<ResourceAccess> {
    const currentCharacterId = await this.readCurrentCharacterId(identity.userId); // findById(..., { currentCharacter: 1 }).lean()
    if (currentCharacterId === characterId) return ResourceAccess.owner;
    if (identity.role === RoleType.innkeeper) return ResourceAccess.onBehalf;
    await this.assertCharacterExists(characterId); // NOT_FOUND (D-11), id malformato compreso
    throw AuthorizationException.notOwner();
}
```
`guard` e `adventurer` seguono lo stesso ramo (D-13). Un innkeeper senza personaggio agisce sempre "on behalf": corretto.

### Pattern 6: audit
```typescript
// src/authz/audit/admin-audit-log.model.ts
export const ADMIN_AUDIT_LOG_TTL_SECONDS = 60 * 60 * 24 * 90;

@Schema({ _id: false })
export class AuditActor { /* @Prop userId, twitchId, role: String required */ }

@Schema({ _id: false })
export class AuditTarget {
    @Prop({ type: String, required: true }) type: string; // in una sotto-classe: niente ambiguità con la chiave `type` di Mongoose
    @Prop({ type: String, default: null }) id: string | null;
}

@Schema({ collection: 'admin_audit_logs', versionKey: false })
export class AdminAuditLog {
    @Prop({ type: Date, required: true }) at: Date;
    @Prop({ type: AuditActorSchema, required: true }) actor: AuditActor;
    @Prop({ type: String, required: true }) action: string;
    @Prop({ type: AuditTargetSchema, required: true }) target: AuditTarget;
    @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) args: Record<string, unknown>;
    @Prop({ type: String, required: true }) outcome: string;
}
export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);
AdminAuditLogSchema.index({ at: 1 }, { expireAfterSeconds: ADMIN_AUDIT_LOG_TTL_SECONDS });

// src/authz/audit/admin-audit.interceptor.ts (APP_INTERCEPTOR in AuthzModule)
intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entry = this.pendingEntryOf(context); // null se non GraphQL, non Mutation, né @Roles(innkeeper) né on-behalf
    if (!entry) return next.handle();
    return next.handle().pipe(
        concatMap(async (result) => {
            await this.auditLog.record({ ...entry, outcome: AUDIT_OUTCOME_OK });
            return result;
        }),
        catchError((error: unknown) =>
            from(this.auditLog.record({ ...entry, outcome: outcomeCodeOf(error) })).pipe(
                concatMap(() => throwError(() => error)),
            ),
        ),
    );
}
```
Nessun `@ObjectType` su `AdminAuditLog`: non entra in `schema.gql` (D-18).

### Ordine delle wave raccomandato (vincolo D-07)
| Wave | Plan | Contenuto | Note |
|------|------|-----------|------|
| 1 | 03-01 | Wave 0: `PubSubModule` nell'harness; `openSubscription` in `ws-test-client.ts`; `test/authz/characters-test-app.ts`; `PubSubEvents` corretti + fix di `character-changestream.int-spec.ts` e di `CharactersService` (tipo PubSub); `readRequestIdentity` + refactor di `CurrentUser`; `AuthorizationException` + codici; `subscribeWithSnapshot` + unit | sblocca tutto |
| 1 | 03-02 | `UserUpdatesPublisher` + `userUpdated` (snapshot, filtro) + test WS | dipende da 03-01 |
| 1 | 03-03 | `CharacterAccessPolicy` (ramo character), `OwnershipGuard` + `@OwnsCharacter` sulla sola `characterUpdated` + snapshot + filtro per evento; rigenerazione e commit di `src/schema.gql`; sezione "wave 1" del BACKEND-NOTES | **chiude il contratto FE** |
| 2 | 03-04 | `@OwnsCharacter` su mutation e query, `@OwnsPendingQuest`, `AuthorizationDecisions` | riusa la policy di 03-03 |
| 2 | 03-05 | `@Roles` + `RolesGuard`, applicazione, rimozione CRUD/`UserInput`, `app.int-spec.ts` aggiornato (intruder, whitelist innkeeper-only) | indipendente da 03-04 sui file, ma gli executor sono sequenziali (memoria progetto) |
| 3 | 03-06 | Audit: modello TTL, service, interceptor, probe admin, test | dipende da 03-04 (decisioni) e 03-05 (metadata `@Roles`) |
| 3 | 03-07 | Rigenerazione finale dello schema, BACKEND-NOTES completo (codici reali, wire degli errori WS, convenzione Phase 7–9), verifica | ultimo |

### Anti-Patterns to Avoid
- **Async generator per lo snapshot:** eventi persi e listener che non si stacca (verificato).
- **Leggere lo snapshot prima di agganciare il live:** finestra di eventi persi.
- **Predicato del filtro che può lanciare:** lo stream si chiude con errore; avvolgere e restituire `false`.
- **Flag sul `req` per passare la decisione all'audit:** più campi root nella stessa operazione condividono `req`.
- **Secondo `APP_GUARD` per i ruoli:** ordine fragile.
- **Interceptor globale senza filtro sull'operazione:** registrerebbe query e subscription.
- **Ownership dentro i service:** duplicazione e accoppiamento all'identità; i service restano agnostici.
- **`GraphQLError` o sottoclassi:** vietato dal progetto (log di stack, codici persi).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Iteratore asincrono con teardown | classe `AsyncIterator` a mano / generator | `Repeater` (`@graphql-yoga/subscription`) | `return()` immediato, buffer, gestione di stop ed errori |
| Filtro e map sugli eventi | wrapper custom | `pipe` + `filter` di `@graphql-yoga/subscription` | già installati, lazy coerente con il PubSub |
| Metadata e composizione dei decorator | registri globali | `SetMetadata` + `applyDecorators` + `Reflector` | standard Nest, letti anche dall'interceptor |
| Scadenza dei log | job di pulizia | indice TTL Mongo | zero codice, nessuno scheduler |
| Ordine dei guard | logica di priorità | guard a livello di metodo dopo il globale | garantito da `@nestjs/core` |
| Formattazione degli errori su HTTP | mapping per resolver | `formatDomainError` esistente | accetta già ogni `HttpException` codificata |

**Key insight:** ogni pezzo della fase ha un'implementazione di riferimento già nel repo (`AuthException`, `CharactersService.onModuleInit`, `SessionSchema.index(...)`, `AuthProbeResolver`, l'enumerazione `EXPECTED_PUBLIC_HANDLERS`): la fase è composizione, non invenzione.

## Runtime State Inventory

La fase rimuove mutation dallo schema e aggiunge una collection; nessuna rinomina.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Nessun dato da migrare. La nuova collection `admin_audit_logs` e il suo indice TTL nascono al boot (`autoIndex` di Mongoose attivo per default; `MongoModule` non lo disabilita, verificato). Utenti già creati via `createUser` restano validi | nessuna |
| Live service config | Nessuna: nessun servizio esterno legato a `createUser`/`updateUser`/`deleteUser` (il FE non le usa, CONTEXT) | nessuna |
| OS-registered state | Nessuno (verificato: niente scheduler, pm2 o unit nel repo) | nessuna |
| Secrets/env vars | Nessuna variabile nuova; `DEV_AUTH_ROLE` già esistente serve a provare l'innkeeper in locale | nessuna |
| Build artifacts | `src/schema.gql` cambia (aggiunta di `userUpdated`, rimozione di `createUser`/`updateUser`/`deleteUser`/`input UserInput`) e va rigenerato e committato due volte (fine wave 1, fine fase) | rigenerazione + commit |

## Common Pitfalls

### Pitfall 1: harness senza `PubSubModule`
**What goes wrong:** tutti i test auth falliscono con "Nest can't resolve dependencies … PUB_SUB".
**Why it happens:** `AuthModule` importa `UsersModule`, che ora inietta `PUB_SUB`; `createAuthTestApp` non importa `PubSubModule`.
**How to avoid:** primo task della Wave 0: `PubSubModule` tra gli import di base dell'harness.
**Warning signs:** errori di DI in `ws-auth.int-spec.ts`, `login-flow.int-spec.ts`, ecc. subito dopo aver toccato `UsersModule`.

### Pitfall 2: Repeater lazy, eventi persi
**What goes wrong:** l'aggiornamento avvenuto durante la lettura dello snapshot non arriva mai.
**How to avoid:** `subscribeWithSnapshot` (chiama `next()` prima della lettura). Test: un update eseguito dentro `loadSnapshot` finto (unit) deve comparire dopo lo snapshot.

### Pitfall 3: generator appeso al teardown
**What goes wrong:** listener e closure restano vivi dopo `complete`/chiusura del socket finché non arriva un evento.
**How to avoid:** restituire un `Repeater`. Test unit: `return()` a vuoto risolve e una `publish` successiva non arriva a nessuno.

### Pitfall 4: errore alla subscribe atteso come messaggio `error`
**What goes wrong:** un test o il FE aspettano `sink.error`; arriva invece `next` con `errors` e poi `complete`.
**How to avoid:** helper di test che raccoglie i risultati con `iterate()` e asserisce `{ errors: [{ extensions: { code: 'FORBIDDEN' } }] }` seguito da `done`. Documentarlo nel BACKEND-NOTES (il FE non deve ritentare).

### Pitfall 5: `NOT_FOUND` che in realtà è `INTERNAL_SERVER_ERROR`
**What goes wrong:** `NotFoundException` su GraphQL HTTP esce come `{ code: 'INTERNAL_SERVER_ERROR', status: 404, originalError: {...} }` (verificato); su WS esce senza codice. Il contratto "403 vs 404" promesso al FE non è distinguibile per codice.
**How to avoid:** Open Question 1 — eccezione tipizzata `NOT_FOUND` nella policy (e, se il planner lo accetta, in `CharactersService`/`PendingQuestsService` come Boy Scout). Il caso `formatDomainError.spec` con `code: 'NOT_FOUND'` usa un input inventato e non riflette il wire.

### Pitfall 6: `CREATE_INTRUDER` in `test/app.int-spec.ts`
**What goes wrong:** dopo la rimozione di `createUser` il test "rejects an existing mutation without a bearer" fallisce con `GRAPHQL_VALIDATION_FAILED`.
**How to avoid:** sostituirla con `doTransaction` e aggiungere le asserzioni sullo schema (`not.toContain('createUser(')`, `toContain('userUpdated: User!')`).

### Pitfall 7: `PubSubEvents` e harness del change stream
**What goes wrong:** correggendo il tipo del payload, `test/harness/character-changestream.int-spec.ts` (che pubblica `change.fullDocument` grezzo) non compila più.
**How to avoid:** aggiornare test e tipo nello stesso task.

### Pitfall 8: `CharactersModule` richiede Bull/Redis
**What goes wrong:** importare `CharactersModule` nell'harness richiede `BullModule.forRoot` e Redis.
**How to avoid:** `test/authz/characters-test-app.ts` registra `CharactersService` + `CharactersResolver` come `providers` con `{ provide: getQueueToken('spell-recovery'), useValue: { add: jest.fn() } }`, `MongooseModule.forFeature([Character, Spell])` e `AuthzModule` negli `imports` (stile D-21 di 02.1, nessun Redis). Il change stream di `CharactersService` si apre (replica set disponibile) e si chiude con `app.close()`.

### Pitfall 9: change stream non ancora pronto nei test
**What goes wrong:** un update eseguito subito dopo il boot può precedere l'apertura del cursore → evento perso, test intermittente.
**How to avoid:** sottoscrivere via WS e attendere lo **snapshot** prima di scrivere (a quel punto il cursore è aperto da tempo); per i test diretti sul publisher, attendere un breve intervallo o un evento sentinella. Il probe ha usato 300 ms di attesa [VERIFIED].

### Pitfall 10: chiave `type` nei sotto-documenti Mongoose
**What goes wrong:** `target: { type: String, id: String }` inline viene letto da Mongoose come "il campo è una String".
**How to avoid:** sotto-schema dedicato (`AuditTarget` con `@Prop({ type: String }) type`), come nel Pattern 6.

### Pitfall 11: pulizia del DB nei test con la connessione Nest
**What goes wrong:** `after-env.ts` svuota solo la connessione mongoose di default; l'harness usa la connessione di Nest (Pitfall 9 di 02-RESEARCH).
**How to avoid:** `harness.clearDatabase()` in `afterEach` (già lo fa per tutte le collection, inclusa `admin_audit_logs`).

### Pitfall 12: prova negativa "nessun evento" con sleep
**What goes wrong:** test lenti o flaky con attese fisse.
**How to avoid:** tecnica a evento sentinella: aggiornare prima il personaggio/utente altrui, poi il proprio; il primo evento ricevuto dopo lo snapshot deve essere quello proprio.

### Pitfall 13: tooling
`npm run lint` vietato; `dart format`/prettier solo sui file toccati; jest con i path prima di `--selectProjects`; dirlo esplicitamente agli executor (memoria progetto).

## Code Examples

### Helper di test per subscription multi-evento (Wave 0)
```typescript
// test/auth/ws-test-client.ts — accanto a subscribeOnce
export interface OpenSubscription<T> {
    next(timeoutMs?: number): Promise<IteratorResult<ExecutionResult<T>>>;
    dispose(): Promise<void>;
}

export function openSubscription<T>(
    url: string,
    connectionParams: Record<string, unknown>,
    payload: { query: string; variables?: Record<string, unknown> },
): OpenSubscription<T> {
    const client = createClient({ url, webSocketImpl: WebSocket, connectionParams, retryAttempts: 0, lazy: true });
    const iterator = client.iterate<T>(payload);
    return {
        next: (timeoutMs = DEFAULT_TIMEOUT_MS) => withTimeout(iterator.next(), timeoutMs), // timer sempre ripulito
        async dispose() {
            await iterator.return?.();
            await client.dispose();
        },
    };
}
```

### Asserzione dell'indice TTL (modello: `session.service.int-spec.ts:682`)
```typescript
expect(AdminAuditLogModel.schema.indexes()).toContainEqual([
    { at: 1 },
    expect.objectContaining({ expireAfterSeconds: 7_776_000 }),
]);
await AdminAuditLogModel.init();
const indexes = await AdminAuditLogModel.collection.indexes();
expect(indexes).toContainEqual(expect.objectContaining({ key: { at: 1 }, expireAfterSeconds: 7_776_000 }));
```

### Whitelist enumerata degli handler protetti (modello: `EXPECTED_PUBLIC_HANDLERS` in `test/app.int-spec.ts`)
```typescript
const EXPECTED_INNKEEPER_HANDLERS = [
    'CharactersResolver.characters',
    'PendingQuestsResolver.pendingQuests',
    'UsersResolver.user',
    'UsersResolver.users',
];
// stesso scanner di collectPublicHandlers, con ROLES_KEY; idem per OWNERSHIP_KEY:
// characterUpdated, character, equipment, doTransaction, equipItem, equipSpell, unequipSpell, useSpell, pendingQuest
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `subscriptions-transport-ws` | `graphql-ws` (`graphql-transport-ws`) | già adottato in Phase 2 | errori alla subscribe = `next` con `errors` + `complete` |
| `withFilter` di `graphql-subscriptions` | `pipe`/`filter` di `@graphql-yoga/subscription` o opzione `filter` di Nest | yoga 3+ | il progetto usa già il PubSub di yoga; `graphql-subscriptions` resta solo come import di tipo da eliminare |
| guard globali multipli in ordine di registrazione | guard di metodo composti con `applyDecorators` | Nest 7+ | ordine deterministico |

**Deprecated/outdated:**
- Import di `PubSub` da `graphql-subscriptions` in `CharactersService`: tipo sbagliato per un'istanza yoga; sostituire con `PubSub<PubSubEvents>` di `@graphql-yoga/subscription`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Repeater.merge` può emettere uno snapshot vecchio dopo un evento live più recente | Q1 | nessuno: l'alternativa raccomandata non dipende da questo |
| A2 | Il buffer del Repeater tollera fino a 1024 push pendenti | Q1 | trascurabile su canale singolo |
| A3 | L'evento `users` di `createCharacter` arriva solo al commit della transazione | Q3 | basso: coperto da un test d'integrazione raccomandato |
| A4 | `Types.ObjectId.isValid` accetta stringhe di 12 caratteri; `findById('abc')` oggi dà `INTERNAL_SERVER_ERROR` | Q4 | basso: la regex esadecimale a 24 caratteri è corretta comunque |
| A5 | Le dipendenze dei guard in `@UseGuards` si risolvono nell'injector del modulo ospite (serve importare `AuthzModule`) | Q5 | medio: se sbagliato, errore di DI evidente al boot dei test (non silenzioso) |
| A6 | Testo dei messaggi italiani di `FORBIDDEN` | Pattern 1 | basso: il FE mappa i codici; testo da confermare in review |
| A7 | Attendere la scrittura dell'audit è compatibile con D-19 ("asincrona rispetto all'esito") | Q6 | basso: l'esito non cambia mai; in alternativa fire-and-forget con test a polling |

## Open Questions

1. **`NOT_FOUND` reale sul wire (D-11)**
   - What we know: oggi `NotFoundException` su GraphQL HTTP esce come `INTERNAL_SERVER_ERROR` + `status: 404` + `originalError` esposto (verificato); su WS senza codice. La bozza di BACKEND-NOTES promette `NOT_FOUND`.
   - What's unclear: se l'utente intendeva "NOT_FOUND come codice" o "come comportamento (404 su REST)".
   - Recommendation: aggiungere `NOT_FOUND` a `AuthorizationErrorCode` con una `ResourceNotFoundException extends NotFoundException` codificata, usata dalla policy (id inesistente o malformato); valutare come Boy Scout la sostituzione dei `NotFoundException` in `CharactersService`/`PendingQuestsService`/`UsersService.findOne`, così il contratto 403/404 è vero su HTTP e WS. Se il planner non lo accetta, il BACKEND-NOTES deve descrivere il comportamento reale.
2. **Endpoint REST Cloudinary** (`getUrls`, `getSubfoldersUrls`, `uploadImage`)
   - What we know: aperti a ogni autenticato; non citati da D-10/D-14.
   - Recommendation: fuori scope (BE-HARD/Phase 10); citarli nel BACKEND-NOTES come invariati.
3. **Mutation future "quest" e "travel" di BE-AUTHZ-01**
   - What we know: non esistono ancora (Phase 7/8).
   - Recommendation: la convenzione `@OwnsCharacter` + `@Roles` entra nel BACKEND-NOTES §3 e nel test enumerato degli handler, così le fasi future la estendono.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | 22.12.0 | — |
| npm | script | ✓ | 10.9.0 | — |
| mongod (mongodb-memory-server) | replica set nei test | ✓ | binario locale 8.2.6 (CI 8.0.4) | — |
| Redis | `test/app.int-spec.ts` (rigenerazione schema) | ✓ via redis-memory-server (binari in cache) | — | in CI service container `redis:7` |
| Pacchetti npm | tutto | ✓ installati | vedi Standard Stack | — |

**Missing dependencies with no fallback:** nessuna.
**Missing dependencies with fallback:** nessuna. (I probe d'integrazione di questa ricerca sono stati eseguiti con successo in locale.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29, progetti `unit` / `integration` (`package.json` → `jest.projects`) |
| Config file | `package.json`; setup integration in `test/setup/{global-setup,global-teardown,after-env,mongo-replset,redis}.ts` |
| Quick run command | `npx jest src/authz src/graphql src/auth/guards src/users --selectProjects unit` |
| Full suite command | `npm test` (= `test:unit` + `test:int --runInBand`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-SYNC-02 | `subscribeWithSnapshot`: ordine snapshot → evento pubblicato durante lo snapshot → live; errore dello snapshot rigettato alla subscribe e live chiuso; `return()` a vuoto risolve e stacca il listener | unit | `npx jest src/graphql/subscribe-with-snapshot.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-SYNC-01 | `userUpdated` sul wire: primo risultato = snapshot (`id twitchId twitchPoints role currentCharacter { id }`); dopo `updateOne($set twitchPoints)` arriva lo User aggiornato | integration (WS reale) | `npx jest src/users/user-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-SYNC-01 | update dell'utente B non arriva ad A (sentinella: update B poi A → il primo evento è A) | integration | idem | ❌ |
| BE-SYNC-01 | `createCharacter` → evento con `currentCharacter { id }`; cambio `role` a DB → evento con `role`; upsert no-op del login → nessun evento | integration | idem (+ `src/users/user-updates.publisher.int-spec.ts`) | ❌ |
| BE-SYNC-01 | publisher: chiude il change stream in `onModuleDestroy`; errore nel `findOne` loggato senza crash | unit/integration | `npx jest src/users/user-updates.publisher.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-SYNC-02 | ri-sottoscrizione (nuovo client dopo `dispose`) riceve di nuovo lo snapshot corrente, per entrambe le subscription | integration | user int-spec + `src/characters/character-updated.subscription.int-spec.ts` | ❌ |
| BE-AUTHZ-03 | `characterUpdated(id altrui)` da adventurer → `next` con `errors[0].extensions.code === 'FORBIDDEN'` poi `done`, nessuno snapshot | integration | `npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-AUTHZ-03 | proprietario: snapshot + eventi del proprio personaggio; eventi di altri personaggi non arrivano (sentinella) | integration | idem | ❌ |
| BE-AUTHZ-03 / D-05 | innkeeper sottoscrive un personaggio altrui: snapshot + eventi | integration | idem | ❌ |
| BE-AUTHZ-03 / D-04 | filtro per evento: `currentCharacter` azzerato a stream aperto → gli eventi successivi non arrivano | integration | idem | ❌ |
| BE-AUTHZ-03 | `mayReceiveCharacterEvent` fail-closed (lettura che lancia → `false`) | unit | `npx jest src/authz/ownership/character-access.policy.spec.ts --selectProjects unit` | ❌ |
| BE-AUTHZ-03 | `src/schema.gql` contiene `userUpdated: User!` e `characterUpdated(id: String!): Character!` | integration (boot reale) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` poi `git diff --exit-code src/schema.gql` | ✅ (da estendere) |
| BE-AUTHZ-01 | policy: owner / on-behalf (innkeeper) / FORBIDDEN (esiste) / NOT_FOUND (inesistente o malformato); `guard` trattato come adventurer; una sola lettura `users` | unit | `npx jest src/authz/ownership/character-access.policy.spec.ts --selectProjects unit` | ❌ |
| BE-AUTHZ-01 | `OwnershipGuard`: nessun metadata → passa; selettore applicato agli args; decisione on-behalf registrata su `info`; identità assente → `UNAUTHENTICATED` | unit | `npx jest src/authz/ownership/ownership.guard.spec.ts --selectProjects unit` | ❌ |
| BE-AUTHZ-01 | per ciascuna di `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`, `character`, `equipment`: altrui → `FORBIDDEN` (wire `extensions` uguale a `{ code: 'FORBIDDEN' }`) e DB invariato; proprietario → successo; innkeeper su altrui → successo | integration (`it.each`) | `npx jest src/characters/characters-ownership.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-AUTHZ-01 | id inesistente → codice NOT_FOUND concordato (Open Question 1) | integration | idem | ❌ |
| BE-AUTHZ-01 / D-10 | `pendingQuest(id)`: propria → ok; altrui → `FORBIDDEN`; innkeeper → ok | integration | `npx jest src/pendingQuests/pending-quests-authz.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-AUTHZ-02 | `RolesGuard`: senza metadata passa; innkeeper passa; adventurer e `guard` → `FORBIDDEN`; identità assente → `UNAUTHENTICATED` | unit | `npx jest src/authz/roles/roles.guard.spec.ts --selectProjects unit` | ❌ |
| BE-AUTHZ-02 | `users`, `user(id)`, `characters`, `pendingQuests`: adventurer → `FORBIDDEN`, innkeeper → dati; senza bearer → `UNAUTHENTICATED` (ordine dei guard) | integration | `npx jest src/authz/roles.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-AUTHZ-02 / D-14 | schema senza `createUser(`, `updateUser(`, `deleteUser(`, `input UserInput`; whitelist enumerata degli handler `@Roles` e `@Owns*`; intruder riscritto con `doTransaction` | integration (boot reale) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (da modificare) |
| BE-AUTHZ-04 | interceptor: ignora query/subscription/HTTP; registra mutation `@Roles(innkeeper)` e mutation on-behalf; outcome `ok` o codice; errore di scrittura dell'audit → loggato, esito invariato | unit | `npx jest src/authz/audit/admin-audit.interceptor.spec.ts --selectProjects unit` | ❌ |
| BE-AUTHZ-04 | innkeeper `equipItem` su personaggio altrui → un record con `actor`, `action: 'equipItem'`, `target { type: 'Character', id }`, `args` completi, `outcome: 'ok'`; sul proprio personaggio → nessun record; adventurer → nessun record | integration | `npx jest src/authz/audit/admin-audit.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-AUTHZ-04 | mutation `@Roles` del probe solo-test: successo e fallimento registrati (`outcome` = codice); non-innkeeper rifiutato → nessun record | integration | idem (con `test/authz/admin-probe.resolver.ts`) | ❌ |
| BE-AUTHZ-04 | indice TTL `{ at: 1 }` con `expireAfterSeconds: 7776000` presente nello schema e nella collection | unit + integration | idem | ❌ |
| BE-AUTHZ-01..04 | `AuthorizationException`: 403, `code`/`extensions` = `FORBIDDEN`, body; `formatDomainError` restituisce `{ code: 'FORBIDDEN' }` | unit | `npx jest src/authz/authorization.exception.spec.ts src/graphql/format-domain-error.spec.ts --selectProjects unit` | ❌ / ✅ |
| handoff | BACKEND-NOTES con le sezioni chiave | manual + grep | `grep -c "userUpdated\|FORBIDDEN\|snapshot\|@Roles\|admin_audit_logs" .planning/phases/03-autorizzazione-ownership-ruoli-audit/BACKEND-NOTES.md` | ✅ (bozza) |

### Sampling Rate
- **Per task commit:** `npx jest src/authz src/graphql src/auth src/users --selectProjects unit` più il singolo int-spec toccato con `--selectProjects integration --runInBand`.
- **Per wave merge:** `npm test`.
- **Phase gate:** `npm test` verde, `npx eslint <file toccati>` pulito, `npm run build` ok, `git diff --exit-code src/schema.gql` dopo il commit dello schema, prima di `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/auth/auth-test-app.ts`: `PubSubModule` tra gli import di base (Pitfall 1).
- [ ] `test/auth/ws-test-client.ts`: `openSubscription` (coda di risultati con timeout ripulito, `dispose`).
- [ ] `test/authz/characters-test-app.ts`: `CharactersService` + `CharactersResolver` con coda Bull finta e `AuthzModule`, senza Redis (Pitfall 8).
- [ ] `test/authz/admin-probe.resolver.ts`: mutation `@Roles(innkeeper)` solo-test (una che riesce, una che lancia un'eccezione codificata).
- [ ] `src/pubsub.module.ts` + `test/harness/character-changestream.int-spec.ts` + `CharactersService` (tipo PubSub) allineati (Pitfall 7).
- [ ] Fixture: helper per un utente con personaggio (`persistUser` + `persistCharacter` + `currentCharacter`), probabilmente in `test/fixtures` o nei test-app.
- [ ] Spec RED: `subscribe-with-snapshot.spec.ts`, `authorization.exception.spec.ts`, `roles.guard.spec.ts`, `ownership.guard.spec.ts`, `character-access.policy.spec.ts`, `admin-audit.interceptor.spec.ts`.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (riuso) | guard globale deny-by-default di Phase 2; nessun nuovo `@Public()` (whitelist asserita in `test/app.int-spec.ts`) |
| V3 Session Management | no (invariata) | ruolo nel JWT come snapshot (D-12), TTL access token ~15 min |
| V4 Access Control | **yes, cuore della fase** | ownership server-side per ogni operazione sul personaggio, `@Roles` per l'admin, deny-by-default delle subscription, rifiuto alla subscribe + filtro per evento |
| V5 Input Validation | yes (limitato) | tipi GraphQL; id validati come ObjectId esadecimali a 24 caratteri nella policy |
| V6 Cryptography | no | — |
| V7 Error Handling & Logging | yes | codici stabili, nessun `originalError`/`stacktrace` sui percorsi d'autorizzazione; audit log persistente delle azioni admin |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR: mutation/query su un character id altrui | Elevation of Privilege | `@OwnsCharacter` + policy (una lettura di `currentCharacter`) |
| Ascolto degli eventi altrui passando l'id della vittima | Information Disclosure | rifiuto `FORBIDDEN` alla subscribe + filtro per evento fail-closed |
| Scrittura di `role`/`twitchPoints` via `createUser`/`updateUser` | Elevation of Privilege / Tampering | mutation rimosse dallo schema (D-14) |
| Lettura di liste globali (`users`, `characters`, `pendingQuests`) | Information Disclosure | `@Roles(innkeeper)` |
| Ripudio delle azioni admin | Repudiation | audit automatico con actor/args/outcome; TTL 90 giorni |
| Ruolo revocato ancora valido fino alla scadenza del JWT | Elevation of Privilege | accettato (D-12, un solo innkeeper, ~15 min) |
| Enumerazione di id via 404/403 | Information Disclosure | accettato da D-11 (ObjectId non sequenziali) |
| Flooding dell'audit log | DoS (costi) | solo azioni admin, TTL 90 giorni |
| Stream che si chiude per un predicato che lancia | DoS | predicato fail-closed con try/catch |
| Leak di listener per subscription chiuse | DoS (memoria) | `Repeater` con teardown immediato (verificato) |

## Sources

### Primary (HIGH confidence)
- `node_modules/@graphql-yoga/subscription/cjs/{create-pub-sub,operator/filter,operator/map,index}.js` — PubSub lazy, `pipe`/`filter`, re-export di `Repeater`
- `node_modules/@nestjs/apollo/dist/drivers/apollo-base.driver.js` — `subscriptionWithFilter`, `wrapFormatErrorFn`, mappa `apolloPredefinedExceptions` (400/401/403/422: 404 non presente)
- `node_modules/@nestjs/graphql/dist/{services/resolvers-explorer.service,services/gql-subscription.service,utils/async-iterator.util}.js` — wiring delle subscription e assenza di `formatError` su WS
- `node_modules/@nestjs/core/{helpers/external-context-creator,helpers/context-creator,guards/guards-context-creator,interceptors/interceptors-consumer,scanner}.js` — ordine global → class → method, stessi `args` per guard e interceptor, ordine degli `APP_GUARD`
- `node_modules/graphql/execution/subscribe.js`, `node_modules/graphql-ws/dist/server-3ewaJSjp.js` — errori alla subscribe → `next` + `complete`
- Probe d'integrazione eseguiti sull'harness reale e rimossi (wire HTTP/WS di FORBIDDEN e NotFound, snapshot via graphql-ws, interceptor globale sulle subscription, upsert no-op sul change stream `users`)
- Sorgenti del repo: resolver, service, modelli, harness di test, CI

### Secondary (MEDIUM confidence)
- docs.nestjs.com/guards, docs.nestjs.com/faq/request-lifecycle — binding dei guard e ordine (coerente con il sorgente letto)
- mongodb.com/docs/manual/core/index-ttl — cadenza del monitor TTL

### Tertiary (LOW confidence)
- Nessuna affermazione critica dipende da fonti non verificate (vedi Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tutto installato, versioni lette da `node_modules`.
- Architecture: HIGH — meccanismi critici (snapshot, errore alla subscribe, interceptor globale, ordine dei guard, args condivisi) verificati su sorgente e con probe.
- Pitfalls: HIGH — DI dell'harness, wire di `NotFound`, test intruder e tipo di `PubSubEvents` verificati sul codice.

**Research date:** 2026-10-14
**Valid until:** 2026-11-13 (stack stabile; ricontrollare se cambiano le versioni di `@nestjs/*`, `graphql-ws` o `@graphql-yoga/subscription`)
