# Phase 10: Hardening Trasversale - Research

**Researched:** 2026-10-29
**Domain:** NestJS 11.1.6 + Apollo Server 4.12.2 (`@nestjs/apollo` 13.1.0, `@nestjs/graphql` 13.2.0, graphql-ws 6.0.6) + Mongoose 8.18.1 + Bull 4.16.5; class-validator / class-transformer / `@nestjs/throttler` (new); Sightengine REST; gitleaks-action v3; Jest 30 multi-project coverage
**Confidence:** HIGH for code facts and probe-verified behaviour; MEDIUM for Sightengine policy mapping (the docs give no thresholds, two response-shape points are unverified without a real call); MEDIUM for gitleaks false positives (no local scan possible).

**Probes run (all disposable, all deleted, `git status --short` clean before writing this file):**
- `test/zz-probe-hardening.int-spec.ts` (6 green cases): global `ValidationPipe` on Apollo args, custom exception factory, scalar id pipe, `@ArgsType`, guard-vs-pipe order, `@nestjs/throttler` on GraphQL and REST, `ParseFilePipe` + `FileTypeValidator` + multer limits.
- `test/zz-probe-prod.int-spec.ts` (2 green cases): production Apollo options over HTTP **and** graphql-ws (introspection, suggestions, error leak, landing page).
- `test/zz-probe-mixed.spec.ts`: real `SchemaFactory` path types of every ref (Mixed inventory).
- Offline scripts in the scratchpad: Node `FormData`/`Blob` multipart encoding, `FileTypeValidator` outside Jest, `tsc` with `types: ["jest"]`.
- One full coverage run (unit + integration, foreground, 262 s, 217 suites / 3089 tests green), report written outside the repo.
- class-validator 0.15.1, class-transformer 0.5.1, validator, libphonenumber-js and `@nestjs/throttler` 6.7.1 were copied into `node_modules` **only for the probes** and removed afterwards (`package.json`/lockfile untouched).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Validazione input (BE-HARD-01)
- **D-01 (utente: «Scartate in silenzio»):** `ValidationPipe` globale `{ whitelist: true, forbidNonWhitelisted: false, transform: true }` registrato dalla stessa factory in `main.ts` e nell'harness di test (come `createGraphQLOptions`): le proprietà senza decoratore vengono rimosse prima del service; il campo deprecato `EquipSpellRequest.usages` smette di arrivare senza rompere i client di oggi (il FE non lo invia più dalla Phase 8). Decoratori class-validator su **ogni** `@InputType`/`@ArgsType` e DTO REST; `getUrls`/`getSubfoldersUrls` ricevono DTO tipizzati; `uploadImage` valida il file (`ParseFilePipe`: mimetype immagine, dimensione massima, un solo file).
- **D-02 (utente: «`@IsMongoId()` ovunque»):** tutti gli id in input (GraphQL e REST) sono validati come ObjectId esadecimali prima del service: un id malformato risponde `BAD_USER_INPUT`, i codici di dominio restano per gli id ben formati ma inesistenti (`NOT_FOUND`, `SPELL_NOT_KNOWN`, …). Le tabelle dei handoff delle Phase 3, 4, 7, 8, 9 e 9.1 ricevono una nota datata («id malformato → `BAD_USER_INPUT` dalla Phase 10»); il FE mostra copy generico (nessun id malformato nasce da un uso lecito dell'app).
- **D-03 (utente: «`BAD_USER_INPUT`»):** ogni violazione di validazione risponde `extensions.code = 'BAD_USER_INPUT'` (lo stesso che Apollo usa per la coercizione degli scalari, così il FE mappa un solo codice) con un messaggio che elenca **solo i nomi dei campi**, mai i valori; `formatDomainError` lo preserva; `extensions` resta `{ code }` (un eventuale `fields: [String]` è a discrezione, se non costa nulla al FE).
- **D-04:** regole: lunghezze (nome 2–20 e background ≤ 500 restano quelle di BE-CHAR-02; testi liberi degli input admin ≤ 2000; array ≤ 100 elementi), interi non negativi per quantità, usi, HP e punti, enum validi (`@IsEnum`), `DateTime` validi, `imagePath`/URL `http(s)`; la validazione manuale di `CompletePendingRequestInput` in `src/quests/outcomes/gm-overrides.ts` migra ai decoratori dove equivalente, **semantica degli override della Phase 9 invariata** (i limiti che dipendono dal personaggio restano nel service). Ogni regola nuova ha un test che la nomina.

### Superficie GraphQL/HTTP (BE-HARD-02)
- **D-05 (utente: «Legato a `NODE_ENV`»):** `introspection` e il plugin della landing page sono attivi solo se `NODE_ENV !== 'production'`; nessuna variabile nuova. `validateEnv` accetta `NODE_ENV ∈ {development, test, production}` (vuoto = `development` con WARN al boot); una riga di log al boot dichiara la modalità e lo stato di introspection; `.env.example` e la checklist di deploy (D-18) impongono `NODE_ENV=production`. Spiegazione data all'utente: la query di introspection non passa dai resolver, quindi oggi chiunque trovi l'endpoint scarica lo schema senza token; il FE non ne ha bisogno (schema check su `src/schema.gql`).
- **D-06 (utente: «Chiuso e basta»):** nessun `enableCors`, nessuna variabile `CORS_*`: i browser non ricevono header CORS e restano fuori; app mobile, webhook EventSub (server-to-server) e callback OAuth (navigazione top-level) non ne risentono. Documentato nel README/deploy; un futuro client web richiederà una modifica di codice, scelta consapevole.
- **D-07 (utente: «Messaggio generico + log server»):** in produzione ogni errore privo di codice di dominio/auth (eccezione imprevista, errore Mongo/Redis, bug) risponde `{ message: 'Errore interno', extensions: { code: 'INTERNAL_SERVER_ERROR', requestId } }`, senza `stacktrace` né dettagli; il server logga l'errore intero (`logger.error`) con lo stesso `requestId` (header `x-request-id` se presente, altrimenti uuid, assegnato in `buildGraphQLContext` e da un middleware REST). I messaggi di validazione GraphQL non suggeriscono campi dello schema in produzione («Did you mean…»: `hideSchemaDetailsFromClientErrors` di Apollo Server 4 o l'equivalente verificato dalla ricerca). REST segue la stessa regola con un filtro globale. In sviluppo tutto invariato.
- **D-08 (utente: «Includere, minimo»):** `@nestjs/throttler` solo su `exchangeLoginTicket`, `refreshSession`, l'avvio e la callback OAuth, il webhook EventSub e le REST Cloudinary (`uploadImage` in testa); limiti generosi e configurabili (`THROTTLE_TTL_MS`, `THROTTLE_LIMIT`, vuoti = default della fase), storage in memoria (una istanza, Redis rinviato), 429 → `TOO_MANY_REQUESTS` (`extensions.code` su GraphQL, status 429 su REST); la guard su GraphQL richiede l'override di `getRequestResponse` sul contesto (ricerca). Nessun throttling sulle mutation di gioco. Il webhook EventSub resta verificato dall'HMAC prima di tutto: il throttler non deve far perdere redemption legittime (limite alto, test dedicato).

### Secret e configurazione (BE-HARD-03)
- **D-09 (utente: «gitleaks-action v3»):** job CI dedicato `gitleaks/gitleaks-action@v3` su push e PR con scansione della storia; repo di account personale ⇒ nessuna `GITLEAKS_LICENSE` (richiesta solo alle organization; la v2 smette di funzionare il 16/09/2026); `.gitleaks.toml` con allowlist per `.env.example` (valori vuoti) e fixture di test. Nessun hook pre-commit (CI only, default tecnico).
- **D-10 (utente: «Ruotare il secret + allowlist del commit»):** un secret trovato nella storia va ruotato alla fonte (Mongo, JWT, Twitch, Cloudinary, Firebase, Sightengine) **dall'utente** e il commit va in allowlist per fingerprint con una nota datata; nessuna riscrittura della storia. La fase non può verificare la rotazione: lo dichiara nel handoff con la checklist.
- **D-11:** `.env.example` completo e commentato riga per riga (comprese `SIGHTENGINE_USER_ID`/`SIGHTENGINE_API_SECRET`, già aggiunte dall'utente a valore vuoto, `THROTTLE_*`, `SPELL_RECOVERY_SWEEP_INTERVAL_MS` della 9.1, `NODE_ENV` con i valori ammessi); **test unit di drift**: ogni chiave letta dai moduli di config (`*_ENV_KEYS`) e ogni `process.env.X` nel codice compare in `.env.example` e viceversa; i `process.env` sparsi (es. `CloudinaryService`) passano da `ConfigService`/`validateEnv`. Mai stampare `.env`: gli agent leggono solo `.env.example`.

### Moderazione delle immagini (BE-HARD-05, nuovo)
- **D-12 (utente, verbatim):** *«Utilizziamo sightengine con questi modelli: models=nudity-2.1,offensive-2.0,text-content,face-age,gore-2.0,text,qr-content,self-harm. Nel backend è già stata aggiunta la secret e lo user id con queste chiavi: SIGHTENGINE_USER_ID SIGHTENGINE_API_SECRET.»* Flusso: `POST /cloudinary/uploadImage` **modera il buffer prima dell'upload** (`POST https://api.sightengine.com/1.0/check.json`, multipart `media` + `models` + `api_user` + `api_secret`) e carica su Cloudinary solo se approvata; rifiuto → HTTP 422 `{ code: 'IMAGE_REJECTED', reasons: [<categorie>] }` senza punteggi; nessuna immagine respinta tocca Cloudinary. Chiude il debito di BE-CHAR-04.
- **D-13 (utente: «Severa»):** rifiuto se una classe supera la soglia raccomandata (0.5 salvo indicazione diversa del model reference Sightengine): nudità esplicita, erotica e molto suggestiva (`nudity-2.1`), qualunque classe di `offensive-2.0`, `gore-2.0`, `self-harm`, volti stimati minorenni (`face-age`), volgarità o dati personali nel testo (`text-content`), qualunque QR (`qr-content`); `text` (presenza di testo) solo a log. Il researcher verifica id dei modelli, nomi delle classi e soglie sulla documentazione Sightengine e li fissa in una **tabella di policy pura** (`src/moderation/image-policy.ts`) con test nominati; la tabella finale viene elencata all'utente nel riepilogo prima della PR.
- **D-14 (utente: «Fail-closed»):** Sightengine irraggiungibile, timeout (5 s), 5xx o quota esaurita → 503 `{ code: 'IMAGE_MODERATION_UNAVAILABLE' }`, nessun upload; chiavi mancanti con `NODE_ENV=production` → boot rifiutato (come `FIREBASE_SERVICE_ACCOUNT`); in sviluppo/test chiavi vuote → moderazione disattivata con WARN al boot e l'harness usa un fake dietro la porta `ImageModerator` (nessuna chiamata di rete nei test). Handoff FE: `imagePath` resta facoltativo; la creazione personaggio mappa `IMAGE_REJECTED` («immagine non ammessa, scegline un'altra») e `IMAGE_MODERATION_UNAVAILABLE` («riprova o procedi senza immagine») in un quick task FE.
- **D-15:** nessuna dipendenza nuova se il `fetch` nativo di Node 22 con `FormData`/`Blob` basta; log INFO con esito e categorie (mai l'immagine né i punteggi completi); nessun audit log (non è un'azione admin).

### Coverage (BE-HARD-04)
- **D-16 (utente: «Soglie per area che fanno fallire la CI»):** `coverageThreshold` per cartella sulle aree critiche: `src/auth/**`, atomics (`src/economy/**`, `src/characters/spells/**`, `src/characters/equipment/**`, `src/quests/acceptance/**`), EventSub (`src/eventsub/**` o il nome reale), `src/travel/**`; valori iniziali = baseline misurata − 2 punti (statements/branches/lines), alzati dopo i test nuovi; la CI esegue la coverage su unit + integration (`test:cov` adeguato ai due progetti jest) e fallisce sotto soglia. I test mancanti coprono per ogni area happy path + concorrenza + failure mode (checklist nel RESEARCH, da chiudere nel piano).

### Debiti rinviati (BE-HARD-06, nuovo; utente: tutti e quattro i gruppi)
- **D-17a — resilienza dei publisher e delle code:** riapertura dei change stream con backoff esponenziale e log per **tutti** i publisher (characters, users, quests, quest results, pending requests); `removeOnFail: { count: N }` su ogni coda Bull (`spell-recovery`, `travel`, `quest-resolution`); `KeyedSingleFlight` in `UserUpdatesPublisher` (gara gemella di quella già chiusa su `QuestsPublisher`) con test.
- **D-17b — indici e bug di schema:** indici per le query dello sweep elencati in `09/BACKEND-NOTES.md` §14/§16 più `status.spellStates.recoveries` (9.1) e valutazione del backfill `registeredAt` (una volta sola o a ogni tick); fix `Enemy.locations` (`@Prop({ type: [String], enum: Object.values(PoiType), default: [] })`, commit `style` separato prima); mismatch `PointOfInterest.type` (Mongoose scalare vs GraphQL lista: allineare senza rompere il FE, la ricerca verifica cosa seleziona il FE); `types: ["jest"]` nel tsconfig.
- **D-17c — refactor interni a comportamento invariato:** `commitRescue` → `fightRescuers(context, session)` + `settleWounded(step, fallen)`; un solo `primeChangeStream(harness, topic, touch)` al posto dei quattro helper di priming; decoratore `@AuditTarget` letto dall'interceptor per il target di `completePendingRequest` (contratto dell'audit documentato nel handoff).
- **D-17d — ritipizzazione dei ref `Mixed`** (`PendingQuest.quest`, `User.currentCharacter`, `QuestInfos.enemy`, `status.location`, `quests.*`, …) a `MongooseSchema.Types.ObjectId`: migrazione idempotente che converte le stringhe esadecimali in ObjectId, lettori tolleranti (`refIdOf`/`idForms`) mantenuti finché la migrazione non è verificata, poi rimossi; **ultima wave della fase con gate proprio** (backup prima della migrazione, procedura di rollback documentata, verifica su copia del DB). È il rischio più alto della fase, scelto dall'utente consapevolmente: il plan-checker lo tratta come wave isolata.
- **D-18:** checklist di deploy nel README/handoff: `NODE_ENV=production`, chiavi obbligatorie (Firebase, Sightengine, JWT, Twitch, EventSub), Redis `maxmemory-policy noeviction`, rotazione dei secret (D-10); flaky del boot reale (09 deferred): se riappare in CI si cattura l'errore, altrimenti nessuna azione.

### Combattimento con i segnaposto e avvio delle quest da soli (BE-HARD-07, nuovo; utente 2026-10-29, dalla UAT della FE Phase 9)
- **D-21 (utente, verbatim, 2026-10-29):** *«Il nemico dovrebbe venir combattuto come se ci fossero ancora entrambi i personaggi, non solo Reavor. Altrimenti se tutti se ne andassero da una missione con un mostro forte sarebbe sconfitta automatica per chi resta. Per quello lasciamo il posto pieno»*. Supera la 9.2 D-07 («la risoluzione scarta i registrati archiviati e combatte con chi resta»): alla risoluzione di una quest **avviata** i registrati archiviati (segnaposto con il marcatore interno) contano nel combattimento con la fotografia del personaggio archiviato (il documento resta, soft delete); nessun risultato viene scritto per loro e nessuna ricompensa è assegnata; i WARN «rimosso» di `BossResolutionService`/`questUpdateOf` diventano INFO «segnaposto in combattimento». Osservato il 2026-10-29: boss a 2 posti avviato, un membro eliminato, risoluzione con 1 solo partecipante (`Boss … risolto per 1 partecipanti`).
- **D-22 (dalla UAT, F3):** l'avvio di una quest **senza posti** deve essere atomico con l'arrivo sul marker e visibile al FE: oggi `arrivedAt` arriva con `characterUpdated` (scrittura sul personaggio) mentre `startDate` è scritto sul documento `pendingquests` senza evento, così il FE resta su «arrivato, non avviato» fino al risultato (osservato come etichetta «In attesa del gruppo» su una quest da soli). Scrivere `startDate` nella stessa transazione dell'arrivo e toccare il personaggio (o emettere l'evento) quando cambia la corsia; vale anche per l'avvio a party completo.

### Processo
- **D-19:** branch `feat/10-hardening` **stacked su `feat/09.2-quest-result-delivery-contract`** (dal 2026-10-27; prima su `feat/09.1-spell-state-and-recovery-contract`, mergiata con la PR #14) (condividono `.env.example`, `validateEnv`, STATE/ROADMAP); PR a `develop` dopo il merge della 9.2 (rebase). Wave suggerite al planner: 1 validazione + `BAD_USER_INPUT`; 2 superficie (introspection, CORS, errori, throttler); 3 secret/env/CI; 4 moderazione immagini; 5 resilienza + indici + bug di schema; 6 refactor; 7 coverage; 8 ref `Mixed` (gate); 9 handoff + traceability. Schema solo additivo; `test/app.int-spec.ts` aggiornato prima di montare moduli nuovi (RED); lint/prettier solo sui file toccati; nessun trailer `Co-Authored-By`; subject ≤ 72.
- **D-20:** handoff `BACKEND-NOTES.md` per il FE (Phase 12 e quick task): `BAD_USER_INPUT`, `TOO_MANY_REQUESTS`, `IMAGE_REJECTED`, `IMAGE_MODERATION_UNAVAILABLE`, `INTERNAL_SERVER_ERROR` + `requestId`, tabelle dei codici emendate, checklist di deploy.

> **Pending addendum (orchestrator, 2026-10-29):** D-23/D-24 and BE-HARD-08 (admin queue and the standard lane, from the FE Phase 10 discuss) are being added to the CONTEXT; they are researched in F10 below. User rule verbatim: «Nessun personaggio che ha accettato una quest, che sia in viaggio o in combattimento, non deve comparire nella lista dei pending che l'admin può gestire. Se sei in viaggio da una città all'altra invece questa regola non vale.» and «story e worldMission non richiedono alcun viaggio».

### Claude's Discretion

- Limiti numerici non fissati da requisiti precedenti (D-04); `extensions.fields` (D-03); forma del `requestId` e del middleware (D-07); default del throttler (D-08); struttura del modulo di moderazione e del client (D-12, D-15); soglie iniziali di coverage (D-16); ordine delle wave e nomi dei file; se e come rimuovere `SPELL_RECOVERY_UNAVAILABLE` se la 9.1 lo ha lasciato nell'enum.

### Deferred Ideas (OUT OF SCOPE)

- Storage Redis per il throttler (più istanze) — v1.1.
- Allowlist CORS da env per un eventuale pannello web — quando esisterà un client web.
- Moderazione dei testi liberi (nome, background) con `text-content` di Sightengine — backlog.
- Lista `questResults` del personaggio (storico dei fogli) — YAGNI (09 §14).
- Hook pre-commit gitleaks — se la CI non basta.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-HARD-01 | Every GraphQL/REST input validated by class-validator + global `ValidationPipe` (ids, non-negative quantities, lengths); `BAD_USER_INPUT` with field names only | F1 (probe-verified pipe, exception factory, scalar-id pipe, guard order), C1–C6 |
| BE-HARD-02 | Introspection off in prod, error sanitization with `requestId`, CORS closed, minimal throttling | F2 (Apollo options, WS gaps proven by probe), F3 (throttler probe), C6–C8, C19, C20 |
| BE-HARD-03 | `.env.example` complete + drift test, no secrets in repo, gitleaks CI | F4 (gitleaks v3 source read, env inventory), C9 |
| BE-HARD-04 | Per-area coverage thresholds that fail CI | F6 (measured baseline, Jest PATH vs GLOB semantics), C12 |
| BE-HARD-05 | Sightengine moderation before Cloudinary, 422/503, fail-closed | F5 (docs per model, multipart probe, FE content-type), C10, C11 |
| BE-HARD-06 | Deferred debts (publishers, queues, single-flight, indexes, schema bugs, refactors, Mixed refs migration) | F7 (full inventories, 33 Mixed paths, migration order), C13, C14, C17 |
| BE-HARD-07 | Archived registrants fight as seat holders; solo start atomic with arrival and visible to the FE | F8 (file:line of every touch point), C15, C18 |
| BE-HARD-08 (pending addendum, D-23/D-24) | Innkeeper queue tells the FE when the standard lane is occupied; `completePendingRequest` refuses `QUEST_IN_PROGRESS` | F10, C21, C22 |
</phase_requirements>

## Project Constraints (from CLAUDE.md and the orchestrator's repo rules)

- Stack is fixed: NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis. Backend is the source of truth.
- TDD Red → Green → Refactor for every feature/bugfix; Clean Code, SoC, Boy Scout Rule.
- Branch + PR to `develop`; never push to `develop`/`main`; Conventional Commits; subject ≤ 72; **no `Co-Authored-By` trailer** (user memory overrides the generic attribution).
- No secrets in repo; agents read only `.env.example`, never `.env`, never print env values.
- FE contracts never break: schema changes additive only; `src/schema.gql` regenerated only by the real boot (`test/app.int-spec.ts`) and checked in CI with `git diff --exit-code`.
- `test/app.int-spec.ts` enumerations updated **first** (RED) before mounting new modules/handlers.
- Jest: paths before `--selectProjects`; never in background; integration with `--runInBand`. `npm run lint` is forbidden locally (rewrites ~77 files): use `npx eslint <file>` / `npx prettier --check <file>` on touched files only; a `style(...)` commit precedes edits to non-Prettier-clean files (e.g. `enemy.model.ts`, `point-of-interest.model.ts`, `cloudinary.*`).
- Commit scope `phase-10` for docs (e.g. `docs(phase-10): …`).

## Summary

The hardening surface is well understood and every risky mechanism was probed on the real harness. The global `ValidationPipe` works on Apollo arguments exactly as D-01 wants (undecorated `@Field`s are stripped, nested inputs become class instances, a custom `exceptionFactory` yields `extensions.code = 'BAD_USER_INPUT'` with a message that lists only field paths, and `formatDomainError` preserves it). Three facts reshape the plan: (1) **guards run before pipes**, so every `@OwnsCharacter`/`@OwnsPendingQuest`/`@OwnsQuestResult` handler already answers `NOT_FOUND` for a malformed owned id inside `CharacterAccessPolicy` before any pipe runs; (2) scalar `@Args('id') id: string` arguments are **never** seen by `ValidationPipe` (it skips `String`), so a dedicated pipe is needed; (3) several inputs already have authoritative domain validators with their own codes (`CHARACTER_NAME_INVALID`, `INVALID_QUANTITY`, `PUSH_INVALID_DEVICE_ID`, `OUTCOME_OVERRIDE_INVALID`, …): decorators must check shape only, or the FE contract changes silently.

The production-surface probe proved two holes that D-05/D-07 do not mention: over **graphql-ws** (authenticated socket) introspection still works with `introspection: false`, and raw error messages (e.g. a Mongo URI inside an error) reach the client because Apollo's `formatError` never runs on WS. Both are closed with graphql-ws options (`validate`, `onNext`, `onError`) that Nest forwards verbatim. `hideSchemaDetailsFromClientErrors` exists in the installed `@apollo/server` 4.12.2 and removes "Did you mean" suggestions (probe). `@nestjs/throttler` 6.7.1 works on GraphQL with the documented `getRequestResponse` override, but its `ThrottlerException` (429) is mapped by `@nestjs/apollo` to `INTERNAL_SERVER_ERROR`, so a coded subclass is required (probe: `TOO_MANY_REQUESTS` on GraphQL, 429 + `Retry-After` on REST). The EventSub HMAC is verified inside the service, i.e. after any guard, and Twitch revokes subscriptions after too many failed deliveries: the webhook limit must be very high.

Coverage is already high in the critical areas (statements 98.5–99.7 %, branches 85–92 %), but the configured report counts the 208 colocated spec files at 0 %; `collectCoverageFrom` must exclude specs before thresholds make sense, and thresholds must use **directory keys** (aggregate) rather than globs (per file). The `Mixed` ref debt is larger than the CONTEXT examples: 33 ref paths across 9 collections are `Mixed` at runtime; after retyping, Mongoose casts filter strings to ObjectId, so the migration must run on production **before** the retyped code is deployed, and the tolerant readers cannot be removed inside this phase. BE-HARD-07 is cheap: archived registrants keep a soft-deleted character and their PendingQuest, so the group roster can hydrate them; D-22 is solved by writing `startDate` inside the arrival/acceptance transaction for solo quests and by publishing `characterUpdated` from PendingQuest `startDate` updates for party starts.

**Primary recommendation:** register validation, error filter and request-id via Nest providers (`APP_PIPE`, `APP_FILTER`, `configure()`), not in `main.ts`; keep domain validators authoritative and use decorators for shape only; close the WS gaps explicitly; run the `Mixed` migration as a standalone, idempotent, native-driver script with a deploy order of "backup → copy → prod → deploy".

## Standard Stack

### Core (new dependencies)
| Library | Version | Published | Purpose | Why Standard |
|---------|---------|-----------|---------|--------------|
| class-validator | ^0.15.1 | 2026-02-26 [VERIFIED: npm registry] | Decorators read by `ValidationPipe` | Required peer of `@nestjs/common` `ValidationPipe` (`>=0.13.2`) [VERIFIED: node_modules/@nestjs/common/package.json]; 0.15.0 only breaking change is `IsIBAN` options [CITED: github.com/typestack/class-validator/releases] |
| class-transformer | ^0.5.1 | 2021-11-22 [VERIFIED: npm registry] | `plainToInstance` for `transform: true` and `@Type` on nested inputs | Required peer (`>=0.4.1`); latest release |
| @nestjs/throttler | ^6.7.1 | 2026-09-24 [VERIFIED: npm registry] | Opt-in rate limiting (D-08) | Official Nest package; peers `@nestjs/common/core ^11` ok; `ThrottlerModule` is `@Global`, in-memory storage timers are `unref`'d (no Jest open handles) [VERIFIED: package source] |

### Already installed (verified in node_modules)
| Library | Version | Relevance |
|---------|---------|-----------|
| @apollo/server | 4.12.2 | `introspection`, `hideSchemaDetailsFromClientErrors` (present, installs `ApolloServerPluginDisableSuggestions`), `includeStacktraceInErrorResponses`, `ApolloServerPluginLandingPageDisabled` (`@apollo/server/plugin/disabled`) [VERIFIED: dist/cjs/ApolloServer.js:91-121,480-497] |
| @nestjs/apollo | 13.1.0 | wraps `formatError`; maps only 400/401/403/422 to Apollo codes, every other HttpException → `INTERNAL_SERVER_ERROR` + `status` [VERIFIED: dist/drivers/apollo-base.driver.js:18-23,145-191] |
| graphql-ws | 6.0.6 | Nest spreads `subscriptions['graphql-ws']` into `useServer` → `validate`, `onNext`, `onError` available [VERIFIED: @nestjs/graphql dist/services/gql-subscription.service.js:31-37; graphql-ws server d.ts:87,241,256] |
| graphql | 16.11.0 | `NoSchemaIntrospectionCustomRule`, `specifiedRules` exported [VERIFIED: node -e] |
| @nestjs/common | 11.1.6 | `ValidationPipe` (forces `forbidUnknownValues: false`, skips `String/Number/Boolean/Array/Object/Buffer/Date` metatypes) [VERIFIED: pipes/validation.pipe.js:25,115]; `ParseFilePipe`, `MaxFileSizeValidator`, `FileTypeValidator` (ESM `file-type` via `load-esm`) |
| @nestjs/mongoose | 11.0.3 | has `ParseObjectIdPipe`/`IsObjectIdPipe` — **do not use** (echo the value in the message, accept any 12-char string via `Types.ObjectId.isValid`) [VERIFIED: dist/pipes/*.js] |
| bull | 4.16.5 (+ @types/bull 3.15.9) | `removeOnFail: boolean | number | KeepJobsOptions{age,count}` [VERIFIED: @types/bull index.d.ts:439-460] |
| jest / ts-jest | 30.1.3 / 29.4.1 | `coverageThreshold` root-only; PATH keys aggregate, GLOB keys per file [VERIFIED: @jest/reporters build/index.js:346-440] |
| Node | local v26.12.1, CI 22, engines `>=22` | global `fetch`, `FormData`, `Blob`, `AbortSignal.timeout` (probe) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom `ObjectIdPipe` for scalar ids | `@ArgsType` classes with `@IsObjectIdHex()` | Same SDL, but every resolver signature changes; keep `@ArgsType` only where several string args need shape rules (auth mutations) |
| Custom image-signature validator | Nest `FileTypeValidator` | Works in production Node (probe: PNG with `application/octet-stream` → valid) but **always fails under Jest** (ESM dynamic import) → valid images rejected in every int-spec |
| Native `fetch` client | `sightengine` npm SDK | New dependency for a single POST; D-15 forbids it if native suffices (it does) |
| Standalone migration script | Boot-time blocking migration | Boot ordering between `onModuleInit`/`onApplicationBootstrap` of sweepers and publishers is fragile; a script gives dry-run/verify/apply and runs before the deploy |

**Installation:**
```bash
npm install class-validator@^0.15.1 class-transformer@^0.5.1 @nestjs/throttler@^6.7.1
```
(CI uses `npm ci` on `package-lock.json`: install with npm, not yarn, so the lockfile is the one CI reads.)

## Findings per flag

### F1 — ValidationPipe on GraphQL and REST (D-01..D-04)

**Inventory (SDL inputs actually used — 17):** `AbandonQuestRequest`, `AcceptQuestRequest`, `AssetQuantityInput`, `CoinsInput`, `CompletePendingRequestInput`, `ParticipantOverrideInput`, `ItemUsageInput`, `SpellUsageInput`, `CreateCharacterInput`, `EquipItemRequest`, `EquipSpellRequest`, `RegisterPushDeviceInput`, `SendTestPushInput`, `TransactionItems`, `TransactionRequest`, `TravelRequest`, `UseSpellRequest` [VERIFIED: `grep '^input ' src/schema.gql`]. Many model classes also carry `@InputType` (`CharacterInput`, `EnemyInput`, …) but are not referenced by any operation: they need no decorators (whitelist only runs on handler metatypes).

**Scalar arguments (never validated by `ValidationPipe`, it skips `String`):**
| Argument | Kind | Today | Recommendation |
|----------|------|-------|----------------|
| `character(id)`, `equipment(id)`, `characterUpdated(id)` | ObjectId, owned | guard → `NOT_FOUND` (policy.ts:97) | see C1 |
| `questResult(id)`, `acknowledgeQuestResult(id)` | ObjectId, owned | guard → `NOT_FOUND` (policy.ts:137) | see C1 |
| `pendingQuest(id)` | ObjectId, owned | guard → `NOT_FOUND` (policy.ts:115) | see C1 |
| `questResultReceived(characterId)` | ObjectId, owned | guard | see C1 |
| `quest(id)`, `questUpdated(questId)`, `user(id)`, `city`, `enemy`, `pet`, `lore`, `spell`, `lootItem`, `equipmentItem`, `pointOfInterest` | ObjectId | Mongoose cast error / uncoded `NotFoundException` | `@Args('id', ObjectIdPipe)` |
| `lootItemsByIds(ids)`, `equipmentItemsByIds(ids)` | ObjectId[] | none | `ObjectIdListPipe` (each id + max 100) |
| `getPath(from, to)` | `ID` | none | `ObjectIdPipe` |
| `exchangeLoginTicket(ticket, codeVerifier)`, `refreshSession(refreshToken)` | opaque strings, domain-validated (`CODE_VERIFIER_PATTERN`, ticket lookup → `LOGIN_TICKET_INVALID`) | — | leave domain validation; no decorator that changes the code (express JSON body already capped at 100 kb) |
| `unregisterPushDevice(deviceId)` | client string, `assertValidDeviceId` → `PUSH_INVALID_DEVICE_ID` | — | leave domain validation |
| `equipmentAssetsQuantity(sellable)` | Boolean | GraphQL coercion | nothing |

**REST:** `CloudinaryController.getUrls/getSubfoldersUrls` take `@Body() body: { folder: string }` (inline type ⇒ metatype `Object` ⇒ never validated) and swallow every error into a **201** `{ message, error: e.message }` (leaks Cloudinary error text) [VERIFIED: cloudinary.controller.ts:11-30]; `uploadImage` has no file validation and the same swallow [cloudinary.controller.ts:32-43]; `CloudinaryService` reads `process.env` in its constructor [cloudinary.service.ts:6-12]. The FE sends `{ folder: 'main' }` [VERIFIED: FE authenticated_shell.dart:281] and treats any non-2xx as a failure. `TwitchAuthController` uses `@Query('challenge') challenge?: string` and `@Query() query: TwitchCallbackQuery` (an interface ⇒ metatype `Object`) — unaffected by the pipe (see C6). `EventSubController` uses `@Req`/`@Res` (raw body, HMAC) — unaffected.

**Probe results (`zz-probe-hardening`, global pipe `{ whitelist: true, forbidNonWhitelisted: false, transform: true, exceptionFactory }`):**
- Valid input: handler received `ProbeInput`/`ProbeItem` instances; `usages` (a `@Field` without validator) and a nested undecorated `@Field` were **stripped**. A nested array with `@ValidateNested` but **without `@Type(() => X)`** arrived as `[{}]`: every element silently emptied and **not validated** (`item: "zz", quantity: -1` passed). ⇒ every nested input needs `@ValidateNested({ each: true })` + `@Type(() => X)`.
- Invalid input: `{"message":"Input non valido: id, name, items.0.quantity, items.1.item","extensions":{"code":"BAD_USER_INPUT"}}` — but the `@ArrayMaxSize(2)` violation on `items` was **missing** because the factory only descended into `children`. ⇒ the field collector must emit the parent path when the error has `constraints`, and descend when it has `children`.
- Order: the method guard logged the raw args, the pipe then rejected, the handler never ran ⇒ **guards run before pipes** (C1).
- `@Args('id', ObjectIdPipe)` and `@Args() args: IdArgs` (`@ArgsType` + validator) both answered `BAD_USER_INPUT` "Input non valido: id". class-validator `isMongoId` accepted `"64B000…"` (uppercase) — the repo's canonical check `isObjectIdHex` (`/^[0-9a-f]{24}$/`, src/mongo/document-id.ts:3-16) does not (C3).
- The coded exception (`BadRequestException` subclass with own `extensions = { code }`) is transformed by Nest to `BAD_REQUEST` and restored to `BAD_USER_INPUT` by `formatDomainError` (format-domain-error.ts:29-32) — no change to the formatter needed for this code.

**Registration:** `main.ts` is not executed by any test (`test/app.int-spec.ts` boots `AppModule` through `Test.createTestingModule`, test/app.int-spec.ts:261-268; `createAuthTestApp` builds its own module, test/auth/auth-test-app.ts:79-118). Use a factory `createValidationPipe()` provided as `{ provide: APP_PIPE, useFactory: createValidationPipe }` in `AppModule` **and** in `createAuthTestApp` providers (C2). Pipes also run for subscription resolvers.

**Interaction with the audit interceptor:** interceptors run before pipes; a rejected innkeeper mutation is recorded with `outcome: 'BAD_USER_INPUT'` (admin-audit.interceptor.ts:53-59, 100-111). The interceptor copies raw args (`toPlainArgs`), so stripped fields can still appear in audit args — acceptable (GraphQL already rejects undeclared input fields; only declared-but-undecorated ones are stripped).

**`gm-overrides.ts` migration (semantics unchanged):**
| Rule today (service) | Code today | Decorator | Code after | Stays in service |
|---|---|---|---|---|
| `pendingQuestId` malformed (policy/loader) | `NOT_FOUND` | `@IsObjectIdHex()` | `BAD_USER_INPUT` | existence → `NOT_FOUND` |
| `characterId` malformed (gm-overrides.ts:165-170) | `OUTCOME_NOT_PARTICIPANT` | `@IsObjectIdHex()` | `BAD_USER_INPUT` | non-participant → `OUTCOME_NOT_PARTICIPANT` |
| > 50 entries in `outcomes`/`injuries`/`consumablesUsed`/`spellsUsed` (gm-overrides.ts:32-40,161) | `OUTCOME_OVERRIDE_INVALID` | `@ArrayMaxSize(MAX_OVERRIDE_ENTRIES)` (keep **50**, not D-04's 100) | `BAD_USER_INPUT` | keep the check as defence in depth |
| `hpAfter` not integer / < 1 / > max (gm-overrides.ts:74-86) | `OUTCOME_OVERRIDE_INVALID` | `@IsOptional() @IsInt() @Min(0)` | negative → `BAD_USER_INPUT`; 0 and > max stay | `1..maxLifePoints` |
| injury outside catalog (88-93) | `OUTCOME_OVERRIDE_INVALID` | `@IsOptional() @IsEnum(InjuryType, { each: true })` (GraphQL enum coercion already rejects unknown literals) | unchanged | keep |
| item/spell id malformed, quantity/usages not integer ≥ 1 (96-110) | `OUTCOME_OVERRIDE_INVALID` | `@IsObjectIdHex()`, `@IsInt() @Min(0)` | malformed/negative → `BAD_USER_INPUT`; 0 stays `OUTCOME_OVERRIDE_INVALID` | ≥ 1, ownership, totals |
| duplicate override for a character (171) | `OUTCOME_OVERRIDE_INVALID` | — | unchanged | keep |

**Domain validators that must stay authoritative** (decorators = shape only, generous caps): `create-character-input.validator.ts:18-59` (name normalized + grapheme rules → `CHARACTER_NAME_INVALID`; age → `CHARACTER_AGE_OUT_OF_RANGE`; background ≤ 500 graphemes / 4000 code units → `BAD_USER_INPUT`; imagePath **https only**, ≤ 2048 → `BAD_USER_INPUT`), `push-device-input.validator.ts` (`PUSH_INVALID_DEVICE_ID`, `PUSH_INVALID_TOKEN`), `trade-pricing.ts`/`trade-inventory.ts` (`INVALID_QUANTITY` for 0, duplicates, totals, `MAX_ITEM_QUANTITY`), `login-ticket.service.ts:63-71`.

**Safety test (recommended, Wave 1):** a unit test that iterates the list of the 17 input classes, asserts the list equals the `input` names in `src/schema.gql`, and asserts that every GraphQL field (from `TypeMetadataStorage`/the class) has at least one class-validator metadata entry (`getMetadataStorage().getTargetValidationMetadatas(...)`), and every nested input field has `@Type`. This prevents the silent-strip bug proven by the probe.

### F2 — Production surface (D-05..D-07)

- **Today:** `createGraphQLOptions` hard-codes `playground: false`, `introspection: true`, `plugins: [ApolloServerPluginLandingPageLocalDefault()]`, `formatError: formatDomainError` (graphql-options.factory.ts:15-24); `test/app.int-spec.ts:807-817` asserts introspection is public "until Phase 10". `NODE_ENV` is only compared to `'production'` in `auth-config.ts:128`, `push-config.ts:62`, `eventsub-config.ts:122,141` and read directly by `DevAuthStrategy` (dev-auth.strategy.ts:19); no allowlist, no boot log of the mode. `includeStacktraceInErrorResponses` defaults to `NODE_ENV !== 'production' && !== 'test'` (ApolloServer.js:121); CSRF prevention is on by default (ApolloServer.js:137).
- **Probe (`zz-probe-prod`, options `introspection: false`, `hideSchemaDetailsFromClientErrors: true`, `ApolloServerPluginLandingPageDisabled()`):**
  - HTTP introspection → `GRAPHQL_VALIDATION_FAILED` / `INTROSPECTION_DISABLED` ✔.
  - HTTP typo `{ boo }` with a `boom` field → `Cannot query field "boo" on type "Query".` with **no** "Did you mean" ✔.
  - `GET /api/graphql` (`Accept: text/html`) → 400 CSRF message, no landing page ✔.
  - HTTP resolver `throw new Error('E11000 … mongodb://user:pw@host …')` → message returned verbatim with `INTERNAL_SERVER_ERROR` (and stacktrace when enabled) ✘ ⇒ needs the sanitizer.
  - **WS (authenticated) `{ __schema { queryType { name } } }` → `{"data":{"__schema":{"queryType":{"name":"Query"}}}}`** ✘ (Apollo's `NoIntrospection` rule is HTTP-only).
  - **WS query error → raw message, no `extensions`**; WS subscription iterator error → raw message ✘ (no `formatError` on WS).
- **Recommended shape** — `createGraphQLOptions(ws, schemaFile, { production })` (the mode is passed in, never read from `process.env` inside, so the harness can test both modes with the same factory):
  - `introspection: !production`; `plugins: [production ? ApolloServerPluginLandingPageDisabled() : ApolloServerPluginLandingPageLocalDefault(), requestIdPlugin]`; `hideSchemaDetailsFromClientErrors: production`; `includeStacktraceInErrorResponses: !production` (explicit); `formatError: (f, e) => formatDomainError(f, e, { production })`.
  - `subscriptions['graphql-ws']`: keep `onConnect/onClose`; in production add `validate: (schema, doc) => validate(schema, doc, [...specifiedRules, NoSchemaIntrospectionCustomRule])`, `onNext` and `onError` that run the same sanitizer on `result.errors` / `errors` (keep entries whose `extensions.code` is a known code, replace the rest with `{ message: 'Errore interno', extensions: { code: 'INTERNAL_SERVER_ERROR', requestId } }`).
- **Sanitizer rule (production only):** keep `{ message, locations, path, extensions: { code } }` when the code comes from a coded exception (current `resolveDomainErrorCode`) or is an Apollo request-level code (`GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`, `BAD_USER_INPUT`, `BAD_REQUEST`, `PERSISTED_QUERY_*`, `OPERATION_RESOLUTION_FAILURE`) or `UNAUTHENTICATED`/`FORBIDDEN`; otherwise `{ message: 'Errore interno', extensions: { code: 'INTERNAL_SERVER_ERROR', requestId } }`. Always drop `originalError`, `stacktrace`, `exception`, `status` from `extensions` in production. Development: unchanged.
- **`requestId`:** `formatError` has no access to the context ⇒ assign in `buildGraphQLContext` (`requestId = sanitizedHeader(req.headers['x-request-id']) ?? randomUUID()`, accept only `/^[A-Za-z0-9._-]{1,64}$/` to avoid log injection; on WS one id per operation) and attach it with an Apollo plugin (`requestDidStart → didEncounterErrors` logs `logger.error` with requestId + stack for non-coded errors; `willSendResponse` writes `extensions.requestId` on the `INTERNAL_SERVER_ERROR` entries of `response.body.singleResult.errors`). REST: a middleware in `AppModule.configure()` sets `req.requestId` and the `x-request-id` response header; a global `@Catch()` filter (`APP_FILTER`) that **returns early for non-HTTP contexts** (filters also run for GraphQL resolvers; rethrowing there would bypass Apollo) and maps non-`HttpException` errors to 500 `{ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'Errore interno', requestId }`, logging the full error; `HttpException` bodies pass through unchanged (keeps `AuthException`'s `{ statusCode: 401, code }`, test/app.int-spec.ts:795-805). Nest's `ExceptionsHandler` already logs uncaught errors (seen in the probe output) but without requestId.
- **Uncoded legacy exceptions:** 9 catalog services throw plain `NotFoundException` (`pets`, `lore`, `pointsOfInterest`, `cities`, `spells`, `lootItems`, `equipmentItems`, `enemies`) — Nest maps 404 to `INTERNAL_SERVER_ERROR` ⇒ the production sanitizer would hide them as "Errore interno". Boy Scout: switch them to a coded `NOT_FOUND` (additive code, no FE impact; the FE does not query single catalog items).
- **`validateEnv`:** add `parseRuntimeConfig(readRuntimeEnv(env))`: `NODE_ENV ∈ {development, test, production}`, empty → `development`; anything else → boot refused. WARN for empty and the boot line ("Modalità production: introspection spenta") belong in a `RuntimeModeReporter` (`OnApplicationBootstrap`, same pattern as `AuthStartupReporter`), not inside `validate`. `DevAuthStrategy` and `CloudinaryService`/`MongoModule`/`main.ts` (`PORT`) switch to config (D-11). Jest sets `NODE_ENV=test` automatically.
- **CORS (D-06):** nothing to add; `NestFactory.create` without `cors` sends no CORS headers. A test can assert `OPTIONS /api/graphql` with `Origin` returns no `access-control-allow-origin`.

### F3 — Throttler (D-08)

- **Placement:** opt-in per handler (no global guard): a composed decorator `@Throttled()` = `UseGuards(AppThrottlerGuard)` (+ `@SkipThrottle`/`@Throttle` for the webhook bucket) on `AuthResolver.exchangeLoginTicket`, `AuthResolver.refreshSession`, `TwitchAuthController.start`, `TwitchAuthController.callback`, `EventSubController.receive`, `CloudinaryController.uploadImage|getUrls|getSubfoldersUrls`. `ThrottlerModule.forRootAsync` (global) in `AppModule` and in the harness. Global `AuthGuard` (APP_GUARD) runs first; for `@Public()` handlers it passes, then the method guard runs.
- **Guard (probe-verified):**
```ts
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    protected getRequestResponse(context: ExecutionContext) {
        if (context.getType<GqlContextType>() !== 'graphql') return super.getRequestResponse(context);
        const { req, res } = GqlExecutionContext.create(context).getContext<GraphQLRequestContext>();
        return { req, res: res ?? NO_HEADERS_RESPONSE }; // WS context has no res: setResponseHeader would throw
    }
    protected async throwThrottlingException(): Promise<void> {
        throw new TooManyRequestsException(); // HttpException 429 with extensions = { code: 'TOO_MANY_REQUESTS' }
    }
}
```
  Probe: GraphQL third call → `{"message":"Troppe richieste","extensions":{"code":"TOO_MANY_REQUESTS"}}`; REST third call → 429 `{"statusCode":429,"code":"TOO_MANY_REQUESTS","message":"Troppe richieste"}` with `Retry-After: 60`. Without the override the 429 becomes `INTERNAL_SERVER_ERROR` (apollo-base.driver.js:177-187) and the production sanitizer would hide it.
- **Keys:** the default `generateKey` hashes `Class-handler-throttlerName-tracker` ⇒ one bucket per handler per IP (throttler.guard.js `generateKey`). Tracker = `req.ip` normalized. **Behind a reverse proxy every client shares the proxy IP** (C19).
- **EventSub ordering:** HMAC is verified inside `EventSubWebhookService.handle` (eventsub-webhook.service.ts:97-134), i.e. after every guard. A throttler on the webhook therefore counts unsigned requests too, per source IP. Twitch: "You must respond to notification requests within a few seconds"; after too many failed/late deliveries "the subscription's status changes to `notification_failures_exceeded` and Twitch revokes the subscription" [CITED: dev.twitch.tv/docs/eventsub/handling-webhook-events, 2026-10-29]. ⇒ a separate high limit for the webhook (proposed default `THROTTLE_LIMIT × 50`), and a dedicated int test: N > `THROTTLE_LIMIT` correctly signed notifications from one IP all answer 204 and credit points.
- **OAuth routes** are top-level browser navigations whose contract is "ogni esito è un URL di redirect verso l'app" (twitch-login.service.ts:22): a JSON 429 would strand the browser. Recommended: `@UseFilters(OAuthRateLimitRedirectFilter)` on `TwitchAuthController` mapping `TooManyRequestsException` to 302 `APP_AUTH_REDIRECT_URL?error=rate_limited` (new additive `TwitchLoginErrorCode.RATE_LIMITED`; the FE reads `uri.queryParameters['error']`, FE login_callback.dart:59, and falls back to generic copy) (C6).
- **Defaults (discretion):** `THROTTLE_TTL_MS=60000`, `THROTTLE_LIMIT=20` (per IP, per handler); webhook bucket = limit × 50; parsing like the sweep intervals (integer, malformed → boot refused). Storage in memory, single instance (D-08).

### F4 — Secrets and CI (D-09..D-11)

- **gitleaks-action v3** [CITED: github.com/gitleaks/gitleaks-action README + releases, fetched 2026-10-29]: v3.0.0 moves the runtime from Node 20 to Node 24 with "no changes to inputs, outputs, or behavior"; `GITLEAKS_LICENSE` "required for organizations, not required for user accounts" (the action checks the account type via the API: source `src/index.js`); env: `GITHUB_TOKEN`, `GITLEAKS_LICENSE`, `GITLEAKS_CONFIG`, `GITLEAKS_ENABLE_UPLOAD_ARTIFACT`, `GITLEAKS_ENABLE_SUMMARY`, `GITLEAKS_ENABLE_COMMENTS`, `GITLEAKS_NOTIFY_USER_LIST`, `GITLEAKS_VERSION` (default hard-coded **8.24.3** in `src/index.js:138`); supported events `push`, `pull_request`, `workflow_dispatch`, `schedule`; v2 stops working on 2026-09-16.
- **Scan scope (read from the action source):** on `push` it scans only `commits[0]^..commits[last]` of the event (or one commit), on `pull_request` the PR commits (`--log-opts=--no-merges --first-parent base^..head`); only `workflow_dispatch`/`schedule` scan the **whole history** (C9). Exit code 2 = leaks.
- **Config:** auto-detected `.gitleaks.toml` "within the target path", or `GITLEAKS_CONFIG`; `[extend] useDefault = true`; global allowlist is `[allowlist]` up to v8.24 and `[[allowlists]]` from v8.25.0 [CITED: github.com/gitleaks/gitleaks README] ⇒ pin `GITLEAKS_VERSION: 8.24.3` and use `[allowlist]`, or pin ≥ 8.25 and use `[[allowlists]]` — never mix. **Fingerprints** (`commit:file:rule-id:line`) are allowlisted in **`.gitleaksignore`**, not in `.gitleaks.toml`; inline `#gitleaks:allow` also exists.
- **Likely false positives (default `generic-api-key` rule, entropy-based):** test literals such as `TEST_JWT_SECRET = 'test-jwt-secret-0123456789abcdef-0123456789'` (test/auth/test-auth-config.ts:4), `ROTATED_JWT_SECRET` (session.service.int-spec.ts:33), `SECRET`/`OTHER_SECRET` in auth/eventsub specs, `JWT_SECRET: 'app-boot-test-secret-…'` (test/app.int-spec.ts:236), fake PEM `SECRETKEYMATERIAL` (push-config.spec.ts and Phase 5 planning docs). Allowlist paths: `^\.env\.example$`, `\.spec\.ts$`, `\.int-spec\.ts$`, `^test/`, and `^\.planning/` only if the first full scan flags it. **A local scan was not possible** (downloading the gitleaks binary was denied by the sandbox): the first full-history result must come from a `workflow_dispatch` run on the branch; the plan includes a task to read its SARIF/summary and add fingerprints/paths.
- **Recommended workflow** (separate file `.github/workflows/gitleaks.yml` or a job in `ci.yml`): triggers `push`, `pull_request`, `workflow_dispatch`, `schedule` (weekly); `actions/checkout@v4` with `fetch-depth: 0` (existing CI uses v4 and passed on 2026-10-29 [VERIFIED: gh run list]); `gitleaks/gitleaks-action@v3` with `GITHUB_TOKEN`, `GITLEAKS_CONFIG: .gitleaks.toml`, `GITLEAKS_VERSION: 8.24.3`.
- **Env inventory (non-spec `src`):** `*_ENV_KEYS`: `AUTH_ENV_KEYS` (NODE_ENV, JWT_SECRET, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI, APP_AUTH_REDIRECT_URL, DEV_AUTH_ENABLED, DEV_AUTH_ACCESS_TOKEN, DEV_AUTH_TWITCH_ID, DEV_AUTH_ROLE, TWITCH_LOGIN_SCOPES), `PUSH_ENV_KEYS` (NODE_ENV, FIREBASE_SERVICE_ACCOUNT), `EVENTSUB_ENV_KEYS` (NODE_ENV, TWITCH_CLIENT_ID/SECRET, TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL, TWITCH_BROADCASTER_ID), `TRAVEL_ENV_KEYS`, `QUEST_ENV_KEYS`, `SPELL_RECOVERY_ENV_KEYS`; direct reads: `PORT` (main.ts:8), `NODE_ENV` (dev-auth.strategy.ts:19), `MONGO_URI`/`DB_NAME` (mongo.module.ts:28-29), `CLOUDINARY_*` ×3 (cloudinary.service.ts:8-10); `config.get` literals: `REDIS_HOST`, `REDIS_PORT` (app.module.ts:56-57). `.env.example` already lists all of them plus `SIGHTENGINE_USER_ID`/`SIGHTENGINE_API_SECRET`; missing: `THROTTLE_TTL_MS`, `THROTTLE_LIMIT` (+ `THROTTLE_TRUST_PROXY` if C19 is accepted). Lines without comments today: `PORT`, `NODE_ENV`, `DB_NAME`, `REDIS_*`, `CLOUDINARY_*`, `SIGHTENGINE_*`.
- **Drift test (unit, `src/config/env-example.drift.spec.ts`):** read `.env.example` keys (`/^([A-Z][A-Z0-9_]*)=/m`); collect code keys = union of every exported `*_ENV_KEYS` (import them, after D-11 also the new `RUNTIME/MODERATION/THROTTLE` lists) + a static scan of non-spec `src/**/*.ts` for `process\.env\.([A-Z0-9_]+)` and `config\.get(?:<[^>]+>)?\(\s*'([A-Z0-9_]+)'`; assert set equality both ways with a readable diff. Test-only variables (`MONGO_TEST_URI`, `MONGOMS_*`, `REDISMS_*`) live in specs/CI only and are excluded by construction. Never read `.env`.

### F5 — Sightengine moderation (D-12..D-15)

**Verified on the official docs (2026-10-29):**
| Model id (verbatim D-12) | Response key | Classes | Doc |
|---|---|---|---|
| `nudity-2.1` | `nudity` | intensity: `sexual_activity`, `sexual_display`, `erotica`, `very_suggestive`, `suggestive`, `mildly_suggestive`, `none`; plus `suggestive_classes{…}` and `context{…}`; scores are **inclusive** (a high `erotica` also scores high `very_suggestive`, `suggestive`, …) | sightengine.com/docs/advanced-nudity-detection-model-2.1 |
| `offensive-2.0` | `offensive` | `nazi`, `asian_swastika`, `confederate`, `supremacist`, `terrorist`, `middle_finger` | …/hate-and-offensive-content-detection-model |
| `gore-2.0` | `gore` | `prob`; `classes{very_bloody, slightly_bloody, body_organ, serious_injury, superficial_injury, corpse, skull, unconscious, body_waste, other}`; `type{animated, fake, real}` | …/gore-disgusting-horrific-content-detection |
| `self-harm` | `self-harm` | `prob`; `type{real, fake, animated}` | …/self-harm-detection-model |
| `face-age` | `faces[]` | `faces[].attributes.age.minor` (0–1, "close to 1 … a minor"); artificial faces in a separate `artificial_faces` array | …/face-age-minor-detection |
| `text-content` | `text` | arrays `profanity`, `personal`, `link`, `social`, `extremism`, `medical`, `drug`, `weapon`, `content-trade`, `money-transaction`, `spam`, `violence`, `self-harm` (items `{type, match}`), `ignored_text` boolean; **legacy model**: "Please use the new text-content-2.0 model" | …/ocr-text-moderation-in-images |
| `text` | `text` (same key!) | `has_artificial`, `has_natural` (0–1), `boxes[]` | …/text-detection-model |
| `qr-content` | `qr` | arrays `personal`, `link`, `social`, `profanity`, `spam` | …/qr-code-moderation |

Endpoint `POST https://api.sightengine.com/1.0/check.json`, multipart fields `media`, `models`, `api_user`, `api_secret` [CITED: …/getstarted]. Errors: `{ status: 'failure', request, error: { type, code, message } }`, types `api_error`, `argument_error`, `callback_error`, `credentials_error`, `media_error`, `plan_error`, `request_error`, `unknown_error`, `usage_limit`; 4xx = request error, 5xx = Sightengine error; no documented status for quota [CITED: …/api-error-codes-and-responses]. **No model page gives a recommended threshold** (C10).

**Proposed pure policy (`src/moderation/image-policy.ts`, threshold 0.5 everywhere per D-13):**
| Category (reason on the wire) | Rule | Action |
|---|---|---|
| `nudity` | `max(sexual_activity, sexual_display, erotica, very_suggestive) > 0.5` | reject |
| `offensive` | any class of `offensive` > 0.5 (includes `asian_swastika`) | reject |
| `gore` | `gore.prob > 0.5` | reject |
| `self-harm` | `self-harm.prob > 0.5` | reject |
| `minor` | any `faces[].attributes.age.minor > 0.5` (real faces) | reject; `artificial_faces` → log only (A3) |
| `text-profanity` | `text.profanity.length > 0` | reject |
| `text-personal` | `text.personal.length > 0` | reject |
| `qr` | any non-empty array under `qr` | reject (A4: presence of a QR without detected content is not reported) |
| text presence | `text.has_artificial`/`has_natural` | log only (D-13) |
| other `text-content` arrays (`link`, `social`, `extremism`, …) | — | log only (not in D-13; A5) |
Shape: `export const IMAGE_POLICY: readonly PolicyRule[]` where `PolicyRule = { category, read: (r: SightengineResponse) => number | boolean, rejects: (v) => boolean }` and `evaluateImagePolicy(response) → { rejected: Category[]; logged: string[] }` — total, never throws on missing keys (treat missing as 0/empty, because `text` and `text-content` merge into one object).

**Port and adapters:** `abstract class ImageModerator { abstract moderate(image: { buffer: Buffer; mimetype: string; filename: string }): Promise<ModerationVerdict> }` with `SightengineImageModerator` (native `fetch`, `FormData`, `new Blob([buffer], { type })`, `AbortSignal.timeout(5000)`), `DisabledImageModerator` (dev/test with empty keys: approve + one WARN at boot) and a harness `FakeImageModerator` (scripted approve/reject/unavailable). Mapping: HTTP 5xx, network error, abort/timeout, `usage_limit`, `plan_error`, `credentials_error`, `argument_error`, unparsable JSON → `ImageModerationUnavailableException` 503 `{ statusCode: 503, code: 'IMAGE_MODERATION_UNAVAILABLE', message }` (+ `logger.error` with type/code only for credentials/argument errors: misconfiguration); `media_error` → 422 `IMAGE_REJECTED` with reason `unreadable`; policy rejection → 422 `{ statusCode: 422, code: 'IMAGE_REJECTED', message, reasons }` (categories only, no scores). Log INFO with outcome + categories, never the image, scores or keys. Offline multipart probe: Node produced `multipart/form-data; boundary=…` with `name="media"; filename="portrait.jpg"`, `Content-Type: image/jpeg` and the three text fields.

**Config:** `parseModerationConfig(readModerationEnv(env))` in `validateEnv`: both keys present → enabled; both empty → disabled (+ WARN at boot via reporter) unless `NODE_ENV=production` → boot refused; exactly one present → boot refused everywhere (same rule as EventSub partial config).

**Upload flow today and target:** `FileInterceptor('file')` (multer memory storage, **no limits**) → `CloudinaryService.uploadImage(file)` → `upload_stream({ folder: 'characters_profile' }).end(file.buffer)` (cloudinary.service.ts:14-24). Target: `FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } })` (probe: oversize → 413 before buffering everything; two files → 400 "Too many files") → `ParseFilePipe({ validators: [MaxFileSizeValidator, ImageSignatureValidator], exceptionFactory: → BadUserInputException(['file']) })` → `ImageModerator.moderate` → only if approved `CloudinaryService.uploadImage`; errors propagate (no swallow). **Content type:** the FE uses dio **5.8.0+1** whose `MultipartFile.fromFile` defaults to `application/octet-stream` [VERIFIED: FE pubspec.lock + ~/.pub-cache dio-5.8.0+1 multipart_file.dart] ⇒ never validate `file.mimetype`; detect JPEG/PNG/WEBP by signature (`FF D8 FF`; `89 50 4E 47 0D 0A 1A 0A`; `RIFF????WEBP`) in a ~15-line pure validator, and send the detected mimetype to Sightengine. The FE picker resizes to ≤ 1024 px, quality 85 (FE image_picker_portrait_picker.dart) ⇒ 5 MB cap is generous.

### F6 — Coverage (D-16)

**Measured baseline** (2026-10-29, one run `npx jest --coverage --selectProjects unit integration --runInBand`, 262 s, 217 suites, 3089 tests, all green; aggregates **excluding spec files**):
| Area (directory key) | Files | Statements | Branches | Lines | Proposed initial threshold (baseline − 2, floored) S / B / L |
|---|---|---|---|---|---|
| `./src/auth/` | 33 | 99.66 | 85.05 | 99.81 | 97 / 83 / 97 |
| `./src/economy/` | 9 | 99.62 | 91.84 | 99.57 | 97 / 89 / 97 |
| `./src/characters/spells/` | 13 | 98.53 | 88.56 | 98.89 | 96 / 86 / 96 |
| `./src/characters/equipment/` | 1 (9 stmts) | 100 | 100 | 100 | 98 / 98 / 98 |
| `./src/characters/characters.service.ts` (equip/spell atomics live here) | 1 | 96.24 | 86.20 | 96.77 | 94 / 84 / 94 |
| `./src/quests/acceptance/` | 7 | 99.39 | 91.94 | 100 | 97 / 89 / 98 |
| `./src/eventsub/` | 21 | 98.80 | 91.64 | 99.32 | 96 / 89 / 97 |
| `./src/travel/` | 14 | 99.53 | 85.10 | 99.48 | 97 / 83 / 97 |
| (info) all non-spec `src` | 371 | 95.64 | 84.10 | 96.17 | — |

- The current report counts **208 spec files at 0 %** (`collectCoverageFrom: ["src/**/*.(t|j)s"]`, package.json:137) — global numbers read 32.5 % statements. Fix first: `["src/**/*.ts", "!src/**/*.spec.ts", "!src/**/*.int-spec.ts", "!src/main.ts"]` (C12).
- `coverageThreshold` is honoured only at the root config in a multi-project setup [CITED: jestjs.io/docs/configuration]; keys that are path prefixes are **aggregated**, glob keys are checked **per file** [VERIFIED: @jest/reporters build/index.js:357-430]; keys are resolved against the process cwd (run from repo root). Do not add `global`.
- `test:cov` today is `jest --coverage` (both projects, parallel integration). Change to `jest --coverage --selectProjects unit integration --runInBand` and in CI replace the two steps "Unit tests" + "Integration tests" with one "Tests with coverage" step (`npm run test:cov`) to avoid running the suite twice (~4.5 min locally).
- Branch figures include TypeScript decorator-metadata branches (`typeof X === "undefined"` emitted for every decorated property/param), which explains 75 % on resolvers/models with 100 % lines — keep branch thresholds modest.

**Gap checklist (to close in the coverage wave; each item = one named test):**
- auth: [ ] concurrent `refreshSession` with the same refresh token (one wins, the other `SESSION_REVOKED`/rotation rule) — check existing session rotation specs first; [ ] `exchangeLoginTicket` twice concurrently (single use); [ ] throttled `exchangeLoginTicket`/`refreshSession` → `TOO_MANY_REQUESTS`; [ ] `http-twitch-oauth.client.ts` branches 16/20 (non-JSON/timeout failure modes); [ ] `twitch-login.service.ts` 31/36 (state/challenge failure branches); [ ] `auth-session.service.ts` 23/28.
- economy: [ ] `shop-transaction.service.ts` branches 33/41 (failure after coins write, legacy-string inventory paths until the Mixed migration); [ ] concurrent sell of the last copy vs `equipItem` (slot cleared) — cross-area; [ ] `catalog-prices.reader.ts` 12/14.
- spells: [ ] `spell-recovery.service.ts` 26/32 and lines 47/49; [ ] processor early-job tolerance branches (20/24); [ ] `spell-state.migrator.ts` failure branch (18/22).
- equipment: [ ] concurrency test for `equipItem` (no test mentions concurrency in `src/characters/equipment/`); [ ] `equipItem` with a malformed `itemId` → `BAD_USER_INPUT` (new rule).
- acceptance: [ ] `quest-acceptance.service.ts` 81/94 branches; [ ] D-22 solo start at acceptance on the marker (new).
- eventsub: [ ] `points-credit.service.ts` 20/24 (duplicate/ledger failure); [ ] `http-twitch-helix.client.ts` 36/43; [ ] webhook burst above `THROTTLE_LIMIT` all 204 (new, D-08); [ ] `eventsub.controller.ts` `retryLater` branch.
- travel: [ ] `travel-sweeper.ts` 20/26 + lines 40/42; [ ] `travel-scheduler.service.ts` 8/11 (enqueue failure → WARN); [ ] `travel-completion.service.ts` 37/44 (D-22 path); [ ] `removeOnFail` limit (D-17a).

### F7 — BE-HARD-06 debts (D-17a..d)

**Publishers (D-17a):**
| Publisher | File | Stream | On error today | Single-flight |
|---|---|---|---|---|
| `UserUpdatesPublisher` | src/users/user-updates.publisher.ts:15-48 | users update/replace, `updateLookup` | base class logs only | **no** — one concurrent `findOne` per change (WR-01) |
| `QuestsPublisher` | src/quests/quests.publisher.ts | quests update/replace | logs only | yes (`KeyedSingleFlight` per quest) |
| `PendingRequestsPublisher` | src/quests/pending-requests/pending-requests.publisher.ts | pendingquests insert/delete | logs only | yes (one key) |
| `QuestResultsPublisher` | src/quests/results/quest-results.publisher.ts | questresults insert | logs only | not needed |
| characters (inside `CharactersService`) | src/characters/characters.service.ts:93-119 | characters update/replace, `fullDocument.deletedAt: null` | logs only; **not** on the base class | **no** (same race as users) |
Base class: src/mongo/change-stream-publisher.ts:35-55. The Node driver already resumes transparently on resumable errors; the `error` event means a non-resumable error and a closed stream (also emitted after `invalidate`, e.g. collection drop). Recommended: move the characters stream onto `ChangeStreamPublisher` (a `CharacterUpdatesPublisher`), then in the base class: record the resume token (`resumeTokenChanged` event, forwarded by Mongoose: mongoose/lib/cursor/changeStream.js:14), on `error` or unexpected `close` reopen with `startAfter: token` after an exponential backoff (1 s, 2 s, … capped at 30 s, reset after the first event), fall back to a fresh stream without token on `ChangeStreamHistoryLost` (code 286) with a WARN, never reopen while `closing`. Logs: subject + `describeError` only. Tests: unit with a fake model whose `watch()` returns an `EventEmitter` (fake timers, asserts the reopen and the backoff), plus one int-spec that drops the watched collection (invalidate → close) and proves a later insert is published.

**Queues:** every enqueue goes through `enqueueTrigger` (6 call sites: outcome-writer.service.ts:197, quest-resolution.scheduler.ts:52/73/90, characters.service.ts:354, travel-scheduler.service.ts:41) with `removeOnComplete: true, removeOnFail: false` (src/queues/enqueue-trigger.ts:33-41). One-line fix: `removeOnFail: { age: 7 * 24 * 3600, count: 1000 }` (constant `FAILED_JOBS_KEPT`), unit test on the options passed to `queue.add`. Queues registered: `spell-recovery` (characters.module.ts:33, spell-recovery.module.ts:25, quest-outcomes.module.ts:73), `travel` (travel-planning.module.ts:24), `quest-resolution` (quest-resolution-scheduling.module.ts:11). Note: a kept failed job with the same deterministic `jobId` makes Bull ignore a re-add of that id (08-REVIEW IN-03); sweeps cover it.

**Indexes (D-17b)** — declared with `Schema.index({...}, { name })` and verified at boot by a non-blocking verifier (`createIndexes()`, log name + code only, pattern of `eventsub-message-index.verifier.ts`), with an int-spec on `listIndexes()`:
| Collection | Index | Serves |
|---|---|---|
| characters | `{ deletedAt: 1, 'quests.pendingQuest': 1 }` | standard-lane `$lookup` stages (quest-resolution.updates.ts:19-35), archive, D-22 lane → character lookup |
| characters | `{ deletedAt: 1, 'status.awaitingAid.since': 1 }` | `dueAidTimeoutsFilter` (quest-resolution.updates.ts:110-117) |
| characters | `{ deletedAt: 1, 'status.activeTravel.endTime': 1 }` | `dueTravelsFilter` (travel.updates.ts:138-143) — not in 09 §14 but same sweep pattern |
| characters | `{ deletedAt: 1, 'status.spellStates.recoveries': 1 }` (multikey) | spell sweep (spell-recovery.sweeper.ts:76-84) |
| quests | `{ 'infos.type': 1, concludedAt: 1, startedAt: 1 }` | `formingPartiesFilter` (quest-resolution.updates.ts:98-105) |
| quests | `{ 'registeredAdventurers.character': 1 }` | archive seat lookup (character-archiver.ts:149-160), party reads |
| pendingquests | `{ quest: 1, startDate: 1, arrivedAt: 1 }` | arrived-unstarted / lane reads |
| users | `{ currentCharacter: 1 }` | `ownersOf` (src/mongo/owners-of.ts:10-18), notify owner — not in 09 §14 but used by every resolution |
`questresults` already has `quest_result_unacknowledged`.

**Backfills:** `PartyTimeoutService.backfillRegisteredAt` runs on **every sweep tick** as an unindexed `updateMany` with `$elemMatch` over all open quests (party-timeout.service.ts:158-172, called at quest-resolution.sweeper.ts:122-124). `QuestResultMaintenance` awaits `createIndexes()` + a full-collection backfill in `onApplicationBootstrap` on every boot (09.2-REVIEW IN-02/IN-04). Recommendation: run both once per process at boot, **not awaited** (log on rejection), and drop the per-tick call; mark both for removal in v1.1 once production is confirmed migrated (they become no-ops after the first deploy).

**Schema bugs:** `Enemy.locations` is `@Prop({ type: String, enum })` but `PoiType[]` in TS/GraphQL (enemy.model.ts:21-23); `PointOfInterest.type` likewise (point-of-interest.model.ts:14-16). No BE code reads either field [VERIFIED: grep]; the FE never selects `PointOfInterest.type` (only `id`, `location` via `LocationFragment`, FE location_fragment.dart) nor `enemy.locations` (FE quest_result_fragment.dart:7). Fix both to `@Prop({ type: [String], enum: Object.values(PoiType), default: [] })` after a `style(models)` Prettier commit (both files fail `prettier --check` today [VERIFIED]). Hydrated reads then cast a stored scalar `'city'` to `['city']`; normalize stored scalars (`$set: { type: ['$type'] }` where `$type` is a string) in the migration script of wave 8. Add a resolver test `pointOfInterest { type }` returns a list.

**`types: ["jest"]`:** today `tsc --noEmit -p tsconfig.json` reports 9110 errors (missing Jest globals). With `"types": ["node", "multer", "jest"]` it reports **56 real type errors in 23 spec files, 0 in production code** (top: death-acknowledgement.int-spec.ts 9, travel-completion.int-spec.ts 6, pending-requests.service.int-spec.ts 5) (C13). ts-jest runs transpile-only here (`isolatedModules: true`), so tests are unaffected either way.

**Refactors (D-17c):** `commitRescue` spans rescue-resolution.service.ts:325-412 (~88 lines) → `fightRescuers(context, session)` + `settleWounded(step, fallen)`, with `aid-rescue.int-spec.ts`/`aid-timeout.int-spec.ts` as the net. Priming helpers: `primeCharactersChangeStream` (test/characters/characters-change-stream.ts), `primeQuestResultsChangeStream`, `primePendingRequestsChangeStream` + `waitForQuiet`, `primeQuestsChangeStream` (test/quests/*-change-stream.ts) used by 16 files → one `primeChangeStream(harness, topic, touch)` with `waitForQuiet`. Audit target: today `onBehalf ?? { type: getNamedType(returnType).name, id: typeof args.id === 'string' ? args.id : null }` (admin-audit.interceptor.ts:83-86) → `completePendingRequest` logs `{ type: 'QuestResult', id: null }`; `@AuditTarget('PendingQuest', ({ input }) => input.pendingQuestId)` metadata read before the fallback changes it to `{ type: 'PendingQuest', id }` (document in the handoff).

**`Mixed` refs (D-17d) — runtime inventory** (probe on the real `SchemaFactory` schemas; `@Prop({ type: Types.ObjectId })` is `Mixed` under `@nestjs/mongoose`, `MongooseSchema.Types.ObjectId` is `ObjectId`):
- users: `currentCharacter`
- pendingquests: `quest`
- characters: `status.location`, `status.spells[]`, `quests.completedQuests[]`, `quests.pendingQuest`, `assets.ownedEquipments[].item`, `assets.ownedItems[].item`, `assets.wearedEquipment.{head,chest,arms,legs,foots,leftHand,rightHand,firstAccessory,secondAccessory}`, `assets.activeSpells[].spell`, `assets.pet`
- quests: `infos.enemy`, `infos.markerLocation`, `infos.relatedLore[]`, `requirements.recommendedLoot[].item`, `prizes.prizeItem[].item`, `prizes.randomLoot[].item`
- cities: `markerLocation`, `relatedLore`
- pointsofinterest: `city`, `quest`
- enemies: `relatedLore[]`; lores: `relatedLore[]`; equipmentitems: `addedSpell`
- questresults: `consumablesUsed[].item`, `rewards.items[].item`
(33 paths; already ObjectId: `status.activeTravel.to`, `status.awaitingAid.*`, `status.spellStates.spell`, `quests.activeStoryQuest`, `quests.activeWorldMissionQuest`, `prizes.spell`, `registeredAdventurers.character`, `rescue.*`, `cities.pointsOfInterest`, most `questresults` refs.)
Tolerant readers: `refIdOf`/`idForms` each in 25 production files, `objectIdFromHex` 19, `sameId` 11. ~51 tests mention legacy/string refs and 43 spec call sites write through `.collection.*`.
**Migration design:** native-driver script (no Mongoose casting) `src/migrations/mixed-refs/` with pure pipeline builders per path (`$cond` on `{$type: 'string'}` + `$regexMatch /^[0-9a-f]{24}$/` → `$toObjectId`; `$map` for arrays and arrays of subdocuments with `$mergeObjects`) and a CLI `node dist/migrations/run-mixed-refs.js --dry-run|--apply|--verify` (counts residual string refs per path). Idempotent by construction (only strings matching the hex regex change; second run modifies 0). Requires MongoDB ≥ 4.2 (`$regexMatch`, update pipelines; 9.2 A1 still open). Deploy order (C14): `mongodump` → restore to a copy → `--apply` + `--verify` on the copy → `--apply` on production with the **current** code (it reads ObjectId fine) → deploy the retyped schema → boot-time read-only verifier logs ERROR if residual strings exist. Rollback: redeploy the previous code (Mixed readers accept ObjectId); restore the dump only if the script misbehaved. The tolerant readers stay (harmless after retyping, Mongoose casts both `idForms` entries) and are removed in a later phase after the user confirms production.

**Not in CONTEXT but in STATE "Current focus":** "backfill scan" (covered above) and "sweep for never-confirmed deaths" (9.2 BACKEND-NOTES §10, D-12 "valutare") — see C17. Also 9.2 Open Question 6 (active registrants without PendingQuest on a started quest can stay stuck) — out of scope unless the user adds it.

### F8 — BE-HARD-07 (D-21, D-22)

**D-21 — archived registrants fight as seat holders.**
- Archive keeps the character document (soft delete: only `deletedAt`/`deletionReason`, character-archiver.ts:42-56), keeps its lane (`quests.pendingQuest`) and its PendingQuest (the archiver never touches pendingquests) and, after the start, marks the registration with `archivedAt` (seat-release.ts:27-41) instead of `$pull`.
- Where they are dropped today: `laneMembersOf` filters `ACTIVE_CHARACTER_FILTER` (lane-members.ts:47-57) ⇒ archived registrants land in `dropped` (lane-members.ts:70-81) ⇒ `readGroupRoster` returns them in `roster.dropped` (resolution-loader.service.ts:218-255) ⇒ `BossResolutionService.commitGroup` builds the combat context from `roster.seats` only (boss-resolution.service.ts:111-124) and logs WARN "…: rimosso" (boss-resolution.service.ts:81-85); the same in the group rescue (rescue-resolution.service.ts:221-225). `questUpdateOf` adds `dropped` to the `$pull` list (quest-outcome-plan.ts:19-24) but does not log. `snapshotInSession` uses `laneFilter` with `ACTIVE_CHARACTER_FILTER` (resolution-loader.service.ts:130-138, 264-280).
- Change: (1) the roster reader returns a third list `seatHolders` = registrants whose registration has `archivedAt` and whose archived character still points to a coherent PendingQuest of this quest (read without the active filter); `waiting` is computed on live seats only. (2) In the transaction, snapshot seat holders with a variant of `snapshotInSession` that drops the active filter, pass `[...liveSnapshots, ...seatHolderSnapshots]` to `readCatalog` and `combatContextOf` (combatant-plan.ts:53-67), apply `planCombatant`/`writeParticipant`/results/rewards **only** to live seats; delete the seat holders' PendingQuests in the same transaction (otherwise orphaned) without writing results; keep the claim filter as is (`registeredAdventurers: { $size }` unchanged because the marked registration stays). (3) Seat holders still leave the roster through `questUpdateOf` (`dropped`), so a lost boss frees all their seats and returns to not started as today. (4) Replace the WARN with INFO "Segnaposto <id> della missione <id> in combattimento" (ids only); incoherent registrants without a PendingQuest stay WARN "rimosso". (5) Same treatment in `RescueResolutionService` (rescuers archived after the start), C18. Tests to rewrite (RED): boss-resolution.int-spec.ts:352 ("fights with the adventurers left…") and aid-rescue.int-spec.ts:756 ("rescues with the rescuer left…"); add: a strong enemy that defeats one live character but not two (scripted `CombatResolver`, test/quests/scripted-combat-resolver.ts) proves the seat holder's stats count; no `questresults` document and no reward for the seat holder; INFO log with ids only. Naming: do not call this "Placeholder" in code — `PlaceholderCombatResolver` already means the provisional combat rules (combat-resolver.ts:82).
- The archive rule "every registrant archived ⇒ quest returns not started" (character-archiver.ts:177-205) is untouched, so a resolution always has ≥ 1 live seat.

**D-22 — solo start atomic with the arrival and visible.**
- Facts (C15): `arrivedAt` is a field of the **PendingQuest**, written in the travel-completion transaction by `findOneAndUpdate(questArrivalFilter, questArrivalUpdate(endTime))` (travel-completion.service.ts:81-90; travel.updates.ts:96-105) in the same transaction as the character write `COMPLETION_UPDATE` (travel-completion.service.ts:61-71). The character write emits `characterUpdated` at commit; the populated reread sees `arrivedAt`. `QuestStartService.tryStart` runs **after** the commit (travel-completion.service.ts:103-104) and `startSingle` writes `startDate = $arrivedAt` on pendingquests only (quest-start.service.ts:117-144) ⇒ no character change ⇒ no `characterUpdated`. Party start (`commitStart`, quest-start.service.ts:227+) writes `quests.startedAt` + PendingQuests' `startDate`: again no character write. Acceptance on the marker: `initialLaneDatesOf` returns `startDate: null, arrivedAt: now` for the standard lane (party-rules.ts:96-106) and `tryStart` runs after the commit (quest-acceptance.service.ts:166, 209).
- Change: (1) **Solo quests** (`!isRegistered(type)` on the standard lane): write `startDate` in the same write as `arrivedAt` — in travel completion read the quest type in session (one `findById` projection `infos.type`) and use `[{ $set: { arrivedAt: endTime, startDate: endTime } }]`; at acceptance on the marker make `initialLaneDatesOf` return `startDate: now` for solo quests. Keep `QuestStartService` the single owner of the start rule by exposing a pure builder (e.g. `soloStartOf(type, arrivedAt)`) and a `scheduleStarted(...)` method used after the commit (the resolution job must still be enqueued: `tryStart` would now see `startDate` set and return `stale`). The character write in the same transaction carries the event. (2) **Party starts** (and the sweep's recovery start): publish `characterUpdated` when a PendingQuest gets `startDate` — a publisher on pendingquests `update` with `updateDescription.updatedFields.startDate` present that looks up the active character whose lane points to it (index `characters { deletedAt, quests.pendingQuest }`) and publishes the populated character through the existing `characterUpdated` topic (the subscription filter re-checks id and access, characters.resolver.ts:101-127). This keeps the project rule "nessun publish sparso nei service" and covers solo, party and sweep starts uniformly. Alternative (not recommended): touching each member's character with an internal field in `commitStart`.
- Tests: arrival of a solo quest → one `characterUpdated` whose `quests.pendingQuest` has both `arrivedAt` and `startDate`; acceptance of a solo quest on the marker → `startDate` set at commit and resolution job enqueued; party completion → every member receives a `characterUpdated` with `startDate`; sweep recovery start → event too; the sweep `arrivedUnstartedPipeline` still recovers a solo PendingQuest left with `arrivedAt` and no `startDate` (legacy).

### F9 — Leftovers

- `SPELL_RECOVERY_UNAVAILABLE`: **0 occurrences** in `src`/`test` [VERIFIED: grep] — already removed by 9.1 (BACKEND-NOTES 9.1 line 231). The discretion item is moot.
- `test/app.int-spec.ts` enumerations: `EXPECTED_PUBLIC_HANDLERS` (6: `AppController.getHello`, `AuthResolver.exchangeLoginTicket`, `AuthResolver.refreshSession`, `EventSubController.receive`, `TwitchAuthController.callback`, `TwitchAuthController.start`), `EXPECTED_INNKEEPER_HANDLERS` (9), `EXPECTED_OWNERSHIP_HANDLERS` (16), `EXPECTED_OWNER_ONLY_HANDLERS` (7) (test/app.int-spec.ts:73-129); "mounts …" tests for lifecycles (612-660); the introspection test (807-817). RED additions: `EXPECTED_THROTTLED_HANDLERS` (the 8 handlers of F3, read from guard metadata `__guards__` or the throttler metadata); "mounts the image moderation" (`ImageModerator` resolves to `DisabledImageModerator` with empty keys) and "mounts the runtime mode reporter"; introspection test renamed (still public in `NODE_ENV=test`) plus a production-mode int-spec through the harness factory; the boot env block (test/app.int-spec.ts:228-253) must blank `SIGHTENGINE_*` and `THROTTLE_*` like the other optional keys (Pitfall 11/13 pattern).

### F10 — Admin queue and the standard lane (D-23/D-24, BE-HARD-08 — addendum 2026-10-29)

**User rule (verbatim):** «Nessun personaggio che ha accettato una quest, che sia in viaggio o in combattimento, non deve comparire nella lista dei pending che l'admin può gestire. Se sei in viaggio da una città all'altra invece questa regola non vale.» Interpretation confirmed: "busy" = standard lane occupied (`quests.pendingQuest` not null: travelling to the marker, waiting on it, or in its countdown/combat); a free city-to-city travel (`status.activeTravel.kind = free`, standard lane null) does not hide the character.

1. **Story/worldMission never plan a travel today.** `QuestAcceptanceService.accept` computes `movement` only for the standard lane: `lane === QuestLane.standard && location ? await this.movementTo(...) : null` (quest-acceptance.service.ts:150-153); story is accepted from any city and worldMission requires the character to already be in the marker's city (`locationInQuestCity`, lines 145-149, refusal otherwise); `initialLaneDatesOf` sets `startDate = arrivedAt = now` for the GM lanes (party-rules.ts:96-102). **No conflict** with «story e worldMission non richiedono alcun viaggio». Note: every lane claim requires `status.activeTravel: null` and `status.awaitingAid: null` (quest-acceptance.updates.ts:46-60), so a character on a free travel cannot accept a GM quest at all; a character waiting on a standard marker (no travel) **can** accept a story/worldMission — exactly the case the new flag must surface.
2. **Contract (additive):** the queue character is projected by `CHARACTER_PROJECTION` (pending-requests.service.ts:32-40: `infos.name`, `status.title|location|activeTravel|awaitingAid`, the two GM lanes) and mapped by `characterEntryOf` (pending-requests.builder.ts:91-104, `activeTravel`/`awaitingAid` at 101-102) into `PendingRequestCharacter` (src/models/pending-request.model.ts:27-45). Cost of `pendingQuest: ID` (nullable, id of the standard PendingQuest, `null` when free): one projection key (`'quests.pendingQuest': 1`), one field on `RequestCharacterSnapshot.quests` (builder.ts:22), one line in `characterEntryOf` (`refIdOf(character.quests?.pendingQuest)?.toHexString() ?? null`), one `@Field(() => ID, { nullable: true })` on the model; SDL diff = one added line in `type PendingRequestCharacter` (sortSchema puts it after `name`). **Recommendation: `pendingQuest: ID`** over a boolean `busy` — same cost, it carries the reason (the FE can still derive `busy = pendingQuest != null`) and mirrors `Character.quests.pendingQuest`. Keep the entry in the list (the FE hides/greys it) rather than filtering it server-side: filtering would make the queue disagree with `completePendingRequest`'s typed refusal and with the worldMission roster (D-24 is a FE display rule backed by a BE refusal). *(If D-23 as written by the orchestrator says the BE must drop busy entries instead, the same projection supports a filter `'quests.pendingQuest': null` in `GM_LANE_FILTER`; flag it in the plan.)*
3. **Refusal in `completePendingRequest`:** participants are loaded in `GmCompletionService.readRequest` (gm-completion.service.ts:139-170: the holder and, for a worldMission, every active holder via `worldMissionHolders`, 173-193) with `OUTCOME_CHARACTER_PROJECTION` (`status`, `quests`, `assets` — outcome-plan.ts:38-42), so `quests.pendingQuest` is already in memory: **pre-check** "any seat with `refIdOf(character.quests?.pendingQuest)` ⇒ `QUEST_IN_PROGRESS`" before `validateOverrides` (no extra read). **Re-assert in the transaction:** the snapshots are re-read in session (`snapshotInSession`, gm-completion.service.ts:229-238 → resolution-loader.service.ts:264-280) — repeat the check on the in-session snapshot and throw the typed error (the callback rethrows non-`StaleResolution` errors, so the transaction aborts with nothing written); and, per the Phase 4 rule «il filtro è la regola», add `'quests.pendingQuest': null` to `participantFilter` **only for GM lanes** (outcome-plan.ts:261-271 builds `{ ...activeCharacterById, [lanePath]: { $in: idForms(pendingQuestId) }, 'status.xp' }`) so a standard acceptance committed between snapshot and write either WriteConflicts (retry → snapshot sees the lane → `QUEST_IN_PROGRESS`) or matches 0 (classified by a re-read as `QUEST_IN_PROGRESS`, not `NOT_FOUND`). The standard-lane resolution paths must not receive the predicate (their own lane *is* the standard lane). Message: `GameRuleException.questInProgress()` says «Non puoi muoverti durante una missione in corso» (game-rule.exception.ts:113-118) — travel wording; add a factory with the same code and a completion message (e.g. «Il personaggio è impegnato in una missione in corso»). Order of evaluation for the handoff: `UNAUTHENTICATED` → `FORBIDDEN` → `BAD_USER_INPUT` (shape, wave 1) → `NOT_FOUND` → **`QUEST_IN_PROGRESS`** → `OUTCOME_NOT_PARTICIPANT`/`OUTCOME_OVERRIDE_INVALID` → concurrent loss `NOT_FOUND`. Amend 09 BACKEND-NOTES §9 line 491 («Nessun blocco se il partecipante è in viaggio») with a dated note. Audit: the refusal is recorded as `outcome: 'QUEST_IN_PROGRESS'` by the existing interceptor.
4. **Liveness of the queue:** `PendingRequestsPublisher` watches pendingquests `insert`/`delete` and recomputes the whole queue (pending-requests.publisher.ts:16-19, 38-44). Every transition of the standard lane goes through an insert or a delete of the standard PendingQuest **in the same transaction** as the character write: acceptance inserts it (quest-acceptance.service.ts:186-197); resolution deletes it (`OutcomeWriter.deletePendingQuest`, outcome-writer.service.ts:125-133, called by boss/individual/rescue/GM paths) while `planParticipant` clears the lane; abandon deletes it and sets `quests.pendingQuest: null` (party-abandon.service.ts:48-61); party timeout/disband deletes it and clears the lane (party-timeout.service.ts:212-234). ⇒ the flag appears/disappears without a new trigger. Gaps (no PendingQuest insert/delete): (a) **archive/death** of a character keeps its PendingQuests (character-archiver.ts never touches pendingquests) — the queue is not recomputed when a queue character is archived (pre-existing; `GM_LANE_FILTER` at pending-requests.service.ts:25-30 has no `deletedAt` filter, the builder skips entries without a linked user); (b) `arrivedAt`/`startDate` updates — irrelevant to the flag; (c) incoherent registrants `$pull`ed from a quest keep their lane — irrelevant (their lane is still occupied). Recommend: an int-spec for each of the four transitions asserting a `pendingRequestsUpdated` emission whose entry flips `pendingQuest`; optionally call `requestRefresh()` after an archive (cheap, Boy Scout) and add `deletedAt: null` to `GM_LANE_FILTER`.
5. **Teleport predicate to reuse:** `teleportFilter` = `{ ...activeCharacterById(characterId), 'quests.pendingQuest': null }` (travel.updates.ts:107-116, comment «solo la corsia standard blocca il teleport (D-17)»), applied at travel.service.ts:97, with the re-read classification returning `GameRuleException.questInProgress()` (travel.updates.ts:120-135). Extract a shared predicate `STANDARD_LANE_FREE = { 'quests.pendingQuest': null }` (e.g. in `src/quests/acceptance/quest-lanes.ts`) used by `teleportFilter`, `startTravelFilter` (travel.updates.ts:38-48) and the new GM `participantFilter` clause; the in-memory twin is `refIdOf(quests?.pendingQuest) !== null`.

## Conflicts with CONTEXT

- **C1 — D-02 vs guard order (blocking for the code table).** Guards run before pipes (probe). `CharacterAccessPolicy` answers `NOT_FOUND` for a malformed owned id before any pipe (character-access.policy.ts:97-98, 115-116, 137-138), so on the 16 ownership handlers a malformed owned id can never become `BAD_USER_INPUT` through the pipe. **Amendment:** the three `!isObjectIdHex` branches throw `BadUserInputException` (field `id`, or the name declared by the decorator) instead of `ResourceNotFoundException`; existing tests asserting `NOT_FOUND` for malformed owned ids are updated (RED first); 9.2 BACKEND-NOTES §10 bullet 4 is answered ("cambia in `BAD_USER_INPUT`, documentato").
- **C2 — D-01 registration "in `main.ts` e nell'harness".** `main.ts` is never executed by tests. **Amendment:** `createValidationPipe()` provided as `APP_PIPE` in `AppModule` and in `createAuthTestApp`; same for the REST filter (`APP_FILTER`) and the request-id middleware (`AppModule.configure`), so the real-boot test covers them. `main.ts` keeps only `rawBody` and the listen.
- **C3 — `@IsMongoId()` accepts uppercase hex**, the repo's canonical check is lowercase-only (`isObjectIdHex`, document-id.ts:12-16) and ids are compared as lowercase strings. **Amendment:** a custom `@IsObjectIdHex()` decorator (class-validator `ValidateBy` over `isObjectIdHex`) and `ObjectIdPipe`/`ObjectIdListPipe` for scalar arguments; do not use `@nestjs/mongoose` `ParseObjectIdPipe`/`IsObjectIdPipe` (value echoed in the message, 12-char strings accepted).
- **C4 — D-04 rules that already have domain validators.** Name 2–20 is enforced after normalization and by graphemes (`CHARACTER_NAME_INVALID`), background ≤ 500 graphemes (`BAD_USER_INPUT`), imagePath **https only** (not "http(s)"), age by race (`CHARACTER_AGE_OUT_OF_RANGE`), push device/token (`PUSH_INVALID_*`), PKCE verifier (`LOGIN_TICKET_INVALID`). A `@Length(2, 20)` decorator would count UTF-16 units on the raw string and change codes. **Amendment:** decorators on these fields are shape-only (`@IsString`, `@IsInt`, `@IsEnum`, generous `@MaxLength` caps above the domain limits); the domain validators stay authoritative; imagePath stays https-only.
- **C5 — code shifts implied by D-02/D-04 on existing contracts.** Besides "id malformato", these move to `BAD_USER_INPUT`: negative quantities in `doTransaction` (was `INVALID_QUANTITY`; 0 stays `INVALID_QUANTITY`), malformed item id (was `ITEM_NOT_FOUND`), malformed `spellId` (was `SPELL_NOT_KNOWN`), malformed `itemId` in `equipItem` (was `ITEM_NOT_OWNED`), override shape errors (malformed `characterId` was `OUTCOME_NOT_PARTICIPANT`; negative numbers / > 50 entries were `OUTCOME_OVERRIDE_INVALID`). **Amendment:** the dated notes in the Phase 3/4/7/8/9/9.1/9.2 handoffs list every shifted row; override arrays keep the Phase 9 cap of **50** (D-04's 100 applies to new arrays only: `ids` lists, transaction lines).
- **C6 — OAuth routes.** Turning `@Query() query: TwitchCallbackQuery` into a validated DTO would answer JSON 400 instead of the redirect contract; a JSON 429 on these browser navigations strands the user. **Amendment:** OAuth query validation stays in `TwitchLoginService` (already redirects every outcome); throttling on start/callback redirects to `APP_AUTH_REDIRECT_URL?error=rate_limited` (new additive code). D-08 "status 429 su REST" holds for Cloudinary and the webhook.
- **C7 — WS bypasses D-05/D-07.** Probe: with `introspection: false`, an authenticated graphql-ws socket still introspects, and WS errors carry raw messages (no `formatError` on WS). **Amendment:** production adds graphql-ws `validate` with `NoSchemaIntrospectionCustomRule` and an `onNext`/`onError` sanitizer sharing the HTTP rule and `requestId`.
- **C8 — `TOO_MANY_REQUESTS` on GraphQL needs a coded exception.** `ThrottlerException` (429) is mapped by `@nestjs/apollo` to `INTERNAL_SERVER_ERROR`; the production sanitizer would then hide it. **Amendment:** guard override `throwThrottlingException` → `TooManyRequestsException` with `extensions = { code: 'TOO_MANY_REQUESTS' }` (probe-verified).
- **C9 — gitleaks details.** `push`/`pull_request` scan only the event's commits; the history scan needs `workflow_dispatch`/`schedule`. Fingerprints go to **`.gitleaksignore`**, not `.gitleaks.toml`. Global allowlist syntax depends on the gitleaks version (`[allowlist]` ≤ 8.24, `[[allowlists]]` ≥ 8.25; the action defaults to 8.24.3). **Amendment:** workflow triggers include `workflow_dispatch` + weekly `schedule`; pin `GITLEAKS_VERSION`; D-10 "allowlist per fingerprint" lives in `.gitleaksignore` with a dated comment.
- **C10 — Sightengine facts.** No model page publishes a threshold (gore-2.0 included, contrary to the CONTEXT note); `text-content` is the deprecated legacy model (text-content-2.0 requires `text_categories`); `text` and `text-content` share the `text` key; `qr-content` reports detected content, not QR presence; `face-age` separates `faces` and `artificial_faces`; `offensive-2.0` includes `asian_swastika`. **Amendment:** uniform 0.5 per D-13's fallback; keep the model list verbatim (D-12); the policy table above (with A3–A5) is shown to the user before the PR as D-13 already requires.
- **C11 — D-01/D-15 file validation.** Nest `FileTypeValidator` fails under Jest (ESM `file-type`), and the FE sends `application/octet-stream`. **Amendment:** custom pure image-signature validator (JPEG/PNG/WEBP) inside `ParseFilePipe`, multer `limits` for size and count; still no new dependency.
- **C12 — D-16 mechanics.** Spec files are counted at 0 % today; thresholds must be root-level **directory** keys; the equipment atomics are in `src/characters/characters.service.ts` (the `equipment/` folder has 1 file). **Amendment:** fix `collectCoverageFrom` first, use the table in F6 (includes a file key for `characters.service.ts`), `test:cov` with `--selectProjects unit integration --runInBand` and a single CI coverage step.
- **C13 — D-17b `types: ["jest"]`** exposes 56 latent type errors in 23 spec files. **Amendment:** same task fixes them (test-only edits), then optionally a CI step `npx tsc --noEmit -p tsconfig.json`.
- **C14 — D-17d order and removal.** After retyping, Mongoose casts filter strings to ObjectId, so legacy string refs stop matching even through `idForms`; the migration must run on production **before** the retyped code is deployed, and the tolerant readers can only be removed after the user verifies production (not in this phase). The scope is 33 paths in 9 collections, not 5. **Amendment:** wave 8 = script + verifier + retyping + deploy-order checklist; readers removal → backlog (v1.1); PointOfInterest scalar `type` normalization rides in the same script.
- **C15 — D-22 description.** `arrivedAt` is on the PendingQuest (written in the same transaction as the character write), not on the character. The defect is the post-commit `startDate` write without a character change. Fix as F8 (solo start in-transaction + PendingQuest `startDate` → `characterUpdated` publisher for party/sweep starts).
- **C16 — D-19 is outdated.** 9.2 merged (PR #15, 2026-10-29) and `feat/10-hardening` is rebased on `develop` (STATE); the PR goes straight to `develop`, no further restack.
- **C17 — STATE scope vs CONTEXT.** STATE's "Current focus" lists "backfill scan" and "sweep for never-confirmed deaths"; CONTEXT has neither explicitly. Backfill is covered by D-17b (F7). The never-confirmed-deaths sweep is new gameplay (it would unlink users automatically after a term, 9.2 D-12) and violates the phase boundary "senza aggiungere gameplay". **Amendment:** add it to Deferred Ideas unless the user explicitly wants it (then it needs a term and a test plan).
- **C18 — D-21 scope.** The WARN lives in `BossResolutionService` **and** `RescueResolutionService` (questUpdateOf does not log); group rescues have the same seat rule. **Amendment:** D-21 applies to both group resolutions; code naming avoids "Placeholder".
- **C19 — throttler behind a proxy.** Deploy topology is unknown; behind a reverse proxy `req.ip` is the proxy for everyone (one shared bucket: a flood would block logins and Twitch). **Amendment (discretion, user to confirm):** optional `THROTTLE_TRUST_PROXY` (empty = off; a hop count or an address list passed to Express `trust proxy`), documented in the deploy checklist.
- **C20 — `NODE_ENV` allowlist and staging.** A staging server with `NODE_ENV=staging` would refuse to boot after D-05; setting it to `production` disables the dev bypass that FE stubs rely on and turns introspection off. **Amendment:** deploy checklist states the allowed values and the consequence for staging.

- **C21 — 09 handoff §9 vs D-24.** BACKEND-NOTES 09 line 491 says «Nessun blocco se il partecipante è in viaggio (il filtro è UX del pannello)». **Amendment:** `completePendingRequest` refuses `QUEST_IN_PROGRESS` when any active participant has the standard lane occupied (pre-check + in-session re-check + GM-only filter clause), dated note in §9; the reused code keeps its travel message unless a completion-specific factory is added (recommended).
- **C22 — list vs flag (D-23 wording to check).** The rule says the busy character «non deve comparire nella lista … che l'admin può gestire». The cheapest consistent contract is an additive `PendingRequestCharacter.pendingQuest: ID` with the FE hiding/disabling the entry and the BE refusing the completion; a server-side filter is equally cheap but hides the reason. **Amendment:** keep the entry + field unless the user explicitly wants server-side removal (then filter in `GM_LANE_FILTER` and keep the refusal).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation and stripping | per-resolver `if` chains | class-validator + `ValidationPipe` with one `exceptionFactory` | whitelist, nested validation, transform, one error shape |
| Rate limiting | counters in services | `@nestjs/throttler` with a subclassed guard | storage, `Retry-After`, per-handler keys, block duration |
| Introspection blocking | resolver checks | Apollo `introspection: false` + graphql-js `NoSchemaIntrospectionCustomRule` on WS | introspection never reaches resolvers |
| "Did you mean" removal | regex on messages | `hideSchemaDetailsFromClientErrors` (4.12.2) | official plugin |
| Multipart to Sightengine | manual boundary strings | Node `FormData` + `Blob` | probe-verified encoding |
| Secret scanning | grep patterns | gitleaks-action v3 + default rules | maintained rules, SARIF, PR comments |
| Change-stream resume | re-reading collections | driver resume token (`startAfter`) | no gap, no duplicate scans |
| Id format check | `Types.ObjectId.isValid` | `isObjectIdHex` (existing) | `isValid` accepts any 12-char string |
**Exception (justified hand-roll):** the 15-line image-signature validator, because the standard `FileTypeValidator` cannot run under Jest.

## Common Pitfalls

1. **Missing `@Type` on nested inputs** — elements silently become `{}` and skip validation (probe). Every nested `@Field(() => X)`/`[X]` needs `@ValidateNested` + `@Type(() => X)`; enforced by the decorator-coverage test.
2. **Undecorated `@Field` is stripped** — with `whitelist: true` every declared field needs ≥ 1 class-validator decorator (`@IsOptional()` alone is enough for optional passthrough), or the service receives `undefined`.
3. **Field collector drops parent constraints** — collect `error.property` when `constraints` exist and recurse into `children` (probe lost `@ArrayMaxSize`). Never include `error.value` or constraint messages (they can echo values).
4. **`import type` on decorated parameter types** — with `isolatedModules` + `emitDecoratorMetadata`, a type-only import erases `design:paramtypes`; the pipe then sees `Object` and validates nothing. Import DTO classes as values.
5. **Guards before pipes** — ownership/roles decide first (C1); unauthenticated callers always get `UNAUTHENTICATED` before any validation (no input oracle).
6. **Exception filters see GraphQL too** — a global `@Catch()` must not write an HTTP response for `host.getType() === 'graphql'`.
7. **ThrottlerGuard on WS context** — `res` is undefined; header setting throws without the stub response.
8. **Webhook throttling** — counts unsigned requests before HMAC; failed deliveries can get the subscription revoked: very high limit + dedicated test.
9. **`FileTypeValidator` under Jest** — rejects valid images (ESM import); do not rely on `file.mimetype` (FE sends octet-stream).
10. **Coverage keys** — glob keys are per file, directory keys aggregate; spec files must be excluded first.
11. **Retyping before migrating** — legacy string refs stop matching filters immediately after the schema change.
12. **`NODE_ENV` read at module load** — read it through config so the harness can exercise production mode deterministically; Jest forces `NODE_ENV=test`.
13. **Sightengine `text` key collision** — parse defensively; missing keys mean "no detection", never a crash (fail-closed only on transport/API errors).

## Code Examples

```ts
// BAD_USER_INPUT exception (same pattern as GameRuleException / AuthException)
export class BadUserInputException extends BadRequestException {
    readonly extensions = { code: 'BAD_USER_INPUT' as const };
    constructor(readonly fields: readonly string[]) {
        super({ statusCode: 400, code: 'BAD_USER_INPUT', message: `Input non valido: ${fields.join(', ')}` });
    }
}

// field paths only, parent constraints included (probe lesson)
export function invalidFieldsOf(errors: readonly ValidationError[], parent = ''): string[] {
    return errors.flatMap((error) => {
        const path = parent ? `${parent}.${error.property}` : error.property;
        const own = error.constraints ? [path] : [];
        return [...own, ...invalidFieldsOf(error.children ?? [], path)];
    });
}

export const createValidationPipe = () =>
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        exceptionFactory: (errors) => new BadUserInputException([...new Set(invalidFieldsOf(errors))]),
    });
// AppModule and createAuthTestApp: { provide: APP_PIPE, useFactory: createValidationPipe }
```

```ts
// graphql-ws in production (Nest spreads these into useServer)
'graphql-ws': {
    onConnect, onClose,
    ...(production ? {
        validate: (schema, document) => validate(schema, document, [...specifiedRules, NoSchemaIntrospectionCustomRule]),
        onNext: (ctx, _id, _payload, _args, result) => sanitizeExecutionResult(result, requestIdOf(ctx)),
        onError: (ctx, _id, _payload, errors) => sanitizeErrors(errors, requestIdOf(ctx)),
    } : {}),
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gitleaks-action@v2` (Node 20) | `@v3` (Node 24, same inputs) | v3.0.0, 2026-05-30; v2 dead 2026-09-16 | use v3 |
| gitleaks global `[allowlist]` | `[[allowlists]]` | gitleaks v8.25.0 | match syntax to the pinned version |
| Sightengine `text-content` | `text-content-2.0` (needs `text_categories`) | Sightengine docs (date not shown) | D-12 keeps the legacy id verbatim |
| Throttler `ttl` in seconds | milliseconds | `@nestjs/throttler` v5+ | `THROTTLE_TTL_MS` naming is right |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production MongoDB is ≥ 4.2 (update pipelines, `$regexMatch`, `$toObjectId`) | F7 migration | migration script fails; 9.2 A1 still open — user confirms before wave 8 |
| A2 | When both `text` and `text-content` are requested, Sightengine merges their fields under one `text` object | F5 | parser misses one model; mitigated by defensive parsing; verify with one manual call with real keys (user) |
| A3 | Minor detection applies to real `faces` only; `artificial_faces` (drawn/AI portraits) are logged | F5 policy | fantasy portraits may be rejected or allowed against the user's intent — show in the PR summary (D-13) |
| A4 | "Qualunque QR" = any non-empty `qr.*` array (QR presence without content is not reported by the API) | F5 policy | a QR with plain text passes — user confirms |
| A5 | `text-content` arrays other than `profanity`/`personal` are log-only | F5 policy | stricter intent missed — user confirms |
| A6 | Throttle defaults 20/min per IP per handler, webhook ×50 | F3 | legitimate bursts throttled or abuse allowed — configurable via env |
| A7 | The deployment may sit behind a reverse proxy (needs `THROTTLE_TRUST_PROXY`) | C19 | shared bucket or spoofable tracker — user confirms topology |
| A8 | `[allowlist]` (single table) is the right syntax for the action's default gitleaks 8.24.3 | F4 | config ignored → false positives fail CI; verified on the first workflow run |

## Open Questions (RESOLVED)

1. **Owned malformed ids: `NOT_FOUND` or `BAD_USER_INPUT`?** → `BAD_USER_INPUT` from the policy (C1), consistent with D-02.
2. **Pipe registration point?** → `APP_PIPE`/`APP_FILTER`/`configure()` (C2).
3. **Scalar id validation: pipe or `@ArgsType`?** → `ObjectIdPipe`/`ObjectIdListPipe` on scalars; `@ArgsType` not needed (Claude's discretion).
4. **`extensions.fields`?** → not added: the message already lists the fields and D-03 keeps `extensions = { code }` (discretion; zero FE cost either way).
5. **Override array cap 50 vs 100?** → keep 50 (C5).
6. **requestId shape?** → sanitized `x-request-id` or `randomUUID()`; GraphQL context + Apollo plugin; REST middleware + header (discretion).
7. **Throttler defaults and webhook bucket?** → TTL 60 000 ms, limit 20, webhook ×50; OAuth redirects on throttle (C6) (discretion; A6).
8. **Trust proxy?** → optional `THROTTLE_TRUST_PROXY`, empty = off (C19, user confirms in the deploy checklist).
9. **Sightengine media errors?** → 422 `IMAGE_REJECTED` reason `unreadable`; credentials/argument/quota/5xx/timeout → 503 (discretion within D-14).
10. **Image validation?** → custom signature validator + multer limits (C11).
11. **Moderation module layout?** → `src/moderation/` with `image-policy.ts`, `image-moderator.ts` (port), `sightengine-image.moderator.ts`, `disabled-image.moderator.ts`, `moderation-config.ts` in `src/config/`, fake in `test/moderation/` (discretion).
12. **Coverage thresholds?** → table in F6 (baseline − 2, floored), raised after the new tests.
13. **Backfills once or every tick?** → once per process at boot, not awaited; removal in v1.1 (F7).
14. **Mixed refs: boot-time or script?** → script + boot verifier; order backup → copy → prod → deploy; readers removal deferred (C14).
15. **`SPELL_RECOVERY_UNAVAILABLE`?** → already gone (F9).
16. **Never-confirmed deaths sweep / 9.2 OQ6?** → out of scope (C17), routed to Deferred Ideas pending the user.
17. **D-22 event mechanism?** → in-transaction solo start + PendingQuest `startDate` publisher (F8).
18. **BE-HARD-08 field shape?** → `pendingQuest: ID` nullable (F10, C22); boolean `busy` rejected (same cost, less information).
19. **Do story/worldMission ever travel?** → no (quest-acceptance.service.ts:150-153); no conflict.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/tests | ✓ | local v26.12.1, CI 22 | — |
| MongoMemoryReplSet | int tests | ✓ | CI pins 8.0.4 | — |
| Redis | int tests | ✓ | redis-memory-server locally, service `redis:7` in CI | — |
| gh CLI | CI status / PR | ✓ | personal token via `GH_TOKEN=$(gh auth token --user LucaTabbia)` | — |
| gitleaks binary | local history scan | ✗ (download denied by sandbox) | — | first full scan via `workflow_dispatch` on the branch |
| Sightengine API | moderation | ✗ in tests by design | — | `FakeImageModerator`; one manual call by the user for A2 |
| class-validator / class-transformer / @nestjs/throttler | waves 1–2 | ✗ (to install) | 0.15.1 / 0.5.1 / 6.7.1 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.1.3 + ts-jest 29.4.1, two projects (`unit`: `*.spec.ts`; `integration`: `*.int-spec.ts` with MongoMemoryReplSet global setup and Redis) |
| Config file | `package.json` → `jest` (root: `collectCoverageFrom`, `coverageDirectory`; to add: `coverageThreshold`) |
| Quick run command | `npx jest <paths> --selectProjects unit` / `npx jest <paths> --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit && npm run test:int` (today) → `npm run test:cov` (after wave 7) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-HARD-01 | field collector, exception shape, decorator coverage of the 17 inputs, `@IsObjectIdHex` | unit | `npx jest src/validation --selectProjects unit` | ❌ Wave 0/1 |
| BE-HARD-01 | unknown/undecorated field stripped (`EquipSpellRequest.usages`), malformed id → `BAD_USER_INPUT` on a plain, an owned and a nested input, negative quantity, field names only in message | integration | `npx jest src/validation/validation.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-HARD-01 | upload: oversize 413, two files 400, non-image 400 `BAD_USER_INPUT`, octet-stream JPEG accepted | integration | `npx jest src/rest/cloudinary --selectProjects integration --runInBand` | ❌ |
| BE-HARD-02 | production options: introspection off (HTTP + WS), no suggestions, landing disabled, sanitized `INTERNAL_SERVER_ERROR` + `requestId` (HTTP + WS), dev unchanged | integration | `npx jest src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-HARD-02 | REST filter 500 + `requestId`, `HttpException` bodies untouched, no CORS headers | integration | `npx jest src/http --selectProjects integration --runInBand` | ❌ |
| BE-HARD-02 | throttling: GraphQL `TOO_MANY_REQUESTS`, REST 429 + `Retry-After`, OAuth redirect `rate_limited`, webhook burst above limit all 204 | integration | `npx jest src/throttling src/eventsub/eventsub-throttle.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-HARD-02 | `NODE_ENV` allowlist, empty → development | unit | `npx jest src/config/runtime-config.spec.ts --selectProjects unit` | ❌ |
| BE-HARD-03 | `.env.example` ↔ code keys drift | unit | `npx jest src/config/env-example.drift.spec.ts --selectProjects unit` | ❌ |
| BE-HARD-03 | gitleaks job green on push/PR and on `workflow_dispatch` (history) | CI | GitHub Actions run | ❌ (manual check of the run) |
| BE-HARD-04 | thresholds enforced | CI/local | `npm run test:cov` | ❌ (config change) |
| BE-HARD-05 | policy table (one named test per category + log-only cases + missing keys) | unit | `npx jest src/moderation/image-policy.spec.ts --selectProjects unit` | ❌ |
| BE-HARD-05 | Sightengine client mapping (5xx, abort, `usage_limit`, `media_error`, success) with a stubbed `fetch` | unit | `npx jest src/moderation/sightengine-image.moderator.spec.ts --selectProjects unit` | ❌ |
| BE-HARD-05 | rejected image never reaches Cloudinary (mock not called), 422 body with reasons only; unavailable → 503; config refuses missing keys in production | integration + unit | `npx jest src/rest/cloudinary src/config/moderation-config.spec.ts …` | ❌ |
| BE-HARD-06 | change-stream reopen (unit with fake emitter; int via collection drop), `UserUpdatesPublisher` single-flight race, `removeOnFail` options, indexes present (`listIndexes`), backfill once at boot, `Enemy.locations`/`PointOfInterest.type` lists, `@AuditTarget` record, refactors green on existing nets | unit + integration | per file | ❌ / partially existing nets |
| BE-HARD-06 | Mixed migration: string refs converted on every path, second run modifies 0, `--verify` counts 0, non-hex strings untouched, retyped schema reads migrated docs | integration | `npx jest src/migrations --selectProjects integration --runInBand` | ❌ |
| BE-HARD-08 | `PendingRequestCharacter.pendingQuest` projected (null when free, id when the standard lane is occupied, null for a free city travel); emission on acceptance/resolution/abandon/disband; `completePendingRequest` → `QUEST_IN_PROGRESS` (story holder busy; one busy worldMission participant blocks all; nothing written); concurrent standard acceptance during completion → `QUEST_IN_PROGRESS` or clean retry; SDL diff exactly one added line | unit (builder) + integration | `npx jest src/quests/pending-requests --selectProjects unit` / `npx jest src/quests/pending-requests src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ files exist (cases to add) |
| BE-HARD-07 | seat holder counts in combat (scripted resolver), no result/reward, INFO log; rescue variant; solo start atomic on arrival and acceptance; party start emits `characterUpdated` | integration | `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/travel/travel-completion.int-spec.ts src/quests/party --selectProjects integration --runInBand` | ✅ files exist (cases to rewrite/add) |

### Sampling Rate
- **Per task commit:** the quick command on the touched paths + `npx eslint <files>` + `npx prettier --check <files>`.
- **Per wave merge:** `npm run test:unit && npm run test:int` (after wave 7: `npm run test:cov`), `npm run build`, `git diff --exit-code src/schema.gql` after `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`.
- **Phase gate:** full suite with coverage green, `npx tsc --noEmit -p tsconfig.json` clean (after C13), SDL diff additive only (expected: none or only new enum values), gitleaks run green including one `workflow_dispatch` history scan, `pgrep -fl jest` empty, wave 8 gate (migration int-spec + `--verify` on a restored copy, documented by the user).

### Wave 0 Gaps
- [ ] `npm install class-validator@^0.15.1 class-transformer@^0.5.1 @nestjs/throttler@^6.7.1`
- [ ] `test/app.int-spec.ts` RED: throttled-handler enumeration, moderation/runtime reporter mounts, env blanking of `SIGHTENGINE_*`/`THROTTLE_*`, renamed introspection test
- [ ] harness: `createAuthTestApp` gets `APP_PIPE`, `APP_FILTER`, `ThrottlerModule`, `ImageModerator` override (fake) and a `production` flag for `createGraphQLOptions`
- [ ] `test/moderation/fake-image-moderator.ts`
- [ ] `collectCoverageFrom` excludes specs (before any threshold)

### Gate command set
```bash
npx jest <touched paths> --selectProjects unit
npx jest <touched paths> --selectProjects integration --runInBand
npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql
npm run build
npm run test:cov            # after wave 7 (thresholds)
npx tsc --noEmit -p tsconfig.json   # after C13
npx eslint <touched files> && npx prettier --check <touched files>
pgrep -fl jest              # must be empty
```

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (throttling login/refresh) | `@nestjs/throttler` opt-in guard |
| V3 Session Management | no change | existing JWT + refresh rotation |
| V4 Access Control | yes (guard order, malformed owned ids) | existing guards; C1 |
| V5 Input Validation | yes | class-validator + `ValidationPipe` whitelist; file signature + size limits; Sightengine moderation |
| V6 Cryptography | no change | — |
| V7 Error Handling and Logging | yes | production sanitizer (HTTP + WS), `requestId`, server-side full logs without secrets |
| V8 Data Protection | yes | no secrets in repo (gitleaks), `.env.example` drift test, moderation logs without images/scores |
| V14 Configuration | yes | `NODE_ENV` allowlist, introspection/landing off in production, CORS closed, keys mandatory in production |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Schema discovery via introspection (HTTP and WS) | Information disclosure | Apollo `introspection: false` + `NoSchemaIntrospectionCustomRule` on graphql-ws |
| Error message leaking URIs/stack | Information disclosure | production sanitizer + `requestId` correlation |
| Brute force / token stuffing on login/refresh | Spoofing / DoS | throttler per IP per handler |
| Webhook flood | DoS | high webhook bucket; HMAC still decides trust |
| Mass assignment of undeclared/deprecated fields | Tampering | whitelist stripping |
| NoSQL operator injection through ids | Tampering | `isObjectIdHex` on every id before queries |
| Malicious/NSFW upload, oversize upload | Tampering / DoS / abuse | multer limits, signature check, Sightengine fail-closed |
| Committed secrets | Information disclosure | gitleaks history scan + rotation checklist (user) |
| Log injection via `x-request-id` | Tampering | accept only `[A-Za-z0-9._-]{1,64}` |

## Suggested wave order

0. **Wave 1a — Admin queue and the standard lane** (BE-HARD-08, small, additive, independent of everything else; can run first or in parallel with wave 1): `app.int-spec` schema assertion for `PendingRequestCharacter` (RED), projection + field + builder, shared `STANDARD_LANE_FREE` predicate, completion refusal (pre-check, in-session check, GM-only filter clause, completion message), liveness int-specs, dated note in 09 §9 and FE handoff row.
1. **Wave 1 — Validation + `BAD_USER_INPUT`** (BE-HARD-01): Wave 0 items (deps, harness `APP_PIPE`, app.int-spec RED), `BadUserInputException`, `createValidationPipe`, `@IsObjectIdHex`, `ObjectIdPipe`/`ObjectIdListPipe`, decorators on the 17 inputs (shape only, C4), decorator-coverage test, policy change for owned ids (C1), `gm-overrides` migration (C5), handoff code notes collected for wave 9.
2. **Wave 2 — Production surface** (BE-HARD-02): runtime config + reporter, `createGraphQLOptions(…, { production })`, sanitizer + requestId plugin, graphql-ws `validate`/`onNext`/`onError` (C7), REST filter + middleware, Cloudinary controller stops swallowing, catalog `NOT_FOUND`, throttler (guard, coded 429, OAuth redirect, webhook bucket + burst test) (C6, C8, C19).
3. **Wave 3 — Secrets/env/CI** (BE-HARD-03): runtime/throttle/moderation keys through config (no scattered `process.env`), `.env.example` commented line by line, drift test, gitleaks workflow (+ `workflow_dispatch` run, `.gitleaksignore`/allowlist from its result) (C9).
4. **Wave 4 — Image moderation** (BE-HARD-05): config (fail-closed in production), policy table + tests, Sightengine client, port/disabled/fake, upload pipeline (limits, signature validator, moderation before Cloudinary) (C10, C11).
5. **Wave 5 — Resilience, indexes, schema bugs, BE-HARD-07**: change-stream reopen (characters stream onto the base class), `UserUpdatesPublisher` single-flight, `removeOnFail`, indexes + verifier, backfills once at boot, `style` commits then `Enemy.locations`/`PointOfInterest.type`, `types: ["jest"]` + 56 fixes (C13); D-21 seat holders (boss + rescue, C18) and D-22 solo start + PendingQuest `startDate` publisher (C15).
6. **Wave 6 — Refactors at unchanged behaviour**: `commitRescue` split, `primeChangeStream`, `@AuditTarget`.
7. **Wave 7 — Coverage**: `collectCoverageFrom`, `test:cov`, CI single coverage step, thresholds from F6, gap-checklist tests, then raise thresholds to the new measured values − 2 (C12).
8. **Wave 8 — `Mixed` refs (own gate)**: migration builders + script (`--dry-run|--apply|--verify`), PointOfInterest scalar normalization, int-spec (idempotency, non-hex untouched), retyping of the 33 paths, test fixture updates (raw `collection.*` for legacy cases), boot verifier, deploy-order + rollback runbook (C14). Gate: full suite green + user-run backup/copy verification recorded before the PR is marked ready.
9. **Wave 9 — Handoff + traceability**: `BACKEND-NOTES.md` (codes `BAD_USER_INPUT`, `TOO_MANY_REQUESTS`, `IMAGE_REJECTED`, `IMAGE_MODERATION_UNAVAILABLE`, `INTERNAL_SERVER_ERROR` + `requestId`, `rate_limited` redirect, shifted rows of C5, audit target, deploy checklist with `NODE_ENV`, mandatory keys, Redis `noeviction`, `THROTTLE_*`, migration order, secret rotation), dated amendments in the Phase 3/4/7/8/9/9.1/9.2 handoffs, Sightengine policy table for the user, REQUIREMENTS/ROADMAP/STATE traceability.

## Sources

### Primary (HIGH confidence)
- Repository code at `feat/10-hardening` (file:line cited inline) and installed packages in `node_modules` (`@nestjs/common` 11.1.6, `@nestjs/apollo` 13.1.0, `@nestjs/graphql` 13.2.0, `@apollo/server` 4.12.2, graphql-ws 6.0.6, mongoose 8.18.1, `@jest/reporters` 30).
- Probes on the real harness (listed at the top), coverage run of 2026-10-29.
- `@nestjs/throttler` 6.7.1 and class-validator 0.15.1 package sources (npm pack, read locally).
- gitleaks-action v3 source `src/index.js`, `src/gitleaks.js` (raw.githubusercontent.com, tag v3) and README/releases — https://github.com/gitleaks/gitleaks-action
- Jest configuration docs — https://jestjs.io/docs/configuration#coveragethreshold-object

### Secondary (MEDIUM confidence)
- NestJS rate limiting docs — https://docs.nestjs.com/security/rate-limiting
- gitleaks README (config, `.gitleaksignore`, allowlist versions) — https://github.com/gitleaks/gitleaks
- Sightengine docs (2026-10-29): https://sightengine.com/docs/getstarted, https://sightengine.com/docs/advanced-nudity-detection-model-2.1, https://sightengine.com/docs/hate-and-offensive-content-detection-model, https://sightengine.com/docs/gore-disgusting-horrific-content-detection, https://sightengine.com/docs/self-harm-detection-model, https://sightengine.com/docs/face-age-minor-detection, https://sightengine.com/docs/ocr-text-moderation-in-images, https://sightengine.com/docs/ocr-text-moderation-in-images-2.0, https://sightengine.com/docs/text-detection-model, https://sightengine.com/docs/qr-code-moderation, https://sightengine.com/docs/api-error-codes-and-responses
- Twitch EventSub webhook handling — https://dev.twitch.tv/docs/eventsub/handling-webhook-events/
- class-validator releases — https://github.com/typestack/class-validator/releases

### Tertiary (LOW confidence)
- Merged `text` object when `text` and `text-content` are both requested (A2) — inferred from the two model pages, not observed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions from the registry and node_modules; behaviour probed.
- Architecture: HIGH — every integration point read in code; the WS gaps and guard order are probe facts.
- Pitfalls: HIGH for validation/throttler/file/coverage (observed), MEDIUM for Sightengine response merging and gitleaks false positives.

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (Sightengine/gitleaks facts: re-check if the phase slips beyond that)
