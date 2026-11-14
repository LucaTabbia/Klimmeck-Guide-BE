# Phase 23: Sconfitta, riposo e recupero dei compagni - Research

**Researched:** 2026-11-14
**Domain:** stato dei compagni lato BE (NestJS 11, Mongoose 8, Apollo code-first, change stream, sweeper): orologio di riposo lineare pigro, sconfitta su ogni percorso di combattimento dietro la porta `CombatResolver`, pozioni sul compagno, nome, push «in forze», regole di viaggio dopo un'imboscata (strada residua a piedi, push per ogni imboscata, report visibili in viaggio, ridirezionamento per fame), flusso guidato dell'oste
**Confidence:** HIGH sul codice (letto sul branch `feat/23-sconfitta-riposo-recupero-compagni` = `develop` `2c462cbe` + commit di contesto; una sonda di integrazione con tre casi eseguita e cancellata), MEDIUM sulle proposte di forma (SDL, regole di arrotondamento, ricalcolo del cibo a piedi: default tecnici dichiarati), LOW sulla formula dei tempi di recupero (proposta di gioco da rivedere dall'utente; catalogo reale non letto)

## Summary

Il compagno oggi è una voce **senza id** di `assets.ownedPets` (`OwnedPet` con `@Schema({ _id: false })`, `src/models/character/owned-pet.model.ts:8`), con `pet`, `xp`, `currentLifePoints`; un personaggio ne possiede **al massimo uno per specie** (acquisto rifiutato con `PET_ALREADY_OWNED`, `src/economy/trade/trade-pets.ts:32-43`; premio idempotente, `src/quests/outcomes/outcome-plan.ts:349-361`), e `equipPet` identifica il compagno con l'id del catalogo (`EquipPetRequest.petId`, `src/models/request/equip-pet-request.model.ts`). **Nessuno scrive mai `currentLifePoints` dopo l'acquisizione** (unici scrittori: `newOwnedPetEntry` e la normalizzazione, `src/characters/pets/owned-pet-entry.ts:29-65`): il segnaposto del combattimento ignora il compagno (`placeholder-combat-resolver.ts:128-166`, pinnato da «ignores the companion and draws the same sequence (D-20)»). Quindi i dati esistenti hanno tutti vita piena (o 0 se il catalogo aveva `maxLifePoints` nullo all'acquisto) e **nessun migratore è necessario**: campi nuovi assenti = default indulgenti, e la chiave del compagno resta l'id del pet a catalogo.

La trappola principale è che **ogni scrittore che riscrive l'array dei posseduti cancellerebbe i campi nuovi** (nome, sconfitta, data di riposo, attesa della pozione): `normalisedOwnedPets` ricostruisce le voci con le sole tre chiavi di oggi (SONDA P1) e lo schema Mongoose attuale scarta le chiavi ignote in una scrittura con cast (SONDA P3). Negozio, xp del compagno e pet in premio passano tutti da lì: la prima attività della fase è far portare a `normalisedOwnedPets` e allo schema tutte le chiavi nuove. Il resto si incastra su strutture esistenti: tutti i percorsi di combattimento convergono su `ParticipantEffects` → `planParticipant` / `planUnrewarded` (quest, boss, dungeon, soccorsi, guardia, crime, sconfitta senza soccorso, completamento GM e guidato) più il piano separato delle imboscate (`ambush-plan.ts`); basta **un campo opzionale `companionLifeAfter` sulla porta** e **una funzione condivisa «compagno dopo lo scontro»** accanto a `companionXpAward`. La push «in forze» ricalca la liberazione dalla prigione (sweeper sul marcatore + claim atomico): SONDA P2 prova che un claim con `arrayFilters` sulla voce dovuta riesce una sola volta e lascia intatte le altre voci.

Le regole di viaggio (D-13..D-16) sono la parte più costosa: la velocità è fotografata alla partenza e **non è persistita**, e `equipPet` è permesso in viaggio, quindi oggi non si può sapere se il compagno caduto era la cavalcatura della partenza → serve un campo interno nuovo `activeTravel.mount` scritto alla partenza. D-15 si serve con la modifica minima: il `QuestResult` dell'imboscata si scrive **subito** nella transazione dell'imboscata invece di essere trattenuto fino all'arrivo, così `unacknowledgedQuestResults`, `questResultReceived` e `acknowledgeQuestResult` (marcatore «visto» = `acknowledgedAt`) funzionano senza SDL nuovo.

**Primary recommendation:** modulo puro `src/characters/pets/companion-life.ts` (vita a riposo, predicato «sconfitto», nome mostrato) + campi Mongoose sulla voce (`name`, `lifeAsOf`, `defeatedUntil`, `potionRecoveryUntil`) con normalizzazione che li conserva; chiave = id del pet a catalogo (nessun `OwnedPet.id`); `ParticipantEffects.companionLifeAfter?` + `companionAfterFight` in `src/quests/outcomes/pets/`; `QuestResult.companion: CompanionOutcome` (copre anche le imboscate, che sono `QuestResult`); sweeper `PetRecoverySweeper` sul modello della prigione; imboscate con `QuestResult` immediato e push `ambush` per ognuna; `activeTravel.mount` interno per D-13.

<user_constraints>
## User Constraints (from CONTEXT.md)

Copia da `23-CONTEXT.md` (il verbatim dell'utente sta nella FE `22-CONTEXT.md`, autorevole per entrambi).

### Locked Decisions

#### Tempi di recupero
- **D-01 (utente):** ogni pet a catalogo ha il suo tempo di recupero pieno (dal minimo a vita piena) a DB. Semina da una tabella calcolata su **rarità + `maxXp` + `maxLifePoints`** (44 pet), rivista dall'utente su file prima della scrittura a DB dopo la merge; poi «la mano vince». Nessun migratore né seeder resta nel repo.
- **D-02 (utente):** un solo orologio, recupero lineare. Sconfitto = riposo forzato dal minimo; non equipaggiabile finché non è a vita piena (rifiuto con codice proprio).
- **D-03 (utente, «il compagno non è mai a vita 0, il minimo è 1 (non può morire un pet)»):** la vita del compagno non scende sotto 1; sconfitto = arrivato al minimo in uno scontro (marcatore esplicito sulla voce posseduta: vita 1 da sola non basta a distinguerlo). Vale in ogni punto in cui uno scontro si risolve: quest, boss, dungeon, imboscate, soccorsi, completamento guidato.
- **D-04 (utente):** recupera ogni compagno posseduto fuori dallo slot; quello equipaggiato mai. Il ferito non sconfitto si riequipaggia in ogni momento con la vita raggiunta (esempio dell'utente: 100 minuti da 1 a 100; a riposo da 20 per 20 minuti → 40).

#### Pozioni
- **D-05 (utente):** `useItem` accetta un compagno come bersaglio; l'attesa è **del singolo compagno** (una data per voce posseduta), indipendente da `status.potionRecoveryUntil` del personaggio in entrambi i sensi. Stesse regole delle pozioni del personaggio (nessun consumo se non farebbe nulla, mai in missione in corso).
- **D-06 (utente):** il compagno sconfitto rifiuta le pozioni.
- **D-07 (utente):** bersagli = compagni posseduti sotto la vita piena e non sconfitti, equipaggiati o a riposo.

#### Esiti, push, sequenze
- **D-10 (utente):** l'esito di uno scontro e il report di un'imboscata portano la vita del compagno dopo lo scontro e la sua sconfitta (con la data di ritorno).
- **D-11 (utente):** push nuova solo quando un compagno **sconfitto** torna a vita piena (categoria propria, col nome del compagno se c'è).
- **D-12 (utente):** in una dungeon il compagno sconfitto è fuori dai piani successivi; lo slot si svuota a fine missione.
- **D-13 (utente, «Resto del viaggio a piedi»):** cavalcatura sconfitta in un'imboscata vinta: esce subito dallo slot e la strada residua dal punto dell'imboscata si ricalcola a piedi (durata, arrivo, fabbisogno di cibo, lavoro di completamento ripianificato). Supera «velocità fotografata alla partenza» per questo caso.
- **D-14 (utente):** push per **ogni** imboscata subita, vinta o persa, con o senza compagno; se il compagno cade la push lo dice. Supera BE Phase 15 «nessun push in più».
- **D-15 (utente):** i report delle imboscate sono leggibili anche a viaggio in corso (la FE li mostra all'apertura della mappa); serve sapere quali sono già stati visti.
- **D-16 (utente):** dopo il ricalcolo, se con cibo e vita rimasti il personaggio non arriverebbe vivo alla meta (stesso controllo della partenza), viene ridiretto alla città più vicina per strada come dopo una sconfitta in imboscata; la quest verso cui viaggiava segue la regola della sconfitta (abbandonata).
- **D-17 (utente):** nel completamento guidato la simulazione propone la vita del compagno di ogni partecipante, l'oste la corregge (minimo = sconfitto), il completamento applica le stesse regole.

#### Nome del compagno
- **D-18/D-19 (utente):** ogni compagno posseduto può avere un nome, dato all'acquisizione (acquisto o premio, saltabile) o più tardi, e modificabile; mutation dedicata.
- **D-20 (utente):** dove il BE scrive testi (push) usa il nome se c'è, altrimenti la specie.
- **D-21 (utente):** stesse regole del nome del personaggio: lunghezza, caratteri, stesso filtro dei contenuti; rifiuto con codice proprio.

(D-08 e D-09 sono solo FE: foglio della pozione, vita che sale dal vivo interpolata fra le date servite dal BE.)

### Claude's Discretion
- Forma sul filo (campi di `OwnedPet` e `Pet`, bersaglio di `useItem`, voci del compagno in `QuestResult` / report d'imboscata / bozza della missione, codici), decisa nel plan e riportata in `BACKEND-NOTES.md`.
- Calcolo della vita a riposo (pigro a lettura/scrittura o sweep), a patto che la FE riceva date da cui interpolare; pianificazione della push «in forze».
- Vendere un compagno a riposo o sconfitto resta ammesso.

### Deferred Ideas (OUT OF SCOPE)
- Push per il compagno ferito che finisce il riposo (rifiutata, D-11).
- Fuori ambito (Phase Boundary): il motore di combattimento vero e il motore a piani delle dungeon (restano dietro la stessa porta), ferite dei compagni.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP dice «Requirements: TBD (definiti al plan)». Proposta (prefisso `BE-PET-NN`, una riga ciascuno):

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-PET-01 | Orologio di riposo lineare pigro (funzione pura unica), predicato unico «sconfitto», campi nuovi della voce conservati da ogni riscrittura dell'array, dati esistenti letti senza migratore | §Q1, §Q2, SONDE P1/P3 |
| BE-PET-02 | `Pet.recoveryTime` (ms, curato a DB) e stato del compagno su `OwnedPet` (vita all'ancora, date da cui interpolare, sconfitta, attesa della pozione, nome) | §Q2, §Q3, §Q12 |
| BE-PET-03 | `equipPet`/`unequipPet` assestano la vita; rifiuto `PET_DEFEATED` per il compagno sconfitto non ancora a vita piena | §Q2, §Q6 |
| BE-PET-04 | Porta `CombatResolver` estesa con la vita del compagno dopo lo scontro; il segnaposto danneggia il compagno senza tiri nuovi; dungeon: sconfitto fuori dai piani successivi | §Q4 |
| BE-PET-05 | Regola della sconfitta applicata in quest, boss, dungeon, soccorsi, guardia, crime, completamento GM; slot svuotato; `QuestResult.companion` | §Q4, §Q8 |
| BE-PET-06 | Pozione sul compagno: `useItem(itemId, petId)`, attesa per compagno, rifiuti `PET_DEFEATED`, `PET_POTION_RECOVERING`, `ITEM_NO_EFFECT`, lucchetto missione | §Q5, §Q6 |
| BE-PET-07 | `renamePet` del solo proprietario con le regole del nome del personaggio e codice `PET_NAME_INVALID` | §Q7 |
| BE-PET-08 | Push `petRecovered` quando un compagno sconfitto torna a vita piena (sweeper con claim, idempotente, nessuna push dopo la vendita) | §Q10 |
| BE-PET-09 | Imboscate: esito del compagno, `QuestResult` scritto subito (report leggibili in viaggio, «visto» = conferma), push `ambush` per ogni imboscata col nome del compagno | §Q8, §Q9 |
| BE-PET-10 | Cavalcatura della partenza sconfitta in un'imboscata vinta: strada residua ricalcolata a piedi (arrivo, cibo, prossima imboscata, job di completamento) | §Q9 |
| BE-PET-11 | Dopo il ricalcolo, ridirezionamento alla città più vicina per strada se non arriverebbe vivo; quest abbandonata; deviazione a piedi se la cavalcatura cade in una sconfitta | §Q9 |
| BE-PET-12 | Flusso guidato: vita del compagno proposta per scontro, correzione `companionLifeAfter` (1..max, 1 = sconfitto), aggregato e completamento con le stesse regole | §Q11 |
| BE-PET-13 | Gate (tsc, suite per aree, SDL e liste al boot reale) e handoff `BACKEND-NOTES.md` per la FE Phase 22 con la descrizione della tabella dei tempi di recupero | §Q14, §Q15 |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 23-REPO-RULES.md)

- Stack non negoziabile: NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis (`CLAUDE.md` §Constraints).
- Contratti GraphQL esistenti non si rompono: **solo aggiunte** di SDL (REPO-RULES «Contratto e nomi fissati»); il filo di oggi (`OwnedPet { currentLifePoints, pet, xp }`, `useItem(itemId)`, `equipPet`/`unequipPet`, `AmbushReport`, `PushEventType.ambushDefeat`) resta valido fino alla merge della FE Phase 22.
- TDD obbligatorio (RED → GREEN → REFACTOR, titoli dei casi con `(D-NN)`), Clean Code, SoC, Boy Scout.
- Nessun `Math.random` né `Date.now` nel codice della fase: caso dalla porta `ChanceSource`, ora dalla porta `Clock`; **ogni tiro nuovo dopo quelli esistenti e solo quando serve**.
- Nessun `jest.mock(` di moduli; override di provider; `FixedClock`; nessuna rete; prove di assenza con `toEqual` sull'output intero.
- Mai intersezioni con interfacce negli update di Mongoose.
- Nessuna variabile d'ambiente nuova; `process.env.` solo nei provider di config; log con soli id, conteggi, codici.
- Nessun file di contenuto nel repo (D-36): la tabella dei tempi di recupero la calcola e la scrive l'orchestratore fuori dal repo; un migratore one-shot, se mai servisse, esce dal repo dopo il boot reale (qui **non serve**, §Q1).
- `src/schema.gql` si rigenera solo col boot reale di test e si committa nello stesso piano che cambia i decoratori; i blocchi pinnati in `test/app.int-spec.ts` si aggiornano PRIMA (RED); ogni handler nuovo entra in `test/authz/expected-handlers.ts` e nella matrice nello stesso piano.
- Mai `npm run lint`/`format`/`build`; solo `npx prettier --write <file>` e `npx eslint <file>`; jest con i percorsi prima di `--selectProjects`, integration `--runInBand`, mai in background.
- Commit senza trailer `Co-Authored-By` / `Generated with` / `Claude-Session` (regola dell'utente).
- Operatori Mongo solo dentro code span nei `.md`.

## Risposte alle domande

### Q1 — Il modello del compagno oggi e la migrazione

**Forma Mongoose.** `OwnedPet` (`src/models/character/owned-pet.model.ts:7-25`): `@Schema({ _id: false })`, `pet: ObjectId` (ref `Pet`, required), `xp: Number` (default 0), `currentLifePoints: Number` (required). `CharacterAssets.ownedPets: OwnedPet[]` (`character-assets.model.ts:35`); il compagno equipaggiato è `assets.pet` (ref al catalogo, non alla voce).

**Id della voce:** non esiste (`_id: false`). **Due della stessa specie:** impossibile per costruzione: l'acquisto rifiuta un pet già posseduto sullo snapshot in sessione e lo riafferma nel filtro (`trade-pets.ts:32-43`, `petOwnershipGuards` `:91-100` con `$nin`), il premio di quest è idempotente (`outcome-plan.ts:349-361`, `ownsPet`). **Come `equipPet`/`unequipPet` identificano il pet:** `equipPet` con l'id del catalogo (`EquipPetRequest { id: String!, petId: String! }`, filtro `'assets.ownedPets.pet': { $in: idForms(petId) }`, `src/characters/pets/equip-pet.updates.ts:8-21`); `unequipPet` non ha argomento pet (azzera `assets.pet`, `characters.service.ts:226-235`). Entrambi sono **un solo `updateOne` senza snapshot** (`characters.service.ts:204-235`).

**Dove si scrive `currentLifePoints` oggi:** solo all'acquisizione (`newOwnedPetEntry`, vita = `maxLifePoints` del catalogo o 0 se non intero ≥ 0, `owned-pet-entry.ts:47-65`) e nella normalizzazione (`ownedPetCountOf`, `:21-25`). Nessuno scontro lo tocca: `companionOf` lo passa al contesto (`combat-context.ts:189-211`), il segnaposto lo ignora (`placeholder-combat-resolver.ts:128-166`), `companionXpAward` riscrive solo `xp` (`src/quests/outcomes/pets/companion-xp.ts:23-44`).

**Migrazione: non serve.** Default indulgenti (raccomandato), perché:
- `name`, `lifeAsOf`, `defeatedUntil`, `potionRecoveryUntil` assenti = `null` = «senza nome, non a riposo, non sconfitto, nessuna attesa».
- Ogni voce esistente ha vita piena (nessuno scrittore l'ha mai abbassata); l'unica forma anomala è `currentLifePoints` 0 (catalogo senza `maxLifePoints` al momento dell'acquisto): sotto le regole nuove la vita non è mai < 1, quindi **vita ≤ 0 o non numerica = dato legacy = vita piena** (regola dentro la funzione pura, §Q2).
- La chiave della voce resta l'id del pet a catalogo, unico per personaggio: nessun `_id` da generare. Aggiungere `_id` ai sotto-documenti chiederebbe un migratore (o id rigenerati a ogni riscrittura da `normalisedOwnedPets`, che ricostruisce le voci da zero): costo senza beneficio finché la regola «uno per specie» vale (conflitto C-2).

**Trappola dimostrata (SONDA P1, P3):** `normalisedOwnedPets` (`owned-pet-entry.ts:29-45`) restituisce voci con le sole chiavi `currentLifePoints`, `pet`, `xp` anche se l'ingresso porta `name`, `defeatedUntil`, `lifeAsOf` (P1, `Object.keys(...).sort()`); e lo schema `OwnedPetSchema` attuale scarta una chiave ignota in una scrittura con cast (P3). Scrittori che passano da lì e cancellerebbero i campi nuovi: negozio (`trade-pets.ts:54`, `shop-transaction.service.ts:112,132`), xp del compagno (`companion-xp.ts:31`), pet in premio (`outcome-plan.ts:364-371`), imboscate (`ambush-plan.ts:207-211,230-232`). `NewOwnedPetEntry` e `normalisedOwnedPets` devono portare tutte le chiavi nuove nello stesso piano che le aggiunge allo schema (Pitfall 1).

### Q2 — Orologio di riposo (D-02..D-04)

**Calcolo pigro, nessuno sweep della vita.** Lo stato si memorizza come **ancora** sulla voce: `currentLifePoints` = vita alla data `lifeAsOf`; `lifeAsOf = null` = non a riposo (equipaggiato, oppure mai stato ferito). La vita «adesso» si calcola a ogni lettura e a ogni scrittura con una sola funzione pura; lo sweep serve solo alla push «in forze» (§Q10).

**Funzione pura unica** (`src/characters/pets/companion-life.ts`, nome proposto `companionLifeAt`):

```ts
// ingresso: ancora della voce, catalogo, slot, ora dalla porta Clock
interface CompanionLifeInput {
    lifePoints: unknown;          // currentLifePoints della voce
    lifeAsOf: unknown;            // Date | null
    resting: boolean;             // la voce NON è assets.pet
    maxLifePoints: unknown;       // Pet.maxLifePoints
    recoveryTimeMs: unknown;      // Pet.recoveryTime
    now: Date;
}
interface CompanionLife { lifePoints: number; fullLifeAt: Date | null }
```

Regole (in quest'ordine):
1. `max` = `maxLifePoints` intero ≥ 1, altrimenti catalogo non servibile → `{ lifePoints: max(1, vita intera letta) , fullLifeAt: null }` (nessun recupero inventato).
2. vita ≤ 0 o non numerica → legacy → `max` (Q1); altrimenti clamp a `[1, max]` (D-03: minimo 1).
3. non a riposo o `lifeAsOf` non data → `{ vita, null }` (D-04: l'equipaggiato non recupera; una voce mai ferita è piena).
4. `recoveryTimeMs` non intero > 0 (pet non ancora curato) → recupero istantaneo `{ max, null }` (Q3).
5. vita = max → `{ max, null }`.
6. `fullLifeAt = lifeAsOf + ceil((max − vita) × T / (max − 1))` (velocità `(max − 1) / T`: dal minimo al pieno esattamente in `T`, D-01/D-02). Se `now ≥ fullLifeAt` → `{ max, null }`, altrimenti `{ min(max − 1, vita + round((now − lifeAsOf) × (max − 1) / T)), fullLifeAt }`.

Verifica sull'esempio dell'utente (D-04): `max` 100, `T` 100 min, vita 20, 20 min di riposo → `20 + round(20 × 99 / 100) = 20 + round(19,8) = 40` ✓; sconfitto (vita 1) → `fullLifeAt = lifeAsOf + T` esatto ✓. L'arrotondamento è la sola scelta che rende veri insieme l'esempio e «dal minimo al pieno in T» (conflitto C-3). Il `min(max − 1, …)` evita che la vita mostrata tocchi il massimo prima di `fullLifeAt` (equip, pozione e push leggono la data).

**Predicato unico «sconfitto»:** `isPetDefeated(entry, now) = entry.defeatedUntil instanceof Date && entry.defeatedUntil > now`. Il marcatore esplicito di D-03 è la data `defeatedUntil` (non un booleano): è fissa (lo sconfitto non beve pozioni, D-06, e non si equipaggia, D-02), coincide con `fullLifeAt` del riposo dal minimo, e dà allo sweeper l'indice per la push (§Q10). **Nome mostrato:** `companionDisplayName(entry.name, pet.name)` = nome se presente, altrimenti specie (D-20), stesso modulo.

**Punti di scrittura che «assestano» (scrivono l'ancora nuova):**

| Punto | Scrittura |
|-------|-----------|
| `unequipPet` | voce del compagno uscente: `currentLifePoints` invariato (l'equipaggiato è già «adesso»), `lifeAsOf = now` |
| `equipPet(X)` | rifiuto `PET_DEFEATED` se `isPetDefeated(X)`; X: `currentLifePoints = companionLifeAt(...)`, `lifeAsOf = null`; il compagno uscente Y ≠ X (se c'è): `lifeAsOf = now`; `defeatedUntil` passato si lascia allo sweeper (Pitfall 6) |
| pozione su X | vita assestata + potenza (tetto max), `lifeAsOf = now` se X è a riposo (resta `null` se equipaggiato), `potionRecoveryUntil` di X |
| fine scontro (ogni percorso) | solo il compagno equipaggiato: `currentLifePoints = companionLifeAfter`; se sconfitto → `assets.pet = null`, `lifeAsOf = istante dello scontro`, `defeatedUntil = istante + T` (con `T` assente: nessuna attesa, §Q3) |
| completamento guidato | come la fine scontro, con la vita aggregata (§Q11) |
| vendita | la voce sparisce: nulla da assestare (lo sweeper non trova più la voce, §Q10) |
| inizio scontro | **nessuna scrittura**: entra solo il compagno equipaggiato, la cui ancora è già «adesso» (`lifeAsOf = null`) |

Tutte le scritture del compagno avvengono in transazione con snapshot in sessione e array intero riscritto (stesso schema di `ItemUseService`, `src/characters/items/item-use.service.ts:74-106`): `equipPet`/`unequipPet` oggi sono `updateOne` ciechi e diventano lettura + piano puro + scrittura condizionale.

**Cosa porta il filo:** l'ancora com'è salvata più le date calcolate. `currentLifePoints` = vita alla data `lifeAsOf` (non la vita «adesso»: nessuna deriva da arrotondamenti fra BE e FE), `lifeAsOf` e `fullLifeAt` nulli se equipaggiato o pieno; la FE interpola linearmente da `(currentLifePoints, lifeAsOf)` a `(pet.maxLifePoints, fullLifeAt)` senza conoscere la regola (come la pedina in viaggio da `startTime`/`endTime`). Il mapper esistente `ownedPetsOnTheWire` (`src/characters/pets/owned-pets.mapper.ts:19-25`, chiamato da `CharactersService.findOne`, `characters.service.ts:156-158`, unico percorso che popola `assets.ownedPets.pet`) riceve `now` dalla porta `Clock` (già iniettata nel servizio, `:87`) e collassa a `{ max, null, null }` una voce il cui `fullLifeAt` è passato; `defeated` = `isPetDefeated(entry, now)`.

**Come la FE viene avvisata:** `characterUpdated` nasce dal change stream su ogni update di un personaggio attivo (`src/characters/character-changes.pipeline.ts:2-9`, nessun filtro sui campi) e lo snapshot passa da `findOne`: ogni scrittura del compagno (equip, pozione, esito, claim dello sweeper, rinomina) riemette da sola. **Nessuna emissione serve quando un ferito arriva a vita piena** (interpolazione lato FE; nessuna push, D-11). Per lo sconfitto, il claim dello sweeper (§Q10) è una scrittura e riemette `characterUpdated` col `defeated: false`.

### Q3 — `Pet.recoveryTime` (D-01)

- **Unità:** millisecondi, come `LootRecovery.time` («time in millisecondi come Spell.recoveryTime», `src/models/loot-item.model.ts:12`) e `recoveryTimeOf` (`item-use.plan.ts:88-98`); tetto `MAX_RECOVERY_VALUE = 2 147 483 647` (≈ 24,8 giorni, `loot-item.model.ts:9-10`), più che sufficiente.
- **Schema del catalogo:** `src/models/pet.model.ts:9-77` (classe `Pet`); nessuno script di contenuto nel repo (D-36). Campo nuovo: `@Prop({ type: Number, default: null }) recoveryTime?: number | null` e `@Field(() => Int, { nullable: true })`.
- **Pet senza il campo (fino alla semina dell'orchestratore):**
  - Sul filo **non può essere `Int!`**: un `null` su un campo non nullo annulla il `Pet` e risale fino al personaggio (stesso motivo di `rarity`/`speedModifier` nullable). Proposta: `recoveryTime: Int` nullable (conflitto C-4); la FE lo usa solo nel foglio dei dettagli («Recupero: 4 h»), non per interpolare.
  - Nel dominio: **indulgente**, recupero istantaneo (regola 4 di §Q2): uno sconfitto senza `recoveryTime` torna subito equipaggiabile, nessuna push. Precedente: la pozione con `recovery` non valido «senza ricarica» (Phase 18 D-23, `item-use.plan.ts:88`). Fail-closed (sconfitto per sempre) è peggiore: un pet non curato diventerebbe inutilizzabile senza rimedio dall'app.
  - Al boot: un reporter di avvio che logga in WARN il **conteggio** dei pet senza `recoveryTime` valido (pattern `starting-cities.reporter.ts`, `push-startup.reporter.ts`), così la semina mancante si vede nel log del boot reale.

### Q4 — Dove uno scontro si risolve e come entra/esce il compagno

**Ingresso nel contesto:** `companionOf` (`src/quests/outcomes/combat/combat-context.ts:189-211`) prende il pet di `assets.pet`, la voce posseduta e il catalogo; `CombatCompanion { petId, attack, defense, currentLifePoints, maxLifePoints, xp }` (`combat-resolver.ts:44-51`). **Uscita: oggi non esiste** — `ParticipantEffects` (`combat-resolver.ts:87-93`) non ha campi del compagno, `CombatResolution` porta solo verdetto ed effetti per personaggio.

**Il segnaposto danneggia il compagno?** No (`placeholder-combat-resolver.ts:128-166`); il caso pinnato è «ignores the companion and draws the same sequence (D-20)» (`placeholder-combat-resolver.spec.ts:282`).

**Estensione minima della porta:**
```ts
export interface ParticipantEffects {
    // ...campi di oggi
    // vita del compagno equipaggiato dopo lo scontro, in [1, maxLifePoints] (D-03); assente = invariata o nessun compagno
    companionLifeAfter?: number;
}
```
Opzionale per non toccare le decine di fixture che costruiscono `ParticipantEffects`; il motore dell'utente la riempie dietro la stessa porta. La sconfitta si **deduce** dal piano con una regola sola: `sconfitto ⇔ companionLifeAfter === 1` (D-03 «arrivato al minimo in uno scontro»; vale anche per un compagno entrato a 1 che resta a 1: è al minimo in uno scontro, conflitto C-13). Il piano clampa `companionLifeAfter` a `[1, max]` (difesa in profondità come `lifePointsWithin` per gli HP).

**Segnaposto:** perdita del compagno = **la stessa perdita del personaggio** calcolata prima della pozione (`loss`, `placeholder-combat-resolver.ts:136-139`), senza tiri: `companionLifeAfter = max(1, min(max, vita − loss))` solo se `participant.companion` non è nullo. Nessun tiro nuovo → le spec a seme fisso delle fasi 13/16/19/22 non si spostano; cambia solo il caso «ignores the companion…» (da riscrivere: «damages the companion without drawing (D-03)» + «draws the same sequence with or without a companion (D-20)»).

**Percorsi (tutti passano da `ParticipantEffects`):**

| Percorso | Dove si risolve | Dove si applica l'effetto |
|----------|-----------------|---------------------------|
| quest standard (enemy, heal, study…) | `questBattleOf` → `combat.resolve` (`quest-battle.ts:45-61`), servizio `quest-resolution.service.ts:184-195` | `planConclusion` → `planCombatant` → `planParticipant` (`combatant-plan.ts:132-191`, `outcome-plan.ts:388-581`) o `planDefeatWithoutAid` → `planUnrewarded` (`unrewarded-plan.ts:47-131`) |
| boss | `boss-resolution.service.ts:147-161` | `planCombatant` |
| dungeon | `questBattleOf` → `PlaceholderDungeonResolver.explore` (`placeholder-dungeon-resolver.ts:113-182`), una `resolve` per tappa | `planCombatant` con gli effetti fusi (`mergeEffects`, `:91-104`) |
| soccorsi (aid, anche di dungeon col turno salvato) | `rescue-resolution.service.ts:412-430` → `questBattleOf` | `planCombatant` |
| guardia (scontro dopo la quest) | `conclusion-plan.ts:61-117` (secondo `resolve` su `foughtSnapshotOf`) | `mergedEffects` (`guard-outcome.ts:70-82`) → `planGuardDefeat`/`planCombatant` |
| crime con arresto | primo scontro, poi `planArrest` → `planUnrewarded` | `planUnrewarded` |
| completamento GM (legacy) | nessun motore: effetti da `validateOverrides` (`gm-overrides.ts:146-171`) | `planParticipant` (`gm-completion.service.ts:206`) |
| completamento guidato | effetti aggregati della bozza (`guided-outcome.ts:57-91`) | `planParticipant` (§Q11) |
| imboscata | `ambush-resolution.service.ts:415-470` | `planAmbushOutcome` (`ambush-plan.ts:365-395`), piano proprio |

Quindi bastano: (a) una funzione pura `companionAfterFight(assets, effects, now, recoveryTimes, petMaxXp, enemiesXp)` in `src/quests/outcomes/pets/` che **ingloba** `companionXpAward` (stesso array intero riscritto, Phase 19 Pitfall 4) e restituisce `{ ownedPets, unequip, outcome: CompanionOutcomeDraft | null, gained }`; (b) usarla in `planParticipant`, `planUnrewarded` (oggi non tocca i pet: il compagno ferito in una sconfitta senza premio va comunque scritto) e `foughtOutcomeOf` dell'imboscata; (c) `foughtSnapshotOf` (`guard-outcome.ts:51-68`) porta la vita del compagno nello snapshot del secondo scontro, e toglie il compagno se il primo lo ha sconfitto; `mergedEffects`/`mergeEffects` tengono il `companionLifeAfter` dell'ultimo scontro in cui c'era.

Il catalogo per `T` e `maxLifePoints`: `ResolutionCatalog.pets` (mappa letta da `readCombatCatalog`/`readCatalog`, già usata da `companionOf`) va estesa a `recoveryTime` (proiezione del catalogo dei pet in `resolution-loader.service.ts`).

**D-12 dungeon:** nel segnaposto, `afterStage` (`placeholder-dungeon-resolver.ts:66-89`) aggiorna `companion.currentLifePoints` con `companionLifeAfter` e mette `companion: null` se è 1; il contratto si scrive nel commento della porta `DungeonResolver` (`dungeon-resolver.ts:40`) perché il motore dell'utente lo rispetti. Lo slot si svuota a fine missione perché l'esito si scrive una volta sola, alla fine (`planParticipant` con gli effetti fusi). Nessun filo.

**Spec a seme fisso che pinnano l'ordine dei tiri** (nessun tiro nuovo previsto in questa fase, quindi solo da tenere verdi): `placeholder-combat-resolver.spec.ts:262,282,306`, `placeholder-dungeon-resolver.spec.ts`, `src/travel/ambush/ambush-lifecycle.int-spec.ts` (sorteggi km per km `:827-878`), `src/quests/outcomes/quest-resolution.service.int-spec.ts`, `quest-dungeon.int-spec.ts`, `boss-resolution.int-spec.ts`, `guided/mission-simulation.service.int-spec.ts` («draws only from the simulation chance (D-04)»), generazione quest (fase 13). D-13 **non** risorteggia la prossima imboscata (la rimappa, §Q9) proprio per non aggiungere tiri.

### Q5 — Pozione sul compagno (D-05..D-08)

**Percorso di oggi:** `ItemUseResolver.useItem(itemId)` (`src/characters/items/item-use.resolver.ts:13-19`, identità solo dal bearer: agisce sul `currentCharacter`) → `ItemUseService.useItem` (`item-use.service.ts:46-61`: catalogo letto una volta, transazione) → `drinkWithin` (`:74-106`: snapshot in sessione, `missionLock.isLocked`, `planItemUse`, un `updateOne` col filtro di guardia) → `planItemUse` (`item-use.plan.ts:233-273`). Ordine dei rifiuti: `AWAITING_AID` → `MISSION_IN_PROGRESS` → `ITEM_NOT_OWNED` → `ITEM_NOT_USABLE` → `POTION_RECOVERING` (con `recoveryUntil` nelle extensions) → `ITEM_NO_EFFECT` (= «vita piena», nome del codice di oggi). `status.potionRecoveryUntil` scritto a `now + recovery.time` (`:248,260`).

**Bersaglio opzionale:** `useItem(itemId: ID!, petId: ID)` — id del pet a catalogo (chiave della voce, Q1), validato con `ObjectIdPipe` come `itemId`. Con `petId`: piano puro gemello `planPetPotion` nello stesso modulo, che riusa possesso, `usablePotionOf`, `quantityLeftOf`, `knowledgeUpdateOf` (le lore della pozione si sbloccano al personaggio anche quando la dà al compagno: proposta) e ordina i rifiuti:

1. `AWAITING_AID` (le stesse regole delle pozioni del personaggio, D-05)
2. `MISSION_IN_PROGRESS`
3. `ITEM_NOT_OWNED`, `ITEM_NOT_USABLE`
4. `PET_NOT_OWNED` (voce assente; codice di oggi)
5. `PET_DEFEATED` (D-06)
6. `PET_POTION_RECOVERING` con `recoveryUntil` nelle extensions (attesa della voce, mai quella del personaggio, D-05)
7. `ITEM_NO_EFFECT` se la vita assestata è già `max` (D-07: nessun consumo)

Effetto: solo vita (i pet non hanno ferite, Phase Boundary), `canHeal` ignorato. Scrittura: array intero dei posseduti con la voce assestata (§Q2) + `assets.ownedItems` meno una pozione + conoscenza; **non** tocca `status.potionRecoveryUntil` (D-05 in entrambi i sensi). `UseItemResult` invariato: `hpBefore`/`hpAfter` = vita del compagno, `injuriesHealed: []`, `recoveryUntil` = attesa del compagno (semantica nel handoff; nessun campo nuovo).

**Atomicità:** stessa transazione di oggi (il driver riesegue il callback sui WriteConflict: due bevute concorrenti sullo stesso personaggio si serializzano, la seconda rilegge lo snapshot con l'attesa già scritta e riceve `PET_POTION_RECOVERING`). Il filtro di guardia ripete ciò che il piano ha letto: `soldQuantityGuards` della pozione più la voce del compagno con `$elemMatch` su `pet`, `currentLifePoints`, `lifeAsOf`, `potionRecoveryUntil`, `defeatedUntil` letti (forma «non data» come `recoveryAsRead`, `item-use.plan.ts:211-214`).

**Allowlist delle extensions:** `formatDomainError` lascia uscire `recoveryUntil` solo col codice `POTION_RECOVERING` (`src/graphql/format-domain-error.ts:78-85`): va esteso a `PET_POTION_RECOVERING`, altrimenti la data sparisce (Pitfall 7).

### Q6 — `PET_DEFEATED` e il lucchetto «Missione in corso»

**Predicato unico del lucchetto:** `MissionLockReader` (`src/characters/mission-lock/mission-lock.reader.ts:40-80+`) con `assertFree(characterId)` (usato da `equipItem`, `equipPet`, `unequipPet`, `equipSpell`… `characters.service.ts:178,206,228,239`) e `isLocked(characterId, session)` (usato dalla pozione dentro il piano, `item-use.service.ts:89-92`); il predicato puro è `missionInProgressOf` (`mission-lock.ts`).

**Azioni nuove:**
- pozione sul compagno: passa già dal lucchetto (stesso `drinkWithin`, stesso `refuseWhileOnMission`).
- `equipPet` con `PET_DEFEATED`: `assertFree` resta il primo controllo (D-23 della Phase 22), poi `PET_NOT_OWNED`, poi `PET_DEFEATED`.
- `renamePet`: **raccomandazione: non bloccata**. Il nome non cambia lo stato su cui si simula né l'esito (D-11/D-12 Phase 22 bloccano ciò che «cambia lo stato su cui si simula»); D-19 dice «dato… o più tardi». Il nome mostrato entra solo nelle push e nella bozza come etichetta (`MissionCompanion.name` si legge alla lettura). Se l'orchestratore preferisce il blocco, basta `assertFree` in testa.

Codice nuovo `PET_DEFEATED` in `GameRuleErrorCode` (`src/gameRules/game-rule-error-code.enum.ts:2-42`) con fabbrica `GameRuleException.petDefeated()`, extensions `{ code }` soltanto (la data la FE la ha già da `OwnedPet.fullLifeAt`); messaggio proposto «Il compagno è stato sconfitto: deve riposare finché non torna in forze». La spec `game-rule.exception.spec.ts` enumera le fabbriche (tabella): riga nuova.

### Q7 — Nome del compagno (D-18..D-21)

**Regole del nome del personaggio** (`src/characters/creation/character-name.ts:1-33`, sincrone, pure): `normalizeCharacterName` (NFC, apostrofi tipografici → `'`, trim, spazi compressi) + `isValidCharacterName` (2..20 grafemi, ≤ 40 unità UTF-16, solo `\p{L}`, apostrofo, spazio, trattino, almeno una lettera di base). Rifiuto `CHARACTER_NAME_INVALID` (`character-creation.exception.ts:15-20`, enum `CharacterCreationErrorCode`), più `CHARACTER_NAME_TAKEN` dall'indice unico dei personaggi (non pertinente ai pet).

**Filtro dei contenuti: non esiste.** Non c'è alcun filtro di parole lato server sul nome del personaggio (grep di `profan|badword|blocklist|denylist|offensive|content filter` in `src`: solo la moderazione **delle immagini** Sightengine, `src/moderation/image-policy.ts`); il codice «HARDEN-10» non compare nei requisiti del BE. D-21 «stesso filtro dei contenuti» quindi si traduce in «stesse regole di forma» (conflitto C-1).

**`renamePet`:**
- Firma (stile `equipPet`): `renamePet(request: RenamePetRequest!): CommonResponse!`, `RenamePetRequest { id: String!, name: String, petId: String! }` (validatori `@IsObjectIdHex` su `id`/`petId`, `@IsOptional` + `@IsString` + `@MaxLength(200)` di forma su `name`; la regola vera è nel dominio).
- Semantica: `name: null` (o assente) toglie il nome; una stringa passa da `normalizeCharacterName` e `isValidCharacterName`, altrimenti `PET_NAME_INVALID` (codice proprio in `GameRuleErrorCode`, D-21 di `23-CONTEXT`; messaggio come `nameInvalid`). Nessuna unicità. Voce assente → `PET_NOT_OWNED`; personaggio assente/archiviato → `NOT_FOUND` (`activeCharacterById`).
- Scrittura: un solo `updateOne` con `arrayFilters` sul pet (`assets.ownedPets.$[entry].name`), filtro `'assets.ownedPets.pet': { $in: idForms(petId) }`; nessun assestamento serve.
- Autorizzazione: `@OwnsCharacter(({ request }) => request.id, { ownerOnly: true })` (draft: «solo il proprietario»; `ownership.decorators.ts:9-11,36-40`): entra in `EXPECTED_OWNERSHIP_HANDLERS` **e** `EXPECTED_OWNER_ONLY_HANDLERS` (`test/authz/expected-handlers.ts:23-55`) con la fixture `'CharactersResolver.renamePet': requestMutation('renamePet', 'RenamePetRequest!', (v) => ({ request: { id: C(v), petId: ANY } }))` in `test/authz/handler-fixtures.ts` (stile `:234-256`). Owner-only = nessun audit on-behalf (`ownership.decorators.ts:10`). L'oste agisce solo sul proprio personaggio.
- Acquisizione (D-18): **nessun argomento nuovo su `doTransaction` né sui premi**: la FE chiama `renamePet` dopo l'acquisto o il premio (saltare = non chiamare). Una sola mutation, un solo validatore.
- Nome mostrato lato server (D-20): `companionDisplayName` usato in `CompanionOutcome.name` (scritto nel `QuestResult`, fotografia al momento dell'esito come `quest.title`), nelle push `ambush` e `petRecovered`, in `MissionCompanion.name`.
- Registro degli input: `src/validation/input-decorators.spec.ts` («covers exactly the inputs of the generated schema (D-01)») va in RED con un input nuovo: aggiungere `RenamePetRequest`.

### Q8 — Foglio dell'esito (D-10)

**`QuestResult`** (`src/models/quest-result/quest-result.model.ts:120-313`) è **lo stesso tipo per quest e imboscate**: l'imboscata è un `QuestResult` con `kind: ambush`, `quest: null` e `ambush: AmbushReport { at, nearCity, reachedCity }` (`:54-70, 147-158`); vita, xp, `petXpGained` ecc. stanno su `QuestResult`. Quindi **`QuestResult.companion: CompanionOutcome` copre anche il report d'imboscata**; `AmbushReport.companion` della bozza sarebbe un duplicato (conflitto C-5).

**Dove si costruisce:** `QuestResultDraft` (`outcome-plan.ts:115-156`) scritto da `planParticipant` (`:542-579`) e `planUnrewarded` (`unrewarded-plan.ts:97-128`); imboscate: `AmbushReportDraft` (`ambush-plan.ts:83-109`) → `ambushResultDraftsOf` (`ambush-results.ts:51-58`). Aggiunta: `companion: CompanionOutcomeDraft | null` prodotto da `companionAfterFight` — `null` se nessun compagno ha combattuto o se `companionLifeAfter` è uguale alla vita d'ingresso e non è sconfitto (D-10 «niente quando illeso»; la riga xp di Phase 19 resta su `petXpGained`).

Mongoose: sotto-schema `CompanionOutcome` `_id: false` (`name` String required, `lifePoints` Number required, `maxLifePoints` Number required, `defeated` Boolean required, `fullLifeAt` Date default null) con `@Prop({ type: CompanionOutcomeSchema, default: null })`; `AmbushReportSnapshot` (`ambush-snapshot.model.ts:47+`, report trattenuti dei viaggi in volo al deploy) senza il campo: `null` all'arrivo. `fullLifeAt` = `defeatedUntil` per lo sconfitto (D-10 «con la data di ritorno»), `null` per il ferito ancora equipaggiato (non riposa).

### Q9 — Regole di viaggio dopo un'imboscata (D-13..D-16)

**Oggi.**
- Pianificazione: `AmbushPlanner.withAmbush` alla partenza (`ambush-planner.service.ts:26-31`, chiamato in `travel.service.ts:133` e `quest-acceptance.service.ts:384`); **una sola imboscata pendente** (`activeTravel.ambush { at, km, attempts }`), la successiva si sorteggia dopo una vittoria (`drawFrom(travel, km)`, `ambush-resolution.service.ts:233`) col rischio per ora locale (`ambush-draw.ts:20-40`, `ambush-clock.ts`).
- Risoluzione: `AmbushResolutionService.resolve` (`:211-297`, fuori dal callback: POI, pool, composizione, risorteggio, proprietario, catalogo, **rotta della deviazione** `detourOf` `:299-347`) → `fight` (`:415-530`, in transazione: snapshot, cibo al km `ambushFoodOf`, contesto, `resolve`, `planAmbushOutcome`, scrittura, abbandono della corsia in sconfitta, monete) → dopo il commit `afterDefeat` (`:560-579`: push `ambushDefeat`, `scheduler.cancel` del viaggio vecchio, `schedule` del nuovo) o `afterCommit` (`:581-597`: prossima imboscata o completamento già scaduto).
- **Velocità «fotografata»:** non è persistita. `buildActiveTravel` (`travel-timing.ts:51-73`) salva solo `startTime`, `endTime`, `duration`, `road`; la velocità `pet × ferite` (`travel-planner.service.ts:205-210`) entra solo nella durata. La deviazione usa `speedOfCharacter(snapshot.assets?.pet, [])` **del pet equipaggiato al momento dell'imboscata**, non della partenza (`ambush-resolution.service.ts:307-310`), e `equipPet` è permesso in viaggio («la velocità è fotografata alla partenza», `characters.service.ts:203`).
- Cibo: piano salvato alla partenza (`activeTravel.food`, `active-travel-food.model.ts`), assestato al km dell'imboscata (`ambushFoodOf`, `withFoodSettlement`, `ambush-food.ts:28-81`); in sconfitta si mangia il cibo dei km percorsi e il viaggio riscritto non porta il piano (`ambush-plan.ts:335-363`).
- Report: trattenuti in `activeTravel.ambushReports` (`$push`, `ambush-plan.ts:286`; portati nel viaggio riscritto `:320-330`) e trasformati in `QuestResult` nella transazione dell'arrivo (`travel-completion.service.ts:208-219`) o del teleport (`travel.service.ts:286-292`). Push solo in sconfitta (`ambushDefeat`, `push-events.ts:82-90`).

**D-13 — strada residua a piedi (proposta).**
1. **Cavalcatura della partenza persistita:** campo interno nuovo `activeTravel.mount: { pet: ObjectId, factor: number } | null` (mai sul filo, come `kind`/`ambush`/`food`), scritto da `buildActiveTravel` nei due punti di costruzione (`travel-planner.service.ts:129-140` e `:164-170`) quando il pet equipaggiato ha `speedModifier` valido; `factor` = modificatore (velocità con la cavalcatura / velocità a piedi, a parità di ferite). Viaggi in volo al deploy senza il campo → **nessun ricalcolo** (indulgente). Conflitto C-7.
2. **Quando:** imboscata vinta, compagno sconfitto (`companionLifeAfter === 1`) **e** compagno = `activeTravel.mount.pet`. Un compagno non da sella o equipaggiato dopo la partenza esce dallo slot e basta.
3. **Viaggio riscritto dal punto** (la FE interpola da `startTime` e `duration`: allungare solo `endTime` farebbe tornare indietro la pedina, motivo già scritto in Phase 15 D-11): `road` = polilinea residua (`collapsePoints([point, ...coordinates.slice(max(segment,1))])`, distanza `distance − km`, come `residualDetourOf`, `ambush-detour.ts:20-44`), `startTime = at`, `duration = round((endTime − at) × factor)`, `endTime = at + duration`, `to` e `kind` invariati, `mount: null`.
4. **Prossima imboscata:** la già sorteggiata `next` (sul viaggio vecchio, km assoluto) si **rimappa** senza tiri: `km' = next.km − km`, `at' = at + floor(km' / distanza residua × duration)`; nessuna se `next` è nullo. Il rischio per ora locale non si ricalcola (scelta dichiarata, alternativa = risorteggio con tiri nuovi dopo quelli del combattimento, conflitto C-8).
5. **Cibo:** il ricalcolo equivale a «arrivare al punto e ripartire a piedi»: chiusura del piano vecchio al km come uno stop (`food.defeat`: fame fino al km e cibo dei km percorsi, `defeatSettlementOf`, `ambush-food.ts:81`), poi `planTravelFood({ durationMs: duration, distanceKm: residua, hpBefore: vita dopo lo scontro, stacks: dispensa dopo lo stop })` (`travel-food.ts:70-85`) e `foodPlanOf(plan, residua)` come piano nuovo. **MEDIUM:** il piano deve provarlo con una sonda contro `settlementOf` (pasto unico `foodConsumedAt`, confine coperto).
6. **Job:** come `afterDefeat`: `scheduler.cancel(characterId, startTime vecchio)`, `schedule(characterId, travelAfter)` e `scheduleAmbush` col nuovo `startTime` se c'è la rimappata (l'identità del job è `(characterId, startTime, at)`, `ambush-job.ts`). Lo sweep dei viaggi resta la rete.
7. **Filo:** `AmbushReport.onFoot: Boolean!` (Mongoose default `false`): la FE scrive «prosegui a piedi» senza dedurlo (proposta aggiunta, §Q12).

**D-16 — ridirezionamento per fame.** Dopo il passo 5, se `!plan.arrivesAlive` (stesso controllo della partenza, `travel.service.ts:160-165`): il viaggio si riscrive come la deviazione della sconfitta verso `fight.detour` (già calcolata fuori dal callback: città più vicina per strada dal punto, `detourOf`), senza piano del cibo e senza imboscate (Phase 15 D-03, Phase 20 D-04), con la corsia standard abbandonata nella stessa transazione (`abandonLane`, `ambush-resolution.service.ts:537-558`); `outcome` resta `success`, `AmbushReport.reachedCity` = città raggiunta (oggi `null` in vittoria: una vittoria con `reachedCity` = ridirezionamento per fame, documentato). Il cibo mangiato fino al punto resta consumato (stop del passo 5).

**Sconfitta con la cavalcatura caduta:** la deviazione oggi usa `detour.petSpeed` del pet equipaggiato (`ambush-plan.ts:314`); se la cavalcatura cade nella stessa sconfitta la deviazione va fatta a piedi: `DetourDraft` porta anche la velocità a piedi (`BASE_SPEED`) e il piano sceglie dopo lo scontro (per il ripiego `residualMs`, moltiplicare per `factor`). Nessuna I/O nuova nel callback.

**D-15 — report leggibili in viaggio (modifica minima).** Il `QuestResult` dell'imboscata si **inserisce subito**, nella transazione della risoluzione (`outcome-writer.service.ts:124-129` `writeResult`, `resultId` già generato a `:417`), invece di `$push` in `activeTravel.ambushReports`. Così, senza SDL nuovo: `unacknowledgedQuestResults` lo restituisce all'apertura dell'app, `questResultReceived` lo consegna dal vivo (publisher sugli insert, `quest-results.publisher.ts`), e il marcatore «visto» è `acknowledgedAt` via `acknowledgeQuestResult` (owner-only, già esistente, `quest-results.resolver.ts:45-56`). `resolvedAt = at` resta (ordine della coda FE). La consegna dei report trattenuti all'arrivo/teleport **resta** per i viaggi in volo al deploy (codice morto dopo, da togliere in una fase successiva). Spec che vanno in RED per scelta: «holds the report in the travel until arrival (D-13)», «shows the victory effects at once and holds the report until arrival (D-17)», «carries the held reports into the rewritten travel (D-13)», «wins two ambushes on one travel and delivers both reports at arrival in order (D-02, D-13)» (§Q14). Conflitto C-9 (comportamento visibile alla FE pre-merge).

**D-14 — push per ogni imboscata.** Raccomandazione: categoria nuova `PushEventType.ambush` inviata dopo il commit di **ogni** imboscata risolta (vinta, persa, D-13, D-16; non per le saltate `skip`), `id` = id del `QuestResult` (come `questEnd`, la FE apre il foglio con `questResult(id)`); `ambushDefeat` **resta nell'enum** (SDL solo additivo) ma non si invia più (la FE mappa entrambi i valori sullo stesso interruttore «Imboscate»). Testi composti dal BE con `companionDisplayName` (copy provvisoria):
- vinta: «Imboscata presso <città>: hai respinto gli assalitori»
- vinta, compagno caduto: «Imboscata presso <città>: <nome> è stato sconfitto» (+ «, prosegui a piedi» con D-13)
- vinta, fame (D-16): «… la fame ti porta verso <città raggiunta>»
- persa: «Sei stato sconfitto: la via torna verso <città>» (+ «<nome> è stato sconfitto» se caduto)
Alternativa: tenere `ambushDefeat` per le sconfitte e `ambush` per le vittorie (due interruttori). Conflitto C-10.

### Q10 — Push «in forze» (D-11)

**Oggi:** due schemi per le push ritardate. (a) Job Bull ritardati con trigger e fallback (`SPELL_RECOVERY_QUEUE`, `characters.service.ts:55-61`); (b) **sweeper sul marcatore con claim atomico**: la liberazione dalla prigione (`PrisonReleaseSweeper`, `prison-release.sweeper.ts:26-110`, intervallo `QUEST_CONFIG.sweepIntervalMs` = 60 s di default, `quest-config.spec.ts:20`; claim `updateOne(prisonReleaseFilter, { $set: { imprisonedUntil: null } })` e push solo se `modifiedCount === 1`, `prison-release.service.ts:29-43`; indice `{ deletedAt: 1, 'status.imprisonedUntil': 1 }`).

**Raccomandazione: schema (b).** `PetRecoverySweeper` + `PetRecoveryService` in `src/characters/pets/`:
- dovuti: `{ ...ACTIVE_CHARACTER_FILTER, 'assets.ownedPets.defeatedUntil': { $lte: now } }` (indice multikey nuovo `{ deletedAt: 1, 'assets.ownedPets.defeatedUntil': 1 }`, riga nuova in `sweep-indexes.schema.spec.ts`);
- claim per voce: `updateOne({ _id, 'assets.ownedPets': { $elemMatch: { pet, defeatedUntil: { $lte: now } } } }, { $set: { 'assets.ownedPets.$[entry].defeatedUntil': null } }, { arrayFilters: [{ 'entry.pet': pet, 'entry.defeatedUntil': { $lte: now } }] })` — **SONDA P2**: il primo claim `modifiedCount` 1, il secondo 0, la voce non dovuta resta intatta, la query dei dovuti trova solo il documento giusto;
- il claim tocca solo il marcatore (la vita si calcola pigramente dall'ancora `1 @ lifeAsOf`, già piena a `defeatedUntil`), quindi non pesta un compagno che nel frattempo è stato riequipaggiato e ha combattuto;
- push `petRecovered(characterId, displayName)` all'utente proprietario dopo il claim, best effort come `notifyOwner` (`prison-release.service.ts:46-59`): `title` «Di nuovo in forze», `body` «<nome> è di nuovo in forze»; `id` = personaggio.
- **Annullamento:** la vendita toglie la voce → nulla da reclamare, nessuna push (nessun job da cancellare: vantaggio sullo schema Bull). Lo sconfitto rifiuta le pozioni (D-06), quindi la vendita è l'unico annullamento. **Idempotenza:** solo il claim che svuota la data invia.
- Ritardo massimo: l'intervallo dello sweep (60 s); nessuna variabile d'ambiente nuova (riusa `QUEST_CONFIG`). Reconciler al boot come la prigione.

### Q11 — Flusso guidato (D-17)

**Dove vive:** esiti simulati/corretti in `MissionFightOutcomeRecord`/`MissionFightEffectsRecord` (`src/quests/guided/mission-draft.model.ts:91-140`), filo `MissionFightOutcome`/`MissionFightEffects` (`mission-draft.wire.ts:39-85`); stato a inizio scontro `stateBeforeFight` + `fightStartOf` (`fight-state.ts:30-89`); correzioni validate da `validateOverrides` sui limiti `OverrideParticipant` (`gm-overrides.ts:19-25, 42-81, 146-171`); input `ParticipantOverrideInput` (`complete-pending-request.model.ts:44-78`), **condiviso** da `completePendingRequest` e `MissionFightInput.corrections`; aggregato `aggregateEffectsOf` (`guided-outcome.ts:57-91`); completamento `planParticipant` (`guided-completion.service.ts:127-148`).

**Proposta:**
- Stato a inizio scontro: `afterFight` (`fight-state.ts:30-63`) sovrappone anche la vita del compagno (`companionLifeAfter`) e lo **toglie** (`assets.pet = null` nello stato sovrapposto) se lo scontro lo ha sconfitto — D-12 esteso agli scontri in sequenza della missione guidata (stessa regola delle «sequenze», conflitto C-15).
- Limiti serviti: `MissionFightOutcome.companion: MissionCompanion` (`pet: ID!`, `name` mostrato, `lifeBefore`, `maxLifePoints`), `null` senza compagno a inizio scontro; `OverrideParticipant.companion: { lifeBefore, maxLifePoints } | null`.
- Effetti: `MissionFightEffects.companionLifeAfter: Int` (nullo senza compagno) sia in `simulated` sia in `corrected` — la stessa divisione di `hpBefore` (outcome) / `hpAfter` (effetti) di oggi. La bozza `companion { lifeBefore, lifeAfter }` del draft mescolerebbe simulato e corretto (conflitto C-6).
- Correzione: `ParticipantOverrideInput.companionLifeAfter: Int` (`@IsOptional @IsInt @Min(0)` sul filo come `hpAfter`); nel dominio `1..maxLifePoints`, **1 = sconfitto** (D-17 «minimo = sconfitto»); con un compagno assente a inizio scontro (mai equipaggiato o sconfitto prima) → `OUTCOME_OVERRIDE_INVALID`; omesso → vita d'inizio scontro (stessa regola di `hpAfter` omesso, `gm-overrides.ts:73-75`). Vale anche per `completePendingRequest` (input condiviso; legacy, stesso comportamento).
- Aggregato: `companionLifeAfter` dell'ultimo scontro in cui il compagno c'era (dopo una sconfitta il compagno non c'è più, quindi l'ultimo è quello della sconfitta).
- Completamento: `planParticipant` con l'effetto aggregato → stessa `companionAfterFight` (slot svuotato, `defeatedUntil`, `QuestResult.companion`). Nessun tiro (D-08 Phase 22 intatto).
- Bozze aperte al deploy: record senza i campi → `null` = nessun dato del compagno (indulgente; la simulazione rilanciata li riempie).

### Q12 — Proposta del filo (SDL VERBATIM, solo aggiunte, ordinato come lo emette Apollo con `sortSchema`)

Righe nuove dentro tipi esistenti:

```graphql
type AmbushReport {
  at: DateTime!
  nearCity: AmbushCity!
  onFoot: Boolean!
  reachedCity: AmbushCity
}

type MissionFightEffects {
  companionLifeAfter: Int
  consumablesUsed: [MissionItemUsage!]!
  hpAfter: Int!
  injuriesAdded: [InjuryType!]!
  spellsUsed: [MissionSpellUsage!]!
}

type MissionFightOutcome {
  character: ID!
  companion: MissionCompanion
  consumablesAvailable: [MissionItemUsage!]!
  corrected: MissionFightEffects
  hpBefore: Int!
  injuriesBefore: [InjuryType!]!
  simulated: MissionFightEffects
  spellsAvailable: [MissionSpellUsage!]!
}

type OwnedPet {
  currentLifePoints: Int!
  defeated: Boolean!
  fullLifeAt: DateTime
  lifeAsOf: DateTime
  name: String
  pet: Pet!
  potionRecoveryUntil: DateTime
  xp: Int!
}

input ParticipantOverrideInput {
  characterId: ID!
  companionLifeAfter: Int
  consumablesUsed: [ItemUsageInput!]
  hpAfter: Int
  injuries: [InjuryType!]
  spellsUsed: [SpellUsageInput!]
}

type Pet {
  attack: Damages!
  buyPrice: Coins!
  defense: Damages!
  id: ID!
  imagePath: String!
  maxLifePoints: Int!
  maxXp: Int!
  name: String!
  rarity: RarityType
  recoveryTime: Int
  relatedLore: [Lore!]!
  sellPrice: Coins!
  sellable: Boolean
  speedModifier: Float
}

enum PushEventType {
  ambush
  ambushDefeat
  missionStart
  petRecovered
  prisonRelease
  questCancelled
  questEnd
  streamerLive
  travelEnd
}

type QuestResult {
  # … campi esistenti invariati …
  coinsLost: Coins
  companion: CompanionOutcome
  consumablesUsed: [AssetQuantity!]!
  # …
}

type Mutation {
  # … righe esistenti invariate …
  renamePet(request: RenamePetRequest!): CommonResponse!
  useItem(itemId: ID!, petId: ID): UseItemResult!
}
```

Tipi e input nuovi:

```graphql
type CompanionOutcome {
  defeated: Boolean!
  fullLifeAt: DateTime
  lifePoints: Int!
  maxLifePoints: Int!
  name: String!
}

type MissionCompanion {
  lifeBefore: Int!
  maxLifePoints: Int!
  name: String!
  pet: ID!
}

input RenamePetRequest {
  id: String!
  name: String
  petId: String!
}
```

L'ordine dei valori di `PushEventType` è quello di `lexicographicSortSchema` (va verificato sul file generato: oggi il test cerca solo righe singole, `test/app.int-spec.ts:1025-1029`). Gli argomenti di `useItem` escono ordinati (`itemId` < `petId`). I codici di errore non sono nello SDL (enum TypeScript): nuovi `PET_DEFEATED`, `PET_POTION_RECOVERING`, `PET_NAME_INVALID` in `GameRuleErrorCode`; «vita piena» = `ITEM_NO_EFFECT` di oggi.

**Differenze dal draft di `23-REPO-RULES.md` e motivo:**

| Draft | Proposta | Perché |
|-------|----------|--------|
| `OwnedPet.id: ID!` (voce posseduta) | **nessun `id`**; chiave = `pet.id` | voci `_id: false`, una per specie (Q1); un id vero chiede un migratore e si rigenererebbe a ogni riscrittura dell'array (C-2) |
| `useItem(itemId: ID!, ownedPetId: ID)` | `useItem(itemId: ID!, petId: ID)` | stessa chiave di `equipPet(petId)` |
| `renamePet` con `ownedPetId: ID!`, `name: String` | `RenamePetRequest { id: String!, name: String, petId: String! }` | `@OwnsCharacter` vuole l'id del personaggio negli argomenti (come `EquipPetRequest`); tipi `String` come gli altri request del personaggio |
| rinomina «stessi codici di rifiuto» | `PET_NAME_INVALID` | `23-CONTEXT` D-21 dice «codice proprio»; `CHARACTER_NAME_INVALID` vive nell'enum della creazione |
| `Pet.recoveryTime: Int!` | `recoveryTime: Int` (nullable) | i 44 pet non hanno il campo finché l'orchestratore non semina: `Int!` annullerebbe ogni `Pet` e il personaggio (C-4) |
| `AmbushReport.companion: CompanionOutcome` | solo `QuestResult.companion`; in più `AmbushReport.onFoot: Boolean!` | il report d'imboscata è un `QuestResult` (C-5); `onFoot` serve alla copy di D-13 |
| `MissionFightOutcome.companion { nome, lifeBefore, lifeAfter, maxLifePoints }` | `MissionFightOutcome.companion: MissionCompanion { lifeBefore, maxLifePoints, name, pet }` + `MissionFightEffects.companionLifeAfter` | la vita dopo è un effetto, simulato **o** corretto, come `hpAfter` (C-6) |
| `companionLifeAfter: Int` in `SaveMissionDraftInput` | `ParticipantOverrideInput.companionLifeAfter: Int` | le correzioni vivono in `MissionFightInput.corrections: [ParticipantOverrideInput!]`, non su `SaveMissionDraftInput` (`test/app.int-spec.ts:956-1000`) |
| meccanismo di D-15 da decidere | nessun SDL: `QuestResult` scritto subito, «visto» = `acknowledgedAt` | Q9 |
| `PET_DEFEATED`, `PET_POTION_RECOVERING`, `PushEventType.ambush`, `PushEventType.petRecovered`, `QuestResult.companion`, `OwnedPet` (`name`, `defeated`, `currentLifePoints`, `lifeAsOf`, `fullLifeAt`, `potionRecoveryUntil`) | **confermati** | — |

**Blocchi di `test/app.int-spec.ts` da aggiornare (RED prima):** `CATALOGUE_PET_BLOCK` (`:80-81`, usato in `:433, 442, 554`), `OWNED_PET_BLOCK` (`:84-85`, `:454`), `MISSION_DRAFT_BLOCKS['type MissionFightEffects']` e `['type MissionFightOutcome']` (`:102-107`), riga `useItem(itemId: ID!): UseItemResult!` (`:727`), blocco `QuestResult` (`:770`), blocco `AmbushReport` (`:778-779`), `input ParticipantOverrideInput` (`:998-1000`), righe di `PushEventType` (`:1025-1029`, aggiunte `ambush`, `petRecovered`); attenzione a `kindLinesOf` (`:78-79, 127`: nessun campo nuovo deve contenere la parola `kind`) e a `not.toMatch(/TravelKind/)` (`activeTravel.mount` resta fuori dal filo). Blocchi nuovi da pinnare: `CompanionOutcome`, `MissionCompanion`, `RenamePetRequest`, riga `renamePet(request: RenamePetRequest!): CommonResponse!`.

**`test/authz/expected-handlers.ts`:** `'CharactersResolver.renamePet'` in `EXPECTED_OWNERSHIP_HANDLERS` e `EXPECTED_OWNER_ONLY_HANDLERS` (ordine alfabetico: dopo `'CharactersResolver.equipment'` / prima di `'PartyResolver.abandonQuest'` nelle due liste); fixture in `handler-fixtures.ts`. `useItem` resta senza decoratore di ownership (bearer-only, `test/app.int-spec.ts:1270`).

### Q13 — Dati per D-01: formula dei tempi di recupero (proposta per l'utente)

**Forma del catalogo leggibile dal codice** (`pet.model.ts`): `rarity` (`common`, `uncommon`, `rare`, `ultrarare`, `legendary`, nullable, `rarity-type.enum.ts`), `maxXp` (Int, nullable), `maxLifePoints` (Int, nullable), `speedModifier`, `sellable`; nessun seed nel repo (D-36), i 44 pet reali li interroga l'orchestratore. Pet con `rarity` o `maxLifePoints` nulli: la formula non si applica → riga marcata «da curare a mano».

**Proposta** `[ASSUMED: scelta di gioco]`:

```
T (minuti) = B(rarità) × √(maxLifePoints / 100) × (1 + maxXp / 2000), arrotondato ai 5 minuti; a DB in millisecondi
B: common 20, uncommon 30, rare 40, ultrarare 50, legendary 60
```

Ragionamento: la rarità dà la scala (un leggendario fuori gioco per una sessione, un comune per una pausa caffè); `√(vita)` perché la vita va da 100 a 5900 (×59) e una crescita lineare darebbe ore assurde ai grandi; `maxXp` misura il «potere» (fino a 2350) con un peso moderato (al massimo ×2,2). Esempi:

| Pet | Rarità | Vita | maxXp | Calcolo | T |
|-----|--------|------|-------|---------|---|
| Falco | common | 100 | 100 | 20 × 1 × 1,05 = 21 | **20 min** |
| ipotetico | uncommon | 300 | 250 | 30 × 1,732 × 1,125 = 58,5 | **1 h** |
| ipotetico | rare | 1000 | 600 | 40 × 3,162 × 1,3 = 164 | **2 h 45 min** |
| ipotetico | ultrarare | 2500 | 1200 | 50 × 5 × 1,6 = 400 | **6 h 40 min** |
| Pegaso | legendary | 5900 | 2350 | 60 × 7,681 × 2,175 = 1002 | **16 h 40 min** |

Giocabilità: il ferito non sconfitto recupera in proporzione (Falco da metà vita: 10 min); lo sconfitto attende il `T` intero. Con le pozioni di potenza fissa, un pet da 5900 di vita guadagna poco per pozione: il tempo lungo è il prezzo della sua forza. L'utente può regolare solo i cinque `B` per spostare tutta la tabella.

### Q14 — Baseline dei test e validazione

Baseline (22 BACKEND-NOTES, `:6`): unit 296 suite / 3 944 test; integration a blocchi (`src/quests/outcomes` 14/206, resto di `src/quests` 30/518, `src/characters` 26/417, `src/travel` 12/250, resto 71/936); boot reale `test/app.int-spec.ts` 101/101. Suite complete **non** eseguite in questa ricerca.

**Spec che andranno in RED (per scelta, da riscrivere nel piano che cambia il comportamento):**

| Spec | Caso | Piano |
|------|------|-------|
| `src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts:282` | «ignores the companion and draws the same sequence (D-20)» | porta + segnaposto |
| `src/characters/pets/owned-pet-entry.spec.ts`, `owned-pets.mapper.spec.ts` | forma a tre chiavi, mapper senza `now` | modello |
| `src/characters/pets/equip-pet.updates.spec.ts`, `equip-pet.int-spec.ts` | `updateOne` cieco | equip |
| `src/quests/outcomes/pets/companion-xp.spec.ts` | premio inglobato in `companionAfterFight` | esiti |
| `src/travel/ambush/ambush-plan.spec.ts` | `$push` del report, viaggio della sconfitta con `ambushReports` | imboscate D-15 |
| `src/travel/ambush/ambush-resolution.int-spec.ts:273, 532, 738, 762` | report trattenuto, «never pushes on a victory (D-12)», report portati nel viaggio riscritto, push `ambushDefeat` | imboscate D-14/D-15 |
| `src/travel/ambush/ambush-lifecycle.int-spec.ts:338, 398, 437, 805, 936` | consegna all'arrivo, «pushes every defeat and never a victory (D-12)», teleport che consegna | imboscate D-14/D-15 |
| `src/push/push-events.spec.ts` | catalogo dei tipi | push |
| `src/gameRules/game-rule.exception.spec.ts` | tabella delle fabbriche | ogni piano con un codice |
| `src/graphql/format-domain-error.spec.ts` | allowlist di `recoveryUntil` | pozione |
| `src/validation/input-decorators.spec.ts:136` | input del filo | rinomina |
| `src/models/sweep-indexes.schema.spec.ts` | indici degli sweep | push «in forze» |
| `src/models/pet.schema.spec.ts:112` | «declares no state on the catalogue pet (D-03)» — verificare che `recoveryTime` (regola, non stato) non lo rompa | catalogo |
| `src/models/character/active-travel.schema.spec.ts` | chiavi interne del viaggio (`mount`) | D-13 |
| `src/quests/guided/fight-state.spec.ts`, `guided-outcome.spec.ts`, `mission-draft.mapper.spec.ts`, `src/quests/outcomes/gm-overrides.spec.ts` | forme degli effetti e dei limiti | guidato |
| `test/app.int-spec.ts` | blocchi di §Q12, liste delle autorizzazioni | ogni piano col filo |
| `test/fixtures/owned-pet.fixture.ts` | seed a tre chiavi (non una spec, ma usato ovunque) | modello |

**Wave 0:** nessun framework da installare; mancano solo le spec nuove (elenco in §Validation Architecture).

### Q15 — Ordine dei piani consigliato

Sequenziale, un piano alla volta, TDD; 18 piani (come la Phase 22). Dipendenze in parentesi.

1. **23-01 Modello e orologio** — `companion-life.ts` (funzione pura, predicato, nome mostrato) + campi Mongoose della voce + `NewOwnedPetEntry`/`normalisedOwnedPets` che li conservano + fixture. Nessun filo. (—)
2. **23-02 Catalogo e filo del compagno** — `Pet.recoveryTime`, reporter d'avvio, campi di `OwnedPet` sul filo (mapper con `now`), pin SDL, `schema.gql`. (01)
3. **23-03 Equip/unequip con assestamento e `PET_DEFEATED`** — transazione, ordine dei rifiuti. (01, 02)
4. **23-04 Porta del combattimento** — `companionLifeAfter`, segnaposto senza tiri, dungeon D-12, guardia (`foughtSnapshotOf`, `mergedEffects`). (01)
5. **23-05 Esiti: `companionAfterFight`** — `planParticipant`, `planUnrewarded`, slot svuotato, `QuestResult.companion` (Mongoose + filo + pin). (01, 04)
6. **23-06 Copertura dei percorsi** — int-spec di quest, boss, dungeon (D-12), soccorso, guardia/crime, completamento GM legacy. (05)
7. **23-07 Pozione sul compagno** — `useItem(itemId, petId)`, codici, allowlist, pin. (01, 02)
8. **23-08 `renamePet`** — `PET_NAME_INVALID`, liste di autorizzazione, matrice, registro degli input, pin. (01, 02)
9. **23-09 Push «in forze»** — sweeper + servizio + indice + `PushEventType.petRecovered` + testi. (05)
10. **23-10 Imboscate: compagno e `QuestResult` immediato (D-10, D-15)** — consegna legacy all'arrivo conservata. (05)
11. **23-11 Push `ambush` per ogni imboscata (D-14)** — testi col nome mostrato. (10)
12. **23-12 Cavalcatura fotografata** — `activeTravel.mount` nei due costruttori del viaggio. (—, prima di 13)
13. **23-13 Strada residua a piedi (D-13)** — pianificatore puro del viaggio residuo, cibo, rimappa della prossima imboscata, job, `AmbushReport.onFoot`. (10, 12)
14. **23-14 Fame e deviazione a piedi (D-16)** — ridirezionamento, corsia abbandonata, deviazione a piedi in sconfitta. (13)
15. **23-15 Guidato: proposta** — stato sovrapposto col compagno, `MissionCompanion`, `MissionFightEffects.companionLifeAfter`, record. (04, 05)
16. **23-16 Guidato: correzione e completamento** — `ParticipantOverrideInput.companionLifeAfter`, `validateOverrides`, aggregato, `completePendingRequest` legacy. (15)
17. **23-17 Gate** — `tsc`, suite unit, integration a blocchi `--runInBand`, boot reale, coverage per cartella (la suite con coverage la lancia l'orchestratore in background). (tutti)
18. **23-18 Handoff** — `BACKEND-NOTES.md` (SDL verbatim, semantica, comportamenti provati, descrizione della tabella dei tempi e passi UAT), `requirements mark-complete`. (17)

## Conflitti con il CONTEXT

| # | Decisione | Problema nel codice | Alternative (raccomandata in grassetto) |
|---|-----------|---------------------|-----------------------------------------|
| C-1 | D-21 «stesso filtro dei contenuti» | Nessun filtro dei contenuti sul nome del personaggio: solo regole di forma (`character-name.ts`); la moderazione esiste solo per le immagini | **(a) stesse regole di forma, nessun filtro di parole**; (b) filtro nuovo di parole per personaggio e compagno (scope in più; una lista di parole è contenuto: andrebbe a DB per D-36) |
| C-2 | Draft `OwnedPet.id` / `ownedPetId` | Voci senza `_id`, una per specie; la riscrittura dell'array le ricostruisce | **(a) chiave = id del pet a catalogo** (`petId`); (b) `_id` sulle voci con migratore one-shot e normalizzazione che lo conserva |
| C-3 | D-04 esempio (20 → 40 in 20 min) vs D-02 «dal minimo al pieno nel tempo pieno» | Con velocità `(max − 1)/T` l'esempio dà 39,8; con `max/T` lo sconfitto torna prima di `T` | **arrotondamento al più vicino con velocità `(max − 1)/T`** (entrambe vere); alternativa: troncamento con `max/T` (esempio esatto, sconfitto un 1 % prima) |
| C-4 | Draft `Pet.recoveryTime: Int!` | Campo assente su tutti i pet fino alla semina | **`Int` nullable + recupero istantaneo per i non curati + WARN al boot**; alternativa `Int!` con 0 servito al posto di null |
| C-5 | Draft `AmbushReport.companion` | Il report è un `QuestResult` | **solo `QuestResult.companion`** |
| C-6 | Draft guidato (`companion.lifeAfter`, correzione in `SaveMissionDraftInput`) | Effetti simulati/corretti separati; correzioni in `ParticipantOverrideInput` condiviso con `completePendingRequest` | **`MissionFightEffects.companionLifeAfter` + `ParticipantOverrideInput.companionLifeAfter`** (anche il legacy lo accetta) |
| C-7 | D-13 «cavalcatura sconfitta» | Velocità non persistita; `equipPet` ammesso in viaggio: oggi non si sa quale pet portava il personaggio alla partenza | **campo interno `activeTravel.mount` scritto alla partenza; viaggi in volo al deploy senza ricalcolo**; alternativa: considerare cavalcatura il pet equipaggiato all'imboscata (sbaglia se equipaggiato dopo la partenza) |
| C-8 | D-13 «durata, arrivo, cibo, lavoro di completamento» | La prossima imboscata è già sorteggiata sul viaggio vecchio col rischio per ora locale | **rimappa per km senza tiri** (ora del rischio approssimata); alternativa: risorteggio dopo lo scontro (tiri nuovi, rieseguiti sui WriteConflict) |
| C-9 | D-15 report in viaggio | Supera Phase 15 D-13; con il `QuestResult` immediato anche la FE pre-merge riceverà i report a viaggio in corso (il suo `QuestResultsCubit` li accoda appena arrivano) | **`QuestResult` scritto subito**, accettando che la FE di oggi li mostri prima; alternativa: campo `unseen` sul viaggio esposto sul filo (SDL nuovo, due meccanismi di «visto») |
| C-10 | D-14 push per ogni imboscata | `ambushDefeat` è la categoria di oggi con il suo interruttore FE; la FE pre-merge non conosce `ambush` | **`ambush` per tutte, `ambushDefeat` nell'enum ma non più inviato**; alternativa: `ambushDefeat` per le sconfitte + `ambush` per le vittorie |
| C-11 | D-16 «come dopo una sconfitta» | La deviazione di oggi va alla velocità del pet equipaggiato | deviazione **a piedi** se la cavalcatura è caduta (stesso principio di D-13) |
| C-12 | (nessuna decisione) rinomina in missione | Il lucchetto copre equip e pozioni | **rinomina libera** (cosmetica); alternativa: bloccata |
| C-13 | D-03 «arrivato al minimo» | Un compagno equipaggiato a 1 (ferito, D-04) che resta a 1 | **sconfitto** (è al minimo in uno scontro); alternativa: solo se `companionLifeAfter < vita d'ingresso` (la porta non distingue «colpito ma già a 1») |
| C-14 | D-11 «push quando torna a vita piena» | Lo sweeper ha un ritardo massimo di 60 s | accettato (precedente prigione); alternativa: job Bull ritardato esatto (cancellazione alla vendita da gestire) |
| C-15 | D-12 «dungeon» | La missione guidata ha scontri in sequenza come i piani | **D-12 esteso agli scontri della missione guidata** |
| C-16 | D-01 «44 pet» | Pet con `rarity`/`maxLifePoints` nulli non entrano nella formula | righe «da curare a mano» nella tabella dell'orchestratore |

## Open Questions (RESOLVED)

1. **Unità di `recoveryTime`?** — ms, come pozioni e magie (Q3).
2. **Calcolo pigro o sweep della vita?** — pigro, ancora `currentLifePoints @ lifeAsOf`; sweep solo per la push (Q2, Q10).
3. **Cosa serve la FE per interpolare?** — `currentLifePoints`, `lifeAsOf`, `fullLifeAt`, `pet.maxLifePoints`; nessuna regola lato FE (Q2).
4. **Marcatore di sconfitta?** — `defeatedUntil` (data), `defeated` risolto sul filo (Q2).
5. **Bozza del motore: chi decide la sconfitta?** — il piano, `companionLifeAfter === 1` (Q4, C-13).
6. **Push «in forze»: Bull o sweeper?** — sweeper con claim (Q10, SONDA P2).
7. **Report d'imboscata in viaggio: meccanismo?** — `QuestResult` immediato, «visto» = `acknowledgedAt` (Q9, C-9).
8. **Push `ambush`: `id`?** — id del `QuestResult` (Q9).
9. **Rinomina all'acquisizione?** — via `renamePet` dopo l'acquisto o il premio, nessun argomento nuovo (Q7).
10. **`UseItemResult` per il compagno?** — invariato, semantica nel handoff (Q5).
11. **Lore della pozione data al compagno?** — sbloccate al personaggio come quando beve (Q5).
12. **Il legacy `completePendingRequest` accetta `companionLifeAfter`?** — sì, input condiviso (Q11).
13. **Compagno entrato già a 1 e rimasto a 1?** — sconfitto (C-13).
14. **Bozze guidate aperte al deploy?** — lette senza i campi nuovi (Q11).

### Per l'utente

1. **Filtro dei contenuti del nome (C-1):** oggi il nome del personaggio ha solo regole di forma (2–20 caratteri tra lettere, spazi, apostrofi e trattini). Va bene lo stesso per il compagno, o si vuole un filtro di parole nuovo (per entrambi)?
2. **Push delle imboscate (C-10):** una sola categoria «Imboscate» per vittorie e sconfitte (consigliato), o due interruttori separati?
3. **Formula dei tempi (Q13):** i cinque valori base per rarità (20/30/40/50/60 minuti) e i pesi di vita e xp sono una proposta: l'utente rivede la tabella calcolata dall'orchestratore prima della scrittura a DB (D-01).

## Pitfalls

### Pitfall 1: la riscrittura dell'array cancella i campi nuovi
**Cosa succede:** un acquisto, un premio di pet o l'xp del compagno riscrivono `assets.ownedPets` con le sole tre chiavi di oggi e cancellano nome, sconfitta, ancora e attesa. **Prova:** SONDE P1 e P3. **Come evitarlo:** nello stesso piano che aggiunge i campi allo schema, `NewOwnedPetEntry`/`normalisedOwnedPets` li portano tutti (con normalizzazione: data valida o `null`, nome stringa o `null`); spec che riscrive un array con tutti i campi e li ritrova con `toEqual`.

### Pitfall 2: `Int!` su un campo che il DB non ha ancora
**Cosa succede:** `Pet.recoveryTime: Int!` o `OwnedPet.defeated: Boolean!` serviti da un documento grezzo annullano il personaggio. **Come evitarlo:** `recoveryTime` nullable; `defeated` sempre calcolato dal mapper di `findOne` (unico percorso che popola le voci). Attenzione a `CharactersService.findAll` (query dell'oste `characters`, `characters.service.ts:93-98`): non mappa i posseduti; se una FE selezionasse `ownedPets { defeated }` lì, servirebbe un `@ResolveField` su `OwnedPet` (pattern `CharacterStatusResolver`).

### Pitfall 3: ordine dei tiri
**Cosa succede:** un tiro nuovo per il danno del compagno o per risorteggiare l'imboscata di D-13 sposta le sequenze pinnate. **Come evitarlo:** danno del compagno deterministico dalla perdita del personaggio; rimappa senza tiri (C-8).

### Pitfall 4: velocità «fotografata» non persistita
**Cosa succede:** D-13 applicato al pet equipaggiato a metà viaggio allunga un viaggio partito a piedi. **Come evitarlo:** `activeTravel.mount` alla partenza; nessun ricalcolo senza il campo.

### Pitfall 5: l'identità del viaggio cambia col `startTime`
**Cosa succede:** riscrivendo il viaggio da `at` (D-13, D-16) il job di completamento e quello dell'imboscata col vecchio `startTime` diventano stantii. **Come evitarlo:** `cancel` + `schedule` + `scheduleAmbush` col nuovo `startTime` dopo il commit (pattern `afterDefeat`); i job vecchi sono no-op per identità (`ambushFilter`).

### Pitfall 6: equip prima dello sweep
**Cosa succede:** se `equipPet` azzerasse `defeatedUntil` già passato, lo sweeper non manderebbe la push. **Come evitarlo:** equip non tocca il marcatore; il claim tocca solo il marcatore (mai la vita).

### Pitfall 7: extensions filtrate
**Cosa succede:** `PET_POTION_RECOVERING` con `recoveryUntil` esce senza data (`format-domain-error.ts:78-85` ammette la chiave solo per `POTION_RECOVERING`). **Come evitarlo:** estendere l'allowlist nello stesso piano, caso RED sul formatter.

### Pitfall 8: `planUnrewarded` ignora i pet
**Cosa succede:** il compagno ferito o sconfitto in una sconfitta senza soccorso, in un arresto o in una guardia persa non viene scritto. **Come evitarlo:** `companionAfterFight` anche in `planUnrewarded`, con lo stesso filtro di guardia.

### Pitfall 9: report trattenuti dei viaggi in volo
**Cosa succede:** togliendo la consegna all'arrivo, i report già trattenuti al deploy si perdono. **Come evitarlo:** la consegna all'arrivo/teleport resta (legge un campo che dopo il deploy nessuno scrive più).

### Pitfall 10: spec unitarie e `AppModule`
Trappola PR #25: una spec unitaria non importa `AppModule`; i servizi nuovi (sweeper, reporter) si provano con l'harness `createOutcomeHarness` (`test/quests/outcome-world`) come `prison-release.int-spec.ts`.

## Code Examples

### Vita a riposo (forma, da implementare in TDD)

```ts
// Source: proposta di questa ricerca (§Q2), verificata a mano sull'esempio di D-04
export function companionLifeAt(input: CompanionLifeInput): CompanionLife {
    const max = positiveIntegerOr(input.maxLifePoints, null);
    const stored = typeof input.lifePoints === 'number' ? Math.floor(input.lifePoints) : 0;
    if (max === null) return { lifePoints: Math.max(1, stored), fullLifeAt: null };
    const life = stored <= 0 ? max : Math.min(max, stored);
    if (!input.resting || !(input.lifeAsOf instanceof Date)) return { lifePoints: life, fullLifeAt: null };
    const T = positiveIntegerOr(input.recoveryTimeMs, null);
    if (T === null || life >= max || max === 1) return { lifePoints: max, fullLifeAt: null };
    const asOf = input.lifeAsOf.getTime();
    const fullLifeAt = new Date(asOf + Math.ceil(((max - life) * T) / (max - 1)));
    if (input.now.getTime() >= fullLifeAt.getTime()) return { lifePoints: max, fullLifeAt: null };
    const regained = Math.round(((input.now.getTime() - asOf) * (max - 1)) / T);
    return { lifePoints: Math.min(max - 1, life + regained), fullLifeAt };
}
```

### Claim della push «in forze» (forma provata da SONDA P2)

```ts
// Source: sonda P2 (MongoMemoryReplSet), schema di prison-release.service.ts:29-43
const claim = await characterModel.updateOne(
    { _id: characterId, ...ACTIVE_CHARACTER_FILTER,
      'assets.ownedPets': { $elemMatch: { pet: petId, defeatedUntil: { $lte: now } } } },
    { $set: { 'assets.ownedPets.$[entry].defeatedUntil': null } },
    { arrayFilters: [{ 'entry.pet': petId, 'entry.defeatedUntil': { $lte: now } }] },
).exec();
if (claim.modifiedCount === 1) await notifyOwner(characterId, displayName);
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La formula dei tempi (B per rarità, √vita, peso xp) è giocabile | Q13 | solo la tabella da rivedere (l'utente la vede prima della scrittura) |
| A2 | La FE pre-merge mostra i `QuestResult` d'imboscata appena arrivano (letto in `quest_results_cubit.dart:355-367`, non provato su device) | Q9, C-9 | report visibili in viaggio già prima della merge FE: comportamento voluto da D-15, ma anticipato |
| A3 | Il ricalcolo del cibo come «stop + nuova partenza» è coerente con `settlementOf` | Q9 passo 5 | pasto doppio o fame contata due volte: da provare con una sonda nel piano 23-13 |
| A4 | `lexicographicSortSchema` ordina anche i valori dell'enum e gli argomenti | Q12 | solo l'ordine dei blocchi pinnati: si corregge leggendo `schema.gql` generato |
| A5 | Perdita del compagno nel segnaposto = perdita del personaggio | Q4 | numeri provvisori (il motore vero li sostituisce) |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tsc, jest | ✓ | 22.12.0 | — |
| Jest | unit/integration | ✓ | 30.1.2 | — |
| MongoMemoryReplSet | integration (transazioni, change stream) | ✓ (sonda eseguita) | `mongodb-memory-server` del repo | — |
| Mongoose | modelli | ✓ | ^8.18.1 | — |
| DB reale, BE avviato | UAT | — (vietato agli esecutori) | — | orchestratore dopo l'ultimo piano |

Nessuna dipendenza mancante; nessuna dipendenza nuova da installare.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 (progetti `unit` e `integration` in `package.json` §jest), `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`) |
| Config file | `package.json` (`jest.projects`) |
| Quick run command | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| Full suite command | gate: unit completa + integration a blocchi `--runInBand` (`src/quests/outcomes`, resto di `src/quests`, `src/characters`, `src/travel`, resto) + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`; `test:cov` dall'orchestratore in background |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-PET-01 | vita a riposo lineare, esempio 20→40, minimo 1, legacy piena, istantanea senza `T` (D-02, D-03, D-04) | unit | `npx jest src/characters/pets/companion-life.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-PET-01 | riscrittura dell'array conserva i campi nuovi (D-03) | unit | `npx jest src/characters/pets/owned-pet-entry.spec.ts src/economy/trade/trade-pets.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-PET-02 | `OwnedPet` sul filo con date e `defeated`; `Pet.recoveryTime` nullable | unit + int | `npx jest src/characters/pets/owned-pets.mapper.spec.ts --selectProjects unit`; `npx jest src/characters/pets/owned-pet-state.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | mapper ✅ / int ❌ Wave 0 |
| BE-PET-02 | reporter dei pet senza `recoveryTime` | unit | `npx jest src/characters/pets/pet-recovery-catalog.reporter.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-PET-03 | equip/unequip assestano; `PET_DEFEATED`; lucchetto prima | unit + int | `npx jest src/characters/pets/equip-pet.plan.spec.ts --selectProjects unit`; `npx jest src/characters/pets/equip-pet.int-spec.ts src/characters/mission-lock/character-mutations-lock.int-spec.ts --selectProjects integration --runInBand` | plan ❌ / int ✅ |
| BE-PET-04 | segnaposto danneggia il compagno senza tiri; dungeon D-12; guardia | unit | `npx jest src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts src/quests/outcomes/guard/guard-outcome.spec.ts --selectProjects unit` | ✅ |
| BE-PET-05 | `companionAfterFight`, slot svuotato, `QuestResult.companion` | unit + int | `npx jest src/quests/outcomes/pets/companion-after-fight.spec.ts src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit`; `npx jest src/quests/outcomes/companion-defeat.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 (nuove) |
| BE-PET-06 | pozione sul compagno, rifiuti e attesa propria (D-05..D-07) | unit + int | `npx jest src/characters/items/item-use.plan.spec.ts src/graphql/format-domain-error.spec.ts --selectProjects unit`; `npx jest src/characters/items/use-item.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-PET-07 | `renamePet` regole, codice, owner-only | int | `npx jest src/characters/pets/rename-pet.int-spec.ts test/authz/authorization-matrix.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | rename ❌ Wave 0 |
| BE-PET-08 | sweeper con claim, una push, nessuna dopo la vendita (D-11) | int | `npx jest src/characters/pets/pet-recovery.int-spec.ts --selectProjects integration --runInBand`; `npx jest src/models/sweep-indexes.schema.spec.ts src/push/push-events.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-PET-09 | `QuestResult` immediato, push per ogni imboscata (D-10, D-14, D-15) | int | `npx jest src/travel/ambush/ambush-resolution.int-spec.ts src/travel/ambush/ambush-lifecycle.int-spec.ts --selectProjects integration --runInBand` | ✅ (da riscrivere) |
| BE-PET-10 | strada residua a piedi, cibo, rimappa, job (D-13) | unit + int | `npx jest src/travel/ambush/ambush-on-foot.spec.ts --selectProjects unit`; `npx jest src/travel/ambush/ambush-on-foot.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-PET-11 | ridirezionamento per fame, quest abbandonata, deviazione a piedi (D-16) | int | `npx jest src/travel/ambush/ambush-on-foot.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-PET-12 | proposta, correzione 1..max, aggregato, completamento (D-17) | unit + int | `npx jest src/quests/guided/fight-state.spec.ts src/quests/guided/guided-outcome.spec.ts src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit`; `npx jest src/quests/guided/mission-simulation.service.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-PET-13 | SDL additivo, liste, gate | int | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ |

### Sampling Rate
- **Per task commit:** la sola spec mirata del task (`--selectProjects unit` o `integration --runInBand`) + `npx tsc --noEmit -p tsconfig.json`.
- **Per piano:** le spec della cartella toccata + `test/app.int-spec.ts` se il piano cambia decoratori.
- **Phase gate:** suite completa (piano 23-17) verde prima di `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/characters/pets/companion-life.spec.ts` — funzione pura, predicato, nome mostrato (BE-PET-01)
- [ ] `src/characters/pets/owned-pet-state.int-spec.ts` — filo del compagno a riposo, sconfitto, legacy (BE-PET-02)
- [ ] `src/characters/pets/pet-recovery-catalog.reporter.spec.ts` (BE-PET-02)
- [ ] `src/characters/pets/equip-pet.plan.spec.ts` (BE-PET-03)
- [ ] `src/quests/outcomes/pets/companion-after-fight.spec.ts` + `src/quests/outcomes/companion-defeat.int-spec.ts` (BE-PET-05)
- [ ] `src/characters/pets/rename-pet.int-spec.ts` (BE-PET-07)
- [ ] `src/characters/pets/pet-recovery.int-spec.ts` (BE-PET-08)
- [ ] `src/travel/ambush/ambush-on-foot.spec.ts` + `.int-spec.ts` (BE-PET-10, BE-PET-11)
- [ ] `test/fixtures/owned-pet.fixture.ts` esteso ai campi nuovi (condiviso)
- Nessun framework da installare.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (invariata) | JWT di sessione esistente |
| V3 Session Management | no | — |
| V4 Access Control | yes | `@OwnsCharacter(..., { ownerOnly: true })` su `renamePet`; `useItem` dal bearer (`currentCharacter`); liste enumerate al boot reale + matrice |
| V5 Input Validation | yes | class-validator di forma (`@IsObjectIdHex`, `@IsOptional`, `@IsInt`, `@MaxLength`) + regole di dominio (`isValidCharacterName`, limiti `1..max` in `validateOverrides`) |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| rinomina o pozione sul compagno altrui | Elevation | owner-only / bearer; filtro `activeCharacterById` + voce posseduta |
| doppia pozione concorrente per aggirare l'attesa | Tampering | transazione con snapshot in sessione e filtro di guardia sulla voce |
| nome con caratteri di controllo o lunghissimo | Tampering | normalizzazione NFC + regole del nome + tetto di forma sul filo |
| push duplicata «in forze» | Repudiation/DoS lieve | claim atomico, push solo con `modifiedCount === 1` |
| correzione dell'oste fuori limite | Tampering | `OUTCOME_OVERRIDE_INVALID` su `companionLifeAfter` fuori `1..max` o senza compagno |
| log con dati personali | Information disclosure | log con soli id, conteggi e codici (`describeError`) |

## Sources

### Primary (HIGH)
- Codice del branch `feat/23-sconfitta-riposo-recupero-compagni` (percorsi e righe citati in ogni sezione).
- SONDA `src/characters/pets/zz-probe-23.int-spec.ts` (cancellata), `npx jest … --selectProjects integration --runInBand`, 3/3 verdi: P1 `normalisedOwnedPets` scarta le chiavi ignote; P2 claim con `arrayFilters` una sola volta, altre voci intatte; P3 `OwnedPetSchema` attuale scarta le chiavi ignote in una scrittura con cast.
- `.planning/phases/22-completamento-guidato-missioni/BACKEND-NOTES.md` (baseline, guidato), `15-CONTEXT.md` D-11..D-17 (imboscate), FE `22-CONTEXT.md` (decisioni).

### Secondary (MEDIUM)
- FE `lib/screens/mainScreen/questResultsCubit/quest_results_cubit.dart:355-367` (sola lettura: accodamento dei risultati d'imboscata).

### Tertiary (LOW)
- Formula dei tempi (Q13): proposta di gioco.

## Metadata

**Confidence breakdown:**
- Modello, porta, percorsi di combattimento, pozione, autorizzazioni: HIGH — letti nel codice, trappole provate da sonda.
- Orologio e push «in forze»: HIGH sulla meccanica (sonda P2), MEDIUM sulla regola di arrotondamento (scelta).
- Viaggio D-13/D-16: MEDIUM — struttura chiara, ricalcolo del cibo da provare nel piano.
- Formula D-01: LOW — proposta per l'utente.

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (codice stabile; rileggere se cambiano `ambush-*` o `owned-pet-entry.ts` prima dei piani)
