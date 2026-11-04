# BACKEND-NOTES — Phase 13 Generazione quest (handoff per la FE Phase 14 e runbook del primo boot)

- **Fase BE:** 13-generazione-quest (requisiti BE-QGEN-01..BE-QGEN-11; decisioni D-01..D-31 con gli emendamenti C1–C6 in `13-CONTEXT.md`).
- **Data:** 2026-11-04. Documento di fine fase (piano 13-20), scritto dopo il gate 13-19.
- **Branch:** `feat/13-generazione-quest` → PR verso `develop` (la apre l'orchestratore dopo review → fix → verifica → security).
- **Schema:** rispetto a `origin/develop` lo SDL toglie **esattamente due righe** (`  enemy: Enemy` in `type QuestInfos` e in `type QuestResult`, D-01: modifica non additiva dichiarata) e aggiunge tutto il resto in modo additivo. Lo schema generato `src/schema.gql` vince su questo documento.
- **Consumatore:** FE Phase 14 (`../Klimmeck-Guide/.planning/phases/14-quest-generation/14-CONTEXT.md`, FE D-01..D-16); i piani gated 14-10/14-11 (schema gate su `origin/develop:src/schema.gql`, E2E su device) partono dopo la merge di questa PR su `develop` (FE D-13).
- **Primo boot reale:** NON ancora eseguito. Nessun esecutore della fase ha avviato il BE né toccato il database reale: il runbook è in §11 e va eseguito dal branch PRIMA della merge, poi i migratori una tantum escono dal repo (Phase 12 D-25).
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
| Tetto per città | `MAX_GENERATED_PER_CITY = 3` generate attive (fisse e GM non contano) |
| Vicinato | k-nearest neighbours sui marker, `NEIGHBOUR_COUNT = 5` |
| Peso della città | `1 / (1 + D)²`, D = generate attive della città + dei 5 vicini; peso 0 a tetto o senza POI libero |
| POI | uniforme fra i `pointsOfInterest` della città meno il marker e meno i POI con una quest non conclusa (fisse, GM e aid comprese) |
| Una quest per POI | indice unico parziale `quest_generated_open_marker` (generate aperte); una gara fra due corse dà E11000, il POI esce dalla corsa e si prosegue |

**Rango** (`generation-rules.ts`, D-07): il rango **meno coperto** fra le generate aperte di tutto il mondo (parità → il più basso), su sei ranghi; se il POI non compone quel rango, gli altri in ordine di copertura.

| Rango | Fascia `Enemy.xp` | Media del party (PE) | Boss |
| --- | ---: | ---: | --- |
| rookie | 7–14 | — | no (solo `enemy`) |
| adventurer | 21–35 | 400 | sì |
| paladin | 70–169 | 1500 | sì |
| mage | 225–451 | 4000 | sì |
| hero | 549–803 | 6000 | sì |
| legend | 1098–3212 (= 2–4 nemici della fascia hero) | 15000 (documentata, nessun candidato) | no |

- `XP_SCALE = 0.14084507` (PE = xp / scala, Phase 11 D-11).
- **Boss** (D-05, D-06): `BOSS_SHARE = 0.1` (1 su 10 nei ranghi con boss); un solo nemico di fascia superiore; posti = ⌈(xp − 0,5) / `XP_SCALE` / media⌉ (C3), tenuti fra `MIN_BOSS_SEATS = 2` e `MAX_BOSS_SEATS = 6`.
- **Enemy** (D-07): `SINGLE_FORM_SHARE = 0.5` fra (a) un nemico singolo con xp nella fascia e (b) un branco di nemici più deboli con somma xp nella fascia; `MAX_PACK_UNITS = 8`, `MAX_PACK_TYPES = 3`, `PACK_ATTEMPTS = 20`; legend = branco di `LEGEND_PACK_UNITS` 2–4 nemici hero.

**Pool dei nemici** (`enemy-pool.ts`, D-08): nemici con `legendary: false` (fail-closed, C5) la cui `locations` contiene un `type` del POI o l'habitat `city`; `all` solo di ripiego quando la zona non compone la forma; un branco esce sempre da un solo pool.

**Premi** (`generated-prizes.ts`, D-19, D-20, D-21), per ogni partecipante:

| Tipo | Rame base | XP base |
| --- | ---: | ---: |
| `enemy` | 150 | 40 |
| `boss` | 600 | 120 |

× `TIER_MULTIPLIER`: rookie 1, adventurer 2, paladin 5, mage 12, hero 25, legend 25; l'XP della vittoria aggiunge Σ (xp del nemico × quantità).

`LOOT_POOLS` (pool di `randomLoot`, tirato per partecipante con le regole a cascata della Phase 9):

| Rango | `boss` | `enemy` |
| --- | --- | --- |
| rookie | 2 common | 1–2 common |
| adventurer | 1 uncommon + 4 common | 1–2 common |
| paladin | 1 rare + 2 uncommon + 4 common | 1 uncommon + 2 common |
| mage | 1 ultrarare + 2 rare + 4 uncommon | 1 rare + 2 uncommon |
| hero | 1 legendary + 2 ultrarare + 4 rare | 1 ultrarare + 2 rare |
| legend | — (nessun boss) | 1 legendary + 2 ultrarare + 4 rare |

- Legendary mai sotto hero; da `rare` in su niente cibo (`hunger`); estrazione senza ripetizioni, uno slot si restringe a quanto il catalogo offre.
- **Pet:** `BOSS_PET_PRIZE_CHANCE = 0.01` sui soli boss generati, uniforme fra i pet con `sellable: false`; alla vittoria `QUEST_PET_WIN_CHANCE` = 20% per vincitore, tirato dopo loot e magie, solo se il pet esiste a catalogo; finisce in `assets.ownedPets` mai due volte (un pet già posseduto non viene riassegnato) e appare in `rewards.pet`; `assets.pet` (l'equipaggiato) non viene mai toccato.

**Consigliati** (`recommended-loot.ts`, C4): fino a `RECOMMENDED_WEAPONS = 2` armi che colpiscono `baseWeaknesses` / `energyWeaknesses` dei nemici (somma della potenza utile) più la miglior cura, entro `RECOMMENDED_LOOT_RARITY` (rookie common, adventurer uncommon, paladin rare, mage ultrarare, hero e legend legendary).

**Testi** (`quest-templates.ts`, D-22): titolo «Minaccia: … presso <città>» / «Boss: … presso <città>»; annuncio `infos.description` sorteggiato fra 3 varianti per tipo nella voce di un committente; `relatedLore` = lore della città + lore dei nemici (senza doppioni); `TIME_TO_COMPLETE_MS` enemy 3 600 000 (1 h), boss 10 800 000 (3 h).

---

## 8. Scelte confermate dall'utente il 2026-11-04 e copy provvisoria

- `TIER_MULTIPLIER.legend = 25` (come hero) e pool `enemy` legend = 1 legendary + 2 ultrarare + 4 rare, come il boss hero (D-19, D-20).
- **Quantità nel titolo solo se > 1 su una voce sola**; in un branco di più voci ogni voce mostra la sua (D-22):
  - «Minaccia: Orsogufo presso Atheland»
  - «Minaccia: 3 Goblin e 1 Capo goblin presso Atheland»
  - «Boss: Troll presso Atheland»
- I 6 annunci (3 enemy, 3 boss) sono copy provvisoria, ritoccabile in `quest-templates.ts`; la descrizione via LLM resta v2.

---

## 9. Note di cura a DB

- **41 nemici non leggendari non escono mai come singoli** (C6): cadono fra una fascia e l'altra (fra cui 23 nemici a xp 63, PE 450: Ghoul, Ogre, Capo dei Banditi, Mimic, Grifone…). Entrano solo nei branchi o come boss; per renderli singoli va ritoccato il loro `xp` a DB.
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
| 3 | `accessoryUseTypes` dei gioielli (una tantum) | `Gioielli: 42 valorizzati` | 42, **nessuna** WARN `Gioielli: <k> della tabella non trovati a DB: <id>…` (se compare, un id della tabella approvata manca a DB: annotarlo) |
| 4 | tappe delle dungeon (una tantum) | `Dungeon: <n> arricchite a tappe` | fino a 40; le dungeon con `minTitle` legend o non generabile danno `WARN Dungeon <id> con minTitle non generabile: saltata` (solo id) |
| 5 | richiesta di corsa al generatore | `Generatore: <n> missioni create (target <t>)` | n ≈ 167 con il target di default (t = numero delle città) |

- La corsa del generatore parte a dati pronti (leggendari esclusi, dungeon a tappe); anche lo sweeper chiede una corsa al boot: il single-flight le fonde, la riga del generatore compare una volta (una seconda corsa a mondo pieno non logga nulla).
- Possibili WARN del generatore, innocue: `Generatore: POI <id> già occupato da un'altra corsa, si prosegue`.
- **Riavvii successivi:** nessuna riga dei passi 1–4 (i filtri toccano solo i campi mancanti) e nessuna riga del generatore finché il mondo è pieno.

Registrare qui sotto, dopo il boot, le righe effettive del log (senza URI né host):

```
<log del primo boot reale: righe 1–5>
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

**(e) Segreti.** Solo placeholder in questo documento (`<uri>`, `<db>`, `<id>`): i valori reali stanno nell'ambiente del processo, mai nel repo; il log del boot si registra senza URI né host.

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
