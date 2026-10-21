---
phase: 07-quest-lanes-quest-04
reviewed: 2026-10-21
depth: standard
files_reviewed: 46
status: issues_found
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
---

# Phase 7: Code Review Report

**Reviewed:** 2026-10-21
**Depth:** standard (con tracciamento cross-file sul percorso di accettazione e su quello di populate)
**Scope:** `git diff --name-only origin/develop...HEAD -- src test .env.example package.json` (46 file), HEAD `345abce`
**Status:** issues_found (nessun Critical, 1 Warning, 4 Info)

## Summary

| Severita | Conteggio |
| -------- | --------- |
| Critical | 0 |
| Warning  | 1 |
| Info     | 4 |

Il percorso di accettazione e solido. Il claim della corsia, la registrazione alla quest condivisa e il debito stanno nella stessa transazione. Ogni rifiuto lancia dentro il callback, quindi la transazione abortisce e non resta nessuna scrittura. Su `WriteConflict` il callback viene rieseguito da `connection.transaction`. Il `pendingQuestId` e generato fuori dal callback, ma il tentativo abortito non lascia nulla, quindi il retry e sicuro. Il filtro di claim riafferma attivo, corsia libera, titolo, posizione e non ripetibilita. Il filtro di registrazione riafferma anti-duplicato e capienza con `$expr`, e il fallback legacy e corretto: nessun party e `requiredAdventurers` a 0 danno `unlimited` senza `$expr`, e un rango assente dal party da `limit` 0, quindi `QUEST_FULL`. Un personaggio non puo occupare la stessa corsia due volte. Due personaggi dello stesso utente passano dal debito atomico `twitchPoints: {$gte}`. `ACTIVE_CHARACTER_FILTER` e presente su ogni scrittura del Character. Gli id malformati non arrivano a Mongo: `questId` passa da `objectIdFromHex` e il personaggio dalla guard e da `requireCharacterObjectId`. Nei log finiscono solo id quest e corsia. Il contratto di `BACKEND-NOTES.md` (codici, ordine dei rifiuti, campi `pointsSpent` e `serverTime`) corrisponde al codice. Le voci sotto sono rifiniture e un caso di dati legacy.

Gli elementi sanzionati dal brief (registrations interne, populate `_id`-only, `ownerOnly`, ordine di rifiuto, `MAX_QUEST_POINTS`, i warning eslint del change stream, ecc.) non sono stati segnalati.

## Warnings

### WR-01: I dati legacy `registeredAdventurers` non contano nella capienza totale (overbooking)

**File:** `src/quests/acceptance/quest-acceptance.updates.ts:60-73` (`takenCountExpr`), `src/quests/acceptance/quest-eligibility.ts:141-153` (`hasCapacity`)
**Issue:** la capienza `total` (party vuoto, `requiredAdventurers > 0`) conta solo `registrations`, il campo interno nuovo, che sui documenti precedenti alla fase vale `[]`. Un personaggio gia presente in `registeredAdventurers` (stringhe di id scritte prima di Phase 7) non occupa alcun posto. Una worldMission o boss legacy con `requiredAdventurers: 2` e due iscritti gia presenti accetta altri due avventurieri e arriva a 4 iscritti. `BACKEND-NOTES.md` (riga 104) promette invece `QUEST_FULL` quando il totale `requiredAdventurers` e raggiunto "sui dati legacy". Il filtro anti-duplicato guarda anche `registeredAdventurers`, e solo il conteggio ignora i legacy, quindi il comportamento e incoerente. Per `perRank` il titolo dei legacy non e noto e non si puo recuperare, ma per `total` si puo.
**Fix:** per la regola `total` usare il massimo tra le due liste, sia nell'`$expr` sia in `hasCapacity` (la pre-verifica deve restare allineata al filtro).
```ts
if (rule.kind === 'total')
    return {
        $max: [
            { $size: REGISTRATIONS_OR_EMPTY },
            { $size: { $ifNull: ['$registeredAdventurers', []] } },
        ],
    };
```
```ts
// hasCapacity, ramo total
const taken = Math.max(all.length, legacyRegistered.length);
```
Aggiungere un test int con una quest legacy che ha `registeredAdventurers` popolato e `registrations` vuoto. Se si decide che i dati legacy non esistono davvero (nessun seed li crea), documentarlo nel BACKEND-NOTES e declassare la voce.

## Info

### IN-01: La verifica della citta cerca il marker solo come ObjectId, mentre altrove si usa `idForms`

**File:** `src/quests/acceptance/quest-acceptance.service.ts:196-207`
**Issue:** `refIdOf` accetta anche il marker legacy salvato come stringa e lo converte in `ObjectId`. Il filtro poi usa `pointsOfInterest: marker` e `pointsOfInterest: location` con la sola forma `ObjectId`, mentre `markerLocation` usa `idForms(location)`. I path `Types.ObjectId` sono Mixed (Pitfall 1 di Phase 4), quindi un POI salvato come stringa non matcha. L'esito e fail-closed (`QUEST_NOT_IN_CITY` per una quest legittima), non una falla di sicurezza, ma e incoerente con la regola `idForms` adottata per il claim.
**Fix:** `pointsOfInterest: { $in: idForms(marker) }` e `{ pointsOfInterest: { $in: idForms(location) } }`.

### IN-02: `classifyUnclaimed` risponde `QUEST_TITLE_MISMATCH` anche se il nuovo titolo soddisfa la quest

**File:** `src/quests/acceptance/quest-acceptance.updates.ts:118-119`
**Issue:** il claim richiede `status.title` uguale a quello letto in pre-lettura. Se tra la lettura e il claim il personaggio sale di titolo (per esempio da rookie ad adventurer) su una quest `minTitle: rookie` accettabile con `>=`, il claim fallisce e il codice restituito e `QUEST_TITLE_MISMATCH`, che e fuorviante. La riga 118 confronta l'uguaglianza e non `meetsTitle`. Il caso e una corsa rara e fail-closed, ma il codice d'errore non descrive la causa reale.
**Fix:** accettare nel filtro l'insieme dei titoli ammessi dalla quest (`'status.title': { $in: titlesMeeting(type, minTitle) }`) e salvare in registrazione il titolo effettivo letto dal claim. In alternativa, documentare nel BACKEND-NOTES che sotto concorrenza il FE puo ricevere `QUEST_TITLE_MISMATCH` e deve semplicemente ritentare.

### IN-03: `startDate` usa `new Date()` mentre `serverTime` usa `Clock`

**File:** `src/quests/acceptance/quest-acceptance.service.ts:139`
**Issue:** il countdown FE e `startDate + waitingTime` confrontato con `serverTime` (orologio `Clock`). Lo `startDate` nasce da `new Date()`. In produzione `SystemClock` coincide, ma le due sorgenti di tempo divergono nei test (`FixedClock`) e `accept` non e testabile in modo deterministico sul timestamp. Va contro l'indirizzo gia preso dal progetto di iniettare `Clock`.
**Fix:** iniettare `Clock` nel service (`this.clock.now()`), esportandolo dal modulo come fa `ServerTimeModule`, e rendere deterministico il test.

### IN-04: Alcuni test di concorrenza non distinguono un'esecuzione seriale da una corsa vera

**File:** `src/quests/acceptance/quest-acceptance.service.int-spec.ts:458-486`, `:685-760`
**Issue:** i test con `Promise.allSettled` verificano l'esito finale (un vincitore, un solo `PendingQuest`, saldo coerente). Se le richieste venissero eseguite una dopo l'altra per un caso di scheduling, il test passerebbe lo stesso senza esercitare il filtro in transazione. Gli esiti restano comunque validi come invarianti di atomicita. Sono test non flaky (le asserzioni valgono in entrambi i casi), ma non provano la corsa. In piu, i test con `heroesRacing` condividono la stessa `world` e dipendono dal `clearDatabase` per test.
**Fix:** per provare il filtro in modo deterministico, aggiungere un test che modifichi lo stato tra la pre-lettura e la transazione, per esempio occupando la corsia con una scrittura diretta dopo `readQuest` tramite uno spy, e verificando `QUEST_SLOT_BUSY` da `classifyUnclaimed`. In alternativa, accettare il limite e lasciarlo come nota.

---

_Reviewed: 2026-10-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
