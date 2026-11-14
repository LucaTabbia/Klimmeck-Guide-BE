---
phase: 23-sconfitta-riposo-recupero-compagni
verified: 2026-11-14
status: passed_with_gaps
score: 14/14 requisiti verificati sul codice; 1 gap LOW (copertura di un contratto), 0 bloccanti
re_verification: no
head: 1175b84d (src invariato da ff2b5f3c: dopo quel commit solo documenti)
method: lettura statica del codice FINALE e delle spec; nessun jest, nessuna build, nessun avvio, nessun .env
gaps:
  - truth: "Contratto delle correzioni dell'oste (A-08, BACKEND-NOTES §2 g): un partecipante corretto che omette `companionLifeAfter` vale vita d'inizio scontro, non il simulato"
    status: partial
    reason: "Il comportamento è coerente con `hpAfter` ed è documentato, ma nessuna spec lo fissa: la FE si appoggia a un contratto che oggi può cambiare senza far fallire un test"
    severity: LOW
    artifacts:
      - path: "src/quests/outcomes/gm-overrides.ts"
        issue: "righe 121-137 (`companionLifeAfterOf`): chiave assente o null restituisce `{}` senza alcun test sul caso"
      - path: "src/quests/outcomes/gm-overrides.spec.ts"
        issue: "il blocco 'the companion life correction' (riga 444 in poi) copre intervallo, limiti del livello e rifiuti, mai il caso di omissione"
    missing:
      - "una spec unitaria in `gm-overrides.spec.ts`: override senza `companionLifeAfter` su un partecipante con compagno → l'effetto non porta la chiave (vita d'inizio scontro)"
      - "(facoltativo) un caso in `guided-completion.service.int-spec.ts`: sconfitta simulata + correzione che tocca solo `hpAfter` → il compagno risulta NON sconfitto (comportamento atteso e documentato)"
deferred_to_uat: vedi sezione «Differito alla UAT con la FE»
---

# Phase 23: Sconfitta, riposo e recupero dei compagni — Rapporto di verifica

**Obiettivo della fase (ROADMAP §Phase 23):** i compagni equipaggiati possono essere sconfitti, messi a riposo e curati, con il BE come unica fonte di verità.
**Verificato:** 2026-11-14 · **Stato:** `passed_with_gaps` · **Ri-verifica:** no (prima verifica)

Verdetto in una riga: l'obiettivo è raggiunto. Le regole dell'utente (D-01..D-22) sono realizzate alla lettera dal codice, ogni regola ha una spec che la prova, il cablaggio è reale, lo SDL è additivo e il handoff descrive il codice finale. Resta un solo gap di copertura (LOW) e nessuna difformità funzionale.

Nota di metodo: i SUMMARY non sono stati presi per buoni. Ogni riga sotto cita il codice e la spec letti direttamente. Le suite non sono state rilanciate (l'orchestratore sta eseguendo `test:cov`); i numeri dei gate sono quelli dichiarati nel handoff e nel 23-REVIEW-FIX, qui non riprodotti.

## Verifica goal-backward: verità osservabili

| # | Verità (regola dell'utente / decisione) | Stato | Codice | Spec che la prova |
|---|------------------------------------------|-------|--------|-------------------|
| 1 | Minimo 1, il compagno non muore mai (D-03) | VERIFICATO | `src/characters/pets/companion-life.ts:5` (`COMPANION_LIFE_FLOOR`), `:45-53` (`companionLifeNow`, minimo 1 senza massimo, tetto al massimo); `src/quests/outcomes/pets/companion-after-fight.ts:183-187` (clamp `[1, max]`); `src/quests/outcomes/combat/placeholder-combat-resolver.ts:101-113` (mai sotto 1); `src/quests/outcomes/gm-overrides.ts:132-133` (correzione 1..max) | `companion-life.spec.ts:50,74,83`; `companion-after-fight.spec.ts`; `placeholder-combat-resolver.spec.ts`; `gm-overrides.spec.ts:486-520` |
| 2 | Sconfitto = vita 1 a fine scontro, anche se entrato a 1; fuori dallo slot a fine scontro (D-02, D-26) | VERIFICATO | `companion-after-fight.ts:188` (`defeated = lifeAfter === FLOOR`), `:207` (`unequip: defeated`); `outcome-plan.ts:388-401` (`companionSlotSet` svuota `assets.pet`, guardia sullo slot letto); stessa regola in `unrewarded-plan.ts:89-117` e `ambush-plan.ts:233,262,332` | `quests/outcomes/companion-defeat.int-spec.ts`, `companion-defeat-rescue.int-spec.ts` (14 casi: quest, boss, dungeon, soccorso, guardia vinta e persa, arresto, sconfitta senza aid, GM legacy) |
| 3 | Riequipaggiabile solo a vita piena: `PET_DEFEATED` finché la data è futura (D-02) | VERIFICATO | `equip-pet.plan.ts:140` (`isPetDefeated(chosen, now)` → `petDefeated`), `companion-life.ts:83-91` (predicato unico sulla data `defeatedUntil`), mai lo sweeper | `equip-pet.int-spec.ts:329` (rifiuto e nessuna scrittura), `:347` (equip dopo la data con vita 100) |
| 4 | Recupero lineare, solo fuori dallo slot; 100 minuti da 1 a 100; 20 → 40 in 20 minuti (D-04, D-24) | VERIFICATO | `companion-life.ts:55-73`: velocità `(max-1)/T`, `Math.round`, `fullLifeAt = asOf + ceil((max-life)·T/(max-1))`; l'equipaggiato è `resting:false` → vita ferma (`:58`); da 1 a max esattamente in `T` (`:62-68`). Conti rifatti a mano: 20 punti, 20 min su T=100 min → `round(20·99/100)=20` → 40 | `companion-life.spec.ts:33-48` (esempio dell'utente e T esatto), `:59` (equipaggiato mai), `equip-pet.int-spec.ts:374` (20 → 40 via equip), `:392,418` (uscente a riposo dall'istante dello scambio) |
| 5 | Attesa della pozione per singolo compagno, indipendente dal personaggio nei due sensi (D-05) | VERIFICATO | `item-use.plan.ts:394-436` (`planPetPotion`): scrive solo `assets.ownedPets` e `assets.ownedItems`, non legge né scrive `status.potionRecoveryUntil`; guardia concorrente `companionGuardOf` `:370-390` | `use-item.int-spec.ts` (describe 'on a companion', riga 617), `item-use.plan.spec.ts` |
| 6 | Sconfitto rifiuta le pozioni; bersagli equipaggiati o a riposo (D-06, D-07) | VERIFICATO | `item-use.plan.ts:331-335` (`refuseUnfitCompanion`: `PET_DEFEATED`, poi `PET_POTION_RECOVERING`), `:343-361` (`resting = !sameId(slot, petId)`, vita di adesso, cura `Math.floor`, `ITEM_NO_EFFECT` a vita piena) | `use-item.int-spec.ts` (PET_DEFEATED senza consumo, data ISO, equipaggiato e a riposo, due bevute concorrenti) |
| 7 | Push solo per lo sconfitto tornato in forze, una sola, dopo il claim (D-11) | VERIFICATO | `pet-recovery.ts:18-46` (filtro `$lte` sulla sola data della sconfitta, claim con `arrayFilters`), `pet-recovery.service.ts:50-72` (letture prima dei claim, push solo se `modifiedCount === 1`), nessun marcatore per il ferito a riposo | `pet-recovery.int-spec.ts:130,177,192,207,258,274,293` |
| 8 | Dungeon: sconfitto fuori dalle tappe seguenti, slot svuotato a fine missione (D-12) | VERIFICATO | `placeholder-dungeon-resolver.ts:63-72` (`companionAfterStage` → `null` a vita ≤ 1), `combat-resolver.ts:98-105` (`lastCompanionLifeOf` conserva la sconfitta), `companionSlotSet` a fine missione | `placeholder-dungeon-resolver.spec.ts`, `companion-defeat.int-spec.ts` (dungeon a tappe), `mission-simulation.service.int-spec.ts:439` (scontri guidati in sequenza) |
| 9 | Strada residua a piedi dopo cavalcatura sconfitta in imboscata vinta (D-13) | VERIFICATO | `ambush-on-foot.ts:55-88` (solo la cavalcatura fotografata alla partenza; strada dal punto, `startTime = at`, durata × fattore × ferite nuove, prossima imboscata rimappata per km senza tiri); `ambush-plan.ts:502-572` (`onFootPlanOf`); `travel-planner.service.ts:226-247` + `travel-timing.ts:55-62` (`mount` scritto alla partenza solo con fattore > 1) | `ambush-on-foot.spec.ts`, `ambush-on-foot.int-spec.ts` |
| 10 | Push per OGNI imboscata, vinta o persa; `ambushDefeat` non parte più (D-14, D-30) | VERIFICATO | `ambush-resolution.service.ts:536-552,600-632` (`deliverAndNotify` → `notifyAmbush` sia in vittoria sia in `afterDefeat`, id = id del `QuestResult`); nessun chiamante di `ambushDefeat` fuori dal catalogo (`grep` su `src`, solo `push-events.ts:34,70`) | `ambush-push.spec.ts`, `ambush-resolution.int-spec.ts` |
| 11 | Report leggibili a viaggio in corso (D-15, D-28) | VERIFICATO | `ambush-resolution.service.ts:~507-516`: `writer.writeResult(ambushResultDraftsOf(...))` nella stessa transazione, all'istante dell'imboscata; `ambush-results.ts:50,112` porta `companion`; `acknowledgedAt` = «visto» | `ambush-resolution.int-spec.ts` (risultato a viaggio in corso, nascosto dopo la conferma, nessun risultato da risoluzione stantia) |
| 12 | Ridirezionamento per fame alla città più vicina per strada, quest abbandonata (D-16) | VERIFICATO | `ambush-plan.ts:539-542` (ridirige solo se `detour.baseHours != null` e `!arrivesAlive`), `:405-420` (`redirectPlanOf`, `reachedCity` valorizzato), `ambush-resolution.service.ts:~500-503` (`abandonLane` per `failure || redirected`); ripiego senza città raggiungibile = nessun ridirezionamento (B-05) | `ambush-on-foot.int-spec.ts` (describe 'the hunger redirection (Phase 23)'), `ambush-plan.spec.ts` |
| 13 | Proposta e correzione dell'oste (D-17) | VERIFICATO | `fight-state.ts:171` (proposta `companionLifeAfter` per partecipante e per scontro), `gm-overrides.ts:121-137` (correzione 1..max, `OUTCOME_OVERRIDE_INVALID` fuori intervallo o senza compagno), `guided-outcome.ts:60-103` (completamento con le stesse regole), legacy `completePendingRequest` accetta la chiave | `mission-simulation.service.int-spec.ts:414,439,464`, `mission-draft-save.service.int-spec.ts:516,534`, `guided-completion.service.int-spec.ts:827,871,906,927`, `gm-completion.service.int-spec.ts:984` |
| 14 | Nome con le regole di forma del personaggio, `PET_NAME_INVALID`, `null` toglie, omesso rifiutato; owner-only; non bloccato dalla missione (D-18..D-21, D-31) | VERIFICATO | `pet-name.ts:8-13` (stessa `isValidCharacterName`/`normalizeCharacterName`, nessun filtro di parole), `rename-pet-request.model.ts:17-22` (`@ValidateIf(name !== null)`: omesso → `BAD_USER_INPUT`), `characters.resolver.ts:92-102` (`ownerOnly: true`), `characters.service.ts:267-280` (nessun `missionLock`); il nome entra in `CompanionOutcome.name`, `MissionCompanion.name`, push (`companionDisplayName`) | `rename-pet.int-spec.ts:158-360`, `pet-name.spec.ts`, `test/authz/expected-handlers.ts:31,47` |
| 15 | Livelli: 10 livelli sul tetto di xp, vita dalla base al doppio, livello SALVATO a DB (D-37..D-39) | VERIFICATO | `companion-level.ts:31-37,56-64` (soglie `round(maxXp·t/45)`, vita `round(base·(1+t/45))`; tabella ricalcolata a mano per base 100 e tetto 100: soglie 0,2,7,13,22,33,47,62,80,100; vite 100…200; Pegaso 5900 → 11800); `owned-pet.model.ts:42-43` (`level` salvato, `min 1`, `max COMPANION_LEVELS`); `owned-pet-entry.ts:93-102` (nascita a livello 1); `companion-after-fight.ts:105-111,189-192` (livello riscritto a ogni cambio di xp, massimo riletto dopo l'xp); `owned-pet-entry.ts:66-76` (`level` conservato a ogni riscrittura dell'array) | `companion-level.spec.ts`, `owned-pet-fields.int-spec.ts`, `owned-pet-state.int-spec.ts`, `companion-defeat.int-spec.ts` (livello alzato a vita invariata) |

**Punteggio:** 15/15 verità verificate (le prime due colonne coprono i requisiti sotto).

## Requisiti BE-PET-01..14

| Requisito | Verdetto | Evidenza principale (file:riga) |
|-----------|----------|---------------------------------|
| BE-PET-01 orologio lineare pigro, predicato unico, campi conservati, nessun migratore | SODDISFATTO | `companion-life.ts:55-91`; `owned-pet-entry.ts:56-76` (campi nuovi conservati); `owned-pet-fields.int-spec.ts`; nessun migratore o seeder nel repo (`git diff --stat` solo `src`, `test`, `.planning`) |
| BE-PET-02 `Pet.recoveryTime` e stato su `OwnedPet` | SODDISFATTO | `models/pet.model.ts:~70-84` (nullable, `max MAX_RECOVERY_VALUE`); `owned-pet.model.ts:20-48`; `owned-pet.resolver.ts:24-56`; `pet-recovery-catalog.reporter.ts:23-39` (WARN col solo conteggio, mai blocca il boot) |
| BE-PET-03 equip/unequip in transazione, `PET_DEFEATED` | SODDISFATTO | `characters.service.ts:~229-320` (`writePetSlot` in `connection.transaction`, guardia sullo slot letto); `equip-pet.plan.ts:135-168` |
| BE-PET-04 porta estesa, segnaposto senza tiri nuovi, sequenze | SODDISFATTO | `combat-resolver.ts:98-105`; `placeholder-combat-resolver.ts:101-113,156` (nessun `chance.next()` aggiunto); `placeholder-dungeon-resolver.ts:63-72` |
| BE-PET-05 regola della sconfitta su tutti i percorsi, `QuestResult.companion` | SODDISFATTO | tre soli punti d'ingresso, `companionAfterFight` da `outcome-plan.ts:504`, `unrewarded-plan.ts:89`, `ambush-plan.ts:233`; `outcome-plan.ts:615` e `unrewarded-plan.ts:152` scrivono `companion` nel risultato |
| BE-PET-06 pozione sul compagno | SODDISFATTO | `item-use.plan.ts:394-446`; ordine dei rifiuti identico a BACKEND-NOTES §3; `format-domain-error.ts:84-90` (`recoveryUntil` solo per i due codici, solo ISO) |
| BE-PET-07 `renamePet` | SODDISFATTO | vedi verità 14 |
| BE-PET-08 push `petRecovered` con sweeper e claim atomico | SODDISFATTO | `pet-recovery.sweeper.ts:44-68` (single-flight, reconciler al boot, `unref`), `pet-recovery.service.ts:50-72`, `push-events.ts:119-126`; registrazione in `quest-outcomes.module.ts:121-122`; indice `character.model.ts:121-124` |
| BE-PET-09 imboscate: risultato all'istante, push per ognuna | SODDISFATTO | verità 10 e 11 |
| BE-PET-10 cavalcatura della partenza a piedi | SODDISFATTO | verità 9; `mount` senza `@Field` (`active-travel.model.ts:94-96`), `defeatedUntil` senza `@Field` (`owned-pet.model.ts:36-37`) |
| BE-PET-11 ridirezionamento e deviazione a piedi | SODDISFATTO | verità 12; `ambush-plan.ts:370-390` (deviazione a passo di marcia se il compagno è caduto) |
| BE-PET-12 flusso guidato | SODDISFATTO | verità 13; `mission-draft.wire.ts:54-101` |
| BE-PET-13 gate e handoff | SODDISFATTO | `BACKEND-NOTES.md` 356 righe, scritto dopo la review e verificato sul codice (sotto); il boot reale e `test:cov` restano all'orchestratore |
| BE-PET-14 livelli del compagno | SODDISFATTO | verità 15; ogni lettura del massimo passa da `companionMaxLifeOf`: `onTheWire` (`owned-pets.mapper.ts:40-41`), resolver, `equip-pet.plan.ts:85-92`, `item-use.plan.ts:349`, `combat-context.ts:211`, `gm-overrides.ts:66`, `companion-after-fight.ts:174,192`; letture dirette di `Pet.maxLifePoints` rimaste solo dove nasce una voce a livello 1 (premio, acquisto) |

Requisiti orfani: nessuno (14 su 14 dichiarati dai piani e mappati a Phase 23 in REQUIREMENTS.md).

## Cablaggio reale

| Elemento | Verdetto | Evidenza |
|----------|----------|----------|
| `PetRecoverySweeper` e `PetRecoveryService` registrati e avviati al boot | OK | `quests/outcomes/quest-outcomes.module.ts:121-122` (`PushModule` e il modello `Pet`/`User`/`Character` importati nello stesso modulo, righe 70-90); `pet-recovery.sweeper.ts:44-52` (`OnApplicationBootstrap`: timer da `sweepIntervalMs`, default 60 000 ms in `config/sweep-interval.ts:1`, e sweep al boot) |
| `OwnedPetResolver` nello schema | OK | `characters/characters.module.ts:54` (provider); i campi calcolati `defeated`, `fullLifeAt`, `level`, `maxLifePoints` sono `@ResolveField` e compaiono nello SDL |
| `PetRecoveryCatalogReporter` | OK | `characters.module.ts:58` |
| `renamePet` nelle liste di autorizzazione | OK | `test/authz/expected-handlers.ts:31` (ownership) e `:47` (owner-only), `test/authz/handler-fixtures.ts:239` |
| Indice dello sweeper | OK | `models/character/character.model.ts:121-124` (`deletedAt` + `assets.ownedPets.defeatedUntil`), pinnato in `src/models/sweep-indexes.schema.spec.ts:62` |
| Moduli orfani / nuovi file mai importati | nessuno | tutti i file nuovi di `src/characters/pets/` sono importati da codice di produzione (verificato per `companion-life`, `companion-level`, `pet-recovery*`, `owned-pet*`, `pet-name`, `equip-pet.plan`) |
| Nessuna variabile d'ambiente nuova, nessun `Date.now`/`Math.random`/`new Date()` nel codice della fase | OK | `grep` su `src/characters/pets`, `src/quests/outcomes/pets`, `src/travel/ambush`, `src/push`: nessuna occorrenza fuori dalle spec |

## SDL rispetto a `2c462cbe`

`git diff 2c462cbe -- src/schema.gql`: **36 righe aggiunte, 1 tolta**; la riga tolta è `useItem(itemId: ID!): UseItemResult!`, sostituita da `useItem(itemId: ID!, petId: ID): UseItemResult!` (argomento opzionale, le chiamate di oggi restano valide). Tutte le aggiunte coincidono con il contratto di BACKEND-NOTES §1: `CompanionOutcome`, `MissionCompanion`, `RenamePetRequest`, `AmbushReport.onFoot`, `MissionFightEffects.companionLifeAfter`, `MissionFightOutcome.companion`, `Mutation.renamePet`, sette campi di `OwnedPet`, `ParticipantOverrideInput.companionLifeAfter`, `Pet.recoveryTime`, `PushEventType.ambush` e `petRecovered`, `QuestResult.companion`. Nessun campo nuovo contiene `kind`; `OwnedPet.defeatedUntil` e `ActiveTravel.mount` non arrivano sul filo. **Additivo: confermato.**

## Handoff BACKEND-NOTES.md: affermazioni campionate sul codice finale

`git log ff2b5f3c..HEAD` tocca solo documenti: il handoff descrive il codice finale. Dieci affermazioni controllate:

| # | Affermazione del handoff | Esito | Dove |
|---|--------------------------|-------|------|
| 1 | Ordine dei rifiuti di `useItem(itemId, petId)`: `AWAITING_AID` → `MISSION_IN_PROGRESS` → `ITEM_NOT_OWNED` → `ITEM_NOT_USABLE` → `PET_NOT_OWNED` → `PET_DEFEATED` → `PET_POTION_RECOVERING` → `ITEM_NO_EFFECT` | corretta | `item-use.plan.ts:~422-432` e `:331-361` |
| 2 | `renamePet`: `BAD_USER_INPUT` → `FORBIDDEN` → `PET_NAME_INVALID` → `NOT_FOUND`/`PET_NOT_OWNED`, mai `MISSION_IN_PROGRESS`; nome omesso rifiutato | corretta | `rename-pet-request.model.ts:17-22`, `characters.resolver.ts:92-102`, `characters.service.ts:267-280` |
| 3 | Cura arrotondata per difetto come il personaggio (A-01) | corretta | `item-use.plan.ts:352` (`Math.floor(lifePoints + power)`) |
| 4 | Un'ancora nel futuro tiene la vita dell'ancora (A-02) | corretta | `companion-life.ts:69-71` (`Math.max(0, now - asOf)`) |
| 5 | Soglie `0,2,7,13,22,33,47,62,80,100` e vite `100…200` per base 100 / tetto 100; dal livello 2 almeno 1 xp | corretta | `companion-level.ts:31-37,56-64`, ricalcolo a mano |
| 6 | `fullLifeAt = lifeAsOf + ceil((max − vita) × T / (max − 1))`, `lifeAsOf` e `fullLifeAt` non nulli solo a riposo sotto il pieno | corretta | `companion-life.ts:64-66`, `owned-pets.mapper.ts:40-58` |
| 7 | Testi delle push `ambush` (vinta, compagno caduto + «prosegui a piedi», fame, persa) e `petRecovered` (titolo «Di nuovo in forze», corpo `<nome> è di nuovo in forze`) | corretta, parola per parola | `ambush-push.ts:47-67`, `push-events.ts:119-126` |
| 8 | Messaggi dei tre codici nuovi e `recoveryUntil` solo per `PET_POTION_RECOVERING` (e `POTION_RECOVERING`) | corretta | `game-rule.exception.ts:327-349`, `format-domain-error.ts:84-90` |
| 9 | Ritardo massimo della push 60 s, reconciler sempre al boot, claim con `arrayFilters` e una push per sconfitta | corretta | `pet-recovery.sweeper.ts:44-52`, `config/sweep-interval.ts:1`, `pet-recovery.ts:24-46` |
| 10 | Correzione dell'oste = sostituzione completa degli effetti; `hpAfter` e `companionLifeAfter` omessi valgono la vita d'inizio scontro | corretta sul codice | `gm-overrides.ts:~108-137` (nessuna spec la fissa: vedi il gap) |
| 11 | `mount` scritto alla partenza solo con fattore > 1; sconfitta: `onFoot` solo se cade una cavalcatura; nessun ridirezionamento senza città per strada; ferite nuove allungano la strada a piedi | corretta | `travel-timing.ts:55-62`, `ambush-plan.ts:~455-470` (`mountFallenInDefeat`), `:539-542`, `:344-352` |

Nessuna affermazione campionata è risultata falsa o superata dalla review. I fix (A-01..A-07, A-09, B-01..B-08) risultano tutti nel codice; i 24 hash citati in 23-REVIEW-FIX esistono nel ramo; nessun commit del ramo porta trailer `Co-Authored-By` o `Generated with`.

## Qualità dei test (campione)

Scansione di tutti i 73 file di spec toccati dalla fase (1 282 casi): nessun caso senza asserzione reale. I 49 «senza `expect`» segnalati dallo script sono helper (`expectRefusedWithoutWriting`, `expectNoAward`, `expectGameRule`, …) e casi preesistenti; letti a campione, asseriscono. I tre «solo asserzioni deboli» sono `not.toHaveBeenCalled` legittimi (nessun timer a intervallo 0, nessun WARN con catalogo completo) e controlli di validazione di schema.

Letti a fondo i casi che portano le regole dell'utente. Solidi: il caso 20 → 40 verifica l'esatto `toEqual` su `{ lifePoints: 40, fullLifeAt }` e l'esatto contenuto della voce a DB dopo l'equip (`equip-pet.int-spec.ts:374-390`); il rifiuto `PET_DEFEATED` prova «nessuna scrittura» con `toEqual` sul documento grezzo (`:329-345`); la push «in forze» asserisce l'intero `world.push.sent` e l'array `ownedPets` risultante (`pet-recovery.int-spec.ts:225-243`); i casi di B-01 sono deterministici (trasporto FCM che non risponde, nessuno sleep).

Pin cambiati dal fixer (richiesti dall'utente):

- **B-07** (`ambush-plan.spec.ts:1092`, `:1141`): `travelAfter.rewritten` da `false` a `true` sulla sconfitta. Cambio di comportamento genuino (la sconfitta ora passa da `moveTravelJobs`), non indebolimento; il comportamento osservabile (job vecchio rimosso, nuovo accodato) è coperto da `ambush-resolution.int-spec.ts:136`. Il pin sul campo interno resta un po' legato all'implementazione: INFO.
- **B-06** (`ambush-plan.spec.ts:1148`): le asserzioni su `onFootFood` (campo morto) sono state tolte e sostituite con il controllo del piano del cibo scritto sulla camminata. Il nuovo caso confronta con `foodPlanOf(walkFoodOf(...))`, cioè con la stessa funzione di produzione (test a specchio, e `arrivesAlive` letto dall'helper, non dall'esito). Il comportamento che conta (ridirige solo se non arriva vivo) è coperto altrove (`ambush-on-foot.int-spec.ts`, describe 'the hunger redirection'). Indebolimento lieve, non un gap: INFO.

Resta un solo contratto non coperto da spec (gap G-1 nel frontmatter).

## Rinvii e domande aperte: sono sicuri da lasciare alla UAT?

| Rinvio | Giudizio | Motivo |
|--------|----------|--------|
| **A-08** contratto delle correzioni (omesso = vita d'inizio scontro) | Sicuro, con una cautela | La FE 22-15 costruisce la correzione copiando il valore simulato (`companionLifeAfter` copiato dagli effetti e mandato solo se non nullo, `22-15-PLAN.md` righe 22 e 50), quindi non omette mai la chiave quando c'è un compagno. Il comportamento è coerente con `hpAfter` e documentato (BACKEND-NOTES §0.9 e §2 g). Cautela: aggiungere la spec che lo fissa (gap G-1) e verificare in UAT il passo 8 col caso «correggo l'eroe senza toccare il compagno». |
| **A-10** sweeper senza paginazione | Sicuro | Un solo canale, pochi personaggi. Il rischio descritto (voce con riferimento illeggibile e data scaduta che riseleziona il personaggio a ogni tick) costa una `find` e una `findOne` al minuto, senza scritture né push (`duePetsOf` salta la voce, `release` esce con `due.length === 0`). Stesso limite dello sweeper della prigione. |
| **B-08 (b)** seconda imboscata già scaduta risolta dallo sweeper prima del riallineamento della prima | Sicuro | Non pilotabile senza timer; le finestre vicine sono coperte (job vecchi → `stale`, WriteConflict con una sola push) e i filtri d'identità (`startTime`) rendono ogni job fuori sequenza un no-op. Nessuna doppia scrittura possibile per costruzione. |
| **B-09** pedina che salta indietro se l'imboscata si risolve in ritardo | Sicuro come limite noto | È la conseguenza voluta di D-13 (`startTime` = istante dell'imboscata); solo estetico, nessun dato errato. Da osservare in UAT (passo 6). |
| **Domanda: xp del compagno nel dungeon** (il sconfitto alla prima tappa prende comunque l'xp di tutte le tappe: `outcome-plan.ts:428,504-510` passa `enemiesXp` totale a `companionAfterFight`, `companion-after-fight.ts:189`) | Sicuro da lasciare, ma è una decisione dell'utente | Non viola D-12 (che riguarda gli scontri, non l'xp) e può alzare di livello un compagno sconfitto presto. Se l'utente vuole «xp solo per le tappe combattute» serve un cambio piccolo e isolato: è una decisione di gioco, non un difetto. |
| **Domanda: `AmbushReport.onFoot` e testi delle push** | Sicuro | Default vetabili, solo testi e una riga della FE. |
| **A-05** push «in forze» anche per un compagno già riequipaggiato | Sicuro | Ruling D-11 e spec che lo fissa; al peggio una notifica di troppo entro 60 s dalla scadenza. In più, dopo un fermo prolungato del BE il reconciler al boot può mandare push «in forze» arretrate: atteso, stesso precedente della prigione. |

## Anti-pattern

Nessun TODO/FIXME/segnaposto nei file della fase; nessun ritorno vuoto che raggiunga l'utente; nessun `Date.now`/`Math.random`; log con soli id, conteggi e codici (`describeError`). I segnaposto di combattimento restano dichiarati PROVVISORI per decisione dell'utente (motore vero e piani del dungeon sono suoi).

## Differito alla UAT con la FE

Non è `human_needed`: la FE Phase 22 (piani 22-16/22-17) non è ancora eseguita e il boot reale è dell'orchestratore. Passi e dati esatti stanno in BACKEND-NOTES §6; qui il riassunto operativo.

**Prerequisiti (orchestratore):** `npm run test:cov` verde; tabella dei tempi dei 44 pet scritta a DB (`pets.recoveryTime` in millisecondi, formula `B(rarità) × √(maxLifePoints/100) × (1 + maxXp/2000)` arrotondata ai 5 minuti, basi 20/30/40/50/60 minuti, da 10 min a 17 h 55 min, file di revisione `~/Downloads/klimmeck-tempi-recupero-compagni.md`); BE riavviato dal ramo, WARN `PetRecovery` a zero dopo la semina; FE Phase 22 sul device.

**Dati di prova** (script fuori dal repo, mai il DB reale dagli esecutori): un personaggio con due voci in `assets.ownedPets`, una di un pet cavalcabile (`speedModifier` > 1) con `name` e una senza nome; una voce sconfitta (`currentLifePoints: 1`, `defeatedUntil` fra pochi minuti, `lifeAsOf = defeatedUntil − recoveryTime`, `level` valorizzato, fuori dallo slot); una voce ferita a riposo (`currentLifePoints` sotto il massimo, `lifeAsOf` nel passato, `level` valorizzato); almeno due pozioni con `power` intero e attesa breve; cibo sufficiente per il passo 6 e scarso per il passo 7; una quest accettabile.

**Passi (uno per messaggio):**

1. Diario: il compagno a riposo mostra la vita che sale e il conto alla rovescia fino a `fullLifeAt`; lo sconfitto appare sconfitto.
2. Equip dello sconfitto rifiutato (`PET_DEFEATED`); dopo `defeatedUntil` l'equip riesce; entro 60 s push «Di nuovo in forze» col nome (osservare anche la push arretrata del reconciler dopo il riavvio).
3. Pozione a un compagno a riposo: vita su, attesa propria; pozione del personaggio libera (e viceversa); seconda pozione al compagno rifiutata con `recoveryUntil`.
4. Rinomina dal Diario; il nome compare nelle push e nei fogli degli esiti successivi.
5. Quest con compagno prima ferito poi sconfitto: foglio con riga della vita e poi della sconfitta, slot vuoto.
6. Viaggio con la cavalcatura, imboscata vinta con la cavalcatura sconfitta: push con «prosegui a piedi», pergamena visibile a viaggio in corso, arrivo più tardi; osservare la pedina (B-09, può saltare indietro).
7. Imboscata con poco cibo e cavalcatura caduta: ridirezionamento alla città più vicina, quest abbandonata, push con «la fame ti porta verso».
7-bis. Quest vinta che porta l'xp del compagno oltre una soglia: livello e vita massima nuovi nel Diario, vita corrente invariata.
8. Flusso dell'oste: vita del compagno proposta, corretta a 1, completamento con compagno sconfitto e data; poi caso «correggo l'eroe senza toccare il compagno»: il valore simulato del compagno deve restare (la FE lo rimanda).

**Da portare all'utente in UAT:** xp del compagno sconfitto presto in un dungeon; riga «Prosegui a piedi» (vetabile); testi provvisori delle push `ambush` e `petRecovered`.

**Alla merge della FE:** la FE pre-merge non conosce `ambush` e non riceve più `ambushDefeat`; la FE 22 deve accettare entrambi i tipi (D-30).

## Sintesi dei gap

Un solo gap, di copertura e di gravità LOW: nessuna spec fissa il contratto «`companionLifeAfter` omesso nella correzione dell'oste = vita d'inizio scontro», su cui poggia il handoff verso la FE (G-1, vedi frontmatter). Nessuna difformità funzionale, nessun requisito non soddisfatto, nessuna regola dell'utente tradita. Il gap non blocca la PR né la UAT; si chiude con una spec unitaria da pochi minuti, anche dopo la merge.

---

_Verificato: 2026-11-14_
_Verificatore: Claude (gsd-verifier)_
