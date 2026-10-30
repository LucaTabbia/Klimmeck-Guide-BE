---
phase: 10
slug: hardening-trasversale
audited: 2026-10-30
status: secured
asvs_level: 1
block_on: high
threats_total: 107
threats_mitigated: 100
threats_accepted: 3
threats_transferred: 4
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
updated: 2026-10-30
---

# Phase 10 - Security (Hardening trasversale, BE)

Audit dei blocchi `<threat_model>` dei piani 10-01..10-31 (107 righe, T-10-01..T-10-107) contro il codice finale di `feat/10-hardening`: HEAD di codice `de1cbac` (dopo i 27 commit dei 15 fix di `10-REVIEW-FIX.md`); sopra c'e' solo un commit docs (`69add94`), che non tocca `src`. Base `origin/develop`. L'evidenza e' il codice a HEAD (Read/grep) e i test nominati. Nessun file di implementazione e' stato modificato, nulla e' stato committato, nessun `.env` letto (solo `.env.example`), nessuna rete.

Disposizioni: M = mitigated (codice + test), A = accepted (D-xx o nota del PLAN), T = transferred (infrastruttura o utente). Nessuna `open`, nessuna `deferred` fra le 107 minacce. Il lavoro futuro dichiarato che NON e' una minaccia del registro e' elencato in fondo (sezione «Lavoro dichiarato fuori registro»).

## Esecuzioni di questo audit

- Spec UNIT mirate, in foreground (`npx jest <file...> --selectProjects unit`): 13 suite / 155 test verdi: `unhandled-exception.filter.spec.ts`, `sightengine-image.moderator.spec.ts`, `change-stream-publisher.spec.ts`, `trust-proxy.configurer.spec.ts`, `cloudinary.service.spec.ts`, `env-example.secrets.spec.ts`, `env-example.drift.spec.ts`, `runtime-config.spec.ts`, `input-decorators.spec.ts`, `enqueue-trigger.spec.ts`, `mixed-ref-paths.spec.ts`, `production-errors.spec.ts`, `request-id.spec.ts`.
- Non rieseguiti (numeri presi da `10-REVIEW-FIX.md`): `npm run build` 0; `tsc --noEmit` 0; `test:unit` 182 suite / 2419; `test:cov` 281 suite / 3696 con le 8 soglie per cartella; boot reale 65/65; SDL con la sola riga aggiunta `pendingQuest: ID`. Nessuna integration lanciata.
- `pgrep -fl jest | grep Klimmeck` a fine lavoro: vuoto.

## Controlli trasversali

| Controllo | Comando | Esito |
|-----------|---------|-------|
| Nessun `.env`/chiave/service account tracciato | `git ls-files \| grep -Ei '(^\|/)\.env($\|\.)\|\.pem$\|\.key$\|service-?account\|google-services'` | solo `.env.example` |
| Segreti vuoti nel template | `grep -nE '^(CLOUDINARY_API_KEY\|CLOUDINARY_API_SECRET\|DEV_AUTH_ACCESS_TOKEN\|FIREBASE_SERVICE_ACCOUNT\|JWT_SECRET\|SIGHTENGINE_API_SECRET\|SIGHTENGINE_USER_ID\|TWITCH_CLIENT_SECRET\|TWITCH_EVENTSUB_SECRET)=' .env.example` | 9 chiavi, tutte vuote (`env-example.secrets.spec.ts` verde); `THROTTLE_*` vuote; `MONGO_URI` e' il solo valore locale senza credenziali |
| Nessuna URI o segreto nei `.md` della fase e nel runbook | `grep -rnE` su schemi `mongodb://`, `sk_live`, `AKIA`, chiavi PEM, `api_secret = <valore>` su `.planning/phases/10-hardening-trasversale/*.md` e `docs/runbooks/mixed-refs-migration.md` | runbook: 0 occorrenze (solo `<uri di produzione>`); nei `.md` della fase 7 righe che NOMINANO lo schema (nomi di test, esempio fittizio `user:pw@host` di RESEARCH, asserzioni di accettazione): nessun valore reale |
| Letterali vietati assenti dalla produzione | `git grep -nE '<letterale>' -- 'src/**/*.ts' ':!*.spec.ts' ':!*.int-spec.ts'` per `enableCors`, `FileTypeValidator`, `introspection: true`, `ParseObjectIdPipe`, `IsObjectIdPipe`, `@IsMongoId(`, `removeOnFail: false` | 0 per ciascuno |
| `process.env` solo nel CLI di migrazione | `git grep -n 'process\.env' -- src ':!*.spec.ts' ':!*.int-spec.ts'` | solo `src/migrations/run-mixed-refs.ts:75` |
| Handler limitati = 8 | `git grep -nE '@Throttled(Webhook)?\(\)' -- src ':!*.spec.ts' ':!*.int-spec.ts'` | 8: `AuthResolver` x2, `TwitchAuthController` x2, `EventSubController.receive` (webhook), `CloudinaryController` x3; coincide con `EXPECTED_THROTTLED_HANDLERS` del boot reale |
| `@Public()` invariati | `git grep -cE '^[[:space:]]*@Public\(\)' -- src ':!*spec.ts'` contro `origin/develop` | 6 = 6 (`app.controller` 1, `auth.resolver` 2, `twitch-auth.controller` 2, `eventsub.controller` 1); le 2 occorrenze in piu' sono nella sonda `src/http/http-hardening.int-spec.ts`, non nel codice di produzione |
| Log senza documenti/token/URI/punteggi | `grep` di `JSON.stringify`, `error.message`, `scores`, `MONGO_URI` sui file non-spec del diff + lettura dei punti di log | nessun log nuovo li contiene; i due `error.message` di `main.ts` e `character-access.policy.ts` sono preesistenti (non nel diff); Sightengine logga solo esito e categorie, Cloudinary solo nome e codice (`providerErrorOf`), publisher solo soggetto/tentativo/ritardo |
| SDL | `git diff origin/develop -- src/schema.gql \| grep -E '^[+-]'` | una sola riga `+  pendingQuest: ID`, 0 righe rimosse |
| Dipendenze nuove | lettura `package.json` | solo class-validator, class-transformer, @nestjs/throttler (piu' tipi jest) |

## Trust Boundaries

| Boundary | Descrizione |
|----------|-------------|
| client -> GraphQL/REST | input validato da `ValidationPipe` globale (`APP_PIPE` in `ValidationModule`, `whitelist: true`, `exceptionFactory` con soli percorsi); le guard girano prima delle pipe |
| produzione -> client | introspection spenta, `hideSchemaDetailsFromClientErrors`, errori interni sostituiti da `Errore interno` + `requestId`, filtro HTTP globale, WS con `validate`/`onNext`/`onError` |
| upload -> Cloudinary | limiti multer, firma sul contenuto, moderazione Sightengine fail-closed prima dell'upload |
| Internet -> handler sensibili | throttler per IP su 8 handler, `trust proxy` spento di default |
| codice -> dati legacy | `ObjectId` tipizzati; migrazione `src/migrations/mixed-refs` + verificatore al boot; lettori tolleranti ancora presenti |
| BE -> FE innkeeper | `pendingQuest` additivo dietro `@Roles(innkeeper)`; audit con target `PendingQuest` |

## Threat Verification

| Threat | Disp | Status | Evidenza (file) | Test |
|--------|------|--------|-----------------|------|
| T-10-01 | M | CLOSED | `src/quests/pending-requests/pending-requests.resolver.ts` `@Roles(RoleType.innkeeper)` (righe 25, 32, 46), nessun handler nuovo | boot reale `EXPECTED_INNKEEPER_HANDLERS`; `standard-lane-liveness.int-spec.ts` |
| T-10-02 | M | CLOSED | diff `src/schema.gql`: solo `+  pendingQuest: ID` | boot reale (blocco `PendingRequestCharacter`) |
| T-10-03 | M | CLOSED | `archived-character-queue.refresher.ts:42,47` -> `queue.requestRefresh()`; `pending-requests.publisher.ts:25` `KeyedSingleFlight` | `archived-character-queue.refresher.spec.ts` |
| T-10-04 | M | CLOSED | `pending-requests.service.ts:33` `GM_QUEUE_FILTER` (filtro attivi) + refresher sull'archivio | `standard-lane-liveness.int-spec.ts` |
| T-10-05 | M | CLOSED | `quest-lanes.ts:41` `STANDARD_LANE_FREE`; `outcome-plan.ts:278` nel filtro di scrittura GM; `gm-completion.service.ts:96,125,290` `assertNoBusyParticipant` (pre-check e in sessione) | `gm-completion.service.int-spec.ts` `busy standard lane (D-24)` |
| T-10-06 | M | CLOSED | interceptor di audit esistente + `QUEST_IN_PROGRESS` | `complete-pending-request.resolver.int-spec.ts` caso `audits a completion refused ... QUEST_IN_PROGRESS` |
| T-10-07 | A | CLOSED | `game-rule.exception.ts:120` messaggio fisso senza id ne' titolo; accettato nel PLAN 10-02 | factory in `game-rule.exception.spec.ts` |
| T-10-08 | T | CLOSED | `.github/workflows/gitleaks.yml` (push, pull_request, workflow_dispatch, schedule, `gitleaks-action@v3`, `fetch-depth: 0`); prima scansione completa a carico dell'utente | vedi Accepted/Transferred log |
| T-10-09 | M | CLOSED | `.env.example` segreti vuoti | `env-example.secrets.spec.ts` (eseguita, verde) |
| T-10-10 | M | CLOSED | `gitleaks.yml` `permissions: contents: read, pull-requests: read`, `GITLEAKS_ENABLE_COMMENTS: 'false'` | lettura del workflow |
| T-10-11 | A | CLOSED | `.gitleaks.toml` allowlist limitata a `.env.example`, spec, int-spec, `test/`; `.planning/` fuori; D-09 | log accettati |
| T-10-12 | M | CLOSED | `src/mongo/change-stream-publisher.ts` `openOrRetry`, `scheduleReopen`, riapertura con backoff; hook `onHistoryLost` (fix B-WR-02) | `change-stream-publisher.spec.ts` (eseguita); `change-stream-reopen.int-spec.ts` |
| T-10-13 | M | CLOSED | `reopen-backoff.ts` `min(1000*2^n, 30000)`; `change-stream-publisher.ts:139` `setTimeout(...).unref()`, un solo timer | `reopen-backoff.spec.ts`; `change-stream-publisher.spec.ts` |
| T-10-14 | M | CLOSED | log del publisher: soggetto, tentativo, ritardo, `describeError` (`change-stream-publisher.ts:152`) | caso unit dedicato del log |
| T-10-15 | M | CLOSED | `validation-pipe.factory.ts` `whitelist: true` | `validation-pipe.int-spec.ts` `strips a declared field without validators`; `STRIPPED_FIELDS` in `input-decorators.spec.ts` |
| T-10-16 | M | CLOSED | `src/mongo/document-id.ts:3` `^[0-9a-f]{24}$`; `IsObjectIdHex`; `ObjectIdPipe` su 11 file resolver | `is-object-id-hex.decorator.spec.ts`, `object-id.pipe.spec.ts` |
| T-10-17 | M | CLOSED | `invalid-fields.ts` solo percorsi; `OBJECT_ID_HEX_MESSAGE` costante | `invalid-fields.spec.ts`, `never reports a value` |
| T-10-18 | A | CLOSED | guard prima delle pipe (sonda RESEARCH), accettato nel PLAN 10-05 | `scalar-ids.int-spec.ts` caso `UNAUTHENTICATED` prima della pipe |
| T-10-19 | M | CLOSED | `input-decorators.spec.ts` confronta SDL e metadati; unica eccezione `EquipSpellRequest.usages` | spec eseguita, verde; C-IN-02: `@IsOptional` da solo non conta (`de1cbac`) |
| T-10-20 | M | CLOSED | `@Type` sugli annidati | `declares @Type on every nested input of %s (D-01)` |
| T-10-21 | M | CLOSED | `@ArrayMaxSize` (8 usi in `src/models`), `MAX_TRANSACTION_LINES` 100, `MAX_OVERRIDE_ENTRIES` 50 | `input-rules.spec.ts`; `complete-pending-request.resolver.int-spec.ts` (51 outcomes) |
| T-10-22 | M | CLOSED | decoratori di sola forma; tetti C-WR-01 (`NAME_MAX_FORM_LENGTH` 200, 4000, 2048) | `input-rules.spec.ts`; `character-creation.resolver.int-spec.ts` |
| T-10-23 | M | CLOSED | `runtime-config.ts` `RUNTIME_MODES` (3 valori, errore su ignoto, «staging uses production»); `dev-auth.strategy.ts:22` `this.runtime.production` | `runtime-config.spec.ts` (eseguita), `dev-auth.strategy.int-spec.ts` |
| T-10-24 | M | CLOSED | messaggio di boot costante (nessun valore di `NODE_ENV`) | `runtime-config.spec.ts` |
| T-10-25 | M | CLOSED | messaggio «staging uses production» + checklist di deploy `BACKEND-NOTES.md` §10 | spec + lettura §10 |
| T-10-26 | M | CLOSED | `validation.module.ts` `APP_PIPE`, importato in `src/app.module.ts:72` e nell'harness | boot reale `mounts the global validation pipe`; casi sul filo per area |
| T-10-27 | M | CLOSED | tabella «Codici spostati» in `BACKEND-NOTES.md` §3 (31 righe) | lettura del handoff |
| T-10-28 | M | CLOSED | interceptor di audit prima della pipe | `complete-pending-request.resolver.int-spec.ts` audit `BAD_USER_INPUT` |
| T-10-29 | M | CLOSED | `ObjectIdPipe` su `quest`, `questUpdated`, `user`, `getPath` | `scalar-ids.int-spec.ts` |
| T-10-30 | M | CLOSED | `UNAUTHENTICATED`/`FORBIDDEN` prima della pipe; messaggio senza valore | `scalar-ids.int-spec.ts` |
| T-10-31 | M | CLOSED | `character-access.policy.ts:99,117,138` solo il ramo dell'id malformato (`BadUserInputException.of(['id'])`) prima di ogni lettura | suite di ownership (`characters-ownership.int-spec.ts`) |
| T-10-32 | M | CLOSED | factory fisse in `src/authz/resource-not-found.exception.ts`; 0 `new NotFoundException` in produzione | `catalog-ids.int-spec.ts` |
| T-10-33 | M | CLOSED | `object-id.pipe.ts:6` `MAX_ID_LIST = 100`, `ObjectIdListPipe` | `catalog-ids.int-spec.ts` (>100) |
| T-10-34 | M | CLOSED | `ObjectIdPipe` sui `findById` del catalogo | `catalog-ids.int-spec.ts` |
| T-10-35 | M | CLOSED | `graphql-options.factory.ts:56` `introspection: !production`, landing disabilitata | `production-surface.int-spec.ts` |
| T-10-36 | M | CLOSED | `graphql-options.factory.ts:13,39,93,111` `NoSchemaIntrospectionCustomRule` nel `validate` WS | `production-surface.int-spec.ts` (WS) |
| T-10-37 | M | CLOSED | `production-errors.ts` `sanitizeFormattedError`, `includeStacktraceInErrorResponses: false`, `onNext`/`onError`; filtro HTTP | `production-errors.spec.ts` (eseguita), `production-surface.int-spec.ts` |
| T-10-38 | M | CLOSED | `graphql-options.factory.ts:57` `hideSchemaDetailsFromClientErrors` + rimozione suggerimenti sul WS (`:117`) | `graphql-options.factory.spec.ts` |
| T-10-39 | M | CLOSED | `src/graphql/request-id.ts:6` `^[A-Za-z0-9._-]{1,64}$`, altrimenti `randomUUID()` | `request-id.spec.ts` (eseguita) |
| T-10-40 | M | CLOSED | `request-id.plugin.ts` stesso `requestId` in risposta e log | `request-id.plugin.spec.ts` |
| T-10-41 | M | CLOSED | `cloudinary.controller.ts` senza try/catch; `unhandled-exception.filter.ts` 500 `Errore interno` + `requestId` in produzione | `cloudinary.controller.int-spec.ts`; `unhandled-exception.filter.spec.ts` |
| T-10-42 | M | CLOSED | `image-upload.ts` `IMAGE_UPLOAD_LIMITS` (5 MiB, 1 file) in `FileInterceptor` (`cloudinary.controller.ts:53`) | `cloudinary.controller.int-spec.ts` (413/400) |
| T-10-43 | M | CLOSED | `image-signature.validator.ts` magic bytes JPEG/PNG/WEBP, `ParseFilePipe` | `image-signature.validator.spec.ts`; int-spec controller |
| T-10-44 | M | CLOSED | `cloudinary-folder.request.ts` `@MaxLength(200)` + `@Matches(/^[A-Za-z0-9_/-]*$/)`, usato in `getUrls` | int-spec controller (folder non valido -> 400) |
| T-10-45 | M | CLOSED | 0 `enableCors` in produzione | `test/app.int-spec.ts` `sends no CORS headers (D-06)` |
| T-10-46 | M | CLOSED | `request-id.middleware.ts:11` riusa `requestIdFrom` | `request-id.middleware.spec.ts` |
| T-10-47 | M | CLOSED | `@Throttled()` su `exchangeLoginTicket`/`refreshSession`; `TooManyRequestsException` | `throttling.int-spec.ts` |
| T-10-48 | M | CLOSED | `@Throttled()` sulle tre REST (`cloudinary.controller.ts:36,43,52`) | `throttling.int-spec.ts`, boot reale |
| T-10-49 | M | CLOSED | default configurabili (`throttle-config.ts`), 8 handler enumerati, nessuna mutation di gioco | boot reale `exposes exactly the enumerated throttled handlers (D-08)` |
| T-10-50 | M | CLOSED | `too-many-requests.exception.ts` codice `TOO_MANY_REQUESTS`, `app-throttler.guard.ts` | `app-throttler.guard.spec.ts`, `throttling.int-spec.ts` |
| T-10-51 | T | CLOSED | `THROTTLE_TRUST_PROXY` opzionale (`trust-proxy.configurer.ts`); WARN in produzione se spenta (A-IN-03, `:28-29`); topologia decisa dall'utente (§10, §11) | `trust-proxy.configurer.spec.ts` (eseguita) |
| T-10-52 | M | CLOSED | `twitch-auth.controller.ts:22,36` `@Throttled()` + `@UseFilters(OAuthRateLimitRedirectFilter)` -> redirect `rate_limited` | `oauth-rate-limit-redirect.filter.spec.ts`, `twitch-auth.controller.int-spec.ts` |
| T-10-53 | M | CLOSED | `eventsub.controller.ts:15` `@ThrottledWebhook()`, `WEBHOOK_LIMIT_FACTOR` 50 | `eventsub-throttle.int-spec.ts` (10 notifiche firmate tutte 204) |
| T-10-54 | M | CLOSED | bucket webhook dedicato, HMAC decide la fiducia | `eventsub-throttle.int-spec.ts` (429 oltre il bucket) |
| T-10-55 | M | CLOSED | `trust-proxy.configurer.ts:26-29` `trust proxy` impostato solo con `THROTTLE_TRUST_PROXY` | boot reale `leaves the proxy trust off by default (C19)` |
| T-10-56 | M | CLOSED | `moderation-config.ts:63-65` rifiuto del boot in produzione (con `trim`, fix A-IN-01); `:32` config parziale rifiutata | `env.validation.spec`, caso `NODE_ENV` con spazi |
| T-10-57 | M | CLOSED | messaggi costanti | test con `toEqual` sui messaggi |
| T-10-58 | M | CLOSED | `env-example.drift.spec.ts` bidirezionale | spec eseguita, verde |
| T-10-59 | M | CLOSED | `.env.example` segreti vuoti | `env-example.secrets.spec.ts` (eseguita) |
| T-10-60 | M | CLOSED | `sightengine-image.moderator.ts` ogni errore -> `unavailable(...)` (HTTP `:54`, rete `:67`, parse `:75`, senza esito `:96`, senza modelli `:99` fix A-WR-02) -> 503 | `sightengine-image.moderator.spec.ts` (eseguita), `fails closed on a success response without any model section (D-14)` |
| T-10-61 | M | CLOSED | `image-policy.ts` `MODERATION_THRESHOLD = 0.5`, 21 regole | `image-policy.spec.ts` (un test per regola); tabella da confermare, vedi §11 |
| T-10-62 | M | CLOSED | log solo esito e categorie (`describeVerdict`) | caso unit dedicato nello spec Sightengine |
| T-10-63 | M | CLOSED | `ImageRejectedException(reasons)` solo categorie | `image-moderation.exceptions.spec.ts`; int-spec 422 |
| T-10-64 | M | CLOSED | `sightengine-image.moderator.ts:20,64` `AbortSignal.timeout(5000)` | spec Sightengine (timeout) |
| T-10-65 | M | CLOSED | `portrait-upload.service.ts` modera (`:19`) e lancia `ImageRejectedException` (`:25`) prima di `cloudinary.uploadImage` | `portrait-upload.service.spec.ts`; `answers 422 ... never reaches Cloudinary` |
| T-10-66 | M | CLOSED | l'indisponibilita' passa invariata, nessun upload | `answers 503 IMAGE_MODERATION_UNAVAILABLE and never reaches Cloudinary` |
| T-10-67 | M | CLOSED | boot rifiutato in produzione (T-10-56) + `ModerationStartupReporter` WARN quando disattivata | `moderation-startup.reporter.spec.ts`; boot reale `mounts the image moderation disabled ...` |
| T-10-68 | M | CLOSED | harness con `FakeImageModerator`, boot reale con chiavi svuotate | `fake-image-moderator.ts`; blocco env del boot reale |
| T-10-69 | M | CLOSED | `character-updates.publisher.ts:31` e `user-updates.publisher.ts:27` `KeyedSingleFlight` per id | `character-updates.publisher.spec.ts`, `user-updates.publisher.spec.ts` |
| T-10-70 | M | CLOSED | `enqueue-trigger.ts:17,43` `removeOnFail: FAILED_JOBS_KEPT` (7 giorni, 1000); 0 `removeOnFail: false` | `enqueue-trigger.spec.ts` (eseguita) |
| T-10-71 | M | CLOSED | `CharacterUpdatesPublisher extends ChangeStreamPublisher` | `character-updates.publisher.spec.ts` |
| T-10-72 | M | CLOSED | 8 indici nominati (`character.model.ts` 4, `quest.model.ts` 2, `pending-quest.model.ts`, `user.model.ts`); `SweepIndexVerifier`; backfill fuori dal tick | `sweep-indexes.schema.spec.ts`, `sweep-index.verifier.int-spec.ts` |
| T-10-73 | M | CLOSED | `sweep-index.verifier.ts:39-52` `void this.verifyAll()`, try/catch per modello, solo log | `sweep-index.verifier.int-spec.ts` |
| T-10-74 | M | CLOSED | `enemy.model.ts`/`point-of-interest.model.ts` `type: [String]` con `enum` | `catalog-list-fields.schema.spec.ts`, `point-of-interest-type.int-spec.ts` |
| T-10-75 | M | CLOSED | `tsconfig.json` `types` con jest; `ci.yml:58-59` step `Type check` | `tsc --noEmit` 0 (da `10-REVIEW-FIX.md`) |
| T-10-76 | M | CLOSED | `group-roster.ts` posti vivi vs `seatHolders`; scritture solo per `roster.seats` (`boss-resolution.service.ts`) | `boss-resolution.int-spec.ts:441` `gives no reward and no result to an archived seat holder`; `group-roster.spec.ts` |
| T-10-77 | M | CLOSED | `writer.deletePendingQuest` per ogni seat holder nella stessa transazione (`boss-resolution.service.ts:170,183`) | `boss-resolution.int-spec.ts`, `aid-rescue.int-spec.ts` |
| T-10-78 | M | CLOSED | `fightersOf(roster)`: il nemico affronta il gruppo al completo (D-21) | `group-roster.spec.ts`, `boss-resolution.int-spec.ts` |
| T-10-79 | M | CLOSED | `travel.updates.ts:106-109` `startDate` nella stessa scrittura di `arrivedAt`; `quest-acceptance.service.ts` `startDate` nell'insert | `travel-completion.int-spec.ts` `solo start with the arrival (D-22)` |
| T-10-80 | M | CLOSED | `quest-start.service.ts:120` `scheduleStarted` dopo il commit (`travel-completion.service.ts:175`, `quest-acceptance.service.ts:247`); sweep come recupero | `quest-start.service.spec.ts`, spec «start fails after the commit» |
| T-10-81 | M | CLOSED | `PendingQuestStartPublisher` usa `requestPublish` del publisher esistente; filtro della subscription invariato | `pending-quest-start.publisher.spec.ts` / `int-spec.ts` |
| T-10-82 | M | CLOSED | `pending-requests.resolver.ts:47` `@AuditTarget('PendingQuest', ...)`; `admin-audit.interceptor.ts` `declaredTargetOf` | `audit-target.decorator.spec.ts`; `complete-pending-request.resolver.int-spec.ts` |
| T-10-83 | M | CLOSED | refactor `fightRescuers`/`settleWounded` con rete `aid-rescue`/`aid-timeout`/`boss-resolution` invariata | tre int-spec, 40 test prima e dopo |
| T-10-84 | M | CLOSED | test di concorrenza auth | `session.service.int-spec.ts:680` `lets only one of five concurrent refreshes rotate ...`; `login-ticket.service.int-spec.ts`; `auth-session.service.int-spec.ts` |
| T-10-85 | M | CLOSED | test di consegna doppia | `points-credit.service.int-spec.ts:93` `credits a redemption once when Twitch delivers it twice concurrently` |
| T-10-86 | M | CLOSED | `package.json` `coverageThreshold` (8 cartelle, righe 153-188), CI `ci.yml:62` `npm run test:cov` | `test:cov` 281 suite / 3696 (da `10-REVIEW-FIX.md`) |
| T-10-87 | M | CLOSED | `do-transaction.int-spec.ts:440` `sells the last copy or equips it, never both, under concurrency` | spec nominata |
| T-10-88 | M | CLOSED | `travel-scheduler.service.spec.ts:76` `warns and relies on the sweep when the travel job cannot be enqueued` | spec nominata + sweeper |
| T-10-89 | M | CLOSED | soglie finali in `package.json` alzate, mai abbassate (SUMMARY 10-25) | `test:cov` |
| T-10-90 | M | CLOSED | `mixed-ref-pipelines.ts:5` `^[0-9a-f]{24}$` (non esadecimali intatte), modalita' `dry-run`/`apply`/`verify`, idempotenza | `mixed-refs.migration.int-spec.ts`, `run-mixed-refs.cli.int-spec.ts` (6) |
| T-10-91 | M | CLOSED | `mixed-refs.migration.ts:47-65` `UnsupportedMongoVersionError` prima di ogni scrittura | int-spec migrazione |
| T-10-92 | M | CLOSED | `run-mixed-refs.ts:39-44` errore con `describeError`, report JSON di soli conteggi | `run-mixed-refs.cli.int-spec.ts` `never prints the connection string (D-17d)` |
| T-10-93 | M | CLOSED | `src/migrations/mixed-refs/mixed-refs.verifier.ts` in `MongoModule` (`mongo.module.ts:61`), ERROR esplicito; ordine nel runbook | `mixed-refs.verifier.int-spec.ts`; boot reale `mounts the Mixed references verifier` |
| T-10-94 | M | CLOSED | test legacy riscritti sul percorso migrato (`migrateLegacyRefs`); verificatore al boot; runbook | `shop-transaction.service.int-spec.ts`, `character-archiver.int-spec.ts` |
| T-10-95 | M | CLOSED | diff SDL: 0 righe `-`, una `+` | controllo trasversale |
| T-10-96 | M | CLOSED | verificatore + runbook (migrazione prima del deploy); test legacy migrati | `equip-spell.int-spec.ts`, `use-spell.int-spec.ts` (suffisso `after the reference migration (D-17d)`) |
| T-10-97 | M | CLOSED | non esadecimali intatte; lettori tolleranti (`refIdOf`, `idForms`, `sameId`, `objectIdFromHex`) presenti: 49/54/26/38 | `mixed-ref-paths.spec.ts` (eseguita, 0 `Mixed` negli schemi) |
| T-10-98 | T | CLOSED | `docs/runbooks/mixed-refs-migration.md` (ordine numerato, `mongodump`/`mongorestore`, PR draft); esecuzione in produzione a carico dell'utente | lettura del runbook; vedi log |
| T-10-99 | M | CLOSED | runbook con soli placeholder (`<uri di produzione>`), 0 URI | controllo trasversale sui `.md` |
| T-10-100 | M | CLOSED | sezione `## Rollback`: il codice precedente legge ObjectId e stringhe; `mongorestore --drop` solo se lo script sbaglia | lettura del runbook |
| T-10-101 | M | CLOSED | `BACKEND-NOTES.md` solo placeholder | controllo trasversale sui `.md` |
| T-10-102 | M | CLOSED | `BACKEND-NOTES.md` §10 checklist, README `## Deploy`; boot rifiuta `NODE_ENV` ignoti | `runtime-config.spec.ts` |
| T-10-103 | M | CLOSED | `BACKEND-NOTES.md` §2-§3 (codici nuovi e spostati) ed emendamenti datati nei handoff precedenti | lettura del handoff |
| T-10-104 | M | CLOSED | SDL: 0 righe rimosse, una aggiunta | controllo trasversale |
| T-10-105 | M | CLOSED | `@Public` 6 = 6 in produzione; 8 handler limitati | controllo trasversale; boot reale |
| T-10-106 | M | CLOSED | letterali vietati 0 in produzione; `process.env` solo nel CLI | controllo trasversale; `env-example.drift.spec.ts` |
| T-10-107 | T | CLOSED | PR draft finche' non c'e' il report di `--verify` della produzione: voce in `STATE.md` (Blockers/Concerns) e riga manual-only in `10-VALIDATION.md`; la gestione della PR e' dell'orchestratore e dell'utente | lettura di STATE e VALIDATION |

## Accepted Risks Log

| Threat | Rischio accettato | Fonte |
|--------|-------------------|-------|
| T-10-07 | Il rifiuto `QUEST_IN_PROGRESS` rivela solo che il partecipante e' impegnato (messaggio fisso, senza id ne' titolo della missione) | PLAN 10-02, D-24 |
| T-10-11 | Allowlist di gitleaks su template e spec/fixture con valori finti; `.planning/` fuori allowlist (da aggiungere solo dopo la prima scansione se emergono falsi positivi); revisione nel handoff | PLAN 10-03, D-09; `BACKEND-NOTES.md` §11 (A8) |
| T-10-18 | Un non autenticato non puo' sondare la validazione: le guard girano prima delle pipe, riceve sempre `UNAUTHENTICATED` | PLAN 10-05, sonda RESEARCH; verificato da `scalar-ids.int-spec.ts` |

## Transferred Risks Log

| Threat | Destinatario | Cosa resta da fare |
|--------|--------------|--------------------|
| T-10-08 | Utente | Dopo il push: `gh workflow run gitleaks.yml --ref feat/10-hardening` (scansione completa), per ogni finding reale ruotare il secret alla fonte e registrare la fingerprint in `.gitleaksignore` senza riscrivere la storia; verificare che la sintassi `[allowlist]` sia applicata dalla 8.24.3 (A8) |
| T-10-51 | Infrastruttura / utente | Impostare `THROTTLE_TRUST_PROXY` (hop o elenco) quando la topologia del reverse proxy e' nota; finche' e' vuota il WARN di produzione ricorda che il throttling vede un solo indirizzo |
| T-10-98 | Utente | Eseguire i passi 1-4 del runbook (backup, copia, produzione col codice attuale), allegare i report JSON di `--verify`, deploy, poi di nuovo `--apply` + `--verify` e controllo del log del verificatore; MongoDB >= 4.2 |
| T-10-107 | Orchestratore / utente | Tenere la PR in draft fino al report di `--verify` della produzione; marcarla pronta solo dopo |

Altre azioni di deploy trasferite, non legate a una riga specifica: Redis con `maxmemory-policy noeviction` (infrastruttura, `BACKEND-NOTES.md` §10; la mitigazione T-10-70 limita solo i job falliti), rotazione dei secret alla fonte, chiavi di produzione (Firebase, Sightengine, JWT, Twitch, EventSub), `NODE_ENV=production` anche in staging, chiamata Sightengine reale per A2, conferma dei default in §11 (policy Sightengine A2-A5, throttle 60 000 ms / 20 / webhook x50, `error=rate_limited` sul deep link OAuth).

## Unregistered Flags

Nessun `## Threat Flags` nei SUMMARY che non mappi su un ID del registro. Osservazioni informative dell'audit, non bloccanti:

- Residuo noto di B-WR-02 (dichiarato in `10-REVIEW-FIX.md`): alla perdita della storia del change stream (codice 286) solo `PendingRequestsPublisher` e `ArchivedCharacterQueueRefresher` ricalcolano; gli altri publisher registrano il WARN e i client restano allo stato precedente fino all'evento successivo. Impatto: disponibilita' dei push in tempo reale, non riservatezza. Resta coerente con T-10-12 (nessun silenzio: c'e' il WARN).
- `src/main.ts` e `character-access.policy.ts` loggano `error.message`: preesistenti, fuori dal diff della fase.
- `AdminAuditLogService.record` usa `new Date()`: preesistente, backlog (da `10-REVIEW-FIX.md`).

## Lavoro dichiarato fuori registro (non sono minacce aperte)

- Rimozione dei lettori tolleranti dei ref (`refIdOf`, `idForms`, `sameId`, `objectIdFromHex`): backlog v1.1, dopo la migrazione in produzione.
- Eventuale `MigrationsModule` al posto di `MixedRefsVerifier` in `MongoModule` (B-IN-06): backlog v1.1.
- UAT del pannello del GM nella FE Phase 10 (piano gated 10-11 del repo FE, campo `pendingQuest`, `QUEST_IN_PROGRESS`): dopo la merge di questa PR.
- Test instabile del boot reale (`global auth guard`): 1 su 3 al piano 10-24, poi mai piu'; non e' una minaccia.

## Verdetto

`secured`: 107/107 minacce chiuse (100 mitigate, 3 accettate, 4 trasferite), 0 aperte, 0 bloccanti con `block_on: high`. Le azioni residue sono dell'utente e sono tracciate in `STATE.md`, in `10-VALIDATION.md` (manual-only) e in `BACKEND-NOTES.md` §10-§11.
