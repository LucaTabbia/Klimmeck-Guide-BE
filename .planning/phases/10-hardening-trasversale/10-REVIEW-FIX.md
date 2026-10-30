---
phase: 10-hardening-trasversale
fixed: 2026-10-30T15:40:30Z
source: 10-REVIEW.md
review_path: .planning/phases/10-hardening-trasversale/10-REVIEW.md
iteration: 1
fix_scope: all
findings_total: 20
findings_in_scope: 20
fixed_count: 15
skipped_count: 0
not_needed_count: 5
status: all_fixed
---

# Phase 10: report dei fix della code review

**Data dei fix:** 2026-10-30T15:40:30Z
**Review di partenza:** `.planning/phases/10-hardening-trasversale/10-REVIEW.md` (gruppi A/B/C)
**Iterazione:** 1
**Branch:** `feat/10-hardening` (nessun push). Commit di partenza `56bc7f6`, HEAD finale `de1cbac`.

**Riepilogo:**
- Finding nella review: 20 (0 critici, 5 warning, 15 info), tutti in scope secondo i ruling dell'orchestratore
- Fixed: 15. Tre sono parziali per ruling: A-IN-05, B-IN-05 e A-IN-04 (la parte (c) non è stata applicata)
- Not needed: 5 (A-IN-02, B-IN-02, B-IN-04, B-IN-06, C-IN-03)
- Skipped: 0

Ogni fix che cambia il comportamento segue Red → Green: prima un commit `test(<scope>): …` che fallisce, poi il commit `fix(<scope>): …`. A-IN-05 e B-IN-05 sono refactor che non cambiano il comportamento e restano coperti dalle spec esistenti. B-IN-07, C-IN-01 e C-IN-02 sono commit di soli test. Ho committato con `git` e path espliciti: nessun trailer, nessuna riscrittura della storia, ogni subject entro 72 caratteri (il più lungo ne ha 69).

## Precisazioni di prodotto da elencare all'utente

- **A-WR-02 (precisa D-14).** Se Sightengine risponde `success` senza nessuna delle sezioni che la policy valuta (`nudity`, `offensive`, `gore`, `self-harm`, `faces`, `text`, `qr`), la risposta è 503 `IMAGE_MODERATION_UNAVAILABLE` e l'upload non parte. Se manca solo qualche sezione vale ancora «nessuna rilevazione» (Pitfall 13).
- **B-WR-02 (precisa D-17a).** Quando la storia del change stream va persa (codice 286), la coda del GM viene ricalcolata per intero: `pendingRequestsUpdated` viene ripubblicato da `PendingRequestsPublisher` e da `ArchivedCharacterQueueRefresher`. Gli altri publisher (`CharacterUpdatesPublisher`, `UserUpdatesPublisher`, `PendingQuestStartPublisher`, `QuestsPublisher`, `QuestResultsPublisher`) non hanno una ripubblicazione completa economica e si limitano al WARN: i client restano allo stato precedente fino all'evento successivo.
- **C-WR-01 (applica C4/D-04).** `CreateCharacterInput` ha ora dei tetti di forma: `name` 200, `background` 4000, `imagePath` 2048. Sotto il tetto decide il dominio con i suoi codici (un nome di 21..200 caratteri riceve ancora `CHARACTER_NAME_INVALID`). Oltre il tetto la pipe risponde `BAD_USER_INPUT` sul campo. Due conseguenze: un `background` oltre 4000 unità o un `imagePath` oltre 2048 caratteri ricevono adesso il messaggio della pipe (`Input non valido: <campo>`) invece di quello del dominio, con lo stesso codice `BAD_USER_INPUT`; un `imagePath` lungo con spazi in testa o in coda viene rifiutato prima del `trim` del dominio. `BACKEND-NOTES.md` non l'ho toccato: lo aggiorna l'orchestratore.

## Warning

### A-WR-01: il filtro globale maschera come 500 gli errori 4xx del body parser
**Ruling:** fix. **Commit:** `5aaa132` (test) → `75fdb9d` (fix) + `9035a30` (fix del tipo per `tsc`).
**Cosa è cambiato:** in `src/http/unhandled-exception.filter.ts`, un errore che non è `HttpException` ma ha uno `statusCode`/`status` numerico tra 400 e 499 passa a `super.catch` come `HttpException` con quello status e il corpo `{ statusCode, message }`, sia in produzione sia fuori. Non viene scritto il log «Errore interno» e non compare lo stack nella risposta. Lo convertiamo in `HttpException` perché il filtro base legge solo `statusCode` e con un errore grezzo scriverebbe comunque una riga ERROR. Solo gli errori senza status HTTP (o con un 5xx) vengono ancora mascherati come 500.
**Test:** `unhandled-exception.filter.spec.ts` «answers a body parser 4xx with its own status and no internal error log in production (D-07)» e «still masks an error carrying a 5xx status in production (D-07)»; `http-hardening.int-spec.ts` «answers an oversized JSON body with 413 instead of a masked 500 in production (D-07)» (200 KB su `/api/graphql`).
**Nota:** il primo commit di fix non passava `tsc --noEmit`, perché `ts-jest` si limita a transpilare. L'ho corretto subito con `9035a30`, senza riscrivere la storia.

### A-WR-02: una risposta Sightengine `success` senza modelli veniva approvata
**Ruling:** fix circoscritto. **Commit:** `193b3e4` → `b45a06a`.
**Cosa è cambiato:** `MODEL_SECTIONS` e `hasAnyModelSection` in `sightengine-image.moderator.ts`. Se nessuna sezione è presente, `verdictOf` lancia `this.unavailable('risposta senza modelli')`. `image-policy.ts` e la sua spec sono invariati.
**Test:** «fails closed on a success response without any model section (D-14)» (corpo di soli `status` e `request`) e «still approves a success response that lacks only some model sections (Pitfall 13)».

### B-WR-01: `open()` nel timer di riapertura senza try/catch
**Ruling:** fix. **Commit:** `9932cd6` → `dd71df1`.
**Cosa è cambiato:** `openOrRetry()` avvolge `open()` sia in `onModuleInit` sia nel timer. Un `watch` che lancia in modo sincrono diventa il passo successivo del backoff (`scheduleReopen(error)`) e non un'eccezione non catturata.
**Test:** `change-stream-publisher.spec.ts` «retries with backoff when reopening throws synchronously (D-17a)» (riapertura dopo 2 s, ERROR n. 2) e «retries with backoff when the first open throws synchronously (D-17a)».

### B-WR-02: storia del change stream persa senza risincronizzazione
**Ruling:** fix minimo. **Commit:** `b3e52a9` → `cbf5677`.
**Cosa è cambiato:** nella base c'è ora un hook `protected onHistoryLost(): void {}`, chiamato da `forgetHistory()` dopo il WARN. L'override esiste solo in `PendingRequestsPublisher` (chiama `requestRefresh()`) e in `ArchivedCharacterQueueRefresher` (chiama `queue.requestRefresh()`).
**Test:** base «lets the subclass resynchronise once when the history is lost (D-17a)» e «does not ask for a resynchronisation on a resumable error (D-17a)»; refresher «asks the queue to refresh when the change stream history is lost (D-17a)»; publisher della coda «republishes the whole queue when the change stream history is lost (D-17a)».

### C-WR-01: `CreateCharacterInput` senza `@MaxLength`
**Ruling:** fix. **Commit:** `42550ba` → `22c9ef0`.
**Cosa è cambiato:** `create-character-request.model.ts` esporta `NAME_MAX_FORM_LENGTH = 200`, `BACKGROUND_MAX_FORM_LENGTH = 4000` e `IMAGE_PATH_MAX_FORM_LENGTH = 2048` e li applica con `@MaxLength`. Il file passava già `prettier --check`, quindi non è servito un commit `style`. I limiti di dominio restano nel validatore. Lo SDL non cambia.
**Test:** `input-rules.spec.ts` «caps the creation strings with generous shape limits above the domain ones (C4)»; `character-creation.resolver.int-spec.ts` «keeps CHARACTER_NAME_INVALID up to the form cap and answers BAD_USER_INPUT beyond it (C4)» (21 e 200 caratteri → codice di dominio, 201 → `Input non valido: name`). Nel commit di fix ho corretto l'ordine atteso dei campi (`name`, `background`, `imagePath`, cioè l'ordine di dichiarazione). Non è servito toccare `input-decorators.spec.ts`.

## Info

### A-IN-01: `NODE_ENV` senza `trim()` nel fail-closed della moderazione
**Ruling:** fix. **Commit:** `b3e989e` → `1e5dd78`. `disabledModerationConfig` ora confronta `(env.NODE_ENV ?? '').trim()`. **Test:** «refuses to boot without the Sightengine keys when NODE_ENV has surrounding whitespace (D-14)».

### A-IN-02: `THROTTLE_TRUST_PROXY` validata in modo lasco
**Ruling:** not_needed. Un valore che Express rifiuta fa comunque fallire il bootstrap: il comportamento fail-fast è equivalente. Replicare in `parseTrustProxy` le forme accettate da `proxy-addr` significherebbe duplicare la libreria.

### A-IN-03: nessun avviso in produzione con trust proxy spento
**Ruling:** fix. **Commit:** `08228eb` → `28f5344`. `TrustProxyConfigurer` inietta `RUNTIME_CONFIG`. In produzione con `trustProxy === null` scrive un solo WARN fisso, «Trust proxy spento in produzione: dietro un reverse proxy il throttling vede un solo indirizzo», senza valori. C19 resta: spento di default. **Test:** «warns once without values when trust proxy is off in production (C19)» e «stays silent in production when trust proxy is set (C19)»; il caso fuori produzione verifica anche l'assenza del WARN.

### A-IN-04: diagnostica degli errori Cloudinary
**Ruling:** prima verificare. **Verifica:** il problema è reale. In `node_modules/cloudinary/lib/uploader.js` e `api_client/execute_request.js` l'SDK 1.41.3 rigetta con oggetti semplici (`{ message, http_code }`, oppure `{ error: { http_code } }` per le API), quindi `describeError` registrava solo `UnknownError`. La spec RED lo conferma.
**Commit:** `f9bb5d6` → `12b10f6`.
**Cosa è cambiato:** `providerErrorOf` in `cloudinary.service.ts` trasforma il rigetto in un `Error` con nome `CloudinaryError`, `code` = `http_code` e il messaggio fisso «Errore del provider Cloudinary». Il payload non finisce mai nel log. Lo uso nell'upload e nei tre listing. Ho tolto anche gli `any` espliciti dei callback di listing (modifica piccola).
**Non applicato:** l'argomento `{}` di `new ImageSignatureValidator({})` resta, perché è richiesto dal costruttore di `FileValidator`: toglierlo vorrebbe dire aggiungere un costruttore. Anche il doppio limite multer/`MaxFileSizeValidator`, `paginatedUrls` e `PORTRAIT_FOLDER` sono fuori dal fix circoscritto.
**Test:** nuovo `cloudinary.service.spec.ts`, con «turns a plain upload rejection into an Error with only the provider name and http code (D-07)» e «reads the http code of a wrapped listing rejection (D-07)».

### A-IN-05: nomi e tipi in authz/GraphQL
**Ruling:** fix parziale. **Commit:** `9b1674d` (refactor). `GraphQLRequestContext.req` passa da `any` a `RequestWithId | IncomingMessage | undefined`, e compila senza cast nuovi. **Not_needed per la parte del nome:** il decoratore `AuditTarget` mantiene il nome, perché lo citano i grep di accettazione del piano 10-23 e le righe di VALIDATION.

### B-IN-01: il backoff si azzera solo su un `change`
**Ruling:** fix. **Commit:** `a01506c` → `28d5482`. `attempt` torna a 0 anche al primo `resumeTokenChanged` dello stream corrente, che prova che il cursore è vivo. Non lo azzero alla semplice apertura: uno stream che fallisce subito in modo asincrono annullerebbe il backoff esponenziale. **Test:** «resets the backoff once a reopened stream proves alive without changes (D-17a)».

### B-IN-02: backfill di boot non atteso allo stop
**Ruling:** not_needed. Il backfill di boot parte senza attesa per decisione (D-17b). Attenderlo in `onModuleDestroy` ritarderebbe lo stop, e il rumore di teardown resta solo nei log (il backfill è idempotente).

### B-IN-03: `republishHolders` non controlla lo stop
**Ruling:** fix. **Commit:** `3c3014a` → `9c5f423`. Il controllo su `stopping` avviene prima della `find` e prima di ogni `requestPublish`. **Test:** «does not republish holders read while the application was closing (D-17a)» e «does not read the holders once the application is closing (D-17a)».

### B-IN-04: duplicazione boss/soccorso, funzioni lunghe
**Ruling:** not_needed. È un refactor fuori scope (D-17c ha già spezzato `commitRescue`). Backlog v1.1: estrarre `fightGroup` e `logRosterNotes` con una caratterizzazione preventiva.

### B-IN-05: sbavature del modulo di migrazione
**Ruling:** fix parziale. **Commit:** `85df563` (refactor).
**Cosa è cambiato:** `MixedRefPath` diventa un'unione discriminata in cui una voce `subdocArray` deve avere `key`, quindi i fallback `key ?? ''` spariscono (in `mixed-ref-pipelines.ts` e nella int-spec). Il nuovo `mixedRefPath(ref)`, esportato da `mixed-ref-paths.ts`, è condiviso da `mixedRefLabel` e dal report della migrazione: il `pathOf` duplicato è stato rimosso. `MIXED_REF_PATHS` resta a 34 voci.
**Not_needed:** l'alias `residualFilter` e l'exit code 2 condiviso restano, perché sono documentati nel runbook.
**Test:** spec esistenti di `src/migrations` (unit 43, integration verdi), `tsc` e build del CLI.

### B-IN-06: `MixedRefsVerifier` in `MongoModule`
**Ruling:** not_needed. È la stessa scelta fatta per `SweepIndexVerifier` (10-19/10-26). Backlog: un `MigrationsModule` quando la migrazione verrà rimossa (v1.1).

### B-IN-07: lacune di test del roster
**Ruling:** fix (soli test). **Commit:** `0f26617` + `2502050` (pulizia di un warning lint della spec nuova). Nuovi `src/quests/outcomes/group-roster.spec.ts` (`seatHolderIdsOf`, `incoherentOf`, `fightersOf`) e `src/quests/party/lane-members.spec.ts` (`seatHolderLaneMembersOf` con modelli finti: lettura dell'archiviato senza filtro degli attivi, verificata con `toEqual` sulle chiavi del filtro; registrato senza corsia finisce in `dropped`).

### C-IN-01: `Enemy.locations` senza test sull'enum
**Ruling:** fix (soli test). **Commit:** `125b23a`. Due casi nuovi: «rejects an unknown enemy location» (`locations.0`) e «reads a legacy scalar enemy location as a one-element list (D-17b)». Ho provato a togliere l'`enum` dal modello: il primo caso diventa rosso (modello poi ripristinato).

### C-IN-02: la spec dei decoratori accettava il solo `@IsOptional`
**Ruling:** fix. **Commit:** `de1cbac` (test). `ruleFieldsOf` esclude `ValidationTypes.CONDITIONAL_VALIDATION`, e una classe sentinella con un campo solo `@IsOptional` prova il filtro («does not count a field guarded only by @IsOptional as validated (D-01)»). Nessun campo dei 17 input si reggeva sul solo `@IsOptional`, quindi non è servito aggiungere decoratori.

### C-IN-03: tetti 100 duplicati
**Ruling:** not_needed. `MAX_TRANSACTION_LINES` (righe di transazione) e `MAX_ID_LIST` (liste di id della pipe) hanno significati diversi: oggi coincidono, ma non devono per forza restare uguali.

## Fuori scope (backlog)

- `new Date()` in `AdminAuditLogService.record`: il file esisteva già su `develop` e non è nel diff della fase. Va portato al `Clock` iniettato in un lavoro separato.

## Gate finale

| Controllo | Esito |
|-----------|-------|
| `npm run build` | 0 (`dist/migrations/run-mixed-refs.js` presente) |
| `npx tsc --noEmit -p tsconfig.json` | 0 |
| `npm run test:unit` | 182 suite / 2419 test, tutti verdi |
| `npm run test:cov` | 281 suite / 3696 test, exit 0, 8 soglie per cartella rispettate; totale S 96.62 / B 85.25 / F 91.62 / L 97.17 (391 s) |
| Boot reale `test/app.int-spec.ts` | 65/65 |
| `git diff --exit-code src/schema.gql` | 0 |
| Righe rimosse dallo SDL contro `origin/develop` | 0 (unica aggiunta resta `+  pendingQuest: ID`) |
| Prettier `--check` sui file `.ts` toccati | pulito |
| ESLint sui file `.ts` toccati | 0 errori, 22 warning tutti preesistenti in `cloudinary.service.ts` (erano 23) |
| Invarianti sul diff (`enableCors`, `FileTypeValidator`, `introspection: true`, `ParseObjectIdPipe`, `IsObjectIdPipe`, `@IsMongoId(`, `removeOnFail: false`, `process.env`, `Placeholder`, `not.toContain`, `new Date()`, `Types.Mixed`, operatori Mongo in commenti/titoli) | 0 occorrenze aggiunte |
| Trailer (`co-authored-by` / `generated with`) su `56bc7f6..HEAD` | 0 |
| `pgrep -fl jest \| grep Klimmeck` | vuoto |

**Corse di `test:cov`.** Il primo `npm run test:cov` (942 s, macchina carica) ha avuto un solo fallimento: un timeout di 5 s in `test/harness/replset.int-spec.ts` › «emits an insert change event carrying the inserted document». È una spec dell'harness grezzo, non toccata dai fix e che non usa i publisher. Da sola è passata 3/3, e il secondo `test:cov` è stato tutto verde. Le due corse complete sono girate in background perché superano il limite di 600 s del foreground. Il test instabile già noto del boot reale (`global auth guard`) non si è presentato.

---

_Data dei fix: 2026-10-30T15:40:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iterazione: 1_
