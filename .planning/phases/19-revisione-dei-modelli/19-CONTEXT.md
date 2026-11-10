# Phase 19: Revisione dei modelli - Context

**Gathered:** 2026-11-09 (discuss congiunto con la FE Phase 19, condotto dal repo FE nella stessa sessione della Phase 18; branch `feat/19-revisione-dei-modelli` impilato su `feat/18-quest-heal-per-taglia` perché i documenti di pianificazione condivisi cambiano in entrambe e la 19 segue la 18; worktree `Klimmeck-Guide-BE-wt18`)
**Status:** Ready for planning — fase di **pulizia dei modelli** con cambi **non additivi** allo SDL dichiarati fin d'ora (campi tolti e rinominati): la FE Phase 19 è la companion con i piani gated dalla merge; un solo migratore one-off al boot reale per tutte le aree, rimosso prima della merge (regola di casa). I nomi definitivi (`weaknesses`, `wornEquipment`, `feet`, `spellStates.active`, `ownedPets[].xp`, `shop`, `imagePath`) sono default tecnici da fissare in `19-REPO-RULES.md` prima della ricerca. **Si esegue dopo la Phase 18** (D-14).

<domain>
## Phase Boundary

I modelli hanno accumulato campi doppi, nomi storti e strutture parallele che ogni fase deve ricordare a mano. Questa fase li ripulisce senza cambiare le regole di gioco, salvo una aggiunta decisa dall'utente: **gli xp del combattimento vanno in parte anche al compagno**, e per farlo lo stato del pet (xp, vita) lascia il catalogo condiviso e vive sul personaggio. Tre aree: **catalogo** (debolezze dei nemici in un sotto-documento, magie dei nemici per riferimento, stato dei pet per pet posseduto con tetto `maxXp` rivisto, `attack` e `defense` al posto di `damages`), **personaggio** (equipaggiamento indossato rinominato, una sola lista delle magie, `maxActiveSpells` non più persistito), **mondo e pulizia** (back-link morto dei POI, pool del negozio in un sotto-documento, `Lore.imagePath`, file enum, modello morto). Ogni cambio porta il proprio migratore idempotente dentro l'unico one-off della fase, il proprio test e la propria riga nel handoff per la FE.

Fuori scope (decisioni dell'utente del 2026-11-09): la fusione di `ownedEquipments` e `ownedItems` (non scelta), `Spell.energyDamage` → `damages` e `requiredLearnTime` (si rivedono in una sessione dedicata a come si imparano le magie), le corsie di `CharacterQuests` in un sotto-documento, qualunque regola di combattimento (motore dell'utente), i dati dei pet oltre a `maxXp` (restano suoi).

</domain>

<decisions>
## Implementation Decisions

### Catalogo (BE-MODEL-01, BE-MODEL-02, BE-MODEL-03)
- **D-01 (utente, «gli enemy hanno due campi weakness, quando potrebbero essere strutturati sotto un solo campo weakness»):** `Enemy.energyWeaknesses` e `Enemy.baseWeaknesses` diventano `Enemy.weaknesses { base: [DamageType], energy: [EnergyType] }` (sotto-documento `_id: false`, default liste vuote), specchio di `damages { base, energy }`; sullo SDL `Enemy.weaknesses: Weaknesses!` sostituisce i due campi (non additivo), anche in `EnemyInput`. Dati: 206 nemici, 5 con entrambe, 51 solo energia, 150 nessuna: il migratore copia e rimuove i due campi, idempotente (salta chi ha già `weaknesses`). Lettori da aggiornare: generatore (`recommended-loot.ts`, oggetti consigliati dalle debolezze), combattimento segnaposto, catalogo.
- **D-02 (utente):** `Enemy.spells` passa da copie incorporate di `SpellSchema` (45 nemici, al più 3 ciascuno) a **riferimenti** al catalogo (`[ObjectId] ref Spell`, come `CharacterStatus.spells` oggi); sullo SDL `Enemy.spells: [Spell!]!` resta uguale (populate). Il migratore abbina ogni copia al documento del catalogo per `_id` quando coincide, altrimenti per `name`; una copia senza corrispondenza è riportata nel log con nome e nemico e **non** viene inventata (l'utente la cura a DB). Lettori: il combattimento legge le magie dei nemici? Da verificare in ricerca (oggi `grep` non trova letture di `enemy.spells` fuori dai modelli: se è così, il cambio è solo di forma).
- **D-03 (utente, «I campi dei pet servono, nel motore di combattimento possono ricevere danni e il danno scala in base agli xp accumulati» + «Stato per pet posseduto sul personaggio»):** il catalogo `Pet` tiene le **basi** (`damages`, `maxLifePoints`, `maxXp`, prezzi, `speedModifier`, `sellable`, `imagePath`) e perde `xp` e `currentLifePoints` (oggi 0/100 e identici su 44 pet: stato, non catalogo); lo stato vive sul personaggio: `assets.ownedPets` diventa una lista di sotto-documenti `{ pet: ref, xp: Number, currentLifePoints: Number }` (`OwnedPet` sullo SDL, `CharacterAssets.ownedPets: [OwnedPet!]!`: non additivo, oggi è `[Pet!]!`); `assets.pet` resta il **riferimento al catalogo** del compagno equipaggiato (il viaggio legge solo `speedModifier`), il suo stato si trova in `ownedPets` per id. Migratore: ogni ref esistente → voce con `xp` 0 e `currentLifePoints` = `maxLifePoints` del catalogo; acquisto/vendita/premio pet (Phase 12/13) scrivono e tolgono voci intere; «già posseduto» confronta `pet`.
- **D-04 (utente, «una percentuale degli xp ottenuti in un combattimento vengono dati anche al pet», «10 % degli xp ottenuti dal solo nemico (senza quest)», «Tetto a maxXp»):** a ogni **vittoria con nemici** (quest individuale, party, dungeon, imboscata vinta), il **compagno equipaggiato** del partecipante riceve `round(xpNemici × PET_XP_SHARE)` con `PET_XP_SHARE = 0,10` (costante ritoccabile, non env), dove `xpNemici` è la somma degli `Enemy.xp` affrontati (la stessa già sommata agli xp del personaggio) **senza** `prizes.xpPrize`; tetto a `maxXp` del catalogo del pet (`min`), mai sotto; scritto nella **stessa scrittura dell'esito** sulla voce di `ownedPets` (filtro posizionale sull'id del pet); senza compagno equipaggiato nulla. Il `QuestResult` del partecipante registra `petXpGained: Int` (additivo, default 0) così la FE può dirlo. La vita del pet (`currentLifePoints`) non cambia in questa fase (motore dell'utente).
- **D-05 (utente, «vanno rivisti quelli settati a catalogo, aiutami nel deciderli in base a quanto sono rari e forti»):** `maxXp` dei 44 pet a DB dalla tabella proposta (file `pets-maxxp-proposal.json` nello scratchpad della sessione, rivisto dall'utente): base per `maxLifePoints` (≤ 300 → 100, ≤ 500 → 150, ≤ 1300 → 300, ≤ 2200 → 500, ≤ 2700 → 700, ≤ 4500 → 1000, oltre → 1500), +25 % se solo da quest (`sellable: false`), +25 % se costa almeno 3 oro, arrotondato a 50 (da 100 dei gatti a 2350 di Pegaso, Grifone e Cavallo degli incubi). Contenuto scritto a DB dallo script dopo la merge e la revisione (D-36), non dal migratore.
- **D-15 (utente, a discuss chiuso: «Il modello Pet andrebbe rivisto in modo da dargli damages: { defense: ; attack: } o qualcosa di simile», poi precisato: «la cosa migliore è avere attack: Damages e defense: Damages»):** `Pet.damages` (oggi `Damages { base, energy }`, letto come attacco) viene sostituito da **due campi piatti** `Pet.attack: Damages` e `Pet.defense: Damages`, ciascuno `{ base, energy }` come oggi; sullo SDL `Pet.attack: Damages!` e `Pet.defense: Damages!` con `Pet.damages` tolto (non additivo), anche in `PetInput`. Migratore: il `damages` attuale diventa `attack`, `defense` nasce con liste vuote e il vecchio campo viene rimosso; i valori di difesa li scrive l'utente a DB («la mano vince»), coerente con la regola dell'equipaggiamento dove i danni dei non-arma sono protezione. Nessun lettore nel BE oggi (il viaggio legge solo `speedModifier`): il motore di combattimento dell'utente leggerà i due rami.

### Personaggio (BE-MODEL-04, BE-MODEL-05, BE-MODEL-06)
- **D-06 (utente):** `CharacterAssets.wearedEquipment` → `wornEquipment` e lo slot `Equipment.foots` → `feet` (modello, SDL non additivo, `EquipmentInput`, `SlotType` se contiene `foots`, filtri/update di `equipItem` e del negozio); migratore con rinomina dei campi, idempotente. Nessun altro slot cambia.
- **D-07 (utente, «Una sola lista di magie»):** le tre strutture `status.spells` (ref delle magie conosciute), `status.spellStates` (array parallelo nello stesso ordine: `usages`, `recoveries`) e `assets.activeSpells` (`{ spell, usages }` delle equipaggiate) diventano **una sola** lista `status.spellStates: [{ spell: ref, usages, recoveries: [Date], active: Boolean }]` nell'ordine di apprendimento; `status.spells` e `assets.activeSpells` spariscono dal modello e dallo SDL (non additivo: `CharacterStatus.spells`, `CharacterAssets.activeSpells` tolti; `SpellState.active` aggiunto); `equipSpell`/`unequipSpell` scrivono `active` (il tetto degli slot resta `maxActiveSpells` calcolato, D-08); `useSpell` e il recupero (Phase 9.1) lavorano sulla voce; l'apprendimento (study) aggiunge una voce `active: false`; il combattimento legge le voci `active`. Migratore: per ogni magia di `spells` la voce di `spellStates` (stesso indice, altrimenti per id) con `active` = presente in `activeSpells`; `usages` della voce vince su quello di `activeSpells` se diverso (log). Dati: 6 personaggi, al più 8 magie. **Piano più grande della fase** (53 righe in 15 file): da pianificare per ultimo nella wave del personaggio, con la FE Phase 8 (sezione Magie del Diario) come lettore principale.
- **D-08 (utente):** `status.maxActiveSpells` non viene più **persistito** (assente su tutti i 6 personaggi: lo calcola `active-spell-slots.ts` da titolo e xp); sullo SDL `CharacterStatus.maxActiveSpells: Int!` **resta** come resolve field calcolato (la FE lo legge in 4 file: nessun cambio FE); il `@Prop` sparisce, l'input admin lo ignora.

### Mondo e pulizia (BE-MODEL-07, BE-MODEL-08)
- **D-09 (utente):** `PointOfInterest.quest` (back-link singolo, vuoto su 642 POI mentre 166 marker portano 2–5 quest, «nessun lettore» già nella ricerca della Phase 11) viene rimosso da modello, SDL (`PointOfInterest.quest`), `PointOfInterestInput` e dal parser FE; migratore che toglie il campo dove esistesse.
- **D-10 (utente):** `City.shopEquipment`, `City.shopLoot`, `City.shopPets` → `City.shop { equipment: [ref], loot: [ref], pets: [ref] }` (solo Mongoose, come oggi: il filo espone già `CityShop { equipment, loot, pets }`); `cityShop`, il report dei pool e la vendita leggono il sotto-documento; migratore idempotente sulle 167 città (pool presenti, anche vuoti, conservati tali e quali: «la mano vince»).
- **D-11 (utente):** nomi e pulizia: `Lore.image` → `Lore.imagePath` (modello, SDL non additivo, `LoreInput`, migratore; la FE legge `imagePath` in 438 lore con immagine), file enum `item_reference_type.enum.ts` → `item-reference-type.enum.ts` e `slot_type.enum.ts` → `slot-type.enum.ts` (soli import), modello `KGNotification` rimosso (nessun uso, non nello SDL). Nella FE i file sono già in `snake_case` per convenzione Dart: nessuna rinomina.

### Migrazione, ordine, prove (BE-MODEL-09)
- **D-12 (Claude, regola di casa):** **un solo** modulo one-off `src/migrations/model-review/` (da creare) con un passo per decisione (D-01, D-02, D-03, D-06, D-07, D-09, D-10, D-11), ognuno idempotente e con log di soli conteggi, eseguito al **boot reale** dall'orchestratore e rimosso in TDD prima della merge (pattern 13.1/16); backup `mongodump` delle collezioni toccate prima del boot; prova a secco con i conteggi attesi (206 nemici, 45 con magie, 44 pet, 6 personaggi, 642 POI, 167 città, 521 lore).
- **D-13 (Claude):** ordine delle wave: catalogo (D-01, D-02, D-03/D-04/D-05/D-15) → mondo (D-09, D-10, D-11) → personaggio (D-06, D-08, D-07 per ultimo); ogni wave chiude con lo SDL emesso dal boot e la riga nel handoff; lo SDL finale è **non additivo** e la FE Phase 19 lo consuma con piani gated (cambi: `Enemy.weaknesses`, `Pet.attack`/`Pet.defense` al posto di `Pet.damages`, `CharacterAssets.ownedPets: [OwnedPet!]!`, `QuestResult.petXpGained`, `wornEquipment`/`feet`, `SpellState.active` con `CharacterStatus.spells`/`CharacterAssets.activeSpells` tolti, `PointOfInterest.quest` tolto, `Lore.imagePath`).
- **D-14 (utente, «Coppia 19 dopo la 18»):** si pianifica dopo la Phase 18 e si esegue dopo la sua merge; branch impilato sulla 18, PR verso `develop` dopo quella della 18.
- **Prove (default tecnico):** unit sui migratori (idempotenza, abbinamento magie per id e per nome, voce pet con HP del catalogo, rinomina slot, fusione delle tre liste di magie con conflitto di `usages`), sul premio xp del pet (10 % dei soli nemici, tetto, nessun compagno, imboscata), sulle letture (debolezze nel generatore, pool nel negozio); integration: boot con migratore su fixture di ogni area, esito con compagno → `petXpGained` e voce aggiornata, `cityShop` dal sotto-documento, SDL verbatim; handoff `BACKEND-NOTES.md` con la tabella dei cambi SDL vecchio → nuovo per la FE Phase 19.

### Claude's Discretion
- Nomi definitivi in `19-REPO-RULES.md` (default sopra: `Weaknesses`, `attack`/`defense` sul Pet, `OwnedPet`, `wornEquipment`, `feet`, `SpellState.active`, `City.shop`, `imagePath`, `petXpGained`, `PET_XP_SHARE`).
- Struttura del modulo di migrazione e dei log; ordine dei piani dentro le wave; forma della tabella SDL nel handoff.

</decisions>

<canonical_refs>
## Canonical References

### Roadmap e requisiti
- `.planning/ROADMAP.md` — Phase 19; `.planning/REQUIREMENTS.md` — BE-MODEL-01..09

### Modelli toccati
- `src/models/enemy.model.ts` (`energyWeaknesses`, `baseWeaknesses`, `spells` incorporate), `src/models/common/damages.model.ts` (pattern `{ base, energy }`)
- `src/models/pet.model.ts`, `src/models/character/character-assets.model.ts` (`ownedPets`, `pet`, `wearedEquipment`, `activeSpells`), `src/models/common/equipment.model.ts` (`foots`), `src/models/enums/slot_type.enum.ts`
- `src/models/character/character-status.model.ts` (`spells`, `spellStates`, `maxActiveSpells`), `src/models/character/spell-state.model.ts`, `src/models/common/active-spell.model.ts`, `src/models/character/active-spell-slots.ts`
- `src/models/point-of-interest.model.ts` (`quest`), `src/models/city.model.ts` (`shopEquipment`, `shopLoot`, `shopPets`), `src/models/lore.model.ts` (`image`), `src/models/notification.model.ts` (`KGNotification`), `src/models/enums/item_reference_type.enum.ts`
- `src/models/quest-result/quest-result.model.ts` — sede di `petXpGained`

### Lettori
- `src/quests/generation/recommended-loot.ts`, `src/quests/outcomes/combat/combat-context.ts`, `src/quests/outcomes/combat/placeholder-combat-resolver.ts` — debolezze e magie
- `src/quests/outcomes/outcome-plan.ts` (`planParticipant`, `xpEarned`), `src/travel/ambush/ambush-plan.ts` — sede del premio xp al pet
- `src/characters/pets/equip-pet.updates.ts`, `src/economy/trade/trade-pets.ts`, `src/economy/trade/shop-transaction.service.ts`, `src/travel/travel-planner.service.ts` (`speedModifier`), `src/characters/creation/starting-character.ts` — pet
- `src/characters/characters.service.ts` (`equipItem`, `equipItemFilter`/`equipItemUpdate`), `src/economy/trade/trade-inventory.ts` — equipaggiamento indossato
- `src/shops/` (`cityShop`, `shop-pool.rules.ts`, `shop-pool.report.ts`) — pool
- `src/pointsOfInterest/point-of-interest.service.ts`, `src/cities/cities.service.ts` — POI e città

### Precedenti
- `.planning/phases/09.1-spell-state-and-recovery-contract/` — nascita di `spellStates` e del recupero (processor, indice `character_spell_recoveries`)
- `.planning/phases/12-negozi-per-citta/` — pool del negozio, `ownedPets`/`pet` (D-13), `sellable`
- `.planning/phases/13.1-correzioni-generazione-quest/`, `.planning/phases/16-lore-sbloccabili/16-10-PLAN.md` — migratori one-off al boot reale e loro rimozione
- `.planning/phases/11-popolamento-del-mondo/11-RESEARCH.md` — «`PointOfInterest.quest` non è letto da nessun flusso»
- `.planning/phases/18-quest-heal-per-taglia/18-CONTEXT.md` — fase precedente sullo stesso ramo (`prizes.cure`, `recovery`, `useItem`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Damages { base, energy }` con `BaseDamage`/`EnergyDamage`: la forma di `weaknesses` (liste di enum, senza `power`).
- Migratori one-off delle fasi 13.1 e 16 (cartelle di `src/migrations/` rimosse dopo il boot, pattern nei piani 13.1 e 16-10; modulo importato solo da `AppModule`, log di conteggi, test con `ModulesContainer`).
- `active-spell-slots.ts`: il calcolo di `maxActiveSpells` già esiste; diventa resolve field.
- `assetQuantitySchemaAt`: esempio di sotto-schema riusato; `OwnedPet` ne segue lo stile.

### Established Patterns
- Scritture atomiche con filtro + update unico (Phase 4), filtri posizionali sugli array di sotto-documenti (`spellStates` in 9.1): lo stesso per `ownedPets[].xp`.
- SDL ordinato con asserzione nel boot reale; cambi non additivi dichiarati nel handoff (Phase 13 `infos.enemies`).
- «La mano vince»: i migratori non toccano ciò che l'utente ha già curato (pool presenti).

### Integration Points
- `planParticipant`/`ambush-plan`: premio xp al pet nella stessa scrittura dell'esito e `petXpGained` nel risultato.
- `equipSpell`/`unequipSpell`/`useSpell`/recupero/study: `spellStates.active`.
- `cityShop`/report/vendita: `City.shop`.
- `recommended-loot`/combattimento: `weaknesses`.

</code_context>

<specifics>
## Specific Ideas

- Verbatim dell'utente: «Un'altra fase vorrei che fosse di revisione dei modelli, per ottimizzarli. Ad esempio ho visto che gli enemy hanno due campi weakness, quando potrebbero essere strutturati sotto un solo campo weakness»; «I campi dei pet servono, nel motore di combattimento possono ricevere danni e il danno scala in base agli xp accumulati»; «Bisogna creare una fase (o integrarla ad una fase) in cui una percentuale degli xp ottenuti in un combattimento vengono dati anche al pet»; «requiredLearnTime andrà rivisto, ne parleremo in una sessione separata in cui decideremo come vengono selezionate le magie che vengono imparate»; «10 % degli xp ottenuti dal solo nemico (senza quest)»; «Tetto a maxXp, vanno rivisti quelli settati a catalogo».
- Inventario del discuss (DB di sola lettura, 2026-11-09): 206 nemici (debolezze 5/51/0/150, 45 con magie incorporate), 44 pet (xp 0/100 e HP identici), 642 POI senza back-link, 166 marker con 2–5 quest (748 aperte), 6 personaggi (3 attivi), 167 città con i tre array, 521 lore (438 con `image`), 96 magie; `KGNotification` e `PathResponse` fuori dallo SDL/con 2 letture.
- Impatto misurato fuori dai modelli: `wearedEquipment` 17 righe / 8 file, `activeSpells` 53 / 15, `maxActiveSpells` 7 / 3, debolezze 9 / 6 ciascuna, `ownedPets`/`assets.pet` 29 righe / 9 file (BE); FE: `foots` 13 / 4, `wearedEquipment` 11 / 3, `activeSpells` 9 / 4, `spellStates` 9 / 3, `maxActiveSpells` 11 / 4, debolezze 8 / 1 ciascuna.

</specifics>

<deferred>
## Deferred Ideas

- **`ownedEquipments` + `ownedItems` → un solo inventario**: proposto, non scelto dall'utente.
- **`Spell.energyDamage` → `damages { base, energy }` e `requiredLearnTime`**: sessione dedicata all'apprendimento delle magie.
- **`CharacterQuests` con le corsie in un sotto-documento**: non proposto come prioritario.
- **Vita del pet in combattimento, danni che scalano con gli xp**: motore dell'utente.
- **`PathResponse`** (2 letture): resta.

</deferred>

---

*Phase: 19-revisione-dei-modelli*
*Context gathered: 2026-11-09*
