---
phase: 23
slug: sconfitta-riposo-recupero-compagni
status: secured
audited: 2026-11-14
asvs_level: 1
block_on: high
head: 1175b84d
threats_total: 50
threats_closed: 50
threats_open: 0
unregistered_flags: 0
unregistered_findings: { high: 0, medium: 0, low: 2, info: 4 }
---

# Phase 23: Sicurezza di «Sconfitta, riposo e recupero dei compagni»

Audit di sola lettura sul diff `d4e3adad..HEAD` (`src`, `test`) con HEAD `1175b84d`. Nessun sorgente toccato, nessun jest lanciato, nessun `.env` letto. Le evidenze sono `file:riga` dei sorgenti e il nome della spec che prova il comportamento. I summary non hanno una sezione `## Threat Flags` con voci senza mappatura.

## Verifica del registro delle minacce

Dispositivo: `M` = mitigate (cercata nel codice), `A` = accept (voce nel registro dei rischi accettati più sotto), `T` = transfer.

| ID | Categoria | Disp. | Mitigazione dichiarata | Evidenza | Verdetto |
|----|-----------|-------|------------------------|----------|----------|
| T-23-01 | Tampering | M | campi nuovi solo se validi | `src/characters/pets/owned-pet-entry.ts` `nameOf`/`dateOf`/`isSavedCompanionLevel` in `normalisedEntry`; spec `owned-pet-entry.spec.ts:160` (nome vuoto, data illeggibile, livello non valido scartati) | CLOSED |
| T-23-02 | DoS | M | regole indulgenti di `companionLifeAt` | `src/characters/pets/companion-life.ts` `companionLifeNow` (legacy 0 = piena, minimo 1), `companionLifeAt` (`T` non valido = `settled(max)`); `companion-life.spec.ts` | CLOSED |
| T-23-03 | Info disclosure | M | `@Prop` senza `@Field` per i campi interni | `src/models/character/owned-pet.model.ts`: `defeatedUntil` solo `@Prop`; `grep -c defeatedUntil src/schema.gql` = 0 | CLOSED |
| T-23-04 | Info disclosure | M | `defeatedUntil` fuori dallo schema, filo solo derivato | stesso `owned-pet.model.ts`; `OwnedPetResolver` (`src/characters/pets/owned-pet.resolver.ts:25-56`) serve `defeated`, `fullLifeAt`, `level`, `maxLifePoints` calcolati; blocco `OWNED_PET_BLOCK` pinnato in `test/app.int-spec.ts:85` | CLOSED |
| T-23-05 | DoS | M | `recoveryTime` annullabile, `defeated` sempre calcolato | `src/models/pet.model.ts` `recoveryTime` `Int` nullable (`min:1`, `max: MAX_RECOVERY_VALUE`, validatore intero); `owned-pet.resolver.ts:25` `isPetDefeated(entry, now)`; `maxLifePoints` con fallback `ownedPetCountOf` | CLOSED |
| T-23-06 | Info disclosure | M | log del reporter con solo il conteggio | `pet-recovery-catalog.reporter.ts` warn con `${count}`; spec `pet-recovery-catalog.reporter.spec.ts:46` | CLOSED |
| T-23-07 | EoP | A | nessun handler nuovo, campi sotto `character` | vedi registro rischi accettati R-1 | CLOSED |
| T-23-08 | Tampering | M | `PET_DEFEATED` dal predicato unico | `src/characters/pets/equip-pet.plan.ts` `planEquipPet` (`isPetDefeated(chosen, now)`, filtro di guardia `slotFilterOf`); spec `equip-pet.int-spec.ts:329` e `:347` | CLOSED |
| T-23-09 | Tampering | M | vita dall'ancora, nessun regalo da equip/unequip, retry su WriteConflict | `equip-pet.plan.ts` `equippedEntry`/`restingEntry` (stessa `companionLifeAt`, ancora riscritta a `now`, vita intera floor); `characters.service.ts` `writePetSlot` dentro `connection.transaction` (snapshot in sessione); spec `equip-pet.int-spec.ts:374`, `:392`, `:418` | CLOSED |
| T-23-10 | EoP | A | `@OwnsCharacter` invariato | registro R-2 | CLOSED |
| T-23-11 | Tampering | M | `companionLifeAfter` clampata dal piano | `src/quests/outcomes/pets/companion-after-fight.ts` `clamp(..., COMPANION_LIFE_FLOOR, maxBefore)`; `placeholder-combat-resolver.spec.ts` | CLOSED |
| T-23-12 | Repudiation | M | nessun tiro nuovo | le modifiche a `placeholder-combat-resolver.ts` (+18) e `placeholder-dungeon-resolver.ts` (+19) non aggiungono chiamate al generatore (verificato sul diff); spec a seme fisso nel diff | CLOSED |
| T-23-13 | Tampering | M | guardia sullo slot letto, esito in transazione | `src/quests/outcomes/outcome-plan.ts`/`outcome-writer.service.ts` (filtro per identità), `companion-defeat.int-spec.ts:193` e `:270` | CLOSED |
| T-23-14 | Tampering | M | clamp `[1, max]` | `companion-after-fight.ts` (clamp su `lifeAfter`); spec `companion-after-fight.spec.ts:130` («clamps an engine value») | CLOSED |
| T-23-15 | Info disclosure | A | risultato letto solo dal proprietario | registro R-3 | CLOSED |
| T-23-16 | Tampering | M | un'int-spec per percorso (§Q4) | `companion-defeat.int-spec.ts:193,250,270,319` (quest, boss, stage, sconfitta senza soccorso); `companion-defeat-rescue.int-spec.ts:291,306,330,373,388` (soccorso, guardia vinta/persa, crimine, GM legacy); dungeon coperto da `placeholder-dungeon-resolver.spec.ts` | CLOSED |
| T-23-17 | EoP | M | pozione solo sul proprio compagno | `src/characters/items/item-use.service.ts` `currentCharacterOf(userId)` dal bearer; `item-use.plan.ts` `ownedCompanionOf` → `PET_NOT_OWNED`; `companionGuardOf` con `$elemMatch`; spec `use-item.int-spec.ts:807` (attaccante vs proprietario con la stessa specie, nessuna scrittura su nessuno dei due) | CLOSED |
| T-23-18 | Tampering | M | doppia pozione serializzata | `item-use.service.ts` `drinkWithin` in transazione + `companionGuardOf` (`currentLifePoints`, `lifeAsOf`, `potionRecoveryUntil`, `defeatedUntil` come letti); spec `use-item.int-spec.ts:848` e `item-use.plan.spec.ts:798,826` | CLOSED |
| T-23-19 | Info disclosure | M | `recoveryUntil` solo per due codici | `src/graphql/format-domain-error.ts` `RECOVERY_UNTIL_CODES` (`POTION_RECOVERING`, `PET_POTION_RECOVERING`) + `isIsoInstant`; spec `format-domain-error.spec.ts:396` | CLOSED |
| T-23-20 | Tampering | M | `petId` malformato rifiutato | `src/validation/object-id.pipe.ts` `OptionalObjectIdPipe`; `item-use.resolver.ts` lo applica a `petId`; specs `object-id.pipe.spec.ts:65`, `use-item.int-spec.ts:898` | CLOSED |
| T-23-21 | EoP | M | `renamePet` owner-only | `characters.resolver.ts:92-102` `@OwnsCharacter(..., { ownerOnly: true })`; `test/authz/expected-handlers.ts` in `EXPECTED_OWNERSHIP_HANDLERS` e `EXPECTED_OWNER_ONLY_HANDLERS`, conteggi 18/8 in `authorization-matrix.int-spec.ts:292-293`; specs `rename-pet.int-spec.ts:264` (altro giocatore), `:299` (oste rifiutato) | CLOSED |
| T-23-22 | Tampering | M | tetto sul filo + regole di forma del personaggio | `src/models/request/rename-pet-request.model.ts` `@MaxLength(200)`; `src/characters/pets/pet-name.ts` `normalizeCharacterName`/`isValidCharacterName` → `PET_NAME_INVALID`; specs `rename-pet.int-spec.ts:209`, `pet-name.spec.ts` | CLOSED |
| T-23-23 | Tampering | M | id malformati | `rename-pet-request.model.ts` `@IsObjectIdHex()` su `id` e `petId`; `characters.service.ts` `renamePet` `objectIdFromHex` → `PET_NOT_OWNED`; `name` omesso rifiutato (`@ValidateIf(name !== null)` + `@IsString`), solo `null` esplicito cancella: `rename-pet.int-spec.ts:226` | CLOSED |
| T-23-24 | Info disclosure | A | nessun filtro di parole (D-31) | registro R-4 | CLOSED |
| T-23-25 | Repudiation / DoS | M | claim atomico, push solo con `modifiedCount === 1` | `pet-recovery.service.ts` `claim` + `release` (ritorna solo gli id reclamati); `pet-recovery.ts` `petRecoveryClaim` (`arrayFilters`); spec `pet-recovery.int-spec.ts:192` (due claim concorrenti, una push), `:274` | CLOSED |
| T-23-26 | Tampering | M | il claim tocca solo `defeatedUntil` | `pet-recovery.ts` `petRecoveryClaim` `$set` unico su `assets.ownedPets.$[entry].defeatedUntil`; spec `pet-recovery.int-spec.ts:225` | CLOSED |
| T-23-27 | Info disclosure | M | log con soli id e conteggi | `pet-recovery.sweeper.ts` e `pet-recovery.service.ts`: id personaggio, conteggio, `describeError`; nessun nome o utente nei log | CLOSED |
| T-23-28 | DoS | M | indice dedicato, single-flight | `src/models/character/character.model.ts:120-124` indice `character_owned_pets_defeated_until`; `pet-recovery.sweeper.ts` `sweep()` con `inFlight ??=`; intervallo da `QUEST_CONFIG.sweepIntervalMs` | CLOSED |
| T-23-29 | Tampering | M | insert nella stessa transazione dell'update filtrato | `ambush-resolution.service.ts:~480-510` `writeCharacterUpdate(plan.filter…)` poi `writeResult` in sessione; `ambush-plan.ts:330` `...ambushFilter(input.identity, now)`; spec `ambush-resolution.int-spec.ts:432` | CLOSED |
| T-23-30 | Info disclosure | A | liste owner-only esistenti | registro R-5 | CLOSED |
| T-23-31 | DoS | M | report trattenuti conservati | spec `ambush-resolution.int-spec.ts:997` (report tenuti prima del deploy mantenuti nel viaggio riscritto), `ambush-lifecycle.int-spec.ts` | CLOSED |
| T-23-32 | Info disclosure | M | push al solo proprietario | `ambush-resolution.service.ts` `notifyAmbush(fight.userId, …)` → `push.sendToUser(userId, …)`; `userId` è il proprietario del personaggio della risoluzione | CLOSED |
| T-23-33 | Repudiation | M | push dopo il commit, non per stantie | `ambush-resolution.service.ts`: `deliverAndNotify` solo dopo la `transaction`, `stale()` ritorna prima; spec `ambush-resolution.int-spec.ts:783`, `:734` (una push, un risultato su replay) | CLOSED |
| T-23-34 | Info disclosure | A | nome del giocatore ai suoi dispositivi | registro R-6 | CLOSED |
| T-23-35 | Info disclosure | M | `mount` senza `@Field` | `src/models/character/active-travel.model.ts` `ActiveTravelMount`, `mount` solo `@Prop`; `grep -cw mount src/schema.gql` = 0 | CLOSED |
| T-23-36 | Tampering | M | `mount` scritto solo alla partenza | `travel-planner.service.ts` `rideOf`/`mountedRideOf` usato solo nel pianificatore di partenza; `ambush-on-foot.ts` `isMountFallen` legge il `mount` fotografato, mai lo slot attuale; specs `travel-planning.int-spec.ts:563,577,595`, `ambush-on-foot.int-spec.ts:331` | CLOSED |
| T-23-37 | Tampering | M | job vecchi no-op, nuovi schedulati dopo il commit | `ambush-resolution.service.ts` `moveTravelJobs` (`cancel` + `schedule` + `scheduleAmbush`); `ambush.updates.ts` `ambushFilter`; spec `ambush-on-foot.int-spec.ts:281,372,399` | CLOSED |
| T-23-38 | Tampering | M | cibo non mangiato due volte | `ambush-on-foot.ts` `onFootFoodOf` (piano nuovo sulla strada residua); spec `ambush-on-foot.int-spec.ts:349` | CLOSED |
| T-23-39 | Repudiation | M | rimappa per km senza tiri | `ambush-on-foot.ts` `remappedNextOf` (calcolo puro, nessun `chance`); specs `ambush-on-foot.spec.ts` | CLOSED |
| T-23-40 | Tampering | M | corsia abbandonata anche con deviazione | `ambush-resolution.service.ts:499` `if (battle.verdict === 'failure' \|\| plan.redirected) abandonLane(…, session)`; spec `ambush-on-foot.int-spec.ts:427` | CLOSED |
| T-23-41 | DoS | M | controllo `arrivesAlive` dopo il ricalcolo | `ambush-plan.ts:537` `!meal.plan.arrivesAlive`; `travel.service.ts:160`; spec `ambush-on-foot.int-spec.ts:427,468` | CLOSED |
| T-23-42 | Info disclosure | M | record della bozza senza `@Field`, nessun handler nuovo | `guided-mission.resolver.ts:47-110` ogni handler `@Roles(RoleType.innkeeper)`; `MissionCompanion` esposto solo nella bozza dell'oste (`schema.gql`) | CLOSED |
| T-23-43 | Tampering | M | la simulazione non scrive sul personaggio | spec `mission-simulation.service.int-spec.ts:464` | CLOSED |
| T-23-44 | Tampering | M | `OUTCOME_OVERRIDE_INVALID` fuori `1..max` o senza compagno | `src/quests/outcomes/gm-overrides.ts` `companionLifeAfterOf` (`Number.isSafeInteger`, `COMPANION_LIFE_FLOOR`, `companion.maxLifePoints`, partecipante senza compagno → errore); `complete-pending-request.model.ts` `@IsInt @Min(0)`; spec `gm-overrides.spec.ts:495,524,538` | CLOSED |
| T-23-45 | EoP | A | handler dell'oste invariati | registro R-7; verificato: `saveMissionDraft`, `simulateMissionFight` con `@Roles(innkeeper)` + `@AuditTarget` (`guided-mission.resolver.ts:61-110`), `pending-requests.resolver.ts:25,32,46` | CLOSED |
| T-23-46 | Tampering (contratto) | M | diff di `schema.gql` atteso | `git diff` di `src/schema.gql`: solo i tipi/campi attesi (`CompanionOutcome`, `MissionCompanion`, `OwnedPet.*`, `renamePet`, `useItem(petId)`, `RenamePetRequest`, `Pet.recoveryTime`, `PushEventType`, `onFoot`, `companionLifeAfter`); nessun campo interno; pinnato in `test/app.int-spec.ts` | CLOSED |
| T-23-47 | EoP | M | `renamePet` nelle due liste, matrice | `test/authz/expected-handlers.ts`, `handler-fixtures.ts`, `authorization-matrix.int-spec.ts:292-293` | CLOSED |
| T-23-48 | Info disclosure | M | niente `.env`, URI, `process.env.`, campi interni | `git diff d4e3adad..HEAD --name-only` fuori da `src`/`test`/`.planning`: vuoto; nessun file `.env*`, `content/`, seed o migratore; grep sul diff `src`+`test` di `process.env`, `mongodb://`, chiavi: nessun risultato | CLOSED |
| T-23-49 | Info disclosure | M | `BACKEND-NOTES.md` senza URI/valori reali | grep su URI, host, chiavi: nessun risultato; nessun operatore Mongo fuori dai code span | CLOSED |
| T-23-50 | Tampering (processo) | M / T | gate prima di `mark-complete`; semina tabella fuori repo | nessuno script di semina né file di contenuto nel diff; la tabella dei tempi vive solo a DB (D-25) e il reporter di boot segnala il solo conteggio; la parte «transfer» (semina dell'orchestratore) è per costruzione fuori dal repo | CLOSED |

## Registro dei rischi accettati

| ID | Minaccia | Motivo |
|----|----------|--------|
| R-1 | T-23-07 | I campi nuovi vivono sotto `character`, già protetto dall'ownership esistente; nessun handler nuovo di lettura. |
| R-2 | T-23-10 | `equipPet`/`unequipPet` mantengono `@OwnsCharacter` senza `ownerOnly` (oste ammesso, C1 di Phase 15): scelta di prodotto preesistente. |
| R-3 | T-23-15 | `questResult` è owner-only; il nome del compagno è dato del giocatore stesso. |
| R-4 | T-23-24 | D-31: nessun filtro di parole sul nome del compagno, come per il personaggio; visibile solo al proprietario e nelle sue push. |
| R-5 | T-23-30 | `unacknowledgedQuestResults`, `questResult`, `acknowledgeQuestResult` sono già nelle liste owner-only. |
| R-6 | T-23-34 | Il nome nel testo della push va ai soli dispositivi del proprietario. |
| R-7 | T-23-45 | Nessun handler nuovo; le mutation del flusso guidato restano `@Roles(innkeeper)` come in Phase 22. |

## Verifiche trasversali richieste (nessuna anomalia)

- **Ownership di `useItem`**: l'identità arriva dal bearer, `petId` vale solo fra le `ownedPets` del `currentCharacter`; un compagno di un altro personaggio dà `PET_NOT_OWNED` senza scritture (`use-item.int-spec.ts:807`). Nessun id di personaggio è accettato dal client.
- **`equipPet`/`unequipPet`/`renamePet`**: `petId` inesistente nelle voci → `PET_NOT_OWNED`; lo sconfitto non entra nello slot; `renamePet` rifiuta oste e terzi.
- **Campi interni sul filo**: `defeatedUntil` e `activeTravel.mount` assenti da `src/schema.gql` (0 occorrenze). `OwnedPet.lifeAsOf`/`potionRecoveryUntil` sono esposti per scelta ma sono date del proprietario, non segreti.
- **Input**: `RenamePetRequest` valida forma e lunghezza sul filo e le regole del nome nel dominio; `name` omesso è `BAD_USER_INPUT`, `null` esplicito cancella. `companionLifeAfter` è `Int` GraphQL, `@IsInt @Min(0)`, poi `isSafeInteger` e intervallo `1..max`, rifiutato senza compagno. Gli id sono stringhe esadecimali validate prima di entrare in un filtro Mongo, quindi nessun oggetto-operatore può arrivare a una query dal client.
- **Nome nei testi e nei log**: il nome passa dalle regole del personaggio (lettere, spazi, apostrofi, trattini) prima di essere scritto, perciò non porta markup né caratteri di controllo nel corpo della push. I log contengono id, conteggi e codici; nessun nome compagno né utente. `wonMessageOf` e `afterDefeat` registrano il nome della città di catalogo, non dati personali.
- **`extensions`**: `recoveryUntil` solo per i due codici dell'insieme e solo come istante ISO.
- **Race e doppia spesa**: pozione guardata con `$elemMatch` sui valori letti dentro una transazione; equip/rinomina in transazione con guardia sullo slot letto; claim dello sweeper per voce con `arrayFilters` e push solo con `modifiedCount === 1`; push dell'imboscata dopo il commit e una sola volta su replay (`ambush-resolution.int-spec.ts:734`).
- **Abuso dell'economia**: livello e xp non sono mai input (derivati dal catalogo e dall'esito del motore); la vita è sempre limitata a `[1, max del livello]`; equip/unequip ripetuti non guadagnano vita (la ricostruzione arrotonda e riparte da `now`); pozione senza effetto → `ITEM_NO_EFFECT` senza consumo; rinomina cosmetica (D-31) che riscrive solo la voce scelta, senza toccare slot, ancora o sconfitta, e non influenza i lucchetti della missione.
- **Handler dell'oste**: tutti `@Roles(RoleType.innkeeper)`, le mutation con `@AuditTarget`.
- **Configurazione**: nessun `process.env.` aggiunto, nessuna variabile d'ambiente nuova (lo sweeper usa `QUEST_CONFIG`), nessun segreto o file di contenuto nel repo.

## Rilievi non registrati

Nessun rilievo alto o medio.

| ID | Severità | Rilievo | Raccomandazione |
|----|----------|---------|-----------------|
| U-01 | Bassa | Un pet di catalogo senza `recoveryTime` valido (non ancora curato a DB) viene tolto dallo slot quando cade, ma `defeatedUntilOf` dà `null`: nessun marcatore e recupero istantaneo. È dichiarato (D-25) e il reporter di boot ne conta i casi; finché la tabella non è seminata la sconfitta non costa nulla. | Seminare la tabella prima del rilascio; tenere il conteggio del reporter come criterio di uscita. |
| U-02 | Bassa | `ResolutionLoader.readPetCatalog()` legge tutta la collection dei pet a ogni salvataggio di bozza (`find({})` con proiezione). Raggiungibile solo dall'oste, stesso schema già usato da `readCombatPets`. | Cache o lettura per id dei soli compagni dei partecipanti, se il catalogo cresce. |
| U-03 | Info | `renamePet` e `useItem` non hanno `@AuditTarget` né limite di frequenza dedicato. Sono azioni del proprietario sul proprio personaggio, coerenti con le altre mutation di gioco. | Nessuna azione. |
| U-04 | Info | `equipPet`/`unequipPet` restano senza `ownerOnly` (oste ammesso, C1): non è un'inversione di Phase 23, ma ora l'oste può togliere/mettere un compagno anche a vita non intera. | Confermare che sia voluto; già nel registro R-2. |
| U-05 | Info | `nameOf` in `normalisedEntry` accetta qualsiasi stringa non vuota già a DB: la validazione del nome avviene solo in `renamePet`. Il nome finisce nel corpo di una push solo per quel DB, quindi un valore scritto fuori dall'API (script, import) non passerebbe dalle regole del personaggio. | Nessuna azione finché il DB resta scritto solo dal BE; da ricordare se arrivano import di dati. |
| U-06 | Info | La guardia `slotFilterOf` copre solo `assets.pet`, mentre `equip`/`rename` riscrivono l'intero `assets.ownedPets`. La correttezza regge sulla transazione (WriteConflict e retry del driver, snapshot in sessione). I writer di `ownedPets` fuori da queste transazioni (`economy/trade/trade-pets.ts`, premi) non sono stati riauditati in dettaglio. | Mantenere la regola «ogni scrittura di `ownedPets` in transazione»; già coperta dai test di concorrenza esistenti. |

## Conteggi

- Minacce totali: 50. Mitigate e verificate nel codice: 43 (incluse T-23-50). Accettate con voce nel registro: 7. Aperte: 0.
- Rilievi non registrati: alti 0, medi 0, bassi 2, informativi 4.
- Verdetto: **SECURED** a ASVS L1, nessun blocco sugli alti.
