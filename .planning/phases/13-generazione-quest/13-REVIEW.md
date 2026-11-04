---
phase: 13-generazione-quest
reviewed: 2026-11-04T21:10:40Z
depth: standard (tre reviewer paralleli per area: A generation, B outcomes, C modelli/maintenance)
files_reviewed: 65
files_reviewed_list:
  - src/app.module.ts
  - src/config/env.validation.ts
  - src/config/quest-generation-config.ts
  - src/config/sweep-interval.ts
  - src/migrations/mixed-refs/mixed-ref-paths.ts
  - src/models/enemy.model.ts
  - src/models/enums/accessory-use-type.enum.ts
  - src/models/equipment-item.model.ts
  - src/models/quest-result/quest-result.model.ts
  - src/models/quest/generate-quests-result.model.ts
  - src/models/quest/quest-enemy.model.ts
  - src/models/quest/quest-infos.model.ts
  - src/models/quest/quest-prizes.model.ts
  - src/models/quest/quest.model.ts
  - src/quests/generation/city-picker.ts
  - src/quests/generation/enemy-pool.ts
  - src/quests/generation/generated-prizes.ts
  - src/quests/generation/generated-quest-draft.ts
  - src/quests/generation/generation-rules.ts
  - src/quests/generation/quest-composition.ts
  - src/quests/generation/quest-generation-trigger.module.ts
  - src/quests/generation/quest-generation-trigger.ts
  - src/quests/generation/quest-generation.module.ts
  - src/quests/generation/quest-generation.resolver.ts
  - src/quests/generation/quest-generation.sweeper.ts
  - src/quests/generation/quest-generator.service.ts
  - src/quests/generation/quest-templates.ts
  - src/quests/generation/recommended-loot.ts
  - src/quests/generation/seeded-chance.ts
  - src/quests/maintenance/dungeon-stages.migrator.ts
  - src/quests/maintenance/dungeon-stages.ts
  - src/quests/maintenance/enemy-legendary.migrator.ts
  - src/quests/maintenance/jewel-accessory.migrator.ts
  - src/quests/maintenance/quest-enemies.migration.ts
  - src/quests/maintenance/quest-enemies.migrator.ts
  - src/quests/maintenance/quest-maintenance.boot.ts
  - src/quests/maintenance/quest-maintenance.module.ts
  - src/quests/outcomes/aid/aid-quest.ts
  - src/quests/outcomes/boss-resolution.service.ts
  - src/quests/outcomes/combat/combat-context.ts
  - src/quests/outcomes/combat/combat-resolver.ts
  - src/quests/outcomes/combat/placeholder-combat-resolver.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/dungeon/dungeon-context.ts
  - src/quests/outcomes/dungeon/dungeon-resolver.ts
  - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
  - src/quests/outcomes/gm-completion.service.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/outcome-writer.service.ts
  - src/quests/outcomes/quest-enemies.ts
  - src/quests/outcomes/quest-outcome-plan.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/quest-resolution.service.ts
  - src/quests/outcomes/rescue-plan.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/quest-catalog.populate.ts
  - src/quests/quests.module.ts
  - src/quests/results/quest-result.populate.ts
  - src/quests/results/quest-results-read.module.ts
  - src/schema.gql
  - test/fixtures/quest.fixture.ts
  - test/quests/generation-world.ts
  - test/quests/outcome-world.ts
  - test/quests/quest-result.fixture.ts
findings:
  critical: 0
  warning: 3
  info: 11
  total: 14
status: issues_found
---
# Code review — Phase 13 Generazione quest (fusione dei gruppi A, B, C)

I tre report di gruppo (`13-REVIEW-A.md`, `13-REVIEW-B.md`, `13-REVIEW-C.md`) restano la fonte; questo file li fonde per severità.

## Summary

### Gruppo A
Il gruppo è solido. Verificato senza rilievi: nessun `Math.random` né `process.env` sotto `src/` nei moduli di generazione (RNG iniettato via `ChanceSource`); filtro `legendary === false` fail-closed sia in query (`readEnemies`) sia nei pool; pool ordinati per id; posti del boss in [2, 6] solo adventurer..hero; legend sempre `enemy` 2–4 unità della fascia hero; premi entro i tetti (600 × 25 = 15 000 rame, 120 × 25 = 3000 XP) con `hunger` escluso da rare in su e pet 1 % solo boss da `sellable: false`; consigliati senza tiri; kNN una volta per corsa, `pickCity` null senza consumare tiri; il ciclo di `runOnce` termina sempre (ogni giro toglie un POI libero); E11000 catturato con `isDuplicateKeyError` e POI scartato; config fail-closed senza eco del valore e `.env.example` aggiornato; resolver `@Roles(innkeeper)` + `@AuditTarget`; `QuestGenerationModule` importato dal solo AppModule.

Un solo warning: la garanzia di arresto pulito di `whenIdle()` ha una finestra in cui una nuova corsa parte dopo che l'attesa si è già risolta. Il resto è qualità.

### Gruppo B
Il gruppo B e solido. Verificato punto per punto contro D-10..D-12, D-17, D-21, D-28, D-30:

- Multi-nemico: `readEnemies` fa un solo `find`, conserva i duplicati come voci separate, logga solo id per gli orfani; il segnaposto aggrega HP e danni per quantita senza cambiare il numero e l'ordine dei tiri (un tiro di vittoria, poi per partecipante 1 o 2 tiri ferita). `enemyFactsOf` somma xp x quantita e il draft porta `enemies` anche in sconfitta.
- Aid: clone di `enemies` via `validQuestEnemiesOf`, clone di `prizes.pet`, nessun `generated` (D-17), chiavi stabili.
- Dungeon: dispatch solo per `QuestType.dungeon` (le dungeon non sono tra i tipi registrati, quindi non passano mai da boss/rescue: coerente con D-12), stato portato fra le tappe con consumi e usi scalati a minimo 0, stop alla prima sconfitta, premi solo a fine percorso, `stagesCleared`/`stagesTotal` null fuori dalle dungeon.
- Pet: tiro 20 % per vincitore dopo loot e magia, solo se il pet e a catalogo, scrittura idempotente in `assets.ownedPets` senza toccare `assets.pet`, `rewards.pet` null in sconfitta e nei fogli di soccorso/morte.
- Hook: `regeneratesAfter` richiede `generated === true` e `concludedAt` nel `$set`; `deliver` chiama il trigger per ultimo, dopo il commit, con try/catch e WARN; le altre consegne non possono lanciare (`notify` e `enqueueTrigger` catturano). GM e soccorso non hanno hook: le generate sono solo `enemy`/`boss`, quindi nessun buco.
- Populate: filtro degli orfani su `enemies.enemy` e `pet` (pet a null, lista mai annullata), profondita 1. Modulo: `QuestGenerationTriggerModule` e il singleton condiviso con `QuestGenerationModule`, nessun ciclo, nessuna corsa al boot negli harness.

Un solo difetto di dominio (doppio conteggio degli indossati nei consigliati posseduti, latente finche l'algoritmo dell'utente non li legge) e tre note di qualita.

### Gruppo C
Modelli, SDL, config, modulo di manutenzione e migratori sono solidi e aderenti a CONTEXT e REPO-RULES. Verificato per lettura: ref `{ type: ObjectId, ref }` ovunque (nessun `Mixed`), `QuestEnemy` con `_id: false` e `quantity` min 1, `generated` e `rescue` senza `@Field`, indice unico parziale `quest_generated_open_marker` con `generated: true` e `concludedAt: null`, `Enemy.legendary` default false con lettori lean fail-closed (`legendary: false` nel filtro), `accessoryUseTypes` con `default: undefined`, `pet` con `default: null`, `QuestInfosInput` senza `enemies`, `EquipmentItemInput` non esposto nello SDL generato, SDL additivo salvo le due righe `enemy` sostituite da `enemies`, `mixed-ref-paths` a 34 con `infos.enemies.enemy`, `parseSweepIntervalMs` senza eco del valore, nessun `process.env.` nei file del gruppo, `QuestMaintenanceModule` prima di `QuestGenerationModule` in `app.module.ts` e nessun altro importatore (isolamento dei one-off confermato con grep), passi del boot nell'ordine voluto con try/catch e log di nome/codice. Tabelle: 22 id leggendari e 42 gioielli (nessun duplicato). `QuestEnemiesMigrator` e `EnemyLegendaryMigrator` e `JewelAccessoryMigrator` sono idempotenti (filtro campo assente, `$nin: [true, false]`, `$exists: false`). Le scelte dell'executor sul `DungeonStagesMigrator` (legend saltate con WARN, bande solo dal pool di zona, seme per id, filtro `'infos.enemies.1'`) sono accettabili. Un solo punto di idempotenza non coperto (warning) e tre rilievi minori.

## Critical

### Gruppo C

Nessuno.

## Warning

### Gruppo A

### A-WR-01: `whenIdle()` non copre un rerun avviato dal `finally` né una `request()` arrivata dopo lo stop

**File:** `src/quests/generation/quest-generator.service.ts:181-202`
**Issue:** `generate()` assegna a `inFlight` la promessa `drain().finally(...)`. Se `rerun` è `true` quando il `finally` gira, `startSafely()` avvia subito una nuova corsa e `inFlight` passa alla nuova promessa. `whenIdle()` aveva però agganciato la vecchia: si risolve mentre la nuova corsa è in volo. Succede quando una `request()` cade tra il controllo `while (this.rerun)` di `drain()` e il `finally` (microtask), oppure quando `drain()` lancia con `rerun` già impostato. In più `request()` non conosce lo stop: una conclusione di quest generata (trigger D-17) durante lo shutdown avvia una corsa dopo `onModuleDestroy`; lo `stopping` dello sweeper protegge solo il timer.
**Why it matters:** `onModuleDestroy` promette che la corsa in volo finisce prima che Mongoose chiuda (commento dello sweeper). Con una corsa orfana la connessione si chiude a metà, le `create` falliscono con errori di connessione e i log dello shutdown sono rumorosi. Nessuna perdita di dati, perché le create sono atomiche e il DB decide alla corsa successiva.
**Suggested fix:** RED in `quest-generator.int-spec.ts` (o unit con model finti): `request()` durante una corsa, poi `whenIdle()` deve risolversi solo dopo la seconda corsa; dopo `whenIdle()` una `request()` non deve avviare nulla. Poi:
```ts
async whenIdle(): Promise<void> {
    while (this.inFlight) {
        await this.inFlight.catch(() => undefined);
    }
}
// + flag `closed` impostato da un metodo `stop()` chiamato da onModuleDestroy prima di whenIdle();
// request() e il rerun del finally diventano no-op quando closed
```

### Gruppo B

### B-WR-01: i consigliati posseduti contano due volte gli equipaggiamenti indossati

**File:** `src/quests/outcomes/dungeon/dungeon-context.ts:56-87`
**Issue:** `possessedQuantityOf` per un `EquipmentItem` somma `ownedEquipments` e le copie negli slot (`wornCopiesOf`). Ma indossare non toglie l'oggetto da `ownedEquipments`: `equipItemFilter` richiede `assets.ownedEquipments.item` e `equipItemUpdate` scrive solo lo slot; `trade-inventory.ts` svuota lo slot solo quando la quantita posseduta arriva a zero. Quindi un indossato e sempre un sottoinsieme del posseduto. Scenario: un personaggio con una spada x1 nell'inventario e indossata nella mano destra ottiene `quantity: 2` per la spada consigliata (3 se la porta in due mani). Il RESEARCH (riga 153) parlava di unione («ownedItems U ownedEquipments U indossati»), l'implementazione somma. Il test «sums the owned and worn copies» (dungeon-context.spec.ts:142) codifica la somma e il test «worn included» usa `ownedEquipments: []`, un caso impossibile nel gioco.
**Why it matters:** D-11 consegna all'algoritmo finale dell'utente quantita da cui dipendono perdita di vita e ferite nelle prove di esplorazione: un conteggio gonfiato falsa il verdetto senza errori visibili. Oggi il segnaposto non li legge, quindi il danno e latente, ma il contratto della porta e sbagliato.
**Suggested fix:** per gli equipaggiamenti, quantita = posseduta; contare l'indossato solo per le copie che superano il posseduto (dato incoerente a mano), cioe `Math.max(owned, worn)`. Spec RED prima: (1) `ownedEquipments: [{ item: sword, quantity: 1 }]` con spada in `rightHand` ⇒ `quantity: 1`; (2) `quantity: 1` indossata in due slot ⇒ `max(1, 2) = 2` oppure 1 se si decide di limitare al posseduto (da fissare con l'utente); (3) il caso `ownedEquipments: []` con slot indossato resta 1. Aggiornare i due test esistenti di conseguenza.

### Gruppo C

### C-WR-01: `DungeonStagesMigrator` non è idempotente su una dungeon aperta senza nemici

**File:** `src/quests/maintenance/dungeon-stages.migrator.ts:102-129` (con `src/quests/maintenance/dungeon-stages.ts:121-135`)
**Issue:** il filtro di ammissione è `validQuestEnemiesOf(...).length <= 1`, ma il guard di scrittura è `stages.length <= current.length` → skip. Per una dungeon aperta con 0 voci valide (campo vuoto, voci scartate da `validQuestEnemiesOf`, o legacy `enemy` nullo) il conteggio delle tappe aggiunte è 1–3 (`ADDED_STAGES`) e, con `count = 1` (o con la banda di briganti rookie/adventurer che da sola copre il conteggio), il risultato è UNA sola tappa: `stages.length (1) > current.length (0)`, quindi scrive `infos.enemies` con 1 voce. Al boot successivo quella dungeon ha di nuovo ≤ 1 voce, passa il filtro, `current` ora è 1 e il seme per id è lo stesso: ne aggiunge altre 1–3. La seconda corsa NON è 0, contro il requisito del brief (idempotenza, seconda corsa 0) e contro il «mai ritoccare ciò che è già a tappe» di T-13-18.
**Why it matters:** finché il migratore resta nel repo (uscita prevista dopo il primo boot reale) ogni riavvio può far crescere una dungeon senza nemici; il risultato non è deterministico rispetto al DB di partenza e viola la promessa di idempotenza dichiarata nell'handoff. Raggiungibile solo con dungeon a 0 nemici, quindi probabilità bassa sui 40 fissi (che hanno un nemico), ma non provata da alcun test.
**Suggested fix:** una dungeon arricchita deve uscire con ≥ 2 tappe, altrimenti non si scrive. Spec RED prima (`dungeon-stages.migrator.int-spec.ts`, o unit su `dungeonStagesOf` + guard): dungeon aperta con `infos.enemies: []`, seme/mock che dà `count = 1`; asserire che dopo `migrate()` due corse consecutive producano lo stesso `infos.enemies` e la seconda riporti `enriched: 0`. Poi in `enrich`:
```ts
const MIN_STAGES = 2;
if (stages.length < MIN_STAGES || stages.length <= current.length) return false;
```
(alternativa: ammettere solo dungeon con esattamente 1 voce, `=== 1`, lasciando le vuote alla cura a DB).

## Info

### Gruppo A

### A-IN-01: la corsa al boot dello sweeper non aspetta le migrazioni di `QuestMaintenanceBoot`

**File:** `src/quests/generation/quest-generation.sweeper.ts:25-32`
**Issue:** `QuestMaintenanceBoot` ordina i passi (flag dei leggendari, gioielli, tappe) e solo dopo chiama `request()` ("a dati pronti", D-17). Lo sweeper chiama però `request()` in modo indipendente nel proprio `onApplicationBootstrap`, senza ordine garantito rispetto a quello dell'orchestratore.
**Why it matters:** Al primo boot dopo il deploy la corsa dello sweeper può leggere nemici non ancora marcati. Nessun danno: il filtro è fail-closed (0 candidati) e il `request()` di manutenzione accoda un rerun. Resta una corsa sprecata, e il commento "a dati pronti" non è garantito dal codice.
**Suggested fix:** Togliere `this.generator.request()` dal boot dello sweeper e lasciare solo la richiesta di manutenzione; oppure documentare che il doppio `request()` è voluto e coperto dal rerun.

### A-IN-02: errore a metà corsa perde il conteggio e il log delle quest già create

**File:** `src/quests/generation/quest-generator.service.ts:222-249`
**Issue:** Il log "N missioni create" è solo in fondo a `runOnce`. Se una `create` lancia un errore diverso da E11000 dopo alcune creazioni riuscite, `startSafely` logga solo "corsa fallita".
**Why it matters:** Chi legge i log non vede che alcune quest sono state create. Un `generateQuests` fallito dà all'oste un errore senza dire cosa è stato scritto.
**Suggested fix:** `try { ... } finally { if (created > 0) this.logger.log(...) }` in `runOnce`, con un test che scripta un errore alla seconda `create`.

### A-IN-03: export mai usati in `src/`

**File:** `src/quests/generation/seeded-chance.ts:16-31`, `src/quests/generation/generation-rules.ts:42`
**Issue:** `SeededChanceSource.pick` e `shuffle` non sono chiamati da codice di produzione (solo `keyedChance` è usato dal migratore delle dungeon); `LEGEND_PARTY_AVERAGE_PE` non è letto da nessuno (il commento lo dichiara "documentata").
**Why it matters:** Superficie morta da mantenere; due metodi in più nel PRNG da tenere deterministici.
**Suggested fix:** Eliminare `pick`/`shuffle` (e le relative spec) e trasformare `LEGEND_PARTY_AVERAGE_PE` in commento, oppure usarli.

### A-IN-04: `rarity in RARITY_RANK` accetta chiavi del prototipo

**File:** `src/quests/generation/recommended-loot.ts:46-50`
**Issue:** `'constructor' in RARITY_RANK` è `true`, quindi una rarità letta dal DB con quel valore (campo curato a mano) restituirebbe una funzione come rango; `rank <= maxRank` dà `false`, ma il tipo `number` è violato e la logica "rarità sconosciuta esclusa" poggia sul caso.
**Why it matters:** Fragilità teorica, nessuno scenario reale oggi.
**Suggested fix:** `Object.hasOwn(RARITY_RANK, rarity)`; spec con rarità `'constructor'` esclusa.

### A-IN-05: ordine dei tiri non documentato in un punto solo; commento del harness impreciso

**File:** `src/quests/generation/quest-generator.service.ts:230-299`, `test/quests/generation-world.ts:130`
**Issue:** L'ordine dei tiri per quest (città, POI, rango/forma, pool, premi, pet, annuncio) è corretto e stabile ma emerge solo leggendo cinque file; `pickPoi` ha tipo di ritorno `string` ma con lista vuota restituirebbe `undefined` (oggi protetto dal peso 0). Nel harness il commento sopra `persistGenerationWorld` dice "un leggendario per fascia", ma ne crea uno per ogni voce di `enemyXps`.
**Why it matters:** Chi cambia un passo sposta tutti i tiri successivi senza accorgersene (le spec seed-based si rompono senza spiegazione).
**Suggested fix:** Un commento di testa a `createOn` con l'ordine dei tiri; `pickPoi` che lancia (o ritorna `string | undefined`) con lista vuota; correggere il commento del harness.

---

_Reviewed: 2026-11-04T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo B

### B-IN-01: dungeon senza nemici validi: successo automatico con `stagesTotal` null, ramo 0/0 del segnaposto irraggiungibile

**File:** `src/quests/outcomes/combatant-plan.ts:62` (con `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts:107` e `src/quests/outcomes/quest-resolution.service.ts:176`)
**Issue:** `combatContextOf` restituisce null con catalogo nemici vuoto, quindi `fight` esce prima del dispatch e una dungeon con tutti i nemici orfani (o `enemies` vuoto scritto a mano) si risolve in successo automatico con premi pieni e `stagesCleared`/`stagesTotal` null. Il ramo «zero nemici ⇒ successo 0/0» di `PlaceholderDungeonResolver.explore` non e mai raggiunto dal servizio, e il foglio dice «non e una dungeon a tappe» invece di 0/0. E la stessa scelta di C6/D-01 per tutti i tipi, ma D-12 non la discute per le dungeon.
**Why it matters:** non e un bug nuovo (stesso comportamento di enemy/boss), ma il contratto e doppio: la porta dice 0/0, il servizio null. Cancellare a DB l'unico nemico di una dungeon regala i premi di fine percorso senza avvertire.
**Suggested fix:** decidere e documentare in un commento di `fight`: o si accetta (e si toglie o si segna come difensivo il ramo 0/0 del segnaposto, con una spec che ne dichiari l'uso solo diretto), oppure si fa passare la dungeon dalla porta con contesto vuoto e `stages: { cleared: 0, total: 0 }`. Spec RED nel secondo caso: dungeon con nemici tutti orfani ⇒ `stagesTotal: 0`.

### B-IN-02: `isPositiveInteger` duplicato con semantica diversa

**File:** `src/quests/outcomes/dungeon/dungeon-context.ts:22`
**Issue:** il file ridefinisce `isPositiveInteger` con `Number.isInteger(value) && value >= 1`, mentre `src/quests/outcomes/outcome-numbers.ts` esporta lo stesso nome con `Number.isSafeInteger(value) && value > 0` (usato da `quest-enemies.ts` e `outcome-plan.ts`). Un valore come `2 ** 60` passa in uno e non nell'altro.
**Why it matters:** regola Boy Scout del progetto (zero duplicazione) e rischio di divergenza futura sulla validazione delle quantita.
**Suggested fix:** importare `isPositiveInteger` da `../outcome-numbers` e cancellare la copia locale.

### B-IN-03: `readEnemies` legge i documenti `Enemy` interi

**File:** `src/quests/outcomes/resolution-loader.service.ts:491-494`
**Issue:** il `find` sui nemici non ha proiezione: ogni risoluzione carica tutti i campi (lore, flag, ecc.) mentre `CombatEnemySnapshot` usa solo `name`, `lifePoints`, `xp`, `damages`, `baseWeaknesses`, `energyWeaknesses`. Le altre letture del catalogo nello stesso file proiettano.
**Why it matters:** incoerenza con il resto del loader e, con pacchi di nemici, documenti inutili in memoria dentro il percorso caldo della risoluzione; nessun effetto sulla correttezza.
**Suggested fix:** passare la proiezione `{ name: 1, lifePoints: 1, xp: 1, damages: 1, baseWeaknesses: 1, energyWeaknesses: 1 }` come secondo argomento (la spec esistente del loader resta verde se usa questi campi).

---

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo C

### C-IN-01: l'indice unico di guardia è costruito da `SweepIndexVerifier` fire-and-forget con messaggio d'errore fuorviante

**File:** `src/models/quest/quest.model.ts:82-91` (costruzione in `src/mongo/sweep-index.verifier.ts:34-52`, fuori gruppo)
**Issue:** `quest_generated_open_marker` è la guardia di concorrenza di D-28 (secondo insert → E11000), ma viene creato solo dal verifier degli indici di sweep, avviato con `void this.verifyAll()`, e un fallimento (per esempio doppioni preesistenti) viene loggato come «lo sweep resta corretto ma più lento». Per questo indice il fallimento non è un semplice rallentamento: la unicità non c'è e il log lo nasconde. Inoltre la prima corsa del generatore al boot può partire prima che `createIndexes` abbia finito.
**Why it matters:** il rischio reale è basso (single-flight in-process, il generatore controlla comunque le aperte), ma un errore di build dell'indice passerebbe come un warning di performance.
**Suggested fix:** nel verifier distinguere il messaggio per modello/indice (per `Quest`: «guardia di unicità delle generate non costruita»), con una spec che fa fallire `createIndexes` e asserisce il testo; opzionale attendere `verifyAll()` prima della richiesta al generatore.

### C-IN-02: `JewelAccessoryMigrator` segnala solo gli id assenti, non quelli presenti con `equipType` diverso da ring/necklace

**File:** `src/quests/maintenance/jewel-accessory.migrator.ts:96-118`
**Issue:** `missingJewels` cerca per `_id` senza filtro su `equipType`, mentre la scrittura richiede `equipType: { $in: [ring, necklace] }`. Un id della tabella presente a DB ma con altro `equipType` (cura a mano) viene silenziosamente non scritto e non compare nel WARN.
**Why it matters:** il gioiello resta senza `accessoryUseTypes` senza alcun segnale al boot (il brief chiede il WARN con gli id mancanti).
**Suggested fix:** in `missingJewels` aggiungere `equipType: { $in: JEWEL_EQUIP_TYPES }` al filtro, con una spec int che inserisce un item della tabella con `equipType` non gioiello e attende l'id nel WARN.

### C-IN-03: `DungeonStagesMigrator` ammette anche dungeon già avviate

**File:** `src/quests/maintenance/dungeon-stages.migrator.ts:157-165` e `:129-141`
**Issue:** il filtro è `concludedAt: null` ma non `startedAt: null`: una dungeon con party già partito (risoluzione in corso) potrebbe vedersi allungare la lista tappe a metà esplorazione se il boot capita in quella finestra.
**Why it matters:** scenario raro (boot con una dungeon in corso), ma cambia le tappe sotto un party; il prezzo del guard è una riga.
**Suggested fix:** aggiungere `startedAt: null` sia alla `find` di `openDungeons` sia al filtro dell'`updateOne`, con una spec int che verifica che una dungeon con `startedAt` valorizzato resti intatta.

---

_Reviewed: 2026-11-04T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
