# BACKEND-NOTES — Phase 15 Imboscate in viaggio (handoff per la FE Phase 16)

- **Fase BE:** 15-imboscate-in-viaggio (requisiti BE-AMBUSH-01..07; decisioni D-01..D-25 in `15-CONTEXT.md`; nomi del contratto fissati in `15-REPO-RULES.md`).
- **Data:** 2026-11-06. Documento di fine fase, scritto prima della UAT su device (richiede la FE Phase 16 e i dati di §6).
- **Branch:** `feat/15-imboscate-in-viaggio` (da `develop` `b492a46`) → PR verso `develop` a cura dell'orchestratore.
- **Stato della FE Phase 16:** **parcheggiata a 6/8** su `feat/16-travel-ambushes` (push `05308a2`): i piani 16-01..16-06 sono eseguiti su mock coi nomi delle REPO-RULES (review 0 CR / 0 WR / 3 IN, fixer applicato: il campo `quest` viene ignorato sui report d'imboscata; verification `human_needed` con 0 gap; security 24 minacce, 0 open, 7 deferred). Dopo la merge di questa fase riprende con **16-07** (gate di schema contro `origin/develop:src/schema.gql`, registry 45/45) e **16-08** (UAT su device con i dati di §6).
- **Schema:** `src/schema.gql` è **additivo con UNA eccezione dichiarata** (D-14): rispetto a `origin/develop` toglie 1 riga (`  quest: QuestResultQuest!`) e ne aggiunge 17. Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate (piano 15-11): `npm run test:cov` **360 suite / 4493 test** verdi (571,5 s), più 3 int-spec aggiunte dopo per la soglia di `src/travel/`; coverage `src/travel/` 98,62 / 84,53 / 99,42 (statements / branches / lines, soglie 97 / 84 / 98), `src/travel/ambush/` 97,23 / 80,71 / 98,68; boot reale 76/76; `npx tsc --noEmit` exit 0; prettier ed eslint puliti sugli 88 file `.ts` toccati (restano due warning preesistenti su `develop`). VALIDATION firmata il 2026-11-06. Una variabile d'ambiente nuova, opzionale (`AMBUSH_TIMEZONE`); nessuna dipendenza nuova.
- **Fonte:** ogni nome, messaggio e riga di SDL è copiato dal codice: `src/schema.gql`, `src/push/push-events.ts`, `src/models/quest-result/quest-result.model.ts`, `src/models/enums/quest-result-kind.enum.ts`, `src/travel/ambush/*.ts`, `src/travel/travel-completion.service.ts`, `src/travel/travel.service.ts`, `src/config/ambush-config.ts`. **Lo schema vince su questo documento.**

---

## 0. TL;DR per il FE

1. **SDL additivo con UNA eccezione:** `QuestResult` guadagna `kind: QuestResultKind!` e `ambush: AmbushReport`; **`QuestResult.quest` diventa nullable** ed è `null` se e solo se `kind == ambush`. Tipi nuovi `AmbushCity`, `AmbushReport`, `enum QuestResultKind`.
2. **Nessuna query né mutation nuova** (`EXPECTED_OWNER_ONLY_HANDLERS` invariato); `travelPreview`, `questTravelPreview`, `startTravel`, `acceptQuest`, `teleportCharacter` invariati sul filo; **`ActiveTravel` sul filo è IDENTICO** (`duration`, `endTime`, `road`, `startTime`, `to`): imboscata pendente e report trattenuti sono campi interni mai esposti.
3. **Push nuovo `ambushDefeat`** a ogni sconfitta (anche quando la città più vicina è la meta), **mai in vittoria**; `title`/`body` composti dal BE.
4. **Report consegnati sulla pipeline esistente** (`questResultReceived`, `unacknowledgedQuestResults`, `acknowledgeQuestResult`) **all'arrivo o al teleport**, uno per imboscata, con `resolvedAt` = istante dell'imboscata. Nessun `questEnd` per i report.
5. **Gli effetti (HP, ferite, monete, xp, livello, consumabili, usi delle magie) arrivano subito su `characterUpdated`** mentre il report aspetta l'arrivo (D-17).
6. **Dopo una sconfitta `activeTravel` è riscritto** dal punto dell'imboscata verso la città più vicina per strada, con `startTime` = istante dell'imboscata (quindi nel passato quando il FE lo riceve).
7. **Il FE non calcola nulla**: sorteggio, nemici, esito, premi, deviazione sono regole del server (§3 serve solo per capire e per la UAT).

---

## 1. Contratto GraphQL

Blocchi copiati verbatim da `src/schema.gql` (`sortSchema: true`: campi e valori in ordine alfabetico, tipi nell'ordine del file):

```graphql
type AmbushCity {
  id: ID!
  name: String!
}

type AmbushReport {
  at: DateTime!
  nearCity: AmbushCity!
  reachedCity: AmbushCity
}

enum PushEventType {
  ambushDefeat
  questCancelled
  questEnd
  streamerLive
  travelEnd
}

type QuestResult {
  acknowledgedAt: DateTime
  ambush: AmbushReport
  character: ID!
  consumablesUsed: [AssetQuantity!]!
  enemies: [QuestEnemy!]!
  hpAfter: Int!
  hpBefore: Int!
  id: ID!
  injuriesAdded: [InjuryType!]!
  kind: QuestResultKind!
  levelAfter: Int!
  levelBefore: Int!
  maxLifePoints: Int!
  outcome: QuestOutcome!
  quest: QuestResultQuest
  rescuedCharacters: [ID!]!
  resolvedAt: DateTime!
  rewards: QuestRewards!
  spellLearned: Spell
  spellsUsed: [SpellUsage!]!
  stagesCleared: Int
  stagesTotal: Int
  titleAfter: String!
  titleBefore: String!
  user: ID!
  xpAfter: Int!
  xpBefore: Int!
  xpGained: Int!
}

enum QuestResultKind {
  ambush
  quest
}
```

`type ActiveTravel` resta identico a `develop` (riferimento, non cambia):

```graphql
type ActiveTravel {
  duration: Float!
  endTime: DateTime!
  road: TravelPath!
  startTime: DateTime!
  to: ID!
}
```

Il diff rispetto a `develop` (`git diff origin/develop -- src/schema.gql`): **una riga tolta** (l'unica modifica non additiva, D-14) e 17 aggiunte.

```diff
+type AmbushCity {
+  id: ID!
+  name: String!
+}
+type AmbushReport {
+  at: DateTime!
+  nearCity: AmbushCity!
+  reachedCity: AmbushCity
+}
+  ambushDefeat
+  ambush: AmbushReport
+  kind: QuestResultKind!
-  quest: QuestResultQuest!
+  quest: QuestResultQuest
+enum QuestResultKind {
+  ambush
+  quest
+}
```

**Semantica dei campi per `kind: ambush`:**

- `ambush.at` = istante dell'imboscata (uguale a `resolvedAt`); `ambush.nearCity` = città del POI più vicino al punto (i marker di città contano; se il POI non ha città, il marker di città più vicino); `ambush.reachedCity` = città raggiunta dopo una sconfitta, **`null` in vittoria**.
- `quest` = **`null`**; `outcome` = `success` (vittoria) / `failure` (sconfitta).
- `enemies[] { enemy quantity }` come le quest; `hpBefore`, `hpAfter`, `maxLifePoints`, `injuriesAdded`, `consumablesUsed`, `spellsUsed`, `xpBefore/xpGained/xpAfter`, `levelBefore/levelAfter`, `titleBefore/titleAfter` come oggi.
- `rewards.coins` = monete della vittoria (zero in sconfitta); **`rewards.items = []`**, **`rewards.pet = null`**, **`rescuedCharacters = []`**, **`stagesCleared = null`**, **`stagesTotal = null`**, **`spellLearned = null`** sempre.
- Per `kind: quest`: `ambush = null`, `quest` valorizzato come prima. I documenti esistenti senza `kind` si leggono `quest` (default Mongoose applicato anche all'idratazione).

**Frammento d'esempio** (il FE lo ha già su mock, FE D-01/D-08):

```graphql
fragment QuestResultKindFields on QuestResult {
  kind
  ambush { at nearCity { id name } reachedCity { id name } }
  quest { id type title }
}
```

**Tolleranza (FE D-01):** un `kind` mancante o sconosciuto si legge `quest`; un risultato `kind: ambush` senza blocco `ambush` è malformato e si scarta voce per voce come oggi. Il FE della 16 ignora il blocco `quest` sui report d'imboscata (fix della review FE).

**Attenzione (FE D-15):** quando `QuestResultFragment` seleziona `kind`/`ambush`, ogni documento di risultato fallisce la validazione contro un BE senza questa fase: il branch FE non gira mai contro il BE vecchio.

---

## 2. Push di sconfitta

Payload (`src/push/push-events.ts`, builder `ambushDefeat(characterId, cityName)`), data-only come gli altri:

```json
{
  "type": "ambushDefeat",
  "id": "<characterId>",
  "title": "Imboscata!",
  "body": "Sei stato sconfitto: la via torna verso <città>",
  "ttlSeconds": 3600,
  "sentAt": "<ISO>"
}
```

- Categoria **personale** con `id` = personaggio (come `travelEnd`); `sentAt` lo aggiunge `PushService.sendToUser`.
- `title` e `body` sono **composti dal BE**: il FE li mostra senza parsing (FE D-02, D-10); `<città>` è il nome della città raggiunta (`reachedCity.name`). Senza punto finale nel corpo composto.
- `sendTestPush(ambushDefeat)` usa il corpo generico del catalogo: «Sei stato sconfitto: la via torna verso la città più vicina.».
- Inviato **dopo il commit**, best effort, **a ogni sconfitta**, anche quando la città più vicina è la meta (utente, D-12); **mai in vittoria**.
- Poi, all'arrivo della deviazione (viaggio `kind: free`), arriva il `travelEnd` di sempre e i report vengono consegnati (§4).

---

## 3. Semantica

**Modello per km (D-01).** Alla partenza (`startTravel` o viaggio automatico di `acceptQuest`) il server percorre i km interi `1 … ⌈distance⌉ − 1`; il km k è transitato all'istante `startTime + ⌊k / distance × durata⌋` (ms); al primo km in cui il tiro di caso è sotto il rischio dell'ora l'imboscata è fissata. **Mai `at ≥ endTime`** (km finale e parziale esclusi).

- Rischio per km **0,2% di giorno, 0,6% di notte** (notte = ore 22–06 nel fuso `AMBUSH_TIMEZONE`, default Europe/Rome).
- Probabilità per viaggio (giorno / notte piena): **16 km 3% / 9%**, **50 km 10% / 26%**, **204 km 34% / 71%**, **506 km 64% / 95%**; un viaggio di 2,7 h partito alle 21:00 cade per il 63% di notte.
- Esempio dell'istante: sul mondo di test (Alba→Borgo, 20,015 km in 20,015 h, partenza 10:00Z) l'imboscata al km 1 è alle **10:59:59.999Z**, non alle 11:00:00 (arrotondamento per difetto).
- **Soglie di 10 km (D-03):** nessun sorteggio se `distance` < 10 km; nessun risorteggio se restano meno di 10 km; **nessuna imboscata sulla deviazione** dopo una sconfitta.
- **Una sola imboscata pendente alla volta**; **più imboscate per viaggio** con risorteggio dopo ogni vittoria. Esempio verbatim dell'utente (D-02): «Su un percorso di 300km, i primi 100 non avviene nulla, poi hai un'imboscata. Finita l'imboscata si risorteggia e passano altri 130 km prima della successiva. Poi il personaggio riceve un'imboscata dopo 50km (l'ultimo sorteggio è andato male) e nell'ultimo tratto non ne riceve.»
- **Punto dell'imboscata:** il punto della polilinea alla frazione planare `km / distance` (lunghezza in gradi piani, stesso algoritmo di `TravelRoute.pointAt` del FE): all'istante `at` la pedina sta esattamente dove riparte la deviazione.
- Le anteprime non tirano mai il caso e non svelano nulla (D-15).

**Nemici (D-06..D-08).** Zona = i `type` del POI più vicino al punto (marker di città compresi); pool = nemici non leggendari della zona + animali della zona + habitat `city`; **mai leggendari**; `all` di riserva se il pool di zona non è componibile. Composizione come la Phase 13 (singolo nella fascia oppure branco con somma nella fascia) con la **fascia [Facile, Medio] del livello** in xp dei nemici (`src/travel/ambush/level-bands.ts`, PE × `XP_SCALE` arrotondato):

| Livello | xp | Livello | xp | Livello | xp | Livello | xp |
|---|---|---|---|---|---|---|---|
| 1 | 4–7 | 6 | 42–85 | 11 | 113–225 | 16 | 225–451 |
| 2 | 7–14 | 7 | 49–106 | 12 | 141–282 | 17 | 282–549 |
| 3 | 11–21 | 8 | 63–127 | 13 | 155–310 | 18 | 296–592 |
| 4 | 18–35 | 9 | 77–155 | 14 | 176–352 | 19 | 338–690 |
| 5 | 35–70 | 10 | 85–169 | 15 | 197–394 | 20 | 394–803 |

Pool non componibile né in zona né di riserva ⇒ **nessuna imboscata**: nessun report, nessun effetto, risorteggio dal punto come dopo una vittoria. DB di sviluppo (discuss): 206 nemici (178 non leggendari), 642 POI, 167 città marker, 964 strade.

**Scontro (D-09).** Porta `CombatResolver` (placeholder oggi, motore invariato) con il contesto delle quest; unico partecipante il viaggiatore; HP correnti già al netto del cibo (Phase 14).

**Vittoria (D-10).** HP e ferite del motore applicati subito; **premi per titolo** più gli xp dei nemici battuti (× quantità):

| Titolo | Rame | xp base |
|---|---|---|
| rookie | 150 | 40 |
| adventurer | 300 | 80 |
| paladin | 750 | 200 |
| mage | 1800 | 480 |
| hero, legend | 3750 | 1000 |

Monete via wallet, xp con progressione: **livello e HP massimi possono salire, il titolo resta fermo** (avanza solo con la story del titolo, C2). **Viaggio invariato** (stessi `endTime` e polilinea), poi risorteggio.

**Sconfitta (D-11, D-25).** In una sola transazione:

- HP del motore **mai sotto 1** e ferite; nessun `awaitingAid`, nessun soccorso, nessuna morte.
- **Città più vicina per tempo di strada** dal punto (velocità con pet e ferite nuove), **meta e partenza comprese** (se è la meta la pedina prosegue fin lì). Bordi: se il punto non aggancia il grafo si ripiega sui vertici della polilinea; se il punto aggancia proprio il nodo della città la deviazione ha **durata zero** (`endTime = at`, arrivo immediato); se nessuna città è raggiungibile la pedina **prosegue verso la meta originale** sulla strada residua con l'`endTime` di prima (D-25, il push nomina la città della meta).
- **`activeTravel` riscritto**: `kind: free`, polilinea punto → città, **`startTime` = istante dell'imboscata** (nel passato rispetto a quando il FE lo riceve: il FE interpola da `startTime` + `duration`), `endTime = startTime + durata`, `duration`, `to` = marker della città.
- **Quest della corsia standard abbandonata** nella stessa transazione (`PendingQuest` cancellata, posto liberato, `quests.pendingQuest = null`).
- **Cibo non rimborsato**, nessun costo (né cibo né HP) sulla deviazione, nessun risorteggio.

---

## 4. Report e consegna

- **Report trattenuti** in un campo interno del viaggio fino all'**arrivo** o al **teleport** (D-13, «tutto all'arrivo»): nessun report è visibile prima.
- All'arrivo il completamento inserisce **un `QuestResult` per imboscata** nella stessa transazione dell'arrivo, con **`resolvedAt` = istante dell'imboscata**: nella coda FE i report precedono qualsiasi risultato di quest dello stesso arrivo. I report di un arrivo sono **committati insieme prima che il change stream emetta** (FE D-12).
- Campi dei report consegnati: `rewards.items = []`, `rewards.pet = null`, `rescuedCharacters = []`, `stagesCleared/stagesTotal = null`, `spellLearned = null`, `quest = null`; **monete e xp a zero in sconfitta** (FE D-13).
- **Report di due viaggi** non confermati finiscono nello stesso carosello (C2 del FE, FE D-16, accettato): non c'è id di viaggio sul filo. Raro; l'ordine resta cronologico.
- **Effetti subito, report dopo (D-17):** HP, ferite, monete, xp, livello, consumabili e usi delle magie arrivano subito su `characterUpdated` (Diario, monete) mentre il report attende l'arrivo.
- **Nessun push `questEnd`** per i report; `travelEnd` come oggi (solo viaggi liberi, quindi anche la deviazione). L'arrivo al marker di una quest dopo una vittoria resta muto: il carosello aspetta nell'app (FE D-07).
- **Delivery invariata:** change stream owner-only `questResultReceived`, `unacknowledgedQuestResults`, `acknowledgeQuestResult` (handoff Phase 9.2).

---

## 5. Trigger, concorrenza e robustezza

- **Job `ambush`** sulla coda `travel` (jobId deterministico `ambush-<characterId>-<startTimeMs>-<atMs>`, delay fino ad `at`) accodato dopo il commit della partenza; è solo il trigger: **reconciler al boot e sweep** ogni `TRAVEL_SWEEP_INTERVAL_MS` (default 60 000 ms) risolvono ogni imboscata con `at ≤ now`.
- **Job duplicato, in anticipo o obsoleto = no-op**: la risoluzione riafferma nel filtro `activeTravel.startTime` e `activeTravel.ambush.at`. Dopo una vittoria il job della prossima imboscata, dopo una sconfitta il job `complete` della deviazione, si accodano dopo il commit; i job vecchi decadono per identità.
- **Il completamento aspetta l'imboscata pendente** (il filtro richiede che non ci sia imboscata pendente): se l'imboscata si risolve dopo `endTime`, la risoluzione ri-accoda il completamento. Lo sweep dei viaggi non seleziona più i viaggi scaduti con un'imboscata pendente (stessa condizione nel suo filtro): niente transazione a vuoto né log «non più valido» a ogni tick; li chiude l'imboscata risolta o annullata (review B-IN-03).
- **Fail-open (D-18):** lo sweep conta gli errori di risoluzione; al **terzo errore** annulla l'imboscata con log ERROR (solo codice) e ri-accoda il completamento: il viaggio completa senza report. I WriteConflict ritentati dal driver non contano. Se la registrazione stessa del tentativo fallisce, lo sweep logga ERROR `Imboscata <jobId>: registrazione del fallimento non riuscita: <codice>` e prosegue con i personaggi successivi dello stesso tick (review A-WR-01).
- **Teleport** (`teleportCharacter`) **transazionale**: annulla l'imboscata pendente (job no-op) e consegna i report trattenuti nella stessa transazione; resta **rifiutato con `QUEST_IN_PROGRESS`** a corsia standard occupata (dopo una sconfitta la corsia è libera e il teleport consegna).
- Log del BE: solo jobId, esito e città (`Imboscata <jobId> risolta: won`, `Imboscata <jobId> risolta: lost verso <città>`, `Imboscata <jobId> risolta: skipped (<motivo>)` con motivo `pool non componibile`, `nessuna città vicina`, `catalogo vuoto` o `personaggio senza proprietario`, review A-IN-01).

---

## 6. Dati per la UAT

**Nessun seeder, nessuna migrazione.** I dati li scrive **l'orchestratore a DB con uno script fuori dal repo**, dopo build e riavvio del BE dal branch (§7). Campi indicati coi soli nomi; id con il segnaposto `<id>` / `<characterId>`.

**(a) Imboscata forzata.** Su un viaggio reale in corso di **almeno 10 km**, seminare l'**intero** sotto-documento `status.activeTravel.ambush` = `{ at: <istante nel passato>, km: <intero>, attempts: 0 }`, con `1 ≤ km < road.distance` e `at` compreso fra `startTime` e adesso. Lo sweep la risolve entro un intervallo (≤ 60 s). Il **punto** deriva da `km / distance`, non da `at`: scegliere `km` coerente con la posizione voluta. Con `at` nel passato una sconfitta produce una deviazione con `startTime` nel passato (atteso: il FE interpola da quello).

**(b) Sconfitta forzata (C4).** Il placeholder tira la vittoria con `potere / (potere + HP dei nemici)`: gli **HP del personaggio non contano**. Togliere l'equipaggiamento indossato (`assets.wearedEquipment`, tutti i pezzi con `damages`) e le magie attive (`assets.activeSpells`) porta il potere a 0 ⇒ sconfitta certa. HP bassi rendono visibile la barra (gli HP non scendono mai sotto 1). La **vittoria non è mai garantita** (probabilità < 1): per il caso «vinto» lasciare armi e magie e ripetere se serve.

**(c) Due imboscate per il carosello.** Dopo la prima risoluzione (vittoria: il viaggio resta, eventuale risorteggio cancellabile), una **seconda semina** con `km` maggiore e `at` nel passato (ma dopo la prima); oppure, equivalente, due report già presenti in `status.activeTravel.ambushReports[]` con `endTime` del viaggio nel passato: all'arrivo diventano due `QuestResult` e due pagine.

**(d) Tempi spostati a mano.** Spostare `startTime`/`endTime` a mano orfana i job Bull, ma gli sweep per `ambush.at` ed `endTime` risolvono comunque (attesa ≤ un intervallo di sweep).

**(e) FE precedente alla 16.** Scarta i report d'imboscata in silenzio (non conosce `kind`/`quest` nullable) e li mostra tutti insieme dopo l'aggiornamento finché non sono confermati (Pitfall 8).

**(f) Verifiche a DB e GraphQL.**

- `questresults` con `kind: 'ambush'`, `quest: null`, `ambush.at` = istante seminato, `resolvedAt` uguale; in sconfitta `ambush.reachedCity` valorizzato e `rewards.coins` a zero.
- `characters.status.activeTravel`: dopo una vittoria stessi `startTime`/`endTime`, eventuale nuovo `ambush`; dopo una sconfitta `startTime` = `at`, `to` = marker della città, nessun `ambush`, `quests.pendingQuest` `null`.
- Log del BE: `Imboscata <jobId> risolta: won` / `Imboscata <jobId> risolta: lost verso <città>`.
- Probe GraphQL (bearer del proprietario):

```graphql
{ unacknowledgedQuestResults { id kind outcome resolvedAt quest { title } ambush { at nearCity { name } reachedCity { name } } } }
```

| Caso | Dati | Atteso |
|------|------|--------|
| vinto | (a) con armi e magie | `characterUpdated` subito (HP, monete, xp); viaggio invariato; carosello d'una pagina all'arrivo con le ricompense |
| perso | (a) + (b) | push + banner «Imboscata!» con la città; pedina che riparte dal punto verso la città; corsia libera; carosello con «Portato a» |
| due imboscate | (c) | due pagine in ordine cronologico, un «Continua» conferma entrambe |
| teleport | (a) pendente, poi teleport dell'oste | imboscata annullata, report trattenuti consegnati subito |

---

## 7. Deploy

- **Variabile opzionale `AMBUSH_TIMEZONE`** (`.env.example` con `AMBUSH_TIMEZONE=`): vuota = Europe/Rome; un fuso IANA non valido **rifiuta il boot**.
- **Indice nuovo** `character_active_travel_ambush` (`{ deletedAt: 1, 'status.activeTravel.ambush.at': 1 }`) creato al boot dal verifier degli indici dello sweep (D-19).
- **Nessuna migrazione, nessun one-off, nessun seeder**: i viaggi in volo al deploy non hanno imboscate e completano come prima.
- **Runbook post-merge = build + riavvio** a cura dell'utente o dell'orchestratore **a BE fermo** (mai `npm run build` mentre il processo gira da `dist/`: `deleteOutDir` lo cancellerebbe). I dati della UAT (§6) non sono parte del deploy.
- Moduli: `AmbushModule` montato in `AppModule` (non importato da `TravelModule`).

---

## 8. Deviazioni e punti aperti

**Deviazioni registrate nei SUMMARY 15-01..15-11** (nessuna cambia il contratto delle REPO-RULES):

- **Iniezione opzionale di `ConfigService`** in `AMBUSH_CONFIG` (15-03): senza ConfigModule vale il default Europe/Rome (gli harness nudi non si rompono).
- **Ordine dei tiri di caso** (15-04, 15-10): la composizione tira forma poi pool→forma; nelle spec la sequenza `[0, 0]` dà il lupo singolo al km 10 o il bandito ai km 1 e 16; un viaggiatore di prova deve avere `xp: 0, level: 1` (altrimenti la prima vittoria alza il livello e la successiva salta).
- **Numeri di fixture ri-derivati** (15-05, 15-07): nessuna ferita reale vale 0,5 sulla velocità (`brokenLeftLeg` 0,8, paralisi 0,9): le attese di durata sono calcolate, non letterali.
- **Rami `skip`** (15-06): proprietario assente, città assente o catalogo vuoto ⇒ nessuna imboscata, risorteggio o completamento ri-accodato.
- **Push di prova** (15-07): il corpo composto di `ambushDefeat` differisce dal catalogo; il catalogo tiene il corpo generico.
- **`kind`/`ambush` anche nella risposta senza populate** (15-09, Rule 1): senza, `kind!` mancava sul filo.
- **Ordine dei valori al boot** (15-09): `enum QuestResultKind { ambush quest }` in ordine alfabetico nello SDL; `ambushDefeat` è la prima riga di `PushEventType` nello SDL ma l'ultimo membro nel codice.
- **Gate** (15-11): la soglia di `src/travel/` era rossa al primo `test:cov` (96,90 / 82,38 / 97,60): tre int-spec aggiunte (proprietario assente D-08, POI senza città D-06, nessuna città raggiungibile D-25), coverage rimisurata per cartella (ripiego previsto), nessun bug di produzione.

**Osservazioni per la FE e la UAT:**

- **(a) La pedina può retrocedere.** Al km 16 del mondo di test la deviazione dopo una sconfitta **torna indietro** al nodo del grafo agganciato (`[0, 6.75]`) prima di proseguire verso la meta (`[0, 9]`): è l'aggancio al grafo (C7). Sul device la pedina può visibilmente retrocedere di qualche centinaio di metri dopo una sconfitta.
- **(b) Istante arrotondato.** L'istante al km k è `startTime + ⌊k / distanza × durata⌋`: km 1 su 20,015 km = 10:59:59.999Z, non 11:00:00.
- **(c) Ordine degli enum.** `QuestResultKind` nello SDL è alfabetico (`ambush`, `quest`); `PushEventType.ambushDefeat` è la prima riga dello SDL ma l'ultimo membro nel codice: il FE non deve dipendere dall'ordine.
- **(d) Campi vuoti.** I report consegnati hanno `rewards.items = []`, `rewards.pet = null`, `rescuedCharacters = []`, `stagesCleared/stagesTotal = null`, `spellLearned = null`, `quest = null`.
- **(e) Fail-open.** Al terzo errore lo sweep annulla l'imboscata con log ERROR e ri-accoda il completamento: il viaggio arriva senza report.

**Punti aperti:**

- BE Phase 16: le vittorie in imboscata dovranno contare per lo sblocco delle lore dei nemici battuti.
- Fuori fase (deferred del CONTEXT): imboscate sulla deviazione, costi sulla tratta deviata, loot dagli assalitori, visibilità per il GM, calibrazione per zona, fascia «Difficile» notturna.
- UAT su device: dopo la merge, con la FE 16-08 e i dati di §6.
