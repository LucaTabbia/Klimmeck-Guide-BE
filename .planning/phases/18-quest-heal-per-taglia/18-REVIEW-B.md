---
phase: 18-quest-heal-per-taglia
group: B
reviewed: 2026-11-10T15:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/characters/items/item-use.plan.ts
  - src/characters/items/item-use.plan.spec.ts
  - src/characters/items/item-use.service.ts
  - src/characters/items/item-use.service.int-spec.ts
  - src/characters/items/item-use.resolver.ts
  - src/characters/items/item-use.module.ts
  - src/characters/items/use-item-result.model.ts
  - src/characters/items/use-item.int-spec.ts
  - src/characters/characters.module.ts
  - src/models/loot-item.model.ts
  - src/models/loot-item.model.spec.ts
  - src/models/character/character-status.model.ts
  - src/models/character/character-status.schema.spec.ts
  - src/lore/lore-visibility.ts
  - src/lore/lore-visibility.spec.ts
  - src/lore/related-lore.resolvers.ts
  - src/lore/lore-visibility.module.ts
  - src/lore/lore-related.int-spec.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/gameRules/game-rule.exception.spec.ts
  - src/graphql/format-domain-error.ts
  - src/graphql/format-domain-error.spec.ts
  - src/graphql/production-errors.ts
  - src/graphql/production-errors.spec.ts
  - src/graphql/production-surface.int-spec.ts
  - test/graphql/production-probe.resolver.ts
  - test/app.int-spec.ts
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

## Summary

Rivisto il gruppo B a `c130b67b` (nessun jest, sola lettura). L'impianto regge: `useItem` agisce solo sul `currentCharacter` del bearer (nessun `@OwnsCharacter`, nessun id di personaggio in ingresso, l'oste non ha scorciatoie), l'ordine dei cinque rifiuti di D-17 è quello del CONTEXT ed è provato dalla tabella a coppie dello spec del piano, la scrittura è una sola `updateOne` dentro `connection.transaction` con snapshot in sessione e filtro che ripete le precondizioni, `now` si legge dal `Clock` dentro il callback (quindi si rilegge a ogni ritentativo del driver), la pila a zero viene rimossa (riuso di `applyTradeToInventory`), `loreUnlocked` porta le sole novità e `status.unlockedLore` cresce con `$addToSet` nella stessa scrittura. I due formatter fanno passare `recoveryUntil` per allowlist, solo con `POTION_RECOVERING` e solo come istante ISO round-trip, mai con spread delle extensions originali; il percorso graphql-ws passa da `formatDomainError` + `sanitizeFormattedError` come l'HTTP. `LootItem.relatedLore` è risolta per viewer sul tipo (copre inventario, negozio, premi e fogli) e nessun percorso di produzione espone `LootItem` senza il resolver (il GraphQLModule non ha `include`, il resolver vive in `LoreVisibilityModule` importato da cinque moduli di app); la cache del viewer è per chiave `rootValue`/`context` e per viewer. SDL additivo coi nomi del contratto, nessuna superficie di input (provata in `test/app.int-spec.ts`), niente `Math.random`/`Date.now`/`process.env` nuovi, nessun `jest.mock(`, nessuna `*.spec.ts` unit che importa `app.module`.

Nessun critical. Due warning: il piano e il filtro di scrittura non concordano su due forme di dato legacy/scritto a mano (una `potionRecoveryUntil` non `Date`, un `status.injuries` mancante), e in quel caso la bevuta fallisce per sempre con `ITEM_NOT_OWNED`; e `recovery.time`/`turns` non hanno un tetto Int32 né un controllo di data valida, contro la regola di sanificazione in lettura. Il resto sono finding di qualità e di robustezza degli spec.

## Critical

Nessuno.

## Warning

### B-WR-01: il filtro di scrittura non ripete fedelmente le decisioni del piano per `potionRecoveryUntil` non `Date` e `status.injuries` mancante

**File:** `src/characters/items/item-use.plan.ts:118-123` (filtro `recoveryOver`), `:220` (pin di `status.injuries`), `:172-176` (`refuseWhileRecovering`); `src/characters/items/item-use.plan.spec.ts:374-380`; `src/characters/items/item-use.service.ts:97`
**Issue:** `refuseWhileRecovering` considera «finita» ogni `potionRecoveryUntil` che non sia un `Date` (lo spec alla riga 374 lo afferma esplicitamente: un testo `'soon'` vale come ricarica finita), ma il filtro di scrittura ammette solo `null`/assente oppure `{ $lte: now }`, e un `$lte` con una data contro una stringa non confronta (type bracketing): non combacia. Quindi per un personaggio con `status.potionRecoveryUntil` scritto come stringa/numero (script di contenuto o di migrazione senza Mongoose, scenario che D-23 dichiara) il piano dà il via libera, la scrittura non combacia, `matchedCount` è 0 e il servizio risponde `ITEM_NOT_OWNED` (riga 97): codice sbagliato, ripetibile a ogni tentativo, nessuna via d'uscita per il giocatore. Stessa famiglia per `status.injuries`: il piano legge `snapshot.status.injuries ?? []` e il filtro pinna `[]`, ma l'uguaglianza con `[]` non combacia con un campo assente; un personaggio legacy senza `injuries` (lo snapshot è `lean`, nessun default di Mongoose) non può mai bere. Lo spec del piano (riga 374) prova solo la decisione del piano, non che la scrittura la accetti, e lo spec del servizio (`item-use.service.int-spec.ts:176-205`) fissa `ITEM_NOT_OWNED` come risposta a un `matchedCount` 0 «quasi irraggiungibile»: qui invece è raggiungibile.
**Why it matters:** una regola del backend (bevi se la ricarica è finita) diverge dalla sua rete di sicurezza; l'utente riceve un rifiuto bugiardo e permanente, e il bug è invisibile ai test perché il caso è provato solo sul piano puro.
**Suggested fix:** far dire al filtro la stessa cosa dello snapshot invece di riderivarla: pinnare l'uguaglianza esatta sul valore letto, `'status.potionRecoveryUntil': snapshot.status.potionRecoveryUntil ?? null` e `'status.injuries': snapshot.status.injuries ?? null` (assente e `null` combaciano, un valore presente combacia con se stesso), e togliere `recoveryOver` dalla lista `$and` (la decisione «ricarica finita» resta solo del piano, la contesa la risolve il WriteConflict). RED prima: (1) spec int in `item-use.service.int-spec.ts` che scrive con il driver nativo `status.potionRecoveryUntil: 'soon'` su un personaggio con pozione, beve e si aspetta successo e `potionRecoveryUntil` data valida a DB; (2) stesso spec con il campo `status.injuries` rimosso dal documento (`$unset`) e `canHeal` che cura nulla ma `power` > 0; (3) in `item-use.plan.spec.ts` aggiornare l'atteso del filtro (riga ~291) ai nuovi pin. In alternativa, se si vuole tenere `$or`, aggiungere il ramo per i tipi non data (`$not: { $type: 'date' }`) e `$exists: false` per `injuries`.

### B-WR-02: `recovery.time`/`turns` senza tetto Int32 e senza controllo di data valida

**File:** `src/characters/items/item-use.plan.ts:86-92` (`recoveryTimeOf`) e `:238` (`recoveryDueAt`); `src/models/loot-item.model.ts:13-18` (`LootRecovery`); `src/characters/items/item-use.plan.spec.ts:84-101`
**Issue:** `recoveryTimeOf` accetta qualunque `Number.isSafeInteger(time) && time > 0` (fino a ~9e15), e lo schema `LootRecovery` ha `min: 0` ma nessun `max`. Entrambi i campi sono `Int` GraphQL non nulli (32 bit): un `time` o `turns` oltre 2_147_483_647 scritto a DB da uno script di contenuto fa fallire la serializzazione di ogni query che seleziona `recovery` (interrompendo l'intero elenco `lootItems`, inventario e negozio compresi, perché il campo è `LootRecovery` annullabile ma `time: Int!` dentro). Inoltre un `time` che somma a `now` oltre 8,64e15 ms dà `recoveryDueAt` = `Invalid Date`: il piano passa, `$set` con `Invalid Date` fa un CastError dentro la transazione e il giocatore riceve `INTERNAL_SERVER_ERROR`. Il codebase conosce già il limite (`MAX_ITEM_QUANTITY` nel trade). La regola trasversale «sanificazione in lettura del contenuto scritto a DB senza Mongoose» chiede che la lettura rifiuti questi valori (`ITEM_NOT_USABLE`), non che li propaghi.
**Why it matters:** un solo valore sbagliato nel contenuto che l'orchestratore scriverà a DB dopo la merge (166 heal e le `recovery` delle pozioni) rende illeggibile il catalogo per tutti, o produce 500 alla bevuta; il fail-safe «non bevibile» di D-23 non scatta perché il valore è «valido» per `recoveryTimeOf`.
**Suggested fix:** esportare un `MAX_RECOVERY_MS` (24 ore secondo D-15, oppure `2_147_483_647`) e usarlo sia in `recoveryTimeOf` (`time > 0 && time <= MAX`) sia nello schema (`max`) per `time` e `turns`. RED prima: righe in `it.each` di `item-use.plan.spec.ts` (`{ time: 2_147_483_648 }`, `{ time: 9e15 }` → `null`) e in `loot-item.model.spec.ts` (`{ time: 2_147_483_648, turns: 0 }` → errore su `recovery.time`; idem `turns`); spec int in `use-item.int-spec.ts` che scrive `recovery.time: 9e15` col driver e si aspetta `ITEM_NOT_USABLE`.

## Info

### B-IN-01: una bevuta può abbassare la vita se `currentLifePoints` supera `maxLifePoints`

**File:** `src/characters/items/item-use.plan.ts:187-201` (`drinkEffectOf`), `:178-185` (`refuseWithoutEffect`)
**Issue:** `hpAfter = lifePointsWithin(current + power, max)` riporta anche in giù: con `current` 1200 e `max` 1000 (dato legacy o scritto a mano) e una ferita curabile, `hpAfter` 1000 < `hpBefore` 1200; `hpAfter !== hpBefore` supera `refuseWithoutEffect` e il giocatore perde vita bevendo una cura, mentre l'esito (`hpBefore`/`hpAfter`) lo mostra. Nessuno spec lo copre (lo spec «never raises above the maximum» parte da 900).
**Why it matters:** una pozione non deve mai ridurre la vita; la stessa aritmetica per le heal (D-02) usa il tetto come limite di cura, non come ridimensionamento.
**Suggested fix:** `hpAfter = Math.max(facts.currentLifePoints, lifePointsWithin(current + power, max))`; RED: caso in `item-use.plan.spec.ts` con `currentLifePoints: 1200, maxLifePoints: 1000` e una ferita curabile, atteso `hpAfter` 1200 e cura solo della ferita; con nessuna ferita curabile, `ITEM_NO_EFFECT`.

### B-IN-02: la prova della corsa fra bevuta e scrittura concorrente non è deterministica e non prova il ritentativo

**File:** `src/characters/items/item-use.service.int-spec.ts:157-186`
**Issue:** `Promise.all([useItem, shelves.updateOne($push)])` passa con qualunque ordine: se la `$push` arriva prima dello snapshot o dopo il commit il risultato è lo stesso, e l'asserzione non distingue un WriteConflict ritentato da un'assenza di contesa. Il test intitolato «keeps an inventory write that lands during the drink» quindi può non esercitare mai la finestra fra snapshot e scrittura. Lo spec delle due bevute parallele (riga ~104) ha lo stesso limite ma la sua asserzione finale (una sola riuscita, una `POTION_RECOVERING`) è comunque valida in entrambi gli ordini.
**Why it matters:** D-22 si regge sul fatto che il driver ritenti la transazione; senza una prova che costringa la contesa un'eventuale regressione (lettura fuori sessione, filtro rilassato) resterebbe verde.
**Suggested fix:** costringere la finestra: `jest.spyOn(characters, 'updateOne')` con implementazione una tantum che, prima di delegare all'originale, esegue la `$push` col driver nativo (fuori sessione); si aspetta che `updateOne` sia chiamata due volte (ritentativo), che la pila finale sia 1 e che l'oggetto `other` sia presente. In alternativa asserire `updateOne.mock.calls.length === 2`.

### B-IN-03: il codice `POTION_RECOVERING` con `recoveryUntil` non è provato su graphql-ws (né in produzione né fuori)

**File:** `src/graphql/production-surface.int-spec.ts:214-230, 398-407` (solo HTTP); `src/graphql/production-errors.spec.ts` (copre `sanitizeExecutionErrors` in unit)
**Issue:** i due casi di Phase 18 sulla superficie interrogano solo HTTP. Il test gemello per i domain code su ws (`:301`) usa `probeDomain` (`INSUFFICIENT_FUNDS`), non la sonda nuova. Una mutation `useItem` può essere eseguita su graphql-ws, e quella strada passa da `sanitizeExecutionErrors`, coperta solo dallo spec unitario con un `GraphQLError` costruito a mano, non con l'errore reale che attraversa il server.
**Why it matters:** la regola «solo come istante ISO, in produzione e su graphql-ws» è dichiarata nel brief come proprietà di superficie; una regressione nel cablaggio ws non verrebbe vista.
**Suggested fix:** aggiungere in `production-surface.int-spec.ts` un caso ws per `{ probePotionRecovering }` in produzione (atteso `extensions` esattamente `{ code, recoveryUntil }`, nessun `requestId`, nessun log d'errore) e uno fuori produzione.

### B-IN-04: commento stantio su `canHeal` in `LootItem`

**File:** `src/models/loot-item.model.ts:35-36`
**Issue:** «la meccanica arriva in una fase dedicata» è ora falso: la meccanica (bevuta e cure delle quest) arriva con questa fase; inoltre due commenti consecutivi dicono cose diverse sullo stesso campo.
**Why it matters:** Boy Scout: il commento descrive il «perché» in modo errato e fuorvia chi legge `canHeal` come inerte.
**Suggested fix:** un solo commento: `// ferite che una pozione heal cura alla bevuta (Phase 18 D-13); campo già presente a DB sui vecchi oggetti heal, riusato (utente 2026-11-09)`.

### B-IN-05: ID di lore inesistenti o non leggibili entrano in `status.unlockedLore`, e la lettura delle lore dopo il commit può fallire a bevuta avvenuta

**File:** `src/characters/items/item-use.plan.ts:236-239` (via `knowledgeUpdateOf`); `src/characters/items/item-use.service.ts:55-58, 102-107` (`loreInOrder`)
**Issue:** il piano aggiunge a `status.unlockedLore` tutti gli id novità presi dal catalogo, anche quelli di lore che non esistono più; `loreInOrder` poi li scarta dal risultato (`found` più corto), quindi `status.unlockedLore` e `loreUnlocked` non coincidono più, contro «il risultato restituito corrisponde a ciò che è stato scritto». Inoltre `loreInOrder` gira dopo il commit: se la `find` fallisce, il client riceve un errore pur avendo consumato la pozione (nessuna ripetizione sicura: la seconda chiamata darebbe `POTION_RECOVERING`).
**Why it matters:** divergenza minima ma misurabile fra scrittura e risposta; e una finestra di errore su un'operazione già confermata. Rischio basso (gli orfani sono un caso di contenuto, la `find` su una collezione piccola).
**Suggested fix:** leggere le lore esistenti nell'ordine degli id dentro il callback prima di `planItemUse` (o a monte, fuori transazione come il catalogo) e passare al piano solo gli id esistenti; il risultato si costruisce dallo stesso insieme. RED: spec int in `use-item.int-spec.ts` con `relatedLore: [lore._id, new Types.ObjectId()]` che si aspetta `unlockedLore` pari a `[lore._id]` e `loreUnlocked` di un elemento.

### B-IN-06: `LootRecoveryInput` e il campo `recovery` di `LootItemInput` sono codice morto

**File:** `src/models/loot-item.model.ts:58-64, 95`
**Issue:** `LootItemInput` non è usato da nessun resolver (il grep non trova altro riferimento che il suo file e l'assenza dallo SDL provata in `test/app.int-spec.ts:598`); la fase aggiunge un nuovo `InputType` (`LootRecoveryInput`) e un campo che nessuno legge. È la scelta esplicita di D-24 «per coerenza», quindi non è un errore di fase, ma aggiunge codice che nessun gate esercita oltre l'assenza dallo SDL.
**Why it matters:** codice morto che ogni futuro lettore deve ricondurre a una decisione.
**Suggested fix:** se D-24 può essere rivisto, togliere `LootRecoveryInput` e il campo (e `LootItemInput` stesso in una PR separata); altrimenti lasciare e aggiungere in `LootRecoveryInput` un commento «senza superficie, D-24».

### B-IN-07: letterale `RECOVERY_UNTIL_ISO` duplicato nello spec invece di derivare dalla sonda

**File:** `src/graphql/production-surface.int-spec.ts:20`; `test/graphql/production-probe.resolver.ts:6`
**Issue:** la sonda esporta `PROBE_RECOVERY_UNTIL` ma lo spec ricopia la stessa data come stringa; se una delle due cambia, la prova diventa rossa per un motivo che non è una regressione (e l'export resta inutilizzato altrove).
**Why it matters:** duplicazione di un dato di fixture.
**Suggested fix:** `const RECOVERY_UNTIL_ISO = PROBE_RECOVERY_UNTIL.toISOString();` importando la costante dalla sonda.

---

_Reviewed: 2026-11-10T15:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
