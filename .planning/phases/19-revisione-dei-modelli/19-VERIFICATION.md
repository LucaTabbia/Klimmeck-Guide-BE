---
phase: 19-revisione-dei-modelli
verified: 2026-11-11T10:38:00Z
status: passed
score: 5/5 criteri verificati sul codice (2 con coda operativa aperta dentro la fase)
overrides_applied: 0
human_verification:
  - test: "Aggiornare BACKEND-NOTES.md con le frasi corrette elencate in «Documentazione stantia» (runbook compreso) PRIMA del boot reale"
    expected: "Nessuna riga dice più «il boot prosegue»; il runbook dice che i passi girano prima degli hook, che un passo fallito ferma il processo, riporta i tre WARN nuovi e i leggendari dai boss hero"
    why_human: "Il verificatore scrive solo questo file; il handoff è dell'orchestratore"
  - test: "Boot reale sul database dell'utente: stop del processo e dei client, backup delle sei collezioni, prova a secco, build dalla HEAD, primo boot, secondo boot"
    expected: "Nove righe coi conteggi della tabella del runbook, nessuna riga `fallito`, nessun WARN di dettaglio; secondo boot con `migrati 0` su tutte e nove"
    why_human: "Database reale e processo dell'utente: vietati agli agenti esecutori e al verificatore (BE-MODEL-09)"
  - test: "Script di contenuto fuori repo con prova a secco: maxXp, defense, rarity, relatedLore (+ lore «Cavallo da viaggio»), Pet.enemy, Molosso nei pool, ritocchi a catalogo"
    expected: "maxXp 44 / defense 44 non vuote / rarity 44 nei cinque valori / relatedLore 44 + 1 lore / enemy 31 come ObjectId / Molosso vendibile nei pool del Mastino"
    why_human: "Contenuto a DB approvato dall'utente (D-25..D-28, D-36): chiude BE-MODEL-04, 10, 11, 12"
  - test: "Rimozione del modulo una tantum in TDD (RED su test/app.int-spec.ts, GREEN con la cancellazione), terzo boot reale senza righe «Revisione dei modelli»"
    expected: "Cartella src/migrations/model-review/ assente, AppModule e boot di test senza riferimenti, tsc 0, SDL invariato, grep dei nomi vecchi vuoto"
    why_human: "Va fatta dopo il boot reale, dall'orchestratore (BE-MODEL-09)"
---

# Phase 19: Revisione dei modelli — Verification Report

**Phase Goal:** i modelli perdono campi doppi, nomi storti e strutture parallele senza cambiare le regole di gioco, con una sola aggiunta: il compagno equipaggiato riceve il 10 % degli xp dei nemici sconfitti (tetto `maxXp`) e lo stato del pet vive sul personaggio. Tre aree, un migratore one-off al boot reale rimosso prima della merge, SDL non additivo consumato dalla FE Phase 19.
**Verified:** 2026-11-11T10:38:00Z — branch `feat/19-revisione-dei-modelli`, HEAD `6dbbe80a`, albero pulito
**Status:** human_needed
**Re-verification:** No — verifica iniziale

**Metodo.** Lettura del codice e delle spec, grep sul contratto, `npx tsc --noEmit -p tsconfig.json` (uscita 0, eseguito qui). **Jest NON è stato eseguito** (l'orchestratore ha `test:cov` in corsa sullo stesso albero): i «verde» sotto sono i titoli delle spec lette, più le ultime corse complete riferite dall'orchestratore (unit 276 / 3534, integration 149 / 2050, boot reale 92). Nessun database, nessun `.env`, nessuna build.

## Goal Achievement

### Criteri di successo della ROADMAP

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | Catalogo: `Enemy.weaknesses`, `Enemy.spells` per riferimento, `Pet` senza stato con `attack`/`defense` | VERIFIED | `src/models/common/weaknesses.model.ts` (sotto-documento `_id: false`, liste enum default `[]`), `src/models/enemy.model.ts` (`weaknesses` con default a funzione, `spells: [ObjectId] ref Spell`, `EnemyInput.weaknesses: WeaknessesInput`), `src/models/pet.model.ts` (`attack`, `defense`, nessun `xp`/`currentLifePoints`/`damages`). Lettori: `recommended-loot.ts:62-66`, `enemy-candidate.ts:35-37`, `combat-context.ts:241-243`, `resolution-loader.service.ts:168`. SDL: blocchi `type Enemy`, `type Weaknesses`, `type Pet`, `enum DamageType`, `enum EnergyType` esatti. Spec: `test/app.int-spec.ts` «writes the enemy weaknesses in place of the two lists (D-01)», «writes the catalogue pet with attack and defense and without state (D-03, D-15)» |
| 2 | Pet: `ownedPets: [OwnedPet]`, negozio/premio sulle voci, 10 % al compagno nella scrittura dell'esito, `petXpGained`; `maxXp` a DB | VERIFIED sul codice — **contenuto a DB aperto** | `owned-pet.model.ts`, `owned-pet-entry.ts`, `trade-pets.ts` (voci intere, guardie nel filtro), `outcome-plan.ts:334-344, 442-451, 525`, `pets/pet-xp.ts` (`PET_XP_SHARE = 0.1`, `petXpAward`), `pets/companion-xp.ts`, `ambush-plan.ts:195-199, 254`. SDL `type OwnedPet`, `ownedPets: [OwnedPet!]!`, `petXpGained: Int!` (riga 699). `maxXp` dei 44 pet: passo dell'orchestratore |
| 3 | Personaggio: `wornEquipment`/`feet`, `spellStates` unica fonte, `maxActiveSpells` resolve field | VERIFIED | SDL `type CharacterAssets`, `type Equipment`, `enum SlotType` con `feet`; `type CharacterStatus` senza `spells`, `type SpellState` con `active: Boolean!`, `type ActiveSpell` assente. `character-status.model.ts` ha il solo `spellStates`; `character-status.resolver.ts:7-9` registrato in `characters.module.ts:48` e in `test/authz/characters-test-app.ts:64`; `active-spell-slots.spec.ts:34` pinna l'assenza del path |
| 4 | Mondo e pulizia: via `PointOfInterest.quest`, `City.shop`, `Lore.imagePath`, enum kebab-case, via `KGNotification` | VERIFIED | `point-of-interest.model.ts` senza `quest`; `city.model.ts:36-37` (`shop`, `default: undefined`) letto da `city-shop.service.ts:38`, `shop-pool.rules.ts:19`, `shop-pool.report.ts:57, 77`, `trade-pool.ts:28`; `lore.model.ts:18, 49`; `src/models/enums/slot-type.enum.ts` presente, `item_reference_type` e `notification.model.ts` assenti |
| 5 | Un solo modulo one-off, passi idempotenti con log di conteggi, boot reale + rimozione in TDD; integration per area, SDL verbatim, handoff con la tabella | VERIFIED sul codice — **boot reale e rimozione aperti; handoff con frasi stantie** | `src/migrations/model-review/` (26 file, nove passi in `STEPS`), importato solo da `src/app.module.ts:29, 118`; `BACKEND-NOTES.md` §1 con tabella e blocchi che coincidono con `src/schema.gql`. Il runbook (§3) non è allineato ai fix della review: vedi «Documentazione stantia» |

**Score:** 5/5 verificati sul codice; i criteri 2 e 5 hanno una coda operativa (contenuto a DB, boot reale, rimozione) che la fase dichiara aperta e che non è una lacuna di codice.

### Tabella del contratto vecchio → nuovo (grep eseguiti)

`grep -rn "<nome>" src test --include='*.ts' | grep -v "^src/migrations/model-review/"` e `grep -c "<nome>" src/schema.gql`:

| Nome tolto | `schema.gql` | `src`/`test` fuori dal migratore |
|------------|--------------|----------------------------------|
| `energyWeaknesses`, `baseWeaknesses` | 0 | 0 |
| `wearedEquipment`, `foots` | 0 | 0 |
| `shopEquipment`, `shopLoot`, `shopPets` | 0 | 0 |
| `KGNotification`, `item_reference_type`, `slot_type` | 0 | 0 |
| `status.spells`, `assets.activeSpells` | 0 | 0 |
| `type ActiveSpell`, `WeaknessesInput`, `PetInput`, `EnemyInput`, `LoreInput` | 0 (l'unica riga con «ActiveSpell» è `maxActiveSpells: Int!`) | — |
| `Lore.image`, `PointOfInterest.quest`, `Pet.damages`/`xp`/`currentLifePoints` | assenti nei blocchi | modelli senza i campi |
| `activeSpells` (parola intera) | 0 | 34 righe, **tutte** sotto `src/quests/outcomes/combat/` (15), `…/dungeon/` (5), `…/gm-overrides*` (14): vocabolario del motore (D-22). Nessuna altrove |

Nomi nuovi, tipo esatto in `src/schema.gql`: `Enemy.weaknesses: Weaknesses!`; `Weaknesses { base: [DamageType!]!, energy: [EnergyType!]! }`; `Pet.attack: Damages!`, `Pet.defense: Damages!`, `Pet.rarity: RarityType` (nullable), `Pet.relatedLore: [Lore!]!`; `OwnedPet { currentLifePoints: Int!, pet: Pet!, xp: Int! }`; `CharacterAssets.ownedPets: [OwnedPet!]!`, `pet: Pet`, `wornEquipment: Equipment!`; `Equipment.feet: EquipmentItem`; `enum SlotType { … feet … }`; `SpellState.active: Boolean!`; `CharacterStatus.maxActiveSpells: Int!`, `spellStates: [SpellState!]!`; `Lore.imagePath: String`; `QuestResult.petXpGained: Int!`; `CityShop` invariato; `Pet.enemy` fuori dallo SDL.

### Decisioni con comportamento

| Decisione | Stato | Codice | Spec che la prova |
|-----------|-------|--------|-------------------|
| D-04 quota 10 % dei soli nemici, stessa scrittura | VERIFIED | `outcome-plan.ts:372` (`enemiesXp` = 0 in sconfitta, senza `xpPrize`), `:442-451` array intero in `$set['assets.ownedPets']` | `pet-xp.spec.ts` «awards the rounded tenth of the enemies xp… (D-04)»; `outcome-plan.spec.ts` «gives the equipped companion a tenth of the enemies xp only (D-04)», «writes the companion xp and the won pet as a single list (D-04)»; `quest-resolution.service.int-spec.ts` «raises the equipped companion by a tenth of the enemies xp in the outcome write (D-04)», «gives each party member's own companion the full share (D-04)», «awards no companion xp on a lost fight (D-04)» |
| D-17 guadagno effettivo, tetto non valido = 0 | VERIFIED | `pet-xp.ts` `isPetXpCap`, `petXpAward`; `resolution-loader.service.ts:448` | `pet-xp.spec.ts` «caps the experience at the catalogue maximum and returns the effective gain (D-04, D-17)», «awards nothing when the catalogue maximum is not valid: %p (D-17)»; `resolution-loader.service.spec.ts` «returns the pet caps even without enemies (D-17)» |
| D-18 ogni percorso di vittoria | VERIFIED | `petMaxXp` passato da `combatant-plan.ts:154`, `gm-completion.service.ts:322`, `ambush-resolution.service.ts:456`; un solo punto (`planParticipant`) | `gm-completion.service.int-spec.ts` «awards the companion on a game master completion with enemies (D-18)»; `combatant-plan.spec.ts` «awards the companion on a won rescue like on any won fight (D-18)»; `guard/guard-outcome.spec.ts` «awards the companion on a won guard encounter with the merged enemies (D-18)» |
| D-19 imboscata: report trattenuto → risultato all'arrivo | VERIFIED | `ambush-plan.ts:195-199` (xp grezzi, 0 in sconfitta), `:254`; `ambush-snapshot.model.ts:129-130` (`@Prop` default 0); `ambush-results.ts:87` (`?? 0`) | `ambush-resolution.int-spec.ts` «raises the equipped companion and holds its gain in the report on a won ambush (D-04, D-19)»; `ambush-lifecycle.int-spec.ts` «delivers the companion xp of the ambush in the result created at arrival (D-19)»; `ambush-results.spec.ts` «delivers an old held report without the companion xp as 0 (D-19)» |
| D-26 lore sbloccate all'acquisto e col premio, stessa scrittura | VERIFIED | negozio: `catalog-prices.reader.ts:87-90`, `trade-pets.ts` `boughtPetLore`, `shop-transaction.service.ts:267`; premio: `quest-rewards.ts:261`, `outcome-plan.ts` `petLore` dentro `knowledgeUpdateOf` nello stesso `update` | `shop-transaction.service.int-spec.ts` «unlocks the lore of a bought pet in the purchase write (D-26)», «keeps the unlocked lore when the pet is sold (D-26)»; `quest-pet-prize.int-spec.ts` «unlocks the lore of the pet won as a prize and reports it on the result (D-26)»; `outcome-plan.spec.ts` «unlocks no pet lore when the pet is already owned (D-26)» |
| D-07 una sola lista | VERIFIED | `active-spell.updates.ts:34-56` (solo il flag della voce, tetto con `$expr` sul documento vivo), `spell-state.snapshot.ts:60` (`active: false`), `outcome-plan.ts` `statesAfter` in coda, `combat-context.ts:123-125` e `gm-overrides.ts:55` (sole voci `active === true`) | `equip-spell.int-spec.ts`, `active-spell.updates.spec.ts`, `use-spell.int-spec.ts`, `study-spell-draw.int-spec.ts`, `test/app.int-spec.ts` «writes the single spell state list and drops the two old spell lists (D-07)» |
| D-16 ordine di apprendimento | VERIFIED | nessun campo d'ordine; le attive sono un filtro sull'array | `spell-state.mapper.spec.ts`, `spell-state.wire.int-spec.ts`, `combat-context.spec.ts` |
| D-21 migratore permanente ridotto al taglio che conserva `active` | VERIFIED | `spell-state.migrator.ts` (solo `trim`, nessuna lettura di altre liste), `spell-state.migration.ts` (`active: '$$state.active'` nella voce tagliata) | `spell-state.migrator.int-spec.ts`, `spell-state.migration.spec.ts` |
| D-27 rarità | VERIFIED | `pet.model.ts` (`enum`, default `null`, SDL nullable, `PetInput.rarity`) | `pet.schema.spec.ts` «leaves the rarity of a pet null until it is curated (D-27)», `pet-rarity.int-spec.ts` (tre casi), `test/app.int-spec.ts` «writes the nullable pet rarity into the generated schema (D-27)» |
| D-28 un tiro, tre fasce, tetto per rango, niente pet senza rarità | VERIFIED | `pet-prize.ts`: un solo `chance.next()` in `petPrizeOf`, confini 0,10 / 0,15 / 0,20 arrotondati al milionesimo, terza fascia solo `boss` e `sellable === false`, `petRarityCapOf` da `LOOT_POOLS`, `isRarity` esclude `null` e fuori enum; cablato in `generated-prizes.ts:131` e `quest-generator.service.ts:424` via `pet-candidate.ts` | `pet-prize.spec.ts` «pins the three additive chances…», «offers nothing when the hit band has no candidate and does not fall through to another band», «never offers a pet above the rarity cap of the rank», «never offers a pet without a rarity or with an unknown one: %p», «draws exactly one roll, plus one index only when the band has a candidate» (tutti D-28); `quest-generator.int-spec.ts` «offers no pet while the pets have no rarity (D-28)» |
| Ruling 2026-11-12, leggendari dai boss hero | VERIFIED | `loot-pools.ts:20-24` (`HERO_BOSS_POOL` con uno slot `legendary`) → tetto `legendary` solo per boss/hero | `pet-prize.spec.ts:77` riga `[boss, hero, legendary]` del caso «reads the rarity cap of a quest from the widest slot of its loot pool» |

### Fix della review (verificati sul codice)

| Fix | Stato | Evidenza |
|-----|-------|----------|
| C-CR-01 passi nella factory asincrona, prima di ogni hook | VERIFIED | `model-review.boot.ts` `modelReviewBootProvider` (`useFactory` asincrona che attende `boot.run()`; `ModelReviewBoot` non implementa alcun hook); `model-review.module.ts` inietta passi e sette token dei modelli. Spec: `model-review.boot.spec.ts` «ends every step inside the provider factory, before any lifecycle hook (C-CR-01)»; `test/app.int-spec.ts:1001` «ends the one-off model review steps before any lifecycle hook runs (D-12)» con sonde su `BullExplorer.onModuleInit`, `QuestResolutionSweeper.onApplicationBootstrap`, `SpellStateMigrator.onApplicationBootstrap` |
| C-WR-05 passo fallito = boot fermo | VERIFIED | `runOrAbort`: due righe ERROR, poi `throw` di un errore nuovo senza causa; i passi dopo non partono. `src/main.ts`: `NestFactory.create` senza `abortOnError: false` e `process.exit(1)` nel `catch`. Spec: «stops at a failed step, logs it by name and code only with a summary, and rejects (C-WR-05)», «fails the container when a step fails: no provider reaches its lifecycle hook (C-WR-05)» |
| C-WR-01 il flag del codice nuovo vince | VERIFIED | `spell-states.step.ts` `isWrittenByNewCode`, voci in coda, id nei WARN. Spec: `spell-states.step.spec.ts` «lets a boolean flag of the state win over the old equipped list (C-WR-01)», int «keeps the entries the new code wrote before the step and loses none (C-WR-01)» |
| C-WR-02 scritture con guardia | VERIFIED | filtro col valore letto in `spell-states.step.ts` (`asRead`), `owned-pets.step.ts`, `enemy-spells.step.ts`; `matchedCount === 0` → WARN + «senza corrispondenza». Spec: tre casi «leaves for the next boot a … written while the step runs (C-WR-02)» |
| C-WR-03 rinomina che non sovrascrive | VERIFIED | `worn-equipment.step.ts` `WITH_OLD_FIELD_ONLY` / `WITH_BOTH_FIELDS`. Spec: «never overwrites an equipment already under the new name: counted and untouched (C-WR-03)» |
| C-WR-04 nemico con copia non abbinata non scritto | VERIFIED | `enemy-spells.step.ts` (`continue` prima della scrittura). Spec: «never writes an enemy with a copy without a match: every copy stays and is reported (D-02, C-WR-04)» |
| C-WR-06 `cities { pointsOfInterest }` | VERIFIED | `cities.service.ts:13`. Spec: `cities.resolver.int-spec.ts:205` «serves the points of interest of every city with cities (C-WR-06)» |
| A-WR-01 debolezze fuori enum filtrate sul filo | VERIFIED | `enemies/weaknesses.resolver.ts`, `known-weaknesses.ts`, `WeaknessesModule` importato da quattro moduli. Spec: `weaknesses.wire.int-spec.ts` |
| A-WR-03 voce di `ownedPets` normalizzata | VERIFIED | `owned-pet-entry.ts` `normalisedOwnedPets` usato da `companion-xp.ts`, `outcome-plan.ts:344`, `trade-pets.ts:54`; filo in `owned-pets.mapper.ts` ← `characters.service.ts:154` |

### Migratore one-off (punto 4)

Nove passi in `STEPS` (`model-review.module.ts`), nell'ordine: `EnemyWeaknessesStep`, `EnemySpellsStep`, `PetCatalogStep`, `OwnedPetsStep`, `PoiQuestStep`, `CityShopStep`, `LoreImagePathStep`, `WornEquipmentStep`, `SpellStatesStep`. Ogni passo ha il caso «changes nothing on a second run (D-NN)» nella propria int-spec (nove su nove). Riferimenti fuori dalla cartella: solo `src/app.module.ts` e `test/app.int-spec.ts`; nessuna soglia di coverage in `package.json` nomina la cartella. Dipendenze in un solo verso (i passi importano `owned-pet-entry`, `mongo/document-id`, `mongo/mongo-errors`, i modelli).

**Cosa cancellare alla rimozione (lista esatta):**

1. L'intera cartella `src/migrations/model-review/` (26 file): `model-review.module.ts`, `model-review.boot.ts`, `model-review.boot.spec.ts`, `model-review.step.ts`, `legacy-fixtures.ts`; i nove passi `enemy-weaknesses.step.ts`, `enemy-spells.step.ts`, `pet-catalog.step.ts`, `owned-pets.step.ts`, `poi-quest.step.ts`, `city-shop.step.ts`, `lore-image-path.step.ts`, `worn-equipment.step.ts`, `spell-states.step.ts`; le nove int-spec `*.step.int-spec.ts`; le tre unit `enemy-spells.step.spec.ts`, `owned-pets.step.spec.ts`, `spell-states.step.spec.ts`.
2. `src/app.module.ts`: riga 29 (import), righe 117-118 (commento e voce di `imports`).
3. `test/app.int-spec.ts`: riga 2 (import di `BullExplorer`, usato solo dalle sonde); riga 59 (import di `ModelReviewBoot`); righe 146-163 (`MODEL_REVIEW_PREFIX`, `MODEL_REVIEW_STEP_LINES`, tipo `LifecycleHook`); righe 264-286 (`logSpy`, `modelReviewLinesSeenBy`, `modelReviewLinesSoFar`, `probeLifecycleHook`); righe 291-300 (spia sul log e tre sonde in `beforeAll`); i due casi alle righe 992-1010 («mounts the one-off…», «ends the one-off…»), sostituiti nel RED da «boots without the one-off model review migration (19 D-12)». Restano gli import di `SpellStateMigrator` (riga 48) e `QuestResolutionSweeper` (riga 52), usati da altri casi (righe 965, 1112), e `jest.restoreAllMocks()` (riga 307).

### Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-MODEL-01 | SATISFIED | criterio 1; `enemy-weaknesses.step.ts` + int-spec |
| BE-MODEL-02 | SATISFIED | `enemy.model.ts` ref; populate in `quest-catalog.populate`, `quest-result.populate`; `enemy-spells.step.ts` (per `_id`, poi per nome unico, mai inventata) |
| BE-MODEL-03 | SATISFIED | criterio 2; `equip-pet.int-spec.ts`, `trade-pets.spec.ts`, `owned-pets.step.int-spec.ts` |
| BE-MODEL-04 | CODICE COMPLETO — aperto per `maxXp` a DB | D-04/D-17/D-18/D-19 sopra |
| BE-MODEL-05 | SATISFIED | SDL `wornEquipment`/`feet`; `equip-item.int-spec.ts`; `worn-equipment.step.ts` |
| BE-MODEL-06 | SATISFIED | D-07/D-16/D-21 sopra; `character-status.resolver.spec.ts` |
| BE-MODEL-07 | SATISFIED | criterio 4; `city-shop.service.int-spec.ts`, `shop-pool.report.spec.ts`, `trade-pool.spec.ts` |
| BE-MODEL-08 | SATISFIED | `lore.model.ts`, `slot-type.enum.ts`, modello morto assente |
| BE-MODEL-09 | CODICE COMPLETO — aperto per boot reale e rimozione | modulo, nove passi, handoff |
| BE-MODEL-10 | CODICE COMPLETO — aperto per i collegamenti a DB | D-26 sopra; `lore-related.int-spec.ts` (viewer) |
| BE-MODEL-11 | CODICE COMPLETO — aperto per le 44 rarità a DB | D-27 sopra |
| BE-MODEL-12 | CODICE COMPLETO — aperto per i 31 legami a DB | D-28 sopra |

Nessun requisito orfano: i dodici ID di `REQUIREMENTS.md` sono tutti coperti dai piani.

### Behavioral Spot-Checks

| Comportamento | Comando | Esito | Stato |
|---------------|---------|-------|-------|
| Type check | `npx tsc --noEmit -p tsconfig.json` | uscita 0 | PASS |
| SDL committato = contratto | lettura dei blocchi di `src/schema.gql` | blocchi esatti | PASS |
| Suite | jest | non eseguito (corsa `test:cov` dell'orchestratore in atto) | SKIP — vale l'esito di `test:cov` |

### Anti-Patterns

Nessun bloccante. Nessun `TODO`/`FIXME`/stub nei file della fase letti. Note: `quest-composition.ts` tiene una seconda copia locale di `indexOf` (dichiarata nel fix report, fuori ruling); `19-VALIDATION.md` riga 116 descrive ancora la spec del boot come «errore non bloccante».

## Documentazione stantia in `BACKEND-NOTES.md` (punto 5)

Il file è datato prima dei fix della review (`09:55`); nessun fix lo ha toccato. Da correggere **prima del boot reale**, perché il runbook guida l'orchestratore.

| Riga | Testo attuale | Perché è stantio | Testo corretto |
|------|---------------|------------------|----------------|
| 4 | «review del codice in corso (i fix della review possono aggiornare questo file prima della PR)» | review chiusa, 16 fix applicati | «review del codice chiusa (`19-REVIEW-RULINGS.md`, `19-REVIEW-FIX.md`): 16 finding corretti, 16 chiusi per ruling; questo file è allineato ai fix» |
| 7 | «`test/app.int-spec.ts`, 91 test» | il boot reale ha un caso in più | «92 test» |
| 8 | «unit 275 suite / 3501 test; integration 148 suite / 2033 test» | superato dai fix | aggiungere «dopo i fix della review: unit 276 / 3534, integration 149 / 2050, boot reale 92» |
| 244-249, 266, 279 | righe di §2 su debolezze, voci dei pet, POI, boot reale | mancano i comportamenti nuovi | aggiungere: «valore di debolezza fuori enum a DB filtrato sul filo, nessun errore — `src/enemies/weaknesses.wire.int-spec.ts`»; «voce di `ownedPets` con `xp`/vita non validi servita con 0, voce senza pet leggibile tolta — `character-updated.subscription.int-spec.ts`»; riga 266 «`city(id)` e `cities` servono i POI»; riga 279 «…modulo una tantum montato, passi conclusi prima di ogni lifecycle hook» |
| 295 | «Boot a passi (ordine, formato dei log, errore non bloccante)» | il passo fallito ora ferma il boot | «Boot a passi (ordine, formato dei log, passi conclusi nella factory del provider prima di ogni hook, passo fallito che ferma il boot)» |
| 308 | «Finestra del boot… per il tempo dei passi il codice nuovo legge dati vecchi senza errori… `ShopBoot` può loggare una volta «167 senza pool» se il suo report parte prima del passo 6: è atteso al solo primo boot» | i passi finiscono prima di ogni hook (processor Bull, sweep, `ShopBoot`, taglio delle magie) e prima che HTTP/WS ascoltino | «I nove passi girano dentro la factory di un provider e finiscono prima di OGNI lifecycle hook: nessun processor, sweep o listener vede dati non migrati. Il boot si fa comunque a client fermi e senza un secondo BE sullo stesso database; il controllo «nulla in scadenza» resta. Il WARN «167 senza pool» di `ShopBoot` NON è più atteso: se compare, il passo dei pool non ha scritto» |
| 342 | «…= 0: la rinomina sovrascriverebbe il campo nuovo (19-15)» | il passo non tocca più i documenti con entrambi i campi | «…= 0: un personaggio con entrambi i campi non viene toccato, conta in «senza corrispondenza» e ricompare a ogni boot finché non lo si cura a mano» |
| 349 | «nessuna riga `fallito` (`Revisione dei modelli, <label>: fallito (…), il boot prosegue`) e nessuna riga WARN di dettaglio (copia senza corrispondenza, personaggio con anomalie)» | testo della riga cambiato; il processo esce | «nessuna riga `fallito`. **Un passo fallito ferma il processo** (uscita 1, HTTP e WS mai aperti, nessun hook): `Revisione dei modelli, <label>: fallito (<NomeErrore>, code <N>), il boot si ferma`, poi `Revisione dei modelli, boot interrotto: passi conclusi <K> su 9, fallito «<label>», non eseguiti <M>`, poi l'errore `Revisione dei modelli: boot interrotto dal passo «<label>»`. I passi prima restano applicati (idempotenti): correggere o ripristinare, poi nuovo boot. Nessun WARN di dettaglio atteso; i testi sono: `…lista delle magie: personaggio <id>, usi in conflitto N, equipaggiate non conosciute N [<id>, …], stati lasciati fuori N [<id>, …]`; `…magie dei nemici: copia senza corrispondenza «<nome>» sul nemico <id>: nemico non scritto, le copie restano`; `…<label>: personaggio\|nemico <id> cambiato durante il passo, scrittura non applicata: si ritenta al prossimo boot`. Con «senza corrispondenza» ≠ 0 non aprire ai client: riavviare e rileggere la riga» |
| 351-363 | tabella dei conteggi | il significato dei conteggi anomali è cambiato | nota sotto la tabella: «magie dei nemici: un nemico con una copia non abbinata non è né migrato né già a posto e ricompare al secondo boot; equipaggiamento: entrambi i campi = «senza corrispondenza»; magie/pet/nemici: scrittura non applicata = 1 in «senza corrispondenza»» |
| 430 | «i `legendary` non escono dalle quest generate finché nessun pool li prevede» | falso: `HERO_BOSS_POOL` ha già uno slot `legendary` (ruling del 2026-11-12) | «un pet `legendary` può uscire SOLO dalle quest generate `boss` di rango hero (l'unico pool di loot con uno slot `legendary`), nelle tre fasce; mai dalle `enemy` né dagli altri ranghi» |
| 436-440 | passo 7: RED su un solo caso, «via l'asserzione su `ModelReviewBoot` e il suo import» | dopo C-CR-01 `test/app.int-spec.ts` ha anche sonde, costanti e un secondo caso | usare la lista esatta di «Cosa cancellare alla rimozione» qui sopra (righe 2, 59, 146-163, 264-286, 291-300, 992-1010) |
| 475 | domanda 1, «`CitiesService.findAll` non popola `pointsOfInterest`… Da decidere» | corretto da C-WR-06 (`e7a5a4ed`) | «Chiusa: `findAll` popola con `cityRelations()`; resta non popolato `pointsOfInterest { city }` a profondità 2» |
| 477 | domanda 3, ciclo d'import `generated-prizes.ts` ↔ `pet-prize.ts` | sciolto da A-IN-01 (`7df00338`, `loot-pools.ts`) | «Chiusa: tabelle del loot nel modulo foglia `src/quests/generation/loot-pools.ts`» |
| 480 | domanda 6, nomi vecchi nel `CLAUDE.md` del BE | corretto da `e67d36a1` (grep = 0) | «Chiusa (`e67d36a1`)» |

Coerenti col codice e da lasciare: §1 (tabella e blocchi SDL), §1.3, §1.4, tabella dei nove passi, righe del primo e del secondo boot, passo 6, stato dei requisiti.

## Passi aperti dentro la fase (punto 6) — NON sono lacune

Passi umani / dell'orchestratore, nell'ordine:

1. **Allineare `BACKEND-NOTES.md`** con la tabella sopra (e la riga 116 di `19-VALIDATION.md`).
2. **Boot reale sul DB dell'utente** (BE-MODEL-09): stop di processo e client, backup di `enemies`, `pets`, `characters`, `cities`, `lore`, `pointsofinterest`, prova a secco, build dalla HEAD della fase, primo boot (nove righe), secondo boot (`migrati 0`).
3. **Script di contenuto fuori repo** con prova a secco e revisione dell'utente: `maxXp` dei 44 pet (BE-MODEL-04); `defense` di tutti i 44 (D-25); `rarity` dei 44, Scheletro `ultrarare`, Molosso vendibile e nei pool delle città del Mastino (BE-MODEL-11); `relatedLore` dei 44 + lore nuova «Cavallo da viaggio» con `imagePath` (BE-MODEL-10); `Pet.enemy` su 31 pet come ObjectId (BE-MODEL-12); ritocchi a catalogo (Lupo invernale, Cavallo da viaggio).
4. **Rimozione del modulo in TDD** (BE-MODEL-09) con la lista esatta sopra, `tsc` 0, SDL invariato, terzo boot reale senza righe del migratore.
5. Chiusura di BE-MODEL-04, 09, 10, 11, 12 in REQUIREMENTS/ROADMAP/STATE; PR fuori dal draft.

Restano quindi aperti i requisiti **04, 09, 10, 11, 12**; chiusi dal codice **01, 02, 03, 05, 06, 07, 08**.

## Gaps Summary

Nessuna lacuna di codice: ogni criterio, requisito e decisione con comportamento ha artefatto sostanziale, cablato sul percorso reale e coperto da una spec nominata. Il contratto vecchio → nuovo è rispettato alla lettera su SDL, `src` e `test`. Lo stato è `human_needed` per due motivi: i passi operativi dichiarati aperti (boot reale, contenuto, rimozione) e il handoff, che dopo i fix della review porta frasi false sul comportamento del boot (riga 349 «il boot prosegue», riga 308, riga 342, riga 430) e una lista di rimozione incompleta. La verifica non ha eseguito jest: l'esito di `test:cov` in corso è la prova mancante sul verde.

---

_Verified: 2026-11-11T10:38:00Z_
_Verifier: Claude (gsd-verifier)_

## Aggiornamento dopo il boot reale (2026-11-11)

**Status:** passed — i passi umani sono stati eseguiti; il report sopra resta com'era (verifica sul codice a `6dbbe80a`).

| Passo umano | Esito |
|-------------|-------|
| 1. Allineare `BACKEND-NOTES.md` | Fatto dall'orchestratore prima del boot (commit `66ff10ec`) |
| 2. Boot reale sul database dell'utente | Fatto l'11 novembre 2026 dalla HEAD `66ff10ec`: processo fermo, nulla in scadenza (0 quest avviate, 0 pendenti, 0 viaggi attivi, 0 in attesa di soccorso, 0 recuperi di magie), backup di otto collezioni, prova a secco pulita; primo boot con nove righe senza `fallito` né WARN (lore `migrati 522`, magie `migrati 7`: i due «da verificare» sono chiusi); controllo contro il backup identico; secondo boot a `migrati 0` su tutte e nove |
| 3. Script di contenuto fuori repo | Fatto, prova a secco e poi una transazione: `maxXp` 44 / `defense` 44 non vuote / `rarity` 44 nei cinque valori / `relatedLore` 44 + la lore «Cavallo da viaggio» / `enemy` 31 come ObjectId / Molosso vendibile nei pool delle 7 città del Mastino |
| 4. Rimozione del modulo in TDD | Fatta: RED `c3492ced`, GREEN `0822feee`. Cartella `src/migrations/model-review/` assente, `AppModule` e boot di test senza riferimenti (resta il solo caso «does not mount the one-off model review migration (D-12)», nome del modulo come stringa), `tsc` 0, SDL invariato, grep dei nomi vecchi vuoto senza esclusioni. Unit 272 suite / 3497 test, integration 140 suite / 1990 test, boot reale di test 91 test |
| 5. Chiusura dei requisiti | BE-MODEL-04, 09, 10, 11, 12 chiusi in REQUIREMENTS, ROADMAP e STATE |

**Nessun residuo operativo.** **Terzo boot reale eseguito dall'orchestratore l'11 novembre 2026** dalla build di `7ca680fa` (cartella del migratore assente da `dist/`): processo in ascolto sulla porta 3001, nessuna riga `Revisione dei modelli, …`, nessun errore, nessun WARN «senza pool». Il BE resta in esecuzione da questa build.

_Aggiornato: 2026-11-11 — esecutore della chiusura (gsd-executor), sui fatti del boot riferiti dall'orchestratore_
