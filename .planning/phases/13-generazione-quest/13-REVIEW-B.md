---
phase: 13-generazione-quest
group: B
reviewed: 2026-11-04T18:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/quests/outcomes/aid/aid-quest.ts
  - src/quests/outcomes/boss-resolution.service.ts
  - src/quests/outcomes/combat/combat-context.ts
  - src/quests/outcomes/combat/combat-resolver.ts
  - src/quests/outcomes/combat/placeholder-combat-resolver.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/dungeon/dungeon-context.ts
  - src/quests/outcomes/dungeon/dungeon-resolver.ts
  - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
  - src/quests/outcomes/gm-completion.service.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/outcome-writer.service.ts
  - src/quests/outcomes/quest-enemies.ts
  - src/quests/outcomes/quest-outcome-plan.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/quest-resolution.service.ts
  - src/quests/outcomes/rescue-plan.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/quest-catalog.populate.ts
  - src/quests/results/quest-result.populate.ts
  - src/quests/results/quest-results-read.module.ts
  - test/quests/outcome-world.ts
  - test/quests/quest-result.fixture.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 13: Code Review Report, gruppo B (outcomes)

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 24

## Summary

Il gruppo B e solido. Verificato punto per punto contro D-10..D-12, D-17, D-21, D-28, D-30:

- Multi-nemico: `readEnemies` fa un solo `find`, conserva i duplicati come voci separate, logga solo id per gli orfani; il segnaposto aggrega HP e danni per quantita senza cambiare il numero e l'ordine dei tiri (un tiro di vittoria, poi per partecipante 1 o 2 tiri ferita). `enemyFactsOf` somma xp x quantita e il draft porta `enemies` anche in sconfitta.
- Aid: clone di `enemies` via `validQuestEnemiesOf`, clone di `prizes.pet`, nessun `generated` (D-17), chiavi stabili.
- Dungeon: dispatch solo per `QuestType.dungeon` (le dungeon non sono tra i tipi registrati, quindi non passano mai da boss/rescue: coerente con D-12), stato portato fra le tappe con consumi e usi scalati a minimo 0, stop alla prima sconfitta, premi solo a fine percorso, `stagesCleared`/`stagesTotal` null fuori dalle dungeon.
- Pet: tiro 20 % per vincitore dopo loot e magia, solo se il pet e a catalogo, scrittura idempotente in `assets.ownedPets` senza toccare `assets.pet`, `rewards.pet` null in sconfitta e nei fogli di soccorso/morte.
- Hook: `regeneratesAfter` richiede `generated === true` e `concludedAt` nel `$set`; `deliver` chiama il trigger per ultimo, dopo il commit, con try/catch e WARN; le altre consegne non possono lanciare (`notify` e `enqueueTrigger` catturano). GM e soccorso non hanno hook: le generate sono solo `enemy`/`boss`, quindi nessun buco.
- Populate: filtro degli orfani su `enemies.enemy` e `pet` (pet a null, lista mai annullata), profondita 1. Modulo: `QuestGenerationTriggerModule` e il singleton condiviso con `QuestGenerationModule`, nessun ciclo, nessuna corsa al boot negli harness.

Un solo difetto di dominio (doppio conteggio degli indossati nei consigliati posseduti, latente finche l'algoritmo dell'utente non li legge) e tre note di qualita.

## Warning

### B-WR-01: i consigliati posseduti contano due volte gli equipaggiamenti indossati

**File:** `src/quests/outcomes/dungeon/dungeon-context.ts:56-87`
**Issue:** `possessedQuantityOf` per un `EquipmentItem` somma `ownedEquipments` e le copie negli slot (`wornCopiesOf`). Ma indossare non toglie l'oggetto da `ownedEquipments`: `equipItemFilter` richiede `assets.ownedEquipments.item` e `equipItemUpdate` scrive solo lo slot; `trade-inventory.ts` svuota lo slot solo quando la quantita posseduta arriva a zero. Quindi un indossato e sempre un sottoinsieme del posseduto. Scenario: un personaggio con una spada x1 nell'inventario e indossata nella mano destra ottiene `quantity: 2` per la spada consigliata (3 se la porta in due mani). Il RESEARCH (riga 153) parlava di unione («ownedItems U ownedEquipments U indossati»), l'implementazione somma. Il test «sums the owned and worn copies» (dungeon-context.spec.ts:142) codifica la somma e il test «worn included» usa `ownedEquipments: []`, un caso impossibile nel gioco.
**Why it matters:** D-11 consegna all'algoritmo finale dell'utente quantita da cui dipendono perdita di vita e ferite nelle prove di esplorazione: un conteggio gonfiato falsa il verdetto senza errori visibili. Oggi il segnaposto non li legge, quindi il danno e latente, ma il contratto della porta e sbagliato.
**Suggested fix:** per gli equipaggiamenti, quantita = posseduta; contare l'indossato solo per le copie che superano il posseduto (dato incoerente a mano), cioe `Math.max(owned, worn)`. Spec RED prima: (1) `ownedEquipments: [{ item: sword, quantity: 1 }]` con spada in `rightHand` ⇒ `quantity: 1`; (2) `quantity: 1` indossata in due slot ⇒ `max(1, 2) = 2` oppure 1 se si decide di limitare al posseduto (da fissare con l'utente); (3) il caso `ownedEquipments: []` con slot indossato resta 1. Aggiornare i due test esistenti di conseguenza.

## Info

### B-IN-01: dungeon senza nemici validi: successo automatico con `stagesTotal` null, ramo 0/0 del segnaposto irraggiungibile

**File:** `src/quests/outcomes/combatant-plan.ts:62` (con `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts:107` e `src/quests/outcomes/quest-resolution.service.ts:176`)
**Issue:** `combatContextOf` restituisce null con catalogo nemici vuoto, quindi `fight` esce prima del dispatch e una dungeon con tutti i nemici orfani (o `enemies` vuoto scritto a mano) si risolve in successo automatico con premi pieni e `stagesCleared`/`stagesTotal` null. Il ramo «zero nemici ⇒ successo 0/0» di `PlaceholderDungeonResolver.explore` non e mai raggiunto dal servizio, e il foglio dice «non e una dungeon a tappe» invece di 0/0. E la stessa scelta di C6/D-01 per tutti i tipi, ma D-12 non la discute per le dungeon.
**Why it matters:** non e un bug nuovo (stesso comportamento di enemy/boss), ma il contratto e doppio: la porta dice 0/0, il servizio null. Cancellare a DB l'unico nemico di una dungeon regala i premi di fine percorso senza avvertire.
**Suggested fix:** decidere e documentare in un commento di `fight`: o si accetta (e si toglie o si segna come difensivo il ramo 0/0 del segnaposto, con una spec che ne dichiari l'uso solo diretto), oppure si fa passare la dungeon dalla porta con contesto vuoto e `stages: { cleared: 0, total: 0 }`. Spec RED nel secondo caso: dungeon con nemici tutti orfani ⇒ `stagesTotal: 0`.

### B-IN-02: `isPositiveInteger` duplicato con semantica diversa

**File:** `src/quests/outcomes/dungeon/dungeon-context.ts:22`
**Issue:** il file ridefinisce `isPositiveInteger` con `Number.isInteger(value) && value >= 1`, mentre `src/quests/outcomes/outcome-numbers.ts` esporta lo stesso nome con `Number.isSafeInteger(value) && value > 0` (usato da `quest-enemies.ts` e `outcome-plan.ts`). Un valore come `2 ** 60` passa in uno e non nell'altro.
**Why it matters:** regola Boy Scout del progetto (zero duplicazione) e rischio di divergenza futura sulla validazione delle quantita.
**Suggested fix:** importare `isPositiveInteger` da `../outcome-numbers` e cancellare la copia locale.

### B-IN-03: `readEnemies` legge i documenti `Enemy` interi

**File:** `src/quests/outcomes/resolution-loader.service.ts:491-494`
**Issue:** il `find` sui nemici non ha proiezione: ogni risoluzione carica tutti i campi (lore, flag, ecc.) mentre `CombatEnemySnapshot` usa solo `name`, `lifePoints`, `xp`, `damages`, `baseWeaknesses`, `energyWeaknesses`. Le altre letture del catalogo nello stesso file proiettano.
**Why it matters:** incoerenza con il resto del loader e, con pacchi di nemici, documenti inutili in memoria dentro il percorso caldo della risoluzione; nessun effetto sulla correttezza.
**Suggested fix:** passare la proiezione `{ name: 1, lifePoints: 1, xp: 1, damages: 1, baseWeaknesses: 1, energyWeaknesses: 1 }` come secondo argomento (la spec esistente del loader resta verde se usa questi campi).

---

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
