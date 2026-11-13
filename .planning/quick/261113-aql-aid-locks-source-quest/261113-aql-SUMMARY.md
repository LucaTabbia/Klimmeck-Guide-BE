---
phase: quick-261113-aql
plan: 01
subsystem: quests
tags: [quests, acceptance, aid, hunt, dungeon, graphql, subscriptions]
key-files:
  created:
    - src/quests/outcomes/aid/rescue-lock.ts
    - src/quests/awaiting-rescue/quest-awaiting-rescue.resolver.ts
    - src/quests/awaiting-rescue/quests-awaiting-rescue.service.ts
    - src/quests/outcomes/aid/rescue-lock.spec.ts
    - src/quests/aid-enemies/quest-faced-enemies.resolver.ts
    - src/quests/maintenance/dungeon-order.report.ts
    - src/quests/maintenance/dungeon-order-report.service.ts
    - src/quests/maintenance/dungeon-order.report.spec.ts
    - src/quests/maintenance/dungeon-order-report.service.int-spec.ts
  modified:
    - src/quests/maintenance/quest-maintenance.module.ts
    - src/quests/maintenance/quest-maintenance.boot.ts
    - src/quests/maintenance/quest-maintenance.boot.spec.ts
    - src/quests/outcomes/dungeon/dungeon-turns.ts
    - src/quests/outcomes/quest-battle.ts
    - src/quests/outcomes/aid/rescue-share.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/dungeon/dungeon-turns.spec.ts
    - src/quests/outcomes/aid/rescue-share.spec.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/aid/aid-opening.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/quests.module.ts
    - src/quests/quests.publisher.ts
    - src/mongo/change-stream-publisher.ts
    - src/schema.gql
    - src/quests/outcomes/aid/aid-opening.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/outcomes/dungeon-aid.int-spec.ts
    - src/quests/quests.publisher.spec.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/quests/quest-updated.subscription.int-spec.ts
    - test/app.int-spec.ts
commits:
  - { hash: ca67e7c2, message: "docs(quick-261113-aql): plan the aid lock on its source quest" }
  - { hash: f734255a, message: "test(quests): lock a hunt or dungeon while its aid is open" }
  - { hash: b429a532, message: "feat(quests): refuse a hunt or dungeon while its aid is open" }
  - { hash: 50e9133e, message: "test(quests): pin awaitingRescue on the wire and its live updates" }
  - { hash: 6ab6eef8, message: "feat(quests): serve awaitingRescue and republish the aid source" }
  - { hash: 72241fb8, message: "test(quests): expect a dungeon aid to show only the groups faced" }
  - { hash: b6e60eab, message: "feat(quests): serve only the groups a dungeon aid rescuer faces" }
  - { hash: 20a268ac, message: "test(quests): expect a dungeon aid to last its share of the dungeon" }
  - { hash: 54692c61, message: "feat(quests): write the share of the dungeon time on its aid" }
  - { hash: 919e348e, message: "docs(quick-261113-aql): record the aid enemies and time from the UAT" }
  - { hash: 94f10929, message: "test(quests): expect a boot report of dungeons not ending on the boss" }
  - { hash: fb75a6d9, message: "feat(quests): report at boot the dungeons not ending on the boss" }
metrics:
  started: 2026-11-13T18:47:07Z
  completed: 2026-11-13
---

# Quick 261113-aql: una hunt o una dungeon con un soccorso aperto nato da lei non si accetta finché l'aid non si chiude

Blocco derivato dalle aid aperte (`rescue.failedQuest`), nessun campo a DB: `acceptQuest` rifiuta con `QUEST_NOT_ACCEPTABLE` leggendo in sessione, `Quest.awaitingRescue: Boolean!` lo serve uguale per tutti con una lettura per richiesta, e il change stream delle quest ripubblica la quest d'origine alla nascita e alla chiusura dell'aid.

## Parole dell'utente (2026-11-13)

> «Quando un personaggio attiva una aid a partire da una hunt o da un dungeon (quindi le uniche quest ripetibili che possono creare una aid) la quest che le ha generate deve risultare strappata e quindi non accettable, finché il soccorso non va a buon fine.»

Risposte dell'utente a due domande dell'orchestratore (scelte fra opzioni proposte): bloccata **per tutti**; torna libera **quando l'aid si chiude**, in ogni modo; se i soccorritori perdono, la nuova aid nata dalla stessa quest prolunga il blocco.

**Supera la D-15 della Phase 21** («Nessun blocco della dungeon per gli altri mentre l'aid è aperta»). La spec «keeps the dungeon open to the others while its aid is open (D-15)» è stata sostituita dal describe «the source quest awaiting its rescue (quick 261113-aql)» di `src/quests/outcomes/dungeon-aid.int-spec.ts`. La D-12 resta: a soccorso riuscito l'aid si chiude e il salvato (come chiunque) può riprendere la dungeon.

## Decisioni

1. **Regola nominata:** `locksWhileRescued(type)` / `RESCUE_LOCKED_TYPES` = `hunt`, `dungeon` in `src/quests/outcomes/aid/aid-opening.ts`, accanto a `opensAid`. `enemy`, `boss` e gli altri tipi restano come sono anche se un'aid aperta punta a loro.
2. **Una sola regola, tre funzioni** in `src/quests/outcomes/aid/rescue-lock.ts`: `openAidsFilter(sources?)` (tipo `aid`, `concludedAt` nullo, eventualmente `rescue.failedQuest` fra le fonti), `questsAwaitingRescue(model, { sources, session })` (una `distinct` di `rescue.failedQuest`, in sessione se data) e `awaitsRescue(quest, awaiting)`. Accettazione e campo del filo usano le stesse.
3. **Accettazione:** `notAwaitingRescueOrReject` è il primo passo del callback della transazione di `QuestAcceptanceService.accept`, prima della dispensa e del claim: legge in sessione solo per hunt e dungeon, rifiuta con `GameRuleException.questNotAcceptable()` (codice esistente `QUEST_NOT_ACCEPTABLE`, messaggio «Missione non disponibile»), nulla scritto. Gli altri tipi non leggono nulla in più.
4. **Filo:** `Quest.awaitingRescue: Boolean!` dal `QuestAwaitingRescueResolver` (`src/quests/awaiting-rescue/`), non per viewer. `QuestsAwaitingRescueService` tiene in memo l'insieme degli id bloccati sulla chiave di `viewerCacheKeyOf` (contesto HTTP o `rootValue` dell'evento WS), senza chiave per viewer perché il valore è uguale per tutti: una sola lettura per la lista `quests` (provato con uno spy sulla `distinct`) e una per evento WS. Le quest di tipo non bloccabile rispondono `false` senza lettura.
5. **Aggiornamento in diretta (via scelta):** il change stream di `QuestsPublisher`. Il filtro ora lascia passare anche l'`insert` dei documenti con `infos.type` = `aid`: all'insert il publisher ripubblica la quest di `fullDocument.rescue.failedQuest`. Su ogni `update` che scrive `concludedAt` (in `updateDescription.updatedFields`) legge `rescue.failedQuest` dell'aid (una lettura per conclusione, solo se il documento è un'aid) e ripubblica la quest d'origine. Passa tutto dal single-flight esistente, quindi una raffica (aid persa: chiusura + nuova aid nella stessa transazione) costa al più due letture e l'ultimo evento riflette lo stato dopo il commit. È la via più piccola coerente col codice: il publisher dichiara già «nessun publish manuale nei servizi», e il change stream arriva dopo il commit per costruzione e copre ogni percorso di chiusura senza toccare i servizi.
6. **Percorsi di chiusura verificati:** tutti scrivono `concludedAt` con un `$set` — soccorso vinto e perso (`questUpdateOf`, «una aid si conclude sempre»), timeout (`RescueResolutionService.timeoutAid`), archiviatore a lista dei feriti vuota (`character-archiver.ts`). Nessun bug trovato. Provato con le aid nate da sconfitte vere in `dungeon-aid.int-spec.ts`.
7. **Indice:** nessuno nuovo. Il filtro ha `infos.type` e `concludedAt` come prefisso dell'indice esistente `quest_forming_parties` (`infos.type`, `concludedAt`, `startedAt`): la lettura scorre solo le aid aperte (poche unità a DB).
8. **Generatore:** una quest bloccata resta aperta a DB (`concludedAt` nullo); il conteggio della copertura del generatore legge le generate aperte, quindi non cambia.
9. Nessun tiro nuovo, nessuna variabile d'ambiente nuova, nessun file di contenuto, nessun migratore.

## SDL (solo additivo)

`git diff develop -- src/schema.gql` mostra solo:

```
 type Quest {
+  awaitingRescue: Boolean!
   id: ID!
```

## RED osservati

- `f734255a`: unit 15 falliti su 30 (`locksWhileRescued` e `rescue-lock.ts` assenti). Integration dell'accettazione (`-t 261113-aql`): 5 falliti — rifiuto di hunt e dungeon per chiunque, blocco con la nuova aid di un soccorso perso (hunt e dungeon), aid nata dopo la pre-verifica. Verdi già in RED, come guardie di non regressione: «accepts a %s again once its aid has concluded», «keeps a %s free when the open aid comes from another quest», «leaves a quest of type %s as it is…» (enemy, boss, job, study, crime). `dungeon-aid.int-spec.ts` falliva alla compilazione (modulo `rescue-lock` assente); i suoi casi verificano i percorsi di chiusura esistenti e sono passati senza toccare quei percorsi.
- `50e9133e`: unit del publisher 4 falliti su 11 (filtro con l'insert, ripubblicazione alla nascita e alla chiusura, aid senza fonte leggibile). Integration: 12 falliti del resolver, 2 stringhe di `type Quest` + il test dello SDL in `test/app.int-spec.ts`, 2 della subscription (anche «stays silent…», che fallisce in RED perché il campo non esiste ancora: è una guardia, non una prova del fix).

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0; `npx tsc --noEmit -p tsconfig.build.json`: 0.
- `npx jest --selectProjects unit`: 282 suite / 3783 test verdi.
- `npx jest src/quests/outcomes --selectProjects integration --runInBand`: 14 suite / 204 test verdi.
- `npx jest src/quests --testPathIgnorePatterns src/quests/outcomes --selectProjects integration --runInBand`: 24 suite / 418 test verdi.
- `npx jest src/characters --selectProjects integration --runInBand`: 23 suite / 390 test verdi.
- `npx jest test/ --selectProjects integration --runInBand`: 17 suite / 275 test verdi.
- Coverage di `./src/quests/acceptance/`: statements 99.09 %, branches 92.95 %, lines 99.74 % (soglia 97 / 91 / 98).
- prettier ed eslint sui file `.ts` toccati: puliti (unico warning `no-base-to-string` alla riga 1082 di `test/app.int-spec.ts`, preesistente, fuori scope). Subject 61, 58, 60, 65, 63 byte, nessun trailer. `pgrep -fl 'Klimmeck-Guide-BE.*bin/jest'` vuoto.

## Deviazioni e note

- **Controllo solo nella transazione.** Nessuna pre-verifica fuori sessione (come chiesto: una sola lettura, una sola regola). Conseguenza: per hunt e dungeon bloccate, i rifiuti che vengono prima (titolo, corsia occupata, città, fame) hanno la precedenza su `QUEST_NOT_ACCEPTABLE`, e la pianificazione del viaggio automatico è calcolata prima del rifiuto (nessuna scrittura, nessun job).
- **Corsa residua dichiarata:** un'aid che nasce dopo la lettura in sessione e prima del commit dell'accettazione non la blocca (hunt e dungeon non hanno registrazione sul documento, quindi non c'è un WriteConflict che la richiuda). Chi accetta in quell'istante ha accettato prima che l'aid esistesse; il caso «aid nata dopo la pre-verifica» invece è rifiutato ed è provato.
- **Aid cancellata a mano da DB:** il change stream non riceve il documento cancellato, quindi la quest d'origine non viene ripubblicata (il valore torna giusto alla richiesta o all'evento successivo). Nessun percorso del codice cancella aid.
- **Handoff:** oltre alla sezione in coda a `BACKEND-NOTES.md`, la voce D-15 del §4 e la riga D-15 del §5 sono marcate «superata» con un rimando alla sezione nuova, per non lasciare al FE un'indicazione contraria.

## Aggiunta dalla UAT: nemici dell'aid di dungeon

**Osservazione dell'utente (2026-11-13, verbatim):** «nella quest aid vedo 4 arbusto maligno. Non dovrei vederne solo 1?»

**Fatto verificato a DB dall'orchestratore:** l'aid di una dungeon da 4 gruppi persa al 2° turno (`rescue.turn { index: 1, kind: fight, total: 8 }`) porta in `infos.enemies` tutti e 4 i gruppi (clone dell'originale, D-09); la risoluzione faceva già affrontare solo i gruppi fino al turno salvato (`facedCatalogOf`) e il premio era già in proporzione, ma il filo serviva l'elenco intero.

**Regola (correzione della Phase 21, coerente con D-12/D-20):** sul filo un'aid con un `rescue.turn` valido (letto con `rescueTurnOf`) mostra solo i gruppi affrontati fino al turno salvato, per ogni viewer; elenco vuoto se la caduta è sulla prima esplorazione. Ogni altra quest (aid senza turno o con turno non valido, dungeon, hunt, boss, anche con un turno spurio) resta com'è.

**Via scelta:** `@ResolveField('infos')` su `Quest` (`QuestFacedEnemiesResolver`, `src/quests/aid-enemies/quest-faced-enemies.resolver.ts`), non un resolver sul tipo dei nemici: `QuestInfos` non conosce `rescue`, mentre `Quest` sì. Un punto solo per `quests`, `quest(id)`, `questUpdated` e per ogni `Quest` annidata servita popolata. Per un'aid col turno l'oggetto `infos` si ricostruisce campo per campo (il documento è idratato, `findOne` / `find` con populate: niente spread né `toObject`), negli altri casi si restituisce il sottodocumento così com'è, quindi il comportamento è identico al resolver di default. Il parent condiviso dell'evento WS non si muta (provato). A DB nulla cambia: l'aid tiene i 4 gruppi, la catena dei soccorsi, il percorso a turni e `savedTurnWarningOf` restano validi e l'aid già aperta nella UAT funziona senza semine.

**Una sola regola:** `facedEnemiesOf(enemies, turn)` in `src/quests/outcomes/dungeon/dungeon-turns.ts` (usa `rescueTurnOf` e `facedEnemyCountOf`, null senza turno valido); `facedCatalogOf` ora la riusa.

**`QuestResult.enemies` del soccorritore:** già giusto prima di questa aggiunta (scritto da `enemyFactsOf` sul catalogo ridotto da `facedCatalogOf`) e già pinnato in `src/quests/outcomes/dungeon-aid.int-spec.ts` («gives the rescuer the xp of the enemy groups faced up to the turn (D-12)», «walks no enemy group when the wounded fell on the first turn», «walks the rescuer through the turns up to the saved one (C-WR-01, D-12, D-21)»): nessun caso nuovo.

**SDL invariato:** `git diff develop -- src/schema.gql` resta di una sola riga (`awaitingRescue`); `test/app.int-spec.ts` verde.

**Spec**

- Unit: `src/quests/outcomes/dungeon/dungeon-turns.spec.ts` (describe «facedEnemiesOf»).
- Filo: `src/quests/quests.resolver.int-spec.ts` (describe «the enemies of a dungeon aid on the wire (quick 261113-aql)»): turni 1/fight → 1 gruppo, 4/exploration → 2, 7/fight → 4, 0/exploration → nessuno, da `quests` e da `quest(id)` per due viewer; a DB 4 gruppi; aid senza turno e con turno non valido → 4; dungeon, hunt e boss, anche con un turno spurio → 4.
- Diretta: `src/quests/quest-updated.subscription.int-spec.ts` (describe «the enemies of a dungeon aid on the event (quick 261113-aql)»): snapshot ed evento con 1 gruppo per due subscriber, payload interno con 4.

**RED (`72241fb8`):** unit 4 falliti su 12 (`facedEnemiesOf` assente); integration 5 falliti (turni 1, 4, 0, il caso del DB, la subscription). Verdi già in RED come guardie: turno 7 (4 gruppi su 4), aid senza turno, turno non valido, dungeon/hunt/boss.

## Aggiunta dalla UAT: durata dell'aid di dungeon

**Regola dell'utente (2026-11-13, verbatim):** «Naturalmente anche il tempo richiesto per il soccorso dev'essere corretto in base a quanto dungeon è stato completato. Se sei al secondo turno su 8, allora dev'essere un quarto. 1 ora dungeon completo -> 15 minuti aid»

**Regola:** `infos.timeToComplete` dell'aid di dungeon si scala con la stessa quota del premio, `rescueShareOf(turno)` = `(index + 1) / total`, scritta alla nascita in `buildAidQuest`. Una sola quota: `aidShareOf(original, turn)` (`src/quests/outcomes/aid/aid-quest.ts`) dà 1 senza turno e, sulla catena, il rapporto delle quote sulla sorgente; la usano sia `proportionalPrizesOf` sia `sharedTimeOf` (`src/quests/outcomes/aid/rescue-share.ts`). Arrotondamento per difetto al millisecondo intero con la stessa tolleranza dei premi; **minimo 1 ms** se l'originale è positivo (0 vorrebbe dire nessuna attesa: un soccorso non dura mai zero); un tempo nullo, zero o non valido resta com'è.

**Cosa non cambia:** il `waitingTime` del `PendingQuest` del soccorritore viene già da `infos.timeToComplete` dell'aid (`waitingTimeOf` in `src/quests/acceptance/quest-eligibility.ts`, corsia standard), quindi risulta in proporzione senza altri cambi (pinnato); il timeout di 7 giorni dell'aid (`AID_TIMEOUT_MS`, `src/quests/outcomes/aid/aid-timeout.ts`) è una costante indipendente e non è toccato; aid senza turno (hunt, enemy, boss, solitarie) tengono il tempo intero; SDL invariato. Le aid già aperte a DB tengono il tempo con cui sono nate (nessun migratore).

**Spec**

- Unit: `src/quests/outcomes/aid/rescue-share.spec.ts` (describe «sharedTimeOf»: 3 600 000 × 1/4 → 900 000, × 5/8 → 2 250 000, × 1 → invariato, per difetto, minimo 1 ms, nullo/zero/negativo invariati); `src/quests/outcomes/aid/aid-quest.spec.ts` («writes the shared time on a dungeon aid fallen on turn %d of 8 at birth», «rescales the time of an already shared aid by the ratio of the shares» 900 000 → 450 000, «keeps the full time on an aid without a turn»).
- Integrazione: `src/quests/outcomes/dungeon-aid.int-spec.ts` «writes a quarter of the dungeon time on the aid born on turn 2 of 8 (quick 261113-aql)» (sconfitta reale, la dungeon resta a 3 600 000); `src/quests/acceptance/quest-acceptance.service.int-spec.ts` «gives the rescuer of a dungeon aid born on turn 2 of 8 a quarter of the dungeon time to wait (quick 261113-aql)» (`waitingTime` 900 000).

**RED (`20a268ac`):** unit 9 falliti (`sharedTimeOf` assente, tempo intero sull'aid); integration 2 falliti (900 000 atteso, 3 600 000 ricevuto — l'attesa del soccorritore seguiva già il tempo dell'aid). Verdi già in RED come guardie: turno 7 di 8 e aid senza turno.

## Gate delle aggiunte

- `npx tsc --noEmit -p tsconfig.json`: 0; `-p tsconfig.build.json`: 0.
- `npx jest src/quests --selectProjects unit`: 75 suite / 1318 test verdi.
- `npx jest src/quests/outcomes --selectProjects integration --runInBand`: 14 suite / 205 test verdi.
- `npx jest src/quests --selectProjects integration --runInBand --testPathIgnorePatterns '/node_modules/' 'src/quests/outcomes/'`: 24 suite / 430 test verdi.
- `npx jest test/ --selectProjects integration --runInBand`: 17 suite / 275 test verdi.
- `git diff develop -- src/schema.gql | grep -cE '^[+-][^+-]'`: 1.
- Deviazione: nel commit GREEN dei nemici ho tipizzato gli array dei gruppi delle due spec nuove (tsc li inferiva `never`), nessun cambio di comportamento.

## Aggiunta dalla UAT: il nemico più forte all'ultimo turno della dungeon

**Regola dell'utente (2026-11-13, verbatim):** «Nelle quest boss e dungeon vorrei che il nemico presnete sul foglio della quest fosse il nemico più forte. Nel caso del dungeon bisogna anche asssicurarsi che il nemico più forte sia presente nell'ultimo turno di combattimento (come un boss di un dungeon)»

**Scelte dell'utente:** il foglio «Va già bene com'è» (la FE mostra già il ritratto del nemico con l'`xp` più alto e l'elenco completo); per l'ordine «Riordino i dati a DB»: l'orchestratore ha già riordinato i dati con uno script fuori repo (40 dungeon su 40 con un nemico dall'`xp` massimo all'ultimo gruppo). Il BE continua a combattere i gruppi nell'ordine scritto: nessun riordino nel codice.

**Cosa fa il BE:** un report di sola lettura al boot, ultimo passo di `QuestMaintenanceBoot` dopo il report dei premi per titolo (stesso stile: WARN con soli id e conteggi, tetto di 20 righe, riga riassuntiva, muto se tutto è in ordine, mai una scrittura, un errore non blocca il boot). Elenca le `dungeon` aperte (`concludedAt` nullo) con almeno due gruppi validi in cui l'ultimo gruppo non ha l'`xp` massimo.

- Regola pura `strongestEnemyIsLast(groups, xpById)` (`src/quests/maintenance/dungeon-order.report.ts`): «più forte» = `xp` più alto del catalogo `Enemy`, `null` (o non numerico) vale 0, la stessa misura del ritratto della FE; a parità basta che uno dei più forti sia in fondo. **Scelta dichiarata:** un gruppo il cui nemico manca dal catalogo è saltato (la risoluzione e il filo scartano le voci orfane, quindi non si combatte); i gruppi si leggono con `validQuestEnemiesOf`, la stessa lettura dell'aid; meno di due gruppi validi = in ordine.
- Servizio `DungeonOrderReportService` (`src/quests/maintenance/dungeon-order-report.service.ts`): due letture (le dungeon aperte, poi gli `xp` dei nemici referenziati in un solo `find`), restituisce `{ checked, outOfOrder }`. Righe: «Ordine della dungeon: missione `<id>` senza il nemico più forte all'ultimo gruppo» e «Ordine della dungeon: N dungeon da riordinare su M».
- `QuestMaintenanceModule` registra anche il modello `Enemy`.

**Per la FE:** nessun cambio. SDL invariato, `test/app.int-spec.ts` verde.

**Spec**

- Unit: `src/quests/maintenance/dungeon-order.report.spec.ts` (ultimo più forte, più forte in mezzo, parità con uno dei più forti in fondo, un solo gruppo o nessuno, `xp` nullo come zero, nemico mancante dal catalogo, testo della riga); `src/quests/maintenance/quest-maintenance.boot.spec.ts` «runs the dungeon order report last without blocking (quick 261113-aql)» e l'ordine dei tre passi.
- Integrazione: `src/quests/maintenance/dungeon-order-report.service.int-spec.ts` (muto quando in ordine, anche con un boss non in ordine e una dungeon da un gruppo; una riga con l'id quando fuori ordine, dungeon conclusa esclusa, nessuna scrittura; tetto e riga riassuntiva).

**RED (`94f10929`):** le due spec nuove fallivano alla risoluzione del modulo (`./dungeon-order.report` assente); nel boot 2 falliti su 3 (terzo passo assente).

**Gate dopo la terza aggiunta:** tsc 0 su `tsconfig.json` e `tsconfig.build.json`; `npx jest src/quests --selectProjects unit` 76 suite / 1326 test; integration di `src/quests` senza `outcomes` 25 suite / 433 test; `test/` 17 suite / 275 test; `src/quests/outcomes` (non toccata dalla terza aggiunta) 14 suite / 205 test al gate precedente; diff dello SDL = 1 riga; nessun jest rimasto attivo.

## Self-Check: PASSED

File creati presenti, commit `ca67e7c2`, `f734255a`, `b429a532`, `50e9133e`, `6ab6eef8`, `72241fb8`, `b6e60eab`, `20a268ac`, `54692c61`, `919e348e`, `94f10929`, `fb75a6d9` presenti in `git log`.
