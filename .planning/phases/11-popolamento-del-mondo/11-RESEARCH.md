# Phase 11: Popolamento del mondo - Research

**Researched:** 2026-11-01
**Domain:** contenuti versionati in YAML + CLI idempotente col driver nativo `mongodb` (pattern 10-26), validazione class-validator, generatore deterministico delle quest fisse, rimozione SDL di `Lore.unlocked`
**Confidence:** HIGH sul codice e sul comportamento di Mongo (verificati con probe), MEDIUM sulle stime di bilanciamento (dati del DB dev letti solo come aggregati della Phase 9), LOW/ASSUMED sull'identità degli id fra dev e produzione

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Identità e formato dei file (BE-CONTENT-01/02)
- **D-01 (utente: «le entry a DB hanno già un id univoco»):** l'identità di ogni voce è l'`_id` Mongo. Ogni voce YAML porta `id` (24 esadecimali): le voci esportate tengono il loro `_id`, le voci nuove ricevono un ObjectId generato al momento della stesura e scritto nel file (helper `--new-id N` del CLI o generazione diretta). Lo script fa upsert per `_id` (filtro `{ _id }`, `$set` del documento intero, `upsert: true`); rieseguito, non modifica nulla (`modified: 0` nel report). Nessun campo nuovo a schema, nessun indice unico sul nome; il nome è un'etichetta libera e può ripetersi fra tipi diversi (es. lore «Liberia» città e «Liberia» stato).
- **D-02 (utente):** tutti i riferimenti fra voci sono id (`relatedLore`, `infos.enemy`, `infos.markerLocation`, `prizes.spell`, `addedSpell`, `recommendedLoot[].item`, `prizeItem.item`, `randomLoot[].item`, città di una quest). Per la revisione umana, accanto a ogni id di riferimento il generatore scrive il nome come commento YAML (`# Orgeal, il Dio dei morti`); i commenti non sono dati. `--verify` segnala id pendenti, id doppi, violazioni di schema e, come warning, nomi doppi dentro lo stesso `(collezione, type)`.
- **D-03 (utente):** YAML, una cartella per collezione, un file per tema: `content/lore/{culti,regni,regioni,storia,figure,creature,animali,piante,citta-*}.yaml`, `content/enemies/{mostri,animali,leggendari,umani,giganti-orchi}.yaml`, `content/pets/`, `content/spells/`, `content/equipment/`, `content/loot/`, `content/quests/<regno>.yaml`, `content/fixes/*.yaml`, `content/config.yaml` (costanti), `content/images.yaml` (secondo passaggio). File da 20–40 voci, prosa in blocchi `|`. `content/` sta alla radice del repo, fuori da `src/` (non compilato; il CLI lo legge da un percorso risolto dalla radice del repo, non da `dist`). Dipendenza nuova: parser YAML (scelta nella ricerca, `yaml` di eemeli preferito).
- **D-04 (utente: «Esporta e poi estendi»):** un esportatore una tantum (`--export <dir>`, stessa CLI) scrive nei file il catalogo già a DB con i suoi id: 145 `equipmentitems`, 83 `lootitems`, 77 `spells`, 1 `pets`, 1 `enemies`, 12 `lore`. Da quel momento i file sono la fonte di verità e le aggiunte della fase si fanno nei file. L'export preserva ogni campo esistente (`sellable`, `itemType`, `buyPrice/sellPrice`, `image` Cloudinary delle 12 lore).
- **D-05 (utente: «Cosa non è presente nei file?»):** dopo l'export nulla del catalogo resta fuori dai file; gli unici documenti fuori sono le 16 quest di prova di Talmvere (più le 3 aid clonate), che vanno cancellate. Regola per il futuro: `--verify`/`--dry-run` elencano gli orfani delle collezioni gestite, `--apply` non cancella mai, `--prune <collezione>` cancella esplicitamente. Perimetro degli orfani per `quests`: solo quest fisse (`infos.type` ∈ hunt, dungeon, heal, job, study, crime, guard) con `concludedAt: null`; quest generate (Phase 13), aid, story, worldMission e quest concluse non sono mai orfane. Le quest di prova (tipi misti) si cancellano con una voce esplicita di `content/fixes/` per id, idempotente, che azzera anche i back-link `PointOfInterest.quest` e segnala `pendingquests`/`questresults` che le riferiscono (i risultati non si cancellano: sono storia).
- **D-06 (utente):** correzioni dichiarate in `content/fixes/`, applicate da `--apply` e riportate da `--verify`: i 6 POI con tipo fuori enum (`belleholmIsand`/`BelleholmIsland`/`NULLbelleholmIsland` → `belleholmIsland`, `ValanPlains` → `valanPlains`, `vulcano ` → `vulcano`, `gounet` → `glounet`, dedup dell'array; id `690e4186108dbf02380d4c81`, `690e4186c26625d660983fea`, `690e4186d116ef011e516635`, `690e4186477fbde00a7c7a79`, `690e418698ec3a87c4b7eb55`, `690e4186a2175881abee5979`); la città `Flinas` di tipo `northVillage` (id `690961bf952cc57d174677d7`) rinominata **Kliever** (la `drusteaVillage` `6909614456907fc49cf2a80e` resta `Flinas`); cancellazione delle quest di prova. `--verify` segnala in generale ogni valore enum fuori dai `PoiType`/`CityType`/`QuestType` noti.

#### Nemici e fasce (BE-CONTENT-04)
- **D-07 (utente, intake):** oltre alle 106 schede del documento (63 mostri, 22 animali, 9 piante = lore `plant`, 14 leggendari) entrano: **Umani ostili** dai 21 PNG del bestiario in tre gruppi — criminali (Bandito 25, Picchiatore 100, Capo dei Banditi 450, Assassino 3.900), cultisti e incantatori oscuri (Cultista 25, Cultista Fanatico 450, Sacerdote corrotto 450, Mago rinnegato 2.300, Arcimago 8.400), guerrieri e mercenari (Combattente Tribale 25, Berserker 450, Veterano 700, Cavaliere rinnegato 700, Gladiatore 1.800); **Giganti: solo il Gigante delle colline** (l'utente: «non ne esistono di altri tipi»); **Orchi e tribali** (Orco, Orog/capo orco, Bugbear, Capo goblin, Capitano hobgoblin, Sciamano goblin: XP dal bestiario, lo sciamano dal profilo del Cultista); **Leggendari come boss**: le 14 schede leggendarie diventano nemici (XP scalati, fascia `legend`) per le quest `boss` generate dalla Phase 13. Le bande non hanno una voce: una banda di briganti = N × Bandito con la quantità di `infos.enemies` (Phase 13).
- **D-08 (utente):** riferimento per ogni voce nemico: il bestiario SRD 5e in italiano `https://dungeonedraghi.it/compendio/bestiario/` (321 creature, 21 PNG; schede con PF, CA, attacchi per tipo di danno, vulnerabilità/resistenze, GS con PE). I PE del documento coincidono con quelli del GS: ogni scheda ha una fonte di statistiche. Le statistiche si trascrivono a mano nei file durante la stesura (nessuno scraping nel codice o in CI).
- **D-09 (utente):** schede multi-variante → una voce per variante («Drago rosso cucciolo», «Drago rosso giovane», «Golem di pietra», «Slaad blu», «Licantropo lupo», «Miconide sovrano», «Cavallo da guerra»…), ciascuna con livello e XP propri dal documento; la lore resta una per scheda e le varianti la condividono in `relatedLore`.
- **D-10 (utente):** fasce ↔ titoli dal livello del documento (livello del personaggio per cui la creatura è uno scontro «Medio»): **rookie 1–2** (PE ≤ 100), **adventurer 3–4**, **paladin 5–10**, **mage 11–16**, **hero 17–20**, **legend = le 14 schede leggendarie**. Per gli intervalli del documento («4/5», «6/7», «11/12», «15/16», «19/20») vale il limite inferiore; le voci senza livello (leggendari, PNG) prendono il livello dalla colonna «Medio» della tabella del documento per i PE del GS. La fascia è un campo derivato del file (`tier`), non dello schema: serve a `minTitle` delle quest fisse e al rango della Phase 13.
- **D-11 (utente):** `Enemy.xp = round(PE × 50000 / 355000)` (≈ ÷7,1; livello 20 di D&D ≈ livello 20 della `LEVEL_TABLE`), minimo 1; costante `ENEMY_XP_SCALE` in `content/config.yaml`. Esempi: Lupo 50 → 7, Goblin 135 → 19, Troll 1.800 → 254, Beholder 10.000 → 1.408, Tarrasque 155.000 → 21.831.
- **D-12 (utente):** `lifePoints = PF medi del blocco × 100` (stessa scala dei personaggi: 10 PF → 1.000; `LEVEL_TABLE` 1.000 → 40.000); `damages.base` e `damages.energy` = danno medio per round per tipo × 100 (contundente/tagliente/perforante → `blunt`/`cut`/`pierce`; fuoco/freddo/fulmine/acido/veleno/tuono/forza/necrotico/radiante/psichico → `EnergyType`); `baseWeaknesses`/`energyWeaknesses` = vulnerabilità del blocco + deduzioni dal testo del documento (non morti → `radiant`, troll → `fire`/`acid`, piante e miconidi → `fire`, creature di fuoco → `cold`, creature di ghiaccio → `fire`, golem di ferro → nessuna). Costanti `ENEMY_HP_SCALE`/`ENEMY_DAMAGE_SCALE` nel config; tutto ritoccabile nel file e da rivedere col motore di combattimento dell'utente. **Research flag:** misurare la potenza degli equipaggiamenti già a DB rispetto al placeholder (`winChance = potenza party / (potenza party + lifePoints)`) e dirlo nell'handoff, senza cambiare il resolver.
- **D-13 (Claude):** `locations` dalla riga di habitat del documento mappata sui `PoiType` (Paludi maledette → `swamp`, Lamstone → `mountainLamstone`/`undergroundLamstone`, Glounet → `glounet`, Harken → `harkenIsland`, oceani → `ladows`/`delants`, «ovunque» → `all`, luogo ignoto → `all`); centri abitati → `city`. `Enemy.spells` (sottodocumenti embedded): 1–3 magie del catalogo per i nemici incantatori, copiate per id dal file delle magie; il placeholder non le usa. `imagePath` (non-null a schema) provvisorio e deterministico `assets/images/<slug>.png` come l'Arbusto Maligno, sostituito dal passaggio immagini (D-24).

#### Catalogo: pet, magie, oggetti (BE-CONTENT-05)
- **D-14 (utente):** pet: 6–8 cavalcature dagli animali del documento (cavallo leggero, cavallo da guerra, alce, worg, ippogrifo, grifone, pegaso, aquila gigante) + 3–4 nuove proposte da Claude coerenti con le zone (es. cammello del Mar Sabbioso, lupo invernale addestrato, cinghiale gigante da sella, tartaruga gigante delle isole); `speedModifier` per fascia (il cavallo da viaggio esistente vale 2; velocità = 10 × modificatore, Phase 8 D-08), `null` = non cavalcabile; HP e prezzi per fascia; il pet esistente «Cavallo da viaggio» resta.
- **D-15 (utente):** le 77 magie restano; si aggiungono solo quelle assenti e richieste dal saggio sulla magia (sciamanesimo: elementi e preghiere; Vuoto/Abisso dei Diavoli: maledizioni, patti, bolle di caos), al massimo una decina, con `useType`/`energyDamage`/`minXpToLearn`/usi/recupero nella scala delle esistenti (`minXpToLearn` 4.000–50.000).
- **D-16 (utente):** ~20 equipaggiamenti unici rari/ultrarari/leggendari legati a figure (Valantar, Drustea, Monteaspro, Faris…), culti (ogni divinità un oggetto) e mostri (parti di drago, cuore di golem…), con `damages` e `addedSpell` per id dove sensato; i 145 esistenti restano come sono. Loot: `power` del cibo controllato sulla regola della Phase 14 (1 power = 3 minuti di marcia; 60 power = 3 h) e corretto nel file dove fuori scala; nuove voci di cibo regionali (frutti del Protettore ancestrale, pesce del Nanfail…) e pozioni per fascia. Prezzi in `Coins` coerenti con il listino del documento (birra 2–3 rame, pozione 50–70 rame, spada scadente 1 argento 50 rame; 10.000 rame = 100 argento = 1 oro); i leggendari non sono mai in vendita (Phase 12).

#### Quest fisse e premi (BE-CONTENT-06)
- **D-17 (utente):** per ogni città (eccetto Necrorian): sempre una `heal` e sempre un `job`; in più una `hunt` dove in zona vive un animale di fascia rookie/adventurer, sorteggiata (RNG con seme fisso, esito congelato nei file) al massimo in una città su due per regione, così un job e un'uscita facile sono sempre vicini; `guard` in città e capitali; `crime` in tutte le capitali e sorteggiata nelle città (non tutte), **mai a Ferrion** (è già una prigione); `study` con magia solo a Valantar (Phase 9 D-17), `study` senza magia nelle capitali, a Liberia (Collegio Millhelm) e sorteggiata nelle città (non tutte) — servono allo sblocco casuale delle lore della Phase 16. **Necrorian** ha solo la sua `dungeon` (motivi di lore).
- **D-18 (utente):** la `hunt` ha sempre un animale come nemico (sezione «Animali» del documento, lore `animal`) della zona della città e non è mai troppo complessa: solo animali con PE ≤ 200 (lupo, cinghiale, iena, avvoltoio, worg, coccodrillo, vespa gigante, squalo tropicale, formiche giganti, aquila gigante, tigre, pantera), `minTitle: rookie`. Il job è più facile della hunt: nessun combattimento, premio più basso.
- **D-19 (utente: «va bene così, le modifico io»; «i job non danno xp»):** tabella premi in `content/config.yaml`, moltiplicatore di fascia rookie 1, adventurer 2, paladin 5, mage 12, hero 25 applicato a: **job** 40 rame e **0 XP**; **hunt** 1 argento + 30 XP (più `Enemy.xp` dell'animale, Phase 9 D-11); **guard** 2 argento + 40 XP; **crime** 3 argento + 40 XP; **study** 0 monete + 60 XP (+ `prizes.spell` a Valantar); **heal** nulla; **dungeon** 4 argento + 80 XP + un `randomLoot` della rarità della fascia (rookie common, adventurer uncommon, paladin rare, mage ultrarare, hero legendary). Monete normalizzate in `Coins` (125 rame → 1 argento 25 rame).
- **D-20 (Claude):** `minTitle` delle quest fisse: heal/job/hunt `rookie`; guard/crime/study `adventurer` nelle città e `paladin` nelle capitali; `dungeon` dalla fascia del nemico scelto. Nemico della `dungeon`: un mostro (non animale) con `locations` compatibili con gli altri tipi del POI dungeon, fascia per taglia della città (villaggio → adventurer, città → paladin, capitale → mage; POI del Glounet/Harken/Necrorian → hero), sorteggiato con seme fisso e congelato nel file; `recommendedLoot` scelto fra equipaggiamenti che colpiscono le debolezze e consumabili contro i danni (stessa regola della Phase 13).
- **D-21 (Claude):** `timeToComplete` per tipo dalle quest di prova (job 2 h, hunt 1 h, guard 8 h, crime 1 h, study 2 h, heal 5 h, dungeon 3 h), costanti nel config. Marker: `hunt` su un POI della zona della città, `dungeon` sul POI dungeon, le quest di servizio (heal, job, study, crime, guard) sul `markerLocation` della città così i POI restano liberi per le quest generate della Phase 13 (che esclude il marker della città). **Research flag:** `PointOfInterest.quest` è un back-link singolo: verificare chi lo legge (FE mappa, acceptance) e come si comportano più quest fisse sullo stesso marker; in caso di vincolo, fallback su POI distinti con precedenza alle quest di servizio.
- **D-22 (Claude):** titoli e descrizioni in italiano dal sapore del documento, nome della città nel titolo; `infos.relatedLore` = lore della città (+ lore del nemico per hunt/dungeon); nessuna `requiredAdventurers` (le quest fisse non sono registrate); `requiredPoints` null (corsia standard).

#### Lore (BE-CONTENT-03)
- **D-23 (utente, 2026-10-29, confermato):** grana fine: ogni culto in tre schede (`god` rappresentazione, `religion` credo/discepoli/luoghi, `ceremony` feste), i quattro dei della fortuna in un'unica terna; i 6 regni + Harken/Ferrion + Necrorian/Glounet come `state`; le aree geografiche (Lamstone, Temistos, Nanfail/Hingtos, Mar Sabbioso, Belleholm, Calemark, Harken, Glounet, Minnely, pianure, oceani e stretto) come `region`; origini, sei ere, saggio sulla magia, valuta Liberica, potere economico come `knowledge`; le ~27 figure come `character`; una `enemy`/`animal` per scheda del documento (condivisa dalle varianti); `plant` per le 9 piante; materiali citati (Sundenim, rune magiche, Liberica…) come `material`; **ogni città ha una lore `city`** (le 12 esistenti restano; per le altre 155 schede brevi di 2–4 frasi da regno, taglia e zona), ogni `City.relatedLore` punta alla propria lore e ogni lore di città punta alla `region` e allo `state` in `relatedLore`. Totale atteso 350–450 schede.
- **D-24 (utente, 2026-10-29):** nessuna immagine nel repo. `content/images.yaml` mappa `id → URL Cloudinary` (commento col nome) e viene compilato dall'utente dopo il caricamento; `--apply` scrive `Lore.image`/`Enemy.imagePath`/`Pet.imagePath`; fino ad allora `Lore.image = null` e `imagePath` provvisorio (D-13).
- **D-25 (utente: «Rimuovo il campo ora»):** `Lore.unlocked` viene rimosso da modello, `LoreInput` e SDL in questa fase (nessun servizio BE lo legge). È una modifica SDL **non additiva** da dichiarare nel real boot e nell'handoff: il FE la seleziona in `lib/graphql/queries/lore_queries.dart` e la modella in `lib/models/lore.dart`, quindi **prima della merge della PR BE** serve un quick task FE che tolga `unlocked` dal documento (pattern gated 08-12/09-12); lo sblocco per personaggio arriva con la Phase 16.

#### Script, ambienti e handoff (BE-CONTENT-02/07)
- **D-26 (utente):** ambienti: dev subito (lo lancia Claude nella fase, prima `--dry-run` e `--verify`, poi `--apply`, poi `--verify` a zero differenze); staging = produzione li lancia l'utente dopo la merge con il runbook `docs/runbooks/content-seeding.md` (backup `mongodump` → copia ripristinata → `--dry-run`/`--apply`/`--verify` → produzione → report allegato), come per la migrazione 10-26.
- **D-27 (Claude, pattern 10-26):** CLI `src/content/run-content.ts` compilato in `dist/content/run-content.js`, driver nativo `mongodb` senza bootstrap Nest, `node --env-file=<file> dist/content/run-content.js --dry-run|--apply|--verify [--prune <collezione>] [--export <dir>] [--new-id N]`, `MONGO_URI`/`DB_NAME` dall'env, report JSON su stdout per collezione `{ inserted, modified, unchanged, orphans, fixes, errors }`, codici d'uscita 0/1/2/3 come `MIXED_REFS_EXIT`, nessun URI nei log; script npm `content:verify`/`content:apply`. Il caricamento è ordinato per dipendenze (lore → spells → equipment/loot → enemies → pets → quests → fixes → images) e usa `bulkWrite` per collezione.
- **D-28 (Claude):** validazione dei file prima di ogni scrittura: schema per collezione che rispecchia enum e campi `required` Mongoose più i campi non-null dello SDL (Pet, Enemy, Spell, Lore: un valore mancante rompe la query di lista), `Coins` interi ≥ 0, `QuestPartySlot.count ≥ 1`, esistenza di marker e città per id, rarità del `randomLoot` nell'enum; ogni violazione è un errore di `--verify` con percorso del file e id della voce.
- **D-29 (Claude):** test: unit sui mapper (voce YAML → documento), sulla tabella premi, sulla scala XP/HP, sul sorteggio con seme (hunt/crime/study/dungeon) e sul parser dei fixes; integration con il replica set sul ciclo `--dry-run → --apply → --verify → --apply` (secondo apply `modified: 0`), sul prune perimetrato, sui fixes idempotenti e sul real boot con lo SDL (solo `unlocked` rimosso); il CLI int-spec gira sul compilato come `run-mixed-refs.cli.int-spec.ts`.
- **D-30 (Claude):** handoff `BACKEND-NOTES.md`: inventario per collezione e per regno (città con hunt/crime/study, dungeon per città, nemici per fascia e zona, pet, oggetti unici, cibo), istruzioni di ricarica per ambiente, elenco delle correzioni applicate, la modifica `unlocked` per il FE, le costanti del config, e le note per le Phase 12 (pool dai `CityType`), 13 (nemici per zona/fascia, leggendari, formula del party dal documento), 14 (power del cibo), 16 (lore collegate).

### Claude's Discretion
- Nomi dei file e raggruppamento per tema dentro `content/`; ordine delle voci; stile dei commenti.
- Scelta della libreria YAML e della strategia di risoluzione del percorso di `content/` dal CLI compilato.
- Proposte dei 3–4 pet nuovi, delle magie sciamaniche/del Vuoto, dei ~20 oggetti unici e delle voci di cibo regionale (nomi, descrizioni, valori nella scala delle esistenti).
- Deduzione di habitat, debolezze e magie dei nemici dove il documento tace; mappatura degli intervalli di livello; livello dei PNG e dei leggendari dalla tabella «Medio».
- Sorteggi con seme (hunt/crime/study/dungeon, nemico delle dungeon) e titoli/descrizioni delle quest fisse.
- Struttura del report JSON e dei codici d'uscita, nel solco di 10-26.

### Deferred Ideas (OUT OF SCOPE)
- **Phase 13:** dimensione del party dei boss leggendari con la formula del documento (PE del boss / media per titolo); le bande di briganti come quantità di Bandito in `infos.enemies`; i leggendari riservati alla fascia `legend`.
- **Phase 12:** `City.size` è deducibile dal suffisso di `CityType` (Village/City/SeaCity/Capital): valutare se derivarlo invece di aggiungere un campo; `LootItemInput` dichiara i prezzi come `Number` mentre il modello usa `Coins` (incoerenza rilevata, nessun consumer).
- **Phase 14:** la taratura del cibo di questa fase presuppone 1 power = 3 minuti; se la costante cambia nel discuss della 14, i `power` del file vanno riletti.
- **Phase 16:** ridefinizione della conoscenza per personaggio ora che `Lore.unlocked` non esiste più; le lore `city`/`region`/`state` collegate da questa fase sono l'insieme iniziale.
- **Hardening/FE 12:** mutation admin di catalogo (oggi inesistenti) se l'utente vorrà modificare i contenuti dall'app invece che dai file.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-CONTENT-01 | Cartella di contenuto versionata (YAML) con lore, nemici, pet, magie, equipaggiamento, loot, quest fisse dal documento; nessuna immagine | §Layout di `content/`, §Piano di stesura (sezioni/righe del sorgente, `bestiary-stats.md`), §Formato delle voci |
| BE-CONTENT-02 | CLI idempotente `--dry-run/--apply/--verify` che risolve i ref e riporta orfani/duplicati/violazioni; seconda esecuzione nulla; passaggio immagini | §CLI, §Upsert idempotente (probe), §Validazione, §Fixes, §Export, §Report ed exit code. **Nota:** il testo del requisito dice «per nome»: superato da D-01 (identità per `_id`), da emendare nel piano di chiusura |
| BE-CONTENT-03 | ~300 (ora 350–450) lore a grana fine con `relatedLore` incrociate; ogni città con la sua lore | §Piano di stesura (lore), §Pitfall 1 (`relatedLore` non popolato rompe `lores`), §Ref `City.relatedLore` dalla voce di lore |
| BE-CONTENT-04 | Nemici del documento + intake, XP/HP/danni dalle regole, ritoccabili | §Regole deterministiche (D-10..D-13), §Formato voce nemico con blocco `source`, §Flag D-12 |
| BE-CONTENT-05 | Pet, magie, ~20 unici, cibo tarato | §Piano di stesura (catalogo), §Regole cibo e monete |
| BE-CONTENT-06 | Quest fisse per città + dungeon sui 40 POI | §Generatore delle quest fisse, §Flag D-21, §Premi. **Nota:** «una fra job e hunt» e «marker su POI della città» superati da D-17/D-21: emendare il testo |
| BE-CONTENT-07 | Handoff `BACKEND-NOTES.md` + procedura di ricarica | §Runbook e ops, §Flag D-12 (numeri per l'handoff), §Ordine di deploy |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack non negoziabile: NestJS 11, Mongoose 8, Apollo code-first; driver `mongodb` 6.19 già in `dependencies`.
- **TDD obbligatorio** (Red → Green → Refactor) per ogni modulo di `src/content/` (mapper, regole, validatori, diff, fixes, generatore, CLI).
- Workflow: branch `feat/11-popolamento-del-mondo` → PR a `develop`; Conventional Commits con scope `phase-11` (memoria utente: `docs(phase-11)`), **nessun trailer `Co-Authored-By`** (memoria utente prevale).
- Nessun secret in repo; i subagent **non devono mai** eseguire comandi che possano stampare `.env` (memoria utente). Il CLI non stampa mai l'URI (`describeError`).
- `npm run lint` riscrive file non correlati: usare `npx eslint <file>` / `npx prettier --check <file>` sui soli file toccati; mai `dart format`/`prettier --write` su cartelle.
- Jest: percorsi **prima** di `--selectProjects`; l'int-spec del CLI richiede `npm run build`.
- Il drift test `src/config/env-example.drift.spec.ts` vieta la stringa `process.env.` in qualunque sorgente di produzione sotto `src/` e impone che ogni chiave letta sia in `.env.example` → il CLI riceve `process.env` come oggetto (come `run-mixed-refs.ts:76`) e non introduce variabili nuove.
- Principi: Clean Code, SoC, Boy Scout; commenti in italiano solo per il "perché".

## Summary

La fase è per l'80% **stesura di contenuti** e per il 20% codice. Il codice è un clone disciplinato del CLI 10-26 (`src/migrations/run-mixed-refs.ts`) spostato in `src/content/`, più quattro moduli puri testabili: (1) loader YAML + validazione class-validator, (2) regole deterministiche (fascia, XP, HP, danni, premi, tempi, monete) lette da `content/config.yaml`, (3) mapper voce → documento con ordine canonico delle chiavi e ref convertiti in `ObjectId`, (4) diff/upsert per `_id` con `bulkWrite`. A questi si aggiungono `--export`, i fixes dichiarati, il prune perimetrato e un generatore offline delle quest fisse.

Tre scoperte cambiano il piano rispetto al CONTEXT. **(a)** Le query `lores`, `lore(id)` e `enemies` **non popolano `relatedLore`**: appena una lore ha un `relatedLore` non vuoto, `lores { relatedLore { id name } }` (selezionata dal FE) restituisce `data: null` (probe: `ID cannot represent value: { type: "Buffer" … }`). Popolare quei ref (comportamento, SDL invariato, come `QUEST_CATALOG_POPULATE`) è un prerequisito obbligatorio prima di caricare le lore incrociate. **(b)** Il probe su MongoDB 8.2.6 conferma che `modified: 0` è garantito solo se il documento inviato è **binariamente identico** a quello salvato: l'ordine delle chiavi nei sottodocumenti, il tipo numerico (double di mongosh vs int32 del driver), `undefined` (serializzato come `null`) e id stringa vs `ObjectId` producono tutti una modifica. La prima `--apply` dopo l'export normalizzerà quindi i tipi numerici (modifiche attese, una tantum); dalla seconda in poi `modified: 0`. **(c)** Cancellare una quest riferita da una `PendingQuest` occupata da un personaggio rompe la query `character` (`PendingQuest.quest: Quest!` popolato a `null`): il fix di cancellazione deve bloccarsi su quei casi.

Sul flag D-21: `PointOfInterest.quest` non è letto da nessun flusso (acceptance usa `cities.pointsOfInterest`, la board FE filtra per `markerLocation ∈ POI della città`, la mappa FE **nasconde** le quest sul marker della città). Più quest di servizio sullo stesso marker della città funzionano; il back-link va lasciato `null` (scriverlo farebbe anzi fallire `city(id) { pointsOfInterest { quest } }`, che popola un documento in un campo `ID`).

**Primary recommendation:** clonare 10-26 in `src/content/` con `yaml@2.9.1` (ISC, tipi inclusi, zero dipendenze, in `dependencies`), validare con class-validator (già presente, nessun zod), emettere documenti canonici (ordine dello schema, `ObjectId`, nessun `undefined`), calcolare il diff col confronto BSON byte-a-byte prima di scrivere, e anteporre ai piani di stesura un piano che rimuove `unlocked` e popola `relatedLore`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yaml` (eemeli) | 2.9.1 (pubblicato, `time.modified` 2026-09-11) | parse/stringify dei file di contenuto; API `Document`/`visit` per scrivere i commenti `# nome` accanto agli id | [VERIFIED: npm registry] licenza ISC, tipi in `dist/index.d.ts`, nessuna dipendenza; probe: commenti ignorati al parse, chiavi duplicate = errore («Map keys must be unique»), round-trip di 600 voci in 55 ms |
| `mongodb` | 6.19.0 (già installato) | driver nativo del CLI | [VERIFIED: npm ls] `bson` 6.10.4 deduplicato con mongoose 8.18.1 → `instanceof Types.ObjectId` funziona sugli `ObjectId` del driver |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 (già installati) | schema delle voci per collezione | [VERIFIED: package.json] già usati con `@ValidateNested` + `@Type` (`transaction-items.model.ts`), decoratore `IsObjectIdHex` riusabile (`src/validation/is-object-id-hex.decorator.ts`) |

### Supporting (codice esistente da riusare, non dipendenze)
| Modulo | Uso |
|--------|-----|
| `src/economy/coins.ts` (`fromCopper`, `toCopper`, `normalize`) | normalizzazione dei premi e dei prezzi (125 rame → 1 argento 25 rame); restituisce già l'ordine `{ gold, silver, copper }` |
| `src/mongo/document-id.ts` (`isObjectIdHex`, `objectIdFromHex`) | validazione degli id (solo esadecimale minuscolo a 24) e conversione |
| `src/mongo/mongo-errors.ts` (`describeError`) | errori di connessione senza URI |
| `src/quests/outcomes/chance-source.ts` (`ChanceSource`) | interfaccia del RNG; il generatore usa un'implementazione con seme |
| `src/quests/outcomes/rewards/cascading-loot.ts` (`RARITY_ORDER`) | ordine delle rarità per la tabella fascia → rarità |
| `src/quests/acceptance/quest-eligibility.ts` (`TITLE_RANK`) | ordinamento delle fasce |
| `src/models/enums/*` | unica fonte dei valori enum per i validatori (`Object.values(...)`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `yaml` | `js-yaml` 5.5.0 (MIT) | [VERIFIED: npm registry] già transitivo (4.1.0 via eslintrc) ma i tipi `@types/js-yaml` sono fermi alla 4.0.9 (major disallineata) e non ha API per scrivere commenti accanto ai nodi: l'export con `# nome` andrebbe fatto a mano. Scartato |
| class-validator | zod | nuova dipendenza, secondo stile di validazione nel repo; nessun vantaggio decisivo. Scartato (CONTEXT: preferire nessuna dipendenza nuova) |
| RNG con seme hand-rolled (mulberry32, ~8 righe) | `seedrandom` | dipendenza per 8 righe; il sorteggio gira solo nel generatore offline e l'esito è congelato nei file. Si scrive `SeededChanceSource extends ChanceSource` con test di determinismo |

**Installation (runtime: il CLI gira da `dist/` anche in produzione):**
```bash
npm install yaml@2.9.1
```
Verifica: `npm view yaml version` → `2.9.1`. Va in `dependencies`, non `devDependencies` (il runbook fa `npm ci && npm run build` ma un'installazione `--omit=dev` romperebbe il CLI).

## Architecture Patterns

### Recommended Project Structure
```
content/                         # radice del repo, NON compilato, NON in src/
├── config.yaml                  # costanti (vedi §config.yaml)
├── images.yaml                  # id → URL Cloudinary (vuoto finché l'utente non carica)
├── world/                       # SNAPSHOT di sola lettura (export): città e POI con tipi
│   └── cities.yaml              # input del generatore e dei controlli offline; mai scritto a DB
├── lore/ culti-*.yaml regni.yaml regioni.yaml storia.yaml figure.yaml materiali.yaml
│         creature-*.yaml animali.yaml piante.yaml citta-<regno>.yaml citta-esistenti.yaml
├── enemies/ mostri-*.yaml animali.yaml leggendari.yaml umani.yaml giganti-orchi.yaml esistenti.yaml
├── pets/ cavalcature.yaml
├── spells/ <useType>.yaml (export) + sciamanesimo.yaml vuoto.yaml
├── equipment/ <equipType>.yaml (export) + unici.yaml
├── loot/ <effect>.yaml (export) + cibo-regionale.yaml pozioni.yaml
├── quests/ <regno>.yaml dungeon.yaml       # GENERATI (intestazione «file generato»)
└── fixes/ poi-types.yaml kliever.yaml delete-test-quests.yaml lore-unlocked.yaml

src/content/
├── run-content.ts               # entrypoint CLI (clone di run-mixed-refs.ts)
├── run-generate-quests.ts       # entrypoint del generatore offline (nessun DB)
├── content-paths.ts             # risoluzione di content/ (default + --content-dir)
├── loading/                     # lettura albero, parse YAML con posizione, indice per id
├── schema/                      # classi class-validator per collezione (*.content.ts)
├── rules/                       # regole pure: tier, xp, hp, damages, prizes, coins, time
├── mapping/                     # voce → documento canonico (ObjectId, ordine chiavi)
├── sync/                        # diff BSON, bulkWrite, orfani, prune, report
├── fixes/                       # motore dei fixes dichiarati
├── export/                      # export DB → YAML con commenti
└── generation/                  # generatore deterministico delle quest fisse
test/content-fixtures/           # mini-albero content/ per int-spec e CLI int-spec
docs/runbooks/content-seeding.md
```

**Perché il generatore sta sotto `src/`:** `tsconfig.json` non ha `include` né `rootDir`, quindi `nest build` compila ogni `.ts` del repo tranne `node_modules`, `test`, `dist`, `*spec.ts` (`tsconfig.build.json`). Oggi l'unico `.ts` fuori da `src/`/`test/` non esiste e `rootDir` inferito è `src/` (`dist/main.js`, `dist/migrations/run-mixed-refs.js`). [VERIFIED: `ls dist`] Un `tools/generate.ts` alla radice sposterebbe il rootDir alla radice del repo → `dist/src/main.js` → `start:prod` e il CLI rotti. I file YAML non sono `.ts` e non toccano la build; nessuna esclusione serve per `content/`.

### Pattern 1: risoluzione di `content/` dal compilato
`src/content/run-content.ts` e `dist/content/run-content.js` sono **entrambi a due livelli dalla radice**, quindi `resolve(__dirname, '../../content')` vale per ts-jest e per il compilato. Default + override esplicito con flag (nessuna variabile d'ambiente nuova, per il drift test):
```ts
// src/content/content-paths.ts
export const DEFAULT_CONTENT_DIR = resolve(__dirname, '../../content');
export const contentDirOf = (flag: string | undefined): string =>
    flag ? resolve(flag) : DEFAULT_CONTENT_DIR;
```
`--content-dir <path>` serve alle int-spec (`test/content-fixtures/…`) e a chi lancia da un'altra cartella. [VERIFIED: struttura `dist/migrations/` e `src/migrations/run-mixed-refs.cli.int-spec.ts:8-11`]

### Pattern 2: CLI (clone di 10-26)
- `runCli(argv, env, out)` esportata e testabile; `if (require.main === module)` passa `process.env` **come oggetto** (mai `process.env.X`). [VERIFIED: `run-mixed-refs.ts:46-78`, `env-example.drift.spec.ts:67-79`]
- Modalità mutuamente esclusive: `--dry-run`, `--apply`, `--verify`, `--export <dir>`, `--prune <collezione>`, `--new-id <N>`, più **`--check`** (aggiunta dalla ricerca: validazione offline dei file, gate dei piani di stesura); opzione `--content-dir <path>` combinabile. `--new-id` e `--check` non richiedono `MONGO_URI` né connessione (`--new-id` stampa N righe `- '<hex>'` pronte per lo YAML).
- `--export` rifiuta una cartella non vuota (exit 2) per non sovrascrivere file già curati.
- Codici: `CONTENT_EXIT = { ok: 0, drift: 1, usage: 2, failure: 3 }`. `1` = `--verify` con differenze/errori/fix pendenti/fix bloccati, **oppure** `--apply`/`--dry-run` fermati da errori di validazione (nessuna scrittura); `2` = argomenti/env mancanti o cartella d'export non vuota; `3` = connessione o errore Mongo (`describeError`).
- Ordine di scrittura (D-27): lore → cities.relatedLore → spells → equipmentitems/lootitems → enemies (copia le magie) → pets → quests → fixes → images. Tutta la validazione (file + ref verso DB) avviene **prima** della prima scrittura.

### Pattern 3: upsert idempotente con diff BSON (probe verificato)
Probe su MongoDB 8.2.6 (stessa infrastruttura `mongodb-memory-server` delle int-spec), `bulkWrite([{ updateOne: { filter: { _id }, update: { $set }, upsert: true } }])`:

| Caso | `modifiedCount` |
|------|-----------------|
| Stessi valori, stesso ordine, tipi identici | 0 |
| Stored `Double(100)` (mongosh) ← inviato `100` (int32 del driver) | **1**, poi 0 |
| Ordine delle chiavi di un sottodocumento diverso (`{copper,silver,gold}` vs `{gold,silver,copper}`) | **1**, poi 0 |
| Ordine di un array diverso | 1 |
| Campo `undefined` nel `$set` (serializzato `null`) | **1** |
| Stored `ObjectId` ← inviata la stringa esadecimale | **1** (e lascia un ref stringa: residuo per `MixedRefsVerifier`) |
| `replaceOne` con documento identico | 0 |
| `$set` di `null` su `null` | 0 |

[VERIFIED: probe in scratchpad, output riportato]

Regole che ne derivano:
1. **Ordine canonico** = ordine dei `@Prop` dello schema per ogni (sotto)documento; il mapper costruisce oggetti letterali in quell'ordine, mai `{ ...entry }`.
2. **Mai `undefined`**: campo assente nel file → valore di default dello schema esplicito (`null`, `[]`) oppure campo omesso dal `$set`. Test unit: nessun valore `undefined` in profondità.
3. **Tutti i ref come `ObjectId`** (`new ObjectId(hex)`), compreso `_id` nel filtro; `_id` non entra nel `$set`.
4. **Numeri**: interi JS → int32 (o double oltre 2^31). La prima `--apply` dopo l'export normalizza i double di mongosh: atteso e documentato nel runbook («prima apply: modified = n per normalizzazione dei tipi; seconda: 0»).
5. **Il diff si calcola prima**: per ogni campo del `$set`, `Buffer.compare(BSON.serialize({ v: stored[f] }), BSON.serialize({ v: next[f] }))` (`BSON` esportato da `mongodb`) — stessa semantica binaria del server, quindi `--dry-run`/`--verify` prevedono esattamente `inserted/modified/unchanged`. `--apply` scrive solo i documenti diversi (meno carico, report coerente col probe).
6. **Campi runtime mai nel `$set`** delle quest: `registeredAdventurers`, `concludedAt`, `startedAt`, `rescue`. Si usa `$setOnInsert: { registeredAdventurers: [], concludedAt: null, startedAt: null }` e `$set` di `infos`, `requirements`, `prizes` interi.
7. **Città**: solo `$set: { relatedLore }` (e `name` nel fix Kliever); mai `area`, `pointsOfInterest`, `markerLocation`.
8. Campi legacy esportati non a schema (`sellable` sugli oggetti) sono dichiarati nello schema del file come opzionali e riscritti identici; `__v` e `unlocked` non si esportano (`$set` non li rimuove; `unlocked` si rimuove col fix `lore-unlocked`).

### Pattern 4: validazione (D-28) con class-validator
`plainToInstance(EntryClass, raw)` + `validateSync(entry, { whitelist: true, forbidNonWhitelisted: true })` → chiavi sconosciute = errore (refusi nei file). Ogni errore porta `{ file, line, entryId, path, message }` (la riga si ricava dal nodo `yaml` con `LineCounter`). Campi e vincoli per collezione, presi da modelli e `src/schema.gql`:

| Collezione | Non-null SDL / required | Vincoli da imporre |
|-----------|--------------------------|--------------------|
| **Lore** | `name`, `description`, `type`, `relatedLore` (`[Lore!]!`), `id` | `type ∈ LoreType`; `image` stringa URL o `null`; `relatedLore` id esistenti nei file lore; `city` (solo file, solo `type: city`) id di città nello snapshot; **niente `unlocked`** |
| **Enemy** | `name`, `locations [PoiType!]!`, `energyWeaknesses [String!]!`, `baseWeaknesses [String!]!`, `relatedLore`, `xp: Int!`, `spells [Spell!]!`, `lifePoints: Int!`, `imagePath: String!`, `damages: Damages!` | interi ≥ 1 per `xp`/`lifePoints` (Int a 32 bit, ≤ 2 147 483 647); `locations ⊆ PoiType`, non vuoto; debolezze negli enum (`DamageType`, `EnergyType` senza `enhancing`); `spells` id di magie nei file; `imagePath` non vuoto |
| **Pet** | tutti non-null tranne `speedModifier` (`damages`, `buyPrice`, `sellPrice`, `xp`, `maxXp`, `currentLifePoints`, `maxLifePoints`, `imagePath`, `name`) | Coins interi ≥ 0; `currentLifePoints ≤ maxLifePoints`; `speedModifier` numero > 0 o `null` |
| **Spell** | tutti non-null: `name`, `description`, `useType`, `energyDamage {type,power}`, `requiredLearnTime`, `minXpToLearn`, `recoveryTime`, `maxUsages` | `useType ∈ UseType`; `energyDamage.type ∈ EnergyType`; interi ≥ 0; `maxUsages ≥ 1`; `minXpToLearn` 0..50 000 |
| **EquipmentItem** | `equipType: String!`, `damages: Damages!`, `itemType: String!`, `description: String!` | `itemType === 'EquipmentItem'`; `rarity ∈ RarityType`; `addedSpell` id o `null`; `damages.base/energy` **array** (l'export normalizza l'unico documento con `base` oggetto, Phase 9 research) |
| **LootItem** | `power: Int!`, `effect: String!`, `itemType`, `description` | `itemType === 'LootItem'`; `effect ∈ EffectType`; `power` intero ≥ 0 |
| **Quest** | `infos.title`, `infos.type`, `infos.markerLocation` (required), `infos.relatedLore`, `requirements.minTitle`, `requirements.requiredAdventurers` (`count ≥ 1`), `prizes.randomLoot` | `type ∈` tipi fissi; `markerLocation` POI dello snapshot appartenente alla città della voce; `enemy` id nemico (obbligatorio per hunt/dungeon, `null` altrove); hunt → nemico con lore `animal` e PE ≤ 200; `AssetQuantity.itemType ∈ {EquipmentItem, LootItem}` coerente con la collezione dell'id; `quantity ≥ 1`; `prizes.spell` solo su study a Valantar; `timeToComplete` intero ms |

Prosa: errore se una stringa termina con `\n` (lo scalare `|` aggiunge il newline finale; nei file si usa `|-`, che l'exporter già emette). [VERIFIED: probe `yaml`]

Controlli trasversali di `--verify`: id duplicati fra **tutti** i file della stessa collezione; id non esadecimali o non stringa (YAML legge `123e4567…` come numero: probe → `null`/Infinity; l'exporter e `--new-id` emettono sempre id fra apici); ref pendenti; warning per nomi doppi nello stesso `(collezione, type)`; enum fuori valori su `pointsofinterest.type`, `cities.type`, `quests.infos.type` letti dal DB.

### Pattern 5: voce nemico con blocco `source` (valori derivati al caricamento)
Per rendere vive le costanti `ENEMY_*_SCALE` di D-11/D-12 i file portano i dati della fonte e il mapper deriva i campi; un valore esplicito nel file vince (ritocco a mano).
```yaml
- id: '6a1f0c2e9b3d4e5f6a7b8c90'
  name: Lupo
  source:                 # solo file: da bestiary-stats.md (PF medi, PE, danno medio per round)
    level: 1              # dal documento («1 - AVVENTURIERO (50)») o dalla colonna Medio
    pe: 50
    pf: 11
    damagePerRound: { pierce: 7 }
  locations: [forest, hills, farNorth]
  baseWeaknesses: []
  energyWeaknesses: []
  relatedLore:
    - '6a1f0c2e9b3d4e5f6a7b8c91' # Lupo
  spells: []
  imagePath: assets/images/lupo.png
  # override facoltativi: xp, lifePoints, damages
```
Derivazioni: `xp = max(1, round(pe × ENEMY_XP_SCALE))` con `ENEMY_XP_SCALE = 50000/355000`; `lifePoints = round(pf × ENEMY_HP_SCALE)` (100); `damages.base/energy` = `round(media × ENEMY_DAMAGE_SCALE)` per tipo, base in ordine `blunt, cut, pierce`, energy nell'ordine di `EnergyType`; `spells` = copia integrale delle magie del catalogo con `_id` = id della magia (ordine dei campi di `SpellSchema`). `tier` derivato da `source.level` (o `legendary: true` → `legend`), mai scritto a DB. Voce esistente (Arbusto Maligno) esportata con i valori espliciti e senza `source`.

### Pattern 6: generatore delle quest fisse (offline, deterministico)
`src/content/generation/fixed-quests.generator.ts` = funzione pura `(world, enemies, lore, loot, equipment, spells, config, seed, existingIds) → QuestEntry[]`; `run-generate-quests.ts` legge `content/`, scrive `content/quests/*.yaml` col modulo di export (commenti `# nome`). Nessun accesso al DB. Regole:
- **Chiave stabile** di una quest fissa = `(type, markerLocation[, spell])`; gli id esistenti nei file vengono riusati per chiave, le chiavi nuove ricevono `new ObjectId()`. Rigenerare non crea orfani.
- **Seme** in `config.yaml` (`generator.seed`); `SeededChanceSource extends ChanceSource` (mulberry32); input ordinati per id prima dei sorteggi → stesso input + stesso seme = byte identici (test).
- **Per città** (escluse Necrorian): `heal` + `job` sul `markerLocation`; `guard` se `CityType` termina in `City`/`SeaCity`/`Capital` (più `ferrionCity`); `crime` in ogni capitale e con probabilità `generator.crimeCityChance` nelle città (mai `ferrionCity`); `study` senza magia nelle capitali, a Liberia (Collegio Millhelm) e con `generator.studyCityChance` nelle città; a **Valantar** una `study` per ogni magia del catalogo (chiave con `spell`, `minTitle` dalla fascia di `minXpToLearn` via `levelRowFor`); `hunt` se esiste un animale con PE ≤ 200 i cui `locations` intersecano i tipi dei POI non-marker della città, al massimo metà delle città del gruppo regionale (gruppo = prefisso del `CityType`; i tipi speciali `desert/tropical/north/forest/mountain/aarakocra` formano gruppi propri), marker = quel POI.
- **Dungeon**: un POI di tipo `dungeon` → una quest; fascia dal suffisso del `CityType` della città del POI (Village → adventurer, City/SeaCity → paladin, Capital → mage) o `hero` se il POI ha `glounet`/`harkenIsland` o la città è `necrorianCity`; nemico = mostro (lore `enemy`, non animale, non leggendario) della fascia con `locations` ∩ tipi del POI (escluso `dungeon`) non vuoto; fallback documentato: stessa fascia con `all`, poi fascia inferiore; `randomLoot` = un equipaggiamento della rarità della fascia (sorteggio con seme, mai un oggetto `sellable: false` ambiguo: qualsiasi item della rarità); `recommendedLoot` = fino a 2 equipaggiamenti che colpiscono `baseWeaknesses`/`energyWeaknesses` + 1 consumabile `heal`.
- **Un solo quest fisso per POI non-marker** (la mappa FE impilerebbe i marker: la hunt non usa POI dungeon né POI già scelti).
- **Premi e tempi non scritti dal generatore**: la voce porta `tier`; il mapper calcola `prizeCoins`, `xpPrize`, `timeToComplete` da `config.yaml` al caricamento, così l'utente ritocca la tabella e ricarica (D-19). Override espliciti ammessi.
- `infos.title` in italiano col nome della città; **`Quest` non ha un campo descrizione** (`QuestInfos`: `timeToComplete, title, enemy, type, markerLocation, relatedLore`) e D-01 vieta campi nuovi: la «descrizione» di D-22 non si persiste (al massimo commento YAML). [VERIFIED: `quest-infos.model.ts`]

### Pattern 7: lore di città e `City.relatedLore`
La voce `lore` di tipo `city` porta il campo file-only `city: '<id>' # Nome`; il mapper genera l'update `cities.updateOne({ _id }, { $set: { relatedLore: <loreId> } })`. `--verify` segnala città senza lore e città con due lore. L'export ricava `city:` dalle città il cui `relatedLore` punta a una delle 12 lore esistenti.

### Anti-Patterns to Avoid
- **`{ ...entry }` nel mapper:** l'ordine delle chiavi segue lo YAML → `modified` spurii (probe).
- **Ref come stringhe:** creano residui `Mixed` letti dal `MixedRefsVerifier` al boot («Ref stringa ancora da migrare») e `modified` a ogni corsa.
- **`replaceOne` sulle quest/città:** cancellerebbe `registeredAdventurers`, `concludedAt`, `area`, `pointsOfInterest`.
- **Scrivere `PointOfInterest.quest`:** nessun lettore; `CitiesService.findOne` lo popola in un campo `ID` e la serializzazione fallirebbe.
- **Script/generatori `.ts` alla radice del repo:** spostano il rootDir della build (vedi sopra).
- **`process.env.MONGO_URI` nel CLI:** fa fallire `env-example.drift.spec.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing YAML, commenti, posizione degli errori | parser/serializzatore a mano | `yaml` (`parseDocument`, `LineCounter`, `visit`, `Document#toString({ lineWidth: 0 })`) | chiavi duplicate, block scalar, quoting automatico delle stringhe numeriche |
| Conversione monete | divisioni sparse | `src/economy/coins.ts` (`fromCopper`/`normalize`) | stessa regola del negozio e del FE |
| Validazione schema | `if` per campo | class-validator + `@ValidateNested`/`@Type` | stile già in uso, messaggi per percorso |
| Confronto "uguale a DB" | deep-equal JS | `BSON.serialize` + `Buffer.compare` | il server confronta per tipo e ordine; un deep-equal JS darebbe falsi "unchanged" |
| Id | regex locale | `isObjectIdHex` / `objectIdFromHex` | stessa forma canonica del resto del BE |
| Errori Mongo nel report | `error.message` | `describeError` | mai URI/host |

**Key insight:** l'unico rischio vero del seeder è il falso "modificato"/"invariato": il confronto deve imitare il server, non JavaScript.

## Runtime State Inventory

Fase di popolamento con correzioni e una rimozione di campo: inventario dello stato fuori dal codice.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `quests` 16 di prova (3 aid clonate) riferite da: `pendingquests.quest` (2 documenti), `questresults.quest.id` (24, fotografia: restano), `characters.quests.completedQuests` (populate filtra i mancanti: innocuo), `characters.status.awaitingAid.{quest,aidQuest}`, `quests.rescue.failedQuest`, `pointsofinterest.quest`, `admin_audit_logs.target`/`args` (storia, stringhe). `lore.unlocked` sui 12 documenti. 6 POI con tipo sporco; città `690961bf…` da rinominare | fix `delete-test-quests` (vedi §Fixes) + `lore-unlocked` (`$unset`) + `poi-types` + `kliever`: **migrazione dati** via fixes, idempotente |
| Live service config | Nessuna configurazione esterna contiene id/nomi del catalogo. Cloudinary: le 12 URL `Lore.image` esistono già e vengono esportate | nessuna; `images.yaml` compilato dall'utente in seguito |
| OS-registered state | Job Bull in Redis della risoluzione quest con `pendingQuestId` (`quest-resolution-job.ts`): una `PendingQuest` cancellata rende il job un no-op | nessuna se il fix non cancella `PendingQuest` occupate (regola di blocco) |
| Secrets/env vars | Nessuna chiave nuova: `MONGO_URI`, `DB_NAME` già in `.env.example` | nessuna (verificato col drift test) |
| Build artifacts | `dist/` va ricompilato (`npm run build`) prima del CLI e dell'int-spec del CLI; `src/schema.gql` va rigenerato dal real boot e committato (CI: `git diff --exit-code src/schema.gql`) | build + commit di `schema.gql` col solo `-  unlocked: Boolean!` |

## Common Pitfalls

### Pitfall 1: `lores`/`lore`/`enemies` restituiscono `data: null` con `relatedLore` popolati
**What goes wrong:** `LoreService.findAll/findOne` e `EnemiesService` fanno `find()` senza populate; i `relatedLore` arrivano come `ObjectId` in un campo `[Lore!]!` e la serializzazione di `id` fallisce.
**Evidence:** probe graphql-js → `{"errors":[{"message":"ID cannot represent value: { type: \"Buffer\", data: [Array] }","path":["lores",0,"relatedLore",0,"id"]}],"data":null}`. Il FE seleziona `relatedLore { id name }` in `lore_queries.dart` e le usa in `library_cubit.dart` e `world_map_cubit.dart`. [VERIFIED]
**How to avoid:** piano dedicato prima dei contenuti: `.populate({ path: 'relatedLore', model: Lore.name })` in `LoreService` (lista e singola) e in `EnemiesService` (+ filtro dei `null` come `dropOrphanCatalogRefs`), test int con lore collegate. SDL invariato. Deploy di questo codice **prima** di caricare i contenuti in produzione.

### Pitfall 2: cancellare una quest occupata rompe `character`
**What goes wrong:** `CHARACTER_QUESTS_POPULATE` popola `PendingQuest.quest` (`Quest!`); se la quest non esiste più il campo è `null` e la query `character`/`characterUpdated` fallisce.
**How to avoid:** il fix di cancellazione, per ogni id: (1) se una `PendingQuest` che la riferisce è referenziata da `quests.pendingQuest`/`activeStoryQuest`/`activeWorldMissionQuest` di un personaggio, o se un personaggio ha `status.awaitingAid.quest|aidQuest` su quell'id → **bloccato**, riportato con `{ questId, pendingQuest, character, lane }`, nessuna scrittura per quell'id, exit 1 su `--verify`; (2) altrimenti cancella la quest, cancella le `PendingQuest` non occupate che la riferiscono (spazzatura, non storia), `$set: { quest: null }` sui `pointsofinterest` con `quest` = id, riporta i `questresults` che la citano (non toccati) e le aid non in lista con `rescue.failedQuest` = id. Idempotente: seconda corsa = tutto già assente → `status: done`. Sul dev l'esecutore risolve i blocchi con gli strumenti del GM o abbandonando la corsia prima della `--apply` (i 2 `pendingquests` vanno ispezionati nel piano di apply sul dev, solo conteggi/id).

### Pitfall 3: la prima `--apply` dopo l'export "modifica" tutto
**Why:** i documenti scritti con mongosh hanno numeri double e chiavi in ordine libero; il driver invia int32 nell'ordine canonico. **How to avoid:** è atteso; il runbook e il report lo dicono; il gate è la **seconda** `--apply` con `modified: 0` e `--verify` a zero differenze.

### Pitfall 4: `timeToComplete` è in millisecondi
`waitingTimeOf` copia `infos.timeToComplete` in `PendingQuest.waitingTime`, sommato a `startDate` in ms (`quest-resolution-job.ts:106`, Phase 7 D-16). Il config esprime **ore**; il mapper moltiplica per 3 600 000 (8 h = 28 800 000 < Int32 max). [VERIFIED]

### Pitfall 5: tipi POI sporchi rompono `pointOfInterests`
`type: [PoiType!]!` è un enum GraphQL: un valore come `belleholmIsand` fa fallire la serializzazione della lista. Il fix `poi-types` va applicato insieme ai contenuti; `--verify` conta i valori fuori enum (incluso `"vulcano "` con lo spazio).

### Pitfall 6: id YAML letti come numeri
Un id tutto cifre o cifre + una `e` (`123e4567…`) è un numero in YAML 1.2 (probe: diventa Infinity → `null`). Exporter e `--new-id` scrivono sempre `'…'`; il validatore richiede `typeof id === 'string'`.

### Pitfall 7: produzione con id diversi dal dev
I file nascono dall'export del dev. Se la produzione non condivide gli `_id` di catalogo, città e POI, l'upsert inserirebbe duplicati e le quest punterebbero a marker inesistenti. [ASSUMED: dev e produzione condividono gli id perché il dev è stato popolato dalla stessa base] **How to avoid:** `--verify` su una copia ripristinata della produzione è il preflight obbligatorio del runbook: errori bloccanti per marker/città mancanti e warning `probableIdDivergence` quando un documento non presente nei file ha lo stesso `(name, type)` di una voce dei file. Se compaiono, fermarsi e chiedere.

### Pitfall 8: `Enemy.spells` è embedded
Le magie si copiano intere (`[SpellSchema]`, `_id` = id della magia). Cambiare una magia nel suo file aggiorna, alla corsa successiva, le copie nei nemici (il diff lo vede): voluto, documentarlo.

### Pitfall 9: refPath delle `AssetQuantity`
`assetQuantitySchemaAt` risolve `item` con `itemType` assoluto: ogni `recommendedLoot`/`randomLoot`/`prizeItem` deve scrivere `itemType` (`'EquipmentItem'|'LootItem'`) prima di `item`, coerente con la collezione dell'id; altrimenti `dropOrphanCatalogRefs` scarta la voce in silenzio. Il validatore lo impone. [VERIFIED: `asset-quantity.model.ts`, `quest-catalog.populate.ts`]

### Pitfall 10: `PointOfInterest.location` è `[lng, lat]`
Lo snapshot `world/cities.yaml` riporta `location` così com'è; il generatore non calcola distanze (sceglie POI per tipo), quindi nessuna conversione. Le strade non sono in GraphQL e non si toccano.

## Code Examples

### Upsert canonico e diff
```ts
// src/content/sync/bson-diff.ts — stessa uguaglianza del server (probe 2026-11-01)
import { BSON } from 'mongodb';
export const sameBson = (a: unknown, b: unknown): boolean =>
    Buffer.compare(BSON.serialize({ v: a }), BSON.serialize({ v: b })) === 0;

export function changedFields(stored: Document | null, next: Document): string[] {
    if (!stored) return Object.keys(next);
    return Object.keys(next).filter((field) => !sameBson(stored[field], next[field]));
}

// src/content/sync/upsert-ops.ts
export const upsertOp = (id: ObjectId, set: Document, onInsert: Document = {}) => ({
    updateOne: {
        filter: { _id: id },
        update: { $set: set, ...(Object.keys(onInsert).length ? { $setOnInsert: onInsert } : {}) },
        upsert: true,
    },
});
```

### Export con commento `# nome` accanto agli id
```ts
// probe yaml@2.9.1: visit + node.comment; stringify quota le stringhe numeriche
const doc = new Document(entries);
visit(doc, {
    Scalar(_, node) {
        const name = typeof node.value === 'string' ? namesById.get(node.value) : undefined;
        if (name) node.comment = ` ${name}`;
    },
});
writeFileSync(path, doc.toString({ lineWidth: 0, blockQuote: 'literal', singleQuote: true }));
```
(Escludere il campo `id` della voce stessa dal commento; i nomi provengono dall'indice di tutte le collezioni esportate.)

### Real boot: dichiarazione della modifica non additiva
```ts
// test/app.int-spec.ts — stesso stile dei blocchi verbatim della 9.2/10
it('writes the lore without the global unlocked flag (11 D-25)', () => {
    const schema = readFileSync(SCHEMA_FILE, 'utf8');
    expect(schema.match(/type Lore \{[^}]*\}/)?.[0]).toBe(
        'type Lore {\n  description: String!\n  id: ID!\n  image: String\n  name: String!\n  relatedLore: [Lore!]!\n  type: String!\n}',
    );
});
```
Gate del piano: `git diff origin/develop -- src/schema.gql` con **una sola** riga `-` (`  unlocked: Boolean!`) e zero `+`. [VERIFIED: pattern in `test/app.int-spec.ts:418-445`, 09.2-01/10-01 PLAN]

## Regole deterministiche e `content/config.yaml`

```yaml
# content/config.yaml — costanti ritoccabili dall'utente; ogni cambio si applica con --apply
enemy:
  xpScale: 0.14084507        # 50000 / 355000 (D-11); xp = max(1, round(PE × xpScale))
  hpScale: 100               # lifePoints = PF × hpScale (D-12)
  damageScale: 100           # danno medio per round × damageScale (D-12)
tiers:                       # D-10: livello del documento → fascia (limite inferiore degli intervalli)
  rookie: [1, 2]
  adventurer: [3, 4]
  paladin: [5, 10]
  mage: [11, 16]
  hero: [17, 20]
mediumPeByLevel: [50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500, 2800, 3200, 3900, 4200, 4900, 5700]
#   livello di una voce senza livello = massimo L con mediumPeByLevel[L] ≤ PE (min 1)
tierMultiplier: { rookie: 1, adventurer: 2, paladin: 5, mage: 12, hero: 25 }   # D-19
prizes:                      # base in rame e XP, × moltiplicatore della fascia (minTitle)
  job:     { copper: 40,  xp: 0 }
  hunt:    { copper: 100, xp: 30 }      # + Enemy.xp alla risoluzione (outcome-plan.ts:293)
  guard:   { copper: 200, xp: 40 }
  crime:   { copper: 300, xp: 40 }
  study:   { copper: 0,   xp: 60 }
  heal:    { copper: 0,   xp: 0 }
  dungeon: { copper: 400, xp: 80, randomLootQuantity: 1 }
dungeonLootRarity: { rookie: common, adventurer: uncommon, paladin: rare, mage: ultrarare, hero: legendary }
timeToCompleteHours: { job: 2, hunt: 1, guard: 8, crime: 1, study: 2, heal: 5, dungeon: 3 }   # D-21, il mapper × 3 600 000
minTitle:                    # D-20
  serviceCity: adventurer    # guard/crime/study in città
  serviceCapital: paladin
dungeonTierByCitySize: { Village: adventurer, City: paladin, SeaCity: paladin, Capital: mage }
dungeonHeroZones: [glounet, harkenIsland]   # + necrorianCity
hunt: { maxAnimalPe: 200, maxShareOfRegion: 0.5 }
generator: { seed: 11, crimeCityChance: 0.5, studyCityChance: 0.4 }
food: { minutesPerPower: 3 }  # Phase 14, controllo dei power del cibo
```
Esempi di controllo (test unit): Lupo PE 50 → xp 7; Troll 1 800 → 254; Beholder 10 000 → 1 408; Tarrasque 155 000 → 21 831; Bandito 25 → livello 1 rookie; Capo dei Banditi 450 → livello 4 adventurer; Veterano 700 → 6 paladin; Gladiatore 1 800 → 11 mage; Assassino 3 900 → 17 hero; guard in capitale = 200 × 5 = 1 000 rame → `{ gold: 0, silver: 10, copper: 0 }`.

**Danno medio per round (regola fissa per le voci):** multiattacco se presente (somma degli attacchi elencati), altrimenti l'attacco singolo migliore; esclusi abilità a ricarica, azioni leggendarie e incantesimi; tipi mappati come in `bestiary-stats.md`. Habitat (D-13): tabella in `src/content/rules/habitat.ts` solo come aiuto di stesura documentato nel piano (le voci scrivono `locations` espliciti; il validatore controlla l'enum).

**Regola per le 32 voci `NON TROVATO` di `bestiary-stats.md`:** statistiche dell'analogo indicato (`- analogo:`) **scalate** al PE/livello del documento: `pf = pf_analogo × (PE_doc / PE_analogo)^0.5` arrotondato, danno per round scalato con lo stesso fattore, debolezze dall'analogo + deduzioni di D-12; `xp` sempre dal PE del documento (D-11), fascia dal livello del documento (D-10). La radice evita che un analogo molto più debole/forte esploda gli HP; il fattore va scritto nel commento della voce. [ASSUMED: esponente 0,5 scelto per Claude's Discretion; è un parametro ritoccabile]

## Flag D-12: potenza del party vs `lifePoints`

Formula (`placeholder-combat-resolver.ts`): `partyPower = Σ partecipanti (Σ power dei damages degli equipaggiamenti indossati + Σ energyDamage.power delle magie attive con usi) × damageFactor ferite`; `winChance = partyPower / (partyPower + enemy.lifePoints)`; HP persi = Σ danni del nemico × 0,5 (vittoria) o × 1 (sconfitta) / n partecipanti. [VERIFIED]

Dati del catalogo noti (aggregati letti dalla Phase 9 il 2026-10-24, `09-RESEARCH.md:343-346`): somma dei `power` per equipaggiamento **min 50, mediana 1 800, max 18 500**; un documento con `damages.base` oggetto; magie: `minXpToLearn` 4 000–50 000, `maxUsages` 1–5; **potenza delle magie non misurata**. [CITED: 09-RESEARCH.md]

Stime con D-12 (PF × 100):
| Scontro | lifePoints | Party ipotetico | winChance |
|---------|-----------:|-----------------|----------:|
| Lupo (PF 11) | 1 100 | rookie, 1 arma da 500 | 31 % |
| Lupo | 1 100 | rookie, 1 arma mediana (1 800) | 62 % |
| Troll (PF 84) | 8 400 | paladin, 3 pezzi mediani (5 400) | 39 % |
| Drago rosso adulto (PF 256) | 25 600 | hero, 9 slot mediani (16 200) | 39 % |
| Tarrasque (PF 676) | 67 600 | 5 legend da 16 200 (81 000) | 55 % |

Conclusione per l'handoff: la scala ×100 è **coerente in ordine di grandezza** col catalogo (mediane da 1 800 per pezzo); gli scontri rookie dipendono molto dall'arma iniziale. [ASSUMED: distribuzione per rarità/slot non nota] **Azione nel piano di export:** dopo l'export sul dev, un task calcola dai soli file YAML (offline) min/mediana/max della somma dei `power` per rarità e per `equipType` e la distribuzione di `energyDamage.power` delle 77 magie, e li scrive in `BACKEND-NOTES.md` con la tabella sopra ricalcolata. Il resolver non si tocca.

## Flag D-21: `PointOfInterest.quest` e più quest sullo stesso marker

| Lettore | Comportamento | Fonte |
|---------|---------------|-------|
| `CitiesService.findOne` | `populate({ path: 'pointsOfInterest', populate: { path: 'quest' } })` ma il campo SDL è `quest: ID` → un back-link valorizzato e selezionato farebbe fallire la serializzazione | `src/cities/cities.service.ts:20-27`, `schema.gql:448-454` |
| Acceptance | controlla solo che **una città** abbia il marker fra i `pointsOfInterest` e il personaggio sul marker o su un POI della città; nessun limite di quest per marker | `quest-acceptance.service.ts:322-339` |
| Board FE | `boardQuestsFor`: quest il cui `markerLocation.id ∈ cityPointIds` (POI della città, marker incluso) | FE `lib/models/quest/board_policy.dart` |
| Mappa FE | `QuestMarkersLayer` **esclude** le quest il cui marker coincide col marker di una città; le altre hanno un marker sul POI | FE `quest_markers_layer.dart` |
| FE `PointOfInterest.quest` | modellato ma mai selezionato (`getCity` chiede solo `pointsOfInterest { id }`) | FE `city_queries.dart` |
| Il marker della città è fra i suoi POI | sì (inventario: «city marker included») | db_facts |

**Raccomandazione (RESOLVED):** quest di servizio (heal, job, study, crime, guard) sul `markerLocation` della città, tutte insieme: funzionano in acceptance e in board e restano fuori dalla mappa (immersiva, niente pile di marker). `hunt`/`dungeon` su POI distinti, **una quest fissa per POI non-marker**. `PointOfInterest.quest` resta **`null`** per ogni quest di contenuto; il fix delle quest di prova lo azzera dove punta a un id cancellato. Nessun fallback su POI distinti necessario. Le quest di contenuto non emettono `questUpdated` all'inserimento (il publisher ascolta solo `update`/`replace`, `quests.publisher.ts:19`): il FE le vede al prossimo caricamento della board (da dire nell'handoff).

## Fixes: formato e semantica

```yaml
# content/fixes/poi-types.yaml
- key: poi-type-690e4186108dbf02380d4c81
  kind: setPoiTypes
  target: '690e4186108dbf02380d4c81'
  type: [belleholmIsland, forest]     # array finale, già deduplicato e nell'enum
# content/fixes/kliever.yaml
- key: rename-flinas-north
  kind: renameCity
  target: '690961bf952cc57d174677d7'
  from: Flinas
  to: Kliever
# content/fixes/delete-test-quests.yaml   (precompilato dall'export, rivisto a mano)
- key: delete-talmvere-test-quests
  kind: deleteQuests
  ids:
    - '…' # [job] Titolo di prova
# content/fixes/lore-unlocked.yaml
- key: lore-unset-unlocked
  kind: unsetLoreUnlocked
```
- `kind` chiuso (4 valori), nessun "set generico" su collezioni arbitrarie (superficie minima).
- Stato per fix nel report: `pending` (dry-run/verify: c'è qualcosa da fare), `applied` (scritto ora), `done` (niente da fare), `blocked` (vedi Pitfall 2). `renameCity` scrive solo se `name === from` (altrimenti `blocked` con il nome trovato); `setPoiTypes` scrive solo se l'array differisce (diff BSON).
- `--verify` esce 1 se un fix è `pending` o `blocked`.

## Orfani e prune

- Orfano = documento della collezione gestita il cui `_id` non è in nessun file. Collezioni: `lore`, `enemies`, `pets`, `spells`, `equipmentitems`, `lootitems`, `quests` (solo `infos.type ∈ {hunt, dungeon, heal, job, study, crime, guard}` e `concludedAt: null`, D-05).
- `--dry-run`/`--verify` li elencano (id + nome), **non** fanno uscire con 1 (sono warning); `--apply` non cancella mai.
- `--prune <collezione>`: valida i file, ricalcola gli orfani di **quella** collezione col perimetro, li cancella e riporta gli id; per `quests` applica le stesse guardie del fix (blocca quelle occupate). Collezione fuori elenco → exit 2.

## Export (D-04)

`--export <dir>`: legge le 6 collezioni (`lore`, `enemies`, `pets`, `spells`, `equipmentitems`, `lootitems`) più lo snapshot `cities` + `pointsofinterest` (sola lettura), ordina per `_id`, mappa ogni documento nella forma canonica della voce (stesso mapper al contrario: test round-trip `export → load → map` = documento) e scrive:
- `equipment/<equipType>.yaml` (9 file, ~16 voci l'uno), `loot/<effect>.yaml` (5 file), `spells/<useType>.yaml` (≤ 8 file), `pets/cavalcature.yaml`, `enemies/esistenti.yaml`, `lore/citta-esistenti.yaml` (con `city:` ricavato da `cities.relatedLore`);
- `world/cities.yaml`: per città `{ id, name, type, markerLocation, relatedLore, pointsOfInterest: [{ id, type, location }] }` ordinato per `CityType` e nome (input del generatore e dei controlli offline; `--verify` ne segnala la deriva rispetto al DB come warning);
- `fixes/delete-test-quests.yaml` precompilato con **tutti** gli id di `quests` presenti (oggi solo le 16 di prova) e titolo/tipo in commento.
Campi: tutti quelli presenti nel documento tranne `_id` (→ `id`), `__v`, `unlocked`; `damages.base`/`energy` oggetto → array di un elemento (riportato nel report dell'export come normalizzazione). Le chiavi mancanti nei documenti legacy diventano il default dello schema esplicito. Commenti `# nome` su ogni id di riferimento.

## Piano di stesura (bounded scope per esecutore)

Sorgente: `.planning/phases/11-popolamento-del-mondo/source/world-building.md` (sezioni verificate con `grep -n '^###'`) e `source/bestiary-stats.md` (153 schede: 121 trovate con gs/PE, pf, ca, attacchi per tipo già mappati, vulnerabilità/resistenze/immunità; **32 `NON TROVATO` con riga `- analogo:`**; PE senza separatore delle migliaia; le armi a distanza possono avere il tipo di danno sbagliato e vanno corrette a mano). [VERIFIED: intestazione del file, commit 7bc8d5c]

| Sezione | Righe | Contenuto |
|---------|-------|-----------|
| Legenda difficoltà + tabella PE | 149–177 | fasce e colonna Medio |
| Morfologia e clima | 34–57 | regioni |
| Fazioni, città | 58–91 | 6 regni + Harken + Necrorian |
| Valute | 92–108 | knowledge/material, listino |
| Razze | 109–146 | contesto (nessuna voce richiesta) |
| Bestie magiche e mostri | 147–790 | ~62 schede: A 166–376 (fino a Lung Wang), B 377–586 (Elementali–Miconide), C 587–790 (Minotauro–Vampiro) |
| Animali | 791–1013 | 22 |
| Piante | 1014–1087 | 9 (lore `plant`) |
| Leggendari | 1088–1254 | 14 (+ «Come calcolare il numero persone» a 1090) |
| Religioni e divinità | 1255–1478 | 18 culti (24 titoli) |
| Nozioni storiche | 1479–1555 | ere, origini |
| Figure | 1556–1637 | ~27 |
| Potere economico | 1638–1659 | knowledge |
| Magia | 1660–1685 | saggio, sciamanesimo, Vuoto |

Stima delle voci (file da 20–40, i file generati delle quest esclusi dalla regola):
| Piano proposto | Output | Voci |
|----------------|--------|------|
| Lore regni/regioni/storia/materiali/magia | `lore/regni.yaml`, `regioni.yaml`, `storia.yaml`, `materiali.yaml` | ~45 |
| Lore culti + figure | `lore/culti-1..2.yaml`, `figure.yaml` | ~48 + ~27 |
| Mostri A / B / C (nemici + lore `enemy`) | `enemies/mostri-a..c.yaml`, `lore/creature-a..c.yaml` | ~25 nemici + ~21 lore ciascuno |
| Animali + piante + pet | `enemies/animali.yaml`, `lore/animali.yaml`, `lore/piante.yaml`, `pets/cavalcature.yaml` | ~25 + 22 + 9 + 11 |
| Leggendari + umani + giganti/orchi | `enemies/leggendari.yaml`, `umani.yaml`, `giganti-orchi.yaml` (+ lore) | ~16 + 15 + 7 |
| Catalogo: magie, unici, cibo/pozioni | `spells/sciamanesimo.yaml`, `vuoto.yaml`, `equipment/unici.yaml`, `loot/cibo-regionale.yaml`, `loot/pozioni.yaml` + correzioni dei `power` | ~10 + ~20 + ~25 |
| Lore città ×2 (Drustea/Valan/Mirwa; Fiamme/Madre/Liberia/speciali) | `lore/citta-<regno>.yaml` | ~155 |
| Generazione quest | `quests/<regno>.yaml`, `quests/dungeon.yaml` | ~560 (≈332 heal/job, ~68 guard, ≤ ~50 hunt, ~35 crime, ~30 study + 1 per magia a Valantar, 40 dungeon) |

Totali attesi: lore ≈ 12 + 45 + 75 + ~108 creature/animali/piante + 155 ≈ **395** (dentro 350–450); nemici ≈ **145**.

`read_first` per ogni piano di stesura: `content/README.md` (formato delle voci, da creare nel piano dello schema), `content/config.yaml`, un file esportato come esempio, le righe della sezione del sorgente, `bestiary-stats.md` (per i nemici), `lore/regni.yaml` + `regioni.yaml` (id da citare in `relatedLore`), `world/cities.yaml` (lore città), `src/content/schema/<collezione>.content.ts`. Poiché `--verify` richiede il DB, ogni piano di stesura termina con la modalità offline **`--check`** (`node dist/content/run-content.js --check`: nessuna connessione, nessun env, valida file + ref interni + snapshot `world/cities.yaml`) e con lo spec `src/content/content-tree.spec.ts`; nessun esecutore di stesura tocca `.env`. Gli id nuovi si generano con `node dist/content/run-content.js --new-id 30`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Catalogo scritto a mano con mongosh | file YAML versionati + CLI | questa fase | prima fonte di verità del catalogo nel repo |
| `Lore.unlocked` globale | rimosso; conoscenza per personaggio nella Phase 16 | questa fase | SDL non additivo, FE gated |
| Nessun seed (Phase 9 D-29) | seed idempotente | questa fase | i fixture di sviluppo vengono sostituiti dai contenuti |

**Deprecated/outdated:** testo di BE-CONTENT-02 («per nome») e di BE-CONTENT-06 («una fra job e hunt», «marker su POI della città») superati da D-01/D-17/D-21: emendare REQUIREMENTS/ROADMAP nel piano di chiusura.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dev e produzione condividono gli `_id` di catalogo, città e POI | Pitfall 7 | duplicati in produzione e quest su marker inesistenti; mitigato dal preflight `--verify` sulla copia |
| A2 | Distribuzione dei `power` per rarità/slot (stime di winChance) | Flag D-12 | solo l'handoff; ricalcolato dai file dopo l'export |
| A3 | Esponente 0,5 per scalare gli analoghi delle 32 voci NON TROVATO | Regole | HP/danni di quelle voci; ritoccabili nel file |
| A4 | Valantar: una `study` per ogni magia del catalogo (~87 voci sul tabellone di Valantar) | Generatore | affollamento della board di Valantar; alternativa: una study per fascia di `minXpToLearn` con magia sorteggiata |
| A5 | Moltiplicatore dei premi = fascia del `minTitle` (hunt sempre ×1 anche con animale adventurer) | config | premi delle hunt un po' bassi; ritoccabile |
| A6 | Gruppo regionale per hunt/crime/study = prefisso del `CityType` | Generatore | distribuzione geografica approssimata |
| A7 | Server MongoDB di produzione ≥ 4.2 (già richiesto dal 10-26) | CLI | `$setOnInsert`/bulk funzionano anche prima; nessun aggregation pipeline usato |

## Open Questions (RESOLVED)

1. **Forma del CLI e percorso di `content/`** — RESOLVED: clone di 10-26 in `src/content/run-content.ts`; `resolve(__dirname, '../../content')` vale per `src/` e `dist/`; `--content-dir` per i test; nessuna esclusione da `tsconfig.build.json` o dalle root di jest (i YAML non sono `.ts`; `content/` non è nei `roots` del progetto unit e il `testMatch` dell'integration lo ignora); nessuno script `.ts` fuori da `src/`. Script npm: `content:check`, `content:verify`, `content:dry-run`, `content:apply` (`node --env-file=.env dist/content/run-content.js --…`), `content:new-id`, `content:generate-quests`. Le varianti con `--env-file=.env` sono solo per il dev; il runbook usa il file env della copia/produzione.
2. **Libreria YAML** — RESOLVED: `yaml@2.9.1` (ISC), commenti ignorati al parse (probe), chiavi doppie = errore, 600 voci in 55 ms; `npm install yaml@2.9.1` in `dependencies`.
3. **Upsert idempotente** — RESOLVED con probe: `updateOne` + `$set` (non `replaceOne`) per preservare i campi runtime; `modified: 0` richiede ordine canonico, `ObjectId`, nessun `undefined`; la prima apply dopo l'export normalizza i double; ObjectId nuovi con `new ObjectId().toHexString()` (`--new-id`); validazione `isObjectIdHex`.
4. **Validazione** — RESOLVED: class-validator, nessun zod; tabella dei vincoli in §Pattern 4.
5. **Flag D-12** — RESOLVED nei limiti dell'accesso: numeri della Phase 9 + stime; misura esatta dai file dopo l'export (task del piano di export), riportata nell'handoff; resolver invariato.
6. **Flag D-21** — RESOLVED: quest di servizio sul marker della città, `PointOfInterest.quest` sempre `null`, una quest fissa per POI non-marker.
7. **Cancellazione delle quest di prova** — RESOLVED: fix `deleteQuests` con guardie (corsie occupate e `awaitingAid` → `blocked`), `PendingQuest` non occupate cancellate, back-link POI azzerati, `questresults`/audit lasciati e riportati, idempotente.
8. **Rimozione di `Lore.unlocked`** — RESOLVED: BE = `lore.model.ts:36-38` (`@Field`/`@Prop`), `LoreInput.unlocked` (`:64-65`, non nello SDL), `schema.gql:323`; nessun test/fixture BE lo usa (grep). FE = `lib/graphql/queries/lore_queries.dart:9` e `lib/models/lore.dart` (righe 12, 21, 31, 41, 52, 61, 73). Il controllo di schema del FE (`tool/schema_check/validate_documents.js`) è **manuale** (non in CI), valida i documenti contro un `schema.gql` del BE passato a mano: con lo SDL nuovo i documenti `lores`/`lore` falliscono («Cannot query field "unlocked"») finché il FE non toglie il campo; a runtime l'app vecchia riceverebbe `GRAPHQL_VALIDATION_FAILED` sulla libreria lore. Quindi: quick task FE (rimuovere dal documento e dal modello, `fromJson` tollerante) **mergiato e rilasciato prima** del deploy del BE; PR BE in draft fino ad allora. Real boot: blocco verbatim `type Lore` + diff di `schema.gql` con un solo `-`.
9. **Piani di stesura** — RESOLVED: §Piano di stesura; serve una modalità offline `--check` come gate dei piani senza DB.
10. **Regole deterministiche** — RESOLVED: §config.yaml con esempi testabili.
11. **Export** — RESOLVED: §Export.
12. **Runbook** — RESOLVED: §Runbook.
13. **Test** — RESOLVED: §Validation Architecture.
14. **Descrizione delle quest (D-22)** — RESOLVED: nessun campo a schema; solo il titolo si persiste.

## Runbook e ops (D-26)

`docs/runbooks/content-seeding.md`, stesso schema di `docs/runbooks/mixed-refs-migration.md` (sezioni Perché / Prerequisiti / Ordine / Rollback / Codici d'uscita e report), solo placeholder:
1. Prerequisiti: Node 22, `npm ci && npm run build`, `ls dist/content/run-content.js`, file env fuori dal repo con solo `MONGO_URI` e `DB_NAME`; **deploy già avvenuto** del codice della fase (populate di `relatedLore`, `unlocked` rimosso) e **app FE senza `unlocked` già rilasciata**.
2. `mongodump --uri "<uri di produzione>" --out <cartella>`; `mongorestore` su una copia.
3. Copia: `--verify` (atteso exit 1: contenuti pendenti; leggere errori e `probableIdDivergence` → se presenti, fermarsi), `--dry-run`, `--apply`, `--verify` (exit 0), seconda `--apply` (`modified: 0` ovunque).
4. Produzione: stessa sequenza; allegare alla PR il report JSON di `--verify` della copia e della produzione.
5. Rollback: `mongorestore --drop` delle sole collezioni toccate (`lore enemies pets spells equipmentitems lootitems quests pointsofinterest cities pendingquests`) dal dump.
6. Ricarica dopo modifiche ai file: `--dry-run` → `--apply` → `--verify`; immagini: compilare `images.yaml`, poi lo stesso ciclo.

Report `--verify` per la PR (una riga JSON):
```json
{"mode":"verify","collections":{"lore":{"inserted":0,"modified":0,"unchanged":395,"orphans":[],"errors":0}, "...":{}},"cities":{"relatedLore":{"modified":0,"missing":[]}},"fixes":[{"key":"poi-type-690e…","status":"done"}],"errors":[],"warnings":[]}
```
In `--verify` i campi `inserted`/`modified` significano «da inserire/da modificare».

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | CLI (`--env-file`) | ✓ | engines `>=22` | — |
| `mongodb-memory-server` + binari mongod | int-spec | ✓ | 11.2.0, mongod 8.0.4 e 8.2.6 in cache | — |
| `yaml` | loader | ✗ (da installare) | 2.9.1 sul registry | — |
| DB dev | export e apply del dev | non verificato (vietato in ricerca) | — | i piani di stesura usano `--check` offline |
| Rete per il bestiario | — | non necessaria | — | `bestiary-stats.md` offline |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29.2.5, progetti `unit` e `integration` (`package.json` → `jest.projects`) |
| Config file | `package.json` (integration: `globalSetup` replica set `test/setup/global-setup.ts`) |
| Quick run command | `npx jest src/content --selectProjects unit` |
| Full suite command | `npm run build && npm run test:cov` (come la CI: build, `tsc --noEmit`, `test:cov`, `git diff --exit-code src/schema.gql`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-CONTENT-01 | l'albero `content/` reale passa `--check` (schema, ref, id unici, prosa senza `\n` finale) | unit (legge i file veri) | `npx jest src/content/content-tree.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-CONTENT-02 | parse YAML con posizione, chiavi doppie, id numerici rifiutati | unit | `npx jest src/content/loading --selectProjects unit` | ❌ |
| BE-CONTENT-02 | mapper canonico: ordine chiavi, `ObjectId`, nessun `undefined`; round-trip export→load | unit | `npx jest src/content/mapping --selectProjects unit` | ❌ |
| BE-CONTENT-02 | diff BSON (double/int32, ordine chiavi, array) | unit + int | `npx jest src/content/sync --selectProjects unit` / `… integration --runInBand` | ❌ |
| BE-CONTENT-02 | ciclo `--dry-run → --apply → --verify → --apply` (secondo `modified: 0`), dry-run senza scritture | integration (replSet) | `npx jest src/content/sync/content-sync.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-CONTENT-02 | fixes idempotenti (POI, Kliever, deleteQuests con blocco su corsia occupata, unset `unlocked`) | integration | `npx jest src/content/fixes --selectProjects integration --runInBand` | ❌ |
| BE-CONTENT-02 | prune perimetrato (quest generate/aid/story/concluse mai toccate) | integration | `npx jest src/content/sync/content-prune.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-CONTENT-02 | export: file, commenti, cartella non vuota → exit 2 | integration | `npx jest src/content/export --selectProjects integration --runInBand` | ❌ |
| BE-CONTENT-02 | CLI compilato: exit 0/1/2/3, nessun `mongodb://` nello stdout, `--new-id`, `--check` senza env | integration sul compilato | `npm run build && npx jest src/content/run-content.cli.int-spec.ts --selectProjects integration --runInBand` | ❌ |
| BE-CONTENT-03 | `lores`/`lore`/`enemies` con `relatedLore` popolati e orfani scartati | integration (GraphQL) | `npx jest src/lore --selectProjects integration --runInBand` | ❌ |
| BE-CONTENT-03 | SDL: `type Lore` senza `unlocked` | real boot | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-CONTENT-04 | xp/HP/danni/fascia/livello da Medio (esempi D-11) | unit | `npx jest src/content/rules --selectProjects unit` | ❌ |
| BE-CONTENT-05 | monete normalizzate, power del cibo nella regola | unit | `npx jest src/content/rules/prizes.spec.ts --selectProjects unit` | ❌ |
| BE-CONTENT-06 | generatore: determinismo (stesso seme = stessi byte), Necrorian solo dungeon, mai crime a Ferrion, hunt ≤ metà gruppo e solo animali PE ≤ 200, una quest per POI non-marker, id riusati per chiave | unit | `npx jest src/content/generation --selectProjects unit` | ❌ |
| BE-CONTENT-07 | handoff e runbook presenti | manual (review) | — | — |

### Sampling Rate
- **Per task commit:** `npx jest <file toccati> --selectProjects unit` (+ l'int-spec del modulo se tocca il DB).
- **Per wave merge:** `npx jest src/content src/lore --selectProjects unit` e `… --selectProjects integration --runInBand`, più `node dist/content/run-content.js --check`.
- **Phase gate:** `npm run build && npx tsc --noEmit -p tsconfig.json && npm run test:cov` verdi, `git diff origin/develop -- src/schema.gql` con un solo `-`, dev: `--verify` exit 0 e seconda `--apply` `modified: 0`.

### Wave 0 Gaps
- [ ] `test/content-fixtures/` — mini-albero (2 lore, 1 magia, 1 equipaggiamento, 1 loot, 1 nemico, 1 pet, 2 quest, 1 fix per tipo, `world/cities.yaml` con 2 città) riusato da int-spec e CLI int-spec.
- [ ] `src/content/run-content.cli.int-spec.ts` — clone di `run-mixed-refs.cli.int-spec.ts` (commento in testa: richiede `dist/`).
- [ ] Fixture: riusare `persistCity`/`persistPoi`/`persistQuest`/`persistCharacter`/`persistSpell` di `test/fixtures` per seminare DB dei test di fixes e prune.
- [ ] `package.json` → `coverageThreshold["./src/content/"]` = baseline misurata − 2 (regola D-16 della Phase 10), aggiunta nel piano di gate.
- [ ] Install: `npm install yaml@2.9.1`.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | CLI offline, credenziali solo da file env |
| V3 Session Management | no | — |
| V4 Access Control | no (nessuna API nuova) | — |
| V5 Input Validation | yes | class-validator con `whitelist` + `forbidNonWhitelisted`, enum dagli `src/models/enums`, `kind` dei fixes chiuso |
| V6 Cryptography | no | — |
| V7 Errors & Logging | yes | `describeError` (mai URI), errori dei file con percorso/riga/id |
| V14 Configuration | yes | nessuna variabile nuova; `process.env` passato come oggetto (drift test) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URI/credenziali stampati nel report o nell'errore | Information disclosure | `describeError`; test «never prints the connection string» sul compilato |
| File YAML malevolo/errato (alias esplosivi, tag custom) | DoS / Tampering | `yaml` core schema senza tag custom, `maxAliasCount` di default (100), validazione prima di ogni scrittura |
| Cancellazione involontaria | Tampering | `--apply` non cancella; `--prune` esplicito per una collezione col perimetro; `deleteQuests` con guardie e `blocked` |
| Sovrascrittura di stato di gioco | Tampering | `$set` solo dei campi di catalogo; `$setOnInsert` per i campi runtime delle quest; città solo `relatedLore`/`name` |
| Modifica SDL che rompe il FE | Tampering (contratto) | blocco verbatim nel real boot + diff `schema.gql` + quick task FE gated |
| Falsi positivi gitleaks su URL Cloudinary / id esadecimali | — | URL pubbliche, nessuna chiave; se segnalati, allowlist mirata senza ripetere il letterale (memoria del progetto) |

## Sources

### Primary (HIGH confidence)
- Codice BE: `src/migrations/run-mixed-refs.ts`, `mixed-refs/*`, `run-mixed-refs.cli.int-spec.ts`, `src/models/**`, `src/schema.gql`, `src/lore/*`, `src/cities/cities.service.ts`, `src/quests/acceptance/*`, `src/quests/quest-catalog.populate.ts`, `src/characters/character-quests.populate.ts`, `src/quests/outcomes/combat/*`, `level-table.ts`, `src/economy/coins.ts`, `src/config/env-example.drift.spec.ts`, `test/app.int-spec.ts`, `package.json`, `tsconfig*.json`, `.github/workflows/ci.yml`
- Codice FE (sola lettura): `lib/graphql/queries/lore_queries.dart`, `lib/models/lore.dart`, `lib/models/quest/board_policy.dart`, `lib/screens/mainScreen/tabs/map/layers/quest_markers_layer.dart`, `lib/graphql/queries/city_queries.dart`, `tool/schema_check/*`
- Probe: upsert/bulkWrite su MongoDB 8.2.6 (memory replSet); serializzazione GraphQL di `relatedLore` non popolati; `yaml@2.9.1` parse/commenti/stringify/performance
- npm registry: `yaml` 2.9.1 (ISC), `js-yaml` 5.5.0, `@types/js-yaml` 4.0.9; `npm ls bson mongodb`

### Secondary (MEDIUM confidence)
- `.planning/phases/09-combat-result-admin-outcomes/09-RESEARCH.md:330-346` — aggregati del DB dev del 2026-10-24 (potenza degli equipaggiamenti, magie)
- `.planning/phases/11-popolamento-del-mondo/source/bestiary-stats.md` (commit 7bc8d5c) — statistiche offline estratte da parser, da correggere a mano sulle armi a distanza

### Tertiary (LOW confidence)
- Stime di winChance (dipendono dalla distribuzione per rarità non misurata)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versioni dal registry, librerie già nel repo, probe eseguiti
- Architecture: HIGH — clone di un pattern già in produzione, vincoli di build e drift verificati
- Pitfalls: HIGH — tre dei quattro principali confermati da probe o codice; produzione/id: ASSUMED con mitigazione
- Bilanciamento D-12: MEDIUM/LOW — da completare dai file esportati

**Research date:** 2026-11-01
**Valid until:** 2026-12-01 (codice stabile; rileggere se cambiano resolver di combattimento o schema delle quest, Phase 13)
