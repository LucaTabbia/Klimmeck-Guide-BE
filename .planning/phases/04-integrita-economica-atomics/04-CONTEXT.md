# Phase 4: Integrità Economica (Atomics) - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning
**Mode:** `--auto` (discussione non interattiva su richiesta dell'utente "proseguiamo con il piano GSD su entrambi i repo"): per ogni area è stata scelta l'opzione raccomandata; le alternative sono nel `04-DISCUSSION-LOG.md`. L'utente può rivedere qualunque D-xx prima della PR.

<domain>
## Phase Boundary

Rendere **atomiche e safe in concorrenza** tutte le scritture economiche e di inventario già esistenti sul backend: saldi (`Character.status.coins`, `User.twitchPoints`), `doTransaction` (coins + item comprati/venduti), equip/unequip di item e magie, decremento e recupero degli `usages` delle magie, e la primitiva di accettazione quest (claim dello slot + debito) che la Phase 7 monterà nella mutation lane-aware. Chiude le concern rosse #5 (`useSpell`), #6 (`doTransaction`), #7 (equip) e la #18 (recovery) di `.planning/codebase/CONCERNS.md`.

**Il contratto GraphQL non cambia**: stesse query/mutation, stessi argomenti, stesso `CommonResponse`; cambiano la semantica delle scritture (mai read-modify-write, mai stato parziale, saldo mai negativo) e gli errori, che diventano codici stabili in `extensions.code`.

Fuori scope: corsie quest parallele e cost model per tipologia (Phase 7), credito EventSub (Phase 6), travel/teleport (Phase 8), esiti combat e ricompense admin (Phase 9), validazione input generale con `class-validator` e hardening GraphQL (Phase 10), regole di gioco non ancora codificate (compatibilità `equipType`↔slot, requisiti di titolo/livello per le quest), rimozione di campi dallo schema (`EquipSpellRequest.usages`).

</domain>

<decisions>
## Implementation Decisions

### Saldi: modello e meccanismo di atomicità (BE-ATOM-01)
- **D-01:** `Coins { gold, silver, copper }` resta lo schema **su wire e a DB** (nessun cambio di contratto: il FE e i prezzi del catalogo usano questa forma). Il BE ragiona in **rame totale** — 1 oro = 100 argento = 10 000 rame, come `normalizeCoins` in `src/utils.ts` e `Coins.toCopper()` nel FE — tramite un **modulo puro `coins`** (`toCopper`, `fromCopper`, `add`, `subtract`, `compare`, `normalize`) con unit test; `normalizeCoins` viene assorbita da quel modulo (Boy Scout, nessun duplicato).
- **D-02:** Debito/credito di coins = **un solo update condizionale sul documento `Character`**: filtro `activeCharacterById(id)` + guard `$expr` "rame totale ≥ importo" per i debiti, update in **pipeline di aggregazione** che scrive le tre denominazioni già normalizzate. Nessun read-modify-write, nessuna transazione per il solo saldo (documento singolo = atomico per costruzione). Saldo insufficiente → `INSUFFICIENT_FUNDS`, il saldo non può mai diventare negativo. *(Research flag: confermare su Mongoose 8.18 / MongoDB 8.0.4 `$expr` nel filtro di `updateOne`/`findOneAndUpdate` e l'update a pipeline; fallback: rilettura in sessione dentro `connection.transaction` + write condizionale.)*
- **D-03:** `User.twitchPoints` è uno scalare: debito con **`$inc` condizionale** (`{ _id, twitchPoints: { $gte: amount } }`) → `INSUFFICIENT_POINTS`; credito con `$inc` senza guard. Consegnato come **primitiva di servizio** con test di integrazione e concorrenza, **senza consumatori GraphQL in questa fase** (Phase 6 la userà per il credito EventSub, Phase 7 per il costo delle quest story/worldMission; la dedup per `message_id` resta a Phase 6).
- **D-04:** Le primitive di saldo (coins del personaggio, punti dell'utente) vivono in **un solo posto** (es. `WalletService`/`src/economy/`, nome a discrezione del planner), accettano una `session` opzionale per comporsi dentro una transazione (D-07, D-09, Phase 9 ricompense) e restituiscono il saldo aggiornato. Nessun altro service muove un saldo direttamente.

### `doTransaction` (BE-ATOM-02)
- **D-05:** Contratto invariato: `doTransaction(request: TransactionRequest!): CommonResponse` con `id`, `boughtItems`, `soldItems`, `total`, `isTotalPositive`; il documento FE `doTransaction.graphql` non cambia e il FE continua a leggere il nuovo stato da `characterUpdated` (il change stream emette anche sugli update condizionali).
- **D-06:** **Il BE è l'autorità del prezzo.** Ricalcola dal catalogo (`equipmentItems`/`lootItems`, campi `buyPrice`/`sellPrice` di `AssetItem`) `totalBuy = Σ buyPrice × qty` e `totalSell = Σ sellPrice × qty`; il netto è `totalSell − totalBuy` (stessa regola del FE in `transaction_modal.dart`). `request.total` + `isTotalPositive` del client valgono solo come **cross-check**: se divergono dal calcolo server (confronto in rame dopo normalizzazione) → `TRANSACTION_TOTAL_MISMATCH` (il FE mostra l'errore e ricarica il catalogo). Id non in catalogo → `ITEM_NOT_FOUND`; prezzo nullo per il verso richiesto → `ITEM_NOT_TRADABLE`; quantità ≤ 0, id duplicati o presenti in entrambi i versi → `INVALID_QUANTITY` (o un codice unico `INVALID_TRANSACTION`, planner).
- **D-07:** **Fattibilità prima della scrittura, scrittura in un'unica unità.** Precondizioni: rame sufficiente per il netto negativo; ogni item venduto posseduto con quantità ≥ venduta (`ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`). Esecuzione dentro `connection.transaction` (pattern 02.1/03.1: il driver ritenta i `WriteConflict`): rilettura del personaggio in sessione → calcolo dello stato finale (coins normalizzati, array `ownedItems`/`ownedEquipments` aggiornati) → **un solo `findOneAndUpdate` in sessione il cui filtro riafferma le precondizioni** (attivo, rame ≥ debito, quantità possedute). Se qualcosa è cambiato fra snapshot e write: `WriteConflict` → retry, oppure filtro non soddisfatto → errore tipizzato; **mai stato parziale**. Alternativa ammessa (planner/research): un unico update a pipeline senza transazione, se la manipolazione degli array resta leggibile.
- **D-08:** Semantica degli array invariata: le voci che scendono a quantità 0 vengono rimosse; gli acquisti incrementano la voce esistente o ne inseriscono una con `itemType` corretto.

### Accettazione quest: primitiva single-flight (BE-ATOM-03)
- **D-09:** Oggi non esiste alcuna mutation di accettazione. Phase 4 consegna la **primitiva interna** (es. `QuestAcceptanceService.accept(characterId, questId, cost)`) sullo slot esistente `Character.quests.pendingQuest`: dentro una transazione (due documenti) si inserisce il `PendingQuest` (`startDate` = ora del server, `waitingTime` dalla quest) e si **claima lo slot con un `findOneAndUpdate` condizionale** (`{ _id, deletedAt: null, 'quests.pendingQuest': null, $expr rame ≥ costo }` + debito D-02/D-04 nella stessa sessione). Perdente concorrente → `QUEST_SLOT_BUSY`; saldo → `INSUFFICIENT_FUNDS`; quest inesistente → `NOT_FOUND`. Il perdente non lascia `PendingQuest` orfani (insert nella stessa transazione). **Nessuna mutation GraphQL in questa fase**: Phase 7 monta la mutation lane-aware sopra questa primitiva, generalizzando il percorso dello slot (`pendingQuest` / `activeStoryQuest` / `activeWorldMissionQuest`) e scegliendo il saldo da debitare (coins o `twitchPoints`, D-03/D-04). Il costo è un **parametro** della primitiva: il cost model per tipologia è Phase 7.

### Equip, magie attive e usages (BE-ATOM-04, BE-ATOM-05)
- **D-10:** `equipItem`, `equipSpell`, `unequipSpell`, `useSpell` diventano ciascuna **un singolo update condizionale** sul `Character` (documento singolo, atomico): il filtro codifica l'invariante; `matchedCount === 0` → una rilettura leggera (solo per scegliere il codice d'errore, fail-closed: se nel frattempo è tutto ok si risponde comunque con l'errore della rilettura). Niente `save()` su documenti letti prima.
- **D-11:** `equipSpell`: guard "conosciuta" (`status.spells` contiene `spellId`), "non già attiva" (`assets.activeSpells.spell` ≠ `spellId`), "capacità" (`$expr: { $lt: [ { $size: '$assets.activeSpells' }, maxActiveSpells ] }`). `maxActiveSpells` è oggi una virtual Mongoose su `status.xp`: la tabella delle soglie diventa una **funzione pura condivisa** (es. `maxActiveSpellsFor(xp)`) usata sia dalla virtual sia per costruire l'espressione Mongo (`$switch` su `$status.xp`); in alternativa guard su `status.xp` uguale allo snapshot letto — discrezione del planner purché la capacità sia verificata **nello stesso update**. Gli **usages iniziali sono `spell.maxUsages` dal catalogo**: il valore `usages` inviato dal client **viene ignorato** (campo mantenuto nello schema per compatibilità, segnato deprecato nell'handoff per FE Phase 8).
- **D-12:** `unequipSpell`: `$pull` condizionato (`SPELL_NOT_ACTIVE` se non matcha). `equipItem`: `$set` dello slot con guard "item posseduto" (`assets.ownedEquipments.item: itemId`) → `ITEM_NOT_OWNED`; `itemId: null` sveste lo slot senza guard. La compatibilità `equipType`↔slot **non** è in scope (deferred).
- **D-13:** `useSpell`: `$inc: -1` condizionato (`$elemMatch { spell, usages: { $gte: 1 } }` con positional `$` o `arrayFilters`) → `SPELL_NOT_ACTIVE` / `SPELL_NO_USAGES_LEFT`; la validazione dell'esistenza della spell (`maxUsages`, `recoveryTime`) precede la scrittura (Phase 1 D-06). Il job Bull viene accodato **dopo** la scrittura; se l'accodamento fallisce, compensazione con lo stesso update idempotente del recovery (D-14) e errore `SPELL_RECOVERY_UNAVAILABLE` (il client può riprovare). **Mai un usage perso in silenzio.** La politica di scheduling per-uso non cambia (Phase 1 D-05).
- **D-14:** Recovery processor: `$inc: +1` condizionato a `usages < spell.maxUsages` (letto dal catalogo nel job) → **idempotente, mai oltre il massimo**; personaggio archiviato, spell non più attiva o cancellata dal catalogo → skip loggato (come oggi). Un job rieseguito da Bull non supera mai il cap.

### Errori e contratto wire
- **D-15:** Schema GraphQL **invariato** (`src/schema.gql` rigenerato dal real-boot test deve risultare senza diff). Ogni rifiuto delle mutation toccate usa **eccezioni tipizzate con `extensions.code` stabile** (pattern 02.1/03.1, `formatDomainError`), messaggi in italiano. Codici: `INSUFFICIENT_FUNDS`, `INSUFFICIENT_POINTS`, `TRANSACTION_TOTAL_MISMATCH`, `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`, `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`, `INVALID_QUANTITY`, `QUEST_SLOT_BUSY`, `SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`, `SPELL_NOT_ACTIVE`, `SPELL_NO_USAGES_LEFT`, `SPELL_RECOVERY_UNAVAILABLE`; `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` restano quelli di Phase 2/3. I `BadRequestException` con messaggi inglesi delle mutation toccate vengono sostituiti (Boy Scout). Nomi finali dei codici a discrezione del planner purché stabili e documentati.
- **D-16:** Handoff `BACKEND-NOTES.md` di fase: tabella dei codici per il FE (shop oggi; FE Phase 8 magie; FE Phase 6 quest), nota "`usages` del client ignorato", nota su `TRANSACTION_TOTAL_MISMATCH` (ricaricare il catalogo), conferma che **nessun documento FE cambia**, note per BE Phase 6/7/8/9 su come usare le primitive (D-04, D-09).

### Test, tooling, topologia, branch
- **D-17:** TDD. I **test di concorrenza RED** sull'harness replica-set (Phase 1) sono la prova della fase: `Promise.all` di chiamate concorrenti a livello di service o sul wire (`createAuthTestApp`, fixture `persistCharacter`/`persistSpell`/`persistQuest`): `doTransaction` ×2 con saldo per uno solo → 1 successo, saldo mai negativo, nessuno stato parziale (fallimento indotto a metà → documento intatto); `equipSpell` ×2 con capacità 1 → 1 successo; `useSpell` ×2 con 1 usage → usages 0 e 1 successo; recovery eseguito 2 volte → `maxUsages`; accept quest ×2 → 1 `PendingQuest`, 1 debito. Unit test per il modulo `coins`, per i builder puri di filtri/pipeline e per `maxActiveSpellsFor`. Gli unit test attuali di `characters.service.spec.ts` (mock `findOne().exec()` + `save`) vanno riscritti sulla nuova forma a update.
- **D-18:** Tooling (02.1 D-14): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; `publish()` di `@graphql-yoga/subscription` ritorna `void` (niente `await`); gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`.
- **D-19:** Topologia: le transazioni (già in produzione dalle Phase 02.1/03.1) richiedono un replica set; **preferire update condizionali a documento singolo** (indipendenti dalla topologia) ovunque possibile; transazioni solo dove si toccano più documenti o si compone più di una primitiva (D-07, D-09). Il blocker "verificare topologia MongoDB prod" in `STATE.md` resta aperto come nota di deploy.
- **D-20:** Branch **`feat/04-integrita-economica-atomics`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/04-atomic-operations` è stata allineata), PR a `develop`. Nessuna dipendenza da una PR FE: la PR si fonde in autonomia.

### Claude's Discretion
- Nomi e collocazione di service/moduli (es. `src/economy/` con `WalletService`, `QuestAcceptanceService` in `src/pendingQuests/` o `src/quests/`), forma esatta di pipeline/`$expr` vs guard su xp (D-11), retry policy e numero di tentativi se compaiono `WriteConflict` fuori transazione, split in wave, se abilitare `optimisticConcurrency` sullo schema `Character` come cintura aggiuntiva per i `save()` residui dei service non toccati (es. creazione/archivio), forma esatta della compensazione in D-13, codice unico vs codici distinti in D-06.

</decisions>

<specifics>
## Specific Ideas

- Principio di progetto (PROJECT.md core value, regola #4 del CLAUDE.md FE): "il backend è la fonte di verità; il frontend è reattivo, non calcola né duplica" → il prezzo di una transazione lo decide il catalogo del BE, non il totale inviato dal client (D-06).
- Il FE oggi calcola `total = |Σ sellPrice − Σ buyPrice|` e `isTotalPositive = totalSell > totalBuy` (`lib/screens/mainScreen/tabs/shop/components/transaction_modal.dart`): il cross-check di D-06 replica esattamente questa regola in rame.
- "Due equip concorrenti non superano `maxActiveSpells`", "due `useSpell` con 1 usage lasciano 0 con un solo successo", "recovery idempotente": i criteri di successo della ROADMAP sono i test RED di D-17, uno per uno.
- Stile di scrittura condizionale già in codice: `findOneAndUpdate({ _id, currentCharacter: null }, …)` (creazione), `findOneAndUpdate({ _id, currentCharacter: { $ne: null } }, …)` (archivio): le nuove guard seguono la stessa estetica "il filtro è la regola".

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope e requisiti
- `.planning/ROADMAP.md` §"Phase 4: Integrità Economica (Atomics)" — goal, success criteria 1–5, dipendenze (Phase 7/8 dipendono da questa).
- `.planning/REQUIREMENTS.md` — BE-ATOM-01..BE-ATOM-05 (e, per le primitive riusate a valle, BE-POINTS-02, BE-QUEST-02/03, BE-TRAVEL-04, BE-COMBAT-03).
- `.planning/codebase/CONCERNS.md` §5 (`useSpell`), §6 (`doTransaction`), §7 (equip), §18 (recovery Bull) — le concern che questa fase chiude.
- `.planning/PROJECT.md` — core value (fonte di verità), Key Decisions (transazioni Mongo, Bull + Redis), Constraints.

### Decisioni precedenti su cui si costruisce
- `.planning/phases/01-fondazione-test-consolidamento-spell-wip/01-CONTEXT.md` — D-05 (scheduling per-uso), D-06 (ordine validazione `useSpell`), D-07 (cap usages rinviato a questa fase), harness replica-set e fixture.
- `.planning/phases/02.1-character-creation-contract/02.1-CONTEXT.md` — D-03/D-17 (transazione claim-then-insert, retry dei `WriteConflict`), D-04 (codici tipizzati), D-14 (tooling).
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/03-CONTEXT.md` e `BACKEND-NOTES.md` — ownership `@OwnsCharacter` sulle mutation toccate (invariata), codici `FORBIDDEN`/`NOT_FOUND`, audit automatico dell'innkeeper, `characterUpdated` dal change stream.
- `.planning/phases/03.1-character-deletion-contract/03.1-CONTEXT.md` e `BACKEND-NOTES.md` — D-05 (claim inverso in transazione), D-06 (`ACTIVE_CHARACTER_FILTER`: ogni scrittura di questa fase filtra sugli attivi).

### Codice da leggere
- `src/characters/characters.service.ts` — `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell` (tutti read-modify-write da riscrivere), change stream.
- `src/characters/spell-recovery.processor.ts` — recovery da rendere idempotente con cap.
- `src/characters/creation/character-creation.service.ts`, `src/characters/deletion/character-deletion.service.ts` — pattern `connection.transaction` + `findOneAndUpdate` condizionale, eccezioni tipizzate, `rejectUnclaimed`/`rejectUnlinked`.
- `src/models/common/coins.model.ts`, `src/utils.ts` (`normalizeCoins`), `src/models/common/asset-quantity.model.ts`, `src/models/interfaces`/`AssetItem` (`buyPrice`/`sellPrice`), `src/models/spell.model.ts` (`maxUsages`, `recoveryTime`), `src/models/common/active-spell.model.ts`, `src/models/character/character-status.model.ts` (virtual `maxActiveSpells`), `src/models/character/character-quests.model.ts`, `src/models/pending-quest.model.ts`, `src/models/user.model.ts` (`twitchPoints`, `versionKey: false`).
- `src/models/character/active-character.filter.ts`, `src/authz/resource-not-found.exception.ts`, `src/mongo/mongo-errors.ts`, `src/graphql/` (`formatDomainError`).
- `src/equipmentItems/*.service.ts`, `src/lootItems/*.service.ts` — lookup del catalogo (`findByIds`).
- `src/characters/characters.service.spec.ts` — unit test attuali da riscrivere; `src/characters/spell-recovery.processor.int-spec.ts`, `src/characters/deletion/character-deletion.resolver.int-spec.ts` (esempio di test di concorrenza con `Promise.all`).
- `test/auth/auth-test-app.ts` (`createAuthTestApp({ imports, overrides })`), `test/authz/characters-test-app.ts`, `test/authz/player-fixture.ts`, `test/fixtures/*` (`buildX`/`persistX`).
- FE (sola lettura, per il cross-check del prezzo): `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/screens/mainScreen/tabs/shop/components/transaction_modal.dart`, `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/models/coins.dart`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `connection.transaction(async (session) => …)` con `findOneAndUpdate` condizionale e retry del driver (creazione/archivio) — modello per D-07 e D-09.
- `activeCharacterById(id)` / `ACTIVE_CHARACTER_FILTER` — da includere in ogni filtro di scrittura.
- Eccezioni tipizzate con `extensions.code` (`CharacterCreationException`, `CharacterDeletionException`, `ResourceNotFoundException`, `AuthException`) + `formatDomainError` — modello per i codici economici (D-15).
- Harness: `createAuthTestApp`, `characters-test-app.ts`, fixture `persistCharacter` (xp 20000 → `maxActiveSpells` 1, location reale), `persistSpell`, `persistQuest`, `persistUser`; Redis effimero per i processor test; `Promise.all` già usato per la concorrenza in 03.1.
- `EquipmentItemsService.findByIds` / `LootItemsService` — lookup del catalogo per D-06.

### Established Patterns
- Mutation giocatore protette da `@OwnsCharacter` nel resolver (Phase 3): il service riceve id già autorizzati; l'innkeeper bypassa ed è auditato.
- Change stream `characters` (`update`/`replace`, `fullDocument: updateLookup`) → `characterUpdated`: anche gli update condizionali emettono l'evento, il FE non cambia.
- `User` ha `versionKey: false`; `Character` ha `__v` di default (utile se si volesse `optimisticConcurrency`).
- Unit test con model mockati (`getModelToken`) e Bull mockato (`getQueueToken`): la nuova forma a `updateOne`/`findOneAndUpdate` cambia le aspettative dei mock.
- Messaggi utente in italiano; codici mai cambiati; `src/schema.gql` committato e verificato dalla CI.

### Integration Points
- `CharactersService` (5 mutation + change stream), `SpellRecoveryProcessor`, `UsersService` (punti), modulo pending quest (`PendingQuestsService` oggi solo letture), `AppModule` (nuovo modulo economia se creato), `BACKEND-NOTES.md` di fase per il FE, Phase 6/7/8/9 come consumatori delle primitive.

</code_context>

<deferred>
## Deferred Ideas

- **Compatibilità `equipType`↔slot e requisiti di gioco (titolo/livello/pet)** per equip e quest — regole non ancora codificate: Phase 10 o fase dedicata.
- **Validazione input con `class-validator`/`ValidationPipe`** (quantità negative, id malformati su tutte le request) — Phase 10 (BE-HARD).
- **Idempotency key per `doTransaction`** (retry sicuro del client; CONCERNS §6) — non richiesto dal FE oggi; rivalutare con l'hardening.
- **Rimozione di `EquipSpellRequest.usages` dallo schema** — cambio di contratto da fare insieme alla FE Phase 8 (il campo resta, ignorato).
- **Cost model quest per tipologia e corsie parallele** — Phase 7 (BE-QUEST-02/03), sopra la primitiva D-09.
- **Teleport clear atomico** — Phase 8 (BE-TRAVEL-04), riusa D-04/D-10.
- **`optimisticConcurrency` globale sullo schema `Character`** — valutata come cintura aggiuntiva, non come meccanismo principale (discrezione).
- **Dead-letter / monitoraggio dei job di recovery falliti** (CONCERNS §18 punto 2) — osservabilità, fuori scope.

</deferred>

---

*Phase: 04-integrita-economica-atomics*
*Context gathered: 2026-10-18*
