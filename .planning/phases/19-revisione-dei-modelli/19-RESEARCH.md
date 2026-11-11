# Phase 19: Revisione dei modelli - Research

**Researched:** 2026-11-11
**Domain:** NestJS 11 + Mongoose 8.18.1 + Apollo code-first (`@nestjs/graphql` 13.2.0, graphql 16.11.0), Jest 30 su `MongoMemoryReplSet`. Rinomina e ristrutturazione di campi Mongoose con SDL non additivo, migratore one-off al boot col driver nativo, stato dei pet sul personaggio, unica lista delle magie
**Confidence:** HIGH sul codice (tutto letto sul branch `feat/19-revisione-dei-modelli`, conteggi da `grep`) e sui meccanismi di Mongoose/MongoDB (una probe eseguita su `mongodb-memory-server`, MongoDB 8.2.6, fuori dal repo); MEDIUM sui dati reali (nessuna lettura del database: valgono i conteggi del CONTEXT del 2026-11-09, i controlli freschi sono nelle Domande aperte)

## Summary

Nessuna libreria nuova, nessuna variabile d'ambiente. La fase è una serie di rinomine e ristrutturazioni dove il rischio non sta nel codice nuovo ma in ciò che **già esiste e legge i nomi vecchi senza che il compilatore lo veda**: gli snapshot lean sono tipizzati con campi opzionali (`spells?: unknown[]`, `activeSpells?: …`), i path sono stringhe (`'assets.wearedEquipment.${slot}'`), le pipeline sono documenti Mongo. `tsc` resta verde anche con un lettore dimenticato: la rete sono le spec.

Dieci fatti verificati che cambiano il modo di pianificare:

1. **Il migratore permanente `SpellStateMigrator` (Phase 9.1) cancellerebbe tutte le magie dopo D-07.** La sua pipeline di riparazione ricostruisce `status.spellStates` mappando `status.spells` (`src/characters/spells/spell-state.migration.ts:165-218`) e gira a ogni boot e **prima di ogni credito di recupero** (`spell-recovery.service.ts:48, 80`). Con `status.spells` e `assets.activeSpells` tolti, ogni personaggio risulta «incoerente» (`spellStatesConsistentExpr`, righe 110-150) e la riparazione scrive `spellStates: []`. Va ridotto al solo taglio degli istanti **nello stesso piano** che sposta gli scrittori, e il taglio va corretto perché oggi ricostruisce la voce con tre campi e perderebbe `active` (righe 258-266). Conseguenza per il runbook: **mai avviare codice precedente alla 19 su un database migrato** (il processo dell'utente da `dist/` di `develop` va fermato prima del boot reale; il ritorno indietro è solo il ripristino del dump).
2. **`maxActiveSpells` non ha già oggi nessun `@Prop`**: è una virtual di Mongoose (`src/models/character/character-status.model.ts:104-116`). D-08 lato Mongoose è già vero; resta solo il passaggio da virtual a resolve field (precedente puro sul genitore: `src/cities/cities.resolver.ts:23-28`).
3. **Mongoose scarta in silenzio gli operatori sui path fuori schema.** Probe: `Model.updateMany` con l'operatore di rimozione o di rinomina su un campo non dichiarato risponde `{ acknowledged: false }` e non scrive nulla; `Model.create` con la forma vecchia perde i campi vecchi. Il migratore e le fixture nella forma vecchia passano **solo dal driver nativo** (`model.collection`), come nel precedente 16-10.
4. **`SlotType` contiene `foots`** (`src/models/enums/slot_type.enum.ts:12`, `src/schema.gql:775`) ed è l'argomento di `equipItem` (`input EquipItemRequest { slotType: SlotType! }`, `src/schema.gql:265-269`): il valore `foots` sul filo diventa `feet`. È l'unico argomento che porta un nome tolto.
5. **Nessuno degli input «admin» è nello SDL**: `EnemyInput`, `PetInput`, `LoreInput`, `EquipmentInput`, `CharacterAssetsInput`, `CharacterStatusInput`, `ActiveSpellInput`, `CityInput` non compaiono in `src/schema.gql` (20 input, tutti `*Request`/`*Input` di mutation vive). `WeaknessesInput` sarà una classe senza superficie. **`PointOfInterestInput` non esiste** (il CONTEXT lo nomina: `src/models/point-of-interest.model.ts` non ha `@InputType`).
6. **`item_reference_type.enum.ts` è un file vuoto (0 byte) senza importatori**: il tipo `ItemReferenceType` vive in `src/models/common/asset-quantity.model.ts:10`. Rinominarlo conserva un file vuoto: va cancellato (Domanda aperta 2).
7. **L'imboscata produce un `QuestResult`, ma differito**: la vittoria scrive un report trattenuto in `status.activeTravel.ambushReports` (`ambush-plan.ts:259`, sotto-schema `AmbushReportSnapshot`) e il risultato `kind: ambush` nasce all'arrivo (`ambush-results.ts:59-98`). `petXpGained` deve quindi viaggiare sul report trattenuto (un `@Prop` nuovo solo Mongoose, altrimenti la strict mode lo scarta nel push) e poi sul risultato.
8. **Premio xp del pet e pet in premio nello stesso esito confliggono se scritti con due operatori.** Probe: l'intero array `assets.ownedPets` e un path posizionale dello stesso array nella stessa scrittura → `Updating the path … would create a conflict`. Il piano d'esito scrive già array interi calcolati dallo snapshot in sessione (`outcome-plan.ts:441-479`) e `OutcomeWriterService.writeCharacterUpdate` non passa `arrayFilters`: la forma di casa è **l'array intero**, non il filtro posizionale nominato da D-04 (vedi Conflicts).
9. **`cityRelations()` popola `pointsOfInterest.quest`** (`src/cities/city-relations.ts:8`, usato da `cities.service.ts` e `city-shop.service.ts`): tolto il campo, Mongoose lancia `StrictPopulateError` (probe). È l'unico lettore di `PointOfInterest.quest` e va cambiato nello stesso commit del modello.
10. **`Enemy.weaknesses` passa da `[String!]!` a enum**: oggi lo SDL non contiene `enum DamageType` né `enum EnergyType` (i due enum sono registrati ma non referenziati); compariranno due blocchi nuovi. Un valore fuori enum a DB, che oggi passa come stringa, annullerebbe l'`Enemy!` e con lui l'intera lista `quests` (stesso meccanismo del Pitfall 1 della Phase 8).

**Primary recommendation:**

- Un modulo `src/migrations/model-review/` con un solo `OnApplicationBootstrap` che esegue i passi in ordine dentro `step()` con `try/catch` (modello `QuestMaintenanceBoot`), driver nativo, un file per passo con una funzione pura più l'applicazione, fixture nella forma vecchia inserite con `collection.insertOne`.
- Ogni decisione = un piano che cambia modello, lettori, fixture, SDL e aggiunge il proprio passo, tranne D-07 che va spezzato in quattro (passo + campo additivo, scrittori delle mutation, piani d'esito, contrazione dello SDL).
- Premio del compagno calcolato in `planParticipant` e in `planAmbushOutcome` dallo snapshot in sessione, scritto come array intero insieme all'eventuale pet in premio; tetti letti dall'intero catalogo dei pet (44 documenti) in `readCombatCatalog`.
- `Enemy.spells` con populate annidato nei quattro punti che servono un `Enemy`; `OwnedPet.pet` popolato in `CharactersService.findOne` con le voci orfane tolte dal filo.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Catalogo (BE-MODEL-01, BE-MODEL-02, BE-MODEL-03)
- **D-01 (utente, «gli enemy hanno due campi weakness, quando potrebbero essere strutturati sotto un solo campo weakness»):** `Enemy.energyWeaknesses` e `Enemy.baseWeaknesses` diventano `Enemy.weaknesses { base: [DamageType], energy: [EnergyType] }` (sotto-documento `_id: false`, default liste vuote), specchio di `damages { base, energy }`; sullo SDL `Enemy.weaknesses: Weaknesses!` sostituisce i due campi (non additivo), anche in `EnemyInput`. Dati: 206 nemici, 5 con entrambe, 51 solo energia, 150 nessuna: il migratore copia e rimuove i due campi, idempotente (salta chi ha già `weaknesses`). Lettori da aggiornare: generatore (`recommended-loot.ts`, oggetti consigliati dalle debolezze), combattimento segnaposto, catalogo.
- **D-02 (utente):** `Enemy.spells` passa da copie incorporate di `SpellSchema` (45 nemici, al più 3 ciascuno) a **riferimenti** al catalogo (`[ObjectId] ref Spell`, come `CharacterStatus.spells` oggi); sullo SDL `Enemy.spells: [Spell!]!` resta uguale (populate). Il migratore abbina ogni copia al documento del catalogo per `_id` quando coincide, altrimenti per `name`; una copia senza corrispondenza è riportata nel log con nome e nemico e **non** viene inventata (l'utente la cura a DB). Lettori: il combattimento legge le magie dei nemici? Da verificare in ricerca (oggi `grep` non trova letture di `enemy.spells` fuori dai modelli: se è così, il cambio è solo di forma).
- **D-03 (utente, «I campi dei pet servono, nel motore di combattimento possono ricevere danni e il danno scala in base agli xp accumulati» + «Stato per pet posseduto sul personaggio»):** il catalogo `Pet` tiene le **basi** (`damages`, `maxLifePoints`, `maxXp`, prezzi, `speedModifier`, `sellable`, `imagePath`) e perde `xp` e `currentLifePoints` (oggi 0/100 e identici su 44 pet: stato, non catalogo); lo stato vive sul personaggio: `assets.ownedPets` diventa una lista di sotto-documenti `{ pet: ref, xp: Number, currentLifePoints: Number }` (`OwnedPet` sullo SDL, `CharacterAssets.ownedPets: [OwnedPet!]!`: non additivo, oggi è `[Pet!]!`); `assets.pet` resta il **riferimento al catalogo** del compagno equipaggiato (il viaggio legge solo `speedModifier`), il suo stato si trova in `ownedPets` per id. Migratore: ogni ref esistente → voce con `xp` 0 e `currentLifePoints` = `maxLifePoints` del catalogo; acquisto/vendita/premio pet (Phase 12/13) scrivono e tolgono voci intere; «già posseduto» confronta `pet`.
- **D-04 (utente, «una percentuale degli xp ottenuti in un combattimento vengono dati anche al pet», «10 % degli xp ottenuti dal solo nemico (senza quest)», «Tetto a maxXp»):** a ogni **vittoria con nemici** (quest individuale, party, dungeon, imboscata vinta), il **compagno equipaggiato** del partecipante riceve `round(xpNemici × PET_XP_SHARE)` con `PET_XP_SHARE = 0,10` (costante ritoccabile, non env), dove `xpNemici` è la somma degli `Enemy.xp` affrontati (la stessa già sommata agli xp del personaggio) **senza** `prizes.xpPrize`; tetto a `maxXp` del catalogo del pet (`min`), mai sotto; scritto nella **stessa scrittura dell'esito** sulla voce di `ownedPets` (filtro posizionale sull'id del pet); senza compagno equipaggiato nulla. Il `QuestResult` del partecipante registra `petXpGained: Int` (additivo, default 0) così la FE può dirlo. La vita del pet (`currentLifePoints`) non cambia in questa fase (motore dell'utente).
- **D-05 (utente, «vanno rivisti quelli settati a catalogo, aiutami nel deciderli in base a quanto sono rari e forti»):** `maxXp` dei 44 pet a DB dalla tabella proposta (file `pets-maxxp-proposal.json` nello scratchpad della sessione, rivisto dall'utente): base per `maxLifePoints` (≤ 300 → 100, ≤ 500 → 150, ≤ 1300 → 300, ≤ 2200 → 500, ≤ 2700 → 700, ≤ 4500 → 1000, oltre → 1500), +25 % se solo da quest (`sellable: false`), +25 % se costa almeno 3 oro, arrotondato a 50 (da 100 dei gatti a 2350 di Pegaso, Grifone e Cavallo degli incubi). Contenuto scritto a DB dallo script dopo la merge e la revisione (D-36), non dal migratore.
- **D-15 (utente, a discuss chiuso: «Il modello Pet andrebbe rivisto in modo da dargli damages: { defense: ; attack: } o qualcosa di simile», poi precisato: «la cosa migliore è avere attack: Damages e defense: Damages»):** `Pet.damages` (oggi `Damages { base, energy }`, letto come attacco) viene sostituito da **due campi piatti** `Pet.attack: Damages` e `Pet.defense: Damages`, ciascuno `{ base, energy }` come oggi; sullo SDL `Pet.attack: Damages!` e `Pet.defense: Damages!` con `Pet.damages` tolto (non additivo), anche in `PetInput`. Migratore: il `damages` attuale diventa `attack`, `defense` nasce con liste vuote e il vecchio campo viene rimosso; i valori di difesa li scrive l'utente a DB («la mano vince»), coerente con la regola dell'equipaggiamento dove i danni dei non-arma sono protezione. Nessun lettore nel BE oggi (il viaggio legge solo `speedModifier`): il motore di combattimento dell'utente leggerà i due rami.

#### Personaggio (BE-MODEL-04, BE-MODEL-05, BE-MODEL-06)
- **D-06 (utente):** `CharacterAssets.wearedEquipment` → `wornEquipment` e lo slot `Equipment.foots` → `feet` (modello, SDL non additivo, `EquipmentInput`, `SlotType` se contiene `foots`, filtri/update di `equipItem` e del negozio); migratore con rinomina dei campi, idempotente. Nessun altro slot cambia.
- **D-07 (utente, «Una sola lista di magie»):** le tre strutture `status.spells` (ref delle magie conosciute), `status.spellStates` (array parallelo nello stesso ordine: `usages`, `recoveries`) e `assets.activeSpells` (`{ spell, usages }` delle equipaggiate) diventano **una sola** lista `status.spellStates: [{ spell: ref, usages, recoveries: [Date], active: Boolean }]` nell'ordine di apprendimento; `status.spells` e `assets.activeSpells` spariscono dal modello e dallo SDL (non additivo: `CharacterStatus.spells`, `CharacterAssets.activeSpells` tolti; `SpellState.active` aggiunto); `equipSpell`/`unequipSpell` scrivono `active` (il tetto degli slot resta `maxActiveSpells` calcolato, D-08); `useSpell` e il recupero (Phase 9.1) lavorano sulla voce; l'apprendimento (study) aggiunge una voce `active: false`; il combattimento legge le voci `active`. Migratore: per ogni magia di `spells` la voce di `spellStates` (stesso indice, altrimenti per id) con `active` = presente in `activeSpells`; `usages` della voce vince su quello di `activeSpells` se diverso (log). Dati: 6 personaggi, al più 8 magie. **Piano più grande della fase** (53 righe in 15 file): da pianificare per ultimo nella wave del personaggio, con la FE Phase 8 (sezione Magie del Diario) come lettore principale.
- **D-08 (utente):** `status.maxActiveSpells` non viene più **persistito** (assente su tutti i 6 personaggi: lo calcola `active-spell-slots.ts` da titolo e xp); sullo SDL `CharacterStatus.maxActiveSpells: Int!` **resta** come resolve field calcolato (la FE lo legge in 4 file: nessun cambio FE); il `@Prop` sparisce, l'input admin lo ignora.

#### Mondo e pulizia (BE-MODEL-07, BE-MODEL-08)
- **D-09 (utente):** `PointOfInterest.quest` (back-link singolo, vuoto su 642 POI mentre 166 marker portano 2–5 quest, «nessun lettore» già nella ricerca della Phase 11) viene rimosso da modello, SDL (`PointOfInterest.quest`), `PointOfInterestInput` e dal parser FE; migratore che toglie il campo dove esistesse.
- **D-10 (utente):** `City.shopEquipment`, `City.shopLoot`, `City.shopPets` → `City.shop { equipment: [ref], loot: [ref], pets: [ref] }` (solo Mongoose, come oggi: il filo espone già `CityShop { equipment, loot, pets }`); `cityShop`, il report dei pool e la vendita leggono il sotto-documento; migratore idempotente sulle 167 città (pool presenti, anche vuoti, conservati tali e quali: «la mano vince»).
- **D-11 (utente):** nomi e pulizia: `Lore.image` → `Lore.imagePath` (modello, SDL non additivo, `LoreInput`, migratore; la FE legge `imagePath` in 438 lore con immagine), file enum `item_reference_type.enum.ts` → `item-reference-type.enum.ts` e `slot_type.enum.ts` → `slot-type.enum.ts` (soli import), modello `KGNotification` rimosso (nessun uso, non nello SDL). Nella FE i file sono già in `snake_case` per convenzione Dart: nessuna rinomina.

#### Migrazione, ordine, prove (BE-MODEL-09)
- **D-12 (Claude, regola di casa):** **un solo** modulo one-off `src/migrations/model-review/` (da creare) con un passo per decisione (D-01, D-02, D-03, D-06, D-07, D-09, D-10, D-11), ognuno idempotente e con log di soli conteggi, eseguito al **boot reale** dall'orchestratore e rimosso in TDD prima della merge (pattern 13.1/16); backup `mongodump` delle collezioni toccate prima del boot; prova a secco con i conteggi attesi (206 nemici, 45 con magie, 44 pet, 6 personaggi, 642 POI, 167 città, 521 lore).
- **D-13 (Claude):** ordine delle wave: catalogo (D-01, D-02, D-03/D-04/D-05/D-15) → mondo (D-09, D-10, D-11) → personaggio (D-06, D-08, D-07 per ultimo); ogni wave chiude con lo SDL emesso dal boot e la riga nel handoff; lo SDL finale è **non additivo** e la FE Phase 19 lo consuma con piani gated (cambi: `Enemy.weaknesses`, `Pet.attack`/`Pet.defense` al posto di `Pet.damages`, `CharacterAssets.ownedPets: [OwnedPet!]!`, `QuestResult.petXpGained`, `wornEquipment`/`feet`, `SpellState.active` con `CharacterStatus.spells`/`CharacterAssets.activeSpells` tolti, `PointOfInterest.quest` tolto, `Lore.imagePath`).
- **D-14 (utente, «Coppia 19 dopo la 18»):** si pianifica dopo la Phase 18 e si esegue dopo la sua merge; branch impilato sulla 18, PR verso `develop` dopo quella della 18.
- **Prove (default tecnico):** unit sui migratori (idempotenza, abbinamento magie per id e per nome, voce pet con HP del catalogo, rinomina slot, fusione delle tre liste di magie con conflitto di `usages`), sul premio xp del pet (10 % dei soli nemici, tetto, nessun compagno, imboscata), sulle letture (debolezze nel generatore, pool nel negozio); integration: boot con migratore su fixture di ogni area, esito con compagno → `petXpGained` e voce aggiornata, `cityShop` dal sotto-documento, SDL verbatim; handoff `BACKEND-NOTES.md` con la tabella dei cambi SDL vecchio → nuovo per la FE Phase 19.

### Claude's Discretion
- Nomi definitivi in `19-REPO-RULES.md` (default sopra: `Weaknesses`, `attack`/`defense` sul Pet, `OwnedPet`, `wornEquipment`, `feet`, `SpellState.active`, `City.shop`, `imagePath`, `petXpGained`, `PET_XP_SHARE`).
- Struttura del modulo di migrazione e dei log; ordine dei piani dentro le wave; forma della tabella SDL nel handoff.

### Deferred Ideas (OUT OF SCOPE)
- **`ownedEquipments` + `ownedItems` → un solo inventario**: proposto, non scelto dall'utente.
- **`Spell.energyDamage` → `damages { base, energy }` e `requiredLearnTime`**: sessione dedicata all'apprendimento delle magie.
- **`CharacterQuests` con le corsie in un sotto-documento**: non proposto come prioritario.
- **Vita del pet in combattimento, danni che scalano con gli xp**: motore dell'utente.
- **`PathResponse`** (2 letture): resta.

### Nomi già fissati (`19-REPO-RULES.md`, 2026-11-11 — non si rinominano)

`Weaknesses { base: [DamageType!]!, energy: [EnergyType!]! }`, `Enemy.weaknesses: Weaknesses!`, `WeaknessesInput`; `Pet.attack: Damages!`, `Pet.defense: Damages!`; `OwnedPet { pet: Pet!, xp: Int!, currentLifePoints: Int! }`, `CharacterAssets.ownedPets: [OwnedPet!]!`; `QuestResult.petXpGained: Int!`, `PET_XP_SHARE = 0.1`, `petXpAward(enemiesXp, currentXp, maxXp)`; `CharacterAssets.wornEquipment`, `Equipment.feet`, membro `feet` di `SlotType`; `SpellState.active: Boolean!`; `City.shop { equipment, loot, pets }`; `Lore.imagePath`; `ModelReviewMigrationModule`. Nessun nome è reso impossibile dal codice.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrizione | Supporto della ricerca |
|----|-------------|------------------------|
| BE-MODEL-01 | `Enemy.weaknesses`, generatore e combattimento sul sotto-documento, migratore | F-1, M-2, Pitfall 6 |
| BE-MODEL-02 | `Enemy.spells` per riferimento, abbinamento per id o nome | F-2, M-2 |
| BE-MODEL-03 | `OwnedPet` sul personaggio, `Pet.attack`/`defense`, acquisto/vendita/premio sulle voci | F-3, F-4, M-2, Pitfall 4 e 5 |
| BE-MODEL-04 | 10 % degli xp dei nemici al compagno, tetto, `petXpGained` | F-5, Conflicts 1, Domande aperte 1, 6, 7 |
| BE-MODEL-05 | `wornEquipment` / `feet` | F-6, M-2 (due rinomine in ordine) |
| BE-MODEL-06 | unica lista `spellStates` con `active`, `maxActiveSpells` calcolato | F-7, F-8, Pitfall 1, 2, 3 |
| BE-MODEL-07 | via `PointOfInterest.quest`, `City.shop` | F-9, F-10 |
| BE-MODEL-08 | `Lore.imagePath`, file enum, `KGNotification` | F-11 |
| BE-MODEL-09 | modulo one-off, prove, handoff | M-1..M-5, F-12, Validation Architecture |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 19-REPO-RULES.md)

- Stack fisso: NestJS 11, Mongoose 8, Apollo code-first, Bull. Nessuna dipendenza nuova, nessuna variabile d'ambiente nuova.
- TDD obbligatorio: RED → `test(<scope>)`, GREEN → `feat`/`fix`, titolo del test con la regola e `(D-NN)`.
- Lo SDL cambia solo come dichiarato nella tabella dei nomi; `src/schema.gql` rigenerato e committato nello stesso piano che cambia il campo; il boot reale dichiara tolti e aggiunti.
- Mai `npm run lint`, `npm run format`, `npm run build`, `nest build`; Prettier ed ESLint file per file; un file non pulito riceve prima un commit `style`; `npx tsc --noEmit -p tsconfig.json` a fine task.
- Jest con i percorsi prima di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl 'bin/jest'` vuoto a fine task.
- Mai `.env`, mai il database reale, nessun avvio del BE dagli esecutori; nessun piano rimuove il migratore (lo fa l'orchestratore dopo il boot reale).
- Nessun file di contenuto nel repo (D-36): `maxXp` e `Pet.defense` a DB dopo la merge.
- Nessun `Math.random` né `Date.now`; mai intersezioni di interfacce di dominio nei documenti di update di Mongoose.
- Log del migratore: soli conteggi per passo (più nome della magia e `_id` del nemico per le copie non abbinate, D-02).
- Commit in inglese, subject ≤ 72 caratteri, nessun trailer.
- Messaggi sul filo in italiano, codici di rifiuto invariati.

## Standard Stack

### Core (già installato, nessuna aggiunta)

| Libreria | Versione | Uso nella fase | Fonte |
|----------|----------|----------------|-------|
| mongoose | ^8.18.1 | sotto-schemi `_id: false`, `model.collection` (driver nativo) per il migratore | [VERIFIED: `package.json`] |
| @nestjs/graphql | ^13.2.0 | `@ResolveField` per `maxActiveSpells`, `sortSchema` | [VERIFIED: `package.json`] |
| @nestjs/mongoose | ^11.0.3 | `@Prop`, `SchemaFactory`, `@InjectConnection` | [VERIFIED: `package.json`] |
| graphql | ^16.11.0 | serializzazione degli enum (Pitfall 6) | [VERIFIED: `package.json`] |
| jest | ^30.0.0 | progetti `unit` e `integration` | [VERIFIED: `package.json`] |
| mongodb-memory-server | ^11.2.0 | replica set dei test; la probe ha usato MongoDB 8.2.6 | [VERIFIED: probe] |

### Alternatives Considered

| Invece di | Si potrebbe | Perché no |
|-----------|-------------|-----------|
| driver nativo nel migratore | `Model.updateMany` | **scartato dalla probe**: Mongoose non invia gli operatori sui path fuori schema (`acknowledged: false`, nessuna scrittura) |
| array intero di `ownedPets` nel piano d'esito | path posizionale con `arrayFilters` (D-04 alla lettera) | conflitto di path col pet in premio nello stesso esito; lo scrittore non passa `arrayFilters` |
| populate annidato di `Enemy.spells` | `@ResolveField('spells')` su `Enemy` con caricamento | N+1 sulle liste; il populate annidato aggiunge una sola query per lettura ed è la forma di `RELATED_LORE_POPULATE` |
| resolve field per `maxActiveSpells` | lasciare la virtual | D-08 chiede il resolve field; la virtual non esiste sugli oggetti lean |
| ridurre `SpellStateMigrator` al taglio | cancellarlo del tutto | il taglio degli istanti fuori dai limiti (9.1 D-03) resta una garanzia viva; solo la riparazione muore con `status.spells` |

**Installation:** nessuna.

## Findings

### F-1 — D-01 debolezze: lettori e scrittori

Modello: `src/models/enemy.model.ts:25-31` (due `@Field(() => [String])`) e `:81-85` (`EnemyInput`, fuori dallo SDL). SDL: `src/schema.gql:246, 248`. [VERIFIED: lettura]

| File:riga | Uso |
|-----------|-----|
| `src/quests/outcomes/resolution-loader.service.ts:160-161` | `COMBAT_ENEMY_PROJECTION` (quest e imboscate) |
| `src/quests/outcomes/combat/combat-context.ts:52-53, 248-249` | snapshot e contesto del combattimento |
| `src/quests/outcomes/combat/combat-resolver.ts:60-61` | tipo `CombatEnemy` (contratto del motore: i nomi interni possono restare, vedi nota) |
| `src/quests/generation/enemy-candidate.ts:9, 18-19, 35-36` | stringa di proiezione e candidato del generatore |
| `src/quests/generation/enemy-pool.ts:9-10` | tipo del pool |
| `src/quests/generation/recommended-loot.ts:65-66` | oggetti consigliati |
| `test/fixtures/enemy.fixture.ts:11-12`, `test/quests/generation-world.ts:152, 175`, `test/travel/ambush-world.ts:167` | fixture |

Conteggio: 9 righe in 6 file fuori dal modello per ciascun nome (conferma il CONTEXT), più 21 righe in 14 spec (`combat-context.spec` 10, `resolution-loader.service.spec` 4, `recommended-loot.spec` 4, `enemy-candidate.spec` 4, e dieci spec con 2 righe) e 3 fixture.

Nota di taglio: il tipo interno del motore (`CombatEnemy.baseWeaknesses`/`energyWeaknesses` in `combat-resolver.ts`) è un contratto del combattimento, non il modello. Raccomandato rinominarlo comunque in `weaknesses { base, energy }` per non lasciare due vocabolari: il planner lo mette nello stesso piano (4 spec in più).

SDL nuovo: `type Weaknesses {\n  base: [DamageType!]!\n  energy: [EnergyType!]!\n}`, `Enemy.weaknesses: Weaknesses!`, più i blocchi `enum DamageType { blunt cut pierce }` e `enum EnergyType { … 11 valori … }` che oggi **non** sono nello SDL (`grep '^enum' src/schema.gql`: assenti; registrati in `src/models/enums/damage-type.enum.ts` e `energy-type.enum.ts`). [VERIFIED: grep] [ASSUMED: ordine alfabetico dei blocchi, da confermare alla rigenerazione]

Default del sotto-documento: `@Prop({ type: WeaknessesSchema, default: () => ({}) })` con liste `default: []`. Probe: un nemico non ancora migrato idratato con questo schema risponde `{ base: [], energy: [] }`, quindi `Weaknesses!` non si annulla nella finestra prima del boot.

### F-2 — D-02 magie dei nemici

**Nessun lettore di `enemy.spells` fuori dal modello.** `COMBAT_ENEMY_PROJECTION` non le proietta, `enemy-candidate.ts` nemmeno, `placeholder-combat-resolver.ts` legge solo `participant.activeSpells`. Il cambio è di forma più il populate. [VERIFIED: grep `\.spells\b` su `src`]

Forma delle copie: `@Prop({ type: [SpellSchema] })` (`enemy.model.ts:45-47`): `SpellSchema` ha `_id` automatico, quindi le copie create via Mongoose portano un `_id`; quelle scritte dagli script di contenuto col driver nativo possono non averlo. Il codice non dice quale delle due: il passo gestisce entrambe (id, poi nome) e la prova a secco conta. [ASSUMED sui dati reali — Domanda aperta 8]

Punti che servono un `Enemy` sul filo e devono popolare `spells`:

| File:riga | Oggi | Dopo |
|-----------|------|------|
| `src/enemies/enemies.service.ts:20, 28` | `.populate(RELATED_LORE_POPULATE)` | più `{ path: 'spells', model: Spell.name }` |
| `src/quests/quest-catalog.populate.ts:11` | `{ path: 'infos.enemies.enemy', model: Enemy.name }` | più `populate: { path: 'spells', model: Spell.name }` |
| `src/quests/results/quest-result.populate.ts:22` | `{ path: 'enemies.enemy', model: Enemy.name }` | idem |

La FE oggi non seleziona `spells` sotto `enemy` né nel catalogo quest né nel foglio (`lib/graphql/fragments/quest_fragment.dart:23-31`, `quest_result_fragment.dart:103-110`): il populate annidato serve a non rompere chi lo selezionasse (`Spell.name: String!` su un ObjectId nudo annullerebbe l'intero nemico). Il populate di una lista di ref scarta da sé i documenti mancanti: `[Spell!]!` regge agli orfani. [VERIFIED: lettura FE] [CITED: mongoosejs.com/docs/populate.html — `retainNullValues` è opt-in]

Probe: un nemico non migrato (copie incorporate) letto con lo schema nuovo e popolato risponde `spells: []`, senza errore.

`EnemyInput.spells` è già `[ID]` (`enemy.model.ts:93-94`): nessun cambio.

### F-3 — D-03 pet posseduti: lettori e scrittori di `assets.ownedPets` e `assets.pet`

| File:riga | Uso | Dopo |
|-----------|-----|------|
| `src/models/character/character-assets.model.ts:41-48` | `ownedPets: [ref Pet]`, `pet: ref Pet` | `ownedPets: [OwnedPetSchema]`; `pet` invariato |
| `src/characters/characters.service.ts:118-119` | populate `assets.pet`, `assets.ownedPets` | populate `assets.ownedPets.pet`; voci con pet orfano tolte dal filo (Pitfall 5) |
| `src/characters/pets/equip-pet.updates.ts:14` | filtro `'assets.ownedPets': { $in: idForms }` | `'assets.ownedPets.pet'` |
| `src/economy/trade/trade-pets.ts:6-63` | `assertPetsNotOwned`, `applyTradeToPets` (push e splice di id), `petOwnershipGuards` | voci intere; confronto su `entry.pet`; guardie su `'assets.ownedPets.pet'`; l'acquisto ha bisogno di `maxLifePoints` del catalogo |
| `src/economy/trade/shop-transaction.service.ts:101-102, 121-122` | proiezione e `$set` dell'array intero | invariato nella forma (array intero di voci) |
| `src/economy/trade/catalog-prices.reader.ts:46` | `readPrices(this.petModel, …)` | proiettare anche `maxLifePoints` per i pet comprati (punto d'inserimento della vita iniziale) |
| `src/quests/outcomes/outcome-plan.ts:80, 319-327, 461-468` | `petWonBy`, append dell'id | voce `{ pet, xp: 0, currentLifePoints }`; serve `maxLifePoints` del pet in premio |
| `src/quests/outcomes/resolution-loader.service.ts:609, 614-622` | `readPrizePets` → `Set` di id | restituire anche `maxLifePoints` (o usare la mappa dei tetti di F-5) |
| `src/characters/creation/starting-character.ts:37, 82` | `ownedPets: []` | invariato |
| `src/travel/travel-planner.service.ts:55, 71, 130`, `src/quests/acceptance/quest-acceptance.service.ts:98, 141, 404`, `src/travel/ambush/ambush-resolution.service.ts:300`, `ambush-plan.ts:69` | leggono solo `assets.pet` | **nessun cambio** |
| `src/migrations/mixed-refs/mixed-ref-paths.ts:55` | `scalar('characters', 'assets.pet')` | invariato |

Conteggio: `ownedPets` 22 righe in 7 file non-spec (modello compreso), 74 righe in 14 spec, 4 righe in 2 file di `test/`; con `assets.pet` si arriva alle 29 righe / 9 file del CONTEXT. Sul filo: `src/characters/character-updated.subscription.int-spec.ts:46` seleziona `ownedPets { id name speedModifier sellable }` e va riscritto in `ownedPets { pet { … } xp currentLifePoints }`.

Pubblicazione: `CharacterUpdatesPublisher.publishOnce` rilegge con `CharactersService.findOne` (`character-updates.publisher.ts:54`): un solo punto di populate per query, subscription e riemissioni. `characters` (lista) popola solo le quest (`characters.service.ts:90-95`): già oggi `ownedPets` non è servibile da lì, nessun cambio di comportamento.

### F-4 — D-15 e catalogo `Pet`

Modello `src/models/pet.model.ts:17-19` (`damages`), `:29-31` (`xp`), `:37-39` (`currentLifePoints`), input `:71-72, 80-81, 86-87` (fuori dallo SDL). SDL `src/schema.gql:470-483`, pinnato esatto in `test/app.int-spec.ts:449-450`.

**Nessun lettore nel BE** di `pet.damages`, `pet.xp`, `pet.currentLifePoints` (`grep` su `src/pets`, `src/shops`, `src/economy`, `src/travel`: zero). La sola fixture è `test/fixtures/pet.fixture.ts:11-16` (`damages`, `xp`, `currentLifePoints`). La FE non li seleziona (`lib/graphql/fragments/pet_fragment.dart`: `id name speedModifier sellable buyPrice sellPrice`). [VERIFIED: grep]

Blocco atteso: `type Pet {\n  attack: Damages!\n  buyPrice: Coins!\n  defense: Damages!\n  id: ID!\n  imagePath: String!\n  maxLifePoints: Int!\n  maxXp: Int!\n  name: String!\n  sellPrice: Coins!\n  sellable: Boolean\n  speedModifier: Float\n}`. [ASSUMED: ordine alfabetico]

`Pet.damages` oggi ha `default: null` con `Damages!` sul filo: un pet senza danni annullerebbe già oggi la lista. Per `attack`/`defense` usare `default: () => ({})` (probe: il sotto-documento assente si idrata con le liste vuote).

### F-5 — D-04 premio xp al compagno

**Dove si sommano gli xp dei nemici.** `enemyFactsOf(catalog)` (`src/quests/outcomes/combatant-plan.ts:75-91`): somma `Enemy.xp × quantity` sulle voci del catalogo. Arriva a `planParticipant` come `input.enemies.xp` e si somma al premio in `outcome-plan.ts:354` (`xpEarned = won ? rewards.xpPrize + (input.enemies?.xp ?? 0) : 0`). `xpNemici` di D-04 è esattamente `input.enemies?.xp ?? 0` quando `won`. [VERIFIED: lettura]

Chi passa da `planParticipant` con nemici:

| Percorso | File:riga | Note |
|----------|-----------|------|
| quest individuale e party | `combatant-plan.ts:138-158` (`planCombatant`) | stesso `enemyFactsOf(catalog)` per ogni partecipante: ogni compagno riceve la quota piena, come gli xp del personaggio |
| dungeon | stesso `planCombatant` con `dungeonBattleOf` | xp di tutte le tappe, solo in vittoria |
| scontro di guardia vinto (quick 261110-cgd) | `guard/guard-outcome.ts:76-91` (`encounterCatalogOf` fonde i nemici) → `planCombatant` | i nemici dello scontro entrano nella somma: il compagno li riceve |
| soccorso vinto (aid) | `rescue-resolution.service.ts:209` → `planCombatant` | come una quest |
| completamento del GM | `gm-completion.service.ts:303-312` (`verdict: gmCompleted`, `enemies: enemyFactsOf(catalog)`) | `won` è vero: il compagno riceve come il personaggio |
| arresto, sconfitta di guardia | `unrewarded-plan.ts:48-134` | `xpGained: 0`: `petXpGained: 0` |
| soccorso/morte | `rescue-plan.ts` (`unchangedResult`) | `petXpGained: 0` |

**Imboscata.** `planAmbushOutcome` (`src/travel/ambush/ambush-plan.ts:327-357`) non usa `planParticipant`: ha il suo `foughtOutcomeOf` e `commonSetOf` (righe 195-212). La vittoria scrive il personaggio e fa push del report in `status.activeTravel.ambushReports` (righe 248-262); il `QuestResult` `kind: ambush` nasce all'arrivo da `ambushResultDraftsOf` (`ambush-results.ts:50-98`). Punti da toccare:

- `AmbushReportDraft` (`ambush-plan.ts:72-96`) e `reportOf` (righe 214-245): campo `petXpGained`;
- `AmbushReportSnapshot` (`src/models/character/ambush-snapshot.model.ts:48-126`): `@Prop({ type: Number, default: 0 })`, altrimenti la strict mode lo scarta nel push (stesso Pitfall 3 di `loreUnlocked`, riga 124-126);
- `resultDraftOf` (`ambush-results.ts:59-98`): `petXpGained: report.petXpGained ?? 0` (i report trattenuti prima del deploy non hanno il campo);
- `commonSetOf`: l'array `assets.ownedPets` aggiornato quando il premio è > 0;
- lista di chiavi pinnata in `src/travel/ambush/ambush-results.spec.ts:55-84`: **RED** con la chiave nuova.

Lo snapshot dell'imboscata porta già `assets` intero (`OUTCOME_CHARACTER_PROJECTION`, `outcome-plan.ts:49-53`) e `assets.pet` (`ambush-plan.ts:69`).

**Tetti del catalogo.** Nessuna lettura dei pet esiste oggi nel combattimento. Punto d'inserimento unico: `ResolutionLoaderService.readCombatCatalog` (`resolution-loader.service.ts:435-482`), che serve quest (`readCatalog`, riga 416), imboscate (`ambush-resolution.service.ts:262`) e scontro di guardia (`conclusion-event.drawer.ts:63`). Raccomandato leggere **l'intero catalogo dei pet** (44 documenti, proiezione `{ maxXp: 1, maxLifePoints: 1 }`) come fa `readSpellMaxUsages` (righe 484-498) per le magie: il compagno equipaggiato può cambiare fra la lettura del catalogo e lo snapshot in sessione, e la stessa mappa dà `maxLifePoints` al pet in premio (F-3). Attenzione al ritorno anticipato senza nemici (righe 443-452): la mappa va restituita anche lì se serve al pet in premio (una quest senza nemici può premiare un pet).

**Forma della scrittura.** Vedi Conflicts 1: `planParticipant` calcola l'array `assets.ownedPets` finale (voce del compagno con xp aggiornati, più l'eventuale voce del pet vinto) e lo mette nel set solo se cambia, come fa oggi con il pet vinto (righe 461-468, «fuori dall'update se non cambia», Pitfall 5 della Phase 12). La scrittura è già dentro la transazione con lo snapshot letto in sessione: nessuna guardia nuova nel filtro.

**Funzione pura.** `petXpAward(enemiesXp, currentXp, maxXp)` in una cartella nuova accanto alla progressione (raccomandato `src/quests/outcomes/pets/pet-xp.ts` con `PET_XP_SHARE`). Ritorno raccomandato `{ xp, gained }` con `gained` = guadagno effettivo dopo il tetto, specchio di `xpGained` (`outcome-plan.ts:506`). Casi limite da pinnare: nemici 0 → 0; `maxXp` non numerico → nessun premio; xp corrente già sopra il tetto → resta (mai sotto); arrotondamento `Math.round` (D-04). [ASSUMED sul ritorno e su `maxXp` non valido — Domanda aperta 6]

**`QuestResult.petXpGained`.** Modello `src/models/quest-result/quest-result.model.ts` (accanto a `xpGained`), draft `QuestResultDraft` (`outcome-plan.ts:109-140`), `unrewarded-plan.ts:102-131`, `rescue-plan.ts` (`unchangedResult`), `test/quests/quest-result.fixture.ts`. Come per `injuriesHealed` nella Phase 18: **modello e draft nello stesso commit**, altrimenti `tsc` fallisce in `quest-result.populate.ts` (`unpopulatedResultOf` spalma il draft). Blocco esatto `type QuestResult` in `test/app.int-spec.ts:623-624`: RED.

### F-6 — D-06 `wornEquipment` / `feet`

| File:riga | Uso |
|-----------|-----|
| `src/models/character/character-assets.model.ts:32-34, 63-64` | `@Prop`/`@Field` e input |
| `src/models/common/equipment.model.ts:41-47, 99-100` | slot `foots` e input |
| `src/models/enums/slot_type.enum.ts:12` | membro `foots` (**sul filo**: `enum SlotType`, `EquipItemRequest.slotType`) |
| `src/characters/characters.service.ts:136-151, 164-175` | `findOne` (popola gli slot dall'inventario) e `getEquipment` (`assets.wearedEquipment.${slot}`) |
| `src/characters/equipment/equip-item.updates.ts:21` | `$set` dello slot |
| `src/economy/trade/trade-inventory.ts:21, 98` | `InventorySnapshot.wearedEquipment`, slot liberati dalla vendita |
| `src/economy/trade/shop-transaction.service.ts:100, 112` | proiezione e slot svuotati |
| `src/quests/outcomes/combat/combat-context.ts:39, 123` | equipaggiamento in combattimento |
| `src/quests/outcomes/dungeon/dungeon-context.ts:60` | idem per le tappe |
| `src/characters/creation/starting-character.ts:35, 80` | personaggio iniziale |
| `src/migrations/mixed-refs/mixed-ref-paths.ts:13-23, 51-53` | registro dei ref (9 path con `foots`) |
| `test/fixtures/character.fixture.ts:50` | fixture |

Conteggio: `wearedEquipment` 19 righe in 9 file non-spec (17 / 8 fuori dal modello: conferma il CONTEXT), 37 righe in 11 spec, 1 fixture; `foots` 4 righe in 3 file non-spec, 1 spec. Nessuna int-spec usa lo slot `foots` sul filo (tutte `slotType: 'head'`).

Tutti i path dello slot nascono da `Object.values(SlotType)`: rinominare il membro sposta **insieme** combattimento, negozio, populate e `equipItem`. Modello, enum, lettori e passo del migratore vanno nello stesso piano.

`applyTradeToInventory(snapshot.assets ?? {}, …)` riceve gli `assets` lean: dopo la rinomina legge `wornEquipment` da sé. Lo usa anche `ItemUseService` (Phase 18) e il piano d'esito: nessun altro cambio.

### F-7 — D-07 mappa completa di `status.spells`, `status.spellStates`, `assets.activeSpells`

Conteggi: `activeSpells` 58 righe in 17 file non-spec, 168 righe in 32 spec, 7 in 3 file di `test/`; `spellStates` 74 / 16 non-spec, 206 / 31 spec, 11 / 3 `test/`. Il CONTEXT (53 / 15) non contava `unrewarded-plan.ts` (quick 261110-cgd) e il modello.

**Mutation e recupero (`src/characters/`)**

| File:riga | Oggi | Dopo |
|-----------|------|------|
| `spells/active-spell.updates.ts:15-30` `equipSpellFilter` | `status.spells` contiene, `assets.activeSpells.spell` non contiene, dimensione di `activeSpells` < `maxActiveSpellsExpression()` | una voce con quella magia e non attiva (`$elemMatch`), conteggio delle voci attive < espressione |
| `:33-69` `equipSpellUpdate` | pipeline che accoda il mirror con gli usi della voce | set di `active: true` sulla voce (filtro d'array `s.spell`) |
| `:71-85` unequip | filtro e pull sul mirror | voce attiva → `active: false` |
| `:87-157` proiezione e classificatori | leggono `status.spells` e `assets.activeSpells` | leggono le voci; **codici invariati** (`SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`, `SPELL_NOT_ACTIVE`, `SPELL_NO_USAGES_LEFT`) |
| `spells/spell-state.updates.ts:6-11` `spellStateArrayFilters` | due filtri d'array: `s` (voce) e `a` (mirror) | **solo `s`** (Pitfall 2) |
| `:14-25` `useSpellFilter` | mirror contiene + voce con usi | una voce `{ spell, usages ≥ 1, active: true }` |
| `:28-43, 64-70, 125-130` spesa e crediti | incrementi su voce e mirror | solo sulla voce |
| `spells/spell-state.snapshot.ts:74-101` | `mirrorFromStates`, `spellStatesOrMigrated` (ricostruisce da `status.spells`) | tolti; `learnedSpellState` nasce con `active: false` |
| `spells/spell-state.mapper.ts:23-49` `spellsOnTheWire` | filtra voci e mirror sui conosciuti popolati | solo le voci con magia popolata (orfani fuori dal filo) |
| `spells/spell-state.migration.ts`, `spell-state.migrator.ts` | riparazione + taglio | **solo taglio, con `active` conservato** (Pitfall 1) |
| `spells/spell-recovery.service.ts:48, 80` | `migrateOne` prima di ogni credito | resta se il migratore tiene il taglio |
| `spells/spell-recovery.sweeper.ts:24, 80-89` | legge `status.spellStates.recoveries` | **invariato** |
| `characters.service.ts:105-109, 153-159, 235-288, 318-347` | populate `status.spells`, wire, equip/unequip/use | populate solo `status.spellStates.spell`; `equipSpell` tiene la lettura di `maxUsages` come controllo di esistenza a catalogo (stesso `NOT_FOUND` di oggi) |
| `creation/starting-character.ts:20-21, 36, 64-65, 81` | `spells: []`, `spellStates: []`, `activeSpells: []` | solo `spellStates: []` |

**Indice del recupero.** `character_spell_recoveries` è su `{ deletedAt: 1, 'status.spellStates.recoveries': 1 }` (`src/models/character/character.model.ts:101-105`): il path non cambia, nessun indice da ricreare. `src/models/sweep-indexes.schema.spec.ts` resta verde. [VERIFIED: lettura]

**Piani d'esito**

| File:riga | Uso |
|-----------|-----|
| `src/quests/outcomes/outcome-plan.ts:64-65, 79` | snapshot (`spells`, `spellStates`, `activeSpells`) |
| `:248-306` `spellsSpent(characterId, active, baseStates, …)` | `active` = mirror: decide quali magie entrano; ritorna `spellStates` e `activeSpells` |
| `:388-417` | `knownSpells = snapshot.status.spells`, `spellStatesOrMigrated`, voce imparata accodata |
| `:451-457` | set di `status.spellStates`, `assets.activeSpells`, `status.spells` |
| `src/quests/outcomes/unrewarded-plan.ts:73-97` | stessa spesa, stessi due set |
| `src/travel/ambush/ambush-plan.ts:182-189, 205-210` | idem |
| `src/quests/outcomes/combat/combat-context.ts:36, 40, 128-136, 159, 210` | `activeSpellsOf`: mirror per sapere quali, usi dalla voce |
| `src/quests/outcomes/gm-overrides.ts:29, 58-64` | limiti degli override dalle magie negli slot |
| `src/quests/outcomes/rewards/quest-rewards.ts:260-278` | `canLearnSpell` e `drawLearnableSpell(…, knownSpells)` (sorteggio 30 % del quick 261111-sdc) ricevono la lista dei conosciuti |
| `src/quests/outcomes/combat/placeholder-combat-resolver.ts:47, 162`, `dungeon/placeholder-dungeon-resolver.ts:76`, `combat/combat-resolver.ts:50` | `participant.activeSpells` è il **contratto del motore** (`CombatParticipant`), non il modello: resta |

Le voci passano negli array interi per `{ ...entry }` (`spendFromState`, `spell-state.snapshot.ts:54-64`): `active` si conserva da sé. Il sorteggio della magia riceve i conosciuti come lista di ref: basta passare `spellStates.map((s) => s.spell)`.

**Modello, input, registro, SDL**

- `src/models/character/character-status.model.ts:53-64` (`spells`, `spellStates`), `:135-136` (`CharacterStatusInput.spells`, fuori dallo SDL);
- `src/models/character/character-assets.model.ts:15-19, 36-38, 66-67`; `src/models/common/active-spell.model.ts` (**file da cancellare**: `ActiveSpell` e `ActiveSpellInput` restano senza usi; un `@ObjectType` non referenziato non viene emesso, come `KGNotification` oggi, ma il file morto va tolto);
- `src/models/character/spell-state.model.ts:9-26`: aggiungere `active` (`@Field(() => Boolean)`, `@Prop({ type: Boolean, default: false })`);
- `src/migrations/mixed-refs/mixed-ref-paths.ts:46, 54`: via `status.spells` e `assets.activeSpells.spell`;
- SDL: `type ActiveSpell` sparisce (`src/schema.gql:20-23`), `CharacterAssets.activeSpells` (`:81`), `CharacterStatus.spells` (`:120`); `SpellState` diventa `{ active: Boolean! recoveries: [DateTime!]! spell: Spell! usages: Int! }`.

**Spec più pesanti:** `spell-state.migrator.int-spec.ts` (681 righe, 61 occorrenze), `spell-state.migration.spec.ts` (465), `equip-spell.int-spec.ts` (652), `spell-recovery.service.int-spec.ts` (503), `outcome-plan.spec.ts` (48 occorrenze), `characters.service.spec.ts` (24), `spell-state.wire.int-spec.ts` (243), `character-updated.subscription.int-spec.ts` (18).

**Ordine degli slot.** Oggi `assets.activeSpells` è nell'ordine in cui le magie sono state equipaggiate («ordine degli slot», `spell-state.mapper.ts:22`); con `active` sulle voci l'ordine delle attive diventa quello di apprendimento. È una conseguenza di D-07, da dichiarare nel handoff (Domanda aperta 5).

**Taglio proposto (tsc verde a ogni fine task)** — gli snapshot lean hanno campi opzionali, quindi il compilatore non lega i piani d'esito al modello: l'unico codice che usa le classi del modello è `characters.service.ts` (`findOne`), `spell-state.mapper.ts` e i modelli stessi. Questo permette di contrarre il modello per ultimo.

1. **Passo del migratore + campo additivo** (S/M): `SpellState.active` (`@Prop`, `@Field`, default `false`; SDL additivo), funzione pura di fusione e passo D-07. Nulla legge ancora `active`: tutte le spec restano verdi.
2. **Mutation e recupero** (L): `active-spell.updates`, `spell-state.updates`, `CharactersService` (equip, unequip, use), crediti, `SpellStateMigrator` ridotto al taglio, `starting-character`. I `@Prop` vecchi restano dichiarati. Le spec delle mutation passano alla forma nuova.
3. **Piani d'esito** (L): `spellsSpent`, apprendimento, `unrewarded-plan`, `ambush-plan`, `combat-context`, `gm-overrides`, helper dello snapshot; fixture `test/quests/outcome-world.ts`, `test/quests/unrewarded-plan-input.ts`.
4. **Contrazione** (M): via `status.spells` e `assets.activeSpells` da modello, input, populate, mapper, registro dei ref; `active-spell.model.ts` cancellato; SDL rigenerato; `test/app.int-spec.ts` (righe 446-447, 459-463) e i documenti sul filo (`spell-state.wire.int-spec.ts:19`, `character-updated.subscription.int-spec.ts:40`) RED per primi; `test/fixtures/character.fixture.ts`.

Fra il passo 2 e il 3 il branch è incoerente nel comportamento (equip scrive `active`, gli esiti leggono ancora il mirror) ma verde nei test, perché le spec degli esiti seminano i dati direttamente. Il branch non viene mai eseguito a metà: accettabile, da scrivere nei piani. Dopo il passo 4 una spec che semina ancora la forma vecchia via Mongoose perde i campi (strict) e fallisce: è la rete che trova i lettori dimenticati.

### F-8 — D-08 `maxActiveSpells`

Oggi: `@Field(() => Int) maxActiveSpells: number` **senza `@Prop`** più `schema.virtual('maxActiveSpells')` (`character-status.model.ts:104-116`). Nessun codice di `src` legge la virtual; la leggono due spec: `src/models/character/active-spell-slots.spec.ts:35-44` e `test/fixtures/fixtures.spec.ts:75-78`. Il filtro di `equipSpell` usa `maxActiveSpellsExpression()` e il classificatore `maxActiveSpellsFor` (`active-spell.updates.ts:26, 120`): invariati. [VERIFIED: grep]

Resolve field: precedente esatto in `src/cities/cities.resolver.ts:23-28` (`size`, `hasShop`: puri sul genitore, il campo non è una proprietà della classe `City`). Forma: un resolver `@Resolver(() => CharacterStatus)` con `@ResolveField('maxActiveSpells', () => Int)` che ritorna `maxActiveSpellsFor(status.xp ?? 0, status.title)`; via la proprietà e la virtual dal modello. Va registrato in `CharactersModule` **e** in `test/authz/characters-test-app.ts:60-71` (l'harness non importa `CharactersModule`): senza, in quell'harness il campo non esiste nello schema. Oggi nessuna int-spec seleziona `maxActiveSpells` sul filo: serve un caso nuovo (query e `characterUpdated`).

Sottoscrizioni: il campo dipende solo dal genitore (`xp`, `title`), non dal viewer. Il problema della Phase 16 (contesto WS condiviso fra subscriber per i campi filtrati sul viewer, `ViewerKnowledgeService`) **non si applica**. [VERIFIED: lettura di `quest-no-effect.resolver.ts`, `related-lore.resolvers.ts`, `cities.resolver.ts`]

Migratore: nulla da migrare (il CONTEXT dice «assente su tutti i 6»; il codice conferma che nessuno l'ha mai potuto scrivere via Mongoose). Raccomandato comunque contare nel passo D-07 i documenti con `status.maxActiveSpells` e rimuoverlo se presente (atteso 0).

### F-9 — D-09 `PointOfInterest.quest`

Modello `src/models/point-of-interest.model.ts:4, 26-32` (l'import di `Quest` muore con il campo); SDL `src/schema.gql:521` (`quest: ID`). Lettori: **uno**, `src/cities/city-relations.ts:8` (`populate: { path: 'quest' }` sotto `pointsOfInterest`), usato da `cities.service.ts` e `city-shop.service.ts:36`. Registro: `mixed-ref-paths.ts:65`. Nessun input (`PointOfInterestInput` non esiste). Nessuna asserzione esatta del blocco `PointOfInterest` nel boot reale: va aggiunta. [VERIFIED: grep]

### F-10 — D-10 `City.shop`

| File:riga | Uso |
|-----------|-----|
| `src/models/city.model.ts:49-66` | tre array `default: undefined` (solo Mongoose) |
| `src/shops/shop-pool.rules.ts:7-18` | `ShopPoolLists`, `hasShopOf` (campo `City.hasShop`) |
| `src/shops/shop-pool.report.ts:38-57, 77-91` | `ReportedCity`, `hasPool` (tre liste **presenti, anche vuote**), `violationsOf` |
| `src/shops/shop-pool-report.service.ts:26-32` | `CITY_PROJECTION` |
| `src/shops/city-shop.service.ts:39-46` | `cityShop` |
| `src/economy/trade/trade-pool.ts:18, 27-33` | `poolOfCity` |
| `src/economy/trade/shop-transaction.service.ts:90` | `CITY_POOL_PROJECTION` |
| `test/economy/place-in-city.ts:31-33`, `test/shops/shop-world.fixture.ts:136-208` | fixture |

Conteggio: 10 righe in 7 file non-spec per ciascun nome, 30–39 righe in 11 spec, 13–17 righe in 4 file di `test/` (`shop-world.fixture.ts`, `shop-world.fixture.int-spec.ts`, `city-shops.e2e.int-spec.ts`, `place-in-city.ts`). `src/models/shop-fields.schema.spec.ts` pinna i tre path e «assenti alla creazione»: RED.

La distinzione **assente / presente vuota** è regola (D-22 e D-03 della Phase 12: `hasPool` giudica solo le città con le tre liste presenti). Forma che la conserva: `shop` con `default: undefined` e le tre liste dentro con `default: undefined`. Probe: la rinomina dei tre campi in `shop.equipment`, `shop.loot`, `shop.pets` in una sola scrittura conserva le liste vuote, lascia senza `shop` la città senza pool, e alla seconda corsa non modifica nulla (1 → 0). Il sotto-documento si idrata identico.

`ShopBoot` (`src/shops/maintenance/shop-boot.ts`) legge i pool al boot per il report: se gira prima del passo D-10 logga una volta «167 senza pool» (solo WARN, vedi M-4).

### F-11 — D-11 pulizia

- **`Lore.image`**: modello `src/models/lore.model.ts:16-18`, input `:48-49` (fuori dallo SDL), SDL `src/schema.gql:384`. Nessun lettore in `src` oltre al modello. Spec: `test/app.int-spec.ts:366-367` (blocco esatto `type Lore`), `src/lore/lore-related.int-spec.ts:23, 25` (documenti con `image`), `src/cities/cities.resolver.int-spec.ts:26, 34, 202, 218, 230`. La collection si chiama `lore` (`@Schema({ collection: 'lore' })`).
- **`slot_type.enum.ts`**: 7 importatori non-spec (`combat-resolver.ts:6`, `dungeon-context.ts:2`, `combat-context.ts:7`, `trade-inventory.ts:2`, `equip-item-request.model.ts:4`, `characters.service.ts:22`, `equip-item.updates.ts:5`) e 3 spec (`placeholder-combat-resolver.spec.ts:5`, `characters.service.spec.ts:8`, `equip-item.updates.spec.ts:2`). Il file **non è pulito per Prettier** (doppi apici): `git mv`, poi commit `style`, poi gli import.
- **`item_reference_type.enum.ts`**: 0 byte, 0 importatori. Vedi Domanda aperta 2.
- **`KGNotification`**: solo `src/models/notification.model.ts` (4 occorrenze, tutte nel file), non registrato in `mongo.module.ts`, non nello SDL. Si cancella il file. [VERIFIED: grep]

### F-12 — SDL: asserzioni da aggiornare RED per prime

`src/schema.gql` si rigenera eseguendo il boot reale (`createGraphQLOptions(…, join(process.cwd(), 'src/schema.gql'))`, `src/app.module.ts:84-90`): `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`, poi `git diff src/schema.gql`.

Come la Phase 13 ha dichiarato un cambio non additivo (`infos.enemy` → `infos.enemies`): blocchi **esatti** con `toBe` sul tipo intero (`test/app.int-spec.ts:374-378` `QuestInfos`, `QuestEnemy`), così il campo tolto sparisce dall'atteso; più i `toContain` del caso della FE Phase 14 (righe 682-697). Stessa forma qui.

| File:riga | Asserzione | Decisione |
|-----------|------------|-----------|
| `test/app.int-spec.ts:366-367` | blocco esatto `type Lore` con `image: String` | D-11 |
| `:446-447` | blocco esatto `type CharacterStatus` con `spells: [Spell!]!` | D-07 (D-08 non lo cambia) |
| `:449-450` | blocco esatto `type Pet` | D-03, D-15 |
| `:459-463` | `SpellState` esatto e `ActiveSpell` esatto | D-07 (`ActiveSpell` deve risultare assente) |
| `:623-624` | blocco esatto `type QuestResult` | D-04 (`petXpGained: Int!` fra `outcome` e `quest`) |
| `:662-663` | `Enemy` con `toContain` parziale (resta vero) | D-01: aggiungere il blocco esatto di `Enemy` e di `Weaknesses` |
| `:845-850` | modello del caso «boots without the one-off…» | D-12: aggiungere «mounts the one-off model review migration at boot (D-12)»; l'orchestratore lo capovolge alla rimozione |
| `:953` | `app.get(SpellStateMigrator)` | D-07, solo se la classe cambia nome |
| da aggiungere | blocchi esatti `CharacterAssets`, `Equipment`, `enum SlotType`, `OwnedPet`, `PointOfInterest`; assenza di `WeaknessesInput` | D-03, D-06, D-07, D-09 |

Invariati (verificato): `type City` (`:470-471`, i pool non sono sul filo), `type CityShop` (`:494`).

Altre spec che pinnano il filo o lo schema:

| File:riga | Cosa pinna |
|-----------|-----------|
| `src/migrations/mixed-refs/mixed-ref-paths.spec.ts:161-166` | «34 references in 10 collections»: scende a 31 (via `status.spells`, `assets.activeSpells.spell`, `pointsofinterest:quest`); ogni path elencato deve esistere nello schema come ObjectId |
| `src/travel/ambush/ambush-results.spec.ts:55-84` | lista ordinata delle chiavi del draft |
| `src/models/shop-fields.schema.spec.ts` | i tre path del pool, e `CharacterAssetsSchema` (ownedPets) |
| `src/models/character/active-spell-slots.spec.ts:35-44`, `test/fixtures/fixtures.spec.ts:75-78` | la virtual |
| `src/models/character/spell-state.schema.spec.ts`, `character-status.schema.spec.ts` | schema delle voci e dello stato |
| `src/characters/character-updated.subscription.int-spec.ts:40, 46` | documenti della subscription (magie, pet) |
| `src/characters/spells/spell-state.wire.int-spec.ts:19` | `status { spells … } assets { activeSpells … }` |
| `src/lore/lore-related.int-spec.ts:23, 25`, `src/cities/cities.resolver.int-spec.ts:26` | `image` |

Liste dell'autorizzazione (`test/authz/expected-handlers.ts`, `handler-fixtures.ts`): **non si toccano**, nessuna mutation né handler nuovo (il resolve field non è un handler di query).

### F-13 — Coverage e tempi

Soglie di `package.json` → `jest.coverageThreshold` che la fase tocca: [VERIFIED: lettura]

| Percorso | statements / branches / lines | Decisioni |
|----------|-------------------------------|-----------|
| `./src/characters/spells/` | 97 / 88 / 97 | D-07: la cartella perde ~470 righe di pipeline di riparazione molto coperte; il rapporto può scendere se il codice nuovo ha rami scoperti |
| `./src/characters/characters.service.ts` | 96 / 88 / 98 | D-03, D-06, D-07 |
| `./src/characters/equipment/` | 98 / 98 / 98 | D-06 |
| `./src/economy/` | 98 / 91 / 98 | D-03 (`trade-pets`), D-06, D-10 |
| `./src/shops/` | 97 / 82 / 98 | D-10 |
| `./src/travel/` | 97 / 84 / 98 | D-04 (imboscata) |
| `./src/quests/generation/` | 96 / 82 / 97 | D-01 |

`src/migrations/`, `src/quests/outcomes/`, `src/models/`, `src/lore/`, `src/cities/` non hanno soglia.

Tempi misurati (2026-11-11, cache calda):

| Comando | Suite / test | Tempo |
|---------|--------------|-------|
| `npx jest --selectProjects unit` | 259 / 3 315 | 11,3 s |
| `npx tsc --noEmit -p tsconfig.json` | — | 10,5 s |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 1 / 84 | 7,5 s |
| `npx jest src/characters src/migrations --selectProjects integration --runInBand` | 26 / 396 | 120 s |
| `npx jest src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures --selectProjects integration --runInBand` | 29 / 399 | 108 s |
| `npx jest src/quests --selectProjects integration --runInBand` | 34 / 447 (misura della Phase 18) | ≈ 150 s |

### F-14 — Prettier sui file che la fase tocca

Controllati uno per uno circa 230 file candidati (modelli, personaggi, magie, economia, negozi, città, lore, esiti, combattimento, generatore, imboscate, registro dei ref, fixture, harness, boot reale). **Non puliti:** [VERIFIED: `npx prettier --check <file>`]

| File | La fase lo tocca? |
|------|-------------------|
| `src/models/enums/slot_type.enum.ts` | **sì** (D-06, D-11): commit `style` dopo il `git mv` |
| `src/models/notification.model.ts` | cancellato (D-11): nessun `style` |
| `src/models/common/damages.model.ts` | solo se `WeaknessesInput` o i default finiscono lì: sconsigliato, `Weaknesses` in un file suo |
| `src/models/common/base-damage.model.ts`, `src/models/common/energy-damage.ts`, `src/models/spell.model.ts` | no (solo letti) |
| `src/pets/pets.module.ts`, `src/pointsOfInterest/point-of-interest.module.ts` | no, salvo registrare qualcosa nel modulo |
| `test/harness/replset.int-spec.ts` | no |

Tutti gli altri sono puliti, compresi `enemy.model.ts`, `pet.model.ts`, `character-assets.model.ts`, `character-status.model.ts`, `equipment.model.ts`, `city.model.ts`, `lore.model.ts`, `point-of-interest.model.ts`, `outcome-plan.ts`, `characters.service.ts`, `test/app.int-spec.ts`.

## Migratore (D-12)

### M-1 — Struttura e cablaggio

Precedenti: la 13.1 ha aggiunto passi a `QuestMaintenanceBoot` (`src/quests/maintenance/quest-maintenance.boot.ts`: un orchestratore, passi in ordine, ognuno in `step()` con `try/catch` e `describeError`); la 16 ha un modulo a sé `src/migrations/lore-backfill/` importato solo da `AppModule`. La 19 unisce i due: modulo a sé, orchestratore a passi.

```
src/migrations/model-review/
├── model-review.module.ts            # ModelReviewMigrationModule: forFeature dei modelli letti + boot + passi
├── model-review.boot.ts              # OnApplicationBootstrap: passi in ordine, step() mai bloccante, una riga di log per passo
├── model-review.boot.spec.ts         # ordine, formato dei log, errore con solo nome e codice, nessun modulo feature lo importa
├── enemy-weaknesses.step.ts          # D-01  (+ .spec.ts puro, + .int-spec.ts)
├── enemy-spells.step.ts              # D-02
├── pet-catalog.step.ts               # D-03 catalogo + D-15
├── owned-pets.step.ts                # D-03 personaggi
├── poi-quest.step.ts                 # D-09
├── city-shop.step.ts                 # D-10
├── lore-image-path.step.ts           # D-11
├── worn-equipment.step.ts            # D-06
└── spell-states.step.ts              # D-07 (+ conteggio di status.maxActiveSpells, D-08)
```

Regole del modulo, dai precedenti (`16-10-SUMMARY.md`):

- importato **solo** da `AppModule` (accanto a `QuestMaintenanceModule`, `src/app.module.ts:118`), con il commento «esce dal repo dopo il boot reale»; gli harness non lo eseguono;
- il cablaggio si prova in `test/app.int-spec.ts` con `ModulesContainer` (modello righe 845-850), **mai** in una spec unitaria che importi `AppModule` (trappola della PR #25: in CI non c'è `.env`);
- i nomi delle collection si leggono dal modello (`this.connection.model(X.name).collection`), mai scritti a mano; per questo il modulo registra con `forFeature` i modelli che usa (senza schema registrato `connection.model(name)` lancia `MissingSchemaError`; innocuo in `AppModule`);
- prima riga di ogni file: `// UNA TANTUM (Phase 19 D-12): … esce dal repo dopo il boot reale` (convenzione 13.1, grep di isolamento nel gate);
- log del successo a formato fisso, una riga per passo, soli conteggi; log dell'errore `… fallito (<describeError>), il boot prosegue`.

### M-2 — Passi: forma, guardia di idempotenza, conteggi attesi

Tutte le scritture col driver nativo (probe: via modello non partono). Le forme sotto sono state eseguite dalla probe salvo dove indicato.

| Passo | Collection | Forma | Guardia (seconda corsa = 0 scritture) | Atteso (CONTEXT) |
|-------|-----------|-------|----------------------------------------|------------------|
| D-01 | enemies | una scrittura a pipeline: `weaknesses = { base: baseWeaknesses o [], energy: energyWeaknesses o [] }`, via i due campi | `weaknesses` assente | 206 migrati; 56 con almeno una debolezza |
| D-02 | enemies | lettura dei nemici con almeno una copia incorporata (elemento di tipo oggetto), catalogo `spells` letto una volta, funzione pura `matchEmbeddedSpells(copies, catalog)` (id, poi nome univoco), set della lista di id | nessun elemento di tipo oggetto in `spells` | 45 nemici; non abbinate: da riportare con nome e `_id` del nemico |
| D-03/D-15 catalogo | pets | per documento: `attack = damages o vuoto`, `defense` vuoto **solo se assente**, via `damages`, `xp`, `currentLifePoints` | `damages`, `xp` o `currentLifePoints` presenti | 44 |
| D-03 personaggi | characters | per documento: ogni ref → `{ pet, xp: 0, currentLifePoints: maxLifePoints del catalogo }` (funzione pura con la mappa dei pet) | almeno un elemento di `assets.ownedPets` di tipo ObjectId (o stringa legacy) | 6 letti; migrati = quelli con pet |
| D-09 | pointsofinterest | rimozione di `quest` | `quest` presente | 642 letti, 0 migrati |
| D-10 | cities | rinomina dei tre campi in `shop.equipment`, `shop.loot`, `shop.pets` in una scrittura | uno dei tre campi presente | 167 |
| D-11 | lore | rinomina `image` → `imagePath` | `image` presente e `imagePath` assente; i documenti con entrambi si contano e si lasciano | 521 letti; 438 con immagine |
| D-06 | characters | **due scritture in ordine**: prima `assets.wearedEquipment.foots` → `assets.wearedEquipment.feet`, poi `assets.wearedEquipment` → `assets.wornEquipment` | `assets.wearedEquipment` presente | 6 |
| D-07 | characters | per documento: funzione pura `mergeSpellLists({ spells, spellStates, activeSpells }, catalogMaxUsages)` → lista unica; set di `status.spellStates`, via `status.spells`, `assets.activeSpells` (e `status.maxActiveSpells` se presente) | `status.spells` o `assets.activeSpells` presenti | 6; conflitti di `usages`: contati |

Dettagli che la probe ha fissato:

- **D-06:** le due rinomine nella stessa scrittura falliscono (`Updating the path 'assets.wearedEquipment.foots' would create a conflict at 'assets.wearedEquipment'`); in due scritture, interna e poi esterna, funzionano e alla seconda corsa danno 0 e 0.
- **D-07, marcatore di idempotenza:** la presenza di `active` sulle voci **non** è un marcatore affidabile (una voce scritta dal codice nuovo prima del passo, o idratata, può averlo). Il marcatore è l'esistenza dei due campi vecchi, tolti nella stessa scrittura.
- **D-07, voce mancante:** «stesso indice, altrimenti per id»; se la voce manca del tutto (personaggio mai riparato) la regola di oggi è usi dal mirror, poi `maxUsages` del catalogo, poi 0 (`spellStatesRepairPipeline`, righe 177-196): la funzione pura la replica. Un `activeSpells` che punta a una magia non conosciuta non crea voci (oggi è «incoerente non riparabile»): si conta.
- **D-03 personaggi, pet orfano:** un ref a un pet non più a catalogo non ha `maxLifePoints`. Raccomandato: voce con `currentLifePoints: 0`, contata come «senza corrispondenza» (non si inventa, non si perde il possesso); il filo la scarta (Pitfall 5). [ASSUMED — Domanda aperta 9]
- **Personaggi archiviati:** a differenza del backfill della 16 (solo attivi), qui il passo deve prendere **tutti** i documenti, archiviati compresi (6 = 3 attivi + 3 archiviati nel CONTEXT): un archiviato lasciato nella forma vecchia terrebbe per sempre i campi tolti. Nessun filtro `ACTIVE_CHARACTER_FILTER`.
- **Ordine dei passi:** nessuna dipendenza fra passi diversi (il passo dei personaggi legge `maxLifePoints`, che il passo del catalogo non tocca). Vincolo solo **dentro** D-06. Ordine consigliato = D-13, per log leggibili.
- **Versione di MongoDB:** le scritture a pipeline chiedono MongoDB ≥ 4.2, la stessa soglia già dichiarata dalla migrazione dei ref (`spell-state.migration.ts:5`, `run-mixed-refs.ts` `UnsupportedMongoVersionError`). [VERIFIED: lettura] La versione del server reale non è stata letta.

### M-3 — Come si prova con lo schema nuovo

- **Fixture nella forma vecchia: solo `collection.insertOne` / `insertMany`.** Probe: `Model.create` con `status.spells`, `assets.wearedEquipment`, `assets.activeSpells` salva il documento **senza** quei campi (strict). I builder di `test/fixtures/` producono la forma nuova: per la forma vecchia serve un builder dedicato dentro la cartella del migratore (`legacy-fixtures.ts`, anch'esso una tantum), così esce dal repo con lui.
- **Letture di verifica col driver nativo** (`collection.findOne`): l'idratazione nasconde i campi fuori schema e applica i default, quindi non prova nulla.
- **Idempotenza:** ogni passo ritorna i conteggi; il caso «changes nothing on a second run (D-NN)» confronta il secondo report con zero scritture **e** il documento grezzo prima e dopo con `toEqual`.
- **Harness:** `createAuthTestApp({ imports: [MongooseModule.forFeature([...])], providers: [<Step>] })` + `harness.app.get(<Step>)`, come `lore-backfill.migrator.int-spec.ts` (7 casi in ~1 s). Niente Redis.
- **Boot:** `model-review.boot.spec.ts` con i passi finti (`new Boot({ run } as never, …)`), spy su `Logger.prototype`, errore con `uri-segreta-da-non-loggare` che non compare nel log (modello `quest-maintenance.boot.spec.ts`).
- **Boot reale di test:** il passo gira sul replica set vuoto di `test/app.int-spec.ts` e non deve fallire su collection vuote.

### M-4 — Finestra del boot e altri hook

I passi girano in `onApplicationBootstrap`, come gli altri hook di boot. Nello stesso momento partono: `SpellStateMigrator` (taglio), `ShopBoot` (report dei pool), `MixedRefsVerifier` (sola lettura), gli sweep di viaggi, imboscate e recuperi, i processor Bull. Conseguenze verificate con la probe sulla lettura di dati non ancora migrati col codice nuovo:

| Dato non migrato letto dal codice nuovo | Effetto |
|------------------------------------------|---------|
| `Enemy.weaknesses` assente | idratato `{ base: [], energy: [] }` (con default a funzione): nessun errore |
| `Enemy.spells` incorporate | populate → `[]`: nessun errore |
| `City.shop` assente | negozio chiuso, `ShopBoot` logga «167 senza pool» una volta |
| `assets.ownedPets` di soli id, idratato | voci **spazzatura** (`{ xp: 0, buffer: … }`): `OwnedPet.pet` nullo sul filo finché il passo non gira; lean → id nudi |
| `spellStates` senza `active` | idratate `active: false`: nessuna magia equipaggiata finché il passo non gira |
| esito risolto nella finestra con pet in premio | array misto → errore di cast → la transazione fallisce e lo sweep riprova dopo il passo (si ripara da sé) |

La finestra dura il tempo dei passi (6 personaggi, 206 nemici: sotto il secondo). Mitigazione nel runbook: boot a BE dell'utente fermo, nessun client collegato, secondo boot come verifica (tutti i passi a zero). Non serve codice tollerante alle due forme.

**Il pericolo vero è il contrario** (Pitfall 1): codice vecchio su dati nuovi.

### M-5 — Rimozione (orchestratore, dopo il boot reale)

Modello `80c3bf7` → `0125058` della 16 e `3bdf65a` → `64ef914` della 13.1:

1. RED in `test/app.int-spec.ts`: il caso «mounts the one-off model review migration at boot (D-12)» diventa «boots without the one-off model review migration (19 D-12)» (`ModulesContainer` senza `ModelReviewMigrationModule`); commit `test(migrations): …`.
2. `refactor(migrations): drop the 19 one-off model review after its run`: cancella `src/migrations/model-review/` e l'import con il commento in `src/app.module.ts`.
3. `npx tsc --noEmit -p tsconfig.json` 0, boot reale di test verde, `git diff --exit-code src/schema.gql` 0; terzo boot reale senza le righe dei passi.

Nessun piano della fase esegue questi tre punti: il piano di handoff ne scrive il runbook con i conteggi attesi di M-2.

## Architecture Patterns

### Pattern 1: un piano per decisione, quattro strati

Modello (`@Prop`/`@Field`, input) → lettori e scrittori → fixture e spec → SDL rigenerato e blocco esatto nel boot reale → passo del migratore. Il RED parte dal boot reale (blocco esatto) e dalla spec dello schema.

### Pattern 2: funzione pura + applicazione col driver nativo (migratore)

Ogni passo che ragiona (D-02, D-03 personaggi, D-07) ha una funzione pura testata a tabella senza database e un'applicazione sottile che legge, chiama la funzione e scrive. I passi che sono una sola scrittura (D-01, D-06, D-09, D-10, D-11) hanno solo la int-spec.

### Pattern 3: array intero dallo snapshot in sessione (esiti)

`planParticipant` e `planAmbushOutcome` calcolano i valori finali dallo snapshot letto in sessione e li scrivono interi; un campo entra nel set solo se cambia. `ownedPets` segue la stessa regola di `spellStates`.

### Pattern 4: resolve field puro sul genitore

`maxActiveSpells` come `size`/`hasShop` di `City`: nessuna dipendenza dal viewer, nessuna cache.

### Anti-Patterns to Avoid

- **Lasciare la pipeline di riparazione di `SpellStateMigrator` dopo aver tolto `status.spells`:** azzera le magie al primo credito.
- **`Model.updateMany` nel migratore** o `Model.create` per le fixture vecchie: non scrivono ciò che sembra.
- **Path posizionale e array intero di `ownedPets` nella stessa scrittura.**
- **Popolare un path tolto dallo schema** (`pointsOfInterest.quest`, `status.spells`): `StrictPopulateError`.
- **Lasciare il filtro d'array `a` dopo aver tolto il mirror:** MongoDB rifiuta un filtro d'array non usato.
- **Codice tollerante alle due forme «per la finestra del boot»:** resterebbe nel repo dopo la rimozione del migratore.
- **File di contenuto o valori di `maxXp`/`defense` nei piani** (D-36).

## Don't Hand-Roll

| Problema | Non costruire | Usare | Perché |
|----------|---------------|-------|--------|
| Confronto di ref in forme diverse | `String(a) === String(b)` | `sameId`, `refIdOf`, `idForms` (`src/mongo/document-id.ts`) | coprono ObjectId, stringa legacy, documento popolato |
| Log degli errori del boot | messaggio dell'eccezione | `describeError` (`src/mongo/mongo-errors.ts`) | mai URI né host nei log |
| Orchestrazione dei passi | catena di `await` nuda | `step(label, work)` di `QuestMaintenanceBoot` | un passo fallito non ferma gli altri né il boot |
| Slot delle magie | conteggio in JavaScript | `maxActiveSpellsExpression()` nel filtro | la capacità si valuta sul documento vivo (04 D-10) |
| Liste dei conosciuti dei nemici/lore | nuove strutture | `knowledgeUpdateOf` (già nel piano) | invariato, non toccare |
| Prova di assenza di un campo | grep sul letterale | `Object.keys(doc).sort()` o `toEqual` sul documento grezzo | regola di REPO-RULES |

## Conflicts

1. **D-04 «filtro posizionale sull'id del pet» vs la forma del piano d'esito.** Il piano scrive array interi dallo snapshot in sessione e lo scrittore (`OutcomeWriterService.writeCharacterUpdate(filter, update, session)`) non accetta `arrayFilters`; inoltre il pet in premio scrive già l'array intero di `ownedPets` e i due operatori confliggono (probe). Raccomandato: array intero. Il vincolo di D-04 che conta («nella stessa scrittura dell'esito») è rispettato. Il precedente «filtri posizionali sugli array di sotto-documenti» citato dal CONTEXT è delle mutation (`useSpell`), non degli esiti.
2. **D-08 «il `@Prop` sparisce».** Non c'è nessun `@Prop` da togliere: è una virtual. Il lavoro è virtual → resolve field.
3. **D-09 «`PointOfInterestInput`».** Non esiste.
4. **D-11 «`item_reference_type.enum.ts` → `item-reference-type.enum.ts` (soli import)».** Il file è vuoto e nessuno lo importa.
5. **D-01/D-03/D-06/D-11 «anche in `EnemyInput` / `PetInput` / `EquipmentInput` / `LoreInput`».** Le classi esistono e si aggiornano, ma non sono nello SDL: il boot reale deve asserire l'**assenza** di `WeaknessesInput`, non la presenza.
6. **D-07 «`equipSpell`/`unequipSpell` scrivono `active`» e ordine degli slot.** L'ordine delle magie attive oggi è quello di equipaggiamento; diventa quello di apprendimento.
7. **D-12 elenco dei passi.** Manca D-15 (stesso documento del catalogo pet di D-03: un solo passo) e D-08 non ha dati da migrare.

## Common Pitfalls

### Pitfall 1: il migratore permanente delle magie azzera `spellStates`
**Cosa succede:** `SpellStateMigrator.migrateAll` (boot) e `migrateOne` (prima di ogni credito) applicano `spellStatesRepairPipeline` ai personaggi «incoerenti»; senza `status.spells` la lista dei conosciuti è vuota e la riparazione scrive una lista vuota. Senza `assets.activeSpells` **ogni** personaggio è incoerente (`$type` diverso da array).
**Come evitarlo:** nello stesso piano degli scrittori (F-7 passo 2) togliere `unmigratedFilter`, `inconsistentFilter`, `spellStatesRepairPipeline`, `spellStatesConsistentExpr`; tenere `outOfRangeFilter`, `spellStatesTrimPipeline`, `isSpellStateOutOfRange`; in `spellStatesTrimPipeline` (righe 258-266) aggiungere `active` alla voce ricostruita. Sul database reale: fermare il processo dell'utente prima del boot, mai riavviare codice pre-19 dopo la migrazione.
**Segnali:** un personaggio che perde tutte le magie dopo un recupero; WARN «Stati delle magie riparati per N personaggi» in un log post-migrazione.

### Pitfall 2: filtro d'array non usato
**Cosa succede:** `spellStateArrayFilters` passa `s` e `a`; tolto il mirror dagli update, MongoDB risponde «The array filter for identifier 'a' was not used in the update». [ASSUMED: comportamento noto di MongoDB, non eseguito nella probe]
**Come evitarlo:** update e filtri d'array cambiano nello stesso commit; le int-spec di `useSpell` e dei crediti lo trovano subito.

### Pitfall 3: `tsc` non vede i lettori dimenticati
**Cosa succede:** snapshot lean con campi opzionali e path a stringa: un lettore di `assets.activeSpells` o di `wearedEquipment` compila anche dopo la rinomina e legge `undefined`.
**Come evitarlo:** gate per piano con `grep -rn "<nome vecchio>" src test --include='*.ts'` che deve stampare solo il migratore; fixture nella forma nuova (strict scarta la vecchia e le spec falliscono).

### Pitfall 4: conflitto fra pet in premio e xp del compagno
**Cosa succede:** due operatori sullo stesso array nella stessa scrittura falliscono (probe).
**Come evitarlo:** un solo valore finale di `assets.ownedPets` calcolato nel piano.

### Pitfall 5: voce di `ownedPets` con pet orfano
**Cosa succede:** `OwnedPet.pet: Pet!` nullo dentro `[OwnedPet!]!` annulla `assets` e con lui il personaggio sul filo.
**Come evitarlo:** in `CharactersService.findOne`, dopo il populate, togliere dal filo le voci senza pet popolato (stessa logica di `spellsOnTheWire` per le magie orfane e di `withoutUnresolvedQuestRefs` per le quest). Il documento a DB non si tocca.

### Pitfall 6: debolezze fuori enum
**Cosa succede:** oggi `[String!]!` lascia passare qualunque stringa; con `[DamageType!]!`/`[EnergyType!]!` un valore non previsto fa fallire la serializzazione, annulla l'`Enemy!` e, dentro `[QuestEnemy!]!`, l'intera lista delle quest.
**Come evitarlo:** il passo D-01 conta i valori fuori enum e li riporta (senza correggerli: «non inventa»); la prova a secco dell'orchestratore deve dare 0 prima del boot (Domanda aperta 8). In alternativa il planner può far scartare i valori ignoti alla lettura (sanificazione come `cureOf` nella Phase 18), a costo di nascondere l'errore di contenuto.

### Pitfall 7: `StrictPopulateError` su path tolti
**Cosa succede:** `populate` di `status.spells` o di `pointsOfInterest.quest` dopo la rimozione dal modello lancia (probe).
**Come evitarlo:** `characters.service.ts:105-108` e `city-relations.ts:8` cambiano nello stesso commit del modello.

### Pitfall 8: `hasPool` e la distinzione assente / vuota
**Cosa succede:** un sotto-documento `shop` con default `{}` o liste con default `[]` farebbe risultare «con pool» tutte le 167 città, e il report le giudicherebbe tutte.
**Come evitarlo:** `default: undefined` su `shop` e sulle tre liste; `src/models/shop-fields.schema.spec.ts` riscritto sui path nuovi con gli stessi due casi (assenti alla creazione, vuota resta vuota).

### Pitfall 9: resolve field non registrato negli harness
**Cosa succede:** `createCharactersTestApp` non importa `CharactersModule`; senza il resolver nei suoi provider il campo `maxActiveSpells` non esiste in quello schema.
**Come evitarlo:** registrarlo nell'harness nello stesso piano; un caso sul filo che lo seleziona.

### Pitfall 10: report d'imboscata trattenuti prima del deploy
**Cosa succede:** i report in `ambushReports` scritti dal codice vecchio non hanno `petXpGained`.
**Come evitarlo:** `?? 0` in `resultDraftOf` e un caso «delivers an old held report…» come quello di `loreUnlocked` (`ambush-results.spec.ts`, caso dopo la riga 84).

### Pitfall 11: modello e draft di `petXpGained` in commit diversi
Come `injuriesHealed` nella Phase 18: `tsc` fallisce in `quest-result.populate.ts` finché `QuestResultDraft` non porta il campo.

### Pitfall 12: il registro dei ref conta i path
`mixed-ref-paths.spec.ts` verifica che ogni path elencato esista nello schema e che siano 34: ogni piano che toglie o rinomina un ref (D-06, D-07, D-09) aggiorna registro e conteggio nello stesso commit (34 → 33 con D-09, poi i 9 path dello slot rinominati con D-06, poi 31 con D-07).

### Pitfall 13: `git mv` di un file non pulito
`slot_type.enum.ts` fallisce Prettier: il commit della rinomina deve contenere solo lo spostamento (git lo riconosce come rename), poi `style`, poi gli import; altrimenti la storia del file si perde.

## Code Examples

### Sotto-documento con default che regge alla finestra pre-migrazione
```typescript
// modello di riferimento: src/models/common/damages.model.ts (liste default [])
@ObjectType()
@Schema({ _id: false })
export class Weaknesses {
    @Field(() => [DamageType])
    @Prop({ type: [String], enum: Object.values(DamageType), default: [] })
    base: DamageType[];

    @Field(() => [EnergyType])
    @Prop({ type: [String], enum: Object.values(EnergyType), default: [] })
    energy: EnergyType[];
}
// sul nemico: @Prop({ type: WeaknessesSchema, default: () => ({}) })
```

### Voce del pet posseduto
```typescript
// stile di assetQuantitySchemaAt / SpellState: _id false, ref tipizzato (mai Mixed: mixed-ref-paths.spec lo verifica)
@ObjectType()
@Schema({ _id: false })
export class OwnedPet {
    @Field(() => Pet)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Pet.name, required: true })
    pet: Types.ObjectId | Pet;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    xp: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    currentLifePoints: number;
}
```

### Premio del compagno (forma raccomandata)
```typescript
export const PET_XP_SHARE = 0.1;

// nomi e firma fissati da 19-REPO-RULES; il ritorno è una raccomandazione (Domanda aperta 6)
export function petXpAward(
    enemiesXp: number,
    currentXp: number,
    maxXp: number,
): { xp: number; gained: number } {
    const share = Math.round(Math.max(0, enemiesXp) * PET_XP_SHARE);
    const xp = Math.max(currentXp, Math.min(maxXp, currentXp + share));
    return { xp, gained: xp - currentXp };
}
```

### Passo a due rinomine (D-06), col driver nativo
```typescript
// probe: nella stessa scrittura le due rinomine confliggono; in ordine, seconda corsa 0 e 0
const characters = this.connection.model(Character.name).collection;
const slot = await characters.updateMany(
    { 'assets.wearedEquipment.foots': { $exists: true } },
    { $rename: { 'assets.wearedEquipment.foots': 'assets.wearedEquipment.feet' } },
);
const field = await characters.updateMany(
    { 'assets.wearedEquipment': { $exists: true } },
    { $rename: { 'assets.wearedEquipment': 'assets.wornEquipment' } },
);
```

### Resolve field puro
```typescript
// modello: src/cities/cities.resolver.ts:23-28
@Resolver(() => CharacterStatus)
export class CharacterStatusResolver {
    @ResolveField('maxActiveSpells', () => Int)
    maxActiveSpells(@Parent() status: CharacterStatus): number {
        return maxActiveSpellsFor(status.xp ?? 0, status.title);
    }
}
```

## State of the Art

| Vecchio | Nuovo | Da quando | Impatto |
|---------|-------|-----------|---------|
| tre liste delle magie con mirror e riparazione al boot (Phase 9.1) | una lista con `active` | Phase 19 | la riparazione permanente muore; resta il taglio |
| stato del pet a catalogo | stato per pet posseduto | Phase 19 | il catalogo torna condivisibile |
| debolezze come stringhe sul filo | enum | Phase 19 | due blocchi enum nuovi nello SDL |

**Deprecato dalla fase:** `spellStatesOrMigrated`, `mirrorFromStates`, `NO_SPELL_MAX_USAGES` (serviva solo alla base migrata in memoria), `spellStatesRepairPipeline`, `unmigratedFilter`, `inconsistentFilter`, `ActiveSpell`, `ActiveSpellInput`, la virtual `maxActiveSpells`.

## Assumptions Log

| # | Affermazione | Sezione | Rischio se sbagliata |
|---|--------------|---------|----------------------|
| A1 | L'ordine dei campi e dei blocchi nello SDL rigenerato è alfabetico come atteso (`Weaknesses`, `OwnedPet`, `petXpGained` fra `outcome` e `quest`, blocchi `enum DamageType`/`EnergyType`) | F-1, F-4, F-12 | le stringhe esatte nei piani vanno corrette alla rigenerazione |
| A2 | `petXpAward` ritorna `{ xp, gained }` con il guadagno effettivo; `maxXp` non numerico = nessun premio | F-5 | semantica di `petXpGained` diversa da quella che la FE mostra |
| A3 | Un pet posseduto orfano migra a `currentLifePoints: 0` e resta a DB | M-2 | l'utente potrebbe volerlo togliere |
| A4 | Le copie incorporate delle magie dei nemici possono non avere `_id` | F-2 | nessuno: il passo copre entrambe le forme |
| A5 | MongoDB rifiuta un filtro d'array non usato nell'update | Pitfall 2 | nessuno: il cambio è comunque atomico |
| A6 | Il server reale è MongoDB ≥ 4.2 | M-2 | le scritture a pipeline (D-01) fallirebbero: ripiego in JavaScript per documento |
| A7 | Il completamento del GM, il soccorso vinto e lo scontro di guardia vinto premiano il compagno come ogni vittoria con nemici | F-5 | regola di prodotto più larga di quella elencata in D-04 |
| A8 | I personaggi archiviati si migrano come gli attivi | M-2 | conteggi attesi diversi (3 invece di 6) |

## Open Questions (RESOLVED)

1. **Imboscata e `petXpGained`.** L'imboscata produce un `QuestResult`, ma all'arrivo: il valore passa dal report trattenuto (`AmbushReportSnapshot`, solo Mongoose) al risultato. Sullo SDL `AmbushReport` non cambia e i report trattenuti prima del deploy valgono 0. Va bene così, o la FE vuole il dato anche prima dell'arrivo? Raccomandazione: così. **RESOLVED: D-19.**
2. **`item_reference_type.enum.ts` è vuoto e senza importatori.** Cancellarlo (raccomandato) invece di rinominarlo? In alternativa spostarci il tipo `ItemReferenceType` da `asset-quantity.model.ts` (13 importatori da cambiare: fuori dallo spirito «soli import»). **RESOLVED: D-20.**
3. **`SlotType.foots` → `feet` è un valore sul filo** (`equipItem`, `EquipItemRequest.slotType`): da aggiungere alla tabella dei nomi e al handoff (la FE lo invia). **RESOLVED: D-24.**
4. **Due blocchi enum nuovi nello SDL** (`DamageType`, `EnergyType`) come effetto di `Weaknesses`: da dichiarare fra gli aggiunti. **RESOLVED: D-24.**
5. **Ordine delle magie attive**: da ordine di equipaggiamento a ordine di apprendimento. Accettato? **RESOLVED: D-16.**
6. **Semantica di `petXpGained`**: guadagno effettivo dopo il tetto (raccomandato, come `xpGained`) o quota calcolata? E con `maxXp` non valido a catalogo: nessun premio (raccomandato)? **RESOLVED: D-17.**
7. **Vittorie «con nemici» oltre le quattro elencate**: completamento del GM, soccorso vinto, scontro di guardia vinto passano dalla stessa somma e premierebbero il compagno. Confermare. **RESOLVED: D-18.**
8. **Conteggi freschi a DB (sola lettura, orchestratore) prima di pianificare o nella prova a secco:** valori distinti di `energyWeaknesses` e `baseWeaknesses` fuori dai due enum; copie di magie dei nemici con `_id` che coincide col catalogo, abbinabili solo per nome, non abbinabili; nomi duplicati nel catalogo delle 96 magie; pet con `damages` nullo o assente; città con solo una o due delle tre liste; lore con `image` e `imagePath` insieme; personaggi con `assets.pet` non presente in `ownedPets` o con pet orfani; personaggi con `status.maxActiveSpells` o con `activeSpells` che puntano a magie non conosciute; versione del server. **RESOLVED: inventario dell'11 novembre in 19-REPO-RULES.md.**
9. **Pet posseduto orfano nel migratore**: voce con vita 0 e conteggio nel log (raccomandato) o voce scartata? **RESOLVED: D-23.**
10. **`SpellStateMigrator`**: ridotto al solo taglio (raccomandato) o tolto del tutto? Se resta, tiene il nome (e `test/app.int-spec.ts:953` non cambia). **RESOLVED: D-21.**
11. **Nomi interni del motore** (`CombatEnemy.baseWeaknesses`/`energyWeaknesses`, `CombatParticipant.activeSpells`): rinominare le debolezze in `weaknesses { base, energy }` (raccomandato) e lasciare `activeSpells` (è il vocabolario del motore dell'utente)? **RESOLVED: D-22.**

## Environment Availability

| Dipendenza | Serve a | Disponibile | Versione | Ripiego |
|------------|---------|-------------|----------|---------|
| Node.js | tutto | ✓ | v22.12.0 | — |
| `MongoMemoryReplSet` | integration, migratore | ✓ (suite eseguite) | mongodb-memory-server ^11.2.0, MongoDB 8.2.6 nella probe | — |
| Redis in memoria dei test | boot reale | ✓ (`test/app.int-spec.ts` eseguito) | — | — |
| MongoDB reale, `mongodump` | boot reale e backup (orchestratore) | non verificato (vietato agli esecutori) | — | — |

Nessuna dipendenza mancante per i piani.

## Validation Architecture

### Test Framework

| Proprietà | Valore |
|-----------|--------|
| Framework | Jest 30 + ts-jest, progetti `unit` (`*.spec.ts`) e `integration` (`*.int-spec.ts`) in `package.json` → `jest.projects` |
| Config | `package.json`; setup integration in `test/setup/` |
| Comando rapido | `npx jest <spec> --selectProjects unit` / `npx jest <spec> --selectProjects integration --runInBand` |
| Suite completa | `npm run test:cov` (≈ 630 s: orchestratore, in background); ripiego del gate: unit completo (≈ 11 s) più i tre blocchi integration di F-13 |

### Phase Requirements → Test Map

| Req ID | Comportamento | Tipo | Comando automatico | Il file esiste? |
|--------|---------------|------|--------------------|-----------------|
| BE-MODEL-01 | Schema `weaknesses` (default, enum) | unit | `npx jest src/models/enemy.schema.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-MODEL-01 | Generatore e combattimento leggono il sotto-documento | unit | `npx jest src/quests/generation/recommended-loot.spec.ts src/quests/generation/enemy-candidate.spec.ts src/quests/outcomes/combat/combat-context.spec.ts --selectProjects unit` | ✅ (RED) |
| BE-MODEL-01 | Passo D-01: copia, rimozione, seconda corsa, valori fuori enum contati | integration | `npx jest src/migrations/model-review/enemy-weaknesses.step.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-MODEL-02 | Abbinamento per id, per nome, nome ambiguo, non abbinata | unit | `npx jest src/migrations/model-review/enemy-spells.step.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-MODEL-02 | `enemy`, `enemys`, quest e foglio servono `spells` popolate | integration | `npx jest src/quests/quests.resolver.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-MODEL-03 | Schema `OwnedPet`, `Pet.attack`/`defense`, ref non Mixed | unit | `npx jest src/models/shop-fields.schema.spec.ts src/migrations/mixed-refs/mixed-ref-paths.spec.ts --selectProjects unit` | ✅ (RED) |
| BE-MODEL-03 | Acquisto, vendita, già posseduto, vendita del compagno equipaggiato | unit + integration | `npx jest src/economy/trade/trade-pets.spec.ts --selectProjects unit`; `npx jest src/economy/trade/shop-transaction.service.int-spec.ts src/characters/pets/equip-pet.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-03 | Pet in premio come voce, `ownedPets` sul filo e sulla subscription, orfani scartati | integration | `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-03 | Passi dei pet (catalogo e personaggi), seconda corsa | integration | `npx jest src/migrations/model-review/pet-catalog.step.int-spec.ts src/migrations/model-review/owned-pets.step.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-MODEL-04 | `petXpAward`: 10 %, arrotondamento, tetto, già al tetto, nessun nemico | unit | `npx jest src/quests/outcomes/pets/pet-xp.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-MODEL-04 | Piano: compagno equipaggiato, nessun compagno, sconfitta, pet in premio nello stesso esito, senza `xpPrize` | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/travel/ambush/ambush-plan.spec.ts src/travel/ambush/ambush-results.spec.ts --selectProjects unit` | ✅ (casi nuovi, lista di chiavi RED) |
| BE-MODEL-04 | Esito con compagno → `petXpGained` e voce aggiornata; imboscata vinta → risultato all'arrivo | integration | `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts src/travel/ambush/ambush-resolution.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-MODEL-05 | `equipItem` sullo slot `feet`, vendita che libera lo slot, combattimento | unit + integration | `npx jest src/characters/equipment/equip-item.updates.spec.ts src/economy/trade/trade-inventory.spec.ts --selectProjects unit`; `npx jest src/characters/equipment/equip-item.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-05 | Passo D-06: due rinomine, seconda corsa | integration | `npx jest src/migrations/model-review/worn-equipment.step.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-MODEL-06 | Fusione delle tre liste: stesso indice, per id, voce mancante, conflitto di usi, mirror su magia non conosciuta | unit | `npx jest src/migrations/model-review/spell-states.step.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-MODEL-06 | Equip, unequip, uso, capacità sotto concorrenza, codici invariati | unit + integration | `npx jest src/characters/spells --selectProjects unit`; `npx jest src/characters/spells --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-06 | Crediti di recupero senza riparazione; taglio che conserva `active` | integration | `npx jest src/characters/spells/spell-recovery.service.int-spec.ts src/characters/spells/spell-state.migrator.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-06 | Apprendimento con `active: false`, spesa in combattimento sulle sole attive | unit + integration | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/combat/combat-context.spec.ts --selectProjects unit`; `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-06 | `maxActiveSpells` calcolato sul filo e sulla subscription | integration | `npx jest src/characters/spells/spell-state.wire.int-spec.ts --selectProjects integration --runInBand` | ✅ (caso nuovo) |
| BE-MODEL-07 | `cityShop`, report, acquisto dal sotto-documento; assente / vuota | unit + integration | `npx jest src/shops src/economy/trade/trade-pool.spec.ts src/models/shop-fields.schema.spec.ts --selectProjects unit`; `npx jest src/shops test/shops --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-07 | `cities` senza populate di `quest`; passi D-09 e D-10 | integration | `npx jest src/cities/cities.resolver.int-spec.ts src/migrations/model-review/city-shop.step.int-spec.ts src/migrations/model-review/poi-quest.step.int-spec.ts --selectProjects integration --runInBand` | ✅ / ❌ Wave 0 |
| BE-MODEL-08 | `Lore.imagePath` sul filo; passo D-11 | integration | `npx jest src/lore/lore-related.int-spec.ts src/migrations/model-review/lore-image-path.step.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) / ❌ Wave 0 |
| BE-MODEL-08 | File enum rinominati, `KGNotification` assente | unit | `npx tsc --noEmit -p tsconfig.json` più `test ! -e src/models/notification.model.ts` | — |
| BE-MODEL-09 | Boot: ordine dei passi, log di soli conteggi, errore non bloccante, isolamento | unit | `npx jest src/migrations/model-review/model-review.boot.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-MODEL-09 | Boot reale: modulo montato, SDL verbatim (tolti e aggiunti) | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED) |
| BE-MODEL-09 | Handoff con la tabella vecchio → nuovo e il runbook | manuale (documento) | `grep -c "wornEquipment" .planning/phases/19-revisione-dei-modelli/BACKEND-NOTES.md` | ❌ piano di chiusura |

**Solo manuale:** boot reale, backup, prova a secco, rimozione del modulo (orchestratore); `maxXp` e `defense` a DB (contenuto dopo la merge).

### Sampling Rate

- **Per task:** la spec mirata più `npx tsc --noEmit -p tsconfig.json`, poi `pgrep -fl 'bin/jest'` vuoto.
- **Per piano:** `npx jest --selectProjects unit` (≈ 11 s), `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (≈ 8 s), il blocco integration dell'area (F-13) e il grep del nome vecchio.
- **Gate di fase:** unit completo, i tre blocchi integration di F-13, boot reale verde, `git diff --exit-code src/schema.gql`, grep di tutti i nomi vecchi fuori da `src/migrations/model-review/`; `test:cov` dell'orchestratore in background.

### Wave 0 Gaps

- [ ] `src/migrations/model-review/` — modulo, boot, nove passi con le loro spec e `legacy-fixtures.ts` (forma vecchia col driver nativo)
- [ ] `src/models/enemy.schema.spec.ts` — schema delle debolezze e delle magie per riferimento
- [ ] `src/quests/outcomes/pets/pet-xp.spec.ts` — funzione pura del premio
- [ ] `test/fixtures/`: `buildEnemy` (`weaknesses`), `buildPet` (`attack`, `defense`, senza `xp`/`currentLifePoints`), `buildCharacter` (`wornEquipment`, `ownedPets` a voci, senza `spells`/`activeSpells`), un builder della voce `OwnedPet`, `place-in-city` e `shop-world.fixture` su `shop`
- [ ] `test/authz/characters-test-app.ts` — resolver di `maxActiveSpells`
- [ ] Caso sul filo che seleziona `maxActiveSpells`

Harness: nessuno nuovo (`createAuthTestApp`, `createCharactersTestApp`, `createOutcomeHarness`, boot reale).

## Security Domain

### Applicable ASVS Categories

| Categoria ASVS | Si applica | Controllo |
|----------------|-----------|-----------|
| V2 Authentication | no | nessun cambio |
| V3 Session Management | no | nessun cambio |
| V4 Access Control | sì (invariato) | le mutation tengono `@OwnsCharacter` e i ruoli: nessun handler nuovo, liste di `test/authz/` intatte |
| V5 Input Validation | sì | `SlotType` resta un enum GraphQL (un `foots` inviato dopo il deploy è `BAD_USER_INPUT`); `objectIdFromHex` invariato |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Mitigazione |
|---------|--------|-------------|
| Migratore che scrive sul database reale | Tampering | passi idempotenti con guardia, driver nativo mirato, backup prima del boot, prova su fixture, seconda corsa a zero |
| Codice vecchio su dati migrati (Pitfall 1) | Tampering / DoS | runbook: processo fermato, nessun rollback di codice senza ripristino del dump |
| Log del boot con dati | Information disclosure | soli conteggi; `describeError`; caso con il segreto finto nel messaggio |
| Passo fallito che ferma il boot | Denial of service | `step()` con `try/catch` |
| Codice una tantum che resta nel repo | Tampering (processo) | modulo importato solo da `AppModule`, intestazione `UNA TANTUM`, rimozione in TDD prima della merge, PR in draft fino ad allora |
| Client che gonfia gli xp del pet | Elevation of privilege | il premio nasce solo nel piano d'esito server-side; nessun input lo porta |
| Lista annullata sul filo da un valore fuori enum o da un orfano | Denial of service | Pitfall 5 e 6: orfani tolti dal filo, valori fuori enum contati prima del boot |

## Suggested Plan Breakdown

Esecuzione sequenziale su un solo albero: le wave indicano solo le dipendenze (D-13). Taglie: S ≤ 6 file, M ≤ 20, L oltre.

| Wave | Piano | Taglia | Contenuto | File caldi |
|------|-------|--------|-----------|------------|
| 1 | 19-01 | S | Scheletro del migratore: modulo, boot a passi, formato dei log, `legacy-fixtures.ts`, import in `AppModule`, caso «mounts…» nel boot reale | `src/app.module.ts`, `test/app.int-spec.ts` |
| 1 | 19-02 | M | D-01 `Enemy.weaknesses`: modello, `WeaknessesInput`, 6 lettori, 14 spec, 3 fixture, SDL, passo | `enemy.model.ts`, `schema.gql`, `test/app.int-spec.ts` |
| 1 | 19-03 | M | D-02 magie dei nemici per riferimento: modello, 3 punti di populate, passo con abbinamento | `enemy.model.ts`, `quest-catalog.populate.ts` |
| 1 | 19-04 | S/M | D-15 + catalogo di D-03: `Pet.attack`/`defense`, via `xp`/`currentLifePoints`/`damages`, fixture, SDL, passo del catalogo | `pet.model.ts`, `schema.gql`, `test/app.int-spec.ts` |
| 1 | 19-05 | L | D-03 personaggi: `OwnedPet`, equip, negozio (acquisto con vita del catalogo, vendita), pet in premio, populate e orfani, subscription, SDL, passo | `character-assets.model.ts`, `characters.service.ts`, `outcome-plan.ts`, `shop-transaction.service.ts` |
| 1 | 19-06 | M | D-04: `petXpAward`, tetti in `readCombatCatalog`, piano d'esito e imboscata, `petXpGained` (modello, draft, report trattenuto, risultati), SDL | `outcome-plan.ts`, `ambush-plan.ts`, `resolution-loader.service.ts`, `test/app.int-spec.ts` |
| 2 | 19-07 | S | D-09: via `PointOfInterest.quest`, `cityRelations`, registro dei ref (34 → 33), SDL, passo | `mixed-ref-paths.ts`, `schema.gql` |
| 2 | 19-08 | M | D-10 `City.shop`: modello, 6 lettori, 11 spec, 4 file di `test/`, passo | `city.model.ts`, `shop-transaction.service.ts` |
| 2 | 19-09 | S/M | D-11: `Lore.imagePath` (SDL, passo), rinomina di `slot_type.enum.ts` (`git mv` + `style` + 10 import), `item_reference_type.enum.ts` e `KGNotification` cancellati | `schema.gql`, `test/app.int-spec.ts` |
| 3 | 19-10 | M | D-06 `wornEquipment`/`feet`: modello, enum, 8 lettori, 11 spec, registro dei ref, SDL (tre blocchi nuovi), passo a due rinomine | `character-assets.model.ts`, `characters.service.ts`, `mixed-ref-paths.ts`, `shop-transaction.service.ts` |
| 3 | 19-11 | S | D-08: resolve field, via la virtual, harness, caso sul filo | `character-status.model.ts`, `characters-test-app.ts` |
| 3 | 19-12 | M | D-07 (1/4): `SpellState.active` additivo, funzione pura di fusione, passo | `spell-state.model.ts`, `schema.gql` |
| 3 | 19-13 | L | D-07 (2/4): mutation e recupero, `SpellStateMigrator` ridotto al taglio con `active`, `starting-character` | `src/characters/spells/*`, `characters.service.ts` |
| 3 | 19-14 | L | D-07 (3/4): piani d'esito, combattimento, override del GM, imboscata, sorteggio della magia | `outcome-plan.ts`, `ambush-plan.ts`, `combat-context.ts` |
| 3 | 19-15 | M | D-07 (4/4): contrazione di modello, input, populate, mapper, registro dei ref (→ 31), `active-spell.model.ts` cancellato, SDL e documenti sul filo | `character-status.model.ts`, `character-assets.model.ts`, `schema.gql`, `test/app.int-spec.ts` |
| 4 | 19-16 | M | Gate e chiusura: suite, `tsc`, SDL, grep dei nomi vecchi, `BACKEND-NOTES.md` (tabella vecchio → nuovo, comportamenti, runbook con i conteggi di M-2, domande), VALIDATION, requisiti (BE-MODEL-09 e la parte di contenuto di BE-MODEL-04 restano aperti) | documenti |

Note per il planner:

- I piani 19-02, 19-03, 19-04 sono indipendenti fra loro; 19-05 precede 19-06; 19-07, 19-08, 19-09 sono indipendenti; 19-10 e 19-11 precedono il blocco D-07 solo per ordine (D-13); 19-12 → 19-13 → 19-14 → 19-15 è una catena rigida.
- 19-13 e 19-14 si possono scambiare; la contrazione (19-15) resta ultima.
- `test/app.int-spec.ts` e `src/schema.gql` sono toccati da dodici piani: mai due piani nella stessa wave con esecuzione parallela.
- Le Domande aperte 6, 7 e 9 vanno chiuse prima di 19-05/19-06; la 2 prima di 19-09; la 5 e la 10 prima di 19-13; la 11 prima di 19-02.

## Probe eseguite

Una probe con `mongoose` e `mongodb-memory-server` del repo, script e dati nello scratchpad della sessione (fuori dal repo), MongoDB 8.2.6 in memoria, nessun accesso al database reale né all'ambiente:

| # | Domanda | Esito |
|---|---------|-------|
| a | `Model.create` con la forma vecchia conserva i campi vecchi? | No: `status.spells`, `assets.wearedEquipment`, `assets.activeSpells` scartati |
| b | `Model.updateMany` con rimozione o rinomina di un path fuori schema scrive? | No: `{ acknowledged: false }`, documento invariato |
| c | Rinomina di `foots` e del campo padre nella stessa scrittura | Conflitto di path; in due scritture in ordine: 1 e 1, seconda corsa 0 e 0 |
| d | Rinomina dei tre pool dentro `shop` | Liste vuote conservate, città senza pool resta senza `shop`, seconda corsa 0 |
| e | Idratazione di `ownedPets` di soli id con lo schema a voci | Nessun errore, voci spazzatura; lean → id nudi |
| f | Populate di un path tolto | `StrictPopulateError` |
| g | Nemico con magie incorporate letto con lo schema a ref | Populate → `[]`; `weaknesses` assente → `{ base: [], energy: [] }` |
| h | Array intero e path posizionale di `ownedPets` nella stessa scrittura | Conflitto di path |
| i | Pipeline di D-01 con guardia | 1 migrato, seconda corsa 0 trovati |

## Sources

### Primary (HIGH confidence)
- Codice del branch `feat/19-revisione-dei-modelli` (letture e `grep` con riga, elencati nelle sezioni)
- Probe locale su `mongodb-memory-server` (tabella sopra)
- Suite eseguite: unit completa, boot reale, due blocchi integration (F-13)
- Precedenti: `16-10-PLAN.md`, `16-10-SUMMARY.md`, `13.1-07-SUMMARY.md`, commit `64ef914`, `3bdf65a`, `80c3bf7`, `0125058`

### Secondary (MEDIUM confidence)
- Conteggi dei dati dal CONTEXT (inventario del 2026-11-09), non riletti
- Repo FE in sola lettura (`lib/graphql/fragments/*.dart`) per le selezioni sul filo

### Tertiary (LOW confidence)
- Comportamento di MongoDB sui filtri d'array non usati (A5) e ordine alfabetico dello SDL rigenerato (A1): da conoscenza pregressa, da confermare all'esecuzione

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna aggiunta, versioni lette da `package.json`
- Mappa dei lettori: HIGH — `grep` completo su `src` e `test`, file letti
- Migratore: HIGH sui meccanismi (probe), MEDIUM sui conteggi reali
- Pitfalls: HIGH per 1, 3, 4, 7, 8 (letti o provati); MEDIUM per 2 e 6

**Research date:** 2026-11-11
**Valid until:** 2026-12-11 (stack fermo); la mappa dei lettori va riverificata se altri quick task toccano `src/quests/outcomes/` o `src/characters/spells/` prima dell'esecuzione

## Per 19-REPO-RULES

- **Punti d'inserimento verificati:** tetti dei pet e vita del pet in premio in `ResolutionLoaderService.readCombatCatalog` (intero catalogo, come `readSpellMaxUsages`); premio del compagno in `planParticipant` (`outcome-plan.ts:354`, `input.enemies?.xp`) e in `planAmbushOutcome` (`commonSetOf`); `petXpGained` anche su `AmbushReportSnapshot` (`@Prop`, default 0) e `?? 0` in `resultDraftOf`; populate di `Enemy.spells` in `enemies.service.ts:20, 28`, `quest-catalog.populate.ts:11`, `quest-result.populate.ts:22`; populate `assets.ownedPets.pet` in `CharactersService.findOne` con le voci orfane tolte dal filo; resolve field di `maxActiveSpells` registrato in `CharactersModule` e in `test/authz/characters-test-app.ts`.
- **`ownedPets` negli esiti si scrive come array intero** calcolato dallo snapshot in sessione, mai con un path posizionale (conflitto col pet in premio; lo scrittore non passa filtri d'array).
- **Migratore solo col driver nativo** (`connection.model(X.name).collection`): via modello gli operatori sui path fuori schema non partono. Fixture nella forma vecchia solo con `collection.insertOne` (builder `legacy-fixtures.ts` dentro `src/migrations/model-review/`), verifiche col documento grezzo. Prima riga di ogni file `// UNA TANTUM (Phase 19 D-12): …`. Passi su **tutti** i personaggi, archiviati compresi.
- **Guardie di idempotenza:** D-01 `weaknesses` assente; D-02 elementi di tipo oggetto in `spells`; D-03 `damages`/`xp`/`currentLifePoints` presenti (catalogo), elementi ObjectId in `ownedPets` (personaggi); D-06 `assets.wearedEquipment` presente, **due scritture in ordine** (slot, poi campo); D-07 `status.spells` o `assets.activeSpells` presenti (mai la presenza di `active`); D-09 `quest` presente; D-10 uno dei tre campi presente; D-11 `image` presente e `imagePath` assente.
- **Asserzioni da aggiornare RED per prime:** `test/app.int-spec.ts:366-367` (`Lore`), `:446-447` (`CharacterStatus`), `:449-450` (`Pet`), `:459-463` (`SpellState`, `ActiveSpell` assente), `:623-624` (`QuestResult`); da aggiungere i blocchi esatti di `Enemy`, `Weaknesses`, `OwnedPet`, `CharacterAssets`, `Equipment`, `enum SlotType`, `PointOfInterest`, l'assenza di `WeaknessesInput` e il caso «mounts the one-off model review migration at boot (D-12)»; `mixed-ref-paths.spec.ts:161-166` (34 → 33 → 31); `ambush-results.spec.ts:55-84`; `shop-fields.schema.spec.ts`; `active-spell-slots.spec.ts:35-44` e `test/fixtures/fixtures.spec.ts:75-78` (virtual); i documenti sul filo in `character-updated.subscription.int-spec.ts:40, 46`, `spell-state.wire.int-spec.ts:19`, `lore-related.int-spec.ts:23, 25`, `cities.resolver.int-spec.ts:26`.
- **Nomi sul filo da aggiungere alla tabella:** il valore `foots` di `SlotType` (argomento `EquipItemRequest.slotType` di `equipItem`) diventa `feet`; compaiono i blocchi `enum DamageType` ed `enum EnergyType`; `type ActiveSpell` sparisce; nessuno degli input dei modelli (`EnemyInput`, `PetInput`, `LoreInput`, `EquipmentInput`, `WeaknessesInput`) è nello SDL; `PointOfInterestInput` non esiste.
- **D-07, regole dure:** nello stesso piano degli scrittori si toglie la riparazione di `SpellStateMigrator` (resta il taglio, che deve conservare `active`) e il filtro d'array del mirror; `starting-character` senza `spells` né `activeSpells`; i codici di rifiuto delle tre mutation restano identici; la contrazione del modello è l'ultimo piano. `CombatParticipant.activeSpells` è il vocabolario del motore e non si rinomina.
- **Stesso commit:** modello e draft di `petXpGained`; modello e `cityRelations` per `PointOfInterest.quest`; modello e populate per `status.spells`; membro `feet` dell'enum, modello, lettori e passo per D-06.
- **Default dei sotto-documenti:** `weaknesses`, `attack`, `defense` con default a funzione (`() => ({})`) e liste `[]`; `City.shop` e le sue tre liste con `default: undefined` (assente ≠ vuota).
- **Gate per piano:** `grep -rn "<nome vecchio>" src test --include='*.ts'` stampa solo righe sotto `src/migrations/model-review/` (`tsc` non vede i lettori lean né i path a stringa).
- **Prettier:** `src/models/enums/slot_type.enum.ts` non è pulito (`git mv` da solo, poi `style`, poi gli import); non toccare `src/models/common/damages.model.ts` (non pulito): `Weaknesses` vive in un file suo. Non puliti e non da toccare: `base-damage.model.ts`, `energy-damage.ts`, `spell.model.ts`, `pets.module.ts`, `point-of-interest.module.ts`.
- **Soglie di coverage a rischio:** `./src/characters/spells/` (97 / 88 / 97) dopo la rimozione della riparazione; `./src/economy/`, `./src/shops/`, `./src/travel/`, `./src/characters/characters.service.ts`, `./src/characters/equipment/`, `./src/quests/generation/`.
- **Tempi:** unit completo 11 s; `tsc` 10,5 s; boot reale 7,5 s (84 test); integration `src/characters src/migrations` 120 s; `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` 108 s; `src/quests` ≈ 150 s.
- **Runbook del boot reale (orchestratore):** processo dell'utente fermo prima del boot; backup di `enemies`, `pets`, `characters`, `cities`, `lore`, `pointsofinterest`; prova a secco con i conteggi di M-2 e i controlli della Domanda aperta 8; primo boot, secondo boot a zero; **mai codice pre-19 sul database migrato** (il vecchio migratore delle magie azzererebbe `spellStates`); rimozione del modulo in TDD.

## RESEARCH COMPLETE
