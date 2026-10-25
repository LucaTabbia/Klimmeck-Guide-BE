---
phase: 09-combat-result-admin-outcomes
fixed_at: 2026-10-25T16:13:49Z
review_path: .planning/phases/09-combat-result-admin-outcomes/09-REVIEW-AMENDMENTS.md
scope: piani 09-17, 09-18, 09-19 (diff a6c7118..d16f01a)
iteration: 1
findings_in_scope: 18
fixed: 14
not_needed: 4
skipped: 0
status: all_fixed
---

# Phase 9 (emendamenti 09-17/18/19): Code Review Fix Report

**Fixed at:** 2026-10-25T16:13:49Z
**Source review:** `.planning/phases/09-combat-result-admin-outcomes/09-REVIEW-AMENDMENTS.md`
**Iteration:** 1
**Fix scope:** `all` (WR-01..03 e IN-01..15, su indicazione dell'orchestratore).

**Summary:**
- Findings in scope: 18 (3 warning, 15 info)
- Fixed: 14 (WR-01, WR-02, WR-03, IN-01, IN-03, IN-04, IN-05, IN-07, IN-08, IN-09, IN-10, IN-11, IN-12, IN-14)
- Not needed: 4 (IN-02, IN-06, IN-13, IN-15), motivazione per ciascuno qui sotto
- Skipped: 0

`status: all_fixed`: ogni rilievo è chiuso, con fix o con un `not_needed` motivato. WR-02 e WR-03 cambiano una condizione o la gestione di uno stato: sono coperti da int-spec, ma conviene comunque una rilettura umana.

Ogni fix di comportamento è passato per TDD: prima il commit `test(...)` con lo spec rosso (RED verificato), poi il commit `fix(...)` che lo porta a verde. I refactor (IN-03, IN-04, IN-05, IN-07/08, IN-09, IN-10) sono coperti dalle suite esistenti, rimaste verdi (IN-04 e IN-05 aggiungono un test unit). Conventional Commits, subject ≤ 72 caratteri, nessun trailer. `src/schema.gql` invariato.

**Gate finale (foreground):** `npm run test:unit` **122 suite / 1829 test** (prima 122 / 1827), `npm run test:int` **75 suite / 975 test** (prima 75 / 967, `--runInBand`, ~162 s, nessun flaky), `npm run build` exit 0, `git diff --exit-code src/schema.gql` pulito.

## Tabella dei rilievi

| ID | Esito | Commit | Test |
|----|-------|--------|------|
| WR-01 | fixed | `5daf18d` (test) → `054dc8f` (fix) | int `quest-acceptance.service.int-spec.ts`: `keeps the acceptance and opens the window when the start fails after the commit`; int `travel-completion.int-spec.ts`: `completes the travel when the start fails after the commit` |
| WR-02 | fixed (logica: rilettura consigliata) | `fb86401` (test) → `de619cf` (fix); `268cc3e` (spec della pipeline) | int `quest-resolution.sweeper.int-spec.ts`: `starts two hunts arrived on the same quest in the same sweep`; unit `quest-resolution.sweeper.spec.ts` (dedupe solo per i registrati); unit `quest-resolution.updates.spec.ts` (`$lookup` del tipo) |
| WR-03 | fixed (logica: rilettura consigliata) | `02182d4` (test) → `2c71cdf` (fix) | int `quest-start.int-spec.ts`: `drops a registered member without a coherent pending quest, then starts with a new member` |
| IN-01 | fixed | `7b48b1b` (test) → `3a573b8` (fix) | int `character-archiver.int-spec.ts`: `leaves alone a started quest the character was not registered on` |
| IN-02 | not_needed | — | default tecnico documentato |
| IN-03 | fixed (refactor) | `87914c8` | suite esistenti (party-timeout, gm-completion, boss) |
| IN-04 | fixed (refactor) | `c613b3c` (`registeredIdsOf`), `de92a16` (lettura del roster) | unit `party-rules.spec.ts`: `reads the registered ids, legacy hex included, skipping the invalid ones`; int `src/quests` 19 suite / 249 test |
| IN-05 | fixed (refactor) | `d61e5e2` | unit `quest-resolution.updates.spec.ts`: `derives the party types from the registered types of the standard lane` |
| IN-06 | not_needed | — | accoppiamento a livello di file, nessun ciclo |
| IN-07 | fixed | `36c4ac9` | — (commento) |
| IN-08 | fixed (refactor) | `36c4ac9` | int dell'accettazione (finestra delle 24 ore) |
| IN-09 | fixed (refactor) | `fb6196f` | int `src/quests/party` |
| IN-10 | fixed (refactor) | `ca87e6e` | int `quest-resolution.processor.int-spec.ts` (Redis vero, 6/6) |
| IN-11 | fixed | `013fd9d` (test e fix insieme) | unit `quest-resolution.sweeper.spec.ts`: testo del log (RED verificato prima del fix) |
| IN-12 | fixed | `63206b0` (test) → `9d5d85c` (fix) | int `party-timeout.int-spec.ts`: `warns with ids only about a legacy member it cannot release` |
| IN-13 | not_needed (differito) | — | `deferred-items.md` |
| IN-14 | fixed (test) | `7c20913`, `6e5d363`; il terzo caso è di WR-02 (`fb86401`) | vedi sotto |
| IN-15 | not_needed (differito alla Phase 10) | — | `deferred-items.md`, `BACKEND-NOTES.md` §16 |

Commit di documentazione: l'ultimo `docs(phase-9): …` (questo report, `09-REVIEW-AMENDMENTS.md`, `deferred-items.md`, `BACKEND-NOTES.md` §16, sign-off in `09-VALIDATION.md`).

## Fixed Issues

### WR-01: `tryStart` dopo il commit non è best-effort

**Files modified:** `src/quests/party/quest-start.service.ts`, `src/quests/outcomes/quest-resolution.sweeper.ts`, `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `src/travel/travel-completion.int-spec.ts`
**Commits:** `5daf18d` (test), `054dc8f` (fix)
**Applied fix:** un solo punto, dentro `QuestStartService`: `tryStart` (l'unico ingresso pubblico, usato da accettazione, arrivo e sweep) incapsula il vecchio corpo, ora `private start`, in `try/catch`. Un errore produce `logger.error` con soli id (quest, PendingQuest) e `describeError` (nome e codice, mai il messaggio del driver), e la risposta è `'stale'`: lo sweep riprova. Quindi `acceptQuest` restituisce il `pendingQuestId` di un'accettazione già committata, `schedulePartyTimeout` gira sempre, l'arrivo del viaggio finisce `completed`. Il `try/catch` dello sweeper attorno a `tryStart`, diventato ridondante, è stato tolto. I test simulano il guasto con uno spy su `Quest.findById` che lancia (la prima lettura di `tryStart`; l'accettazione non lo usa nel percorso di successo, il viaggio mai) e verificano la risposta ok, la corsia e l'arrivo scritti, il job `party-timeout` accodato (accettazione) e un solo log di errore con gli id, `code 112` e senza `raw driver message`.

### WR-02: lo sweep avvia una sola PendingQuest per quest anche per le quest non registrate

**Files modified:** `src/quests/outcomes/scheduling/quest-resolution.updates.ts`, `src/quests/outcomes/quest-resolution.sweeper.ts`, `src/quests/outcomes/quest-resolution.sweeper.spec.ts`, `src/quests/outcomes/quest-resolution.sweeper.int-spec.ts`, `src/quests/outcomes/scheduling/quest-resolution.updates.spec.ts`
**Commits:** `fb86401` (test), `de619cf` (fix), `268cc3e` (spec unit della pipeline, dimenticato nel commit rosso e aggiunto subito dopo)
**Applied fix:** opzione 1 del reviewer. `arrivedUnstartedPipeline` fa un `$lookup` su `quests` (solo per le PendingQuest già filtrate come arrivate e non avviate) e proietta `type`. Nello sweeper la chiave del dedupe (`startKeyOf`) è il `questId` per i tipi registrati (boss/aid/enemy: `tryStart` avvia tutto il party) e il `pendingQuestId` altrimenti (hunt/dungeon/job/heal/study); un tipo mancante (quest sparita o ref legacy stringa) usa il `pendingQuestId`, quindi `tryStart` decide comunque. L'opzione 2 (nessun dedupe) è stata scartata: un party in attesa ha tutti i membri arrivati e non avviati per fino a 24 ore, e ogni tick avrebbe chiamato `readParty` k volte. Test: unit con 5 voci (boss ×2, hunt ×3 di cui una senza tipo) ⇒ 4 `tryStart`; int con due hunt arrivate sulla stessa quest ⇒ entrambe con `startDate` e due job `resolve` dopo un solo `sweep()`. L'int esistente `starts a ready boss party once` (un solo `tryStart`) resta verde.

### WR-03: party pieno con un registrato incoerente, né avvio né scioglimento

**Files modified:** `src/quests/party/quest-start.service.ts`, `src/quests/party/quest-start.int-spec.ts`
**Commits:** `02182d4` (test), `2c71cdf` (fix)
**Applied fix:** nel ramo `dropped` di `startParty`, `dropIncoherent` fa un solo `updateOne` con `partyClaimFilter(questId, registrati letti)` (claim per identità: `$all` + `$size` + `startedAt: null` + `concludedAt: null`) e `$pull` delle registrazioni incoerenti (`idForms`), senza scrivere `startedAt`. Il claim e il `$pull` stanno nello stesso update atomico su un solo documento, quindi non serve una transazione: un membro entrato o uscito nel frattempo fa fallire il claim (`modifiedCount 0` ⇒ `'stale'`, nessuna scrittura). Con il `$pull` riuscito: WARN con soli id (`… rimossi dal party`) e `'waiting'`. Al tick successivo il party risulta incompleto, quindi `disband` lo scioglie a 24 ore oppure un nuovo membro lo completa, e il WARN non si ripete. È la stessa regola di `questUpdateOf` (Pitfall 8). Il test sostituisce `waits when a registered member has no coherent pending quest`: con un boss 2/2 e la PendingQuest di B cancellata, `tryStart` risponde `'waiting'`, la registrazione di B sparisce, `startedAt` resta nullo, nessun job, un WARN con il testo esatto; il secondo `tryStart` non logga più; dopo l'arrivo di un nuovo membro coerente C il party parte con `startDate` = arrivo più tardo e due job. Il ramo silenzioso `rule === 'invalid'` di `disband` (catalogo corretto dopo la registrazione) non è stato toccato: fuori dalla richiesta.

### IN-01: `startedAt` azzerato con un `updateMany` non limitato

**Files modified:** `src/characters/deletion/character-archiver.ts`, `src/characters/deletion/character-archiver.int-spec.ts`
**Commits:** `7b48b1b` (test), `3a573b8` (fix)
**Applied fix:** `releaseSeatsOf` legge in sessione le quest che contengono il personaggio (`'registeredAdventurers.character': { $in: idForms(id) }`, proiezione `_id`). Poi esegue il `$pull` e l'azzeramento di `startedAt` (aperte, avviate, a roster vuoto) solo con `_id: { $in: seatedIds }`. Niente più scansione con `$size` su tutta la collection e niente documenti estranei. Test rosso: una boss avviata con roster vuoto a cui il personaggio non partecipava perdeva `startedAt`, ora lo conserva.
**Nota su `idForms`:** `QuestRegistration.character` è tipizzato `MongooseSchema.Types.ObjectId` (non `Mixed`), quindi Mongoose casta anche la forma esadecimale a ObjectId nel filtro e nel `$pull`. `idForms` qui equivale al solo ObjectId: lo si usa per coerenza con abbandono e `readParty`. Un test con una registrazione legacy salvata come stringa (scritta in raw) è stato provato e scartato, perché quel dato non è raggiungibile da Mongoose su questo path. La convenzione resta una sola (`idForms` ovunque); la ritipizzazione dei ref `Mixed` è già in `BACKEND-NOTES.md` §14.

### IN-03: `ownersOf` duplicato

**Files modified:** `src/mongo/owners-of.ts` (nuovo), `src/quests/party/party-timeout.service.ts`, `src/quests/outcomes/resolution-loader.service.ts`
**Commit:** `87914c8`
**Applied fix:** una funzione pura `ownersOf(userModel, characterIds)` in `src/mongo/owners-of.ts` (importa solo `document-id` e il tipo `UserDocument`, nessun modulo Nest e nessun ciclo). `PartyTimeoutService` la chiama direttamente; `ResolutionLoader.ownersOf` resta come delega di una riga perché `GmCompletionService` la usa già.

### IN-04: `registeredIdsOf` ×4 e lettura del roster duplicata

**Files modified:** `src/quests/party/party-rules.ts`, `src/quests/party/party-rules.spec.ts`, `src/quests/party/party-timeout.service.ts`, `src/quests/party/quest-start.service.ts`, `src/quests/outcomes/boss-resolution.service.ts`, `src/quests/outcomes/rescue-resolution.service.ts`, `src/quests/party/lane-members.ts` (nuovo), `src/quests/outcomes/resolution-loader.service.ts`
**Commits:** `c613b3c`, `de92a16`
**Applied fix:**
- `registeredIdsOf` è una sola funzione pura in `party-rules.ts`, usata da avvio, scioglimento, boss e soccorso. Ha un test unit con un id legacy esadecimale, uno non valido e una voce vuota.
- La dedup del roster è possibile senza moduli Nest: `laneMembersOf(models, questId, registered, projections)` in `src/quests/party/lane-members.ts` riceve i modelli `Character`/`PendingQuest`. Legge i personaggi attivi in corsia standard e le PendingQuest della quest, li accoppia per corsia **nell'ordine di registrazione** e mette gli altri in `dropped`. `readParty` mappa `arrivedAt`/`waitingTime`; `readGroupRoster` aggiunge proprietari (`ownersOf` sui soli membri accoppiati) e `waiting`, e ricalcola `dropped` includendo chi non ha utente. Unico cambiamento osservabile: i posti del roster di gruppo seguono ora l'ordine di registrazione invece dell'ordine della `find`, che è più deterministico. Le int di boss, soccorso, processor e sweeper restano verdi (`src/quests` int 19 suite / 249 test).

### IN-05: `PARTY_TYPES` duplica `REGISTERED_TYPES`

**Files modified:** `src/quests/outcomes/scheduling/quest-resolution.updates.ts`, `src/quests/outcomes/scheduling/quest-resolution.updates.spec.ts`
**Commit:** `d61e5e2`
**Applied fix:** `PARTY_TYPES = Object.values(QuestType).filter(isRegistered && laneOf === standard)`, esportata. Il test fissa l'insieme derivato (`['aid', 'boss', 'enemy']`) e `formingPartiesFilter` usa la costante.

### IN-07 + IN-08: commento stantio e condizione ridondante nell'accettazione

**Files modified:** `src/quests/acceptance/quest-acceptance.service.ts`
**Commit:** `36c4ac9`
**Applied fix:** `const opensPartyWindow = lane === standard && rule !== null && registration.before === 0 && rule.total > 1`. Il commento del marker ora dice «arrivo immediato (l'avvio lo decide QuestStartService)».

### IN-09: provider `Clock` morto e campi mai letti

**Files modified:** `src/quests/party/party.module.ts`, `src/quests/party/party-abandon.service.ts`
**Commit:** `fb6196f`
**Applied fix:** tolto `{ provide: Clock, useClass: SystemClock }` da `PartyModule`; `WaitingSnapshot` e la proiezione di `refusalOf` si riducono a `{ quest }`.

### IN-10: nome `partyTimeoutJob`

**Files modified:** `src/quests/outcomes/quest-resolution.processor.ts`
**Commit:** `ca87e6e`
**Applied fix:** il campo iniettato diventa `parties`, il metodo `partyTimeout`, allineato a `resolve` e `aidTimeout`. Il nome del job Bull (`PARTY_TIMEOUT_JOB`) non cambia.

### IN-11: il log del backfill conta quest

**Files modified:** `src/quests/outcomes/quest-resolution.sweeper.ts`, `src/quests/outcomes/quest-resolution.sweeper.spec.ts`, `src/quests/party/party-timeout.service.ts`
**Commit:** `013fd9d`
**Applied fix:** «`N` quest con registrazioni retrodatate»; il commento di `backfillRegisteredAt` dice che conta le quest toccate. Il test unit sul testo è stato visto rosso prima del fix; test e fix stanno nello stesso commit.

### IN-12: membro legacy saltato in silenzio dallo scioglimento

**Files modified:** `src/quests/party/party-timeout.service.ts`, `src/quests/party/party-timeout.int-spec.ts`
**Commits:** `63206b0` (test), `9d5d85c` (fix)
**Applied fix:** in `releaseMembers`, se la PendingQuest non viene cancellata (già avviata o di un'altra missione) parte un WARN con i soli id di personaggio, missione e PendingQuest, che rimanda alla pulizia manuale di BACKEND-NOTES §16. Test: boss 3 posti con un membro legacy a `startDate` scritto (quest riportata a `startedAt: null`), scaduto. Risultato: `disbanded`, PendingQuest del legacy intatta, un solo WARN con il testo esatto, una sola push `questCancelled` (per il membro liberato).

### IN-14: lacune di test

**Files modified:** `src/quests/party/quest-start.int-spec.ts`, `src/travel/travel-completion.int-spec.ts`
**Commits:** `7c20913`, `6e5d363`; il terzo caso (due hunt nello sweep) è in `fb86401` (WR-02)
**Applied fix:**
- Corsa asimmetrica nell'avvio, con uno spy su `connection.transaction` come in 09-13 e `party-timeout.int-spec.ts`: B abbandona (`$pull`, PendingQuest cancellata, corsia nulla) fra `readParty` e il claim. Risultato: `'stale'`, nessuno `startDate`, `startedAt` nullo, nessun job.
- Arrivo del viaggio dopo lo scioglimento, in due varianti: corsia già nulla (lo stato reale dopo `releaseMembers`) e corsia su una PendingQuest cancellata. In entrambe: `completed`, `activeTravel` nullo, `status.location` = marker, nessun job, nessuna push.

## Not needed

### IN-02: dopo l'abbandono del primo registrato lo scioglimento dipende dal solo sweep

Default tecnico documentato e proposto all'utente il 2026-10-25 (BACKEND-NOTES §16, riga 09-19: «finestra ancorata alla registrazione più vecchia, non riavviata dopo un abbandono»). Il job `party-timeout` originale resta l'unico job accodato; se scatta in anticipo risponde `'waiting'`, e lo scioglimento al nuovo istante lo garantisce lo sweep (`disbandExpiredParties`), con al più un intervallo di ritardo. Con `QUEST_SWEEP_INTERVAL_MS = 0` lo sweep periodico è spento per scelta di deploy (in produzione va tenuto attivo, §15). Ri-accodare dal processor cambierebbe un default già accettato.

### IN-06: `StaleResolution` importata da `outcomes/outcome-writer.service`

L'accoppiamento è solo a livello di file: non c'è nessun ciclo fra moduli Nest (`PartyModule` → scheduling; `PartyLifecycleModule` → party, push, authz; outcomes/acceptance/travel → party), il reviewer lo ha verificato. La classe serve solo a runtime come sentinella e il build e tutte le suite sono verdi. Spostarla in un file foglia è un refactor cosmetico senza effetto sul comportamento.

### IN-13: `commitRescue` oltre le 50 righe

Refactor fuori scope di una correzione di review, perché tocca il percorso più delicato (soccorso di gruppo: morte, liberazione, nuova aid) senza un difetto da correggere. È annotato in `deferred-items.md` con l'estrazione proposta (`fightRescuers`, `settleWounded`) per la Phase 10.

### IN-15: query dello sweep e dell'archivio senza indici

Gli indici sono differiti alla Phase 10 (§14, «nessun indice nuovo» in §15). Gli indici candidati sono ora in `deferred-items.md` e in `BACKEND-NOTES.md` §16: `characters { deletedAt, quests.pendingQuest }`, `characters { deletedAt, status.awaitingAid.since }`, `quests { infos.type, concludedAt, startedAt }`, `quests { registeredAdventurers.character }`, `pendingquests { quest, startDate, arrivedAt }`. Resta da decidere se il backfill di `registeredAt` debba girare a ogni tick o una volta sola. La scansione dell'archivio segnalata qui è già sparita con IN-01.

---

_Fixed: 2026-10-25T16:13:49Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
