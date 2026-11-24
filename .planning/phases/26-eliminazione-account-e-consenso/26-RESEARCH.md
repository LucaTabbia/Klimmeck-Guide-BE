# Phase 26: Eliminazione account e consenso - Research

**Ricercato:** 2026-11-24
**Dominio:** NestJS 11 + Mongoose 8 + Apollo code-first — cancellazione definitiva dell'account in una transazione, revoca delle sessioni e dei socket, ritratto su Cloudinary, risoluzione nome Twitch → ID via Helix, consenso al login
**Confidenza:** HIGH sul codice letto (ogni affermazione porta il file); MEDIUM sulle forme raccomandate (scelte di progetto); due fatti esterni verificati su documentazione ufficiale (Helix Get Users, Cloudinary destroy)

<user_constraints>
## User Constraints (from CONTEXT.md)

Fonte: `26-CONTEXT.md` (lato BE) e, autorevole, `Klimmeck-Guide/.planning/phases/25-account-deletion-and-legal-consent/25-CONTEXT.md` (stessa numerazione D-01..D-16). Attese dell'app: `BACKEND-NOTES.md` della cartella FE.

### Locked Decisions

**Portate avanti**
- Cosa si cancella: utente (Twitch ID, saldo punti), tutti i personaggi anche archiviati con ciò che portano, esiti delle quest e ogni documento legato all'utente o ai suoi personaggi, sessioni e ticket di login, device push, ritratto su Cloudinary. Restano ai loro TTL: registro delle azioni dell'oste (90 giorni), registro EventSub (7 giorni), backup (30 giorni).
- La cancellazione è immediata; corsie e richieste si liberano come fa l'archiviazione (`CharacterArchiver`, `seat-release.ts`).
- Cambi non additivi dell'SDL dichiarati nel handoff; migratori one-shot fuori dal repo dopo il boot reale; nessun file di contenuto.

**Cancellazione**
- **D-04 (utente):** lo stesso account Twitch può rifare subito il login e riparte da zero. Nessuna traccia del Twitch ID cancellato, nessuna attesa.
- **D-06/D-03:** alla riuscita tutte le sessioni dell'utente sono revocate subito (anche le subscription WS aperte). L'app deve poter distinguere «account eliminato» dagli altri motivi di revoca; se non è fattibile va detto nel handoff (ripiego: sessione scaduta).
- **D-13 (utente, «Segnaposto anonimo»):** in una quest di gruppo già avviata il posto del personaggio cancellato resta occupato fino alla conclusione, come per l'archiviazione, ma senza più alcun personaggio dietro: niente nome, niente ritratto. La quest si risolve con le regole di oggi. Il segnaposto non può dipendere dal documento del personaggio; la forma della registrazione anonima va dichiarata al FE.
- **D-14 (default tecnico):** tutto il resto segue l'archiviazione: posti non avviati liberati, richieste GM del personaggio cancellate, ferito tolto dalle aid aperte, soccorritori rilasciati, missione guidata in corso che perde quel partecipante. Gli esiti sono uno per personaggio e per utente: quelli altrui non portano il suo nome.
- **Default tecnico:** il ritratto su Cloudinary si cancella con l'account; un fallimento di Cloudinary non deve lasciare l'account mezzo cancellato né il ritratto orfano per sempre.

**Cancellazione da parte dell'oste**
- **D-15 (utente):** mutation riservata all'oste che riceve il **nome utente Twitch**; il BE lo risolve nel Twitch ID ed esegue la stessa identica cancellazione, scritta nel registro delle azioni dell'oste. Errori distinti: nome Twitch inesistente, nessun account per quell'utente, bersaglio oste, Twitch non raggiungibile.
- **D-16 (utente):** la mutation propria rifiuta il ruolo oste con un codice d'errore suo, e l'azione dell'oste rifiuta un bersaglio oste. L'account dell'oste si toglie solo a mano.

**Consenso**
- **D-09 (utente):** sull'utente si registrano la versione accettata dei documenti e la data dell'accettazione (orologio del BE). Il login porta la versione; un login senza versione è rifiutato con un codice d'errore suo.
- **D-12 (default tecnico):** la versione è una stringa che l'app manda; il BE salva ciò che riceve (validazione di forma). Nessun endpoint che serve la versione corrente, nessuna riaccettazione.
- **D-11 (utente, verbatim):** «Non è pubblicata l'app, caso impossibile» — nessuna migrazione nel repo. Gli utenti di sviluppo già a DB sono affare dell'orchestratore al boot reale.
- Da decidere in ricerca: in quale passo del flusso Twitch viaggia la versione e come la porta il bypass di sviluppo (`DEV_AUTH_*`).

### Claude's Discretion
- Nomi di mutation, campi e codici d'errore; struttura dei moduli; transazione e ordine delle cancellazioni; come il motivo di revoca raggiunge l'app.

### Deferred Ideas (OUT OF SCOPE)
- Riaccettazione al cambio dei documenti; attesa prima di una nuova registrazione dello stesso Twitch; esportazione dei dati. Fuori ambito anche: verifica dell'età, modifica dei TTL esistenti.
</user_constraints>

## Summary

La cancellazione si costruisce quasi tutta su pezzi che esistono: `CharacterArchiver.archiveWithinReporting(session, …)` (`src/characters/deletion/character-archiver.ts`) gira già **dentro la transazione del chiamante** e libera posti non avviati, marca il segnaposto sulle quest avviate (`placeholderMarkOf`), cancella le richieste GM, toglie il ferito dalle aid e restituisce i soccorritori da avvisare dopo il commit; le sessioni hanno già un motivo di revoca che viaggia nelle `extensions` del refresh e nella reason del close WS 4409 (`src/auth/session/session-revoke-reason.enum.ts`, `src/auth/ws/ws-session-registry.ts`); i job Bull sono solo trigger che diventano no-op quando il documento sparisce; esiste il pattern degli sweeper per i ritentativi.

Tre fatti del codice cambiano la forma della fase. (1) **Il personaggio non conosce il suo proprietario** (`src/models/character/character.model.ts`: nessun campo utente; il legame è solo `User.currentCharacter`): i personaggi **archiviati** non sono rintracciabili dall'utente (conflitto C1) — serve un campo interno `Character.user` scritto alla creazione. (2) **Il segnaposto di oggi combatte** con la fotografia del personaggio archiviato (`boss-resolution.service.ts`, `rescue-resolution.service.ts`, `snapshotSeatHolderInSession`): senza documento non c'è nulla con cui combattere (conflitto C2, domanda di prodotto). (3) **I token push sono iscritti al topic FCM `streamer-live`** (`push.service.ts`): cancellare le righe senza disiscrivere i token lascerebbe le push «in diretta» sul telefono di chi è stato cancellato.

**Primary recommendation:** un modulo nuovo `src/account/deletion/` con un `AccountEraser` che in **una** transazione Mongo archivia il personaggio corrente col `CharacterArchiver`, marca come vacanti i posti avviati di tutti i personaggi, cancella PendingQuest, esiti, personaggi, ticket, device, verifica d'accesso e utente, revoca le sessioni col motivo nuovo `accountDeleted` accorciandone la scadenza alla vita dell'access token, e accoda i ritratti in un outbox `portrait_deletions`; dopo il commit chiude i socket (4409 `accountDeleted`), avvisa i soccorritori, disiscrive i token dal topic e prova la cancellazione su Cloudinary (lo sweeper ritenta). Consenso come parametro `termsVersion` su `GET /auth/twitch/start`, firmato nello state e scritto nell'upsert del callback.

## Project Constraints (from CLAUDE.md)

Da `CLAUDE.md` del repo BE e da `25-REPO-RULES.md` (regole degli esecutori ereditate fase per fase, salvo ruling diverso):

- **TDD obbligatorio**: RED → `test(<scope>): …`, GREEN → `feat|fix(<scope>): …`; ogni regola nuova ha un test il cui titolo nomina la decisione (`(D-13)`).
- **Compatibilità FE**: i contratti GraphQL consumati dal FE non si rompono; SDL solo additivo salvo dichiarazione nel handoff.
- **Branch + PR verso `develop`**, Conventional Commits in inglese, subject ≤ 72 caratteri, **nessun trailer** `Co-Authored-By` / `Generated with`.
- **Mai `npm run lint`** né `npm run format`: solo `npx prettier --write <file>` e `npx eslint <file>` sui file toccati.
- **Jest**: percorsi **prima** di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl 'bin/jest'` vuoto a fine task.
- **Mai `npm run build` / `nest build`** (il BE dell'utente gira da `dist/`).
- **Segreti**: mai leggere né stampare `.env`; il database reale non si tocca dagli esecutori; **nessuna variabile d'ambiente nuova**; nessun `process.env.` fuori dai provider di config.
- **Nessun file di contenuto nel repo**; migratori one-off fuori dal repo dopo il boot (D-11: in questa fase nessuno).
- `src/schema.gql` si rigenera solo con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`; i blocchi pinnati in `test/app.int-spec.ts` si aggiornano **prima** (RED); `test/authz/expected-handlers.ts` + `test/authz/handler-fixtures.ts` per ogni handler protetto nuovo.
- Nessun `Math.random` / `Date.now`: porte `ChanceSource` e `Clock`.
- Nessun `jest.mock(` di moduli: override di provider (porte astratte + fake).
- Stile: Prettier (apici singoli, virgole finali, 4 spazi), import assoluti `src/…`, messaggi utente in italiano, commenti minimi in italiano. Documenti `.md` in italiano; operatori Mongo solo in code span.
- Handoff per fase: `BACKEND-NOTES.md` nella cartella della fase.

<phase_requirements>
## Phase Requirements

La ROADMAP dice «Requirements: TBD» (`.planning/ROADMAP.md`, Phase 26). Proposta di ID per il planner:

| ID proposto | Descrizione | Supporto della ricerca |
|----|-------------|------------------|
| BE-ACCOUNT-01 | `Character.user` interno scritto alla creazione; la cancellazione trova anche gli archiviati (C1) | §Q1 «Come si trovano i personaggi» |
| BE-ACCOUNT-02 | `deleteMyAccount`: cancellazione completa in una transazione secondo l'inventario; oste rifiutato (D-04, D-14, D-16) | §Q1, §Q3 |
| BE-ACCOUNT-03 | Segnaposto vacante sulle quest avviate: posto occupato fino alla conclusione, `QuestRegistration.vacant` (D-13) | §Q2 |
| BE-ACCOUNT-04 | Revoca immediata: sessioni `accountDeleted`, socket 4409, access token ancora vivo rifiutato (D-03, D-06) | §Q3 «Revoca» |
| BE-ACCOUNT-05 | Ritratto: outbox nella transazione, cancellazione dopo il commit, sweeper di ritentativo, guardia cartella/condivisione | §Q4 |
| BE-ACCOUNT-06 | Device push cancellati e token disiscritti dal topic `streamer-live` dopo il commit | §Q1 riga push |
| BE-ACCOUNT-07 | `deleteAccountByTwitchLogin` dell'oste: Helix login → ID, errori distinti, bersaglio oste rifiutato, audit senza nome utente (D-15, D-16) | §Q5 |
| BE-CONSENT-01 | `termsVersion` su `/auth/twitch/start`, firmato nello state, rifiuto `terms_not_accepted` (D-09, D-12) | §Q6 |
| BE-CONSENT-02 | Versione e data scritte sull'utente nell'upsert del callback, orologio del BE (D-09) | §Q6 |
| BE-ACCOUNT-08 | SDL additivo, handoff `BACKEND-NOTES.md` con contratto N1–N6 | §Q8 |
</phase_requirements>

## Standard Stack

Nessuna libreria nuova. [VERIFIED: `package.json`, `node_modules/*/package.json`]

| Libreria | Versione | Uso nella fase |
|---------|---------|---------|
| mongoose / driver mongodb | 8.18.1 / 6.19.x | transazione `connection.transaction`, `deleteMany`, `updateMany` con `arrayFilters` e `$[]` |
| @nestjs/graphql | 13.2.0 | due mutation, un tipo di ritorno, un `@ResolveField` su `QuestRegistration` |
| cloudinary | 1.41.3 | `cloudinary.v2.uploader.destroy(public_id, { resource_type: 'image', invalidate: true })` |
| @nestjs/jwt | già in uso | state OAuth firmato che porta anche la versione |
| fetch di Node 22.12.0 | runtime | Helix `GET /helix/users?login=` con i helper di `src/eventsub/helix/twitch-http.ts` |
| jest 30 / mongodb-memory-server 11 | dev | progetti `unit` e `integration` |

MongoDB reale di sviluppo: 8.0 [VERIFIED: sonda in sola lettura, `buildInfo`].

## Q1 — Inventario di ciò che è legato all'utente o ai suoi personaggi

### Come si trovano i personaggi (conflitto C1)

`Character` non ha un campo proprietario; `User.currentCharacter` punta solo al personaggio attivo; l'archivio lo stacca (`unlinkOf`). Gli archiviati si possono ricostruire solo in parte: da `questresults.character` (esiti col campo `user`) o dall'`ambush` in viaggio. Sonda in sola lettura sul DB di sviluppo [VERIFIED: script usa-e-getta, solo conteggi, cancellato]: 7 personaggi, 4 archiviati, **1 archiviato non riconducibile a nessun utente** né da `currentCharacter` né dagli esiti, 1 attivo senza utente; nessun documento ha un campo proprietario.

**Raccomandazione:** `@Prop({ type: ObjectId, ref: 'User', default: null }) user` su `Character` (mai `@Field`, mai in `CharacterInput`), scritto da `CharacterCreationService.claimUserAndInsertCharacter` nella stessa `create`, indice `{ user: 1 }` (nome `character_user`). La cancellazione prende `{ user: userId }` **unito** a `currentCharacter` (un personaggio corrente creato prima della fase non ha il campo). Gli archiviati di sviluppo senza campo restano all'orchestratore al boot (D-11: nessun migratore nel repo; uno script fuori dal repo può valorizzare `user` da `questresults`).

### Tabella

| # | Collection / stato | Chiave | Azione | Dove |
|---|-------------|--------|--------|------|
| 1 | `users` | `_id`, `twitchId` unico | **delete** (ultima scrittura della transazione) | `src/models/user.model.ts` |
| 2 | `characters` (attivo + archiviati) | `_id` ∈ personaggi dell'utente | prima `archiveWithinReporting` sul corrente (rilasci come l'archivio), poi **delete** di tutti | `character-archiver.ts` |
| 3 | `pendingquests` | riferite dalle corsie `quests.pendingQuest`, `activeStoryQuest`, `activeWorldMissionQuest` di ogni personaggio | **delete** di tutte (le GM del corrente le cancella già l'archivio; la standard l'archivio la lascia, qui va tolta: senza personaggio resterebbe orfana per sempre). Include la PendingQuest dell'apprendimento (corsia standard, `researchResult`) | `pending-quest.model.ts`, `quest-lanes.ts` |
| 4 | `quests.registeredAdventurers` | `character` | non avviate: liberate (archivio, `unstartedSeatReleaseOf`); avviate non concluse: restano, marcate `archivedAt` (archivio) **e** `vacatedAt` (nuovo) per ogni personaggio dell'utente, anche gli archiviati di prima che sono già segnaposto | `seat-release.ts`, §Q2 |
| 5 | `quests.rescue.characters` | ferito | `$pull` dall'archivio (solo corrente; gli archiviati sono già stati tolti al loro archivio) | `releaseQuestsOf` |
| 6 | `questresults` | `user` (e `character`) | **delete** `{ user }` | `quest-result.model.ts` |
| 7 | `questresults.rescuedCharacters` di altri | id del personaggio | **lasciare**: è `[ID!]!` senza nome; la FE ne usa solo il conteggio (`quest_result_sheet.dart`, «avete salvato N»); toglierlo cambierebbe il conteggio altrui | `quest-result.model.ts` |
| 8 | `missiondrafts` | `participants.character` (col **nome fotografato**), `prizes.character`, `backgroundAdditions.character` (testi), `fights.outcomes.character` | `$pull` delle quattro voci + `$inc rev` (annulla un completamento in volo, B-01); bozza rimasta senza partecipanti → **delete** | `mission-draft.model.ts` |
| 9 | `sessions` | `userId` | revoca `accountDeleted` + `expiresAt` = adesso + 900 s: il TTL le toglie entro ~16 minuti (§Q3) | `session.model.ts` |
| 10 | `login_tickets` | `userId` | **delete** (TTL 60 s comunque) | `login-ticket.model.ts` |
| 11 | `push_devices` | `userId` | **delete** nella transazione, token letti prima; dopo il commit `unsubscribeFromTopic(tokens, 'streamer-live')` best-effort | `push-device.registry.ts`, `push.service.ts` |
| 12 | `channel_access_checks` | `twitchId` (nessun TTL) | **delete**: D-04 (nessuna traccia del Twitch ID); al prossimo login la verifica riparte | `channel-access-check.model.ts` |
| 13 | `admin_audit_logs` | `actor`, `target.id` | **TTL 90 giorni** (promessa delle pagine legali) | `admin-audit-log.model.ts` |
| 14 | `eventsub_messages` | `twitchUserId` | **TTL 7 giorni**; un riscatto dopo la cancellazione risponde `unknownViewer` e non scrive (`points-credit.service.ts`) | `eventsub-message.model.ts` |
| 15 | `streamer_credentials` | twitchId dello streamer | nessuna: l'oste non si cancella (D-16) | — |
| 16 | Ritratto Cloudinary | `infos.imagePath` di ogni personaggio | outbox `portrait_deletions` nella transazione, `destroy` dopo il commit (§Q4) | `cloudinary.service.ts` |
| 17 | Job Bull (spell-recovery, travel, ambush su `characterId`; quest-resolution su `pendingQuestId`/`questId`) | id | **lasciare**: sono trigger (`enqueue-trigger.ts`), rileggono il DB e diventano no-op («non più valido», `stale`); `removeOnComplete`; i falliti tenuti 7 giorni portano solo ObjectId | processori |
| 18 | `WsSessionRegistry`, `KeyedSingleFlight`, contatori di throttling | in memoria | socket chiusi dopo il commit; il resto si svuota da sé | — |
| 19 | Embedded del personaggio (`ambush` col campo `user`, pet coi nomi, lore, nemici noti, oggetti, magie) | — | spariscono col documento | — |

Niente altro: grep di `ref: 'User'`, `ref: User.name`, `ref: 'Character'`, `ref: Character.name` su `src/` dà solo le righe sopra; quest, città, negozi, lore, pet e nemici sono cataloghi globali. [VERIFIED: grep 2026-11-24]

## Q2 — Segnaposto anonimo (D-13)

> **SUPERATA dal ruling PO-1 (2026-11-24):** niente segnaposto né `QuestRegistration.vacant` alla cancellazione dell'account; vedi «Addendum» in fondo. La tabella dei lettori resta valida come inventario.

### Chi legge la registrazione di un personaggio

| Lettore | Cosa fa con l'id | Senza documento |
|---------|------------------|-----------------|
| `QuestRegistration.character: ID!` sul filo (`schema.gql`) | serve l'id grezzo | nulla si rompe: nessun resolver lo risolve |
| `quest-capacity.ts`, `quest-eligibility.ts` (`hasSeatFor`, `alreadyTaken`) | contano i posti | il posto resta occupato: voluto |
| `seatHolderIdsOf` (`group-roster.ts`) | id con `archivedAt` = candidati segnaposto | resta candidato |
| `readSeatHolders` → `seatHolderLaneMembersOf` (`lane-members.ts`) | cerca il personaggio **senza** filtro attivi e la sua PendingQuest | non lo trova: finisce in `dropped`, **non** fra i `seatHolders`; nessuna eccezione (la lettura è fuori dalla transazione) |
| `snapshotSeatHolderInSession` (boss, soccorso) | fotografia per il combattimento | non chiamata per lui (non è fra i `seatHolders`); se lo fosse lancerebbe `StaleResolution` e la risoluzione intera sarebbe rimandata |
| `incoherentOf` | registrati fuori roster non segnaposto | lo segnala con un WARN «senza missione in attesa coerente»: rumore da togliere |
| `questUpdateOf` (`quest-outcome-plan.ts`) | `$pull` dei `dropped` alla risoluzione | il posto vacante esce alla conclusione: voluto |
| claim del gruppo `registeredAdventurers: { $size: registeredCount }` | conta | invariato |
| `activeRegistrantFilterOf` / `resetQuestsWithoutActiveRegistrants` | chi è reale lo dice la collection | nessun personaggio attivo resta → quest torna non avviata (regola dell'archivio) |
| `pending-requests.builder.ts` | passa le registrazioni all'oste | invariato, guadagna `vacant` |
| `registered-release.ts`, `party-timeout.service.ts`, `party-abandon.service.ts`, `quest-start.service.ts` | quest non avviate / scioglimento | il vacante esiste solo sulle avviate; lo scioglimento svuota la lista intera |

### Conflitto C2 — il segnaposto di oggi combatte

> **SUPERATO:** C2 è chiuso dal ruling PO-1, vedi «Addendum».

`boss-resolution.service.ts` («i segnaposto di posto combattono con la fotografia del personaggio archiviato, senza esiti né premi (D-21)») e `rescue-resolution.service.ts` mettono la fotografia del seat holder in `combatContextOf`. Con il documento cancellato **non c'è nulla con cui combattere**. Due strade:
- **A (raccomandata):** il posto vacante occupa il posto, non combatte, non riceve esiti, esce alla conclusione. Nessun dato del cancellato sopravvive. Coerente con «senza più alcun personaggio dietro».
- **B:** fotografare alla cancellazione la proiezione di combattimento (`status`, `assets`) dentro la registrazione, internamente. Mantiene la forza del gruppo ma conserva dati del cancellato (oggetti, magie, nomi dei compagni negli `ownedPets`) fino alla conclusione.

Domanda per il product owner (PO-1). Il resto della ricerca assume A.

### Forma raccomandata (A)

- A DB: `QuestRegistration.vacatedAt?: Date` interno (`@Prop({ type: Date })`, nessun default, come `archivedAt`), scritto con `arrayFilters` sulle quest avviate non concluse per ogni personaggio dell'utente; si scrive anche `archivedAt` se manca, così `seatHolderIdsOf` resta l'unica regola.
- `character` **resta l'id penzolante** (`ID!` invariato).
- `incoherentOf(roster, vacantIds)`: i vacanti non sono incoerenti, log `log` dedicato invece del WARN.
- Sul filo: `QuestRegistration.vacant: Boolean!` con `@ResolveField` (`vacatedAt != null`), **non** un `@Prop` con default: le letture `lean` (builder della coda dell'oste) non avrebbero il campo e un `Boolean!` nullo romperebbe la risposta.
- **SDL: una riga additiva.**

## Q3 — Transazione, ordine, revoca

### Cosa sta in una transazione

Tutto ciò che è Mongo, nell'ordine (callback rieseguibile sui WriteConflict: stato azzerato in testa, come `archiveCurrentCharacter`):
1. Leggere l'utente in sessione (`role`, `twitchId`, `currentCharacter`); assente → `ACCOUNT_NOT_FOUND` (via oste) / `UNAUTHENTICATED` (via propria); `role === innkeeper` → `INNKEEPER_ACCOUNT_PROTECTED` (D-16; il ruolo si legge dal DB, non dal JWT).
2. Personaggi = `{ user }` ∪ `currentCharacter`; leggerne corsie e `infos.imagePath`.
3. Corrente presente → `archiver.archiveWithinReporting(session, { reason: user_request, … })`; tenere `released`.
4. Marcare `vacatedAt` (e `archivedAt` mancante) sui posti delle quest avviate non concluse.
5. Cancellare le PendingQuest di tutte le corsie; ripulire le bozze guidate.
6. `questresults` `{ user }`; `characters` per id.
7. Sessioni: leggere gli id attivi, `updateMany` revoca `accountDeleted` sulle attive e `expiresAt` accorciata su tutte; ticket, device (token letti prima), `channel_access_checks`.
8. Outbox ritratti.
9. `users.deleteOne`.

Dimensione: pochi personaggi per utente, pochi documenti; ben sotto i limiti di durata e dimensione di una transazione. La transazione è una sola: **mai** `connection.transaction` annidata (Pitfall 1 dell'archivio).

### Dopo il commit, mai dentro

1. `WsSessionRegistry.closeSessions(ids, accountDeleted)` → 4409.
2. `notifyQuestCancelled` per i soccorritori liberati (come `CharacterDeletionService.notifyReleased`).
3. `PushService` disiscrive i token dal topic (metodo pubblico nuovo, best-effort).
4. `PortraitDeletionService.flush()` best-effort.
5. Registro in memoria degli utenti cancellati (§Revoca).
Il resto esce da sé dai change stream: le quest (seggi liberati, `vacatedAt`) da `quests.publisher.ts`; la coda dell'oste dalla `delete` delle PendingQuest (`pending-requests.publisher.ts`, insert/delete) e dall'update `deletedAt` (`archived-character-queue.refresher.ts`); `characterUpdated` del corrente trova `ResourceNotFound` e tace (`character-updates.publisher.ts`).

### Revoca e motivo (N3)

**Oggi** [VERIFIED: lettura]:
- refresh di un utente che non esiste più: `AuthSessionService.refresh` → `sessionService.revoke(id, null)` → `SESSION_REVOKED` **senza** `reason`;
- refresh con un token sconosciuto (sessione cancellata o scaduta): `rejectRefresh` → `findRevokedByToken` nullo → `SESSION_EXPIRED`;
- WS: `WsConnectionAuthenticator.closeIfRevoked` chiude 4409 con la reason solo se la sessione **esiste ed è revocata**; una sessione assente è accettata;
- HTTP con access token valido: la guard verifica solo il JWT; i servizi rispondono a caso per caso (`me` → `NOT_FOUND`, `deleteCharacter`/`createCharacter`/push → `UNAUTHENTICATED`).

Quindi la FE ha ragione su entrambi i comportamenti e, se le sessioni fossero **cancellate**, il refresh darebbe `SESSION_EXPIRED` e un socket riaperto col JWT ancora vivo sarebbe accettato.

**Cosa cambia:**
1. `SessionRevokeReason.accountDeleted = 'accountDeleted'` (enum fuori dallo schema GraphQL: nessuna riga SDL).
2. Le sessioni **non si cancellano nella transazione**: si revocano con `accountDeleted` e `expiresAt = now + ACCESS_TOKEN_TTL_SECONDS` (900 s). Il TTL `expiresAt` (`expireAfterSeconds: 0`) le toglie entro ~16 minuti. In quella finestra: refresh → `rejectRefresh` → `findRevokedByToken` → `SESSION_REVOKED` + `extensions.reason = "accountDeleted"`; socket riaperto → 4409 `accountDeleted`. Dopo: le sessioni non ci sono più, il refresh dà `SESSION_EXPIRED` (ripiego dichiarato per chi riapre l'app più di 15 minuti dopo una cancellazione dell'oste). Coerente con la privacy («entro 30 giorni») e con «revocate subito».
3. Socket vivi: 4409 con reason `accountDeleted` dopo il commit (anche quello di chi ha chiesto la propria cancellazione: può arrivare prima della risposta HTTP della mutation; la FE deve trattare i due eventi come la stessa uscita).
4. HTTP con JWT ancora vivo: `DeletedAccountRegistry` in memoria (stesso perimetro single-node di `WsSessionRegistry`), riempito dopo il commit con `userId` per 900 s (`Clock`), consultato da `AuthIdentityResolver.resolveBearer` → `UNAUTHENTICATED`. La FE, su `UNAUTHENTICATED`, rinnova e riceve `SESSION_REVOKED`/`accountDeleted`. Nessuna lettura DB per richiesta (vincolo Phase 17). Un riavvio del BE nella finestra svuota il registro: ripiego = risposte per caso dei servizi (accettabile, dichiarato).
5. `AuthModule` esporta un facciata unica (es. `SessionRevocationService` con `revokeAllWithin(session, userId, reason, expiresAt): ids` e `closeSockets(ids, reason)`): **mai** fornire `WsSessionRegistry` in un secondo modulo (istanza vuota, socket mai chiusi).

## Q4 — Ritratto su Cloudinary

**Oggi** [VERIFIED: lettura]: `POST /cloudinary/uploadImage` → moderazione → `upload_stream({ folder: 'characters_profile' })` → `secure_url` all'app; la creazione salva solo `infos.imagePath` (qualunque URL https, `create-character-input.validator.ts`); nessuna sostituzione esiste; nessun `destroy` nel repo. L'app può anche scegliere immagini preimpostate di altre cartelle (`listResources`, `listSubfoldersResources`). Il DB di sviluppo ha 1 ritratto, sotto `/characters_profile/`.

**Strategia (outbox transazionale):**
- `portraitPublicIdOf(url)` pura: solo URL `res.cloudinary.com/<cloud>/image/upload/[v<n>/]characters_profile/<id>.<ext>` → `characters_profile/<id>`; tutto il resto (preimpostate, URL esterni) → `null`, niente da cancellare. Guardia essenziale: `imagePath` è scelto dal client, senza cartella si potrebbe distruggere un'immagine condivisa.
- Guardia di condivisione: si accoda solo se nessun personaggio **sopravvissuto** ha lo stesso `imagePath` (letto in sessione).
- Collection `portrait_deletions` `{ publicId (unico), queuedAt, attempts }`, scritta nella transazione: solo l'id Cloudinary, nessun legame con l'utente.
- Dopo il commit `flush()`; `destroy(publicId, { resource_type: 'image', invalidate: true })`; `result` `ok` o `not found` → riga cancellata; errore → `attempts++`, WARN senza payload (come `providerErrorOf`).
- `PortraitDeletionSweeper` con l'intervallo di `QUEST_CONFIG.sweepIntervalMs` (pattern `prison-release.sweeper.ts`, nessuna variabile nuova), al boot e periodico.
- Porta astratta `PortraitStore.destroy(publicId)` implementata da `CloudinaryService`: nei test un fake (niente `jest.mock`).

Esito: l'account non resta mai mezzo cancellato (Cloudinary è fuori dalla transazione e dopo il commit) e il ritratto non resta orfano per sempre (l'outbox sopravvive ai riavvii). [CITED: cloudinary.com/documentation/image_upload_api_reference_destroy_by_public_id — firma `destroy(public_id, options)`, `invalidate`, risposta `{"result":"ok"}`; il valore `not found` per un asset assente è [ASSUMED]]

## Q5 — Cancellazione dall'oste per nome Twitch (D-15, D-16)

**Token disponibili** [VERIFIED: lettura]: `TwitchAppTokenCache` (`src/eventsub/helix/twitch-app-token.cache.ts`, client credentials, in memoria, invalidazione al 401) funziona **solo** con `EVENTSUB_CONFIG.mode === 'managed'`; `AUTH_CONFIG.twitch` ha sempre `clientId`/`clientSecret` quando il login Twitch funziona; `StreamerAccessTokenProvider` è il token utente dello streamer (può mancare). Un BE di sviluppo in modalità EventSub `local` non avrebbe token app: la cancellazione dell'oste fallirebbe sempre in UAT.

**Raccomandazione:** rendere `TwitchAppTokenCache` parametrico sulle credenziali (factory provider: `{ clientId, clientSecret } | null`) e fornirne un'istanza dalle credenziali di `AUTH_CONFIG.twitch` in una porta nuova `TwitchUserDirectory` (`src/auth/twitch/`, `userIdOfLogin(login): Promise<string | null>`), adattatore HTTP con `sendTwitchRequest`/`assertTwitchOk`/`readTwitchJson` e il ritentativo unico sul 401 come `HttpTwitchHelixClient`. EventSub conserva la propria istanza.

**Helix** [CITED: dev.twitch.tv/docs/api/reference/users#get-users]: `GET https://api.twitch.tv/helix/users?login=<login>`, token app o utente, header `Client-Id`; `data[]` con `id`, `login`; account cancellati o sospesi non compaiono; un valore malformato → 400; token non valido → 401. Che un login inesistente dia `data` vuoto senza errore è dedotto, non scritto [ASSUMED].

**Flusso e codici:**
1. Normalizzare: `trim`, togliere un `@` iniziale, minuscolo; tetto di forma sul filo (`MaxLength(64)`); fuori da `^[a-z0-9_]{1,25}$` → `TWITCH_USER_NOT_FOUND` senza chiamare Twitch.
2. Helix: `data` vuoto → `TWITCH_USER_NOT_FOUND`; rete, timeout, 5xx, 401 dopo il ritentativo, credenziali assenti → `TWITCH_UNAVAILABLE`.
3. Nessun `User` con quel `twitchId` → `ACCOUNT_NOT_FOUND`.
4. Ruolo `innkeeper` → `INNKEEPER_ACCOUNT_PROTECTED`.
5. Stessa `AccountEraser.erase(userId)` della via propria.

Limite dichiarato: un account Twitch sospeso o cancellato non si risolve → l'oste lo toglie a mano.

**Audit:** l'`AdminAuditInterceptor` registra da sé ogni mutation `@Roles(innkeeper)` con **tutti gli argomenti**: il nome utente finirebbe nel registro per 90 giorni, contro privacy §2 («leggiamo il nome utente… ma non lo salviamo»). Estendere `@AuditTarget` con due ganci opzionali: `argsOf` (qui `() => ({})`) e `idOfResult` (qui il `twitchId` restituito). Voce: `action: 'deleteAccountByTwitchLogin'`, `target: { type: 'User', id: <twitchId> | null }`, `args: {}`, `outcome` = `ok` o il codice d'errore. Il Twitch ID nel registro per 90 giorni è ciò che le pagine legali dichiarano. La via propria non è auditata (nessun `@Roles`, nessun on-behalf).

**Liste dei test:** `EXPECTED_INNKEEPER_HANDLERS` += `AccountDeletionResolver.deleteAccountByTwitchLogin` e fixture in `HANDLER_FIXTURES` (`target: 'none'`); la mutation propria non entra in nessuna lista (niente ruoli, niente ownership); nessun `@Throttled` (la lista vieta mutation di gioco; è riservata all'oste).

## Q6 — Consenso al login (D-09, D-12) — N4

**Flusso di oggi** [VERIFIED: lettura]: `GET /auth/twitch/start?challenge=` (`twitch-auth.controller.ts`) → `OAuthStateService.sign(challenge)` (JWT HS256, audience propria, TTL 600 s) → Twitch → `GET /auth/twitch/callback` → `completeLogin`: scambio, validazione, follow gate → **`usersService.findOrCreateByTwitchId(twitchId)` crea l'utente qui** → `loginTicketService.issue` → redirect all'app col ticket → mutation `exchangeLoginTicket(ticket, codeVerifier)` → sessione. Gli errori del flusso browser tornano come `?error=<codice>` sul redirect dell'app (`buildAppErrorRedirect`, valori snake_case di `TwitchLoginErrorCode`).

**Raccomandazione: la versione viaggia su `/auth/twitch/start`.**
- Parametro `termsVersion`, forma `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$` (es. `2026-11-24`); firmata nello state insieme a `challenge` (claim `termsVersion`).
- Ordine dei rifiuti allo start: `twitch_not_configured` → `invalid_request` (challenge) → **`terms_not_accepted`** (nuovo valore di `TwitchLoginErrorCode`) per assente o malformata. Al callback uno state senza versione (firmato prima del deploy) → `terms_not_accepted`.
- Il callback passa la versione a `findOrCreateByTwitchId(twitchId, { version, acceptedAt: clock.now() })`: **un solo upsert** con `$set: { acceptedTermsVersion, termsAcceptedAt }` e il `$setOnInsert` di oggi. Nessun utente esiste mai senza consenso; nessuna corsa a Twitch per chi non ha accettato.
- Perché non `exchangeLoginTicket`: l'utente nasce al callback, prima dello scambio; un rifiuto allo scambio lascerebbe a DB un `User` col Twitch ID di chi non ha accettato.
- Campi su `User`: `acceptedTermsVersion: string | null`, `termsAcceptedAt: Date | null`, solo `@Prop` (mai sul filo: D-12 non chiede letture).
- Ogni login riscrive versione e data: la data è l'ultima accettazione (la casella spuntata davanti al pulsante, anche se ricordata, D-10).
- Il rifiuto raggiunge l'app come **redirect** `…?error=terms_not_accepted`, non come errore GraphQL: la FE lo legge in `parseLoginCallback` (`LoginRejectedByBackend(code)`).

**Bypass di sviluppo:** `DevAuthStrategy` non è un login: un bearer statico fa `upsertWithRole` alla prima richiesta, e il flavor dev della FE non chiama mai il BE per accedere (`dev_auth_token_service.dart`). Regola: il bypass **non** porta né registra il consenso ed è esente dal rifiuto; è già vietato in produzione (`auth-config.ts`) e non si aggiunge una variabile d'ambiente. Un test lo fissa.

**Impatto sui test:** `src/auth/twitch/twitch-auth.controller.int-spec.ts` (helper `startState`, `signState`, `login`), `test/auth/login-flow.int-spec.ts`, `src/auth/twitch/oauth-state.service.spec.ts` (firma di `sign` e lettura delle claim) aggiungono la versione; `test/app.int-spec.ts` «redirects the Twitch login start to the not-configured app error» resta verde (il non configurato viene prima). `verifyChallenge` diventa una lettura delle due claim (es. `verify(state): { challenge, termsVersion } | null`).

## Q7 — Harness di test

| Factory | Contiene | Uso |
|---------|----------|-----|
| `test/auth/auth-test-app.ts` `createAuthTestApp` | Config senza `.env`, Mongoose su `MONGO_TEST_URI` (replica set in memoria), PubSub, **AuthModule** (sessioni, WS, revoca), Validation, Throttling, GraphQL; override di `AUTH_CONFIG`, `TwitchOAuthClient` (fake `test/auth/fake-twitch-oauth.client.ts`), `Clock`; `imports`/`providers`/`overrides` | auth, revoca, login, WS (`test/auth/ws-test-client.ts`) |
| `test/authz/characters-test-app.ts` | sopra + modelli dei personaggi, Economy, Authz, MissionLock, publisher dei personaggi, coda spell-recovery finta | resolver dei personaggi, `character-deletion.resolver.int-spec.ts` |
| `test/harness/real-app-boot.ts` `bootRealApp` | **AppModule vero**, Bull + Redis effimero, senza credenziali Twitch | `test/app.int-spec.ts` (pin SDL, liste handler), `test/authz/authorization-matrix.int-spec.ts` |
| fixture | `test/fixtures/{user,character,quest,session}.fixture.ts`, `test/quests/outcome-world.ts`, `quest-result.fixture.ts` | dati |

Progetti jest (`package.json`): `unit` = `src/**/*.spec.ts`, `test/**/*.spec.ts`; `integration` = `*.int-spec.ts` con `globalSetup` `test/setup/global-setup.ts`. Soglie di coverage per cartella fra cui `./src/auth/` e `./src/eventsub/`. Modelli di test vicini: `character-archiver.int-spec.ts` (archivio in transazione), `character-deletion.resolver.int-spec.ts` (seggi, aid, push dopo il commit), `boss-resolution.int-spec.ts` e `aid-rescue.int-spec.ts` (segnaposto), `test/auth/session-revocation.int-spec.ts` (motivi e 4409).

## Q8 — Contratto per la FE (N1–N6) e impatto SDL

**N1 — cancellazione propria:** `deleteMyAccount: Boolean!`, nessun argomento (identità dal bearer). Errori: `INNKEEPER_ACCOUNT_PROTECTED` (oste, D-16), `UNAUTHENTICATED` (utente già sparito). Successo = `true`, poi 4409 `accountDeleted` sui socket.

**N2 — cancellazione dall'oste:** `deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!` con `type DeletedAccount { twitchId: String! }` (serve all'audit e all'oste per conferma). `@Roles(innkeeper)`. Errori: `TWITCH_USER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `INNKEEPER_ACCOUNT_PROTECTED`, `TWITCH_UNAVAILABLE`; `BAD_USER_INPUT` solo oltre il tetto di forma. Codici in `AccountDeletionErrorCode`, eccezione con `extensions.code` sul modello di `CharacterDeletionException`.

**N3 — revoca:** sì, con le modifiche di §Q3: refresh → `SESSION_REVOKED` + `reason: "accountDeleted"` per 15 minuti, poi `SESSION_EXPIRED`; socket → 4409 reason `accountDeleted`; HTTP con access token ancora vivo → `UNAUTHENTICATED` (registro in memoria; dopo un riavvio del BE nella finestra, risposte per caso).

**N4 — consenso:** parametro `termsVersion` su `/auth/twitch/start`, forma sopra; rifiuto come redirect `?error=terms_not_accepted`; il bypass dev è esente.

**N5 — SUPERATA dal ruling PO-1, vedi «Addendum» (nessuna registrazione penzolante, nessun `vacant`).** ~~N5 — segnaposto:~~ sì, la registrazione resta con `character: ID!` e l'id penzolante fino alla conclusione, senza cambiare il tipo. Sul BE quell'id lo leggono solo i lettori della tabella §Q2: nessuno si rompe (il roster lo mette fra i `dropped` invece che fra i segnaposto). Aggiunta **additiva** facoltativa per la FE: `QuestRegistration.vacant: Boolean!` per disegnare «Un avventuriero scomparso»; la FE può ignorarla e il conteggio resta giusto.

**N6 — device push:** sì, le righe `push_devices` dell'utente si cancellano nella transazione e dopo il commit i token si disiscrivono da `streamer-live`; l'app non deve disiscriversi (con una sessione morta la mutation fallirebbe) e non deve fallire se non può farlo.

**SDL:** tutto additivo — due mutation, `type DeletedAccount`, `QuestRegistration.vacant`. **(Aggiornato dall'«Addendum»: `QuestRegistration.vacant` cade.)** Nessuna riga tolta, nessun tipo cambiato. Enum di revoca e codici del login non sono nello schema.

## Architecture Patterns

### Struttura raccomandata
```
src/account/deletion/
├── account-deletion.module.ts        # importa CharacterArchiveModule, PushModule, AuthModule (facciata revoca), CloudinaryModule (PortraitStore)
├── account-deletion.resolver.ts      # deleteMyAccount, deleteAccountByTwitchLogin
├── account-deletion.service.ts       # due vie → erase(userId); dopo il commit: socket, push, ritratti, registro
├── account-eraser.ts                 # la transazione (pattern CharacterArchiver: riceve la ClientSession)
├── account-erasure.plan.ts           # funzioni pure: filtri, update dei posti, $pull delle bozze, publicId
├── account-deletion-error-code.enum.ts / account-deletion.exception.ts
└── portrait/ portrait-deletion.model.ts, portrait-deletion.service.ts, portrait-deletion.sweeper.ts, portrait-store.ts
src/auth/twitch/twitch-user-directory.ts (+ http-twitch-user-directory.ts)
src/auth/session/deleted-account.registry.ts
```

### Pattern
1. **Funzioni pure, servizi sottili** — come `seat-release.ts`: filtri e update costruiti puri e provati in unit, servizi che li eseguono.
2. **Una transazione, effetti dopo il commit** — come `CharacterDeletionService` (D-27): stato raccolto nel callback e azzerato in testa, avvisi fuori.
3. **Outbox** per l'effetto esterno non transazionale (Cloudinary), sweeper per il ritentativo.
4. **Porte astratte + fake** per Twitch e Cloudinary.

### Anti-pattern da evitare
- Chiamare `CharacterDeletionService.archiveCurrentCharacter`: apre la **propria** transazione (annidata → commit separato). Usare `archiveWithinReporting`.
- Fornire `WsSessionRegistry` fuori da `AuthModule`.
- `destroy` di Cloudinary dentro la transazione o prima di essa.
- `@Prop` con default per `vacant` (letture `lean` → `null` su `Boolean!`).
- Cancellare le sessioni subito (perde il motivo, riapre il WS).

## Don't Hand-Roll

| Problema | Non costruire | Usare |
|---------|-------------|-------------|
| Rilascio di posti, aid, soccorritori, richieste GM | logica nuova di rilascio | `CharacterArchiver.archiveWithinReporting` + `notifyQuestCancelled` |
| Token app Twitch | un secondo fetch client credentials con cache | `TwitchAppTokenCache` parametrico |
| Richieste HTTP a Twitch | `fetch` nudo | `sendTwitchRequest` / `assertTwitchOk` / `readTwitchJson` |
| Ritentativi periodici | `setTimeout` ad hoc | pattern sweeper + `QUEST_CONFIG.sweepIntervalMs` |
| Motivo di revoca | campo GraphQL nuovo | `SessionRevokeReason` + `AuthException.sessionRevoked(reason)` + 4409 |
| Pulizia delle sessioni | job di cancellazione | indice TTL `expiresAt` già presente |

## Runtime State Inventory

| Categoria | Trovato | Azione |
|----------|-------------|------------------|
| Dati salvati | personaggi archiviati senza proprietario: 1 a DB di sviluppo (più 1 attivo senza utente) | nessun migratore nel repo (D-11); l'orchestratore decide al boot reale (script fuori dal repo da `questresults`) |
| Config di servizi | topic FCM `streamer-live` su Firebase con i token dell'utente | disiscrizione dopo il commit (codice) |
| Stato del SO | nessuno | — |
| Segreti / env | nessuna variabile nuova (credenziali Twitch e Cloudinary già presenti) | — |
| Artefatti | `src/schema.gql` da rigenerare col test | piano dello schema |

## Common Pitfalls

1. **Transazione annidata** — `archiveCurrentCharacter` committa da sola: usare `archiveWithinReporting(session)`.
2. **PendingQuest standard orfana** — l'archivio la lascia sul personaggio: con il documento cancellato resterebbe per sempre; cancellarla nella transazione (test).
3. **Archiviati dimenticati** — senza `Character.user` gli archiviati restano (C1); test con un archiviato senza esiti.
4. **Seat holder di prima** — un personaggio archiviato prima della cancellazione può essere già segnaposto su una quest avviata: va marcato vacante anche lui.
5. **WARN di incoerenza** sulle risoluzioni coi vacanti — `incoherentOf` li esclude.
6. **Nome nella bozza guidata** — `participants.name` fotografato: va tolto.
7. **Ritratto condiviso o preimpostato** — guardia cartella `characters_profile/` e guardia dei sopravvissuti.
8. **Topic FCM** — righe cancellate ma token ancora iscritti → push «in diretta» a un cancellato.
9. **Audit col nome utente** — args automatici dell'interceptor: redigere.
10. **4409 prima della risposta** — la FE della via propria riceve il close prima del `true`.
11. **WriteConflict** — callback rieseguito: azzerare lo stato raccolto in testa al callback.
12. **Spec che pinnano gli update interi** dell'archivio e di `findOrCreateByTwitchId` (`users.service.int-spec.ts`): aggiornarle nel RED.
13. **Trappole operative del repo** — mai `npm run lint`/build, jest percorsi prima di `--selectProjects`, `pgrep` vuoto.

## Code Examples

### Posto vacante
```typescript
// src/characters/deletion/seat-release.ts (accanto a placeholderMarkOf)
export function vacantMarkOf(questIds: Types.ObjectId[], characterIds: Types.ObjectId[], now: Date) {
    return {
        filter: { _id: { $in: questIds }, concludedAt: null, startedAt: { $ne: null } },
        update: { $set: { 'registeredAdventurers.$[seat].vacatedAt': now } },
        arrayFilters: [{ 'seat.character': { $in: characterIds.flatMap((id) => idForms(id)) } }],
    };
}
```

### Pulizia della bozza
```typescript
const ids = { $in: characterIds };
await draftModel.updateMany(
    { 'participants.character': ids },
    {
        $pull: {
            participants: { character: ids },
            prizes: { character: ids },
            backgroundAdditions: { character: ids },
            'fights.$[].outcomes': { character: ids },
        },
        $inc: { rev: 1 },
    },
    { session },
);
await draftModel.deleteMany({ participants: { $size: 0 } }, { session });
```

### Revoca nella transazione
```typescript
const ids = await sessionModel.find({ userId, revokedAt: null, expiresAt: { $gt: now } }, { _id: 1 }).session(session).lean();
await sessionModel.updateMany({ _id: { $in: ids } }, { $set: { revokedAt: now, revokeReason: SessionRevokeReason.accountDeleted } }, { session });
await sessionModel.updateMany({ userId }, { $min: { expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000) } }, { session });
```

### Consenso nell'upsert
```typescript
findOneAndUpdate(
    { twitchId },
    {
        $set: { acceptedTermsVersion: consent.version, termsAcceptedAt: consent.acceptedAt },
        $setOnInsert: { twitchPoints: 0, role: RoleType.adventurer, currentCharacter: null },
    },
    { upsert: true, new: true },
);
```

## State of the Art

| Prima | Dopo | Impatto |
|-------|------|---------|
| Personaggio senza proprietario | `Character.user` interno | gli archiviati si trovano |
| Segnaposto che combatte con la fotografia | posto vacante che non combatte (se PO-1 = A) | gruppo più debole di un posto |
| Login senza consenso | `termsVersion` obbligatoria allo start | FE manda il parametro; vecchie build rifiutate (app non pubblicata) |

## Assumptions Log

| # | Affermazione | Sezione | Rischio se falsa |
|---|-------|---------|---------------|
| A1 | Helix risponde `data: []` per un login inesistente | §Q5 | se desse 400, va mappato anch'esso a `TWITCH_USER_NOT_FOUND` (il pattern locale già filtra i malformati) |
| A2 | `destroy` di Cloudinary risponde `{"result":"not found"}` per un asset assente | §Q4 | l'outbox ritenterebbe all'infinito un asset già sparito: trattare ogni risposta non-errore come chiusura |
| A3 | Il public id è il percorso dopo `/upload/v<n>/` senza estensione (vero per l'unico ritratto a DB) | §Q4 | un ritratto non cancellato: lo sweeper ritenta e logga |
| A4 | Nomi `deleteMyAccount`, `deleteAccountByTwitchLogin`, `DeletedAccount`, `vacant`, `termsVersion`, codici d'errore: proposte | §Q8 | solo coordinamento FE: fissarli nel REPO-RULES |
| A5 | ID dei requisiti `BE-ACCOUNT-*`/`BE-CONSENT-*` | Phase Requirements | nessuno |

## Open Questions (RESOLVED)

1. **SUPERATA — ruling PO-1 nell'«Addendum».** ~~**PO-1 (aperta per il product owner): il posto vacante combatte?**~~ Oggi il segnaposto combatte con la fotografia dell'archiviato (C2). RISOLTA in ricerca come **A** (non combatte, nessun dato del cancellato sopravvive); B possibile con una fotografia interna nella registrazione. Serve conferma dell'utente prima dei piani del segnaposto.
2. **Come si trovano gli archiviati?** RISOLTA: `Character.user` interno dalla creazione; gli archiviati di sviluppo senza campo sono affare dell'orchestratore (C1, D-11).
3. **Dove viaggia la versione?** RISOLTA: `/auth/twitch/start`, firmata nello state, scritta nell'upsert del callback; rifiuto `terms_not_accepted` per redirect.
4. **Il bypass dev?** RISOLTA: esente, nessuna variabile nuova.
5. **Data dell'accettazione: prima o ultima?** RISOLTA: ultima (ogni login riscrive versione e data).
6. **Come arriva «account eliminato» all'app?** RISOLTA: `accountDeleted` su refresh e 4409; sessioni revocate e tenute 15 minuti; registro in memoria per l'HTTP; ripiego `SESSION_EXPIRED` oltre la finestra.
7. **Cloudinary che fallisce?** RISOLTA: outbox + sweeper, guardie cartella e condivisione.
8. **Quale token per Helix?** RISOLTA: token app dalle credenziali di `AUTH_CONFIG.twitch`, cache parametrica.
9. **Nome utente nell'audit?** RISOLTA: no; Twitch ID nel `target`, args redatti.
10. **`rescuedCharacters` altrui?** RISOLTA: restano (id senza nome, la FE li conta).
11. **`channel_access_checks`?** RISOLTA: cancellata (chiave Twitch ID senza TTL, D-04).
12. **Job Bull?** RISOLTA: lasciati, no-op.
13. **Bozza guidata?** RISOLTA: `$pull` delle quattro voci + `rev`, bozza vuota cancellata.

## Environment Availability

| Dipendenza | Serve a | Disponibile | Versione | Ripiego |
|------------|------------|-----------|---------|----------|
| Node.js | runtime, fetch | ✓ | v22.12.0 | — |
| jest / mongodb-memory-server / redis-memory-server | test | ✓ | 30 / 11.x / devDependency | — |
| MongoDB di sviluppo | boot reale | ✓ | 8.0 | — |
| Twitch Helix, Cloudinary | via oste, ritratto | rete solo al boot reale | — | fake nei test |

## Validation Architecture

### Test Framework

| Proprietà | Valore |
|----------|-------|
| Framework | Jest 30 + ts-jest, progetti `unit` e `integration` in `package.json` |
| Config | `package.json` (`jest.projects`), `test/setup/global-setup.ts`, `test/setup/after-env.ts` |
| Comando rapido | `npx jest <spec> --selectProjects unit` |
| Integrazione mirata | `npx jest <spec> --selectProjects integration --runInBand` |
| Suite completa | per blocchi `--runInBand`; `npm run test:cov` lo lancia l'orchestratore |
| Type check | `npx tsc --noEmit -p tsconfig.json` a fine task |

### Phase Requirements → Test Map

| Req | Comportamento | Tipo | Comando | File |
|-----|---------------|------|---------|------|
| BE-ACCOUNT-01 | la creazione scrive `user`; indice | integration | `npx jest src/characters/creation/character-creation.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ casi nuovi |
| BE-ACCOUNT-02 | filtri e update puri (corsie, bozze, posti, publicId) | unit | `npx jest src/account/deletion/account-erasure.plan.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-ACCOUNT-02 | transazione: ogni riga dell'inventario cancellata, TTL lasciati, nulla scritto se rifiutata, archiviato senza esiti trovato, WriteConflict concorrente (D-04, D-14) | integration | `npx jest src/account/deletion/account-eraser.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ACCOUNT-02 | wire `deleteMyAccount`: oste → `INNKEEPER_ACCOUNT_PROTECTED`, utente sparito → `UNAUTHENTICATED`, stesso Twitch rientra da zero (D-04, D-16) | integration | `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ACCOUNT-03 | `vacantMarkOf`, `incoherentOf` coi vacanti | unit | `npx jest src/characters/deletion/seat-release.spec.ts src/quests/outcomes/group-roster.spec.ts --selectProjects unit` | ✅ / ❌ |
| BE-ACCOUNT-03 | boss e soccorso avviati con un vacante: si risolvono, posto contato, nessun esito per lui, registrazione tolta alla conclusione (D-13) | integration | `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ✅ casi nuovi |
| BE-ACCOUNT-03 | `QuestRegistration.vacant` anche da lettura lean (coda dell'oste) | integration | `npx jest src/quests/pending-requests --selectProjects integration --runInBand` | ✅ caso nuovo |
| BE-ACCOUNT-04 | refresh → `SESSION_REVOKED`/`accountDeleted`; dopo la scadenza `SESSION_EXPIRED`; socket 4409; riconnessione rifiutata; HTTP col JWT vivo → `UNAUTHENTICATED` (D-03, D-06) | integration | `npx jest test/auth/session-revocation.int-spec.ts test/auth/ws-auth.int-spec.ts --selectProjects integration --runInBand` | ✅ casi nuovi |
| BE-ACCOUNT-04 | registro in memoria con `Clock` | unit | `npx jest src/auth/session/deleted-account.registry.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-ACCOUNT-05 | `portraitPublicIdOf`, outbox, flush, sweeper (ok, not found, errore, condiviso, preimpostato) | unit + integration | `npx jest src/account/deletion/portrait --selectProjects unit` e `--selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ACCOUNT-06 | righe cancellate, disiscrizione dopo il commit, errore del topic non annulla | integration | `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ACCOUNT-07 | adattatore Helix: 200 vuoto, 200 trovato, 401 → ritentativo, 5xx/timeout → unavailable | unit | `npx jest src/auth/twitch/http-twitch-user-directory.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-ACCOUNT-07 | wire oste: quattro codici, bersaglio oste, audit senza nome con Twitch ID (D-15, D-16) | integration | `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ACCOUNT-07 | ganci `argsOf`/`idOfResult` dell'audit | unit | `npx jest src/authz/audit/admin-audit.interceptor.spec.ts --selectProjects unit` | ✅ casi nuovi |
| BE-CONSENT-01 | state con versione; start senza/malformata → `terms_not_accepted`; state vecchio al callback rifiutato (D-09, D-12) | unit + integration | `npx jest src/auth/twitch/oauth-state.service.spec.ts --selectProjects unit`; `npx jest src/auth/twitch/twitch-auth.controller.int-spec.ts test/auth/login-flow.int-spec.ts --selectProjects integration --runInBand` | ✅ da adattare |
| BE-CONSENT-02 | upsert scrive versione e data col `Clock`; bypass dev non scrive | integration | `npx jest src/users/users.service.int-spec.ts src/auth/dev/dev-auth.strategy.int-spec.ts --selectProjects integration --runInBand` | ✅ casi nuovi |
| BE-ACCOUNT-08 | SDL additivo, handler e fixture | integration | `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ pin da aggiornare |

### Sampling Rate
- **Per commit di task:** la spec mirata + `npx tsc --noEmit -p tsconfig.json`.
- **Per piano:** le spec delle cartelle toccate (`src/account`, `src/auth`, `src/characters/deletion`, `src/quests/outcomes`).
- **Gate di fase:** unit completa; integrazione per blocchi `--runInBand`; `test/app.int-spec.ts`; `git diff develop -- src/schema.gql` senza righe tolte; soglie di coverage di `./src/auth/` e `./src/eventsub/`. Regressioni da guardare: `character-deletion.resolver.int-spec.ts`, `character-archiver.int-spec.ts`, `boss-resolution.int-spec.ts`, `twitch-auth.controller.int-spec.ts`.

### Wave 0 Gaps
- [ ] `src/account/deletion/account-erasure.plan.spec.ts`, `account-eraser.int-spec.ts`, `account-deletion.resolver.int-spec.ts`
- [ ] `src/account/deletion/portrait/*.spec.ts` + fake `PortraitStore` in `test/`
- [ ] `src/auth/twitch/http-twitch-user-directory.spec.ts` + fake `TwitchUserDirectory` in `test/auth/`
- [ ] `src/auth/session/deleted-account.registry.spec.ts`
- [ ] Fixture: utente con personaggio corrente, archiviato senza esiti, seat holder di prima su quest avviata, bozza guidata, device, sessione
- Framework: nessuna installazione.

## Security Domain

### Categorie ASVS applicabili

| Categoria | Vale | Controllo |
|-----------|------|-----------|
| V2 Authentication | sì | consenso nel flusso OAuth esistente, state firmato |
| V3 Session Management | **sì** | revoca immediata con motivo, TTL accorciato, socket chiusi, registro per i JWT vivi |
| V4 Access Control | **sì** | via propria solo dal bearer; via oste `@Roles(innkeeper)`; ruolo oste letto dal DB in transazione e rifiutato |
| V5 Input Validation | sì | forma di `termsVersion` e `twitchLogin`, tetto sul filo |
| V6 Cryptography | no (riuso JWT esistente) | — |
| V8 Data Protection | **sì** | inventario completo, nessun nome utente nell'audit, outbox senza legame all'utente |

### Minacce note

| Schema | STRIDE | Mitigazione |
|--------|--------|-------------|
| Un giocatore cancella l'account di un altro | Elevation | nessun argomento nella via propria; via oste solo innkeeper |
| L'oste si cancella o cancella l'oste | Denial of Service | `INNKEEPER_ACCOUNT_PROTECTED` su ruolo letto in transazione |
| `imagePath` puntato a un'immagine altrui per farla distruggere | Tampering | guardia cartella + guardia dei sopravvissuti |
| Sessione ancora usabile dopo la cancellazione | Spoofing | revoca in transazione, 4409, registro dei JWT vivi |
| Push a un cancellato | Information Disclosure | righe cancellate + disiscrizione dal topic |
| Cancellazione a metà | Tampering (integrità) | una transazione; Cloudinary dopo il commit con outbox |
| Login senza consenso | Repudiation | versione firmata nello state, upsert atomico |
| Nome utente conservato nell'audit | Information Disclosure | args redatti |

## Sources

### Primarie (HIGH) — codice del repo BE, ramo `feat/26-eliminazione-account-e-consenso`, 2026-11-24
- `src/characters/deletion/{character-archiver,seat-release,character-deletion.service,character-deletion.exception,character-archive.module}.ts`
- `src/models/{user.model,pending-quest.model,pending-request.model}.ts`, `src/models/character/{character.model,character-quests.model,character-infos.model,ambush-snapshot.model}.ts`, `src/models/quest/{quest.model,quest-registration.model}.ts`, `src/models/quest-result/quest-result.model.ts`
- `src/quests/outcomes/{resolution-loader.service,boss-resolution.service,group-roster,quest-outcome-plan}.ts`, `src/quests/party/{lane-members,party-rules}.ts`, `src/quests/guided/{mission-draft.model,mission-draft.service,guided-completion.service}.ts`
- `src/auth/{auth-session.service,auth.resolver,auth.module,auth-error-code.enum}.ts`, `src/auth/session/*`, `src/auth/ws/*`, `src/auth/twitch/*`, `src/auth/dev/dev-auth.strategy.ts`, `src/auth/channel-access/*`, `src/config/auth-config.ts`
- `src/eventsub/helix/*`, `src/eventsub/{eventsub-message.model,points-credit.service}.ts`, `src/push/{push.service,push-device.registry,push-device.model}.ts`, `src/authz/audit/*`, `src/rest/cloudinary/*`, `src/users/users.service.ts`, `src/mongo/{change-stream-publisher,owners-of}.ts`, `src/queues/enqueue-trigger.ts`
- `test/app.int-spec.ts`, `test/authz/{expected-handlers,handler-fixtures,characters-test-app}.ts`, `test/auth/auth-test-app.ts`, `package.json`
- Sonda in sola lettura del DB di sviluppo (solo conteggi, script cancellato)

### Secondarie
- [CITED] dev.twitch.tv/docs/api/reference/users#get-users
- [CITED] cloudinary.com/documentation/image_upload_api_reference_destroy_by_public_id
- Repo FE in sola lettura: `quest_fragment.dart`, `quest_sheet_details.dart`, `quest_result_sheet.dart`, `session_auth_token_service.dart`, `auth_api_exception.dart`, `dev_auth_token_service.dart`
- Pagine legali: `elimina-account.md`, `privacy.md` §2, §6, §7

## Metadata

**Confidenza per area:**
- Inventario: HIGH — grep esaustivo dei riferimenti più lettura dei modelli.
- Segnaposto: HIGH sui lettori; la scelta A/B è di prodotto.
- Revoca: HIGH sul comportamento attuale; MEDIUM sulla forma (scelta di progetto).
- Cloudinary e Helix: MEDIUM — documentazione ufficiale più due assunzioni dichiarate.
- Validazione: HIGH sui file e comandi esistenti; i test non sono stati eseguiti in questa sessione.

**Data della ricerca:** 2026-11-24
**Valida fino a:** 2026-12-24 (da rifare se cambiano `character-archiver.ts`, `resolution-loader.service.ts` o il flusso di login)

**Numero di piani suggerito:** 10 — (01) `Character.user` alla creazione; (02) consenso su start/state/callback; (03) motivo `accountDeleted`, facciata di revoca e registro dei JWT; (04) funzioni pure della cancellazione e posto vacante nel roster; (05) `AccountEraser` in transazione + `deleteMyAccount`; (06) push e outbox/sweeper dei ritratti; (07) `TwitchUserDirectory` e cache parametrica; (08) `deleteAccountByTwitchLogin` con audit redatto; (09) schema, liste handler, gate; (10) handoff `BACKEND-NOTES.md` e chiusura.

## Addendum — quest avviata annullata alla cancellazione dell'account (ruling PO-1)

**Ruling dell'utente (2026-11-24, verbatim):** «La missione viene annullata automaticamente e i giocatori vengono riportati gratuitamente alla città di partenza con una notifica. Vengono rimborsati del cibo speso per il tragitto» e «Con quest già avviata si intende che tutti i personaggi hanno già raggiunto il luogo della quest, gli slot erano pieni e quindi è effettivamente cominciata la quest. In caso contrario i giocatori attendono semplicemente che un nuovo utente riempia lo slot lasciato vuoto».

Vale **solo** per la cancellazione dell'account (propria o dall'oste); l'archiviazione del personaggio conserva il segnaposto che combatte. D-13 è superata: né A né B.

### A1 — Cosa vuol dire «effettivamente cominciata» nel modello

[VERIFIED: lettura di `quest-start.service.ts`, `party-rules.ts`, `quest-eligibility.ts`]

- Tipi registrati: `worldMission`, `boss`, `enemy`, `aid` (`REGISTERED_TYPES`). Solo quelli di **corsia standard** (`boss`, `enemy`, `aid`) passano da `startParty`; `worldMission` (corsia GM) e `story` non ricevono mai `startedAt` («cominciano all'accettazione e non scadono»). Le quest da soli (hunt, dungeon, job, heal, study, scuole) non hanno altri giocatori: fuori dal ruling.
- `Quest.startedAt` è scritto **solo** da `commitStart`, quando `partyReadinessOf` dice `ready`: registrati ≥ posti (`incomplete` altrimenti) **e** ogni `PendingQuest.arrivedAt` non nullo (`travelling` altrimenti); `startedAt` = arrivo più tardo, e la stessa transazione scrive `startDate` su tutte le PendingQuest dei membri. È esattamente la definizione dell'utente (posti pieni + tutti sul luogo).
- Si azzera solo con un fallimento non conclusivo (`questUpdateOf`) o con `startedQuestResetOf`; la vittoria scrive `concludedAt`.
- **Predicato della cancellazione:** quest con `startedAt != null`, `concludedAt == null`, e almeno una registrazione di un personaggio dell'utente (`registeredAdventurers.character` ∈ personaggi). Per la `aid`, anche il caso del ferito (§A6).
- **Non cominciata ma membri già in viaggio o sul luogo:** a DB è `startedAt == null`, PendingQuest dei membri con `startDate == null` e `arrivedAt` nullo (in viaggio, `status.activeTravel.kind = quest`) o valorizzato (sul marker). Liberare il posto è solo `unstartedSeatReleaseOf` (già nell'archivio): gli altri restano in viaggio o in attesa sul marker; il party si riavvia quando un nuovo iscritto riempie il posto (`tryStart` dopo l'accettazione e l'arrivo) o scade alle 24 ore (`party-timeout`). Nulla da aggiungere. [VERIFIED]

### A2 — Routine esistenti che annullano

| Routine | Cosa fa | Copre il ruling? |
|---------|---------|-------------------|
| `releaseRegisteredWithin` / `releaseMembersWithin` (`registered-release.ts`) | cancella le PendingQuest dei membri **solo se `startDate: null`**, azzera la corsia, svuota `registeredAdventurers`; push `questCancelled` dopo il commit (`notifyQuestCancelled`) | no sulle avviate: le loro PendingQuest hanno `startDate` e vengono saltate con un WARN; non sposta nessuno, non rimborsa |
| Scioglimento a 24 ore (`party-timeout.service.ts`), timeout dell'aid, archivio (aid non avviate) | usano la routine sopra | solo quest non avviate |
| `startedQuestResetOf` (`seat-release.ts`) | `startedAt: null`, `registeredAdventurers: []` | sì per la quest («di nuovo sulla board, libera»); non tocca membri né PendingQuest |
| `abandonQuest` (`party-abandon.service.ts`) | uscita volontaria prima dell'avvio | no |
| push `questCancelled` | tipo esistente, `id` = quest; testo «Il gruppo non si è formato in tempo…» | il tipo sì, il testo no |

**Raccomandazione:** una funzione di sessione nuova accanto alle altre, `cancelStartedQuestWithin(models, questId, session, now)` in `src/quests/party/`: rilegge la quest in sessione con il predicato, per ogni registrato **attivo** di altri utenti cancella la sua PendingQuest di quella quest (qualunque `startDate`), azzera `quests.pendingQuest`, lo riporta in città e gli restituisce il cibo (§A3–A5); cancella anche le PendingQuest dei segnaposto archiviati e dei personaggi dell'utente; applica `startedQuestResetOf`; restituisce `{ questId, characterIds }` per la push. L'`AccountEraser` la chiama **prima** di `archiveWithinReporting`: dopo il reset la quest non ha più registrazioni, quindi l'archivio non marca segnaposto né trova seggi avviati. Solo la cancellazione dell'account la chiama; l'archivio del personaggio resta com'è.

### A3 — «Città di partenza»

Non è registrata: `status.activeTravel` esiste solo durante il viaggio e si azzera all'arrivo (`COMPLETION_UPDATE`); la polilinea ha le coordinate ma non l'id del POI; la PendingQuest non ha l'origine; `LaneClaimSnapshot.location` è solo una guardia del claim. [VERIFIED]

Non serve registrarla: `locationInQuestCity` (`quest-acceptance.service.ts`) accetta una quest di corsia standard **solo** se il personaggio è nella città che contiene il marker (`city.pointsOfInterest` contiene il marker e il personaggio sta sul `markerLocation` della città o su un suo POI). Quindi la città di partenza **è** la città del marker. Destinazione del rientro: `City.markerLocation` della città il cui `pointsOfInterest` contiene `quest.infos.markerLocation` (per la `aid`, il marker della aid). Nessun campo nuovo, nessun dato mancante a DB; un marker senza città (dato rotto) → il membro resta dov'è, WARN. Il rientro insegna la geografia della città come il teleport (`knowledgeAdditionOf` di `geography.ofMarker`).

### A4 — «Cibo speso per il tragitto»

[VERIFIED: `travel/food/*`, `travel-completion.service.ts`, `ambush/ambush-food.ts`, `travel.service.ts`]

- Alla partenza si salva solo il piano (`activeTravel.food`: `needed`, curva, `foodConsumedAt: null`), **nessun consumo** (Phase 20 D-05).
- Il cibo si mangia **una volta** (`mealIsDue`): al confine dei km coperti (sweep, `travel-food.sweep.ts`), all'arrivo (`settleArrivalFood`), alla sosta (teleport, `travel.service.ts`) o al km di un'imboscata (`ambush-food.ts`). `settlementOf` restituisce `consumed: { itemId, quantity }[]` e scrive solo il nuovo `assets.ownedItems`: **le righe mangiate non sono salvate da nessuna parte**, e all'arrivo `activeTravel` sparisce.
- In una quest cominciata tutti sono arrivati: il pasto è già avvenuto per tutti, quindi un rimborso esatto richiede di **registrare le righe** quando si mangia.

**Raccomandazione:** `PendingQuest.travelFoodSpent: { item: ObjectId, quantity: number }[]` interno (`@Prop` con default `[]`, mai `@Field`), aggiunto con `$push`/`$each` nella stessa transazione del pasto quando il viaggio è `kind: quest` e la corsia standard punta a una PendingQuest: sweep, arrivo, imboscata (la sosta del teleport non capita mai su un viaggio da quest: il teleport richiede la corsia libera). Una sola funzione pura (`mealLinesOf` esiste già per le guardie) dà le righe. Il rimborso somma le quantità in `assets.ownedItems` (fusione per `itemId`, stessa forma di `ownedItemsAfter`). Solo andata: non c'è ritorno a piedi. La fame (HP persi) non è cibo: non si restituisce (lettura letterale del ruling; vedi PO-3). Nessun dato pregresso: 0 PendingQuest a DB di sviluppo [VERIFIED: sonda]; una PendingQuest senza il campo rimborsa nulla.

### A5 — Spostare subito un membro

Il teleport dell'oste (`travel.service.ts` `teleport`) **non** si può riusare: `teleportFilter` esige la corsia standard libera. Ma un membro di una quest cominciata è sul marker, senza viaggio (`arrivedAt` di tutti), quindi basta un update condizionale nella transazione:
- filtro: personaggio attivo, `quests.pendingQuest` = la sua PendingQuest di quella quest, `status.activeTravel: null`;
- `$set`: `status.location` = marker della città, `quests.pendingQuest: null`, `assets.ownedItems` col rimborso; `$addToSet` della geografia;
- `deleteOne` della sua PendingQuest.
Nessun job di viaggio da togliere (non viaggia); il job di risoluzione (`pendingQuestId`) diventa `stale` alla lettura. Stati da non toccare: `awaitingAid`, prigione (impossibili per un membro sul marker di una quest avviata). Pubblicazione: `characterUpdated` dal change stream del personaggio (posizione, corsia, borsa); `questUpdated` dal change stream delle quest (reset); nessuna coda dell'oste toccata (corsia standard).

### A6 — Interazioni

- **aid cominciata, il cancellato è soccorritore:** vale il ruling (i soccorritori restanti rientrano, rimborso, push); i feriti restano in attesa e la aid torna non avviata con `registeredAdventurers: []`, `rescue.characters` intatta: nuovi soccorritori possono iscriversi.
- **aid cominciata, il cancellato è il ferito:** l'archivio lo toglie da `rescue.characters`; se restano altri feriti la aid prosegue; se non ne resta nessuno l'archivio la conclude e oggi i soccorritori «si risolvono come individuali» (`21-RESEARCH.md`, `resolution-kind.ts`). Raccomandazione: in quel caso applicare il ruling ai soccorritori (rientro, rimborso, push) — la missione non ha più senso. Da confermare (PO-2).
- **Segnaposto di prima** (personaggi archiviati di altri utenti già su quella quest): non rientrano (non hanno un utente attivo), le loro PendingQuest si cancellano col reset.
- **Compagni, imboscate:** incorporati nel personaggio cancellato; i membri restanti non hanno imboscate pendenti (sono arrivati).
- **Missione guidata:** story/worldMission non cominciano mai: ramo «non cominciata» (posto liberato, richiesta GM del cancellato tolta dall'archivio, bozza ripulita come in §Q1 riga 8).

### A7 — Cosa riceve l'app

- Push di tipo esistente `questCancelled`, `id` = quest, con un corpo proprio (nuovo builder sul modello di `missionStart`/`ambush`, che già sovrascrivono `body`), per esempio «Un compagno è scomparso: la missione è annullata e torni in città». Nessun valore nuovo dell'enum `PushEventType` (che è nello schema).
- Subscription: `characterUpdated` per ogni membro riportato in città, `questUpdated` per la quest tornata sulla board.
- **SDL: nessun cambio** da questo ruling. Rispetto al §Q8 cade `QuestRegistration.vacant`; restano additivi solo le due mutation e `DeletedAccount`. **N5:** non resta mai una registrazione penzolante — non cominciata → posto tolto; cominciata → registrazioni svuotate dal reset.
- Campi nuovi solo a DB: `PendingQuest.travelFoodSpent`.

### A8 — Piani e validazione aggiornati

**Piani: 11.** Il piano 04 «posto vacante» diventa «annullamento di una quest cominciata» (funzione di sessione, destinazione in città, rimborso); si aggiunge un piano «registrazione del cibo speso sulla PendingQuest» (sweep, arrivo, imboscata) da eseguire prima del 04.

| Req | Comportamento | Tipo | Comando | File |
|-----|---------------|------|---------|------|
| BE-ACCOUNT-03 (sostituito) | predicato «cominciata»; destinazione dalla città del marker; rimborso fuso nella borsa | unit | `npx jest src/quests/party/started-quest-cancel.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-ACCOUNT-03 | boss ed enemy cominciati: membri restanti in città, corsia libera, PendingQuest cancellate, cibo restituito, quest con `startedAt` nullo e registrazioni vuote, push `questCancelled` col corpo nuovo; non cominciata (in viaggio, sul marker): solo posto liberato (ruling PO-1) | integration | `npx jest src/account/deletion/account-eraser.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ACCOUNT-03 | aid cominciata col cancellato soccorritore e col cancellato unico ferito (PO-2) | integration | stesso file | ❌ Wave 0 |
| BE-ACCOUNT-03 | l'archivio del personaggio mantiene il segnaposto che combatte (regressione) | integration | `npx jest src/characters/deletion/character-deletion.resolver.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts --selectProjects integration --runInBand` | ✅ esistenti |
| BE-FOOD-SPENT | righe del pasto scritte sulla PendingQuest al confine, all'arrivo, all'imboscata; niente su un viaggio libero | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ✅ casi nuovi |
| BE-ACCOUNT-03 | `characterUpdated` del membro riportato e `questUpdated` della quest | integration | `npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ caso nuovo |

### Domande nuove per il product owner

- **PO-2:** il cancellato era l'**unico ferito** di una aid già cominciata: i soccorritori rientrano in città con rimborso (raccomandato) o si risolve come oggi?
- **PO-3:** «gratuitamente» comprende la restituzione dei **punti canale** spesi per accettare la quest (`PendingQuest.pointsSpent`, come al rifiuto dell'oste) e degli HP persi per fame? Il ruling cita solo il cibo: senza risposta si restituisce solo il cibo.
