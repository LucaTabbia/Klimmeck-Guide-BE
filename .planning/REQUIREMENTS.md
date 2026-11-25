# Requirements: Klimmeck Guide Backend — v1.1 Cura e modelli

**Definiti:** 2026-11-10
**Core Value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Milestone:** v1.1 Cura e modelli (Phases 18–20), gemella della milestone FE v1.1 «Healing & Models» (FE Phases 18–19). I requisiti della v1.0 sono archiviati in [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md).

I requisiti sono stati scritti nei discuss del 2026-11-09 (`18-CONTEXT.md`, `19-CONTEXT.md`, `20-CONTEXT.md`) e confermati come scope della v1.1 il 2026-11-10. Le frecce «→ FE …» indicano il requisito FE che consuma il contratto.

## v1.1 Requirements

### Heal Quests by Size (BE-HEAL) — Phase 18, aggiunta 2026-11-09

- [x] **BE-HEAL-01**: `Quest.prizes.cure` sotto-documento nullable `{ lifePointsShare: Number in [0, 1], canHeal: [InjuryType] }` (`QuestCure` sullo SDL, campo additivo `QuestPrizes.cure`, `QuestCureInput` in `QuestPrizesInput`); `canHeal` riusa nome e semantica di `LootItem.canHeal` (enum Mongoose, default vuota); `cure` assente = nessuna cura, nessuna migrazione → FE HEAL-01
- [x] **BE-HEAL-02**: Una quest vinta che porta `cure` riporta `currentLifePoints` almeno a `round(maxLifePoints × lifePointsShare)` (tetto: mai sopra il massimo né sotto il corrente, calcolato sul massimo dopo la progressione) e toglie da `status.injuries` le ferite presenti in `canHeal` nella stessa scrittura; vale per ogni tipo di quest (il ramo `type === heal` della Phase 9 D-15 è superato); primitiva pura `cureInjuries` riusabile → FE HEAL-01
- [x] **BE-HEAL-03**: Contenuto delle 166 heal fisse scritto a DB per taglia (`citySizeOf`) con script mirato fuori repo (D-36) dopo la revisione dell'utente su file e dopo la merge: liste villaggio 19 (gravità FE ≤ 20) / città 28 (≤ 40) / capitale 37, ritocchi per `CityType` (montagna/nord, deserto, tropicale, mare), quota 0,5 / 0,8 / 1, `timeToComplete` 2 / 5 / 8 h, tre descrizioni per taglia nella voce del tempio; titoli, `minTitle` rookie, gratuità e Necrorian invariati → FE HEAL-03
- [x] **BE-HEAL-04**: `QuestResult.injuriesHealed: [InjuryType!]!` (default vuota) con le ferite tolte da quell'esito per il partecipante, accanto a `hpBefore`/`hpAfter` → FE HEAL-02
- [x] **BE-HEAL-05**: Unit (primitiva, tetto, piano con `cure` null/0/1 e su quest non heal), integration (heal di villaggio: una ferita tolta e una no, HP al 50 %, `injuriesHealed` sul filo; SDL verbatim della FE), boot reale con SDL additivo, handoff `BACKEND-NOTES.md` per la FE Phase 18 con tre quest d'esempio e il runbook dello script di contenuto
- [x] **BE-HEAL-06**: `LootItem.recovery` sotto-documento nullable `{ time: ms intero ≥ 0, turns: intero ≥ 0 }` (`LootRecovery` sullo SDL, input admin) e `LootItem.relatedLore: [Lore]` (ref, filtrata per viewer come le altre) additivi; `CharacterStatus.potionRecoveryUntil: DateTime` nullable additivo, una sola data per personaggio, nessun processor; `turns` solo dato per il motore di combattimento (il combattimento non legge né scrive la ricarica) → FE HEAL-04, HEAL-05
- [x] **BE-HEAL-07**: Mutation `useItem(itemId: ID!): UseItemResult` sul bearer: rifiuti in ordine `AWAITING_AID`, `ITEM_NOT_OWNED`, `ITEM_NOT_USABLE` (effetto non heal o `recovery.time` assente), `POTION_RECOVERING` (con `recoveryUntil` nelle extensions), `ITEM_NO_EFFECT` (HP pieni e nessuna ferita in `canHeal`: nessun consumo né ricarica); consentita in città e in viaggio; una sola scrittura atomica (HP + `power` fino al massimo, ferite − `canHeal` con `cureInjuries`, pila − 1 con le guardie di quantità, `potionRecoveryUntil = now + recovery.time`, `relatedLore` dell'oggetto in `unlockedLore`) e risultato `{ hpBefore, hpAfter, injuriesHealed, quantityLeft, recoveryUntil, loreUnlocked }` → FE HEAL-04, HEAL-05
- [x] **BE-HEAL-08**: Contenuto fuori repo dopo la merge e la revisione dell'utente: `recovery.time` delle 28 pozioni heal dalla tabella (30 min–24 h: base per potenza, scalino per rarità, minimi per ferita più grave), `turns` dalla bozza, lore nuova «Il limite del corpo» (`knowledge`) scritta a DB e collegata dalle 28 pozioni; integration su prima pozione, seconda entro la ricarica, nessun effetto, attesa di soccorso, viaggio; handoff aggiornato con lo script e la lore → FE HEAL-04, HEAL-05
- [x] **BE-HEAL-09**: Una quest `heal` senza effetto per il personaggio (vita già pari o sopra il tetto della quest e nessuna sua ferita in `cure.canHeal`, oppure `cure` assente) non si accetta: `acceptQuest` rifiuta con `QUEST_NO_EFFECT` senza toccare corsie e punti, e il campo additivo per viewer `Quest.noEffect: Boolean!` lo dichiara al tabellone (vero solo per il tipo `heal`; falso per gli altri tipi e senza personaggio corrente, nessuna eccezione per ruolo); un solo predicato puro per rifiuto e campo, risolto per subscriber → FE HEAL-06 _(aggiunto 2026-11-10, regola dell'utente a plan in corso)_

### Model Review (BE-MODEL) — Phase 19, aggiunta 2026-11-09

- [x] **BE-MODEL-01**: `Enemy.weaknesses { base: [DamageType], energy: [EnergyType] }` sostituisce `energyWeaknesses` e `baseWeaknesses` (modello, SDL non additivo, `EnemyInput`); generatore (`recommended-loot`) e combattimento leggono il sotto-documento; migratore idempotente sui 206 nemici → FE MODEL-01
- [x] **BE-MODEL-02**: `Enemy.spells` diventa una lista di riferimenti al catalogo (stesso SDL `[Spell!]!`); il migratore abbina le copie incorporate per `_id` o per `name` e riporta nel log quelle senza corrispondenza, senza inventarle → FE MODEL-01
- [x] **BE-MODEL-03**: Lo stato del pet vive sul personaggio: `CharacterAssets.ownedPets: [OwnedPet { pet, xp, currentLifePoints }]` (non additivo), il catalogo `Pet` perde `xp` e `currentLifePoints`, tiene `maxLifePoints`, `maxXp`, prezzi, `speedModifier`, `sellable`, `imagePath` e sostituisce `damages` con `attack: Damages` e `defense: Damages` (SDL non additivo; migratore: i danni attuali → `attack`, `defense` vuoto per la cura a DB); acquisto, vendita, premio e «già posseduto» sulle voci; `assets.pet` resta il riferimento al catalogo; migratore (`xp` 0, vita = `maxLifePoints`) → FE MODEL-02
- [x] **BE-MODEL-04**: A ogni vittoria con nemici (quest individuale, party, dungeon, imboscata vinta) il compagno equipaggiato riceve `round(Σ Enemy.xp × PET_XP_SHARE)` con `PET_XP_SHARE` 0,10 (costante), senza il premio della quest, tetto `maxXp` del catalogo, nella stessa scrittura dell'esito; `QuestResult.petXpGained: Int!` additivo (default 0); `maxXp` dei 44 pet rivisti a DB dalla tabella approvata (contenuto a DB dentro la fase, D-25) → FE MODEL-02 _(chiuso l'11 novembre 2026: `maxXp` dei 44 pet a DB (script di contenuto fuori repo))_
- [x] **BE-MODEL-05**: `CharacterAssets.wearedEquipment` → `wornEquipment` e `Equipment.foots` → `feet` (modello, SDL non additivo, input, filtri di `equipItem` e del negozio); migratore con rinomina → FE MODEL-03
- [x] **BE-MODEL-06**: `status.spellStates [{ spell, usages, recoveries, active }]` è l'unica lista delle magie: `status.spells` e `assets.activeSpells` tolti da modello e SDL; equip/unequip scrivono `active`, uso/recupero/apprendimento/combattimento lavorano sulle voci; `maxActiveSpells` resta sullo SDL come resolve field calcolato e perde il `@Prop`; migratore che fonde le tre liste (log sui conflitti di `usages`) → FE MODEL-03
- [x] **BE-MODEL-07**: `PointOfInterest.quest` tolto da modello, SDL e input (nessun lettore, 0 su 642 POI); `City.shop { equipment, loot, pets }` sostituisce i tre array del pool (solo Mongoose; `cityShop`, report e vendita lo leggono; pool presenti conservati) → FE MODEL-01
- [x] **BE-MODEL-08**: `Lore.image` → `Lore.imagePath` (modello, SDL non additivo, input, migratore); file enum `item_reference_type.enum.ts` e `slot_type.enum.ts` rinominati in kebab-case; modello `KGNotification` rimosso → FE MODEL-01
- [x] **BE-MODEL-09**: Un solo modulo one-off `src/migrations/model-review/` con un passo idempotente per decisione e log di soli conteggi, eseguito al boot reale dall'orchestratore dopo il backup e rimosso in TDD prima della merge; unit sui migratori e sul premio xp del pet, integration per area, SDL verbatim della FE, handoff `BACKEND-NOTES.md` con la tabella dei cambi SDL vecchio → nuovo _(chiuso l'11 novembre 2026: boot reale (primo boot coi conteggi attesi, secondo a zero) e modulo rimosso in TDD (`c3492ced`, `0822feee`))_
- [x] **BE-MODEL-10**: `Pet.relatedLore: [Lore!]!` additivo (ref, default vuoto, filtrato per viewer come `LootItem.relatedLore`); l'acquisto di un pet e il pet in premio aggiungono le sue lore a `status.unlockedLore` nella stessa scrittura della voce di `ownedPets` (nessun duplicato, la vendita non le toglie); contenuto a DB nella fase: 44 pet collegati alla propria lore, lore nuova «Cavallo da viaggio» → nessun cambio FE (flusso `unlockedLore` della FE Phase 17) _(aggiunto 2026-11-11, regola dell'utente a plan in corso)_ _(chiuso l'11 novembre 2026: 44 pet collegati alle lore (43 esistenti + la lore nuova «Cavallo da viaggio»))_
- [x] **BE-MODEL-11**: `Pet.rarity: RarityType` additivo (nullable, enum esistente); contenuto a DB nella fase dalla tabella approvata (negozio common/uncommon, solo quest uncommon → legendary per `maxXp`), «Scheletro di cavallo da guerra» ultrarare con statistiche di fascia, «Molosso da guerra» vendibile → FE: rarità mostrata sul compagno _(aggiunto 2026-11-11, regola dell'utente a plan in corso)_ _(chiuso l'11 novembre 2026: 44 rarità a DB (13 common, 8 uncommon, 8 rare, 12 ultrarare, 3 legendary), Molosso vendibile, Scheletro ultrarare)_
- [x] **BE-MODEL-12**: pet in premio nelle quest generate `enemy` e `boss` per legame: `Pet.enemy` (ref, solo Mongoose), tre fasce che si sommano in un solo tiro (10 % pet di un nemico della quest, 5 % pet di zona dalle `locations` del nemico collegato, 5 % pet non vendibile qualunque solo boss), tetto di rarità dal pool di loot del rango; 20 % alla vittoria invariato; contenuto: 31 legami pet → nemico _(aggiunto 2026-11-11, supera la Phase 13 D-21)_ _(chiuso l'11 novembre 2026: 31 legami pet → nemico come ObjectId (13 pet senza nemico corrispondente))_

### Progressive Travel Food (BE-FOODP) — Phase 20, aggiunta 2026-11-09

- [x] **BE-FOODP-01**: La partenza (libera e da quest) calcola il piano con `planTravelFood` come oggi (anteprima e rifiuto «arrivi vivo» identici) e lo salva su `activeTravel.food` (interno: fabbisogno, km coperti, perdita totale, km settati, cibo consumato) senza consumare cibo né scalare vita; i viaggi senza piano (iniziati prima del deploy) sono ignorati dalle regole nuove; nessun cambio SDL
- [x] **BE-FOODP-02**: Lo sweep del viaggio (`TRAVEL_SWEEP_INTERVAL_MS`) scala `currentLifePoints` solo oltre i km coperti, come perdita incrementale dei km fatti dall'ultimo passaggio con la curva triangolare della Phase 14 (il km scoperto n-esimo costa n HP), km dal tempo come il `km` dell'imboscata, scrittura atomica guardata da `settledKm`, mai sotto 1; pozioni e danni si sommano
- [x] **BE-FOODP-03**: Il cibo si toglie una sola volta per viaggio, in blocco, con la selezione a scarto minimo sul posseduto in quel momento: alla fine dei km coperti (fabbisogno totale), all'arrivo (come oggi) o alla sconfitta e al teleport a viaggio iniziato (fabbisogno dei soli km percorsi); consumo come vendita senza incasso con le guardie di quantità; la deviazione dopo la sconfitta non ha piano (né cibo né fame)
- [x] **BE-FOODP-04**: L'imboscata setta la fame esatta al suo km (e il cibo se oltre il confine) prima del combattimento; in vittoria il viaggio prosegue con lo stesso piano; l'arrivo setta la fame fino a fine percorso e il cibo nella transazione del completamento; i totali a fine viaggio coincidono con quelli della Phase 14
- [x] **BE-FOODP-05**: Unit (funzione pura, km dal tempo, selezione parziale), integration con orologio finto (partenza, sweep prima/dopo il confine, pozione fra due sweep, imboscata, sconfitta pro-rata, arrivo, teleport, legacy), boot reale con SDL identico, handoff `BACKEND-NOTES.md` con la semantica nuova e il piano di UAT su device

### Rank Prizes and Rescues (BE-RANKP) — Phase 21, aggiunta 2026-11-12

- [x] **BE-RANKP-01**: Le quest di gruppo (worldMission, boss, aid nate da un gruppo) portano un blocco premio per ogni titolo dei posti (monete, xp, loot, pet, cura, magia), così nessuno ottiene un premio troppo forte per il suo rango; nessun posto a titolo null in una quest di gruppo (contenuto non valido → rifiuto o report); le quest in solitaria tengono il premio unico calcolato sul `minTitle`
- [x] **BE-RANKP-02**: Alla risoluzione ogni partecipante riceve il blocco del **proprio titolo** (non quello del posto); la magia (premio fisso e sorteggio della study) si insegna solo ai titoli ≥ mage (`isSpellCaster`) in ogni percorso, solitaria compresa; i blocchi sotto mage non portano magia
- [x] **BE-RANKP-03**: Il generatore crea boss misti a caso con posti anche del titolo inferiore (mai superiore) dentro la formula dei posti esistente e scrive un blocco per ogni titolo con le tabelle (moltiplicatori, `LOOT_POOLS`, pet sorteggiato con la regola della Phase 19 una volta per blocco; cure e magie solo nelle solitarie heal/magic); le quest scritte a mano hanno i blocchi scritti dall'utente, nessuna semina; il viewer legge sul filo il blocco del proprio titolo (forma decisa nel plan, schema `noEffect`)
- [x] **BE-RANKP-04**: L'aid nasce solo da enemy, boss, hunt, dungeon e aid perse; clona i blocchi per titolo con i posti; aid persa invariata (D-09 della Phase 9); la crime resta com'è (arresto 10 h, nessuna aid)
- [x] **BE-RANKP-05**: Dungeon a turni (esplorazione → scontro → …): la sconfitta, anche in un turno di esplorazione, salva sull'aid il turno (indice e tipo); l'aid di una dungeon percorre i turni fino a quello e il soccorritore deve completarlo per salvare il ferito, poi l'aid finisce; premio del soccorritore in proporzione ai turni completati; struttura + segnaposto, il motore a turni è dell'utente
- [x] **BE-RANKP-06**: L'archiviatore che conclude un'aid libera corsie e PendingQuest dei soccorritori iscritti come il timeout (RED prima); unit + integration, SDL al boot reale, handoff `BACKEND-NOTES.md` per la FE Phase 20

### Guided Mission Completion (BE-GMFLOW) — Phase 22, aggiunta 2026-11-12

- [x] **BE-GMFLOW-01**: Query solo innkeeper della lista nemici per una richiesta: tipi del POI + habitat `city` nella fascia xp del titolo della missione, leggendari ammessi per le worldMission, opzione «mostra tutti»
- [x] **BE-GMFLOW-02**: Simulazione a secco di uno scontro (uno o più nemici con quantità) col `CombatResolver` sullo stato corrente o su quello lasciato dallo scontro precedente; nessuna scrittura su personaggi, quest o risultati; esito, HP, ferite, consumabili e magie per personaggio
- [x] **BE-GMFLOW-03**: Bozza del flusso salvata sulla richiesta (passo, luogo, scontri, simulazioni, correzioni, premi), ripresa da qualunque dispositivo dell'oste, invisibile ai giocatori, invalidata se la richiesta sparisce
- [x] **BE-GMFLOW-04**: Correzioni per personaggio (ferite tolte o aggiunte, vita 1..max, consumabili e magie usati) validate come gli override di oggi
- [x] **BE-GMFLOW-05**: Premi per personaggio dal blocco del titolo (Phase 21) con aggiunte/rimozioni dal catalogo filtrato per titolo, rivalidati nel BE (tetto di rarità, pet, magie solo `isSpellCaster` e con `minXpToLearn`)
- [x] **BE-GMFLOW-06**: Completamento in una transazione: stato finale, nemici in `QuestResult.enemies`, xp dei nemici e del compagno, conoscenza e lore di vittoria, premi scelti; sempre `gmCompleted`, nessuna aid
- [x] **BE-GMFLOW-08**: Dall'avvio del flusso al risultato i partecipanti espongono lo stato «missione in corso» e non possono partire, accettare quest, comprare o vendere, cambiare equipaggiamento, compagno o magie equipaggiate, né bere pozioni (codice di rifiuto proprio); sblocco al completamento o allo scarto della bozza
- [x] **BE-GMFLOW-09**: Lo stesso blocco vale per ogni missione dall'inizio effettivo (arrivo alla quest della corsia standard, `startedAt` delle registrate) all'esito: `equipItem`, `equipPet`, `unequipPet`, `equipSpell`, `unequipSpell`, `useSpell`, `useItem` e le transazioni del negozio rifiutate con lo stesso codice; stato «missione in corso» esposto sul personaggio
- [x] **BE-GMFLOW-07**: Ruolo innkeeper e audit su ogni mutation nuova (le query dell'oste non si registrano, come oggi); unit + integration; SDL al boot reale; handoff `BACKEND-NOTES.md` per la FE Phase 21 con una worldMission e una story d'esempio per l'UAT

### Companion Defeat and Recovery (BE-PET) — Phase 23, aggiunta 2026-11-14

- [x] **BE-PET-01**: Orologio di riposo lineare pigro (una funzione pura, velocità `(max − 1) / T`, arrotondamento al più vicino, minimo 1), predicato unico «sconfitto» sulla data `defeatedUntil`, campi nuovi della voce posseduta conservati da ogni riscrittura dell'array, dati esistenti letti senza migratore (chiave = id del pet a catalogo)
- [x] **BE-PET-02**: `Pet.recoveryTime` (millisecondi, annullabile, curato a DB; non curato = recupero istantaneo e conteggio in WARN al boot) e stato del compagno su `OwnedPet` (`name`, `defeated`, `currentLifePoints` all'ancora, `lifeAsOf`, `fullLifeAt`, `potionRecoveryUntil`)
- [x] **BE-PET-03**: `equipPet`/`unequipPet` assestano la vita in transazione; `PET_DEFEATED` per il compagno sconfitto prima della data di vita piena; il ferito si riequipaggia con la vita raggiunta
- [x] **BE-PET-04**: Porta `CombatResolver` estesa con `companionLifeAfter`; il segnaposto danneggia il compagno senza tiri nuovi; dungeon e scontri in sequenza: lo sconfitto è fuori dagli scontri seguenti
- [x] **BE-PET-05**: Regola della sconfitta (vita 1 a fine scontro, anche se entrato a 1) in quest, boss, dungeon, soccorsi, guardia, crime, sconfitta senza soccorso e completamento GM; slot svuotato; `QuestResult.companion` servito ogni volta che un compagno ha combattuto
- [x] **BE-PET-06**: Pozione sul compagno con `useItem(itemId, petId)`: attesa propria del compagno, rifiuti `PET_DEFEATED`, `PET_POTION_RECOVERING` (con `extensions.recoveryUntil`), `ITEM_NO_EFFECT`, `AWAITING_AID`, `MISSION_IN_PROGRESS`
- [x] **BE-PET-07**: `renamePet` del solo proprietario con le regole di forma del nome del personaggio, codice `PET_NAME_INVALID`, `null` toglie il nome, non bloccata dalla missione in corso
- [x] **BE-PET-08**: Push `petRecovered` quando un compagno sconfitto torna a vita piena (sweeper con claim atomico, una sola push, nessuna dopo la vendita)
- [x] **BE-PET-09**: Imboscate: esito del compagno, `QuestResult` scritto all'istante (report leggibili in viaggio, «visto» = conferma), push `ambush` per ogni imboscata col nome mostrato; `ambushDefeat` non più inviato
- [x] **BE-PET-10**: Cavalcatura della partenza (campo interno `activeTravel.mount`) sconfitta in un'imboscata vinta: strada residua ricalcolata a piedi (arrivo, cibo, prossima imboscata rimappata senza tiri, job), `AmbushReport.onFoot`
- [x] **BE-PET-11**: Dopo il ricalcolo, ridirezionamento alla città più vicina per strada se non arriverebbe vivo, quest abbandonata; deviazione a piedi se la cavalcatura cade in una sconfitta
- [x] **BE-PET-12**: Flusso guidato: `MissionFightOutcome.companion`, `MissionFightEffects.companionLifeAfter`, correzione `ParticipantOverrideInput.companionLifeAfter` (1..max, 1 = sconfitto, accettata anche dal legacy), aggregato e completamento con le stesse regole
- [x] **BE-PET-13**: Gate (tsc, suite, SDL solo additivo al boot reale) e handoff `BACKEND-NOTES.md` per la FE Phase 22 con la descrizione della tabella dei tempi di recupero
- [x] **BE-PET-14**: Livelli del compagno: 10 livelli sul tetto di xp (`Pet.maxXp`), vita massima dalla base del catalogo al doppio, serviti sul filo (`OwnedPet.level`, `OwnedPet.maxLifePoints`) e letti da ogni regola che usa il massimo del compagno

### Spell Origins and Schools (BE-ORIGIN) — Phase 24, aggiunta 2026-11-15

- [x] **BE-ORIGIN-01**: Tipi di città `aarakocraCapital`, `dragonbornCapital` (taglia `capital`) e `dragonbornVillage` (villaggio) nell'enum, nella tabella esaustiva delle taglie e sul filo; le tre città già a DB tornano servibili da `cities` e `city`; il report dei negozi giudica le due capitali nuove con la fascia `city` (la taglia resta `capital`)
- [x] **BE-ORIGIN-02**: Città di nascita: dragonborn → `dragonbornCapital`, aarakocra → `aarakocraCapital`, solo per i personaggi nuovi
- [x] **BE-ORIGIN-03**: Enum `SpellOrigin` (`void`, `arcane`, `shamanic`) e `Spell.origin: String!` su schema Mongoose (validazione enum) e filo; nessun effetto sul combattimento, sugli slot né su chi può imparare una magia
- [x] **BE-ORIGIN-04**: `Spell.minLevelToLearn: Int!` al posto di `minXpToLearn` su schema e filo (cambio SDL non additivo dichiarato nel handoff); `SpellInput` morto rimosso; conteggio al boot delle magie senza origine o livello validi
- [x] **BE-ORIGIN-05**: Cancello a livello (livello dopo l'esito, dalla tabella unica) nel premio fisso, nei premi per titolo e nel sorteggio delle quest; una magia senza livello intero ≥ 1 non si insegna
- [x] **BE-ORIGIN-06**: Cancello a livello nelle opzioni dei premi dell'oste e nella loro rivalidazione a salvataggio e completamento, con il livello derivato dall'xp nella tabella unica
- [x] **BE-ORIGIN-07**: Tipi di quest di scuola `arcane` (il vecchio `magic`, rinominato), `shamanic` e `void`, identici fra loro: ripetibili, senza registrazione, corsia standard, avvio all'arrivo, pool dello studio, nessun soccorso; nessun cambio SDL, nessun lettore tollera più `magic`
- [x] **BE-ORIGIN-08**: Il sorteggio di una quest `arcane` / `shamanic` / `void` prende solo le magie dell'origine con lo stesso nome (tabella tipo → origine esplicita); ogni altro tipo con `spellDraw` pesca dall'intero catalogo come oggi; nessun tiro aggiunto o spostato
- [x] **BE-ORIGIN-09**: Il generatore non crea mai su un POI di una città `necrorianCity` una quest con `minTitle` sotto mage (pavimento per tipo di città, boss misti compresi)
- [x] **BE-ORIGIN-10**: Migratore una tantum idempotente prima di ogni hook: `minLevelToLearn` da `minXpToLearn` con la tabella dei livelli e `origin: arcane` dove manca (lascia `minXpToLearn` a DB); riscrive il tipo `magic` in `arcane` nelle quest e in ogni copia persistita del tipo; esce dal repo dopo il boot reale
- [x] **BE-ORIGIN-11**: Gate (tsc, suite unit e integration, SDL rigenerato al boot reale di test) e handoff `BACKEND-NOTES.md` per la FE Phase 23 con il diff SDL, la finestra FE, il log del boot del migratore e i compiti di contenuto dell'orchestratore
- [x] **BE-ORIGIN-12**: Lore dell'origine: `Spell.relatedLore: [Lore!]!` (additivo, filtrata per viewer) sbloccata a ogni magia imparata per qualunque via (sorteggio, premio fisso, premio per titolo, premio dell'oste) con il meccanismo degli altri sblocchi; la prima magia di un'origine sblocca la lore dell'origine, le successive non cambiano nulla
- [x] **BE-ORIGIN-13**: Regola della ricerca e dell'apprendimento nel piano d'esito (D-26, D-30): la magia del sorteggio con un `requiredLearnTime` valido non si impara alla fine della ricerca, la corsia resta occupata e la sua lore non si sblocca; magia fissa, blocco per titolo, corsie GM e tempo non valido restano immediati; nessun tiro aggiunto o spostato
- [x] **BE-ORIGIN-14**: Fine della ricerca (D-26): premi e stato assestati come oggi, `PendingQuest` riarmata per la parte di apprendimento (nuova `startDate`, `waitingTime` = `requiredLearnTime`, magia e foglio trattenuto), nessun `QuestResult`, job pianificato; individuale, boss e soccorso; ogni partecipante col proprio sorteggio
- [x] **BE-ORIGIN-15**: Fine dell'apprendimento (D-26): magia fra le conosciute, lore della magia sbloccata, corsia libera, foglio trattenuto scritto con `spellLearned` e `loreUnlocked`; innescata dal job e recuperata dallo sweep dopo un riavvio; una sola volta
- [x] **BE-ORIGIN-16**: Push di fine ricerca (D-29): `spellResearchSucceeded` col nome della magia e la durata dell'apprendimento, `spellResearchFailed` al posto di `questEnd` quando il sorteggio non dà nulla; `questEnd` alla fine dell'apprendimento
- [x] **BE-ORIGIN-17**: Filo (D-26, D-29), solo aggiunte: `PendingQuest.learningSpell`, `QuestResult.spellResearchFailed`, `QuestPrizes.spellDraw`; il personaggio si ripubblica quando la `PendingQuest` passa all'apprendimento
- [x] **BE-ORIGIN-18**: Gate del blocco 13–17 e handoff `BACKEND-NOTES.md` §8 per la FE (diff SDL, stati, push, esempi, compiti dell'orchestratore)

### Innkeeper Wounds (BE-WOUND) — Phase 25, aggiunta 2026-11-21

- [x] **BE-WOUND-01**: Il personaggio conserva e serve l'origine delle ferite: `status.innkeeperInjuries` a DB e `CharacterStatus.innkeeperInjuries: [InjuryType!]!` sul filo, sottoinsieme per tipo di `injuries`, additivo e senza migrazione (campo assente = nessuna ferita dell'oste); una sola funzione di lettura tollerante; nessun input lo scrive; `characterUpdated` esce anche quando cambia solo l'origine (D-15, D-16) → FE WOUND-02
- [x] **BE-WOUND-02**: Nessuna cura tocca una ferita dell'oste né la elenca in `injuriesHealed`: la regola vive in `cureInjuries` e vale per la quest heal e ogni premio `cure`, la cura del blocco del titolo, il premio guidato `cure` e la pozione dal Diario, compresa la ferita inflitta nello stesso esito (D-11, D-14) → FE WOUND-02
- [x] **BE-WOUND-03**: I controlli «senza effetto» ignorano le ferite dell'oste: `acceptQuest` rifiuta con `QUEST_NO_EFFECT`, `Quest.noEffect` è vero e la pozione risponde `ITEM_NO_EFFECT` quando la cura troverebbe solo ferite dell'oste; un solo predicato per rifiuto e campo (D-14) → FE WOUND-02
- [x] **BE-WOUND-04**: Le correzioni tolgono qualunque ferita presente, dell'oste o normale, nei due flussi: `ParticipantOverrideInput.injuriesRemoved` additivo, rimozione di una ferita non portata rifiutata con `OUTCOME_OVERRIDE_INVALID`, `QuestResult.injuriesRemoved: [InjuryType!]!` con le ferite tolte dall'oste (mai fra le guarite); `completePendingRequest` è estesa, non rimossa (D-13) → FE WOUND-01
- [x] **BE-WOUND-05**: La ferita aggiunta a mano è dell'oste: tutte quelle dell'override nel flusso semplice, corretto meno simulato nel flusso guidato; una ferita tolta e riaggiunta nella stessa correzione diventa dell'oste; una ferita già portata e non tolta non si aggiunge di nuovo e conserva l'origine (D-12, D-16) → FE WOUND-01
- [x] **BE-WOUND-06**: Nel flusso guidato origine e rimozioni scorrono fra gli scontri con una piega in ordine (mai un'unione), la bozza salva le rimozioni e serve all'oste `MissionFightOutcome.innkeeperInjuriesBefore`, `MissionFightEffects.injuriesRemoved` e `MissionFightEffects.innkeeperInjuries`; chiuse le tre trappole della ricerca (correzione di sole rimozioni scartata, rimozioni perse alla rivalidazione del completamento, unione delle ferite fra scontri) (D-13) → FE WOUND-01

### Participants' Stories (BE-STORY) — Phase 25, aggiunta 2026-11-21

- [x] **BE-STORY-01**: L'oste legge il background di ogni partecipante prima di avviare la missione e senza bozza, con la `character(id)` di oggi (nessuna query nuova); un giocatore che chiede il personaggio di un altro è rifiutato; contratto pinnato da un caso d'integrazione (D-01, D-02) → FE STORY-01
- [x] **BE-STORY-02**: Aggiunte per partecipante nella bozza del flusso guidato: sezione `backgroundAdditions` (un testo facoltativo per partecipante, sezione presente = sostituisce la lista, testo vuoto = nessuna voce) e passo `stories` dopo `recap`, salvati e riserviti come il resto (D-05, D-06) → FE STORY-02
- [x] **BE-STORY-03**: Un'aggiunta è al massimo di 1000 grafemi con la stessa regola di conteggio del background della creazione (che resta a 500): predicato condiviso, tetto di forma sul filo a 8000 unità UTF-16, codice proprio `BACKGROUND_ADDITION_TOO_LONG` al salvataggio e al completamento (D-07) → FE STORY-02
- [x] **BE-STORY-04**: Al completamento guidato ogni aggiunta non vuota diventa una voce nuova in coda a `infos.background` nella stessa transazione del completamento; le voci esistenti non si toccano; solo `story` e `worldMission`, mai dal completamento semplice (D-05, D-08, D-10) → FE STORY-03
- [x] **BE-STORY-05**: `QuestResult.backgroundEntryAdded: Boolean!` dice se il background del partecipante ha ricevuto una voce in quel completamento; falso su ogni altro foglio; nessuna push dedicata (D-09) → FE STORY-03
- [x] **BE-STORY-06**: SDL solo additivo (diciotto righe, nessun handler nuovo) rigenerato dal boot reale di test, gate della fase (tsc, suite unit e integration) e handoff `BACKEND-NOTES.md` per la FE Phase 24 con SDL verbatim, semantica ed esempi di ogni campo, input e codice nuovo

### Account Deletion (BE-DEL) — Phase 26, aggiunta 2026-11-25

- [x] **BE-DEL-01**: Il personaggio conosce il proprietario: campo interno `Character.user` (indice `character_user`, mai sul filo né in un input) scritto dalla creazione nella stessa transazione del claim; la cancellazione trova così anche gli archiviati; un personaggio senza il campo si legge tollerante e il corrente resta raggiungibile da `User.currentCharacter`; nessun migratore (D-11, D-24)
- [x] **BE-DEL-02**: La `PendingQuest` di un viaggio verso una quest registra ciò che il tragitto è costato, nella stessa transazione del pasto: righe di cibo mangiato `travelFoodSpent` e punti vita persi per fame `travelHungerLifeLost`, campi interni mai sul filo, scritti dallo sweep, dall'arrivo e dall'imboscata vinta; nulla su un viaggio libero; campo assente = nulla da rimborsare (D-13, D-26)
- [x] **BE-DEL-03**: Una quest effettivamente cominciata (`startedAt` valorizzato, non conclusa, un personaggio dell'utente registrato; corsia standard `boss`, `enemy`, `aid`) si annulla alla cancellazione dell'account: i compagni rimasti tornano subito al marker della città che contiene il segnalino della quest, con corsia libera, `PendingQuest` cancellata e rimborso di cibo del tragitto, `pointsSpent` e vita persa per fame; la quest torna sul tabellone non avviata (`startedQuestResetOf`); push `questCancelled` col testo proprio; una `aid` avviata il cui unico ferito è il personaggio cancellato si risolve con le regole di oggi; una quest non cominciata libera solo il posto (D-13, D-26)
- [x] **BE-DEL-04**: La cancellazione dell'account è una sola transazione Mongo: annullamento delle quest cominciate PRIMA dell'archivio del personaggio corrente (`archiveWithinReporting` invariato), poi richieste, bozze guidate, esiti, personaggi (anche archiviati), ticket, device push, verifiche d'accesso e utente; sessioni revocate e tenute alla loro scadenza accorciata; un test d'integrazione fa l'inventario per collection e prova che nulla resta legato all'utente o ai suoi personaggi tranne registro dell'oste, registro EventSub e sessioni revocate in scadenza (D-04, D-14)
- [x] **BE-DEL-05**: `deleteMyAccount: Boolean!` cancella l'account di chi la chiama (identità dal bearer, nessun argomento, nessun personaggio richiesto); il ruolo oste letto dal DB è rifiutato con `INNKEEPER_ACCOUNT_PROTECTED` senza scrivere nulla; un utente già sparito riceve `UNAUTHENTICATED`; lo stesso account Twitch rientra subito da zero (D-04, D-16, D-17, D-20)
- [x] **BE-DEL-06**: Revoca immediata con motivo: `SessionRevokeReason.accountDeleted`; le sessioni dell'utente sono revocate con scadenza accorciata alla vita dell'access token (15 minuti): in quella finestra il refresh risponde `SESSION_REVOKED` con `extensions.reason = "accountDeleted"` e i socket si chiudono (e si richiudono alla riconnessione) con 4409 e la stessa reason; un registro in memoria di 15 minuti degli id utente cancellati fa rispondere `UNAUTHENTICATED` alle chiamate HTTP con un access token ancora valido; dopo la finestra il refresh ricade su `SESSION_EXPIRED` (ripiego dichiarato) (D-03, D-06, D-18)
- [x] **BE-DEL-07**: `deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!`, solo oste: il nome utente Twitch si normalizza e si risolve con Helix (token app dalle credenziali del login), poi la stessa cancellazione; errori `TWITCH_USER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `INNKEEPER_ACCOUNT_PROTECTED`, `TWITCH_UNAVAILABLE`; voce del registro dell'oste con argomenti oscurati e bersaglio = Twitch ID risolto; il nome utente non finisce in nessuna collection né nei log (D-15, D-16, D-20, D-25)
- [x] **BE-DEL-08**: Effetti dopo il commit, mai dentro: ritratto Cloudinary accodato nella transazione in un outbox senza legame all'utente (solo cartella dei ritratti, mai un'immagine ancora usata da un altro personaggio), cancellato dopo il commit e ritentato da uno sweeper; token push disiscritti dal topic `streamer-live`; push `questCancelled` ai compagni rientrati e ai soccorritori liberati; `characterUpdated` e `questUpdated` dai change stream; un fallimento di questi passi è registrato e non annulla la cancellazione (D-25, N6)
- [x] **BE-DEL-09**: SDL solo additivo (due mutation e `type DeletedAccount`, cinque righe, nessuna tolta) rigenerato dal boot reale di test, gate della fase e handoff `BACKEND-NOTES.md` per la FE Phase 25 col contratto finale (mutation, codici, motivo di revoca e sua finestra, `termsVersion` e redirect di rifiuto, ciò che arriva all'app per una quest annullata, ciò che si cancella e ciò che resta)

### Legal Consent (BE-CONSENT) — Phase 26, aggiunta 2026-11-25

- [x] **BE-CONSENT-01**: Il login Twitch porta la versione accettata dei documenti come `termsVersion` su `GET /auth/twitch/start` (forma `^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`), firmata nello state OAuth; versione assente o malformata allo start, o state senza versione al callback, → redirect all'app con `?error=terms_not_accepted`; nessun endpoint della versione corrente, nessuna riaccettazione (D-09, D-12, D-19)
- [x] **BE-CONSENT-02**: Il callback scrive versione e data dell'accettazione (orologio del BE) nell'upsert che crea l'utente (nessun utente nasce senza consenso) e su un utente esistente solo quando la versione in arrivo è diversa da quella salvata: un login con la stessa versione lascia versione e data intatte (la data è quella dell'accettazione, non dell'ultimo login); campi interni, mai sul filo; il bypass di sviluppo è esente e gli utenti di sviluppo senza consenso non rompono refresh né bypass; nessun migratore (D-09, D-11, D-19)

## Future Requirements

Rinviati oltre la v1.1. Tracciati ma non nella roadmap corrente.

- ~~**BE-FUT-01**: Refresh/rotazione del JWT di sessione (per v1.0: TTL breve + re-login trasparente FE)~~ — **consegnato nella Phase 2** (2026-10-06): access JWT 15 min + refresh token rotante con reuse detection (BE-AUTH); la revoca delle altre sessioni al login è la Phase 17 _(riallineato 2026-11-09)_
- **BE-FUT-02**: Redis PubSub adapter per scaling orizzontale delle subscription
- **BE-FUT-03**: Pet/mount speed modifiers su `activeTravel.duration` (FE FUT-02)
  _**Consegnato** nella Phase 8 (D-08, 2026-10-21): `Pet.speedModifier` modifica la durata di ogni viaggio; il compagno equipaggiato si sceglie dal Diario dalla FE Phase 13 (2026-11-03). Resta qui solo come traccia (riallineato 2026-11-09)._
- **BE-FUT-04**: Combat log round-per-round (FE FUT-01)
- **BE-FUT-05**: Riconciliazione/refund redemption EventSub (reject della redemption su Twitch quando il credito fallisce)
- **BE-FUT-06**: Stanze di presenza (FE FUT-05): un giocatore crea una stanza, altri entrano ed escono (tetto ≈ 50 membri), il server pubblica ai soli membri posizione, `activeTravel` e identità minima dei personaggi della stanza (subscription per stanza, snapshot all'ingresso, pulizia all'uscita o alla cancellazione del personaggio); nessun dato di gioco oltre la pedina; probabile dipendenza da BE-FUT-02 (PubSub Redis) per più istanze _(aggiunto 2026-11-09)_

## Out of Scope

| Feature | Motivo |
| ------- | ------ |
| Lista unica dell'inventario, `damages` / `requiredLearnTime` delle magie, regole di combattimento | Escluse dalla revisione dei modelli nel discuss della Phase 19 (sessione separata) |
| Costi di cibo e vita sulla deviazione dopo un'imboscata | Regola dell'utente nel discuss della Phase 20: la deviazione non costa |
| «Esci da tutti i dispositivi», stanze di presenza (BE-FUT-06), E2E EventSub managed, promemoria di produzione | Backlog dopo la v1.1 (decisione dell'utente 2026-11-10: solo le tre fasi discusse) |
| Tutto ciò che `PROJECT.md` elenca come Out of Scope | Invariato dalla v1.0 |

## Traceability

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| BE-HEAL-01 | Phase 18 | Complete |
| BE-HEAL-02 | Phase 18 | Complete |
| BE-HEAL-03 | Phase 18 | Complete |
| BE-HEAL-04 | Phase 18 | Complete |
| BE-HEAL-05 | Phase 18 | Complete |
| BE-HEAL-06 | Phase 18 | Complete |
| BE-HEAL-07 | Phase 18 | Complete |
| BE-HEAL-08 | Phase 18 | Complete |
| BE-HEAL-09 | Phase 18 | Complete |
| BE-MODEL-01 | Phase 19 | Complete |
| BE-MODEL-02 | Phase 19 | Complete |
| BE-MODEL-03 | Phase 19 | Complete |
| BE-MODEL-04 | Phase 19 | Complete — chiuso l'11 novembre 2026: `maxXp` dei 44 pet a DB (script di contenuto fuori repo) |
| BE-MODEL-05 | Phase 19 | Complete |
| BE-MODEL-06 | Phase 19 | Complete |
| BE-MODEL-07 | Phase 19 | Complete |
| BE-MODEL-08 | Phase 19 | Complete |
| BE-MODEL-09 | Phase 19 | Complete — chiuso l'11 novembre 2026: boot reale (primo boot coi conteggi attesi, secondo a zero) e modulo rimosso in TDD (`c3492ced`, `0822feee`) |
| BE-MODEL-10 | Phase 19 | Complete — chiuso l'11 novembre 2026: 44 pet collegati alle lore (43 esistenti + la lore nuova «Cavallo da viaggio») |
| BE-MODEL-11 | Phase 19 | Complete — chiuso l'11 novembre 2026: 44 rarità a DB (13 common, 8 uncommon, 8 rare, 12 ultrarare, 3 legendary), Molosso vendibile, Scheletro ultrarare |
| BE-MODEL-12 | Phase 19 | Complete — chiuso l'11 novembre 2026: 31 legami pet → nemico come ObjectId (13 pet senza nemico corrispondente) |
| BE-FOODP-01 | Phase 20 | Complete |
| BE-FOODP-02 | Phase 20 | Complete |
| BE-FOODP-03 | Phase 20 | Complete |
| BE-FOODP-04 | Phase 20 | Complete |
| BE-FOODP-05 | Phase 20 | Complete |
| BE-RANKP-01 | Phase 21 | Complete |
| BE-RANKP-02 | Phase 21 | Complete |
| BE-RANKP-03 | Phase 21 | Complete |
| BE-RANKP-04 | Phase 21 | Complete |
| BE-RANKP-05 | Phase 21 | Complete |
| BE-RANKP-06 | Phase 21 | Complete |
| BE-GMFLOW-01 | Phase 22 | Complete |
| BE-GMFLOW-02 | Phase 22 | Complete |
| BE-GMFLOW-03 | Phase 22 | Complete |
| BE-GMFLOW-04 | Phase 22 | Complete |
| BE-GMFLOW-05 | Phase 22 | Complete |
| BE-GMFLOW-06 | Phase 22 | Complete |
| BE-GMFLOW-07 | Phase 22 | Complete |
| BE-GMFLOW-08 | Phase 22 | Complete |
| BE-GMFLOW-09 | Phase 22 | Complete |
| BE-PET-01 | Phase 23 | Complete |
| BE-PET-02 | Phase 23 | Complete |
| BE-PET-03 | Phase 23 | Complete |
| BE-PET-04 | Phase 23 | Complete |
| BE-PET-05 | Phase 23 | Complete |
| BE-PET-06 | Phase 23 | Complete |
| BE-PET-07 | Phase 23 | Complete |
| BE-PET-08 | Phase 23 | Complete |
| BE-PET-09 | Phase 23 | Complete |
| BE-PET-10 | Phase 23 | Complete |
| BE-PET-11 | Phase 23 | Complete |
| BE-PET-12 | Phase 23 | Complete |
| BE-PET-13 | Phase 23 | Complete |
| BE-PET-14 | Phase 23 | Complete |
| BE-ORIGIN-01 | Phase 24 | Complete |
| BE-ORIGIN-02 | Phase 24 | Complete |
| BE-ORIGIN-03 | Phase 24 | Complete |
| BE-ORIGIN-04 | Phase 24 | Complete |
| BE-ORIGIN-05 | Phase 24 | Complete |
| BE-ORIGIN-06 | Phase 24 | Complete |
| BE-ORIGIN-07 | Phase 24 | Complete |
| BE-ORIGIN-08 | Phase 24 | Complete |
| BE-ORIGIN-09 | Phase 24 | Complete |
| BE-ORIGIN-10 | Phase 24 | Complete |
| BE-ORIGIN-11 | Phase 24 | Complete |
| BE-ORIGIN-12 | Phase 24 | Complete |
| BE-ORIGIN-13 | Phase 24 | Complete |
| BE-ORIGIN-14 | Phase 24 | Complete |
| BE-ORIGIN-15 | Phase 24 | Complete |
| BE-ORIGIN-16 | Phase 24 | Complete |
| BE-ORIGIN-17 | Phase 24 | Complete |
| BE-ORIGIN-18 | Phase 24 | Complete |
| BE-WOUND-01 | Phase 25 | Complete |
| BE-WOUND-02 | Phase 25 | Complete |
| BE-WOUND-03 | Phase 25 | Complete |
| BE-WOUND-04 | Phase 25 | Complete |
| BE-WOUND-05 | Phase 25 | Complete |
| BE-WOUND-06 | Phase 25 | Complete |
| BE-STORY-01 | Phase 25 | Complete |
| BE-STORY-02 | Phase 25 | Complete |
| BE-STORY-03 | Phase 25 | Complete |
| BE-STORY-04 | Phase 25 | Complete |
| BE-STORY-05 | Phase 25 | Complete |
| BE-STORY-06 | Phase 25 | Complete |
| BE-DEL-01 | Phase 26 | Complete |
| BE-DEL-02 | Phase 26 | Complete |
| BE-DEL-03 | Phase 26 | Complete |
| BE-DEL-04 | Phase 26 | Complete |
| BE-DEL-05 | Phase 26 | Complete |
| BE-DEL-06 | Phase 26 | Complete |
| BE-DEL-07 | Phase 26 | Complete |
| BE-DEL-08 | Phase 26 | Complete |
| BE-DEL-09 | Phase 26 | Complete |
| BE-CONSENT-01 | Phase 26 | Complete |
| BE-CONSENT-02 | Phase 26 | Complete |

**Coverage:** 96 / 96 requisiti v1.1 mappati (9 BE-HEAL → Phase 18, 12 BE-MODEL → Phase 19, 5 BE-FOODP → Phase 20, 6 BE-RANKP → Phase 21, 9 BE-GMFLOW → Phase 22, 14 BE-PET → Phase 23, 18 BE-ORIGIN → Phase 24, 6 BE-WOUND e 6 BE-STORY → Phase 25, 9 BE-DEL e 2 BE-CONSENT → Phase 26). Nessun orfano, nessun duplicato.

---

_Requisiti definiti: 2026-11-10 (apertura della v1.1; testo BE-HEAL, BE-MODEL e BE-FOODP dai discuss del 2026-11-09)_
