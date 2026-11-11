# BACKEND-NOTES — Phase 19 Revisione dei modelli (handoff per la FE Phase 19)

- **Fase BE:** 19-revisione-dei-modelli (requisiti BE-MODEL-01..12; decisioni D-01..D-28 in `19-CONTEXT.md`; nomi del contratto fissati in `19-REPO-RULES.md` insieme alla FE `19-REPO-RULES.md`).
- **Data:** 2026-11-11. Documento scritto dopo il gate verde del piano 19-23; **review del codice chiusa** (tre review per area, `19-REVIEW-RULINGS.md`, `19-REVIEW-FIX.md`): 32 finding, 16 corretti, 16 chiusi per ruling. Questo file è allineato ai fix.
- **Branch:** `feat/19-revisione-dei-modelli` → PR #33 verso `develop`. **Boot reale eseguito, contenuto dei pet a DB e modulo una tantum RIMOSSO l'11 novembre 2026** (esito qui sotto, runbook in §3 segnato passo per passo): la PR esce dal draft a cura dell'orchestratore.
- **Gate della FE Phase 19:** i piani che selezionano i nomi cambiati partono dopo la merge di questa PR con `git -C <repo BE> show origin/develop:src/schema.gql | grep -cF '<nome>'` ≥ 1 per `type Weaknesses`, `type OwnedPet`, `petXpGained`, `wornEquipment`, `feet`, `imagePath`, `attack: Damages!` e = 0 per `energyWeaknesses`, `baseWeaknesses`, `wearedEquipment`, `foots`, `activeSpells`, più i controlli ancorati al blocco della FE D-19 e D-20 (`type Lore` con `imagePath` e senza `image:`, `type SpellState` con `active: Boolean!`, `type CharacterStatus` senza `spells:`, `enum SlotType` con `feet`, `type CharacterAssets` con `ownedPets: [OwnedPet!]!`, `type Pet` con `defense: Damages!` e `rarity: RarityType`). Sullo SDL di questa HEAD ognuno di questi controlli dà già l'esito atteso.
- **Schema:** `src/schema.gql` **NON additivo, cambiato solo come dichiarato** (§1): 17 righe tolte e 46 aggiunte rispetto alla base della fase `12a47d1f`; il boot reale di test (`test/app.int-spec.ts`, 91 test dopo la rimozione del modulo, 92 prima) rigenera lo schema e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate 19-23: `npx tsc --noEmit` 0; unit 275 suite / 3501 test; integration 148 suite / 2033 test in quattro blocchi tutti verdi (dettaglio in `19-23-SUMMARY.md`); coverage per cartella sopra le sette soglie a rischio. **Dopo i fix della review** (conteggi correnti): unit 276 suite / 3534 test; integration 149 suite / 2050 test; boot reale 92 test; `npx tsc --noEmit` 0 e `git diff --exit-code src/schema.gql` 0 (nessun fix cambia lo SDL). `npm run test:cov` lo lancia l'orchestratore in background dopo questo piano. **Dopo la rimozione del modulo una tantum** (commit `c3492ced` RED, `0822feee` GREEN; conteggi correnti): unit 272 suite / 3497 test; integration 140 suite / 1990 test in quattro blocchi tutti verdi (27 / 494, 29 / 422, 35 / 520, 49 / 554); boot reale di test 91 test; `npx tsc --noEmit` 0; `git diff --exit-code src/schema.gql` 0.
- **Fonte:** ogni nome e valore è copiato dal codice (`src/schema.gql`, `src/quests/outcomes/pets/pet-xp.ts`, `src/quests/generation/pet-prize.ts`). **Il codice vince su questo documento.** La cartella `src/migrations/model-review/` citata in §2 e §3 **non esiste più**: quelle righe restano come registro di ciò che è girato.

---

## 0. TL;DR per il FE

1. **SDL NON additivo e dichiarato.** Per area: nemici (`weaknesses` al posto delle due liste) · pet a catalogo (`attack` / `defense` al posto di `damages`, via `xp` e `currentLifePoints`, più `rarity` e `relatedLore`) · pet posseduti (`ownedPets: [OwnedPet!]!`) · xp del compagno (`QuestResult.petXpGained`) · equipaggiamento (`wornEquipment`, `feet`, valore `feet` di `SlotType`) · magie (`SpellState.active`, via `CharacterStatus.spells`, `CharacterAssets.activeSpells` e `type ActiveSpell`) · POI (via `PointOfInterest.quest`) · lore (`imagePath` al posto di `image`). **Una query che seleziona un nome tolto fallisce la validazione GraphQL per intero**: selezioni e modelli della FE cambiano nello stesso rilascio.
2. **L'unica regola di gioco nuova sul filo è il 10 % degli xp dei nemici al compagno equipaggiato** (`petXpGained`, guadagno effettivo dopo il tetto `maxXp`).
3. **Le lore dei pet si sbloccano quando il pet è ottenuto** (acquisto o premio). `Pet.relatedLore` è additivo: **la FE non ha bisogno di selezionarlo**, vede `status.unlockedLore` cambiare su `characterUpdated` (e `QuestResult.loreUnlocked` per il pet in premio).
4. **`Pet.rarity` è additivo e nullable**: la FE lo seleziona e lo mostra sul compagno; **può essere `null`** (prima della cura a DB, o per un valore a DB fuori enum).
5. **Le quest generate `enemy` e `boss` possono offrire un pet in premio** legato al nemico o alla zona (prima solo le `boss`); alla vittoria il pet esce col 20 % di prima.
6. **`equipItem` vuole `slotType: feet`**: il valore vecchio dello slot dei piedi è rifiutato con `BAD_USER_INPUT`.
7. **Magie:** le equipaggiate sono le voci di `status.spellStates` con `active: true`, **in ordine di apprendimento** (non più di equipaggiamento); una magia imparata arriva non equipaggiata.
8. **Boot reale fatto, contenuto dei pet a DB, modulo una tantum rimosso** (11 novembre 2026, esito nella sezione dopo §2). Il BE su questa macchina gira già col codice della Phase 19, i dati migrati e il contenuto dei pet. I piani gated della FE partono appena la PR #33 è mergiata su `develop`.

---

## 1. Tabella SDL vecchio → nuovo

### 1.1 Cambi per area

| Area | Vecchio (tolto) | Nuovo | Decisione | Cosa cambia per la FE |
|------|-----------------|-------|-----------|-----------------------|
| Nemici | `Enemy.energyWeaknesses: [String!]!`, `Enemy.baseWeaknesses: [String!]!` | `Enemy.weaknesses: Weaknesses!`, `type Weaknesses { base: [DamageType!]!, energy: [EnergyType!]! }`, `enum DamageType`, `enum EnergyType` | D-01, D-24 | Modello del nemico: un sotto-oggetto con due liste di enum al posto delle due liste di stringhe. Liste vuote = nessuna debolezza |
| Nemici | (a DB) copie incorporate delle magie | `Enemy.spells: [Spell!]!` **invariato sul filo** (a DB riferimenti al catalogo, popolati) | D-02 | Nulla |
| Pet a catalogo | `Pet.damages: Damages!`, `Pet.xp: Int!`, `Pet.currentLifePoints: Int!` | `Pet.attack: Damages!`, `Pet.defense: Damages!` (stesso tipo `Damages`, liste vuote di default) | D-03, D-15 | Il catalogo non ha più stato: `xp` e vita corrente si leggono sulla voce posseduta. Restano `maxLifePoints`, `maxXp`, prezzi, `speedModifier`, `sellable`, `imagePath` |
| Pet a catalogo | — | `Pet.relatedLore: [Lore!]!` (additivo, filtrato per viewer) | D-26 | **La FE non ha bisogno di selezionarlo** |
| Pet a catalogo | — | `Pet.rarity: RarityType` (additivo, **nullable**), `enum RarityType` | D-27 | **La FE lo seleziona** e lo nasconde quando è `null`. Le rarità di equipaggiamento e loot restano `String` |
| Pet posseduti | `CharacterAssets.ownedPets: [Pet!]!` | `CharacterAssets.ownedPets: [OwnedPet!]!`, `type OwnedPet { pet: Pet!, xp: Int!, currentLifePoints: Int! }` | D-03, D-23 | Selezione `ownedPets { pet { … } xp currentLifePoints }`. `CharacterAssets.pet: Pet` (compagno equipaggiato, catalogo) invariato |
| Xp del compagno | — | `QuestResult.petXpGained: Int!` (additivo, default 0) | D-04, D-17, D-18, D-19 | Riga «xp al compagno» sul foglio d'esito |
| Equipaggiamento | `CharacterAssets.wearedEquipment`, `Equipment.foots`, valore `foots` di `enum SlotType` | `CharacterAssets.wornEquipment: Equipment!`, `Equipment.feet: EquipmentItem`, valore `feet` | D-06, D-24 | Selezioni, chiave dello slot e **argomento di `equipItem`** (`EquipItemRequest.slotType`) nello stesso commit |
| Magie | `CharacterStatus.spells: [Spell!]!`, `CharacterAssets.activeSpells: [ActiveSpell!]!`, `type ActiveSpell` | `SpellState.active: Boolean!` su `CharacterStatus.spellStates: [SpellState!]!`, unica lista | D-07, D-16 | Conosciute = le voci; equipaggiate = le voci con `active` vero, con gli usi della voce |
| Slot magie | (a Mongoose) virtual | `CharacterStatus.maxActiveSpells: Int!` **invariato sul filo**, resolve field calcolato da xp e titolo | D-08, D-24 | Nulla |
| POI | `PointOfInterest.quest: ID` | — | D-09 | Togliere la selezione se esiste (la FE non la seleziona) |
| Negozio | (a Mongoose) tre array del pool sulla città | `City.shop { equipment, loot, pets }` **solo Mongoose**; `type CityShop` e `City.hasShop` invariati sul filo | D-10 | Nulla |
| Lore | `Lore.image: String` | `Lore.imagePath: String` | D-11 | Selezioni delle lore e delle città (`relatedLore { … imagePath }`) |
| Pulizia | file enum con underscore, modello `KGNotification` | file in kebab-case, modello rimosso | D-11, D-20 | Nulla (non erano nello SDL) |
| Premi generati | pet solo sulle `boss` all'1 % | `Pet.enemy` **solo Mongoose, mai sul filo**; pet offerto dalle quest generate `enemy` e `boss` per legame | D-28 | Nulla sullo SDL: `prizes.pet` può comparire anche su una quest `enemy` |

### 1.2 Blocchi verbatim da `src/schema.gql`

```graphql
type Enemy {
  damages: Damages!
  id: ID!
  imagePath: String!
  legendary: Boolean!
  lifePoints: Int!
  locations: [PoiType!]!
  name: String!
  relatedLore: [Lore!]!
  spells: [Spell!]!
  weaknesses: Weaknesses!
  xp: Int!
}

type Weaknesses {
  base: [DamageType!]!
  energy: [EnergyType!]!
}

enum DamageType {
  blunt
  cut
  pierce
}

enum EnergyType {
  acid
  cold
  enhancing
  fire
  force
  lightning
  necrotic
  poison
  psychic
  radiant
  thunder
}
```

```graphql
type Pet {
  attack: Damages!
  buyPrice: Coins!
  defense: Damages!
  id: ID!
  imagePath: String!
  maxLifePoints: Int!
  maxXp: Int!
  name: String!
  rarity: RarityType
  relatedLore: [Lore!]!
  sellPrice: Coins!
  sellable: Boolean
  speedModifier: Float
}

enum RarityType {
  common
  legendary
  rare
  ultrarare
  uncommon
}

type OwnedPet {
  currentLifePoints: Int!
  pet: Pet!
  xp: Int!
}
```

```graphql
type CharacterAssets {
  ownedEquipments: [AssetQuantity!]!
  ownedItems: [AssetQuantity!]!
  ownedPets: [OwnedPet!]!
  pet: Pet
  wornEquipment: Equipment!
}

type Equipment {
  arms: EquipmentItem
  chest: EquipmentItem
  feet: EquipmentItem
  firstAccessory: EquipmentItem
  head: EquipmentItem
  leftHand: EquipmentItem
  legs: EquipmentItem
  rightHand: EquipmentItem
  secondAccessory: EquipmentItem
}

enum SlotType {
  arms
  chest
  feet
  firstAccessory
  head
  leftHand
  legs
  rightHand
  secondAccessory
}
```

```graphql
type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  coins: Coins!
  currentLifePoints: Int!
  imprisonedUntil: DateTime
  injuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  potionRecoveryUntil: DateTime
  spellStates: [SpellState!]!
  title: String!
  unlockedLore: [ID!]!
  xp: Int!
}

type SpellState {
  active: Boolean!
  recoveries: [DateTime!]!
  spell: Spell!
  usages: Int!
}
```

```graphql
type PointOfInterest {
  city: City
  id: ID!
  location: [Float!]!
  type: [PoiType!]!
}

type Lore {
  description: String!
  id: ID!
  imagePath: String
  name: String!
  relatedLore: [Lore!]!
  type: String!
}
```

Riga nuova di `type QuestResult` (gli altri campi invariati):

```graphql
type QuestResult {
  petXpGained: Int!
}
```

### 1.3 Cosa la FE deve selezionare e cosa no

| Campo | Selezione FE |
|-------|--------------|
| `Pet.rarity` | **Sì**, può essere `null` (nasconderla). Un valore a DB fuori enum arriva `null` con un errore parziale sul solo path `rarity`: la lista dei pet arriva comunque |
| `Pet.relatedLore` | **Non serve** (flusso di `unlockedLore` della Phase 17) |
| `Pet.attack`, `Pet.defense` | A scelta della FE (oggi `PetFragment` non seleziona i danni). `defense` è vuota finché il contenuto non è a DB (§3, passo 6) |
| `OwnedPet { pet, xp, currentLifePoints }` | Sì, al posto di `ownedPets { …campi del pet }` |
| `QuestResult.petXpGained` | Sì (foglio d'esito) |
| `CharacterAssets.wornEquipment { … feet … }` | Sì, al posto dei nomi vecchi |
| `SpellState.active` | Sì; `CharacterStatus.spells` e `CharacterAssets.activeSpells` **non esistono più** |
| `Lore.imagePath` | Sì, al posto di `image` (lore e `relatedLore` delle città) |
| `Enemy.weaknesses`, `PointOfInterest.type` | Fuori dal filo della FE di oggi: nessun obbligo |

### 1.4 Semantica

- **`SlotType.feet` è un valore sul filo:** è l'argomento `EquipItemRequest.slotType` di `equipItem`. Il valore vecchio dello slot dei piedi non è più nell'enum: la richiesta è rifiutata dalla validazione GraphQL con `BAD_USER_INPUT`, `data` assente, nessuna scrittura.
- **Le selezioni vecchie falliscono la validazione:** `wearedEquipment`, `foots`, `activeSpells`, `status { spells }`, `Lore.image`, `PointOfInterest.quest`, `Pet.damages` / `xp` / `currentLifePoints`, le due liste di debolezze. Non c'è un periodo in cui il BE serve entrambe le forme.
- **`OwnedPet.pet` è il catalogo; `xp` e `currentLifePoints` sono lo stato del pet posseduto.** `CharacterAssets.pet` resta il catalogo del compagno equipaggiato: il suo stato si trova in `ownedPets` cercando la voce con lo stesso `pet.id`. Un pet comprato o vinto parte da `xp` 0 e dalla `maxLifePoints` del catalogo.
- **Le voci orfane non arrivano sul filo** (D-23): una voce il cui pet non è più a catalogo resta a DB ma è tolta dalla risposta.
- **`petXpGained` è il guadagno effettivo dopo il tetto** (D-17): 0 senza compagno equipaggiato, senza nemici, in sconfitta, col compagno già al tetto o con `maxXp` del catalogo non valido; un risultato salvato prima del campo risponde 0. **Per l'imboscata** il valore arriva nel `QuestResult` `kind: ambush` creato all'arrivo (D-19); `AmbushReport` sullo SDL non cambia; i report trattenuti prima del deploy consegnano 0.
- **Magie:** le equipaggiate sono le voci di `spellStates` con `active` vero, nell'ordine della lista, cioè di apprendimento (D-16); gli usi sono quelli della voce. Una voce di una magia cancellata dal catalogo non arriva sul filo. `maxActiveSpells` è invariato.
- **`type ActiveSpell` non esiste più.** Nessuno degli input dei modelli (`EnemyInput`, `PetInput`, `LoreInput`, `EquipmentInput`, `WeaknessesInput`) è nello SDL (D-24).
- **Mutation, argomenti e codici di rifiuto sono invariati** (`equipSpell`, `unequipSpell`, `useSpell`, `equipItem`, `equipPet`, acquisto e vendita): cambia solo dove scrivono. Il blocco `type Mutation` non ha righe tolte.
- **Lore del pet ottenuto:** l'acquisto non cambia risposta; il personaggio aggiornato arriva su `characterUpdated` con le lore nuove in `unlockedLore`. Per il pet in premio le sue lore sono in `QuestResult.loreUnlocked`, dopo quelle della vittoria e dello studio. La vendita non toglie le lore.

---

## 2. Comportamenti provati

Ogni riga è verde nel gate 19-23; le righe che citano un finding (A-WR-01, A-WR-03, C-WR-06, C-CR-01) sono verdi nelle corse dopo i fix della review. I titoli dei casi nominano la decisione fra parentesi.

| Comportamento | Decisione | Spec |
|---------------|-----------|------|
| Debolezze in un sotto-documento, liste vuote di default, valore fuori enum rifiutato sul path della lista | D-01 | `src/models/enemy.schema.spec.ts` |
| Il generatore consiglia il loot dalle debolezze nuove | D-01 | `src/quests/generation/recommended-loot.spec.ts`, `src/quests/generation/enemy-candidate.spec.ts` |
| Il combattimento riceve solo debolezze dei due enum; nemico senza sotto-documento = due liste vuote | D-01, D-22 | `src/quests/outcomes/combat/combat-context.spec.ts` |
| **Debolezze filtrate ai due enum sul filo:** un valore fuori enum a DB (o una lista nulla) non arriva e non dà errore; nemici, lista `quests` e risultati non si annullano. Un solo filtro, lo stesso del motore | D-01 (review A-WR-01) | `src/enemies/weaknesses.wire.int-spec.ts`, `src/enemies/known-weaknesses.spec.ts`, `src/quests/quests.resolver.int-spec.ts` |
| Magie dei nemici per riferimento, popolate nel catalogo dei nemici, nel catalogo delle quest e nel foglio del risultato; un ref orfano non rompe la risposta | D-02 | `src/models/enemy.schema.spec.ts`, `src/lore/lore-related.int-spec.ts`, `src/quests/quests.resolver.int-spec.ts`, `src/quests/results/quest-result.resolver.int-spec.ts` |
| Catalogo dei pet con `attack` e `defense` e senza stato | D-03, D-15 | `src/models/pet.schema.spec.ts` |
| Voci dei pet posseduti sul filo, orfani tolti dalla risposta senza scritture | D-03, D-23 | `src/characters/pets/owned-pets.mapper.spec.ts`, `src/characters/character-updated.subscription.int-spec.ts` |
| **Voce di `ownedPets` normalizzata sul filo e alla riscrittura:** `xp` e vita non validi (nulli, assenti, negativi, oltre il tetto di `Int`) serviti come 0, frazionari arrotondati per difetto; voce senza pet leggibile tolta dal filo; il personaggio non si annulla. Premio del compagno, pet vinto e negozio riscrivono l'array normalizzato (ref stringa → `ObjectId`, voce senza ref tolta): una voce rotta guarisce alla prima riscrittura | D-03, D-23 (review A-WR-03, A-IN-04) | `src/characters/pets/owned-pet-entry.spec.ts`, `src/characters/pets/owned-pets.mapper.spec.ts`, `src/characters/character-updated.subscription.int-spec.ts` |
| `equipPet` accetta solo un pet presente in una voce e non ne tocca lo stato | D-03 | `src/characters/pets/equip-pet.int-spec.ts`, `src/characters/pets/equip-pet.updates.spec.ts` |
| Negozio: il pet comprato è una voce con `xp` 0 e la vita del catalogo; la vendita toglie la voce intera e lascia lo stato delle altre | D-03 | `src/economy/trade/trade-pets.spec.ts`, `src/economy/trade/shop-transaction.service.int-spec.ts`, `test/shops/city-shops.e2e.int-spec.ts` |
| Pet in premio come voce intera; vita non valida a catalogo = 0 | D-03 | `src/characters/pets/owned-pet-entry.spec.ts`, `src/quests/outcomes/quest-pet-prize.int-spec.ts` |
| **Xp del compagno: `round(Σ Enemy.xp × 0,10)`, tetto `maxXp`, guadagno effettivo** | D-04, D-17 | `src/quests/outcomes/pets/pet-xp.spec.ts`, `src/quests/outcomes/pets/companion-xp.spec.ts` |
| Il premio entra nella stessa scrittura dell'esito, come valore unico di `assets.ownedPets` insieme al pet vinto; vita del compagno mai toccata | D-04 | `src/quests/outcomes/outcome-plan.spec.ts`, `src/quests/outcomes/quest-pet-prize.int-spec.ts` |
| Quest individuale, party (quota piena a ogni compagno), quest senza nemici (0), sconfitta (0) sul replica set | D-04, D-18 | `src/quests/outcomes/quest-resolution.service.int-spec.ts` |
| Completamento del GM con nemici | D-18 | `src/quests/outcomes/gm-completion.service.int-spec.ts` |
| Soccorso vinto (premia) e perso (non premia); scontro di guardia vinto | D-18 | `src/quests/outcomes/combatant-plan.spec.ts`, `src/quests/outcomes/guard/guard-outcome.spec.ts` |
| Imboscata vinta: quota sulla somma grezza degli xp dei nemici (non sul premio di grado), valore trattenuto nel report e consegnato nel risultato creato all'arrivo; report vecchio = 0 | D-04, D-19 | `src/travel/ambush/ambush-plan.spec.ts`, `src/travel/ambush/ambush-results.spec.ts`, `src/travel/ambush/ambush-resolution.int-spec.ts`, `src/travel/ambush/ambush-lifecycle.int-spec.ts` |
| `petXpGained` sul filo; un risultato salvato prima del campo risponde 0 | D-04 | `src/quests/results/quest-result.resolver.int-spec.ts`, `src/models/quest-result/quest-result.schema.spec.ts` |
| Lore dei pet per viewer (giocatore, oste, senza personaggio) | D-26 | `src/lore/lore-related.int-spec.ts` |
| Lore sbloccate all'acquisto, nella scrittura dell'acquisto; pet già posseduto e vendita non cambiano nulla | D-26 | `src/economy/trade/shop-transaction.service.int-spec.ts`, `src/economy/trade/trade-pets.spec.ts`, `src/economy/trade/catalog-prices.reader.int-spec.ts` |
| Lore sbloccate col pet in premio e riportate sul risultato | D-26 | `src/quests/outcomes/outcome-plan.spec.ts`, `src/quests/outcomes/quest-pet-prize.int-spec.ts` |
| Rarità dei pet: `null` di default, cinque valori dell'enum, fuori enum rifiutato alla creazione; sul filo `null` per un pet senza rarità o con valore fuori enum | D-27 | `src/models/pet.schema.spec.ts`, `src/pets/pet-rarity.int-spec.ts` |
| **Pet in premio delle quest generate: un tiro, tre fasce che si sommano** — 10 % stesso nemico, 5 % zona, 5 % solo boss fra i non vendibili —, tetto di rarità dal pool di loot del rango, pet senza rarità mai candidato, fascia vuota che non passa alle altre, contratto dei tiri | D-28 | `src/quests/generation/pet-prize.spec.ts`, `src/quests/generation/pet-candidate.spec.ts`, `src/quests/generation/generated-prizes.spec.ts`, `src/quests/generation/quest-generator.int-spec.ts` |
| 20 % del pet alla vittoria invariato (`QUEST_PET_WIN_CHANCE`) | D-28 | `src/quests/outcomes/rewards/quest-rewards.spec.ts` |
| POI senza back-link; `city(id)` serve i POI senza populate annidato | D-09 | `src/models/point-of-interest.schema.spec.ts`, `src/cities/cities.resolver.int-spec.ts` |
| **`cities { pointsOfInterest { id } }` popolato:** anche la lista `cities` serve i POI di ogni città (una query in più per tutti i POI, nessun N+1), non più un errore parziale con `pointsOfInterest: null` | review C-WR-06 | `src/cities/cities.resolver.int-spec.ts` |
| Pool dei negozi nel sotto-documento: assente ≠ vuota, `cityShop`, `hasShop`, report, acquisto | D-10 | `src/models/shop-fields.schema.spec.ts`, `src/shops/shop-pool.rules.spec.ts`, `src/shops/shop-pool.report.spec.ts`, `src/shops/city-shop.service.int-spec.ts`, `src/shops/city-shop.resolver.int-spec.ts`, `src/economy/trade/trade-pool.spec.ts` |
| `Lore.imagePath` su schema e filo | D-11 | `src/models/lore.schema.spec.ts`, `src/lore/lore-related.int-spec.ts`, `src/cities/cities.resolver.int-spec.ts` |
| Slot `feet` su `equipItem` (scrittura e lettura), valore fuori enum = `BAD_USER_INPUT`, slot liberato dalla vendita dell'ultimo esemplare | D-06 | `src/characters/equipment/equip-item.int-spec.ts`, `src/characters/equipment/equip-item.updates.spec.ts`, `src/economy/trade/shop-transaction.service.int-spec.ts` |
| `maxActiveSpells` calcolato, su query e su subscription | D-08 | `src/characters/character-status.resolver.spec.ts`, `src/characters/spells/spell-state.wire.int-spec.ts`, `src/characters/character-updated.subscription.int-spec.ts` |
| `equipSpell` / `unequipSpell` scrivono il solo flag della voce; codici e precedenza identici; capacità sul documento vivo | D-07 | `src/characters/spells/equip-spell.int-spec.ts`, `src/characters/spells/active-spell.updates.spec.ts` |
| `useSpell` e crediti di recupero sulla sola voce | D-07 | `src/characters/spells/use-spell.int-spec.ts`, `src/characters/spells/spell-state.updates.spec.ts`, `src/characters/spells/spell-recovery.service.int-spec.ts` |
| Il migratore permanente delle magie è ridotto al taglio, conserva `active` e non ricostruisce mai nulla | D-21 | `src/characters/spells/spell-state.migrator.int-spec.ts`, `src/characters/spells/spell-state.migration.spec.ts` |
| **Una magia imparata nasce come voce non equipaggiata**, in coda; «già conosciuta» decisa sulle voci | D-07 | `src/characters/spells/spell-state.snapshot.spec.ts`, `src/quests/outcomes/study-spell-draw.int-spec.ts`, `src/quests/outcomes/outcome-plan.spec.ts` |
| In combattimento, negli override del GM e nell'imboscata entrano solo le voci con `active` vero, in ordine di apprendimento, con gli usi della voce | D-07, D-16, D-22 | `src/quests/outcomes/combat/combat-context.spec.ts`, `src/quests/outcomes/gm-overrides.spec.ts`, `src/quests/outcomes/quest-combat.int-spec.ts`, `src/quests/outcomes/unrewarded-plan.spec.ts`, `src/travel/ambush/ambush-plan.spec.ts` |
| Magie sul filo: sole voci, attive in ordine di apprendimento | D-07, D-16 | `src/characters/spells/spell-state.mapper.spec.ts`, `src/characters/spells/spell-state.wire.int-spec.ts` |
| Una sola lista di magie su schema, documento appena creato e SDL | D-07 | `src/models/character/character-status.schema.spec.ts`, `src/characters/creation/character-creation.resolver.int-spec.ts` |
| Registro permanente dei ref: 33 riferimenti in 11 collection (con `pets:relatedLore` e `pets:enemy`) | D-26, D-28 | `src/migrations/mixed-refs/mixed-ref-paths.spec.ts` |
| Boot reale di test: SDL coi blocchi esatti dei tipi toccati; **modulo una tantum NON montato** dopo la rimozione («does not mount the one-off model review migration (D-12)»). Le sonde sull'ordine del boot (review C-CR-01) sono uscite col modulo | D-12 | `test/app.int-spec.ts` |

**RIMOSSO dopo il boot reale (commit `0822feee`): la tabella resta come registro.** I nove passi del migratore una tantum (ordine di `STEPS` in `src/migrations/model-review/model-review.module.ts`), ognuno con la prova «seconda corsa = zero scritture» finché è esistito:

| # | Classe | Label nel log | Spec |
|---|--------|---------------|------|
| 1 | `EnemyWeaknessesStep` | `debolezze dei nemici` | `enemy-weaknesses.step.int-spec.ts` |
| 2 | `EnemySpellsStep` | `magie dei nemici` | `enemy-spells.step.spec.ts`, `enemy-spells.step.int-spec.ts` |
| 3 | `PetCatalogStep` | `catalogo dei pet` | `pet-catalog.step.int-spec.ts` |
| 4 | `OwnedPetsStep` | `pet posseduti` | `owned-pets.step.spec.ts`, `owned-pets.step.int-spec.ts` |
| 5 | `PoiQuestStep` | `back-link dei POI` | `poi-quest.step.int-spec.ts` |
| 6 | `CityShopStep` | `pool dei negozi` | `city-shop.step.int-spec.ts` |
| 7 | `LoreImagePathStep` | `immagini delle lore` | `lore-image-path.step.int-spec.ts` |
| 8 | `WornEquipmentStep` | `equipaggiamento indossato` | `worn-equipment.step.int-spec.ts` |
| 9 | `SpellStatesStep` | `lista delle magie` | `spell-states.step.spec.ts`, `spell-states.step.int-spec.ts` |

Boot a passi (ordine, formato dei log, passi conclusi nella factory del provider prima di ogni hook, passo fallito che ferma il boot): `src/migrations/model-review/model-review.boot.spec.ts` (rimossa col modulo).

Guardie aggiunte dai fix della review, ognuna con il suo caso nella spec del passo: il flag `active` scritto dal codice nuovo vince sulla lista vecchia (passo 9, C-WR-01); scrittura con il valore letto nel filtro, «cambiato durante il passo» = non applicata e ritentata al boot successivo (passi 2, 4 e 9, C-WR-02); la rinomina dell'equipaggiamento non sovrascrive un campo nuovo già presente (passo 8, C-WR-03); un nemico con una copia non abbinata non viene scritto (passo 2, C-WR-04).

---

## Esito del boot reale (2026-11-11)

Eseguito dall'orchestratore l'11 novembre 2026 sul database dell'utente. Nessun esecutore ha toccato il database reale né il processo: i fatti qui sotto sono quelli riferiti dall'orchestratore.

**Prima di ogni scrittura**

- Processo dell'utente fermato; **nulla in scadenza**: 0 quest avviate, 0 quest pendenti, 0 viaggi attivi, 0 personaggi in attesa di soccorso, 0 recuperi di magie pendenti.
- Backup fuori repo di otto collezioni, prima di ogni scrittura: `enemies`, `pets`, `characters`, `cities`, `lore`, `pointsofinterest`, `spells`, `quests` (le sei del runbook più `spells` e `quests`).
- Prova a secco pulita: le 91 copie di magie incorporate nei nemici tutte identiche al catalogo, nessun personaggio con entrambi i campi dell'equipaggiamento, nessuna debolezza fuori enum.

**Primo boot** — build dalla HEAD della fase `66ff10ec`. Righe, verbatim:

```
debolezze dei nemici: trovati 206, migrati 206, già a posto 0, senza corrispondenza 0
magie dei nemici: trovati 206, migrati 45, già a posto 161, senza corrispondenza 0
catalogo dei pet: trovati 44, migrati 44, già a posto 0, senza corrispondenza 0
pet posseduti: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0
back-link dei POI: trovati 642, migrati 642, già a posto 0, senza corrispondenza 0
pool dei negozi: trovati 167, migrati 167, già a posto 0, senza corrispondenza 0
immagini delle lore: trovati 522, migrati 522, già a posto 0, senza corrispondenza 0
equipaggiamento indossato: trovati 7, migrati 7, già a posto 0, senza corrispondenza 0
lista delle magie: trovati 7, migrati 7, già a posto 0, senza corrispondenza 0
```

Nessuna riga `fallito`, nessun WARN del migratore, nessun WARN «senza pool».

- **Lore, punto aperto «438 oppure 522» chiuso:** tutte e 522 le lore portavano il campo `image`, 438 con valore non nullo → `migrati 522`.
- **Magie, punto aperto «7 oppure 2» chiuso:** tutti e 7 i personaggi portavano i campi vecchi delle liste → `migrati 7`.

**Controllo dopo il boot contro il backup (sola lettura)**

- Nessun campo vecchio rimasto in nessuna delle sei collezioni.
- IDENTICI al backup: debolezze, id delle magie dei nemici, `attack` dei pet = `damages` di prima, basi dei pet, i tre pool del negozio di ogni città, percorsi delle immagini delle lore, slot indossati (stivali passati a `feet` su 2 personaggi), ordine delle magie / insieme delle attive / usi / recuperi di ogni personaggio.
- Ogni altro campo dei personaggi invariato.

**Secondo boot** — tutte e nove le righe con `migrati 0` e `già a posto` = trovati. Processo lasciato in esecuzione.

**Contenuto (D-25..D-28)** — script fuori repo, prova a secco e poi una sola transazione:

- 44 pet con `maxXp` (valori distinti: 100, 150, 300, 400, 450, 500, 600, 800, 900, 1100, 1250, 1500, 2350);
- 44 `defense` non vuote;
- 44 `rarity`: 13 common, 8 uncommon, 8 rare, 12 ultrarare, 3 legendary;
- 44 collegamenti `relatedLore`: 43 a lore esistenti più la lore nuova «Cavallo da viaggio» (tipo `animal`, con `imagePath`);
- 31 legami `Pet.enemy` come ObjectId (13 pet senza un nemico corrispondente);
- «Molosso da guerra» vendibile e aggiunto a `shop.pets` delle 7 città che vendono il Mastino: Fineglen, Shadmus, Cliffbreak, Croce Marina, Valantar, Bellport, Talmvere;
- statistiche a catalogo di «Lupo invernale addestrato» (vita 2300, attacco pierce 900, 90 argento, ultrarare) e di «Scheletro di cavallo da guerra» (vita 3800, attacco blunt 1200 + necrotic 400, ultrarare);
- `imagePath` di «Cavallo da viaggio».

Controllo finale: 0 pet senza difesa, 0 senza rarità, 31 con nemico, 44 con una lore.

**Rimozione del modulo una tantum** — in TDD, dopo il boot e il contenuto:

- RED `c3492ced` `test(migrations): expect the real boot without the model review one-off`: in `test/app.int-spec.ts` i due casi sul modulo montato e sull'ordine del boot sono sostituiti da «does not mount the one-off model review migration (D-12)», rosso finché `AppModule` importa il modulo (90 verdi, 1 rosso);
- GREEN `0822feee` `refactor(migrations): remove the one-off model review migration`: via la cartella `src/migrations/model-review/` (26 file, `legacy-fixtures.ts` e spec comprese), via import e voce in `src/app.module.ts`, via da `test/app.int-spec.ts` sonde, costanti, spia sul log e import di `BullExplorer`;
- dopo la rimozione: `tsc` 0; unit 272 suite / 3497 test; integration 140 suite / 1990 test (blocchi 27 / 494, 29 / 422, 35 / 520, 49 / 554); boot reale di test 91 test; `git diff --exit-code src/schema.gql` 0; `grep -rn "model-review\|ModelReview\|UNA TANTUM (Phase 19" src test` stampa la sola riga del caso nuovo (nome del modulo come stringa, nessun import); il grep dei nomi vecchi senza più l'esclusione della cartella non stampa nulla; `activeSpells` solo sotto `src/quests/outcomes/combat/`, `…/dungeon/` e `…/gm-overrides*`;
- nessuna spec che resta usava i builder della cartella rimossa (`spell-state.migrator.int-spec.ts` era già indipendente);
- coverage per cartella rimisurata (statements / branches / lines): `./src/characters/spells/` 99,11 / 89,1 / 99,33 (soglie 97 / 88 / 97); `./src/travel/` 98,57 / 84,55 / 99,34 (soglie 97 / 84 / 98). `npm run test:cov` lo rilancia l'orchestratore.

**Ancora da fare, a cura dell'orchestratore:** il **terzo boot reale** dalla build dopo la rimozione (nessuna riga `Revisione dei modelli, …`). Il processo oggi in esecuzione viene dalla build di `66ff10ec`, che contiene ancora il modulo: è innocuo (secondo boot a zero), ma la prova del terzo boot arriva al prossimo riavvio dalla HEAD.

**Nota d'ambiente** (preesistente, non di questa fase): a entrambi i boot il Redis locale non era raggiungibile (`ECONNREFUSED`); gli scheduler hanno loggato il ripiego («lo sweep copre»).

**Per la FE:** il BE su questa macchina gira col codice della Phase 19, coi dati migrati e col contenuto dei pet. I piani gated possono partire appena la PR #33 è mergiata su `develop` (gate sullo SDL di `origin/develop`, in testa a questo documento).

---

## 3. Runbook del boot reale e note per la UAT — ESEGUITO l'11 novembre 2026

**Runbook ESEGUITO dall'orchestratore l'11 novembre 2026** (esito nella sezione qui sopra; ogni passo porta il suo segno). Nessun esecutore ha toccato il database reale né il processo. Il testo dei passi resta come registro di ciò che era previsto.

Regole in evidenza:

- «**mai codice pre-19 sul database migrato**»: il vecchio migratore delle magie (Phase 9.1, prima del piano 19-18) ricostruisce gli stati dalla lista dei conosciuti, che il passo 9 toglie: vedrebbe «nessuna magia conosciuta» e azzererebbe `spellStates`. **Il ritorno indietro è SOLO il ripristino del backup**, mai un checkout di `develop` di oggi sul database migrato.
- «**build SOLO dalla HEAD della fase**»: mai da un commit intermedio (fra 19-17 e 19-19 il passo una tantum delle magie e la riparazione permanente coesistono e sono incompatibili; il migratore permanente ridotto al taglio e il passo 9 devono partire insieme).
- «il passo dei pet crea `defense` vuota: la difesa la scrive lo script di contenuto dell'orchestratore in questa fase» (D-25).
- **Ordine del boot** (review C-CR-01): i nove passi girano dentro la factory asincrona di un provider (`modelReviewBootProvider` in `model-review.boot.ts`) e finiscono **prima di OGNI lifecycle hook**: prima dei processor Bull, degli sweep di quest, viaggi, imboscate e recupero, del taglio di `SpellStateMigrator`, dei verifier degli indici e di `ShopBoot`, e prima che HTTP e WS ascoltino. Nessun processor, sweep o listener vede dati non migrati. Il boot si fa comunque **a client fermi** e senza un secondo BE sullo stesso database.
- **Il WARN «167 senza pool» di `ShopBoot` NON è più atteso al primo boot:** `ShopBoot` gira dopo il passo 6. Se compare, il passo dei pool non ha scritto.
- «**un passo fallito ferma il processo**» (review C-WR-05): uscita 1, HTTP e WS mai aperti, nessun hook. I passi prima di quello fallito restano applicati (sono idempotenti), quelli dopo non partono: si corregge la causa (o si ripristina il backup) e **si ripete semplicemente il boot**; le righe dei passi già fatti diranno `migrati 0`. Righe e dettagli al passo 4.
- **Il controllo «nulla in scadenza» prima del boot resta** (passo 3), come difesa in profondità: l'ordine del boot è provato dai test, non ancora sui dati reali.

### Passo 1 — fermare tutto — ESEGUITO

Fermare il processo BE dell'utente (gira da `dist/` di QUESTO stesso albero: la build cancella `dist/`) e ogni client (app sul device, secondo BE). Build prima dello stop, come nelle fasi precedenti, se il processo va tenuto vivo fino all'ultimo.

### Passo 2 — backup — ESEGUITO

Backup delle sei collezioni toccate: `enemies`, `pets`, `characters`, `cities`, `lore`, `pointsofinterest`. **Fatto fuori repo prima di ogni scrittura, con in più `spells` e `quests` (otto collezioni).**

### Passo 3 — prova a secco (sola lettura) — ESEGUITO, pulita

Conteggi di ogni guardia (il numero di documenti che il passo scriverà = `migrati` atteso):

| Passo | Guardia da contare prima del boot | Atteso |
|-------|-----------------------------------|--------|
| 1 | nemici senza `weaknesses` | 206 |
| 2 | nemici con almeno un elemento di tipo oggetto in `spells` | 45 (91 copie, tutte abbinabili per `_id`) |
| 3 | pet con `damages`, `xp` o `currentLifePoints` presenti | 44 |
| 4 | personaggi con almeno un elemento di `assets.ownedPets` di tipo ObjectId o stringa | 0 |
| 5 | POI con il campo `quest` presente (anche nullo) | 642 |
| 6 | città con almeno uno dei tre campi vecchi del pool presente | 167 |
| 7 | lore con `image` **esistente** (anche nullo) e `imagePath` non esistente | **522** (verificato al boot reale: tutte le lore portavano `image`, 438 con valore non nullo) |
| 8 | personaggi con `assets.wearedEquipment` presente | 7 |
| 9 | personaggi con `status.spells` o `assets.activeSpells` **presenti** (anche vuoti) | **7** (verificato al boot reale: tutti i personaggi portavano i campi vecchi) |

Controlli in più (Domanda aperta 8 della ricerca e note degli esecutori):

- **valori di debolezza fuori dai due enum = 0** (`blunt`, `cut`, `pierce`; gli undici di `EnergyType`): il passo li copia e li conta in «senza corrispondenza», non li corregge;
- **valori legacy non-lista = 0**: `energyWeaknesses` / `baseWeaknesses` salvati come stringa o altro tipo non-lista verrebbero copiati tali e quali e NON contati (19-02); lo stesso controllo del tipo su `status.spells`, `assets.activeSpells` e sui tre array del pool;
- copie di magie non abbinabili = 0; nomi duplicati nel catalogo delle 96 magie = 0 (un nemico con anche una sola copia non abbinata o ambigua non viene scritto: le sue copie restano e il nemico ricompare a ogni boot finché non lo si cura — review C-WR-04);
- pet con `damages` nullo o assente = 0; pet con `maxLifePoints` non intero = 0;
- città con solo una o due delle tre liste: contarle (il passo rinomina quello che c'è; una lista assente resta assente);
- **lore: due numeri distinti** — documenti con `image` esistente e documenti con `image` non nullo; lore con entrambi i campi = 0;
- **personaggi con ENTRAMBI i campi dell'equipaggiamento (`assets.wearedEquipment` e `assets.wornEquipment`) = 0**: un personaggio con entrambi i campi NON viene sovrascritto né toccato (review C-WR-03), conta in «senza corrispondenza» e ricompare a ogni boot finché non lo si cura a mano; il controllo resta utile ma non è più distruttivo se fallisce; personaggi con `assets.wearedEquipment.foots` non nullo = 2 (annotare `<characterId>` e id dell'oggetto per il confronto dopo il boot);
- pet posseduti orfani = 0; `assets.pet` non presente in `ownedPets` = 0;
- equipaggiate di magie non conosciute = 0; conflitti di usi fra voce ed equipaggiata = 0; `status.maxActiveSpells` persistito = 0; magie attive in tutto = 3;
- versione del server ≥ 4.2 (scritture a pipeline; l'inventario dice 8.0.37);
- **«nulla in scadenza» = 0** (review C-CR-01 e B-WR-01, difesa in profondità), da contare PRIMA di fermare il processo pre-19: se qualcosa è in scadenza lo si lascia risolvere al processo pre-19 e solo dopo lo si ferma. In Mongo, per ogni personaggio non archiviato: nessuna quest in corsia con risoluzione scaduta o nei prossimi minuti, nessun `status.activeTravel` con `endTime` entro adesso più un margine, nessuna imboscata pendente sul viaggio, nessun `awaitingAid` vicino al timeout, nessun party in formazione vicino alla scadenza. In Redis: nessun job in attesa o ritardato già dovuto nelle code di risoluzione delle quest e dei viaggi. **Controllo come eseguito l'11 novembre 2026, a processo fermo:** 0 quest avviate, 0 quest pendenti, 0 viaggi attivi, 0 personaggi in attesa di soccorso, 0 recuperi di magie pendenti. Con zero ovunque nessun margine in minuti è servito.

### Passo 4 — build dalla HEAD della fase e PRIMO boot — ESEGUITO (HEAD `66ff10ec`)

Build SOLO dalla HEAD della fase, poi il boot. Nove righe attese, nell'ordine, formato `Revisione dei modelli, <label>: trovati N, migrati N, già a posto N, senza corrispondenza N`; **nessuna riga `fallito`** e nessuna riga WARN di dettaglio. Le nove righe escono durante la creazione dei provider, prima di ogni `onModuleInit`; in caso di successo non c'è alcuna riga di riepilogo.

**Un passo fallito ferma il processo** (uscita 1, HTTP e WS mai aperti, nessun hook parte). Due righe a livello ERROR, poi l'errore stampato da Nest:

```
Revisione dei modelli, <label>: fallito (<NomeErrore>, code <N>), il boot si ferma
Revisione dei modelli, boot interrotto: passi conclusi <K> su 9, fallito «<label>», non eseguiti <M>
Revisione dei modelli: boot interrotto dal passo «<label>»
```

I passi prima di quello fallito restano applicati (idempotenti), quelli dopo non sono partiti: correggere la causa o ripristinare il backup, poi ripetere il boot (le righe dei passi già fatti diranno `migrati 0`). L'errore rilanciato è nuovo e senza causa: lo stack stampato da Nest non porta quello del driver.

Righe WARN di dettaglio (nessuna è attesa sui dati reali; testo dopo i fix della review):

```
Revisione dei modelli, lista delle magie: personaggio <id>, usi in conflitto N, equipaggiate non conosciute N [<idMagia>, …], stati lasciati fuori N [<idMagia>, …]
Revisione dei modelli, magie dei nemici: copia senza corrispondenza «<nome>» sul nemico <id>: nemico non scritto, le copie restano
Revisione dei modelli, <label>: personaggio|nemico <id> cambiato durante il passo, scrittura non applicata: si ritenta al prossimo boot
```

Nella prima una voce senza riferimento leggibile compare come `<senza riferimento>`; la terza può uscire dai passi «magie dei nemici», «pet posseduti» e «lista delle magie» e NON ferma il boot. **Con «senza corrispondenza» ≠ 0 su una riga non aprire ai client:** riavviare e rileggere la riga del passo a `senza corrispondenza 0` (per un nemico con copia non abbinata o un personaggio con entrambi i campi dell'equipaggiamento serve prima la cura a mano).

Tabella dei conteggi (inventario dell'11 novembre 2026):

| Passo | trovati | migrati | già a posto | senza corrispondenza |
|-------|---------|---------|-------------|----------------------|
| debolezze dei nemici | 206 | 206 | 0 | 0 |
| magie dei nemici | 206 | 45 | 161 | 0 |
| catalogo dei pet | 44 | 44 | 0 | 0 |
| pet posseduti | 7 | 0 | 7 | 0 |
| back-link dei POI | 642 | 642 | 0 | 0 |
| pool dei negozi | 167 | 167 | 0 | 0 |
| immagini delle lore | 522 | 522 (reale: le altre 84 avevano `image: null`) | 0 | 0 |
| equipaggiamento indossato | 7 | 7 | 0 | 0 |
| lista delle magie | 7 | 7 (reale: i campi vecchi esistevano su tutti) | 0 | 0 |

Sui dati dell'inventario i fix della review non cambiano i numeri attesi; cambia il significato dei conteggi nei casi anomali:

- **magie dei nemici:** un nemico con una copia non abbinata non è né migrato né già a posto, ogni sua copia non abbinata conta in «senza corrispondenza» e il nemico ricompare con gli stessi numeri a ogni boot finché non lo si cura;
- **equipaggiamento indossato:** un personaggio con entrambi i campi conta in «senza corrispondenza», non è sovrascritto e ricompare a ogni boot finché non lo si cura a mano;
- **lista delle magie:** una voce con `active` booleano fuori da `status.spells` resta nella lista (in coda) e non conta in «stati lasciati fuori»;
- **lista delle magie, pet posseduti, magie dei nemici:** una scrittura non applicata (documento cambiato fra lettura e scrittura) conta 1 in «senza corrispondenza», non è né migrata né già a posto e si ritenta al boot successivo.

Righe del PRIMO boot (le nove righe reali dell'11 novembre 2026 coincidono con queste):

```
Revisione dei modelli, debolezze dei nemici: trovati 206, migrati 206, già a posto 0, senza corrispondenza 0
Revisione dei modelli, magie dei nemici: trovati 206, migrati 45, già a posto 161, senza corrispondenza 0
Revisione dei modelli, catalogo dei pet: trovati 44, migrati 44, già a posto 0, senza corrispondenza 0
Revisione dei modelli, pet posseduti: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0
Revisione dei modelli, back-link dei POI: trovati 642, migrati 642, già a posto 0, senza corrispondenza 0
Revisione dei modelli, pool dei negozi: trovati 167, migrati 167, già a posto 0, senza corrispondenza 0
Revisione dei modelli, immagini delle lore: trovati 522, migrati 522, già a posto 0, senza corrispondenza 0
Revisione dei modelli, equipaggiamento indossato: trovati 7, migrati 7, già a posto 0, senza corrispondenza 0
Revisione dei modelli, lista delle magie: trovati 7, migrati 7, già a posto 0, senza corrispondenza 0
```

**Verificato al boot reale** (i due punti segnalati dagli esecutori dei piani 19-14 e 19-17): la settima riga è `migrati 522, già a posto 0` (il passo conta il campo esistente, anche nullo; i 438 dell'inventario erano le sole lore con un valore); la nona è `migrati 7, già a posto 0` (tutti e 7 i personaggi avevano ancora i campi vecchi).

Verifiche dopo il primo boot (**fatte contro il backup, in sola lettura: tutto identico**, dettaglio nell'esito):

- nemici: tutti con `weaknesses`, nessuno coi due campi vecchi; 56 con almeno una debolezza (5 con entrambe, 51 solo energia); `spells` di soli ObjectId, stesso numero di magie di prima (91 su 45 nemici);
- pet: `attack` uguale ai danni del backup, `defense` vuota su tutti e 44, nessuno dei tre campi vecchi;
- POI: campo `quest` presente su 0;
- città: 0 coi campi vecchi, 167 con `shop`, le tre liste uguali (stessi id, stesso ordine, vuote comprese) ai tre array del backup; **la riga del report dei negozi** (`Negozi: … città con pool fuori regola, … senza pool`) dà gli stessi conteggi di prima della migrazione;
- lore: `image` esistente su 0; `imagePath` di ogni lore = `image` del backup (nullo compreso); 438 con `imagePath` non nullo;
- personaggi: `assets.wearedEquipment` su 0, `assets.wornEquipment` su 7, `assets.wornEquipment.feet` non nullo su 2 con gli stessi id annotati, nessuna chiave `foots`, gli altri otto slot identici al backup; `status.spells` e `assets.activeSpells` su 0; 3 voci con `active: true` in tutto; somma delle voci = somma delle conosciute di prima.

### Passo 5 — SECONDO boot — ESEGUITO (nove righe a `migrati 0`)

Nove righe con `migrati 0`:

```
Revisione dei modelli, debolezze dei nemici: trovati 206, migrati 0, già a posto 206, senza corrispondenza 0
Revisione dei modelli, magie dei nemici: trovati 206, migrati 0, già a posto 206, senza corrispondenza 0
Revisione dei modelli, catalogo dei pet: trovati 44, migrati 0, già a posto 44, senza corrispondenza 0
Revisione dei modelli, pet posseduti: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0
Revisione dei modelli, back-link dei POI: trovati 642, migrati 0, già a posto 642, senza corrispondenza 0
Revisione dei modelli, pool dei negozi: trovati 167, migrati 0, già a posto 167, senza corrispondenza 0
Revisione dei modelli, immagini delle lore: trovati 522, migrati 0, già a posto 522, senza corrispondenza 0
Revisione dei modelli, equipaggiamento indossato: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0
Revisione dei modelli, lista delle magie: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0
```

### Passo 6 — contenuto dentro la fase (D-25, D-26, D-27, D-28) — ESEGUITO

Script dell'orchestratore **FUORI repo** (D-36: nessun sorgente né file di contenuto qui), con prova a secco e applicazione dopo la revisione dell'utente sulla proposta. Cosa scrivere e cosa verificare:

| Contenuto | Regola | Verifica dopo lo script |
|-----------|--------|-------------------------|
| `maxXp` dei 44 pet | tabella di D-05 (da 100 a 2350) | 44 pet con `maxXp` intero > 0 e uguale alla tabella approvata |
| `defense` dei 44 pet | D-25: tipi dalla lore, potenza = `maxXp` × robustezza arrotondata a 50, divisa fra i tipi | **44 pet con `defense` non vuota** (almeno una voce in `base` o in `energy`), forma `{ base: [{ type, power }], energy: [{ type, power }] }` |
| `rarity` dei 44 pet | tabella approvata di D-27 | 44 pet con `rarity` valorizzata; **solo i cinque nomi dell'enum** (`common`, `uncommon`, `rare`, `ultrarare`, `legendary`), nessun valore fuori enum (arriverebbe `null` sul filo) |
| `relatedLore` dei 44 pet | D-26: 43 a lore esistenti (36 omonime, 7 alla lore dell'animale) + la lore nuova «Cavallo da viaggio» | 44 pet con almeno una lore; ogni id esiste nella collezione `lore`; scritti come ObjectId |
| lore nuova «Cavallo da viaggio» | tipo `animal`, scritta col campo `imagePath` (mai `image`) | 523 lore; la lore nuova ha `imagePath` e nessun campo `image` |
| `Pet.enemy` | D-28: 31 pet collegati al nemico corrispondente | **31 pet con `enemy` come ObjectId vero, 13 con `enemy` nullo; nessun orfano** (ogni `enemy` esiste fra i nemici) |
| «Molosso da guerra» | D-27: vendibile, `uncommon` | `sellable: true`; presente in `shop.pets` (non più nel campo sciolto) delle città che vendono già il Mastino; nessun'altra città toccata |
| «Lupo invernale addestrato» | statistiche a catalogo riviste | valori della proposta approvata, rarità coerente con la fascia |
| «Scheletro di cavallo da guerra» | `ultrarare` (ultima parola dell'utente) con le statistiche portate nella fascia | `rarity: ultrarare`, `maxXp` ≤ 1250 e statistiche della proposta approvata |
| «Cavallo da viaggio» | `imagePath` | `imagePath` valorizzato sul pet e sulla sua lore nuova |

Conteggi finali dopo l'applicazione (11 novembre 2026, una transazione dopo la prova a secco): `maxXp` 44 / `defense` 44 / `rarity` 44 (13 common, 8 uncommon, 8 rare, 12 ultrarare, 3 legendary) / `relatedLore` 44 + 1 lore nuova / `enemy` 31 (13 senza nemico corrispondente). Controllo finale: 0 pet senza difesa, 0 senza rarità, 31 con nemico, 44 con una lore.

Note del codice per lo script:

- `relatedLore` e `enemy` sono nel registro permanente dei ref: vanno scritti come **ObjectId veri** (una stringa esadecimale è letta comunque da negozio, premio e generatore, ma il verificatore dei ref al boot la segnalerebbe);
- il passo 3 rispetta un `attack` o una `defense` già scritti a mano («la mano vince»): l'ordine «boot, poi contenuto» resta quello previsto;
- **finché le rarità non sono a DB nessuna quest generata offre un pet** (fail-safe voluto): un pet senza `rarity` non è mai candidato, qualunque sia il legame;
- la zona di un pet è quella del NEMICO collegato (`Enemy.locations`), leggendari compresi; un pet senza legame può uscire solo nella terza fascia, e solo con `sellable` uguale a `false` (assente o nullo non basta); un pet `legendary` può uscire SOLO dalle quest generate `boss` di rango hero (l'unico pool di loot con uno slot `legendary`; D-28 emendata dal ruling dell'utente del 2026-11-12, «Sì dai boss hero»), nelle tre fasce; mai dalle `enemy` né dagli altri ranghi;
- la fascia «zona» è un'inclusione semplice del tipo del POI della quest fra le `locations` del nemico collegato (D-28 alla lettera, review A-IN-03): un pet il cui nemico vive solo in `city` o `all` non è mai candidato di zona, a differenza della nozione di «dintorni» del generatore dei nemici. Da sapere quando si curano i legami `Pet.enemy`;
- i pet già posseduti prima dei collegamenti non ricevono le lore a posteriori (a DB oggi nessun personaggio possiede pet);
- le quest già a tabellone non cambiano: il premio nasce alla generazione.

### Passo 7 — rimozione del modulo in TDD (RESEARCH M-5) — ESEGUITO (commit `c3492ced`, `0822feee`); terzo boot reale ancora da fare

**Come è andata rispetto al testo qui sotto:** per indicazione dell'orchestratore il caso nuovo si chiama «does not mount the one-off model review migration (D-12)» e il commit GREEN `refactor(migrations): remove the one-off model review migration` (non i due nomi scritti ai punti 1 e 2); i numeri di riga erano quelli previsti. Punti 1, 2, 3 e 5 fatti; **punto 4 (terzo boot reale) aperto**, a cura dell'orchestratore al prossimo riavvio dalla HEAD.

1. **RED** in `test/app.int-spec.ts`: i due casi alle righe 992-1010 — «mounts the one-off model review migration at boot (D-12)» e «ends the one-off model review steps before any lifecycle hook runs (D-12)» — sono sostituiti da un solo caso «boots without the one-off model review migration (19 D-12)» (`ModulesContainer` senza `ModelReviewMigrationModule`). Dallo stesso file esce tutto quello che serve solo al migratore (numeri di riga alla HEAD dopo i fix della review, da ricontrollare se il file cambia):
   - riga 2: import di `BullExplorer` (`@nestjs/bull/dist/bull.explorer`), usato solo dalle sonde;
   - riga 59: import di `ModelReviewBoot` (`src/migrations/model-review/model-review.boot`);
   - righe 146-163: costanti `MODEL_REVIEW_PREFIX` e `MODEL_REVIEW_STEP_LINES`, tipo `LifecycleHook`;
   - righe 264-286: `logSpy`, `modelReviewLinesSeenBy`, `modelReviewLinesSoFar`, `probeLifecycleHook`;
   - righe 291-300: la spia sul log e le tre sonde in `beforeAll`.
   **Restano:** gli import di `SpellStateMigrator` (riga 48) e `QuestResolutionSweeper` (riga 52), usati da altri casi (righe 965 e 1112), e `jest.restoreAllMocks()` in `afterAll` (riga 307). Commit `test(migrations): …`.
2. **GREEN** `refactor(migrations): drop the 19 one-off model review after its run`. Cosa cancellare:
   - l'intera cartella `src/migrations/model-review/` (26 file): `model-review.module.ts`, `model-review.boot.ts`, `model-review.boot.spec.ts`, `model-review.step.ts` (contratto), `legacy-fixtures.ts`; i nove passi `enemy-weaknesses.step.ts`, `enemy-spells.step.ts`, `pet-catalog.step.ts`, `owned-pets.step.ts`, `poi-quest.step.ts`, `city-shop.step.ts`, `lore-image-path.step.ts`, `worn-equipment.step.ts`, `spell-states.step.ts`; le nove int-spec `*.step.int-spec.ts`; le tre unit `enemy-spells.step.spec.ts`, `owned-pets.step.spec.ts`, `spell-states.step.spec.ts`;
   - in `src/app.module.ts` la riga 29 (import di `ModelReviewMigrationModule`) e le righe 117-118 (il commento «revisione dei modelli una tantum (Phase 19 D-12): esce dal repo dopo il boot reale» e la voce in `imports`).
   Nessun codice che resta dipende dalla cartella (verificato nel gate e nella verifica): la dipendenza è in un solo verso (i passi importano `owned-pet-entry`, `mongo/document-id`, `mongo/mongo-errors` e i modelli, che restano); nessuna soglia di coverage in `package.json` nomina la cartella.
   **Le suite scendono di conseguenza:** unit 276 → 272 suite (via la spec del boot e le tre unit dei passi), integration 149 → 140 suite (via le nove int-spec dei passi), boot reale 92 → 91 test (due casi sostituiti da uno). **Numeri reali dopo la rimozione:** unit 272 suite / 3497 test (da 276 / 3534); integration 140 suite / 1990 test (da 149 / 2050; blocchi 27 / 494, 29 / 422, 35 / 520, 49 / 554); boot reale di test 91 test.
3. `npx tsc --noEmit -p tsconfig.json` 0, boot reale di test verde, `git diff --exit-code src/schema.gql` 0; dopo la rimozione `grep -rnwE 'energyWeaknesses|baseWeaknesses|wearedEquipment|foots|shopEquipment|shopLoot|shopPets' src test --include='*.ts'` non stampa nulla.
4. **Terzo boot reale** senza le righe `Revisione dei modelli, …`.
5. Chiusura dei requisiti rimasti aperti (§4) e riga di stato in ROADMAP, STATE e REQUIREMENTS.

### Passo 8 — PR e FE — a cura dell'orchestratore (PR #33 fuori dal draft dopo la rimozione)

PR fuori dal draft e merge verso `develop`; poi i piani gated della FE Phase 19 (gate sullo SDL di `origin/develop`, in testa a questo documento).

### Note per la UAT della FE

- **Identità di test:** bypass dev con un `<twitchId di test>`; nessun valore reale in questo documento.
- **Pet con lore:** comprare un pet in una città che lo ha in `shop.pets` → la voce compare in `ownedPets` con `xp` 0 e vita piena, e le lore del pet entrano in `unlockedLore` (visibili in Biblioteca) senza altre azioni. Serve il contenuto del passo 6 (collegamenti alle lore).
- **Xp al compagno:** equipaggiare il pet (`equipPet` con `<petId>`), vincere una quest con nemici → `petXpGained` sul foglio e `xp` della voce del compagno salito del 10 % degli xp dei nemici (arrotondato; con nemici da pochi xp la quota può essere 0 o 1). In sconfitta, senza nemici o senza compagno: 0. Per un'imboscata vinta il valore compare sul foglio dell'imboscata all'arrivo.
- **Slot `feet`:** equipaggiare un oggetto ai piedi dal Diario; i 2 personaggi con lo slot valorizzato prima del boot devono mostrarlo ancora.
- **Sezione Magie:** equipaggiare e togliere una magia cambia il flag `active` della voce; l'ordine delle equipaggiate è quello di apprendimento; una magia imparata con una `study` arriva non equipaggiata (`<spellId>` in coda alla lista).
- **Rarità sul compagno:** visibile dopo il passo 6; prima è `null` su tutti i pet.
- **Pet in premio:** dopo il passo 6 una quest generata `enemy` o `boss` può portare `prizes.pet`; solo le quest generate DOPO il contenuto.

---

## 4. Domande aperte e deviazioni

### Stato dei requisiti

- **Chiusi dal codice in questo piano:** BE-MODEL-01, BE-MODEL-02, BE-MODEL-03, BE-MODEL-05, BE-MODEL-06, BE-MODEL-07, BE-MODEL-08.
- **Chiusi l'11 novembre 2026** dal boot reale, dallo script di contenuto e dalla rimozione del modulo:
  - **BE-MODEL-09** — boot reale col migratore (primo boot coi conteggi attesi, secondo a zero) e modulo rimosso in TDD (`c3492ced`, `0822feee`);
  - **BE-MODEL-04** — `maxXp` dei 44 pet a DB;
  - **BE-MODEL-10** — 44 pet collegati alle lore, lore nuova «Cavallo da viaggio»;
  - **BE-MODEL-11** — 44 rarità, Molosso vendibile, Scheletro `ultrarare`;
  - **BE-MODEL-12** — 31 legami pet → nemico come ObjectId.
- **Nessun requisito della fase resta aperto.** Resta un solo passo operativo: il terzo boot reale dalla build dopo la rimozione.

### Domande e osservazioni per l'utente

1. **CHIUSA — difetto latente preesistente: `cities { pointsOfInterest { id } }`** (19-12). Corretto nella review (C-WR-06, commit `e7a5a4ed`): `CitiesService.findAll` popola con `cityRelations()` (una query in più per tutti i POI, nessun N+1), con un caso sul filo in `src/cities/cities.resolver.int-spec.ts`. **Resta aperto** (fuori dal ruling): `pointsOfInterest { city { id } }` a profondità 2 non è popolato; la FE non lo seleziona. Vale una regola o resta così?
2. **Sorteggio della lore di studio** (19-11): esclude le lore già note e quelle della vittoria, non quelle del pet vinto nello stesso esito. Se coincidono la lista finale non ha doppioni, ma il tiro dello studio è «speso» su una lore che il pet avrebbe dato comunque. Caso raro (study con pet in premio): vale una regola?
3. **CHIUSA — ciclo d'import `generated-prizes.ts` ↔ `pet-prize.ts`** (19-22). Sciolto nella review (A-IN-01, commit `7df00338`): tabelle e primitive del loot nel modulo foglia `src/quests/generation/loot-pools.ts`; `pet-prize.ts` non importa più da `generated-prizes.ts`, che riesporta i nomi per gli importatori esistenti.
4. **Int-spec instabile «real Redis»** (19-19): `src/quests/outcomes/quest-resolution.processor.int-spec.ts` è fallita per intero una volta su una corsa completa di `src/quests` e mai più (verde anche nel gate). Usa il Redis locale vero, lo stesso del processo BE dell'utente: possibile contesa sui job.
5. **Subject di 74 caratteri** in `00bd8556` (`refactor(models): drop the empty enum file and the dead notification model`, 19-14): oltre il limite di 72, non correggibile senza riscrivere la storia. È l'unico della fase. L'orchestratore decide se lasciarlo.
6. **CHIUSA — nomi vecchi nella sezione generata del `CLAUDE.md` del BE** («Conventions»: `wearedEquipment` e `activeSpells` fra gli esempi di naming). Corretti nel commit `e67d36a1` (`docs(claude): align the naming examples with the reviewed models`).
7. **Zona della fascia dei pet per inclusione semplice** (review A-IN-03, chiusa per ruling come D-28 alla lettera): la fascia «zona» guarda solo se il tipo del POI della quest è fra le `locations` del nemico collegato; per i nemici il generatore intende «nei dintorni» in modo più largo (tipi del POI più l'habitat `city`, `all` come ripiego). Un pet il cui nemico vive in `city` o `all` non è mai candidato di zona. Resta così o si allinea alle due nozioni?

### Deviazioni della fase (dai SUMMARY)

- **Ordine reale dei blocchi SDL:** alfabetico come atteso (Assumption A1 confermata in ogni piano); i valori di `EnergyType` e `RarityType` sono in ordine alfabetico, non in quello dell'enum TypeScript.
- **Casi verdi al primo colpo:** annotati piano per piano col motivo (pin d'integrazione scritti dopo il GREEN, casi che pinnano l'assenza di un effetto).
- **Rosso noto fra 19-05 e 19-06:** 18 int-spec degli scrittori dei pet rosse dopo il cambio del modello, chiuse dal 19-06 (negozio e pet in premio scrivono voci intere). Altri intervalli con suite parzialmente rosse, senza amend possibile: `ba8ad371`..`dbd0f77a` (due unit dei populate, 19-03) e `b6d1bd3c`..`03660ed5` (quattro int-spec di `src/quests/outcomes`, 19-17). Da sapere per un eventuale bisect.
- **Rinomina del file enum** (19-14): `git mv` e i dieci percorsi d'import nello stesso commit (rename al 100 %), poi il commit `style`, per ruling dell'orchestratore.
- **Registro dei ref:** 34 → 35 (`pets:relatedLore`) → 34 (via il back-link dei POI) → 32 (via le due liste di magie) → **33 in 11 collection** (`pets:enemy`).
- **Attesi a seme fisso** (19-22): un tiro in più per ogni quest generata `enemy`; l'unico caso toccato è `keeps generated quests on the board with no expiry (D-14)` in `test/quests/quest-generation.e2e.int-spec.ts`, che ora sceglie la città dalla prima quest generata.
- **Taglio dei task del 19-19:** il contesto di combattimento è passato alle voci attive nello stesso commit dei piani d'esito (i due pezzi non si potevano committare verdi separatamente).
- **Coverage misurata nel gate** (statements / branches / lines, soglia fra parentesi): `./src/characters/spells/` 99,11 / 89,1 / 99,33 (97 / 88 / 97); `./src/characters/characters.service.ts` 98,44 / 91,37 / 100 (96 / 88 / 98); `./src/characters/equipment/` 100 / 100 / 100 (98 / 98 / 98); `./src/economy/` 100 / 94,68 / 100 (98 / 91 / 98); `./src/shops/` 100 / 83,6 / 100 (97 / 82 / 98); `./src/travel/` 98,57 / 84,55 / 99,34 (97 / 84 / 98); `./src/quests/generation/` 99,11 / 88,92 / 99,66 (96 / 82 / 97). Il margine più stretto è sui rami di `./src/travel/` (84,55 contro 84): la misura per cartella esegue meno spec della suite completa, quindi `test:cov` può solo dare di più.
- **Trappola di glob per il passo 7:** `ls src/migrations/model-review/*.step.ts` stampa 10 file, non 9 (il contratto `model-review.step.ts` ha lo stesso suffisso); i passi sono nove, come le voci di `STEPS`.
