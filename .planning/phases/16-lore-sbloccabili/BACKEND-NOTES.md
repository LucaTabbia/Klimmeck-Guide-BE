# BACKEND-NOTES — Phase 16 Lore sbloccabili (handoff per la FE Phase 17)

- **Fase BE:** 16-lore-sbloccabili (requisiti BE-LORE-01..06; decisioni D-01..D-15 in `16-CONTEXT.md`; nomi del contratto fissati in `16-REPO-RULES.md`).
- **Data:** 2026-11-07. Documento di fine fase, scritto prima del boot reale col backfill (§5) e prima della UAT su device (richiede la FE Phase 17, l'identità di §3 e i trucchi di §4).
- **Branch:** `feat/16-lore-sbloccabili` (da `develop` `9103440`, la merge della PR #24) → PR verso `develop` a cura dell'orchestratore, **in draft** fino al boot reale col backfill e alla sua rimozione (§5).
- **Stato della FE Phase 17:** parcheggiata a 8/10 su `feat/17-unlockable-lore` (HEAD `661f951`; review, fix, verifica e audit chiusi): i piani 17-01..17-08 sono eseguiti su mock coi nomi delle REPO-RULES. Dopo la merge di questa fase riprende con **17-09** (gate di schema contro `origin/develop:src/schema.gql`) e **17-10** (E2E su device con l'identità da giocatore di §3).
- **Schema:** `src/schema.gql` è **solo additivo**: rispetto a `origin/develop` (`9103440`) aggiunge 3 righe e non ne toglie nessuna. Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate (piano 16-11): `npm run test:cov` **373 suite / 4649 test** verdi (576,5 s), nessuna soglia violata, `coverageThreshold` invariato; coverage totale 97,32 / 85,73 / 93,94 / 97,89 (statements / branches / functions / lines); `src/travel/` 98,57 / 84,48 / 99,34 (statements / branches / lines, soglie 97 / 84 / 98); `src/lore/` 96,72 / 84,14 / 97,54; boot reale 76/76; `npx tsc --noEmit` exit 0; prettier ed eslint puliti sui 97 file `.ts` toccati (resta il warning preesistente `test/app.int-spec.ts:977` `no-base-to-string`). VALIDATION firmata il 2026-11-07. Una variabile d'ambiente nuova, opzionale (`LORE_STUDY_CHANCE`); nessuna dipendenza nuova.
- **Fonte:** ogni nome, messaggio e riga di SDL è copiato dal codice: `src/schema.gql`, `src/models/character/character-status.model.ts`, `src/models/quest-result/quest-result.model.ts`, `src/lore/*.ts`, `src/quests/outcomes/victory-knowledge.ts`, `src/config/lore-config.ts`, `src/migrations/lore-backfill/*.ts`. **Lo schema vince su questo documento.**

---

## 0. TL;DR per il FE

1. **SDL solo additivo, tre righe:** `CharacterStatus.unlockedLore: [ID!]!`, `QuestEnemy.known: Boolean!`, `QuestResult.loreUnlocked: [Lore!]!`. Nessun tipo nuovo, nessuna riga tolta.
2. **Nessuna query, mutation o subscription nuova** (`EXPECTED_OWNER_ONLY_HANDLERS` invariato): `lores`, `lore(id)`, `cities`, `city(id)`, `enemy(id)`, `enemys` restano le stesse operazioni ma rispondono **per il personaggio corrente del bearer** (filtro sull'insieme delle lore sbloccate).
3. **`City.relatedLore` è `null`** per una città che il giocatore non conosce ancora (il campo era già nullable): il FE mostra il solo nome.
4. **`Quest.infos.relatedLore` resta intera** (voce del committente): non è filtrata.
5. **`characterUpdated` riemette** il personaggio quando l'insieme cambia (il change stream vede l'update del documento): nessun evento nuovo.
6. **L'innkeeper vede tutto** (e ogni nemico è `known: true`): il bypass dev è l'innkeeper, la UAT serve con l'identità da giocatore di §3.
7. **Il FE non calcola nulla**: geografia, vittorie, studio, conoscenza dei nemici sono regole del server (§2 serve solo per capire e per la UAT).

---

## 1. Contratto GraphQL

Blocchi copiati verbatim da `src/schema.gql` (`sortSchema: true`: campi in ordine alfabetico, tipi nell'ordine del file):

```graphql
type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  coins: Coins!
  currentLifePoints: Int!
  injuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  spellStates: [SpellState!]!
  spells: [Spell!]!
  title: String!
  unlockedLore: [ID!]!
  xp: Int!
}

type City {
  area: [[Float!]!]!
  hasShop: Boolean!
  id: ID!
  markerLocation: PointOfInterest!
  name: String!
  pointsOfInterest: [PointOfInterest!]
  relatedLore: Lore
  size: CitySize!
  type: CityType!
}

type Enemy {
  baseWeaknesses: [String!]!
  damages: Damages!
  energyWeaknesses: [String!]!
  id: ID!
  imagePath: String!
  legendary: Boolean!
  lifePoints: Int!
  locations: [PoiType!]!
  name: String!
  relatedLore: [Lore!]!
  spells: [Spell!]!
  xp: Int!
}

type Lore {
  description: String!
  id: ID!
  image: String
  name: String!
  relatedLore: [Lore!]!
  type: String!
}

type QuestEnemy {
  enemy: Enemy!
  known: Boolean!
  quantity: Int!
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
  loreUnlocked: [Lore!]!
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
```

Operazioni coinvolte (righe di `type Query`, invariate): `cities: [City!]!`, `city(id: String!): City!`, `enemy(id: String!): Enemy!`, `enemys: [Enemy!]!`, `lore(id: String!): Lore!`, `lores: [Lore!]!`.

**Diff rispetto a `develop`** (`git diff origin/develop -- src/schema.gql`): 3 righe aggiunte, 0 tolte.

```diff
 type CharacterStatus {
+  unlockedLore: [ID!]!
 type QuestEnemy {
+  known: Boolean!
 type QuestResult {
+  loreUnlocked: [Lore!]!
```

`Lore.type` resta `String!` (valori di `LoreType`); `Character.status.knownEnemies` esiste solo a DB, **mai sul filo**.

**Selezioni FE verbatim provate dalle int-spec:**

| Selezione FE | Dove la usa il FE | Int-spec che la prova |
|--------------|-------------------|-----------------------|
| `status { … unlockedLore … }` | `CharacterFragment.statusFields` | `src/characters/character-updated.subscription.int-spec.ts` (`serves the unlocked lore ids with the character and never the known enemies (D-01)`, `re-emits the character when its unlocked lore grows (D-01)`), `src/characters/creation/character-creation.resolver.int-spec.ts` (D-04, D-12) |
| `enemies { quantity known enemy { id name imagePath xp } }` | `QuestFragment` e `QuestResultFragment` | `src/lore/known-enemies.resolver.int-spec.ts` (HTTP `quest(id)` e WS `questResultReceived`) |
| `spellLearned { id name } loreUnlocked { id name type }` | `QuestResultFragment` | `src/quests/results/quest-result.resolver.int-spec.ts` (`serves the lore unlocked by the outcome with the FE selection (D-09)`, `serves an old result without unlocked lore as an empty list (D-09)`) |
| `cities { id type name size hasShop markerLocation { id location } relatedLore { id description image } }` | `CityQueries.getAllCities` | `src/cities/cities.resolver.int-spec.ts` (`CITIES_FE`) |
| `lores { id image type name description relatedLore { id name } }` e `query lore($id: String!) { lore(id: $id) { id image type name description relatedLore { id name } } }` | query della Biblioteca | `src/lore/lore-related.int-spec.ts` (`LORES`, `LORE`) |

Blocchi SDL dei tre tipi toccati fissati anche in `test/app.int-spec.ts` (boot reale).

---

## 2. Semantica

### 2.1 Gli insiemi del personaggio (D-01)

- Due insiemi per personaggio: `status.unlockedLore` (id delle lore, **sul filo**) e `status.knownEnemies` (id dei nemici sconfitti, **interno**). Default `[]`; si scrivono **solo con add-to-set** (mai rimossi, mai duplicati); l'ordine non è significativo (il FE confronta insiemi, non lunghezze né ordine).
- Sul filo `unlockedLore` sono soli id (nessun populate): i contenuti si leggono con `lores`/`lore(id)`. A DB ci sono 473 lore.
- Un personaggio nuovo dopo la cancellazione ha un `_id` nuovo e quindi **un insieme nuovo** (solo la geografia della città natale): `gives a new character only the geography of its own home city (D-12)`.

### 2.2 Geografia (D-03, D-04, D-05)

- Geografia di una città = la lore della città (`City.relatedLore`, 167/167 città ce l'hanno) + le lore di tipo `region` e `state` fra le `relatedLore` di quella lore di città. A DB: 88 città con 1 regione, 74 con 2, 5 con 3, sempre 1 stato (es. Murnborim → Regno della Madre, Lamstone, Lontano Nord). **Nessuna cascata**: personaggi, religioni e altre lore collegate alla città non si aprono.
- **Nascita:** il personaggio nasce con la geografia della città natale, nello stesso inserimento (`status.knownEnemies: []`).
- **Arrivi (cinque punti d'innesto)**, tutti nella stessa transazione del movimento, idempotenti:
  1. completamento di un viaggio `free` o `quest`, compresa la deviazione dopo una sconfitta in imboscata (viaggio `free` verso la città più vicina);
  2. salto istantaneo dell'accettazione di una quest (marker della quest su una città);
  3. teleport dell'oste (`teleportCharacter`);
  4. ritorno del soccorso sul marker della città (il foglio `rescued` resta con `loreUnlocked: []`);
  5. (nascita, sopra).
- Conta **solo il marker di una città** (`City.markerLocation`, 167 marker): i 475 POI del territorio (dungeon, portali, campi di battaglia) non sono una visita e non sbloccano nulla. Un marker senza città (difetto di catalogo) non sblocca nulla e non blocca il movimento; due città sullo stesso marker (dato ambiguo) danno sempre la geografia di quella con l'id minore (review A-IN-03).
- Gli arrivi non producono un foglio: la novità arriva solo su `characterUpdated` (il completamento del viaggio può generare fino a 2 eventi del change stream: il movimento e la geografia sono due update nella stessa transazione). Un arrivo che insegna produce quindi DUE `characterUpdated` sullo stesso personaggio: il primo con la posizione nuova e le lore di prima, il secondo con lo stato finale (add-to-set della geografia); il FE confronta gli insiemi di `unlockedLore` (FE 17 D-05) ed è già indifferente al passo intermedio (review B-IN-02).

### 2.3 Vittorie e nemici (D-06, D-07)

- Ogni esito **vinto con nemici** insegna a ogni partecipante vincente, nello stesso update del suo esito: le `Enemy.relatedLore` di tutti i nemici del contesto entrano in `unlockedLore`, gli id dei nemici in `knownEnemies`. Casi: quest individuale, party (boss: tutti i vincitori), dungeon superata, soccorritori, `gmCompleted` con nemici (trattato come vinto, come già l'xp), imboscata vinta.
- **Non insegnano nulla:** sconfitta, soccorso, morte, dungeon persa (il soccorso aperto ha gli stessi nemici), esiti senza nemici.
- **Il nemico esatto:** `known` = l'id esatto del nemico è in `knownEnemies`. Battere un Goblin apre la pagina «Goblin» del Bestiario (condivisa da 4 nemici) ma **non** schiarisce il ritratto del Goblin boss.
- Il risultato di una vittoria mostra già `known: true` sui nemici appena sconfitti (conoscenza scritta nella stessa transazione del `QuestResult`).
- **Staleness del tabellone (FE D-09):** `known` si risolve a ogni lettura; una card del tabellone già letta resta `known: false` finché il FE non rilegge le quest. Accettato.

### 2.4 Studio (D-08)

- Una `study` vinta senza `spellLearned` (a DB le 30 «Ricerche in biblioteca», senza magia fissa né sorteggio) apprende con probabilità `LORE_STUDY_CHANCE` (default 0,5) **una** lore casuale fra quelle non ancora sbloccate dei tipi `knowledge`, `god`, `religion`, `ceremony`, `material`, `state`, `character` (110 a DB). Escluse anche le lore che lo stesso esito ha già sbloccato.
- Pool vuoto (tutto già noto) → nulla. Il tiro passa dalla porta `ChanceSource` dopo i tiri di loot, magia e pet.

### 2.5 `QuestResult.loreUnlocked` (D-09)

- Contiene **solo le novità** di quell'esito (differenza rispetto a `unlockedLore` letto nella sessione): una vittoria su nemici già noti → `[]`.
- Ordine: le lore dei nemici nell'ordine delle voci di `enemies`, poi quella dello studio; deduplicate.
- Popolato sul filo (`{ id name type }` per il FE), **mai filtrato per viewer** (è sbloccato per costruzione).
- I risultati vecchi (prima del deploy) e i report d'imboscata trattenuti prima del deploy rispondono `[]`. La geografia degli arrivi non entra mai in `loreUnlocked`.
- Tipi del Bestiario per le righe del foglio (FE D-10): `enemy`, `animal`, `plant` → «Nuova pagina del Bestiario: …»; gli altri → «Conoscenza appresa: …».

### 2.6 Query filtrate (D-10, D-13)

| Lettura | Giocatore | Innkeeper | Senza personaggio corrente |
|---------|-----------|-----------|----------------------------|
| `lores` | solo le lore in `unlockedLore` | tutte | `[]` |
| `lore(id)` | lore chiusa → `NOT_FOUND` (stesso errore di una lore inesistente: nessun oracolo) | tutte | `NOT_FOUND` |
| `Lore.relatedLore`, `Enemy.relatedLore` (anche sotto `Quest.infos.enemies[].enemy` e `QuestResult.enemies[].enemy`) | filtrate sull'insieme | intere | `[]` |
| `City.relatedLore` (`cities`, `city(id)`, città dei negozi) | `null` finché la lore della città non è nota | intera | `null` |
| `QuestEnemy.known` | id esatto in `knownEnemies` | `true` | `false` |
| `Quest.infos.relatedLore` | intera | intera | intera |
| `QuestResult.loreUnlocked` | intera (mai filtrata) | intera | intera |

- Il personaggio corrente del viewer si risolve come le altre letture di proprietà (`users.currentCharacter`, personaggio attivo): un personaggio **morto in attesa della conferma del foglio** non ha vista (`lores` vuote, `known: false`, `City.relatedLore` null); il foglio di morte non porta lore (D-13).
- Una sola lettura di User + Character per viewer per richiesta HTTP e per evento WS (cache per richiesta/evento con chiave `rootValue`-o-context e, dentro, per viewer: due subscriber della stessa `questUpdated(id)` ricevono lo stesso payload ma ognuno il proprio `known`, review A-CR-01).

---

## 3. Identità di prova per la UAT

- Il bypass dev con `DEV_AUTH_ROLE=innkeeper` **vede tutto**: Biblioteca piena, ogni ritratto in chiaro, ogni città con la sua lore. Non prova nulla della Phase 17.
- Per la UAT serve una **seconda identità con ruolo giocatore**, come il 2026-11-01: variabili d'ambiente **del processo del BE** (non nel file `.env`), con il riavvio del BE dal branch:
  - `DEV_AUTH_ROLE=adventurer`
  - `DEV_AUTH_TWITCH_ID=<twitchId del giocatore>` (il twitchId dell'utente proprietario del personaggio di prova)
  - `DEV_AUTH_ENABLED` e `DEV_AUTH_ACCESS_TOKEN` come nella configurazione dev esistente (solo nomi qui).
- `LORE_STUDY_CHANCE=1` sullo stesso processo: ogni `study` vinta senza magia apprende una lore (tiro deterministico).
- Con l'identità da giocatore `teleportCharacter` risponde `FORBIDDEN` (è `@Roles(RoleType.innkeeper)`): per gli arrivi usare il viaggio con `endTime` nel passato (§4 c) oppure un riavvio temporaneo con `DEV_AUTH_ROLE=innkeeper` solo per il teleport.

---

## 4. Trucchi a DB per la UAT

Script dell'orchestratore fuori dal repo, dopo build e riavvio del BE dal branch. Campi indicati coi soli nomi; id coi segnaposto `<id>` / `<characterId>`. Il change stream dei personaggi riemette `characterUpdated` a ogni update.

- **(a) Svuotare la conoscenza:** `status.unlockedLore` e `status.knownEnemies` a `[]` sul personaggio `<characterId>` (un `$set` dei due campi). La Biblioteca si svuota dal vivo, ogni ritratto torna sagoma alla rilettura.
- **(b) Forzare il tiro dello studio:** `LORE_STUDY_CHANCE=1` sul processo al riavvio (§3), poi una `study` vinta senza magia. Con 0,5 la UAT ripete finché non esce.
- **(c) Arrivo su una città:** spostare `status.location` a DB **non sblocca nulla** (non è un arrivo). Usare il teleport del GM (`teleportCharacter` con `{ id: <characterId>, poiId: <id del marker della città> }`, bearer innkeeper) oppure un viaggio reale verso il marker della città con `status.activeTravel.endTime` portato nel passato: lo sweep lo completa entro un intervallo e la geografia della città entra nell'insieme.
- **(d) Città sconosciuta sulla mappa:** togliere da `status.unlockedLore` l'id della lore di quella città (un `$pull` dell'id `<id>`): `City.relatedLore` torna `null` e il FE mostra «Non conosci ancora questa città.».
- **(e) Ritratto oscurato:** togliere da `status.knownEnemies` l'id del nemico `<id>` (`$pull`): il nemico torna `known: false` alla rilettura.
- **(f) Personaggi esistenti:** i 3 personaggi attivi a DB (il quarto documento, `6ae30a623a20a4350c47eda5`, è archiviato) hanno già la conoscenza scritta dal backfill del 2026-11-08 (§5; `6ae776554e5fe45caead56c5` è rimasto vuoto: marker senza città e nessuna vittoria con nemici): geografia della città su cui si trovano + lore e nemici dei loro esiti vinti. Per una UAT «da zero» usare (a) o un personaggio nuovo.
- **(g) Verifiche:** a DB `characters.status.unlockedLore` / `status.knownEnemies` del personaggio; `questresults.loreUnlocked` dell'ultimo esito. Probe GraphQL col bearer del giocatore:

```graphql
{ lores { id name type } cities { id name relatedLore { id } } }
```

| Caso | Dati | Atteso |
|------|------|--------|
| nuovo personaggio | creazione | Biblioteca: città natale, sue regioni, suo stato; altri libri vuoti |
| arrivo | (c) su una città nuova | la sua pagina compare dal vivo con «Nuovo»; la città ha la lore sulla mappa |
| città sconosciuta | (d) | sulla mappa il solo nome |
| nemico ignoto | (a) o (e), poi una quest con nemici | sagoma |
| vittoria | quest vinta | ritratto in chiaro sul foglio + «Nuova pagina del Bestiario: …» (solo se la pagina era chiusa) |
| studio | (b) | «Conoscenza appresa: …» |
| cancella e ricrea | cancellazione + creazione | insieme nuovo |

---

## 5. Boot reale col backfill e rimozione

Il backfill one-off (D-11) inizializza i personaggi attivi esistenti (4 documenti a DB, di cui 3 attivi: uno è archiviato con `deletedAt` e il filtro dei personaggi attivi lo esclude): geografia della città del marker su cui si trovano (se è un marker di città) + lore e id dei nemici dei loro `questresults` vinti (`success` e `gmCompleted` con nemici, 26 risultati a DB). Idempotente per unione (add-to-set), mai bloccante, log di soli conteggi. Codice in `src/migrations/lore-backfill/`, modulo `LoreBackfillModule` importato **solo** da `src/app.module.ts`.

**Runbook dell'orchestratore:**

1. `npm run build` **prima** di fermare il BE che gira da `dist/` (porta 3001): `deleteOutDir` cancellerebbe `dist/` sotto il processo vivo.
2. Fermare il processo vecchio e riavviarlo dal branch `feat/16-lore-sbloccabili`.
3. Leggere nel log la riga `Backfill delle lore: personaggi <n>, aggiornati <n>, lore aggiunte <n>, nemici aggiunti <n>, senza città <n>` (atteso `personaggi 4`) e incollarla nella sottosezione «Esito del boot reale» qui sotto. Un errore appare come `Backfill delle lore fallito (<nome, codice>), il boot prosegue` e non ferma il boot.
4. Secondo riavvio (con build prima dello stop): la riga deve dire `aggiornati 0, lore aggiunte 0, nemici aggiunti 0` (verifica dell'idempotenza; `personaggi` e `senza città` restano quelli del primo boot).
5. Rimozione in TDD in un piano fuori fase (modello `3bdf65a`/`64ef914` della 13.1): RED in `test/app.int-spec.ts` (il caso `mounts the one-off lore backfill at boot (16 D-11)` diventa un controllo sui nomi dei moduli del `ModulesContainer` che non trova più `LoreBackfillModule`; mai importare `src/app.module` da una spec unitaria: senza `.env` la validazione dell'ambiente fa crollare jest), commit `test(migrations): …`; poi `refactor(migrations): drop the 16 one-off lore backfill after its run` (cancella `src/migrations/lore-backfill/` e l'import + il commento in `src/app.module.ts`); `npx tsc --noEmit -p tsconfig.json` 0, boot reale `test/app.int-spec.ts` verde, `git diff --exit-code src/schema.gql` 0.
6. La PR resta **in draft** fino al punto 5.

### Esito del boot reale

Eseguito dall'orchestratore il 2026-11-08 dal branch `feat/16-lore-sbloccabili` (build di `a2c10cd`, `PORT=3001`; Redis locale spento come già nel boot precedente da `develop`: WARN al boot, i job partono al riconnesso e lo sweep copre).

- **Primo boot (16:17):** `Backfill delle lore: personaggi 3, aggiornati 2, lore aggiunte 8, nemici aggiunti 1, senza città 1`. I documenti a DB sono 4, ma `6ae30a623a20a4350c47eda5` è archiviato (`deletedAt` 2026-10-29) e il filtro dei personaggi attivi lo esclude: il «4» atteso contava i documenti. Effetto letto a DB in sola lettura: `68c191de541d89c481b8322b` 5 lore + 1 nemico (città del marker + vittorie), `6ae777dd4db394a6354fd0a0` 3 lore (sola geografia), `6ae776554e5fe45caead56c5` invariato (marker senza città, nessuna vittoria con nemici: è il «senza città 1»).
- **Secondo boot (16:19):** `Backfill delle lore: personaggi 3, aggiornati 0, lore aggiunte 0, nemici aggiunti 0, senza città 1` (idempotenza verificata).
- **Rimozione in TDD:** `80c3bf7` test(migrations): expect the real boot without the one-off lore backfill (RED: il boot reale di `test/app.int-spec.ts` non trova più `LoreBackfillModule` fra i moduli del `ModulesContainer`) → `0125058` refactor(migrations): drop the 16 one-off lore backfill after its run (i 7 file di `src/migrations/lore-backfill/` più import e commento in `src/app.module.ts`; tsc 0, boot reale 77/77, SDL invariata).
- **Terzo boot (16:20) dalla build finale:** nessuna riga del backfill, applicazione avviata; il BE resta in esecuzione da questo codice sulla 3001.
- **CI:** rossa prima del boot per `lore-backfill.boot.spec.ts` che importava `AppModule` (senza `.env` la validazione dell'ambiente faceva crollare jest); corretta in `5fd6190`, verde dal commit `a2c10cd`.

---

## 6. Deploy

- **Variabile opzionale `LORE_STUDY_CHANCE`** (`.env.example` con `LORE_STUDY_CHANCE=`): vuota = 0,5; numero in [0, 1]; un valore non valido o fuori intervallo **rifiuta il boot**. Non è un segreto.
- **Nessun indice nuovo, nessuna migrazione del catalogo, nessun seeder**: gli insiemi vivono nel documento del personaggio; il catalogo delle lore non cambia.
- I personaggi creati dopo il deploy nascono con la geografia; quelli esistenti la ricevono dal backfill (§5).
- **FE precedente alla Phase 17:** non seleziona i campi nuovi e li ignora; vede però le liste filtrate (Biblioteca del giocatore ridotta alle lore note, `City.relatedLore` null sulle città sconosciute: il FE vecchio ci farebbe `relatedLore!.id`). **Il branch FE della 17 non gira contro un BE senza la Phase 16** (FE D-14): le sue selezioni falliscono la validazione.
- **Runbook post-merge = build + riavvio** a BE fermo (mai `npm run build` mentre il processo gira da `dist/`).

---

## 7. Deviazioni e punti aperti

**Deviazioni registrate nei SUMMARY 16-01..16-11** (nessuna cambia il contratto delle REPO-RULES):

- **Lore depopolate dalla riassegnazione** (16-02, Rule 1): filtrare `loreUnlocked` riassegnando l'array su un documento idratato lo ricastava a ObjectId (`Lore.id` arrivava come Buffer, `INTERNAL_SERVER_ERROR`); corretto con una rimozione in place.
- **Tipi letterali degli update** (16-05, 16-06, 16-07, Rule 3): `ParticipantPlan.update`, `AmbushOutcomePlan.update` e `RescuedPlan.update` sono tipi letterali con l'add-to-set opzionale (un'intersezione con l'interfaccia rompeva tsc); la forma degli update esistenti non cambia (D-14).
- **Fixture del salto** (16-04): l'accettazione rifiuta una quest fuori dalla città del personaggio (`QUEST_NOT_IN_CITY`), quindi i casi del salto collegano la geografia alla città del travel world invece di usare un marker isolato.
- **Numeri di fixture ri-derivati** (16-06): le due vittorie del ciclo d'imboscata combattono il Bandito di città (senza lore → `[]`) e il Lupo della strada (`[pagina del lupo]`), non lo stesso nemico due volte.
- **Sequenze di tiri** (16-07): una `study` senza loot, magia né pet consuma 0 tiri prima dei due dello studio; con lore dello studio a DB la sequenza è `[gate, pick]`; le sequenze delle spec esistenti non cambiano.
- **Priming del change stream** (16-09, Rule 1 nella spec RED): spostato in `beforeAll` perché la sua pulizia svuotava il database dopo i nemici del test.
- **`forFeature` nel modulo del backfill** (16-10, Rule 3): `LoreBackfillModule` registra Character, QuestResult ed Enemy (senza, `MissingSchemaError`).
- **Due test «ciechi» aggiornati** nel commit RED del filtro (16-08, Pitfall 10): `src/lore/lore-related.int-spec.ts` e `src/shops/city-shop.resolver.int-spec.ts` ora usano un giocatore che conosce le lore del test.
- **Casi verdi al primo colpo** documentati nei SUMMARY: le prove «campo vuoto» (il default `[]` di `@Prop` rende i due insiemi presenti su ogni personaggio creato via Mongoose) e il caso «nessun tiro senza pool».
- **Gate** (16-11): `test:cov` completo in 576,5 s (sotto il tetto di 600 s dello strumento), nessun ripiego per cartella; margine branch di `src/travel/` 0,48 punti sulla soglia 84.
- **Bookkeeping:** STATE `Plan: N of 12` senza zero iniziale (formato dell'orchestratore) invece del letterale dei piani.

**Osservazioni per la FE e la UAT:**

- **(a) Due eventi all'arrivo.** Il completamento del viaggio può emettere due `characterUpdated` (movimento, poi geografia): il FE confronta insiemi e fa un solo refetch per cambio.
- **(b) La geografia non ha foglio.** Le pagine aperte da un arrivo non compaiono mai in `loreUnlocked`: il «Nuovo» della Biblioteca è l'unico segnale.
- **(c) Backfill e «Nuovo».** I 4 personaggi esistenti ricevono la conoscenza al boot reale senza foglio: alla prima apertura di un libro il FE non ha baseline e non marca nulla (FE D-07), come atteso.
- **(d) Il bypass dev è l'innkeeper.** Ogni passo LORE della E2E usa l'identità di §3.
