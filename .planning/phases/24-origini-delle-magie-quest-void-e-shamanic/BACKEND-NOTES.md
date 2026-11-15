# BACKEND-NOTES — Phase 24 Origini delle magie, quest void e shamanic (handoff per la FE Phase 23 e per l'orchestratore)

- **Fase BE:** 24-origini-delle-magie-quest-void-e-shamanic (requisiti BE-ORIGIN-01..12; decisioni D-01..D-24 nel CONTEXT della FE Phase 23, autorevole per entrambi i repo; gli emendamenti D-20..D-24 vincono sul resto; D-25 è il ruling dell'utente del 2026-11-15 sul finding WR-01; nomi fissati in `24-REPO-RULES.md`). **Companion:** FE Phase 23 «spell origins, void and shamanic quests», ramo FE `feat/23-spell-origins-void-and-shamanic-quests`.
- **Data:** 2026-11-15. Scritto dopo il gate 24-11 (`24-11-SUMMARY.md`), sulla HEAD del ramo più i soli commit di documentazione.
- **Branch:** `feat/24-origini-magie-quest-void-shamanic`, impilato su `fix/23-dungeon-xp-and-innkeeper-corrections` (PR #43) → PR verso `develop` a cura dell'orchestratore, dopo `npm run test:cov`, verifica, audit, boot reale col migratore e sua rimozione (§4).
- **Gate 24-11:** `npx tsc --noEmit` 0; unit 310 suite / 4 419 test; integration 163 suite / 2 558 test in cinque blocchi `--runInBand` (`src/quests/outcomes` 16 / 245, resto di `src/quests` 30 / 572, `src/characters` 30 / 476, `src/travel` 13 / 277, resto 74 / 988); boot reale `test/app.int-spec.ts` 107 test, SDL rigenerato identico al committato; boot reale più matrice authz 2 suite / 238 test; coverage per cartella sopra soglia (acceptance 99,11 / 92,83 / 99,75; generation 98,95 / 88,59 / 99,70; shops 100 / 83,87 / 100); lint mirato pulito su 72 file. **`npm run test:cov` completo: a cura dell'orchestratore.**
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, handler GraphQL nuovo (`test/authz/expected-handlers.ts` senza diff). **UN migratore una tantum** (`src/migrations/spell-origins/`) da togliere dopo il boot reale (§4). Nessun file di contenuto nel repo (D-36 del progetto).
- **Fonte:** nomi, percorsi e titoli dei casi copiati dal codice e dai SUMMARY 24-01..24-11. **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Cambio NON additivo (D-07, BE-ORIGIN-04):** `Spell.minXpToLearn` è TOLTO dallo SDL; al suo posto `Spell.minLevelToLearn: Int!` (intero 1..20). L'app stampa il livello che arriva, non calcola nulla (D-08).
2. **`Spell.origin: String!`** (D-01, BE-ORIGIN-03): valori sul filo `void`, `arcane`, `shamanic`. Nessun effetto su combattimento, slot o apprendimento (D-04). Nomi italiani e icone a cura della FE (D-05, D-06).
3. **`Spell.relatedLore: [Lore!]!`** (D-24, BE-ORIGIN-12): solo le lore che il viewer ha sbloccato (l'oste le vede tutte). Imparare una magia sblocca le sue lore come ogni altro sblocco: `status.unlockedLore` e `QuestResult.loreUnlocked`. La lore di una magia si sblocca SOLO imparando la magia (D-25): il tiro di lore dello studio non la pesca mai.
4. **Tipi di quest (D-09, D-20, BE-ORIGIN-07):** `magic` non esiste più, rinominato `arcane`; nuovi `shamanic` e `void`. Nessun cambio SDL (il tipo è `String!`), ma `magic` non arriva più sul filo dopo il migratore.
5. **Tre `CityType` nuovi (D-15, D-16, BE-ORIGIN-01):** `aarakocraCapital`, `dragonbornCapital` (taglia `capital`), `dragonbornVillage` (`village`). Additivi; la query `cities` torna a servire Murnborim, Thengran e Veg Faldir.
6. **Città di nascita (D-18, BE-ORIGIN-02):** un dragonborn nuovo nasce in `dragonbornCapital`, un aarakocra nuovo in `aarakocraCapital`; i personaggi esistenti non si spostano.
7. **Finestra FE (§3):** dal riavvio del BE dal ramo, la FE di `develop` è rifiutata su ogni operazione che seleziona `minXpToLearn`: riavvio del BE e build della FE Phase 23 sul device vanno INSIEME.

---

## 1. Diff SDL (verbatim)

Blocchi copiati da `src/schema.gql` (ordine alfabetico di `sortSchema`).

```graphql
type Spell {
  description: String!
  energyDamage: EnergyDamage!
  id: ID!
  maxUsages: Int!
  minLevelToLearn: Int!
  name: String!
  origin: String!
  recoveryTime: Int!
  relatedLore: [Lore!]!
  requiredLearnTime: Int!
  useType: String!
}
```

```graphql
enum CityType {
  aarakocraCapital
  aarakocraVillage
  desertVillage
  dragonbornCapital
  dragonbornVillage
  drusteaCapital
  drusteaCity
  drusteaSeaCity
  drusteaVillage
  elfCapital
  ferrionCity
  flameCenterCapital
  flameCity
  flameNorthCapital
  flameSouthCapital
  flameVillage
  forestVillage
  liberiaCapital
  liberiaCity
  liberiaVillage
  mirwaCapital
  mirwaCity
  mirwaSeaCity
  mirwaVillage
  motherCapital
  motherCity
  motherVillage
  mountainVillage
  necrorianCity
  northVillage
  talmvereVillage
  tropicalVillage
  valanCapital
  valanCity
  valanSeaCity
  valanVillage
}
```

| Tipo | Vecchio | Nuovo | Natura |
|------|---------|-------|--------|
| `Spell` | `minXpToLearn: Int!` | — | **tolto** (non additivo, D-07) |
| `Spell` | — | `minLevelToLearn: Int!` | aggiunto (D-07) |
| `Spell` | — | `origin: String!` | aggiunto (D-01) |
| `Spell` | — | `relatedLore: [Lore!]!` | aggiunto (D-24) |
| `CityType` | 33 valori | 36 valori | aggiunti `aarakocraCapital`, `dragonbornCapital`, `dragonbornVillage` (D-15) |

Prova: `git diff a208ad3d -- src/schema.gql` (base della fase) ha **una riga tolta** e **sei aggiunte**:

```
-  minXpToLearn: Int!
+  aarakocraCapital
+  dragonbornCapital
+  dragonbornVillage
+  minLevelToLearn: Int!
+  origin: String!
+  relatedLore: [Lore!]!
```

**Non cambia:** i tipi di quest (`QuestInfos.type` resta `String!`: `arcane`, `shamanic`, `void` passano senza diff), nessun `enum SpellOrigin` né `enum QuestType` nello SDL (enum solo TypeScript), mutation, input, codici d'errore, push, handler, subscription. `SpellInput` è stato cancellato ma non era mai stato nello SDL.

---

## 2. Semantica per area

### (a) Origine (D-01, D-04, D-06; BE-ORIGIN-03)

- Enum TypeScript `SpellOrigin { void, arcane, shamanic }` (`src/models/enums/spell-origin.enum.ts`); `Spell.origin` obbligatoria a DB con validazione enum di Mongoose, `String!` sul filo come `useType`.
- È una classificazione: decide solo quale quest di scuola insegna quale magia. Nessun effetto su combattimento, slot, apprendimento (D-04: `src/quests/outcomes/combat` e `src/characters/spells` senza diff nella fase). Le magie dei nemici hanno un'origine come le altre.
- Nomi italiani («Arcana», «Sciamanica», «Vuoto») e icone a cura della FE (D-05, D-06, D-21).
- Al boot `SpellCatalogueReporter` conta le magie senza origine fra le tre o senza livello minimo intero fra 1 e `MAX_LEVEL` e scrive UN WARN col solo numero (`Magie: <N> senza origine o livello minimo validi: non servibili sul filo e mai insegnate`); un errore di lettura è un `error`, il boot prosegue.

### (b) Livello minimo (D-07, D-08; BE-ORIGIN-04, -05, -06)

- `Spell.minLevelToLearn: Int!` (da 1 a `MAX_LEVEL`, l'ultimo livello della tabella: oggi 20; schema Mongoose, lettori e reporter usano lo stesso tetto, WR-03). Conversione dei valori vecchi con la tabella unica `levelRowFor` (`src/quests/outcomes/progression/level-table.ts`): il livello il cui `minXp` è il più alto non sopra l'xp della magia (4 000 → 6, 12 000 → 10, 20 000 → 12, 30 000 → 15, 50 000 → 20).
- **Quest:** premio fisso (`prizes.spell`), magia del blocco premio per titolo e sorteggio insegnano solo se il livello del personaggio DOPO l'esito (`progression.level`) raggiunge `minLevelToLearn`; uguale impara, uno sotto no.
- **Oste:** le opzioni dei premi offrono una magia solo se `levelRowFor(status.xp).level` la raggiunge (mai il livello salvato); la stessa regola rivalida al salvataggio della bozza e al completamento (`OUTCOME_OVERRIDE_INVALID`).
- Una magia senza livello intero fra 1 e `MAX_LEVEL` non è mai insegnata né offerta (lettori fail-closed) e il reporter d'avvio la conta fra le non servibili; sotto 1 o assente non è nemmeno servibile sul filo (`Int!` non nullo), e lo schema rifiuta la scrittura fuori dall'intervallo.

### (c) Quest di scuola (D-09, D-10, D-11, D-20; BE-ORIGIN-07, -08)

- `arcane`, `shamanic`, `void` sono identiche fra loro: ripetibili, senza registrazione, corsia standard, avvio all'arrivo, pool di lore dello studio, nessun soccorso alla sconfitta. Accettazione secondo `requirements.minTitle` della quest (le quest di scuola a DB: `mage`).
- Tabella esplicita tipo → origine, una sola: `SPELL_ORIGIN_BY_QUEST_TYPE` in `src/quests/spell-schools.ts` (`arcane → arcane`, `shamanic → shamanic`, `void → void`).
- Con `prizes.spellDraw: true` una quest di scuola pesca SOLO fra le magie della propria origine, col cancello di livello dentro il pool; pool vuoto o nessuna magia imparabile = nessuna magia (stessi tiri consumati: nessun tiro aggiunto o spostato).
- Ogni altro tipo con `spellDraw: true` (es. `study`) pesca dall'intero catalogo come prima. La magia fissa `prizes.spell` non è filtrata per origine.
- Il generatore non scrive mai `spellDraw: true` né quest di scuola: sono contenuto a DB (§5).

### (d) Lore dell'origine (D-24; BE-ORIGIN-12)

- `Spell.relatedLore` a DB: lista di id di lore (default vuota). Sul filo `[Lore!]!` filtrata per viewer da `SpellRelatedLoreResolver` (gemello di quello dei pet): il giocatore vede solo le lore sbloccate, l'oste tutte, un utente senza personaggio nessuna di quelle chiuse; id inesistenti scartati.
- Quando una magia viene imparata, per QUALUNQUE via (sorteggio della quest, premio fisso, blocco per titolo, premio dell'oste; anche completamento del GM e quest con combattimento passano dallo stesso piano), le sue lore entrano nell'unico aggiornamento della conoscenza di `planParticipant`: aggiunta a `status.unlockedLore` (solo le novità, subscription del personaggio) e `QuestResult.loreUnlocked` con le stesse.
- Ogni magia di un'origine punta a DB alla lore della propria origine: la prima magia dell'origine la sblocca, le successive non cambiano nulla. Una magia non imparata (sotto livello, già nota, non caster, quest persa) non sblocca nulla.
- **D-25 (ruling dell'utente, 2026-11-15, finding WR-01):** la lore di un'origine si sblocca SOLO imparando una magia. `readStudyLorePool` (`src/quests/outcomes/resolution-loader.service.ts`, pool delle quest `study`, `arcane`, `shamanic`, `void`) esclude ogni lore che compare nella `relatedLore` di una magia qualsiasi, letta dai dati (id o esadecimale da script, voci illeggibili scartate): nessun id, nome o tipo di lore nel codice. Ordine del pool per id e tiri invariati: cambia solo l'insieme dei candidati. Un pool che resta vuoto si comporta come un catalogo senza lore dello studio (nessun tiro consumato, come prima). Le quattro vie d'apprendimento del piano 24-08 sbloccano la lore come prima.

### (e) Necrorian (D-12; BE-ORIGIN-09)

- Pavimento di titolo per tipo di città `CITY_RANK_FLOORS` (`necrorianCity → mage`) in `src/quests/generation/generation-rules.ts`, applicato per POI (marker e ogni `pointsOfInterest` di una città con pavimento).
- Il generatore compone su quei POI solo ranghi ammessi (`mage`, `hero`); nessun boss misto con il titolo inferiore sotto il pavimento (il boss resta a titolo unico senza tiri). Un POI senza ranghi componibili resta vuoto, come oggi.
- Mondo senza Necrorian identico tiro per tiro alla corsa registrata sul commit base della fase (`a208ad3d`). Il pavimento vale solo per le quest generate: una quest scritta a mano su Necrorian deve rispettarlo da sé (§5).

### (f) Città (D-15, D-16, D-18, D-22; BE-ORIGIN-01, -02)

- Tre tipi nell'enum e nella tabella esaustiva delle taglie (`src/cities/city-size.ts`): `aarakocraCapital` e `dragonbornCapital` → `capital`, `dragonbornVillage` → `village`. `aarakocraVillage` resta valido (Balkuldir).
- Generatore: le tre città rientrano nel mondo con la loro taglia (tetto e peso da capitale per le due capitali).
- Report dei negozi (D-22): `shopTierOf` giudica `aarakocraCapital` e `dragonbornCapital` con la fascia `city` (rarità fino a `rare`); la taglia sul filo resta `capital`. Heal e pool reali sono contenuto a DB (§5).
- Città di nascita (`RACE_HOME_CITY_TYPES`): dragonborn → `dragonbornCapital`, aarakocra → `aarakocraCapital`; solo personaggi nuovi. Il reporter d'avvio delle città di nascita avverte se una razza non ha una città del tipo atteso.

---

## 3. Finestra FE

- **Dal riavvio del BE dal ramo, la FE di `develop` è RIFIUTATA in validazione** su ogni operazione che usa i frammenti della magia (personaggio compreso), perché seleziona `minXpToLearn`. Riavvio del BE e build della FE Phase 23 sul device vanno INSIEME.
- Il tipo di quest `magic` non esiste più: sul filo arriva `arcane` (quest, risultati, lista dell'oste). La FE mappa `arcane`, `shamanic`, `void`; in Dart `void` è parola riservata, quindi il valore va chiamato in altro modo e mappato dalla stringa del filo.
- I tre `CityType` nuovi sono additivi; `Spell.origin` è `String!` (valori `void`, `arcane`, `shamanic`); `Spell.relatedLore` segue la regola di visibilità delle altre lore; gli sblocchi arrivano in `QuestResult.loreUnlocked` come gli altri.
- I piani FE che selezionano i campi nuovi restano gated sulla merge (schema check sullo SDL fuso).
- Le tre quest nuove si scrivono a DB DOPO che la build della FE Phase 23 è sul device.

---

## 4. Migratore una tantum e boot reale

**Il migratore è una tantum: la sua rimozione dal repo dopo il boot reale è compito dell'orchestratore.**

Cosa fa (piano 24-10, `src/migrations/spell-origins/`, montato solo da `AppModule`): al boot dell'app vera, dentro la factory di un provider (prima di ogni hook, processor Bull, sweep, HTTP e WS), tre passi idempotenti: «magie» scrive `minLevelToLearn` (da `minXpToLearn` con `levelRowFor`) e `origin: 'arcane'` solo dove mancano, senza mai cancellare campi; «tipo delle quest» e «tipo nei risultati» riscrivono `magic` → `arcane` in `quests.infos.type` e in `questresults.quest.type` (le sole copie persistite del tipo). Un passo fallito ferma il boot con un errore nuovo senza causa; i log portano solo conteggi e, per una scrittura non applicata, l'id della magia.

Runbook (a cura dell'orchestratore):

1. Backup del database (come nel boot della Phase 19: almeno `spells`, `quests`, `questresults`); client fermi.
2. Build e riavvio del BE dal ramo (a cura dell'orchestratore: gli esecutori non lo fanno mai).
3. Righe attese nel log (contesto `SpellOriginsBoot`, livello LOG), prima di ogni altra riga dei moduli:
   ```
   Origini delle magie, magie: trovati <N>, migrati <N>, già a posto <N>, senza corrispondenza <N>
   Origini delle magie, tipo delle quest: trovati <N>, migrati <N>, già a posto <N>, senza corrispondenza 0
   Origini delle magie, tipo nei risultati: trovati <N>, migrati <N>, già a posto <N>, senza corrispondenza 0
   ```
   Atteso: 96 magie trovate e migrate, 0 senza corrispondenza (una magia senza `minXpToLearn` numerico finirebbe lì e resterebbe non servibile: da guardare a mano); 1 quest rinominata («Iniziazione arcana a Valantar»); i risultati: quanti ne portano `magic`. Subito dopo, il WARN `Magie: …` del reporter atteso assente (tutte le magie con origine e livello). Eventuale WARN `Origini delle magie, magie: magia <id>, scrittura non applicata perché il documento è cambiato durante il passo` solo a client non fermi. Al fallimento: ERROR `Origini delle magie, <passo>: fallito (<NomeErrore>[, code <codice>]), il boot si ferma`.
   Nota (IN-02): «già a posto» conta anche magie con un valore presente ma non valido (es. `origin: 'magic'`, `minLevelToLearn: 0`), e «senza corrispondenza» somma xp non convertibile e scrittura non applicata. Se dopo il boot compare il WARN `Magie: …`, cercare a DB le magie con `origin` fuori dalle tre o `minLevelToLearn` non intero fra 1 e 20.
4. Registrare l'esito qui sotto.
5. Secondo riavvio: `migrati 0` su tutte e tre le righe (idempotenza).
6. **Rimozione del migratore, a cura dell'orchestratore, dopo il boot reale e prima della merge:** RED in `test/app.int-spec.ts` («does not mount the one-off spell origins migration (D-07, D-20)» al posto dei due casi «mounts…» del piano 10, via le costanti `SPELL_ORIGINS_PREFIX`/`SPELL_ORIGINS_STEP_LINES` e la spia `logSpy`), poi GREEN che toglie da `src/app.module.ts` l'import e la voce `SpellOriginsMigrationModule` (col commento) e cancella l'intera cartella `src/migrations/spell-origins/` (nove file: `spell-origins.step.ts`, `spell-origins.boot.ts`, `spell-origins.boot.spec.ts`, `spell-fields.step.ts`, `spell-fields.step.spec.ts`, `spell-fields.step.int-spec.ts`, `quest-type.step.ts`, `quest-type.step.int-spec.ts`, `spell-origins.module.ts`). Modello: commit `c3492ced` e `0822feee` della Phase 19. Nel handoff resta solo il report.
7. **`minXpToLearn` resta a DB dopo il migratore** (il codice di `develop` continua a funzionare sul database migrato, utile per un ritorno indietro): lo toglie l'orchestratore con lo script di contenuto DOPO la merge di BE e FE (operatore `$unset` sul campo `minXpToLearn` della collection `spells`).

### Log del boot reale

Boot reale del 2026-11-15 dal commit `791a7fd3`, con backup del database preso prima. Righe del migratore, testuali:

```
[SpellOriginsBoot] Origini delle magie, magie: trovati 96, migrati 96, già a posto 0, senza corrispondenza 0
[SpellOriginsBoot] Origini delle magie, tipo delle quest: trovati 1, migrati 1, già a posto 0, senza corrispondenza 0
[SpellOriginsBoot] Origini delle magie, tipo nei risultati: trovati 2, migrati 2, già a posto 0, senza corrispondenza 0
```

Nessun WARN del reporter delle magie; applicazione avviata. Migratore poi tolto dal repo in TDD (§4 passo 6): `test(migrations)` RED e `refactor(migrations)` GREEN, cartella `src/migrations/spell-origins/` cancellata.

---

## 5. Compiti di contenuto dell'orchestratore

Script FUORI dal repo, dopo la revisione dell'utente. **Nessun file di contenuto nel repo: tabelle e script restano fuori.** Qui solo la forma dei documenti e i compiti.

- **Origini e livelli delle 96 magie (D-02, D-07):** per ogni magia `origin` (uno di `void`, `arcane`, `shamanic`; il migratore le lascia tutte `arcane`) e `minLevelToLearn` (intero 1..20, rivisto dall'utente sulla conversione del migratore). Una sola tabella di revisione con le magie nuove.
- **Circa 45 magie nuove (D-03)**, fino a circa 30 per `void` e `shamanic`. Forma del documento in `spells`, campo per campo: `name` (stringa), `description` (stringa), `useType` (uno dei nove usi), `energyDamage { type, power }`, `requiredLearnTime` (intero), `minLevelToLearn` (intero 1..20), `maxUsages` (intero), `recoveryTime` (intero), `origin` (`void` / `arcane` / `shamanic`), `relatedLore` (lista con l'id `<loreId>` della lore della sua origine). **Senza `minXpToLearn`.** Una magia senza `origin` o `minLevelToLearn` validi non è servibile sul filo e non si insegna mai: il reporter d'avvio la conta.
- **Tre lore d'origine (D-24, W-8):** esistono già a DB come voci di tipo `knowledge` (tipo noto alla FE); vanno create solo se mancano, con lo stesso tipo. Poi `relatedLore` di OGNI magia (vecchia e nuova) = lista con l'id della lore della propria origine.
- **Recupero per chi conosce già magie (WR-02):** `$addToSet` della lore d'origine su `status.unlockedLore` dei personaggi che hanno già una magia di quell'origine negli `spellStates`.
- **Tre quest di scuola (D-11):** una `void` a Necrorian e una `shamanic` in ciascuna delle due capitali (Murnborim `690961bfe74c2f6dfc837d8f`, Thengran `690961bf31795cde80768bc7`), sul modello di «Iniziazione arcana a Valantar»: `infos.type` (`void` / `shamanic`), `requirements.minTitle: mage`, `prizes.spellDraw: true`, marker su un POI `<poiId>` della città. La `void` rispetta il pavimento di Necrorian (`mage` o sopra). Testi rivisti dall'utente. **Da scrivere dopo la build della FE Phase 23 sul device.**
- **Heal e negozi di Murnborim e Thengran da CITTÀ (D-22):** quest heal della fascia città e pool del negozio con rarità fino a `rare`; la taglia resta `capital`. Il report dei negozi le giudica già con la fascia `city`: un pool da capitale (ultrarare) comparirebbe come «fuori taglia».
- **Lore delle tre città cambiate (D-23):** Murnborim, Thengran, Veg Faldir (`690961bf1bf8bb61e5f6af2f`), riscritte sul documento di world building, riviste dall'utente.
- **Dopo le scritture:** riavvio; WARN `Magie: …` del reporter atteso assente; WARN delle città di nascita atteso assente (le due capitali esistono a DB).
- **Pavimento sulle quest scritte a mano (IN-08):** il codice non lo controlla; dopo la scrittura verificare a DB che ogni quest aperta con marker su un POI di Necrorian abbia `requirements.minTitle` in `mage` / `hero`.

**Contenuto scritto il 2026-11-15 dall'orchestratore, dopo il boot reale del §4:** 96 magie aggiornate e 48 inserite (80 `arcane`, 32 `shamanic`, 32 `void`, ognuna collegata con `relatedLore` alla lore della sua origine); tre quest di scuola («Memorie di un mago» a Necrorian, «Rito sciamanico a Thengran», «Rito sciamanico a Murnborim»); heal e negozi di Murnborim e Thengran in fascia città; lore delle tre città; la quest da recluta di Necrorian «Minaccia: Cultista» cancellata su ordine dell'utente; lore d'origine data ai due personaggi che conoscevano già magie. **Resta da fare dopo la merge:** `$unset` di `minXpToLearn` (§4 passo 7).

Ordine consigliato: boot col migratore (§4) → tabella rivista delle origini e dei livelli e magie nuove → lore d'origine e collegamenti `relatedLore` → rimozione del migratore (§4 passo 6) → merge di BE e FE → quest nuove dopo la build FE sul device → heal, negozi e lore delle città → campo vecchio tolto (§4 passo 7).

---

## 6. Comportamenti provati

Ogni voce: comportamento, decisione, spec che lo fissa.

**BE-ORIGIN-01 — tipi di città**
- Tabella esaustiva delle taglie con i tre tipi, conteggi 14 / 9 / 13, `isCityType` (D-15, D-16) — `src/cities/city-size.spec.ts`.
- `cities` e `city(id)` servono le tre città con la taglia, nessun errore d'enum (D-15, D-16) — `src/cities/cities.resolver.int-spec.ts`.
- Fascia `city` del report per le due capitali nuove, ultrarare fuori fascia, `rare` ammesso, capitali vecchie e `dragonbornVillage` sulla propria taglia (D-22) — solo le spec unitarie `src/shops/shop-pool.rules.spec.ts` e `src/shops/shop-pool.report.spec.ts` (`shop-pool-report.service.int-spec.ts` non esercita le capitali nuove).
- Pin dei tre valori in `enum CityType` — `test/app.int-spec.ts`.

**BE-ORIGIN-02 — città di nascita**
- Tabella delle razze, razze senza città, reporter che avverte (D-18) — `src/characters/creation/race-traits.spec.ts`, `starting-cities.reporter.spec.ts`.
- Un dragonborn nasce in `dragonbornCapital`, un aarakocra in `aarakocraCapital`, non nei vecchi villaggi (D-18) — `src/characters/creation/starting-location.service.int-spec.ts`.

**BE-ORIGIN-03 — origine**
- Valori sul filo delle tre origini, `magic` non è un'origine (D-01) — `src/models/enums/spell-origin.enum.spec.ts`.
- Origine obbligatoria e validata da Mongoose, servita sul filo (D-01) — `src/spells/spell-fields.int-spec.ts`.
- Origine fuori dal combattimento (D-04): invariante di assenza del gate 24-11.

**BE-ORIGIN-04 — livello minimo e campo vecchio**
- `minLevelToLearn` obbligatorio fra 1 e `MAX_LEVEL` (sopra rifiutato), `minXpToLearn` non più salvato (schema strict) (D-07, WR-03) — `src/spells/spell-fields.int-spec.ts`; `MAX_LEVEL` = ultimo livello della tabella — `src/quests/outcomes/progression/level-table.spec.ts`.
- Livello sopra il tetto (21, 4000) non servibile, non insegnato, non offerto (D-07, D-08, WR-03) — `spell-catalogue.reporter.spec.ts`, `quest-rewards.spec.ts`, `resolution-loader.service.spec.ts`, `mission-prizes.spec.ts`.
- Blocco `type Spell` pinnato, `minXpToLearn` assente dallo schema (D-07) — `test/app.int-spec.ts`.
- Reporter d'avvio: tre origini a livello 1 e 20 servibili; origine o livello sporchi non servibili; un solo WARN col numero, senza id né nomi; errore di lettura senza eccezione (D-01, D-07) — `src/spells/spell-catalogue.reporter.spec.ts`.

**BE-ORIGIN-05 — cancello di livello nelle quest**
- Confine 6 / 5 di `canLearnSpell`, sorteggio su pool a livelli diversi (D-07, D-08) — `src/quests/outcomes/rewards/quest-rewards.spec.ts`.
- Livello dopo l'esito per premio fisso, blocco per titolo e sorteggio (D-07, D-08) — `src/quests/outcomes/outcome-plan.spec.ts` (describe «spell gate on the level after the outcome»).
- Proiezione e lettore fail-closed su `0`, `-1`, `2.5`, `'6'`, `null`, `undefined`, `NaN` (D-07) — `src/quests/outcomes/resolution-loader.service.spec.ts`.
- Confini a livello 2 e premio fisso 2 imparata / 3 no (D-07, D-08) — `src/quests/outcomes/study-spell-draw.int-spec.ts`, `quest-resolution.service.int-spec.ts`.

**BE-ORIGIN-06 — cancello di livello dell'oste**
- Opzioni al livello esatto e non uno sotto, livello minimo non valido mai offerto (D-08) — `src/quests/guided/mission-prizes.spec.ts`.
- Livello dall'xp e non dal livello salvato; magia sopra il livello rifiutata al salvataggio e al completamento con `OUTCOME_OVERRIDE_INVALID` (D-08) — `src/quests/guided/guided-mission.resolver.int-spec.ts`, `mission-draft-save.service.int-spec.ts`, `guided-completion.service.int-spec.ts`.

**BE-ORIGIN-07 — tipi di scuola**
- Tabella tipo → origine e `magic` non più tipo (D-09, D-20) — `src/quests/spell-schools.spec.ts`.
- Ripetibilità, corsie e tabelle esaustive; `minTitle: mage` ammette da mage in su (D-09, D-11) — `src/quests/acceptance/quest-eligibility.spec.ts`, `quest-lanes.spec.ts`.
- Avvio all'arrivo dei tre tipi e liste d'avvio esaustive (D-09) — `src/quests/party/quest-start.service.spec.ts`.
- Accettazione e pool di lore dello studio per i tre tipi; nessun soccorso alla sconfitta (D-09) — `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `src/quests/outcomes/study-lore-draw.int-spec.ts`, `combatant-plan.spec.ts`.

**BE-ORIGIN-08 — sorteggio per origine**
- Pool di una quest di scuola filtrato con la costante dell'origine; altri tipi sull'intero catalogo; nessun pool senza flag (D-10) — `src/quests/outcomes/resolution-loader.service.spec.ts`.
- Ogni scuola insegna solo la propria origine; pool vuoto e origine sporca = nessuna magia; cancello dentro il pool; study sull'intero catalogo; magia fissa non filtrata (D-07, D-10, D-20) — `src/quests/outcomes/study-spell-draw.int-spec.ts`.

**BE-ORIGIN-09 — Necrorian**
- `CITY_RANK_FLOORS`, `rankFloorOf` fail-closed, `allowsRank`, `allowsMixedLower` (D-12) — `src/quests/generation/generation-rules.spec.ts`.
- Dodici semi senza quest sotto mage su Necrorian, nessun posto `paladin` nei boss, POI vuoto senza ranghi componibili (D-12) — `src/quests/generation/quest-generator.int-spec.ts`.
- Mondo senza Necrorian (6 città, seme 7, 24 quest con boss misti) uguale, numero di tiri e ogni quest, alla corsa registrata sul commit base `a208ad3d` (D-12, WR-04) — `src/quests/generation/quest-generator.int-spec.ts` («generates a world without Necrorian draw by draw as before the floor»); le spec a seme fisso preesistenti (`ENEMY_RUN_BEFORE_MIXED_BOSSES`, `MIXED_BOSS_RUN`) restano invariate.

**BE-ORIGIN-10 — migratore una tantum**
- Contratto dei passi, boot che si ferma con un errore nuovo senza causa (D-07, D-20) — `src/migrations/spell-origins/spell-origins.boot.spec.ts`.
- Regola pura livello e origine (D-07) — `spell-fields.step.spec.ts`; passo sulla collection grezza, seconda corsa a zero, nessun campo cancellato, scrittura concorrente non sovrascritta (D-07) — `spell-fields.step.int-spec.ts`.
- Rinomina `magic` → `arcane` in quest e risultati, idempotente (D-20) — `quest-type.step.int-spec.ts`.
- Modulo montato al boot reale, tre righe nell'ordine — `test/app.int-spec.ts` (casi che la rimozione trasforma in «does not mount…»).

**BE-ORIGIN-11 — gate e handoff**
- Gate 24-11 (`24-11-SUMMARY.md`) e questo documento.

**BE-ORIGIN-12 — lore dell'origine**
- `Spell.relatedLore` sul filo: sbloccata per il giocatore, tutte per l'oste, chiuse nascoste, lista vuota per una magia senza campo (D-24) — `src/lore/lore-related.int-spec.ts`.
- Sblocco per premio fisso, sorteggio, blocco per titolo; nulla di nuovo se già sbloccata; nulla se la magia non è imparata (D-24) — `src/quests/outcomes/outcome-plan.spec.ts`, `rewards/quest-rewards.spec.ts`, `src/quests/guided/chosen-rewards.spec.ts`, `resolution-loader.service.spec.ts`.
- Prima magia di un'origine sblocca la lore, la seconda nulla; magia fissa; premio dell'oste (D-24) — `src/quests/outcomes/study-spell-draw.int-spec.ts`, `quest-resolution.service.int-spec.ts`, `src/quests/guided/guided-completion.service.int-spec.ts`.
- Lore delle magie fuori dal pool dello studio per `study` e le tre scuole, ordine per id, id salvati come esadecimale; pool di sole lore di magie vuoto e nessun tiro consumato; lore d'origine di tipo `knowledge` sbloccata dalla sola magia imparata con due tiri (D-25) — `src/quests/outcomes/resolution-loader.service.spec.ts`, `study-lore-draw.int-spec.ts`, `study-spell-draw.int-spec.ts`.

---

## 7. UAT, domande aperte e deviazioni

### Passi di UAT su device (uno per messaggio)

Prerequisiti: boot col migratore eseguito (§4), contenuto del §5 scritto fino alle lore e ai collegamenti, build della FE Phase 23 sul device; le quest nuove scritte dopo la build.

1. Mappa: Murnborim e Thengran con il marker da capitale, Veg Faldir da villaggio; nessun errore su `cities`.
2. Diario: una magia mostra origine (icona) e «livello minimo» al posto dell'xp minimo.
3. Quest `arcane` di Valantar dopo il migratore: ancora accettabile da un mage, insegna solo magie `arcane`.
4. Quest `shamanic` in una delle due capitali: insegna una magia sciamanica e, alla prima, la lore dell'origine compare fra le lore sbloccate e nel foglio del risultato.
5. Seconda magia della stessa origine: nessuna lore nuova.
6. Quest `void` a Necrorian; sul tabellone di Necrorian nessuna quest generata sotto mage.
7. Opzioni dell'oste: le magie offerte rispettano il livello del personaggio (una sopra il livello non compare).
8. Creazione di un dragonborn e di un aarakocra: nascita nella rispettiva capitale.

Diagnosi suggerita: `spells` (`origin`, `minLevelToLearn`, `relatedLore`), `status.unlockedLore` del personaggio di prova, `questresults` (`loreUnlocked`, `quest.type`), log `SpellOriginsBoot`, `SpellCatalogueReporter`, reporter delle città di nascita.

### Risposte alla FE

- **W-7:** sì. La lore d'origine sbloccata compare in `status.unlockedLore` e in `QuestResult.loreUnlocked` per ogni via d'apprendimento (sorteggio, premio fisso, blocco per titolo, premio dell'oste), con lo stesso meccanismo degli altri sblocchi (piano 24-08, §2 d).
- **W-8:** sì. Le tre lore d'origine sono voci di tipo `knowledge` a DB, tipo che la FE conosce già (§5).
- Per la FE nessun'altra domanda.

### Domande aperte

- **A2 (contenuto):** una quest fuori dalle tre scuole con `spellDraw: true` a DB continua a pescare dall'intero catalogo, tutte le origini (D-10, scelta dell'orchestratore). Da contare a DB prima della UAT.
- **A3 (contenuto):** magie dei soli nemici sorteggiabili: oggi non c'è modo di escluderle dal sorteggio; con ~45 magie nuove il problema cresce. Decisione dell'utente.
- **Fascia del negozio nel campo `size` del report:** il report scrive la fascia (`city`) per le due capitali nuove, non la taglia (`capital`): default del piano 01, vetabile.
- **Reporter d'avvio delle magie** (proposta della ricerca, piano 05): un solo WARN col conteggio, senza id; se serve l'elenco, va chiesto.

### Deviazioni dai piani

- 24-01: `shopTierOf` RED a runtime invece che in compilazione (ts-jest non riporta i tipi); caso esplicito per capitale vecchia e `dragonbornVillage`.
- 24-02: tolto anche l'import morto `Types` da `spell.model.ts` (Boy Scout).
- 24-03: il caso del blocco per titolo passa a `planParticipant` il boss senza blocchi (tipo di `OutcomeQuestSnapshot.prizes`); titoli dei test in xp riscritti a livello.
- 24-04 / 24-05: `isLearnLevel` condiviso da `quest-rewards.ts` (oste, lettore delle quest, reporter delle magie) invece di duplicarlo.
- 24-06: `origin: 'magic'` nella spec del reporter cambiato in `'fire'`; un secondo uso di `magic` in `study-spell-draw.int-spec.ts` convertito; caso esaustivo delle liste d'avvio aggiunto.
- 24-08: la lore d'origine nella int-spec è di tipo `region` per non entrare nel pool dello studio (dopo D-25 non serve più: la lore di una magia è fuori dal pool qualunque sia il tipo; il caso `knowledge` è in `study-spell-draw.int-spec.ts`); `RewardCatalog.spells` tipizzata con `Omit`.
- 24-09: mondo «solo ranghi inferiori» con xp più bassi (un branco arrivava alla fascia mage); mondo dei semi ingrandito per esercitare la guardia del boss misto.
- 24-10: riga della scrittura non applicata riformulata; guardia della corsa provata con una scrittura concorrente vera; solo due copie persistite del tipo (`quests.infos.type`, `questresults.quest.type`).
- 24-11: nessuna correzione; tre esiti di grep annotati (tabella con annotazione di tipo, sottostringa del nome del modulo, URI finto della prova T-24-31 nella cartella una tantum).

### Casi verdi al primo colpo (dai SUMMARY)

- 24-01: «accepts a rare item in the shop of a new capital (D-22)» (la capitale ammetteva già `rare`).
- 24-03: confini «uguale al minimo» (col codice vecchio il confronto con un campo assente era falso, la magia passava).
- 24-04: livello minimo non valido mai offerto (prima nessuna magia era offerta).
- 24-06: casi che non dipendono dal nome del tipo; avvio all'arrivo dei tre tipi (regola derivata, già vera dal task 1).
- 24-07: catalogo intero per la study, nessun pool senza flag, magia fissa non filtrata (comportamento conservato).
- 24-08: assenze («nulla di nuovo se già sbloccata», «nulla se non imparata»).
- 24-09: garanzie di non vacuità e mondo senza Necrorian identico.
