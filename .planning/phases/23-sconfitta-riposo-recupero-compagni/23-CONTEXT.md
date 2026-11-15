# Phase 23: Sconfitta, riposo e recupero dei compagni - Context

**Gathered:** 2026-11-14 (discuss interattivo fatto nella FE Phase 22, `Klimmeck-Guide/.planning/phases/22-companion-defeat-rest-and-recovery/22-CONTEXT.md`, stessa numerazione D-01..D-21: dove serve il verbatim dell'utente vale quel file)
**Status:** Ready for planning — ramo `feat/23-sconfitta-riposo-recupero-compagni` impilato su `feat/mission-start-push` (PR #41)
**Amended:** 2026-11-14 dopo la ricerca e le risposte dell'utente (D-23..D-33; D-21 emendata da D-31; la bozza del filo di `23-REPO-RULES.md` è sostituita dalla sua ultima sezione)

<domain>
## Phase Boundary

Il BE diventa l'unica fonte di verità per lo stato dei compagni: sconfitta (vita al minimo in uno scontro), riposo con recupero lineare nel tempo, pozioni sul compagno con attesa propria, nome del compagno, e le regole di viaggio dopo un'imboscata (strada residua a piedi, push per ogni imboscata, ridirezionamento per fame). Ambito esteso dall'utente nel discuss: nome del compagno (D-18..D-21) e regole di viaggio (D-13..D-16).

Fuori ambito: il motore di combattimento vero e il motore a piani delle dungeon (li scrive l'utente; resta il segnaposto dietro la stessa porta), ferite dei compagni.

</domain>

<decisions>
## Implementation Decisions

### Tempi di recupero
- **D-01 (utente):** ogni pet a catalogo ha il suo tempo di recupero pieno (dal minimo a vita piena) a DB. Semina da una tabella calcolata su **rarità + `maxXp` + `maxLifePoints`** (44 pet), rivista dall'utente su file prima della scrittura a DB dopo la merge; poi «la mano vince». Nessun migratore né seeder resta nel repo.
- **D-02 (utente):** un solo orologio, recupero lineare. Sconfitto = riposo forzato dal minimo; non equipaggiabile finché non è a vita piena (rifiuto con codice proprio).
- **D-03 (utente, «il compagno non è mai a vita 0, il minimo è 1 (non può morire un pet)»):** la vita del compagno non scende sotto 1; sconfitto = arrivato al minimo in uno scontro (marcatore esplicito sulla voce posseduta: vita 1 da sola non basta a distinguerlo). Vale in ogni punto in cui uno scontro si risolve: quest, boss, dungeon, imboscate, soccorsi, completamento guidato.
- **D-04 (utente):** recupera ogni compagno posseduto fuori dallo slot; quello equipaggiato mai. Il ferito non sconfitto si riequipaggia in ogni momento con la vita raggiunta (esempio dell'utente: 100 minuti da 1 a 100; a riposo da 20 per 20 minuti → 40).

### Pozioni
- **D-05 (utente):** `useItem` accetta un compagno come bersaglio; l'attesa è **del singolo compagno** (una data per voce posseduta), indipendente da `status.potionRecoveryUntil` del personaggio in entrambi i sensi. Stesse regole delle pozioni del personaggio (nessun consumo se non farebbe nulla, mai in missione in corso).
- **D-06 (utente):** il compagno sconfitto rifiuta le pozioni.
- **D-07 (utente):** bersagli = compagni posseduti sotto la vita piena e non sconfitti, equipaggiati o a riposo.

### Esiti, push, sequenze
- **D-10 (utente):** l'esito di uno scontro e il report di un'imboscata portano la vita del compagno dopo lo scontro e la sua sconfitta (con la data di ritorno).
- **D-11 (utente):** push nuova solo quando un compagno **sconfitto** torna a vita piena (categoria propria, col nome del compagno se c'è).
- **D-12 (utente):** in una dungeon il compagno sconfitto è fuori dai piani successivi; lo slot si svuota a fine missione.
- **D-13 (utente, «Resto del viaggio a piedi»):** cavalcatura sconfitta in un'imboscata vinta: esce subito dallo slot e la strada residua dal punto dell'imboscata si ricalcola a piedi (durata, arrivo, fabbisogno di cibo, lavoro di completamento ripianificato). Supera «velocità fotografata alla partenza» per questo caso.
- **D-14 (utente):** push per **ogni** imboscata subita, vinta o persa, con o senza compagno; se il compagno cade la push lo dice. Supera BE Phase 15 «nessun push in più».
- **D-15 (utente):** i report delle imboscate sono leggibili anche a viaggio in corso (la FE li mostra all'apertura della mappa); serve sapere quali sono già stati visti.
- **D-16 (utente):** dopo il ricalcolo, se con cibo e vita rimasti il personaggio non arriverebbe vivo alla meta (stesso controllo della partenza), viene ridiretto alla città più vicina per strada come dopo una sconfitta in imboscata; la quest verso cui viaggiava segue la regola della sconfitta (abbandonata).
- **D-17 (utente):** nel completamento guidato la simulazione propone la vita del compagno di ogni partecipante, l'oste la corregge (minimo = sconfitto), il completamento applica le stesse regole.

### Nome del compagno
- **D-18/D-19 (utente):** ogni compagno posseduto può avere un nome, dato all'acquisizione (acquisto o premio, saltabile) o più tardi, e modificabile; mutation dedicata.
- **D-20 (utente):** dove il BE scrive testi (push) usa il nome se c'è, altrimenti la specie.
- **D-21 (utente):** stesse regole del nome del personaggio: lunghezza, caratteri, stesso filtro dei contenuti; rifiuto con codice proprio.

(D-08 e D-09 sono solo FE: foglio della pozione, vita che sale dal vivo interpolata fra le date servite dal BE.)

### Aggiunte dopo la ricerca (2026-11-14) — ruling dell'orchestratore e risposte dell'utente

Evidenze in `23-RESEARCH.md` e nella FE `22-RESEARCH.md`. Stessa numerazione della FE `22-CONTEXT.md` (D-23..D-35; D-34 e D-35 sono solo FE). Dove queste e le decisioni sopra divergono, vincono queste.

- **D-23 (ricerca, C-2):** il compagno si identifica ovunque con l'**id del pet a catalogo** (`equipPet`, `useItem(itemId, petId)`, `RenamePetRequest { id, name, petId }`); una voce per specie resta un invariante. Nessun id di voce, nessun migratore: default indulgenti (una vita ≤ 0 si legge come vita piena). `normalisedOwnedPets` e lo schema della voce devono CONSERVARE i campi nuovi a ogni riscrittura dell'array (Pitfall 1, sonde P1 e P3): è il primo piano.
- **D-24 (ricerca, C-3, C-14):** vita a riposo calcolata a lettura/scrittura da un'ancora salvata (`currentLifePoints` alla data `lifeAsOf`) con UNA funzione pura; velocità `(max − 1) / T`, arrotondamento al più vicino. Marcatore interno della sconfitta: la data `defeatedUntil`; `defeated` sul filo è risolto a lettura (vero finché la data di vita piena è futura) e `equipPet` giudica con la stessa regola (mai con lo sweeper). Al recupero di uno sconfitto: push e `characterUpdated`, da uno sweeper con claim (ritardo massimo 60 s accettato, precedente della prigione); nessuna push se il compagno è stato venduto.
- **D-25 (ricerca, C-4, C-16):** `Pet.recoveryTime: Int` annullabile, in millisecondi; pet non curato = recupero istantaneo e WARN al boot. La tabella dei 44 pet (nessuno con rarità o vita nulle) la rivede l'utente su un file fuori dal repo; la scrive a DB l'orchestratore prima della UAT.
- **D-26 (ricerca, C-13, C-15; default tecnico):** un compagno che esce da uno scontro a 1 è sconfitto, anche se era entrato a 1; D-12 vale anche per gli scontri in sequenza della missione guidata.
- **D-27 (ricerca + FE W-5):** `QuestResult.companion: CompanionOutcome` servito **ogni volta che un compagno ha combattuto** (nullo altrimenti), con `lifeBefore: Int!` in più rispetto a §Q12: `defeated`, `fullLifeAt`, `lifeBefore`, `lifePoints`, `maxLifePoints`, `name` (nome mostrato).
- **D-28 (ricerca, C-5, C-9):** il report d'imboscata è un `QuestResult` scritto all'istante dell'imboscata (non più trattenuto fino all'arrivo); «visto» = `acknowledgedAt`; nessuno SDL nuovo per D-15. La FE di oggi li mostrerà già a viaggio in corso: accettato. `AmbushReport.onFoot: Boolean!` (default dell'orchestratore, l'utente può vetare la riga «Prosegui a piedi»). Niente `AmbushReport.companion`.
- **D-29 (ricerca, C-7, C-8, C-11):** campo interno `activeTravel.mount` scritto alla partenza (mai sul filo); viaggio ricalcolato con la forma della deviazione di oggi (strada dal punto dell'imboscata, `startTime` = istante dell'imboscata); `reachedCity` valorizzato anche nel ridirezionamento dopo un'imboscata vinta; prossima imboscata rimappata per km senza tiri nuovi; deviazione a piedi se la cavalcatura è caduta; viaggi in volo al deploy senza ricalcolo.
- **D-30 (utente, «Una categoria «Imboscate»», C-10):** `PushEventType.ambush` per ogni imboscata, vinta o persa; `ambushDefeat` resta nell'enum ma non parte più. `id` della push = id del `QuestResult`; testi col nome mostrato quando il compagno cade.
- **D-31 (utente, «Solo regole di forma», C-1; emenda D-21):** il nome del compagno segue le stesse regole di forma del nome del personaggio (nessun filtro di parole: non esiste nemmeno per il personaggio). Codice `PET_NAME_INVALID`. Rinomina NON bloccata da «Missione in corso» (C-12); `name: null` toglie il nome.
- **D-32 (ricerca + FE W-4):** pozione sul compagno: vita piena → `ITEM_NO_EFFECT`; attesa del compagno → `PET_POTION_RECOVERING` con `extensions.recoveryUntil` (allowlist estesa); sconfitto → `PET_DEFEATED`; `UseItemResult` porta i valori del bersaglio (`injuriesHealed` vuoto); le lore si sbloccano al personaggio; `MISSION_IN_PROGRESS` e `AWAITING_AID` valgono come per il personaggio.
- **D-33 (ricerca, C-6):** `MissionFightOutcome.companion: MissionCompanion`, `MissionFightEffects.companionLifeAfter`, `ParticipantOverrideInput.companionLifeAfter` (1..max; lo accetta anche il legacy `completePendingRequest`); bozze aperte al deploy lette senza i campi nuovi.

### Livelli del compagno (aggiunta dell'utente il 2026-11-14, a esecuzione avviata)

- **D-37 (utente, verbatim: «Essendo che anche i pet scalano di xp, è necessario avere una progressione come quella del personaggio, dove al raggiungimento di determinate soglie, si aumenta la vita massima. Utilizza la vita massima già presente come punto di partenza, poi da far scalare a crescere»; risposte: «10 livelli sul proprio tetto», «Fino al doppio»):** un compagno ha **10 livelli** su soglie del **proprio tetto di xp** (`Pet.maxXp`), con la stessa curva crescente del personaggio; livello 10 = tetto raggiunto. La **vita massima** parte da `maxLifePoints` a catalogo (livello 1) e cresce fino al **doppio** al livello 10 (Falco 100 → 200, Pegaso 5900 → 11800).
- **D-38 (orchestratore, default tecnici — l'utente può vetarli):** una sola funzione pura (xp, tetto, vita base → livello e vita massima): soglie `maxXp × t(i)/45` e vita `base × (1 + t(i)/45)` con `t(i) = i(i−1)/2`, i = 1..10, arrotondate; nessun dato a DB (derivato a lettura, come il livello del personaggio da `LEVEL_TABLE`). Sul filo `OwnedPet.level: Int!` e `OwnedPet.maxLifePoints: Int!` (massimo del compagno; `Pet.maxLifePoints` resta la base della specie). OGNI regola della fase che legge il massimo del compagno (riposo, tempo dal minimo al pieno, pozioni, `CompanionOutcome.maxLifePoints`, `MissionCompanion.maxLifePoints`, limiti della correzione dell'oste, scontri) legge il massimo **del compagno**. `T` resta uno per pet (dal minimo al massimo corrente). Al passaggio di livello la vita corrente non cambia (come il personaggio); un compagno a riposo a vita piena resta pieno. Pet con tetto di xp non valido: livello 1, vita base.

- **D-39 (utente, verbatim: «Visto che abbiamo implementato questa scelta dei livelli, salviamo il livello anche DB sia per personaggio che per i pet, il costo dovrebbe essere irrisorio»; emenda D-38 «derivato a lettura»):** il livello si salva a DB. Per il personaggio è GIÀ così (`status.level`, scritto a ogni esito in `outcome-plan.ts`, servito su `CharacterStatus.level`): nessun lavoro. Per il compagno la voce posseduta guadagna il campo `level`, scritto dalla stessa funzione pura ogni volta che l'xp del compagno cambia (premio di xp a fine scontro) e alla nascita della voce (acquisto, premio: livello 1); conservato a ogni riscrittura dell'array come gli altri campi nuovi (Pitfall 1). Voci di oggi senza il campo: letto indulgente (ricalcolato dall'xp) e scritto alla prima scrittura della voce, nessun migratore. La vita massima NON si salva: si deriva dal livello salvato e dalla base a catalogo (così una base corretta a DB vale subito).

### Claude's Discretion
- Forma sul filo (campi di `OwnedPet` e `Pet`, bersaglio di `useItem`, voci del compagno in `QuestResult` / report d'imboscata / bozza della missione, codici), decisa nel plan e riportata in `BACKEND-NOTES.md`.
- Calcolo della vita a riposo (pigro a lettura/scrittura o sweep), a patto che la FE riceva date da cui interpolare; pianificazione della push «in forze».
- Vendere un compagno a riposo o sconfitto resta ammesso.

</decisions>

<canonical_refs>
## Canonical References

- `../Klimmeck-Guide/.planning/phases/22-companion-defeat-rest-and-recovery/22-CONTEXT.md` — discuss completo, verbatim dell'utente
- `.planning/ROADMAP.md` §Phase 23 — regole dell'utente
- `.planning/phases/15-*/15-CONTEXT.md` (imboscate), `18-quest-heal-per-taglia/18-CONTEXT.md` D-15..D-19 (pozioni), `19-revisione-dei-modelli/19-CONTEXT.md` (`ownedPets`, xp), `20-cibo-e-vita-progressivi/20-CONTEXT.md` (piano del cibo sul viaggio), `22-completamento-guidato-missioni/22-CONTEXT.md` (bozza, simulazione, blocco)
- Codice: `src/characters/pets/`, `src/models/character/owned-pet.model.ts`, `src/models/pet.model.ts`, `src/characters/items/item-use.plan.ts`, `src/quests/outcomes/combat/combat-context.ts`, `src/travel/ambush/`, `src/travel/food/travel-food.ts`, `src/travel/travel-planner.service.ts`, `src/travel/travel-timing.ts`

</canonical_refs>

<specifics>
## Specific Ideas

- Il cibo dipende dalla durata (1 power ogni 3 minuti): il ricalcolo a piedi aumenta il fabbisogno, da qui D-16.

</specifics>

<deferred>
## Deferred Ideas

- Push per il compagno ferito che finisce il riposo (rifiutata, D-11).

</deferred>

---

*Phase: 23-sconfitta-riposo-recupero-compagni*
*Context gathered: 2026-11-14*
