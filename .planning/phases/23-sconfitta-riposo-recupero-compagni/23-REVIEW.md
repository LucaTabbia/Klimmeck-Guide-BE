---
phase: 23
slug: sconfitta-riposo-recupero-compagni
status: issues_found
reviewed: 2026-11-14
scope: piani 23-01..23-16, diff d4e3adad..d54045cf
reviewers: due reviewer per area (A: compagni, equip, pozione, rinomina, combattimento, esiti, guidato, push «in forze»; B: viaggi e imboscate)
findings: { critical: 0, high: 0, medium: 2, low: 8, info: 9 }
---

# Phase 23 — Code review

Lettura statica in sola lettura, eseguita mentre girava il gate 23-17 (nessun test lanciato dai reviewer). Ruling dell'orchestratore in fondo.

## Area A — compagni, combattimento, esiti, guidato

# BE Phase 23, AREA A: review del codice (diff d4e3adad..d54045cf)

Profondità: standard con tracciamento incrociato (funzione della vita, tutti i chiamanti del massimo e della vita salvata, ogni percorso d'esito, oste guidato, sweeper, authz). Sola lettura: nessun test lanciato.

Conteggi: CRITICAL 0, HIGH 0, MEDIUM 1, LOW 4, INFO 4.

## Aree verificate e pulite (una riga ciascuna)

- Funzione della vita (`companion-life.ts`): velocità `(max-1)/T`, arrotondamento, esempio utente (20 -> 40 in 20 min su T=100 min), sconfitto di ritorno esattamente a T (`fullLifeAt = asOf + T`, `now >= fullLifeAt` collassa al massimo), `T` nullo/invalido = recupero istantaneo, `defeatedUntil` e `fullLifeAt` coincidono perché stessa `at` e stesso `T`: corretti.
- Massimo passato alla funzione: ogni chiamante (`onTheWire`, `OwnedPetResolver`, `equip-pet.plan`, `item-use.plan`, `combat-context.companionOf`, `gm-overrides.overrideCompanionOf`, `companionAfterFight`, `fight-state`) usa `companionMaxLifeOf` e `companionStoredLifeOf`, mai la base della specie né la vita grezza. Nessuna eccezione trovata.
- Voce legacy: resta legacy solo se nessuno scrive la voce; ogni scrittore che tocca la voce (equip, riposo, rinomina, pozione, esito di scontro, `xpOnly`, overlay della guardia e della bozza guidata) scrive `level`, quindi non torna piena per errore. `newOwnedPetEntry` nasce con `level: 1`.
- Riscritture dell'array `ownedPets`: `normalisedEntry` conserva tutti i campi dello schema (name, lifeAsOf, defeatedUntil, potionRecoveryUntil, level); ogni scrittore passa da `normalisedOwnedPets`.
- Autorizzazione: `renamePet` owner-only (decoratore + matrice authz aggiornata), `useItem` risolve il personaggio dal bearer e `petId` si cerca solo fra le voci di quel personaggio (nessuna fuga); `OptionalObjectIdPipe` rifiuta la stringa vuota (non cade nel ramo «pozione del personaggio»).
- Allowlist `extensions`: `recoveryUntil` esce solo per `POTION_RECOVERING` e `PET_POTION_RECOVERING`, solo come ISO.
- Percorsi d'esito: tutti convergono su `planCombatant`/`planParticipant`/`planUnrewarded`, che chiamano `companionAfterFight` e `companionSlotSet/Filter` (quest, boss, soccorso, dungeon a tappe, guardia vinta/persa, arresto, sconfitta senza aid, completamento GM legacy e guidato). Slot svuotato con guardia sullo slot letto.
- Nessun tiro nuovo sulla `ChanceSource` (la vita del compagno nel segnaposto è deterministica), nessun `Date.now`/`Math.random`/`new Date()` nel diff, log solo con id.
- Indice dello sweeper presente e verificato (`deletedAt` + `assets.ownedPets.defeatedUntil`); claim con filtro `$elemMatch` + `arrayFilters` e `modifiedCount === 1` prima della push; push mai dentro una transazione.
- Concorrenza equip/pozione/rinomina: tutte in `connection.transaction` con snapshot in sessione e scrittura guardata; i WriteConflict rieseguono il callback (solo snapshot, piano, scrittura; `petPlannerOf` e il catalogo letti una volta fuori).

## MEDIUM

### A-01 (MEDIUM): pozione sul compagno senza arrotondamento, a differenza di quella del personaggio

File: `src/characters/items/item-use.plan.ts:343-352` (`companionHealOf`), confronto con `drinkEffectOf` (riga 217-231, usa `lifePointsWithin` che fa `Math.floor`).

Cosa non va: `hpAfter = Math.min(maxLifePoints, lifePoints + power)` con `power` da `powerOf`, che accetta qualunque numero finito positivo (il catalogo è contenuto non validato, scritto anche col driver nativo). Il personaggio passa da `lifePointsWithin` (floor, minimo 1); il compagno no.

Scenario: pozione con `power: 12.5` su un compagno a 10/100. `hpAfter = 22.5`: viene scritto `currentLifePoints: 22.5` e la pozione è consumata, poi `UseItemResult.hpAfter` (`Int!`) fallisce la serializzazione («Int cannot represent non-integer value») dopo il commit: il client vede un errore ma l'oggetto è sparito e l'attesa del compagno è partita. Con `power: 0.5` su un compagno a 10: `hpAfter (10.5) !== lifePoints (10)`, quindi non scatta `ITEM_NO_EFFECT`, la pozione si consuma senza alcun effetto reale (il personaggio avrebbe avuto `ITEM_NO_EFFECT`).

Fix: `const hpAfter = Math.min(maxLifePoints, Math.floor(lifePoints + power));` (stessa base del personaggio), così il confronto `hpAfter === lifePoints` rifiuta le pozioni da frazione e il valore scritto è intero. Aggiungere un caso in `item-use.plan.spec.ts` con `power` frazionario.

## LOW

### A-02 (LOW): tempo trascorso negativo porta la vita sotto l'ancora fino a 0, e 0 si legge come vita piena

File: `src/characters/pets/companion-life.ts:69-70`.

Cosa non va: `regained = Math.round(((now - asOf) * (max - 1)) / recoveryTime)` non è limitato a >= 0. Se `lifeAsOf` è nel futuro rispetto a `now` (skew fra istanze, o `lifeAsOf: input.at` di un'imboscata/esito con `at` maggiore dell'orologio del chiamante), `life + regained` scende sotto l'ancora.

Scenario: compagno sconfitto con `lifeAsOf = t0` e vita 1; un'altra istanza con orologio indietro di 5 s legge a `t0 - 5s`: `regained = round(-5000 * 99 / T)`, `Math.min(max-1, 1 + regained)` = 0 o negativo. `equippedEntry` (equip) e `healedEntry`/`companionHealOf` (pozione) scrivono quel valore come `currentLifePoints`; alla lettura successiva `companionLifeNow` tratta `<= 0` come legacy = vita PIENA. Un compagno quasi morto torna a vita piena per uno skew. In `equippedEntry` il compagno entra nello slot con vita 0 salvata.

Fix: `const elapsed = Math.max(0, now - asOf);` e poi `Math.max(life, Math.min(max - 1, life + regained))`. Caso di test: `now < lifeAsOf` restituisce la vita d'ancora.

### A-03 (LOW): la push «in forze» è al più una volta e si perde se le letture dopo il claim falliscono

File: `src/characters/pets/pet-recovery.service.ts:55-72` e `95-115`.

Cosa non va: il claim azzera `defeatedUntil` (irreversibile) e solo dopo `notifyOwner` fa `userModel.findOne` e `petModel.find`. Se una di queste due letture lancia (rete, failover), `release` solleva, `releaseSafely` registra l'errore e il marcatore è già cancellato: nessuna riprova, la push di quel compagno non parte mai. `sendToUser` stesso inghiotte gli errori, quindi il rischio è solo sulle due letture (la prigione ha lo stesso precedente, ma qui ci sono più voci per personaggio: un errore sulla lettura delle specie perde le push di tutte).

Fix: avvolgere le due letture di `notifyOwner` in try/catch con `logger.warn` e ricadere sul nome salvato o su `FALLBACK_COMPANION_NAME` (la push parte comunque), oppure leggere owner e specie prima dei claim e inviare dopo ogni claim riuscito.

### A-04 (LOW): `renamePet` con `name` omesso toglie il nome

File: `src/characters/pet-name` via `src/models/request/rename-pet-request.model.ts:15-18` e `src/characters/pets/pet-name.ts:8-9`.

Cosa non va: `name` è `String` nullable e `@IsOptional()`; `petNameOf(undefined)` restituisce `null`, quindi una richiesta che omette `name` (client buggato, query senza la variabile) cancella il nome del compagno invece di essere rifiutata. D-31 dice «`name: null` toglie il nome», non «assente toglie».

Scenario: `renamePet(request: { id, petId })` per errore di cablaggio FE: il compagno perde il nome senza errore.

Fix: in `petNameOf` distinguere `undefined` (lancia `petNameInvalid`) da `null` (toglie), oppure marcare `name` obbligatorio nello schema (`@Field(() => String, { nullable: true })` più check `request.name === undefined`).

### A-05 (LOW): la push «in forze» parte anche per un compagno già rimesso in servizio, con vita non piena

File: `src/characters/pets/equip-pet.plan.ts:99-114` (`equippedEntry`), `src/characters/pets/pet-recovery.ts:25-42`; test che lo fissa: `pet-recovery.int-spec.ts:195`.

Cosa non va: lo sweeper azzera `defeatedUntil` per ogni voce scaduta, equipaggiata o no. Se fra la scadenza e lo sweep (fino a 60 s, ma anche ore con processo fermo: il reconciler gira al boot) il giocatore equipaggia il compagno e combatte (resta a, diciamo, 30%), la push dice «X è di nuovo in forze» a un compagno ferito nello slot.

Fix (a scelta): in `equippedEntry` rimuovere `defeatedUntil` quando è già `<= now` (il compagno è tornato in servizio: nessuna push, il giocatore lo sa); oppure `petRecoveryClaim` può restare e `release` saltare la push quando la voce è nello slot. Se è una scelta voluta (Pitfall 6) basta documentarla; il test esistente la asserisce come voluta.

## INFO

### A-06 (INFO): livello salvato che resta indietro o scende al cambio del catalogo

File: `src/quests/outcomes/pets/companion-after-fight.ts:81-85` (`levelAfter`), `src/characters/pets/companion-level.ts:71-79`.

`levelAfter` rilegge il livello dall'xp solo quando `gained > 0`; altrimenti vince il salvato. Se l'utente corregge `Pet.maxXp` a DB: (a) un compagno già al tetto vecchio (`gained = 0` per sempre) non rinfresca mai il livello; (b) a un tetto più alto, al primo guadagno il livello ricalcolato scende e il massimo cala sotto la vita corrente (clamp silenzioso a `companionLifeNow`, perdita di punti). Non è un bug con il catalogo stabile (D-39: «il salvato vince»). Se si vuole robustezza: ricalcolare sempre `Math.max(saved, fromXp)` oppure ricalcolare il livello anche nella scrittura di rinomina/equip (già scrivono `level`).

### A-07 (INFO): soglie duplicate a zero con `maxXp` piccolo

File: `src/characters/pets/companion-level.ts:30-50`.

Per `maxXp < 23` le soglie dei livelli 1 e 2 valgono entrambe 0 (`round(maxXp/45)`), quindi `companionLevelFromXp(0, maxXp)` dà 2 e una voce legacy a xp 0 parte da livello 2 (massimo +2%). Latente: il catalogo reale parte da `maxXp` 100 (Phase 19 D-05). Fix a costo zero: `filter(...)` ma con `Math.max(1, ...)` non basta; meglio forzare soglie strettamente crescenti o ignorare il primo elemento (`thresholds.slice(1)`, partendo da 1).

### A-08 (INFO): correzione dell'oste che omette `companionLifeAfter`

File: `src/quests/guided/mission-draft-save.service.ts:340-382`, `src/quests/outcomes/gm-overrides.ts:120-135`.

La correzione sostituisce per intero gli effetti dei partecipanti elencati: un `ParticipantOverrideInput` senza `companionLifeAfter` vale «vita d'inizio scontro», quindi annulla in silenzio una sconfitta simulata del compagno (stessa semantica già vigente per `hpAfter`). Corretto rispetto a D-33, ma è un contratto che la FE deve rispettare rimandando sempre il valore simulato. Da segnare in `BACKEND-NOTES.md` se non c'è già.

### A-09 (INFO): messaggi e limiti duplicati come letterali

File: `src/gameRules/game-rule.exception.ts:340-345` («da 2 a 20 caratteri»), `src/models/character/owned-pet.model.ts` (`max: 10`).

Il messaggio di `PET_NAME_INVALID` ripete i limiti di `character-name.ts` e lo schema ripete `COMPANION_LEVELS`. Se cambiano i limiti il testo diverge. Usare `CHARACTER_NAME_MIN_LENGTH`/`MAX_LENGTH` e `COMPANION_LEVELS`.

### A-10 (INFO): sweeper senza paginazione

File: `src/characters/pets/pet-recovery.sweeper.ts:77-90`. Il `find` dei personaggi con sconfitte scadute non ha limite; fuori dallo scopo v1 (performance), segnalato solo perché una voce con riferimento illeggibile e `defeatedUntil` scaduto (`duePetsOf` la salta) farebbe riselezionare quel personaggio a ogni tick per sempre.

## Area B — viaggi e imboscate

# Review BE Phase 23, AREA B: viaggi e imboscate

Diff: `d4e3adad..d54045cf` su `src/travel`, `src/models/character`, `src/quests/results`, `outcome-writer.service.ts`, `src/push`. Profondità: deep sulla sola lettura (nessun jest, nessuna build, nessun `.env`).

Esito: nessun CRITICAL, nessun HIGH. Il nucleo (aritmetica del fattore, identità del viaggio, cibo, ridirezionamento, `QuestResult` nella transazione, push dopo il commit) regge alla verifica. Restano difetti minori e un paio di lacune di copertura.

Conteggi: CRITICAL 0, HIGH 0, MEDIUM 1, LOW 4, INFO 4.

## Verificato e pulito (una riga ciascuno)

- Verso del fattore: `mount.factor = speedModifier` (velocità con cavalcatura / a piedi, a parità di ferite), durata a piedi = `(endTime − at) × factor`, quindi più lunga: `ambush-on-foot.ts:60-79` corretto. Test pinnati con fattore 2.
- Strada residua: `residualRoadOf` (distance − km, polilinea dal punto, `slice(max(segment,1))`) coerente con `pointAtFraction`. `startTime = at`, `endTime = at + duration`, `endTime − startTime = duration`.
- Arrivo nel passato: gestito. `enqueueTrigger` usa `delay: max(0, …)`; il completamento aspetta l'imboscata pendente (`completionFilter` con `ambush: null`); `afterCommit` riaccoda il completamento scaduto quando manca la prossima imboscata. Durata zero: `foodLegOf` scarta distanza ≤ 0, nessuna divisione.
- Pasto contato una volta: progress e stop sono mutuamente esclusivi su `foodConsumedAt`; `eatenAtStop` applica solo `food.defeat`; le guardie del filtro usano `defeatSettlementOf` (unione). `arrivesAlive` usa vita DOPO lo scontro (e dopo la fame fino al km) e dispensa DOPO il pasto della sosta. Il pasto non cura, quindi nessuna vita da aggiungere. Senza piano vecchio, nessun piano nuovo e nessun controllo di fame (coerente con D-04 Phase 20).
- Prossima imboscata: rimappata per km (`next.km − current.km`), nessun tiro oltre al `drawFrom` già esistente, scartata se fuori strada. `at` rimappato < `endTime` (floor).
- Identità (Pitfall 5): `cancel(S)` + `schedule(S')` + `scheduleAmbush(S', at2)` solo dopo il commit; i job vecchi sono no-op per filtro (`ambushFilter`, `completionFilter`, `foodTravellerFilter` con `startTime`); sweeper del cibo e teleport rileggono l'identità. Nessuna push `travelEnd` doppia (solo `completion.complete`, solo kind free). Le finestre fra commit e riallineamento (teleport, sweeper, seconda imboscata già scaduta) si chiudono tutte su un no-op.
- Ridirezionamento: abbandono una sola volta (`failure || redirected`, mai entrambi), `pendingQuest: null` + `PendingQuest` cancellata + posto liberato nella stessa transazione, premi e conoscenza conservati, `reachedCity` valorizzato, nessun `food`/`ambush` sul viaggio deviato, kind free quindi `travelEnd` all'arrivo.
- `mount` mai sul filo (nessun `@Field`), assente dopo la riscrittura a piedi e sulla deviazione; viaggi in volo senza `mount` non vengono ricalcolati (`isMountFallen` richiede il record). Il `mount` è scritto da tutti e tre i punti di partenza (`planFree`, `planAuto`, accettazione quest, che spalma `movement.travel`).
- Report già trattenuti: `deliverHeldReports` (arrivo) e teleport restano; la deviazione li porta nel viaggio riscritto; nessun nuovo report viene più trattenuto; `ambushReports: []` residuo innocuo.
- `QuestResult` scritto nella stessa transazione (`resultId` creato fuori dal callback, riscrittura sicura sui retry); `questResultReceived` dal change stream al commit; `deliver` con `results: []` non manda `questEnd`. Push `ambush`: una per imboscata, id = id del risultato, solo dopo il commit, nessuna per `skip`/`stale`, `ambushDefeat` non parte più (resta solo nel catalogo di `sendTestPush`). Retry su WriteConflict: `outcome` azzerato a ogni giro, push e job sono fuori dal callback.
- `Date.now`/`Math.random` assenti in `src/travel`, `src/push`, `src/quests/results`. Log: solo jobId, nome città, codice errore.

## Finding

### B-01 [MEDIUM] La push e `deliver` precedono il riallineamento dei job: un FCM lento ritarda la correttezza

File: `src/travel/ambush/ambush-resolution.service.ts:536-552` (vinta) e `587-598` (`afterDefeat`).

Cosa non va: dopo il commit l'ordine è `writer.deliver` → `notifyAmbush` → `moveTravelJobs`/`afterCommit`/`cancel+schedule`. `PushService.sendToUser` è best-effort ma attende la rete (token a blocchi, in serie, più la potatura). I job sono invece il percorso di correttezza (completamento col nuovo `startTime`, prossima imboscata). Se FCM è lento o appeso, il vecchio job di completamento non viene cancellato, il nuovo non viene accodato e la prossima imboscata resta a carico dello sweeper; sullo stesso handler il lock Bull può scadere (job «stalled») e il rilancio trova il filtro non più valido e non rifà nulla (`stale`), quindi non c'è doppia scrittura, ma anche nessun riallineamento dei job, solo gli sweeper. Non c'è dato perso, c'è latenza e dipendenza dagli sweeper per un percorso normale.

Scenario: FCM risponde in 20 s per utente con più device; l'imboscata resta «commit fatto, job vecchi vivi» per 20 s; con `remapped.at` già nel passato la prossima imboscata aspetta il tick dello sweep invece di partire subito.

Fix: invertire l'ordine, prima i job (tutti con `enqueueTrigger`/`removeBestEffort` a timeout breve), poi la push come ultima azione.

```ts
if (outcome.plan.report.outcome === QuestOutcome.failure) {
    return this.afterDefeat(fight, outcome.plan); // dentro: cancel, schedule, poi notifyAmbush
}
await this.realignJobs(...);   // moveTravelJobs oppure afterCommit
await this.notifyAmbush(fight.userId, outcome.plan.report);
```

### B-02 [LOW] La strada a piedi ignora le ferite nuove dello scontro, la deviazione no

File: `src/travel/ambush/ambush-on-foot.ts:60-79` contro `src/travel/ambush/ambush-plan.ts:365-372`.

Cosa non va: `onFootTravelOf` usa `(endTime − at) × factor`, cioè le ferite di PARTENZA. `detourTravelOf` (usata dalla sconfitta e dal ridirezionamento per fame, stesso scontro) applica `travelSpeedFactorOf(fought.wounds.injuries)`, cioè anche le ferite appena prese. Il codice di `travelSpeedFactorOf` dice «fotografato alla partenza», quindi il ramo a piedi è coerente col principio; è il ramo deviazione a fare eccezione. Conseguenza visibile: stessa gamba rotta presa nello stesso scontro, il viaggiatore che ha cibo cammina alla velocità senza ferita, quello che finisce ridiretto cammina rallentato; e `arrivesAlive` è deciso su una durata senza ferite.

Scenario: vittoria con una ferita che dà `speedFactor 0.5`, cavalcatura caduta. Con cibo sufficiente: strada a piedi di 12 h (senza ferita). Senza cibo: deviazione di 2× la sua durata base.

Fix: scegliere una regola sola. Se vale «ferite fotografate alla partenza», la deviazione non deve applicare le ferite nuove; se vale «le ferite contano da ora», `onFootTravelOf` deve ricevere il rapporto `factorNow / factorAtDeparture` e il fabbisogno del cibo calcolarsi su quella durata. Documentare la scelta in BACKEND-NOTES.

### B-03 [LOW] `AmbushReport.onFoot` e la riga «prosegui a piedi» vera anche per un compagno che non era una cavalcatura

File: `src/travel/ambush/ambush-plan.ts:567` (`won ? mountFallenIn : companionFell`).

Cosa non va: nella sconfitta `onFoot = companionFell(fought)`, cioè «il compagno equipaggiato è caduto», senza guardare se faceva da cavalcatura. Il commento del modello dice «la cavalcatura è caduta». Un compagno con `speedModifier` nullo (mai una cavalcatura) che cade in una sconfitta produce `onFoot: true` (la FE mostra «Prosegui a piedi» su chi andava già a piedi). Nella vittoria la regola è giusta (`mountFallenIn`).

Fix: usare lo stesso predicato nei due rami quando il viaggio ha un `mount`; sui viaggi senza `mount` (in volo al deploy) la sconfitta può continuare a usare `companionFell` per la durata, ma il flag del report deve restare `false` se il compagno non aveva `speedModifier`.

### B-04 [LOW] `mountOf` registra come cavalcatura anche `factor ≤ 1`

File: `src/travel/travel-timing.ts:55-62` (`mountOf`), `ambush-on-foot.ts:106-112`.

Cosa non va: `isSpeedModifier` accetta ogni valore finito > 0. Un pet con `speedModifier = 1` non accelera nulla, ma se cade produce «prosegui a piedi» nella push e nel report, senza alcun cambiamento di tempi. Un pet con `speedModifier < 1` (più lento del passo) lo fa accorciare perdendolo (la strada a piedi diventa più breve). L'orchestratore non ha escluso il caso; se il catalogo non ha pet lenti è solo un invariante non difeso.

Fix: `mountOf` restituisce `null` quando `modifier <= 1` (nessuna cavalcatura, nessun ricalcolo, nessun flag), oppure `paceFactorOf` fa `Math.max(1, factor)`.

### B-05 [LOW] Ridirezionamento per fame sul ripiego «nessuna città raggiungibile»: quest abbandonata ma meta invariata

File: `src/travel/ambush/ambush-resolution.service.ts:338-352` con `ambush-plan.ts:514-516`, `442-465`.

Cosa non va: se `nearestByTime` non trova una città per strada, `detourOf` ripiega su `residualDetourOf` (stessa meta, `reachedCity` = città della meta). Quando poi la fame decide il ridirezionamento, `redirected: true` abbandona la quest (corsia, PendingQuest, posto) e la push dice «la fame ti porta verso <città della meta>», ma il personaggio continua verso la stessa meta con la stessa durata. È un'uscita irreversibile (quest persa) senza il beneficio promesso.

Scenario: mappa senza strada dal punto a nessun marker (WARN già loggato), cavalcatura caduta, cibo insufficiente a piedi.

Fix: nel ripiego (`detour.baseHours === null`) non ridirigere per fame: tenere la strada a piedi con la quest (come con cibo sufficiente), oppure far lanciare l'errore operativo già loggato. Almeno un test sul ripiego con fame.

### B-06 [INFO] `AmbushOutcomePlan.onFootFood` è scritto ma mai letto

File: `src/travel/ambush/ambush-plan.ts:181, 436, 462, 552, 589`.

Solo le spec lo asseriscono; il servizio usa `redirected`. Rimuoverlo o farlo usare (per esempio nel log del ridirezionamento). Boy Scout.

### B-07 [INFO] `travelAfter.rewritten: false` nella sconfitta, anche se `startTime` cambia

File: `src/travel/ambush/ambush-plan.ts:430-435`.

`afterDefeat` fa comunque `cancel` + `schedule`, quindi funziona, ma il campo dice una cosa falsa e il ramo vinto usa invece `rewritten` per decidere. Uniformare (`rewritten: true` anche in `defeatPlanOf` e far convergere `afterDefeat` e `moveTravelJobs`, che oggi duplicano cancel+schedule).

### B-08 [INFO] Lacune di copertura sulle finestre di Pitfall 5

File: `src/travel/ambush/ambush-on-foot.int-spec.ts`, `ambush-resolution.int-spec.ts`.

Mancano prove di: (a) teleport fra commit e `moveTravelJobs` (job S' lanciato su un personaggio senza viaggio, atteso `stale`); (b) seconda imboscata rimappata già nel passato risolta dallo sweeper prima del riallineamento del primo; (c) job vecchio di completamento (S) che scatta dopo la riscrittura (atteso `stale`, nessuna push `travelEnd`); (d) retry WriteConflict che non rimanda la push (un solo `world.push.sent`). Il codice le regge per costruzione (filtri d'identità), ma sono i casi che la ricerca ha chiamato Pitfall 5.

### B-09 [INFO] La pedina salta indietro se l'imboscata si risolve in ritardo

File: `ambush-on-foot.ts:60-79` (decisione D-13 esplicita).

`startTime = at` (nel passato) con durata più lunga: finché lo sweep non risolve (fino al suo intervallo) la FE vede la pedina avanzare sulla vecchia strada; alla risoluzione riparte dal punto dell'imboscata più indietro. Voluto dall'utente («startTime = istante dell'imboscata»), ma da citare in BACKEND-NOTES per la FE.

---

_Reviewed: 2026-11-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep (sola lettura)_

## Ruling dell'orchestratore (2026-11-14)

Correggere in TDD (RED → GREEN, un finding per coppia di commit); un finding che alla prova risulta infondato si chiude `not_needed` con la prova.

- **A-01 (MEDIUM) — correggere:** la pozione sul compagno arrotonda come quella del personaggio (`Math.floor`), vita sempre intera; test con `power` frazionario.
- **A-02 — correggere:** tempo trascorso mai negativo (ancora nel futuro = nessun recupero, vita invariata); la vita non scende mai sotto 1 né viene scritta a 0.
- **A-03 — correggere:** la push «in forze» non si perde se la lettura di proprietario o specie fallisce dopo il claim (letture prima dei claim, oppure nome di ripiego e log con solo id e codice).
- **A-04 — correggere:** `renamePet` con `name` OMESSO è rifiutato (`BAD_USER_INPUT`); solo `name: null` esplicito toglie il nome.
- **A-05 — confermato com'è (`not_needed`):** la push «di nuovo in forze» parte alla scadenza della sconfitta anche se il compagno è già stato riequipaggiato e ferito di nuovo: D-11 la lega al ritorno dalla sconfitta, e il test esistente lo fissa. Una riga nel handoff.
- **INFO di A sulla correzione dell'oste — correggere nel BE:** una correzione che OMETTE `companionLifeAfter` non deve annullare la sconfitta (o il danno) simulati: il valore corretto ricade su quello simulato, come avviene per gli altri effetti omessi (verificare come si comporta `hpAfter` omesso e allineare; se `hpAfter` omesso NON ricade sul simulato, fermarsi su questo punto e riportarlo `deferred` con l'analisi). La FE manda la chiave solo quando l'oste tocca lo slider.
- **Altri INFO di A:** livello salvato che resta indietro se cambia `Pet.maxXp` a DB → una riga nel handoff (si riallinea al primo premio di xp), `not_needed`; soglie duplicate con `maxXp` < 23 → un test che fissa «livello mai decrescente e mai oltre 10» e, se serve, la correzione; letterali duplicati → correggere se piccolo; sweeper senza paginazione → `deferred` (stesso limite dello sweeper della prigione).
- **B-01 (MEDIUM) — correggere:** dopo il commit prima il riallineamento dei job del viaggio, poi consegna e push; un invio lento o fallito non ritarda né salta i job (test deterministico con un sender che non risolve subito, niente sleep).
- **B-02 — correggere, regola unica:** le ferite nuove dello scontro rallentano anche la strada residua a piedi, come già la deviazione.
- **B-03 — correggere (sostituisce la scelta del piano 14):** in una SCONFITTA `AmbushReport.onFoot` vale true solo se a cadere è una cavalcatura (il compagno della partenza `activeTravel.mount`, oppure — viaggi senza `mount` — un compagno equipaggiato con velocità da cavalcatura); un compagno che non è una cavalcatura non accende «Prosegui a piedi». La deviazione resta a velocità di marcia quando il compagno equipaggiato è caduto.
- **B-04 — correggere:** cavalcatura solo con `factor` > 1 (un pet non più veloce del passo non è una cavalcatura: nessun `mount`, nessun ricalcolo, nessun `onFoot`).
- **B-05 — correggere:** senza una città raggiungibile per strada NON c'è ridirezionamento: la quest non si abbandona, `reachedCity` resta null, nessun testo «la fame ti porta verso»; il viaggio prosegue a piedi verso la meta (comportamento del piano 13).
- **B-06, B-07 (INFO) — correggere se piccolo** (campo scritto e mai letto; `rewritten` coerente nella sconfitta). **B-08 — aggiungere i test mancanti sulle finestre del Pitfall 5 che si possono rendere deterministici; il resto `deferred`.** **B-09 — `deferred`:** pedina che salta indietro se l'imboscata si risolve in ritardo (limite dello sweep, da guardare in UAT), una riga nel handoff.
