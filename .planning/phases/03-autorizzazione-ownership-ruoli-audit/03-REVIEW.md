---
phase: 03-autorizzazione-ownership-ruoli-audit
reviewed: 2026-10-14T12:04:26Z
depth: standard
files_reviewed: 61
files_reviewed_list:
  - src/app.module.ts
  - src/auth/decorators/current-user.decorator.ts
  - src/auth/request-identity.spec.ts
  - src/auth/request-identity.ts
  - src/authz/audit/admin-audit-log.model.ts
  - src/authz/audit/admin-audit-log.service.spec.ts
  - src/authz/audit/admin-audit-log.service.ts
  - src/authz/audit/admin-audit.int-spec.ts
  - src/authz/audit/admin-audit.interceptor.spec.ts
  - src/authz/audit/admin-audit.interceptor.ts
  - src/authz/authorization-error-code.enum.ts
  - src/authz/authorization.exception.spec.ts
  - src/authz/authorization.exception.ts
  - src/authz/authz.module.ts
  - src/authz/ownership/authorization-decisions.spec.ts
  - src/authz/ownership/authorization-decisions.ts
  - src/authz/ownership/character-access.policy.spec.ts
  - src/authz/ownership/character-access.policy.ts
  - src/authz/ownership/owned-resource.ts
  - src/authz/ownership/ownership.decorators.ts
  - src/authz/ownership/ownership.guard.spec.ts
  - src/authz/ownership/ownership.guard.ts
  - src/authz/resource-not-found.exception.spec.ts
  - src/authz/resource-not-found.exception.ts
  - src/authz/roles/roles.decorator.ts
  - src/authz/roles/roles.guard.spec.ts
  - src/authz/roles/roles.guard.ts
  - src/characters/character-updated.subscription.int-spec.ts
  - src/characters/characters-ownership.int-spec.ts
  - src/characters/characters.module.ts
  - src/characters/characters.resolver.ts
  - src/characters/characters.service.spec.ts
  - src/characters/characters.service.ts
  - src/graphql/format-domain-error.spec.ts
  - src/graphql/subscribe-with-snapshot.spec.ts
  - src/graphql/subscribe-with-snapshot.ts
  - src/models/user.model.ts
  - src/mongo/document-id.spec.ts
  - src/mongo/document-id.ts
  - src/pendingQuests/pending-quests-authz.int-spec.ts
  - src/pendingQuests/pending-quests.module.ts
  - src/pendingQuests/pending-quests.resolver.ts
  - src/pendingQuests/pending-quests.service.ts
  - src/pubsub.module.ts
  - src/schema.gql
  - src/users/user-updated.subscription.int-spec.ts
  - src/users/user-updates.publisher.int-spec.ts
  - src/users/user-updates.publisher.ts
  - src/users/users-authz.int-spec.ts
  - src/users/users.module.ts
  - src/users/users.resolver.ts
  - src/users/users.service.ts
  - test/app.int-spec.ts
  - test/auth/auth-test-app.int-spec.ts
  - test/auth/auth-test-app.ts
  - test/auth/http-guard.int-spec.ts
  - test/auth/ws-test-client.ts
  - test/authz/admin-probe.resolver.ts
  - test/authz/characters-test-app.ts
  - test/authz/player-fixture.ts
  - test/harness/character-changestream.int-spec.ts
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-10-14T12:04:26Z
**Depth:** standard
**Files Reviewed:** 61
**Status:** issues_found

## Summary

Revisione del perimetro di autorizzazione introdotto in Phase 03: ownership sui personaggi (`@OwnsCharacter` / `OwnershipGuard` / `CharacterAccessPolicy`), ruoli (`@Roles` / `RolesGuard`), subscription filtrate per identità con snapshot (`userUpdated`, `characterUpdated` via `subscribeWithSnapshot`), eccezioni tipizzate FORBIDDEN / NOT_FOUND con `extensions.code`, e `AdminAuditInterceptor` globale con persistenza su `admin_audit_logs`.

Valutazione complessiva: **il perimetro regge**. Non è emerso alcun percorso che permetta a un non-proprietario di leggere o mutare il personaggio di un altro giocatore, né a un adventurer/guard di raggiungere operazioni riservate al locandiere. In particolare:

- **Identità su HTTP e WS**: `readRequestIdentity` legge sempre `req.user`; su WS `req` è l'`IncomingMessage` dell'upgrade (per socket) e `AuthGuard` vi scrive l'identità risolta in `onConnect` (`extra.identity`), con ricontrollo di `expiresAt`. Guard di metodo e interceptor condividono quindi la stessa lettura su entrambi i trasporti.
- **Guard fail-closed**: `OwnershipGuard` rifiuta contesti non GraphQL con eccezione, rifiuta l'assenza di identità con UNAUTHENTICATED e valida gli id come hex a 24 prima di qualunque lettura; `RolesGuard` rifiuta l'assenza di identità. `mayReceiveCharacterEvent` cattura gli errori di lettura e scarta l'evento.
- **Filtro per evento**: `characterUpdated` ricontrolla id del documento e proprietà a ogni evento (`filter` di `@graphql-yoga/subscription` attende i predicati asincroni, verificato in `node_modules`); `userUpdated` filtra per `identity.userId` senza argomenti client.
- **Listener leak**: `subscribeWithSnapshot` chiude il live iterator sia sullo `stop` del Repeater esterno sia in caso di errore dello snapshot; `createPubSub` rimuove l'`EventListener` sullo stop.
- **Audit**: `AdminAuditLogService.record` non rigetta mai; l'interceptor riemette lo stesso errore e lo stesso risultato; i guard precedono l'interceptor quindi i tentativi rifiutati non producono record. Le whitelist in `test/app.int-spec.ts` ancorano la superficie `@Public` / `@Roles` / ownership.

Le criticità trovate sono di seconda linea: un **fail-open latente** (switch senza `default` nella policy + guard che ritorna `true` senza verificare l'esito), un'**incoerenza di case** sugli ObjectId hex (validazione case-insensitive, confronto case-sensitive), un **500 con messaggio interno** su `user(id)` malformato per il locandiere, e una **promise non osservata** nel ramo di fallimento snapshot di `subscribeWithSnapshot`. Le note informative riguardano robustezza (change stream senza riapertura, boundary dell'audit, logging) e scelte da registrare come rischio accettato.

## Warnings

### WR-01: Fail-open latente: `authorize` senza `default` e guard che non verifica l'esito

**File:** `src/authz/ownership/character-access.policy.ts:43-54`, `src/authz/ownership/ownership.guard.ts:39-50`
**Issue:** `CharacterAccessPolicy.authorize` fa uno `switch` su `OwnedResource` senza ramo `default`. Il `tsconfig` non abilita `noImplicitReturns`, quindi per un valore non coperto (nuovo membro dell'enum aggiunto senza il corrispondente ramo, oppure un `OwnershipRule` costruito a mano) la funzione ritorna `undefined`. `OwnershipGuard.canActivate` usa l'esito solo per decidere se registrare l'on-behalf (`if (access === ResourceAccess.onBehalf)`) e poi ritorna `true` incondizionatamente: un `undefined` lascia passare la richiesta senza alcuna verifica di proprietà. Oggi non è raggiungibile (due sole risorse, entrambe coperte), ma è esattamente il tipo di fail-open silenzioso che il perimetro vuole escludere e che la prossima risorsa posseduta (Phase 7-9) può attivare.
**Fix:**
```ts
// character-access.policy.ts
authorize(identity: AuthIdentity, resource: OwnedResource, id: string): Promise<ResourceAccess> {
    switch (resource) {
        case OwnedResource.character:
            return this.authorizeCharacter(identity, id);
        case OwnedResource.pendingQuest:
            return this.authorizePendingQuest(identity, id);
        default: {
            const unsupported: never = resource;
            throw new Error(`Risorsa non supportata dalla policy: ${String(unsupported)}`);
        }
    }
}

// ownership.guard.ts — difesa in profondità: un esito non riconosciuto non lascia mai passare
const access = await this.policy.authorize(identity, rule.resource, targetId);
if (access === ResourceAccess.onBehalf) {
    this.decisions.recordOnBehalf(gql.getInfo<GraphQLResolveInfo>(), { type: rule.resource, id: targetId });
} else if (access !== ResourceAccess.owner) {
    throw new Error(`Esito di autorizzazione non riconosciuto: ${String(access)}`);
}
return true;
```
Aggiungere nello spec del guard un caso in cui `policy.authorize` risolve `undefined` e aspettarsi il rigetto.

### WR-02: ObjectId hex accettati in maiuscolo ma confrontati case-sensitive

**File:** `src/mongo/document-id.ts:1`, `src/authz/ownership/character-access.policy.ts:65`, `src/authz/ownership/character-access.policy.ts:85`, `src/authz/ownership/character-access.policy.ts:104`, `src/characters/characters.resolver.ts:121`
**Issue:** `OBJECT_ID_HEX` è `/^[0-9a-f]{24}$/i` (lo spec testa esplicitamente `64B0...` come valido), ma tutti i confronti di proprietà sono tra `String(ObjectId)` — sempre minuscolo — e l'id ricevuto dal client così com'è. Con un id in maiuscolo del **proprio** personaggio: l'adventurer riceve FORBIDDEN (`assertCharacterExists` passa perché Mongo casta case-insensitive, quindi non è nemmeno NOT_FOUND); il locandiere viene classificato on-behalf e auditato sul proprio personaggio; in `characterUpdated` lo snapshot arriva (`findById` casta) ma `documentIdOf(character) !== id` scarta per sempre gli eventi live. È un comportamento incoerente e, per il proprietario, un falso negativo.
**Fix:** rendere la validazione coerente con il confronto. L'opzione più semplice e fail-closed è accettare solo la forma canonica minuscola, che è quella che il server stesso emette:
```ts
// document-id.ts
const OBJECT_ID_HEX = /^[0-9a-f]{24}$/;
```
e aggiornare `document-id.spec.ts` (`'64B000000000000000000001' -> false`). In alternativa, se si vuole tollerare il maiuscolo, normalizzare in un solo punto a monte: `const targetId = rule.selectId(gql.getArgs()).toLowerCase();` in `OwnershipGuard` **e** `if (documentIdOf(character) !== id.toLowerCase())` in `mayDeliver`.

### WR-03: `user(id)` con id malformato risponde INTERNAL_SERVER_ERROR con messaggio Mongoose

**File:** `src/users/users.service.ts:30-37`, `src/users/users.resolver.ts:28-32`
**Issue:** `UsersService.findOne` chiama `findById(id)` senza validare l'hex: per il locandiere un id come `abc` produce un `CastError` di Mongoose che esce come `INTERNAL_SERVER_ERROR` con messaggio `Cast to ObjectId failed for value "abc" ...`, invece del `NOT_FOUND` tipizzato previsto dal contratto D-11 (lo spec `users-authz.int-spec.ts` copre solo l'id inesistente, non quello malformato). Per `character`/`pendingQuest` il problema non si pone perché la policy valida l'hex prima del servizio; `user(id)` è protetto solo da `@Roles`, che non valida nulla.
**Fix:**
```ts
// users.service.ts
import { isObjectIdHex } from 'src/mongo/document-id';

async findOne(id: string): Promise<User> {
    if (!isObjectIdHex(id)) throw ResourceNotFoundException.user();
    const user = await this.userModel.findById(id).populate('currentCharacter').exec();
    if (!user) throw ResourceNotFoundException.user();
    return user;
}
```
Aggiungere a `users-authz.int-spec.ts` il caso `'abc'` accanto a `MISSING_USER_ID`.

### WR-04: `firstLive` resta senza handler nel ramo di fallimento dello snapshot

**File:** `src/graphql/subscribe-with-snapshot.ts:10-17`, `src/graphql/subscribe-with-snapshot.ts:23`
**Issue:** `firstLive = iterator.next()` viene creato prima di `loadSnapshot()`; se lo snapshot fallisce si chiama `iterator.return()` e si rilancia, ma a `firstLive` non è mai stato agganciato alcun handler. Se quella `next()` rigetta (il Repeater di `filter` rigetta quando il predicato lancia; oggi i predicati non lanciano, quindi il caso è latente) si ottiene un `unhandledRejection`, che su Node moderno termina il processo. Analogamente `void stopped.then(() => iterator.return?.())` lascia non osservato un eventuale rigetto di `return()`. Nel loop principale il problema non c'è: `Promise.race` aggancia handler a entrambe le promise.
**Fix:**
```ts
const firstLive = iterator.next();
let snapshot: T;
try {
    snapshot = await loadSnapshot();
} catch (error) {
    firstLive.catch(() => undefined); // il live non deve mai diventare un unhandledRejection
    await iterator.return?.().catch(() => undefined);
    throw error;
}
...
void stopped.then(() => iterator.return?.()).catch(() => undefined);
```
Coprire con uno spec in cui il fake iterator rigetta la prima `next()` mentre lo snapshot fallisce.

## Info

### IN-01: `@Roles()` vuoto è un no-op e il messaggio di rifiuto è cablato sul locandiere

**File:** `src/authz/roles/roles.guard.ts:19`, `src/authz/roles/roles.guard.ts:22-23`
**Issue:** `if (!roles?.length) return true;` fa sì che un `@Roles()` senza argomenti apra l'handler a qualunque identità autenticata (il decoratore sembra proteggere, ma non lo fa). Inoltre il rifiuto usa sempre `AuthorizationException.innkeeperOnly()`: con un futuro `@Roles(RoleType.guard)` il messaggio sarebbe errato.
**Fix:** distinguere "metadata assente" (`roles === undefined` → pass) da "lista vuota" (misconfigurazione → `throw new Error(...)` o deny), e derivare il messaggio dai ruoli richiesti (es. factory `AuthorizationException.roleRequired(roles)`).

### IN-02: `pendingEntryOf` gira prima di `next.handle()` senza boundary di errore

**File:** `src/authz/audit/admin-audit.interceptor.ts:41-42`, `src/authz/audit/admin-audit.interceptor.ts:113-117`
**Issue:** La garanzia D-19 ("l'esito dell'operazione non dipende mai dall'audit") è rispettata per la scrittura, ma non per la costruzione dell'entry: un'eccezione in `pendingEntryOf` (es. `JSON.stringify` in `toPlainArgs` su un valore non serializzabile prodotto da uno scalar custom futuro, o `info.returnType` inatteso) bloccherebbe la mutation. Con lo schema attuale (solo `DateTime`) non è raggiungibile.
**Fix:** avvolgere `pendingEntryOf` in `try/catch`, loggare con `Logger.error` e proseguire con `next.handle()` senza record.

### IN-03: Il log di fallimento dell'audit può contenere valori degli args via messaggio Mongoose

**File:** `src/authz/audit/admin-audit-log.service.ts:33-35`
**Issue:** L'intento "mai gli args nel log" è rispettato per il payload, ma `error.message` di un `ValidationError`/`CastError` di Mongoose include il valore incriminato (`Cast to String failed for value "..."`), che può essere proprio un argomento. Lo spec copre solo `new Error('disk full')`.
**Fix:** loggare `error.name` (o `constructor.name`) e, se serve il dettaglio, i soli `path` degli errori di validazione, non il messaggio completo.

### IN-04: I change stream non vengono riaperti dopo un errore fatale

**File:** `src/users/user-updates.publisher.ts:42-47`, `src/characters/characters.service.ts:58-60`
**Issue:** Su `'error'` si logga e basta. Oltre i casi che il driver riprende da solo, uno stream che si chiude (es. `invalidate`, perdita prolungata del primario) non viene mai riaperto: `userUpdated`/`characterUpdated` smettono silenziosamente di arrivare fino al riavvio, mentre il FE resta in ascolto convinto di essere aggiornato. Pattern pre-esistente in `CharactersService`, replicato nel nuovo publisher.
**Fix:** estrarre un helper comune che su `'error'`/`'close'` ricrei lo stream con backoff (eventualmente con `resumeAfter` dall'ultimo `_id` di evento) e logghi a livello `warn` ogni riapertura.

### IN-05: Tutti i subscriber ascoltano lo stesso topic, con warning `MaxListenersExceeded` oltre 10 connessioni

**File:** `src/characters/characters.resolver.ts:104-109`, `src/characters/characters.service.ts:49-51`
**Issue:** `createPubSub` di yoga registra un `EventListener` per subscription sullo stesso `EventTarget`/topic: con più di 10 subscription concorrenti a `characterUpdated` Node emette `MaxListenersExceededWarning` (rumore nei log, falso allarme di leak). Inoltre ogni evento viene valutato da ogni subscriber, anche quando riguarda un altro personaggio (scartato al primo confronto, senza lettura DB, quindi corretto).
**Fix:** usare il routing per id già supportato dal PubSub: `publish('characterUpdated', id, payload)` nel servizio e `subscribe('characterUpdated', id)` nel resolver, mantenendo comunque il ricontrollo di proprietà per evento; in alternativa `events.setMaxListeners(0, target)` sull'`EventTarget` condiviso.

### IN-06: Oracolo di esistenza 403/404 (rischio accettato D-11)

**File:** `src/authz/ownership/character-access.policy.ts:71-72`, `src/authz/ownership/character-access.policy.ts:90-93`
**Issue:** L'esistenza del personaggio/pending quest viene verificata solo nel ramo di rifiuto, così un adventurer distingue "esiste ma non è mio" (FORBIDDEN) da "non esiste" (NOT_FOUND): è un oracolo di enumerazione sugli ObjectId altrui. È una decisione documentata (messaggi distinti per il FE) e gli ObjectId non sono facilmente indovinabili; va solo registrata come rischio accettato.
**Fix:** nessuna azione ora; se in futuro si volesse chiudere l'oracolo, rispondere NOT_FOUND in entrambi i casi per i non-locandieri.

### IN-07: Il target delle mutation `@Roles` è dedotto solo da `args.id` di primo livello

**File:** `src/authz/audit/admin-audit.interceptor.ts:83-86`
**Issue:** Per le mutation admin il `target.id` è `args.id` se stringa, altrimenti `null`. Una futura mutation admin con l'id in un input annidato (`request.id`, `characterId`) verrebbe auditata con `id: null`, rendendo il log meno utile proprio sulle operazioni sensibili.
**Fix:** permettere a `@Roles` (o a un decoratore dedicato `@AuditTarget(selectId)`) di dichiarare un selettore come fa `OwnsCharacter`, con fallback su `args.id`; in mancanza, loggare `warn` quando una mutation admin non espone alcun id.

### IN-08: Il change stream passa un `ObjectId` dove `findOne` dichiara `string`

**File:** `src/characters/characters.service.ts:46-48`
**Issue:** `change.fullDocument._id` è un `ObjectId` ma viene passato a `findOne(id: string)`; funziona perché `findById` casta, ma la firma mente e il codice è stato toccato in questa fase (eccezioni tipizzate). Il nuovo `UserUpdatesPublisher` fa la cosa giusta con `documentIdOf`.
**Fix:** `const id = documentIdOf(change.fullDocument); if (!id) return; const character = await this.findOne(id);`

---

_Reviewed: 2026-10-14T12:04:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
