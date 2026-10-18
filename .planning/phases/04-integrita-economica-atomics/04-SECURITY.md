---
phase: 04
slug: integrita-economica-atomics
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-18
---

# Phase 04 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Fase: Integrita Economica (Atomics). Branch `feat/04-integrita-economica-atomics`, HEAD `81436d9` (include i review fix WR-01..WR-04, IN-05, IN-06).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| BE -> client (errori GraphQL) | codici e messaggi dei rifiuti attraversano il wire | `GameRuleErrorCode`, messaggi italiani costanti |
| client -> id nei payload | `spellId`, `itemId`, `id`, `characterId` arrivano come stringhe libere | id non fidati, `usages` ignorati |
| client -> `TransactionRequest` | liste, quantita, totale e segno controllati dal client | importi, quantita, `isTotalPositive` |
| catalogo (DB) -> planner | i prezzi autorevoli arrivano dal BE | `buyPrice` / `sellPrice` |
| service -> `characters.status.coins` / `users.twitchPoints` | unico punto di scrittura dei saldi (`WalletService`) | importi calcolati dal server |
| richieste concorrenti -> stesso documento | debiti, equip, uso magie, acquisti, accettazioni simultanei | contesa su Character / User |
| service -> transazione Mongo | inventario + coins (+ PendingQuest) nella stessa sessione | stato di gioco |
| BE -> Redis/Bull | job di recovery at-least-once, possibili riesecuzioni o rifiuti dell'`add` | characterId, spellId |
| chiamante interno (Phase 7) -> `QuestAcceptanceService.accept` | id e costo dal BE, nessuna superficie client | questId, costCopper |
| resolver -> `ShopTransactionService` | la request arriva gia autorizzata da `@OwnsCharacter` | TransactionRequest |
| documentazione BE -> team FE / fasi future | regole (unico scrittore dei saldi, ObjectId nei filtri) | BACKEND-NOTES |
| CI/fase -> branch | gate di schema e suite proteggono il contratto FE | `src/schema.gql` |
| deploy -> topologia MongoDB | le transazioni richiedono un replica set | `rs.status()` |

---

## Threat Register

Prove di test: gli int-spec girano sul replica set in-memory (`MongoMemoryReplSet`) con `Promise.all` / `allSettled` di chiamate concorrenti. Riesecuzione auditor (2026-10-18): unit mirati 12 suite / 213 test verdi; integration mirati (economy, quests/acceptance, characters/spells, equipment, spell-recovery, `test/app.int-spec.ts`) 116/116 verdi alla seconda e terza esecuzione (vedi nota di flakiness nell'Audit Trail).

### 04-01 Fondamenta (errori, ObjectId, coins, slot)

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-01-01 | Information disclosure | medium | mitigate | `game-rule.exception.ts:15-118` factory con messaggi italiani costanti, nessun id/stack; `format-domain-error.ts:46-49` riporta solo il `code`; `game-rule.exception.spec.ts:101,119` (un caso per codice, copertura esaustiva dell'enum) | closed |
| T-04-01-02 | Tampering | high | mitigate | `document-id.ts:3,14-25` solo esadecimale minuscolo a 24 caratteri diventa ObjectId, altrimenti `null`; `document-id.spec.ts:33-63` (12 caratteri, maiuscolo, vuoto -> null); `character-id.ts:6-9` id malformato -> NOT_FOUND (`character-id.spec.ts:12`) | closed |
| T-04-01-03 | Tampering | medium | mitigate | `coins.expressions.ts:26-31` `RangeError` su delta non intero sicuro, `:38-53` `$toInt` su gold/silver/copper; `coins.expressions.spec.ts:48` (cast a int), `:54` (solo delta interi sicuri). Residuale: tetto `$toInt` (AR-04-04) | closed |
| T-04-01-04 | Tampering | medium | mitigate | `active-spell-slots.ts:2-7` unica tabella soglie usata da `maxActiveSpellsFor` (:9) e da `maxActiveSpellsExpression` (:17-27); `active-spell-slots.spec.ts:22,26,40` (parita sulle soglie); `equip-spell.int-spec.ts:359` (espressione server == funzione) | closed |

### 04-02 Wallet

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-02-01 | Tampering | high | mitigate | `wallet.service.ts:41-47` filtro con `hasAtLeastCopper(-delta)` (`coins.expressions.ts:22-24`) nello stesso `findOneAndUpdate`; `wallet.service.int-spec.ts:165` (debiti concorrenti, saldo mai negativo), `:118` (INSUFFICIENT_FUNDS, borsa invariata) | closed |
| T-04-02-02 | Tampering | high | mitigate | `wallet.service.ts:82` filtro `twitchPoints: { $gte: amount }` + `$inc` atomico (:83); `wallet.service.int-spec.ts:289,298` (utente senza campo non va in negativo), `:325` (concorrenti) | closed |
| T-04-02-03 | Tampering | medium | mitigate | `wallet.service.ts:118-122` `assertPositiveAmount` (intero sicuro > 0) e `:40` `coinsDeltaStages` lancia `RangeError` prima di ogni scrittura; `wallet.service.int-spec.ts:215` (delta frazionario), `:355` (`it.each([0,-5,2.5])`) | closed |
| T-04-02-04 | Elevation of privilege | medium | mitigate | `wallet.service.ts:44,47` `activeCharacterById`; `wallet.service.int-spec.ts:146` (archiviato -> NOT_FOUND, nulla scritto) | closed |
| T-04-02-05 | Tampering | high | mitigate | `wallet.service.ts:38,49,66,84,91` parametro `session` propagato a scrittura e classificazione; `wallet.service.int-spec.ts:232` (rollback sul debito coins), `:252` (classifica dentro la sessione), `:370` (rollback punti) | closed |
| T-04-02-06 | Information disclosure | low | accept | Vedi AR-04-01 (messaggi costanti `wallet.service.ts:69-70,94-95`) | closed |

### 04-03 Equip / unequip

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-03-01 | Tampering | high | mitigate | `active-spell.updates.ts:21-26` `$expr: $lt [$size activeSpells, maxActiveSpellsExpression()]` nello stesso update, valutato sul documento vivo; `equip-spell.int-spec.ts:298` (concorrenti mai oltre maxActiveSpells), `:331` (sei concorrenti, due slot), `:218` (MAX_ACTIVE_SPELLS_REACHED) | closed |
| T-04-03-02 | Tampering | high | mitigate | `characters.service.ts:236-246` `usages = spell.maxUsages` dal catalogo, `request.usages` mai letto; `equip-spell.int-spec.ts:156` (usages 99 del client ignorato) | closed |
| T-04-03-03 | Elevation of privilege | high | mitigate | `equip-item.updates.ts:12-17` guard `assets.ownedEquipments.item`; `equip-item.int-spec.ts:118` (ITEM_NOT_OWNED), `:159` (loot non equipaggiabile); `equip-item.updates.spec.ts:13` | closed |
| T-04-03-04 | Tampering | high | mitigate | `characters.service.ts:206-210,233,264,314` `objectIdFromHex` al bordo; `equip-item.updates.ts:16` e `active-spell.updates.ts:32` (`$push` con ObjectId); WR-04 (`537c4d7`/`690cd28`): filtri spell con `$in: idForms()` (`active-spell.updates.ts:19,20,42,48,60,77`), `document-id.ts:36-38`; asserzioni `$type: 'objectId'` in `equip-spell.int-spec.ts:179`, `equip-item.int-spec.ts:113`, `shop-transaction.service.int-spec.ts:219-220`; legacy string coperti da `equip-spell.int-spec.ts:244,263,412`. Residuale: retype Phase 10 (AR-04-05) | closed |
| T-04-03-05 | Information disclosure | low | mitigate | `game-rule.exception.ts:78-104` codici dedicati con messaggi senza id; `equip-item.updates.ts:24-28`, `active-spell.updates.ts:123-153` classificatori senza id | closed |
| T-04-03-06 | Repudiation | low | accept | Vedi AR-04-02 | closed |
| T-04-03-07 | Elevation of privilege | medium | mitigate | `activeCharacterById` in ogni builder (`active-spell.updates.ts:18,41,57,74`, `equip-item.updates.ts:13,15`); `characters.service.spec.ts:460` (archived equipItem); `archived-character-visibility.int-spec.ts:41-75` (doTransaction/equipItem/equipSpell/unequipSpell/useSpell NOT_FOUND su archiviato per ex-proprietario, altro avventuriero, innkeeper) | closed |

### 04-04 Planner (puro)

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-04-01 | Tampering | high | mitigate | `trade-pricing.ts:71-88` netto solo dal catalogo; `:91-106` `assertClientTotalMatches` solo cross-check (mismatch -> TRANSACTION_TOTAL_MISMATCH), il debito usa `netCopper` (`shop-transaction.service.ts:77-81,125-128`); `trade-pricing.spec.ts:311,322,333` | closed |
| T-04-04-02 | Tampering | high | mitigate | `trade-pricing.ts:42-44` interi sicuri > 0 altrimenti INVALID_QUANTITY; `trade-pricing.spec.ts:125` (`it.each([0,-1,1.5])`); `shop-transaction.service.int-spec.ts:517` | closed |
| T-04-04-03 | Tampering | medium | mitigate | `trade-pricing.ts:49-60` chiave `kind:id` unica sui due versi; `trade-pricing.spec.ts:138,148` | closed |
| T-04-04-04 | Tampering | high | mitigate | `trade-inventory.ts:31-39` controllo sullo snapshot, `:114-128` `soldQuantityGuards` (`$elemMatch` `quantity $gte`, entrambe le forme id da WR-01 `4e94a29`), usata in `shop-transaction.service.ts:143-145`; WR-02 (`873bf07`) `trade-inventory.ts:75-95` svuota lo slot indossato venduto a zero, applicato in `shop-transaction.service.ts:48-60`; `trade-inventory.spec.ts:176,187,198,146,164,259`; `shop-transaction.service.int-spec.ts:540,288,322,348` | closed |
| T-04-04-05 | Tampering | medium | mitigate | `trade-pricing.ts:83-86` totali non sicuri -> INVALID_QUANTITY; `trade-pricing.spec.ts:248`; WR-03 (`f11bfca`) `trade-inventory.ts:42-47` `MAX_ITEM_QUANTITY` su quantita posseduta, `trade-inventory.spec.ts:87-113` | closed |
| T-04-04-06 | Tampering | medium | mitigate | `trade-pricing.ts:65-66` prezzo `null` -> ITEM_NOT_TRADABLE; `trade-pricing.spec.ts:232,240`; `shop-transaction.service.int-spec.ts:490` | closed |

### 04-05 useSpell e recovery

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-05-01 | Tampering | high | mitigate | `active-spell.updates.ts:56-64` `$elemMatch usages $gte 1` + `:84-86` `$inc -1` in un solo `updateOne` (`characters.service.ts:324-329`); `use-spell.int-spec.ts:178` (concorrenti: un vincitore, usages 0), `:237` (SPELL_NO_USAGES_LEFT) | closed |
| T-04-05-02 | Tampering | high | mitigate | `spell-recovery.processor.ts:56-62` + `active-spell.updates.ts:68-82` guard `usages < maxUsages` dal catalogo; `spell-recovery.processor.cap.int-spec.ts:115,126,138,150` (incremento al massimo, no-op, doppia esecuzione, repliche parallele) | closed |
| T-04-05-03 | Denial of service / Repudiation | high | mitigate | `characters.service.ts:361` `randomUUID()` nel jobId, `:366-369` compensazione + SPELL_RECOVERY_UNAVAILABLE, `:372-391` `restoreUsage` idempotente con `logger.error` e id; `use-spell.int-spec.ts:200` (job distinti), `:268` (usage ripristinato, codice corretto); `characters.service.spec.ts:380` (compensazione fallita loggata con gli id). Residuale: AR-04-03 | closed |
| T-04-05-04 | Elevation of privilege | medium | mitigate | `recoverSpellFilter` include `activeCharacterById` (`active-spell.updates.ts:74`); `spell-recovery.processor.archived.int-spec.ts:94` | closed |
| T-04-05-05 | Tampering | low | mitigate | `spell-recovery.processor.ts:36-43` id non esadecimali -> skip con warn, nessuna eccezione; `spell-recovery.processor.cap.int-spec.ts:189` | closed |
| T-04-05-06 | Information disclosure | low | mitigate | messaggi costanti `game-rule.exception.ts:106-118`; i dettagli con id restano nei log server (`spell-recovery.processor.ts:39-68`, `characters.service.ts:386-389`) | closed |

### 04-06 ShopTransactionService

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-06-01 | Tampering | high | mitigate | `shop-transaction.service.ts:87-89,109-131` snapshot in sessione + `wallet.applyCharacterCoinsDelta` con guard `$expr` (`wallet.service.ts:41-47`); `shop-transaction.service.int-spec.ts:645` (un solo acquisto passa, saldo 0), `:570` | closed |
| T-04-06-02 | Tampering | high | mitigate | `shop-transaction.service.ts:87` `connection.transaction` con inventario (:122) e coins (:125) nella stessa sessione; `shop-transaction.service.int-spec.ts:715` (fallimento dopo entrambe le scritture -> documento identico). Precondizione di deploy: AR-04-06 | closed |
| T-04-06-03 | Tampering | high | mitigate | `shop-transaction.service.ts:140-152` filtro con `soldQuantityGuards` + snapshot isolation/WriteConflict della transazione; `shop-transaction.service.int-spec.ts:679` (stesso oggetto venduto una sola volta) | closed |
| T-04-06-04 | Tampering | high | mitigate | `catalog-prices.reader.ts:34-46,59-68` prezzi dal DB, proiezione lean; totale client solo cross-check (`trade-pricing.ts:91-106`); `shop-transaction.service.int-spec.ts:430,458,490`; `catalog-prices.reader.int-spec.ts` | closed |
| T-04-06-05 | Elevation of privilege | medium | mitigate | `shop-transaction.service.ts:97,111,117` `activeCharacterById`; IN-06 (`28dd272`, `a207005`): anche il percorso a scambio vuoto fa `assertCharacterExists` (:83-86,93-100); `shop-transaction.service.int-spec.ts:588` (NOT_FOUND su mancante/archiviato, anche con scambio vuoto), `:409` | closed |
| T-04-06-06 | Denial of service | low | mitigate | `requireCharacterObjectId` (`shop-transaction.service.ts:75`) e `toTradeLine` (`trade-pricing.ts:40-41`) validano gli id prima di ogni query; reader senza populate; `shop-transaction.service.int-spec.ts:458`, `trade-pricing.spec.ts:114` | closed |

### 04-07 QuestAcceptanceService

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-07-01 | Tampering | high | mitigate | `quest-acceptance.service.ts:49-81` claim condizionale `'quests.pendingQuest': null` (:54) + insert (:63) + debito (:75) nella stessa transazione; `quest-acceptance.service.int-spec.ts:267` (accettazioni concorrenti: un solo vincitore) | closed |
| T-04-07-02 | Tampering | medium | mitigate | stessa transazione: abort su errore; `quest-acceptance.service.int-spec.ts:174` (QUEST_SLOT_BUSY, nulla scritto), `:192` (INSUFFICIENT_FUNDS, slot rilasciato, nessun PendingQuest), `:267`. Precondizione: AR-04-06 | closed |
| T-04-07-03 | Tampering | medium | mitigate | `quest-acceptance.service.ts:100-104` `assertValidCost` prima di ogni lettura/scrittura (:42); `quest-acceptance.service.int-spec.ts:245` (`it.each([-1, 1.5])`) | closed |
| T-04-07-04 | Elevation of privilege | medium | mitigate | `quest-acceptance.service.ts:53,90` `activeCharacterById`; `quest-acceptance.service.int-spec.ts:226` | closed |
| T-04-07-05 | Spoofing / Elevation | high | mitigate | `quest-acceptance.module.ts:15-27` nessun resolver; `test/app.int-spec.ts:260-267` lo schema non contiene `acceptQuest`/`QuestAcceptance`; whitelist ownership/public invariate (`test/app.int-spec.ts:43-52,327`) | closed |
| T-04-07-06 | Information disclosure | low | accept | Vedi AR-04-01 (messaggi costanti `quest-acceptance.service.ts:93-95`) | closed |

### 04-08 doTransaction sul wire

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-08-01 | Tampering | high | mitigate | `characters.resolver.ts:58` delega a `ShopTransactionService.execute`; `do-transaction.int-spec.ts:296-311` (riga `TRANSACTION_TOTAL_MISMATCH`, nulla scritto) | closed |
| T-04-08-02 | Tampering | high | mitigate | `do-transaction.int-spec.ts:315` (richieste HTTP concorrenti: un vincitore, saldo 0) | closed |
| T-04-08-03 | Elevation of privilege | high | mitigate | `characters.resolver.ts:51,61,70,79,88` `@OwnsCharacter` invariati su doTransaction/equipItem/equipSpell/unequipSpell/useSpell; `test/app.int-spec.ts:43-52` `EXPECTED_OWNERSHIP_HANDLERS` verificata nel boot reale (:344); `characters-ownership.int-spec.ts` | closed |
| T-04-08-04 | Information disclosure | medium | mitigate | `do-transaction.int-spec.ts:309` `extensions` esattamente `{ code }` e messaggio costante (:310); `format-domain-error.ts:46-49` | closed |
| T-04-08-05 | Repudiation | low | accept | Vedi AR-04-02 | closed |
| T-04-08-06 | Tampering | medium | mitigate | `grep` `.save(` in `src` (esclusi spec): vuoto; `normalizeCoins` assente da `src` e `test`; nessun altro scrittore di `status.coins`/`twitchPoints` fuori da `src/economy` (solo `users.service.ts:58,80` inizializza a 0 alla creazione utente) | closed |

### 04-09 Documentazione e gate

| Threat ID | Category | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|----------|-------------|-----------------------|--------|
| T-04-09-01 | Tampering | medium | mitigate | `BACKEND-NOTES.md:227` regola D-04 (unico scrittore dei saldi) e §7 firme; grep dei writer dei saldi limitato a `src/economy` (vedi T-04-08-06). Residuale: disciplina delle fasi future (review) | closed |
| T-04-09-02 | Tampering | high | mitigate | `git diff --exit-code HEAD -- src/schema.gql` pulito (auditor, 2026-10-18); ultimo commit su `src/schema.gql` e `eff8485` (Phase 03.1), nessuno in Phase 04; `test/app.int-spec.ts:260-267` | closed |
| T-04-09-03 | Denial of service | high | transfer | Trasferito alla verifica di deploy documentata: `BACKEND-NOTES.md:264` (§8 "Replica set obbligatorio", blocker STATE.md ancora aperto, `rs.status()` prima del rilascio), `04-VALIDATION.md` (verifica manuale) e `04-VERIFICATION.md` (unico item umano). Vedi AR-04-06 | closed (documentato; verifica prod pendente) |
| T-04-09-04 | Information disclosure | low | mitigate | `BACKEND-NOTES.md`: grep di password/secret/token/uri `mongodb://`/api key senza riscontri; solo identificatori, codici e comandi | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-02-06, T-04-07-06 | Gli errori di wallet e accettazione quest usano messaggi costanti di `GameRuleException`/`ResourceNotFoundException`, senza id ne dettagli interni | user via phase plan (04-02, 04-07) | 2026-10-18 |
| AR-04-02 | T-04-03-06, T-04-08-05 | Azioni on-behalf dell'innkeeper: l'audit automatico `AdminAuditInterceptor` (Phase 3) resta invariato, nessun audit aggiuntivo | user via phase plan (04-03, 04-08) | 2026-10-18 |
| AR-04-03 | Residuale T-04-05-03 (D-13, IN-03) | Crash del processo tra il decremento dell'usage e l'`add` su Bull: l'usage resta perso. Limitato dal cap `maxUsages`; una compensazione fallita e loggata con gli id (`characters.service.ts:386`) | orchestrator auto-mode decision (D-13) | 2026-10-18 |
| AR-04-04 | Residuale T-04-01-03 (A3, IN-01) | `$toInt` limita la borsa a circa 214 748 oro (2^31 rame); i prezzi reali sono ben sotto e l'overflow fallisce chiuso senza scrittura | orchestrator auto-mode decision (A3) | 2026-10-18 |
| AR-04-05 | Residuale T-04-03-04, T-04-01-02 (IN-02) | Dati legacy con id salvato come stringa: i filtri spell e la guardia di vendita tollerano entrambe le forme; il retype e la validazione dei prezzi di catalogo (scritti solo da admin) sono rinviati a Phase 10. `equipItemFilter` (`equip-item.updates.ts:16`) accetta solo ObjectId: un legacy a stringa viene rifiutato (fail closed) | orchestrator auto-mode decision | 2026-10-18 |
| AR-04-06 | T-04-09-03, residuale T-04-06-02, T-04-07-02 (D-19, A4) | Le transazioni richiedono un replica set: il blocker topologia prod in STATE.md resta aperto, da verificare con `rs.status()` prima del rilascio (unico item umano di VERIFICATION). Su standalone le transazioni falliscono, non producono stato parziale | orchestrator auto-mode decision (D-19) | 2026-10-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. Tutte le sezioni `## Threat Flags` dei SUMMARY 04-02..04-09 riportano "None" con riferimento a ID registrati (informativo); 04-01 non dichiara flag nuovi.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-18 | 51 | 51 (46 mitigate, 4 accept, 1 transfer) | 0 | gsd-security-auditor (Claude) |

Note dell'audit:
- Nessun file di implementazione modificato. Review fix WR-01..WR-04, IN-05, IN-06 verificati nel codice (`document-id.ts:28-38`, `trade-inventory.ts:42-95,114-128`, `active-spell.updates.ts`, `characters.service.ts:284-297`, `shop-transaction.service.ts:83-100`).
- Osservazione di flakiness (non una minaccia): una esecuzione su quattro di `spell-recovery.processor.cap.int-spec.ts` ("increments up to maxUsages") ha fallito con un errore di `insertOne` nel setup; le esecuzioni successive sono passate 7/7. Probabile warm-up del replica set in memoria, da monitorare in CI.
- Il transfer T-04-09-03 e chiuso per documentazione presente; la verifica di `rs.status()` in produzione resta un prerequisito di rilascio (AR-04-06).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-18
