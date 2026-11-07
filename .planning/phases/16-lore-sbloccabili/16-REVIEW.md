---
phase: 16-lore-sbloccabili
reviewed: 2026-11-07T13:46:07Z
depth: standard (tre reviewer paralleli per area: A conoscenza e visibilità, B movimento e nascita, C esiti e backfill)
files_reviewed: 53
files_reviewed_list:
  - src/app.module.ts
  - src/characters/creation/character-creation.module.ts
  - src/characters/creation/character-creation.service.ts
  - src/characters/creation/starting-character.ts
  - src/cities/cities.module.ts
  - src/config/env.validation.ts
  - src/config/lore-config.ts
  - src/enemies/enemies.module.ts
  - src/lore/knowledge-addition.ts
  - src/lore/known-enemies.resolver.ts
  - src/lore/lore-geography.module.ts
  - src/lore/lore-geography.reader.ts
  - src/lore/lore-geography.ts
  - src/lore/lore-visibility.module.ts
  - src/lore/lore-visibility.ts
  - src/lore/lore.module.ts
  - src/lore/lore.resolver.ts
  - src/lore/lore.service.ts
  - src/lore/related-lore.resolvers.ts
  - src/lore/study-lore-types.ts
  - src/lore/viewer-knowledge.service.ts
  - src/migrations/lore-backfill/lore-backfill.boot.ts
  - src/migrations/lore-backfill/lore-backfill.migrator.ts
  - src/migrations/lore-backfill/lore-backfill.module.ts
  - src/migrations/lore-backfill/lore-backfill.ts
  - src/models/character/ambush-snapshot.model.ts
  - src/models/character/character-status.model.ts
  - src/models/quest-result/quest-result.model.ts
  - src/quests/acceptance/quest-acceptance.module.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.updates.ts
  - src/quests/outcomes/combat/combat-context.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/gm-completion.service.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/rescue-plan.ts
  - src/quests/outcomes/rescue-resolution.service.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/outcomes/victory-knowledge.ts
  - src/quests/pending-requests/pending-requests.module.ts
  - src/quests/quests.module.ts
  - src/quests/results/quest-result.populate.ts
  - src/quests/results/quest-results-read.module.ts
  - src/quests/results/quest-results.module.ts
  - src/travel/ambush/ambush-plan.ts
  - src/travel/ambush/ambush-resolution.service.ts
  - src/travel/ambush/ambush-results.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel.module.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.ts
findings:
  critical: 1
  warning: 0
  info: 8
  total: 9
status: issues_found
---
# Code review — Phase 16 Lore sbloccabili (fusione dei gruppi A, B, C)

I tre report di gruppo (`16-REVIEW-A.md`, `16-REVIEW-B.md`, `16-REVIEW-C.md`) restano la fonte; questo file li fonde per severità.

## Summary

### Gruppo A
Config, puri, modelli, filtri e moduli sono corretti e coerenti con D-01..D-15: `parseLoreConfig` non ripete mai il valore, il provider ha `ConfigService` opzionale, `knowledgeAdditionOf` vuoto torna `{}`, `knownEnemies` non ha `@Field` ne compare negli input, `findOne` chiusa e inesistente condividono `ResourceNotFoundException.lore()`, `visibleRelated` scarta i ref non popolati prima del confronto, `dropUnresolvedInPlace` non riassegna. Un problema serio: la cache del viewer, con chiave `rootValue`, e condivisa fra i subscriber di `questUpdated` perche il payload del PubSub e un unico oggetto.

### Gruppo B
Gruppo B (HEAD `b0533fc`, diff contro `9103440`) rivisto per intero. Nessun finding critico o warning. Verificato punto per punto:

- Nascita: `buildStartingCharacter` copia la geografia letta prima della transazione, `knownEnemies: []`. Se il reader lancia, la creazione fallisce (come `resolveFor`, nessuna scrittura): comportamento coerente e sicuro. Se la città cambia fra lettura e scrittura il personaggio nasce con la geografia vecchia: finestra trascurabile (catalogo statico, D-36).
- Arrivi: `COMPLETION_UPDATE` e `completionFilter` sono byte-identici; la proiezione aggiunge solo `status.activeTravel.to`. Il secondo `updateOne` sta nello stesso callback, dopo il match del primo, legge con `session` e usa `knowledgeAdditionOf` (vuoto, nessuna scrittura; altrimenti `$addToSet` idempotente sui retry di `withTransaction`). Completamento scaduto (`before` assente) esce prima: nulla scritto (spec «writes nothing on a stale completion»). La deviazione dopo sconfitta imposta `to: detour.to` e insegna solo al completamento (spec lifecycle), POI del territorio ignorati.
- Teleport: geografia letta fuori dal callback, `teleportUpdate` invariato senza geografia; impara il personaggio mosso; filtro della corsia invariato (nessun insegnamento se il teleport non scrive).
- Accettazione: `geography` solo sul ramo `jump`; `laneClaimUpdate` fa lo spread dell'add-to-set nello stesso update condizionale con filtro invariato; il viaggio automatico non insegna alla partenza.
- Imboscate: `knowledgeUpdateOf` solo in vittoria, calcolato sullo snapshot in sessione (`OUTCOME_CHARACTER_PROJECTION` proietta tutto `status`); `loreUnlocked` = `fresh`; `victoryUpdateOf` unisce `$set`/`$push`/`$addToSet` su path disgiunti con `filterOf` invariato; `defeatPlanOf` invariato; `COMBAT_ENEMY_PROJECTION` porta `relatedLore` e `_id` è implicito; i report trattenuti vecchi convertono con `?? []`; `@Prop` con `default: []` sul sottodocumento (Pitfall 3).
- Tipi degli update coerenti fra `travel.updates`, `ambush-plan`, `quest-acceptance.updates` (tutti su `KnowledgeAddition['$addToSet']`). Nessun `Math.random`, `Date.now` o `process.env` nei file del gruppo; nessun log nuovo. Copertura spec adeguata per ogni regola del gruppo.

### Gruppo C
Nessun difetto di correttezza o sicurezza. Verificato: dedup per hex e ref malformati scartati in `victoryKnowledgeOf`; `planParticipant` con `won` = verdetto diverso da failure, `loreUnlocked` = sole novità, `update` con `knowledgeAdditionOf` vuoto = `{}` (byte-identico, D-14), sconfitta e `unchangedResult` con `loreUnlocked: []`; `OUTCOME_CHARACTER_PROJECTION` già `status: 1`; tiri dello studio solo con pool e dopo `petDrawOf` (nessun tiro in più per le altre quest, `readCombatCatalog` non legge il pool), chance 0 e 1 corrette (`gate >= chance`), clamp del pick, esclusione per hex incluse le lore della stessa vittoria; `returnCityOf` fuori transazione, `planRescued` aggiunge solo con `cityMarker`; GM e `planCombatant` passano `victoryKnowledgeOf(catalog)` per vincitore; `loreConfigProvider` registrato una volta e `@Optional()` sul loader (default 0.5); backfill idempotente per unione, solo personaggi attivi, `idForms`, nessun set dell'intero insieme, boot che non propaga eccezioni, modulo importato solo da `AppModule` (spec lo prova). Nessun `process.env`, `Date.now` o `Math.random` nuovo (il solo `Math.random` è in `ChanceSource`, preesistente). Spec unit mirate dei file del gruppo verdi (8 suite, 144 test).

## Critical

### Gruppo A

### A-CR-01: la cache del viewer e condivisa fra subscriber diversi di `questUpdated` (fuga di nemici noti)

**File:** src/lore/viewer-knowledge.service.ts:30-61
**Issue:** `viewerCacheKeyOf` usa `info.rootValue` come chiave. In una subscription `rootValue` e il payload dell'evento; `QuestsPublisher.publishUpdated` (src/quests/quests.publisher.ts:52-53) pubblica UN solo oggetto `{ questUpdated }` sul topic `questUpdated:<id>` e il PubSub di yoga lo consegna per riferimento a tutti i subscriber del topic. `quest(id)`/`questUpdated` sono leggibili da ogni utente autenticato (13.1 D-05), quindi due giocatori che ascoltano la stessa quest eseguono `QuestEnemy.known` con lo stesso `rootValue`: il primo che risolve mette in cache la propria `Promise<LoreVisibility>`, il secondo la riceve senza leggere il proprio personaggio.
**Why it matters:** il secondo giocatore vede `known: true` per nemici che il primo ha sconfitto ma lui no (e viceversa `false` per nemici che conosce): fuga di conoscenza non sbloccata e violazione di D-06/D-07 (il server decide per viewer). Lo stesso vale per una lettura fallita (A-IN-01) che avvelenerebbe tutti. Gli snapshot iniziali sono oggetti nuovi per subscriber e non sono toccati. Il test int-spec attuale (viewer-knowledge.service.int-spec.ts:67-73) prova la scelta della chiave ma non due viewer sullo stesso payload.
**Suggested fix:** RED prima: in viewer-knowledge.service.int-spec.ts due identity diverse (giocatore con il nemico noto, giocatore senza) con lo STESSO `rootValue` e due context distinti devono ottenere due visibilita diverse. Poi cache a due livelli, `WeakMap<object, Map<string, Promise<LoreVisibility>>>`, con seconda chiave `identity?.userId ?? ''` (l'innkeeper e il caso `undefined` restano per chiave propria): una lettura per viewer per evento, mai condivisa fra viewer. Nessun cambio di firma pubblica.

### Gruppo B

Nessuno.

### Gruppo C

Nessuno.

## Warning

### Gruppo A

Nessuno.

### Gruppo B

Nessuno.

### Gruppo C

Nessuno.

## Info

### Gruppo A

### A-IN-01: una lettura fallita resta in cache per tutta la richiesta/evento

**File:** src/lore/viewer-knowledge.service.ts:56-60
**Issue:** la `Promise` rifiutata (errore transitorio del DB) viene memorizzata; ogni campo successivo della stessa richiesta rilancia lo stesso errore senza ritentare.
**Why it matters:** comportamento accettabile (un errore per richiesta, nessuna visibilita estesa: fail-closed), ma con A-CR-01 non corretto avvelenerebbe piu subscriber.
**Suggested fix:** dopo A-CR-01 e sufficiente; opzionale `read.catch(() => this.cache.get(key)?.delete(...))` se si vuole un retry per campo.

### A-IN-02: `findAll` passa a `$in` stringhe non verificate come esadecimali

**File:** src/lore/lore.service.ts:20-22
**Issue:** `visibility.lore` contiene qualunque stringa restituita da `documentIdOf` (anche un `_id` non esadecimale di un oggetto legacy dentro `status.unlockedLore`); il cast di Mongoose sull'`_id` lancerebbe un `CastError` e farebbe fallire l'intera `lores`.
**Why it matters:** non raggiungibile con dati scritti dal server (soli ObjectId), solo con dati sporchi a mano.
**Suggested fix:** in `hexSetOf` (lore-visibility.ts:28-30) tenere solo `isObjectIdHex(hex)`; spec RED in lore-visibility.spec.ts con `{ _id: 'zz' }` scartato.

### A-IN-03: due citta sullo stesso marker, scelta non deterministica

**File:** src/lore/lore-geography.reader.ts:33-36
**Issue:** `findOne` senza ordinamento: se due `City` condividono `markerLocation` la geografia sbloccata dipende dall'ordine naturale. Ogni arrivo costa tre letture lean (citta, lore della citta, correlate), nessuna in piu se il marker non ha citta.
**Why it matters:** solo dati ambigui; il comportamento attuale e documentabile.
**Suggested fix:** aggiungere `sort: { _id: 1 }` alle opzioni di `findOne` per rendere il risultato stabile, con una spec nel reader int-spec.

### Gruppo B

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

### Gruppo C

### C-IN-01: helper di dedup duplicato fra victory-knowledge e backfill

**File:** `src/migrations/lore-backfill/lore-backfill.ts:25` (e `src/quests/outcomes/victory-knowledge.ts:31`)
**Issue:** `uniqueIdsOf` e `uniqueByHex` fanno la stessa deduplicazione per esadecimale.
**Why it matters:** micro-duplicazione; il backfill però esce dal repo, quindi il costo è nullo a regime.
**Suggested fix:** nessuna azione: il backfill viene rimosso prima della merge.

### C-IN-02: il boot del backfill ritarda `listen` senza limite di tempo

**File:** `src/migrations/lore-backfill/lore-backfill.boot.ts:12`
**Issue:** `await this.migrator.backfillAll()` in `onApplicationBootstrap` blocca l'avvio finché il passo non termina (mai in errore, ma anche senza timeout). È lo stesso schema di `QuestMaintenanceBoot` e coerente con D-11 (con 4 personaggi è istantaneo).
**Why it matters:** su un DB lento o con un collo di bottiglia il boot reale resterebbe fermo; a regime irrilevante.
**Suggested fix:** nessuna azione; se si volesse, annotare nel handoff che il log `Backfill delle lore: ...` compare prima di `listen`.
