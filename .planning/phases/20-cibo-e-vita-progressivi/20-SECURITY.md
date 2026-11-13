---
phase: 20
slug: cibo-e-vita-progressivi
audited: 2026-11-13T00:30:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/20-cibo-e-vita-progressivi
head: 4232adc9
base: 466be7e7
threats_total: 50
threats_mitigated: 47
threats_accepted: 2
threats_transferred: 1
threats_operational: 1
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
accepted_ids: [T-20-14, T-20-29]
transferred_ids: [T-20-50]
operational_ids: [T-20-50]
unregistered_ids: [N-20-01, N-20-02, N-20-03, N-20-04]
updated: 2026-11-13T00:30:00Z
---

# Audit di sicurezza — Phase 20 «Cibo e vita progressivi in viaggio» (BE)

Audit in sola lettura dei blocchi threat model dei piani `20-01`…`20-11` sul codice FINALE di `feat/20-cibo-e-vita-progressivi` a `4232adc9` (base `466be7e7`), dopo i fix di `20-REVIEW-FIX.md` (13 corretti, 2 `not_needed`). Nessun file modificato oltre a questo, nessun commit, **nessun jest, tsc, build o lint lanciato** (`npm run test:cov` in corso a cura dell'orchestratore sullo stesso albero), nessuna lettura di `.env` o dell'ambiente, nessun avvio del BE, nessun accesso a database. L'evidenza di esecuzione è quella registrata in `20-REVIEW-FIX.md` (unit 274 suite / 3 591 test; integration 141 suite / 2 037 test; `tsc` 0; SDL senza diff). Qui il codice è verificato con lettura e grep; le spec sono citate per file:riga del titolo e **non sono state eseguite da questo audit**.

**Gli ID sono 50:** `T-20-01`…`T-20-50`, tutti distinti, nessuno saltato.

| | Numero | ID |
| --- | --- | --- |
| `mitigate` chiuse dal codice | 47 | tutte tranne le tre sotto |
| `accept` | 2 | T-20-14, T-20-29 (la premessa di T-20-29 è cambiata con la review: vedi N-20-01) |
| `transfer` | 1 | T-20-50 (semine della UAT: all'orchestratore, da eseguire) |
| `open` | 0 | — |

Chiuse 47 / 50, accettate 2 / 50, trasferite 1 / 50, aperte 0.

Mitigazioni cambiate dalla review, registrate qui sulla forma finale:

- **T-20-19** è più forte del piano: oltre al `try/catch` per personaggio, `foodLegOf` scarta uno `startTime` che non è una data valida (A-WR-01), così il caso ricade nel warn col solo id invece di fermare lo sweep. Resta un bordo fuori dal `try` (N-20-04).
- **T-20-20** copre due righe in più di quelle del piano: il warn «una volta per viaggio» (A-IN-03) e le tre righe d'errore di `TravelSweeper` passate a `describeError` (A-IN-05).
- **T-20-26** è più forte del piano: il catalogo del cibo dell'imboscata non si legge più «una volta fuori», ma dentro il callback dalla dispensa in sessione (B-IN-01).
- **T-20-29** («nessun log nuovo», `accept`): il fix B-IN-02 ha aggiunto una riga di log nell'imboscata. Il contenuto resta entro `20-REPO-RULES.md` riga 27; vedi N-20-01.

## Registro delle minacce

Stato: `CLOSED` = mitigazione presente nel codice; `CLOSED (accepted)` = rischio accettato dal piano e registrato qui; `CLOSED (transferred)` = trasferimento documentato, esecuzione a carico dell'orchestratore.

| ID | STRIDE | Componente | Disposizione | Evidenza (file:riga) e spec che la pinna | Stato / Nota |
| --- | --- | --- | --- | --- | --- |
| T-20-01 | Information disclosure | `ActiveTravelFood` sul filo | mitigate | `src/models/character/active-travel-food.model.ts:1-26`: solo `@Schema`/`@Prop`, nessun import da `@nestjs/graphql`; `active-travel.model.ts:77-78` `food` con solo `@Prop`. `git diff 466be7e7 HEAD -- src/schema.gql` vuoto; grep di `settledKm`, `foodConsumedAt`, `uncoveredKm`, `coveredKm`, `hpLostTotal`, `ActiveTravelFood` su `src/schema.gql`: 0. Spec `active-travel.schema.spec.ts:190`, `:222`; SDL confrontato dal boot di test (`test/app.int-spec.ts:77`) | CLOSED |
| T-20-02 | Tampering (regola) | totali della fame diversi dalla Phase 14 | mitigate | `src/travel/food/travel-food.ts:54-62` (metri interi), `:95-108` (`km ≥ distanceKm` vale `hpLostTotal`), `:121-133` (`uncoveredKm` salvato). Spec `travel-food.spec.ts:42`, `:197`, `:208`, `:224` (partizioni deterministiche) | CLOSED |
| T-20-03 | Tampering | incrementi negativi dopo la vittoria | mitigate | `travel-food.ts:111-118` (0 se `toKm <= fromKm`); `travel-food-settlement.ts:109` (`settledKm` non regredisce). Spec `travel-food.spec.ts:219`, `travel-food-settlement.spec.ts:154` | CLOSED |
| T-20-04 | Denial of service | piano parziale creato da Mongoose su un legacy | mitigate | `active-travel.model.ts:77` `required: false`, nessun default sul genitore. Spec `active-travel.schema.spec.ts:194`, `:201` | CLOSED |
| T-20-05 | Tampering | doppio addebito fra sweep, imboscata, arrivo, teleport | mitigate | `travel-food-settlement.ts:182-211`: uguaglianza su `food.settledKm` e `foodConsumedAt: null` nel filtro a pasto dovuto; fame calcolata da `leg.food.settledKm` (`:93-97`). Spec `travel-food-settlement.spec.ts:154`, `:194`, `:424`, `:474`; int `travel-food.sweep.int-spec.ts:190`, `:206` | CLOSED |
| T-20-06 | Denial of service | morte per fame | mitigate | `travel-food-settlement.ts:259-261` `Math.max(MIN_LIFE_POINTS, …)`, unico punto di calcolo per i quattro percorsi. Spec `travel-food-settlement.spec.ts:159`; int `travel-food.sweep.int-spec.ts:261`, `travel-completion.int-spec.ts:535` | CLOSED |
| T-20-07 | Tampering | pozione cancellata dal pasto | mitigate | `travel-food-settlement.ts:263-269` (`ownedItems` dalla lettura passata dal chiamante), `:194-197` (`soldQuantityGuards` sulle righe mangiate). Spec `travel-food-settlement.spec.ts:424`; int `travel-food.sweep.int-spec.ts:390` | CLOSED |
| T-20-08 | Tampering | piano parziale su un legacy | mitigate | `travel-food-settlement.ts:193` (nessun path del piano con `food` nullo), `:163-179` usato solo da sweep e vittoria dell'imboscata col piano presente. Spec `travel-food-settlement.spec.ts:465` | CLOSED |
| T-20-09 | Tampering (contenuto) | piano malformato a DB | mitigate | `travel-food-settlement.ts:137-146`, `:271-289` (`foodDraftOf`: interi non negativi, distanze finite, `hpLostTotal` coerente con `uncoveredKm`, data o null). Spec `travel-food-settlement.spec.ts:307`, `:349` | CLOSED |
| T-20-10 | Tampering | collisione delle guardie | mitigate | `travel-food-settlement.ts:182-199`: una sola lista (vita + extra del chiamante) passata a `soldQuantityGuards`. Spec `travel-food-settlement.spec.ts:445` | CLOSED |
| T-20-11 | Tampering | doppio assestamento all'arrivo | mitigate | `travel-completion.service.ts:93-111`: assestamento nello stesso callback, dopo il `findOneAndUpdate` d'identità (`travel.updates.ts:86-96`) che combacia una volta sola. Int `travel-completion.int-spec.ts:563` | CLOSED |
| T-20-12 | Tampering | pasto che cancella una pozione (arrivo) | mitigate | `travel-completion.service.ts:162-187`: dispensa letta in sessione (`travel-pantry.reader.ts:103-121`), guardie di quantità e vita nel filtro, rigetto se il filtro non combacia. Int `travel-completion.int-spec.ts:519`, `:579` | CLOSED |
| T-20-13 | Denial of service | arrivo bloccato da un piano malformato | mitigate | `travel-completion.service.ts:162-163` (`foodLegOf` nullo → nessun assestamento, arrivo come legacy). Spec `travel-food-settlement.spec.ts:307`; int `travel-completion.int-spec.ts:619` (legacy) | CLOSED — nessuna int-spec dell'arrivo con un piano malformato: il ramo è lo stesso del legacy |
| T-20-14 | Information disclosure | log dell'arrivo | accept | il diff di `travel-completion.service.ts` non aggiunge chiamate al logger; l'errore `arrival food settlement lost its guards` (`:186`) è un testo fisso, e lo sweeper lo logga solo come nome e codice (`travel-sweeper.ts:83-85`) | CLOSED (accepted) |
| T-20-15 | Tampering | lost update fra pozione e fame | mitigate | `travel-food.sweep.ts:115-175`: una transazione per personaggio, viaggio e dispensa letti in sessione, scrittura guardata da `settledKm` e dalla vita grezza letta. Int `travel-food.sweep.int-spec.ts:177`, `:390` | CLOSED |
| T-20-16 | Tampering | doppio addebito fra sweep concorrenti | mitigate | `travel-food.sweep.ts:155-170` + `travel-food-settlement.ts:206`; single-flight `travel-sweeper.ts:59-64`. Int `travel-food.sweep.int-spec.ts:190`, `:206`, `:227` | CLOSED |
| T-20-17 | Tampering | fame oltre l'imboscata | mitigate | `travel-food-settlement.ts:126-134` (`reachedKmOf` limita a `ambush.km` finito). Spec `travel-food-settlement.spec.ts:295`; int `travel-food.sweep.int-spec.ts:248` | CLOSED |
| T-20-18 | Denial of service | rumore di `characterUpdated` ogni minuto | mitigate | `travel-food.sweep.ts:102` (nessuna transazione se `settlementIsDue` è falso), `travel-food-settlement.ts:99-105`, `:118-123`. Spec `travel-food-settlement.spec.ts:126`, `:288`; int `travel-food.sweep.int-spec.ts:137` | CLOSED — due scritture senza cambi sul filo restano per ruling (A-IN-02), dichiarate nell'handoff |
| T-20-19 | Denial of service | un personaggio rotto blocca lo sweep | mitigate | `travel-food.sweep.ts:94-111` (`try/catch` per personaggio), `travel-sweeper.ts:97-105` (passo «fame» isolato dai completamenti), `travel-food-settlement.ts:139` (`startTime` validato). Int `travel-food.sweep.int-spec.ts:343`, `:432`; spec `travel-sweeper.spec.ts:224` | CLOSED — bordo residuo in N-20-04 |
| T-20-20 | Information disclosure | log dello sweep | mitigate | `travel-food.sweep.ts:83` (conteggio), `:107-109` (id + `describeError`), `:185-187` (solo id), `food-curve-change.ts:18-23` (id + due interi validati da `foodDraftOf`); `src/mongo/mongo-errors.ts:21-25` (solo nome e codice). Int `travel-food.sweep.int-spec.ts:286`, `:432`; spec `travel-sweeper.spec.ts:97`, `:127`, `:149` | CLOSED |
| T-20-21 | Tampering | piano parziale creato su un legacy (sweep) | mitigate | `travel-food.updates.ts:20-25` (selezione con `$gte` sul campo del piano), scrittura guardata da `food.settledKm` uguale al letto. Int `travel-food.sweep.int-spec.ts:269` | CLOSED |
| T-20-22 | Tampering (regola) | vita d'ingresso «più avanti» del punto | mitigate | `src/travel/ambush/ambush-food.ts:33-45` (bersaglio = `ambush.km` salvato, mai l'ora; km non finito → nessun passo). Spec `ambush-food.spec.ts:86`, `:128`; int `ambush-resolution.int-spec.ts:849` | CLOSED |
| T-20-23 | Tampering | doppio pasto fra sweep e imboscata | mitigate | `ambush-plan.ts:292-303` (guardie del cibo nel filtro), `ambush-food.ts:47-55`, `:81-91` (pasto della sconfitta solo se il pasto non è avvenuto). Spec `ambush-plan.spec.ts:715`, `:721`; `ambush-food.spec.ts:155` | CLOSED |
| T-20-24 | Tampering | piano parziale sulla deviazione o sul legacy | mitigate | `ambush-plan.ts:281-284` (path del piano solo in vittoria e solo con `progress`), `:345-354` (viaggio della sconfitta riscritto senza `food`). Spec `ambush-plan.spec.ts:705`, `:743`; int `ambush-resolution.int-spec.ts:930`, `:945` | CLOSED |
| T-20-25 | Tampering | collisione delle guardie col filtro dell'imboscata | mitigate | `ambush-plan.ts:292-303`: l'unica lista viene da `settlementGuardsOf`. Spec `ambush-plan.spec.ts:721`, `:340` | CLOSED |
| T-20-26 | Tampering | esito diverso a un retry del callback | mitigate | `ambush-resolution.service.ts:423-447`: esito e curva azzerati a ogni esecuzione, passo «cibo» e catalogo ricalcolati dallo snapshot in sessione (più forte del piano, B-IN-01). Int `ambush-resolution.int-spec.ts:869` | CLOSED |
| T-20-27 | Tampering | doppio addebito fra sweep della fame e imboscata | mitigate | `travel-food-settlement.ts:126-134` + `ambush-plan.ts:301`. Int `travel-food.sweep.int-spec.ts:248`; spec `ambush-plan.spec.ts:721` | CLOSED |
| T-20-28 | Denial of service | harness appeso per un provider non risolvibile | mitigate | `travel-planning.module.ts` fornisce ed esporta `TravelPantryReader` e `TravelFoodSweep`; `ambush.module.ts:44` e `travel.module.ts:48` lo importano; nessun provider nuovo altrove | CLOSED (prova = boot delle int-spec registrato in `20-REVIEW-FIX.md`) |
| T-20-29 | Information disclosure | log dell'imboscata | accept | la premessa «nessun log nuovo» non vale più: `ambush-resolution.service.ts:511-518` scrive dopo il commit la riga della curva riscritta (B-IN-02). Contenuto: id esadecimale e due interi. Int `ambush-resolution.int-spec.ts:899` | CLOSED (accepted) — vedi N-20-01 |
| T-20-30 | Elevation of privilege | `teleportCharacter` | mitigate | `git diff 466be7e7 HEAD -- '*.resolver.ts' src/authz src/auth` vuoto; `travel-admin.resolver.ts:18` `@Roles(RoleType.innkeeper)`; nessuna mutation nuova. Int `teleport.resolver.int-spec.ts:687`, `:770`, `:798` | CLOSED |
| T-20-31 | Tampering | teleport concorrente con sweep o imboscata | mitigate | `travel.service.ts:252-270` (identità `startTime` + `settlementGuardsOf` nel filtro), `:291-321` (viaggio e dispensa letti in sessione), transazione `:233-241`, istante letto fuori dal callback (`:229`). Int `teleport.resolver.int-spec.ts:447`, `:465` | CLOSED — nessuna int-spec concorrente dedicata al teleport: le guardie sono le stesse provate sullo sweep (`travel-food.sweep.int-spec.ts:206`) |
| T-20-32 | Tampering | piano parziale (teleport) | mitigate | `travel.updates.ts:151-164`: `closingSet` porta solo vita e dispensa (`travel-food-settlement.ts:149-160`), `status.activeTravel` diventa null nello stesso update. Spec `travel.updates.spec.ts:261`, `travel-food-settlement.spec.ts:391` | CLOSED |
| T-20-33 | Denial of service | teleport bloccato da un piano malformato | mitigate | `travel.service.ts:301-303` (`foodLegOf` nullo → filtro semplice). Int `teleport.resolver.int-spec.ts:478` (legacy e personaggio fermo) | CLOSED — come T-20-13, il ramo malformato è quello del legacy |
| T-20-34 | Tampering | partenza con un piano falso | mitigate | `travel.service.ts:142-176`: piano da `planFor` in sessione; `TravelRequest` e resolver senza diff. Int `travel.service.int-spec.ts:325` | CLOSED |
| T-20-35 | Denial of service | partenza che uccide di fame | mitigate | `travel.service.ts:154-160` (`TRAVEL_STARVING` nella stessa transazione) + T-20-06. Int `travel.service.int-spec.ts:399` | CLOSED |
| T-20-36 | Tampering | due partenze concorrenti con due piani | mitigate | `travel.updates.ts:52-65` (`'status.activeTravel': null` nel filtro della stessa scrittura). Int `travel.service.int-spec.ts:197`, `:498`, `:529` | CLOSED |
| T-20-37 | Tampering | totali diversi dalla Phase 14 (fine a fine) | mitigate | Int `travel.service.int-spec.ts:836` (scatti intermedi asseriti dopo B-WR-01), `:880` | CLOSED |
| T-20-38 | Tampering | claim con un piano falso | mitigate | `quest-acceptance.service.ts:142-154`, `:238`, `:515`; `AcceptQuestRequest` e resolver senza diff. Int `quest-acceptance.service.int-spec.ts:1660` | CLOSED |
| T-20-39 | Tampering | due claim concorrenti con due piani | mitigate | filtro della corsia nella stessa scrittura del claim (`quest-acceptance.service.ts:502-518`). Int `quest-acceptance.service.int-spec.ts:1951`, `:2001` | CLOSED |
| T-20-40 | Denial of service | claim che uccide di fame | mitigate | `quest-acceptance.service.ts:390-397` (pre-verifica), `:499-500` (rifiuto in transazione). Int `quest-acceptance.service.int-spec.ts:1750`, `:1783` (i casi che il piano citava a 1726 e 1759) | CLOSED |
| T-20-41 | Tampering (manutenzione) | codice morto del consumo alla partenza | mitigate | grep di `mealGuardsOf`, `mealSetOf`, `eatenAtDeparture`, `PlannedMeal` su `src/` e `test/`: 0 | CLOSED |
| T-20-42 | Tampering (contratto) | `src/schema.gql` | mitigate | diff dalla base vuoto; nomi del piano assenti (vedi T-20-01) | CLOSED |
| T-20-43 | Information disclosure | codice, log e documenti | mitigate | nessun file `.env`, chiave o JSON nel diff; `process.env.` aggiunto nel diff di `src` e `test`: 0; `process.env.` in `src/` fuori da `src/config/`: 0; URI nel diff: 0; `src/config`, `.env.example`, `package.json` senza diff (lo sweep usa `TRAVEL_SWEEP_INTERVAL_MS`, già esistente) | CLOSED |
| T-20-44 | Tampering | scrittura della vita non clampata | mitigate | `$inc` e `lifePointsWithin` aggiunti nel codice di produzione del diff: 0; unica scrittura della vita da fame = `settlementSetOf` (`travel-food-settlement.ts:153-155`) col valore di `lifeAfterHunger`. Spec `travel-food-settlement.spec.ts:171` | CLOSED |
| T-20-45 | Elevation of privilege | teleport | mitigate | come T-20-30: resolver, guardie e liste dell'autorizzazione senza diff | CLOSED |
| T-20-46 | Repudiation | commit | mitigate | `git log 466be7e7..HEAD`: 72 commit, trailer vietati 0, subject oltre 72 caratteri 0 | CLOSED |
| T-20-47 | Denial of service (qualità) | coverage | mitigate | `package.json` senza diff; coverage per cartella in `20-REVIEW-FIX.md` (`src/travel/` 98,75 / 86,99 / 99,37; `src/quests/acceptance/` 99,06 / 92,79 / 99,73) | CLOSED — `test:cov` completo in corso a cura dell'orchestratore, esito non letto da questo audit |
| T-20-48 | Information disclosure | `BACKEND-NOTES.md` | mitigate | grep di URI, host e credenziali sul file: 0; operatori fuori dai code span: 0 | CLOSED |
| T-20-49 | Tampering (processo) | requisiti chiusi senza gate | mitigate | `REQUIREMENTS.md` toccato da un solo commit della fase (`75d5e0dd`, piano 11), dopo il gate dei fix registrato in `20-REVIEW-FIX.md` | CLOSED (evidenza di processo) |
| T-20-50 | Tampering | semine della UAT sul DB reale | transfer | `BACKEND-NOTES.md` §4 (righe 72-90): UAT e semine all'orchestratore, stato «da eseguire», nessun esecutore tocca il DB reale; formato di `activeTravel.ambush` dichiarato al passo 5 | CLOSED (transferred) — da eseguire a cura dell'orchestratore |

## Controlli trasversali

| Tema | Esito |
| --- | --- |
| Il piano del cibo non arriva da alcun client | Nessun `@InputType`, argomento o campo nuovo; `git diff` vuoto su resolver, `src/models/request`, SDL. Il piano nasce solo da `planFor` in sessione (partenza libera e claim) |
| Autorizzazione delle mutation esistenti | `startTravel` e `travelPreview` `@OwnsCharacter(ownerOnly)` (`travel.resolver.ts:17-19`), `acceptQuest` `@OwnsCharacter(ownerOnly)` (`quest-acceptance.resolver.ts:18-21`), `teleportCharacter` `@Roles(RoleType.innkeeper)` + audit: tutti senza diff |
| Vita mai sotto `MIN_LIFE_POINTS` | un solo calcolo (`lifeAfterHunger`), nessun `$inc`; la vita si scrive solo con perdita positiva e con la guardia sul valore grezzo letto |
| Atomicità | sweep, imboscata, arrivo e teleport scrivono dentro `connection.transaction` con viaggio, vita e dispensa letti in sessione |
| Isolamento degli errori nello sweep | per personaggio (`settleSafely`) e per passo (`settleHungerSafely`); residuo in N-20-04 |
| Log | cinque righe nuove o cambiate: solo id esadecimale, conteggi, km interi, `describeError`; nessun messaggio grezzo del driver |
| Variabili d'ambiente | nessuna nuova; `src/config` e `.env.example` senza diff; nessun `process.env.` fuori dai provider di config |
| Memoria del «warn una volta» | `MALFORMED_PLAN_WARNINGS_KEPT = 1_000`, svuotamento al tetto (`travel-food.sweep.ts:51`, `:181-183`); int `travel-food.sweep.int-spec.ts:303`, `:319`; vedi N-20-02 |
| Scrittori della dispensa in viaggio | il negozio rifiuta con un viaggio attivo (`shop-transaction.service.ts:297`), `useItem` accetta solo le cure (`item-use.plan.ts:150`): la premessa di D-19 regge sul codice attuale; vedi N-20-03 |

## Minacce nuove non dichiarate da alcun piano

| ID | STRIDE | Origine | Descrizione | Mitigazione presente | Valutazione |
| --- | --- | --- | --- | --- | --- |
| N-20-01 | Information disclosure | B-IN-02 | Riga di log nuova nell'imboscata (`ambush-resolution.service.ts:511-518`), mentre T-20-29 accettava il rischio con il motivo «nessun log nuovo» | testo da una sola sorgente (`food-curve-change.ts:18-23`): id Mongo esadecimale e due interi validati; entro `20-REPO-RULES.md` riga 27; int `ambush-resolution.int-spec.ts:899` | informativa; va solo riallineato il motivo dell'accettazione (fatto qui) |
| N-20-02 | Denial of service | A-IN-03 | Stato nuovo in memoria di processo: `Set` delle chiavi «viaggio già segnalato». La chiave contiene `String(startTime)` quando `startTime` non è una data, cioè un valore letto dal database senza limite di lunghezza | al massimo 1 000 chiavi, poi svuotamento; la chiave non viene mai loggata; il valore lo può scrivere solo chi ha accesso al database | bassa, accettabile; dopo lo svuotamento un viaggio può essere segnalato di nuovo (voluto) |
| N-20-03 | Tampering (regola) | B-IN-02 parziale, D-19 | Il fail-safe della dispensa corta gira solo nel momento `progress` (`travel-food-settlement.ts:89-92`). All'arrivo e al teleport una dispensa più corta del piano paga la fame del piano salvato, senza riscrittura e senza log. Su un viaggio tutto coperto il pasto avviene solo all'arrivo: una dispensa svuotata in viaggio darebbe un viaggio senza fame | oggi irraggiungibile senza modifiche a mano del database: in viaggio non si vende né si compra e `useItem` accetta solo le cure | bassa oggi; **vincolo per le fasi future**: ogni mutation nuova che toglie oggetti dalla dispensa durante un viaggio (scarto, regalo, scambio) riapre questa voce |
| N-20-04 | Denial of service | A-WR-01 (residuo) | `traveller._id.toHexString()` sta fuori dal `try` (`travel-food.sweep.ts:93`): un documento con un `_id` che non è un ObjectId lancerebbe fuori da `settleSafely`, e `settleHungerSafely` salterebbe la fame di tutti a ogni tick. Stesso schema nel `catch` dei completamenti (`travel-sweeper.ts:84`, preesistente) | il modello impone `_id` ObjectId; un `_id` diverso si ottiene solo inserendo un documento a mano; l'errore del passo non tocca i completamenti e viene loggato | bassa, non bloccante; correzione eventuale: calcolare l'id dentro il `try` |

Nessuna delle quattro è bloccante (`block_on: high`).

## Aperte

Nessuna.

## Differite

Nessuna. Residuo operativo, non una minaccia aperta: T-20-50 (semine e UAT su device) resta da eseguire a cura dell'orchestratore, e l'esito di `npm run test:cov` completo (T-20-47) va letto dall'orchestratore prima della PR.

## Flag di minaccia non registrati

Dai SUMMARY: solo `20-03-SUMMARY.md` ha la sezione «Threat Flags» e dichiara «nessuna superficie nuova»; gli altri dieci non hanno la sezione. Le sole voci non registrate sono N-20-01…N-20-04, nate dai fix della review o dalla lettura del codice finale.
