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
  modified:
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

## Self-Check: PASSED

File creati presenti, commit `ca67e7c2`, `f734255a`, `b429a532`, `50e9133e`, `6ab6eef8` presenti in `git log`.
