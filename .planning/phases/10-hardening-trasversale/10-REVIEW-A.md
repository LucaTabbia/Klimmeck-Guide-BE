---
phase: 10-hardening-trasversale
group: A
reviewed: 2026-10-30T14:49:37Z
depth: standard
files_reviewed: 54
files_reviewed_list:
  - src/app.module.ts
  - src/auth/auth.resolver.ts
  - src/auth/dev/dev-auth.strategy.ts
  - src/auth/twitch/twitch-auth.controller.ts
  - src/auth/twitch/twitch-login-error-code.enum.ts
  - src/authz/audit/admin-audit.interceptor.ts
  - src/authz/audit/audit-target.decorator.ts
  - src/authz/ownership/character-access.policy.ts
  - src/authz/resource-not-found.exception.ts
  - src/config/env.validation.ts
  - src/config/moderation-config.ts
  - src/config/runtime-config.module.ts
  - src/config/runtime-config.ts
  - src/config/runtime-mode.reporter.ts
  - src/config/throttle-config.ts
  - src/eventsub/eventsub.controller.ts
  - src/graphql/graphql-context.ts
  - src/graphql/graphql-options.factory.ts
  - src/graphql/production-errors.ts
  - src/graphql/request-id.plugin.ts
  - src/graphql/request-id.ts
  - src/http/http-hardening.module.ts
  - src/http/request-id.middleware.ts
  - src/http/unhandled-exception.filter.ts
  - src/main.ts
  - src/moderation/disabled-image.moderator.ts
  - src/moderation/image-moderation.exceptions.ts
  - src/moderation/image-moderator.ts
  - src/moderation/image-policy.ts
  - src/moderation/moderation-startup.reporter.ts
  - src/moderation/moderation.module.ts
  - src/moderation/sightengine-image.moderator.ts
  - src/moderation/sightengine-response.ts
  - src/push/dto/register-push-device.input.ts
  - src/push/dto/send-test-push.input.ts
  - src/rest/cloudinary/cloudinary-folder.request.ts
  - src/rest/cloudinary/cloudinary.controller.ts
  - src/rest/cloudinary/cloudinary.module.ts
  - src/rest/cloudinary/cloudinary.service.ts
  - src/rest/cloudinary/image-signature.validator.ts
  - src/rest/cloudinary/image-upload.ts
  - src/rest/cloudinary/portrait-upload.service.ts
  - src/throttling/app-throttler.guard.ts
  - src/throttling/oauth-rate-limit-redirect.filter.ts
  - src/throttling/throttled.decorator.ts
  - src/throttling/throttling.module.ts
  - src/throttling/too-many-requests.exception.ts
  - src/throttling/trust-proxy.configurer.ts
  - src/validation/bad-user-input.exception.ts
  - src/validation/invalid-fields.ts
  - src/validation/is-object-id-hex.decorator.ts
  - src/validation/object-id.pipe.ts
  - src/validation/validation-pipe.factory.ts
  - src/validation/validation.module.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---
# Phase 10: Code Review Report — gruppo A

## Summary

Revisione standard dei 54 file del gruppo A (superficie HTTP/GraphQL, validazione, throttling, config, moderazione, upload REST, auth, authz, EventSub, push, bootstrap). Nessuna spec eseguita: i difetti sotto sono stati verificati leggendo il codice e le dipendenze in `node_modules` (letture, nessuna esecuzione).

Impianto solido: pipe globale registrata come provider, errori di validazione con soli percorsi, sanitizzazione coerente tra HTTP (formatError) e graphql-ws (hook `validate`/`onNext`/`onError`), `requestId` con alfabeto sicuro, moderazione prima di Cloudinary, firma dell'immagine dal contenuto, config fail-closed con messaggi senza valori, redirect OAuth costruito solo dalla config (nessun open redirect), log della moderazione con sole categorie. Nessun problema critico.

Due warning: il filtro globale maschera come 500 gli errori HTTP non-`HttpException` (corpo troppo grande, ecc.) in produzione, e la moderazione approva una risposta Sightengine «success» priva delle sezioni dei modelli. Cinque info di robustezza e qualità.

## Critical

Nessuno.

## Warnings

### A-WR-01: il filtro globale maschera come 500 gli errori 4xx del parser del body in produzione

**File:** `src/http/unhandled-exception.filter.ts:32-52`
**Problem:** il ramo «non `HttpException`» tratta come imprevisto qualunque oggetto d'errore che non sia `HttpException`. Gli errori di `body-parser` (corpo oltre il limite JSON di default, charset non supportato, `PayloadTooLargeError` con `statusCode` 413) sono `http-errors`, non `HttpException`: `RoutesResolver.mapExternalException` converte solo `SyntaxError`/`URIError` in `BadRequestException`, gli altri arrivano al filtro così come sono (verificato in `node_modules/@nestjs/core/router/routes-resolver.js:94-106`). Il filtro base di Nest li gestiva con `isHttpError` (usa `statusCode` e `message`, `base-exception-filter.js:34-64`); il nuovo filtro, in produzione, li logga come «Errore interno» e risponde 500 `INTERNAL_SERVER_ERROR`. Fuori produzione passano a `super.catch` e restano corretti, per cui il difetto non emerge in dev/test. Nessun test copre un errore con `statusCode` (grep su `413`/`http-errors` in `src` e `test`: solo gli upload multer).
**Scenario:** `POST /api/graphql` (o `POST /cloudinary/getUrls`) con un body JSON da 200 KB in produzione: atteso 413, ottenuto 500 con `requestId` e una riga di log di livello error per un errore del client. Il FE lo legge come guasto del server e il monitoraggio si riempie di falsi errori interni (ogni client ostile può generarli a volontà).
**Fix:** nel filtro, prima del ramo «imprevisto», lasciare passare a `super.catch` gli oggetti con `statusCode` numerico 4xx (stessa logica di `isHttpError`), senza `logInternalError` e senza mascheramento:
```ts
function isClientHttpError(exception: unknown): boolean {
    const status = (exception as { statusCode?: unknown } | null)?.statusCode;
    return typeof status === 'number' && status >= 400 && status < 500;
}
// in catch(): if (exception instanceof HttpException || isClientHttpError(exception)) return super.catch(exception, host);
```
Test TDD da scrivere prima: in `unhandled-exception.filter.spec.ts`, «answers a body-parser 413 with its own status and does not log an internal error in production»; in `http-hardening.int-spec.ts`, un POST da 200 KB con `production: true` che si aspetta 413 e nessun campo `requestId` di errore interno.

### A-WR-02: una risposta Sightengine `success` senza sezioni dei modelli viene approvata (fail-open)

**File:** `src/moderation/sightengine-image.moderator.ts:83-94`, `src/moderation/image-policy.ts:56-79`
**Problem:** `verdictOf` accetta qualunque corpo con `status === 'success'` e `evaluateImagePolicy` tratta ogni sezione assente come «nessun problema» (`scores?.[name]` su `undefined` vale `false`). La D-14 chiede fail-closed: se il piano/account Sightengine non include un modello richiesto, o un cambio di formato fa sparire una chiave, la sezione manca, la regola non scatta e l'immagine passa senza che nessuno se ne accorga (il WARN di avvio copre solo le chiavi vuote). Il caso estremo `{"status":"success"}` approva senza aver controllato nulla.
**Scenario:** Sightengine risponde `{"status":"success","request":{...}}` (modelli non abilitati sull'account, o un modello rinominato): `approved: true, logged: []` e l'upload prosegue verso Cloudinary. Da verificare con un test che alimenti il moderatore con quel corpo (la spec attuale non sembra prevederlo).
**Fix:** in `verdictOf`, dopo il controllo di `status`, richiedere la presenza delle sezioni obbligatorie (`nudity`, `offensive`, `gore`, `self-harm`, `faces`, `text`, `qr`) e in caso contrario `throw this.unavailable('risposta incompleta')` (503, nessun upload). Test TDD prima: «answers 503 when a success response lacks a required model section» e «approves a complete clean response» (per non rompere il caso positivo). Se `faces` è omesso quando non ci sono volti, trattare solo quella chiave come opzionale: da verificare sulla documentazione del modello `face-age` prima di decidere.

## Info

### A-IN-01: il fail-closed in produzione della moderazione non taglia lo spazio di `NODE_ENV` come fa il runtime

**File:** `src/config/moderation-config.ts:61-67` (confronto con `src/config/runtime-config.ts:27`)
**Problem:** `parseRuntimeConfig` fa `trim()` su `NODE_ENV` e accetta `' production'` come produzione; `disabledModerationConfig` confronta `env.NODE_ENV === 'production'` senza `trim()`. Con `NODE_ENV=" production"` il runtime è produzione (introspection spenta, filtro mascherante) ma la moderazione parte disattivata senza rifiutare il boot.
**Scenario:** file `.env` o variabile del deploy con uno spazio iniziale/finale e chiavi Sightengine assenti: boot riuscito in produzione, upload non moderati (solo un WARN).
**Fix:** unica fonte: far derivare `disabledModerationConfig` da `parseRuntimeConfig({ NODE_ENV: env.NODE_ENV }).production`. Test TDD prima: «rejects a missing Sightengine key when NODE_ENV has surrounding whitespace».

### A-IN-02: `THROTTLE_TRUST_PROXY` supera `validateEnv` con valori che Express rifiuta, e l'errore esce al bootstrap

**File:** `src/config/throttle-config.ts:19,86-95`, `src/throttling/trust-proxy.configurer.ts:20-27`
**Problem:** `TRUST_PROXY_PATTERN` accetta qualunque sequenza di `[0-9A-Za-z.:/, ]`, quindi `true`, `1.2.3.4/99`, `abc` passano la validazione di avvio; Express li compila con `proxyaddr` solo in `onApplicationBootstrap` (`set('trust proxy', ...)`) e lancia un `TypeError` il cui messaggio contiene il valore (da verificare: `proxyaddr.compile('true')` lancia «invalid IP address»). Il boot fallisce comunque (fail-closed corretto), ma tardi, fuori dal canale «messaggi senza valore» di D-08, e `main.ts` stampa `error.message`.
**Scenario:** `THROTTLE_TRUST_PROXY=true` (scelta frequente di chi non conosce la sintassi): `validateEnv` passa, il processo cade in bootstrap con un messaggio di libreria.
**Fix:** in `parseTrustProxy`, validare con la stessa funzione di Express (`proxyaddr.compile(value.split(',').map((s) => s.trim()))` dentro try/catch) o limitare il pattern a un intero o ai token ammessi (`loopback`, `linklocal`, `uniquelocal`, IP/CIDR) e lanciare un messaggio fisso. Test TDD prima in `throttle-config.spec.ts`: «rejects THROTTLE_TRUST_PROXY=true with a fixed message» e «rejects a malformed CIDR».

### A-IN-03: nessun avviso in produzione quando il trust proxy è spento (bucket condiviso dietro un reverse proxy)

**File:** `src/throttling/trust-proxy.configurer.ts:20-23`
**Problem:** con `THROTTLE_TRUST_PROXY` vuota (default, C19) il tracker è `req.ip`; dietro un reverse proxy è l'IP del proxy, quindi tutti gli utenti condividono i bucket di `exchangeLoginTicket`, `refreshSession`, OAuth e upload (20 richieste/minuto in totale). È una scelta documentata (C19, «decisione da confermare» quanto al solo silenzio operativo), ma nulla nei log avverte il gestore.
**Scenario:** deploy dietro proxy senza la variabile: dopo 20 login/refresh al minuto di utenti diversi tutti ricevono `TOO_MANY_REQUESTS` / `rate_limited`.
**Fix:** nel configurer, se `trustProxy === null` e il runtime è produzione, un `logger.warn` fisso («Trust proxy spento: dietro un reverse proxy il throttling usa l'IP del proxy»), come per `RuntimeModeReporter`. Test TDD prima: «warns once in production when trust proxy is off».

### A-IN-04: `CloudinaryService`, file toccato dalla fase, conserva duplicazione e perde la diagnostica degli errori del provider

**File:** `src/rest/cloudinary/cloudinary.service.ts:15-66`, `src/rest/cloudinary/cloudinary.controller.ts:19-25`
**Problem:** (a) le due funzioni di listing duplicano il ciclo di paginazione e usano `r: any` e `allUrls = [...allUrls, ...urls]`; la cartella `'characters_profile'` è un letterale nel servizio. (b) Cloudinary rigetta con oggetti semplici (non `Error`): il filtro e `describeError` registrano solo `UnknownError`, senza `http_code`, e chi legge il log non distingue un 401 di credenziali da un 500 del provider; non c'è nemmeno lo stack. (c) `new ImageSignatureValidator({})` passa un argomento privo di senso e `MaxFileSizeValidator` duplica il limite già imposto da multer (`IMAGE_UPLOAD_LIMITS`), con la stessa costante in due posti (innocuo, ma ridondante).
**Scenario:** upload con credenziali Cloudinary scadute in produzione: la risposta è un 500 generico (corretto) ma il log dice solo `Errore interno <id>: UnknownError`.
**Fix:** Boy Scout, nello stesso commit del fix di (b): in `uploadImage` rigettare con `new Error(\`Cloudinary: ${error.http_code ?? '-'}\`)`; estrarre un helper `paginatedUrls(fetchPage)`; costante `PORTRAIT_FOLDER`; togliere l'argomento a `ImageSignatureValidator`. Test TDD prima: «wraps a non-Error Cloudinary rejection in an Error carrying only the http code».

### A-IN-05: nomi e tipi da pulire nei file di authz/GraphQL toccati

**File:** `src/authz/audit/audit-target.decorator.ts:11`, `src/graphql/graphql-context.ts:14-15`
**Problem:** il decoratore `AuditTarget` omonimo della classe di schema `AuditTarget` in `admin-audit-log.model.ts` (due simboli con lo stesso nome in moduli adiacenti, facile l'import sbagliato); `GraphQLRequestContext.req` è `any` mentre `GraphQLContextInput.req` è già `RequestWithId` (per WS è l'`IncomingMessage`, quindi basta un'unione `RequestWithId | IncomingMessage`).
**Scenario:** nessun difetto attuale; rischio di import errato e di perdere il controllo dei tipi su `context.req`.
**Fix:** rinominare il decoratore in `DeclareAuditTarget` (o la classe in `AuditTargetSchemaClass`) e tipare `req`. Nessun test nuovo; `tsc` e le spec esistenti bastano.

## Observed but not flagged (decisioni di CONTEXT/RESEARCH)

- CORS chiuso, nessuna variabile `CORS_*`, nessun helmet (D-06); il codice è coerente.
- Throttling solo su `exchangeLoginTicket`, `refreshSession`, OAuth, EventSub, REST Cloudinary; nessun limite sulle mutation di gioco (D-08); bucket in memoria, monoistanza, webhook ×50 (C6, C8).
- `THROTTLE_TRUST_PROXY` spenta di default (C19); l'unica osservazione operativa è A-IN-03.
- Filtro globale: GraphQL lasciato ad Apollo, `HttpException` invariate (D-07, Pitfall 6); il difetto A-WR-01 riguarda solo i non-`HttpException` con `statusCode`.
- Soglia 0.5 e policy «Severa» di Sightengine, `minor-artificial` e `text-present` solo a log, `personal` e `profanity` del testo rifiutati (D-13, A3); chiavi vuote fuori produzione = moderatore disattivato con WARN (D-14).
- Gli id GraphQL accettano solo l'esadecimale minuscolo a 24 (D-02, C3) e `ObjectIdPipe`/`ObjectIdListPipe` falliscono su `undefined`: nessun resolver del gruppo li usa su argomenti opzionali (verificato con grep sui resolver).
- `mayReceiveCharacterEvent` e `authorizePendingQuest` con bypass innkeeper; `authorizeQuestResult` senza bypass (07 D-11, C10).
- `faces[].attributes.age.minor` come percorso del punteggio (RESEARCH §face-age, solo volti reali: risposta utente 2026-10-29).
- Lettori tolleranti `refIdOf`/`idForms`/`sameId`/`objectIdFromHex` (C14) e riga `pendingQuest: ID` dello SDL (D-23): non toccati.
- Audit: `new Date()` in `AdminAuditLogService.record` non è nel gruppo A (il file non è nell'elenco); lo segnalo al revisore del gruppo che lo copre rispetto alla regola `Clock` iniettato.

---

_Reviewed: 2026-10-30T14:49:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
