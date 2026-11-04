# Phase 13: Generazione quest - Research

**Researched:** 2026-11-04
**Domain:** NestJS 11 + Mongoose 8 + Apollo code-first: modifica SDL non additiva (`enemy` → `enemies`), generatore server-side, porta `DungeonResolver`, migratori al boot
**Confidence:** HIGH (codice letto, sonde sull'harness in memoria, dati dei nemici ricalcolati dal contenuto della Phase 11 in git `e857802^`)

## Summary

Il lavoro si divide in quattro blocchi indipendenti nell'ordine dei piani: (1) **contratto multi-nemico** — `QuestEnemy` sostituisce `enemy` in `QuestInfos` e `QuestResult`, il catalogo del combattimento diventa una lista, il segnaposto aggrega, l'XP somma `xp × quantity`, migrazione idempotente al boot (sonda: pipeline in due stadi, seconda corsa 0 modificati); (2) **porta `DungeonResolver`** che compone il `CombatResolver` tappa per tappa; (3) **generatore** — moduli puri (fasce, composizione, città, premi, template) + servizio con single-flight, indice unico parziale sul POI (sonda: su tre insert concorrenti ne passa uno), trigger da `OutcomeWriter.deliver`, sweep orario e mutation innkeeper; (4) **contenuto una tantum** — `Enemy.legendary`, 40 dungeon arricchite, 42 gioielli, eseguiti una volta sul DB reale e poi rimossi (Phase 12 D-25).

Tre fatti del codice cambiano la pianificazione: gli slot di `requiredAdventurers` sono **per titolo esatto** (`quest-capacity.ts:46-55`), quindi un `legend` non entra mai in una generata `{ title: hero }` (C1); il populate con un nemico orfano dentro `[QuestEnemy!]!` annullerebbe **l'intera lista `quests`** sul filo se non si filtra in `dropOrphanCatalogRefs` (Pitfall 1); ogni harness che monta `QuestOutcomesModule` erediterà lo sweeper del generatore se il trigger vive in un modulo importato da lì (Pitfall 4).

**Primary recommendation:** nessuna libreria nuova; nuova cartella `src/quests/generation/` (regole pure + `QuestGenerator` + sweeper + resolver), `src/quests/outcomes/dungeon/` (porta + segnaposto), `src/quests/maintenance/` (migratore permanente `enemy` → `enemies` + i tre una tantum + orchestratore, importato SOLO da `AppModule`).

<user_constraints>
## User Constraints (from CONTEXT.md)

`13-CONTEXT.md` è autoritativo; qui una riga per decisione (testo completo nel file, non ricopiato per il limite di lunghezza).

### Locked Decisions
- **D-01** `QuestInfos.enemies: [QuestEnemy!]!` e `QuestResult.enemies` sostituiscono `enemy` (SDL non additivo, real boot); `stagesCleared`/`stagesTotal` nullable; migrazione idempotente al boot; aid copia `enemies`; mai popolare `enemies[].enemy.relatedLore`.
- **D-02** `CombatContext.enemies` con `quantity`; segnaposto aggrega; XP = `xpPrize` + Σ `xp × quantity`, clamp 50 000; nessun nemico = successo automatico.
- **D-03/D-04/D-05/D-06** boss = un nemico di fascia superiore; leggendari mai generati (`Enemy.legendary` seminato una volta); posti = ⌈PE / media⌉ ∈ [2, 6], medie 400/1500/4000/6000/15000; 1 boss ogni 10.
- **D-07/D-08/D-09** forma (a) singolo in fascia o (b) branco più debole con somma in fascia; fasce rookie 7–14, adventurer 21–35, paladin 70–169, mage 225–450, hero 549–803; pool = zona del POI + habitat `city`, `all` solo se vuota; un posto del rango, `requiredPoints` nullo.
- **D-10..D-13** dungeon = tappe in ordine di `enemies`, porta + segnaposto, prova di esplorazione neutra, premi solo alla fine, prima sconfitta = fallimento di oggi; contesto con `recommendedLoot` e posseduti; 40 dungeon arricchite una tantum, poi cura a DB.
- **D-14..D-18** nessuna scadenza; target globale (`QUEST_GENERATION_TARGET`, default = numero di città), tetto 3 per città, peso decrescente con la densità vicina, POI libero senza marker; rango meno coperto (parità → più basso); `generateQuests` senza argomenti `{ created }`; trigger conclusione + sweep (`QUEST_GENERATION_SWEEP_INTERVAL_MS` 3 600 000) + boot + mutation; single-flight, idempotente, deterministico; flag interno `generated`; gli insert non emettono `questUpdated`.
- **D-19/D-20/D-21** premi enemy 150 rame + 40 XP, boss 600 + 120, × moltiplicatore 1/2/5/12/25; pool `randomLoot` per rango e tipo, legendary solo da hero; `QuestPrizes.pet` 1% sui boss, 20% per vincitore, pool = pet `sellable: false`, scrittura idempotente.
- **D-22** titolo e annuncio da template (3 varianti per tipo), `relatedLore` = città + nemici, `timeToComplete` 1 h / 3 h.
- **D-23..D-26** `EquipmentItem.accessoryUseTypes: [AccessoryUseType!]` solo ring/necklace, nel contesto del `CombatResolver`, valori dalla tabella `13-JEWELS-REVIEW.md` approvata, migratore una tantum.

### Claude's Discretion
Nomi, indici, forma del claim sul POI, «città vicine», tie-break del rango, quota a/b, coda Bull o chiamata diretta, publisher sugli insert, nome del campo del pet nel risultato, `timeToComplete`, varianti dei template.

### Deferred Ideas (OUT OF SCOPE)
Motore di combattimento ed esplorazione reali, `stages` tipizzate, scadenza delle generate, argomenti di `generateQuests`, pet sulle `enemy`, descrizioni LLM, `crime`/`guard`, publisher sugli insert (facoltativo), ref annidati sotto `me.currentCharacter`, rimozione delle query deprecate del negozio, calibrazione dei nemici.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrizione | Supporto della ricerca |
|----|-------------|------------------------|
| BE-QGEN-01 | `enemies` sostituisce `enemy` ovunque + migrazione | §SDL, §Multi-nemico, §Migrazione, sonda 2 |
| BE-QGEN-02 | Trigger, single-flight, idempotenza, determinismo | §Generatore (trigger, single-flight), §Config |
| BE-QGEN-03 | Solo enemy/boss, tetto 3, boss, leggendari | §Fasce e boss (liste reali), C1, C5 |
| BE-QGEN-04 | Città pesata, POI libero, marker escluso | §Città vicine (kNN), sonda 1 |
| BE-QGEN-05 | Rango meno coperto, pool, forme a/b | §Composizione |
| BE-QGEN-06 | Premi, `randomLoot`, `recommendedLoot` | §Premi, C4 |
| BE-QGEN-07 | Titolo/annuncio/lore/tempi | §Template |
| BE-QGEN-08 | Integration tetto/concorrenza/distribuzione/FORBIDDEN, handoff | §Validation Architecture |
| BE-QGEN-09 | Dungeon a tappe + arricchimento | §DungeonResolver, §Una tantum |
| BE-QGEN-10 | Premio pet | §Premi (pet) |
| BE-QGEN-11 | `accessoryUseTypes` | §Gioielli |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 13-REPO-RULES.md)

- TDD red → green → refactor, Conventional Commits in inglese, nessun trailer `Co-Authored-By`/`Generated with`, stage per path.
- Mai `npm run build`/`nest build` (il BE dell'utente gira da `dist/`), mai `npm run lint`/`format`: solo `npx prettier --write <file>` e `npx eslint <file>` sui file toccati; `npx tsc --noEmit -p tsconfig.json`.
- Jest: percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; `pgrep -fl jest` vuoto a fine task.
- `src/schema.gql` cambia solo dal real boot e si committa col codice; le sole righe tolte sono le due `  enemy: Enemy`.
- Ref sempre `MongooseSchema.Types.ObjectId` + `ref` (mai `Mixed`); nessun `process.env.` in `src/` (drift spec).
- Il DB reale non si tocca; i migratori una tantum non sono importati da altri moduli e escono dal repo dopo il primo boot reale; il migratore dei gioielli parte solo con la tabella «approvata».
- Operatori Mongo solo in code span nei `.md`.

## Standard Stack

Nessuna dipendenza nuova. Riuso verificato nel repo:

| Pezzo | Dove | Uso in questa fase |
|---|---|---|
| `ChanceSource` / `MathChanceSource` | `src/quests/outcomes/chance-source.ts` | RNG iniettato del generatore e del segnaposto dungeon |
| `SequenceChance` | `test/quests/sequence-chance.ts` | test con tiri scritti |
| mulberry32 + seme da chiave | git `7b2f482:src/shops/seeded-random.ts` (sha256 → mulberry32) e `e857802^:src/content/generation/seeded-chance.ts` (`SeededChanceSource`, `keyedChance`, `shuffle`) | ripristinare come `src/quests/generation/seeded-chance.ts`: arricchimento dungeon deterministico per id + test di distribuzione |
| `rollLoot`, `DROP_RATES`, `RARITY_ORDER` | `src/quests/outcomes/rewards/cascading-loot.ts` | invariati: un oggetto a testa sul pool ampio |
| `fromCopper` | `src/economy/coins` | `prizeCoins` |
| `parseSweepIntervalMs` | `src/config/sweep-interval.ts` | aggiungere un terzo parametro `fallback` (oggi fisso a 60 000) |
| `KeyedSingleFlight` | `src/mongo/keyed-single-flight.ts` | modello del rerun per il trigger |
| Ricetta `recommendedLoot` | `e857802^:src/content/generation/fixed-quests.generator.ts:497-622` | armi contro le debolezze + miglior cura entro la rarità di fascia |
| Template Phase 11 | `e857802^:src/content/generation/quest-titles.ts`, `quest-descriptions.ts` | stile e voce dei committenti |

**Alternative scartate:** coda Bull dedicata al generatore (serve Redis negli harness e un processor; lo sweep orario recupera comunque un trigger perso) → **chiamata diretta in processo**.

## Architecture Patterns

```
src/models/quest/quest-enemy.model.ts          # QuestEnemy { enemy: Enemy!, quantity: Int! } + schema _id:false
src/models/enums/accessory-use-type.enum.ts    # AccessoryUseType { attack, defense } + registerEnumType (stile use-type.enum.ts)
src/models/quest/generate-quests-result.model.ts
src/quests/outcomes/dungeon/                   # dungeon-resolver.ts (porta), placeholder-dungeon-resolver.ts, dungeon-context.ts
src/quests/generation/                         # regole pure + QuestGenerator + QuestGenerationTrigger + sweeper + resolver + module
src/quests/maintenance/                        # QuestEnemiesMigrator (permanente) + one-off + QuestMaintenanceBoot (solo AppModule)
src/config/quest-generation-config.ts
```

### SDL: diff esatto (sorted, come lo stampa il real boot)

Righe tolte (le sole): `  enemy: Enemy` in `type QuestInfos` (`schema.gql:558`) e in `type QuestResult` (`:604`). Stringhe nuove per `test/app.int-spec.ts` (RED prima del codice):

- `:443-444` → `'type QuestInfos {\n  description: String\n  enemies: [QuestEnemy!]!\n  markerLocation: PointOfInterest!\n  relatedLore: [Lore!]!\n  timeToComplete: Int\n  title: String!\n  type: String!\n}'`
- `:613-614` → `'type QuestPrizes {\n  pet: Pet\n  prizeCoins: Coins\n  prizeItem: AssetQuantity\n  randomLoot: [AssetQuantity!]!\n  spell: Spell\n  xpPrize: Int\n}'`
- `:630-631` → in `type QuestResult` `enemy: Enemy` diventa `enemies: [QuestEnemy!]!` (fra `consumablesUsed` e `hpAfter`) e dopo `spellsUsed: [SpellUsage!]!` si aggiungono `stagesCleared: Int` e `stagesTotal: Int` (prima di `titleAfter`).
- `:636-637` → `'type QuestRewards {\n  coins: Coins!\n  items: [AssetQuantity!]!\n  pet: Pet\n}'` (il tipo dei premi del risultato si chiama **`QuestRewards`**: campo `QuestRewards.pet`).
- nuovi: `'type QuestEnemy {\n  enemy: Enemy!\n  quantity: Int!\n}'`, `'type GenerateQuestsResult {\n  created: Int!\n}'`, `'generateQuests: GenerateQuestsResult!'`, `'enum AccessoryUseType {\n  attack\n  defense\n}'`, `'  legendary: Boolean!\n'` in `type Enemy` (fra `imagePath` e `lifePoints`), `'  accessoryUseTypes: [AccessoryUseType!]\n'` primo campo di `type EquipmentItem`.
- `EXPECTED_INNKEEPER_HANDLERS` (`:114-125`): inserire `'QuestGenerationResolver.generateQuests'` fra `'PushResolver.sendTestPush'` e `'ShopAdminResolver.shopPoolReport'` (lista ordinata, `:1053`).
- `expect(schema).not.toMatch(/\bkind\b|\bgrade\b|CombatResolver/)` (`:650`) resta verde: `DungeonResolver` è una classe DI, mai nello SDL.

**Input:** `QuestInfosInput`/`QuestInput` ed `EquipmentItemInput` **non sono nello SDL** (`app.int-spec.ts:446` lo asserisce; nessun resolver li usa) e non stanno in `VALIDATED_INPUTS` di `src/validation/input-decorators.spec.ts`; `generateQuests` non ha argomenti → nessun input nuovo, la whitelist non cambia. Boy Scout: togliere `enemy` da `QuestInfosInput` (`quest-infos.model.ts:60-61`) senza aggiungere `enemies`.

### Multi-nemico: punti di modifica

| File | Oggi | Dopo |
|---|---|---|
| `src/models/quest/quest-infos.model.ts:20-26` | `enemy` ref | `@Field(() => [QuestEnemy]) @Prop({ type: [QuestEnemySchema], default: [] }) enemies` |
| `src/models/quest-result/quest-result.model.ts:170-176`, `:56-65` | `enemy` | `enemies` (stessa forma), `stagesCleared`/`stagesTotal` (`Number`, default null), `QuestRewards.pet` ref `Pet` default null |
| `src/models/quest/quest-prizes.model.ts` | — | `pet` ref `Pet`, default null (come `spell`) |
| `src/quests/quest-catalog.populate.ts:9` | `infos.enemy` | `{ path: 'infos.enemies.enemy', model: Enemy.name }` + `{ path: 'prizes.pet', model: Pet.name }`; `dropOrphanCatalogRefs` filtra le voci con `enemy` non popolato (Pitfall 1) |
| `src/quests/results/quest-result.populate.ts:14,49` | `enemy` | `enemies.enemy`, `rewards.pet`; `dropOrphanResultRefs` filtra; `unpopulatedResultOf` → `enemies: []`, `rewards.pet: null` |
| `combat/combat-resolver.ts:49-63` | `enemy: CombatEnemy` | `CombatEnemy` + `quantity`; `CombatContext.enemies: CombatEnemy[]`; `CombatEquipment` + `equipType`, `accessoryUseTypes: AccessoryUseType[] \| null` |
| `combat/combat-context.ts:42-59,213-236` | `CombatHydration.enemy` | `enemies: { snapshot, quantity }[]` nell'ordine della quest (le tappe), partecipanti sempre ordinati per id |
| `combat/placeholder-combat-resolver.ts:62-69,99` | `lifePoints`, `damages` del nemico | Σ `lifePoints × quantity`; danno = Σ `damagePower × quantity` (un solo modulo, PROVVISORIO) |
| `combatant-plan.ts:53-76` | `catalog.enemy` | `combatContextOf` nullo se la lista valida è vuota; `enemyFactsOf` → `{ enemies: [{ enemy, quantity }], xp: Σ }` (xp non finito = 0 per voce) |
| `resolution-loader.service.ts:96-104,375-423,471-486` | `readEnemy` | `readEnemies`: un `find` con `_id` in lista, ordine e `quantity` dalla quest, orfani e quantità non intere ≥ 1 scartati con WARN di soli id; projection dell'equipaggiamento `{ damages: 1, equipType: 1, accessoryUseTypes: 1 }` (`:395`); `RESOLUTION_QUEST_PROJECTION` (`:108-115`) + `generated: 1`; catalogo premi legge il `Pet` di `prizes.pet` |
| `outcome-plan.ts:109,127,294,420` | `enemy` | `enemies` nel draft, `xpEarned = xpPrize + xp` dei nemici, `stagesCleared/stagesTotal` dal battle, `rewards.pet` e ownedPets (§Premi) |
| `aid/aid-quest.ts:15,41,103,69-79` | `enemy` | `enemies` clonati (`refIdOf` per voce), `prizes.pet` clonato; la aid NON porta `generated` |
| `rescue-plan.ts:68` | `enemy: null` | `enemies: []` |
| `gm-completion.service.ts:311` | `enemyFactsOf` | invariato nella chiamata (nuova forma) |
| `migrations/mixed-refs/mixed-ref-paths.ts:56` | `scalar('quests', 'infos.enemy')` | `subdocArray('quests', 'infos.enemies', 'enemy')`: il conteggio 34 della spec resta |

Lettore tollerante (puro, `quest-enemies.ts`): `Array.isArray(infos.enemies) ? infos.enemies : (infos.enemy ? [{ enemy, quantity: 1 }] : [])`. Serve perché `QuestResolutionSweeper` e il processor Bull partono al boot **prima** o in parallelo al migratore (`quest-resolution.sweeper.ts:96-105`, F6 di `spell-state.migrator.ts:84`) e i loader leggono `lean` (senza default Mongoose). Resta finché resta il migratore permanente.

Servizi toccati (solo il passaggio di forma): `QuestResolutionService.fight` (`quest-resolution.service.ts:159-170`, qui entra la dungeon), `BossResolutionService` (`boss-resolution.service.ts:143-150`), `RescueResolutionService` (`rescue-resolution.service.ts:392-397`), `GmCompletionService` (`:311`); `OutcomeWriter` cambia solo in `deliver` (trigger) e `CommittedOutcome` (`outcome-writer.service.ts:48,160`).

### Migrazione `enemy` → `enemies` (BE-QGEN-01) — permanente, pattern `SpellStateMigrator`

Sonda 2 (harness): `updateMany` con filtro `'infos.enemies': { $exists: false }` e pipeline

```ts
[{ $set: { 'infos.enemies': { $cond: [
    { $eq: [{ $ifNull: ['$infos.enemy', null] }, null] }, [],
    [{ enemy: '$infos.enemy', quantity: 1 }] ] } } },
 { $unset: 'infos.enemy' }]
```

prima corsa 3 modificati su 4 (nemico, `null`, campo assente → `[]`), seconda corsa **0**. Su `questresults` lo stesso con `enemies`/`enemy` alla radice. Attenzione: le quest di servizio hanno `infos.enemy: null` (default dello schema), quindi la migrazione tocca **tutte** le ~581 quest e i 24 risultati, non solo le 117 con nemico. Non bloccante, errore solo loggato (`describeError`), report con i conteggi. Vive in `QuestMaintenanceModule` importato SOLO da `AppModule` (gli harness non la eseguono; la sua int-spec la chiama a mano).

### `DungeonResolver` (BE-QGEN-09)

```ts
// porta, come CombatResolver: contesto puro idratato, nessun I/O
export interface DungeonContext extends CombatContext {
    recommendedLoot: { itemType: ItemReferenceType; itemId: string; quantity: number }[];
    // per partecipante: consigliati posseduti (ownedItems ∪ ownedEquipments ∪ indossati)
    recommendedOwned: Record<string, { itemType: ItemReferenceType; itemId: string; quantity: number }[]>;
}
export interface DungeonResolution extends CombatResolution { stagesCleared: number; stagesTotal: number }
export abstract class DungeonResolver {
    abstract explore(context: DungeonContext, chance: ChanceSource): DungeonResolution;
}
```

Segnaposto `PlaceholderDungeonResolver` (inietta `CombatResolver`): per ogni voce di `enemies` costruisce un `CombatContext` con `enemies: [voce]` e i partecipanti aggiornati dalla tappa precedente (`currentLifePoints = hpAfter`, ferite aggiunte, consumabili e usi delle magie scalati), chiama `combat.resolve`; prova di esplorazione = nessuna operazione; alla prima `failure` restituisce `verdict: 'failure'`, `stagesCleared = k`; altrimenti `stagesCleared = stagesTotal`. Gli effetti si fondono per partecipante (ultimo `hpAfter`, unione delle ferite, somme dei consumi). Binding in `quest-outcomes.module.ts:78` accanto a `CombatResolver`. Dispatch in `QuestResolutionService.fight`: `infos.type === dungeon` → `dungeon.explore`, altrimenti `combat.resolve`; `CombatantBattle` (`combatant-plan.ts:26-29`) guadagna `stages?: { cleared; total }` e `planParticipant` lo scrive nel risultato. Premi solo alla fine: già vero, il fallimento passa `NO_REWARDS` (`combatant-plan.ts:118-120`). Fallimento: percorso di oggi (aid clonata con gli stessi `enemies`, tipo `aid`, risolta dal soccorso con il combattimento **aggregato**, senza tappe). Le dungeon sono individuali e ripetibili (`resolution-kind.ts:12-23`, `quest-eligibility.ts:27-35`): `GmCompletionService` non le tocca (solo corsie story/worldMission, `quest-lanes.ts:18`).

### Fasce, boss e liste reali (BE-QGEN-03/05)

Costanti (modulo puro `generation-rules.ts`), con `xp = max(1, round(PE × 0.14084507))` come la Phase 11:

| Rango | Fascia `xp` (singolo) | Media PE boss | Moltiplicatore | Singoli oggi | Boss candidati oggi (posti) |
|---|---|---|---|---|---|
| rookie | 7–14 | — | 1 | 14 | nessuno |
| adventurer | 21–35 | 400 | 2 | 13 | 68 (2–6) |
| paladin | 70–169 | 1500 | 5 | 27 | 40 (2–6) |
| mage | 225–**451** | 4000 | 12 | 20 | 16 (2–3) |
| hero | 549–803 | 6000 | 25 | 13 | 6: Megalodonte, Djinni, Arcimago, Beholder, Drago d'ombra giovane, Vampiro (2 posti) |
| legend | — | 15000 | — | — | nessuno (solo leggendari) |

Dati: 150 nemici, 22 leggendari (id contigui `6ae80b5b2e7351b494ecc869`…`…87e`, `e857802^:content/enemies/leggendari.yaml`), calcolati dallo stato del contenuto al 2026-11-02 (il DB può essere stato curato dopo). Liste complete per i fixture: mage boss = Piovra gigante, Drago d'argento giovane, Drago blu giovane, Golem d'argilla, Slaad grigio, Treant, Aboleth, Drago rosso giovane, Golem di pietra, Slaad della morte, Megalodonte, Djinni (2 posti); Arcimago, Beholder, Drago d'ombra giovane, Vampiro (3). Paladin boss = 20 nemici a xp 254–408 (2 posti), 7 a 549 (3), 9 a 676–831 (4), Megalodonte e Djinni (5), Arcimago (6). Adventurer boss = 23 nemici a xp 63 e 16 a 99–113 (2), 10 a 155–169 (3), 14 a 254 (5, es. Troll), 4 a 324 (6).

**Formula dei posti (C3):** `seats = ceil(((xp - 0.5) / XP_SCALE) / media)`, candidato se `2 ≤ seats ≤ 6`. La lettura ingenua `ceil(xp / XP_SCALE / media)` sbaglia sui confini: Licantropo pipistrello (PE 800, xp 113) dà 3 posti adventurer invece di 2 (113 / 0.14084507 = 802,3). Con lo 0,5 si ricava il PE minimo compatibile con l'arrotondamento: tutte le altre righe coincidono col PE del documento.

**Boss sempre componibile:** ogni rango adventurer..hero ha almeno un candidato con habitat `city` (Ghoul/Mimic/… adventurer, Gladiatore/Mago rinnegato/Assassino paladin, Vampiro mage e hero), quindi zona + `city` non è mai vuota per i boss; il ripiego su `enemy` resta come difesa.

**Fuori fascia (C6):** 41 nemici non leggendari non sono mai singoli: Iena, Avvoltoio (1), Bandito, Cultista, Sciamano goblin, Combattente tribale (4), Formiche giganti assassine (18), Goblin (19), **23 nemici a xp 63** (PE 450: Ghoul, Ogre, Capo dei Banditi, Mimic, Grifone…), 6 sopra 803 (Aboleth, Drago rosso giovane, Golem di pietra, Slaad della morte 831, Megalodonte 901, Djinni 1014) e Arcimago/Beholder/Drago d'ombra giovane/Vampiro. Entrano comunque nei branchi (b) e come boss.

### Composizione (BE-QGEN-05)

- Rango servito: conteggio per `minTitle` delle generate aperte su `GENERATED_RANKS = [rookie, adventurer, paladin, mage, hero]`, minimo, parità → indice più basso; ricalcolato dopo ogni quest creata nella corsa.
- Tipo: `boss` con `chance.next() < 0.1` solo se il rango ha media e la zona ha candidati; altrimenti `enemy`.
- Pool di un POI: `legendary: false` e (`locations` ∩ `poi.type` ≠ ∅ oppure `city` ∈ `locations`); se per la forma scelta è vuoto → stesso filtro con `all`.
- Forma (a) (`chance.next() < 0.5`): un nemico con `xp` nella fascia. Forma (b): 1–3 tipi con `xp < min(fascia)`, quantità iniziali 1, poi unità casuali finché la somma ≥ minimo; valida se somma ≤ massimo, totale unità ≥ 2 e ≤ `MAX_PACK_UNITS` (proposta 8); fino a `PACK_ATTEMPTS` (proposta 20) tentativi, poi ripiego su (a). Esempi reali: rookie 2–3 × Bandito; adventurer Picchiatore + 2 Cultista (22); paladin Capo goblin + 3 Goblin (85); hero Gladiatore + Mago rinnegato (578); un terzo pezzo (832) supera 803 e il tentativo si scarta.
- Sempre singolo per i boss: `enemies = [{ enemy, quantity: 1 }]`, `requiredAdventurers = [{ title: R, count: seats }]`.
- Ordine delle estrazioni fisso e candidati ordinati per `_id` (riproducibilità con `SequenceChance`).

### Città vicine, POI libero, tetto (BE-QGEN-04)

**Definizione scelta: k vicini sui marker** (non il prefisso del `CityType`). Evidenza: i gruppi per prefisso sono molto diseguali e lasciano fuori città (Phase 11 handoff §11: `forestVillage`/`northVillage` fuori dai regni, gruppi di una città come `elfCapital`, `talmvereVillage`, `ferrionCity`, `necrorianCity`), e dentro un regno grande non distribuiscono. I marker hanno `location: [number, number]` (`point-of-interest.model.ts:18-20`): la distanza euclidea al quadrato basta per ordinare i vicini, nessuna unità da scegliere. Regola: `D(c) = count(c) + Σ count(n)` sui `NEIGHBOUR_COUNT = 5` marker più vicini; peso `w(c) = 1 / (1 + D(c))²` se `count(c) < 3` e la città ha un POI libero, altrimenti 0; estrazione pesata con `chance.next()` su città ordinate per id; ricalcolo dopo ogni creazione.

POI libero = `city.pointsOfInterest` meno `city.markerLocation` meno i `markerLocation` di **tutte** le quest con `concludedAt: null` (fisse, GM e aid comprese), scelto uniforme fra i liberi. Dati del discuss: 642 POI, 167 marker, 117 occupati → 358 liberi per un target di 167.

Corsa (`QuestGenerator.runOnce`): legge città (`_id, name, type, markerLocation, pointsOfInterest, relatedLore`), POI di quelle città (`_id, type, location`), marker occupati e generate aperte (`markerLocation`, `minTitle`) con due query su `quests`, nemici `legendary: false`, catalogo dei premi, pet `sellable: false`; calcola tutto in memoria con funzioni pure; inserisce **una quest alla volta** (nessuna transazione). Target = env o numero di città letto nella corsa; si ferma a target raggiunto o a nessuna città con peso > 0.

**Garanzia sul POI (sonda 1, harness):** indice `{ 'infos.markerLocation': 1 }` con `unique: true`, `partialFilterExpression: { generated: true, concludedAt: null }`, nome `quest_generated_open_marker`. Esito: secondo insert sullo stesso POI → `E11000`; generata conclusa, non generata e documento legacy senza `concludedAt` gestiti correttamente; **tre insert concorrenti → uno solo riuscito**. Il generatore cattura `isDuplicateKeyError` (`src/mongo/mongo-errors.ts`), marca il POI occupato e prosegue. L'indice lo costruisce già `SweepIndexVerifier` al boot (`questModel.createIndexes()`, `sweep-index.verifier.ts:51`); va aggiunto a `sweep-indexes.schema.spec.ts`. Copre generata contro generata; generata contro fissa è esclusa dalla lettura (le fisse non nascono a runtime, la aid non è `generated`). La query `{ generated: true, concludedAt: null }` fa COLLSCAN (sonda: l'indice parziale non serve senza predicato sulla chiave): con ~800 quest è irrilevante, nessun indice di conteggio in più. Il tetto per città resta garantito dal single-flight in un processo (un solo BE); con più istanze potrebbe superarsi di poco, scritto nel handoff.

Flag interno: `@Prop({ type: Boolean, default: false }) generated` sul `Quest`, senza `@Field` (pattern `spellDraw`, test in `quest-outcome-fields.schema.spec.ts`).

### Trigger, single-flight, config (BE-QGEN-02)

- `QuestGenerator.generate(): Promise<number>` = `this.inFlight ??= this.runOnce().finally(...)` (pattern `quest-resolution.sweeper.ts:134-139`); `request()` (fire-and-forget) imposta un flag di rerun se una corsa è in volo, così una conclusione durante la corsa non va persa (semantica di `KeyedSingleFlight`). La mutation attende `generate()`: se trova una corsa in volo ne riceve il conteggio.
- Trigger (a): `CommittedOutcome.regenerate?: boolean` valorizzato da `QuestResolutionService` e `BossResolutionService` quando `questUpdateOf` conclude una quest con `generated: true`; `OutcomeWriter.deliver` chiama `trigger.request()` best-effort. Le uniche conclusioni delle generate sono le vittorie (`quest-outcome-plan.ts:30`): nessun percorso di «annullamento» le conclude.
- Trigger (b): `QuestGenerationSweeper` (onApplicationBootstrap: timer `unref` + corsa al boot non attesa, onModuleDestroy attende la corsa in volo).
- Config `src/config/quest-generation-config.ts`: `QUEST_GENERATION_ENV_KEYS = ['QUEST_GENERATION_SWEEP_INTERVAL_MS', 'QUEST_GENERATION_TARGET']`; intervallo via `parseSweepIntervalMs(name, raw, 3_600_000)`; target vuoto → `null` (= numero di città), cifre `0..10_000` → numero, altro → errore senza valore; aggiungere a `env.validation.ts:23-36`, due righe commentate in `.env.example` (sezione Phase 13, «non è un segreto»), test in `env.validation.spec.ts`; la drift spec passa da sola se template e chiavi coincidono.
- Mutation: `QuestGenerationResolver.generateQuests` con `@Roles(RoleType.innkeeper)`, `@AuditTarget('QuestGeneration', () => null)`, `@Mutation(() => GenerateQuestsResult)`. L'audit è automatico per ogni mutation innkeeper (`admin-audit.interceptor.ts:79,107-113`); senza `@AuditTarget` il target sarebbe `GenerateQuestsResult` con id null.

### Premi (BE-QGEN-06/10)

- `GENERATED_PRIZES = { enemy: { copper: 150, xp: 40 }, boss: { copper: 600, xp: 120 } }` × `TIER_MULTIPLIER`; `prizeCoins = fromCopper(round(...))`. Massimo: 15 000 rame, 3000 XP (sotto Int 32 bit).
- Pool `randomLoot` (D-20) come tabella `LOOT_POOLS[tipo][rango] = [{ rarity, count }]`; candidati = `EquipmentItem` + `LootItem` con quella `rarity`, ordinati per `_id`, esclusi da `rare` in su i `LootItem` con `effect: hunger`; estrazione senza ripetizioni; quantità 1; per le enemy adventurer/rookie il numero 1–2 si tira. Il tiro alla vittoria resta `rollLoot` per partecipante (`quest-rewards.ts:125-141`).
- `recommendedLoot` (C4): ricetta Phase 11 delle hunt estesa a più nemici — fino a 2 armi (`equipType: weapon`) che colpiscono le debolezze dell'unione dei nemici, entro la rarità della fascia (`dungeonLootRarity`: rookie common … hero legendary), più la miglior cura (`effect: heal`) entro la stessa rarità. I «consumabili contro i damages» non hanno dati strutturati (`EffectType` = none/heal/hunger/munition/exploration): restano fuori, come concluso nella Phase 11.
- Pet: il generatore mette `prizes.pet` solo sui boss con `chance.next() < 0.01`, uniforme fra i pet `sellable: false` ordinati per id (`sellable` assente o null NON entra). Alla vittoria, in `drawRewards` **dopo** `spellDraw` e solo se `prizes.pet` è valido e presente a catalogo (stessa regola del tiro D-31, `quest-rewards.ts:158-167`: le quest senza pet consumano gli stessi tiri di oggi), `chance.next() < 0.2`. In `planParticipant` il pet entra in `assets.ownedPets` nello stesso `$set` solo se vinto e non già posseduto (`sameId`); altrimenti `ownedPets` non compare nell'update (Pitfall 5 della Phase 12, `trade-pets.ts:32`). `QuestRewards.pet` = il pet ottenuto o null. Vale anche per `gmCompleted`. `Pet` va registrato in `QuestOutcomesModule` (`quest-outcomes.module.ts:54-65`) e in `outcomeModels` (`test/quests/outcome-world.ts:75-92`).

### Template (BE-QGEN-07)

`quest-templates.ts` puro: titolo `enemy` «Minaccia: 3 Goblin e 1 Capo goblin presso <città>» (lista italiana «A, B e C», quantità sempre esplicita, nomi invariati), `boss` «Boss: Troll presso <città>»; annunci 3 varianti per tipo nella voce di contadino/mercante/capitano/sacerdote con città e nemici, variante scelta con `chance`; `relatedLore` = `city.relatedLore` + `relatedLore` dei nemici, senza doppioni; `timeToComplete` in **millisecondi** (`quest-prizes.ts` Phase 11: «Pitfall 4»): enemy 3 600 000, boss 10 800 000; `requiredPoints: null`; `registeredAdventurers: []`.

### Gioielli (BE-QGEN-11)

`AccessoryUseType` in `src/models/enums/accessory-use-type.enum.ts`. Campo: `@Field(() => [AccessoryUseType], { nullable: true }) @Prop({ type: [String], enum: Object.values(AccessoryUseType), default: undefined })` — `default: undefined` come `City.shopEquipment` (`city.model.ts:50-54`), altrimenti Mongoose scrive `[]` su ogni equipaggiamento e il filo mostra `[]` invece di null. Contesto: `CombatEquipment.accessoryUseTypes` dalla projection estesa del loader; il segnaposto lo ignora.

### Una tantum (D-04, D-13, D-26) e orchestratore

`QuestMaintenanceBoot` (unico `OnApplicationBootstrap` del modulo, passi in ordine, ognuno in try/catch come `ShopBoot` di `a3fd8ac^`): 1) `QuestEnemiesMigrator` (permanente); 2) `EnemyLegendaryMigrator`: `legendary: true` sui 22 id e `false` sugli altri, solo dove il campo manca (pattern `PetSellableMigrator` di `a3fd8ac^`); 3) `JewelAccessoryMigrator`: costante `_id → tipi` copiata dalla tabella approvata, filtro `_id` + `equipType` ring/necklace + campo assente, WARN sugli id mancanti; 4) `DungeonStagesMigrator`: dungeon con `concludedAt: null` e `'infos.enemies.1'` assente (al più un nemico), 1–3 tappe da `keyedChance(seed, questId)` con la composizione del generatore nella fascia del `minTitle` e nel pool del POI; se Bandito (`6ae80bf6947d6a423521c70d`) è nel pool la prima tappa aggiunta è una banda che entra in fascia (rookie 2–3, adventurer 6–8 Banditi; paladin Capo dei Banditi + 2–25 Banditi solo entro `MAX_PACK_UNITS`); update condizionale con lo stesso filtro; 5) `generator.request()`. Fattibilità sui dati: 40 dungeon (adventurer 20, paladin 11, mage 4, hero 3, rookie 2), ognuna con almeno un singolo in fascia nel suo pool; 14 in zone con Bandito. Dopo il primo boot reale: rimuovere 2–4 e il passo 5 con le loro int-spec (resta il migratore permanente), log nel handoff (modello `b4ccfe3`/§14 Phase 12).

### Anti-Patterns to Avoid
- Ricalcolare l'XP del boss dai PE del documento: il DB ha solo `xp`.
- `legendary: { $ne: true }` nel generatore: un nemico nuovo non classificato entrerebbe nelle generate (C5).
- Una transazione per l'intera corsa: inutile (insert singoli con indice unico) e allunga i conflitti.
- Pubblicare `questUpdated` sugli insert: la subscription è per id (`questUpdated(questId)`), nessuno è iscritto a una quest appena nata.

## Don't Hand-Roll

| Problema | Non costruire | Usa | Perché |
|---|---|---|---|
| Doppia quest sullo stesso POI | lock applicativi | indice unico parziale + cattura E11000 | provato sull'harness, vale anche fra processi |
| PRNG con seme | nuovo algoritmo | mulberry32 di `7b2f482`/`e857802^` | già testato in Phase 11/12 |
| Tiro del loot | nuova cascata | `rollLoot` | regola D-16 condivisa |
| Intervallo di sweep | parser nuovo | `parseSweepIntervalMs` + fallback | messaggi e limiti uguali |
| Audit della mutation | log a mano | `AdminAuditInterceptor` + `@AuditTarget` | automatico |

## Runtime State Inventory

| Categoria | Trovato | Azione |
|---|---|---|
| Dati a DB | `quests.infos.enemy` su ~581 quest (117 con nemico), `questresults.enemy` su 24; `enemies` senza `legendary`; 42 gioielli senza `accessoryUseTypes`; 40 dungeon a un nemico | migratore permanente + tre una tantum al primo boot dal branch |
| Config di servizi | nessuna | — |
| Stato registrato nell'OS | nessuno | — |
| Segreti/env | due chiavi nuove, non segrete | `.env.example` + validazione |
| Artefatti | `dist/` del BE in esecuzione | build e riavvio dall'orchestratore (runbook), mai dagli executor |
| Job Bull | payload con soli id (`quest-resolution-job.ts:11-24`) | nessuna |

## Common Pitfalls

1. **Orfano dentro `[QuestEnemy!]!`:** `enemy: Enemy!` popolato a null annulla la voce, la lista, `infos`, la quest e l'intera `quests` (sonda 3: populate di un id inesistente → `enemy: null`). Filtrare in `dropOrphanCatalogRefs`/`dropOrphanResultRefs`, test con un nemico cancellato.
2. **`legendary` e i default:** su documenti idratati e popolati Mongoose applica `default: false` (sonda 3), su `lean` no; il filtro del generatore va sul dato scritto (migratore che scrive anche `false`).
3. **Pet senza prezzo:** `Pet.buyPrice: Coins!`; la FE seleziona solo `id name` del pet premio (nullable: l'errore resta sul campo). Nel handoff.
4. **Harness:** se `QuestOutcomesModule` importa il modulo del trigger, ogni harness di esiti eredita sweeper e boot del generatore → aggiungere `{ token: QuestGenerationSweeper, useValue: idle }` e la config quieta a `QUIET_OUTCOME_OVERRIDES` (`test/quests/outcome-world.ts:56-59`), oppure tenere il trigger in un modulo leggero senza sweeper (consigliato: `QuestGenerationTriggerModule` con generatore + trigger; sweeper e resolver in `QuestGenerationModule`, solo in `AppModule`).
5. **Slot per titolo esatto** (C1).
6. **`timeToComplete` in ms**, non in ore.
7. **Consumo dei tiri:** ogni nuovo `chance.next()` nei percorsi esistenti (pet, tappe) sposta le sequenze delle spec; i tiri nuovi vanno dopo quelli esistenti e solo quando servono.
8. **Ordine del boot:** sweeper e processor possono risolvere prima della migrazione → lettore tollerante; il generatore al boot prima della semina `legendary` crea 0 (filtro sul dato), poi il passo 5 dell'orchestratore lo rilancia.
9. **`dist/`:** mai build negli executor; il real boot di `test/app.int-spec.ts` rigenera solo `src/schema.gql`.

## Code Examples

```ts
// indice (quest.model.ts), provato sull'harness
QuestSchema.index(
    { 'infos.markerLocation': 1 },
    { unique: true, name: QUEST_GENERATED_OPEN_MARKER_INDEX,
      partialFilterExpression: { generated: true, concludedAt: null } },
);
// posti del boss
export const bossSeatsOf = (xp: number, media: number): number =>
    Math.ceil((xp - 0.5) / XP_SCALE / media);
```

## State of the Art

| Prima | Dopo | Impatto |
|---|---|---|
| `infos.enemy` singolo | `infos.enemies [{ enemy, quantity }]` | SDL −2 righe, FE Phase 14 gated |
| dungeon = un combattimento | tappe via `DungeonResolver` | `stagesCleared/stagesTotal` |
| tabellone statico | generatore + sweep orario | nuove env |

## Assumptions Log

| # | Claim | Sezione | Rischio |
|---|---|---|---|
| A1 | Il DB reale ha ancora i valori `xp`/`locations` del contenuto `e857802^` | Fasce | liste dei candidati diverse: i test usano fixture propri, nessun effetto sul codice |
| A2 | Un solo processo BE (single-flight sufficiente per il tetto) | Città | tetto superabile con più istanze |
| A3 | I pool legendary/ultrarare includono gli oggetti unici delle figure storiche | Premi | l'utente potrebbe volerli esclusi (vedi Q3) |
| A4 | `MAX_PACK_UNITS` 8, `PACK_ATTEMPTS` 20, `NEIGHBOUR_COUNT` 5, peso `1/(1+D)²` | Composizione/Città | solo bilanciamento, costanti ritoccabili |

## Open Questions (RESOLVED)

1. **C1 — slot esatti contro D-07 («i legend giocano le quest hero»).** `hasSeatFor` conta per titolo esatto: con `{ title: hero }` un legend riceve `QUEST_FULL`, e il personaggio legend L20 dell'utente non giocherebbe mai una generata. **Raccomandazione:** le generate di rango hero usano `{ title: null, count }` (jolly, filtrato a hero+ da `minTitle` via `meetsTitle`), gli altri ranghi restano `{ title: R }`; emendare D-09. Da confermare con l'utente prima del piano della composizione.
2. **C2 — fascia mage 225–450 contro 451.** `round(3200 × 0.14084507) = 451`; nessun nemico vale 451 oggi. **Raccomandazione:** 451 (stessa formula di tutte le altre soglie); emendare D-07.
3. **C3 — formula dei posti:** usare `xp − 0.5` (Licantropo pipistrello). Emendare D-05 come dettaglio di implementazione.
4. **C4 — `recommendedLoot` non deciso nel CONTEXT** (richiesto da BE-QGEN-06): ricetta Phase 11 (≤ 2 armi contro le debolezze + miglior cura entro la rarità di fascia). Delegato al planner con questa ricetta; da aggiungere al CONTEXT come default tecnico.
5. **C5 — filtro dei leggendari fail-closed:** il migratore scrive `true` sui 22 e `false` sugli altri; il generatore usa `legendary: false`; un nemico aggiunto a DB entra nelle generate solo con il flag. Emendare D-04; scritto nel handoff.
6. **C6 — 41 nemici mai singoli** (fasce con buchi): informativo, D-07 resta; nel handoff come guida alla cura.
7. **Aid di una generata:** clona `enemies` e `prizes.pet`, non porta `generated`; aid di dungeon risolta aggregata. Delegato al planner (coerente con D-08/D-12).
8. **Oggetti unici nei pool (A3):** default = inclusi; domanda all'utente facoltativa, non bloccante.
9. **Publisher sugli insert (D-18):** non esteso; `questUpdated` è per id, servirebbe una subscription nuova (SDL). Nel handoff.
10. **Coda Bull o chiamata diretta:** chiamata diretta.
11. **Plurali nei titoli** («3 Lupo»): nomi invariati come nell'esempio del CONTEXT; ritoccabili nei template.

## Environment Availability

| Dipendenza | Richiesta da | Disponibile | Versione | Fallback |
|---|---|---|---|---|
| mongodb-memory-server (replica set) | int-spec | ✓ | ^11.2.0 | — |
| js-yaml in node_modules | sola ricerca | ✓ | — | — |
| Redis | nessun piano (niente coda nuova) | — | — | — |

## Validation Architecture

### Test Framework
| Proprietà | Valore |
|---|---|
| Framework | Jest 30 (progetti `unit` e `integration`), ts-jest, MongoMemoryReplSet condiviso |
| Config | `package.json` → `jest.projects`, `coverageThreshold` |
| Quick run | `npx jest <spec> --selectProjects unit` (misurato: 4 suite combat/outcome/mixed-refs, 110 test, 2,4 s) |
| Integration mirata | `npx jest <spec> --selectProjects integration --runInBand` (misurato: `quest-combat.int-spec.ts` 5,5 s; `test/app.int-spec.ts` 70 test 5,9 s) |
| Full suite | `npm run test:cov` (Phase 12: 307 suite, 4006 test) |

### Phase Requirements → Test Map
| Req | Comportamento | Tipo | Comando | Esiste? |
|---|---|---|---|---|
| QGEN-01 | SDL `enemies`, populate, orfani filtrati | integration | `npx jest test/app.int-spec.ts src/quests/quests.resolver.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ da aggiornare |
| QGEN-01 | contesto multi-nemico, aggregazione, XP Σ | unit | `npx jest src/quests/outcomes/combat src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/aid/aid-quest.spec.ts --selectProjects unit` | ✅ da aggiornare |
| QGEN-01 | migrazione idempotente quest + risultati, lettore tollerante | integration + unit | `npx jest src/quests/maintenance/quest-enemies.migrator.int-spec.ts --selectProjects integration --runInBand`; `src/quests/outcomes/quest-enemies.spec.ts` | ❌ W0 |
| QGEN-01 | inventario ref | unit | `npx jest src/migrations/mixed-refs/mixed-ref-paths.spec.ts --selectProjects unit` | ✅ |
| QGEN-02 | config, single-flight, rerun, sweep/boot | unit | `npx jest src/config/quest-generation-config.spec.ts src/quests/generation/quest-generation.sweeper.spec.ts --selectProjects unit` | ❌ W0 |
| QGEN-02 | trigger dopo la vittoria di una generata | integration | `npx jest src/quests/generation/quest-generation-trigger.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 |
| QGEN-03/05 | fasce, posti, candidati, forme a/b, leggendari esclusi, rango meno coperto | unit | `npx jest src/quests/generation/generation-rules.spec.ts src/quests/generation/quest-composition.spec.ts --selectProjects unit` | ❌ W0 |
| QGEN-04 | kNN, pesi, tetto 3, marker escluso, distribuzione (seme fisso: ≥ 1 città a 0 e ≥ 1 a 3 su griglia di 30, nessun vicinato oltre 2× la media) | unit | `npx jest src/quests/generation/city-picker.spec.ts --selectProjects unit` | ❌ W0 |
| QGEN-03/04/08 | corsa: target, tetto, POI liberi, hunt/dungeon mai generate, idempotenza (seconda corsa 0), concorrenza (due generatori, un POI → 1 quest) | integration | `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 |
| QGEN-06/10 | premi, pool, pet 1% / 20%, ownedPets idempotente, `rewards.pet` | unit + integration | `npx jest src/quests/generation/generated-prizes.spec.ts src/quests/outcomes/rewards/quest-rewards.spec.ts --selectProjects unit`; `src/quests/outcomes/quest-pet-prize.int-spec.ts` | parziale |
| QGEN-07 | titoli, annunci, lore, tempi | unit | `npx jest src/quests/generation/quest-templates.spec.ts --selectProjects unit` | ❌ W0 |
| QGEN-08 | `generateQuests`: innkeeper `{ created }`, adventurer `FORBIDDEN`, record di audit | integration | `npx jest src/quests/generation/quest-generation.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 |
| QGEN-09 | tappe in sequenza, HP residui, prima sconfitta, `stagesCleared/Total`, aid | unit + integration | `npx jest src/quests/outcomes/dungeon --selectProjects unit`; `src/quests/outcomes/quest-dungeon.int-spec.ts` | ❌ W0 |
| QGEN-09/03/11 | una tantum (legendary, dungeon, gioielli) solo dove manca | integration | `npx jest src/quests/maintenance --selectProjects integration --runInBand` | ❌ W0 (rimosse con i migratori) |
| QGEN-11 | campo, `null` sui non gioielli, contesto | unit + integration | `npx jest src/quests/outcomes/combat/combat-context.spec.ts --selectProjects unit`; `test/app.int-spec.ts` | ✅ da aggiornare |
| QGEN-08 | handoff | manuale | lettura di `BACKEND-NOTES.md` | — |

### Sampling Rate
- Per task: la spec mirata + `npx tsc --noEmit -p tsconfig.json`.
- Per wave che tocca lo SDL: `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e `git diff --exit-code src/schema.gql` dopo il commit.
- Gate di fase: `npm run test:cov` verde con la soglia nuova `./src/quests/generation/` (proposta statements 97, branches 85, lines 98, da fissare sul valore misurato come `ec9eb61`), `tsc` 0, prettier/eslint sui file del diff, `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` stampa esattamente due righe `  enemy: Enemy`, trailer assenti.

### Wave 0 Gaps
- [ ] `test/quests/generation-world.ts` — fixture mondo di prova (città con marker e POI con `location`, nemici per fascia con `legendary`, catalogo per rarità, pet `sellable`) e override quieti dello sweeper del generatore.
- [ ] `src/quests/generation/seeded-chance.ts` (+ spec) ripristinato da `e857802^`.
- [ ] Aggiornare `buildQuest` (`test/fixtures/quest.fixture.ts:17`: `enemy: null` → `enemies: []`) e `test/quests/quest-result.fixture.ts:30`.
- [ ] Sweep delle spec che scrivono `enemy`: 20 file con riferimenti al campo — `src/lore/lore-related.int-spec.ts`, `src/models/quest-result/quest-result.schema.spec.ts`, `src/quests/acceptance/accept-quest.resolver.int-spec.ts`, `src/quests/outcomes/{aid-rescue.int-spec,aid/aid-quest.spec,boss-resolution.int-spec,combat/combat-context.spec,combat/placeholder-combat-resolver.spec,gm-completion.service.int-spec,outcome-plan.spec,quest-combat.int-spec,quest-resolution.service.int-spec,quest-resolution.sweeper.int-spec,rescue-plan.spec}.ts`, `src/quests/quest-catalog.populate.spec.ts`, `src/quests/quests.resolver.int-spec.ts`, `src/quests/results/quest-result.resolver.int-spec.ts`, `test/app.int-spec.ts`, più i due fixture (≈ 55 occorrenze).

## Security Domain

| Categoria ASVS | Si applica | Controllo |
|---|---|---|
| V4 Access Control | sì | `@Roles(innkeeper)` sulla mutation, lista `EXPECTED_INNKEEPER_HANDLERS` nel real boot, test `FORBIDDEN` per l'adventurer |
| V5 Input Validation | minimo | nessun argomento; env parse fail-closed senza eco del valore |
| V7 Logging | sì | audit automatico della mutation; log del generatore con soli id/conteggi |
| V11 Business Logic | sì | tetto e POI unico garantiti dal DB; generazione idempotente; costo di una corsa limitato dal target |

| Minaccia | STRIDE | Mitigazione |
|---|---|---|
| Spam di `generateQuests` | DoS | single-flight + target: a mondo pieno la corsa crea 0 |
| Doppia quest sul POI | Tampering | indice unico parziale |
| Leggendario generato | Elevation (gioco) | filtro `legendary: false` sul dato |
| Pet duplicato | Tampering | `sameId` nello snapshot in sessione, transazione |

## Sources

### Primary (HIGH)
- Codice del repo (file e righe citati), `test/app.int-spec.ts`, `package.json`.
- Sonde sull'harness (spec usa e getta cancellata): indice unico parziale e concorrenza; pipeline di migrazione idempotente; default Mongoose su idratato/lean/populate e orfano popolato a null.
- Git: `e857802^:content/enemies/*.yaml`, `content/quests/dungeon.yaml`, `src/content/generation/*`; `7b2f482`, `a3fd8ac^` (migratori una tantum della Phase 12).
- `.planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md` §4, §6, §9–§11; `world-building.md` riga 1090; `12-negozi-per-citta/BACKEND-NOTES.md` §11, §14; FE `14-quest-generation/14-CONTEXT.md`.

## Metadata

**Confidence breakdown:** stack HIGH (nessuna libreria nuova, riuso verificato); architettura HIGH (punti di modifica letti riga per riga); pitfall HIGH (sonde); liste dei candidati MEDIUM (contenuto al 2026-11-02, DB curabile).

**Research date:** 2026-11-04 — **Valid until:** 2026-12-04
