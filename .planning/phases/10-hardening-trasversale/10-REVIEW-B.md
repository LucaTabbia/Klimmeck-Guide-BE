---
phase: 10-hardening-trasversale
group: B
reviewed: 2026-10-30T14:56:33Z
depth: standard
files_reviewed: 39
files_reviewed_list:
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
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---
# Phase 10: Code Review Report — gruppo B

## Summary

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

## Critical

Nessun finding critico.

## Warnings

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

## Info

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

## Observed but not flagged (decisioni di CONTEXT/RESEARCH)

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
