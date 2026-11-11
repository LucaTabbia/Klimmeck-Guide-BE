---
phase: 19
slug: revisione-dei-modelli
audited: 2026-11-11T12:00:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/19-revisione-dei-modelli
head: 6dbbe80a
base: origin/develop (bc92fb6f)
threats_total: 104
threats_mitigated: 89
threats_accepted: 11
threats_transferred: 2
threats_operational: 4
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
transferred_ids: [T-19-86, T-19-93]
operational_ids: [T-19-86, T-19-89, T-19-90, T-19-93]
operational_companion_ids: [T-19-03, T-19-05, T-19-10, T-19-14, T-19-25, T-19-43, T-19-52, T-19-60, T-19-67, T-19-71, T-19-96]
unregistered_ids: [N-19-01, N-19-02, N-19-03, N-19-04]
updated: 2026-11-11T12:00:00Z
---

# Audit di sicurezza — Phase 19 «Revisione dei modelli» (BE)

Audit in sola lettura dei blocchi threat model dei piani `19-01`…`19-23` sul codice FINALE di `feat/19-revisione-dei-modelli` a `6dbbe80a`, dopo i fix di `19-REVIEW-FIX.md` (16 corretti, 16 chiusi per ruling). Nessun file modificato oltre a questo, nessun commit, **nessun jest lanciato** (`test:cov` in corso a cura dell'orchestratore), nessuna lettura di `.env` o dell'ambiente, nessun avvio del BE, nessun accesso a database. L'evidenza di esecuzione è quella registrata in `19-REVIEW-FIX.md` (unit 276 suite / 3534 test; integration 149 suite / 2050 test; boot reale 92; `tsc` 0; SDL senza diff dopo la rigenerazione). Qui il codice è verificato con lettura e grep, le spec sono citate per file:riga del titolo.

**Gli ID sono 104, non 96:** `T-19-01`…`T-19-95` (piani 01–20 e 23), `T-19-96`…`T-19-98` (piano 19-21), `T-19-99`…`T-19-104` (piano 19-22). Tutti distinti, nessuno saltato.

Disposizioni e stato:

| | Numero | ID |
| --- | --- | --- |
| `mitigated` chiuse dal codice | 89 | di cui 11 con un passo operativo di accompagnamento (vedi colonna Nota, «+ operativa») |
| `accepted` | 11 | T-19-01 (ruling C-WR-05), 11, 19, 24, 32, 36, 57, 61, 64, 65, 104 |
| **mitigazione operativa — da eseguire** | 4 | T-19-86, T-19-93 (`transfer`), T-19-89, T-19-90 (`mitigate` il cui controllo è un passo del runbook) |
| `open` | 0 | — |

Chiuse 100 / 104, operative da eseguire 4 / 104, aperte 0. Le quattro operative non sono «chiuse dal codice»: restano a carico dell'orchestratore con il riferimento di runbook indicato.

Mitigazioni cambiate dalla review (ruling `19-REVIEW-RULINGS.md`), registrate qui sulla forma finale:

- **T-19-01** (piano: «ogni passo in `try/catch`, un errore non ferma il boot») è superata da C-WR-05: un passo fallito FERMA il boot. La minaccia di disponibilità diventa rischio accettato (fail closed voluto) e genera N-19-01.
- **T-19-28** (piano: «nessun id di personaggio nel log») è superata da C-WR-01/C-WR-02: tre righe WARN portano `_id` Mongo del personaggio e id delle magie. Resta entro `19-REPO-RULES.md` riga 27 («solo id, conteggi, nome e codice d'errore»); vedi N-19-03.
- **T-19-05, T-19-17, T-19-10, T-19-60, T-19-67/68** hanno una mitigazione più forte di quella dichiarata (filtro sul filo delle debolezze, mapper totale dei pet, nemico non scritto, guardia «destinazione assente», scritture guardate).

## Registro delle minacce

Stato: `CLOSED` = mitigazione presente nel codice; `CLOSED (accepted)` = rischio accettato registrato qui; `OPERATIVA` = mitigazione operativa — da eseguire (runbook `BACKEND-NOTES.md` §3).

| ID | STRIDE | Componente | Disposizione | Evidenza (file:riga) e spec che la pinna | Stato / Nota |
| --- | --- | --- | --- | --- | --- |
| T-19-01 | Denial of service | `ModelReviewBoot` | accepted (ruling C-WR-05, era mitigate) | `src/migrations/model-review/model-review.boot.ts:35-52`: riga `fallito`, riga di riepilogo, poi `throw`; passi successivi non eseguiti. Spec `model-review.boot.spec.ts:128` e `:197` | CLOSED (accepted) — il «boot mai bloccato» del piano non esiste più per ruling; vedi N-19-01 |
| T-19-02 | Information disclosure | log del boot | mitigate | `model-review.step.ts:19-43` righe a formato fisso; `model-review.boot.ts:41` `describeError` (`src/mongo/mongo-errors.ts:21-25`: solo nome e codice); `:51` errore nuovo senza causa, così lo stack di Nest non porta quello del driver. Spec `model-review.boot.spec.ts:128-169` (`uri-segreta-da-non-loggare` assente dal testo loggato) | CLOSED |
| T-19-03 | Tampering (processo) | ciclo di vita del codice una tantum | mitigate | `grep ModelReview` fuori dalla cartella: solo `src/app.module.ts:29,118` e `test/app.int-spec.ts`; `UNA TANTUM` su 26/26 file della cartella; `test/app.int-spec.ts:992` | CLOSED + operativa: rimozione in TDD e PR in draft = runbook Passo 7 e Passo 8 (vedi T-19-90) |
| T-19-04 | Tampering | database reale | mitigate | i passi si provano solo sugli int-spec della cartella (fixture `legacy-fixtures.ts` su connessione in memoria); unico entrypoint che compila `AppModule` è `src/main.ts:8` (più l'harness `test/harness/real-app-boot.ts` su `MongoMemoryReplSet`); i 23 SUMMARY dichiarano nessun boot reale | CLOSED (evidenza di processo) |
| T-19-05 | Denial of service | debolezza fuori enum | mitigate | `enemy-weaknesses.step.ts:30-43,59` conta i fuori enum; `src/models/common/weaknesses.model.ts:10,14` `enum`; **A-WR-01:** `src/enemies/weaknesses.resolver.ts:8-18` + `known-weaknesses.ts:12-22` filtrano sul filo. Spec `enemy.schema.spec.ts:32`, `enemy-weaknesses.step.int-spec.ts:154`, `weaknesses.wire.int-spec.ts:81,110,127`, `quests.resolver.int-spec.ts:650` | CLOSED + operativa: prova a secco «fuori enum = 0» (Passo 3) |
| T-19-06 | Tampering | `EnemyWeaknessesStep` | mitigate | `enemy-weaknesses.step.ts:14` guardia `weaknesses` assente, `:55-58` una sola `updateMany` a pipeline (`$set` + `$unset` insieme). Spec `enemy-weaknesses.step.int-spec.ts:135` | CLOSED |
| T-19-07 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:443-448` blocco esatto `type Weaknesses` e `not.toContain('input WeaknessesInput')`; `grep -c 'WeaknessesInput\|EnemyInput\|PetInput' src/schema.gql` = 0 | CLOSED |
| T-19-08 | Tampering (regola) | lettore dimenticato | mitigate | `grep -rnwE 'energyWeaknesses\|baseWeaknesses' src test` fuori dal migratore = 0 | CLOSED |
| T-19-09 | Denial of service | `Enemy.spells` non popolato | mitigate | `src/quests/quest-catalog.populate.ts:14-15`, `src/enemies/enemies.service.ts:12-15` (il populate di una lista scarta i ref pendenti). Spec `quests.resolver.int-spec.ts:379,593` | CLOSED |
| T-19-10 | Tampering | `EnemySpellsStep` | mitigate | `enemy-spells.step.ts:36` guardia sugli elementi di tipo oggetto; `:63-97` nessuna magia inventata; **C-WR-04** `:129-138` nemico con una copia non abbinata NON scritto; **C-WR-02** `:140-143` lista letta nel filtro. Spec `enemy-spells.step.int-spec.ts:94,130,167,210` | CLOSED + operativa: backup (Passo 2), «copie non abbinabili = 0» (Passo 3); vedi N-19-04 |
| T-19-11 | Information disclosure | WARN delle copie non abbinate | accept | `enemy-spells.step.ts:133-135`: solo nome della magia (contenuto) e `_id` del nemico, come `19-REPO-RULES.md:27` | CLOSED (accepted) |
| T-19-12 | Tampering (regola) | abbinamento per nome ambiguo | mitigate | `enemy-spells.step.ts:46-53` (`namesakes.length === 1`). Spec `enemy-spells.step.spec.ts` (tabella) | CLOSED |
| T-19-13 | Denial of service | pet senza `attack`/`defense` | mitigate | `src/models/pet.model.ts:19-25` default a funzione. Spec `pet.schema.spec.ts:35` | CLOSED |
| T-19-14 | Tampering | `PetCatalogStep` sulla cura a mano | mitigate | `pet-catalog.step.ts:21-31` `$ifNull` su `attack` e `defense` («la mano vince»), guardia `:14-16`. Spec `pet-catalog.step.int-spec.ts:142` e caso dedicato | CLOSED + operativa: il passo toglie `damages`, `xp`, `currentLifePoints` dal catalogo senza copia: l'unica copia durevole è il backup di `pets` (Passo 2) |
| T-19-15 | Tampering (processo) | contenuto dei pet nel repo | mitigate | `git diff origin/develop..HEAD --name-only --diff-filter=A \| grep -iE 'seed\|content/\|scripts/\|\.ya?ml\|\.csv\|\.json'` = vuoto | CLOSED |
| T-19-16 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:83,455,464,576` blocco esatto `type Pet` | CLOSED |
| T-19-17 | Denial of service | voce orfana di `ownedPets` | mitigate | `src/characters/pets/owned-pets.mapper.ts:5-25` dopo il populate (`characters.service.ts:116,154`); **A-WR-03** mapper totale (`owned-pet-entry.ts:21-45`): xp e vita non validi = 0, voce senza pet fuori dal filo. Spec `character-updated.subscription.int-spec.ts:543,631,646,667` | CLOSED |
| T-19-18 | Elevation of privilege | `equipPet` di un pet non posseduto | mitigate | `src/characters/pets/equip-pet.updates.ts:8-16` filtro `assets.ownedPets.pet` nello stesso update; `characters.resolver.ts:73` `@OwnsCharacter` invariato. Spec `equip-pet.int-spec.ts:193`, `characters.service.spec.ts:690,712` | CLOSED |
| T-19-19 | Tampering | stato del pet dal client | accept | `CharacterAssetsInput` (`character-assets.model.ts:47-59`) senza posseduti; `EquipPetRequest` = `{ id, petId }`; nessun input con `xp`/`currentLifePoints` nello SDL | CLOSED (accepted) |
| T-19-20 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:87,91,476,479` blocchi esatti `OwnedPet` e `CharacterAssets` | CLOSED |
| T-19-21 | Tampering | doppio acquisto / vendita non posseduta | mitigate | `src/economy/trade/trade-pets.ts:33-43` (snapshot in sessione) e `:91-99` guardie nel filtro (`shop-transaction.service.ts:167,300`). Spec `shop-transaction.service.int-spec.ts:1434,1458,1557` | CLOSED |
| T-19-22 | Elevation of privilege | stato del pet deciso dal client | mitigate | `owned-pet-entry.ts:56-65` `xp: 0`, vita dal solo catalogo; nessun argomento li porta. Spec `shop-transaction.service.int-spec.ts:1312` | CLOSED |
| T-19-23 | Tampering (contenuto) | `maxLifePoints` malformato | mitigate | `owned-pet-entry.ts:48-54`. Spec `owned-pet-entry.spec.ts:22` (`undefined`, `null`, `12.5`, `-1`, `'300'`, `NaN`) | CLOSED |
| T-19-24 | Tampering | scrittura dell'esito | accept | `outcome-plan.ts:338-345,486` un solo valore di `assets.ownedPets`; filtro e transazione senza cambi | CLOSED (accepted) |
| T-19-25 | Tampering | `OwnedPetsStep` | mitigate | `owned-pets.step.ts:25-27` guardia sugli elementi non ancora voce; `:39` voci esistenti restituite tali e quali; **C-WR-02** `:77-80` lista letta nel filtro. Spec `owned-pets.step.int-spec.ts:132,176,197` | CLOSED + operativa: backup di `characters` (Passo 2) |
| T-19-26 | Tampering (dati) | pet orfano | mitigate | `owned-pets.step.ts:42-43` voce a vita 0 contata; sul filo `owned-pets.mapper.ts:23` | CLOSED |
| T-19-27 | Tampering | personaggi archiviati | mitigate | nessun filtro sugli archiviati nei tre passi sui personaggi. Spec `owned-pets.step.int-spec.ts:95`, `worn-equipment.step.int-spec.ts:134`, `spell-states.step.int-spec.ts:192` | CLOSED |
| T-19-28 | Information disclosure | log del passo | mitigate (superata dal ruling) | riga dei conteggi invariata (`model-review.step.ts:23`); **nuovo:** `owned-pets.step.ts:83-89`, `spell-states.step.ts:243-261` loggano `_id` del personaggio e id delle magie. Nessun nome, nessun twitchId, nessuna URI (grep sulla cartella) | CLOSED — la clausola «nessun id di personaggio» è superata da C-WR-01/02; vedi N-19-03 |
| T-19-29 | Elevation of privilege | xp del pet gonfiati | mitigate | `src/quests/outcomes/pets/pet-xp.ts:2,19-30` e `companion-xp.ts:23-44` funzioni pure; tetto da `resolution-loader.service.ts:448`; `petXpGained` solo su tipi di output (`schema.gql:699`). Spec `outcome-plan.spec.ts:596,624`, `companion-xp.spec.ts:56` | CLOSED |
| T-19-30 | Tampering (contenuto) | `maxXp` malformato | mitigate | `pet-xp.ts:10-11,24`; `companion-xp.ts:33-34`. Spec `outcome-plan.spec.ts:691`, `companion-xp.spec.ts:107` | CLOSED |
| T-19-31 | Tampering | conflitto di path (Pitfall 4) | mitigate | `companion-xp.ts:10-11,38-43` solo array intero. Spec `companion-xp.spec.ts:20`, `outcome-plan.spec.ts:608` | CLOSED |
| T-19-32 | Denial of service | lettura del catalogo dei pet a ogni esito | accept | 44 documenti, proiezione di un campo (`resolution-loader.service.ts:448`); A-IN-02 chiuso con motivo | CLOSED (accepted) |
| T-19-33 | Elevation of privilege | xp del compagno senza vittoria / senza nemici | mitigate | `outcome-plan.ts:372` (`won ? enemies.xp : 0`), `:442-446` (mai `xpPrize`). Spec `quest-resolution.service.int-spec.ts:696,720`, `combatant-plan.spec.ts:256`, `outcome-plan.spec.ts:661` | CLOSED |
| T-19-34 | Tampering | due operatori sullo stesso array | mitigate | `outcome-plan.ts:338-345,447-451,486`. Spec `outcome-plan.spec.ts:608` e caso sul replica set col pet in premio | CLOSED |
| T-19-35 | Denial of service | risultati vecchi senza il campo | mitigate | `src/models/quest-result/quest-result.model.ts:219-221` default 0. Spec `quest-result.resolver.int-spec.ts:503` | CLOSED |
| T-19-36 | Tampering | scrittura dell'esito | accept | posseduti dallo snapshot letto in sessione; filtro e transazione invariati | CLOSED (accepted) |
| T-19-37 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:762-763` blocco esatto `type QuestResult` | CLOSED |
| T-19-38 | Elevation of privilege | premio su un'imboscata persa | mitigate | `src/travel/ambush/ambush-plan.ts:195-199` (`won ? enemies.xp : 0`). Spec `ambush-plan.spec.ts:393`, `ambush-resolution.int-spec.ts:545` | CLOSED |
| T-19-39 | Tampering | campo scartato dalla strict mode | mitigate | `src/models/character/ambush-snapshot.model.ts:128-130` `@Prop` | CLOSED |
| T-19-40 | Denial of service | report trattenuti senza il campo | mitigate | `src/travel/ambush/ambush-results.ts:87` (`?? 0`). Spec `ambush-results.spec.ts:107` | CLOSED |
| T-19-41 | Tampering (contratto) | `AmbushReport` sul filo | mitigate | nessuna riga di `AmbushReport` nel diff dello SDL | CLOSED |
| T-19-42 | Denial of service | `StrictPopulateError` su `cities` | mitigate | `cityRelations()` e modello nello stesso commit (`df08f14d`); **C-WR-06** `CitiesService.findAll` popola. Spec `cities.resolver.int-spec.ts:205` | CLOSED |
| T-19-43 | Tampering | `PoiQuestStep` | mitigate | `poi-quest.step.ts:12,14` rimozione del solo campo con guardia «presente». Spec `poi-quest.step.int-spec.ts:85,99` | CLOSED + operativa: backup di `pointsofinterest` (Passo 2): il campo tolto non ha altra copia |
| T-19-44 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:612-613` | CLOSED |
| T-19-45 | Information disclosure | lore di un pet a chi non le ha sbloccate | mitigate | `src/lore/related-lore.resolvers.ts:110-121` resolver sul tipo `Pet`; `:80-93` `visibleLoreIdsOf(viewer, refs)` prima del caricamento, `[]` senza id; viewer da `ViewerKnowledgeService` (memo per evento e viewer). Spec `lore-related.int-spec.ts:467,478,494,507` (giocatore, oste, senza personaggio, lore sparita) | CLOSED |
| T-19-46 | Elevation of privilege | lore sbloccate senza ottenere il pet | mitigate | `outcome-plan.ts:463` (`petWon ? rewards.petLore : []`); `trade-pets.ts:77-88` sole righe `buy`; `shop-transaction.service.ts:265-267` nella stessa transazione. Spec `shop-transaction.service.int-spec.ts:1380,1399,1415` | CLOSED |
| T-19-47 | Tampering | sovrascrittura di `unlockedLore` | mitigate | solo `knowledgeUpdateOf`/`knowledgeAdditionOf` (`victory-knowledge.ts:54-63`, `shop-transaction.service.ts:265`). Spec `victory-knowledge.spec.ts:103,116` | CLOSED |
| T-19-48 | Denial of service | lore orfana o id stringa | mitigate | `src/lore/related-lore-ids.ts:6-9`; caricamento per id (`related-lore.resolvers.ts:89-91`). Spec `lore-related.int-spec.ts:507`, `catalog-prices.reader.int-spec.ts:198` | CLOSED |
| T-19-49 | Tampering (processo) | collegamenti pet → lore nel repo | mitigate | nessun file di contenuto aggiunto (controllo trasversale); nessun passo del migratore tocca `relatedLore` | CLOSED |
| T-19-50 | Elevation of privilege | acquisto fuori dal pool | mitigate | `src/economy/trade/trade-pool.ts:27` `poolOfCity` sul sotto-documento; `grep -rnwE 'shopEquipment\|shopLoot\|shopPets'` fuori dal migratore = 0. Spec `shop-transaction.service.int-spec.ts:1446,1470,1487` | CLOSED |
| T-19-51 | Tampering (regola) | tutte le città «con pool» | mitigate | `src/models/city.model.ts:51` e `city-shop-pool.model.ts:9,15,21` `default: undefined`; `shop-pool.report.ts:56` `hasPool` | CLOSED |
| T-19-52 | Tampering | `CityShopStep` | mitigate | `city-shop.step.ts:21-27` solo `$rename`, guardia `:12-18`. Spec `city-shop.step.int-spec.ts:122` | CLOSED + operativa: backup di `cities` (Passo 2) |
| T-19-53 | Tampering (contratto) | pool esposto sul filo | mitigate | `city-shop-pool.model.ts:5-6` senza `@ObjectType`; nessuna riga del pool nel diff dello SDL | CLOSED |
| T-19-54 | Tampering | `LoreImagePathStep` | mitigate | `lore-image-path.step.ts:12-21` guardia sui due campi, documenti con entrambi contati e lasciati. Spec `lore-image-path.step.int-spec.ts:110` | CLOSED |
| T-19-55 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:432-433` | CLOSED |
| T-19-56 | Repudiation | storia del file enum | mitigate | `git log --follow -- src/models/enums/slot-type.enum.ts` = 4 commit | CLOSED |
| T-19-57 | Tampering | modello morto | accept | `notification.model.ts`, `item_reference_type.enum.ts`, `active-spell.model.ts` assenti | CLOSED (accepted) |
| T-19-58 | Tampering | valore di slot come path di scrittura | mitigate | `schema.gql:798-808` `enum SlotType` (senza il valore vecchio, blocco esatto in `test/app.int-spec.ts:95,493`); `equip-item.updates.ts:20-22` riceve solo l'enum. Spec `equip-item.int-spec.ts:283` (`BAD_USER_INPUT`, nulla scritto) | CLOSED — la spec invia `shoes`; il valore vecchio è rifiutato dalla stessa validazione dell'enum (non è nel blocco pinnato) |
| T-19-59 | Tampering (regola) | lettore lean dimenticato | mitigate | `grep -rnwE 'wearedEquipment\|foots' src test` fuori dal migratore = 0. Spec `shop-transaction.service.int-spec.ts:394` | CLOSED |
| T-19-60 | Tampering | `WornEquipmentStep` | mitigate | `worn-equipment.step.ts:42-49` due scritture in ordine; **C-WR-03** `:16-19` guardia «destinazione assente», `:22-25,50` entrambi i campi contati e non toccati. Spec `worn-equipment.step.int-spec.ts:134,153,182` | CLOSED + operativa: backup (Passo 2); il controllo «entrambi i campi = 0» non è più distruttivo |
| T-19-61 | Elevation of privilege | `equipItem` su un personaggio altrui | accept | `characters.resolver.ts:63` `@OwnsCharacter`; `test/authz/expected-handlers.ts` senza diff | CLOSED (accepted) |
| T-19-62 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:479-493` | CLOSED |
| T-19-63 | Denial of service | campo assente da harness o modulo | mitigate | `src/characters/character-status.resolver.ts:5-11`; `test/authz/characters-test-app.ts:64`. Spec `character-updated.subscription.int-spec.ts:773`, `character-status.resolver.spec.ts:18,27` | CLOSED |
| T-19-64 | Information disclosure | valore di un subscriber a un altro | accept | campo puro sul genitore (`character-status.resolver.ts:9`), nessuna cache | CLOSED (accepted) |
| T-19-65 | Elevation of privilege | slot in più | accept | tetto valutato sul documento vivo (`active-spell.updates.ts:36`) | CLOSED (accepted) |
| T-19-66 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:89,573` | CLOSED |
| T-19-67 | Tampering | magie perse dalla fusione | mitigate | `spell-states.step.ts:95-182` funzione pura; **C-WR-01** `:89-93,141-144,162-167` le voci del codice nuovo restano; **C-WR-02** `:228-235` guardia e liste lette nel filtro. Spec `spell-states.step.spec.ts:159-266`, `spell-states.step.int-spec.ts:264,300,333,378` | CLOSED + operativa: backup (Passo 2) |
| T-19-68 | Tampering | passo rieseguito | mitigate | `spell-states.step.ts:58-69` guardia sui due campi vecchi, tolti nella stessa scrittura (`:236-239`). Spec `spell-states.step.int-spec.ts:218,412` | CLOSED |
| T-19-69 | Elevation of privilege | equipaggiata non conosciuta | mitigate | `spell-states.step.ts:172-177`. Spec `spell-states.step.spec.ts:159` | CLOSED — una voce con `active` booleano fuori dalla lista vecchia resta (ruling C-WR-01: l'ha scritta il codice nuovo) |
| T-19-70 | Tampering (contratto) | `src/schema.gql` | mitigate | `test/app.int-spec.ts:586-587` | CLOSED |
| T-19-71 | Tampering / DoS | riparazione che azzera `spellStates` | mitigate | `spell-state.migration.ts:4` solo il taglio; `grep 'rebuild\|repair\|status.spells' spell-state.migrator.ts` = 0. Spec `spell-state.migrator.int-spec.ts:153`; con C-CR-01 il taglio gira dopo il passo 9 (`test/app.int-spec.ts:1001`) | CLOSED + operativa: «mai codice pre-19 sul database migrato» (vedi T-19-89) |
| T-19-72 | Elevation of privilege | più magie attive degli slot | mitigate | `active-spell.updates.ts:17-24,27-38` capacità nello stesso update; casi di concorrenza in `equip-spell.int-spec.ts` | CLOSED |
| T-19-73 | Elevation of privilege | uso di una magia non attiva | mitigate | `spell-state.updates.ts:10-20` (`usages ≥ 1`, `active: true`); `characters.resolver.ts:109` `@OwnsCharacter` | CLOSED |
| T-19-74 | Denial of service | filtro d'array non usato | mitigate | `spell-state.updates.ts:5-7` unico filtro `s`, usato da ogni update (`active-spell.updates.ts:42,56`); `use-spell.int-spec.ts`, `spell-recovery.*.int-spec.ts` | CLOSED |
| T-19-75 | Tampering | `active` perso dal taglio | mitigate | `spell-state.migration.ts` voce ricostruita a quattro campi; caso sul replica set in `spell-state.migrator.int-spec.ts` | CLOSED |
| T-19-76 | Denial of service (qualità) | soglia di coverage | mitigate | `package.json:163` soglia presente; `package.json` senza diff | CLOSED — misura a carico di `test:cov` in corso |
| T-19-77 | Elevation of privilege | magia non equipaggiata in combattimento | mitigate | `combat-context.ts:203` `activeSpellsOf(snapshot)`; `gm-overrides.ts:53-57` (B-IN-04) | CLOSED |
| T-19-78 | Tampering | `active` o recuperi persi | mitigate | array intero con `toEqual` in `outcome-plan.spec.ts`; `ambush-plan.ts:187-193` | CLOSED |
| T-19-79 | Tampering (regola) | lettore lean dimenticato | mitigate | `grep` di `status.spells` come path su `src` e `test` fuori dal migratore = 0; `activeSpells` resta solo come nome del contratto del motore | CLOSED |
| T-19-80 | Tampering | magia imparata due volte | mitigate | `outcome-plan.ts:425-435` sulle voci | CLOSED |
| T-19-81 | Tampering (contratto del motore) | `CombatParticipant` rinominato | mitigate | `combat-resolver.ts` cambia solo per `weaknesses` (19-02) e per l'import dell'enum (19-14); `activeSpells` invariato | CLOSED |
| T-19-82 | Denial of service | `StrictPopulateError` sul personaggio | mitigate | `characters.service.ts:106,116` path nuovi nello stesso commit del modello | CLOSED |
| T-19-83 | Denial of service | magia orfana sul filo | mitigate | `spell-state.mapper.ts:4-14`, `characters.service.ts:151`. Spec `spell-state.mapper.spec.ts`, `spell-state.wire.int-spec.ts` | CLOSED |
| T-19-84 | Tampering (contratto) | campi nello SDL | mitigate | `test/app.int-spec.ts:586-595` (tre blocchi, `ActiveSpell` assente) | CLOSED |
| T-19-85 | Tampering (regola) | lettore o semina dimenticati | mitigate | grep dei path vecchi = 0 (controlli trasversali) | CLOSED |
| T-19-86 | Tampering | dati reali nella forma vecchia | transfer | runbook `BACKEND-NOTES.md` §3 Passi 1–5; con C-CR-01 il passo precede ogni hook (`model-review.boot.ts:59-74`) | **OPERATIVA — da eseguire** (Passi 1–5) |
| T-19-87 | Tampering (contratto) | `src/schema.gql` | mitigate | 17 righe tolte, tutte nell'elenco dichiarato (`ActiveSpell`, `activeSpells`, `ownedPets: [Pet!]!`, `wearedEquipment`, `spells`, due debolezze, `foots` ×2, `image`, tre campi di `Pet`, `quest`); blocco `Mutation` senza righe tolte | CLOSED |
| T-19-88 | Tampering (regola) | nome vecchio sopravvissuto | mitigate | grep di ogni nome vecchio fuori dal migratore = 0 | CLOSED |
| T-19-89 | Tampering | codice vecchio su dati migrati | mitigate | regola in `BACKEND-NOTES.md` §3, regole in evidenza («mai codice pre-19 sul database migrato», ritorno solo col backup), Passo 1 (processo dell'utente fermo), Passo 2 (backup) | **OPERATIVA — da eseguire** (§3 regole in evidenza, Passi 1–2) |
| T-19-90 | Tampering (processo) | migratore che resta o esce presto | mitigate | modulo presente e isolato (vedi T-19-03); `.planning/REQUIREMENTS.md:33,88` BE-MODEL-09 `[ ]` / `Pending` | **OPERATIVA — da eseguire** (Passo 7 rimozione in TDD, Passo 8 PR fuori dal draft solo dopo) |
| T-19-91 | Information disclosure | codice e documenti | mitigate | 0 file `.env` nel diff, 0 `process.env.` aggiunti su `src` e `test`, 0 URI di connessione nell'intero diff, `.env.example` e config senza diff | CLOSED |
| T-19-92 | Tampering (processo) | requisiti chiusi senza contenuto | mitigate | `.planning/REQUIREMENTS.md:28,33-36` BE-MODEL-04, 09, 10, 11, 12 `[ ]`; `:83,88-91` `Pending` | CLOSED |
| T-19-93 | Tampering | script di contenuto malformati | transfer | runbook Passo 6 (prova a secco, revisione dell'utente, conteggi); lettori sanificanti nel codice (T-19-23, 30, 48, 96, 101) | **OPERATIVA — da eseguire** (Passo 6) |
| T-19-94 | Repudiation | commit | mitigate | trailer vietati su 180 commit = 0. Subject oltre 72: **2** (74 caratteri): `00bd8556` (dichiarato in 19-23-SUMMARY) e `24248913` (`docs(phase-18)`, fuori dalla fase) | CLOSED — la parte di ripudio (trailer) è a 0; il conteggio dei subject non è a 0 come dichiarato |
| T-19-95 | Denial of service (qualità) | coverage | mitigate | `package.json` e `package-lock.json` senza diff; soglie presenti | CLOSED — misura a carico di `test:cov` in corso |
| T-19-96 | Denial of service | rarità fuori enum | mitigate | `pet.model.ts:67-69` nullable + `enum`. Spec `pet-rarity.int-spec.ts:62,91` (annulla il solo campo), `pet.schema.spec.ts:87` | CLOSED + operativa: lo script scrive i soli cinque nomi dell'enum (Passo 6) |
| T-19-97 | Tampering (contratto) | `src/schema.gql` | mitigate | `rarity: RarityType` fra le sole righe aggiunte; blocco esatto `type Pet` | CLOSED |
| T-19-98 | Tampering (processo) | rarità nel repo | mitigate | nessun file di contenuto aggiunto | CLOSED |
| T-19-99 | Elevation of privilege | pet troppo raro per il rango | mitigate | `src/quests/generation/pet-prize.ts:79-98` tetto dal pool del rango, pet senza rarità mai candidato. Spec `pet-prize.spec.ts:76,168` | CLOSED — A-WR-02: per ruling dell'utente i `legendary` possono uscire dalle sole quest boss di rango hero |
| T-19-100 | Tampering (regola) | probabilità ai confini | mitigate | `pet-prize.ts:13-15,40` confini dalle costanti; casi ai confini in `pet-prize.spec.ts` | CLOSED |
| T-19-101 | Tampering (contenuto) | rarità ignota, `sellable` nullo, legame orfano | mitigate | `pet-candidate.ts:26-38`; `pet-prize.ts:59-60,69`. Spec `pet-candidate.spec.ts:24,34,44,59` | CLOSED |
| T-19-102 | Tampering (determinismo) | numero di tiri | mitigate | `pet-prize.ts:92` contratto dichiarato. Spec `pet-prize.spec.ts:201` | CLOSED |
| T-19-103 | Information disclosure | `Pet.enemy` sul filo | mitigate | `pet.model.ts:71-73` senza `@Field`; nessun `enemy` nel blocco `type Pet`. Spec `pet.schema.spec.ts:72` | CLOSED |
| T-19-104 | Elevation of privilege | client che sceglie il pet in premio | accept | il premio nasce in `pet-prize.ts` (generatore); nessun input lo porta | CLOSED (accepted) |

## Controlli trasversali

```
$ git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'
17        (tutte nell'elenco dichiarato; nessuna nel blocco Mutation né negli input)
$ grep -c 'WeaknessesInput\|EnemyInput\|PetInput\|OwnedPetInput\|CharacterAssetsInput\|SpellStateInput' src/schema.gql
0
$ git diff origin/develop..HEAD -- src test | grep -cE '^\+.*process\.env'
0
$ git diff origin/develop..HEAD --name-only | grep -E '\.env|secret|credential'
(vuoto)
$ git diff origin/develop..HEAD | grep -cE '^\+.*mongodb(\+srv)?://'
0
$ git diff origin/develop..HEAD --stat -- .env.example src/config docker-compose.yml package.json package-lock.json
(vuoto)
$ git diff origin/develop..HEAD --name-only --diff-filter=A | grep -iE 'seed|content/|scripts/|\.ya?ml|\.csv|\.json'
(vuoto)
$ git diff origin/develop..HEAD -- src ':!src/migrations/model-review' ':!*spec.ts' | grep -E '^\+.*(logger|Logger|console)\.'
(vuoto)
$ git diff origin/develop..HEAD -- src | grep -E '^\+.*(Math\.random|Date\.now)'
(solo src/characters/character-updated.subscription.int-spec.ts)
$ git diff origin/develop..HEAD --stat -- test/authz
test/authz/characters-test-app.ts | 2 ++      (solo CharacterStatusResolver nell'harness)
$ git log origin/develop..HEAD --format=%B | grep -ciE "co-authored-by|generated with|claude-session"
0
$ grep -rnwE 'energyWeaknesses|baseWeaknesses|wearedEquipment|foots|shopEquipment|shopLoot|shopPets' src test --include='*.ts' | grep -v '^src/migrations/model-review/'
(vuoto)
```

Esame del codice per area:

- **(a) Migratore sul database reale.** Nove passi, ognuno con guardia di idempotenza e caso «changes nothing on a second run». Scritture a un colpo (`updateMany` con guardia) per debolezze, catalogo dei pet, POI, negozi, lore, equipaggiamento; lettura + `updateOne` col valore letto nel filtro per magie dei nemici, pet posseduti e lista delle magie. **Scritture distruttive senza copia nel database:** passo 3 (`damages` se `attack` è già scritto, `xp`, `currentLifePoints` del catalogo), passo 5 (`quest` dei POI), passo 9 (`status.spells`, `assets.activeSpells`, `status.maxActiveSpells`, stati lasciati fuori). L'unica copia durevole è il backup del Passo 2 del runbook: mitigazione operativa. Log: nove righe di soli conteggi; WARN con `_id` Mongo (nemico, personaggio), id delle magie e nome della magia incorporata; errore con solo nome e codice; nessun nome di utente, twitchId, URI, host. Boot fail-closed: `model-review.boot.ts:35-52`, pinnato da `model-review.boot.spec.ts:128,179,197` e `test/app.int-spec.ts:1001`. Modulo importato solo da `AppModule`; un solo verso di dipendenza (`owned-pets.step.ts` → `newOwnedPetEntry`).
- **(b) Autorizzazione.** `src/characters/characters.resolver.ts` senza diff sui decoratori: `@OwnsCharacter` su `doTransaction` (53), `equipItem` (63), `equipPet` (73), `unequipPet` (82), `equipSpell` (91), `unequipSpell` (100), `useSpell` (109). `test/authz/expected-handlers.ts` senza diff; `EXPECTED_PUBLIC_HANDLERS` senza diff. Nessuna mutation, query o subscription nuova: i soli resolver aggiunti sono `ResolveField` (`CharacterStatus.maxActiveSpells`, `Weaknesses.base/energy`, `Pet.relatedLore`).
- **(c) Nulla che il client possa gonfiare.** `xp` del compagno, `petXpGained`, rarità e pet in premio, lore sbloccate: solo funzioni server-side; gli input sul filo sono i venti già esistenti, nessuno porta questi campi.
- **(d) Filtro per viewer.** `Pet.relatedLore` passa da `VisibleLoreLoader` (id visibili calcolati prima del caricamento). Le debolezze non dipendono dal viewer: il filtro è sui valori dell'enum.
- **(e) Validazione dell'input.** `SlotType` enum GraphQL senza il valore vecchio; nessun tipo input di modello nello SDL.
- **(f) DoS da dati malformati su campi non nullable.** Coperti: voci di `ownedPets` (orfane, xp/vita nulli, frazionari, negativi, oltre `Int`), `spellStates` con magia sparita, debolezze fuori enum o nulle, `Pet.rarity` fuori enum, `Enemy.spells` orfane, `petXpGained` assente. Residui non coperti e già noti (chiusi per ruling C-IN): `Enemy.weaknesses: null` esplicito (il default Mongoose vale solo per il campo assente; il resolver filtra le liste, non il sotto-documento) e un pet a catalogo con un campo `…!` nullo (`maxXp`, `imagePath`, …) dentro `OwnedPet.pet: Pet!`, che annullerebbe `assets`: forma preesistente (`ownedPets: [Pet!]!` aveva la stessa esposizione), a carico del controllo dei contenuti del Passo 6.
- **(g) Ambiente e segreti.** Nessuna variabile nuova (`PET_XP_SHARE` è una costante, `pet-xp.ts:2`), nessun segreto, nessun `process.env.` aggiunto.

## Mitigazioni operative — da eseguire (ESEGUITE l'11 novembre 2026: vedi «Mitigazioni operative eseguite» in fondo)

| ID | Cosa resta da fare | Runbook |
| --- | --- | --- |
| T-19-86 | boot reale col migratore prima di ogni uso dei dati | §3 Passi 1–5 |
| T-19-89 | processo BE dell'utente e client fermi; mai codice pre-19 sul database migrato; ritorno solo col backup | §3 regole in evidenza, Passi 1–2 |
| T-19-90 | rimozione del modulo in TDD, terzo boot senza righe, PR fuori dal draft solo dopo | §3 Passi 7–8 |
| T-19-93 | script di contenuto fuori repo con prova a secco e revisione dell'utente | §3 Passo 6 |
| T-19-03, 10, 14, 25, 43, 52, 60, 67 | backup delle sei collezioni PRIMA del boot (unica copia dei campi tolti) | §3 Passo 2 |
| T-19-05, 10 | prova a secco: fuori enum = 0, copie non abbinabili = 0, valori non-lista = 0 | §3 Passo 3 |
| T-19-71 | build solo dalla HEAD della fase | §3 regole in evidenza, Passo 4 |
| T-19-96 | rarità scritte coi soli cinque nomi dell'enum | §3 Passo 6 |

**Runbook e fix della review.** Alla prima lettura (`BACKEND-NOTES.md` a `6dbbe80a`) il runbook aveva quattro scarti rispetto al codice: la riga `…fallito (…), il boot prosegue`, il controllo «nulla in scadenza» assente da §3 benché il ruling C-CR-01 lo dia per presente, la riga WARN `…cambiato durante il passo…` e la regola «non aprire ai client» scritte solo in `19-REVIEW-FIX.md`, la nota su «167 senza pool» di `ShopBoot`. **Riletto a fine audit sull'albero di lavoro (modifica dell'orchestratore non ancora committata), i quattro scarti sono corretti:** righe 363-365 (`il boot si ferma`, `boot interrotto…`), riga 316 e riga 354 («nulla in scadenza» = 0, da contare prima di fermare il processo pre-19), righe 375-378 (WARN nuovo e «con senza corrispondenza ≠ 0 non aprire ai client»), riga 314 (`ShopBoot`). Resta solo da committare quella versione insieme a questo file.

## Minacce nuove introdotte dai fix della review (non dichiarate da alcun piano)

| ID | STRIDE | Origine | Descrizione | Mitigazione presente | Valutazione |
| --- | --- | --- | --- | --- | --- |
| N-19-01 | Denial of service | C-WR-05, C-CR-01 | Finché il modulo è nel repo, QUALSIASI errore di un passo (anche transitorio: timeout, primario che cambia) tiene il BE spento: `model-review.boot.ts:51` rilancia dentro la factory, Nest esce con codice 1. Vale per ogni processo che compila `AppModule` | voluto (fail closed); passi idempotenti, quindi basta riavviare; unico entrypoint `src/main.ts`; il modulo esce prima della merge (Passo 7) | accettata per ruling; **non mergiare con il modulo dentro**; righe del boot interrotto nel runbook (`BACKEND-NOTES.md:363-365`, albero di lavoro) |
| N-19-02 | Tampering / DoS | C-WR-02 | Una scrittura «non applicata» (filtro col valore letto che non combacia) NON ferma il boot: conta 1 in «senza corrispondenza», WARN, e l'app apre servendo quel documento nella forma vecchia (letta come vuota dal codice nuovo). Con i passi prima di ogni hook e i client fermi non esiste uno scrittore concorrente: resterebbe solo un falso negativo PERMANENTE dell'uguaglianza sull'array intero (un valore che non sopravvive al giro driver → filtro, p. es. un long oltre 2^53 o un decimal), che si ripeterebbe a ogni boot | casi «numeri salvati come double o long» (`enemy-spells.step.int-spec.ts:167`, `spell-states.step.int-spec.ts:378`); il runbook attende `senza corrispondenza 0` e nessun WARN su tutte le righe | bassa; operativa: regola «non aprire ai client» nel Passo 4 (`BACKEND-NOTES.md:378`, albero di lavoro). Nessuna spec pinna altri tipi BSON |
| N-19-03 | Information disclosure | C-WR-01, C-WR-02 | I log del migratore portano ora `_id` del personaggio e id delle magie (tre righe WARN), in contrasto con il testo di T-19-28. Il nome della copia incorporata («…») è una stringa letta dal database e finisce nel log senza filtro (lunghezza, a capo) | entro `19-REPO-RULES.md:27` (solo id); `_id` Mongo non è twitchId né nome; il contenuto dei nemici lo scrive solo l'utente; righe attese = 0 sui dati reali | accettata; le righe finiscono nel handoff: copiarle solo se compaiono |
| N-19-04 | Denial of service / Tampering | C-WR-04 | Un nemico con una copia non abbinata resta NON scritto a ogni boot: sotto lo schema nuovo il suo `spells` contiene oggetti dove il modello aspetta ObjectId. Come li legge il codice 19 (cast per `_id`, populate, lettori lean del combattimento) non è pinnato da alcuna spec: il fix baratta la perdita silenziosa del dato con un nemico in forma ibrida servito ai client. Il boot non si ferma | conteggio in «senza corrispondenza» e WARN per copia; prova a secco «copie non abbinabili = 0» (Passo 3); inventario dell'11 novembre: 91 su 91 abbinabili per `_id` | bassa sui dati reali; se la prova a secco non dà 0, curare a mano PRIMA del boot e non aprire ai client con «magie dei nemici: senza corrispondenza» > 0 |

Nessuna delle quattro è bloccante (`block_on: high`): sono tutte contenute da passi del runbook e dalla rimozione del modulo prima della merge.

## Aperte

Nessuna.

## Differite

Nessuna minaccia differita. Residuo operativo, non una minaccia aperta: BE-MODEL-04, 09, 10, 11, 12 restano `Pending` per costruzione (boot reale, contenuto dei pet, rimozione del modulo) e le quattro mitigazioni operative sopra vanno eseguite e annotate qui (data, conteggi del primo e del secondo boot) prima di togliere la PR dal draft.

## Flag di minaccia non registrati

Nessuno dai SUMMARY: i 23 SUMMARY dichiarano «nessuna superficie nuova fuori dal threat model» (i piani 19-01…19-04 non hanno la sezione). Le sole voci non registrate sono N-19-01…N-19-04, nate dai fix della review.

## Mitigazioni operative eseguite (2026-11-11)

Fatti del boot reale riferiti dall'orchestratore e rimozione del modulo fatta in TDD; il registro sopra resta com'era all'audit.

| ID | Cosa è stato fatto | Esito |
| --- | --- | --- |
| T-19-86 | Boot reale col migratore prima di ogni uso dei dati, dalla HEAD `66ff10ec`: prova a secco pulita (91 copie di magie identiche al catalogo, nessun personaggio con entrambi i campi dell'equipaggiamento, nessuna debolezza fuori enum); primo boot: debolezze 206 / 206, magie dei nemici 206 / 45 (161 già a posto), catalogo dei pet 44 / 44, pet posseduti 7 / 0 (7 già a posto), back-link dei POI 642 / 642, pool dei negozi 167 / 167, immagini delle lore 522 / 522, equipaggiamento 7 / 7, lista delle magie 7 / 7; «senza corrispondenza» 0 ovunque, nessun `fallito`, nessun WARN. Controllo contro il backup: nessun campo vecchio rimasto, valori identici. Secondo boot: nove righe a `migrati 0` | ESEGUITA |
| T-19-89 | Processo dell'utente fermato prima del boot, nulla in scadenza (0 quest avviate, 0 pendenti, 0 viaggi attivi, 0 in attesa di soccorso, 0 recuperi di magie pendenti); backup fuori repo di `enemies`, `pets`, `characters`, `cities`, `lore`, `pointsofinterest`, `spells`, `quests` prima di ogni scrittura; sul database migrato è girato solo codice della Phase 19 | ESEGUITA |
| T-19-90 | Modulo una tantum rimosso in TDD dopo il boot e il contenuto: RED `c3492ced`, GREEN `0822feee`; cartella assente, nessun riferimento in `src` e `test` oltre al caso «does not mount…» del boot di test; `tsc` 0, SDL invariato. BE-MODEL-09 `[x]` / `Complete`. PR #33 fuori dal draft solo dopo questa rimozione | ESEGUITA — resta il terzo boot reale dalla build dopo la rimozione (il processo in esecuzione viene ancora dalla build di `66ff10ec`) |
| T-19-93 | Script di contenuto fuori repo, prova a secco e poi una sola transazione: 44 `maxXp`, 44 `defense` non vuote, 44 `rarity` nei soli cinque nomi dell'enum (13 common, 8 uncommon, 8 rare, 12 ultrarare, 3 legendary), 44 `relatedLore`, 31 `Pet.enemy` come ObjectId. Controllo finale: 0 pet senza difesa, 0 senza rarità, 31 con nemico, 44 con una lore | ESEGUITA |

**N-19-01 chiusa dalla rimozione:** il modulo che fermava il boot al primo passo fallito non è più nel repo (`0822feee`); nessun processo che compila `AppModule` dalla HEAD lo esegue. La regola «non mergiare con il modulo dentro» è rispettata. N-19-02, N-19-03 e N-19-04 non si sono materializzate (nessun WARN, «senza corrispondenza» 0 su tutte le righe) e decadono col modulo.

Le mitigazioni di accompagnamento (backup prima del boot, prova a secco, build dalla sola HEAD della fase, rarità coi nomi dell'enum) sono coperte dai fatti sopra.
