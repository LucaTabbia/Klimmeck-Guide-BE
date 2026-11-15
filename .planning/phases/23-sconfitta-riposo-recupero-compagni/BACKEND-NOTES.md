# BACKEND-NOTES — Phase 23 Sconfitta, riposo e recupero dei compagni (handoff per la FE Phase 22 e la UAT)

- **Fase BE:** 23-sconfitta-riposo-recupero-compagni (requisiti BE-PET-01..14; decisioni D-01..D-33 e D-37..D-39 in `23-CONTEXT.md`, le aggiunte dopo la ricerca vincono sul resto; nomi fissati in `23-REPO-RULES.md`). **Companion:** FE Phase 22 «companion defeat, rest and recovery», ramo FE `feat/22-companion-defeat-rest-and-recovery`.
- **Data:** 2026-11-14. Scritto dopo il gate 23-17 e dopo le correzioni della code review per aree (`23-REVIEW.md`, `23-REVIEW-FIX.md`: 19 finding, 14 corretti, 2 confermati com'erano, 3 rinviati). Descrive il codice FINALE della HEAD del ramo (`ff2b5f3c` più i soli commit di documentazione).
- **Branch:** `feat/23-sconfitta-riposo-recupero-compagni` → PR verso `develop` a cura dell'orchestratore, dopo `npm run test:cov`, verifica, audit, scrittura a DB della tabella dei tempi rivista dall'utente, riavvio reale del BE dal ramo e UAT su device (§6).
- **Gate 23-17:** `npx tsc --noEmit` 0; unit 304 suite / 4 193 test; integration 160 suite / 2 442 test in cinque blocchi `--runInBand` (`src/quests/outcomes` 16 / 222, resto di `src/quests` 30 / 537, `src/characters` 30 / 472, `src/travel` 13 / 271, resto 71 / 940); boot reale + matrice authz 2 suite / 233 test; coverage per cartella sopra soglia (economy 100 / 94,25 / 100, `characters.service.ts` 98,79 / 89,47 / 100 dopo il test aggiunto nel gate, travel 98,83 / 87,91 / 99,42).
- **Dopo le correzioni della review:** `tsc` 0; unit 304 suite / 4 206 test; integration (160 suite in tutto) `src/characters` 30 / 475, `src/travel` 13 / 277, `src/quests/outcomes` 16 / 222, `src/quests/guided` 5 / 93, boot reale `test/app.int-spec.ts` 1 / 102. `src/schema.gql` invariato dai fix. `npm run test:cov` completo: eseguito dall'orchestratore il 2026-11-14 sul codice finale (dopo le correzioni della review): 464 suite / 6 657 test verdi, uscita 0 (soglie rispettate), copertura complessiva 97,84 / 86,51 / 95,32 / 98,37 (istruzioni / rami / funzioni / righe).
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, migrazione, seeder o one-off; nessun file di contenuto nel repo (D-36 del progetto). La tabella dei tempi di recupero dei 44 pet NON è nel repo (D-25, §6): la scrive a DB l'orchestratore dopo l'approvazione dell'utente.
- **Fonte:** ogni nome, percorso, codice e titolo di caso è copiato dal codice (`src/characters/pets/`, `src/characters/items/`, `src/quests/outcomes/`, `src/quests/guided/`, `src/travel/ambush/`, `src/push/`). **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Una chiave sola** (D-23, W-2): il compagno si identifica OVUNQUE con l'id del pet a catalogo (`equipPet`, `useItem(itemId, petId)`, `RenamePetRequest.petId`, `MissionCompanion.pet`, `id` della push `petRecovered`). Una voce posseduta per specie resta un invariante. `OwnedPet.id` non esiste.
2. **Campi nuovi di `OwnedPet`:** `defeated`, `fullLifeAt`, `level`, `lifeAsOf`, `maxLifePoints`, `name`, `potionRecoveryUntil`. **`Pet.recoveryTime: Int`** (millisecondi, nullo = recupero istantaneo) (D-24, D-25).
3. **Livelli del compagno** (D-37, D-38, D-39): `OwnedPet.level` (1..10) e `OwnedPet.maxLifePoints` (massimo DEL COMPAGNO al suo livello); `Pet.maxLifePoints` resta la base della specie. Il livello del compagno è salvato sulla voce; quello del personaggio era già salvato (`status.level`, scritto a ogni esito e servito su `CharacterStatus.level`: nessun cambiamento).
4. **`useItem(itemId: ID!, petId: ID)`**: con `petId` la pozione va al compagno (D-32); senza, invariata.
5. **`renamePet(request: RenamePetRequest!)`** (D-31): nome del compagno, owner-only, non bloccata dalla missione.
6. **`QuestResult.companion: CompanionOutcome`** ogni volta che un compagno ha combattuto, nullo altrimenti (D-27), anche nei risultati d'imboscata.
7. **Report d'imboscata scritti all'istante** come `QuestResult` `kind: ambush` (D-28): visibili a viaggio in corso, «visto» = `acknowledgeQuestResult`. `AmbushReport.onFoot: Boolean!` (riga «Prosegui a piedi»).
8. **Push** (D-30, D-11): `ambush` per OGNI imboscata, vinta o persa (`id` = id del `QuestResult`); `ambushDefeat` non parte più (resta nell'enum e in `sendTestPush`). **La FE di oggi non conosce `ambush` e non riceve più `ambushDefeat` finché non entra la sua PR: da gestire alla merge.** `petRecovered` quando un compagno sconfitto torna in forze (`id` = id del pet).
9. **Flusso guidato** (D-33): `MissionFightOutcome.companion: MissionCompanion`, `MissionFightEffects.companionLifeAfter: Int`, `ParticipantOverrideInput.companionLifeAfter: Int`. Correggendo un partecipante, ogni campo omesso o `null` vale il valore simulato di quello scontro (anche `companionLifeAfter`); un valore esplicito, anche `[]`, vince. Rimandare i valori simulati resta lecito (§2 g, A-08, fix/23).
10. **Codici nuovi:** `PET_DEFEATED`, `PET_POTION_RECOVERING` (con `extensions.recoveryUntil`), `PET_NAME_INVALID`.
11. **Non selezionare i compagni nella query dell'oste `characters`**: lì `assets.ownedPets.pet` non è popolato (W-1, W-3).

---

## 1. SDL aggiunto (verbatim)

Blocchi copiati da `src/schema.gql` (ordine alfabetico di `sortSchema`). Prova: `git diff 2c462cbe -- src/schema.gql` = 36 righe aggiunte e 1 tolta; la tolta e una delle aggiunte sono la riga di `useItem`, che guadagna l'argomento opzionale `petId` (SDL additivo nella sostanza: le chiamate di oggi restano valide). Conteggio identico al gate 23-17; i fix della review non hanno toccato lo SDL.

Tipi nuovi:

```graphql
type CompanionOutcome {
  defeated: Boolean!
  fullLifeAt: DateTime
  lifeBefore: Int!
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
  # … campi esistenti invariati …
}

type MissionFightOutcome {
  character: ID!
  companion: MissionCompanion
  # … campi esistenti invariati …
}

type Mutation {
  # … campi esistenti invariati …
  renamePet(request: RenamePetRequest!): CommonResponse!
  useItem(itemId: ID!, petId: ID): UseItemResult!   # era: useItem(itemId: ID!): UseItemResult!
}

type OwnedPet {
  currentLifePoints: Int!
  defeated: Boolean!
  fullLifeAt: DateTime
  level: Int!
  lifeAsOf: DateTime
  maxLifePoints: Int!
  name: String
  pet: Pet!
  potionRecoveryUntil: DateTime
  xp: Int!
}

input ParticipantOverrideInput {
  characterId: ID!
  companionLifeAfter: Int
  # … campi esistenti invariati …
}

type Pet {
  # … campi esistenti invariati …
  recoveryTime: Int
}

enum PushEventType {
  ambush
  ambushDefeat
  missionStart
  petRecovered
  prisonRelease
  # … valori esistenti invariati …
}

type QuestResult {
  # … campi esistenti invariati …
  companion: CompanionOutcome
}
```

Mai sul filo (campi interni): `OwnedPet.defeatedUntil` (marcatore della sconfitta) e `ActiveTravel.mount` (cavalcatura della partenza).

---

## 2. Semantica per area

### (a) Stato del compagno e interpolazione (D-23, D-24, D-25; W-1, W-3)

- **Chiave:** id del pet a catalogo, nessun migratore (D-23). Le voci di oggi si leggono indulgenti.
- **Voce legacy:** una voce SENZA `level` e SENZA `lifeAsOf` (mai toccata dalla fase, come tutte quelle di oggi) si serve a vita piena al massimo del compagno, equipaggiata o a riposo. Smette di essere legacy alla prima scrittura (equip/unequip, pozione, esito, rinomina), che salva `level` e la vita.
- **`currentLifePoints`** = vita all'ancora `lifeAsOf`. `lifeAsOf` e `fullLifeAt` sono entrambi non nulli solo quando il compagno è A RIPOSO sotto la vita piena; nulli quando è equipaggiato o pieno.
- **Interpolazione lineare** da `(currentLifePoints, lifeAsOf)` a `(OwnedPet.maxLifePoints, fullLifeAt)`. Velocità `(max − 1) / T` con `T = Pet.recoveryTime`; il BE arrotonda la vita raggiunta al più vicino (esempio dell'utente: `T` 100 min, a riposo da 20 per 20 minuti → 40). `fullLifeAt = lifeAsOf + ceil((max − vita) × T / (max − 1))`. Minimo 1: la vita del compagno non è mai 0. Un'ancora nel futuro rispetto all'orologio del server tiene la vita dell'ancora (A-02).
- **`defeated`** è risolto a lettura: vero solo finché la data della sconfitta è futura (coincide con `fullLifeAt` del compagno sconfitto). `equipPet` giudica con la stessa data, mai con lo sweeper: la FE può riabilitare localmente a `fullLifeAt`.
- **`potionRecoveryUntil`** servito solo se futuro (nullo altrimenti).
- **`Pet.recoveryTime` nullo = recupero istantaneo**: a riposo si serve pieno; un compagno sconfitto senza tempo curato è riequipaggiabile subito.
- **Query dell'oste `characters`:** non popola i compagni (`assets.ownedPets.pet` è un riferimento nudo): lì `maxLifePoints` sarebbe 0 e `fullLifeAt` nullo. La FE non deve selezionare i compagni in quella query.

### (b) Equip e riposo (D-02, D-04, D-24)

- Il compagno ferito si riequipaggia in ogni momento con la vita raggiunta a riposo; l'uscente va a riposo dall'istante dello scambio (ancora `lifeAsOf` = adesso).
- Lo sconfitto è rifiutato con `PET_DEFEATED` finché la data della sconfitta è futura; dopo la data si equipaggia anche se lo sweeper non è ancora passato (il marcatore resta per lo sweeper e per la push).
- Tutto in transazione con guardia sullo slot letto; `MISSION_IN_PROGRESS` viene prima del rifiuto della sconfitta.

### (c) Pozione sul compagno (D-05, D-06, D-07, D-32; W-4)

- Bersagli: compagni posseduti sotto la vita piena e non sconfitti, equipaggiati o a riposo.
- Attesa propria del compagno (`OwnedPet.potionRecoveryUntil`), indipendente da `status.potionRecoveryUntil` del personaggio in entrambi i sensi.
- `UseItemResult` porta i valori del bersaglio: `hpBefore`/`hpAfter` = vita del compagno, `recoveryUntil` = attesa del compagno, `injuriesHealed` = `[]`, `quantityLeft` dell'oggetto.
- La lore si sblocca al personaggio: `loreUnlocked` può arrivare anche da una pozione data al compagno.
- Cura arrotondata per difetto come quella del personaggio (A-01): una pozione da frazione che non alzerebbe la vita di un punto intero è `ITEM_NO_EFFECT`.
- Un compagno a riposo curato riparte dalla vita nuova con `lifeAsOf` = adesso; nello slot la vita si scrive senza ancora.
- `MISSION_IN_PROGRESS` e `AWAITING_AID` valgono come per il personaggio.

### (d) Nome (D-18, D-19, D-20, D-31; W-10, W-12)

- Stesse regole di forma del nome del personaggio (2..20 caratteri, lettere, spazi, apostrofi e trattini, almeno una lettera, normalizzazione del personaggio); nessun filtro di parole (non esiste nemmeno per il personaggio).
- `name: null` esplicito toglie il nome; **`name` OMESSO è rifiutato con `BAD_USER_INPUT`** e la voce non cambia (A-04).
- Non bloccata da «Missione in corso»; owner-only (l'oste no); emette `characterUpdated`.
- Nome mostrato = nome se c'è, altrimenti la specie: lo usano `CompanionOutcome.name`, `MissionCompanion.name` e i testi delle push.

### (e) Esiti (D-03, D-10, D-12, D-26, D-27; W-5, W-12)

- Sconfitta = vita 1 a fine scontro, anche se il compagno era entrato a 1 (D-26). Vale in quest, boss, dungeon, soccorsi, guardia, crime con arresto, sconfitta senza aid, imboscate, completamento GM legacy e guidato.
- Dungeon e scontri in sequenza: il compagno sconfitto è fuori dagli scontri seguenti; lo slot si svuota a fine missione (D-12).
- Sconfitto: slot svuotato con guardia sullo slot letto, ancora `lifeAsOf` = istante dell'esito, marcatore della sconfitta = istante + `T`.
- `CompanionOutcome` è una fotografia dell'esito: `name` mostrato, `lifeBefore`, `lifePoints`, `maxLifePoints` (dopo l'xp dello scontro), `defeated`, `fullLifeAt` (nullo se non sconfitto o con `T` non curato). Durata della sconfitta da mostrare in un foglio storico = `fullLifeAt − resolvedAt`.
- xp del compagno: 10 % degli xp dei nemici sconfitti; perdita, guardia persa, arresto, job perso → 0. Negli scontri in sequenza (tappe di un dungeon, scontri del flusso guidato) il compagno caduto prende gli xp dei soli scontri combattuti, quello della caduta compreso (D-13, fix/23); mai caduto o caduto nell'ultimo = tutti. L'xp del personaggio non cambia. Nel guidato conta la vita effettiva del compagno (corretta se corretta) alla fine di ogni scontro.

### (f) Imboscate e viaggio (D-13, D-14, D-15, D-16, D-28, D-29; W-6, W-7)

- **Risultato all'istante:** ogni imboscata scrive un `QuestResult` `kind: ambush` nella stessa transazione, con `resolvedAt` = istante dell'imboscata, pubblicato su `questResultReceived`; si legge in viaggio con `unacknowledgedQuestResults`, «visto» = `acknowledgeQuestResult`. Nessun report nuovo viene più trattenuto in `activeTravel.ambushReports`; quelli trattenuti dai viaggi in volo al deploy si consegnano ancora all'arrivo o al teleport.
- **Cavalcatura della partenza** (D-29): campo interno `activeTravel.mount`, scritto alla partenza solo se il pet ha un fattore di velocità **> 1** (B-04: un pet non più veloce del passo non è una cavalcatura: nessun ricalcolo, nessun `onFoot`). Cambiare compagno in viaggio non cambia la cavalcatura del viaggio. Viaggi senza `mount` (in volo al deploy) non si ricalcolano.
- **Strada residua a piedi** (D-13): imboscata VINTA e cavalcatura della partenza sconfitta → strada dal punto dell'imboscata, `startTime` = istante dell'imboscata, durata residua × fattore della cavalcatura, `to` invariato; prossima imboscata rimappata per km senza tiri nuovi; fabbisogno di cibo ricalcolato, pasto contato una volta. **Le ferite prese nello scontro allungano anche la strada a piedi** come la deviazione (regola unica, B-02: fattore di velocità prima / dopo lo scontro; con la gamba rotta × 1,25).
- **Ridirezionamento per fame** (D-16): se a piedi con cibo e vita rimasti non arriverebbe vivo, viaggio deviato alla città più vicina per strada, quest abbandonata (corsia, `PendingQuest` e posto liberati nella stessa transazione), `AmbushReport.reachedCity` valorizzato anche in una VITTORIA. **Senza una città raggiungibile per strada nessun ridirezionamento** (B-05): quest tenuta, `reachedCity` nullo, nessun «la fame ti porta verso», si prosegue a piedi verso la meta.
- **Sconfitta:** deviazione come in Phase 15; a passo di marcia se il compagno equipaggiato è caduto (C-11), rallentata dalle ferite nuove.
- **`AmbushReport.onFoot`:** vittoria → true se cade la cavalcatura della partenza; **sconfitta → true solo se a cadere è una cavalcatura** (la cavalcatura della partenza, oppure sui viaggi senza `mount` un compagno equipaggiato più veloce del passo) (B-03). Un compagno che non è una cavalcatura non accende «Prosegui a piedi».
- **Limite noto (B-09, rinviato):** la pedina può saltare indietro al punto dell'imboscata se lo sweep risolve l'imboscata in ritardo (`startTime` = istante dell'imboscata per D-13: finché non è risolta la FE vede avanzare la strada vecchia). Da guardare in UAT.

### (g) Flusso guidato (D-17, D-26, D-33; W-11)

- La simulazione propone per ogni partecipante e per ogni scontro `MissionFightOutcome.companion` (pet, nome mostrato fotografato alla simulazione, `maxLifePoints` del compagno, `lifeBefore`) e `MissionFightEffects.companionLifeAfter`. `companion` è nullo se il partecipante non ha un compagno o se il compagno è stato sconfitto in uno scontro precedente.
- Correzione dell'oste: `ParticipantOverrideInput.companionLifeAfter` in `1..maxLifePoints` (1 = sconfitto); fuori intervallo o senza compagno a inizio scontro → `OUTCOME_OVERRIDE_INVALID`. Lo accetta anche il legacy `completePendingRequest`.
- **Contratto delle correzioni (A-08, deciso dall'utente, fix/23):** nella bozza guidata ciò che l'oste non tocca vale il SIMULATO dello scontro: un campo omesso o `null` (`hpAfter`, `injuries`, `consumablesUsed`, `spellsUsed`, `companionLifeAfter`) prende il valore simulato; un valore esplicito, anche una lista vuota `[]`, vince. Limiti di validazione invariati (vita 1..max, compagno 1..max, usi entro il disponibile). Il record `corrected` salvato contiene gli effetti già fusi, così il completamento non rilegge il simulato. I partecipanti non elencati restano al simulato. La FE di oggi, che rimanda sempre i valori simulati, resta compatibile. Il legacy `completePendingRequest` senza bozza non cambia: nessun override = nessun combattimento, campo omesso = stato d'inizio scontro.
- Il completamento applica le stesse regole degli esiti (sconfitta a 1, sconfitto fuori dagli scontri seguenti, slot svuotato).

### (h) Livelli del compagno (D-37, D-38, D-39; W-1 aggiornato)

- 10 livelli sul tetto di xp `Pet.maxXp`; `t(i) = i(i−1)/2`; soglia del livello i = `round(maxXp × t(i)/45)` (dal livello 2 almeno 1 xp, A-07); vita massima = `round(base × (1 + t(i)/45))` con `base = Pet.maxLifePoints`.
- Tabella per base 100 e tetto 100: soglie `0, 2, 7, 13, 22, 33, 47, 62, 80, 100`; vite `100, 102, 107, 113, 122, 133, 147, 162, 180, 200`. Esempi dell'utente al tetto: Falco 100 → 200, Pegaso 5900 → 11800. Tetto non valido → livello 1 e vita base.
- Il livello è salvato sulla voce (1 alla nascita, ricalcolato a ogni cambio di xp; voci di prima della fase lette dall'xp). La vita massima si deriva da livello e base, non è salvata.
- Al passaggio di livello la vita corrente non cambia (un compagno legacy letto pieno resta pieno); il massimo di un esito è quello dopo l'xp dello scontro.
- Ogni regola (riposo e interpolazione, equip, pozione, esiti, guidato) usa `OwnedPet.maxLifePoints`, mai `Pet.maxLifePoints`: **la FE interpola fino a `OwnedPet.maxLifePoints`**. `T` resta uno per pet (dal minimo al massimo corrente).
- Se l'utente cambia `Pet.maxXp` a DB, il livello salvato di un compagno resta quello vecchio finché non riceve un premio di xp, poi si riallinea (A-06, D-39).
- Con tetti piccoli (`maxXp` < 23) le soglie non si duplicano più a 0: livello 1 a xp 0, mai decrescente, mai oltre 10, 10 al tetto (A-07).

---

## 3. Codici di rifiuto per mutation

Precedenza da sinistra a destra:

| Mutation | Ordine dei codici |
|----------|-------------------|
| `equipPet` | `BAD_USER_INPUT` (forma dell'input) → rifiuti dell'ownership di oggi (`@OwnsCharacter`) → `MISSION_IN_PROGRESS` → `NOT_FOUND` del personaggio → `PET_NOT_OWNED` → `PET_DEFEATED` |
| `unequipPet` | `BAD_USER_INPUT` (forma dell'input) → rifiuti dell'ownership di oggi (`@OwnsCharacter`) → `MISSION_IN_PROGRESS` → `NOT_FOUND` del personaggio |
| `useItem(itemId, petId)` | `AWAITING_AID` → `MISSION_IN_PROGRESS` → `ITEM_NOT_OWNED` → `ITEM_NOT_USABLE` → `PET_NOT_OWNED` → `PET_DEFEATED` → `PET_POTION_RECOVERING` (`extensions.recoveryUntil` ISO) → `ITEM_NO_EFFECT` |
| `useItem(itemId)` | invariata (Phase 18) |
| `renamePet` | `BAD_USER_INPUT` (forma, compreso `name` omesso) → `FORBIDDEN` (non proprietario, oste compreso) → `PET_NAME_INVALID` → `NOT_FOUND` / `PET_NOT_OWNED`; mai `MISSION_IN_PROGRESS` |
| `saveMissionDraft` / `completePendingRequest` con `companionLifeAfter` | `OUTCOME_OVERRIDE_INVALID` fuori `1..max` o senza compagno a inizio scontro |

`petId` malformato (anche stringa vuota) → `BAD_USER_INPUT` col nome dell'argomento. Un personaggio archiviato risponde `NOT_FOUND` dalla guardia.

Messaggi dei tre codici nuovi:

| Codice | Messaggio | `extensions` |
|--------|-----------|--------------|
| `PET_DEFEATED` | «Il compagno è stato sconfitto: deve riposare finché non torna in forze» | `{ code }` |
| `PET_POTION_RECOVERING` | «Il compagno non reggerebbe un'altra pozione: aspetta che la prima si sia posata» | `{ code, recoveryUntil }` (ISO) |
| `PET_NAME_INVALID` | «Nome del compagno non valido: da 2 a 20 caratteri tra lettere, spazi, apostrofi e trattini, con almeno una lettera» | `{ code }` |

Solo `PET_POTION_RECOVERING` (con `POTION_RECOVERING` di Phase 18) porta `recoveryUntil` nell'allowlist.

---

## 4. Subscription e push (W-8, W-9)

- **`characterUpdated`** a ogni scrittura del compagno: equip/unequip, pozione, esito, rinomina e claim dello sweeper quando uno sconfitto torna in forze (stesso momento della push). Nessuna emissione quando un ferito a riposo arriva a vita piena: lo interpola la FE.
- **`questResultReceived`** porta i risultati d'imboscata dal vivo, all'istante della risoluzione (D-28).
- **Push `ambush`** (D-14, D-30): personale, `id` = id del `QuestResult` dell'imboscata, una per imboscata (vinta o persa), solo dopo il commit, nessuna per una risoluzione saltata o stantia. Titolo «Imboscata!»; corpo composto dal BE col nome mostrato:
  - vinta: `Imboscata presso <città>: hai respinto gli assalitori`;
  - vinta, compagno caduto: `Imboscata presso <città>: <nome> è stato sconfitto`, più `, prosegui a piedi` se `onFoot`;
  - vinta con ridirezionamento per fame: in coda `; la fame ti porta verso <città raggiunta>`;
  - persa: `Sei stato sconfitto: la via torna verso <città>`, più `. <nome> è stato sconfitto` se il compagno cade.
  - Ordine dopo il commit (B-01): prima il riallineamento dei job del viaggio, poi consegna e push; un invio lento non ritarda né salta i job.
  - `ambushDefeat` non parte più (resta nel catalogo di `sendTestPush`).
- **Push `petRecovered`** (D-11, D-20): personale, `id` = id del pet a catalogo, titolo «Di nuovo in forze», corpo `<nome> è di nuovo in forze`. Parte da uno sweeper con claim atomico per voce: ritardo massimo 60 s, una sola push per sconfitta, nessuna dopo la vendita, nessuna per un ferito che finisce il riposo. Proprietario e specie si leggono prima dei claim: se la lettura fallisce il marcatore resta e lo sweep seguente riprova (A-03). **Parte alla scadenza della sconfitta anche se il compagno è già stato riequipaggiato e ferito di nuovo** (A-05, confermato: D-11 la lega al ritorno dalla sconfitta).
- Testi delle push provvisori (piani 09 e 11): da rivedere con l'utente in UAT.

---

## 5. Comportamenti provati

Ogni voce: comportamento, decisione, spec che lo fissa.

- Funzione unica della vita a riposo, velocità `(max − 1)/T`, arrotondamento, minimo 1, legacy piena, ancora nel futuro senza perdita (D-24, A-02) — `src/characters/pets/companion-life.spec.ts`.
- Dieci livelli, soglie e vite, tetti piccoli senza soglie duplicate (D-37, D-38, A-07) — `src/characters/pets/companion-level.spec.ts`.
- Campi nuovi conservati a ogni riscrittura dell'array, `level` compreso (D-39) — `src/characters/pets/owned-pet-fields.int-spec.ts`.
- Filo del compagno a riposo, sconfitto prima dello sweeper, equipaggiato senza date, legacy pieno, nome, livello e vita massima, interpolazione fino al massimo del livello (D-02, D-04, D-18, D-23, D-24, D-25, D-37, D-38, D-39) — `src/characters/pets/owned-pet-state.int-spec.ts`.
- WARN al boot col solo conteggio dei pet senza tempo, mai blocca il boot (D-25) — `src/characters/pets/pet-recovery-catalog.reporter.spec.ts`.
- Equip: rifiuto `PET_DEFEATED`, equip dopo la data con marcatore lasciato allo sweeper, ferito riequipaggiato con la vita raggiunta (esempio 20 → 40), uscente a riposo dall'istante dello scambio, lucchetto della missione prima della sconfitta, nome conservato (D-02, D-04, D-24) — `src/characters/pets/equip-pet.int-spec.ts`, `equip-pet.plan.spec.ts`.
- Combattimento: vita del compagno dopo lo scontro senza tiri nuovi, sconfitto fuori dalle tappe seguenti e dallo scontro della guardia (D-03, D-12) — `placeholder-combat-resolver.spec.ts`, `placeholder-dungeon-resolver.spec.ts`, `guard-outcome.spec.ts`.
- Esito del compagno: clamp `[1, max]`, sconfitta a 1, slot svuotato, livello con l'xp, voce legacy scritta piena (D-26, D-27, D-39) — `src/quests/outcomes/pets/companion-after-fight.spec.ts`.
- Ogni percorso d'esito: quest vinta che finisce a 1, ferito che resta nello slot, illeso servito, boss, dungeon a tappe, livello alzato con la vita invariata, sconfitta senza soccorso (D-03, D-10, D-12, D-26, D-27, D-37) — `src/quests/outcomes/companion-defeat.int-spec.ts`.
- Soccorritore, guardia senza il compagno caduto, guardia persa, arresto, GM legacy con vita a 1 / invariata / senza scontro (D-12, D-26, D-27) — `src/quests/outcomes/companion-defeat-rescue.int-spec.ts`.
- Pozione al compagno: attesa propria nei due sensi, `PET_DEFEATED` senza consumo, `PET_POTION_RECOVERING` con data ISO, `ITEM_NO_EFFECT` a vita piena, `PET_NOT_OWNED`, missione, due bevute concorrenti serializzate, `petId` malformato, arrotondamento per difetto (D-05, D-06, D-07, D-32, A-01) — `src/characters/items/use-item.int-spec.ts` (describe `on a companion`), `item-use.plan.spec.ts`.
- Rinomina: nome e cancellazione, `PET_NAME_INVALID`, nome omesso `BAD_USER_INPUT` con nome intatto, `PET_NOT_OWNED`, altro giocatore e oste `FORBIDDEN`, durante una missione, archiviato `NOT_FOUND`, voce legacy scritta piena col livello (D-18, D-19, D-23, D-31, A-04) — `src/characters/pets/rename-pet.int-spec.ts`, `pet-name.spec.ts`, `test/authz/authorization-matrix.int-spec.ts`.
- Push «in forze»: una sola alla data, niente prima, una sola con due claim concorrenti, nessuna dopo la vendita, push anche se riequipaggiato, nome della specie senza nome, mai per un ferito, due compagni due push, riprova se la lettura fallisce (D-11, D-20, D-24, A-03, A-05) — `src/characters/pets/pet-recovery.int-spec.ts`, `pet-recovery.spec.ts`, `pet-recovery.sweeper.spec.ts`.
- Imboscate: risultato scritto all'istante a viaggio in corso, nascosto dopo la conferma, compagno nel risultato, nessun risultato da una risoluzione stantia, push con l'id del risultato, job riallineati prima di una push lenta, una push e un risultato con un WriteConflict rieseguito, nome del caduto, nessuna push per skip/stantia, deviazione rallentata dalle ferite nuove, trattenuti del deploy portati nel viaggio riscritto (D-14, D-15, D-28, D-30, B-01, Pitfall 9) — `src/travel/ambush/ambush-resolution.int-spec.ts`, `ambush-lifecycle.int-spec.ts`, `ambush-push.spec.ts`.
- Cavalcatura della partenza: salvata in partenza libera e automatica, nessuna a piedi o con un pet non cavalcatura, conservata se il compagno cambia in viaggio (D-29, B-04) — `src/travel/travel-planning.int-spec.ts`, `travel.service.int-spec.ts`, `travel-timing.spec.ts`.
- Strada a piedi: riscrittura dal punto, job di completamento e della prossima imboscata spostati, push con «prosegui a piedi», viaggio senza mount intatto, arrivo e piano del cibo chiuso una volta, job vecchi del viaggio a cavallo e della camminata no-op senza push `travelEnd` (D-13, D-29, A3, Pitfall 5, B-08) — `src/travel/ambush/ambush-on-foot.int-spec.ts`, `ambush-on-foot.spec.ts`.
- Fame: ridirezionamento alla città più vicina con quest abbandonata, nessun ridirezionamento senza città raggiungibile, job spostati senza imboscata, push col ridirezionamento, deviazione della sconfitta a piedi col compagno caduto e a cavallo col compagno in piedi, `onFoot` in sconfitta solo per una cavalcatura, ferite nuove sulla strada a piedi (D-14, D-16, C-11, B-02, B-03, B-05) — `src/travel/ambush/ambush-on-foot.int-spec.ts` (describe «the hunger redirection (Phase 23)»), `ambush-plan.spec.ts`.
- Guidato, proposta: vita del compagno di ogni partecipante, compagno sconfitto nel primo scontro fuori dal secondo, nessuna scrittura fuori dalla bozza (D-12, D-17, D-26) — `src/quests/guided/mission-simulation.service.int-spec.ts`, `fight-state.spec.ts`.
- Guidato, correzione e completamento: correzione salvata, `OUTCOME_OVERRIDE_INVALID` fuori intervallo, corretto a 1 = sconfitto con data, ferito corretto, simulato usato se non corretto, sconfitto in uno scontro precedente resta sconfitto, legacy che accetta `companionLifeAfter`, campi omessi o `null` della correzione = simulato e valori espliciti che vincono (G-1 chiuso), xp del compagno caduto in uno scontro precedente solo da quello (D-13, D-17, D-26, D-27, D-33, A-08) — `src/quests/guided/mission-draft-save.service.int-spec.ts`, `guided-completion.service.int-spec.ts`, `guided-outcome.spec.ts`, `src/quests/outcomes/gm-completion.service.int-spec.ts`, `gm-overrides.spec.ts`.
- xp del compagno nelle tappe: solo le tappe combattute, quella della caduta compresa; il personaggio le prende tutte (D-13) — `src/quests/outcomes/pets/companion-enemies-xp.spec.ts`, `dungeon/placeholder-dungeon-resolver.spec.ts`, `outcome-plan.spec.ts`, `companion-defeat.int-spec.ts`.
- SDL e boot reale: blocchi nuovi pinnati, una sola riga tolta (`useItem`) (D-27, D-30, D-33) — `test/app.int-spec.ts`.

---

## 6. Tabella dei tempi, dati e piano di UAT su device

Per l'orchestratore e l'utente. Ogni semina si fa con uno script FUORI dal repo.

### Tabella dei tempi di recupero (D-01, D-25)

- **Non è nel repo.** Formula: `T (minuti) = B(rarità) × √(maxLifePoints / 100) × (1 + maxXp / 2000)`, arrotondato ai 5 minuti; basi `B`: common 20, uncommon 30, rare 40, ultrarare 50, legendary 60. 44 pet, da 10 min a 17 h 55 min.
- File di revisione dell'utente: `~/Downloads/klimmeck-tempi-recupero-compagni.md` (fuori dal repo).
- Destinazione: `pets.recoveryTime` in millisecondi (tetto GraphQL `Int` 2 147 483 647 ms ≈ 24,8 giorni; il massimo, Pegaso, è molto sotto).
- Scrittura: script dell'orchestratore fuori dal repo, dopo l'approvazione dell'utente e prima della UAT. **Finché un pet non ha il campo, il recupero è istantaneo e un compagno sconfitto di quella specie è riequipaggiabile subito**; al boot il logger `PetRecovery` scrive in WARN il conteggio dei pet senza tempo.
- Se `recoveryTime` di un pet viene corretto a DB mentre un compagno di quella specie è sconfitto, il marcatore della sconfitta (fissato alla sconfitta) e la data di vita piena ricalcolata col tempo nuovo divergono; per il rifiuto dell'equip (e per la push) vale la data della sconfitta.

### Dati di prova (solo descrizione, campo per campo)

- Un personaggio di prova con due pet posseduti in `assets.ownedPets`: uno cavalcabile (`speedModifier` > 1 sul pet a catalogo) e uno no.
- Voci con `name` (per esempio un nome valido sul cavalcabile; l'altra senza nome, per vedere la specie nelle push).
- Una voce sconfitta: `currentLifePoints: 1`, `lifeAsOf` e `defeatedUntil` vicini all'ora della prova (`defeatedUntil` qualche minuto avanti, `lifeAsOf` = `defeatedUntil − recoveryTime`), `level` valorizzato, non nello slot.
- Una voce ferita a riposo: `currentLifePoints` sotto il massimo, `lifeAsOf` di poco nel passato, `level` valorizzato.
- Pozioni in inventario (almeno due, con `power` intero e un tempo d'attesa breve).
- Cibo sufficiente per il passo 6 e scarso per il passo 7; una quest accettabile per i passi 5 e 7.

### Prerequisiti

- Build dalla HEAD della fase e riavvio del BE dal ramo a cura dell'orchestratore; nessun migratore.
- Tabella dei tempi scritta: WARN `PetRecovery` atteso a zero dopo la semina.
- FE Phase 22 dal suo ramo sul device.

### Passi (uno per messaggio)

1. Diario: un compagno a riposo mostra vita che sale e conto alla rovescia fino a `fullLifeAt`; lo sconfitto appare sconfitto.
2. Equip dello sconfitto rifiutato (`PET_DEFEATED`); dopo la data equip riuscito; entro 60 s push «Di nuovo in forze» col nome.
3. Pozione a un compagno a riposo: vita su, attesa propria del compagno; la pozione del personaggio resta libera (e viceversa); seconda pozione al compagno rifiutata con la data.
4. Rinomina dal Diario; il nome nuovo compare nelle push e nei fogli degli esiti successivi.
5. Quest con compagno ferito e poi sconfitto: foglio dell'esito con la riga della vita e poi della sconfitta, slot vuoto.
6. Viaggio con la cavalcatura, imboscata vinta con la cavalcatura sconfitta: push con «prosegui a piedi», pergamena visibile a viaggio in corso, «Prosegui a piedi», arrivo più tardi (attenzione alla pedina, B-09).
7. Imboscata con poco cibo e cavalcatura caduta: ridirezionamento alla città più vicina, quest abbandonata, push con «la fame ti porta verso».
7-bis. Quest vinta che porta l'xp del compagno oltre una soglia: livello e vita massima nuovi nel Diario, vita corrente invariata.
8. Flusso dell'oste: vita del compagno proposta dalla simulazione, corretta a 1, completamento: compagno sconfitto con la data. Correggendo l'eroe senza toccare il compagno, il valore simulato del compagno resta (omesso = simulato, A-08).

### Diagnosi suggerita

Lettura di `assets.ownedPets`, `status.activeTravel` (compreso `mount`) e dei `QuestResult` `kind: ambush` del personaggio di prova; log `PetRecovery` (sweep e WARN al boot).

---

## 7. Risposte alla FE, domande aperte e deviazioni

### Risposte W-1..W-12

- **W-1:** sì, come chiesto: `currentLifePoints` all'ancora, `lifeAsOf`/`fullLifeAt` non nulli solo a riposo sotto il pieno, `defeated` risolto a lettura sulla stessa data di `equipPet`, `characterUpdated` al claim dello sweeper (insieme a `petRecovered`), recupero lineare. Il massimo da interpolare è `OwnedPet.maxLifePoints` (livelli, §2 h). Il BE arrotonda al più vicino: il `floor` della FE (Pitfall 8) resta compatibile.
- **W-2:** id del pet a catalogo ovunque; una voce per specie resta un invariante; `OwnedPet.id` non esiste.
- **W-3:** `Pet.recoveryTime` in millisecondi, `Int`; il massimo della tabella (Pegaso, 17 h 55 min) è molto sotto il tetto. `Pet.maxLifePoints` resta la base della specie.
- **W-4:** argomento `petId` (annullabile); `UseItemResult` del bersaglio, `injuriesHealed` `[]`; `PET_DEFEATED`, `PET_POTION_RECOVERING` con `extensions.recoveryUntil`, `ITEM_NO_EFFECT` a vita piena; `MISSION_IN_PROGRESS` e `AWAITING_AID` come per il personaggio; l'attesa del personaggio non blocca il compagno; `loreUnlocked` può arrivare da una pozione al compagno.
- **W-5:** `QuestResult.companion: CompanionOutcome` con i sei campi chiesti, ogni volta che un compagno ha combattuto; `AmbushReport.companion` non esiste.
- **W-6:** fatto: risultato all'istante, `resolvedAt` = istante dell'imboscata, su `questResultReceived`, «visto» = `acknowledgedAt`.
- **W-7:** forma della deviazione: `road` dal punto, `startTime` = istante dell'imboscata, `endTime`/`duration` ricalcolati, `to` cambia solo nel ridirezionamento; `reachedCity` valorizzato nel ridirezionamento di una vittoria; `AmbushReport.onFoot: Boolean!` aggiunto.
- **W-8:** push `ambush` personale con `id` = id del `QuestResult`, testi del BE col nome mostrato; `ambushDefeat` NON parte più.
- **W-9:** push `petRecovered` personale con `id` = id del pet, testo `<nome> è di nuovo in forze`.
- **W-10:** `RenamePetRequest { id, name, petId }`, `CommonResponse`; regole del nome del personaggio senza filtro di parole; `PET_NAME_INVALID`, `BAD_USER_INPUT` (anche `name` omesso), `PET_NOT_OWNED`/`NOT_FOUND`; non bloccata dalla missione; emette `characterUpdated`; `name: null` toglie.
- **W-11:** `MissionCompanion` e `companionLifeAfter` come chiesti; correzione `1..maxLifePoints`; nullo anche dopo una sconfitta in uno scontro precedente; regole d'invalidazione invariate. Contratto A-08: un campo omesso o `null` vale il simulato; rimandarlo resta lecito.
- **W-12:** nome mostrato servito in `CompanionOutcome.name`, `MissionCompanion.name` e nei testi delle push.

### Domande aperte

- ~~**Per l'utente:** xp del compagno sconfitto alla prima tappa di un dungeon.~~ **Chiusa (fix/23):** prende gli xp delle sole tappe combattute, quella della caduta compresa; vale anche per gli scontri del flusso guidato. L'xp del personaggio non cambia.
- **Per l'utente:** `AmbushReport.onFoot` è un default dell'orchestratore (vetabile: senza la riga «Prosegui a piedi» basta la riga del compagno caduto).
- **Per l'utente:** testi provvisori delle push `ambush` e `petRecovered`, da rivedere in UAT.
- ~~**Contratto A-08 (rinviato).**~~ **Chiusa (fix/23):** nella bozza guidata omesso o `null` = simulato per tutti gli effetti insieme, valore esplicito vince; il completamento senza bozza resta com'era (§2 g).
- Per la FE nessuna domanda: le risposte sopra chiudono W-1..W-12.

### Deviazioni dal disegno iniziale

- Riga di `useItem` sostituita (argomento opzionale `petId`): l'unica riga tolta dallo SDL.
- `AmbushReport.companion` non esiste: il compagno dell'imboscata sta in `QuestResult.companion`.
- `OwnedPet.id` non esiste (D-23).
- `MissionCompanion.name` è fotografato alla simulazione.
- `AmbushReport.onFoot` è un default dell'orchestratore; in sconfitta vale solo per una cavalcatura (B-03, sostituisce la scelta del piano 14).
- La FE pre-merge vede già i report d'imboscata in viaggio (D-28) e non riceve più `ambushDefeat` (né conosce `ambush`) finché la sua PR non entra.
- Rinviati dalla review: A-08 (contratto, poi deciso e realizzato in fix/23), A-10 (sweeper senza paginazione, stesso limite della prigione), B-08 (b) (seconda imboscata già scaduta risolta dallo sweeper prima del riallineamento della prima), B-09 (pedina che salta indietro, sopra).

### Casi verdi al primo colpo

- Piano 06: tutte le 14 prove dei percorsi d'esito (`companion-defeat.int-spec.ts`, `companion-defeat-rescue.int-spec.ts`) senza fix nel codice di produzione.
- Piano 16: cablaggio della correzione nella bozza e nel completamento già corretto dopo il primo task (prova di sensibilità per mutazione nel SUMMARY).
- Review B-08: le finestre del Pitfall 5 aggiunte (job vecchi no-op, WriteConflict con una sola push) erano già rette dai filtri d'identità del viaggio.
