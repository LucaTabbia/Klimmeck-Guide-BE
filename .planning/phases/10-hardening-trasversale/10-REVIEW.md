---
phase: 10-hardening-trasversale
reviewed: 2026-10-30T14:58:36Z
depth: standard
files_reviewed: 139
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
  - src/characters/character-updates.publisher.ts
  - src/characters/characters.module.ts
  - src/characters/characters.service.ts
  - src/characters/pending-quest-start.publisher.ts
  - src/gameRules/game-rule.exception.ts
  - src/migrations/mixed-refs/mixed-ref-paths.ts
  - src/migrations/mixed-refs/mixed-ref-pipelines.ts
  - src/migrations/mixed-refs/mixed-refs.migration.ts
  - src/migrations/mixed-refs/mixed-refs.verifier.ts
  - src/migrations/run-mixed-refs.ts
  - src/mongo/change-stream-publisher.ts
  - src/mongo/mongo.module.ts
  - src/mongo/reopen-backoff.ts
  - src/mongo/sweep-index.verifier.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-lanes.ts
  - src/quests/outcomes/boss-resolution.service.ts
  - src/quests/outcomes/gm-completion.service.ts
  - src/quests/outcomes/gm-overrides.ts
  - src/quests/outcomes/group-roster.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/quest-resolution.sweeper.ts
  - src/quests/outcomes/rescue-resolution.service.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/party/lane-members.ts
  - src/quests/party/quest-start.service.ts
  - src/quests/pending-requests/archived-character-queue.refresher.ts
  - src/quests/pending-requests/pending-requests.builder.ts
  - src/quests/pending-requests/pending-requests.module.ts
  - src/quests/pending-requests/pending-requests.resolver.ts
  - src/quests/pending-requests/pending-requests.service.ts
  - src/quests/quests.resolver.ts
  - src/quests/results/quest-result-maintenance.ts
  - src/queues/enqueue-trigger.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel.module.ts
  - src/travel/travel.updates.ts
  - src/users/user-updates.publisher.ts
  - src/users/users.resolver.ts
  - src/cities/cities.resolver.ts
  - src/cities/cities.service.ts
  - src/enemies/enemies.resolver.ts
  - src/enemies/enemies.service.ts
  - src/equipmentItems/equipment-items.resolver.ts
  - src/equipmentItems/equipment-items.service.ts
  - src/lootItems/loot-items.resolver.ts
  - src/lootItems/loot-items.service.ts
  - src/lore/lore.resolver.ts
  - src/lore/lore.service.ts
  - src/models/character/character-assets.model.ts
  - src/models/character/character-quests.model.ts
  - src/models/character/character-status.model.ts
  - src/models/character/character.model.ts
  - src/models/city.model.ts
  - src/models/common/active-spell.model.ts
  - src/models/common/asset-quantity.model.ts
  - src/models/common/coins.model.ts
  - src/models/common/equipment.model.ts
  - src/models/enemy.model.ts
  - src/models/equipment-item.model.ts
  - src/models/lore.model.ts
  - src/models/pending-quest.model.ts
  - src/models/pending-request.model.ts
  - src/models/point-of-interest.model.ts
  - src/models/quest/quest-infos.model.ts
  - src/models/quest/quest.model.ts
  - src/models/request/abandon-quest-request.model.ts
  - src/models/request/accept-quest-request.model.ts
  - src/models/request/complete-pending-request.model.ts
  - src/models/request/create-character-request.model.ts
  - src/models/request/equip-item-request.model.ts
  - src/models/request/equip-spell-request.model.ts
  - src/models/request/transaction-items.model.ts
  - src/models/request/transaction-request.model.ts
  - src/models/request/travel-request.model.ts
  - src/models/request/use-spell-request.model.ts
  - src/models/user.model.ts
  - src/pets/pets.resolver.ts
  - src/pets/pets.service.ts
  - src/pointsOfInterest/point-of-interest.resolver.ts
  - src/pointsOfInterest/point-of-interest.service.ts
  - src/roads/roads.resolver.ts
  - src/schema.gql
  - src/spells/spells.resolver.ts
  - src/spells/spells.service.ts
findings:
  critical: 0
  warning: 5
  info: 15
  total: 20
status: issues_found
---

# Phase 10: Code Review Report

Fusione dei tre report per area (`10-REVIEW-A.md` superficie/validazione/throttling/config/moderazione/auth, `10-REVIEW-B.md` quest/personaggi/utenti/viaggi/mongo/migrazioni/code, `10-REVIEW-C.md` modelli/catalogo/schema) scritti da tre reviewer in parallelo su HEAD `3a8ce4b` di `feat/10-hardening` (base `origin/develop`). Gli ID dei finding conservano il prefisso del gruppo.

## Summary

### Gruppo A

Revisione standard dei 54 file del gruppo A (superficie HTTP/GraphQL, validazione, throttling, config, moderazione, upload REST, auth, authz, EventSub, push, bootstrap). Nessuna spec eseguita: i difetti sotto sono stati verificati leggendo il codice e le dipendenze in `node_modules` (letture, nessuna esecuzione).

Impianto solido: pipe globale registrata come provider, errori di validazione con soli percorsi, sanitizzazione coerente tra HTTP (formatError) e graphql-ws (hook `validate`/`onNext`/`onError`), `requestId` con alfabeto sicuro, moderazione prima di Cloudinary, firma dell'immagine dal contenuto, config fail-closed con messaggi senza valori, redirect OAuth costruito solo dalla config (nessun open redirect), log della moderazione con sole categorie. Nessun problema critico.

Due warning: il filtro globale maschera come 500 gli errori HTTP non-`HttpException` (corpo troppo grande, ecc.) in produzione, e la moderazione approva una risposta Sightengine «success» priva delle sezioni dei modelli. Cinque info di robustezza e qualità.

### Gruppo B

Revisione standard dei 39 file del gruppo B (quest, personaggi, utenti, viaggi, base dei change stream, migrazione dei ref `Mixed`, code Bull) a HEAD `3a8ce4b`, con il diff contro `origin/develop` e le decisioni D-17a/b/c/d, D-21, D-22, D-23, D-24 di CONTEXT come riferimento autoritativo. Verificati anche i §4 e §8 di `BACKEND-NOTES.md` e il runbook della migrazione: il codice li rispetta.

Esito: nessun difetto critico e nessuna gara reale trovata nei punti richiesti.

- **Avvio da soli (D-22):** `soloStartDateOf` è l'unica regola; l'accettazione la scrive nella stessa `create` della PendingQuest e l'arrivo nella stessa transazione del personaggio (`arriveOnMarker`, con lettura e scrittura in sessione). `QuestStartService` resta proprietario della regola e di `scheduleStarted`; `enqueueTrigger` non lancia mai, quindi l'accodamento post-commit non può far fallire un arrivo già committato. Il publisher degli avvii ripubblica i titolari giusti (filtro `$in` su `idForms`, solo attivi).
- **Seat holder (D-21):** boss e soccorso leggono i segnaposto con il filtro senza `ACTIVE_CHARACTER_FILTER`, li rileggono in sessione (`snapshotSeatHolderInSession`), li fanno combattere nello stesso ordine di `fightersOf`, non scrivono nulla sul loro documento (solo `deletePendingQuest`) e non danno risultati né premi. I segnaposto restano in `dropped` e quindi escono dalla registrazione con il verdetto (coerente con "ogni fallito libera il posto"; con boss vinto la quest è conclusa).
- **Coda del GM (D-24):** `assertNoBusyParticipant` gira in `complete` (snapshot di pre-lettura) e in `commit` (snapshot in sessione); `participantFilter` aggiunge `STANDARD_LANE_FREE` solo per le corsie del GM; `lostCompletionError` riclassifica la gara persa. `OUTCOME_CHARACTER_PROJECTION` include `quests`, quindi il controllo vede davvero `quests.pendingQuest`.
- **Change stream (D-17a):** la base riapre con backoff, riprende da `startAfter`, ignora i token degli stream abbandonati, non pubblica dopo lo stop e lascia il listener `error` attivo. Il single-flight per chiave (`KeyedSingleFlight`) è applicato a utenti e personaggi e il `publishOnce` controlla `stopping`. Sweep e backfill girano una volta per processo al boot (non attesi); gli indici sono costruiti da un verificatore che non blocca mai il boot.
- **Migrazione (D-17d):** le pipeline di conversione sono corrette per scalari, array e array di sottodocumenti (condizioni annidate: la regex gira solo sulle stringhe; assenti e null restano intatti); il filtro residuo è identico al filtro di conversione, quindi `--verify`, il report post-`--apply` e il verificatore al boot misurano la stessa cosa; seconda `--apply` non tocca nulla; il gate di versione scatta prima di ogni scrittura; la CLI stampa solo nome e codice dell'errore, mai la URI; gli import sono relativi (il file compilato non dipende dagli alias `src/`). Le 34 voci coincidono con il runbook; la spec dell'inventario le confronta con gli schemi.
- **Code Bull:** tutti gli accodamenti passano da `enqueueTrigger`, quindi il tetto sui falliti (`FAILED_JOBS_KEPT`: 7 giorni in secondi, 1000 job) copre `spell-recovery`, `travel` e `quest-resolution`.

Restano due warning (entrambi sulla base dei change stream) e sette info di manutenibilità e copertura.

Spec eseguite (unit, in foreground): `src/migrations` (3 file), `src/mongo/change-stream-publisher.spec.ts`, `src/mongo/reopen-backoff.spec.ts`: 4 suite, 61 test, tutti verdi. Nessuna integration eseguita.

### Gruppo C

Revisione standard dei 46 file del gruppo C (ritipizzazione dei ref `Mixed`, decoratori sui 17 input, indici con nome, liste del catalogo, catalogo con pipe e `NOT_FOUND` con factory, `roads`, `spells`, `schema.gql`). Non ci sono bug di correttezza né problemi di sicurezza bloccanti. Verifiche fatte:

- **Ritipizzazione.** Ogni `@Prop` ritipizzato usa `MongooseSchema.Types.ObjectId` (o la lista) con `ref` coerente col modello referenziato; `@Field`, tipi TS, `default` e `required` sono invariati. Nessun `Types.ObjectId` residuo come `type` di un `@Prop` nei modelli del gruppo. I 34 percorsi di `MIXED_REF_PATHS` (conteggio rifatto a mano: 1 users, 1 pendingquests, 17 characters, 6 quests, 2 cities, 2 pointsofinterest, 1 enemies, 1 lore, 1 equipmentitems, 2 questresults) corrispondono ai campi ritipizzati; i 9 slot di `Equipment`, `ActiveSpell.spell`, `AssetQuantity.item` (con `refPath: 'itemType'`) e `CharacterAssets.pet` sono coperti. Probe con `@nestjs/mongoose` (script nello scratchpad, nessun accesso a DB né a `.env`): `type: Types.ObjectId` e `[Types.ObjectId]` producono `Mixed`, mentre `[{ type: Types.ObjectId, ref }]` era già `ObjectId`; quindi `City.pointsOfInterest` giustamente non è fra i 34 percorsi (il suo cambio è solo di forma).
- **Liste.** `Enemy.locations` e `PointOfInterest.type` sono `[String]` con `enum` e `default: []`; probe: l'`enum` su `type: [String]` valida gli elementi (`locations.0`) e un valore scalare legacy viene letto come lista di un elemento.
- **Decoratori.** Opzionali con `@IsOptional`, annidati con `@ValidateNested` + `@Type`, array con `@ArrayMaxSize` (50 per gli override, 100 per le righe di transazione, come da C5), id con `@IsObjectIdHex`, `EquipSpellRequest.usages` volutamente senza decoratori (scartato dalla whitelist, D-01). I soli `@InputType` usati come argomento sono le richieste decorate: gli altri input dei modelli (`CityInput`, `LoreInput`, `EnemyInput`, ...) non sono argomenti di nessuna operazione, quindi la whitelist non li svuota.
- **Indici.** Gli 8 indici con nome sono sui campi giusti (percorsi verificati negli schemi), nessun duplicato né conflitto con gli indici preesistenti; `status.spellStates.recoveries` è l'unica chiave array di quell'indice composto (nessun parallel array).
- **Catalogo.** `ObjectIdPipe` su tutti gli id scalari e su `from`/`to` di `getPath`, `ObjectIdListPipe` (tetto 100, esadecimale minuscolo) su `lootItemsByIds` e `equipmentItemsByIds`, factory `ResourceNotFoundException` per ogni servizio (messaggio di `lore` corretto: prima diceva «Quest»). `ResourceNotFoundException` estende `NotFoundException`, quindi `auth-session.service.ts` continua a intercettarla.
- **`src/schema.gql`.** Il diff contro `origin/develop` è la sola riga `+  pendingQuest: ID` in `type PendingRequestCharacter`.
- ESLint mirato sui 45 file sorgente: nessun errore o warning. Nessuna spec eseguita (ragionamento + probe Node sullo schema).

Restano un warning (campi stringa di `CreateCharacterInput` senza tetto, contro l'emendamento C4) e tre info (lacune di test e di forma).

## Critical

### Gruppo A

Nessuno.

### Gruppo B

Nessun finding critico.

### Gruppo C

Nessuno.

## Warnings

### Gruppo A

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

### Gruppo B

### B-WR-01: `open()` nel timer di riapertura senza try/catch

**File:** `src/mongo/change-stream-publisher.ts:120-124` (e `:46-48`)
**Problem:** la riapertura chiama `this.open()` dentro la callback di `setTimeout`. Se `this.model.watch(...)` lancia in modo sincrono (argomenti non validi, modello non più utilizzabile, una `startAfter` rifiutata dal driver in fase di costruzione), l'eccezione esce dalla callback del timer come eccezione non catturata e abbatte il processo: proprio il caso che il backoff doveva assorbire. Nessuna riapertura successiva viene pianificata.
**Scenario:** da verificare con un test (con Mongoose 8 `Model.watch` mette in coda l'apertura finché la connessione è pronta, quindi il caso reale è improbabile; il doppio di test e un driver futuro possono lanciare). Stato: stream chiuso da un errore, token di ripresa valorizzato, `watch` lancia al secondo tentativo, e il processo termina invece di riprovare dopo 2 s.
**Fix:** nella callback, `try { this.open(); } catch (error) { this.scheduleReopen(error); }` (con `this.attempt` già incrementato). Test TDD prima: in `change-stream-publisher.spec.ts`, il doppio di `watch` lancia alla seconda chiamata e riesce alla terza; atteso: nessuna eccezione, riapertura con ritardo 2 s poi 4 s, un solo ERROR per tentativo.

### B-WR-02: Storia del change stream persa: riapertura senza ripresa e nessuna risincronizzazione

**File:** `src/mongo/change-stream-publisher.ts:117,127-132`
**Problem:** con codice 286 il token viene scartato e il flusso riparte "da adesso": gli eventi nel buco non vengono mai ripubblicati e nessuna sottoclasse può reagire (la base non espone un hook). Il WARN lo segnala, ma i client restano con lo stato precedente fino al prossimo evento (per `pendingRequestsUpdated` o `questUpdated` anche a lungo). D-17a descrive la ripresa "dopo l'ultimo evento visto" e non dice cosa fare quando la ripresa è impossibile: **decisione da confermare**.
**Scenario:** Mongo irraggiungibile più a lungo della finestra dell'oplog (o un flusso fermo mentre il token invecchia) → 286 → riapertura senza token → l'innkeeper vede una coda del GM vecchia finché un'altra PendingQuest non cambia.
**Fix:** hook protetto `protected onHistoryLost(): void {}` chiamato da `forgetHistory()`; `PendingRequestsPublisher` lo implementa con `requestRefresh()` (la coda è uno snapshot intero, quindi costa una lettura), gli altri publisher restano no-op documentato. Test TDD prima: con 286 la sottoclasse riceve `onHistoryLost` una volta; per la coda, un evento 286 produce un `pendingRequestsUpdated`.

### Gruppo C

### C-WR-01: `CreateCharacterInput` senza `@MaxLength`, contro l'emendamento C4 di D-04

**File:** `src/models/request/create-character-request.model.ts:12-14, 36-44` (anche `src/validation/input-rules.spec.ts:161-182`)

**Problem:** D-04, rivisto con C4, dice che dove esiste un validatore di dominio i decoratori controllano «solo la forma» con `@IsString`, `@IsInt`, `@IsEnum` e `@MaxLength` generosi. Qui `name`, `background` e `imagePath` hanno solo `@IsString`: nessun tetto alla lunghezza. Il test della regola (`checks only the shape of the character creation fields`) usa anzi `'A'.repeat(40)` e `'b'.repeat(600)` come casi che devono passare, ma nessun caso «troppo lungo anche per il tetto generoso». Per contrasto `SendTestPushInput.id` ha `@MaxLength(ADMIN_TEXT_MAX_LENGTH)` e il test lo nomina.

**Scenario:** un utente autenticato invia `createCharacter` con `name` o `background` di centinaia di KB (il limite pratico è solo quello del body parser). Prima del controllo di dominio, `normalizeCharacterName` esegue `normalize('NFC')`, `replace` e `trim` sull'intera stringa, e `normalizeBackground` fa `trim` sull'intera stringa; il rifiuto arriva comunque (`CHARACTER_NAME_INVALID` / `backgroundTooLong`) ma dopo aver lavorato sull'input intero, e il codice di errore non è `BAD_USER_INPUT` come per gli altri input oversize. Impatto basso (rifiuto garantito dal dominio), ma è un tetto previsto e non implementato. Da verificare con la config effettiva del body parser di Apollo (non nel gruppo C).

**Fix:** Aggiungere tetti ben sopra i limiti di dominio, riusando le costanti esistenti:

```ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { BACKGROUND_MAX_CODE_UNITS, IMAGE_PATH_MAX_LENGTH } from 'src/characters/creation/create-character-input.validator';
import { CHARACTER_NAME_MAX_CODE_UNITS } from 'src/characters/creation/character-name';

@IsString() @MaxLength(CHARACTER_NAME_MAX_CODE_UNITS * 2) name: string;
@IsOptional() @IsString() @MaxLength(BACKGROUND_MAX_CODE_UNITS * 2) background?: string | null;
@IsOptional() @IsString() @MaxLength(IMAGE_PATH_MAX_LENGTH * 2) imagePath?: string | null;
```

Test TDD da scrivere prima, in `input-rules.spec.ts`: `name` di 41 unità non passa solo se oltre il tetto, `'a'.repeat(MAX+1)` risponde `['name']` (e analogo per `background`/`imagePath`), mentre i casi esistenti da 40 e 600 restano `[]`. Se il tetto non si vuole, documentare la scelta come deroga a C4 («decisione da confermare»: C4/D-04).

## Info

### Gruppo A

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

### Gruppo B

### B-IN-01: Il backoff si azzera solo su un `change`, non su una riapertura riuscita

**File:** `src/mongo/change-stream-publisher.ts:107-112,120-124`
**Problem:** `attempt` torna a 0 soltanto in `receive`. Su una collection quieta (utenti, archivi di personaggi) uno stream che si riapre con successo e resta silenzioso per ore conserva il contatore alto: al guasto successivo il ritardo parte già da 30 s invece che da 1 s.
**Fix:** azzerare `attempt` anche quando arriva il primo `resumeTokenChanged` del nuovo stream (segno che il cursore è vivo), con un test che lo copra accanto a "resets the backoff after the first change following a reopen".

### B-IN-02: Backfill di boot non atteso allo stop

**File:** `src/quests/outcomes/quest-resolution.sweeper.ts:104-123`; `src/quests/results/quest-result-maintenance.ts:25-27`
**Problem:** `onModuleDestroy` del sweeper attende solo `inFlight`; `backfillOnce` e `maintain` partono con `void` e nessuno li attende. Un riavvio nei primi secondi dopo il boot (deploy a catena) può far scrivere al backfill dopo la chiusura della connessione: finisce in un ERROR di nome/codice, nessuna perdita di dati (il backfill è idempotente).
**Fix:** conservare la promessa (`this.boot = this.backfillOnce()`) e attenderla con `.catch(() => undefined)` in `onModuleDestroy`; stessa cosa per `QuestResultMaintenance`. Test prima: `onModuleDestroy` non risolve finché il backfill è in corso.

### B-IN-03: `republishHolders` non controlla lo stop

**File:** `src/characters/pending-quest-start.publisher.ts:57-84`
**Problem:** `onChange` lancia una lettura (`void this.republishHolders`) senza guardia `this.stopping`, a differenza di `PendingRequestsPublisher.publishOnce` e di `CharacterUpdatesPublisher.publishOnce`. Alla chiusura la query può fallire sulla connessione che si chiude e viene loggata come ERROR.
**Fix:** `if (this.stopping) return;` in testa a `republishHolders`; test: dopo `onModuleDestroy` un evento non interroga `characterModel`.

### B-IN-04: Duplicazione fra boss e soccorso di gruppo; funzioni oltre le 50 righe

**File:** `src/quests/outcomes/boss-resolution.service.ts:105-221`; `src/quests/outcomes/rescue-resolution.service.ts:322-420,135-207,210-298`; `src/quests/outcomes/gm-completion.service.ts:264-352`
**Problem:** la lettura degli snapshot dei posti vivi e dei segnaposto, la costruzione del contesto di combattimento, il ciclo `planCombatant` / `writeParticipant` / `deletePendingQuest`, l'eliminazione delle PendingQuest dei segnaposto e il claim con `questUpdateOf` sono quasi identici in `commitGroup` e `fightRescuers`; lo stesso vale per i due cicli di log dei segnaposto e degli incoerenti in `resolveGroup` e `resolveRescue`. `commitGroup` (~115 righe), `timeoutAid` (~90) e `GmCompletionService.commit` (~90) superano di molto la soglia. Il Boy Scout della 10-21/10-23 non ha estratto il comune.
**Fix:** estrarre in `group-roster.ts` (o in un `group-fight.ts`) `fightGroup(roster, snapshotsInSession, ...)` che restituisca `{ resolution, participants }`, più `logRosterNotes(logger, roster, label)`. Comportamento invariato: i test esistenti di `boss-resolution.int-spec.ts` e `aid-rescue.int-spec.ts` fanno da rete; prima di spostare, aggiungere una caratterizzazione sullo stesso numero di scritture per un gruppo con un segnaposto.

### B-IN-05: Piccole sbavature nel modulo della migrazione

**File:** `src/migrations/mixed-refs/mixed-refs.migration.ts:69-71`; `src/migrations/mixed-refs/mixed-ref-pipelines.ts:94-97,72,89`; `src/migrations/mixed-refs/mixed-ref-paths.ts:1-9,71-74`; `src/migrations/run-mixed-refs.ts:32-36`
**Problem:** (a) `pathOf` ripete la logica di `mixedRefLabel` senza prefisso della collection; (b) `residualFilter` è un alias di `convertibleFilter` (indirezione senza comportamento: il commento ne spiega l'intento, ma la funzione non aggiunge nulla); (c) `MixedRefPath.key` è facoltativo e si usa `ref.key ?? ''`, che con una voce `subdocArray` senza chiave costruirebbe in silenzio un filtro su un campo con nome vuoto invece di fallire; (d) il gate di versione esce con il codice 2, lo stesso dell'uso errato (documentato nel runbook, ma impedisce a uno script di distinguere i due casi).
**Fix:** (a) esportare `mixedRefPath(ref)` da `mixed-ref-paths.ts` e usarlo in entrambi i punti; (b) rimuovere l'alias o far importare direttamente `convertibleFilter` con il commento sul significato di "residuo"; (c) tipo unione discriminata (`{ shape: 'subdocArray'; key: string }`) così `?? ''` sparisce e la spec dell'inventario non cambia; (d) opzionale, solo se si aggiorna anche la tabella del runbook.

### B-IN-06: Il modulo infrastrutturale `mongo` importa il verificatore delle migrazioni

**File:** `src/mongo/mongo.module.ts:7,61`
**Problem:** `MongoModule` (globale, base di tutto) dipende da `src/migrations/mixed-refs/mixed-refs.verifier`, che a sua volta importa `src/mongo/mongo-errors`: dipendenza circolare fra le cartelle (non a runtime, perché `mongo-errors` è foglia) e inversione di layer. Quando la migrazione sarà rimossa (v1.1) il modulo `mongo` dovrà essere toccato per un motivo che non gli appartiene.
**Fix:** registrare `MixedRefsVerifier` in un piccolo `MixedRefsModule` importato da `AppModule`, oppure spostare il verificatore in `src/mongo/`. Nessun cambio di comportamento: la int-spec `mixed-refs.verifier.int-spec.ts` resta valida.

### B-IN-07: Lacune di test sui helper puri del roster e sulla lettura dei segnaposto

**File:** `src/quests/outcomes/group-roster.ts:29-55`; `src/quests/party/lane-members.ts:54-69`
**Problem:** `seatHolderIdsOf`, `incoherentOf`, `fightersOf` e `seatHolderLaneMembersOf` sono coperti solo indirettamente dalle int-spec di boss e soccorso (che sì verificano il comportamento D-21 end-to-end: combattimento a posto pieno, nessun risultato e nessun premio al segnaposto, nessuna scrittura sul suo documento). Mancano spec unit nominate per: registrazione con `archivedAt` ma `character` assente o malformato (non deve finire in lista), ordine di `fightersOf` uguale a quello degli snapshot in sessione (dipendenza implicita di `battleOf`), e `incoherentOf` che esclude i segnaposto ma non gli altri `dropped`.
**Fix:** aggiungere `group-roster.spec.ts` con tre test nominati sulle funzioni pure e un test su `seatHolderLaneMembersOf` con modelli finti (archiviato incluso, corsia vuota in `dropped`).

### Gruppo C

### C-IN-01: `Enemy.locations` come lista non ha un test che rifiuti un valore fuori enum

**File:** `src/models/catalog-list-fields.schema.spec.ts:30-49` (modello: `src/models/enemy.model.ts:21-23`)

**Problem:** La spec nomina D-17b e prova default `[]`, `PoiType` come lista e lettura del valore scalare legacy per `PointOfInterest`, ma per `Enemy` verifica solo che `locations` sia un `Array` con default `[]`. Il rifiuto di un elemento fuori da `PoiType` è provato solo per `PointOfInterest.type` (`type.0`). Il probe fatto in review conferma che l'`enum` funziona anche su `Enemy.locations`, ma una regressione (es. `type: [String]` senza `enum` dopo un refactor) non romperebbe alcun test.

**Fix:** Aggiungere in `catalog-list-fields.schema.spec.ts` un caso gemello: `new EnemyProbe({ name: 'Goblin', locations: ['nope'] }).validateSync()` con `Object.keys(error?.errors ?? {})` uguale a `['locations.0']`, e un `hydrate({ locations: PoiType.city })` che torna `[PoiType.city]`. Scriverlo prima (RED sarebbe la rimozione dell'`enum`).

### C-IN-02: la spec di copertura dei decoratori accetta anche il solo `@IsOptional`

**File:** `src/validation/input-decorators.spec.ts:100-118`

**Problem:** Il test `validates every schema field of %s` confronta i nomi di proprietà con almeno un metadato di validazione, ma `@IsOptional()` è esso stesso un metadato condizionale per quella proprietà: un campo con il solo `@IsOptional()` (nessuna regola) risulterebbe «decorato». Le regole vere sono provate dalle `input-rules.spec.ts` per campi scelti, non per tutti (es. `EquipItemRequest.slotType`, `CoinsInput.gold/silver/copper` hanno copertura solo indiretta o parziale).

**Fix:** Nel filtro dei metadati escludere `ValidationTypes.CONDITIONAL_VALIDATION` (il tipo di `@IsOptional`) prima di costruire `decorated`, così ogni campo deve avere una regola reale. Test TDD: aggiungere in una classe sentinella un campo con il solo `@IsOptional()` e verificare che il controllo lo segnali.

### C-IN-03: `IsObjectIdHex` e costanti dei tetti duplicati come numeri nei modelli di richiesta

**File:** `src/models/request/complete-pending-request.model.ts:19`, `src/models/request/transaction-items.model.ts:6` (e `src/validation/object-id.pipe.ts:5`)

**Problem:** Il tetto di 100 compare in tre posti con nomi diversi (`MAX_TRANSACTION_LINES` e `MAX_ID_LIST` valgono entrambi 100 per la stessa regola D-04 «array ≤ 100», `MAX_OVERRIDE_ENTRIES` vale 50 per C5). Non è un bug, ma una modifica di D-04 va fatta in due punti. Boy Scout non fatto, trascurabile.

**Fix:** Esportare un unico `MAX_INPUT_LIST` (100) da `src/validation/` e farlo riusare da `ObjectIdListPipe` e `TransactionItems`; lasciare `MAX_OVERRIDE_ENTRIES = 50` separato perché deroga documentata (C5). Nessun test nuovo oltre a quelli esistenti che nominano il tetto 100.

## Observed but not flagged (decisioni di CONTEXT/RESEARCH)

### Gruppo A

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

### Gruppo B

- **Lettori tolleranti** (`refIdOf`, `idForms`, `sameId`, `objectIdFromHex`) ancora usati ovunque nel gruppo, anche dopo la migrazione: decisione C14 / D-17d, rimozione nel backlog v1.1.
- **Solo esadecimale minuscolo** nella conversione e nel verificatore: gli id maiuscoli o in altra forma restano stringhe e non sono contati come residui, quindi dopo la ritipizzazione non corrisponderebbero più ai filtri. Coerente con `isObjectIdHex` e con C14; non segnalato come difetto.
- **Segnaposto rimossi dalla registrazione alla risoluzione** (`dropped` li include): coerente con D-21 ("nessun risultato") e con la regola "ogni fallito libera il posto"; con boss vinto la quest è conclusa comunque.
- **Gara persa nel completamento del GM**: `lostCompletionError` può rispondere `QUEST_IN_PROGRESS` invece di `NOT_FOUND` se un partecipante ha occupato la corsia nel frattempo; è esattamente ciò che dichiara `BACKEND-NOTES.md` §4 (D-24).
- **Un job fallito conserva il suo `jobId` per 7 giorni** e un nuovo accodamento con lo stesso id viene ignorato da Bull: il commento di `FAILED_JOBS_KEPT` lo dichiara e lo sweep copre il caso (D-17a); il tetto usa età e conteggio, più stretto del solo conteggio di D-17a.
- **Sweep e backfill una volta al boot** (non più a ogni tick): D-17b. Le registrazioni senza `registeredAt` create dopo il boot da canali diversi dall'accettazione non verrebbero più retrodatate fino al riavvio; nessun codice del repo le crea.
- **Quest con soli segnaposto vivi a zero** (`roster.seats.length === 0` ⇒ stale): ripristinata dall'archivio ("tutti archiviati ⇒ quest non avviata", `seat-release.ts`), come dichiara `BACKEND-NOTES.md` §8.
- **`ObjectIdPipe` su `quest`, `questUpdated`, `user`**: da malformato `NOT_FOUND` a `BAD_USER_INPUT` (D-02), aggiornata la int-spec.

---

_Reviewed: 2026-10-30T14:56:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo C

- `CoinsInput`, `AssetQuantityInput.quantity` e `ItemUsageInput.quantity` hanno `@Min(0)` ma non un massimo: voluto da C5/D-04 («solo forma», 0 e limiti dipendenti dal personaggio restano `INVALID_QUANTITY` / `OUTCOME_*` del service); il tetto naturale è l'`Int` GraphQL a 32 bit.
- `CreateCharacterInput.age` ha solo `@IsInt`: l'età per razza resta del dominio (C4).
- `EquipSpellRequest.usages` senza decoratori e scartato dalla whitelist: D-01.
- Lettori tolleranti `refIdOf`/`idForms`/`sameId`/`objectIdFromHex` non rimossi: C14, backlog v1.1.
- Non formattati secondo Prettier `src/models/request/*`, `coins.model.ts`, i `*.module.ts` del catalogo: noti.
- `MIXED_REF_PATHS` non contiene `cities.pointsOfInterest` perché era già `ObjectId` (probe) e non contiene `quests.activeStoryQuest`/`activeWorldMissionQuest` perché già `MongooseSchema.Types.ObjectId` a `origin/develop`: coerente con C14 e con la spec dell'inventario.
- `ObjectIdPipe`/`ObjectIdListPipe` rifiutano l'esadecimale maiuscolo (scelta consapevole di D-02/C3, `BAD_USER_INPUT`).
- Il cambio di messaggio e di codice (`NotFoundException` grezza a `ResourceNotFoundException` con `NOT_FOUND`) è D-11; i messaggi sono ora in italiano e senza id nel testo.

---

_Reviewed: 2026-10-30T14:51:24Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
