---
phase: 26-eliminazione-account-e-consenso
plan: 06
subsystem: users, account
tags: [account-deletion, transaction, inventory, erasure]
requires: ["26-01", "26-03", "26-05"]
provides:
  - "src/account/deletion/account-deletion-error-code.enum.ts: AccountDeletionErrorCode (INNKEEPER_ACCOUNT_PROTECTED, ACCOUNT_NOT_FOUND, TWITCH_USER_NOT_FOUND, TWITCH_UNAVAILABLE)"
  - "src/account/deletion/account-deletion.exception.ts: AccountDeletionException (HttpException, code + extensions.code) con innkeeperProtected() 403, accountNotFound() 404, twitchUserNotFound() 404, twitchUnavailable() 503"
  - "src/account/deletion/account-erasure.plan.ts: erasedCharacterIdsOf, laneRequestIdsOf, missionDraftCleanupOf, EMPTY_MISSION_DRAFT_FILTER, concludedQuestCleanupOf, rescuedCountKeeperOf"
  - "src/account/deletion/account-eraser.ts: AccountEraser.eraseWithin(session, userId, now) → ErasureReport { userId, twitchId, released, revokedSessionIds, pushTokens } | null"
  - "src/account/deletion/account-deletion.module.ts: AccountDeletionModule (forFeature dei nove modelli; imports CharacterArchiveModule, AuthModule; exports AccountEraser), fuori da AppModule"
affects: [26-07, 26-08, 26-10, 26-11, 26-12]
tech-stack:
  added: []
  patterns:
    - "cancellazione dentro la transazione del chiamante, nessuna transazione annidata; utente assente = null senza scritture"
    - "update sulle forme dell'id (ObjectId e stringa) col driver nativo: il cast di Mongoose collassa la forma stringa"
    - "inventario d'integrazione su ogni collection con listCollections ed EJSON relaxed, eccezioni enumerate"
key-files:
  created:
    - src/account/deletion/account-deletion-error-code.enum.ts
    - src/account/deletion/account-deletion.exception.ts
    - src/account/deletion/account-deletion.exception.spec.ts
    - src/account/deletion/account-erasure.plan.ts
    - src/account/deletion/account-erasure.plan.spec.ts
    - src/account/deletion/account-eraser.ts
    - src/account/deletion/account-deletion.module.ts
    - src/account/deletion/account-eraser.int-spec.ts
  modified: []
decisions:
  - "Pulizia delle quest e aid concluse e sostituzione degli id nei conteggi altrui col driver nativo (questModel.collection / questResultModel.collection): con il modello il cast di Mongoose trasforma la forma stringa di idForms in ObjectId e la registrazione legacy restava (RED osservato)"
  - "Bozze: il filtro cerca l'id nelle quattro sezioni (con un `$or`) e le bozze toccate si leggono prima per id; la cancellazione delle vuote è limitata a quelle toccate (EMPTY_MISSION_DRAFT_FILTER più _id), mai su tutta la collection"
  - "Esiti: si cancellano quelli con user = utente OPPURE character fra i suoi personaggi; i conteggi altrui ricevono un id anonimo nuovo per cancellazione al posto di ogni personaggio cancellato"
  - "Ordine fisso del piano; lo stato di eraseWithin è tutto locale al callback, quindi un WriteConflict ritentato riparte da zero (Pitfall 11) e il perdente concorrente rilegge l'utente assente e risponde null"
metrics:
  duration: "35 min"
  completed: 2026-11-25
  tasks: 3
  files: 8
---

# Phase 26 Plan 06: cuore della cancellazione dell'account — Summary

`AccountEraser.eraseWithin` cancella l'account dentro la transazione del chiamante: ruolo letto dal DB (oste → `INNKEEPER_ACCOUNT_PROTECTED`), personaggi = `{ user }` unito a `currentCharacter`, archivio del corrente con `archiveWithinReporting`, pulizia delle quest e aid concluse, `PendingQuest` di tutte le corsie, bozze guidate, esiti, conteggi altrui anonimizzati, personaggi, sessioni revocate con la facciata del piano 03, ticket, device (token letti prima), verifiche d'accesso e utente; un inventario su ogni collection prova che non resta nulla (D-04, D-14, D-16, D-18, D-24).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 8c060b10 | test(users): expect the account deletion codes and pure rules |
| 1 GREEN | 24cdfe07 | feat(users): describe the account deletion codes and pure rules |
| 2 RED | e2c6973d | test(users): expect the account erasure to leave nothing behind |
| 2 GREEN | a76b7e7f | feat(users): erase an account and everything tied to it |
| 3 | (questo commit) | docs(phase-26): record plan 06 progress |

## Fallimenti RED

- Task 1: entrambe le spec rosse con `Could not locate module src/account/deletion/account-deletion-error-code.enum` / `…/account-erasure.plan` (moduli inesistenti, atteso).
- Task 2: `account-eraser.int-spec.ts` rosso con `Could not locate module src/account/deletion/account-deletion.module` (nessun modulo minimo creato, atteso).
- Primo giro GREEN: rossi `leaves nothing tied to the deleted account…` (residuo `quests:<id>`) e `cleans the concluded quests and aids (D-14)`: la registrazione legacy di C1 in forma stringa sulla boss conclusa restava, perché `updateMany` del modello casta le forme di `idForms` a ObjectId. Corretto col driver nativo (vedi decisioni).

## Inventario

- Collection scorse da `listCollections` (il caso pretende almeno queste): `users`, `characters`, `quests`, `pendingquests`, `questresults`, `missiondrafts`, `sessions`, `login_tickets`, `push_devices`, `channel_access_checks`, `admin_audit_logs`, `eventsub_messages`; in più ogni collection creata dagli indici dei modelli dell'harness (per esempio `streamer_credentials` di `AuthModule`), anch'esse controllate.
- Aghi: esadecimale di U, C1, C2 e il Twitch ID, cercati nella serializzazione EJSON relaxed di ogni documento.
- Eccezioni ammesse: `admin_audit_logs`, `eventsub_messages` e le sessioni di U se revocate con `accountDeleted` e `expiresAt` ≤ NOW + 900 s (le due sessioni restano e sono controllate).
- L'utente V (utente, personaggio, due `PendingQuest`, sessione, ticket, device, verifica d'accesso) e la quest estranea sono identici prima e dopo (`toEqual`).

## Nomi reali delle corsie

`QuestLane.standard = 'pendingQuest'`, `QuestLane.story = 'activeStoryQuest'`, `QuestLane.worldMission = 'activeWorldMissionQuest'` (campi di `Character.quests`); `laneRequestIdsOf` le scorre con `QUEST_LANES` e `refIdOf` (riferimenti nulli e malformati scartati, doppioni tolti).

## Bozze e conteggi altrui

- Bozze: `$pull` dalle quattro sezioni (`participants`, `prizes`, `backgroundAdditions`, `fights.$[].outcomes`) più `$inc rev` (annulla un completamento guidato in volo, B-01); il nome fotografato esce col partecipante (Pitfall 6). Poi si cancellano le sole bozze toccate rimaste senza partecipanti.
- Conteggi: `rescuedCharacters` degli esiti altrui conserva la lunghezza; ogni forma dell'id di un personaggio cancellato diventa un `new Types.ObjectId()` generato una volta per cancellazione (nessun legame con l'utente).

## Lettori delle registrazioni di una quest conclusa (verificati)

Togliere gli id dalle quest concluse non cambia nulla di visibile, perché nessun lettore conta i posti di una quest conclusa per mostrarli:

- tabellone `src/quests/quest-board.ts` (`boardFilterOf`: `concludedAt: null` in testa, anche per le quest delle corsie);
- `QuestsService.findOne` (`src/quests/quests.service.ts`: `concludedAt: null`);
- accettazione `quest-acceptance.service.ts` `readQuest` (`concludedAt: null`), `quest-acceptance.updates.ts` (filtro con `concludedAt: null`; `classifyUnregistered` risponde not found sulla conclusa);
- risoluzione: `resolution-loader.service.ts` e `rescue-resolution.service.ts` (`stale` sulla conclusa), claim del gruppo in `quest-outcome-plan.ts` (`concludedAt: null`), `quest-resolution.sweeper.ts` via `formingPartiesFilter` (`concludedAt: null`);
- gruppo: `party-timeout.service.ts`, `quest-start.service.ts` (escono su `concludedAt != null`), `aid-timeout.ts` (`concludedAt: null`), `registered-release.ts` (chiamata dall'archivio sulle aid che lui stesso conclude, prima della pulizia);
- coda dell'oste `pending-requests.service.ts:101` legge le registrazioni delle quest riferite da `PendingQuest` esistenti: le richieste GM (story e worldMission) non vengono mai concluse (`gm-completion.service.ts` non scrive `concludedAt`) e le `PendingQuest` dei personaggi cancellati sono già sparite;
- fogli dei risultati in `questresults` (uno per personaggio, nessuna lettura delle registrazioni della quest).

## Verifiche

- Unit: `account-deletion.exception.spec.ts` + `account-erasure.plan.spec.ts` 11/11.
- Integration (`--runInBand`): `account-eraser.int-spec.ts` + `character-archiver.int-spec.ts` + `character-deletion.resolver.int-spec.ts` 69/69 (3 suite); la spec dell'eraser ripetuta 4 volte da sola, sempre 14/14.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sugli otto file.
- Gate: `connection.transaction` 0, `archiveWithinReporting(` 1, `revokeForAccountDeletionWithin(` 1, `concludedQuestCleanupOf(` 1 nell'eraser; `listCollections` 1 nella spec; `AccountDeletionModule` 0 in `app.module.ts`; `git diff 9a084248 --stat -- src/characters/deletion` vuoto; nessun `chance.next(`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] forme legacy dell'id non toccate dal modello**
- **Found during:** Task 2 GREEN
- **Issue:** `concludedQuestCleanupOf` usa `idForms` (ObjectId e stringa), ma `questModel.updateMany` casta il filtro sul path ObjectId: la registrazione salvata come stringa restava nella boss conclusa (inventario rosso).
- **Fix:** le due `updateMany` delle concluse e quella dei conteggi altrui passano da `Model.collection` (driver nativo) con `{ session }`; un piccolo `rawUpdateOf` adatta il tipo dell'update del piano puro ai tipi del driver. Nessun altro punto del codice di produzione usava finora il driver nativo per un update: scelta dichiarata qui.
- **Commit:** a76b7e7f

**2. [Rule 1 - Bug, test] corsa col watcher dei ruoli nel caso dell'oste**
- **Found during:** Task 2 GREEN (rosso intermittente nel giro con le spec dell'archivio)
- **Issue:** il caso dell'oste cambiava il ruolo con un update; `UserRoleChangesPublisher` di `AuthModule` revocava in modo asincrono le sessioni con `roleChanged` fra le due istantanee del database.
- **Fix:** `persistWorld(role)` scrive il ruolo all'inserimento (il watcher ascolta solo gli update del ruolo). Nella stessa spec, dopo il RED, anche due annotazioni di tipo per `tsc` (`sessionIds: string[]`, ritorno di `keptDocumentsOf` annullabile). Tutto nel commit GREEN, verifiche del task rieseguite per intero.
- **Commit:** a76b7e7f

### Altre note

- `ACCOUNT_NOT_FOUND`, `TWITCH_USER_NOT_FOUND`, `TWITCH_UNAVAILABLE` esistono ma non sono ancora lanciati da nessuno (piano 10).
- L'utente cancellato non era ancora collegato a un'eccezione: `eraseWithin` risponde `null`; la traduzione in `UNAUTHENTICATED` / `ACCOUNT_NOT_FOUND` è dei chiamanti (piani 08 e 10).
- `NOW` della int-spec è l'ora reale al secondo (non una data fissa): le sessioni revocate scadono a NOW + 900 s e il monitor TTL di Mongo non deve toglierle durante il caso; la stessa `NOW` va al `FixedClock` e a `eraseWithin`.
- Gli ERROR «Change stream … chiuso (chiusura inattesa)» nel log dei test vengono dai publisher dell'harness alla chiusura/pulizia del database e compaiono identici nelle spec dell'archivio: rumore preesistente.

## Known Stubs

Nessuno. `AccountEraser` non è ancora chiamato da nessuno e `AccountDeletionModule` non è in `AppModule`: collegamento dei piani 08 (mutation propria) e 10 (oste), come dichiarato dal piano.

## Note per i piani successivi

- Piano 07: inserire l'annullamento delle quest cominciate PRIMA di `archiveCurrentOf` dentro `eraseWithin` (ordine D-26), sui `characterIds` già calcolati; il caso d'inventario oggi non semina quest avviate (stato intermedio dichiarato: il segnaposto dell'archivio resta finché il 07 non arriva). Un personaggio archiviato prima della cancellazione che era segnaposto su una quest avviata non è toccato dall'archivio del corrente: il 07 deve coprirlo tramite `characterIds`.
- Piani 08/10: chiamare `eraseWithin` in `connection.transaction`, raccogliere il report fuori dal callback (azzerandolo in testa per i ritentativi) e solo dopo il commit `closeDeletedAccountSessions(userId, report.revokedSessionIds)`; `null` = utente già cancellato.
- Piano 12: `report.released` (aid liberate dall'archivio) e `report.pushTokens` per la disiscrizione dal topic dopo il commit.
- Piano 11: l'outbox dei ritratti va scritto dentro `eraseWithin` prima della cancellazione dei personaggi (servono `infos.imagePath`, oggi non letto).
- `AccountDeletionModule` importa `AuthModule`: con l'harness `createAuthTestApp` è già presente, nessun doppione di `WsSessionRegistry`.

## Self-Check: PASSED

File creati presenti; commit 8c060b10, 24cdfe07, e2c6973d, a76b7e7f presenti nella storia.
