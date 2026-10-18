# Phase 4: Integrità Economica (Atomics) - Research

**Researched:** 2026-10-18
**Domain:** MongoDB single-document conditional updates (`$expr`, aggregation-pipeline updates, positional array guards), multi-document transactions via Mongoose 8 `connection.transaction`, Bull job semantics, typed GraphQL domain errors
**Confidence:** HIGH (every Mongo/Bull shape below was run on this repository's harness against mongod **8.0.4** (CI pin) **and** 8.2.6 (local cache), Mongoose 8.18.1, Bull 4.16.5 + real ephemeral Redis)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Saldi: modello e meccanismo di atomicità (BE-ATOM-01)
- **D-01:** `Coins { gold, silver, copper }` resta lo schema **su wire e a DB** (nessun cambio di contratto: il FE e i prezzi del catalogo usano questa forma). Il BE ragiona in **rame totale** — 1 oro = 100 argento = 10 000 rame, come `normalizeCoins` in `src/utils.ts` e `Coins.toCopper()` nel FE — tramite un **modulo puro `coins`** (`toCopper`, `fromCopper`, `add`, `subtract`, `compare`, `normalize`) con unit test; `normalizeCoins` viene assorbita da quel modulo (Boy Scout, nessun duplicato).
- **D-02:** Debito/credito di coins = **un solo update condizionale sul documento `Character`**: filtro `activeCharacterById(id)` + guard `$expr` "rame totale ≥ importo" per i debiti, update in **pipeline di aggregazione** che scrive le tre denominazioni già normalizzate. Nessun read-modify-write, nessuna transazione per il solo saldo (documento singolo = atomico per costruzione). Saldo insufficiente → `INSUFFICIENT_FUNDS`, il saldo non può mai diventare negativo. *(Research flag: confermare su Mongoose 8.18 / MongoDB 8.0.4 `$expr` nel filtro di `updateOne`/`findOneAndUpdate` e l'update a pipeline; fallback: rilettura in sessione dentro `connection.transaction` + write condizionale.)*
- **D-03:** `User.twitchPoints` è uno scalare: debito con **`$inc` condizionale** (`{ _id, twitchPoints: { $gte: amount } }`) → `INSUFFICIENT_POINTS`; credito con `$inc` senza guard. Consegnato come **primitiva di servizio** con test di integrazione e concorrenza, **senza consumatori GraphQL in questa fase** (Phase 6 la userà per il credito EventSub, Phase 7 per il costo delle quest story/worldMission; la dedup per `message_id` resta a Phase 6).
- **D-04:** Le primitive di saldo (coins del personaggio, punti dell'utente) vivono in **un solo posto** (es. `WalletService`/`src/economy/`, nome a discrezione del planner), accettano una `session` opzionale per comporsi dentro una transazione (D-07, D-09, Phase 9 ricompense) e restituiscono il saldo aggiornato. Nessun altro service muove un saldo direttamente.

#### `doTransaction` (BE-ATOM-02)
- **D-05:** Contratto invariato: `doTransaction(request: TransactionRequest!): CommonResponse` con `id`, `boughtItems`, `soldItems`, `total`, `isTotalPositive`; il documento FE `doTransaction.graphql` non cambia e il FE continua a leggere il nuovo stato da `characterUpdated` (il change stream emette anche sugli update condizionali).
- **D-06:** **Il BE è l'autorità del prezzo.** Ricalcola dal catalogo (`equipmentItems`/`lootItems`, campi `buyPrice`/`sellPrice` di `AssetItem`) `totalBuy = Σ buyPrice × qty` e `totalSell = Σ sellPrice × qty`; il netto è `totalSell − totalBuy` (stessa regola del FE in `transaction_modal.dart`). `request.total` + `isTotalPositive` del client valgono solo come **cross-check**: se divergono dal calcolo server (confronto in rame dopo normalizzazione) → `TRANSACTION_TOTAL_MISMATCH` (il FE mostra l'errore e ricarica il catalogo). Id non in catalogo → `ITEM_NOT_FOUND`; prezzo nullo per il verso richiesto → `ITEM_NOT_TRADABLE`; quantità ≤ 0, id duplicati o presenti in entrambi i versi → `INVALID_QUANTITY` (o un codice unico `INVALID_TRANSACTION`, planner).
- **D-07:** **Fattibilità prima della scrittura, scrittura in un'unica unità.** Precondizioni: rame sufficiente per il netto negativo; ogni item venduto posseduto con quantità ≥ venduta (`ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`). Esecuzione dentro `connection.transaction` (pattern 02.1/03.1: il driver ritenta i `WriteConflict`): rilettura del personaggio in sessione → calcolo dello stato finale (coins normalizzati, array `ownedItems`/`ownedEquipments` aggiornati) → **un solo `findOneAndUpdate` in sessione il cui filtro riafferma le precondizioni** (attivo, rame ≥ debito, quantità possedute). Se qualcosa è cambiato fra snapshot e write: `WriteConflict` → retry, oppure filtro non soddisfatto → errore tipizzato; **mai stato parziale**. Alternativa ammessa (planner/research): un unico update a pipeline senza transazione, se la manipolazione degli array resta leggibile.
- **D-08:** Semantica degli array invariata: le voci che scendono a quantità 0 vengono rimosse; gli acquisti incrementano la voce esistente o ne inseriscono una con `itemType` corretto.

#### Accettazione quest: primitiva single-flight (BE-ATOM-03)
- **D-09:** Oggi non esiste alcuna mutation di accettazione. Phase 4 consegna la **primitiva interna** (es. `QuestAcceptanceService.accept(characterId, questId, cost)`) sullo slot esistente `Character.quests.pendingQuest`: dentro una transazione (due documenti) si inserisce il `PendingQuest` (`startDate` = ora del server, `waitingTime` dalla quest) e si **claima lo slot con un `findOneAndUpdate` condizionale** (`{ _id, deletedAt: null, 'quests.pendingQuest': null, $expr rame ≥ costo }` + debito D-02/D-04 nella stessa sessione). Perdente concorrente → `QUEST_SLOT_BUSY`; saldo → `INSUFFICIENT_FUNDS`; quest inesistente → `NOT_FOUND`. Il perdente non lascia `PendingQuest` orfani (insert nella stessa transazione). **Nessuna mutation GraphQL in questa fase**: Phase 7 monta la mutation lane-aware sopra questa primitiva, generalizzando il percorso dello slot (`pendingQuest` / `activeStoryQuest` / `activeWorldMissionQuest`) e scegliendo il saldo da debitare (coins o `twitchPoints`, D-03/D-04). Il costo è un **parametro** della primitiva: il cost model per tipologia è Phase 7.

#### Equip, magie attive e usages (BE-ATOM-04, BE-ATOM-05)
- **D-10:** `equipItem`, `equipSpell`, `unequipSpell`, `useSpell` diventano ciascuna **un singolo update condizionale** sul `Character` (documento singolo, atomico): il filtro codifica l'invariante; `matchedCount === 0` → una rilettura leggera (solo per scegliere il codice d'errore, fail-closed: se nel frattempo è tutto ok si risponde comunque con l'errore della rilettura). Niente `save()` su documenti letti prima.
- **D-11:** `equipSpell`: guard "conosciuta" (`status.spells` contiene `spellId`), "non già attiva" (`assets.activeSpells.spell` ≠ `spellId`), "capacità" (`$expr: { $lt: [ { $size: '$assets.activeSpells' }, maxActiveSpells ] }`). `maxActiveSpells` è oggi una virtual Mongoose su `status.xp`: la tabella delle soglie diventa una **funzione pura condivisa** (es. `maxActiveSpellsFor(xp)`) usata sia dalla virtual sia per costruire l'espressione Mongo (`$switch` su `$status.xp`); in alternativa guard su `status.xp` uguale allo snapshot letto — discrezione del planner purché la capacità sia verificata **nello stesso update**. Gli **usages iniziali sono `spell.maxUsages` dal catalogo**: il valore `usages` inviato dal client **viene ignorato** (campo mantenuto nello schema per compatibilità, segnato deprecato nell'handoff per FE Phase 8).
- **D-12:** `unequipSpell`: `$pull` condizionato (`SPELL_NOT_ACTIVE` se non matcha). `equipItem`: `$set` dello slot con guard "item posseduto" (`assets.ownedEquipments.item: itemId`) → `ITEM_NOT_OWNED`; `itemId: null` sveste lo slot senza guard. La compatibilità `equipType`↔slot **non** è in scope (deferred).
- **D-13:** `useSpell`: `$inc: -1` condizionato (`$elemMatch { spell, usages: { $gte: 1 } }` con positional `$` o `arrayFilters`) → `SPELL_NOT_ACTIVE` / `SPELL_NO_USAGES_LEFT`; la validazione dell'esistenza della spell (`maxUsages`, `recoveryTime`) precede la scrittura (Phase 1 D-06). Il job Bull viene accodato **dopo** la scrittura; se l'accodamento fallisce, compensazione con lo stesso update idempotente del recovery (D-14) e errore `SPELL_RECOVERY_UNAVAILABLE` (il client può riprovare). **Mai un usage perso in silenzio.** La politica di scheduling per-uso non cambia (Phase 1 D-05).
- **D-14:** Recovery processor: `$inc: +1` condizionato a `usages < spell.maxUsages` (letto dal catalogo nel job) → **idempotente, mai oltre il massimo**; personaggio archiviato, spell non più attiva o cancellata dal catalogo → skip loggato (come oggi). Un job rieseguito da Bull non supera mai il cap.

#### Errori e contratto wire
- **D-15:** Schema GraphQL **invariato** (`src/schema.gql` rigenerato dal real-boot test deve risultare senza diff). Ogni rifiuto delle mutation toccate usa **eccezioni tipizzate con `extensions.code` stabile** (pattern 02.1/03.1, `formatDomainError`), messaggi in italiano. Codici: `INSUFFICIENT_FUNDS`, `INSUFFICIENT_POINTS`, `TRANSACTION_TOTAL_MISMATCH`, `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`, `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`, `INVALID_QUANTITY`, `QUEST_SLOT_BUSY`, `SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`, `SPELL_NOT_ACTIVE`, `SPELL_NO_USAGES_LEFT`, `SPELL_RECOVERY_UNAVAILABLE`; `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` restano quelli di Phase 2/3. I `BadRequestException` con messaggi inglesi delle mutation toccate vengono sostituiti (Boy Scout). Nomi finali dei codici a discrezione del planner purché stabili e documentati.
- **D-16:** Handoff `BACKEND-NOTES.md` di fase: tabella dei codici per il FE (shop oggi; FE Phase 8 magie; FE Phase 6 quest), nota "`usages` del client ignorato", nota su `TRANSACTION_TOTAL_MISMATCH` (ricaricare il catalogo), conferma che **nessun documento FE cambia**, note per BE Phase 6/7/8/9 su come usare le primitive (D-04, D-09).

#### Test, tooling, topologia, branch
- **D-17:** TDD. I **test di concorrenza RED** sull'harness replica-set (Phase 1) sono la prova della fase: `Promise.all` di chiamate concorrenti a livello di service o sul wire (`createAuthTestApp`, fixture `persistCharacter`/`persistSpell`/`persistQuest`): `doTransaction` ×2 con saldo per uno solo → 1 successo, saldo mai negativo, nessuno stato parziale (fallimento indotto a metà → documento intatto); `equipSpell` ×2 con capacità 1 → 1 successo; `useSpell` ×2 con 1 usage → usages 0 e 1 successo; recovery eseguito 2 volte → `maxUsages`; accept quest ×2 → 1 `PendingQuest`, 1 debito. Unit test per il modulo `coins`, per i builder puri di filtri/pipeline e per `maxActiveSpellsFor`. Gli unit test attuali di `characters.service.spec.ts` (mock `findOne().exec()` + `save`) vanno riscritti sulla nuova forma a update.
- **D-18:** Tooling (02.1 D-14): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; `publish()` di `@graphql-yoga/subscription` ritorna `void` (niente `await`); gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`.
- **D-19:** Topologia: le transazioni (già in produzione dalle Phase 02.1/03.1) richiedono un replica set; **preferire update condizionali a documento singolo** (indipendenti dalla topologia) ovunque possibile; transazioni solo dove si toccano più documenti o si compone più di una primitiva (D-07, D-09). Il blocker "verificare topologia MongoDB prod" in `STATE.md` resta aperto come nota di deploy.
- **D-20:** Branch **`feat/04-integrita-economica-atomics`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/04-atomic-operations` è stata allineata), PR a `develop`. Nessuna dipendenza da una PR FE: la PR si fonde in autonomia.

### Claude's Discretion
- Nomi e collocazione di service/moduli (es. `src/economy/` con `WalletService`, `QuestAcceptanceService` in `src/pendingQuests/` o `src/quests/`), forma esatta di pipeline/`$expr` vs guard su xp (D-11), retry policy e numero di tentativi se compaiono `WriteConflict` fuori transazione, split in wave, se abilitare `optimisticConcurrency` sullo schema `Character` come cintura aggiuntiva per i `save()` residui dei service non toccati (es. creazione/archivio), forma esatta della compensazione in D-13, codice unico vs codici distinti in D-06.

### Deferred Ideas (OUT OF SCOPE)
- **Compatibilità `equipType`↔slot e requisiti di gioco (titolo/livello/pet)** per equip e quest — regole non ancora codificate: Phase 10 o fase dedicata.
- **Validazione input con `class-validator`/`ValidationPipe`** (quantità negative, id malformati su tutte le request) — Phase 10 (BE-HARD).
- **Idempotency key per `doTransaction`** (retry sicuro del client; CONCERNS §6) — non richiesto dal FE oggi; rivalutare con l'hardening.
- **Rimozione di `EquipSpellRequest.usages` dallo schema** — cambio di contratto da fare insieme alla FE Phase 8 (il campo resta, ignorato).
- **Cost model quest per tipologia e corsie parallele** — Phase 7 (BE-QUEST-02/03), sopra la primitiva D-09.
- **Teleport clear atomico** — Phase 8 (BE-TRAVEL-04), riusa D-04/D-10.
- **`optimisticConcurrency` globale sullo schema `Character`** — valutata come cintura aggiuntiva, non come meccanismo principale (discrezione).
- **Dead-letter / monitoraggio dei job di recovery falliti** (CONCERNS §18 punto 2) — osservabilità, fuori scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-ATOM-01 | Debiti/crediti di `Character.coins` e `User.twitchPoints` con update atomici condizionali; mai negativo | Q1 (verified `$expr` + `$toInt` pipeline shape, 10 concurrent debits → exactly ⌊balance/amount⌋ successes, never negative), Q9-points (conditional `$inc`, missing field = insufficient), `WalletService` design §Pattern 1 |
| BE-ATOM-02 | `doTransaction` atomico: fattibilità prima, coins+items in un'unica unità, nessuno stato parziale | Q4 (transaction retries on write conflict, throw = full rollback), Q6 (catalog shape, FE rule), §Pattern 3 (snapshot-in-session → inventory write → wallet in the same session), induced-failure seam (Q5) |
| BE-ATOM-03 | Accettazione quest single-flight: debito + assegnazione in un'unica operazione | Q10 (3 concurrent accepts → 1 ok, 2 `QUEST_SLOT_BUSY`, 1 PendingQuest, 1 debit, verified), §Pattern 4 |
| BE-ATOM-04 | Due equip concorrenti non superano `maxActiveSpells` | Q2/Q3 (4 concurrent equips, capacity 1 → exactly 1 success, verified with the shared `$switch`), Pitfall 1 (Mixed ref paths) |
| BE-ATOM-05 | Usages decrementati/ripristinati atomicamente; recovery idempotente mai oltre il massimo | Q2 (4 concurrent uses with 1 usage → 1 success, usages 0; 3 recoveries with cap 1 → 1 success), Q7 (Bull jobId dedup loses recoveries, compensation) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fixed: NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis — no new runtime libraries needed or allowed for this phase.
- **TDD obbligatorio** (Red → Green → Refactor): every behaviour starts with a failing test; concurrency RED tests are the phase proof (D-17).
- Clean Code, SoC, Boy Scout Rule: remove `src/utils.ts` once `normalizeCoins` is absorbed; replace English `BadRequestException`s of touched mutations; remove the dead `ResourceNotFoundException.activeSpell()` factory once `unequipSpell` uses `SPELL_NOT_ACTIVE`.
- Conventional Commits, scope `phase-4` (user memory: `docs(phase-4)`, `feat(phase-4)`, ...), **no `Co-Authored-By` trailer** (user memory overrides the harness attribution).
- Tooling: `npx prettier --write <file>` + `npx eslint <file>` on touched files only — **never** `npm run lint` (it runs `eslint --fix` on the whole repo) and never `dart format`/`prettier` on directories.
- Jest: paths **before** `--selectProjects` (`npx jest <path> --selectProjects integration --runInBand`).
- Branch + PR to `develop`; never push to `develop`/`main`. GraphQL contract for the FE must not break (`src/schema.gql` diff = 0).
- No secrets in repo. Backend is the source of truth (prices, usages, capacity are server-side).
- GSD workflow: edits go through `/gsd-execute-phase`.

## Summary

Every primitive the CONTEXT asks for works on this stack exactly as hoped, with **one mandatory correction**: the ref paths this phase filters on (`status.spells`, `assets.activeSpells.spell`, `assets.ownedEquipments.item`, `assets.ownedItems.item`, `assets.wearedEquipment.*`, `quests.pendingQuest`) are declared `@Prop({ type: Types.ObjectId })` and Mongoose 8 turns them into **`Mixed`** schema types — so Mongoose does **not** cast string ids in filters or updates on those paths. A filter `{ 'status.spells': '<hex string>' }` silently matches **0** documents and a `$push`/`$set` of a string id stores a **String** in the DB (verified, see Q2). Every builder must take/emit `Types.ObjectId` values, after an `isObjectIdHex` check. This is already recorded in `STATE.md:105` for new props; this phase is the first that filters on the old ones.

With ObjectIds: `$expr` in `updateOne`/`findOneAndUpdate` filters + aggregation-pipeline updates on `status.coins` work on mongod 8.0.4 and 8.2.6 with Mongoose 8.18.1 (no cast/strict interference); concurrent conditional updates on one document are serialized by the server with no surfaced errors and produce exactly the expected number of winners (10 debits of 30 from 100 → 3 winners, balance 10; 4 equips with capacity 1 → 1; 4 uses with 1 usage → 1; 3 recoveries with cap 1 → 1). Pipeline arithmetic produces BSON doubles: wrapping each denomination in `$toInt` keeps the stored type `int` and makes a zero-delta write a true no-op (no change-stream event). `connection.transaction` re-runs the callback on write conflicts (observed 2 invocations), returns normally when an in-session conditional update matches nothing (no abort), rolls everything back when the callback throws, and a non-transactional writer to a document locked by an open transaction **waits** until commit.

Two non-obvious pitfalls surfaced: (1) Bull **silently drops** an `add` with an existing `jobId`; today's `jobId = characterId-spellId-Date.now()` means two `useSpell` wins in the same millisecond (now possible and correct after the atomic fix) would schedule only one recovery — a permanently lost usage. Use a random suffix. (2) The ownership and archived-visibility wire suites send `doTransaction` with empty items and `total: 1 silver, isTotalPositive: true`; with the server-side cross-check (D-06) that becomes `TRANSACTION_TOTAL_MISMATCH` and breaks the "succeeds for the owner" / "NOT_FOUND" cases unless the fixture total becomes zero.

**Primary recommendation:** Build a pure `coins` module + Mongo expression builders, a session-aware `WalletService` (the only writer of balances), ObjectId-typed filter/update builders for the spell/equip mutations, a transaction-based `doTransaction` (snapshot read in session → inventory write with re-asserted quantities → wallet delta, same session), and a claim-first `QuestAcceptanceService`; prove each with `Promise.all` RED tests on the replica-set harness.

## Answers to the research questions

### Q1 — `$expr` filter + pipeline update on `status.coins` — HIGH (empirical, 8.0.4 + 8.2.6)

**Works, with no Mongoose interference.** Evidence from the throwaway spec (deleted):
- `updateOne({ _id, deletedAt: null, $expr: { $gte: [TOTAL_COPPER, 150] } }, debitPipeline(150))` on `{1g 0s 5c}` → `matchedCount 1, modifiedCount 1`, stored `{0g 98s 55c}`. Same call with `1_000_000` → `matchedCount 0`, nothing written.
- `findOneAndUpdate(<same filter>, <pipeline>, { new: true, projection: { 'status.coins': 1 } }).lean()` returns the post-image `{ status: { coins: { gold: 0, silver: 0, copper: 50 } } }`; a failing filter returns `null`.
- String `_id` in the filter is cast normally (`_id` is a real ObjectId path); `$expr` passes through untouched. `CharacterSchema.get('strictQuery')` is `false` and the global option is unset, so `strictQuery` does not drop `$expr` (and `$expr` is an operator, not a path).
- Pipeline `$set` works with both shapes: object replace `'status.coins': { gold, silver, copper }` and dotted `'status.coins.gold': …`. Mongoose 8.18 passes pipelines through without casting.
- **Concurrency:** 10 parallel debits of 30 copper from 100 → `matchedCount` pattern `1,0,1,1,0,0,0,0,0,0` (exactly 3 winners), final `{0,0,10}`; no WriteConflict surfaced (the server retries single-document write conflicts internally).
- **Numeric type drift:** `$divide`/`$floor` yield BSON `double`. Without `$toInt`, a debit turned `gold`/`silver` into `double`; a zero-delta pipeline then reported `modifiedCount: 1` and **emitted a change event**. With `$toInt` around each denomination: types stay `int`, a zero-delta write is `modifiedCount: 0` and emits nothing. Hydrated values are plain JS numbers either way.

Exact working shape → see Code Examples §1. `$toInt` overflows above 2 147 483 647 copper (≈ 214 748 gold); conversion failure would surface as a server error — acceptable for this game's magnitudes, document it.

### Q2 — Array guards (equip, use, recover, unequip, equipItem) — HIGH (empirical)

**All proven, but only with `Types.ObjectId` values.** Schema introspection (`CharacterSchema.path(...)`):

| Path | Mongoose instance |
|---|---|
| `status.spells` | `Array` of `Mixed` |
| `assets.activeSpells` | DocumentArray, `spell: Mixed`, `usages: Number` |
| `assets.ownedEquipments` / `ownedItems` | DocumentArray, `item: Mixed` |
| `assets.wearedEquipment.*` | `Mixed` |
| `quests.pendingQuest`, `status.location` | `Mixed` |
| `status.coins` | Embedded `{gold,silver,copper: Number}` |

Consequences (verified): `countDocuments({ 'status.spells': hexString })` → 0 vs `ObjectId` → 1; same for `assets.ownedEquipments.item`; `$push` of `{ spell: hexString }` stored a **String**; `$set 'assets.wearedEquipment.head': hexString` stored a **String**; `arrayFilters` with a string id matched nothing.

With ObjectIds:
- **equipSpell**: filter `{ _id, deletedAt: null, 'status.spells': spellOid, 'assets.activeSpells.spell': { $ne: spellOid }, $expr: { $lt: [{ $size: { $ifNull: ['$assets.activeSpells', []] } }, MAX_SLOTS_EXPR] } }` + `{ $push: { 'assets.activeSpells': { spell: spellOid, usages: maxUsages } } }`. 4 concurrent equips (2 distinct known spells, xp 20000 → capacity 1) → exactly 1 matched. Unknown spell → 0. `$size` on a missing array **throws** code 17124 ("The argument to $size must be an array") → always wrap in `$ifNull`.
- **useSpell**: `{ ..., 'assets.activeSpells': { $elemMatch: { spell: spellOid, usages: { $gte: 1 } } } }` + `{ $inc: { 'assets.activeSpells.$.usages': -1 } }`. 4 concurrent with usages 1 → exactly 1 matched, usages 0; the other entry untouched.
- **recovery**: same with `usages: { $lt: maxUsages }` + `$inc: 1`. 3 concurrent with cap 1 → exactly 1 matched, usages back to 1, never 2.
- **arrayFilters** variant (`'assets.activeSpells.$[slot].usages'` with `arrayFilters: [{ 'slot.spell': oid, 'slot.usages': { $gte: 1 } }]`) also works, but needs the guard duplicated in the filter to get a meaningful `matchedCount`. **Use the positional `$` with `$elemMatch`**: one guard, `matchedCount` is the success signal, Mongoose `UpdateQuery` typing accepts the `'assets.activeSpells.$.usages'` key without casts.
- **unequipSpell**: `{ ..., 'assets.activeSpells.spell': spellOid }` + `{ $pull: { 'assets.activeSpells': { spell: spellOid } } }` → matched 1 / removed; absent → 0.
- **equipItem**: `{ ..., 'assets.ownedEquipments.item': itemOid }` + `{ $set: { 'assets.wearedEquipment.<slot>': itemOid } }` → stored as `ObjectId`. `itemId == null` → `{ $set: { 'assets.wearedEquipment.<slot>': null } }` with only `activeCharacterById`.

### Q3 — Sharing the `maxActiveSpells` threshold table — HIGH (empirical)

Recommended (D-11 primary option): one pure module, e.g. `src/models/character/active-spell-slots.ts`:
- `ACTIVE_SPELL_SLOT_THRESHOLDS = [{ minXp: 40000, slots: 4 }, { minXp: 30000, slots: 3 }, { minXp: 25000, slots: 2 }, { minXp: 20000, slots: 1 }]` (descending), default 0 — exactly `character-status.model.ts:56-63`.
- `maxActiveSpellsFor(xp: number): number` — used by the virtual (`schema.virtual('maxActiveSpells').get(function () { return maxActiveSpellsFor(this.xp ?? 0); })`).
- `maxActiveSpellsExpression()` — builds `$switch` from the same array (Code Examples §2). Verified: with xp 20000 the expression capped concurrent equips at 1.

A parity test should evaluate the expression through `aggregate([{ $documents: [...] }])` or a `$project` on persisted docs for boundaries 0/19999/20000/24999/25000/29999/30000/39999/40000 and compare with `maxActiveSpellsFor`. **Reject the "xp equals snapshot" alternative**: it needs an extra read and fails spuriously whenever xp changes concurrently (Phase 9 rewards), while the `$switch` evaluates against the live document in the same update.

### Q4 — Transactions in Mongoose 8 — HIGH (empirical + official docs)

- `connection.transaction(fn)` is a wrapper around the driver's `session.withTransaction()` plus Mongoose change-tracking reset [CITED: mongoosejs.com/docs/transactions.html]. The driver retries the whole callback on `TransientTransactionError` (WriteConflict) and retries commit on `UnknownTransactionCommitResult` [CITED: same page — "Retrying in the event of a transient transaction error"].
- **Observed:** two concurrent transactions read-then-`$inc` the same document → both fulfilled, callback invocations `[1, 2]` (the loser re-ran once), final value correct.
- **In-session conditional update whose filter fails:** returns `null`/`matchedCount 0`, **no abort**, callback ran once — the code decides (throw a typed error → abort).
- **Throwing inside the callback:** the original error propagates (`'boom'`), every in-session write is rolled back (coins intact).
- **Outside (non-transactional) writer vs. an open transaction that already wrote the doc:** the outside write **waits** until the transaction commits (order `tx-wrote > release > tx-commit > outside-done`, both increments applied). **Outside write that lands after the transaction's snapshot read but before its write:** the transaction gets a write conflict and is **re-run** (2 callback invocations) — i.e. a read-in-session + write-in-session of the same document is protected against lost updates without any `__v` check.
- **Single-document conditional updates need no transaction** (D-19): atomicity is per document (Q1/Q2 concurrency results). Use transactions only for D-07 (inventory + wallet) and D-09 (PendingQuest + Character).
- **Mongoose limitation:** "Running operations in parallel is **not supported** during a transaction" (`Promise.all` inside the callback is undefined behaviour) [CITED: mongoosejs.com/docs/transactions.html]. Catalog lookups must happen **before** the transaction or sequentially.
- Side effects (Bull `add`, logs claiming success) must stay **outside** the callback, because the callback can run more than once.

### Q5 — Concurrency tests on the harness — HIGH

- **Wire level** (`createCharactersTestApp` + `createPlayer` + `graphqlRequest`): `Promise.all([...])` of N supertest requests; each request runs its own guard reads and resolver concurrently in the same Node process, so writes really interleave. This is exactly what `character-deletion.resolver.int-spec.ts:271-293` does ("archives exactly once under concurrent calls": 3 calls → 1 winner, 2 `CHARACTER_NOT_FOUND`). Use **≥ 3–5 concurrent calls** to make the RED reliable against the old read-modify-write code (old `save()` = last-writer-wins, so every call "succeeds").
- **Service level** (for primitives without GraphQL: `WalletService`, `QuestAcceptanceService`): `harness.app.get(WalletService)` and `Promise.all` of direct calls (or a minimal `Test.createTestingModule` with `MongooseModule.forRoot(process.env.MONGO_TEST_URI)` like `spell-recovery.processor.int-spec.ts:31-41`).
- **Induced mid-transaction failure (BE-ATOM-02 SC2):** structure `doTransaction` so the transaction contains two collaborator writes (inventory write, then `WalletService` delta — see Pattern 3). In the test, `jest.spyOn(harness.app.get(WalletService), 'applyCharacterCoinsDelta').mockImplementationOnce(async function (...args) { await realMethod.apply(this, args); throw new Error('induced'); })` — the inventory **and** coins writes happen inside the session, then the throw aborts; assert the raw document equals the pre-call snapshot. Nest providers are singletons, so the spy on `app.get(...)` is the instance the trade service uses. Alternative without spies: `overrides: [{ token: WalletService, useValue: throwingWallet }]` in `createAuthTestApp` (supported, `test/auth/auth-test-app.ts:110-112`), but then the coin write never happens — the spy proves more.
- **Bull failure (D-13 compensation):** `createCharactersTestApp` provides the queue as `{ add: jest.fn() }` (`test/authz/characters-test-app.ts:41-44`) → `queue.add.mockRejectedValueOnce(new Error('redis down'))`, assert `SPELL_RECOVERY_UNAVAILABLE` and usages restored.
- **Collections inside transactions:** call `await model.init()` (or `createCollection`) for `Character`, `User`, `PendingQuest` in `beforeAll` — the harness drops the DB on `close()` and the first transaction otherwise creates collections implicitly (03.1 Pitfall 9).

### Q6 — Catalog lookup for server-side pricing (D-06) — HIGH

- `AssetItem` (`src/models/interfaces/asset-item.model.ts:25-31`): `sellPrice?: Coins`, `buyPrice?: Coins`, both GraphQL-nullable; Mongoose path instance is `Embedded` (verified) and stores `{gold,silver,copper}`; a `null` price is stored as `null`.
- `EquipmentItemsService.findByIds(ids)` (`src/equipmentItems/equipment-items.service.ts`) runs `find({ _id: { $in: ids } }).populate('addedSpell')` — unnecessary populate, and a malformed id throws `CastError` (verified). `LootItemsService.findByIds` is the same minus populate. **Recommendation:** a dedicated reader in the economy module that validates hex ids first and runs `find({ _id: { $in: oids } }, { buyPrice: 1, sellPrice: 1 }).lean()` on each model (sequential or `Promise.all` — it runs **before** the transaction, so parallel is fine).
- Kind discrimination today is purely by list: `boughtItems.equipAssets`/`soldItems.equipAssets` → `EquipmentItem`, `lootAssets` → `LootItem` (`characters.service.ts:224-247`). The FE splits by runtime type `asset.item is EquipmentItem` (`lib/screens/mainScreen/tabs/shop/shop.dart:103-121`). An equipment id sent in `lootAssets` is simply not found in `LootItem` → `ITEM_NOT_FOUND`.
- FE rule (read-only): `getTotalAmount` = Σ price × quantity, **skipping items whose price is null** (`lib/utils/utils.dart:8-19`); `isPositive = totalSell > totalBuy`; `total = Coins.fromCopper(|sell − buy|)` (`transaction_modal.dart:67-69`); `toCopper = gold*10000 + silver*100 + copper` (`lib/models/coins.dart:53`). **Server cross-check:** `clientSigned = (isTotalPositive ? 1 : −1) × toCopper(total)`; `serverNet = totalSell − totalBuy`; mismatch iff `clientSigned !== serverNet`. Zero is sign-agnostic (FE sends `isTotalPositive: false` for a net 0).
- Divergence to document in BACKEND-NOTES: the FE silently prices a null-price item at 0, the BE rejects it (`ITEM_NOT_TRADABLE`, D-06). Also, the FE gates the confirm button with `canAfford(total)` even when the net is positive (`transaction_modal.dart:71`) — FE-side quirk, not a BE concern, worth a line in the handoff.
- `equipmentAssetsQuantity(sellable: true)` filters on a `sellable` field that is not in the schema (`equipment-items.service.ts:18-20`, passes through because `strictQuery` is false). Out of scope; do not use it as a tradability rule.

### Q7 — Bull: ordering, compensation, retries — HIGH (empirical + official reference)

- **Duplicate `jobId` is silently dropped** [VERIFIED: two `add` with `jobId: 'same-id'` → `getDelayedCount() === 1`; CITED: Bull REFERENCE.md "it is up to you to ensure the jobId is unique… [otherwise] will not be added"]. Current `jobId = \`${characterId}-${spellId}-${Date.now()}\`` (`characters.service.ts:374`) collides for two wins in the same ms → one recovery lost forever. Use `` `${characterId}-${spellId}-${randomUUID()}` `` (`node:crypto`) or omit `jobId`. Nothing else in `src/` reads the jobId (grep).
- Defaults: `attempts: 1` (observed in `job.opts`), `removeOnFail: false` keeps failed jobs; a processor throw is **not** retried. But Bull is at-least-once: a stalled job is restarted up to `maxStalledCount` (default 1), and a lock that expires early can double-process [CITED: Bull REFERENCE.md]. The `usages < maxUsages` guard is what makes a re-run harmless.
- Ordering (D-13): validate spell → conditional decrement → `queue.add`; on `add` rejection → compensation `$inc +1` guarded by `usages < maxUsages` (the same builder as the recovery) → throw `SPELL_RECOVERY_UNAVAILABLE`. If the compensation itself fails, `logger.error` with ids (the usage is then lost — the only unrecoverable case; acceptable and logged).
- Test harness: `spell-recovery.processor.int-spec.ts` uses a **real ephemeral Redis** (`test/setup/redis.ts`: `redis-memory-server` locally, the CI `redis:7` service via `REDIS_HOST/PORT`), polling the document; `spell-recovery.processor.archived.int-spec.ts` calls the handler **directly** (`new SpellRecoveryProcessor(CharacterModel as never)`, line 43) — no Redis. The cap/idempotence tests should use the direct-call style (call the handler twice / in `Promise.all`), keeping one real-Redis happy-path test.

### Q8 — Change stream still emits — HIGH (empirical)

With `CHARACTER_CHANGES_PIPELINE` (`$match operationType in [update, replace]`, `fullDocument.deletedAt: null`) and `fullDocument: 'updateLookup'`: a pipeline debit emitted `update` (`updatedFields: { 'status.coins': {...} }`), a `$inc` emitted `update`; the `$expr`-guarded miss (matched 0) emitted **nothing**; a `$toInt` zero-delta write emitted nothing. So `characterUpdated` keeps working and the FE contract (D-05) holds. The users change stream (`src/users/user-updates.publisher.ts`) will likewise publish `userUpdated` on every `twitchPoints` `$inc` — good for Phase 6.

Note: a successful `doTransaction` with both an inventory write and a wallet write inside **one transaction** produces change events on commit (one per write statement); the FE just receives two `characterUpdated` in quick succession with the final state reached by the second — harmless (each publish re-reads via `findOne`).

### Q9 — Existing unit tests (`characters.service.spec.ts`) — HIGH

The spec (407 lines) mocks `mockCharacterModel = { findOne, find }` and asserts `character.save` calls and English messages (`/is not known/`, `/maximum number of active spells/`, `/no usages left/`, `NotFoundException` for unequip). Everything for `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell` must be rewritten; the "archived characters" block (lines 330-407) keeps `findAll`/`findOne`/`getEquipment` as is but its `doTransaction`/`equipItem` cases must assert the new write filter (contains `deletedAt: null`).

Recommendation: **keep unit tests at the pure level** — `coins` module, Mongo expression builders, the filter/update builders for each mutation (assert exact objects, ObjectId instances), `maxActiveSpellsFor`, the trade planner (pricing, mismatch, invalid quantity, owned checks, D-08 array semantics), the error classifier for `matchedCount === 0` rereads, and `GameRuleException` shape. Service methods get thin unit tests only where orchestration matters (useSpell: spell lookup before write; queue.add after write; compensation on reject) with `updateOne: jest.fn().mockReturnValue({ exec })`. **Behaviour and concurrency are proven by integration tests** (mocks cannot prove atomicity).

### Q10 — Quest acceptance primitive (D-09) — HIGH (shape verified) / MEDIUM (split variant)

- Verified (8.0.4 + 8.2.6): 3 concurrent transactions each inserting a `PendingQuest` and claiming `{ _id, deletedAt: null, 'quests.pendingQuest': null, $expr ≥ 30 }` with debit stages + `$set pendingQuest` → `ok | QUEST_SLOT_BUSY | QUEST_SLOT_BUSY`, **1** `PendingQuest` document, coins debited once (100 → 70), slot = the winner's id. Losers threw inside the callback → abort → their inserts rolled back (no orphans).
- **Recommended shape** (honours D-04 "only the wallet moves balances" and generalizes to Phase 7, where the debit target may be `User.twitchPoints`): pre-generate `pendingQuestId`; in the transaction: (1) claim `findOneAndUpdate({ ...activeCharacterById(characterOid), 'quests.pendingQuest': null }, { $set: { 'quests.pendingQuest': pendingQuestId } }, { session, projection: { _id: 1 } })` → `null` → reread in session: missing/archived → `NOT_FOUND`, otherwise `QUEST_SLOT_BUSY`; (2) `PendingQuest.create([{ _id: pendingQuestId, startDate, waitingTime, quest }], { session })`; (3) `wallet.debitCharacterCoins(characterOid, cost, session)` when `cost > 0` → `INSUFFICIENT_FUNDS` aborts and releases the slot. Losers fail at step 1 before inserting anything. (This split is a composition of verified pieces; the RED test proves it.)
- `waitingTime` source: `Quest` has **no** `waitingTime`; the duration is `quest.infos.timeToComplete` (`src/models/quest/quest-infos.model.ts:12-14`, `Int`, nullable, default `null`), interpreted by the FE as **milliseconds** (`lib/shared/components/popup/quest_info_sheet.dart:36-37`). `PendingQuest.waitingTime` is `Number` (`pending-quest.model.ts:16-18`). Quest lookup: `questModel.findById(questOid).lean()` before the transaction → `null` → `NOT_FOUND` (add `ResourceNotFoundException.quest()`; today `QuestsService.findOne` throws a raw `NotFoundException` with an English message, `src/quests/quests.service.ts`).
- `PendingQuest` has no character back-reference (`pending-quest.model.ts`); ownership is resolved through `Character.quests.pendingQuest` (`character-access.policy.ts` `authorizePendingQuest`) — no schema change needed.
- Module layout: a sibling module like creation/deletion — `src/quests/acceptance/quest-acceptance.module.ts` (+ service, no resolver), importing `EconomyModule` and registering `Character`, `Quest`, `PendingQuest` via `MongooseModule.forFeature`, exporting `QuestAcceptanceService` for Phase 7. Not in `PendingQuestsModule` (read-only, depends on `AuthzModule`) and not in `QuestsModule` (catalog reads).
- `startDate`: `new Date()` server-side, or inject the existing `Clock` (`src/auth/clock`) for deterministic tests (planner choice).

### Q11 — Error codes — HIGH

- Pattern (`src/characters/creation/character-creation.exception.ts`, `src/characters/deletion/character-deletion.exception.ts`): class extends a Nest `HttpException` subtype, private constructor `(code, message)` calling `super({ statusCode, error, message, code })`, sets `readonly code` and `readonly extensions = { code }`, static factories with Italian messages.
- `formatDomainError` (`src/graphql/format-domain-error.ts`) restores `extensions.code` for **any** `HttpException` whose `extensions.code` is a string (wrapped or unwrapped) and strips `stacktrace`/`originalError` — **no change needed** to the formatter for a new class.
- `ResourceNotFoundException` (`src/authz/resource-not-found.exception.ts`) is the `NOT_FOUND` carrier (factories `character()`, `spell()`, `activeSpell()`, …).
- FE (read-only) maps only `extensions.code`, never the message: `lib/repository/character_deletion_failure.dart` (`characterDeletionFailureFrom` → `graphQlErrorCode(exception)` from `lib/repository/services/graphql/graphql_error_code.dart`). Same pattern will serve the shop codes.
- **Recommendation:** one class `GameRuleException extends BadRequestException` + `GameRuleErrorCode` enum holding all 15 D-15 codes, in a neutral folder (e.g. `src/gameRules/` or `src/economy/` if the planner prefers; it is a plain class, imported by economy, characters and quests without module cycles). HTTP status is irrelevant on GraphQL (only the code is exposed). Add `ResourceNotFoundException.quest()`; remove `activeSpell()` once unused.

## Standard Stack

### Core (already installed — no new dependencies)
| Library | Version (lockfile) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | 8.18.1 (bundled driver mongodb 6.18.0) | conditional updates, pipelines, `connection.transaction` | project ORM [VERIFIED: `npm ls`] |
| mongodb (server) | 8.0.4 CI pin (`MONGOMS_VERSION`), 8.2.6 local | `$expr`, pipeline updates (≥ 4.2), transactions (replset) | [VERIFIED: `serverInfo().version` in the runs] |
| bull / @nestjs/bull | 4.16.5 / 11.0.3 | recovery jobs | [VERIFIED: `npm ls`] |
| @nestjs/mongoose | 11.0.3 | `InjectConnection`, `InjectModel`, `forFeature` | [VERIFIED] |
| jest / ts-jest | 30 / 29.2.5 | unit + integration projects | [VERIFIED: package.json] |
| mongodb-memory-server | 11.2.0 | `MongoMemoryReplSet` (count 1) | [VERIFIED: test/setup/mongo-replset.ts] |
| redis-memory-server | 0.17.0 | real Redis for the Bull int-spec | [VERIFIED: ran locally] |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `node:crypto` `randomUUID` | unique Bull `jobId` suffix | `useSpell` enqueue |
| `src/mongo/document-id.ts` `isObjectIdHex` | validate client ids before `new Types.ObjectId()` | every builder input |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `$switch` capacity expression | guard `status.xp == snapshot` | extra read + spurious failures on concurrent xp change — rejected |
| transaction for `doTransaction` | single pipeline update with `$map`/`$filter`/`$concatArrays` on the arrays (D-07 alternative) | no replset dependency, but unreadable array surgery and no seam for the induced-failure proof; success criterion 2 explicitly says "un'unica transazione Mongo" — rejected |
| `optimisticConcurrency` on `Character` | — | after this phase no `save()` on `Character` remains (grep: only `characters.service.ts` and `spell-recovery.processor.ts` call `save()`, both rewritten) — unnecessary, do not enable |
| positional `$` | `arrayFilters` | needs the guard duplicated in the filter to get `matchedCount`; positional is simpler |
| retyping refs to `MongooseSchema.Types.ObjectId` | explicit ObjectIds in builders | retyping fixes casting globally but touches every model/reader; keep this phase's diff focused (see Open Questions) |

**Installation:** none.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── economy/
│   ├── coins.ts                     # pure: toCopper, fromCopper, add, subtract, compare, normalize (absorbs src/utils.ts)
│   ├── coins.spec.ts
│   ├── coins.expressions.ts         # Mongo: totalCopperExpression, hasAtLeastCopper, coinsDeltaStages ($toInt)
│   ├── coins.expressions.spec.ts
│   ├── wallet.service.ts            # ONLY writer of balances (coins + twitchPoints), optional session
│   ├── wallet.service.int-spec.ts
│   ├── trade/
│   │   ├── trade-plan.ts            # pure: validate lines, price, cross-check, apply to inventory (D-06/07/08)
│   │   ├── trade-plan.spec.ts
│   │   ├── catalog-prices.reader.ts # lean price lookup on EquipmentItem/LootItem
│   │   ├── shop-transaction.service.ts  # doTransaction orchestration (transaction)
│   │   └── do-transaction.int-spec.ts   # wire tests (codes, concurrency, induced failure)
│   └── economy.module.ts            # forFeature(Character, User, EquipmentItem, LootItem); exports Wallet + ShopTransaction
├── gameRules/                       # (or inside economy/) neutral home of the error contract
│   ├── game-rule-error-code.enum.ts
│   ├── game-rule.exception.ts
│   └── game-rule.exception.spec.ts
├── characters/
│   ├── spells/
│   │   ├── active-spell.updates.ts       # pure builders: equip/unequip/use/recover filters + updates (ObjectId-typed)
│   │   ├── active-spell.updates.spec.ts
│   │   └── spell-mutations.int-spec.ts   # wire: concurrency + codes + compensation
│   ├── equipment/equip-item.updates.ts (+ spec)  # or fold into one character-updates module
│   ├── characters.service.ts        # equipItem/equipSpell/unequipSpell/useSpell rewritten; doTransaction delegates
│   └── spell-recovery.processor.ts  # injects Spell model, capped conditional $inc
├── models/character/active-spell-slots.ts (+ spec)  # thresholds, maxActiveSpellsFor, maxActiveSpellsExpression
└── quests/acceptance/
    ├── quest-acceptance.module.ts
    ├── quest-acceptance.service.ts
    └── quest-acceptance.service.int-spec.ts
```
Resolver contract unchanged: `CharactersResolver.doTransaction` keeps its signature and `@OwnsCharacter`, delegating to `ShopTransactionService` (inject it in the resolver or keep `CharactersService.doTransaction` as a one-line delegate — planner choice). `CharactersModule` imports `EconomyModule`; `AppModule` needs no change if `EconomyModule` is only imported by feature modules (but `QuestAcceptanceModule` must be imported somewhere to be booted by `test/app.int-spec.ts` — import it in `AppModule` so DI is validated at real boot).

### Pattern 1: session-aware wallet primitive
**What:** one conditional write per call; `null` → in-session reread to classify (`NOT_FOUND` vs `INSUFFICIENT_FUNDS`); returns the new balance.
**When:** every balance movement (doTransaction, quest accept, Phase 6/7/9).
```typescript
// shape verified in Q1 (filter + pipeline + new:true + lean)
async applyCharacterCoinsDelta(characterId: Types.ObjectId, deltaCopper: number, session?: ClientSession): Promise<Coins> {
    assertSafeInteger(deltaCopper);
    const filter = deltaCopper < 0
        ? { ...activeCharacterById(characterId), ...hasAtLeastCopper(-deltaCopper) }
        : activeCharacterById(characterId);
    const updated = await this.characterModel
        .findOneAndUpdate(filter, coinsDeltaStages(deltaCopper), { session, new: true, projection: { 'status.coins': 1 } })
        .lean<{ status: { coins: Coins } } | null>()
        .exec();
    if (updated) return updated.status.coins;
    const exists = await this.characterModel.exists(activeCharacterById(characterId)).session(session ?? null);
    throw exists ? GameRuleException.insufficientFunds() : ResourceNotFoundException.character();
}
```
Points: `findOneAndUpdate({ _id: userOid, twitchPoints: { $gte: amount } }, { $inc: { twitchPoints: -amount } }, { session, new: true, projection: { twitchPoints: 1 } })` — verified: 4 concurrent debits of 20 from 50 → `30, null, null, 10`; a user **without** the field fails the debit (insufficient) and a credit creates it. `$inc` accepts non-integers (2.5 was applied) → validate integer amounts in the service.

### Pattern 2: single conditional update + classifying reread (D-10)
**What:** the filter is the rule; `matchedCount === 0` → one lean projection read → first violated guard in a fixed precedence → typed error; if no guard is violated anymore (state changed in between) → fail closed with the mutation's "contention" code (equipSpell: `MAX_ACTIVE_SPELLS_REACHED`; useSpell: `SPELL_NO_USAGES_LEFT`; unequip: `SPELL_NOT_ACTIVE`; equipItem: `ITEM_NOT_OWNED`).
Precedences: equipSpell → `NOT_FOUND` (character) › `SPELL_NOT_KNOWN` › `SPELL_ALREADY_ACTIVE` › `MAX_ACTIVE_SPELLS_REACHED`. useSpell → `NOT_FOUND` › `SPELL_NOT_ACTIVE` › `SPELL_NO_USAGES_LEFT`. Keep the classifier a pure function of the projection (unit-testable).
Validation order before the write (Phase 1 D-06): `isObjectIdHex(spellId)` (malformed → `SPELL_NOT_KNOWN` for equip / `SPELL_NOT_ACTIVE` for use, or `NOT_FOUND` — planner) → `spellModel.findById` (missing → `ResourceNotFoundException.spell()`) → conditional write.

### Pattern 3: `doTransaction` (D-06/07/08)
1. Pure, outside the DB: `planTradeLines(request)` → `INVALID_QUANTITY` (non-positive / non-safe-integer quantity, duplicate ids in a direction or across directions), `ITEM_NOT_FOUND` (null or malformed id).
2. Catalog read (outside the transaction, parallel allowed) → `priceTrade(lines, prices)` → `ITEM_NOT_FOUND` / `ITEM_NOT_TRADABLE`; `netCopper = totalSell − totalBuy`.
3. Cross-check → `TRANSACTION_TOTAL_MISMATCH`.
4. `connection.transaction(async (session) => { … })`:
   - `findOne(activeCharacterById(oid), { 'status.coins': 1, 'assets.ownedItems': 1, 'assets.ownedEquipments': 1 }).session(session).lean()` → `null` → `NOT_FOUND`;
   - `applyTradeToInventory(snapshot.assets, lines)` (pure) → `ITEM_NOT_OWNED` / `INSUFFICIENT_ITEM_QUANTITY`; fast-fail `INSUFFICIENT_FUNDS` if `toCopper(snapshot.coins) < -netCopper`;
   - `updateOne({ ...activeCharacterById(oid), $and: soldLines.map(l => ({ [`assets.${l.path}`]: { $elemMatch: { item: l.oid, quantity: { $gte: l.quantity } } } })) }, { $set: { 'assets.ownedItems': next.ownedItems, 'assets.ownedEquipments': next.ownedEquipments } }, { session })` — skip when no lines change; `matchedCount 0` → `INSUFFICIENT_ITEM_QUANTITY` (belt-and-braces: the snapshot isolation already turns any concurrent change into a retry, Q4);
   - `if (netCopper !== 0) await wallet.applyCharacterCoinsDelta(oid, netCopper, session)` — its `$expr` is the authoritative funds guard.
5. Return the unchanged `CommonResponse` (`'Transazione avvenuta con successo'`).
This keeps D-04 literal (only the wallet writes coins), makes "un'unica unità" the transaction, and gives the induced-failure seam (Q5). An empty request with zero total is a valid no-op that still answers `NOT_FOUND` for missing/archived ids.

### Pattern 4: quest acceptance (D-09) — see Q10 and Code Examples §5.

### Anti-Patterns to Avoid
- **Passing hex strings into filters/updates on `Mixed` ref paths** — matches nothing / stores Strings (Pitfall 1).
- **`Promise.all` inside a transaction callback** — unsupported by Mongoose.
- **Side effects inside the transaction callback** (queue.add, "success" logs) — the callback re-runs on conflict.
- **`save()` on a previously-read Character** — the bug class this phase removes; none must remain.
- **Pipeline arithmetic without `$toInt`** — double drift + phantom change events.
- **Throwing on `matchedCount === 0` without reread classification** — generic codes break the FE mapping.
- **Trusting `request.total`** for the debit — the server price is authoritative (D-06).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry on write conflicts | custom retry loops | `connection.transaction` (driver `withTransaction`) for multi-doc; nothing for single-doc (server retries internally) | proven behaviour, correct label handling |
| Locks / mutexes for single-flight | Redis locks, in-process mutex | conditional `findOneAndUpdate` claim | atomic per document, works across instances |
| Optimistic versioning for these writes | manual `__v` compare | conditional filters / snapshot isolation in a transaction | already atomic; no `save()` left |
| Coin math in several places | ad-hoc normalization | the single `coins` module + `coins.expressions` | one rule (×100/×10 000) for JS and Mongo |
| Error code plumbing | per-resolver try/catch | `GameRuleException` + existing `formatDomainError` | formatter already supports any coded HttpException |

**Key insight:** in MongoDB the document is the unit of atomicity; every rule that can be expressed in the filter of one update is race-free for free. Transactions are only for crossing documents or composing primitives.

## Runtime State Inventory

Not a rename phase, but existing data can violate the new invariants:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Characters may already hold negative or non-normalized coins (old `doTransaction` never checked funds) and `activeSpells.usages` above `maxUsages` (old `equipSpell` stored the client's `usages`, `characters.service.ts:306`). Not inspected (no prod access). | Optional deploy check (count `characters` with any coin < 0; with usages > spell.maxUsages). New code is safe: debit guard fails on negative totals; recovery guard never increments above max. A credit on a negative total would write odd denominations — document, no migration in scope. |
| Live service config | None — no external config embeds these semantics. | none |
| OS-registered state | None. | none |
| Secrets/env vars | None changed. | none |
| Build artifacts | `src/schema.gql` must stay byte-identical (regenerated by `test/app.int-spec.ts`). Delayed Bull jobs already in Redis keep the old `{characterId, spellId}` payload — compatible with the new processor. | verify `git diff --exit-code src/schema.gql` |

## Common Pitfalls

### Pitfall 1: `@Prop({ type: Types.ObjectId })` paths are `Mixed` — no casting
**What goes wrong:** guards silently never match (`SPELL_NOT_KNOWN` for a known spell), pushes store String ids that later break populate and `instanceof Types.ObjectId` checks in `findOne` (`characters.service.ts:136,150`).
**How to avoid:** builders accept `Types.ObjectId` only; convert at the service edge with `isObjectIdHex` + `new Types.ObjectId()`. Unit-test that builders emit `ObjectId` instances; integration-test the raw stored BSON type after `equipSpell`/`equipItem`/buy.
**Warning signs:** `matchedCount: 0` in a happy-path test; raw doc showing a string id.

### Pitfall 2: fixtures with a non-zero total and no items
`characters-ownership.int-spec.ts:46-59` and `archived-character-visibility.int-spec.ts:40-52` send `total: { gold: 0, silver: 1, copper: 0 }, isTotalPositive: true` with empty items. With D-06 that is `TRANSACTION_TOTAL_MISMATCH`; the "succeeds for the owner", "innkeeper on behalf" and `NOT_FOUND` cases fail. **Fix the fixtures** to `total: {0,0,0}, isTotalPositive: false` (empty trade = valid no-op). The pure checks run before the DB, so keep them consistent.

### Pitfall 3: `$size` on a missing array throws (code 17124)
Wrap with `$ifNull: ['$assets.activeSpells', []]`.

### Pitfall 4: BSON double drift from pipeline arithmetic
Always `$toInt` each denomination (Q1). Without it, no-op writes emit change events and stored types change.

### Pitfall 5: Bull `jobId` collisions drop recoveries
Replace `Date.now()` with `randomUUID()` (Q7). A concurrency test with two successful uses must assert `queue.add` called twice with **distinct** `jobId`s.

### Pitfall 6: side effects in a retried transaction callback
`connection.transaction` re-runs the callback (observed). Enqueue, publish and success logs go after the `await connection.transaction(...)`.

### Pitfall 7: processor constructor change breaks direct-call specs
`spell-recovery.processor.archived.int-spec.ts:43` does `new SpellRecoveryProcessor(CharacterModel as never)`; `spell-recovery.processor.int-spec.ts:31-37` registers only `Character`. Injecting the `Spell` model (D-14) requires updating both (add `SpellSchema` to `forFeature`, persist a spell with `maxUsages` in the happy path — today it uses a random spell id with no catalog entry, which under D-14 would be "deleted from catalog → skip").

### Pitfall 8: `characters-test-app.ts` lists providers by hand
It provides `CharactersService`, `CharactersResolver` and a fake queue without importing `CharactersModule` (`test/authz/characters-test-app.ts:24-47`). New dependencies (`ShopTransactionService`, `WalletService`, catalog models) must be added there (import `EconomyModule`, which declares its own `forFeature`) or every wire suite using it fails DI.

### Pitfall 9: transaction collections must exist (03.1 Pitfall 9)
`await Model.init()` for `Character`, `User`, `PendingQuest` (and `EquipmentItem`/`LootItem` if read in-session) in `beforeAll`.

### Pitfall 10: tooling traps
`npm run lint` rewrites the repo; jest path before `--selectProjects`; `pubSub.publish()` returns void; no `Co-Authored-By` trailer; `dart format`/`prettier` only on touched files.

### Pitfall 11: client `usages` and English messages in existing assertions
`equipSpell` must store `spell.maxUsages` (D-11) — existing unit tests that pass `usages` and assert it stored must be rewritten. `unequipSpell` currently answers `NOT_FOUND` (`ResourceNotFoundException.activeSpell()`, `characters.service.ts:331`); D-12 changes it to `SPELL_NOT_ACTIVE` (wire-visible code change for an existing mutation — note it in BACKEND-NOTES; the FE does not map it today).

## Code Examples

All shapes below ran successfully on mongod 8.0.4 and 8.2.6 (throwaway spec, deleted).

### §1 Coins expressions
```typescript
// src/economy/coins.expressions.ts
const COPPER_PER_GOLD = 10_000;
const COPPER_PER_SILVER = 100;

export const TOTAL_COPPER = {
    $add: [
        { $multiply: [{ $ifNull: ['$status.coins.gold', 0] }, COPPER_PER_GOLD] },
        { $multiply: [{ $ifNull: ['$status.coins.silver', 0] }, COPPER_PER_SILVER] },
        { $ifNull: ['$status.coins.copper', 0] },
    ],
};

export function hasAtLeastCopper(amount: number) {
    return { $expr: { $gte: [TOTAL_COPPER, amount] } };
}

// $toInt: keeps BSON int and makes a zero delta a true no-op (no change event)
export function coinsDeltaStages(deltaCopper: number) {
    const total = { $add: [TOTAL_COPPER, deltaCopper] };
    return [
        {
            $set: {
                'status.coins': {
                    gold: { $toInt: { $floor: { $divide: [total, COPPER_PER_GOLD] } } },
                    silver: { $toInt: { $floor: { $divide: [{ $mod: [total, COPPER_PER_GOLD] }, COPPER_PER_SILVER] } } },
                    copper: { $toInt: { $mod: [total, COPPER_PER_SILVER] } },
                },
            },
        },
    ];
}
```

### §2 Shared capacity table
```typescript
// src/models/character/active-spell-slots.ts
export const ACTIVE_SPELL_SLOT_THRESHOLDS = [
    { minXp: 40000, slots: 4 },
    { minXp: 30000, slots: 3 },
    { minXp: 25000, slots: 2 },
    { minXp: 20000, slots: 1 },
] as const;

export function maxActiveSpellsFor(xp: number): number {
    return ACTIVE_SPELL_SLOT_THRESHOLDS.find(({ minXp }) => xp >= minXp)?.slots ?? 0;
}

export function maxActiveSpellsExpression() {
    return {
        $switch: {
            branches: ACTIVE_SPELL_SLOT_THRESHOLDS.map(({ minXp, slots }) => ({
                case: { $gte: [{ $ifNull: ['$status.xp', 0] }, minXp] },
                then: slots,
            })),
            default: 0,
        },
    };
}
```

### §3 Spell builders (ObjectId-typed)
```typescript
export function equipSpellFilter(characterId: Types.ObjectId, spellId: Types.ObjectId) {
    return {
        ...activeCharacterById(characterId),
        'status.spells': spellId,
        'assets.activeSpells.spell': { $ne: spellId },
        $expr: { $lt: [{ $size: { $ifNull: ['$assets.activeSpells', []] } }, maxActiveSpellsExpression()] },
    };
}
export const equipSpellUpdate = (spellId: Types.ObjectId, maxUsages: number) =>
    ({ $push: { 'assets.activeSpells': { spell: spellId, usages: maxUsages } } });

export const useSpellFilter = (characterId: Types.ObjectId, spellId: Types.ObjectId) =>
    ({ ...activeCharacterById(characterId), 'assets.activeSpells': { $elemMatch: { spell: spellId, usages: { $gte: 1 } } } });
export const recoverSpellFilter = (characterId: Types.ObjectId, spellId: Types.ObjectId, maxUsages: number) =>
    ({ ...activeCharacterById(characterId), 'assets.activeSpells': { $elemMatch: { spell: spellId, usages: { $lt: maxUsages } } } });
export const decrementUsage = { $inc: { 'assets.activeSpells.$.usages': -1 } };
export const incrementUsage = { $inc: { 'assets.activeSpells.$.usages': 1 } };

export const unequipSpellFilter = (characterId: Types.ObjectId, spellId: Types.ObjectId) =>
    ({ ...activeCharacterById(characterId), 'assets.activeSpells.spell': spellId });
export const unequipSpellUpdate = (spellId: Types.ObjectId) =>
    ({ $pull: { 'assets.activeSpells': { spell: spellId } } });
```

### §4 useSpell orchestration (D-13)
```typescript
const spell = await this.spellModel.findById(spellOid).lean().exec();          // NOT_FOUND first (Phase 1 D-06)
if (!spell) throw ResourceNotFoundException.spell();
const used = await this.characterModel.updateOne(useSpellFilter(charOid, spellOid), decrementUsage).exec();
if (used.matchedCount === 0) throw await this.classifyUseFailure(charOid, spellOid);
try {
    await this.spellRecoveryQueue.add('recover', { characterId, spellId }, {
        delay: spell.recoveryTime, jobId: `${characterId}-${spellId}-${randomUUID()}`,
        removeOnComplete: true, removeOnFail: false,
    });
} catch (error) {
    await this.characterModel.updateOne(recoverSpellFilter(charOid, spellOid, spell.maxUsages), incrementUsage).exec()
        .catch((e) => this.logger.error(`Compensazione fallita per ${characterId}/${spellId}`, e));
    throw GameRuleException.spellRecoveryUnavailable();
}
```

### §5 Quest acceptance (D-09)
```typescript
async accept(characterId: Types.ObjectId, questId: Types.ObjectId, costCopper: number): Promise<Types.ObjectId> {
    const quest = await this.questModel.findById(questId, { 'infos.timeToComplete': 1 }).lean().exec();
    if (!quest) throw ResourceNotFoundException.quest();
    const pendingQuestId = new Types.ObjectId();
    await this.connection.transaction(async (session) => {
        const claimed = await this.characterModel
            .findOneAndUpdate(
                { ...activeCharacterById(characterId), 'quests.pendingQuest': null },
                { $set: { 'quests.pendingQuest': pendingQuestId } },
                { session, projection: { _id: 1 } },
            ).lean().exec();
        if (!claimed) throw await this.rejectUnclaimed(characterId, session); // NOT_FOUND | QUEST_SLOT_BUSY
        await this.pendingQuestModel.create(
            [{ _id: pendingQuestId, startDate: new Date(), waitingTime: quest.infos?.timeToComplete ?? 0, quest: questId }],
            { session },
        );
        if (costCopper > 0) await this.wallet.applyCharacterCoinsDelta(characterId, -costCopper, session);
    });
    return pendingQuestId;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| read → mutate → `save()` | conditional update with the invariant in the filter | MongoDB atomic ops (always); `$expr` in filters since 3.6, pipeline updates since 4.2 | race-free without locks |
| manual transaction retry loops | `connection.transaction` → driver `withTransaction` | Mongoose ≥ 5.10 | retries are free; callback must be idempotent |

**Deprecated/outdated:** `src/utils.ts` `normalizeCoins` (in-place mutation, two code paths) → `coins.normalize` via copper. [ASSUMED] Mongoose 9 reportedly requires an explicit opt-in option for update pipelines — irrelevant on 8.18.1, but note it for a future upgrade.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `waitingTime = quest.infos.timeToComplete ?? 0` (ms) is the intended duration source | Q10, §5 | Phase 7 may define a different source; the primitive keeps `waitingTime` in one place so it is a one-line change |
| A2 | An empty trade with zero total is a valid no-op (not an error) | Pattern 3, Pitfall 2 | If the planner prefers rejecting it, the two wire fixtures must buy a real catalog item instead |
| A3 | Coin totals stay below 2^31 copper (`$toInt` limit) | Q1 | Above ≈ 214 748 gold the write fails with a server error; switch to `$toLong` if the economy grows |
| A4 | Production MongoDB is a replica set (transactions already used since 02.1) | D-19 | Same risk as 02.1/03.1 — open STATE.md blocker, not new |
| A5 | Mongoose 9 gates pipeline updates behind an option | State of the Art | Only matters on upgrade |
| A6 | No production data cleanup is required for negative coins / over-cap usages | Runtime State Inventory | Legacy anomalies persist but cannot get worse; optional check documented |

## Open Questions (RESOLVED)

1. **D-04 vs D-07 tension ("only the wallet moves balances" vs "un solo `findOneAndUpdate`").**
   - Resolution: the transaction is the single unit; inside it, the inventory write is one conditional update and the coins move through `WalletService` with the same session (Pattern 3). Both locked decisions hold, and the composition gives the induced-failure seam required by success criterion 2.
2. **Retype the `Mixed` ref paths to `MongooseSchema.Types.ObjectId`?**
   - Resolution: not in this phase (touches every model and reader; the GraphQL schema is unaffected but the blast radius is outside the phase boundary). Builders are ObjectId-typed and validated, which is sufficient and testable. Record it as a candidate for Phase 10 hardening.
3. **Single `INVALID_TRANSACTION` vs distinct codes (D-06 discretion).**
   - Resolution: use the distinct D-15 codes (`INVALID_QUANTITY` for quantity/duplicate problems, `ITEM_NOT_FOUND` for null/malformed/unknown ids); they are already listed for the FE handoff.
4. **Where does `waitingTime` come from?**
   - Resolution: `quest.infos.timeToComplete` (ms), `0` when null (A1); Phase 7 can override.
5. **Error for a malformed `spellId`/`itemId`.**
   - Resolution: never call `new Types.ObjectId()` on unvalidated input; malformed ids map to the "not known/not owned/not active" code of the mutation (planner may choose `NOT_FOUND`), never to an internal error.
6. **`optimisticConcurrency`?**
   - Resolution: do not enable — no `save()` on `Character` remains after this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v22.12.0 | — |
| mongod via mongodb-memory-server | integration (replset, transactions, change streams) | ✓ | 8.2.6 cached locally; **8.0.4** downloaded and run in this session (`MONGOMS_VERSION=8.0.4`); CI pins 8.0.4 | — |
| Redis | Bull processor int-spec, real-boot `test/app.int-spec.ts` | ✓ | redis-memory-server 0.17.0 binary cached (ran); CI `redis:7` service | — |
| npm deps | — | ✓ | as in Standard Stack | — |

No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest; projects `unit` (`*.spec.ts`) and `integration` (`*.int-spec.ts`, global `MongoMemoryReplSet`) |
| Config file | `package.json` → `jest.projects` |
| Quick run command | `npx jest <paths> --selectProjects unit` |
| Integration command | `npx jest <paths> --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit && npm run test:int` |

### Phase Requirements → Test Map
| Req / SC / D | Behavior | Type | File | Automated Command | RED before implementation | Exists? |
|---|---|---|---|---|---|---|
| BE-ATOM-01 / D-01 | `toCopper`/`fromCopper`/`add`/`subtract`/`compare`/`normalize` (incl. non-normalized input, rejects negative `fromCopper`) | unit | `src/economy/coins.spec.ts` | `npx jest src/economy/coins.spec.ts --selectProjects unit` | module missing | ❌ Wave 0 |
| BE-ATOM-01 / D-02 | expression builders: `$ifNull`, `$toInt`, guard shape | unit | `src/economy/coins.expressions.spec.ts` | `npx jest src/economy --selectProjects unit` | module missing | ❌ |
| BE-ATOM-01 / SC1 | coins debit: sufficient → new normalized balance; insufficient → `INSUFFICIENT_FUNDS`, doc unchanged; archived/missing → `NOT_FOUND`; 5–10 concurrent debits → ⌊balance/amount⌋ winners, never negative; int types preserved; zero delta = no write | integration | `src/economy/wallet.service.int-spec.ts` | `npx jest src/economy/wallet.service.int-spec.ts --selectProjects integration --runInBand` | service missing | ❌ |
| BE-ATOM-01 / D-03 | twitchPoints debit `$gte` guard, `INSUFFICIENT_POINTS`, concurrent debits never negative, missing field = insufficient, credit; session composition (debit inside an aborted transaction is rolled back) | integration | same file | same | service missing | ❌ |
| BE-ATOM-02 / D-06 | trade planner: pricing Σ price×qty, net, cross-check (sign-agnostic zero), `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`, `INVALID_QUANTITY` (≤0, duplicates, cross-direction), D-08 array semantics | unit | `src/economy/trade/trade-plan.spec.ts` | `npx jest src/economy/trade --selectProjects unit` | module missing | ❌ |
| BE-ATOM-02 / SC2 | wire `doTransaction`: buy/sell happy path (coins normalized, arrays updated, `itemType` correct, ObjectId stored); `TRANSACTION_TOTAL_MISMATCH`; `ITEM_NOT_OWNED`; `INSUFFICIENT_ITEM_QUANTITY`; `INSUFFICIENT_FUNDS` | integration | `src/economy/trade/do-transaction.int-spec.ts` | `npx jest src/economy/trade --selectProjects integration --runInBand` | old code accepts client total / goes negative | ❌ |
| BE-ATOM-02 / SC2 | 3–5 concurrent buys with funds for one → 1 success, balance ≥ 0, inventory consistent | integration | same | same | old code: all succeed, negative balance | ❌ |
| BE-ATOM-02 / SC2 | induced failure after the in-session writes (spy on `WalletService`) → raw doc identical to before | integration | same | same | old code has no transaction | ❌ |
| BE-ATOM-03 / SC3 / D-09 | `accept` happy path (PendingQuest with startDate/waitingTime, slot set, debit); `QUEST_SLOT_BUSY`; `INSUFFICIENT_FUNDS` releases the slot and leaves no PendingQuest; unknown quest → `NOT_FOUND`; archived → `NOT_FOUND`; 3 concurrent → 1 PendingQuest, 1 debit | integration | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` | `npx jest src/quests/acceptance --selectProjects integration --runInBand` | service missing | ❌ |
| BE-ATOM-04 / D-11 | `maxActiveSpellsFor` boundaries; virtual uses it; `$switch` parity on persisted docs | unit + integration | `src/models/character/active-spell-slots.spec.ts` (+ parity case in `spell-mutations.int-spec.ts`) | `npx jest src/models/character --selectProjects unit` | module missing | ❌ |
| BE-ATOM-04 / D-10..12 | builders emit exact filters/updates with ObjectId instances; reread classifier precedence | unit | `src/characters/spells/active-spell.updates.spec.ts`, equip-item builder spec | `npx jest src/characters --selectProjects unit` | module missing | ❌ |
| BE-ATOM-04 / SC4 | wire `equipSpell`: stores `spell.maxUsages` ignoring client `usages`; `SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`; 4 concurrent equips with capacity 1 → exactly 1 success, `activeSpells.length === 1` | integration | `src/characters/spells/spell-mutations.int-spec.ts` | `npx jest src/characters/spells --selectProjects integration --runInBand` | old code: >1 success | ❌ |
| BE-ATOM-04 / D-12 | `unequipSpell` `SPELL_NOT_ACTIVE`; `equipItem` `ITEM_NOT_OWNED`, owned → stored ObjectId, `itemId` null → slot cleared | integration | same file (or `equip-item.int-spec.ts`) | same | old code equips unowned item / answers NOT_FOUND | ❌ |
| BE-ATOM-05 / SC5 | 4 concurrent `useSpell` with usages 1 → 1 success, 3 `SPELL_NO_USAGES_LEFT`, usages 0, `queue.add` once; two successes (usages 2) → 2 `add` with **distinct** jobIds; spell missing → `NOT_FOUND` and usages untouched; `queue.add` rejects → `SPELL_RECOVERY_UNAVAILABLE` and usages restored | integration | same file | same | old code: multiple successes, usages may go to 0 with 2 winners | ❌ |
| BE-ATOM-05 / D-14 | processor: increments up to `maxUsages`; at cap → no-op; run twice / in parallel from `maxUsages − 1` → exactly `maxUsages`; spell deleted from catalog → skip + warn; archived → skip (existing) | integration (direct handler call) | `src/characters/spell-recovery.processor.archived.int-spec.ts` (extend) or new `spell-recovery.processor.cap.int-spec.ts` | `npx jest src/characters/spell-recovery --selectProjects integration --runInBand` | old code exceeds max | ✅ (to extend) / ❌ |
| BE-ATOM-05 | real-Redis happy path still increments (spell persisted with `maxUsages`) | integration | `src/characters/spell-recovery.processor.int-spec.ts` | same | — | ✅ (to modify) |
| D-15 | `GameRuleException` factories: `extensions.code`, Italian message, status 400; `formatDomainError` passes them through | unit | `src/gameRules/game-rule.exception.spec.ts` (+ one case in `format-domain-error.spec.ts`) | `npx jest src/gameRules src/graphql --selectProjects unit` | module missing | ❌ |
| D-17 | `characters.service.spec.ts` rewritten on the update-based shape (no `save`) | unit | `src/characters/characters.service.spec.ts` | `npx jest src/characters/characters.service.spec.ts --selectProjects unit` | — | ✅ (to rewrite) |
| D-05 / D-15 | ownership + archived suites still green with zero-total fixture | integration | `src/characters/characters-ownership.int-spec.ts`, `src/characters/archived-character-visibility.int-spec.ts` | `npx jest src/characters --selectProjects integration --runInBand` | mismatch code with old fixture | ✅ (to modify) |
| D-05 | `characterUpdated` delivered after a conditional update (existing realtime suite stays green; optionally one case after `useSpell`) | integration | `src/characters/character-updated.subscription.int-spec.ts` | same | — | ✅ |
| D-15 / CI | schema unchanged; AppModule boots with the new modules | integration (real boot) + CI | `test/app.int-spec.ts` | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | — | ✅ |
| D-16 | BACKEND-NOTES: codes table, `usages` ignored, mismatch → reload catalog, null-price items rejected, unequip code change, primitives for Phase 6/7/8/9 | manual review | `.planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md` | — | file missing | ❌ |

### Sampling Rate
- **Per task commit:** unit command on touched paths + the single integration file touched.
- **Per wave merge:** `npx jest src/economy src/characters src/quests --selectProjects integration --runInBand` + `npm run test:unit`.
- **Phase gate:** `npm run test:unit && npm run test:int` green, `npm run build`, `npx eslint <touched files>`, `git diff --exit-code src/schema.gql`, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/gameRules/game-rule-error-code.enum.ts` + `game-rule.exception.ts` + spec (all D-15 codes)
- [ ] `src/economy/coins.ts` + `coins.expressions.ts` + specs; delete `src/utils.ts`
- [ ] `src/models/character/active-spell-slots.ts` + spec; virtual rewired
- [ ] `ResourceNotFoundException.quest()` (+ spec case)
- [ ] Test helpers: fixtures for catalog items (`persistEquipmentItem`/`persistLootItem` with prices) in `test/fixtures/` (none exist today), `rawCharacter` helper reuse, `Model.init()` calls
- [ ] `test/authz/characters-test-app.ts` updated for new providers (Pitfall 8)
- No framework install needed.

## Security Domain

### Applicable ASVS Categories (L1)
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | global deny-by-default guard (Phase 2) |
| V4 Access Control | yes (unchanged) | `@OwnsCharacter` on every touched mutation; innkeeper on-behalf audited (Phase 3); service writes always include `activeCharacterById` |
| V5 Input Validation | yes | hex id validation before ObjectId construction; positive safe-integer quantities; duplicate-line rejection; server-side pricing (client total only cross-checked) |
| V6 Cryptography | no | `randomUUID` only for job ids (not security-relevant) |
| V7 Error handling | yes | typed codes, Italian messages, no internals on the wire (`formatDomainError`) |
| V11 Business Logic | **yes** | atomic conditional updates and transactions against TOCTOU/race abuse (double spend, double use, slot over-commit) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double spend via concurrent `doTransaction` | Tampering | wallet `$expr` guard inside the transaction; snapshot conflicts retried |
| Client-chosen price / negative total | Tampering | catalog pricing (D-06), mismatch rejected |
| Selling items not owned / more than owned | Tampering | in-session feasibility + `$elemMatch quantity $gte` re-assertion |
| Spell spam beyond usages / capacity | Tampering | `$elemMatch usages $gte 1`; `$switch` capacity in the same update |
| Recovery replay (stalled job, manual retry) | Tampering | `usages < maxUsages` guard (idempotent) |
| Lost recovery (jobId collision, Redis down) | Repudiation/Availability | random jobId; compensation + `SPELL_RECOVERY_UNAVAILABLE` |
| Quest slot double-claim | Tampering | conditional claim in a transaction; losers leave no PendingQuest |
| Id-type confusion (string vs ObjectId on Mixed paths) | Tampering | ObjectId-only builders, stored-type assertions in tests |

## Sources

### Primary (HIGH confidence)
- Repo code read in this session: `src/characters/characters.service.ts`, `spell-recovery.processor.ts`, `characters.{module,resolver}.ts`, `character-changes.pipeline.ts`, `creation/*`, `deletion/*`, `src/authz/**`, `src/graphql/format-domain-error*.ts`, `src/models/**` (character, status, assets, quests, coins, asset-quantity, active-spell, equipment, asset-item, equipment/loot items, quest, pending-quest, user, requests), `src/equipmentItems`, `src/lootItems`, `src/quests`, `src/pendingQuests`, `src/users`, `src/mongo/*`, `test/**` harness and fixtures, `package.json`, `.github/workflows/ci.yml`, `.planning/STATE.md:105`.
- Empirical throwaway specs (all deleted; `git status` clean except this file and the pre-existing `.planning/config.json` change): `test/harness/zz-research-atomics.int-spec.ts` (Q1–Q4, Q8–Q11) on mongod **8.0.4** and **8.2.6**; `zz-research-cast.int-spec.ts` (schema path instances, casting); `zz-research-types.int-spec.ts` (`$toInt`, change events); `zz-research-bull.int-spec.ts` (Bull jobId dedup, default attempts) with real Redis.
- FE (read-only): `lib/screens/mainScreen/tabs/shop/components/transaction_modal.dart:47-71,262-300`, `lib/screens/mainScreen/tabs/shop/shop.dart:103-135`, `lib/utils/utils.dart:8-19`, `lib/models/coins.dart:53-64`, `lib/repository/character_deletion_failure.dart`, `lib/repository/services/graphql/graphql_error_code.dart`, `lib/shared/components/popup/quest_info_sheet.dart:36-46`.
- [Mongoose transactions guide](https://mongoosejs.com/docs/transactions.html) — `Connection#transaction` wraps `withTransaction`, retries transient errors, resets document state, no parallel ops.
- [Bull REFERENCE.md](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md) — jobId uniqueness, stalled jobs / `maxStalledCount` / `lockDuration` double processing, `removeOnFail`.

### Secondary (MEDIUM confidence)
- MongoDB manual on in-progress transactions and write conflicts (behaviour matched empirically in Q4).

### Tertiary (LOW confidence)
- Mongoose 9 pipeline-update opt-in (A5, training knowledge).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions from `npm ls` and server info.
- Architecture: HIGH — every Mongo/Bull shape executed on both server versions; split quest-acceptance variant MEDIUM until its RED test runs.
- Pitfalls: HIGH — each reproduced (Mixed casting, `$size`, double drift, jobId dedup, fixtures).

**Research date:** 2026-10-18
**Valid until:** 2026-11-17 (stable stack)
