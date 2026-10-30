# BACKEND-NOTES — Phase 7 Quest Lanes (QUEST-04) (handoff per la FE Phase 6 e le fasi BE 8/9)

- **Fase BE:** 07-quest-lanes-quest-04 (requisiti BE-QUEST-01, BE-QUEST-02, BE-QUEST-03 emendato, BE-QUEST-04; decisioni D-01..D-22 in `07-CONTEXT.md`, con i rimedi C1–C6 di `07-RESEARCH.md` §"Conflitti con il CONTEXT").
- **Data:** 2026-10-21. Documento di fine fase, scritto prima della UAT su device (manual-only: richiede la FE Phase 6 e i dati di §8).
- **Branch:** `feat/07-quest-lanes-quest-04` (PR verso `develop`). **Nessuna dipendenza da una PR FE** (D-22): la FE Phase 6 consuma lo schema dopo la merge. Il fragment FE attuale continua a funzionare senza modifiche (§0, punto 6).
- **Schema:** `src/schema.gql` cambia in modo **solo additivo** rispetto a `develop` (nessuna riga rimossa). Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate di 07-08: unit **85 suite / 1259 test**, integration **49 suite / 606 test** (replica set + Redis in memoria, `--runInBand`, ~79 s), `npm run build` exit 0, lint filtrato 0 righe, `eslint` (0 errori) e `prettier --check` puliti sui 45 `.ts` toccati dalla fase, nessuna dipendenza nuova in `package.json`. Baseline di inizio fase: unit 80 / 1114, integration 46 / 550.
- **Fonte:** ogni nome, codice, messaggio e riga di SDL qui sotto è copiato dal codice: `src/schema.gql`, `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/authz/resource-not-found.exception.ts`, `src/authz/authorization.exception.ts`, `src/auth/auth.exception.ts`, `src/quests/acceptance/quest-lanes.ts`, `src/quests/acceptance/quest-eligibility.ts`, `src/quests/acceptance/quest-acceptance.updates.ts`, `src/quests/acceptance/quest-acceptance.service.ts`, `src/quests/acceptance/quest-acceptance.resolver.ts`, `src/characters/character-quests.populate.ts`, `src/time/server-time.resolver.ts`, `src/economy/wallet.service.ts`. **Lo schema vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Tre corsie indipendenti** su `Character.quests`: `pendingQuest` (ogni tipo diverso da `story`/`worldMission`, **boss inclusa**), `activeStoryQuest`, `activeWorldMissionQuest`. La corsia si sceglie dal tipo della quest nel catalogo, mai dal client. Una corsia occupata rifiuta solo la propria tipologia (`QUEST_SLOT_BUSY`); le altre restano accettabili, anche tutte e tre insieme.
2. **`acceptQuest` è owner-only** e risponde solo `CommonResponse` (`{ response: "Missione accettata", successful: true }`). La corsia popolata arriva sulla subscription **`characterUpdated`**, il nuovo saldo punti sulla subscription **`userUpdated`**. Nessun `PendingQuest` nel ritorno della mutation.
3. **Nessuna quest costa monete.** `Character.coins` non viene mai toccato; `recommendedLoot` è solo un suggerimento display.
4. **Story e worldMission costano `requirements.requiredPoints` punti canale** (`User.twitchPoints` del proprietario), debitati nella stessa transazione dell'accettazione. Le altre tipologie sono gratuite, anche se il catalogo ha un `requiredPoints`.
5. **`serverTime: DateTime!`** serve per l'offset device↔server del countdown (§5).
6. **Il fragment attuale ora funziona.** `pendingQuest { id }` e `completedQuests { id }` di `CharacterFragment.questsFields` prima fallivano sul filo con un valore non nullo (ref non popolati); ora il BE popola le corsie e `completedQuests` con il solo `_id` della quest, e lo stesso vale per `quest { id }` dentro una corsia.

---

## 1. Contratto GraphQL (additivo)

Blocchi copiati da `src/schema.gql` (`sortSchema: true`, i campi sono in ordine alfabetico).

```graphql
type CharacterQuests {
  activeStoryQuest: PendingQuest
  activeWorldMissionQuest: PendingQuest
  completedQuests: [Quest!]!
  pendingQuest: PendingQuest
}

type PendingQuest {
  id: ID!
  pointsSpent: Int!
  quest: Quest!
  startDate: DateTime!
  waitingTime: Float!
}

type QuestPartySlot {
  count: Int!
  title: String!
}

type QuestRequirements {
  minTitle: String!
  party: [QuestPartySlot!]!
  recommendedLoot: [AssetQuantity!]!
  requiredAdventurers: Int!
  requiredPoints: Int
}

input AcceptQuestRequest {
  id: String!
  questId: String!
}
```

Riga di `type Mutation`:

```graphql
  acceptQuest(request: AcceptQuestRequest!): CommonResponse!
```

Riga di `type Query`:

```graphql
  serverTime: DateTime!
```

Novità rispetto a `develop`: `activeStoryQuest`, `activeWorldMissionQuest` su `CharacterQuests`; `pointsSpent` su `PendingQuest`; il tipo `QuestPartySlot` e `party` su `QuestRequirements`; `input AcceptQuestRequest`; `acceptQuest`; `serverTime`. Tutto il resto è invariato (`waitingTime` resta `Float!`, `registeredAdventurers` resta `[String!]!`, `requiredPoints` resta nullable).

Documento FE di esempio:

```graphql
mutation AcceptQuest($request: AcceptQuestRequest!) {
  acceptQuest(request: $request) {
    response
    successful
  }
}
```

```json
{ "request": { "id": "<characterId>", "questId": "<questId>" } }
```

- `id` è il **characterId**, come nelle altre request del personaggio; `questId` è l'id della quest della board.
- La request non porta corsia, costo né tempo: il BE li ricava dal catalogo.
- `PendingQuest.pointsSpent` sui documenti legacy (precedenti alla fase) vale `0`.

---

## 2. Codici di rifiuto

> **Emendato dalla Phase 10 (2026-10-29):** in `acceptQuest` un `questId` o un `id` del personaggio malformato risponde `BAD_USER_INPUT` (`Input non valido: questId` / `id`, era `NOT_FOUND`). Una quest da soli si avvia nella stessa transazione dell'arrivo (o del claim sul marker): il `characterUpdated` porta già `quests.pendingQuest.startDate`. La corsia standard occupata compare ora nella coda del GM (`PendingRequestCharacter.pendingQuest`) e blocca `completePendingRequest` con `QUEST_IN_PROGRESS` («Il personaggio è impegnato in una missione in corso»). Vedi `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §3, §4, §8.

Ogni rifiuto ha `errors[0].extensions` **esattamente** `{ "code": "<CODICE>" }` e un messaggio italiano. Il FE mappa il **codice**, mai il messaggio. Un rifiuto **non scrive nulla**: nessun `PendingQuest`, nessun debito, nessuna registrazione.

| Codice | Messaggio | Quando | Azione FE |
|--------|-----------|--------|-----------|
| `QUEST_SLOT_BUSY` | `Hai già una missione in corso` | la corsia del tipo della quest è già occupata (unico codice per tutte e tre le corsie) | il FE sa quale corsia dal tipo della quest (`infos.type`): mostrare "hai già una missione story / world / in corso" e la corsia attiva |
| `QUEST_FULL` | `Non ci sono più posti per il tuo rango` | worldMission/boss: nessun posto libero per il titolo del personaggio (rango pieno o assente dal party), o totale `requiredAdventurers` raggiunto sui dati legacy | disabilitare il pulsante; mostrare i posti per rango (§6) |
| `QUEST_ALREADY_TAKEN` | `Hai già affrontato questa missione` | quest non ripetibile già in `completedQuests` o, per worldMission/boss, personaggio già registrato | nascondere o marcare la quest come già fatta |
| `QUEST_TITLE_MISMATCH` | `Il tuo titolo non permette questa missione` | story: titolo diverso da `minTitle`; altri tipi: titolo inferiore a `minTitle` | disabilitare e mostrare il titolo richiesto |
| `QUEST_NOT_IN_CITY` | `Devi trovarti nella città della missione` | il personaggio non è nella città che contiene il marker della quest (o nessuna città lo contiene) | invitare a raggiungere la città; non dovrebbe capitare se la board mostra solo le quest della città corrente |
| `QUEST_NOT_ACCEPTABLE` | `Missione non disponibile` | catalogo incompleto: story/worldMission con `requiredPoints` assente, 0, negativo, non intero o oltre 2147483647 | mostrare "missione non disponibile" e **segnalare al GM** (il BE logga un WARN con il solo id della quest) |
| `INSUFFICIENT_POINTS` | `Punti canale insufficienti` | saldo `twitchPoints` del proprietario minore di `requiredPoints` | mostrare saldo e costo; il saldo reale arriva da `userUpdated` |
| `NOT_FOUND` | `Missione non trovata` / `Personaggio non trovato` / `Utente non trovato` | quest, personaggio (anche archiviato) o utente inesistenti; **anche id malformati**, senza accesso al DB | ricaricare la board / il personaggio |
| `FORBIDDEN` | `Questo personaggio non ti appartiene` | il personaggio non è il `currentCharacter` del chiamante, **anche per l'innkeeper** | errore generico; dal pannello admin l'innkeeper non può accettare per conto di altri |
| `UNAUTHENTICATED` | `Authentication required` | nessun bearer valido | flusso di refresh/login esistente |

**Ordine di valutazione** (dal guard, dal resolver e da `QuestAcceptanceService.accept`):

1. `UNAUTHENTICATED` (guard globale), poi ownership owner-only su `request.id`: `FORBIDDEN` o `NOT_FOUND` (personaggio).
2. Resolver: `questId` malformato → `NOT_FOUND` (quest); id utente o personaggio malformati → `NOT_FOUND`.
3. Pre-letture: quest inesistente → `NOT_FOUND`; costo di catalogo non valido → `QUEST_NOT_ACCEPTABLE`; personaggio inesistente o archiviato → `NOT_FOUND`; poi `QUEST_ALREADY_TAKEN` → `QUEST_TITLE_MISMATCH` → `QUEST_SLOT_BUSY` → `QUEST_FULL` (solo condivise) → `QUEST_NOT_IN_CITY`.
4. Transazione (solo in corsa con un'altra richiesta concorrente): claim della corsia (`QUEST_SLOT_BUSY` per primo, poi `QUEST_ALREADY_TAKEN`, `QUEST_TITLE_MISMATCH`, `QUEST_NOT_IN_CITY`, `NOT_FOUND`), registrazione delle condivise (`QUEST_ALREADY_TAKEN` o `QUEST_FULL`), debito (`INSUFFICIENT_POINTS` o `NOT_FOUND` utente).

`INSUFFICIENT_FUNDS` (monete) **non** è mai prodotto dall'accettazione.

---

## 3. Corsie, costi e tempi

Da `quest-lanes.ts` (`laneOf`) e `quest-eligibility.ts`.

| `infos.type` | Corsia | Costo | `waitingTime` (ms) | Ripetibile | Condivisa (registrazione) |
|--------------|--------|-------|--------------------|------------|---------------------------|
| `story` | `activeStoryQuest` | `requiredPoints` punti canale (obbligatorio) | `0` | no | no |
| `worldMission` | `activeWorldMissionQuest` | `requiredPoints` punti canale (obbligatorio), ognuno paga il proprio | `0` | no | sì |
| `boss` | `pendingQuest` | nessuno | `timeToComplete ?? 0` | no | sì |
| `enemy`, `aid` | `pendingQuest` | nessuno | `timeToComplete ?? 0` | no | no |
| `hunt`, `dungeon`, `heal`, `job`, `study`, `crime`, `guard` | `pendingQuest` | nessuno | `timeToComplete ?? 0` | sì | no |

- **Titolo:** scala `rookie` → `adventurer` → `paladin` → `mage` → `hero` → `legend` (`TITLE_RANK`). Per le **story** il titolo deve essere **esatto** (`status.title === minTitle`: il rookie fa la story che lo rende adventurer, e così via; niente salti né ritorni). Per gli altri tipi vale `>=`. `minTitle` assente = nessun vincolo.
- **Party (worldMission, boss):** slot **esatti** per rango. Il personaggio occupa solo un posto del proprio `status.title`; un rango pieno o assente dal `party` → `QUEST_FULL` (un hero non copre un posto da paladin). Con `party` vuoto vale il totale `requiredAdventurers` senza vincolo di rango; con `party` vuoto e `requiredAdventurers` 0 non c'è limite.
- **Ripetibilità:** un tipo non ripetibile già in `completedQuests` (o, per le condivise, con il personaggio già registrato) → `QUEST_ALREADY_TAKEN`.
- **`pointsSpent`:** punti realmente pagati all'accettazione (0 per la corsia standard). Servirà alla Phase 9 per il rimborso.
- **`startDate`:** ora del server alla scrittura.
- **`waitingTime`:** millisecondi, tipo `Float` sul filo (il FE lo legge già come `int` in ms). `0` per story e worldMission (dipendono dalla presenza del GM in live); `infos.timeToComplete ?? 0` per la corsia standard (quest senza durata = countdown già scaduto).
- **Nessuna azione alla scadenza** (D-17): nessun job né timer. La corsia resta popolata finché la Phase 9 non chiude la quest; il FE mostra il countdown a zero.

---

## 4. Populate e lettura delle corsie

`CHARACTER_QUESTS_POPULATE` (`src/characters/character-quests.populate.ts`) si applica a `character(id)`, `characters` (innkeeper) e `characterUpdated` (snapshot e change stream):

- le tre corsie sono popolate con il documento `PendingQuest`: `id startDate waitingTime pointsSpent quest { id }`;
- `quest` dentro una corsia e ogni elemento di `completedQuests` portano **solo l'`_id`** della quest.

Selezione consigliata nel fragment del personaggio:

```graphql
quests {
  completedQuests { id }
  pendingQuest { id startDate waitingTime pointsSpent quest { id } }
  activeStoryQuest { id startDate waitingTime pointsSpent quest { id } }
  activeWorldMissionQuest { id startDate waitingTime pointsSpent quest { id } }
}
```

- Selezionare **SOLO `quest { id }`** (e `completedQuests { id }`): gli altri campi della quest dentro una corsia non sono popolati. Risolvere la quest dalla board già caricata o con `quest(id)`.
- Un ref orfano (PendingQuest cancellato) rende la corsia `null`; un elemento orfano di `completedQuests` viene omesso. Nessun errore sul filo.
- `pendingQuest(id)` legge il `PendingQuest` di **qualunque** corsia del proprio personaggio (C4); un PendingQuest altrui resta `FORBIDDEN` (`Questa missione non ti appartiene`). L'innkeeper conserva il proprio bypass su questa query.
- Attenzione FE: `Quest.fromJson` parsa `registeredAdventurers` come `List<Character>`, ma il campo sul filo è `[String!]!` (id dei personaggi). Oggi non viene selezionato; se la board lo seleziona per contare i posti (§6), il modello va adeguato.

---

## 5. serverTime e countdown

- Interrogare `serverTime` (autenticata, `UNAUTHENTICATED` senza bearer) al **bootstrap** e al **resume** dell'app e calcolare `offset = serverTime - now()` del device.
- Scadenza mostrata = `startDate + waitingTime`, confrontata con `now() + offset` (cioè con l'ora del server stimata). Cambiare l'orologio del device non deve cambiare il countdown.
- Story e worldMission hanno `waitingTime` 0: il countdown è già scaduto, la richiesta attende il GM in live.
- Nessun timestamp del server viaggia dentro i payload delle entità (D-15). Lo stesso offset servirà, nella FE Phase 7, al viaggio.

---

## 6. Board: campi per nascondere o disabilitare

| Campo | Uso sulla board |
|-------|-----------------|
| `infos.type` | corsia della quest (§3) e confronto con le corsie popolate del personaggio |
| `requirements.minTitle` | story: solo la story del titolo esatto; altri tipi: titolo minimo |
| `requirements.requiredPoints` | costo in punti canale, da mostrare **SOLO per story/worldMission**. Il catalogo reale ha `requiredPoints: 3000` su una quest `enemy`: il BE lo ignora e non debita nulla |
| `requirements.party` + `registeredAdventurers` | posti per rango (`count` per `title`); `registeredAdventurers` contiene gli id dei personaggi registrati ma non il loro titolo, quindi i posti per rango occupati non sono calcolabili dal FE con precisione: mostrare la composizione del party e affidarsi a `QUEST_FULL` |
| `requirements.requiredAdventurers` | capienza totale solo quando `party` è vuoto |
| corsie popolate del personaggio | disabilitare le quest del tipo la cui corsia è occupata |
| `completedQuests { id }` | nascondere o marcare le non ripetibili già fatte |
| città corrente vs città del marker (`infos.markerLocation` nei `pointsOfInterest` della città) | mostrare come accettabili solo le quest della città in cui si trova il personaggio |

Il testo `"Punti canale richiesti: 3000 / ${requiredPoints}"` di `quest_info_sheet.dart` ha un `3000` hard-coded: va sostituito dal saldo `twitchPoints` ricevuto da `userUpdated`, e la riga va mostrata solo per story/worldMission.

---

## 7. Emendamento FE QUEST-05

BE-QUEST-03 è stato emendato il 2026-10-21 (Phase 7 CONTEXT D-08/D-09). Da recepire nel discuss della FE Phase 6:

- **nessun costo in monete** per nessuna quest; `recommendedLoot` è solo un suggerimento display;
- **solo story e worldMission** costano `requirements.requiredPoints` **punti canale** dell'utente proprietario;
- il costo è autoritativo lato BE: il FE mostra costo e saldo, il BE decide (`INSUFFICIENT_POINTS`).

---

## 8. Dati a DB per la UAT

Non esiste un admin CRUD delle quest in questa milestone: il catalogo si prepara a mano a DB.

**Da preparare:**

- **5 story** con `requiredPoints` intero > 0 e `minTitle` a scala: `rookie`, `adventurer`, `paladin`, `mage`, `hero` (ognuna fa progredire al titolo successivo nella Phase 9).
- **Una worldMission** con `requiredPoints` > 0 e un `party`, ad esempio `[{ title: 'hero', count: 5 }, { title: 'paladin', count: 4 }]`.
- **Un boss** con un `party`.
- Il `markerLocation` (in `infos`) di ogni quest deve essere uno dei `pointsOfInterest` di una città (vero per le 4 quest attuali).

**Stato attuale del DB di sviluppo** (RESEARCH Q4, solo conteggi):

- 167 città; il marker di ogni città è nella propria lista `pointsOfInterest` (167/167); nessun POI condiviso fra due città.
- 4 quest (`worldMission`, `enemy`, `job`, `heal`); il marker di ognuna è nei `pointsOfInterest` di esattamente una città (4/4), mai uguale al marker di una città.
- Nessuna story e nessun party. L'unica worldMission ha `requiredAdventurers: 1` e nessun party, quindi accetta un solo avventuriero finché il GM non aggiunge il party; senza `requiredPoints` valido risponde `QUEST_NOT_ACCEPTABLE`.
- La quest `enemy` ha `requiredPoints: 3000`, ignorato (§6).

**Campo interno `Quest.registrations`:** `[{ character, title }]`, solo su DB, **mai esposto su GraphQL** (il boot reale verifica che la parola non compaia nello schema). È scritto nello stesso update di `registeredAdventurers` (`$push` + `$addToSet`) e serve a contare i posti per rango. Se si modifica a mano una quest condivisa, i due campi vanno tenuti allineati.

---

## 9. Note per le fasi BE 8 e 9

**Phase 8 (viaggio):** aggiungere la guard "non in viaggio" (`activeTravel`) al filtro del claim (`laneClaimFilter` in `quest-acceptance.updates.ts`) e alla pre-verifica (`classifyEligibility` o una lettura del service), con un codice dedicato e il relativo ramo in `classifyUnclaimed`.

**Phase 9 (fine quest e coda del GM):**

- complete/reject del GM; al rifiuto **rimborso di `pointsSpent`** con `WalletService.creditUserPoints` (unico scrittore dei saldi), mai dal catalogo;
- per le condivise `$pull` su `registrations` e `registeredAdventurers` dove serve liberare il posto;
- svuotamento della corsia (`null`), aggiunta a `completedQuests`, eliminazione o archiviazione del `PendingQuest`;
- progressione del titolo al completamento della story (`minTitle` → titolo successivo);
- push `questEnd(pendingQuestId)` (Phase 5);
- BE-ADMIN-02 parla di "approve/reject": la semantica emersa qui è "esegui in live e segna come completata, oppure rifiuta con rimborso";
- `registeredAdventurers` come `[Character]` (o resolve field) per la vista live del GM (BE-ADMIN-01) è additivo solo come campo nuovo: cambiarne il tipo non è additivo.

---

## 10. Deploy

- Nessuna variabile d'ambiente nuova.
- Nessuna migrazione: i documenti legacy leggono i default (`activeStoryQuest`/`activeWorldMissionQuest` `null`, `pointsSpent` `0`, `party` `[]`, `registrations` `[]`).
- Nessuna dipendenza nuova.
- Nessun indice nuovo: `City.pointsOfInterest` non è indicizzato (167 città, una scansione per accettazione); un indice multikey è rimandato alla Phase 10.
- Moduli: `ServerTimeModule` (`src/time/`) montato in `AppModule` dopo `QuestAcceptanceModule`; `QuestAcceptanceResolver` dentro `QuestAcceptanceModule` (che ora importa `AuthzModule` e registra `City`).

---

## 11. Deviazioni e punti aperti

**Deviazioni registrate nei SUMMARY 07-01..07-08** (nessuna cambia il contratto):

- 07-01: rimosso un import inutilizzato in `quest.model.ts` (Boy Scout); Prettier ha riformattato i modelli toccati.
- 07-03: il RED committato falliva con `MissingSchemaError` (harness senza modelli) invece dell'errore sul filo, catturato con un probe non committato; i warning ESLint preesistenti di `characters.service.ts` (blocco change stream) restano fuori scope.
- 07-06: un commento riformulato per la grep di accettazione; il personaggio archiviato del test è impostato con un update diretto.
- 07-07: RED intermedio atteso del vecchio test negativo del boot reale, riscritto in positivo nel task successivo.
- 07-08: la suite integration completa ha rivelato un'aspettativa obsoleta in `src/characters/creation/character-creation.resolver.int-spec.ts` (il personaggio creato ora ha le due corsie `null`); aggiornata l'aspettativa, nessun codice di produzione cambiato.

**Fuori fase / differiti (dal CONTEXT):**

- Annullamento o abbandono di una quest da parte del viewer: non in roadmap.
- Admin CRUD delle quest (party, `requiredPoints`, `minTitle`): fuori milestone.
- `City.relatedLore` da valorizzare a DB.
- Gating di story/worldMission sullo stato live dello streamer (`stream.online` di Phase 6): idea non discussa, backlog.
- UAT su device (board, corsie, saldo, countdown con orologio spostato, innkeeper `FORBIDDEN` dal pannello admin): dopo la FE Phase 6, con i dati di §8 (vedi `07-VALIDATION.md`, Manual-Only Verifications).
