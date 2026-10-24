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
