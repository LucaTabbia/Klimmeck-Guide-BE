# Deferred items — Phase 9

## 09-04

- `src/models/enemy.model.ts`: `locations` è dichiarato `@Prop({ type: String, enum: Object.values(PoiType) })` mentre il tipo TS e il campo GraphQL sono `PoiType[]` / `[PoiType]`. Un array (anche vuoto) fallisce il cast (`Cast to string failed for value "[]"`), e un valore stringa salvato romperebbe il campo lista non nullo sul filo. Fix atteso: `@Prop({ type: [String], enum: Object.values(PoiType), default: [] })` (il file non è Prettier-clean: commit `style(...)` separato prima). Fuori scope in 09-04 (il piano vieta di modificare il modello); la fixture `buildEnemy` omette `locations`.

## 09-14

- `test/app.int-spec.ts` › `global auth guard › rejects an existing query without a bearer or with a forged one`: fallito una sola volta (40/41) al primo run dopo il montaggio di `QuestOutcomesModule`, poi 41/41 in quattro run consecutivi. Dettaglio non catturato. Da tenere d'occhio nel gate 09-16: se si ripresenta, catturare l'errore (ipotesi da verificare: concorrenza con il reconciler al boot, mai atteso, su DB vuoto).

## 09-16

- Flaky 09-14 del boot reale (`global auth guard › rejects an existing query without a bearer or with a forged one`): **non riprodotto** nel gate 09-16 (suite integration completa 72/72 suite e due run isolati di `test/app.int-spec.ts`, 43/43 ciascuno). Resta da tenere d'occhio in CI; riportato nel handoff (`BACKEND-NOTES.md` §14).
- Il bug `Enemy.locations` (09-04) resta aperto ed è riportato nel handoff (`BACKEND-NOTES.md` §14, note per la BE Phase 10).

## 09-REVIEW (code review fix)

- **WR-02 / flaky del boot reale (09-14):** `QuestResolutionSweeper.onModuleDestroy` ora attende lo sweep in corso (`await this.inFlight?.catch(() => undefined)`) e un flag `stopping` impedisce nuove risoluzioni dopo lo stop. È l'**ipotesi** (non provata: il flaky non è mai stato riprodotto) per il fallimento singolo di `test/app.int-spec.ts › global auth guard`: il reconciler al boot girava concorrente con il teardown dell'harness. Se il flaky si ripresenta in CI, l'ipotesi è falsificata: catturare l'errore.
- **IN-06 (a) change stream non riaperti dopo un errore** (`quest-results.publisher.ts`, `pending-requests.publisher.ts`): pattern preesistente dei publisher di Phase 3/6 (su `error` si logga e basta). Per i risultati la push `questEnd` + `questResult(id)` copre il buco, per la coda del GM no. Riapertura con backoff da fare per tutti i publisher insieme nella **Phase 10 (hardening)**.
- **IN-07 (b) `removeOnFail: false`** in `src/queues/enqueue-trigger.ts`: i job falliti restano in Redis senza ripulitura. Stesso criterio del viaggio Phase 8 (08-REVIEW IN-03 già rinviato): limite `removeOnFail: { count: N }` o TTL nella **Phase 10 (hardening della coda)**.
- **IN-08 (a) target dell'audit di `completePendingRequest`:** resta `{ type: 'QuestResult', id: null }` come documentato nel handoff (`BACKEND-NOTES.md` §9); la PendingQuest è in `args.input.pendingQuestId`. Mettere il `pendingQuestId` in `target.id` sotto `type: 'QuestResult'` etichetterebbe un id con il tipo sbagliato; cambiare `type` cambia il contratto dell'audit. Un decoratore `@AuditTarget` letto dall'interceptor è un'estensione di Phase 3 da decidere con l'utente (Phase 10).

## 09-REVIEW-AMENDMENTS (review 09-17/18/19)

- **IN-13 `commitRescue` oltre le 50 righe** (`src/quests/outcomes/rescue-resolution.service.ts`): snapshot dei soccorritori, feriti in sessione, combattimento, piani e scritture, claim, liberazione/morte e nuova aid in un solo metodo (~90 righe). Refactor fuori scope della correzione: estrarre `fightRescuers(context, session)` (snapshot + combattimento + piani + scritture ⇒ `{ committed, verdicts, fallen }`) e `settleWounded(step, fallen)` (claim fatto ⇒ `liberate`/`kill` + `createAid`) nella **Phase 10**, a comportamento invariato e con gli int-spec del soccorso come rete.
- **IN-15 query dello sweep e dell'archivio senza indici:** a ogni tick `arrivedUnstartedPipeline` (ora anche con il `$lookup` del tipo sulle quest, solo per le PendingQuest arrivate e non avviate), `dueStandardQuestsPipeline`, `formingPartiesFilter`, `backfillRegisteredAt` (`updateMany` con `$elemMatch` su tutte le quest aperte), `dueAidTimeoutsFilter`; l'archivio non scansiona più la collection (IN-01: lettura per `registeredAdventurers.character`). Indici candidati per la **Phase 10**: `characters { deletedAt: 1, 'quests.pendingQuest': 1 }`, `characters { deletedAt: 1, 'status.awaitingAid.since': 1 }`, `quests { 'infos.type': 1, concludedAt: 1, startedAt: 1 }`, `quests { 'registeredAdventurers.character': 1 }`, `pendingquests { quest: 1, startDate: 1, arrivedAt: 1 }`; valutare se il backfill di `registeredAt` debba restare in ogni tick o girare una volta sola dopo il deploy (flag o migrazione). Riportati in `BACKEND-NOTES.md` §16.
