# Requirements: Klimmeck Guide Backend — v1.1 Cura e modelli

**Definiti:** 2026-11-10
**Core Value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.
**Milestone:** v1.1 Cura e modelli (Phases 18–20), gemella della milestone FE v1.1 «Healing & Models» (FE Phases 18–19). I requisiti della v1.0 sono archiviati in [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md).

I requisiti sono stati scritti nei discuss del 2026-11-09 (`18-CONTEXT.md`, `19-CONTEXT.md`, `20-CONTEXT.md`) e confermati come scope della v1.1 il 2026-11-10. Le frecce «→ FE …» indicano il requisito FE che consuma il contratto.

## v1.1 Requirements

### Heal Quests by Size (BE-HEAL) — Phase 18, aggiunta 2026-11-09

- [ ] **BE-HEAL-01**: `Quest.prizes.cure` sotto-documento nullable `{ lifePointsShare: Number in [0, 1], canHeal: [InjuryType] }` (`QuestCure` sullo SDL, campo additivo `QuestPrizes.cure`, `QuestCureInput` in `QuestPrizesInput`); `canHeal` riusa nome e semantica di `LootItem.canHeal` (enum Mongoose, default vuota); `cure` assente = nessuna cura, nessuna migrazione → FE HEAL-01
- [ ] **BE-HEAL-02**: Una quest vinta che porta `cure` riporta `currentLifePoints` almeno a `round(maxLifePoints × lifePointsShare)` (tetto: mai sopra il massimo né sotto il corrente, calcolato sul massimo dopo la progressione) e toglie da `status.injuries` le ferite presenti in `canHeal` nella stessa scrittura; vale per ogni tipo di quest (il ramo `type === heal` della Phase 9 D-15 è superato); primitiva pura `cureInjuries` riusabile → FE HEAL-01
- [ ] **BE-HEAL-03**: Contenuto delle 166 heal fisse scritto a DB per taglia (`citySizeOf`) con script mirato fuori repo (D-36) dopo la revisione dell'utente su file e dopo la merge: liste villaggio 19 (gravità FE ≤ 20) / città 28 (≤ 40) / capitale 37, ritocchi per `CityType` (montagna/nord, deserto, tropicale, mare), quota 0,5 / 0,8 / 1, `timeToComplete` 2 / 5 / 8 h, tre descrizioni per taglia nella voce del tempio; titoli, `minTitle` rookie, gratuità e Necrorian invariati → FE HEAL-03
- [ ] **BE-HEAL-04**: `QuestResult.injuriesHealed: [InjuryType!]!` (default vuota) con le ferite tolte da quell'esito per il partecipante, accanto a `hpBefore`/`hpAfter` → FE HEAL-02
- [ ] **BE-HEAL-05**: Unit (primitiva, tetto, piano con `cure` null/0/1 e su quest non heal), integration (heal di villaggio: una ferita tolta e una no, HP al 50 %, `injuriesHealed` sul filo; SDL verbatim della FE), boot reale con SDL additivo, handoff `BACKEND-NOTES.md` per la FE Phase 18 con tre quest d'esempio e il runbook dello script di contenuto
- [ ] **BE-HEAL-06**: `LootItem.recovery` sotto-documento nullable `{ time: ms intero ≥ 0, turns: intero ≥ 0 }` (`LootRecovery` sullo SDL, input admin) e `LootItem.relatedLore: [Lore]` (ref, filtrata per viewer come le altre) additivi; `CharacterStatus.potionRecoveryUntil: DateTime` nullable additivo, una sola data per personaggio, nessun processor; `turns` solo dato per il motore di combattimento (il combattimento non legge né scrive la ricarica) → FE HEAL-04, HEAL-05
- [ ] **BE-HEAL-07**: Mutation `useItem(itemId: ID!): UseItemResult` sul bearer: rifiuti in ordine `AWAITING_AID`, `ITEM_NOT_OWNED`, `ITEM_NOT_USABLE` (effetto non heal o `recovery.time` assente), `POTION_RECOVERING` (con `recoveryUntil` nelle extensions), `ITEM_NO_EFFECT` (HP pieni e nessuna ferita in `canHeal`: nessun consumo né ricarica); consentita in città e in viaggio; una sola scrittura atomica (HP + `power` fino al massimo, ferite − `canHeal` con `cureInjuries`, pila − 1 con le guardie di quantità, `potionRecoveryUntil = now + recovery.time`, `relatedLore` dell'oggetto in `unlockedLore`) e risultato `{ hpBefore, hpAfter, injuriesHealed, quantityLeft, recoveryUntil, loreUnlocked }` → FE HEAL-04, HEAL-05
- [ ] **BE-HEAL-08**: Contenuto fuori repo dopo la merge e la revisione dell'utente: `recovery.time` delle 28 pozioni heal dalla tabella (30 min–24 h: base per potenza, scalino per rarità, minimi per ferita più grave), `turns` dalla bozza, lore nuova «Il limite del corpo» (`knowledge`) scritta a DB e collegata dalle 28 pozioni; integration su prima pozione, seconda entro la ricarica, nessun effetto, attesa di soccorso, viaggio; handoff aggiornato con lo script e la lore → FE HEAL-04, HEAL-05

### Model Review (BE-MODEL) — Phase 19, aggiunta 2026-11-09

- [ ] **BE-MODEL-01**: `Enemy.weaknesses { base: [DamageType], energy: [EnergyType] }` sostituisce `energyWeaknesses` e `baseWeaknesses` (modello, SDL non additivo, `EnemyInput`); generatore (`recommended-loot`) e combattimento leggono il sotto-documento; migratore idempotente sui 206 nemici → FE MODEL-01
- [ ] **BE-MODEL-02**: `Enemy.spells` diventa una lista di riferimenti al catalogo (stesso SDL `[Spell!]!`); il migratore abbina le copie incorporate per `_id` o per `name` e riporta nel log quelle senza corrispondenza, senza inventarle → FE MODEL-01
- [ ] **BE-MODEL-03**: Lo stato del pet vive sul personaggio: `CharacterAssets.ownedPets: [OwnedPet { pet, xp, currentLifePoints }]` (non additivo), il catalogo `Pet` perde `xp` e `currentLifePoints`, tiene `maxLifePoints`, `maxXp`, prezzi, `speedModifier`, `sellable`, `imagePath` e sostituisce `damages` con `attack: Damages` e `defense: Damages` (SDL non additivo; migratore: i danni attuali → `attack`, `defense` vuoto per la cura a DB); acquisto, vendita, premio e «già posseduto» sulle voci; `assets.pet` resta il riferimento al catalogo; migratore (`xp` 0, vita = `maxLifePoints`) → FE MODEL-02
- [ ] **BE-MODEL-04**: A ogni vittoria con nemici (quest individuale, party, dungeon, imboscata vinta) il compagno equipaggiato riceve `round(Σ Enemy.xp × PET_XP_SHARE)` con `PET_XP_SHARE` 0,10 (costante), senza il premio della quest, tetto `maxXp` del catalogo, nella stessa scrittura dell'esito; `QuestResult.petXpGained: Int!` additivo (default 0); `maxXp` dei 44 pet rivisti a DB dalla tabella approvata (contenuto dopo la merge) → FE MODEL-02
- [ ] **BE-MODEL-05**: `CharacterAssets.wearedEquipment` → `wornEquipment` e `Equipment.foots` → `feet` (modello, SDL non additivo, input, filtri di `equipItem` e del negozio); migratore con rinomina → FE MODEL-03
- [ ] **BE-MODEL-06**: `status.spellStates [{ spell, usages, recoveries, active }]` è l'unica lista delle magie: `status.spells` e `assets.activeSpells` tolti da modello e SDL; equip/unequip scrivono `active`, uso/recupero/apprendimento/combattimento lavorano sulle voci; `maxActiveSpells` resta sullo SDL come resolve field calcolato e perde il `@Prop`; migratore che fonde le tre liste (log sui conflitti di `usages`) → FE MODEL-03
- [ ] **BE-MODEL-07**: `PointOfInterest.quest` tolto da modello, SDL e input (nessun lettore, 0 su 642 POI); `City.shop { equipment, loot, pets }` sostituisce i tre array del pool (solo Mongoose; `cityShop`, report e vendita lo leggono; pool presenti conservati) → FE MODEL-01
- [ ] **BE-MODEL-08**: `Lore.image` → `Lore.imagePath` (modello, SDL non additivo, input, migratore); file enum `item_reference_type.enum.ts` e `slot_type.enum.ts` rinominati in kebab-case; modello `KGNotification` rimosso → FE MODEL-01
- [ ] **BE-MODEL-09**: Un solo modulo one-off `src/migrations/model-review/` con un passo idempotente per decisione e log di soli conteggi, eseguito al boot reale dall'orchestratore dopo il backup e rimosso in TDD prima della merge; unit sui migratori e sul premio xp del pet, integration per area, SDL verbatim della FE, handoff `BACKEND-NOTES.md` con la tabella dei cambi SDL vecchio → nuovo

### Progressive Travel Food (BE-FOODP) — Phase 20, aggiunta 2026-11-09

- [ ] **BE-FOODP-01**: La partenza (libera e da quest) calcola il piano con `planTravelFood` come oggi (anteprima e rifiuto «arrivi vivo» identici) e lo salva su `activeTravel.food` (interno: fabbisogno, km coperti, perdita totale, km settati, cibo consumato) senza consumare cibo né scalare vita; i viaggi senza piano (iniziati prima del deploy) sono ignorati dalle regole nuove; nessun cambio SDL
- [ ] **BE-FOODP-02**: Lo sweep del viaggio (`TRAVEL_SWEEP_INTERVAL_MS`) scala `currentLifePoints` solo oltre i km coperti, come perdita incrementale dei km fatti dall'ultimo passaggio con la curva triangolare della Phase 14 (il km scoperto n-esimo costa n HP), km dal tempo come il `km` dell'imboscata, scrittura atomica guardata da `settledKm`, mai sotto 1; pozioni e danni si sommano
- [ ] **BE-FOODP-03**: Il cibo si toglie una sola volta per viaggio, in blocco, con la selezione a scarto minimo sul posseduto in quel momento: alla fine dei km coperti (fabbisogno totale), all'arrivo (come oggi) o alla sconfitta e al teleport a viaggio iniziato (fabbisogno dei soli km percorsi); consumo come vendita senza incasso con le guardie di quantità; la deviazione dopo la sconfitta non ha piano (né cibo né fame)
- [ ] **BE-FOODP-04**: L'imboscata setta la fame esatta al suo km (e il cibo se oltre il confine) prima del combattimento; in vittoria il viaggio prosegue con lo stesso piano; l'arrivo setta la fame fino a fine percorso e il cibo nella transazione del completamento; i totali a fine viaggio coincidono con quelli della Phase 14
- [ ] **BE-FOODP-05**: Unit (funzione pura, km dal tempo, selezione parziale), integration con orologio finto (partenza, sweep prima/dopo il confine, pozione fra due sweep, imboscata, sconfitta pro-rata, arrivo, teleport, legacy), boot reale con SDL identico, handoff `BACKEND-NOTES.md` con la semantica nuova e il piano di UAT su device

## Future Requirements

Rinviati oltre la v1.1. Tracciati ma non nella roadmap corrente.

- **BE-FUT-01**: Refresh/rotazione del JWT di sessione (per v1.0: TTL breve + re-login trasparente FE)
- **BE-FUT-02**: Redis PubSub adapter per scaling orizzontale delle subscription
- **BE-FUT-03**: Pet/mount speed modifiers su `activeTravel.duration` (FE FUT-02)
  _Anticipato nella Phase 8 (D-08, 2026-10-21): `Pet.speedModifier` modifica la durata di ogni viaggio._
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
| BE-HEAL-01 | Phase 18 | Pending |
| BE-HEAL-02 | Phase 18 | Pending |
| BE-HEAL-03 | Phase 18 | Pending |
| BE-HEAL-04 | Phase 18 | Pending |
| BE-HEAL-05 | Phase 18 | Pending |
| BE-HEAL-06 | Phase 18 | Pending |
| BE-HEAL-07 | Phase 18 | Pending |
| BE-HEAL-08 | Phase 18 | Pending |
| BE-MODEL-01 | Phase 19 | Pending |
| BE-MODEL-02 | Phase 19 | Pending |
| BE-MODEL-03 | Phase 19 | Pending |
| BE-MODEL-04 | Phase 19 | Pending |
| BE-MODEL-05 | Phase 19 | Pending |
| BE-MODEL-06 | Phase 19 | Pending |
| BE-MODEL-07 | Phase 19 | Pending |
| BE-MODEL-08 | Phase 19 | Pending |
| BE-MODEL-09 | Phase 19 | Pending |
| BE-FOODP-01 | Phase 20 | Pending |
| BE-FOODP-02 | Phase 20 | Pending |
| BE-FOODP-03 | Phase 20 | Pending |
| BE-FOODP-04 | Phase 20 | Pending |
| BE-FOODP-05 | Phase 20 | Pending |

**Coverage:** 22 / 22 requisiti v1.1 mappati (8 BE-HEAL → Phase 18, 9 BE-MODEL → Phase 19, 5 BE-FOODP → Phase 20). Nessun orfano, nessun duplicato.

---

_Requisiti definiti: 2026-11-10 (apertura della v1.1; testo BE-HEAL, BE-MODEL e BE-FOODP dai discuss del 2026-11-09)_
