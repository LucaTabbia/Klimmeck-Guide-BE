---
phase: 07-quest-lanes-quest-04
fixed_at: 2026-10-21T00:00:00Z
review_path: .planning/phases/07-quest-lanes-quest-04/07-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 0
not_needed: 1
status: complete
outcomes:
  WR-01: fixed
  IN-01: not_needed
  IN-02: fixed
  IN-03: fixed
  IN-04: fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-10-21
**Source review:** .planning/phases/07-quest-lanes-quest-04/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01, IN-01..IN-04)
- Fixed: 4 (WR-01, IN-02, IN-03 con test e correzione; IN-04 con due test deterministici)
- Skipped: 0
- Not needed: 1 (IN-01: la premessa non vale per `City.pointsOfInterest`, verificato)

Ogni cambio di comportamento è passato in TDD: lo spec nuovo o aggiornato è stato eseguito prima in rosso, poi la correzione lo ha reso verde. Spec e correzione stanno nello stesso commit, uno per finding, senza trailer. `src/schema.gql` è invariato e `BACKEND-NOTES.md` non ha richiesto modifiche. Dopo WR-01 il contratto documentato (§3, `QUEST_FULL` sul totale `requiredAdventurers` dei dati legacy) è vero. Prima non lo era.

| Finding | Esito | Commit | Nota |
| ------- | ----- | ------ | ---- |
| WR-01 | fixed | `4c5e57c` | La regola `total` conta `max(size(registrations), size(registeredAdventurers))`, sia nell'`$expr` sia in `hasCapacity`. La regola `perRank` resta sulle `registrations` per titolo. |
| IN-01 | not_needed | n/a | `pointsOfInterest` è un array castato a ObjectId: `$in: idForms(x)` diventerebbe due ObjectId uguali. Nessun writer dell'app scrive città, e sui dati reali i POI sono tutti ObjectId. |
| IN-02 | fixed | `c788407` | `classifyUnclaimed` giudica il titolo con `meetsTitle`. Un titolo cambiato ma ancora ammesso dà `QUEST_SLOT_BUSY` (corsa), non `QUEST_TITLE_MISMATCH`. |
| IN-03 | fixed | `5add7a3` | `startDate` viene da `Clock` (`SystemClock` fornito in `QuestAcceptanceModule`). L'int-spec usa un `FixedClock` e verifica l'uguaglianza esatta. |
| IN-04 | fixed | `51a7ee0` | Due casi deterministici cambiano lo stato fra la pre-verifica e la transazione. Il rifiuto può venire solo dal filtro. |

## Fixed Issues

### WR-01: i `registeredAdventurers` legacy non contavano nella capienza totale

**Cosa non andava:** con `party` vuoto e `requiredAdventurers > 0` la capienza contava solo `registrations`, che sui documenti precedenti alla fase vale `[]` o manca. Una worldMission o boss legacy con gli iscritti solo in `registeredAdventurers` accettava altri avventurieri oltre il totale (overbooking). Era contrario anche alla riga `QUEST_FULL` di `BACKEND-NOTES.md`.

**Files modified:** `src/quests/acceptance/quest-acceptance.updates.ts`, `src/quests/acceptance/quest-eligibility.ts`, `src/quests/acceptance/quest-acceptance.updates.spec.ts`, `src/quests/acceptance/quest-eligibility.spec.ts`, `src/quests/acceptance/quest-acceptance.service.int-spec.ts`
**Commit:** `4c5e57c` fix(quests): count legacy adventurers in the total quest capacity

**Test aggiunti (rossi prima della correzione):**
- unit `takenCountExpr`: per `total` l'espressione è `$max` delle due `$size` con `$ifNull`;
- unit `hasCapacity`: due id legacy su `limit` 2 danno "pieno". Una registrazione più un id legacy su `limit` 2 hanno ancora posto (il massimo, non la somma, perché ogni nuova iscrizione scrive in entrambe le liste). I legacy sono ignorati per `perRank`, e le liste assenti valgono vuote;
- unit `classifyEligibility`: una worldMission legacy con `requiredAdventurers: 1` e un id legacy dà `QUEST_FULL`;
- int "rejects a legacy world mission whose total is taken by legacy adventurers with QUEST_FULL": la quest legacy ha `requiredAdventurers: 1`, un id solo in `registeredAdventurers` e `registrations` rimosso. Il risultato è `QUEST_FULL`, la quest resta intatta, la corsia `null`, 0 `PendingQuest` e il saldo invariato;
- int "the registration filter counts the legacy adventurers in the total": il `registrationFilter` reale non trova il documento legacy su Mongo (`countDocuments` 0), quindi la guard `$expr` regge anche senza la pre-verifica.

**Correzione:** in `takenCountExpr`, per `total`, `$max: [{ $size: registrations∨[] }, { $size: registeredAdventurers∨[] }]`. `hasCapacity(rule, roster)` riceve un `QuestRoster` (`registrations`, `registeredAdventurers`), da cui eredita `QuestEligibilitySnapshot`. Il ramo `total` usa `Math.max` delle due lunghezze. `UnregisteredSnapshot` diventa alias di `QuestRoster` (Boy Scout: un solo tipo per la stessa forma).

### IN-02: `classifyUnclaimed` riportava `QUEST_TITLE_MISMATCH` per un titolo ancora ammesso

**Cosa non andava:** dopo un claim fallito il classificatore confrontava il titolo riletto per uguaglianza con quello della pre-lettura. Un personaggio salito di titolo nel frattempo (rookie → adventurer su una hunt `minTitle: rookie`) riceveva `QUEST_TITLE_MISMATCH`, che non descrive la causa reale.

**Files modified:** `src/quests/acceptance/quest-acceptance.updates.ts`, `src/quests/acceptance/quest-acceptance.updates.spec.ts`, `src/quests/acceptance/quest-acceptance.service.ts`
**Commit:** `c788407` fix(quests): judge the title of a failed claim with meetsTitle

**Test aggiunti:**
- unit "a title raised to one the quest still admits is not QUEST_TITLE_MISMATCH": hunt `minTitle: rookie`, titolo riletto adventurer. Il risultato è `QUEST_SLOT_BUSY` (in rosso prima della correzione);
- unit "a title that no longer meets minTitle is QUEST_TITLE_MISMATCH": hunt `minTitle: paladin`, titolo riletto adventurer, risultato `QUEST_TITLE_MISMATCH`;
- il caso story esistente (titolo cambiato su story ⇒ `QUEST_TITLE_MISMATCH`) resta verde, perché la story vuole il titolo esatto.

**Correzione:** `classifyUnclaimed(fresh, quest: ClaimedQuest, expected)`, dove `ClaimedQuest` contiene `{ id, type, minTitle }`. Corsia e ripetibilità derivano dal tipo (`laneOf`, `isRepeatable`) e il titolo si giudica con `meetsTitle`, la stessa regola della pre-verifica. Il filtro di claim mantiene l'uguaglianza su `status.title`: la registrazione salva il titolo letto e la capienza per rango deve restare coerente con quel titolo. Un titolo cambiato ma ammesso ricade quindi su `QUEST_SLOT_BUSY`, il codice "corsa, ritenta" già documentato al §3 punto 4. `LaneClaim` nel service porta `quest: ClaimedQuest` al posto di `lane`, `questId` e `repeatable`. Comportamento documentato invariato: nessuna modifica a `BACKEND-NOTES.md`.

### IN-03: `startDate` usava `new Date()` invece del `Clock`

**Cosa non andava:** `serverTime` viene da `Clock`, mentre lo `startDate` del `PendingQuest` veniva da `new Date()`. Erano due sorgenti di tempo diverse, e il timestamp non era verificabile in modo deterministico nei test.

**Files modified:** `src/quests/acceptance/quest-acceptance.service.ts`, `src/quests/acceptance/quest-acceptance.module.ts`, `src/quests/acceptance/quest-acceptance.service.int-spec.ts`
**Commit:** `5add7a3` fix(quests): take the pending quest startDate from the injected Clock

**Test:** l'int-spec del service sovrascrive `Clock` con `FixedClock(2026-03-04T05:06:07Z)` (`overrideProvider(Clock)`). Il test "claims the story lane…" ora verifica `startDate` uguale al valore del clock, al posto della finestra `t0..now`. In rosso: atteso `2026-03-04T05:06:07.000Z`, ricevuto l'ora reale.

**Correzione:** `QuestAcceptanceService` inietta `Clock` e scrive `startDate: this.clock.now()`. `QuestAcceptanceModule` fornisce `{ provide: Clock, useClass: SystemClock }` in locale, come `ServerTimeModule`. Resolver invariato. Il boot reale (`test/app.int-spec.ts`, 29/29) e l'int-spec del resolver (16/16) risolvono la DI senza modifiche.

### IN-04: i test di concorrenza non distinguevano un'esecuzione seriale da una corsa

**Cosa non andava:** i test con `Promise.allSettled` provano l'invariante (un vincitore, N−1 rifiuti), ma non garantiscono che le richieste si siano sovrapposte. Se fossero state serializzate, il rifiuto sarebbe potuto venire dalla pre-verifica e non dal filtro in transazione.

**Files modified:** `src/quests/acceptance/quest-acceptance.service.int-spec.ts`
**Commit:** `51a7ee0` test(quests): prove the claim and capacity guards inside the transaction

**Test aggiunti:** l'helper `interleaveBeforeTransaction` mette uno spy su `connection.transaction`. La scrittura rivale viene eseguita dopo la pre-verifica e subito prima della transazione reale. Il risultato è deterministico, senza sleep né asserzioni sui tempi.
- "rejects with QUEST_SLOT_BUSY when the lane is taken after the pre-check, writing nothing": la corsia story viene occupata da un id rivale. Il risultato è `QUEST_SLOT_BUSY`, transazione chiamata 1 volta, corsia ancora del rivale, 0 `PendingQuest` e saldo invariato;
- "rejects with QUEST_FULL when the rank fills after the pre-check, writing nothing": l'unico posto hero viene preso da un rivale. Il risultato è `QUEST_FULL`, `registeredAdventurers` contiene solo il rivale, la corsia `null`, 0 `PendingQuest` e il saldo invariato.

**Prova che esercitano il filtro:** con una mutazione temporanea ho tolto `[lanePathOf(lane)]: null` dal claim e l'`$expr` di capienza dalla registrazione, ed entrambi i test sono diventati rossi. Il sorgente è stato poi ripristinato con `git checkout`. Il codice di produzione resta invariato: è un commit di soli test.

## Not Needed

### IN-01: la query della città cerca i POI solo come ObjectId

**File:** `src/quests/acceptance/quest-acceptance.service.ts:196-207`
**Motivo:** la premessa (path `Mixed`) vale per `City.markerLocation`, non per `City.pointsOfInterest`. Lo schema `[{ type: Types.ObjectId }]` produce un array castato: una sonda sullo schema compilato dà `Array` con caster `ObjectId`, mentre `markerLocation` è `Mixed`. Mongoose converte `pointsOfInterest: { $in: idForms(x) }` in `[ObjectId, ObjectId]`, quindi la correzione proposta è un no-op. Il test di integrazione scritto per il caso (POI salvati come stringa via driver) è rimasto rosso anche dopo la modifica. Nessun writer dell'app scrive `City` (`CitiesService` legge e basta). Sui dati reali (07-RESEARCH Q4) i 642 elementi di `pointsOfInterest` sono tutti ObjectId. Tentativo e test sono stati annullati (`git checkout`), quindi non c'è nessun commit. Coprire stringhe scritte a mano richiederebbe una query sul driver che salti il cast: è una scelta da prendere solo se un import legacy le introducesse.
**Original issue:** `pointsOfInterest: marker` / `pointsOfInterest: location` usano solo la forma ObjectId, mentre `markerLocation` usa `idForms`.

## Verifica finale

- `npx jest src/quests/acceptance src/gameRules --selectProjects unit`: 146/146
- `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand`: 38/38
- `npx jest src/quests/acceptance/accept-quest.resolver.int-spec.ts --selectProjects integration --runInBand`: 16/16
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (boot reale, DI del `Clock`): 29/29
- `npm run build`: exit 0; `npx eslint` e `npx prettier --write` sui soli file toccati: puliti
- `git diff --exit-code 13eabf5 -- src/schema.gql`: exit 0
- invarianti: nessun `$inc`, `coins` o `twitchPoints` nel codice di produzione di `src/quests`; `ownerOnly: true` una sola volta in produzione; nessun log nuovo

---

_Fixed: 2026-10-21_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
