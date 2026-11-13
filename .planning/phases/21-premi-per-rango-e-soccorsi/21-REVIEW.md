---
phase: 21-premi-per-rango-e-soccorsi
reviewed: 2026-11-13
depth: deep
status: issues_found
findings:
  critical: 0
  warning: 8
  info: 15
  total: 23
---

# Phase 21 — Code review

Tre revisori in sola lettura per area sul diff `fb59b545..3517dff1` (A: blocchi premio, magia, generatore, filo; B: aid per tipo, sconfitta senza soccorso, archiviatore; C: dungeon a turni e quota). I ruling dell'orchestratore sono in fondo.

## Review A — blocchi premio, scelta, magia ai caster, boss misti, filo per viewer

Repo `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/21-premi-per-rango-e-soccorsi`, diff `fb59b545..3517dff1`. Sola lettura: nessun file del repo toccato, nessun test lanciato (`git status --short` vuoto a fine revisione). Tutto ciò che segue è **verificato leggendo il codice** salvo dove è scritto «da verificare».

**Conteggio:** Critical 0 · Warning 2 · Info 5

---

## Risposta al punto (1): D-18 sul filo e i casi esatti del premio vuoto

Il riferito dell'executor («premio vuoto quando non c'è un blocco per il titolo o il viewer non ha personaggio») **non descrive il codice**. Il ripiego D-18 è applicato in ogni ramo, sul filo e alla risoluzione, dalla stessa funzione.

`QuestPrizesResolver.prizes` (`src/quests/prizes/quest-prizes.resolver.ts:36-37`) fa `prizeBlockFor(quest, subject?.title ?? null) ?? EMPTY_PRIZES`. `prizeBlockFor` (`src/quests/prizes/rank-prizes.ts:92-105`) restituisce `null` in un solo caso: `prizeBlocksOf` vuoto, cioè nessun blocco valido **e** `quest.prizes` assente (`rank-prizes.ts:64-70`). Rami effettivi:

| Caso | Esito |
|------|-------|
| Viewer con personaggio, blocco del suo titolo presente | quel blocco |
| Viewer con personaggio, blocco del titolo assente | blocco più alto non superiore, altrimenti il più basso |
| Nessun bearer, utente senza `currentCharacter`, personaggio archiviato o morto (`activeCharacterById`), titolo assente | blocco del `minTitle`; se il `minTitle` non ha un blocco, il più alto non superiore al `minTitle`, altrimenti il più basso; senza `minTitle` il più basso |
| Titolo del personaggio fuori enum | il blocco più basso (`TITLE_RANK[wanted]` indefinito, `rank-prizes.ts:83`) |
| Solitaria, boss legacy senza blocchi, aid di una solitaria | premio unico dai campi di oggi, per qualunque titolo |
| Tipo di gruppo con `rankPrizes` presente ma senza alcuna voce dal titolo valido | premio unico dai campi di oggi |
| **Parent senza `prizes`** | **premio vuoto** (`EMPTY_PRIZES`) |

Il premio vuoto esce quindi solo quando il parent non porta `prizes`:
- `PendingQuest.quest` non popolato (query `pendingQuests`: il parent è un ObjectId);
- quest popolata col solo `_id` da `CHARACTER_QUESTS_POPULATE` (`src/characters/character-quests.populate.ts:7-11`: corsie e `completedQuests`);
- un documento quest a DB senza il campo `prizes`.

In tutti e tre `rankPrizes` risponde `[]`. Prima della fase gli stessi parent davano errore su `prizes: QuestPrizes!`.

Alla risoluzione (`combatant-plan.ts:176`, `gm-completion.service.ts:318`) lo stesso `null` diventa `NO_REWARDS` in `drawRewards`, sempre e solo per una quest senza `prizes`.

---

## Warnings

### A-WR-01: un posto null scoperto a party già iscritto lascia il party in attesa per sempre

**File:** `src/quests/party/quest-start.service.ts:173-179`, `src/quests/party/party-timeout.service.ts:91-92` (regola in `src/quests/acceptance/quest-eligibility.ts:104-122`)

**Issue:** i tre lettori passano tutti da `registrationRuleOf`, quindi il rifiuto D-24 c'è in tutti e tre. Ma solo l'accettazione rifiuta davvero (`QUEST_NOT_ACCEPTABLE`, `quest-acceptance.service.ts:444-451`). Avvio e timeout trattano `'invalid'` come `'stale'`: il primo non parte, il secondo non scioglie. Per questi due lettori il ramo era già così per i posti malformati; la fase lo estende a uno stato che fino a ieri era valido (posto jolly in `boss` / `worldMission`).

**Scenario:** boss con `[{mage,2},{paladin,1}]`, due iscritti; a mano un posto diventa `{ title: null }` (o una worldMission scritta a mano col jolly riceve iscritti prima del deploy). Da quel momento: `acceptQuest` rifiuta, `startParty` logga il WARN e torna `stale` a ogni trigger, `disband` torna `stale` anche dopo le 24 ore. Gli iscritti restano con la corsia standard occupata e la PendingQuest aperta, senza push `questCancelled`. Unica uscita vista: `abandonQuest` (`src/quests/party/party-abandon.service.ts`), **da verificare** che non dipenda dalla regola dei posti (non la importa). A DB oggi non ci sono casi vivi (0 worldMission, 12 boss a titolo esatto).

**Test:** nessuna spec di `src/quests/party/` nomina D-24: il comportamento dei due lettori su un posto null non è provato.

**Fix:** in `disband` sciogliere il party anche con regola non valida invece di tornare `stale`:
```ts
const rule = registrationRuleOf(quest.infos.type, quest.requirements);
if (rule === null) return 'stale';
// regola non valida (D-24, D-27): nessuno potrà più entrare, il party scade come uno incompleto
if (rule !== 'invalid' && members.length >= rule.total) return 'waiting';
```
più una int-spec per lettore col titolo `(D-24)`. In alternativa, documentare nel handoff che il report del boot (`nullSeat`) è l'unico segnale e che gli iscritti si liberano solo con `abandonQuest`.

### A-WR-02: l'aid clona `rankPrizes` da qualunque sorgente, senza passare dall'unica lettura dei blocchi

**File:** `src/quests/outcomes/aid/aid-quest.ts:96-98` (lettura unica in `src/quests/prizes/rank-prizes.ts:57-61`)

**Issue:** `rankBlocksOf` è dichiarata «unica lettura dei blocchi validi» e scarta i blocchi delle quest non di gruppo e le voci senza titolo valido. `clonedPrizesOf` invece rilegge `prizes.rankPrizes` grezzo con `isRecord`, senza guardare il tipo della sorgente né il titolo. Poiché l'aid è in `GROUP_PRIZE_TYPES`, i blocchi che l'originale ignorava diventano vivi sull'aid. La ricerca (§Q9, riga 288) dava per vero che l'aid abbia blocchi «solo se l'originale era di gruppo»: il codice non lo garantisce.

**Scenario:** una hunt (solitaria) con `prizes.xpPrize: 40` e un `rankPrizes: [{ title: 'mage', xpPrize: 300 }]` rimasto a DB (ritocco a mano, tipo cambiato da boss a hunt). La hunt paga 40 a chiunque (`combatant-plan.spec.ts:396` lo pinna). La sua aid clona il blocco, è di tipo `aid`, e paga 300 a ogni soccorritore (ripiego «il più basso»), mentre il foglio della hunt mostrava 40. Richiede contenuto anomalo: il report del boot non lo vede (legge solo i tipi di gruppo).

**Fix:** clonare solo ciò che l'originale legge davvero:
```ts
const blocks = rankBlocksOf(original); // tipo di gruppo + titolo valido
if (blocks.length === 0) return cloned;
return { ...cloned, rankPrizes: blocks.map(clonedRankBlockOf) };
```
(`clonedPrizesOf` riceve la quest invece dei soli premi) e una spec «l'aid di una solitaria non eredita blocchi (D-01, D-11)».

---

## Info

### A-IN-01: la forma reale del boss misto generato non è provata sul filo

**File:** `src/quests/quest-catalog.populate.int-spec.ts:121-146`, `src/quests/quests.resolver.int-spec.ts` (describe `Quest.prizes for each viewer`)

**Issue:** un boss misto generato ha **due** blocchi, ognuno con più voci di `randomLoot` e `itemType` misti (`EquipmentItem` e `LootItem`). Le prove coprono: un solo blocco con una voce `LootItem` (int-spec del populate) e due blocchi di cui il secondo con `randomLoot: []` (int-spec del resolver). Non c'è una prova con due blocchi entrambi pieni e tipi diversi, né con un loot o una magia orfani dentro un blocco su una query vera (solo il pet).

**Da verificare:** ho seguito il codice di Mongoose 8.18.1 (`getModelsMapForPopulate.js:518-521,582-594`): per `prizes.rankPrizes.randomLoot.item` id e nomi dei modelli arrivano come array annidati della stessa forma e `matchIdsToRefPaths` li abbina ricorsivamente, quindi mi aspetto che funzioni; non è provato da una spec. Se l'abbinamento fallisse, la sanificazione scarterebbe in silenzio il loot dai blocchi (nessun errore sul filo).

**Fix:** una int-spec con blocchi `[mage: [Equipment, Loot], paladin: [Loot, Equipment]]`, più un loot cancellato in un blocco con una voce sorella che sopravvive.

### A-IN-02: l'ordine dei tiri del boss misto nel servizio non è pinnato da nessuna spec

**File:** `src/quests/generation/quest-generator.service.ts:284-296,310-330`

**Issue:** l'ordine è corretto (cancello dopo l'annuncio, proporzione solo se metà > 1, `prizesOf` dell'inferiore per ultimo; `mixedSeatsOf` è pinnata in unità). Ma la spec a seme fisso `keeps the enemies identical draw by draw (D-23)` gira su un mondo **senza candidati boss** (`NO_BOSS_ENEMY_XPS`), e le altre provano solo il determinismo fra due corse. Spostare il cancello prima di `prizesOf` o dell'annuncio lascerebbe tutto verde.

**Fix:** una corsa con `SequenceChance` registrante su un POI che compone un boss, con `drawn` confrontato per intero (gli ultimi tiri sono cancello, proporzione, loot e pet dell'inferiore).

### A-IN-03: il report del boot tace sui blocchi scartati e sulle quest a più titoli senza blocchi

**File:** `src/quests/maintenance/group-prize.report.ts:43-51,63`

**Issue:** `hasSeatWithoutBlock` esce `false` con zero blocchi validi (scelta della ricerca §Q5 per i boss legacy a titolo unico, D-28). Stessa uscita però per: (a) una worldMission scritta a mano con posti `[mage, paladin]` e nessun blocco, dove tutti prendono il premio unico; (b) un `rankPrizes` con la sola voce dal titolo sbagliato (`'Mage'`), che `rankBlocksOf` scarta in silenzio e che riporta la quest ai campi di oggi. Nemmeno i blocchi doppi sullo stesso titolo sono segnalati (vince il primo, `rank-prizes.ts:101`).

**Fix:** saltare il controllo solo quando i posti hanno un unico titolo; aggiungere una violazione `invalidBlock` quando `prizes.rankPrizes.length` supera i blocchi validi o i titoli si ripetono.

### A-IN-04: l'elenco dei tipi di gruppo è scritto due volte

**File:** `src/quests/maintenance/group-prize-report.service.ts:18-22` e `src/quests/prizes/rank-prizes.ts:7-11`

**Issue:** `OPEN_GROUP_TYPES` ripete `GROUP_PRIZE_TYPES` (boss, worldMission, aid). Aggiungere un tipo di gruppo in un punto solo lascerebbe il report cieco.

**Fix:** `'infos.type': { $in: [...GROUP_PRIZE_TYPES] }`.

### A-IN-05: commenti non più esatti

- `src/quests/generation/generation-rules.ts:110`: «conteggio per minTitle delle generate aperte»: per i boss ora conta il titolo più alto dei posti (`coverageRankOf`).
- `src/quests/prizes/quest-prizes.resolver.ts:40`: «nell'ordine dei posti»: l'ordine è quello di `prizes.rankPrizes` a DB (coincide solo per le generate).
- `src/models/quest/quest-rank-prize.model.ts:13`: rimanda al «piano 12», riferimento che invecchia dopo la merge.

---

## Controllato e trovato corretto

**Scelta del blocco (2).** Una sola regola: `prizeBlockFor` è chiamata dal foglio (`quest-prizes.resolver.ts:37`), dalla risoluzione standard, boss, soccorso e conclusione (tutte via `planCombatant`, `combatant-plan.ts:176`) e dal completamento del GM (`gm-completion.service.ts:318`). `drawRewards` ha solo questi due chiamanti; nessuna seconda copia del ripiego. Il titolo è quello dello snapshot letto in sessione. Il catalogo dei premi legge l'unione dei blocchi con la stessa `prizeBlocksOf` (`resolution-loader.service.ts:569`). La cura viaggia col blocco tirato (`outcome-plan.ts:407`) e tutti i chiamanti di `planParticipant` passano da `drawRewards`, quindi le heal in solitaria non la perdono. La quest della risoluzione è lean: nessuno spread su documenti idratati; `soloBlockOf` copia campo per campo.

**Filo per viewer (3).** Il resolver non muta il parent (`soloBlockOf` costruisce un oggetto nuovo, il blocco per titolo è restituito per riferimento in sola lettura, `EMPTY_PRIZES` è costante). La memo è per viewer (`ruolo:userId`) dentro la chiave dell'evento (`rootValue`) o della richiesta HTTP; lo snapshot alla subscribe è per sottoscrittore. Le spec coprono due sottoscrittori di titolo diverso sullo stesso evento e il payload intatto dopo.

**Populate e sanificazione (4).** I quattro percorsi dei blocchi sono in `QUEST_CATALOG_POPULATE`; `sanitizePrizeRefs` è una sola regola per campi di oggi e blocchi; voci null o non oggetto in `rankPrizes` sono tollerate da sanificazione, lettura e clone. Le uniche due sorgenti di `Quest` popolata sul filo sono `findForViewer` e `findOne`, entrambe sanificate; gli altri parent sono id-only e cadono nel premio vuoto, mai su un ObjectId servito come oggetto. `rankPrizes` ha `default: undefined`: assente sulle quest legacy.

**Magia (5).** L'unico punto che insegna una magia è `planParticipant` (`outcome-plan.ts:445-455`): `canLearnSpell` e `drawLearnableSpell` ricevono `titleAfter`; il non caster cade nel ramo della lore dello studio (`:487-493`); i tiri restano consumati in `drawRewards`, ordine invariato (loot, sorteggio, pet, lore; la cura non tira). Gli altri piani scrivono `spellLearned: null`. I blocchi generati hanno `spell: null` e `cure: null`; il report segnala le magie sotto mage.

**Boss misti (6).** `lowerRankOf` dà solo il titolo subito sotto, mai sopra; posti `[rango, inferiore]` con almeno un posto al rango (1 fino a metà); `minTitle` = inferiore; campi di oggi uguali al blocco del rango; un blocco per titolo anche sul boss non misto; nessun blocco sulle enemy. Copertura: `coverageRankOf` sul titolo più alto dei posti e incremento in corsa su `composition.rank`, coerenti. `LOOT_POOLS.boss.rookie` esiste (boss adventurer misto). Nessun altro consumatore di `minTitle` lo legge come «rango del boss».

**Posti null (7).** `hasUntitledGroupSeat` è l'unica regola, usata da accettazione, avvio, timeout (via `registrationRuleOf`) e dal report; l'aid e la enemy tengono il posto senza titolo. Vedi A-WR-01 per l'esito nei due lettori del party.

**Report e boot.** Sola lettura, lean, proiezione ridotta, log con id e nomi delle violazioni, tetto di 20 righe, passo non bloccante dopo la migrazione dei nemici.

**Non segnalati di proposito.** Il completamento del GM non applica la quota dell'aid di dungeon: le corsie del GM sono solo story e worldMission. Il report salta le quest di gruppo senza blocchi a titolo unico: è D-28.


## Review area B — aid per tipo, sconfitta senza soccorso, clone dei blocchi, archiviatore

Repo `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/21-premi-per-rango-e-soccorsi`, diff `fb59b545..3517dff1`. Revisione in sola lettura: nessun test, tsc o build eseguito. Tutto ciò che segue è **verificato leggendo il codice**; dove un punto dipende da un comportamento non eseguito o dai dati reali è scritto «da verificare».

Conteggio: **0 critical, 4 warning, 5 info**.

---

## Warning

### B-WR-01 — Aid di dungeon svuotata dall'archivio: il soccorritore già partito è risolto come individuale e il turno salvato viene ignorato; la nuova aid perde il turno e tiene il premio già scalato

**File:** `src/quests/outcomes/quest-resolution.service.ts:147-156` e `:182-205`; regola di smistamento in `src/quests/outcomes/resolution-kind.ts:11-22`; origine dello stato in `src/characters/deletion/character-archiver.ts:264-280`, `:313-321`.

**Cosa succede.** L'archiviatore conclude un'aid rimasta senza feriti ma, se è avviata (`startedAt != null`), lascia i soccorritori in corsia (scelta voluta, RESEARCH Q11). Alla scadenza del countdown `resolutionKindOf` non trova feriti e manda il soccorritore a `resolveLoadedIndividual`. Lì:

- `fight()` sceglie la porta a turni solo con `infos.type === dungeon` (riga 190). Un'aid ha tipo `aid`, quindi si fa **un combattimento unico contro tutte le voci di `enemies`**, non i turni fino a `rescue.turn` (D-12/D-13).
- `planCombatant` applica comunque `rescueShareOf(rescueTurnOf(quest.rescue?.turn))` alle soglie di loot e pet, ma l'xp dei nemici è quello dell'intero catalogo (qui non c'è il taglio `faced` di `rescue-resolution.service.ts:449-454`).
- I contatori dei turni sull'esito restano `null` (D-21 li vuole valorizzati per l'aid di dungeon).
- Se perde: `buildAidQuest(loaded.quest, …, rescueTurnFromStages(battle?.stages))` riceve `stages` undefined, quindi `turn = null`. `aidPrizesOf` con `turn` null ritorna il clone dei premi dell'aid **già scalati**, e `rescue.turn` non viene scritto. La nuova aid è una aid «normale» (combattimento intero, D-26 violata) con monete/xp/`prizeItem` ridotti, e si clona l'aid invece dell'originale.

**Scenario.** Dungeon da 4 gruppi, caduta al turno 4 di 8 → aid con `rescue.turn { index: 3, total: 8 }`, premi a metà. Un soccorritore arriva (posto unico → avvio immediato), parte il countdown. Il ferito elimina il personaggio. L'aid è conclusa e svuotata, il soccorritore resta in corsia. Alla scadenza combatte i 4 gruppi in un colpo; se perde nasce un'aid senza turno con premi a metà: i soccorritori successivi affrontano l'intera dungeon per metà premio.

**Fix proposto.** In `resolveLoadedIndividual` leggere `rescueTurnOf(loaded.quest.rescue?.turn)` e, se presente, passare dalla stessa routine di `RescueResolutionService.rescueBattleOf` (porta della dungeon con `lastTurnIndex`, catalogo `faced`, `nextRescueTurnOf` per la nuova aid). In alternativa, più semplice: far liberare all'archiviatore anche i soccorritori già partiti di un'aid di dungeon che resta senza feriti. Serve una int-spec che riproduca lo stato (aid avviata con `rescue.turn`, ferito archiviato, soccorritore dovuto).

Nota: la risoluzione individuale di un'aid svuotata esisteva già; la fase aggiunge il turno e la quota, che su questo ramo non sono rispettati.

---

### B-WR-02 — Il clone dei blocchi non usa la lettura unica dei blocchi validi: un blocco con titolo non valido fa fallire la creazione dell'aid e blocca per sempre la sconfitta del gruppo

**File:** `src/quests/outcomes/aid/aid-quest.ts:96-98` e `:117-131`; lettura canonica in `src/quests/prizes/rank-prizes.ts:57-61`; schema `src/models/quest/quest-rank-prize.model.ts:16-17`; scrittura `src/quests/outcomes/outcome-writer.service.ts:158-163`.

**Cosa succede.** `clonedPrizesOf` filtra i blocchi con il solo `isRecord` e `clonedRankBlockOf` copia `title: block.title` senza controllarlo. La lettura di foglio e risoluzione (`rankBlocksOf`, commentata come «unica lettura dei blocchi validi (W7)») scarta invece i blocchi col titolo non valido. Sono due regole diverse per la stessa cosa. Lo schema impone `title` `required` + `enum`: `questModel.create([draft], { session })` valida e lancia un `ValidationError`, che non è `StaleResolution` e quindi esce dalla transazione.

**Scenario.** Boss scritto a mano (D-06: i blocchi li scrive l'utente a DB) con un blocco dal titolo sbagliato (`"Mage"`, `"mago"`, o senza `title`) accanto a blocchi buoni. Vincere funziona: `prizeBlockFor` ignora il blocco rotto. Perdere no: `commitGroup` arriva a `createAid`, la validazione fallisce, la transazione abortisce, il job fallisce; lo sweeper riprova e fallisce ogni volta. Il party resta in corsia con le `PendingQuest` avviate e nessun esito. Stesso effetto sulla catena (`settleWounded` → `createAid`).

Verificato leggendo schema e codice; non eseguito. Da verificare se il report del boot (D-24) segnala già i blocchi col titolo non valido: anche se lo fa, è solo un log.

**Fix proposto.** Clonare a partire da `rankBlocksOf(original)` (o da un predicato esportato da `rank-prizes.ts`) invece che da `filter(isRecord)`, così un blocco illeggibile non entra nell'aid e la regola resta una sola. Aggiungere un caso in `aid-quest.spec.ts` con un blocco dal titolo non valido.

---

### B-WR-03 — Un boss con un posto a titolo null e iscritti già registrati non si scioglie più dopo le 24 ore (né parte)

**File:** `src/quests/party/party-timeout.service.ts:91-92`; stessa regola in `src/quests/party/quest-start.service.ts:173-178`; causa in `src/quests/acceptance/quest-eligibility.ts:108-112` (modifica della fase, D-24). Indizio nella spec: `src/quests/party/party-timeout.int-spec.ts:59` è passata da `title: null` a `title: 'rookie'` per restare verde.

**Cosa succede.** `registrationRuleOf` ora risponde `'invalid'` per boss e worldMission con un posto a titolo null. `disband` tratta `'invalid'` come `'stale'` ed esce prima del claim: nessun rilascio di corsie e `PendingQuest`, nessun push. `startParty` fa lo stesso (con un WARN). D-24 chiede solo che la quest sia **non accettabile**; qui diventa anche non scioglibile.

**Scenario.** Boss a DB con `requiredAdventurers: [{ title: null, count: 3 }]` e un iscritto registrato prima del deploy (o un boss ritoccato a mano dopo le iscrizioni). Nessuno può più unirsi (`QUEST_NOT_ACCEPTABLE`), il party non si completa, il timeout di 24 ore risponde `stale` a ogni giro di sweeper: l'iscritto resta con la corsia occupata finché non abbandona a mano (e l'abbandono è ammesso solo da fermo sul marker, non in viaggio).

Da verificare sui dati reali: il CONTEXT dice «12 boss a titolo unico», quindi oggi il caso dovrebbe essere assente; resta raggiungibile col contenuto scritto a mano.

**Fix proposto.** In `disband` sciogliere comunque quando la regola è `'invalid'` per il solo motivo del posto senza titolo (un party che non può completarsi va liberato), per esempio calcolando la capienza con `questSlotsOf` senza il controllo di D-24, oppure trattando `'invalid'` come «scaduto se la finestra è passata». Aggiungere il caso alla int-spec invece di cambiarne il fixture.

---

### B-WR-04 — La guardia «aid non avviata» dell'archiviatore non è coperta da nessuna spec

**File:** `src/characters/deletion/character-archiver.ts:313-321`; spec `src/characters/deletion/character-archiver.int-spec.ts:551-690`.

**Cosa succede.** I tre casi nuovi usano tutti un'aid con `startedAt: null` (riga 593 del fixture). Il caso intitolato «leaves a started rescuer untouched» non avvia l'aid: mette solo `startDate` sulla `PendingQuest` del soccorritore (dato legacy), che è protetto dal filtro `startDate: null` di `releaseMembersWithin`, non da `concludedUnstartedBy`. Togliendo `startedAt == null &&` dal predicato le tre spec restano verdi, mentre in produzione un'aid avviata e svuotata perderebbe `registeredAdventurers` (svuotato da `releaseRegisteredWithin`), cioè i soccorritori in countdown sparirebbero dalla quest.

Nello stesso caso, `expectRescuerRegistered` controlla `PendingQuest` e corsia ma non `registeredAdventurers` dell'aid, che in realtà viene svuotato (`registered-release.ts:105-111`): il nome dell'helper dichiara più di quanto prova.

Da verificare: se un'altra int-spec (per esempio `aid-rescue.int-spec.ts`, che archivia un ferito alla riga 211) copre di fatto l'aid avviata con soccorritori registrati.

**Fix proposto.** Un caso con `startedAt` valorizzato, soccorritore registrato con `PendingQuest` avviata e unico ferito archiviato: attesi `concludedAt` scritto, `registeredAdventurers` invariato, `released: []`, nessun WARN. Nel caso legacy, asserire esplicitamente lo stato di `registeredAdventurers`.

---

## Info

### B-IN-01 — Il giro dei soccorritori liberati dall'archivio dentro la risoluzione del soccorso non è mai non vuoto e non ha test

**File:** `src/quests/outcomes/rescue-resolution.service.ts:117-124`, `:156-162`, `:322-335`, `:353`, `:380`, `:651-657`, `:717-724`.

In `timeoutAid` e in `kill` l'aid corrente è già conclusa in sessione dal claim prima di `dieWithin`, e l'archiviatore cerca solo aid con `concludedAt: null` (`character-archiver.ts:249`): quindi non la vede e `archived.released` è sempre vuoto. Un ferito non può stare in un'altra aid aperta (un solo `awaitingAid`). È il motivo per cui il doppio rilascio e il doppio push non esistono (bene, e `aid-timeout.int-spec.ts:336-345` lo prova con un solo `questCancelled`), ma `state.archiveReleased`, `DeathRequest.released`, `WoundedStep.released` e `notifyReleased` sono codice difensivo mai esercitato. Proposta: tenerlo e aggiungere una spec con un dato anomalo (ferito presente in una seconda aid non avviata), oppure toglierlo e usare `archiveWithin`.

### B-IN-02 — `archiveWithin` non ha più chiamanti in produzione

**File:** `src/characters/deletion/character-archiver.ts:60-65`.

Dopo la fase tutti i chiamanti di `src/` usano `archiveWithinReporting`; `archiveWithin` resta usato solo da cinque int-spec. Un futuro chiamante che lo scegliesse libererebbe i soccorritori senza push. Proposta: far passare le spec da `archiveWithinReporting` e rimuovere il metodo, oppure annotare nel commento che scarta `released`.

### B-IN-03 — Il WARN di `releaseMembersWithin` è scritto dentro la transazione

**File:** `src/quests/party/registered-release.ts:63-67`.

Il log parte nel callback: su un WriteConflict rieseguito esce due volte, e resta anche se la transazione abortisce. Il resto della fase raccoglie le note e le scrive dopo il commit (`RescueNote`). Contenuto corretto (solo id). Proposta: ritornare i non liberati e far loggare il chiamante dopo il commit.

### B-IN-04 — Dopo il commit, `notifyQuestCancelled` può far fallire una mutation già riuscita

**File:** `src/characters/deletion/character-deletion.service.ts:70`, `:74-85`; `src/quests/party/registered-release.ts:115-127`.

`push.sendToUser` non lancia mai, ma `ownersOf` è una lettura Mongo senza `try`. Se fallisce dopo il commit, `deleteCharacter` risponde errore con il personaggio già archiviato; un nuovo tentativo risponde `CHARACTER_NOT_FOUND`. In `resolveRescue`/`timeoutAid` l'effetto è solo un job fallito (ritentato e poi `stale`). Proposta: `try/catch` con WARN di soli id attorno alla notifica, come `OutcomeWriter.notify`.

### B-IN-05 — Titolo di test e commento non allineati

- `src/quests/outcomes/combatant-plan.spec.ts:319-320`: l'`it.each` su heal, job, study, magic, crime e guard si intitola «concludes a lost **job** without aid…».
- `src/quests/outcomes/aid/aid-quest.ts:144`: il commento dice «in una catena si clona sempre l'originale (D-09)», ma il ramo individuale (`quest-resolution.service.ts:149-154`) clona la quest caricata, che per un'aid fatta a mano o svuotata è l'aid stessa (vedi B-WR-01).

---

## Controllato e trovato corretto

**(1) Creazione dell'aid.** I tre soli punti che chiamano `createAid` (`quest-resolution.service.ts:147`, `boss-resolution.service.ts:212`, `rescue-resolution.service.ts:554`) dipendono tutti dall'`aid` restituito da `planCombatant`, che passa da `opensAid` (`combatant-plan.ts:138`). `planConclusion` manda ogni sconfitta a `planCombatant`; arresto e guardia persa ritornano `aid: null`. `gm-completion` non produce sconfitte. Boss di gruppo perso: una sola aid con i posti e i blocchi (int-spec `boss-resolution.int-spec.ts:742`). Aid persa: nuova aid dall'originale con i caduti, feriti morti (D-10). Tipo assente o null: nessuna aid.

**(2) Sconfitta senza aid.** `planDefeatWithoutAid` → `planUnrewarded`: vita a `MIN_LIFE_POINTS`, corsia standard a null, ferite e consumi tenuti, magie spese con i recuperi, nessun xp/oggetto/moneta, nessun `awaitingAid`, contatori dei turni null, filtro con la guardia sull'xp. `resolveLoadedIndividual` cancella la `PendingQuest`, non crea l'aid, non programma il timeout (`aids: []`). Sweeper e processor entrano solo da `resolveStandard`, quindi un solo percorso. Coperto da `defeat-without-aid.spec.ts` (`toEqual` sull'intero `$set`), `combatant-plan.spec.ts`, `quest-combat.int-spec.ts:412` (job) e `crime-guard-conclusion.int-spec.ts:210` (crime). `planParticipant` continua a lanciare su una sconfitta senza aid, ma non è più raggiungibile da quel ramo.

**(3) Clone dei blocchi.** Le sorgenti sono sempre `lean` (`readQuest`, `readOriginal`). Blocchi e premi costruiti campo per campo; lo spread è solo su oggetti appena costruiti. `cure: null` nei blocchi e nessuna `cure` al primo livello (default dello schema). `randomLoot`, `relatedLore`, `recommendedLoot`, `rescue.characters` e `turn` sono copie. Aid di una solitaria: nessuna chiave `rankPrizes`. La quota riscala anche i blocchi senza toccare loot, pet e magia.

**(4) Archiviatore.** Tutto nella sessione del chiamante; registrati riletti in sessione; stessa funzione del timeout (`releaseRegisteredWithin`). Il predicato JS coincide con l'update che conclude (anche con doppioni o forme legacy). Soccorritore con `PendingQuest` avviata: non toccato, WARN di soli id. Push: `state.released` azzerato a ogni riesecuzione del callback, notifica solo dopo `connection.transaction`, quindi mai su abort (`character-deletion.resolver.int-spec.ts` osserva il DB al momento dell'invio). Archiviato che è lui stesso un soccorritore iscritto: il posto esce dall'aid non avviata (`releaseSeatsOf`), nessun push a sé stesso; la sua `PendingQuest` resta orfana come prima della fase (non introdotto qui). Moduli: `PendingQuest` registrato in `CharacterArchiveModule`, `PushModule` in `CharacterDeletionModule`, nessun ciclo fra moduli Nest (`registered-release.ts` è di sole funzioni).

**(5) Gare.** Archivio, timeout dell'aid, scioglimento del party, avvio del party e nuova iscrizione scrivono tutti il documento dell'aid nella propria transazione: il secondo va in WriteConflict, riesegue e rilegge in sessione (`startedAt`, `concludedAt`, registrati). Avvio prima → l'archivio rieseguito vede l'aid avviata e non libera. Archivio prima → il claim dell'avvio e del timeout falliscono (`concludedAt`). Timeout prima → la cancellazione trova il personaggio già morto e risponde `unlinked` senza rilasci. `deleteOne` con `startDate: null` copre il resto.

**(6) Log.** Solo id esadecimali e conteggi nei file dell'area; nessun nome, twitchId o token.


## Review area C — dungeon a turni, turno sull'aid, soccorritore, contatori, premio proporzionale

Repo `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/21-premi-per-rango-e-soccorsi`, diff `fb59b545..3517dff1`. Sola lettura: nessun file del repo toccato, nessun jest/tsc/lint/node lanciato. Tutto ciò che segue è stato letto nel codice; dove serve un'esecuzione per confermare è scritto «da verificare».

**Conteggio:** 0 critical, 2 warning, 5 info.

Giudizio d'insieme: l'aritmetica dei turni, la quota e l'ordine dei tiri sono corretti sul percorso normale (dungeon → aid → soccorso → catena). I due warning riguardano un percorso laterale che salta la porta della dungeon e la tenuta del contratto della porta quando il segnaposto verrà sostituito.

---

## Warning

### C-WR-01 — L'aid di dungeon rimasta senza feriti si risolve come individuale: combattimento unico contro tutti i gruppi, niente turni

**File:** `src/quests/outcomes/quest-resolution.service.ts:182-205` (`fight`), con `src/quests/outcomes/resolution-kind.ts:12-23` e `src/characters/deletion/character-archiver.ts:257-274`

**Verificato leggendo il codice.** `fight()` passa dalla porta della dungeon solo se `infos.type === QuestType.dungeon`. Un'aid di dungeon ha tipo `aid` e arriva alla porta solo da `RescueResolutionService.rescueBattleOf`. Ma `resolutionKindOf` manda a `resolveLoadedIndividual` ogni aid il cui `rescue.characters` è vuoto, e l'archiviatore svuota quella lista (`$pull`) anche su un'aid già avviata (`concludedUnstartedBy` lascia fuori di proposito l'aid avviata; il commento di `resolution-kind.ts:11` lo dichiara: «un soccorritore già in corsia si risolve come individuale»).

**Scenario:** dungeon da 4 gruppi persa al turno 0 (esplorazione) → aid con `rescue.turn { 0, exploration, 8 }`, monete e xp a 1/8. Il soccorritore parte; durante il countdown il ferito cancella il personaggio. Alla scadenza:
- il soccorritore combatte in UN solo `combat.resolve` contro tutti e 4 i gruppi insieme (D-12/D-13 gli chiedevano solo l'esplorazione del turno 0, nessuno scontro);
- se vince prende comunque il premio a 1/8 (monete e xp scritti alla nascita, soglie di loot e pet scalate da `planCombatant:179`, che legge `rescue.turn` anche su questo percorso), ma l'xp dei nemici è di tutti i gruppi;
- il foglio ha `turns*` e `stages*` null pur essendo un'aid di dungeon (D-21);
- se perde, `rescueTurnFromStages(battle?.stages)` è null (`stages` non c'è): la nuova aid è clonata dall'aid stessa (`buildAidQuest(loaded.quest, …, null)`), tiene il premio già scalato e perde `rescue.turn`, quindi anche il soccorso successivo è un combattimento unico contro tutti i gruppi con premio ridotto.

Nessuna int-spec copre questo percorso per l'aid di dungeon (`dungeon-aid.int-spec.ts` passa sempre da `resolveRescue`): l'esito sopra è dedotto dal codice, da fissare con un RED.

**Fix:** una sola funzione sceglie la battaglia per entrambi i servizi, sulla presenza del turno salvato e non sul percorso. Estrarre `rescueBattleOf` (oggi privata in `rescue-resolution.service.ts:512-541`) in un helper condiviso e usarlo in `fight()`:

```ts
const turn = rescueTurnOf(loaded.quest.rescue?.turn);
if (loaded.quest.infos.type === QuestType.dungeon || turn) {
    const exploration = this.dungeon.explore(
        { ...buildDungeonContext({ ... }), ...(turn ? { lastTurnIndex: turn.index } : {}) },
        this.chance,
    );
    return dungeonBattleOf(exploration, snapshot._id);
}
```

con lo stesso catalogo `faced` (`catalog.enemies.slice(0, facedEnemyCountOf(turn))`) passato a `planConclusion`, e alla sconfitta `nextRescueTurnOf` al posto di `rescueTurnFromStages` (che su un'aid darebbe il turno sul totale giusto solo per caso).

### C-WR-02 — Il contratto della porta non è imposto: una `failure` senza `failedTurn` (o con un `failedTurn` incoerente) sposta o perde il turno in silenzio; il turno da salvare è derivato in due modi diversi

**File:** `src/quests/outcomes/dungeon/dungeon-resolver.ts:30-36`, `src/quests/outcomes/dungeon/dungeon-turns.ts:62-83`, `:86-99`, `:117-128`

**Ipotetico col segnaposto di oggi** (che è coerente), **verificato nel codice** come comportamento per il motore dell'utente che lo sostituirà via DI (D-13: «la porta deve già ammettere una sconfitta in esplorazione»).

`DungeonResolution` ammette per tipo `verdict: 'failure'` con `failedTurn: null`. In quel caso:
- `turnCountersOf` cade nel ramo del successo: `lastTurn = turnsCompleted` (l'ultimo turno superato, non quello della caduta) e `lastTurnKind` del turno sbagliato;
- sulla dungeon, `rescueTurnFromStages` salva `index = turnsCompleted − 1`: il soccorritore si ferma UN TURNO PRIMA della caduta e la quota è più bassa di un turno; con `turnsCompleted = 0` (caduta al primo turno) l'indice −1 è scartato, l'aid nasce senza turno e diventa un combattimento unico contro tutti i gruppi a premio intero;
- sull'aid, `nextRescueTurnOf` rende null: la nuova aid (D-26) nasce senza turno e a premio intero.

In più i due percorsi derivano il turno da salvare in modo diverso: la dungeon ripassa dai contatori 1-based del foglio (`lastTurn − 1`) e sanifica con `rescueTurnOf` (T-21-48: «mai un turno incoerente a DB»); l'aid legge `failedTurn` grezzo senza sanificarlo (`nextRescueTurnOf:123-127`): un `kind` che non rispetta la parità, un indice oltre il turno salvato o non intero vanno a DB così come sono e alla rilettura `rescueTurnOf` li scarta (aid che ricade sul combattimento unico), oppure — indice `undefined` → quota `NaN` — `proportionalPrizesOf` (`share >= 1` è falso con `NaN`) chiama `fromCopper(NaN)`, che lancia dentro la transazione.

Nota collegata, irraggiungibile oggi: un successo con `turnsCompleted = 0` dà `lastTurn: 0` e `lastTurnKind: exploration` (`turnKindOf(−1)`), cioè un turno 0 su un filo dichiarato 1-based.

**Fix:**
1. unione discriminata sul tipo della porta, così il motore dell'utente non compila senza il turno:
```ts
type DungeonResolution = CombatResolution & DungeonProgress &
    ({ verdict: 'success'; failedTurn: null } | { verdict: 'failure'; failedTurn: FailedTurn });
```
(o una guardia in `dungeonBattleOf` che lancia su `failure` senza `failedTurn`);
2. una sola funzione per il turno da salvare, alimentata da `failedTurn` in entrambi i percorsi e sempre sanificata: `savedTurnOf(resolution, total) = rescueTurnOf({ index: failedTurn.index, kind: failedTurn.kind, total })`, con `total = resolution.turnsTotal` sulla dungeon e `saved.total` sull'aid; `rescueTurnFromStages` sparisce (e con lei la dipendenza di `dungeon-turns.ts` da `DungeonStages` di `outcome-plan.ts`);
3. `fallenCountersOf` e il ramo `failure` di `turnCountersOf` sono la stessa mappa (`turnsCompleted = index`, `lastTurn = index + 1`, `kind`) scritta due volte: tenerne una.

---

## Info

### C-IN-01 — `SHARE_EPSILON` non è coperto da nessun test; il commento va verificato

**File:** `src/quests/outcomes/aid/rescue-share.ts:7-8`, `:26-27`; `src/quests/outcomes/aid/rescue-share.spec.ts`, `aid-quest.spec.ts`, `dungeon-aid.int-spec.ts`

Verificato: tutte le quote provate sono binarie esatte (0.5, 0.625, 4/8, 5/8, 2/8). L'unico turno su un totale non potenza di 2 (`quest-dungeon.int-spec.ts:280`, `{ 3, fight, 6 }`) non asserisce il premio. Togliendo `+ SHARE_EPSILON` la suite resta verde. Da verificare: l'esempio del commento («5/6 × 6 = 4.999…») in IEEE 754 dovrebbe dare 5 esatto; esistono prodotti che cadono sotto l'intero, ma quello citato probabilmente non è uno di essi.

**Fix:** o un caso che fallisce senza l'epsilon (totale 6, 10 o 12 con un importo multiplo del totale, scelto eseguendo il calcolo), o — più pulito — aritmetica intera che rende l'epsilon inutile: portare numeratore e denominatore (`index + 1`, `total`; nel rapporto fra quote `nextIndex + 1`, `sourceIndex + 1`) e calcolare `Math.floor((amount * numerator) / denominator)`.

### C-IN-02 — Un `rescue.turn` malformato a DB ricade in silenzio sul combattimento unico contro tutti i gruppi, col premio fisso già scalato; `total` non è confrontato coi nemici dell'aid

**File:** `src/quests/outcomes/rescue-resolution.service.ts:440-447`, `:519-525`; `src/quests/outcomes/dungeon/dungeon-turns.ts:49-59`

Verificato: `rescueTurnOf` è completo sulla coerenza interna (interi, `total` pari e > 0, `0 ≤ index < total`, `kind` dell'enum e coerente con la parità; spec `dungeon-turns.spec.ts:38-63`). Con un turno presente ma non valido il soccorso diventa un `combat.resolve` unico con TUTTI i gruppi (più duro della dungeon a tappe), le soglie di loot e pet tornano intere (quota 1) mentre monete, xp e `prizeItem` restano quelli ridotti alla nascita, i fogli di `death` perdono i contatori. Non c'è nessun log: l'aid degradata non si distingue da un'aid qualunque. È un ripiego sicuro (nessuna eccezione, nessun premio gonfiato sulle voci fisse), ma muto.

Inoltre `total` non è confrontato con `2 × nemici validi` dell'aid: se una voce nemica dell'aid diventa orfana dopo la nascita (nemico tolto dal catalogo), il foglio del soccorritore porta `turnsTotal` della porta (es. 6) mentre quota e foglio di `death` usano `turn.total` (8). Nessun crash: `slice` e `filter` reggono un indice oltre la fine.

**Fix:** un WARN di soli id quando `aid.rescue?.turn` è valorizzato e `rescueTurnOf` rende null (e quando `turn.total !== 2 × catalog.enemies.length`), nelle note post-commit di `resolveRescue`.

### C-IN-03 — Commenti stantii sulle tappe «solo dalle dungeon»

- `src/models/quest-result/quest-result.model.ts:202` — «tappe superate e totali, solo dalle dungeon (D-12): null per ogni altro tipo»: da D-21 valgono anche sui fogli dei soccorritori di un'aid di dungeon (`quest.type = aid`), come prova `dungeon-aid.int-spec.ts:306`. È il commento del modello sul filo.
- `src/quests/outcomes/outcome-plan.ts:209` — «solo le dungeon a tappe (D-12): null altrove»: idem.
- `src/quests/outcomes/rescue-resolution.service.ts:387` e `:410` — «un solo combattimento per i soccorritori»: con un turno salvato è una camminata a turni (lo dice bene solo il commento di `:511`).
- `src/quests/outcomes/dungeon/dungeon-turns.ts:61` — «chiude sul turno turnsCompleted − 1» mescola indice 0-based e `lastTurn` 1-based nella stessa frase.

### C-IN-04 — Test il cui titolo promette più di ciò che provano

- `src/quests/outcomes/combatant-plan.spec.ts:455` «scales the loot and pet chances of a dungeon aid rescuer (D-20)»: i premi hanno solo `xpPrize` e `pet`, il loot non c'è. Se `planCombatant` passasse la quota solo al pet il test resterebbe verde (il loot è coperto da `cascading-loot.spec.ts` e da `dungeon-aid.int-spec.ts:548`, non da qui). Aggiungere un `randomLoot` o togliere «loot» dal titolo.
- `src/quests/outcomes/aid/aid-quest.spec.ts` «shares again from the original in a chain (D-20)»: sono due chiamate indipendenti a `buildAidQuest(dungeon, …)`; la seconda non dipende dalla prima, quindi non prova una catena ma di nuovo «la quota alla nascita» con un altro indice.
- `src/quests/outcomes/dungeon-aid.int-spec.ts:344-384` (D-10, D-26): asserisce il turno della nuova aid ma non il suo premio (2/8 dell'originale). Che il servizio cloni da `context.original` e non dall'aid già scalata non è provato a livello di servizio (i due percorsi danno lo stesso numero solo grazie al rapporto delle quote, provato in unità).
- Nessun caso d'integrazione col turno salvato a indice 0 (soccorritore che non affronta nessun gruppo: `faced` vuoto, `enemyFactsOf` null, quota 1/8) né con una dungeon da 1 gruppo (2 turni, quota 2/2 = premio intero). Letti nel codice funzionano; restano scoperti.
- Nessun caso per la caduta dei soccorritori in un turno di ESPLORAZIONE (D-26): la sconfitta del soccorritore è sempre uno scontro (`scripted.willEnd('failure')`).

### C-IN-05 — Porta di test e doppioni nelle spec

**File:** `test/quests/turn-failing-dungeon-resolver.ts:21-39`; `src/quests/outcomes/quest-dungeon.int-spec.ts`, `src/quests/outcomes/dungeon-aid.int-spec.ts:72-94`

- La fixture consuma l'indice e, se è fuori intervallo, delega in silenzio al segnaposto (`if (!turn) return this.placeholder.explore(...)`): un indice sbagliato in una spec produce una dungeon vinta invece di un errore. Meglio lanciare su un indice dato ma inesistente.
- Con un indice da far fallire la fixture sovrascrive `lastTurnIndex` del contesto (`turn.index − 1`): usata sul percorso del soccorritore con un indice oltre il turno salvato farebbe camminare oltre il limite senza segnalarlo. Oggi nessuna spec la usa lì; va scritto nel commento o imposto con `Math.min`.
- `SwappableDungeonResolver` è definita due volte quasi identica (le due int-spec); `turnsOf` / `NO_TURNS` sono ridefiniti in quattro spec. Spostarli in `test/quests/`.

---

## Controllato e trovato corretto

**(1) Aritmetica dei turni**
- `dungeonTurnsOf`: `2 × gruppi` turni, pari = esplorazione, dispari = scontro, il primo è un'esplorazione, `enemyIndex = floor(index / 2)`; 0 gruppi → lista vuota.
- Indice 0-based a DB (`rescue.turn.index`) e `lastTurn` 1-based sul filo: `turnCountersOf` (sconfitta: `turnsCompleted = index`, `lastTurn = index + 1`), `fallenCountersOf`, `rescueTurnFromStages` (`lastTurn − 1`) sono coerenti fra loro; andata e ritorno provati in `quest-dungeon.int-spec.ts` (scontro e esplorazione).
- Vittoria intera: `turnsCompleted = lastTurn = turnsTotal`, tipo `fight`. Vittoria parziale del soccorritore: `turnsCompleted = lastTurn = index salvato + 1`, tipo del turno salvato. Sconfitta: come sopra.
- `stagesCleared` / `stagesTotal`: invariati sulla dungeon, valorizzati sul totale dell'intera dungeon anche per i soccorritori (D-21); `stagesCleared = facedEnemyCountOf(turn)` sul successo del soccorritore.
- 0 gruppi validi: `combatContextOf` rende null prima della porta (successo automatico, contatori e tappe null), il ramo difensivo del segnaposto è coerente. 1 gruppo: 2 turni, quota 2/2 alla caduta nello scontro.

**(2) Validazione di `rescue.turn`**
- `rescueTurnOf` scarta non-oggetti, non interi, stringhe numeriche, `total ≤ 0`, `total` dispari, `index < 0`, `index ≥ total`, `kind` sconosciuto o incoerente con la parità. Unico lettore del campo: `combatant-plan.ts:179`, `rescue-resolution.service.ts:440` e `:666`, `aid-quest.ts:109` passano tutti da lì.
- Lo schema (`quest-rescue.model.ts`) ha `index ≥ 0`, `total ≥ 1`, `kind` dell'enum; `turn` assente di default; `QuestRescue` non è un `ObjectType`, non va sul filo.

**(3) Percorso del soccorritore**
- Stessa porta (`DungeonResolver.explore`) con `lastTurnIndex = turn.index` compreso (il soccorritore completa il turno della caduta, D-12); il segnaposto si ferma lì con verdetto `success`.
- `faced = catalog.enemies.slice(0, facedEnemyCountOf(turn))`: `catalog.enemies` è nell'ordine delle voci della quest (`readEnemies` rimappa su `entries`), `buildCombatContext` lo tiene 1:1, quindi i primi N del catalogo sono i gruppi affrontati. Xp dei nemici, xp del compagno, `enemies` del foglio, `knownEnemies` e lore di vittoria usano tutti `faced`.
- Aid senza turno: `combat.resolve` unico come prima, `dungeon.explore` mai chiamata (provato in `dungeon-aid.int-spec.ts:427`).
- Sconfitta dei soccorritori: feriti morti col turno salvato, nuova aid clonata dall'originale col turno della caduta e lo stesso `total` (D-10, D-26).

**(4) Quota**
- `rescueShareOf = (index + 1) / total`, 1 senza turno; mai 0 né divisione per zero (il turno arriva validato o dalla porta, `total ≥ 2`).
- Monete (in rame, poi `fromCopper`), xp e quantità di `prizeItem` per difetto alla nascita; `prizeItem` a 0 → null; valori mancanti o malformati lasciati come sono e poi azzerati da `drawRewards` (mai gonfiati); blocchi per titolo scalati voce per voce, `cure` resta null; costruzione campo per campo, nessuno spread su sottodocumenti idratati.
- `share ≥ 1` rende i premi intatti: una quota > 1 (rapporto fra quote con indice nuovo oltre il vecchio) non gonfia mai.
- Aid nata da un'altra aid: la catena normale clona l'ORIGINALE (denominatore 1); solo se l'originale è stato cancellato si clona l'aid già scalata e il rapporto `(i₂+1)/(i₁+1) ≤ 1` la riporta alla quota giusta (un doppio arrotondamento per difetto, mai per eccesso).
- Nessun doppio scalo: alla risoluzione `share` tocca solo le soglie di loot (`DROP_RATES[rarity] * share`) e pet (`QUEST_PET_WIN_CHANCE * share`); magia, sorteggio della magia e lore non sono scalati (D-20).
- Tiri: nessun `chance.next()` aggiunto o spostato in `rollLoot`, `petDrawOf`, `drawRewards`; con `share = 1` il prodotto è identico bit per bit alla soglia di prima.

**(5) Contatori per esito**
- Dungeon vinta e persa: valorizzati. Soccorritore di aid di dungeon che vince o perde: valorizzati (più le tappe).
- `rescued`: null (`planRescued` → `NO_TURN_COUNTERS`, scelta fissata da `rescue-plan.spec.ts` e `dungeon-aid.int-spec.ts:307`).
- `death` per soccorso perso (`kill` → `dieWithin`) e per timeout (`timeoutAid` → `dieWithin`, `AID_TIMEOUT_PROJECTION` include `rescue`): turno salvato del ferito; null fuori da un'aid di dungeon.
- Null altrove: `planUnrewarded` (arresto, guardia, sconfitta senza aid), boss e gruppi (`battleOf` non porta `stages`), completamento del GM, enemy/hunt/aid semplici, dungeon senza nemici validi; default `null` nello schema per gli scrittori che non li nominano (imboscata).

**(6) Ordine dei tiri di una dungeon intera**
- Dal diff del segnaposto: stessa sequenza di `combat.resolve` (un gruppo per chiamata, nell'ordine di `enemies`, stessi `quest` / `participants` / `chance`), stessi `afterStage` e `mergeEffects`; i turni di esplorazione fanno solo `turnsCompleted += 1` e `continue`, senza toccare `chance` (provato da «passes every exploration without drawing (D-29)»).

**Altro**
- Nessun `Date.now` / `Math.random` nei file dell'area; `lastTurnKind` con `null` ammesso nell'enum dello schema; nessun ciclo di import (gli import incrociati con `outcome-plan.ts` sono `import type`).
- `test/quests/turn-failing-dungeon-resolver.ts`: contatori coerenti (`turnsCompleted = index`, tappe del giocato), effetti dei turni precedenti conservati, sconfitta vera del segnaposto prima del turno scelto rispettata.


## Phase 21 — ruling dell'orchestratore sui finding della review (2026-11-13)

Report completi delle tre aree sopra in questo file (file:riga, scenari, fix proposti). Ogni fix di codice in TDD (RED `test(scope)` → GREEN `fix(scope)` / `refactor(scope)`), un commit per finding o coppia RED/GREEN. «VERIFY first» = prima prova con una lettura o una sonda che il difetto esiste; se non esiste chiudi `not_needed` con la prova. Nessun tiro nuovo, nessun cambio di SDL, nessuna scelta di prodotto nuova: se un fix la richiede, fermati su quel finding e chiudilo `skipped` col motivo.

| Id | Ruling |
|----|--------|
| C-WR-01 + B-WR-01 | **FIX (stesso difetto, un solo fix).** Un'aid col turno salvato (`rescue.turn` valido) resta un'aid di dungeon anche quando è rimasta senza feriti (ferito archiviato a soccorso avviato): il soccorritore già partito percorre i turni dalla stessa porta fino al turno salvato, coi contatori e la quota; se perde, la nuova aid salva il turno della sua caduta e la quota si ricalcola come rapporto (mai premio scalato senza turno). Il riconoscimento «aid di dungeon» ha UNA sola sorgente (`rescueTurnOf(aid.rescue?.turn)`). Int-spec nominata: ferito archiviato dopo l'avvio, soccorritore che vince e soccorritore che perde. |
| C-WR-02 | **FIX.** Il contratto della porta è imposto in un punto solo, dove si legge la `DungeonResolution`: una `failure` senza `failedTurn` o con `failedTurn` incoerente (indice fuori da `[0, turnsTotal)`, tipo diverso da quello del turno, `turnsCompleted` diverso dall'indice) è un errore esplicito e la transazione abortisce (mai un turno spostato o perso in silenzio); il turno da salvare sull'aid si deriva in UN modo solo. Unit con una porta finta malformata. È la protezione per il motore dell'utente che sostituirà il segnaposto. |
| C-IN-01 | **FIX (test)**: casi che coprono l'epsilon (quota non binaria, es. 5/6, e un valore esatto che l'epsilon non deve gonfiare); correggi il commento se l'esempio è sbagliato. |
| C-IN-02 | **FIX minimo**: un `rescue.turn` presente ma malformato a DB (o con `total` incoerente coi gruppi dell'aid) → WARN col solo id dell'aid, una volta per risoluzione, poi il comportamento di oggi (combattimento unico). Nessun aborto: l'aid deve comunque potersi risolvere. Un test. |
| C-IN-03, A-IN-05, B-IN-05 | **FIX**: riallinea commenti e titoli non più esatti. |
| C-IN-04 | **FIX (test)**: restringi o completa i titoli; aggiungi i casi scoperti a costo basso (indice 0, dungeon da 1 gruppo, soccorritori caduti in esplorazione con la porta di test). |
| C-IN-05 | **FIX**: un solo `SwappableDungeonResolver` e helper dei turni condivisi sotto `test/quests/`; la porta di test senza doppioni. |
| B-WR-02 + A-WR-02 | **FIX (stesso difetto).** Il clone dei blocchi sull'aid passa da `rankBlocksOf(sorgente)`: solo blocchi validi di una sorgente di gruppo; un titolo non valido o un doppione non fa fallire `createAid`; l'aid di una solitaria non eredita blocchi rimasti a DB. Test per i tre casi. |
| B-WR-03 + A-WR-01 | **FIX (stesso difetto).** Un boss o una worldMission con un posto a titolo null e iscritti già registrati non resta appeso: il timeout del party lo scioglie comunque con la routine di sempre (corsie e PendingQuest liberate, push `questCancelled`) e l'avvio continua a non partire; WARN col solo id della quest. La regola D-24 resta fail-closed per accettazione e avvio. Int-spec D-24 sui due lettori del party (avvio: non parte; timeout: scioglie). |
| B-WR-04 | **FIX (test)**: caso con aid già avviata (`startedAt` valorizzato): l'archivio non libera nessuno; verifica che diventi rosso togliendo la guardia. |
| B-IN-01 | **VERIFY first**: se il giro dei liberati dentro `rescue-resolution.service.ts` non può mai essere non vuoto, toglilo (niente codice morto) lasciando `archiveWithinReporting` solo dove serve; se può esserlo, aggiungi il test. |
| B-IN-02 | **FIX**: se `archiveWithin` non ha chiamanti in produzione, toglilo e porta le spec su `archiveWithinReporting`. |
| B-IN-03 | **FIX**: il WARN di `releaseMembersWithin` esce dopo il commit (lo riportano i chiamanti) oppure, se il costo è alto, resta e lo dichiari `not_needed` col motivo (un log dentro una transazione rieseguita si ripete: valuta). |
| B-IN-04 | **FIX**: `notifyQuestCancelled` dopo il commit è best-effort: un suo errore non fa mai fallire una `deleteCharacter` già riuscita (log col nome e il codice dell'errore, come gli altri invii push). Test. |
| A-IN-01 | **FIX (test)**: int-spec sul filo con la forma reale del boss misto generato (due blocchi pieni, tipi di oggetto misti) letta da `quests` come due viewer di titolo diverso. Se emerge un difetto reale del populate, correggilo in TDD. |
| A-IN-02 | **FIX (test)**: pin a seme fisso dell'ordine dei tiri del boss misto nel servizio (mondo con candidati boss): cancello, proporzione, premi del titolo inferiore, in coda alla quest. |
| A-IN-03 | **FIX**: il report del boot riporta anche i blocchi scartati (titolo non valido, doppioni) e le quest di gruppo a più titoli senza blocchi; sempre sola lettura, solo id e conteggi, tetto di righe invariato. |
| A-IN-04 | **FIX**: un solo elenco dei tipi di gruppo. |
