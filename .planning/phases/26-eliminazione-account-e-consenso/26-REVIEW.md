---
phase: 26-eliminazione-account-e-consenso
reviewed: 2026-11-25T02:22:55Z
depth: deep
diff_base: 9a084248
files_reviewed: 54
files_reviewed_list:
  - src/account/deletion/account-deletion-error-code.enum.ts
  - src/account/deletion/account-deletion.exception.ts
  - src/account/deletion/account-deletion.module.ts
  - src/account/deletion/account-deletion.resolver.ts
  - src/account/deletion/account-deletion.service.ts
  - src/account/deletion/account-eraser.ts
  - src/account/deletion/account-erasure.plan.ts
  - src/account/deletion/deleted-account.model.ts
  - src/account/deletion/portrait/portrait-deletion.model.ts
  - src/account/deletion/portrait/portrait-deletion.service.ts
  - src/account/deletion/portrait/portrait-deletion.sweeper.ts
  - src/account/deletion/portrait/portrait-public-id.ts
  - src/account/deletion/portrait/portrait-store.ts
  - src/app.module.ts
  - src/auth/auth.module.ts
  - src/auth/guards/auth.guard.ts
  - src/auth/session/deleted-account.registry.ts
  - src/auth/session/session-revocation.service.ts
  - src/auth/session/session-revoke-reason.enum.ts
  - src/auth/session/session.service.ts
  - src/auth/twitch/http-twitch-user-directory.ts
  - src/auth/twitch/oauth-state.service.ts
  - src/auth/twitch/terms-version.ts
  - src/auth/twitch/twitch-auth.controller.ts
  - src/auth/twitch/twitch-login-error-code.enum.ts
  - src/auth/twitch/twitch-login-name.ts
  - src/auth/twitch/twitch-login.service.ts
  - src/auth/twitch/twitch-user-directory.ts
  - src/authz/audit/admin-audit.interceptor.ts
  - src/authz/audit/audit-target.decorator.ts
  - src/characters/creation/character-creation.service.ts
  - src/eventsub/eventsub.module.ts
  - src/eventsub/helix/twitch-app-token.cache.ts
  - src/models/character/character.model.ts
  - src/models/pending-quest.model.ts
  - src/models/user.model.ts
  - src/push/push-events.ts
  - src/push/push.service.ts
  - src/quests/party/registered-release.ts
  - src/quests/party/started-quest-cancel.module.ts
  - src/quests/party/started-quest-cancel.ts
  - src/quests/party/started-quest-canceller.ts
  - src/rest/cloudinary/cloudinary.service.ts
  - src/schema.gql
  - src/travel/ambush/ambush-resolution.service.ts
  - src/travel/food/quest-travel-spending.ts
  - src/travel/food/travel-food.sweep.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel-planning.module.ts
  - src/users/users.service.ts
  - test/account/fake-portrait-store.ts
  - test/auth/fake-twitch-user-directory.ts
  - test/authz/expected-handlers.ts
  - test/authz/handler-fixtures.ts
findings:
  critical: 1
  warning: 5
  info: 8
  total: 14
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-11-25T02:22:55Z
**Depth:** deep
**Files Reviewed:** 54 file non-spec del diff `9a084248..HEAD -- src test` (99 file in tutto)
**Status:** issues_found

## Summary

Letti per intero i 54 file non-spec del diff e, fuori dal diff, il codice che chiamano: `src/characters/deletion/character-archiver.ts`, `seat-release.ts`, `src/mongo/document-id.ts`, `owners-of.ts`, `src/economy/wallet.service.ts`, `src/economy/trade/trade-inventory.ts`, `src/quests/party/party-rules.ts`, `quest-start.service.ts`, `src/auth/auth-session.service.ts`, `src/auth/ws/ws-session-registry.ts`, `src/graphql/request-id.plugin.ts`, `production-errors.ts`, `src/travel/food/travel-food-settlement.ts`, `src/characters/creation/create-character-input.validator.ts` e i modelli di `src/models`, `src/quests/guided`, `src/push`, `src/auth`.

Limiti di questa review, da tenere presenti:

- Le 45 spec del diff NON sono state lette per intero: solo i titoli dei casi di `account-eraser.int-spec.ts` e `account-deletion.resolver.int-spec.ts`, il test d'inventario e i casi dei ritratti. Il punto 8 del brief (qualità dei test) è coperto solo per quelle parti (IN-07).
- Nessuna spec è stata eseguita. Ogni finding viene dalla lettura del codice; l'unica verifica eseguita è la valutazione in `node` della regex di `portrait-public-id.ts` su tre URL (CR-01).

Esito per area del brief:

1. **Transazione.** Nessuna scrittura fuori sessione trovata in `AccountEraser` e `StartedQuestCanceller`: ogni `Model.collection.*` e ogni query Mongoose porta `{ session }`. Lo stato del callback riparte da zero a ogni tentativo (`account-deletion.service.ts:83`), l'id anonimo e l'ora sono rigenerati dentro il callback. Due cancellazioni concorrenti confliggono sul documento utente. L'ordine annullamento → archivio → pulizie → cancellazioni regge. Restano due difetti di concorrenza/completezza: WR-03 e WR-04.
2. **Driver nativo.** `{ session }` presente ovunque; gli `$in` vuoti sono protetti da guardie di lunghezza; le voci scritte grezze in `assets.ownedItems` hanno la forma dello schema (`itemType`, `item` ObjectId, `quantity`; sottoschema `_id: false`, `Character` senza timestamps). Nessun difetto di forma trovato. La copertura delle forme stringa è però parziale (WR-04).
3. **Completezza.** Vedi WR-03, WR-04, IN-01.
4. **Rimborsi.** Rimborso e cancellazione della `PendingQuest` sono nello stesso passo guardato; il retry della transazione non raddoppia. Tetto del cibo e della vita corretti. Unico rilievo: WR-05.
5. **Sicurezza.** Un difetto critico sul ritratto (CR-01). Regola dura 6 rispettata nel codice letto: args oscurati prima del record, `TwitchUserLookupError` e `TwitchHelixError` con messaggi fissi (operazione e status), `request-id.plugin` logga solo errori interni senza variabili. State OAuth: `termsVersion` validata allo start e riletta solo dallo state firmato al callback.
6. **Dopo il commit.** Nessun errore risale alla mutation o all'esito del registro (`afterCommitSafely`). Rilievi: WR-01, WR-02.
7. **Regola dura 3.** Confermata: `git diff --stat 9a084248..HEAD -- src/characters/deletion` è vuoto. `registered-release.ts` aggiunge a `notifyQuestCancelled` un parametro con default uguale al valore di prima: i chiamanti esistenti non cambiano comportamento.
8. **Qualità.** Rilievi minori in Info.

## Critical Issues

### CR-01: Un giocatore può far distruggere su Cloudinary il ritratto di un altro giocatore

**File:** `src/account/deletion/portrait/portrait-public-id.ts:5-20`, `src/account/deletion/account-eraser.ts:363-387`

**Issue:** `infos.imagePath` è un URL scelto dal client: `create-character-input.validator.ts:46-52` accetta qualunque URL https. Alla cancellazione dell'account `portraitPublicIdOf` ne ricava il public id e `destroyPortrait` lo distrugge nel cloud dell'app. Due controlli mancano:

1. Il parser accetta **qualunque cloud name** (`^/[A-Za-z0-9_-]+/image/upload/...`): non lo confronta con `CLOUDINARY_CLOUD_NAME`, mentre il destroy colpisce sempre il cloud configurato.
2. La guardia «ancora mostrato da un personaggio che resta» (`account-eraser.ts:372-387`) confronta la **stringa dell'URL**, non il public id. Più URL diversi risolvono allo stesso public id: con o senza `v<cifre>/`, con un'altra estensione, con un altro cloud name. Verificato in `node` sulla regex: `.../realcloud/image/upload/v1731/characters_profile/abc123.jpg`, `.../any-other/image/upload/characters_profile/abc123.png` e `.../realcloud/image/upload/v9/characters_profile/abc123.webp` superano tutti `url.href === imagePath` e danno `characters_profile/abc123`.

**Scenario:** il giocatore A legge l'URL del ritratto del giocatore B (è visibile a chi vede il personaggio). Crea un personaggio con `imagePath = https://res.cloudinary.com/x/image/upload/characters_profile/<id di B>.png`. Chiama `deleteMyAccount`. La guardia non trova nessun altro personaggio con quella stringa esatta, la riga entra in `portrait_deletions` e il flush chiama `destroy('characters_profile/<id di B>', { invalidate: true })`: il ritratto di B sparisce, anche dalla CDN. Basta un account autenticato; rifacendo login (D-04) l'attacco si ripete per ogni ritratto.

**Fix:** confrontare per public id e legare il parser al cloud dell'app.

```ts
// portrait-public-id.ts: il cloud name arriva dalla config, non dalla regex
export function portraitPublicIdOf(imagePath: unknown, cloudName: string): string | null {
    // ...controlli di oggi...
    const match = UPLOADED_PORTRAIT_PATH.exec(url.pathname);
    return match && match[1] === cloudName ? match[2] : null;
}

// account-eraser.ts: sopravvissuti cercati per public id, non per URL
const stillShown = await this.characterModel
    .find(
        {
            _id: { $nin: characterIds },
            'infos.imagePath': {
                $regex: `/(${[...publicIds].map(escapeRegExp).join('|')})\\.[A-Za-z0-9]+$`,
            },
        },
        { 'infos.imagePath': 1 },
    )
    .session(session)
    .lean<CharacterPortrait[]>()
    .exec();
// poi togliere ogni public id che un sopravvissuto mostra in qualunque forma
```

Aggiungere i casi rossi: stesso public id con versione, estensione o cloud diversi mostrato da un personaggio che resta → nessuna riga in coda; URL con cloud name diverso da quello configurato → nessuna riga. Nota: la guardia per public id chiude lo scenario descritto; non dimostra che l'immagine sia stata caricata dall'account cancellato (l'upload non registra chi carica). Un public id altrui non ancora usato da nessun personaggio resta distruggibile: se serve chiuderlo, l'upload deve registrare il proprietario.

## Warnings

### WR-01: La risposta della mutation attende il flush di tutto l'outbox dei ritratti

**File:** `src/account/deletion/account-deletion.service.ts:128`, `src/account/deletion/portrait/portrait-deletion.service.ts:45-61`

**Issue:** `afterCommit` fa `await this.portraits.flush()`, e `flush` legge e prova in serie **ogni** riga di `portrait_deletions`, comprese quelle rimaste da cancellazioni precedenti. Non c'è budget di tempo né single-flight con lo sweeper (che passa da `PortraitDeletionSweeper.sweep`, mentre la mutation chiama `flush` direttamente). È dichiarato fra i punti aperti di `BACKEND-NOTES.md` §7, ma l'effetto sull'utente è concreto.

**Scenario:** Cloudinary non risponde e in coda ci sono N righe. `deleteMyAccount` ha già committato, ma la risposta HTTP arriva dopo N tentativi in serie, ciascuno lungo quanto il timeout dell'SDK. L'app va in timeout e mostra un errore; il nuovo tentativo risponde `UNAUTHENTICATED`. Sulla via dell'oste la voce di registro si scrive solo dopo l'handler (`admin-audit.interceptor.ts:51`): se il processo cade nell'attesa, una cancellazione committata resta senza voce.

**Fix:** togliere il flush dal percorso della richiesta e lasciare allo sweeper la consegna, con una spinta non attesa:

```ts
// account-deletion.service.ts
await this.push.unsubscribeFromStreamerLive(report.pushTokens);
void this.portraitSweeper.sweep(); // single-flight, mai atteso dalla mutation
```

In alternativa, distruggere solo i public id di questo report con un tetto di tempo. Il caso «destroys the uploaded portrait right after the commit» va adattato (attesa dello sweep, non della risposta).

### WR-02: Lo sweeper ritenta per sempre, senza tetto né backoff

**File:** `src/account/deletion/portrait/portrait-deletion.sweeper.ts:28-36`, `src/account/deletion/portrait/portrait-deletion.service.ts:63-87`

**Issue:** `attempts` è incrementato ma mai letto. Una riga che fallisce in modo permanente (credenziali Cloudinary assenti o sbagliate, public id rifiutato) è ritentata a ogni `sweepIntervalMs` (default 60 s) e a ogni boot, e ogni tentativo scrive un WARN. Insieme a WR-01, ogni riga bloccata allunga anche tutte le cancellazioni successive.

**Scenario:** ambiente senza credenziali Cloudinary valide e una riga in coda: una chiamata di rete fallita e un WARN al minuto, senza fine; con dieci righe, dieci al minuto.

**Fix:** usare `attempts` nel filtro e nel ritmo.

```ts
const MAX_PORTRAIT_ATTEMPTS = 10;
// flush: solo le righe ancora ritentabili
.find({ attempts: { $lt: MAX_PORTRAIT_ATTEMPTS } }, { _id: 1, publicId: 1 })
```

Al raggiungimento del tetto un solo ERROR con l'id della riga (mai il public id), e la riga resta per la pulizia a mano. Un backoff (per esempio `nextAttemptAt` raddoppiato a ogni errore) evita la raffica nei primi minuti.

### WR-03: Un login che corre contro la cancellazione lascia una sessione viva dell'utente cancellato

**File:** `src/auth/session/session.service.ts:152-187`, `src/auth/auth-session.service.ts:41-52`

**Issue:** `revokeAllForAccountDeletionWithin` revoca le sessioni lette nello snapshot della transazione. `exchangeLoginTicket` fa `findUserOrNull` e poi `sessionService.create` fuori da ogni transazione: l'inserimento di una sessione nuova non confligge con le scritture della cancellazione, quindi non provoca il retry.

**Scenario:** l'utente ha l'app su due telefoni. Sul primo preme «Elimina account», sul secondo sta completando un login. `findUserOrNull` trova l'utente, la cancellazione committa, `create` inserisce la sessione. Quella sessione non è revocata e non ha la scadenza accorciata: resta a DB con `userId` per tutto il TTL del refresh (regola dura 4 violata, e D-18 prevede sessioni revocate a 15 minuti). Il suo access token è fermato su HTTP dal registro in memoria, ma una connessione WS è accettata (`revokeReasonOf` non trova una revoca) e il socket non riceve 4409; dopo un riavvio del BE anche HTTP passa fino alla scadenza del token. Al primo refresh la sessione viene revocata senza motivo (`auth-session.service.ts:63-65`): l'app riceve `SESSION_REVOKED` senza `accountDeleted`.

**Fix:** dopo il commit, una seconda passata non transazionale chiude ciò che è nato nel frattempo, e i suoi id si uniscono a quelli dei socket da chiudere:

```ts
// afterCommit, prima di closeSessions
const late = await this.revocation.revokeLateSessionsOfDeletedAccount(userId);
// = updateMany({ userId, revokedAt: null }, { $set: { revokedAt, revokeReason: accountDeleted }, $min: { expiresAt } })
```

In più `AuthSessionService.issueForUser` può rileggere l'utente dopo `create` e revocare la sessione appena creata se è sparito. Stessa passata per `login_tickets` (un ticket emesso dopo lo snapshot sopravvive fino al suo TTL; non è riscattabile perché l'utente manca).

### WR-04: I riferimenti in forma stringa sulle quest non avviate e sulle aid aperte sopravvivono alla cancellazione

**File:** `src/account/deletion/account-eraser.ts:211-280`, `src/characters/deletion/character-archiver.ts:195-298`

**Issue:** il driver nativo copre le forme stringa solo per le quest **cominciate** (`cancelStartedQuestsOf`) e **concluse** (`cleanConcludedQuestsOf`). Le quest non avviate e i feriti delle aid aperte passano dall'archivio, che filtra col modello: `find({ 'registeredAdventurers.character': { $in: idForms(...) } })` e `{ 'rescue.characters': characterId }` vengono castati a ObjectId e non vedono la voce stringa. Dopo l'archivio nessun passo dell'eraser ripassa sulle quest non concluse. `BACKEND-NOTES.md` §7 punto 4 dice che «la cancellazione dell'account le gestisce»: vale solo per cominciate e concluse.

**Scenario A:** quest di gruppo non avviata con la registrazione del personaggio corrente salvata come stringa. Dopo `deleteMyAccount` il posto resta occupato dall'id di un personaggio che non esiste più: regola dura 4 violata e posto bloccato finché non scade il gruppo.

**Scenario B:** aid avviata i cui feriti sono salvati come stringa e sono tutti dell'account. `resolvesAsToday` (che usa `sameId`, quindi vede le stringhe) risponde vero e salta l'annullamento; l'archivio non trova il ferito; l'aid resta aperta e avviata con l'id cancellato in `rescue.characters`.

**Fix:** dopo `archiveCurrentOf`, una pulizia nativa sulle quest non concluse, simmetrica a `concludedQuestCleanupOf`:

```ts
// account-erasure.plan.ts
export function openQuestCleanupOf(characterIds: readonly Types.ObjectId[]) {
    const forms = formsOf(characterIds);
    return {
        seats: {
            filter: { concludedAt: null, startedAt: null, 'registeredAdventurers.character': forms },
            update: { $pull: { registeredAdventurers: { character: forms } } },
        },
        wounded: {
            filter: { concludedAt: null, 'rescue.characters': forms },
            update: { $pull: { 'rescue.characters': forms } },
        },
    };
}
```

seguita dalla conclusione delle aid rimaste senza feriti. Il test d'inventario va esteso con una registrazione stringa su una quest non avviata e un ferito stringa su un'aid aperta. Se a DB non esistono dati in forma stringa (compito 4 dell'orchestratore), il difetto non si manifesta: in quel caso basta correggere la frase del handoff.

### WR-05: Il compagno saltato con WARN resta con la corsia bloccata su una quest da cui è stato tolto

**File:** `src/quests/party/started-quest-canceller.ts:225-246`, `:148-155`

**Issue:** quando `sendBack` salta un compagno (in viaggio, o update guardato non riuscito), la sua `PendingQuest` e la sua corsia restano intatte, ma subito dopo `startedQuestResetOf` azzera `registeredAdventurers` e `startedAt`. Il compagno ha quindi `quests.pendingQuest` che punta a una `PendingQuest` con `startDate` già scritto, su una quest in cui non è più registrato. `abandonClaimFilter` (`party-rules.ts:84-94`) richiede `startDate: null`, quindi non può abbandonare; lo sweep del timeout guarda solo i registrati. La corsia standard resta occupata fino a un intervento a mano.

**Scenario:** dato rotto (un membro di una quest avviata con `activeTravel` valorizzato). Un compagno cancella l'account: gli altri rientrano, questo no, e non può più accettare nessuna quest standard né liberarsi da solo. Il WARN lo dichiara «pulizia manuale», ma lo stato è peggiore di prima: prima era almeno registrato sulla quest.

**Fix:** non lasciarlo «intatto»: liberare comunque la corsia senza spostarlo.

```ts
// ramo «in viaggio»: niente rientro, ma PendingQuest cancellata e corsia nulla, coi rimborsi
if (companion.status.activeTravel) return this.freeLaneOnly(companion, pendingQuestId, spending, session);
```

Per il ramo `!spending` (corsia su un'altra missione) restare fuori è corretto: quella corsia appartiene all'altra quest.

## Info

### IN-01: I personaggi archiviati prima della fase non sono cancellati con l'account

**File:** `src/account/deletion/account-eraser.ts:197-208`
**Issue:** gli archiviati si trovano solo da `Character.user`, assente sui documenti di prima della fase. Dichiarato in `BACKEND-NOTES.md` §7 punto 4 e coperto da D-11 (app non pubblicata), ma finché i dati di sviluppo non sono sistemati la regola dura 4 non vale per quegli account.
**Fix:** chiudere il compito 4 dell'orchestratore al boot reale prima della UAT; nessun cambio di codice.

### IN-02: Parametro morto `_now` in `cancelStartedQuestWithin`

**File:** `src/quests/party/started-quest-canceller.ts:113-119`
**Issue:** il parametro non è usato ed è tenuto «per simmetria» con un `eslint-disable`. È codice morto nella firma pubblica (Clean Code del repo).
**Fix:** toglierlo dalla firma e dalla chiamata in `account-eraser.ts:235-240`.

### IN-03: Il nome utente è normalizzato due volte

**File:** `src/account/deletion/account-deletion.service.ts:53`, `src/auth/twitch/http-twitch-user-directory.ts:49`
**Issue:** `normalizedTwitchLoginOf` gira nel servizio e di nuovo nel directory: duplicazione di una regola, con due punti da tenere allineati.
**Fix:** un solo proprietario. O il directory riceve un nome già normalizzato (tipo dedicato), o il servizio passa il grezzo e distingue `null`.

### IN-04: Lo sweeper dei ritratti dipende da `QUEST_CONFIG`; `CloudinaryService` ha una seconda istanza

**File:** `src/account/deletion/portrait/portrait-deletion.sweeper.ts:23`, `src/account/deletion/account-deletion.module.ts:84-86`
**Issue:** l'intervallo dei ritratti è `QUEST_CONFIG.sweepIntervalMs`: spegnere lo sweep delle missioni (`0`) spegne anche il ritentativo dei ritratti. `CloudinaryService` è fornito una seconda volta nel modulo e riesegue `cloudinary.config` globale (stessi valori, innocuo oggi).
**Fix:** una costante propria per l'intervallo; esportare `CloudinaryService` da un modulo senza controller e importarlo.

### IN-05: Due orologi nella stessa transazione

**File:** `src/auth/session/session.service.ts:158`, `src/account/deletion/account-deletion.service.ts:87`
**Issue:** l'eraser passa `now` a ogni passo, ma `revokeAllForAccountDeletionWithin` rilegge `this.clock.now()`: `revokedAt` e `expiresAt` non coincidono con l'ora degli altri passi. Nessun effetto funzionale.
**Fix:** passare `now` alla revoca come agli altri passi.

### IN-06: Ruolo letto dal JWT per un'azione irreversibile, senza limite di frequenza

**File:** `src/account/deletion/account-deletion.resolver.ts:22-33`, `src/authz/roles/roles.guard.ts:22`
**Issue:** `@Roles` confronta `identity.role` del token. Un oste retrocesso conserva per la vita dell'access token (fino a 15 minuti) la possibilità di chiamare `deleteAccountByTwitchLogin`. È il comportamento di tutte le mutation dell'oste, ma qui l'effetto non è reversibile. Le due mutation non sono `@Throttled` (punto aperto dichiarato): ogni chiamata dell'oste costa una richiesta a Helix.
**Fix:** rileggere il ruolo di chi chiama dal DB nel servizio prima della risoluzione (come l'eraser fa per il bersaglio) e aggiungere `@Throttled()` alle due mutation.

### IN-07: Punti ciechi del test d'inventario e casi mancanti (lettura parziale delle spec)

**File:** `src/account/deletion/account-eraser.int-spec.ts:523-577`, `src/account/deletion/portrait/portrait-public-id.spec.ts`
**Issue:** l'inventario cerca gli id nella serializzazione di ogni documento, quindi vede solo ciò che il mondo di prova semina. Dalla lettura di questa review mancano: registrazione stringa su quest non avviata e ferito stringa su aid aperta (WR-04), sessione creata durante la cancellazione (WR-03), archiviato senza `user` (IN-01). Per i ritratti manca ogni caso con lo stesso public id sotto un URL diverso o con un cloud name diverso (CR-01): `UPLOAD_BASE` usa `demo-cloud` e nessun test lega il cloud alla config. Le altre spec del diff non sono state lette: questo elenco non è un giudizio sull'intera suite.
**Fix:** aggiungere i casi insieme alle correzioni di CR-01, WR-03 e WR-04.

### IN-08: Due account che cancellano insieme lo stesso ritratto condiviso

**File:** `src/account/deletion/account-eraser.ts:372-392`, `src/account/deletion/portrait/portrait-deletion.service.ts:33-41`
**Issue:** se due account con lo stesso `imagePath` si cancellano in transazioni concorrenti, ciascuno vede nello snapshot il personaggio dell'altro come sopravvissuto: nessuno accoda il ritratto, che resta orfano su Cloudinary. Con URL diversi per lo stesso public id entrambe accodano e l'upsert sull'indice unico `publicId` può dare chiave duplicata dentro la transazione (errore non transitorio: la cancellazione fallisce e va ripetuta). Caso raro.
**Fix:** con la guardia per public id di CR-01 resta solo l'orfano del primo caso; accettarlo e dichiararlo, oppure far ripassare lo sweeper sui ritratti senza più personaggi.

---

_Reviewed: 2026-11-25T02:22:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
