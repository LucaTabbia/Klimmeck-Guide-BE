---
phase: 11-popolamento-del-mondo
area: core (loading, schema, checking, rules, analysis, CLI args, run-content, content-tree spec)
reviewed: 2026-11-02
depth: standard (+ riscontri incrociati con mapping/sync/generation dove serviva)
base: origin/develop
branch: feat/11-popolamento-del-mondo
findings:
  critical: 0
  high: 0
  medium: 3
  low: 13
  total: 16
status: issues_found
---

# Phase 11 — Code review, area core

Revisione in sola lettura dei 40 file dell'area core del seeder (tutti nuovi rispetto a `origin/develop`). Decisioni D-01..D-34 trattate come vincolanti: nessuna è riportata come difetto.

## Sintesi

Il nucleo è solido. I punti segnalati dal brief tengono:

- **Pitfall 6 (id letti come numeri):** gestito su due livelli. `idIssueOf` in `loading/yaml-file.ts:36-55` e `IdField`/`IdList` in `schema/common.content.ts:107-125` rifiutano qualunque id non stringa o non esadecimale minuscolo a 24, riferimenti compresi (un `6e12…` letto come `Infinity` o un id di sole cifre letto come numero falliscono entrambi).
- **Chiavi sconosciute:** `validateEntry` usa `whitelist` + `forbidNonWhitelisted` (`schema/validate-entry.ts:48-51`), quindi vengono rifiutate anche nei sotto-oggetti `Nested`.
- **`Text()`:** rifiuta l'a capo finale (`common.content.ts:66-80`). `proseIssues` fa da rete su ogni stringa (`check-content.ts:107-135`).
- **Regole deterministiche:** `levelFromPe`, `tierOfLevel`, la scala ×100, `enemyXp` con minimo 1 e `fromCopper` per la normalizzazione delle monete sono corretti. Ho ricontrollato i valori: con `xpScale` 0.14084507 il Tarrasque vale 21.831 come in D-11. `timeToCompleteMs` converte in ms (Pitfall 4).
- **CLI:** esige esattamente una modalità. Le modalità offline non leggono l'ambiente. Ogni modalità su DB passa da `describeError`, quindi l'URI non viene mai stampato su stdout. `--apply` resta di sola lettura se `checkContent` ha errori (`sync/content-sync.ts:243-247`).

Non ho trovato difetti CRITICAL o HIGH. I tre MEDIUM riguardano:

- un file `images.yaml` malformato che viene ignorato in silenzio;
- una deriva fra le promesse del README su `content:check` e i controlli che il codice fa davvero;
- la regola del sorteggio di Valantar, che usa il nome della città come chiave in due punti.

## MEDIUM

### ME-01: `images.yaml` con radice non-mappa ignorato in silenzio

**File:** `src/content/loading/content-tree.ts:172-186` (riga 177)

**Cosa non va:** `loadImages` fa `const sections = isMapping(parsed.value) ? parsed.value : {}`. Se `images.yaml` è scritto come lista in radice o come scalare, non c'è nessun errore di parsing e nessuna issue. Esempio: `- { id: '…', url: 'https://res.cloudinary.com/…' }`, cioè la forma naturale di chi copia il formato delle altre cartelle. In quel caso tutte le sezioni risultano vuote e `content:check` esce 0.

**Perché conta:** il passaggio immagini (D-24) lo compila l'utente a mano, dopo il caricamento su Cloudinary. Con il file in quella forma:
- `--apply` non scrive nessun `Lore.image`/`Enemy.imagePath`/`Pet.imagePath`;
- `--verify` non segnala deriva;
- il FE continua a mostrare i placeholder.

Nessun controllo lo dice. È lo stesso caso che `loadWorld` invece segnala («il file deve essere una lista di voci»). Per lo stesso motivo, un file `enemies/mostri.yml` (estensione `.yml`) viene saltato da `yamlFilesOf` (`content-tree.ts:105-112`) senza alcun avviso. Il comportamento è documentato nel README, ma è comunque invisibile.

**Correzione suggerita:**
- In `loadImages`, se `parsed.value` non è `null` e non è una mappa, aggiungere `fileIssue(IMAGES_FILE, 'il file deve essere una mappa lore/enemies/pets')`.
- In `yamlFilesOf`, emettere un warning per i file `.yml` o con altre estensioni trovati nelle cartelle delle collezioni.
- Aggiungere un caso a `loading/content-tree.spec.ts`.

### ME-02: il README promette controlli che `content:check` non fa

**File:** `content/README.md:145`, `:157`, `:158` contro `src/content/checking/check-content.ts:616-635` (`questRuleIssues`) e `src/content/schema/quest.content.ts:32-35`

**Cosa non va:** il README dice «`content:check` le controlla tutte, anche sulle voci scritte a mano» e poi elenca fra le regole:
- (157) «Ogni quest generata ha `infos.description`…»;
- (158) «`recommendedLoot` … sempre entro la rarità della fascia del `minTitle` (D-33)», con la composizione per dungeon e hunt.

Nessuna delle due regole è implementata:
- `QuestInfosEntry.description` è `@Optional()`;
- `questRuleIssues` non guarda né `recommendedLoot` né la rarità.

Le garantisce solo il generatore.

**Perché conta:** il README è il contratto per chi ritocca i file a mano. Due casi concreti:
- una hunt modificata a mano con un'arma `legendary` nel `recommendedLoot` di una quest `rookie` passa `--check` e arriva a DB;
- una quest senza `description` passa anche lei, e il FE della D-32 mostra un annuncio vuoto.

Il revisore umano crede che il gate ci sia.

**Correzione suggerita:** scegliere una delle due strade.
- (a) Implementare i due controlli in `questRuleIssues`:
  - `description` obbligatoria sulle quest fisse;
  - rarità di ogni `recommendedLoot` ≤ rarità di `dungeonLootRarity[minTitle]`, ricavata da `byCollection` per `itemType`.
  
  Ciascuno con il suo test in `check-quest-rules.spec.ts`.
- (b) Riscrivere le righe 145/157/158 del README distinguendo le regole «garantite dal generatore» da quelle «controllate da `content:check`».

La (a) è preferibile: il README dichiara il check come rete per le voci scritte a mano.

### ME-03: sorteggio della magia legato al nome «Valantar», costante duplicata

**File:** `src/content/checking/check-content.ts:54`, `:563-589` (`spellDrawIssues`); `src/content/generation/city-profile.ts:42` (`SPELL_STUDY_CITY`), usata in `fixed-quests.generator.ts:259`, `:280`

**Cosa non va:** la regola D-31 identifica la città con `city?.name !== 'Valantar'`, e la stessa stringa vive in due costanti separate (`SPELL_DRAW_CITY` e `SPELL_STUDY_CITY`). Il nome è un'etichetta libera (D-01) che una fix `renameCity` può cambiare. Nello stesso generatore, il caso analogo di Talmvere (D-34) usa invece il `CityType` (`INN_CITY_TYPE = 'talmvereVillage'`). Nello snapshot `valanCapital` è unico (1 occorrenza in `content/world/cities.yaml`). Inoltre il check non verifica il caso opposto: la study di Valantar senza `spellDraw` passa.

**Perché conta:**
- Va contro la regola dell'utente «mai il nome come chiave se esiste un id/tipo».
- Una rinomina o una seconda città omonima (i nomi possono ripetersi, D-01) sposta o rompe in silenzio la regola nel check e nel generatore, in modo indipendente l'uno dall'altro.
- Se la study di Valantar perde il flag, D-31 smette di valere senza nessun errore.

**Correzione suggerita:**
- Un'unica costante condivisa, per esempio `SPELL_DRAW_CITY_TYPE = CityType.valanCapital`, in `rules/` o in `city-profile.ts`, usata sia dal check sia dal generatore. Confronto su `city.type`.
- Aggiungere in `spellDrawIssues` l'errore «la study di Valantar deve avere `spellDraw: true` (D-31)».
- Aggiornare la riga 153 del README.

## LOW

### LO-01: eccezioni nelle modalità offline: rejection non gestita ed exit 1

**File:** `src/content/run-content.ts:169`, `:178-182`

**Cosa non va:** `runOffline` (che chiama `loadContentTree`/`checkContent`/`catalogStats`) è fuori da ogni `try`. Un `readFileSync` che lancia, per esempio con `EISDIR` su una cartella chiamata `x.yaml` o con `EACCES`, o un `RangeError` di una regola, rigetta la promise di `runCli`. Il `.then(process.exit)` non ha un `.catch`.

**Perché conta:** Node stampa lo stack su stderr ed esce con codice 1, cioè lo stesso codice di `CONTENT_EXIT.drift` («il contenuto ha errori»), senza report JSON. Uno script o un operatore che legge il codice d'uscita confonde un crash con un check fallito. Le modalità su DB, invece, mappano lo stesso errore su `failure` (3).

**Correzione suggerita:** avvolgere `runOffline` in un `try/catch` che stampi `errorReportOf(error)` e ritorni `CONTENT_EXIT.failure`, oppure aggiungere `.catch(() => process.exit(CONTENT_EXIT.failure))` all'entry point.

### LO-02: il config accetta `legend` dove le regole lo rifiutano

**File:** `src/content/rules/content-config.ts:123`, `:294-295`

**Cosa non va:** `minTitle.serviceCity/serviceCapital` e `dungeonTierByCitySize` sono validati con `tier = oneOf(TIERS)`, che include `legend`. `rankedTierOf` (`rules/quest-prizes.ts:14-18`) lancia `RangeError('Fascia senza premio')` su `legend`, e `QuestRequirementsEntry.minTitle` accetta solo `RANKED_TIERS`.

**Perché conta:** un ritocco del config con `serviceCapital: legend` passa la validazione del config («mai un default silenzioso») e poi fa fallire `content:generate-quests` o il check delle quest generate, lontano dalla causa.

**Correzione suggerita:** usare `oneOf(RANKED_TIERS, 'fascia')` per queste due sezioni e tipizzarle `RankedTier`.

### LO-03: chiavi sconosciute nelle sezioni del config ignorate

**File:** `src/content/rules/content-config.ts:198-207`, `:210-229`, `:269-277`

**Cosa non va:** `validateUnknownKeys` controlla solo la radice. Dentro le sezioni, una chiave in più viene ignorata. L'unico effetto reale riguarda la chiave facoltativa `prizes.dungeon.randomLootQuantity`: un refuso (`randomLootQty: 3`) lascia il default `?? 1` di `fixed-quests.generator.ts:500`, in silenzio. `randomLootQuantity` viene inoltre accettata su tutti i tipi, ma la usa solo la dungeon.

**Correzione suggerita:** in `fields`/`validatePrizes`, segnalare le chiavi fuori dall'elenco atteso della sezione. Ammettere `randomLootQuantity` solo su `prizes.dungeon`.

### LO-04: `timeToComplete` in ms senza un minimo plausibile (Pitfall 4)

**File:** `src/content/schema/quest.content.ts:50-52`; `src/content/rules/content-config.ts:293`

**Cosa non va:** l'override `infos.timeToComplete` è `IntBetween(1)`. Chi scrive `timeToComplete: 8` pensando in ore (il config parla in ore) ottiene una quest che si risolve in 8 ms, e il check passa. Sul lato config, `timeToCompleteHours` non ha un tetto: sopra ~596 h il valore in ms supera `MAX_GRAPHQL_INT` e rompe `QuestInfos.timeToComplete: Int`.

**Correzione suggerita:**
- `IntBetween(60_000)` (almeno un minuto) sull'override.
- Nel config, un massimo tale che `hours × 3_600_000 ≤ MAX_GRAPHQL_INT`.

### LO-05: `Lore.image` e `imagePath` scavalcano il vincolo Cloudinary (T-11-15)

**File:** `src/content/schema/catalog.content.ts:65-67` (`LoreEntry.image`), `:190-191` (`PetEntry.imagePath`); `src/content/schema/enemy.content.ts:130-131`; contro `src/content/schema/world.content.ts:18-19`, `:64-68`

**Cosa non va:** solo `images.yaml` impone `^https://res\.cloudinary\.com/`. Il campo `image` di una lore, che il mapper usa come fallback (`mapping/catalog.mapper.ts:61`), accetta qualunque testo, compreso un URL esterno.

**Perché conta:** è il controllo T-11-15 («le immagini arrivano solo da Cloudinary»), aggirabile scrivendo direttamente nella voce. Il rischio è basso, perché a scrivere i file sono solo i manutentori del repo. Va aggiunto che il commento di `world.content.ts:18` («solo dall'account Cloudinary del progetto») promette più di quanto fa la regex, che accetta qualunque account `res.cloudinary.com`.

**Correzione suggerita:**
- Su `LoreEntry.image`, applicare `Matches(CLOUDINARY_URL)` quando il valore non è null.
- Per `imagePath`, ammettere `assets/images/<slug>.png` oppure un URL Cloudinary.
- Valutare se includere nella regex il cloud name (`dzuhywp53`).

### LO-06: `withoutRepeats` può nascondere un errore di un'altra voce

**File:** `src/content/checking/check-content.ts:93-105`

**Cosa non va:** la chiave di deduplicazione è `file:line:path`, senza `entryId`. Con voci in stile flow sulla stessa riga (`[{…}, {…}]`), due voci diverse con lo stesso campo sbagliato producono un solo errore. Lo stesso accade per due link di `images.yaml` se `path` coincide.

**Correzione suggerita:** includere `issue.entryId` nella chiave.

### LO-07: la regola D-31 accetta un `prizes.spell` fisso su qualunque study

**File:** `src/content/checking/check-content.ts:555-561` (`fixedSpellIssues`)

**Cosa non va:** dopo la revisione di D-17/D-31 nessuna quest fissa porta più una magia fissa: le study fuori da Valantar sono senza magia, e quella di Valantar sorteggia. Il check rifiuta `prizes.spell` solo fuori dalle study. Una study con `prizes.spell` e `spellDraw: true` insieme, o con `prizes.spell` in una città qualunque, passa.

**Correzione suggerita:** rifiutare `prizes.spell` su ogni quest fissa, oppure almeno quando c'è anche `spellDraw`. Allineare la riga 154 del README.

### LO-08: copertura D-17 non controllata

**File:** `src/content/checking/check-content.ts:616-635`

**Cosa non va:** «sempre una heal e sempre un job per città (eccetto Necrorian)» lo garantisce solo il generatore. Se a mano si cancella la heal di una città, `--check` passa e non compare nessun warning. È il caso che D-17 vuole evitare: un personaggio senza fondi resta bloccato.

**Correzione suggerita:** un warning, o un errore, per ogni città dello snapshot non Necrorian che non ha almeno una `heal` e un `job`.

### LO-09: `key` delle fix non verificata come unica

**File:** `src/content/schema/fix.content.ts:14-17`; `src/content/checking/check-content.ts:147-160`

**Cosa non va:** il README (`fixes`: «`key: <stringa unica>`») e `validate-entry.ts:36` usano la `key` come identità della fix nei report, ma `duplicateIssues` indicizza solo le collezioni. Con due fix con la stessa chiave i report diventano ambigui.

**Correzione suggerita:** aggiungere un controllo di unicità sulle `key` di `tree.fixes`.

### LO-10: id del contenuto contro id dello snapshot, unicità verificata solo dallo spec

**File:** `src/content/checking/check-content.ts:147-160` contro `src/content/content-tree.spec.ts:9-34`

**Cosa non va:** il README dice «gli id sono unici in tutto il contenuto». `duplicateIssues` non confronta le voci con gli id di città e POI dello snapshot, né i POI fra loro (`content-index.ts:87-100`: `pois.set` sovrascrive in silenzio un POI ripetuto in due città). Lo garantisce solo lo spec sul repo reale, quindi non vale per `--check --content-dir <altro>` né per l'utente che esegue `npm run content:check`.

**Correzione suggerita:** spostare il controllo in `duplicateIssues`, includendo gli id di `index.cities` e dei POI.

### LO-11: regole di stesura non imposte dallo schema dei nemici e dei pet

**File:** `src/content/schema/enemy.content.ts:114-116`; `src/content/schema/catalog.content.ts:177-181`

**Cosa non va:**
- `11-REPO-RULES.md` dice «mai `dungeon`» nelle `locations`, ma `EachOneOf(PoiType)` lo accetta. Un nemico con `dungeon` risulterebbe compatibile con qualunque POI dungeon nei filtri per tipo.
- `PetEntry` controlla `currentLifePoints ≤ maxLifePoints` ma non `xp ≤ maxXp`.

**Correzione suggerita:** escludere `PoiType.dungeon` dall'elenco ammesso per `locations`. Aggiungere un `NotAbove('maxXp')` sullo stesso schema di `NotAboveMaxLifePoints`.

### LO-12: logica duplicata e codice morto (formula di combattimento, marcia, rarità, `isRecord`)

**File:**
- `src/content/analysis/catalog-stats.ts:40-73`, `:99-104`, `:197-201`
- `src/content/rules/quest-prizes.ts:50-59`
- copie di `isRecord`/`isMapping` in `loading/content-tree.ts:87`, `rules/content-config.ts:90`, `rules/enemy-facts.ts:14`, `checking/content-index.ts:36`, `checking/check-content.ts:56`

**Cosa non va:**
- `winChance` ed `EVEN_ODDS` copiano la formula di `placeholder-combat-resolver.ts`. L'intestazione di quel file dice esplicitamente «ogni formula di combattimento vive solo in questo file»: un ritocco del resolver non si riflette sulle statistiche dell'handoff.
- `ENCOUNTERS` scrive a mano `lifePoints` (1100, 8400, …) invece di derivarli dai nemici e da `hpScale`. Al primo ritocco del config i numeri vanno in deriva.
- `hungerMarchMinutes` ricalcola `power × minutesPerPower` senza arrotondare, mentre `marchMinutesOf` arrotonda. `marchMinutesOf` e `dungeonLootRarity` non sono usate fuori dagli spec: il generatore legge `config.dungeonLootRarity` direttamente, con un suo `rarityRank`.

**Correzione suggerita:**
- Esportare dal resolver una funzione pura `winChanceOf(partyPower, lifePoints)` e riusarla.
- Leggere `lifePoints` degli scontri di riferimento dalle voci dei nemici, per id.
- Usare `marchMinutesOf` in `catalogStats` e `dungeonLootRarity` nel generatore, oppure rimuoverle.
- Un solo `isRecord` condiviso (Boy Scout).

### LO-13: convenzioni e affidabilità dei test

**File:**
- `src/content/run-content.ts:1-15` e `run-content.cli.int-spec.ts:15-18`: import relativi (`'../mongo/mongo-errors'`, `'./cli-args'`) nell'unico file dell'area che non usa il prefisso `src/` prescritto dal `CLAUDE.md` del repo («Import Organization»). La build Nest riscrive i path, quindi non è un bug, ma è incoerente con il resto dell'area.
- `run-content.cli.int-spec.ts:43-61`, `:195-210`: il test «never prints the connection string» cattura solo `stdout`. Uno stack su `stderr` (vedi LO-01) che contenesse l'URI non verrebbe intercettato. Lo spec gira inoltre su `dist/` senza verificare che sia aggiornato: con un build vecchio testa il codice vecchio. La limitazione è annotata in testa al file.

**Correzione suggerita:**
- Import `src/...` in `run-content.ts`.
- Nell'int-spec, raccogliere anche `child.stderr` e verificare l'assenza dell'URI su entrambi i flussi.
- Facoltativo: confrontare l'`mtime` di `dist/content/run-content.js` con quello dei sorgenti e fallire con un messaggio chiaro se il build è più vecchio.

## Riepilogo

| Severità | Conteggio |
| --- | --- |
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 13 |
| **Totale** | **16** |

## File revisionati (diff contro `origin/develop`, tutti nuovi, letti per intero)

- src/content/analysis/catalog-stats.spec.ts
- src/content/analysis/catalog-stats.ts
- src/content/checking/check-content.ts
- src/content/checking/check-quest-rules.spec.ts
- src/content/checking/check-refs.spec.ts
- src/content/checking/content-index.spec.ts
- src/content/checking/content-index.ts
- src/content/cli-args.spec.ts
- src/content/cli-args.ts
- src/content/content-issue.ts
- src/content/content-paths.ts
- src/content/content-tree.spec.ts
- src/content/loading/content-tree.spec.ts
- src/content/loading/content-tree.ts
- src/content/loading/yaml-file.spec.ts
- src/content/loading/yaml-file.ts
- src/content/rules/content-config.spec.ts
- src/content/rules/content-config.ts
- src/content/rules/enemy-facts.spec.ts
- src/content/rules/enemy-facts.ts
- src/content/rules/enemy-stats.spec.ts
- src/content/rules/enemy-stats.ts
- src/content/rules/quest-prizes.spec.ts
- src/content/rules/quest-prizes.ts
- src/content/run-content.cli.int-spec.ts
- src/content/run-content.ts
- src/content/schema/catalog.content.spec.ts
- src/content/schema/catalog.content.ts
- src/content/schema/common.content.ts
- src/content/schema/enemy.content.spec.ts
- src/content/schema/enemy.content.ts
- src/content/schema/fix-world.content.spec.ts
- src/content/schema/fix.content.ts
- src/content/schema/quest.content.spec.ts
- src/content/schema/quest.content.ts
- src/content/schema/validate-entry.spec.ts
- src/content/schema/validate-entry.ts
- src/content/schema/validate-tree.spec.ts
- src/content/schema/validate-tree.ts
- src/content/schema/world.content.ts

Contesto letto: `11-CONTEXT.md`, `11-REPO-RULES.md`, `11-RESEARCH.md` §Common Pitfalls, `content/README.md`, `content/config.yaml`.

Riscontri incrociati in sola lettura:
- `src/content/sync/content-sync.ts` (gate degli errori prima delle scritture)
- `src/content/sync/content-prune.ts`
- `src/content/fixes/fix-runner.ts`
- `src/content/mapping/catalog.mapper.ts`
- `src/content/generation/{city-profile,fixed-quests.generator}.ts`
- `src/mongo/mongo-errors.ts`
- `src/economy/coins.ts`
- `src/quests/outcomes/combat/placeholder-combat-resolver.ts`
- `src/schema.gql`

Nessun jest eseguito, nessun accesso al database, nessun `.env` letto.

---

_Reviewer: Claude (gsd-code-reviewer)_
