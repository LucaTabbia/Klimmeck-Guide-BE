---
phase: 09-combat-result-admin-outcomes
fixed_at: 2026-10-26T20:10:00Z
review_path: .planning/phases/09-combat-result-admin-outcomes/09-REVIEW-09-20.md
scope: piano 09-20 (diff d22f638..4fa5208)
iteration: 1
findings_in_scope: 8
fixed: 8
not_needed: 0
skipped: 0
status: all_fixed
---

# Phase 9 (piano 09-20): Code Review Fix Report

**Fixed at:** 2026-10-26T20:10:00Z
**Source review:** `.planning/phases/09-combat-result-admin-outcomes/09-REVIEW-09-20.md`
**Iteration:** 1
**Fix scope:** `all` (WR-01, WR-02, IN-01..06, su indicazione dell'orchestratore).

**Summary:**
- Findings in scope: 8 (2 warning, 6 info)
- Fixed: 8 (WR-01, WR-02, IN-01, IN-02, IN-03, IN-04, IN-05, IN-06)
- Not needed: 0
- Skipped: 0

`status: all_fixed`: ogni rilievo è chiuso con un fix. WR-01 cambia l'ordinamento delle letture (gestione di stato concorrente): è coperto da unit con letture risolte fuori ordine e da un caso int sul filo, ma conviene comunque una rilettura umana.

Ogni fix di comportamento è passato per TDD: prima il commit `test(...)` con lo spec rosso (RED verificato), poi il commit `fix(...)`/`perf(...)` che lo porta a verde. I refactor (IN-02, IN-03, IN-04, IN-05) sono coperti dalle suite esistenti, rimaste verdi. Conventional Commits, subject ≤ 72 caratteri, nessun trailer. `src/schema.gql` invariato.

**Gate finale (foreground):** `npm run test:unit` **124 suite / 1841 test** (prima 122 / 1832), `npm run test:int` **76 suite / 984 test** (prima 76 / 983, `--runInBand`, ~168 s, nessun flaky), `npm run build` exit 0 (ultimo passo), `git diff --exit-code src/schema.gql` pulito, `eslint` e `prettier --check` puliti sui 15 `.ts` toccati.

## Tabella dei rilievi

| ID | Esito | Commit | Test |
|----|-------|--------|------|
| WR-01 | fixed (concorrenza: rilettura consigliata) | `1757b0d` (test) → `689c062` (fix) | unit `quests.publisher.spec.ts`: `reads a quest again only after the previous read of the same quest has published`, `coalesces a burst on the same quest into at most two reads`, `reads different quests independently`; int `quest-updated.subscription.int-spec.ts`: `publishes the latest state last on back-to-back updates of the same quest` |
| WR-02 | fixed | `1bc52c1` (test) | int `quest-updated.subscription.int-spec.ts`: `stops emitting once the quest is concluded and answers NOT_FOUND afterwards` |
| IN-01 | fixed | `b152f8f` (test) → `29f364b` (perf) | unit `subscriber-registry.spec.ts` (3 test); unit `quests.publisher.spec.ts`: `skips the read of a quest nobody subscribed to`; int `quest-updated.subscription.int-spec.ts` (tutti i casi, topic per quest) |
| IN-02 | fixed | `79bf6fa` (refactor) | unit `aid-quest.spec.ts` (invariato, verde) |
| IN-03 | fixed | `d58381e` (refactor) | unit `quests.publisher.spec.ts`, `pending-requests.publisher.spec.ts`; int dei quattro publisher (`quest-updated`, `quest-result-received`, `pending-requests.resolver`, `user-updates.publisher`, `user-updated`) verdi |
| IN-04 | fixed | `d38bfa3` (test) | int `quest-updated.subscription.int-spec.ts` e `pending-requests.resolver.int-spec.ts` verdi |
| IN-05 | fixed | `5c2b755` (test) | int `quest-updated.subscription.int-spec.ts` verde |
| IN-06 | fixed | `f13f175` (test) → `0fbf081` (fix) | unit `quests.publisher.spec.ts`: `closes the stream and stops listening to updates at shutdown`, `drops a read that completes after shutdown started` |

## Fixed Issues

### WR-01: `publishUpdated` concorrente e non serializzata per quest

**Files modified:** `src/quests/quests.publisher.ts`, `src/quests/quests.publisher.spec.ts` (nuovo), `src/quests/quest-updated.subscription.int-spec.ts`
**Commit:** `1757b0d` → `689c062`
**Applied fix:** single-flight per quest con rerun (`Map<id, Promise>` in volo + `Set` dei dirty), sul modello di `PendingRequestsPublisher.requestRefresh`: al più una `findOne` in corso e una in coda per quest, l'ultima parte dopo l'ultimo update, quindi l'ultimo publish riflette sempre lo stato più recente; quest diverse restano indipendenti. Il RED unit usa un fake del modello e due letture risolte fuori ordine (la seconda prima della prima): prima del fix partivano due `findOne` in parallelo e la raffica da tre ne costava tre. Il caso int scrive `$push` di bruno e `$pull` senza attendere eventi in mezzo, attende `[alice]` e poi verifica che nessun evento successivo nella finestra abbia uno stato diverso. Con IN-03 il meccanismo è diventato `KeyedSingleFlight` (`src/mongo/keyed-single-flight.ts`), condiviso con `PendingRequestsPublisher` (chiave unica). `BACKEND-NOTES.md` §5 dice al FE che l'ultimo evento è sempre lo stato più recente e che una raffica può arrivare come meno eventi. La race gemella in `UserUpdatesPublisher` (fuori diff) è annotata in `deferred-items.md`.

### WR-02: finestra di silenzio usata come attesa del change stream

**Files modified:** `src/quests/quest-updated.subscription.int-spec.ts`
**Commit:** `1bc52c1`
**Applied fix:** lo spy su `Logger.prototype.debug` risolve un deferred quando il messaggio contiene l'id della quest; il test attende `withTimeout(discarded, PUBLISHED_WAIT_MS)` e solo dopo apre `expectSilence` (Pitfall 12). L'assert successivo `toHaveBeenCalledWith` è diventato superfluo (la sentinella è l'assert).

### IN-01: rilettura popolata anche senza subscriber

**Files modified:** `src/subscriber-registry.ts` (nuovo), `src/subscriber-registry.spec.ts` (nuovo), `src/pubsub.module.ts`, `src/quests/quests.resolver.ts`, `src/quests/quests.publisher.ts`, `src/quests/quests.publisher.spec.ts`, `src/quests/quest-updated.subscription.int-spec.ts`
**Commit:** `b152f8f` → `29f364b`
**Applied fix:** `SubscriberRegistry extends EventTarget` tiene un `Set` di listener per topic (yoga crea una closure per ogni subscribe, la `removeEventListener` allo stop la toglie) ed è l'`eventTarget` di `createPubSub<PubSubEvents>({ eventTarget })`; il `PubSubModule` (globale) esporta anche `SubscriberRegistry` come provider. `questUpdated` ha ora un topic per quest (`questUpdated: [questId: string, payload]` in `PubSubEvents`, `subscribe('questUpdated', questId)` / `publish('questUpdated', questId, payload)`), quindi il resolver non usa più `pipe`/`filter`; il publisher salta la `findOne` quando `hasSubscribers('questUpdated:<id>')` è falso. La tipizzazione resta pulita (`tsc -p tsconfig.build.json` 0, nessun cast nel modulo) e le subscription esistenti (`characterUpdated`, `userUpdated`, `questResultReceived`, `pendingRequestsUpdated`) non cambiano. Lo stream resta sempre aperto: nessun lazy start, così l'update fra snapshot e apertura del cursore non si perde (D-03). Il listener è agganciato al primo `next()` del Repeater, prima dello snapshot di `subscribeWithSnapshot`, quindi il gate non apre finestre fra snapshot e primo evento.

### IN-02: `AidSlot` duplica `RankSlot`

**Files modified:** `src/quests/outcomes/aid/aid-quest.ts`
**Commit:** `79bf6fa`
**Applied fix:** rimosso `AidSlot`; `aidSlotsOf(...)` e `AidQuestDraft.requirements.requiredAdventurers` usano `RankSlot` di `quest-capacity.ts`. La copia esplicita `map(({ title, count }) => ...)` resta (protetta dal test «without sharing references»).

### IN-03: quattro publisher con lo stesso scheletro e tre stili di log

**Files modified:** `src/mongo/change-stream-publisher.ts` (nuovo), `src/mongo/keyed-single-flight.ts` (nuovo), `src/quests/quests.publisher.ts`, `src/quests/results/quest-results.publisher.ts`, `src/quests/pending-requests/pending-requests.publisher.ts`, `src/users/user-updates.publisher.ts`
**Commit:** `d58381e`
**Applied fix:** `ChangeStreamPublisher<TDocument>` astratta possiede stream, `onModuleInit`/`onModuleDestroy`, logger (`new Logger(this.constructor.name)`), log degli errori dello stream e un `publish` tipizzato sul `PubSub`; le sottoclassi forniscono solo `{ pipeline, options?, subject }` e `onChange`. Il «`codeOf` condiviso» è `describeError` di `src/mongo/mongo-errors.ts`, già esistente (nome + codice Mongo): il `codeOf` locale di `PendingRequestsPublisher` è stato rimosso e tutti e quattro i publisher loggano con `describeError`, nessun messaggio con il testo dell'errore. Il single-flight è estratto in `KeyedSingleFlight` (usato da quest e coda del locandiere; `requestRefresh()` resta pubblico). Diff contenuto (6 file, +173/−185 base e utility comprese), int-spec dei quattro publisher verdi prima e dopo.

### IN-04: `primeQuestsChangeStream` dentro la int-spec

**Files modified:** `test/quests/quests-change-stream.ts` (nuovo), `test/quests/pending-requests-change-stream.ts`, `src/quests/quest-updated.subscription.int-spec.ts`
**Commit:** `d38bfa3`
**Applied fix:** helper spostato in `test/quests/quests-change-stream.ts` con la firma degli altri (`primeQuestsChangeStream(harness)`), una sola sentinella (`persistQuest`) sul suo topic. Dopo il primo evento attende che gli update tardivi della sentinella smettano (`waitForQuiet`, ora esportato da `pending-requests-change-stream.ts`) prima di chiudere la subscription e cancellare la sentinella; in più, con il gate di IN-01, un update che arrivasse dopo la chiusura non trova subscriber e non rilegge: nessun `debug` «conclusa o sparita» nei test successivi. L'unificazione dei quattro helper in un `primeChangeStream` generico è annotata in `deferred-items.md`.

### IN-05: `seq` condiviso fra titoli e `twitchId`

**Files modified:** `src/quests/quest-updated.subscription.int-spec.ts`
**Commit:** `5c2b755`
**Applied fix:** un solo `nextId()` (contatore `lastId`) chiamato sia nel titolo «Il drago N» sia nei due `twitchId`: ogni chiamata dà un valore nuovo, nessun incremento sparso.

### IN-06: publish durante lo shutdown, nessun listener rimosso

**Files modified:** `src/mongo/change-stream-publisher.ts`, `src/quests/quests.publisher.ts`, `src/quests/pending-requests/pending-requests.publisher.ts`, `src/quests/quests.publisher.spec.ts`
**Commit:** `f13f175` → `0fbf081`
**Applied fix:** nella base, `onModuleDestroy` alza `closing` prima della `close()` e dopo rimuove i listener di `change`; il listener di `change` ignora gli eventi a chiusura avviata e `publish` non pubblica più. Le letture con rerun (`QuestsPublisher.publishUpdated`, `PendingRequestsPublisher.publishOnce`) controllano `stopping` all'ingresso, così il rerun in coda non tocca una connessione che si chiude. Scostamento motivato dallo snippet: `removeAllListeners('change')` invece di `removeAllListeners()`, perché togliere anche il listener di `error` farebbe di un eventuale `error` tardivo un'eccezione non gestita dell'`EventEmitter` (abbatte il processo). Vale per tutti e quattro i publisher.

---

_Fixed: 2026-10-26T20:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
