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

- [ ] **BE-GMFLOW-01**: Query solo innkeeper della lista nemici per una richiesta: tipi del POI + habitat `city` nella fascia xp del titolo della missione, leggendari ammessi per le worldMission, opzione «mostra tutti»
- [ ] **BE-GMFLOW-02**: Simulazione a secco di uno scontro (uno o più nemici con quantità) col `CombatResolver` sullo stato corrente o su quello lasciato dallo scontro precedente; nessuna scrittura su personaggi, quest o risultati; esito, HP, ferite, consumabili e magie per personaggio
- [ ] **BE-GMFLOW-03**: Bozza del flusso salvata sulla richiesta (passo, luogo, scontri, simulazioni, correzioni, premi), ripresa da qualunque dispositivo dell'oste, invisibile ai giocatori, invalidata se la richiesta sparisce
- [ ] **BE-GMFLOW-04**: Correzioni per personaggio (ferite tolte o aggiunte, vita 1..max, consumabili e magie usati) validate come gli override di oggi
- [ ] **BE-GMFLOW-05**: Premi per personaggio dal blocco del titolo (Phase 21) con aggiunte/rimozioni dal catalogo filtrato per titolo, rivalidati nel BE (tetto di rarità, pet, magie solo `isSpellCaster` e con `minXpToLearn`)
- [ ] **BE-GMFLOW-06**: Completamento in una transazione: stato finale, nemici in `QuestResult.enemies`, xp dei nemici e del compagno, conoscenza e lore di vittoria, premi scelti; sempre `gmCompleted`, nessuna aid
- [ ] **BE-GMFLOW-08**: Dall'avvio del flusso al risultato i partecipanti espongono lo stato «missione in corso» e non possono partire, accettare quest, comprare o vendere, cambiare equipaggiamento, compagno o magie equipaggiate, né bere pozioni (codice di rifiuto proprio); sblocco al completamento o allo scarto della bozza
- [ ] **BE-GMFLOW-09**: Lo stesso blocco vale per ogni missione dall'inizio effettivo (arrivo alla quest della corsia standard, `startedAt` delle registrate) all'esito: `equipItem`, `equipPet`, `unequipPet`, `equipSpell`, `unequipSpell`, `useSpell`, `useItem` e le transazioni del negozio rifiutate con lo stesso codice; stato «missione in corso» esposto sul personaggio
- [ ] **BE-GMFLOW-07**: Ruolo innkeeper e audit su ogni mutation nuova (le query dell'oste non si registrano, come oggi); unit + integration; SDL al boot reale; handoff `BACKEND-NOTES.md` per la FE Phase 21 con una worldMission e una story d'esempio per l'UAT

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
| BE-GMFLOW-01 | Phase 22 | Pending |
| BE-GMFLOW-02 | Phase 22 | Pending |
| BE-GMFLOW-03 | Phase 22 | Pending |
| BE-GMFLOW-04 | Phase 22 | Pending |
| BE-GMFLOW-05 | Phase 22 | Pending |
| BE-GMFLOW-06 | Phase 22 | Pending |
| BE-GMFLOW-07 | Phase 22 | Pending |
| BE-GMFLOW-08 | Phase 22 | Pending |
| BE-GMFLOW-09 | Phase 22 | Pending |

**Coverage:** 41 / 41 requisiti v1.1 mappati (9 BE-HEAL → Phase 18, 12 BE-MODEL → Phase 19, 5 BE-FOODP → Phase 20, 6 BE-RANKP → Phase 21, 9 BE-GMFLOW → Phase 22). Nessun orfano, nessun duplicato.

---

_Requisiti definiti: 2026-11-10 (apertura della v1.1; testo BE-HEAL, BE-MODEL e BE-FOODP dai discuss del 2026-11-09)_
