# Roadmap: Klimmeck Guide — Backend

**Created:** 2026-07-16
**Last updated:** 2026-11-10 — milestone v1.1 Cura e modelli aperta (Phases 18–20); v1.0 Core Loop (BE) archiviata in `milestones/v1.0-ROADMAP.md`
**Milestone:** v1.1 Cura e modelli — Phases 18–20 (gemella della milestone FE v1.1 «Healing & Models», FE Phases 18–19)

## Milestones

- ✅ **v1.0 Core Loop (BE)** — Phases 1–17 con le inserite 2.1, 3.1, 9.1, 9.2, 13.1 (consegnata il 2026-11-10) — [archivio roadmap](milestones/v1.0-ROADMAP.md) · [archivio requisiti](milestones/v1.0-REQUIREMENTS.md) · [riepilogo](MILESTONES.md)
- 🚧 **v1.1 Cura e modelli** — Phases 18–20 (aperta il 2026-11-10) — quest heal per taglia con le pozioni dal Diario (↔ FE Phase 18), revisione dei modelli (↔ FE Phase 19), cibo e vita progressivi in viaggio (solo BE)

## Phases

<details>
<summary>✅ v1.0 Core Loop (BE) (Phases 1–17 + 2.1, 3.1, 9.1, 9.2, 13.1) — SHIPPED 2026-11-10</summary>

- [x] Phase 1: Fondazione Test & Consolidamento Spell WIP (5/5 plans) — completed 2026-07-23
- [x] Phase 2: Auth & Identity Foundation (10/10 plans) — completed 2026-10-06
- [x] Phase 2.1: Character Creation Contract (8/8 plans, INSERTED) — completed 2026-10-09
- [x] Phase 3: Autorizzazione: Ownership, Ruoli, Audit (10/10 plans) — completed 2026-10-14
- [x] Phase 3.1: Character Deletion Contract (6/6 plans, INSERTED) — completed 2026-10-16
- [x] Phase 4: Integrità Economica (Atomics) (9/9 plans) — completed 2026-10-18
- [x] Phase 5: Infrastruttura Push FCM (8/8 plans) — completed 2026-10-18
- [x] Phase 6: EventSub: Punti Canale & Streamer Live (9/9 plans) — completed 2026-10-21
- [x] Phase 7: Quest Lanes (QUEST-04) (8/8 plans) — completed 2026-10-21
- [x] Phase 8: Travel Lifecycle (TRAVEL-01) (14/14 plans) — completed 2026-10-21
- [x] Phase 9: Combat Result & Admin Outcomes (20/20 plans) — completed 2026-10-26
- [x] Phase 9.1: Spell State and Recovery Contract (10/10 plans, INSERTED) — completed 2026-10-27
- [x] Phase 9.2: Quest Result Delivery Contract (7/7 plans, INSERTED) — completed 2026-10-28
- [x] Phase 10: Hardening Trasversale (31/31 plans) — completed 2026-10-30
- [x] Phase 11: Popolamento del mondo (27/27 plans) — completed 2026-11-02
- [x] Phase 12: Negozi per città (19/19 plans) — completed 2026-11-03
- [x] Phase 13: Generazione quest (20/20 plans) — completed 2026-11-04
- [x] Phase 13.1: Correzioni generazione quest (8/8 plans, INSERTED) — completed 2026-11-05
- [x] Phase 14: Viaggio e cibo (8/8 plans) — completed 2026-11-05
- [x] Phase 15: Imboscate in viaggio (12/12 plans) — completed 2026-11-06
- [x] Phase 16: Lore sbloccabili (12/12 plans) — completed 2026-11-07
- [x] Phase 17: Autorizzazione e sessioni (10/10 plans) — completed 2026-11-09

Ordine seguito: numerico, con le inserite subito dopo la fase madre; ogni contratto consumato dalla FE è arrivato su `develop` prima della fase FE corrispondente (tabella «Backend ↔ Frontend alignment» nell'archivio). Goal, criteri di successo, piani e tracciabilità: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

</details>

### 🚧 v1.1 Cura e modelli (Phases 18–20)

**Obiettivo della milestone:** le quest heal curano in base al luogo e le pozioni si bevono dal Diario con una ricarica globale; i modelli vengono ripuliti con cambi non additivi dichiarati e un solo migratore one-off; cibo e vita del viaggio diventano progressivi. La numerazione continua da 18 (mai riparte).

- [x] **Phase 18: Quest heal per taglia** - Le quest `heal` curano in base al luogo: sotto-documento additivo `prizes.cure` con la quota di vita a cui la quest riporta gli HP (tetto: villaggio 50 %, città 80 %, capitale 100 %) e la lista `canHeal` delle ferite che guarisce (stesso nome e semantica del campo degli oggetti heal), applicato a ogni quest vinta che lo porta; `QuestResult.injuriesHealed`; contenuto delle 166 heal scritto a DB per taglia (liste ≤20 / ≤40 / tutte con ritocchi di lore per tipo di città, ore 2 / 5 / 8, descrizioni per taglia) dopo la revisione dell'utente; heal gratuite; **pozioni heal bevute dal Diario** con ricarica globale (`LootItem.recovery { time, turns }`, `status.potionRecoveryUntil`, mutation `useItem`, tempi 30 min–24 h a DB, `turns` solo dato per il motore di combattimento) e lore nuova «Il limite del corpo» sbloccata alla prima pozione (`LootItem.relatedLore`) _(aggiunta 2026-11-09 nel discuss congiunto con la FE Phase 18; la Phase 17 «Autorizzazione e sessioni» vive sul ramo `feat/17-autorizzazione-e-sessioni`; la 18 si esegue dopo la 17)_
- [ ] **Phase 19: Revisione dei modelli** - Pulizia dei modelli senza cambiare le regole, con cambi non additivi allo SDL dichiarati e un solo migratore one-off al boot reale: `Enemy.weaknesses { base, energy }`, magie dei nemici per riferimento, stato dei pet sul personaggio (`ownedPets [{ pet, xp, currentLifePoints }]`, il catalogo tiene le basi, `maxXp` rivisto e `attack`/`defense` al posto di `damages`) con il **10 % degli xp dei nemici al compagno equipaggiato** (tetto `maxXp`, `QuestResult.petXpGained`), `wornEquipment`/`feet`, una sola lista `spellStates` con `active` (via `status.spells` e `assets.activeSpells`), `maxActiveSpells` calcolato e non persistito, via `PointOfInterest.quest`, `City.shop { equipment, loot, pets }`, `Lore.imagePath`, file enum e modello morto _(aggiunta 2026-11-09, dopo la Phase 18)_
- [ ] **Phase 20: Cibo e vita progressivi in viaggio** - Il piano del cibo si calcola alla partenza come oggi (stessa selezione, anteprima e rifiuto) ma si paga lungo la strada: vita scalata dallo sweep ogni minuto solo nel tratto scoperto come perdita incrementale (esatta all'imboscata e all'arrivo, mai sotto 1), cibo tolto in blocco in tre momenti (fine dei km coperti, arrivo, sconfitta con la selezione a scarto minimo sui soli km percorsi); deviazione senza cibo né fame; nessun cambio SDL, nessuna companion FE _(aggiunta 2026-11-09, dopo la Phase 19; supera la Phase 14 D-04)_

**Ordine di esecuzione:** 18 → 19 → 20. Ogni contratto consumato dalla FE arriva su `develop` prima dei piani gated della fase FE gemella. Requisiti: [REQUIREMENTS.md](REQUIREMENTS.md).

## Phase Details

### Phase 18: Quest heal per taglia
**Goal**: La cura è un premio esplicito della quest, non una regola del tipo: `Quest.prizes.cure { lifePointsShare, canHeal }` separa la vita restituita (tetto sulla quota del massimo) dalle ferite guarite (lista di `InjuryType`, stesso nome e semantica di `LootItem.canHeal`); il piano d'esito applica la cura a ogni quest vinta che la porta e registra le ferite guarite sul risultato; il contenuto delle 166 heal fisse è scritto a DB per taglia di città (`citySizeOf`) con ritocchi di lore per tipo di città, ore e descrizioni per taglia, dopo la revisione dell'utente su un file e dopo la merge; le heal restano gratuite. Supera la Phase 9 D-15 (heal vinta = tutte le ferite via + HP al massimo). Nella stessa fase le pozioni heal si bevono dal Diario (`useItem`) con una ricarica globale per personaggio (`LootItem.recovery { time, turns }`, `status.potionRecoveryUntil`, 30 min–24 h a DB; `turns` solo dato per il motore di combattimento dell'utente) e una lore nuova «Il limite del corpo» spiega la regola, sbloccata alla prima pozione tramite `LootItem.relatedLore`.
**Depends on**: Phase 9 (piano d'esito, `QuestResult`), Phase 11 (heal fisse, descrizioni D-32), Phase 12 (`citySizeOf`), quick 261109-inj/inj2 (`LootItem.canHeal`, 37 `InjuryType`); **si esegue dopo la Phase 17** (ordine deciso dall'utente il 2026-11-09)
**Requirements**: BE-HEAL-01, BE-HEAL-02, BE-HEAL-03, BE-HEAL-04, BE-HEAL-05, BE-HEAL-06, BE-HEAL-07, BE-HEAL-08, BE-HEAL-09
**Success Criteria** (what must be TRUE):
  1. `QuestPrizes.cure: QuestCure` nullable (`lifePointsShare: Float!` in [0, 1], `canHeal: [InjuryType!]!` validata dall'enum, default vuota) su schema Mongoose, SDL (additivo) e `QuestPrizesInput`; `cure` assente = nessuna cura (fail-safe), nessuna migrazione.
  2. Una quest vinta con `cure` porta `currentLifePoints` almeno a `round(maxLifePoints × lifePointsShare)` (mai sopra il massimo, mai sotto il valore corrente, sul massimo dopo la progressione) e toglie da `status.injuries` le sole ferite presenti in `canHeal`, nella stessa scrittura dell'esito; il tipo della quest non conta (`heal` senza `cure` non cura; `job`/`story` con `cure` curano); la primitiva `cureInjuries` è pura e riusabile.
  3. `QuestResult.injuriesHealed: [InjuryType!]!` elenca le ferite tolte da quell'esito per il partecipante (default vuota), accanto a `hpBefore`/`hpAfter`.
  4. Contenuto (fuori repo, D-36): script di applicazione mirata con prova a secco, backup e file di revisione per le 166 heal: villaggio = 19 ferite (gravità FE ≤ 20), città = 28 (≤ 40), capitale = tutte e 37; ritocchi per `CityType` (montagna/nord + frostbite, hypothermia; deserto + severeBurn, exhaustion; tropicale + infection, poisonInjection; mare + hypothermia, infection); quota 0,5 / 0,8 / 1; `timeToComplete` 2 / 5 / 8 h; tre descrizioni per taglia nella voce del tempio; titoli, `minTitle` rookie, `requiredPoints` null e Necrorian invariati; applicato dopo l'OK dell'utente e dopo la merge, con i conteggi nel handoff.
  5. Integration: heal di villaggio su un personaggio con una ferita in lista e una fuori → una tolta, HP al 50 %, `injuriesHealed` sul filo; `cure` null → nulla; quest non heal con `cure` → cura; SDL verbatim della FE; handoff `BACKEND-NOTES.md` per la FE Phase 18 con tre quest d'esempio (una per taglia) e il runbook dello script.
  6. `LootItem.recovery: LootRecovery` nullable (`time` ms e `turns` interi ≥ 0, input admin) e `LootItem.relatedLore: [Lore]` (ref, filtrata per viewer) additivi sullo SDL; `CharacterStatus.potionRecoveryUntil: DateTime` nullable additivo; nessun processor né sweep.
  7. Mutation `useItem(itemId)` sul bearer: rifiuti in ordine (`AWAITING_AID`, `ITEM_NOT_OWNED`, `ITEM_NOT_USABLE` per effetto non heal o `recovery` assente, `POTION_RECOVERING` con `recoveryUntil` nelle extensions, `ITEM_NO_EFFECT` senza consumo né ricarica), consentita in città e in viaggio; una sola scrittura atomica (HP + `power` fino al massimo, ferite − `canHeal` con la primitiva, pila − 1, `potionRecoveryUntil = now + recovery.time`, `relatedLore` dell'oggetto in `unlockedLore`) che restituisce `UseItemResult { hpBefore, hpAfter, injuriesHealed, quantityLeft, recoveryUntil, loreUnlocked }`; il combattimento non tocca la ricarica.
  8. Contenuto (fuori repo): `recovery.time` per le 28 pozioni dalla tabella di D-18 (30 min–24 h), `turns` dalla bozza rivista dall'utente, la lore «Il limite del corpo» (`knowledge`) scritta a DB e collegata dalle 28 pozioni; integration: prima pozione → HP, ferita, pila, data di ricarica e lore nel risultato; seconda pozione entro la ricarica → `POTION_RECOVERING`; pozione a HP pieni senza ferite in lista → `ITEM_NO_EFFECT` e nulla scritto; in attesa di soccorso → rifiuto; in viaggio → consentita.
**Decisioni del discuss (2026-11-09, `18-CONTEXT.md` D-01..D-19)**: vita e ferite separate; tetto 50/80/100; liste ≤20/≤40/tutte + lore; ore 2/5/8; cura su ogni quest vinta con `cure`; `injuriesHealed`; contenuto dopo la merge su file rivisto; pozioni dal Diario con ricarica globale `recovery { time, turns }` (30 min–24 h, `turns` solo dato), `useItem` consentita in viaggio, lore «Il limite del corpo» sbloccata alla prima pozione; fuori scope il cibo (rinviato) e le pozioni in combattimento (motore dell'utente).
**Unblocks (FE)**: FE Phase 18 (HEAL-01..03).
**Branch**: `feat/18-quest-heal-per-taglia` da `develop` (`31dba96`), worktree → PR a `develop` dopo la merge della Phase 17.
**Plans**: 11 plans

Plans:
- [x] 18-01-PLAN.md — Primitive pure della cura: `cureInjuries`, `cureOf`, `lifePointsAfterCure`
- [x] 18-02-PLAN.md — Modello della cura e `injuriesHealed` (modello, draft, rescue, aid senza cura, SDL)
- [x] 18-03-PLAN.md — Cura nel piano d'esito (D-20, heal di villaggio sul filo)
- [x] 18-04-PLAN.md — Modelli delle pozioni: `LootRecovery`, `recovery`, `relatedLore`, `potionRecoveryUntil`, SDL
- [x] 18-05-PLAN.md — `LootItem.relatedLore` filtrata per viewer
- [x] 18-06-PLAN.md — Codici di rifiuto e `extensions.recoveryUntil` nei due formatter
- [x] 18-07-PLAN.md — Piano puro `planItemUse` (percorso felice e cinque rifiuti in ordine)
- [x] 18-08-PLAN.md — `ItemUseService`, mutation `useItem`, `UseItemResult`, transazione D-22, SDL, boot reale
- [x] 18-09-PLAN.md — Heal senza effetto, regola: `healHasNoEffect`, `QUEST_NO_EFFECT`, rifiuto di `acceptQuest`
- [x] 18-10-PLAN.md — Heal senza effetto, campo: `Quest.noEffect` per viewer su query e `questUpdated`, SDL
- [x] 18-11-PLAN.md — Gate, `BACKEND-NOTES.md`, validazione, requisiti chiusi dal codice

**Stato (2026-11-10)**: 11/11 piani eseguiti; gate passato, review corretta (11 fix, 3 chiusi per ruling), verifica `passed`, security senza minacce aperte, `test:cov` 390 suite / 5131 test verdi; PR verso `develop` in draft fino al contenuto a DB (BE-HEAL-03 e BE-HEAL-08 aperti: script dell'orchestratore dopo la merge).

**Chiusura (2026-11-11)**: PR #31 mergiata su `develop` (`66df2ef2`); contenuto applicato a DB dagli script fuori repo (conteggio di sola lettura dell'11 novembre: 166 quest con `prizes.cure` — 98 con quota 0,5, 58 con 0,8, 10 con 1 —, 28 pozioni con `recovery.time` e con `relatedLore`); BE-HEAL-03 e BE-HEAL-08 chiusi; E2E su device della FE Phase 18 passata contro `develop` `66df2ef2`.

### Phase 19: Revisione dei modelli
**Goal**: I modelli perdono campi doppi, nomi storti e strutture parallele senza cambiare le regole di gioco, con una sola aggiunta decisa dall'utente: il compagno equipaggiato riceve il 10 % degli xp dei nemici sconfitti (tetto `maxXp` del catalogo) e per questo lo stato del pet (xp, vita) lascia il catalogo condiviso e vive sul personaggio. Tre aree, un migratore one-off al boot reale rimosso prima della merge, SDL non additivo consumato dalla FE Phase 19 con piani gated.
**Depends on**: Phase 9 (esiti), Phase 9.1 (`spellStates`), Phase 12 (pet, pool), Phase 13 (`enemies`, debolezze nel generatore), Phase 16 (pattern del one-off), Phase 18 (stesso ramo, eseguita prima)
**Requirements**: BE-MODEL-01, BE-MODEL-02, BE-MODEL-03, BE-MODEL-04, BE-MODEL-05, BE-MODEL-06, BE-MODEL-07, BE-MODEL-08, BE-MODEL-09, BE-MODEL-10, BE-MODEL-11, BE-MODEL-12
**Success Criteria** (what must be TRUE):
  1. Catalogo: `Enemy.weaknesses { base: [DamageType], energy: [EnergyType] }` sostituisce i due campi (modello, SDL, input; generatore e combattimento leggono il sotto-documento); `Enemy.spells` è una lista di riferimenti al catalogo con lo stesso SDL; `Pet` perde `xp` e `currentLifePoints`, tiene le basi e sostituisce `damages` con due campi piatti `attack` e `defense` (ciascuno `Damages { base, energy }`; i danni attuali diventano `attack`, `defense` nasce vuoto per la cura a DB).
  2. Pet: `CharacterAssets.ownedPets: [OwnedPet { pet, xp, currentLifePoints }]` (non additivo); acquisto, vendita, premio e «già posseduto» lavorano sulle voci; a ogni vittoria con nemici il compagno equipaggiato riceve `round(Σ Enemy.xp × 0,10)` con tetto `maxXp`, nella stessa scrittura dell'esito (quest e imboscata), e il `QuestResult` porta `petXpGained`; `maxXp` dei 44 pet rivisti a DB dalla tabella approvata (contenuto a DB dentro la fase, D-25).
  3. Personaggio: `wornEquipment` con slot `feet`; `status.spellStates [{ spell, usages, recoveries, active }]` unica fonte (equip/unequip/uso/recupero/apprendimento/combattimento), `status.spells` e `assets.activeSpells` tolti; `maxActiveSpells` resolve field calcolato, non persistito.
  4. Mondo e pulizia: `PointOfInterest.quest` tolto da modello, SDL e input; `City.shop { equipment, loot, pets }` letto da `cityShop`, report e vendita; `Lore.imagePath`; file enum senza underscore; `KGNotification` rimosso.
  5. Un solo modulo one-off `src/migrations/model-review/` con un passo idempotente per decisione e log di conteggi, eseguito al boot reale e rimosso in TDD prima della merge; integration su ogni area e SDL verbatim; handoff `BACKEND-NOTES.md` con la tabella dei cambi SDL vecchio → nuovo per la FE Phase 19.
**Decisioni del discuss (2026-11-09, `19-CONTEXT.md` D-01..D-15)**: come sopra, più `Pet.attack`/`Pet.defense` al posto di `Pet.damages` (aggiunta dell'utente a discuss chiuso); fuori scope la fusione di `ownedEquipments`/`ownedItems`, `Spell.damages`/`requiredLearnTime` (sessione dedicata alle magie), le corsie di `CharacterQuests`, le regole di combattimento.
**Unblocks (FE)**: FE Phase 19 (MODEL-01..04).
**Branch**: `feat/19-revisione-dei-modelli` impilato su `feat/18-quest-heal-per-taglia` → PR a `develop` dopo quella della Phase 18.
**Plans**: 23 plans

Plans:
- [x] 19-01-PLAN.md — Scheletro del migratore una tantum (`src/migrations/model-review/`), boot a passi, fixture nella forma vecchia
- [x] 19-02-PLAN.md — D-01 `Enemy.weaknesses` (modello, lettori, SDL) e passo del migratore
- [x] 19-03-PLAN.md — D-02 magie dei nemici per riferimento (tre punti di populate) e passo di abbinamento
- [x] 19-04-PLAN.md — D-03/D-15 catalogo dei pet: `attack`/`defense`, stato fuori dal catalogo, SDL e passo
- [x] 19-05-PLAN.md — `OwnedPet` sul personaggio: modello, populate senza orfani, `equipPet`, SDL
- [x] 19-06-PLAN.md — Scrittori delle voci dei pet: acquisto, vendita, «già posseduto», pet in premio
- [x] 19-07-PLAN.md — Passo del migratore dei pet posseduti (archiviati compresi, orfani D-23)
- [x] 19-08-PLAN.md — Primitive degli xp del compagno: `PET_XP_SHARE`, `petXpAward`, tetti nel catalogo di combattimento
- [x] 19-09-PLAN.md — Xp del compagno nel piano d'esito e `petXpGained` (modello, draft, SDL)
- [x] 19-10-PLAN.md — Xp del compagno nell'imboscata vinta: report trattenuto e risultato all'arrivo (D-19)
- [x] 19-11-PLAN.md — D-26 `Pet.relatedLore` per viewer e lore sbloccata all'acquisto e al premio
- [x] 19-12-PLAN.md — D-09 via `PointOfInterest.quest` (modello, `cityRelations`, registro) e passo
- [x] 19-13-PLAN.md — D-10 `City.shop` (sotto-documento, lettori) e passo
- [x] 19-14-PLAN.md — D-11/D-20 `Lore.imagePath` e passo, `slot-type.enum.ts`, file vuoto e `KGNotification` rimossi
- [x] 19-15-PLAN.md — D-06 `wornEquipment`/`feet` (enum, modello, lettori, SDL) e passo a due rinomine
- [x] 19-16-PLAN.md — D-08 `maxActiveSpells` da virtual a resolve field
- [x] 19-17-PLAN.md — D-07 1/4: `SpellState.active` additivo, `mergeSpellLists` e passo
- [x] 19-18-PLAN.md — D-07 2/4: `SpellStateMigrator` ridotto al taglio (D-21), equip/unequip/uso/recupero sulla voce
- [x] 19-19-PLAN.md — D-07 3/4: piani d'esito, combattimento, override del GM, imboscata
- [ ] 19-20-PLAN.md — D-07 4/4: contrazione di modello, input, populate, registro e SDL
- [ ] 19-21-PLAN.md — D-27 `Pet.rarity` (modello, SDL con `enum RarityType`)
- [ ] 19-22-PLAN.md — D-28 pet in premio nelle quest generate per nemico e zona: `Pet.enemy`, `petPrizeOf`, generatore
- [ ] 19-23-PLAN.md — Gate, `BACKEND-NOTES.md` (tabella SDL, runbook del boot reale e del contenuto), validazione

### Phase 20: Cibo e vita progressivi in viaggio
**Goal**: Cibo e vita del viaggio si pagano mentre si cammina. La partenza calcola e salva il piano (stessa selezione a scarto minimo, stessa anteprima, stesso rifiuto se non si arriva vivi) senza consumare né scalare nulla; lo sweep del viaggio scrive ogni minuto la perdita incrementale dei chilometri scoperti fatti dall'ultimo passaggio (pozioni e danni d'imboscata si sommano, nulla li cancella; mai sotto 1), esatta al chilometro dell'imboscata e all'arrivo; il cibo si toglie in blocco alla fine dei chilometri coperti, all'arrivo o alla sconfitta (selezione sul fabbisogno dei soli chilometri percorsi, sul posseduto in quel momento). La deviazione resta senza cibo e senza fame. Supera la Phase 14 D-04 e la lettura «nessun rimborso» della BE-AMBUSH-05.
**Depends on**: Phase 14 (piano, selezione, curva, guardie), Phase 15 (km dell'imboscata, deviazione), Phase 18 (pozioni in viaggio), Phase 19 (stesso ramo, eseguita prima)
**Requirements**: BE-FOODP-01, BE-FOODP-02, BE-FOODP-03, BE-FOODP-04, BE-FOODP-05
**Success Criteria** (what must be TRUE):
  1. La partenza (libera e da quest) salva su `activeTravel.food` il piano interno (fabbisogno, km coperti, perdita totale, km settati, cibo consumato) e non scrive più inventario né vita; anteprima e rifiuto identici a oggi; i viaggi iniziati prima del deploy (senza piano) sono ignorati.
  2. Lo sweep del viaggio scala la vita solo oltre i km coperti, come perdita incrementale dei km fatti dall'ultimo passaggio con la curva triangolare della Phase 14, in una scrittura atomica guardata da `settledKm`, mai sotto 1; una pozione bevuta fra due passaggi resta nel conto.
  3. Il cibo si toglie una sola volta per viaggio, in blocco: alla fine dei km coperti (selezione del piano sul posseduto), all'arrivo (come oggi) o alla sconfitta (selezione a scarto minimo sul fabbisogno dei soli km percorsi); il teleport a viaggio iniziato chiude come una sconfitta; la deviazione dopo la sconfitta non ha piano.
  4. L'imboscata setta la fame esatta al suo km prima del combattimento (e il cibo se oltre il confine); in vittoria il viaggio prosegue con lo stesso piano; l'arrivo setta la fame fino a fine percorso e il cibo nella stessa transazione del completamento; totali a fine viaggio identici a oggi.
  5. Unit sulla funzione pura e sulla selezione parziale, integration con orologio finto (partenza senza scritture, sweep prima e dopo il confine, pozione fra due sweep, imboscata al km 290, sconfitta al km 30 con cibo pro-rata, arrivo, teleport, viaggio legacy), SDL identico al boot reale, handoff `BACKEND-NOTES.md` (semantica nuova per la FE Phase 15, piano di UAT su device con l'app com'è).
**Decisioni del discuss (2026-11-09, `20-CONTEXT.md` D-01..D-12)**: vita allo sweep solo nel tratto scoperto, incrementale; cibo prima e fame in coda; cibo in blocco in tre momenti con la selezione a scarto minimo sui km percorsi; deviazione senza costi; niente debito di fame né riga in app; fase solo BE dopo la 19.
**Unblocks (FE)**: nessuna fase FE (nessun cambio sul filo).
**Branch**: `feat/20-cibo-e-vita-progressivi` impilato su `feat/19-revisione-dei-modelli` → PR a `develop` dopo quella della Phase 19.
**Plans**: TBD

## Backend ↔ Frontend alignment (v1.1)

| Vincolo FE | Fase BE che lo soddisfa | Nota |
|-----------|------------------------|------|
| FE Phase 18 (quest heal per taglia + pozioni dal Diario) | Phase 18 (BE-HEAL) | `QuestPrizes.cure { lifePointsShare canHeal }`, `QuestResult.injuriesHealed`, `LootItem.recovery { time turns }`, `LootItem.relatedLore`, `CharacterStatus.potionRecoveryUntil`, mutation `useItem` → `UseItemResult` additivi; contenuto (liste, tempi, lore) a DB dopo la merge; esecuzione dopo la Phase 17 (discuss 2026-11-09); aggiunti il 2026-11-10: `Quest.noEffect` per viewer e codice `QUEST_NO_EFFECT` (heal senza effetto, D-25) |
| FE Phase 19 (model review companion) | Phase 19 (BE-MODEL) | SDL non additivo dichiarato: `Enemy.weaknesses`, `Pet.attack`/`Pet.defense` (via `Pet.damages`), `CharacterAssets.ownedPets: [OwnedPet!]!`, `QuestResult.petXpGained`, `wornEquipment`/`feet`, `SpellState.active` con `CharacterStatus.spells` e `CharacterAssets.activeSpells` tolti, `PointOfInterest.quest` tolto, `Lore.imagePath`; piani FE gated dalla merge (discuss 2026-11-09) |
| (nessuna fase FE) | Phase 20 (BE-FOODP) | Nessun cambio sul filo: vita e dispensa arrivano dallo stream durante il viaggio; la nota «inventario e HP cambiano solo via subscription» della FE Phase 15 resta vera (discuss 2026-11-09) |

La tabella della v1.0 è in [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fondazione Test & Consolidamento Spell WIP | v1.0 | 5/5 | Complete | 2026-07-23 |
| 2. Auth & Identity Foundation | v1.0 | 10/10 | Complete | 2026-10-06 |
| 2.1. Character Creation Contract | v1.0 | 8/8 | Complete | 2026-10-09 |
| 3. Autorizzazione: Ownership, Ruoli, Audit | v1.0 | 10/10 | Complete | 2026-10-14 |
| 3.1. Character Deletion Contract | v1.0 | 6/6 | Complete | 2026-10-16 |
| 4. Integrità Economica (Atomics) | v1.0 | 9/9 | Complete | 2026-10-18 |
| 5. Infrastruttura Push FCM | v1.0 | 8/8 | Complete | 2026-10-18 |
| 6. EventSub: Punti Canale & Streamer Live | v1.0 | 9/9 | Complete | 2026-10-21 |
| 7. Quest Lanes (QUEST-04) | v1.0 | 8/8 | Complete | 2026-10-21 |
| 8. Travel Lifecycle (TRAVEL-01) | v1.0 | 14/14 | Complete | 2026-10-21 |
| 9. Combat Result & Admin Outcomes | v1.0 | 20/20 | Complete | 2026-10-26 |
| 9.1. Spell State and Recovery Contract | v1.0 | 10/10 | Complete | 2026-10-27 |
| 9.2. Quest Result Delivery Contract | v1.0 | 7/7 | Complete | 2026-10-28 |
| 10. Hardening Trasversale | v1.0 | 31/31 | Complete | 2026-10-30 |
| 11. Popolamento del mondo | v1.0 | 27/27 | Complete | 2026-11-02 |
| 12. Negozi per città | v1.0 | 19/19 | Complete | 2026-11-03 |
| 13. Generazione quest | v1.0 | 20/20 | Complete | 2026-11-04 |
| 13.1. Correzioni generazione quest | v1.0 | 8/8 | Complete | 2026-11-05 |
| 14. Viaggio e cibo | v1.0 | 8/8 | Complete | 2026-11-05 |
| 15. Imboscate in viaggio | v1.0 | 12/12 | Complete | 2026-11-06 |
| 16. Lore sbloccabili | v1.0 | 12/12 | Complete | 2026-11-07 |
| 17. Autorizzazione e sessioni | v1.0 | 10/10 | Complete | 2026-11-09 |
| 18. Quest heal per taglia | v1.1 | 11/11 | Complete | 2026-11-11 |
| 19. Revisione dei modelli | v1.1 | 19/23 | In Progress | - |
| 20. Cibo e vita progressivi in viaggio | v1.1 | 0/0 | Not started | - |

---

_Roadmap creata: 2026-07-16_ · _v1.0 Core Loop (BE) archiviata: 2026-11-10_ · _v1.1 Cura e modelli aperta: 2026-11-10_
