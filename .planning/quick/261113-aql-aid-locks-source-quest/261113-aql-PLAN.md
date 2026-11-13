---
phase: quick-261113-aql
plan: 01
type: tdd
autonomous: true
branch: feat/quick-aid-locks-source-quest
files_modified:
  - src/quests/outcomes/aid/aid-opening.ts
  - src/quests/outcomes/aid/rescue-lock.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/awaiting-rescue/quest-awaiting-rescue.resolver.ts
  - src/quests/awaiting-rescue/quests-awaiting-rescue.service.ts
  - src/quests/quests.module.ts
  - src/quests/quests.publisher.ts
  - src/mongo/change-stream-publisher.ts
  - src/schema.gql
  - src/quests/outcomes/aid/aid-opening.spec.ts
  - src/quests/outcomes/aid/rescue-lock.spec.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/quests/outcomes/dungeon-aid.int-spec.ts
  - src/quests/quests.publisher.spec.ts
  - src/quests/quests.resolver.int-spec.ts
  - src/quests/quest-updated.subscription.int-spec.ts
  - test/app.int-spec.ts
---

# Quick 261113-aql: una hunt o una dungeon con un soccorso aperto nato da lei non si accetta finché l'aid non si chiude

## Parole dell'utente (2026-11-13)

> «Quando un personaggio attiva una aid a partire da una hunt o da un dungeon (quindi le uniche quest ripetibili che possono creare una aid) la quest che le ha generate deve risultare strappata e quindi non accettable, finché il soccorso non va a buon fine.»

Risposte dell'utente a due domande dell'orchestratore (scelte fra opzioni proposte, non frasi sue):

1. **Per chi è bloccata:** per tutti (strappata sul Tabellone di chiunque finché l'aid è aperta).
2. **Se il soccorso finisce male:** torna libera quando l'aid si chiude, in ogni modo (soccorso riuscito, ferito morto per timeout, ferito archiviato); se i soccorritori perdono nasce una nuova aid dalla stessa quest e il blocco continua finché anche quella non si chiude.

## Decisione superata

Questa regola **supera la D-15 della Phase 21** («Nessun blocco della dungeon per gli altri mentre l'aid è aperta (come oggi)»): da oggi una dungeon (e una hunt) con un'aid aperta nata da lei non è accettabile da nessuno. La spec «keeps the dungeon open to the others while its aid is open (D-15)» di `src/quests/outcomes/dungeon-aid.int-spec.ts` viene sostituita dalle prove della regola nuova. La D-12 (il salvato torna libero e può rifare la dungeon) resta: a soccorso riuscito l'aid si chiude e la dungeon torna accettabile.

## Stato di partenza

- `QuestRescue.failedQuest` (`src/models/quest/quest-rescue.model.ts`) è la quest del primo combattimento perso; una catena clona sempre l'originale, quindi la nuova aid nata da un soccorso perso punta alla stessa quest.
- Ogni chiusura di un'aid scrive `concludedAt` con un `$set`: risoluzione del soccorso, vinto o perso (`questUpdateOf`, `src/quests/outcomes/quest-outcome-plan.ts`: «una aid si conclude sempre»), timeout (`RescueResolutionService.timeoutAid`), archiviatore a lista dei feriti vuota (`character-archiver.ts`).
- `acceptQuest` (`QuestAcceptanceService.accept`): pre-letture lean, regole pure (`classifyEligibility`), poi una transazione con le guardie riaffermate nel filtro.
- `questUpdated` nasce dal change stream delle quest (`QuestsPublisher`, solo `update`/`replace`): la nascita di un'aid è un `insert` di un altro documento e la sua chiusura un `update` dell'aid; la quest d'origine non cambia, quindi oggi nessun evento la raggiunge.

## Design (fissato dall'orchestratore)

1. **Sorgente unica del blocco, derivata:** «Q è in attesa di soccorso» ⇔ esiste una quest di tipo `aid` con `concludedAt` nullo e `rescue.failedQuest` = Q. Nessun campo nuovo a DB, nessun migratore.
2. **Tipi:** solo `hunt` e `dungeon` (le ripetibili che aprono un'aid). Funzione pura `locksWhileRescued(type)` accanto a `opensAid` in `src/quests/outcomes/aid/aid-opening.ts`. `enemy` e `boss` persi restano come sono.
3. **Una sola regola:** `src/quests/outcomes/aid/rescue-lock.ts` con il filtro delle aid aperte (`openAidsFilter`), la lettura degli id bloccati (`questsAwaitingRescue`, una `distinct` di `rescue.failedQuest`, in sessione se data) e il predicato `awaitsRescue(quest, awaiting)`. L'accettazione e il campo del filo usano le stesse tre funzioni.
4. **Accettazione:** dentro la transazione, prima del claim della corsia, letta in sessione: hunt/dungeon in attesa di soccorso → `QUEST_NOT_ACCEPTABLE` (codice esistente), nulla scritto. Nessun codice nuovo.
5. **Filo (solo additivo):** `Quest.awaitingRescue: Boolean!`, resolve field uguale per tutti (non per viewer). Una sola lettura per richiesta HTTP e per evento WS (memo sulla chiave di `viewerCacheKeyOf`, come `noEffect`), quindi nessun N+1 sulla lista `quests`.
6. **Aggiornamento in diretta:** `QuestsPublisher` osserva anche l'`insert` delle quest di tipo `aid` (ripubblica `rescue.failedQuest` letto dal `fullDocument`) e, sugli `update` che scrivono `concludedAt`, legge `rescue.failedQuest` dell'aid e ripubblica la quest d'origine. Tutto passa dal change stream, quindi dopo il commit per costruzione; nessun publish manuale nei servizi (coerente col commento del publisher).
7. **Indice:** nessun indice nuovo. Il filtro porta `infos.type` = `aid` e `concludedAt` nullo, prefisso dell'indice esistente `quest_forming_parties` (`infos.type`, `concludedAt`, `startedAt`): la lettura scorre le sole aid aperte (poche unità).
8. **Generatore:** una quest bloccata resta aperta a DB, quindi il conteggio della copertura non cambia.
9. Nessun tiro nuovo, nessuna variabile d'ambiente nuova, nessun file di contenuto.

## Task

1. **Documenti** — questo piano. Commit `docs(quick-261113-aql): …`.
2. **TDD regola + accettazione**
   - RED (`test(quests): …`), titoli con «(quick 261113-aql)»:
     - `aid-opening.spec.ts`: `locksWhileRescued` vero solo per `hunt` e `dungeon`.
     - `rescue-lock.spec.ts`: filtro delle aid aperte; `awaitsRescue` vero solo per hunt/dungeon presenti nell'insieme.
     - `quest-acceptance.service.int-spec.ts`: hunt con aid aperta rifiutata con `QUEST_NOT_ACCEPTABLE` per un altro personaggio e per chiunque, nulla scritto; dungeon idem; aid conclusa → di nuovo accettabile; aid conclusa + nuova aid aperta dalla stessa quest → ancora rifiutata; `boss`, `enemy` e gli altri tipi con un'aid aperta che punta a loro → invariati; aid aperta nata dopo la pre-verifica → rifiuto dalla lettura in sessione.
     - `dungeon-aid.int-spec.ts`: dungeon persa davvero → bloccata; soccorso vinto → libera; soccorso perso → nuova aid, ancora bloccata; timeout → libera; archiviatore → libera (sostituisce la spec D-15).
   - GREEN (`feat(quests): …`).
3. **TDD filo**
   - RED: `test/app.int-spec.ts` (le due stringhe di `type Quest` con `awaitingRescue: Boolean!`); `quests.resolver.int-spec.ts` (`awaitingRescue` vero per hunt/dungeon con aid aperta, falso altrimenti e per tutti i viewer, una sola lettura delle aid aperte per la lista `quests`); `quests.publisher.spec.ts` (insert di un'aid e chiusura di un'aid → ripubblica la quest d'origine); `quest-updated.subscription.int-spec.ts` (sul filo: alla nascita `awaitingRescue` vero, alla chiusura falso).
   - GREEN con `src/schema.gql` rigenerato dal boot reale di test e committato: `git diff develop -- src/schema.gql` mostra solo la riga aggiunta.
4. **Chiusura** — SUMMARY, riga nella tabella «Quick Tasks Completed» di `.planning/STATE.md`, sezione «Aggiornamento 2026-11-13 — quick 261113-aql» in coda a `.planning/phases/21-premi-per-rango-e-soccorsi/BACKEND-NOTES.md`. Commit `docs(quick-261113-aql): …`.

## Vincoli

- Regole di `.planning/phases/21-premi-per-rango-e-soccorsi/21-REPO-RULES.md`, col branch di questo quick task e lo scope dei documenti `quick-261113-aql`.
- Il BE dell'utente gira da `dist/` e una UAT su device è in corso: niente `npm run build/lint/format`, DB reale e processo non si toccano; prettier ed eslint sui soli file toccati; `npx tsc --noEmit -p tsconfig.json` a 0 a fine di ogni task.
