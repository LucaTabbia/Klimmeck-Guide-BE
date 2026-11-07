---
phase: 16-lore-sbloccabili
group: B
reviewed: 2026-11-07T20:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/characters/creation/character-creation.module.ts
  - src/characters/creation/character-creation.service.ts
  - src/characters/creation/starting-character.ts
  - src/quests/acceptance/quest-acceptance.module.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.updates.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel.module.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.ts
  - src/travel/ambush/ambush-plan.ts
  - src/travel/ambush/ambush-resolution.service.ts
  - src/travel/ambush/ambush-results.ts
  - src/models/character/ambush-snapshot.model.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

## Summary

Gruppo B (HEAD `b0533fc`, diff contro `9103440`) rivisto per intero. Nessun finding critico o warning. Verificato punto per punto:

- Nascita: `buildStartingCharacter` copia la geografia letta prima della transazione, `knownEnemies: []`. Se il reader lancia, la creazione fallisce (come `resolveFor`, nessuna scrittura): comportamento coerente e sicuro. Se la città cambia fra lettura e scrittura il personaggio nasce con la geografia vecchia: finestra trascurabile (catalogo statico, D-36).
- Arrivi: `COMPLETION_UPDATE` e `completionFilter` sono byte-identici; la proiezione aggiunge solo `status.activeTravel.to`. Il secondo `updateOne` sta nello stesso callback, dopo il match del primo, legge con `session` e usa `knowledgeAdditionOf` (vuoto, nessuna scrittura; altrimenti `$addToSet` idempotente sui retry di `withTransaction`). Completamento scaduto (`before` assente) esce prima: nulla scritto (spec «writes nothing on a stale completion»). La deviazione dopo sconfitta imposta `to: detour.to` e insegna solo al completamento (spec lifecycle), POI del territorio ignorati.
- Teleport: geografia letta fuori dal callback, `teleportUpdate` invariato senza geografia; impara il personaggio mosso; filtro della corsia invariato (nessun insegnamento se il teleport non scrive).
- Accettazione: `geography` solo sul ramo `jump`; `laneClaimUpdate` fa lo spread dell'add-to-set nello stesso update condizionale con filtro invariato; il viaggio automatico non insegna alla partenza.
- Imboscate: `knowledgeUpdateOf` solo in vittoria, calcolato sullo snapshot in sessione (`OUTCOME_CHARACTER_PROJECTION` proietta tutto `status`); `loreUnlocked` = `fresh`; `victoryUpdateOf` unisce `$set`/`$push`/`$addToSet` su path disgiunti con `filterOf` invariato; `defeatPlanOf` invariato; `COMBAT_ENEMY_PROJECTION` porta `relatedLore` e `_id` è implicito; i report trattenuti vecchi convertono con `?? []`; `@Prop` con `default: []` sul sottodocumento (Pitfall 3).
- Tipi degli update coerenti fra `travel.updates`, `ambush-plan`, `quest-acceptance.updates` (tutti su `KnowledgeAddition['$addToSet']`). Nessun `Math.random`, `Date.now` o `process.env` nei file del gruppo; nessun log nuovo. Copertura spec adeguata per ogni regola del gruppo.

## Critical

Nessuno.

## Warning

Nessuno.

## Info

### B-IN-01: secondo update dell'arrivo filtrato solo per `_id`

**File:** `src/travel/travel-completion.service.ts:151`
**Issue:** `unlockArrivalGeography` fa `updateOne({ _id: characterId }, addition, { session })` senza riaffermare `activeCharacterById` come fanno gli altri update della fase.
**Why it matters:** oggi è sicuro (stessa transazione del `findOneAndUpdate` appena matchato, conflitti concorrenti → `WriteConflict` e retry), ma la guard di archiviazione/attività del personaggio non è visibile in loco e un futuro refactor che sposti la chiamata fuori dal callback perderebbe la protezione.
**Suggested fix:** usare `activeCharacterById(characterId)` come filtro (nessun cambio di comportamento), con un commento di una riga sul perché.

### B-IN-02: due eventi del change stream per un arrivo che insegna

**File:** `src/travel/travel-completion.service.ts:103`
**Issue:** un arrivo libero su una città produce due scritture sullo stesso personaggio nella stessa transazione, quindi due `characterUpdated` verso il FE (il completamento e l'add-to-set).
**Why it matters:** non è un bug (il secondo evento porta lo stato finale, l'add-to-set è idempotente) e la pipeline `COMPLETION_UPDATE` resta intatta per scelta (C-4), ma il FE potrebbe vedere un breve stato intermedio con posizione nuova e lore vecchie.
**Suggested fix:** nessuna azione di codice; annotare nel BACKEND-NOTES che il FE deve trattare `characterUpdated` come stato idempotente (come già per gli altri update doppi), o verificarlo nel gate FE 17-09.

### B-IN-03: `Lore` registrata inutilmente con `forFeature` in tre moduli

**File:** `src/travel/travel.module.ts:41`, `src/quests/acceptance/quest-acceptance.module.ts:32`, `src/characters/creation/character-creation.module.ts:34`
**Issue:** i tre moduli aggiungono `{ name: Lore.name, schema: LoreSchema }` a `MongooseModule.forFeature`, ma nessun provider dei moduli inietta `Lore` (la usa solo `LoreGeographyReader`, che registra i suoi `City`/`Lore` in `LoreGeographyModule`).
**Why it matters:** codice morto che suggerisce una dipendenza inesistente (Boy Scout Rule).
**Suggested fix:** rimuovere le tre righe e gli import `Lore`/`LoreSchema` se la suite del modulo resta verde (spec RED non necessaria: nessun comportamento cambia).
