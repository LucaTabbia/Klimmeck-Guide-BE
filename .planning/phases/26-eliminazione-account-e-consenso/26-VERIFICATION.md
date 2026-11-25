---
phase: 26-eliminazione-account-e-consenso
verified: 2026-11-25T02:19:35Z
status: passed
score: 7/7 criteri di successo verificati (11/11 requisiti, 18/18 decisioni, 9/9 regole dure)
overrides_applied: 0
head: 2e12db6b
phase_base: 9a084248
human_verification_deferred: true
---

# Phase 26: Eliminazione account e consenso — Verification Report

**Phase Goal:** una mutation autenticata cancella definitivamente l'account di chi la chiama (utente, personaggi anche archiviati, sessioni con revoca immediata, device push, ritratto su Cloudinary e tutto ciò che resta legato al Twitch ID), liberando posti in corsie e richieste come fa l'archiviazione; registro dell'oste e backup restano ai loro TTL; il login registra versione e data dell'accettazione dei documenti.
**Verified:** 2026-11-25T02:19:35Z
**Status:** passed
**Re-verification:** No — verifica iniziale
**Ramo / HEAD:** `feat/26-eliminazione-account-e-consenso` @ `2e12db6b`, albero pulito prima e dopo la verifica.

Metodo: lettura del codice (non dei SUMMARY), diff contro `PHASE_BASE=9a084248`, spec mirate rieseguite in foreground. La verifica umana e d'ambiente reale è differita per decisione dell'orchestratore (sezione in fondo) e non concorre allo stato.

## Controlli imposti dal brief

| Controllo | Esito | Evidenza |
| --- | --- | --- |
| `git diff 9a084248..HEAD -- src/schema.gql` = cinque righe aggiunte, nessuna tolta | OK | due hunk, solo `+`: `type DeletedAccount {` / `twitchId: String!` / `}` (più la riga vuota di separazione), `deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!`, `deleteMyAccount: Boolean!`; `src/schema.gql:260-262,582,584`. `git diff --stat`: 6 inserzioni (5 di contenuto + 1 riga vuota), 0 rimozioni |
| Regola dura 3: `git diff --stat 9a084248..HEAD -- src/characters/deletion` vuoto | OK | output vuoto; `character-archiver.int-spec.ts` e `character-deletion.resolver.int-spec.ts` rieseguite verdi senza modifiche |
| Modulo montato in `src/app.module.ts` | OK | import `src/app.module.ts:14`, voce in `imports` `src/app.module.ts:101` |
| Nessun trailer di attribuzione nei 72 commit della fase | OK | `git log 9a084248..HEAD --format=%B \| grep -ciE ...` = 0 |
| Regola dura 9: nessun `chance.next(` toccato | OK | 0 righe nel diff di `src` |
| Stub / TODO nei file non di test toccati | OK | nessun TODO/FIXME/placeholder; unica voce: commento «testo provvisorio» su `src/push/push-events.ts:110` (vedi Note) |

## Goal Achievement — criteri di successo della ROADMAP

| # | Criterio | Stato | Evidenza |
| --- | --- | --- | --- |
| 1 | `deleteMyAccount` cancella in una sola transazione utente, personaggi (anche archiviati, da `Character.user`), richieste, bozze, esiti, ticket, device, verifiche d'accesso; oste rifiutato; rientro da zero; inventario per collection | VERIFIED | resolver `src/account/deletion/account-deletion.resolver.ts:17-20`; una `connection.transaction` in `account-deletion.service.ts:79-92`; passi in `account-eraser.ts:137-194` (ruolo dal DB `:149-151`, personaggi da `user` + `currentCharacter` `:197-208`); inventario generico (dump di ogni collection, aghi = id utente, id personaggi, Twitch ID) `account-eraser.int-spec.ts:523-577`; rientro `:876`, oste `:854`; sul filo `account-deletion.resolver.int-spec.ts:207,231,259,272` |
| 2 | Quest cominciata annullata: rientro al marker della città, rimborsi (cibo, punti, vita per fame), push `questCancelled`, quest sul tabellone; aid del solo ferito come oggi; quest non cominciata libera solo il posto; archivio invariato | VERIFIED | `src/quests/party/started-quest-canceller.ts:113-157` (città `:160-186`, rientro e rimborso `:211-280`, punti `:283-302`, reset `startedQuestResetOf` `:152-155`); predicato `started-quest-cancel.ts:17-27`; eccezione aid `account-eraser.ts:88-98,233`; ordine prima dell'archivio `account-eraser.ts:153-163`; spec `started-quest-canceller.int-spec.ts:266-326,437-580`, `account-eraser.int-spec.ts:1061-1350`; `src/characters/deletion` senza diff |
| 3 | Revoca `accountDeleted`: 15 minuti di `SESSION_REVOKED` + reason, socket 4409, HTTP `UNAUTHENTICATED`; poi `SESSION_EXPIRED` | VERIFIED | enum `session-revoke-reason.enum.ts:9`; revoca in transazione e `$min expiresAt` `session.service.ts:152-187`; socket + registro dopo il commit `session-revocation.service.ts:54-71`; registro `deleted-account.registry.ts:10-41`; guard `auth.guard.ts:60-67`; spec `session.service.int-spec.ts` (5 casi D-18, incluso il ripiego `SESSION_EXPIRED`), `test/auth/session-revocation.int-spec.ts`, `test/auth/http-guard.int-spec.ts` (GraphQL e REST, altri utenti serviti, fine finestra), `account-deletion.resolver.int-spec.ts:343-399` |
| 4 | `deleteAccountByTwitchLogin`: Helix, stessa cancellazione, quattro codici, registro dell'oste senza nome utente | VERIFIED | resolver `account-deletion.resolver.ts:22-33` (`@Roles(innkeeper)`, `@AuditTarget` con `argsOf: () => ({})` e `idOfResult`); servizio `account-deletion.service.ts:52-76` (stesso `erase()` della via propria); codici `account-deletion-error-code.enum.ts:1-6`; directory `src/auth/twitch/http-twitch-user-directory.ts:40-131` (token app dalle credenziali del login `:111-131`); interceptor `admin-audit.interceptor.ts:47-70,87-100`; spec `account-deletion.resolver.int-spec.ts:474-687` |
| 5 | Ritratto, topic FCM, push e pubblicazioni dopo il commit; fallimento registrato e ritentato (ritratto) senza annullare | VERIFIED | `account-deletion.service.ts:90,95-143` (ordine fisso, ogni passo isolato); outbox nella transazione `account-eraser.ts:352-393` → `portrait/portrait-deletion.service.ts:28-42`, flush `:45-75`, sweeper `portrait-deletion.sweeper.ts:28-51`; topic `push.service.ts:139-153`; spec `account-deletion.resolver.int-spec.ts:947-1100`, `portrait-deletion.service.int-spec.ts`, `portrait-deletion.sweeper.spec.ts` |
| 6 | `termsVersion` allo start, firmata nello state; versione e data nell'upsert; senza versione → `?error=terms_not_accepted`; bypass esente | VERIFIED | controller `twitch-auth.controller.ts:28-34`; forma `terms-version.ts:2-6`; start `twitch-login.service.ts:62-64`, callback `:83-90`, upsert `:146-149`; state `oauth-state.service.ts:33-72`; upsert e riaccettazione `users.service.ts:57-91`; campi `user.model.ts:33-38` (solo `@Prop`); spec `twitch-auth.controller.int-spec.ts` (7 casi), `users.service.int-spec.ts` (5 casi), `dev-auth.strategy.int-spec.ts`, `test/auth/login-flow.int-spec.ts` |
| 7 | SDL solo additivo (cinque righe) al boot reale di test; handoff `BACKEND-NOTES.md` | VERIFIED | diff SDL sopra; `test/app.int-spec.ts` («writes the account deletion API into the generated schema») rieseguita verde e `git status` pulito dopo il boot di test (SDL rigenerato identico); `BACKEND-NOTES.md` §0–§7 (541 righe: contratto, codici, esempi, finestra, cosa resta, UAT) |

**Score:** 7/7 criteri verificati

## Requisiti

| Requisito | Stato | Evidenza (codice → test) |
| --- | --- | --- |
| BE-DEL-01 | SATISFIED | `character.model.ts:56-58` (solo `@Prop`, nessun `@Field`), indice `:135-137`; scrittura nella transazione del claim `character-creation.service.ts:69` (`user` dopo lo spread: l'input non può sovrascriverlo); lettura tollerante `account-erasure.plan.ts:20-29` → `character.model.spec.ts`, `character-creation.resolver.int-spec.ts` (owner registrato, mai servito), `account-eraser.int-spec.ts:674,695` |
| BE-DEL-02 | SATISFIED | `pending-quest.model.ts:51-66`; `travel/food/quest-travel-spending.ts:14-60`; scrittori: sweep `travel-food.sweep.ts:190-199`, arrivo `travel-completion.service.ts:192-199`, imboscata vinta `ambush-resolution.service.ts:505-516` → `quest-travel-spending.spec.ts`, `pending-quest.schema.spec.ts`, `travel-food.sweep.int-spec.ts` (4 casi), `travel-completion.int-spec.ts` (2), `ambush-resolution.int-spec.ts` (2) |
| BE-DEL-03 | SATISFIED | vedi criterio 2; testo proprio `push-events.ts:111-115` → `push-events.spec.ts`, `started-quest-cancel.spec.ts`, `started-quest-canceller.int-spec.ts` (16 casi), `account-eraser.int-spec.ts:1061-1350` |
| BE-DEL-04 | SATISFIED | vedi criterio 1; ordine `account-eraser.ts:152-182`; concorrenza `account-eraser.int-spec.ts:895`; inventario `:523-577` (collection ammesse: registro dell'oste, registro EventSub; sessioni solo se revocate `accountDeleted` entro la finestra `:579-586`) |
| BE-DEL-05 | SATISFIED | `account-deletion.resolver.ts:17-20`, `account-deletion.service.ts:42-48` → `account-deletion.resolver.int-spec.ts:207-272`, `test/app.int-spec.ts` (senza bearer), flusso `test/account/account-deletion-flow.int-spec.ts:343` |
| BE-DEL-06 | SATISFIED | vedi criterio 3 |
| BE-DEL-07 | SATISFIED | vedi criterio 4; normalizzazione `twitch-login-name.ts:8-13`; nessun logger nella directory `http-twitch-user-directory.ts:39`; messaggi fissi `twitch-user-directory.ts:4-9`; matrice `test/authz/expected-handlers.ts:3` → `twitch-login-name.spec.ts`, `http-twitch-user-directory.spec.ts`, `admin-audit.interceptor.spec.ts` (3 casi D-25), `account-deletion.resolver.int-spec.ts:593,647` (nome in nessuna collection né nei log catturati), `authorization-matrix.int-spec.ts` |
| BE-DEL-08 | SATISFIED | vedi criterio 5; solo cartella dei ritratti `portrait/portrait-public-id.ts:1-20` (stessa cartella dell'upload, `cloudinary.service.ts:42`); guardia dell'immagine ancora usata `account-eraser.ts:372-387`; outbox senza legame all'utente `portrait-deletion.model.ts:5-15` → `portrait-public-id.spec.ts`, `cloudinary.service.spec.ts`, `account-eraser.int-spec.ts:604-659`, `account-deletion.resolver.int-spec.ts:947-1100` |
| BE-DEL-09 | SATISFIED | diff SDL; `test/app.int-spec.ts`; `BACKEND-NOTES.md` |
| BE-CONSENT-01 | SATISFIED | vedi criterio 6; nessun endpoint della versione corrente nel diff |
| BE-CONSENT-02 | SATISFIED | `users.service.ts:57-91` (`$setOnInsert` nell'upsert; riscrittura solo con `acceptedTermsVersion: { $ne }`); bypass via `upsertWithRole`, non toccato → `users.service.int-spec.ts`, `twitch-auth.controller.int-spec.ts` («keeps the acceptance date when the same version logs in again»), `dev-auth.strategy.int-spec.ts`, `login-flow.int-spec.ts` (refresh di un utente senza consenso) |

Requisiti orfani: nessuno (gli undici ID della fase in `REQUIREMENTS.md:250-260` coincidono con quelli dei piani).

## Decisioni del CONTEXT

| Decisione | Stato | Evidenza |
| --- | --- | --- |
| D-04 rientro da zero, nessuna traccia del Twitch ID | VERIFIED | `account-eraser.ts:179-182`; outbox senza utente; registro in memoria con id utente (`deleted-account.registry.ts:8`); test `account-eraser.int-spec.ts:876`, flusso `account-deletion-flow.int-spec.ts:343` |
| D-09 versione e data (orologio del BE) | VERIFIED | `twitch-login.service.ts:148`, `users.service.ts:70-71,80-85` |
| D-11 nessun migratore | VERIFIED | nessun file di migrazione o contenuto nel diff; letture tolleranti provate (`users.service.int-spec.ts` D-11, `account-eraser.int-spec.ts:695`) |
| D-12 solo validazione di forma, nessun endpoint | VERIFIED | `terms-version.ts:2-6` |
| D-13 quest cominciata annullata (ruling dell'utente) | VERIFIED | criterio 2: rientro gratuito alla città della quest, push, rimborso di cibo, `pointsSpent` e vita per fame, quest sul tabellone, eccezione aid, quest non cominciata = solo posto libero (`account-eraser.int-spec.ts:1317`), nessun segnaposto né `QuestRegistration.vacant` nel diff |
| D-14 resto come l'archivio | VERIFIED | `account-eraser.ts:247-349`; test `:712-795,1350` |
| D-15 via dell'oste per nome utente, quattro errori | VERIFIED | criterio 4 |
| D-16 oste protetto su entrambe le vie | VERIFIED | `account-eraser.ts:149-151` (unico punto, ruolo dal DB); test `account-deletion.resolver.int-spec.ts:231,548`, `account-eraser.int-spec.ts:854` (nulla scritto) |
| D-17 nessun personaggio richiesto | VERIFIED | `account-eraser.ts:216,253-254`; test `account-deletion.resolver.int-spec.ts:219` |
| D-18 revoca con finestra e registro | VERIFIED | criterio 3 |
| D-19 `termsVersion` sullo start, state firmato, bypass esente | VERIFIED | criterio 6 |
| D-20 nomi e codici delle mutation, token app dal login | VERIFIED | SDL; `http-twitch-user-directory.ts:111-131`; `twitch-app-token.cache.ts` parametrico, EventSub invariato (`eventsub.module.ts:37`) |
| D-24 `Character.user` interno | VERIFIED | BE-DEL-01 |
| D-25 topic FCM dopo il commit, registro oscurato | VERIFIED | `account-deletion.service.ts:127`, `push.service.ts:139-153`; `account-deletion.resolver.ts:24-27` |
| D-26 predicato, ordine, città, annotazione delle spese, eventi | VERIFIED | `started-quest-cancel.ts:17-34`, `account-eraser.ts:153-163`, BE-DEL-02; `characterUpdated`/`questUpdated` sul filo `account-deletion.resolver.int-spec.ts:1041` |
| N6 device cancellati lato server nella transazione | VERIFIED | `account-eraser.ts:396-407`; test `:836` |
| D-03/D-06 l'app distingue «account eliminato» | VERIFIED | `extensions.reason = accountDeleted` sul refresh e close 4409 con la stessa reason (test sul filo) |
| D-21..D-23 | n/a | solo FE (numerazione condivisa col CONTEXT della FE Phase 25) |

## Regole dure (26-REPO-RULES)

| # | Regola | Stato | Evidenza |
| --- | --- | --- | --- |
| 1 | Una sola cancellazione | OK | entrambe le vie passano da `AccountDeletionService.erase` → `AccountEraser.eraseWithin` (`account-deletion.service.ts:45,62,79`) |
| 2 | Annullamento prima dei rilasci | OK | `account-eraser.ts:153-163` |
| 3 | Archivio invariato | OK | diff vuoto, spec verdi |
| 4 | Niente resta | OK | inventario per collection |
| 5 | Dopo il commit, mai dentro | OK | `account-deletion.service.ts:90`; nessuna chiamata a push/Cloudinary/registry dentro `eraseWithin` |
| 6 | Registro dell'oste senza nome utente | OK | interceptor + test `:593,647` |
| 7 | Nessuna traccia per il rientro | OK | D-04 |
| 8 | Consenso obbligatorio dal callback | OK | `$setOnInsert`, test D-11 |
| 9 | Nessun tiro nuovo | OK | 0 occorrenze |

## Key links

| Da | A | Via | Stato |
| --- | --- | --- | --- |
| `AppModule` | `AccountDeletionModule` | `imports` (`app.module.ts:101`) | WIRED |
| `AccountDeletionModule` | `StartedQuestCancelModule`, `CharacterArchiveModule`, `AuthModule`, `PushModule` | `account-deletion.module.ts:73-76` | WIRED |
| `AuthModule` | `SessionRevocationService` esportato, `DeletedAccountRegistry` fornito | `auth.module.ts` (diff) | WIRED |
| `AuthGuard` | `DeletedAccountRegistry` | `auth.guard.ts:22,64` | WIRED |
| `PortraitStore` | `CloudinaryService.destroyPortrait` | `account-deletion.module.ts:50-56`, `cloudinary.service.ts:53-57` | WIRED |
| `TwitchUserDirectory` | `HttpTwitchUserDirectory` | `account-deletion.module.ts:83` | WIRED |
| `TravelFoodSweep` / arrivo / imboscata | `PendingQuest` | `travel-planning.module.ts` (modello registrato), tre chiamate | WIRED |
| Resolver della via dell'oste | matrice di autorizzazione | `test/authz/expected-handlers.ts:3` | WIRED |

## Behavioral spot-checks (rieseguiti in questa verifica, foreground)

| Comportamento | Comando | Risultato | Stato |
| --- | --- | --- | --- |
| Unit della fase | `npx jest src/account src/auth/session/deleted-account.registry.spec.ts src/auth/guards/auth.guard.spec.ts src/auth/twitch src/authz/audit src/quests/party/started-quest-cancel.spec.ts src/travel/food/quest-travel-spending.spec.ts src/models/pending-quest.schema.spec.ts src/models/character/character.model.spec.ts src/push/push.service.spec.ts src/push/push-events.spec.ts src/rest/cloudinary/cloudinary.service.spec.ts src/eventsub/helix --selectProjects unit` | 25 suite, 329 test verdi | PASS |
| Cancellazione, inventario, mutation sul filo, flusso, canceller, outbox | `npx jest src/account/deletion/account-eraser.int-spec.ts src/account/deletion/account-deletion.resolver.int-spec.ts test/account/account-deletion-flow.int-spec.ts src/quests/party/started-quest-canceller.int-spec.ts src/account/deletion/portrait/portrait-deletion.service.int-spec.ts --selectProjects integration --runInBand` | 5 suite, 79 test verdi | PASS |
| SDL al boot di test, matrice, archivio invariato, revoca, guard, consenso, spese del tragitto, proprietario | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts src/characters/deletion test/auth/session-revocation.int-spec.ts test/auth/http-guard.int-spec.ts src/auth/session/session.service.int-spec.ts src/auth/twitch/twitch-auth.controller.int-spec.ts src/users/users.service.int-spec.ts src/auth/dev/dev-auth.strategy.int-spec.ts src/travel/food/travel-food.sweep.int-spec.ts src/characters/creation/character-creation.resolver.int-spec.ts --selectProjects integration --runInBand` | 12 suite, 518 test verdi | PASS |

Non rieseguiti (coperti dal gate 26-13, non ripetuti per la policy della verifica): suite unit e integration complete, `tsc --noEmit`, `test:cov`. `pgrep -fl 'bin/jest'` vuoto a fine corsa.

## Anti-pattern e note (nessun blocco)

| File | Riga | Osservazione | Gravità | Impatto |
| --- | --- | --- | --- | --- |
| `src/push/push-events.ts` | 110 | il commento dichiara «testo provvisorio» per il push dell'annullamento | Info | il testo esiste ed è provato; già elencato fra le decisioni vetabili di `BACKEND-NOTES.md` §7. Da confermare dall'utente in UAT |
| `src/users/user-updates.publisher.ts` (non toccato) | 47-51 | a ogni cancellazione di un account con personaggio corrente il publisher di oggi rilegge un utente appena cancellato e scrive un log di livello ERROR («Pubblicazione di userUpdated fallita: ResourceNotFoundException, code NOT_FOUND»); visto nelle corse di `account-eraser.int-spec.ts` e del flusso | Warning | solo rumore nei log (nessun dato, nessun evento sbagliato); non è scritto fra i punti aperti del handoff. Candidato a un ritocco (ignorare l'utente sparito) o a una riga nei punti aperti |
| `src/account/deletion/account-deletion.service.ts` | 128 | il `flush` dopo il commit prova tutte le righe dell'outbox: con Cloudinary giù la risposta della mutation attende | Info | già dichiarato nei punti aperti del handoff; non contraddice il CONTEXT |
| `src/quests/party/started-quest-canceller.ts` | 117-118 | parametro `_now` inutilizzato con `eslint-disable` | Info | simmetria dichiarata con `archiveWithinReporting` |

Accettati per decisione, non riportati come gap: punto cieco delle registrazioni legacy in stringa nell'archivio del personaggio; registro in memoria perso al riavvio (D-18); nessun migratore (D-11); `termsAcceptedAt` scritto alla creazione e al cambio di versione.

## Verifica umana differita

Per decisione dell'orchestratore questi passi non concorrono allo stato della fase. Sono lavoro dell'orchestratore (boot reale) e della UAT su device della FE Phase 25 (piano 25-08).

### A. Boot reale dal ramo (orchestratore)

1. **Indici.** Riavviare il BE da `feat/26-eliminazione-account-e-consenso`. Atteso: `characters.character_user` (`{ user: 1 }`), `portrait_deletions.publicId` (unico) e `portrait_deletions.queuedAt` creati senza errori; `portrait_deletions` vuota. Dati: nessuno.
2. **Dati di sviluppo senza `Character.user` (D-24).** Contare i personaggi senza `user` e decidere fuori dal repo: i correnti restano raggiungibili da `User.currentCharacter`; un archiviato senza `user` non verrebbe cancellato con l'account (valorizzare `user` da `questresults.user`/`character` o toglierlo a mano). Dati noti dalla ricerca: 1 archiviato senza proprietario derivabile, 1 attivo senza utente.
3. **Utenti di sviluppo senza consenso (D-11).** Refresh e bypass di un utente senza `acceptedTermsVersion` devono funzionare; al primo login Twitch con la FE nuova ricevono versione e data. Nessuna azione obbligata.
4. **Registrazioni legacy in stringa.** Cercare `quests.registeredAdventurers.character` di tipo stringa: la cancellazione dell'account le gestisce, l'archivio del personaggio no (accettato).
5. **Log di boot.** Lo sweeper dei ritratti parte al boot senza errori (outbox vuota = nessuna riga di log).

### B. Servizi esterni reali (orchestratore, durante la UAT)

6. **Cloudinary.** Account con ritratto caricato dall'app (URL `https://res.cloudinary.com/<cloud>/image/upload/v…/characters_profile/<id>.<ext>`): dopo la cancellazione l'URL risponde 404 e `portrait_deletions` è vuota. Con un secondo personaggio che mostra la stessa immagine, l'immagine resta.
7. **Topic FCM `streamer-live` e permesso IAM.** Il service account deve avere `roles/firebasecloudmessaging.admin`. Dopo la cancellazione di un account con device registrato, un push «streamer in diretta» non arriva a quel telefono; senza il permesso resta solo un WARN `unsubscribe streamer-live failed for N token(s) of a deleted account` e la cancellazione riesce comunque.
8. **Helix con credenziali reali.** Dal pannello dell'oste: nome inesistente → `TWITCH_USER_NOT_FOUND`; nome esistente senza account → `ACCOUNT_NOT_FOUND`; nome dell'oste → `INNKEEPER_ACCOUNT_PROTECTED`; nome di un giocatore → `DeletedAccount.twitchId`. Senza credenziali del login Twitch nell'ambiente ogni chiamata risponde `TWITCH_UNAVAILABLE`. In `admin_audit_logs` la voce ha `target.id` = Twitch ID e nessun nome utente.
9. **Monitor TTL di Mongo.** Refresh ~16 minuti dopo una cancellazione dell'oste → `SESSION_EXPIRED` (entro 15 minuti → `SESSION_REVOKED` con `reason: accountDeleted`). Il monitor gira ogni ~60 s: la soglia non è esatta al secondo.

### C. UAT su device (FE Phase 25, piano 25-08; `BACKEND-NOTES.md` §7, un passo per messaggio)

Prerequisiti: BE riavviato dal ramo, build della FE Phase 25 sul device, un secondo telefono o account.

10. Login con la casella spuntata → `users.acceptedTermsVersion` e `users.termsAcceptedAt` valorizzati; secondo login con la stessa versione → data invariata.
11. Login senza versione (build vecchia o URL a mano) → `?error=terms_not_accepted`, errore inline nell'app.
12. «Elimina account» da un telefono con l'altro aperto sullo stesso account → avviso «account eliminato» su entrambi (4409 / refresh `accountDeleted`).
13. Rientro dello stesso Twitch → utente nuovo, 0 punti, creazione personaggio.
14. Quest boss cominciata (gruppo pieno, tutti sul luogo) e un compagno cancella l'account → gli altri in città, push col testo dell'annullamento, cibo, punti e vita restituiti, quest di nuovo sul tabellone; giudizio dell'utente sul testo provvisorio del push.
15. Aid avviata il cui solo ferito cancella l'account → conclusa come oggi, nessun rientro dei soccorritori.
16. Controllo dei log del BE durante i passi 12–15: nessun errore oltre al rumore noto di `UserUpdatesPublisher` (vedi Note).

Diagnosi a DB: `users`, `characters` (`user`, `status.location`, `status.currentLifePoints`, `quests.pendingQuest`, `assets.ownedItems`), `pendingquests` (`pointsSpent`, `travelFoodSpent`, `travelHungerLifeLost`), `quests` (`startedAt`, `registeredAdventurers`), `sessions` (`revokedAt`, `revokeReason`, `expiresAt`), `push_devices`, `portrait_deletions`, `admin_audit_logs`.

## Gaps Summary

Nessun gap. I sette criteri di successo, gli undici requisiti e le decisioni D-04, D-09, D-11..D-26 e N6 hanno codice sostanziale, collegato e provato da test che lo esercitano; nessuna affermazione dei SUMMARY è risultata senza riscontro nel codice. Restano due osservazioni non bloccanti (log ERROR del publisher degli utenti a ogni cancellazione; testo del push dichiarato provvisorio) e la verifica d'ambiente reale differita.

---

_Verified: 2026-11-25T02:19:35Z_
_Verifier: Claude (gsd-verifier)_
