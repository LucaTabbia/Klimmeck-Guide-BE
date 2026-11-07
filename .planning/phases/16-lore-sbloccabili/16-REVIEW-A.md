---
phase: 16-lore-sbloccabili
group: A
reviewed: 2026-11-07T13:44:56Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/config/env.validation.ts
  - src/config/lore-config.ts
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
  - src/models/character/character-status.model.ts
  - src/models/quest-result/quest-result.model.ts
  - src/quests/results/quest-result.populate.ts
  - src/quests/results/quest-results-read.module.ts
  - src/quests/results/quest-results.module.ts
  - src/quests/quests.module.ts
  - src/quests/pending-requests/pending-requests.module.ts
  - src/cities/cities.module.ts
  - src/enemies/enemies.module.ts
findings:
  critical: 1
  warning: 0
  info:  3
  total: 4
status: issues_found
---

## Summary

Config, puri, modelli, filtri e moduli sono corretti e coerenti con D-01..D-15: `parseLoreConfig` non ripete mai il valore, il provider ha `ConfigService` opzionale, `knowledgeAdditionOf` vuoto torna `{}`, `knownEnemies` non ha `@Field` ne compare negli input, `findOne` chiusa e inesistente condividono `ResourceNotFoundException.lore()`, `visibleRelated` scarta i ref non popolati prima del confronto, `dropUnresolvedInPlace` non riassegna. Un problema serio: la cache del viewer, con chiave `rootValue`, e condivisa fra i subscriber di `questUpdated` perche il payload del PubSub e un unico oggetto.

## Critical

### A-CR-01: la cache del viewer e condivisa fra subscriber diversi di `questUpdated` (fuga di nemici noti)

**File:** src/lore/viewer-knowledge.service.ts:30-61
**Issue:** `viewerCacheKeyOf` usa `info.rootValue` come chiave. In una subscription `rootValue` e il payload dell'evento; `QuestsPublisher.publishUpdated` (src/quests/quests.publisher.ts:52-53) pubblica UN solo oggetto `{ questUpdated }` sul topic `questUpdated:<id>` e il PubSub di yoga lo consegna per riferimento a tutti i subscriber del topic. `quest(id)`/`questUpdated` sono leggibili da ogni utente autenticato (13.1 D-05), quindi due giocatori che ascoltano la stessa quest eseguono `QuestEnemy.known` con lo stesso `rootValue`: il primo che risolve mette in cache la propria `Promise<LoreVisibility>`, il secondo la riceve senza leggere il proprio personaggio.
**Why it matters:** il secondo giocatore vede `known: true` per nemici che il primo ha sconfitto ma lui no (e viceversa `false` per nemici che conosce): fuga di conoscenza non sbloccata e violazione di D-06/D-07 (il server decide per viewer). Lo stesso vale per una lettura fallita (A-IN-01) che avvelenerebbe tutti. Gli snapshot iniziali sono oggetti nuovi per subscriber e non sono toccati. Il test int-spec attuale (viewer-knowledge.service.int-spec.ts:67-73) prova la scelta della chiave ma non due viewer sullo stesso payload.
**Suggested fix:** RED prima: in viewer-knowledge.service.int-spec.ts due identity diverse (giocatore con il nemico noto, giocatore senza) con lo STESSO `rootValue` e due context distinti devono ottenere due visibilita diverse. Poi cache a due livelli, `WeakMap<object, Map<string, Promise<LoreVisibility>>>`, con seconda chiave `identity?.userId ?? ''` (l'innkeeper e il caso `undefined` restano per chiave propria): una lettura per viewer per evento, mai condivisa fra viewer. Nessun cambio di firma pubblica.

## Warning

Nessuno.

## Info

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
