# Phase 10: Hardening Trasversale - Context

**Gathered:** 2026-10-27 (discuss interattivo, nella stessa sessione del discuss FE Phase 8 e dell'inserimento della BE Phase 9.1)
**Status:** Ready for planning — da pianificare ed eseguire **dopo** la PR della Phase 9.2 (branch `feat/10-hardening` stacked su `feat/09.2-quest-result-delivery-contract` dal 2026-10-27, dopo il merge della 9.1; D-19)

<domain>
## Phase Boundary

Ultima fase BE della v1.0: indurisce le superfici costruite dalle Phase 2–9.1 senza aggiungere gameplay. Consegna: validazione autoritativa di ogni input GraphQL/REST con `ValidationPipe` globale e codice stabile `BAD_USER_INPUT`; introspection e landing page spente in produzione, CORS chiuso, errori imprevisti sanitizzati con `requestId`, throttling minimo sugli endpoint di autenticazione/webhook/upload; igiene dei secret (gitleaks in CI, `.env.example` completo con test di drift, rotazione documentata); moderazione delle immagini del personaggio con Sightengine (fail-closed); coverage di test con soglie per area che fanno fallire la CI; i debiti rinviati dalle fasi precedenti (resilienza dei publisher e delle code, indici, bug di schema, refactor interni, ritipizzazione dei ref `Mixed`); handoff per il FE.

Fuori scope: nuovi campi o mutation di gioco, cambi di forma dello schema visibili al FE (solo codici nuovi e campi additivi di infrastruttura), hardening del FE (FE Phase 12), throttling sulle mutation di gioco, storage Redis del throttler (una sola istanza), moderazione dei contenuti testuali (nome/background) oltre a quanto già fa BE-CHAR-02.

</domain>

<decisions>
## Implementation Decisions

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

### Claude's Discretion
- Limiti numerici non fissati da requisiti precedenti (D-04); `extensions.fields` (D-03); forma del `requestId` e del middleware (D-07); default del throttler (D-08); struttura del modulo di moderazione e del client (D-12, D-15); soglie iniziali di coverage (D-16); ordine delle wave e nomi dei file; se e come rimuovere `SPELL_RECOVERY_UNAVAILABLE` se la 9.1 lo ha lasciato nell'enum.

</decisions>

<specifics>
## Specific Ideas

- Le frasi dell'utente in D-12 sono verbatim; i modelli Sightengine sono quelli e solo quelli.
- «Chiuso e basta» per CORS e «Includere, minimo» per il throttler sono scelte contro le opzioni raccomandate (allowlist da env; rinvio al backlog): il planner non le riapre.
- Il valore delle due chiavi Sightengine esiste solo nel `.env` dell'utente: nessun agent deve leggerlo o stamparlo.

</specifics>

<canonical_refs>
## Canonical References

### Requisiti e roadmap
- `.planning/ROADMAP.md` §"Phase 10: Hardening Trasversale" — goal, success criteria (emendati oggi), requirements BE-HARD-01..06.
- `.planning/REQUIREMENTS.md` §"Hardening (BE-HARD)" — BE-HARD-01..04 emendati, BE-HARD-05 (moderazione immagini) e BE-HARD-06 (debiti rinviati) aggiunti il 2026-10-27.
- `.planning/PROJECT.md` — Key Decisions (JWT di sessione, atomicità per costruzione), constraint di sicurezza («nessun secret in repo»), CONCERNS.md citati.

### Debiti rinviati (input della fase)
- `.planning/phases/09-combat-result-admin-outcomes/deferred-items.md` — IN-06/IN-07/IN-08, WR-01, IN-04, IN-13, IN-15, flaky del boot.
- `.planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md` §14 (note per la Phase 10), §15 (deploy, Redis), §16 (deviazioni e punti aperti).
- `.planning/phases/01-fondazione-test-consolidamento-spell-wip/deferred-items.md` — tsconfig `types`, mismatch `PointOfInterest.type`.
- `.planning/phases/08-travel-lifecycle-travel-01/` (08-REVIEW IN-03 `removeOnFail`), `.planning/phases/02.1-character-creation-contract/` (BE-CHAR-04: debito NSFW).

### Contratti con il FE da emendare
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/BACKEND-NOTES.md`, `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md` §2, `.planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md`, `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md`, `.planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md` §2, `.planning/phases/09.1-spell-state-and-recovery-contract/` — tabelle dei codici (nota «id malformato → `BAD_USER_INPUT`»).
- `Klimmeck-Guide/.planning/phases/02-character-creation/02-CONTEXT.md` e `Klimmeck-Guide/lib/repository/character_creation_failure.dart` — dove il FE mapperà `IMAGE_REJECTED`/`IMAGE_MODERATION_UNAVAILABLE`.

### Codice
- `src/main.ts`, `src/app.module.ts`, `src/graphql/graphql-options.factory.ts`, `src/graphql/format-domain-error.ts`, `src/graphql/graphql-context.ts`, `src/config/env.validation.ts` e `src/config/*-config.ts`, `src/rest/cloudinary/cloudinary.controller.ts` + `cloudinary.service.ts`, `src/quests/outcomes/gm-overrides.ts`, `src/queues/enqueue-trigger.ts`, `src/mongo/keyed-single-flight.ts`, `src/users/user-updates.publisher.ts`, `src/quests/pending-requests/pending-requests.publisher.ts`, `src/quests/quest-results/*.publisher.ts`, `src/models/enemy.model.ts`, `src/models/point-of-interest.model.ts`, `.github/workflows/ci.yml`, `.env.example`, `tsconfig.json`, `package.json` (`test:cov`).

### Fonti esterne (verificate il 2026-10-27, da riconfermare dal researcher)
- gitleaks-action: licenza richiesta solo alle organization, v2 fuori servizio dal 16/09/2026 (README e release notes di `gitleaks/gitleaks-action`).
- Sightengine: `POST https://api.sightengine.com/1.0/check.json` con `media`, `models`, `api_user`, `api_secret`; soglia raccomandata 0.5 per `gore-2.0`; model reference per classi e soglie degli altri modelli (`sightengine.com/docs`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validateEnv` con i parser per area (`parseAuthConfig`, `parsePushConfig`, …) e il pattern fail-closed di `FIREBASE_SERVICE_ACCOUNT` in produzione (D-05, D-11, D-14).
- `formatDomainError` + `unwrapResolverError` (D-03, D-07); `buildGraphQLContext` (D-07 `requestId`); `createGraphQLOptions` condivisa da app e harness (D-01, D-05).
- `enqueueTrigger`, `KeyedSingleFlight`, i publisher esistenti e i loro helper di priming nei test (D-17a/c); `refIdOf`/`idForms` (D-17d).
- Harness: MongoMemoryReplSet condiviso, Redis effimero, `createCharactersTestApp` per l'audit, `test/app.int-spec.ts` che enumera gli handler e rigenera lo schema.

### Established Patterns
- Config letta e validata al boot con errori espliciti; codici stabili in `extensions.code`; «il DB è la fonte di verità, il job è un trigger»; nessuna riscrittura di massa con prettier; CI con lint `--fix`, build, unit, integration, diff dello schema.

### Integration Points
- `main.ts`/`AppModule` (pipe, filtro errori, throttler, middleware `requestId`), `GraphQLModule` options (introspection, landing page, formatError), `RestModule`/`CloudinaryController` (moderazione, DTO, `ParseFilePipe`), `.github/workflows/ci.yml` (gitleaks job, coverage), modelli e publisher per D-17.

</code_context>

<deferred>
## Deferred Ideas

- Storage Redis per il throttler (più istanze) — v1.1.
- Allowlist CORS da env per un eventuale pannello web — quando esisterà un client web.
- Moderazione dei testi liberi (nome, background) con `text-content` di Sightengine — backlog.
- Lista `questResults` del personaggio (storico dei fogli) — YAGNI (09 §14).
- Hook pre-commit gitleaks — se la CI non basta.

</deferred>

---

*Phase: 10-hardening-trasversale*
*Context gathered: 2026-10-27*
