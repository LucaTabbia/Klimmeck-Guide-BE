# BACKEND-NOTES — Phase 13 Generazione quest (handoff per la FE Phase 14 e runbook del primo boot)

- **Fase BE:** 13-generazione-quest (requisiti BE-QGEN-01..BE-QGEN-11; decisioni D-01..D-31 con gli emendamenti C1–C6 in `13-CONTEXT.md`).
- **Data:** 2026-11-04. Documento di fine fase (piano 13-20), scritto dopo il gate 13-19.
- **Branch:** `feat/13-generazione-quest` → PR verso `develop` (la apre l'orchestratore dopo review → fix → verifica → security).
- **Schema:** rispetto a `origin/develop` lo SDL toglie **esattamente due righe** (`  enemy: Enemy` in `type QuestInfos` e in `type QuestResult`, D-01: modifica non additiva dichiarata) e aggiunge tutto il resto in modo additivo. Lo schema generato `src/schema.gql` vince su questo documento.
- **Consumatore:** FE Phase 14 (`../Klimmeck-Guide/.planning/phases/14-quest-generation/14-CONTEXT.md`, FE D-01..D-16); i piani gated 14-10/14-11 (schema gate su `origin/develop:src/schema.gql`, E2E su device) partono dopo la merge di questa PR su `develop` (FE D-13).
- **Primo boot reale:** eseguito il 2026-11-05 dall'orchestratore su richiesta dell'utente (log e conteggi in §11 b–c): 581 missioni e 24 risultati migrati alla lista, 22 leggendari e 128 ordinari marcati, 42 gioielli senza WARN, 40/40 dungeon a tappe, 167 missioni generate (target 167). I migratori una tantum sono usciti dal repo con `f5d8134` (§11 d, Phase 12 D-25): resta solo il `QuestEnemiesMigrator` permanente.
- **Emendamenti della Phase 13.1 (2026-11-05):** §7 (fasce contigue, budget per posti, boss con clamp, tetto e peso per taglia, premi senza legend, legend sui posti hero), §8 e §9 (animali, zona `dungeon`) annotati con «(13.1 D-0x)»; runbook del primo boot reale dal branch 13.1 in §11 (f).
- **Regola dei letterali:** operatori Mongo e letterali GraphQL solo in code span o blocchi di codice; nessun URI, host, nome di database né id reale: solo placeholder (`<uri>`, `<db>`, `<id>`).

---

## 0. TL;DR per il FE

1. **Multi-nemico a sostituzione secca:** `QuestInfos.enemy` e `QuestResult.enemy` non esistono più; al loro posto `enemies: [QuestEnemy!]!` con `QuestEnemy { enemy: Enemy!  quantity: Int! }` (§1–§3). Il FE toglie ogni selezione di `enemy` da quest e risultato.
2. **Dungeon a tappe:** `QuestResult.stagesCleared` / `stagesTotal` (nullable, valorizzati solo per le `dungeon`); l'ordine di `enemies` è l'ordine delle tappe (§4).
3. **Pet come premio:** `QuestPrizes.pet` (il pet in palio, raro: solo boss generati all'1%) e `QuestRewards.pet` (il pet ottenuto, o null) (§2, §7).
4. **Gioielli:** `EquipmentItem.accessoryUseTypes: [AccessoryUseType!]` con `enum AccessoryUseType { attack  defense }`, valorizzato solo su anelli e collane, null sugli altri pezzi (FE D-12).
5. **Nemici:** `Enemy.legendary: Boolean!` (i 22 leggendari non entrano mai nelle quest generate).
6. **Mutation della Locanda:** `generateQuests: GenerateQuestsResult!` → `{ created }`, solo oste; agli altri `FORBIDDEN` (il FE chiude il pannello, FE D-09) (§5).
7. **Ordine dei rilasci:** la PR BE va mergiata su `develop` PRIMA dei piani gated della FE Phase 14; un BE senza questa fase rifiuta la selezione di `enemies` (errore di validazione), un BE con questa fase rifiuta la selezione di `enemy` (FE D-13). Le quest generate compaiono alla prossima apertura della board, senza evento di subscription (§6, D-18).

---

## 1. SDL tolto

Da `git diff origin/develop -- src/schema.gql` (le uniche righe con `-`):

```diff
 type QuestInfos {
   description: String
-  enemy: Enemy
+  enemies: [QuestEnemy!]!
   markerLocation: PointOfInterest!
```

```diff
   consumablesUsed: [AssetQuantity!]!
-  enemy: Enemy
+  enemies: [QuestEnemy!]!
   hpAfter: Int!
```

- Il FE toglie la selezione `enemy { … }` da `QuestFragment` (`infos`) e da `QuestResultFragment`; ogni documento che la seleziona ancora fallisce la validazione contro lo schema mergiato.
- Lato dati, al primo boot reale il migratore permanente `QuestEnemiesMigrator` riscrive quest e risultati salvati con il campo singolo (`enemy` → `enemies` con `quantity: 1`, `null` → `[]`, §11).

---

## 2. SDL nuovo (copiato da `src/schema.gql`)

```graphql
type QuestEnemy {
  enemy: Enemy!
  quantity: Int!
}

type QuestInfos {
  description: String
  enemies: [QuestEnemy!]!
  markerLocation: PointOfInterest!
  relatedLore: [Lore!]!
  timeToComplete: Int
  title: String!
  type: String!
}

type QuestResult {
  acknowledgedAt: DateTime
  character: ID!
  consumablesUsed: [AssetQuantity!]!
  enemies: [QuestEnemy!]!
  hpAfter: Int!
  hpBefore: Int!
  id: ID!
  injuriesAdded: [InjuryType!]!
  levelAfter: Int!
  levelBefore: Int!
  maxLifePoints: Int!
  outcome: QuestOutcome!
  quest: QuestResultQuest!
  rescuedCharacters: [ID!]!
  resolvedAt: DateTime!
  rewards: QuestRewards!
  spellLearned: Spell
  spellsUsed: [SpellUsage!]!
  stagesCleared: Int
  stagesTotal: Int
  titleAfter: String!
  titleBefore: String!
  user: ID!
  xpAfter: Int!
  xpBefore: Int!
  xpGained: Int!
}

type QuestPrizes {
  pet: Pet
  prizeCoins: Coins
  prizeItem: AssetQuantity
  randomLoot: [AssetQuantity!]!
  spell: Spell
  xpPrize: Int
}

type QuestRewards {
  coins: Coins!
  items: [AssetQuantity!]!
  pet: Pet
}

type Enemy {
  baseWeaknesses: [String!]!
  damages: Damages!
  energyWeaknesses: [String!]!
  id: ID!
  imagePath: String!
  legendary: Boolean!
  lifePoints: Int!
  locations: [PoiType!]!
  name: String!
  relatedLore: [Lore!]!
  spells: [Spell!]!
  xp: Int!
}

enum AccessoryUseType {
  attack
  defense
}

type EquipmentItem {
  accessoryUseTypes: [AccessoryUseType!]
  addedSpell: Spell
  buyPrice: Coins
  damages: Damages!
  description: String!
  equipType: String!
  id: ID!
  itemType: String!
  name: String
  rarity: String
  sellPrice: Coins
  sellable: Boolean
}

type GenerateQuestsResult {
  created: Int!
}

type Mutation {
  generateQuests: GenerateQuestsResult!
}
```

| Campo | Note |
| --- | --- |
| `QuestInfos.enemies` | non-null, può essere `[]` (quest di servizio: heal, job, guard, crime, study) |
| `QuestInfos.description` | esisteva già; sulle generate è l'annuncio del committente (§7) |
| `QuestResult.stagesCleared` / `stagesTotal` | nullable: `null` fuori dalle `dungeon`; in una dungeon `stagesCleared` di `stagesTotal` (vittoria = tutte) |
| `QuestPrizes.pet` | il pet in palio; oggi solo sui boss generati (1%) e sulle aid clonate da una quest con pet |
| `QuestRewards.pet` | il pet ottenuto da questo personaggio, o `null` |
| `Enemy.legendary` | non-null; il FE non deve filtrare nulla, il server non genera mai leggendari |
| `EquipmentItem.accessoryUseTypes` | nullable: `null` sui non gioielli; `[attack]`, `[defense]` o `[attack, defense]` su anelli e collane |
| `generateQuests` | nessun argomento, solo oste (§5) |

Gli input (`QuestInput`, `QuestInfosInput`, `QuestPrizesInput`, `EnemyInput`) **non** ricevono i campi nuovi: la creazione manuale delle quest dal pannello resta com'era.

---

## 3. Populate e orfani

| Query | Popolato | Non popolato |
| --- | --- | --- |
| `quests`, `quest(id)` | `infos.enemies[].enemy`, `prizes.pet` | `infos.enemies[].enemy.relatedLore`, `enemy.spells` (profondità 1) |
| risultati (`QuestResult`) | `enemies[].enemy`, `rewards.pet` | idem |

- **Voce orfana:** se un nemico viene cancellato a DB, la sua voce **sparisce dalla lista** (`enemies` non contiene mai un `null`); un pet orfano diventa `null`.
- **MAI selezionare `enemies[].enemy.relatedLore`** (né `spells`): non è popolato e i campi non-null di `Lore` romperebbero la risposta.
- **Selezione consigliata** (FE D-01):

```graphql
fragment QuestEnemyFields on QuestEnemy {
  quantity
  enemy { id name imagePath xp }
}

# in QuestFragment
infos { title type description timeToComplete enemies { ...QuestEnemyFields } }
prizes { pet { id name } }

# in QuestResultFragment
enemies { ...QuestEnemyFields }
stagesCleared
stagesTotal
rewards { pet { id name } }
```

- **Ordine:** l'ordine della lista è quello salvato; nelle `dungeon` è l'ordine delle tappe; nelle generate il boss è sempre una voce sola.
- **Pet:** selezionare solo `id name` (`Pet.buyPrice` è non-null e i pet solo da quest potrebbero non averlo curato: RESEARCH Pitfall 3); `imagePath` non serve (FE D-11 della Phase 13).
- **Ritratto del nemico più forte:** `xp` è selezionato solo per sceglierlo lato FE (FE D-02); il server non indica un nemico «principale».

---

## 4. Dungeon a tappe (D-10, D-12, D-13)

- Ogni voce di `enemies` è una **tappa di combattimento**, nell'ordine della lista; fra una tappa e l'altra c'è una prova di esplorazione implicita senza dati propri.
- La risoluzione passa dalla porta `DungeonResolver`: le tappe si combattono in sequenza partendo dagli **HP residui** della tappa precedente.
- **Vittoria** = tutte le tappe vinte: `stagesCleared == stagesTotal`, premi (monete, XP, loot, pet) **solo a fine percorso**.
- **Sconfitta** alla prima tappa persa: `stagesCleared` = tappe vinte prima, premi nulli, e la aid clonata porta gli stessi `enemies` (come il fallimento di oggi).
- Le quest diverse dalle dungeon hanno `stagesCleared` / `stagesTotal` a `null`.
- **Il motore di combattimento e l'algoritmo di esplorazione sono segnaposto PROVVISORI** (D-10, voce dell'utente): l'utente consegnerà la versione finale; la forma dati del contratto non cambia, una lista `stages` tipizzata potrà arrivare con l'algoritmo finale (§12).
- Le 40 dungeon fisse (oggi un nemico ciascuna) vengono arricchite di 1–3 tappe al primo boot reale (§11); le generate non sono mai `dungeon` né `hunt`.

---

## 5. `generateQuests`

```graphql
mutation GenerateQuests {
  generateQuests { created }
}
```

| Aspetto | Comportamento |
| --- | --- |
| Ruolo | solo oste (`innkeeper`); adventurer e guard ricevono `FORBIDDEN` senza alcuna generazione né record di audit; il FE chiude il pannello con «La Locanda non è disponibile» (FE D-09, Phase 10 D-04) |
| Senza sessione | `UNAUTHENTICATED` (guard globale, come ogni altra operazione) |
| Risposta | `{ created }` = numero di quest create da questa corsa; `0` a mondo pieno (target raggiunto o nessuna città con tetto libero e POI libero) |
| Semantica | una corsa normale del generatore (D-16): riempie fino al target e si ferma; nessun argomento |
| Concorrenza | single-flight: una chiamata mentre una corsa è in volo (sweep, boot, esito) riceve il risultato di quella corsa |
| Audit | record `AdminAuditLog` con `action: 'generateQuests'`, `target: { type: 'QuestGeneration', id: null }`, `outcome: 'ok'` |
| Errori interni | un errore della corsa arriva come errore GraphQL generico (il FE lo mostra come errore sconosciuto in SnackBar, FE D-09) |

---

## 6. Board, insert e scadenza (D-14, D-18)

- **Gli insert del generatore NON emettono `questUpdated`** (D-18): il publisher ascolta solo gli update/replace e la subscription è per id. Le quest generate compaiono alla **prossima apertura della board** (o al refresh già previsto dal FE); nessuna subscription nuova.
- **Nessuna scadenza** (D-14): una generata non accettata resta sul tabellone finché qualcuno la completa; abbandono e scioglimento del party la lasciano sulla board come oggi.
- Le generate si giocano come le quest fisse dello stesso tipo: `enemy` = un posto del rango (`requiredAdventurers: [{ title: R, count: 1 }]`, `minTitle: R`, posti a titolo esatto, D-09 rivista); `boss` = party con 2–6 posti del rango (D-05).
- Il flag interno `generated` non è esposto: il FE non distingue una generata da una fissa e non deve farlo.

---

## 7. Regole del generatore (costanti in `src/quests/generation/`)

**Quando gira (D-17):** al boot (dopo la manutenzione), con lo sweep periodico (`QUEST_GENERATION_SWEEP_INTERVAL_MS`, §10), dopo l'esito di una quest generata conclusa (enemy vinta, boss vinto dal party: `OutcomeWriter.deliver`), e con `generateQuests`. Tutto passa dallo stesso single-flight; una richiesta arrivata durante una corsa accoda al più un rerun.

**Target e città** (`city-picker.ts`, D-15, D-29):

| Regola | Valore |
| --- | --- |
| Target globale | `QUEST_GENERATION_TARGET`; vuota = numero delle città a DB (167 oggi) |
| Tetto per città | `GENERATED_CAP_BY_SIZE` (`city-picker.ts`, `capOf`): villaggio 1, città 2, capitale 4 generate attive (fisse e GM non contano), sempre entro i POI liberi; una città con `type` ignoto alla mappa delle taglie è saltata ma conta nel target (13.1 D-04) |
| Vicinato | k-nearest neighbours sui marker, `NEIGHBOUR_COUNT = 5` |
| Peso della città | `sizeWeightOf(size) / (1 + D)²` con fattori di taglia 1/2/4 (`SIZE_WEIGHT_BY_SIZE`), D = generate attive della città + dei 5 vicini; peso 0 a tetto o senza POI libero (13.1 D-04) |
| POI | uniforme fra i `pointsOfInterest` della città meno il marker e meno i POI con una quest non conclusa (fisse, GM e aid comprese) |
| Una quest per POI | indice unico parziale `quest_generated_open_marker` (generate aperte); una gara fra due corse dà E11000, il POI esce dalla corsa e si prosegue |

**Rango** (`generation-rules.ts`, D-07): il rango **meno coperto** fra le generate aperte di tutto il mondo (parità → il più basso), su cinque ranghi (`GENERATED_RANKS`, 13.1 D-02); se il POI non compone quel rango, gli altri in ordine di copertura.

| Rango | Fascia `Enemy.xp` | Media del party (PE) | Boss |
| --- | ---: | ---: | --- |
| rookie | 1–20 | — | no (solo `enemy`) (13.1 D-02) |
| adventurer | 21–69 | 400 | sì (13.1 D-02) |
| paladin | 70–224 | 1500 | sì (13.1 D-02) |
| mage | 225–548 | 4000 | sì (13.1 D-02) |
| hero | 549–803 | 6000 | sì (13.1 D-02) |

- Fasce contigue per soglie (`RANK_XP_FLOORS`, `HERO_XP_MAX = 803`, `RANK_XP_BANDS`, 13.1 D-02). **legend è solo un titolo: dal 13.1 nessuna generata legend**; i personaggi legend giocano le hero (13.1 D-02, D-08).

- `XP_SCALE = 0.14084507` (PE = xp / scala, Phase 11 D-11).
- **Boss** (D-05, D-06): `BOSS_SHARE = 0.1` (1 su 10 nei ranghi con boss); singolo sopra hi del rango, posti dalla formula ⌈(xp − 0,5) / `XP_SCALE` / media⌉ (C3) fra `MIN_BOSS_SEATS = 2` e `MAX_BOSS_SEATS = 6`, clamp a 2 sopra 803 (`bossSeatsFor`) (13.1 D-03).
- **Enemy** (D-07): un solo posto (`ENEMY_SEATS = 1`, nessun tiro dei posti, 13.1 D-09), Σ xp × quantità ∈ `budgetOf(R, 1)` = [lo, hi], membri della fascia o inferiori, `requiredAdventurers = [{ title: R, count: 1 }]`; `SINGLE_FORM_SHARE = 0.5` fra il singolo e il branco (1–3 tipi), `MAX_PACK_UNITS = 8`, `MAX_PACK_TYPES = 3`, `PACK_ATTEMPTS = 20` (13.1 D-03, D-09).
- **Posti:** un posto sulle `enemy`, posti per rango solo sui boss (13.1 D-09); a titolo esatto, ma un legend occupa un posto hero dopo gli eventuali posti legend (`hasSeatFor`/`seatAvailableExpr` di `quest-capacity.ts`, 13.1 D-08); nessun altro titolo scala.

**Pool dei nemici** (`enemy-pool.ts`, D-08): nemici con `legendary: false` (fail-closed, C5) e non animali (`isGeneratable`, 13.1 D-01) la cui `locations` contiene un `type` del POI o l'habitat `city`; `all` solo di ripiego quando la zona non compone la forma; un branco esce sempre da un solo pool.

**Premi** (`generated-prizes.ts`, D-19, D-20, D-21), per ogni partecipante:

| Tipo | Rame base | XP base |
| --- | ---: | ---: |
| `enemy` | 150 | 40 |
| `boss` | 600 | 120 |

× `TIER_MULTIPLIER`: rookie 1, adventurer 2, paladin 5, mage 12, hero 25 (chiave legend tolta, 13.1 D-02); l'XP della vittoria aggiunge Σ (xp del nemico × quantità).

`LOOT_POOLS` (pool di `randomLoot`, tirato per partecipante con le regole a cascata della Phase 9; riga legend tolta, 13.1 D-02):

| Rango | `boss` | `enemy` |
| --- | --- | --- |
| rookie | 2 common | 1–2 common |
| adventurer | 1 uncommon + 4 common | 1–2 common |
| paladin | 1 rare + 2 uncommon + 4 common | 1 uncommon + 2 common |
| mage | 1 ultrarare + 2 rare + 4 uncommon | 1 rare + 2 uncommon |
| hero | 1 legendary + 2 ultrarare + 4 rare | 1 ultrarare + 2 rare |

- Legendary mai sotto hero; da `rare` in su niente cibo (`hunger`); estrazione senza ripetizioni, uno slot si restringe a quanto il catalogo offre.
- **Pet:** `BOSS_PET_PRIZE_CHANCE = 0.01` sui soli boss generati, uniforme fra i pet con `sellable: false`; alla vittoria `QUEST_PET_WIN_CHANCE` = 20% per vincitore, tirato dopo loot e magie, solo se il pet esiste a catalogo; finisce in `assets.ownedPets` mai due volte (un pet già posseduto non viene riassegnato) e appare in `rewards.pet`; `assets.pet` (l'equipaggiato) non viene mai toccato.

**Consigliati** (`recommended-loot.ts`, C4): fino a `RECOMMENDED_WEAPONS = 2` armi che colpiscono `baseWeaknesses` / `energyWeaknesses` dei nemici (somma della potenza utile) più la miglior cura, entro `RECOMMENDED_LOOT_RARITY` (rookie common, adventurer uncommon, paladin rare, mage ultrarare, hero legendary; chiave legend tolta, 13.1 D-02).

**Testi** (`quest-templates.ts`, D-22): titolo «Minaccia: … presso <città>» / «Boss: … presso <città>»; annuncio `infos.description` sorteggiato fra 3 varianti per tipo nella voce di un committente; `relatedLore` = lore della città + lore dei nemici (senza doppioni); `TIME_TO_COMPLETE_MS` enemy 3 600 000 (1 h), boss 10 800 000 (3 h).

---

## 8. Scelte confermate dall'utente il 2026-11-04 e copy provvisoria

- `TIER_MULTIPLIER.legend = 25` (come hero) e pool `enemy` legend = 1 legendary + 2 ultrarare + 4 rare, come il boss hero (D-19, D-20). **Superata dal 13.1 D-02: nessuna generata legend, chiavi legend tolte (§7).**
- **Quantità nel titolo solo se > 1 su una voce sola**; in un branco di più voci ogni voce mostra la sua (D-22):
  - «Minaccia: Orsogufo presso Atheland»
  - «Minaccia: 3 Goblin e 1 Capo goblin presso Atheland»
  - «Boss: Troll presso Atheland»
- I 6 annunci (3 enemy, 3 boss) sono copy provvisoria, ritoccabile in `quest-templates.ts`; la descrizione via LLM resta v2.

---

## 9. Note di cura a DB

- **Animali** (13.1 D-01): un nemico è animale se una sua `relatedLore` è una `Lore` con `type: animal`; per renderlo generabile si cambia la lore, non il nemico. Gli animali restano solo nelle hunt (mai in singoli, branchi, boss o tappe delle dungeon).
- **Zona `dungeon`** (cura a DB del 2026-11-05): 49 nemici hanno la zona `dungeon`; i POI di tipo dungeon pescano anche da questi.
- **Superata dal 13.1 D-02 (fasce contigue): ogni non leggendario fino a 803 xp cade in una fascia.** Storico: **41 nemici non leggendari non escono mai come singoli** (C6): cadono fra una fascia e l'altra (fra cui 23 nemici a xp 63, PE 450: Ghoul, Ogre, Capo dei Banditi, Mimic, Grifone…). Entrano solo nei branchi o come boss; per renderli singoli va ritoccato il loro `xp` a DB.
- **Nemico nuovo a DB:** senza `legendary` esplicito **non viene generato** (fail-closed, C5): impostare `legendary: false` per renderlo generabile, `true` per riservarlo alle worldMission del GM.
- **Più istanze del BE:** il single-flight è per processo; con più istanze il tetto di 3 per città potrebbe superarsi di poco (A2). La garanzia «una quest per POI» invece regge (indice unico).
- **Gioielli nuovi:** `accessoryUseTypes` non viene più valorizzato da nessun codice dopo la rimozione del migratore: va scritto a mano a DB (mappa D-25: magia `attack`/`control`/`illusion`/`charm`/`confuse` → attack, `defense` → defense, `enhance`/`infuse` → entrambi, senza magia → defense salvo descrizione offensiva).
- **Dungeon:** dopo l'arricchimento del primo boot le tappe si curano a DB (ordine della lista `infos.enemies` = ordine delle tappe).
- **Pet solo da quest:** il pool del premio sono i pet con `sellable: false`; un pet nuovo senza `sellable` esplicito non entra nel pool.

---

## 10. Configurazione

Due variabili nuove, già in `.env.example` (sezione Phase 13), **non segrete**, entrambe opzionali:

| Variabile | Vuota | Valori | Effetto |
| --- | --- | --- | --- |
| `QUEST_GENERATION_TARGET` | una quest generata per città (numero delle città a DB al momento della corsa) | intero 0–10000 | numero di generate attive da mantenere nel mondo |
| `QUEST_GENERATION_SWEEP_INTERVAL_MS` | 3 600 000 (un'ora) | intero 0–2147483647; `0` = sweep spento | intervallo dello sweep periodico; la corsa al boot gira comunque |

Un valore non valido **rifiuta il boot** con un messaggio che non riporta il valore. Nessuna variabile va aggiunta all'ambiente per il primo boot: vuote = default.

---

## 11. Runbook del primo boot reale dal branch (PRIMA della merge)

**(a) Chi e come.** Passo dell'utente, o dell'orchestratore su sua richiesta: **nessun esecutore della fase lo ha eseguito**. Dal branch `feat/13-generazione-quest`:

```bash
git checkout feat/13-generazione-quest
npm ci
npm run build
# riavvio del processo BE da dist/ con l'ambiente di sempre (nessuna variabile nuova obbligatoria)
```

**(b) Cosa scrive il boot, nell'ordine di `QuestMaintenanceBoot`** (ogni passo isolato: un fallimento logga `ERROR Manutenzione missioni: <passo> fallita (<nome e codice>), il boot prosegue` e passa al successivo):

| # | Passo | Riga di log attesa | Atteso al primo boot |
| ---: | --- | --- | --- |
| 1 | migrazione `enemy` → `enemies` su quest e risultati (permanente) | `Nemici delle missioni: <q> missioni e <r> risultati migrati alla lista` | q ≈ 581 (tutte le fisse, anche quelle con nemico nullo), r ≈ 24 |
| 2 | flag `legendary` (una tantum) | `Nemici: 22 leggendari e <n> ordinari marcati` | 22 e n ≈ 128 (150 nemici del discuss) |
| 3 | `accessoryUseTypes` dei gioielli (una tantum) | `Gioielli: 42 valorizzati` | 42, **nessuna** WARN `Gioielli: <k> della tabella non trovati a DB: <id>…` (se compare, un id della tabella approvata manca a DB: annotarlo) e **nessuna** WARN `Gioielli: <k> della tabella non sono anelli né collane a DB: <id>…` (se compare, l'id esiste ma con un altro `equipType`: non viene scritto, annotarlo) |
| 4 | tappe delle dungeon (una tantum) | `Dungeon: <n> arricchite a tappe` | fino a 40; le dungeon con `minTitle` legend o non generabile danno `WARN Dungeon <id> con minTitle non generabile: saltata` (solo id); le dungeon già avviate da un party (`startedAt` valorizzato) non vengono lette; una dungeon a cui si aggiungerebbe una sola tappa in tutto (zero nemici validi) resta com'è e conta fra le saltate |
| 5 | richiesta di corsa al generatore | `Generatore: <n> missioni create (target <t>)` | n ≈ 167 con il target di default (t = numero delle città) |

- La corsa del generatore parte a dati pronti (leggendari esclusi, dungeon a tappe); anche lo sweeper chiede una corsa al boot: il single-flight le fonde, la riga del generatore compare una volta (una seconda corsa a mondo pieno non logga nulla).
- Possibili WARN del generatore, innocue: `Generatore: POI <id> già occupato da un'altra corsa, si prosegue`.
- **Riavvii successivi:** nessuna riga dei passi 1–4 (i filtri toccano solo i campi mancanti) e nessuna riga del generatore finché il mondo è pieno. **Verificato il 2026-11-05 alle 08:06 col secondo boot dal codice finale (`f5d8134`, migratori una tantum rimossi): nessuna riga dei passi né del generatore, nessun ERROR, processo in ascolto sulla porta di sempre.**

Registrare qui sotto, dopo il boot, le righe effettive del log (senza URI né host):

```
# 2026-11-05 07:51 — branch feat/13-generazione-quest @ a446b13, `nest build`, riavvio da dist/ sulla porta di sempre, env nuove lasciate vuote
LOG [QuestEnemiesMigrator]   Nemici delle missioni: 581 missioni e 24 risultati migrati alla lista
LOG [EnemyLegendaryMigrator] Nemici: 22 leggendari e 128 ordinari marcati
LOG [JewelAccessoryMigrator] Gioielli: 42 valorizzati                      (nessuna WARN: tutti gli id della tabella trovati, tutti anelli o collane)
LOG [DungeonStagesMigrator]  Dungeon: 40 arricchite a tappe                (nessuna saltata: nessuna WARN «minTitle non generabile»)
LOG [NestApplication]        Nest application successfully started
LOG [QuestGenerator]         Generatore: 167 missioni create (target 167)  (5 s dopo l'avvio; nessuna WARN «POI già occupato»)
# nessuna riga ERROR «Manutenzione missioni: … fallita»; i passi 1–5 hanno impiegato ~9 s in tutto
```

**(c) Verifiche dopo il boot.** Da un client GraphQL autenticato:

```graphql
query {
  quests {
    id
    infos { type title enemies { quantity enemy { name } } }
  }
}
```

Attesi: quest `enemy`/`boss` con titoli da template; nessuna quest con `enemy` singolo; dungeon con 2–4 voci. Controlli a DB, solo conteggi:

```javascript
// mongosh collegato a <uri>/<db>
db.quests.countDocuments({ generated: true, concludedAt: null })            // ≈ target
db.quests.countDocuments({ "infos.enemy": { $exists: true } })              // 0
db.questresults.countDocuments({ enemy: { $exists: true } })                // 0
db.enemies.countDocuments({ legendary: true })                              // 22
db.enemies.countDocuments({ legendary: { $nin: [true, false] } })           // 0
db.equipmentitems.countDocuments({ accessoryUseTypes: { $type: "array" } }) // 42
db.quests.countDocuments({ "infos.type": "dungeon", "infos.enemies.1": { $exists: true } }) // ≈ 40 meno le saltate
db.quests.aggregate([
  { $match: { generated: true, concludedAt: null } },
  { $group: { _id: "$requirements.minTitle", n: { $sum: 1 } } },
])                                                                           // ranghi distribuiti, nessuno a 0 se il mondo lo consente
```

Esito del 2026-11-05, subito dopo il primo boot (script di sola lettura dell'orchestratore, solo conteggi):

```
  167  quest generate aperte (target 167)
    0  quest con il vecchio campo singolo del nemico      0  risultati con il vecchio campo singolo
   22  nemici legendary: true                             0  nemici con legendary non booleano (150 nemici in tutto)
   42  gioielli con accessoryUseTypes (array)
   40  dungeon con almeno 2 tappe, su 40
  748  quest in tutto (581 fisse + 167 generate)          0  quest generate con enemies vuoto
  per rango: rookie 28, adventurer 28, paladin 28, mage 28, hero 28, legend 27
  per tipo:  enemy 154 (51 in branco con quantity ≥ 2), boss 13
  premi:     randomLoot, prizeCoins e xpPrize su 167/167; prizeItem 0 (il draft generato lo lascia a null per disegno); pet 0 su 13 boss (1 %, D-21)
```

**(d) Rimozione dei migratori una tantum PRIMA della merge** (Phase 12 D-25, T-13-21b), in un commit `refactor(migrations): drop the one-off migrators after their run` sul branch, con TDD verde:

- `src/quests/maintenance/enemy-legendary.migrator.ts` + `src/quests/maintenance/enemy-legendary.migrator.int-spec.ts`
- `src/quests/maintenance/jewel-accessory.migrator.ts` + `src/quests/maintenance/jewel-accessory.migrator.int-spec.ts`
- `src/quests/maintenance/dungeon-stages.ts` + `src/quests/maintenance/dungeon-stages.spec.ts`
- `src/quests/maintenance/dungeon-stages.migrator.ts` + `src/quests/maintenance/dungeon-stages.migrator.int-spec.ts`
- In `src/quests/maintenance/quest-maintenance.boot.ts`: i passi 2–5 (`flag dei leggendari (una tantum)`, `fasi d'uso dei gioielli (una tantum)`, `tappe delle dungeon (una tantum)`, `richiesta di corsa al generatore`) e i parametri `legendary`, `jewels`, `dungeons`, `trigger` del costruttore (e il commento che li annuncia).
- In `src/quests/maintenance/quest-maintenance.module.ts`: i provider `EnemyLegendaryMigrator`, `JewelAccessoryMigrator`, `DungeonStagesMigrator`; le voci `Enemy`, `PointOfInterest`, `EquipmentItem` del forFeature; l'import di `QuestGenerationTriggerModule`.
- In `src/quests/maintenance/quest-maintenance.boot.spec.ts`: i casi `(D-26)`, `(D-04, D-13, D-17)` e `(D-17)`; restano i due casi `(D-28)`.
- **Resta** il migratore permanente `QuestEnemiesMigrator` (passo 1) con il lettore tollerante `validQuestEnemiesOf`: sweeper e processor possono leggere prima del migratore e i dati di un DB ripristinato da backup tornano in forma vecchia.
- La corsa al boot resta: la chiede lo sweeper del generatore (`QuestGenerationSweeper`).
- Dopo la rimozione: `npx tsc --noEmit -p tsconfig.json`, le spec di `src/quests/maintenance` (unit e integration), il real boot `test/app.int-spec.ts`, `npm run test:cov` (soglie invariate); lo SDL non cambia. Un boot dal codice finale deve essere silenzioso sui passi una tantum.

**Eseguita il 2026-11-05 (orchestratore):** `bdbf6bc` (RED: `quest-maintenance.boot.spec.ts` ridotta ai due casi D-28 col costruttore a un parametro, 2 falliti per `TypeError` sui passi 2–5) + `f5d8134` (refactor: 10 file, −1352 righe; restano `quest-enemies.migration.ts`, `quest-enemies.migrator.ts` con la sua int-spec, boot, module e spec del boot). Gate: `npx tsc --noEmit` 0; `src/quests/maintenance` unit 2/2 e integration 5/5; real boot `test/app.int-spec.ts` 73/73 con `src/schema.gql` invariato; `npm run test:cov` 332 suite / 4192 test, soglie di coverage rispettate. Secondo boot dal codice finale alle 08:06: silenzioso sui passi una tantum e sul generatore, nessun ERROR (§11 b).

**(e) Segreti.** Solo placeholder in questo documento (`<uri>`, `<db>`, `<id>`): i valori reali stanno nell'ambiente del processo, mai nel repo; il log del boot si registra senza URI né host.

**(f) Primo boot reale dal branch `feat/13.1-correzioni-generazione-quest` (dopo il popolamento del DB).** Fase 13.1, decisioni D-01..D-08 in `../13.1-correzioni-generazione-quest/13.1-CONTEXT.md`; handoff FE in `../13.1-correzioni-generazione-quest/BACKEND-NOTES.md`.

- **Chi:** l'orchestratore, su richiesta dell'utente, **solo dopo** che il DB è popolato con i nemici e gli animali nuovi dettati dall'utente. Nessun esecutore della fase lo lancia. Stato del DB al 2026-11-05 (cura a DB dell'orchestratore, fuori dal repo): 205 nemici (28 leggendari), 41 lore `animal`, zona `dungeon` su 49 nemici, 92 magie, 44 pet, 460 lore; nessuna generata registrata o in corsia; ogni hunt ha animali nella zona del suo POI. Le precondizioni sono quindi soddisfatte.
- **Comandi:** `npm ci` e `npm run build` **prima** di fermare il processo in corsa (gira da `dist/` di questo albero: una build a processo fermo allunga il buco), poi stop e riavvio da `dist/` con l'ambiente di sempre. **Nessuna variabile nuova.**

```bash
git checkout feat/13.1-correzioni-generazione-quest
npm ci
npm run build
# stop del processo BE in corsa, poi riavvio da dist/ con l'ambiente di sempre
```

Passi di `QuestMaintenanceBoot`, nell'ordine (ogni passo isolato: un fallimento logga `ERROR Manutenzione missioni: <passo> fallita (<nome e codice>), il boot prosegue`):

| # | Passo | Riga di log attesa | Atteso al primo boot |
| ---: | --- | --- | --- |
| 1 | `migrazione dei nemici delle missioni` (`QuestEnemiesMigrator`, permanente) | `Nemici delle missioni: <q> missioni e <r> risultati migrati alla lista` | probabilmente nessuna riga (già migrato il 2026-11-05) |
| 2 | `reset delle generate (una tantum)` (`GeneratedQuestsResetMigrator`, 13.1 D-06) | `Generate: <n> cancellate, <m> lasciate` | n ≈ generate aperte non protette (167 oggi), m = registrate o in corsia (0 oggi); con m > 0 una DEBUG `Generate protette: <id>, …` con i soli id delle generate aperte lasciate (fix V-IN-01). Marcatore: gira solo se esiste una generata aperta con `minTitle` legend non protetta |
| 3 | `prede delle hunt (una tantum)` (`HuntPreyMigrator`, 13.1 D-07) | `Hunt: <n> rifatte, <m> già coerenti, <k> senza prede, <l> in corsia` | n + m + k + l = hunt aperte (77); k = 0 e l = 0 attesi; una WARN di solo id per ogni hunt `Hunt <id> senza prede in zona: lasciata` o `Hunt <id> in corsia: lasciata`. Una hunt già coerente conta in m anche se nessuna città elenca il suo POI (fix V-IN-02). Una hunt promossa a un'altra fascia prende anche premi (`prizes.prizeCoins`, `prizes.xpPrize`: 150 rame e 40 xp × moltiplicatore della fascia nuova) e `requirements.recommendedLoot` della preda nuova (fix B-IN-01) |
| 4 | `tappe delle dungeon (una tantum)` (`DungeonStagesMigrator`, 13.1 D-07) | `Dungeon: <n> ricomposte, <m> già coerenti, <l> in corsia` | n + m + l + saltate = dungeon aperte (≤ 40); l = 0 atteso (nessuna corsia oggi); WARN di solo id `Dungeon <id> in corsia: lasciata` (fix B-WR-01), `Dungeon <id> con minTitle non generabile: saltata` o `Dungeon <id> senza tappe componibili: lasciata` (quest'ultima solo se nessun conteggio da 2 a 4 compone, né in zona né col ripiego `all`, fix B-WR-02). Una dungeon con il primo nemico sostituito prende il titolo «Dungeon: <nemico> presso <città>»; la descrizione resta invariata |
| 5 | `richiesta di corsa al generatore` | `Generatore: <n> missioni create (target <t>)` | n ≈ 167 con il target di default (t = numero delle città); possibili WARN innocue `Generatore: POI <id> già occupato da un'altra corsa, si prosegue` |

- La riga del passo 3 compare solo se n + k + l > 0; la riga del passo 4 solo se n + l > 0; il passo 2 non logga nulla se il marcatore è falso.
- **Secondo boot:** nessuna riga del passo 2 né del generatore a mondo pieno; il passo 4 ripete solo le WARN e la riga con `<l>` se restano dungeon in corsia; il passo 3 ripete solo le WARN e la riga con `<k>`/`<l>` se restano hunt senza prede in zona o in corsia (atteso, nessuna scrittura).

**Controlli di sola lettura dopo il boot** (solo conteggi, nessuna scrittura):

```javascript
// mongosh collegato a <uri>/<db>
const open = { generated: true, concludedAt: null };
db.quests.countDocuments(open)                                                  // ≈ target
db.quests.aggregate([
  { $match: open },
  { $group: { _id: "$requirements.minTitle", n: { $sum: 1 } } },
])                                                                               // cinque ranghi, nessun legend
const animalLore = db.lores.distinct("_id", { type: "animal" });
const animals = db.enemies.distinct("_id", { relatedLore: { $in: animalLore } });
db.quests.countDocuments({ ...open, "infos.enemies.enemy": { $in: animals } })   // 0
db.quests.aggregate([
  { $match: open },
  { $lookup: { from: "cities", localField: "infos.markerLocation", foreignField: "pointsOfInterest", as: "city" } },
  { $unwind: "$city" },
  { $group: { _id: { city: "$city._id", type: "$city.type" }, n: { $sum: 1 } } },
  { $group: { _id: { type: "$_id.type", n: "$n" }, cities: { $sum: 1 } } },
  { $sort: { "_id.type": 1, "_id.n": 1 } },
])                                                                               // per tipo di città: nessun villaggio sopra 1, città sopra 2, capitale sopra 4 (citySizeOf)
db.quests.aggregate([
  { $match: { "infos.type": "hunt", concludedAt: null } },
  { $group: { _id: "$requirements.minTitle", n: { $sum: 1 } } },
])                                                                               // hunt per rango della preda
db.quests.countDocuments({ "infos.type": "dungeon", concludedAt: null })         // dungeon aperte
db.quests.countDocuments({ "infos.type": "dungeon", concludedAt: null,
  "infos.enemies.1": { $exists: true }, "infos.enemies.4": { $exists: false } }) // = le aperte (2–4 tappe) salvo le saltate
```

Registrare qui sotto, dopo il boot, le righe effettive del log (senza URI né host), come per il boot del 2026-11-05:

```
# <data ora> — branch feat/13.1-correzioni-generazione-quest @ <hash>, `nest build`, riavvio da dist/ sulla porta di sempre
**Esito del primo boot reale (2026-11-05, 16:34, build `nest build` da `e16e193` prima dello stop del processo precedente, riavvio da `dist/` sulla porta 3001):**
- `[GeneratedQuestsResetMigrator] Generate: 167 cancellate, 0 lasciate`
- `[HuntPreyMigrator] Hunt: 14 rifatte, 63 già coerenti, 0 senza prede, 0 in corsia`
- `[DungeonStagesMigrator] Dungeon: 32 ricomposte, 8 già coerenti, 0 in corsia`
- `[NestApplication] Nest application successfully started`
- `[QuestGenerator] Generatore: 167 missioni create (target 167)` (5 s dopo l'avvio)
- nessuna riga `ERROR`, nessun WARN «tipo sconosciuto»; nessuna riga del migratore permanente dei nemici (già allineati).
Conteggi a DB dopo il boot (script di sola lettura dell'orchestratore): 167 generate aperte (capitali 22, città 73, villaggi 72; nessuna oltre il tetto 1/2/4); per rango rookie 34, adventurer 34, paladin 33, mage 33, hero 33, legend 0; 0 con animali, 0 con leggendari; 155 `enemy` (tutte a un posto, budget e fasce rispettati) e 12 `boss` conformi; una sola generata per POI. Hunt 77 (rookie 72, adventurer 4, paladin 1), prede animali della zona e in fascia. Dungeon 40 (2 tappe 26, 3 tappe 10, 4 tappe 4), senza animali, tappe ≤ hi e totale nel budget.
**Secondo boot (16:36):** solo `Nest application successfully started`; nessuna riga dei one-off né del generatore (marcatori di idempotenza).
**Cura a DB dopo il boot (orchestratore, stessa forma di scrittura del `HuntPreyMigrator`):** 7 delle 8 hunt di Liberia, tutte «Squalo tropicale» e perciò coerenti per il migratore, sono state riscritte con prede diverse dei nuovi animali (Rana gigante, Millepiedi gigante, Granchio gigante, Babbuino, Cavalluccio marino gigante; Squalo cacciatore a Liberia come caccia adventurer; Orca assassina a Pontealto come caccia paladin, con premi e XP della fascia); Tine resta con lo Squalo tropicale (POI di solo mare).
```

**Rimozione dei one-off (2026-11-05):** commit RED `3bdf65a` `test(migrations): expect only the permanent enemies step at boot` (spec ridotta ai due casi `(D-28)` con il costruttore a un argomento: 2/2 rossi in jest per i quattro log `TypeError` dei passi una tantum, tsc TS2554 «Expected 5 arguments, but got 1»), poi GREEN `64ef914` `refactor(migrations): drop the 13.1 one-off migrators after their run`. Tolti `generated-quests-reset.migrator.ts` + int-spec, `hunt-prey.ts` + spec, `hunt-prey.migrator.ts` + int-spec, `dungeon-stages.ts` + spec, `dungeon-stages.migrator.ts` + int-spec (10 file in `src/quests/maintenance/`, −2562 righe). `QuestMaintenanceBoot` torna al solo passo `migrazione dei nemici delle missioni` (costruttore a un parametro, via i passi 2–5 e la richiesta al generatore: la corsa al boot la chiede `QuestGenerationSweeper`); `QuestMaintenanceModule` senza i provider `GeneratedQuestsResetMigrator`, `HuntPreyMigrator`, `DungeonStagesMigrator`, senza l'import di `QuestGenerationTriggerModule` e senza le voci `Enemy`, `Lore`, `PointOfInterest`, `City`, `PendingQuest`, `EquipmentItem`, `LootItem` del `forFeature` (restano `Quest` e `QuestResult`); `prize-catalog.ts` e `lean-values.ts` intatti (usati dal generatore e dal combattimento). Gate: `npx tsc --noEmit -p tsconfig.json` 0; `npx jest src/quests/maintenance --selectProjects unit` 1 suite / 2 test; `npx jest src/quests/maintenance test/app.int-spec.ts --selectProjects integration --runInBand` 2 suite / 78 test; prettier ed eslint puliti sui tre file toccati; `git diff --exit-code src/schema.gql` 0 e `git diff origin/develop -- src/schema.gql` vuoto; grep di `GeneratedQuestsResetMigrator|HuntPreyMigrator|DungeonStagesMigrator|hunt-prey|dungeon-stages|generated-quests-reset` in `src` e `test`: 0 file; trailer vietati 0; `pgrep -fl jest` vuoto; processo BE pid 47591 (build con i one-off) vivo e non toccato, nessuna build. Restano a cura dell'orchestratore `npm run test:cov`, il secondo boot dal codice finale e `gh pr ready`.

**Rimozione dei one-off PRIMA della merge** (Phase 12 D-25), in TDD come `f5d8134`: prima un RED sulla spec del boot ridotta (`quest-maintenance.boot.spec.ts` ai soli casi `(D-28)` con il costruttore a un parametro), poi `refactor(migrations): drop the 13.1 one-off migrators after their run`:

- `src/quests/maintenance/generated-quests-reset.migrator.ts` + `src/quests/maintenance/generated-quests-reset.migrator.int-spec.ts`
- `src/quests/maintenance/hunt-prey.ts` + `src/quests/maintenance/hunt-prey.spec.ts`
- `src/quests/maintenance/hunt-prey.migrator.ts` + `src/quests/maintenance/hunt-prey.migrator.int-spec.ts`
- `src/quests/maintenance/dungeon-stages.ts` + `src/quests/maintenance/dungeon-stages.spec.ts`
- `src/quests/maintenance/dungeon-stages.migrator.ts` + `src/quests/maintenance/dungeon-stages.migrator.int-spec.ts`
- In `src/quests/maintenance/quest-maintenance.boot.ts`: i passi 2–5 (`reset delle generate (una tantum)`, `prede delle hunt (una tantum)`, `tappe delle dungeon (una tantum)`, `richiesta di corsa al generatore`) e i parametri `reset`, `hunts`, `dungeons`, `trigger` del costruttore.
- In `src/quests/maintenance/quest-maintenance.module.ts`: i provider `GeneratedQuestsResetMigrator`, `HuntPreyMigrator`, `DungeonStagesMigrator`; le voci `Enemy`, `Lore`, `PointOfInterest`, `City`, `PendingQuest`, `EquipmentItem`, `LootItem` del `forFeature`; l'import di `QuestGenerationTriggerModule`.
- In `src/quests/maintenance/quest-maintenance.boot.spec.ts`: i casi 13.1 `(D-06, D-07)` e `(D-06)`; restano i due casi `(D-28)`.
- **Restano** `src/quests/generation/prize-catalog.ts` e `src/mongo/lean-values.ts` (usati dal generatore e dal combattimento, fix della review 13.1) e `QuestEnemiesMigrator` (passo 1, permanente); la corsa al boot resta, chiesta dallo sweeper del generatore.
- Dopo la rimozione: `npx tsc --noEmit -p tsconfig.json`, le spec di `src/quests/maintenance` (unit e integration), il real boot `test/app.int-spec.ts` con `src/schema.gql` invariato, `npm run test:cov` (soglie invariate), secondo boot dal codice finale silenzioso sui passi una tantum, poi `gh pr ready` a cura dell'orchestratore.
- Debito noto (nessuna correzione nel 13.1): Mongoose converte i filtri `idForms(...)` sui path ObjectId di `City`, quindi un ref legacy in stringa esadecimale non si trova via modello in `locationInQuestCity` (accettazione), `shop-transaction.service.ts`, `travel-planner.service.ts`, `rescue-resolution.service.ts` e nei migratori hunt/dungeon (città cercata su `pointsOfInterest`); `QuestsService.cityPoiIdsAt` usa già `cityModel.collection`. A DB reale oggi 0 ref legacy in stringa (inventario 2026-11-05): il boot non ne è toccato.

---

## 12. Note per le fasi successive e avvisi per la FE

**FE Phase 14 (piani gated 14-10/14-11, FE D-13):**

- Schema gate contro `origin/develop:src/schema.gql` dopo la merge: ogni documento senza `enemy` singolo e con `enemies { quantity enemy { … } }`; nessuna selezione di `enemies[].enemy.relatedLore`.
- `QuestRewards.isEmpty` deve contare il pet (FE D-01, C3): un risultato con solo il pet esiste.
- Una voce malformata in `enemies` non arriva dal server (gli orfani sono già tolti), ma il parsing tollerante del FE resta valido.
- E2E su device: dopo il primo boot reale le generate sono già sulla board (≈ 167); per vederne di nuove, `generateQuests` dalla Locanda risponde 0 finché il mondo è pieno (concludere una generata o abbassare il target per provarlo).
- Le dungeon con tappe si vedono nel risultato: «Esplorazione: tappa k di N» (FE D-07).

**Domande aperte per la FE:**

- Il FE vuole un evento per le generate nuove (publisher sugli insert, D-18 deferred) o basta il refresh all'apertura della board?
- Il FE ha bisogno di distinguere una quest generata (oggi il flag è interno)? Per ora no (§6).

**Backend:**

- **Phase 15 imboscate:** combatte già con `enemies` (`CombatContext.enemies` con `quantity`).
- **Motore finale dell'utente:** porte `CombatResolver` (multi-nemico, con `equipType` e `accessoryUseTypes` dei pezzi indossati nel contesto, D-24) e `DungeonResolver` (con `recommendedLoot` della quest e `recommendedOwned` dei partecipanti nel contesto, D-11); i segnaposto si sostituiscono via DI.
- **`stages` tipizzate:** potranno arrivare con l'algoritmo di esplorazione finale (D-12), in modo additivo.
- **Deferred:** scadenza delle generate (D-14: nessuna oggi); publisher `questUpdated` sugli insert (D-18).
- **Rilancio dopo GM e soccorso:** vedi §14, punto 1.

---

## 13. Numeri del gate (piano 13-19)

| Gate | Esito |
| --- | --- |
| `npm run test:cov` | 334 suite / 4208 test verdi (due corse, ~500 s ciascuna) |
| Coverage `src/quests/generation/` | statements 98,3 / branches 84,4 / lines 99,0 / functions 98,1; soglia nuova 96 / 82 / 97 |
| Real boot `test/app.int-spec.ts` | 73 test; contratto FE Phase 14 fissato dal test `writes the quest generation contract of the FE Phase 14 into the generated schema (D-01, D-16, D-21, D-24)` |
| SDL vs `origin/develop` | righe tolte: esattamente le due `  enemy: Enemy`; resto additivo |
| Lint | prettier ed eslint puliti sui 118 file `.ts` della fase (1 warning preesistente `no-base-to-string` in `test/app.int-spec.ts`) |
| `npx tsc --noEmit -p tsconfig.json` | 0 errori |
| Segreti | solo `.env.example` nel diff (due chiavi vuote); nessun URI nei documenti |
| One-off isolati | nessun riferimento ai migratori una tantum fuori da `src/quests/maintenance/` |

---

## 14. Note dall'esecuzione

1. **GM e soccorso non rilanciano subito il generatore** (13-14): `GmCompletionService` e `RescueResolutionService` non impostano `regenerate`; una quest generata conclusa dal GM o dal soccorso libera il posto solo al prossimo sweep periodico (default un'ora) o con `generateQuests`. Rilancio immediato solo dopo enemy vinta e boss vinto dal party. Da valutare in review.
2. **Target e sweep** (13-13): `QUEST_GENERATION_TARGET` vuota = una quest generata per città (numero delle città a DB); `QUEST_GENERATION_SWEEP_INTERVAL_MS` vuota = 1 h, `0` = solo la corsa al boot. Il real boot di `AppModule` nei test esegue una corsa del generatore (DB vuoto → 0).
3. **Pet alla vittoria** (13-15): solo per risoluzione standard, boss e completamento del GM (tutti via `drawRewards`); il soccorso mai (`rewards.pet: null`); 20% per vincitore dopo loot e magie; `ownedPets` idempotente; `assets.pet` (equipaggiato) mai toccato.
4. **Gioielli** (13-16): al primo boot reale il passo deve loggare `Gioielli: 42 valorizzati` **senza WARN**; sull'harness vuoto il WARN con i 42 id è atteso. Dopo il boot si rimuovono migratore, int-spec, passo del boot, provider, `EquipmentItem` nel forFeature e i casi `(D-26)` del boot spec (§11 d).
5. **Scelte dell'executor sulle dungeon** (13-17), da confermare con l'utente:
   - le bande di briganti in apertura si formano solo con il Bandito (e il Capo dei Banditi per paladin) presenti nel pool di **zona** del POI;
   - rookie: Bandito × 2–3; adventurer: Bandito × 6–8; paladin: Capo × 1 + Bandito × 2–7, sempre in 2 voci; mage, hero e legend senza banda;
   - le dungeon con `minTitle` legend o non generabile vengono saltate con WARN di solo id; una dungeon senza tappe aggiungibili è saltata senza WARN;
   - il migratore ha un suo convertitore lean → `EnemyCandidate` (duplicazione accettata: esce dal repo dopo il boot);
   - l'arricchimento è deterministico per id (seme `DUNGEON_STAGES_SEED = 13`): rieseguito su un DB ripristinato darebbe le stesse tappe.
6. **Dungeon senza nemici validi** (review B-IN-01): segue la regola C6/D-01 di tutti i tipi, successo automatico con premi pieni e `stagesCleared` / `stagesTotal` a `null` (la porta `DungeonResolver` non viene chiamata); il ramo 0/0 di `PlaceholderDungeonResolver` è solo difensivo. Una dungeon a cui la cura a DB toglie tutti i nemici regala quindi i premi di fine percorso.
7. **Indice di guardia delle generate** (review C-IN-01, nessun cambio di codice): al primo boot reale verificare che il log di `SweepIndexVerifier` non segnali la collezione delle quest (`ERROR Indici di quests non costruiti (…)`): per `quest_generated_open_marker` non sarebbe un semplice rallentamento ma la mancanza della guardia di unicità delle generate (D-28); il generatore resta single-flight e rilegge i POI occupati a ogni corsa.
8. **Arresto del generatore** (review A-WR-01): allo stop del BE lo sweeper chiama `QuestGenerator.close()`: da lì `request()` (sweep, conclusioni di generate) e il rerun in coda non avviano più corse, e lo stop attende anche la corsa riavviata da un rerun; `generateQuests` resta servita.
9. **Log del generatore** (review A-IN-02): la riga `Generatore: <n> missioni create (target <t>)` compare anche quando una `create` fallisce a metà corsa, prima della riga `Generatore: corsa fallita (…)`.
