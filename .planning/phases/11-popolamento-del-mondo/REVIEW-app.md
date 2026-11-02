---
phase: 11-popolamento-del-mondo
area: app (generatore delle quest fisse, run-generate-quests, populate di lore/nemici, modelli, spell draw, fixture e int-spec)
reviewed: 2026-11-02T13:34:23Z
depth: standard
branch: feat/11-popolamento-del-mondo (diff vs origin/develop)
findings:
  critical: 0
  high: 0
  medium: 3
  low: 8
  total: 11
status: issues_found
---

# Phase 11: code review, area app

Revisione in sola lettura dei 36 file dell'area, letti per intero e confrontati con `origin/develop`. Le decisioni bloccate D-01..D-34 di `11-CONTEXT.md` non sono state trattate come difetti. Non ho eseguito jest né toccato database o `.env`. Ho fatto solo letture offline di `content/world/cities.yaml` e `content/quests/*.yaml` (con `node` + `yaml`) per verificare gli scenari.

## Sintesi

Il lavoro è solido. Il generatore è puro e deterministico. Il tiro D-31 è isolato bene: un solo `next()` aggiuntivo, solo con il booleano `true`, e il pool è ordinato per id. La populate di `relatedLore` con il filtro degli orfani chiude il Pitfall 1 su `lores`/`lore`/`enemys`/`enemy`. Lo SDL cambia esattamente di `-  unlocked: Boolean!` / `+  description: String`, e `app.int-spec.ts` fissa i due blocchi.

Nessun difetto critico o alto. Ci sono tre punti medi:
- il generatore lascia cambiare le quest esistenti per modifiche non correlate;
- il CLI si blocca proprio sui file che dovrebbe rigenerare;
- la populate a un solo livello lascia raggiungibili, ora che il contenuto riempie i `relatedLore`, selezioni annidate che azzerano l'intera risposta.

## MEDIUM

### ME-01: i sorteggi del flusso principale rendono instabili le quest con id riusato

**File:** `src/content/generation/fixed-quests.generator.ts:252-262` (tiri crime/study per città), `:400` (shuffle per gruppo), `:348`, `:354` (animale e POI della hunt), `:502` (randomLoot), `:654` (mostro della dungeon)

**Cosa non va:** tutti i sorteggi principali consumano lo stesso `SeededChanceSource`, in un ordine che dipende dall'intero mondo. `shuffle` consuma `n-1` tiri, quindi cambia il numero di candidati di un gruppo. Il ciclo delle rarità in `randomLootOf` consuma un tiro per ogni rarità vuota attraversata. Qualsiasi cambio a monte sposta allora tutti i tiri successivi: una città nuova, un animale aggiunto o con `locations` ritoccate, un equipaggiamento di una rarità prima assente. Gli id però si riusano per chiave `type|markerLocation` (D-01).

**Scenario concreto:** l'utente aggiunge un animale in `content/enemies/animali.yaml` e rilancia `content:generate-quests`. Cambiano i candidati hunt di un gruppo e lo shuffle consuma un tiro in più o in meno. Da quel punto in poi crime/study non c'entrano (vengono prima), ma cambiano:
- le hunt dei gruppi successivi: POI diversi, quindi id nuovi e quest vecchie orfane;
- **tutte** le dungeon: stesso id (`dungeon|poi`), ma un altro `infos.enemy`, un altro `minTitle` e un altro `randomLoot`.

Al `--apply` il `$set` sostituisce nemico e requisiti di una quest che un personaggio può aver già accettato: la risoluzione legge la quest al momento del job e combatte contro un nemico diverso da quello mostrato all'accettazione. Allo stesso modo una città aggiunta sposta tutti i tiri crime/study delle città con id maggiore, e quest crime/study compaiono o spariscono in mezzo mondo.

**Perché conta:** il commento di testa garantisce «stesso input = stesse voci», ma non «una modifica locale resta locale». È proprio la proprietà che `keyedChance` già assicura alle descrizioni (D-32) e agli oggetti da esplorazione.

**Fix suggerito:** derivare ogni sorteggio da un flusso legato alla sua chiave, come le descrizioni:
- `keyedChance(seed, 'crime|<cityId>')` e `'study|<cityId>'` per i tiri delle città;
- `keyedChance(seed, 'hunt-group|<gruppo>')` per lo shuffle;
- `keyedChance(seed, '<questKey>|enemy')`, `'|poi'` e `'|loot'` per mostro, POI e loot.

Aggiungere un test in `determinism.spec.ts`: aggiungere un animale o una città non cambia `enemy`/`minTitle`/`randomLoot` delle dungeon esistenti. Nell'handoff, documentare che rigenerare con giocatori attivi su una quest può cambiarla.

### ME-02: `content:generate-quests` si rifiuta di girare quando l'errore sta nei file generati che dovrebbe riscrivere

**File:** `src/content/run-generate-quests.ts:143-145`

**Cosa non va:** `runGenerateQuests` esegue `checkContent(tree)` sull'albero **comprese** le quest già generate, e con un solo errore restituisce `failedReport` senza scrivere nulla. Le regole delle quest in `check-content.ts` controllano anche i file generati: hunt solo su `category: animal` con PE ≤ `hunt.maxAnimalPe` (`:460-465`), categoria del nemico (`:492`), marker (`:516-525`), riferimenti pendenti.

**Scenario concreto:**
1. L'utente abbassa `hunt.maxAnimalPe` da 200 a 100 in `config.yaml`, oppure riclassifica la Iena da `animal` a `monster`, oppure cancella un mostro usato da una dungeon.
2. `content:check` segnala errori sulle hunt/dungeon esistenti in `content/quests/*.yaml`.
3. Il comando che dovrebbe correggerle (`content:generate-quests`) esce 1 senza scrivere niente.

L'unica via d'uscita è modificare o cancellare a mano i file marcati «generato, non si scrivono a mano». Il README (`content/README.md`) invita invece a ritoccare il config e rigenerare.

**Fix suggerito:** validare l'albero **senza** le voci dei `GENERATED_QUEST_FILES` prima di generare: un `checkContent` su un albero con `entries.quests` filtrato con `generatedEntriesOf` invertito. Le voci esistenti servono solo a riusare gli id. Dopo la scrittura, validare l'albero completo e riportarne gli errori. Test in `run-generate-quests.spec.ts`: con una hunt generata che viola la nuova soglia, il comando la rigenera e chiude con exit 0.

### ME-03: populate a un solo livello, mentre il contenuto riempie i `relatedLore` annidati

**File:** `src/lore/related-lore.ts:5-8`, `src/lore/lore.service.ts:17-32`, `src/enemies/enemies.service.ts:17-32`. Cross-file: `src/quests/quest-catalog.populate.ts:9`, `src/cities/cities.service.ts:14,22`

**Cosa non va:** `RELATED_LORE_POPULATE` popola solo il primo livello. Lo SDL però è ricorsivo (`Lore.relatedLore: [Lore!]!`), e le altre strade che restituiscono `Lore` o `Enemy` non popolano i `relatedLore` interni:
- `QUEST_CATALOG_POPULATE` popola `infos.enemy` ma non il suo `relatedLore`;
- `CitiesService` popola `relatedLore` della città ma non quello della lore.

Prima di questa fase quegli array erano vuoti. Ora ogni lore di città punta a regione e stato (D-23), ogni nemico alla sua lore, e le lore delle creature alle regioni.

**Scenario concreto:** un client (anche una futura schermata FE o un GraphiQL) chiede uno di questi:
- `cities { relatedLore { relatedLore { id name } } }`;
- `quests { infos { enemy { relatedLore { id } } } }`;
- `lores { relatedLore { relatedLore { id } } }`.

Il valore grezzo `ObjectId` finisce in `ID!` e produce l'errore del Pitfall 1 (`ID cannot represent value: { type: "Buffer" … }`). Per la catena di non-null l'intera lista diventa `data: null`. Oggi il FE non seleziona questi campi, quindi il difetto è latente, ma il contratto pubblicato lo consente.

**Fix suggerito:** una delle due strade.
1. Un `@ResolveField('relatedLore')` su `Lore` (e su `Enemy`) che risolve gli id con un loader per richiesta e scarta gli orfani. Tiene il contratto ricorsivo valido a qualsiasi profondità e toglie la populate dai servizi.
2. In alternativa, popolare anche `infos.enemy.relatedLore` e `relatedLore.relatedLore` dove si restituiscono lore e nemici, e documentare nello SDL o nell'handoff che la profondità supportata è uno.

In entrambi i casi serve un int-spec con una selezione a due livelli su `cities`, `quests` e `lores`.

## LOW

### LO-01: «ad» eufonica applicata solo alle descrizioni, non ai titoli; regola troppo larga

**File:** `src/content/generation/quest-titles.ts:4-9`, `src/content/generation/quest-descriptions.ts:21-23`

**Cosa non va:** i titoli usano `a ${city}` fisso. Nei file generati compaiono infatti `Lavori di bottega a Efragos`, `a Altaluce`, `a Iriesa`, `Turno di guardia a Oldcairn`, `Ricerche in biblioteca a Iriesa`. Le descrizioni della stessa quest scrivono invece «ad Iriesa»: due grafie nella stessa scheda.

Inoltre `a()` aggiunge la «d» davanti a qualsiasi vocale («ad Iriesa», «ad Ultima», «ad Oldcairn»), mentre l'uso corrente la riserva alla stessa vocale («ad Altaluce», «ad Anden»). Infine il nome `a` è una funzione di una lettera, poco leggibile.

**Fix suggerito:** estrarre la preposizione in un helper con un nome parlante (es. `withPrepositionA(name)`), usarlo anche in `QUEST_TITLES.job/innJob/guard/crime/study/spellStudy` e restringere la regex a `/^a/i` (o lasciarla, se l'utente preferisce la forma larga: chiederlo). Estendere il test di `quest-descriptions.spec.ts:57` ai titoli.

### LO-02: i gruppi regionali con una sola città non ricevono mai una hunt

**File:** `src/content/generation/fixed-quests.generator.ts:396`

**Cosa non va:** `Math.floor(cities.length * share)` vale 0 per i gruppi di una sola città. Nel mondo reale sono `elfCapital` (Ko Shaeras, città natale degli elfi per `race-traits.ts:37`), `talmvereVillage` (Talmvere) e `ferrionCity` (Ferrion). Lo conferma la lettura di `content/quests/*.yaml`: nessuna hunt in quelle tre città. Il test `hunt-quests.spec.ts:54` lo fissa per Ferrion. Per la città natale degli elfi e per Talmvere però va contro lo spirito di D-17 («un job e un'uscita facile sono sempre vicini»).

**Fix suggerito:** decisione di prodotto da chiedere all'utente: `Math.max(1, floor(...))` per i gruppi singoli, oppure accorpare i tipi speciali al regno geografico. Fino ad allora, annotarlo nell'handoff.

### LO-03: Valantar e Liberia riconosciute per nome; il ramo di Liberia è codice morto

**File:** `src/content/generation/city-profile.ts:42-44`, `src/content/generation/fixed-quests.generator.ts:256-259,280`

**Cosa non va:**
- `SPELL_STUDY_CITY = 'Valantar'` e `COLLEGE_CITY = 'Liberia'` sono chiavi per nome. Una rinomina come quella di Flinas → Kliever (D-06) toglierebbe in silenzio la study di magia a Valantar (diventerebbe una study semplice di capitale) e lascerebbe orfana la quest con `spellDraw`. È contro la regola dell'utente «mai il nome come chiave se esiste un id».
- Liberia è `liberiaCapital`, quindi `city.name === COLLEGE_CITY` non cambia mai l'esito: `scale === 'capital'` è già vero.
- `INN_CITY_TYPE` usa invece il tipo: le tre eccezioni seguono criteri diversi.

**Fix suggerito:** identificare Valantar per id della città (o per `CityType` come Talmvere) in `config.yaml`, e togliere `COLLEGE_CITY` oppure documentarlo come un no-op intenzionale.

### LO-04: il report `skipped` elenca città che non vengono saltate

**File:** `src/content/generation/fixed-quests.generator.ts:75,146-153`

**Cosa non va:** le città senza lore finiscono in `skipped` con `type: '*'` e il motivo `città senza lore`, ma ricevono comunque tutte le quest, con `relatedLore: []` (`service-quests.spec.ts:229`). Chi legge il report JSON di `content:generate-quests` crede che quelle città non abbiano quest.

**Fix suggerito:** spostarle in un campo `warnings` (o `citiesWithoutLore`) del `GeneratorResult`/`GenerateQuestsReport`, e lasciare `skipped` alle sole voci davvero non generate (dungeon senza mostro).

### LO-05: il test di Talmvere riusa l'id di Ferrion

**File:** `src/content/generation/service-quests.spec.ts:51-60`, `test/content/generator-world.fixture.ts:545-550`

**Cosa non va:** `addedCity({ n: 13, ... })` genera `cityId(13)`, che è l'id di Ferrion nella fixture (`CITY_SEEDS` n 13). Duplica anche `poiId(13, *)` e `loreId(13)`. `indexContent` tiene l'ultima città per id, così Ferrion sparisce dal mondo del test, e il test passa perché filtra per quell'id. Se l'indice tenesse la prima città, il test cercherebbe il job di Ferrion e fallirebbe per un motivo estraneo a D-34.

**Fix suggerito:** usare `n: 15` (libero), e fare in modo che `addedCity` lanci un'eccezione se l'id esiste già.

### LO-06: la aid clonata perde `infos.description`

**File:** `src/quests/outcomes/aid/aid-quest.ts:96-104` (cross-file, conseguenza di D-32)

**Cosa non va:** `buildAidQuest` copia campo per campo `infos` (`title`, `markerLocation`, `enemy`, `timeToComplete`, `relatedLore`), ma non il nuovo `description`. La aid di una hunt o di una dungeon persa arriva al FE con `description: null`, mentre la quest originale ce l'ha.

**Fix suggerito:** aggiungere `description: infos.description ?? null` a `AidSourceQuest`/`AidQuestDraft` e al clone, con un test unit, oppure decidere esplicitamente che la aid non ha annuncio e scriverlo nell'handoff.

### LO-07: il comando non riscrive un file generato che resta vuoto

**File:** `src/content/run-generate-quests.ts:36,154-163`

**Cosa non va:** si scrivono solo i file presenti in `groupByFile(result.quests)`. Se una corsa non produce più voci per uno dei `GENERATED_QUEST_FILES`, il file vecchio resta com'è con le sue quest, che il caricatore continuerà ad applicare. Il report `orphaned` però le dichiara uscite dal file, come dice il commento a `:36`. Oggi è improbabile (ogni regno ha sempre heal e job), ma basta un cambio di tipi nello snapshot.

**Fix suggerito:** per ogni path di `GENERATED_PATHS` presente nell'albero e assente dai gruppi, scrivere il file vuoto (solo intestazione) o cancellarlo, e coprirlo con un caso in `run-generate-quests.spec.ts`.

### LO-08: pulizia (Boy Scout)

**File e punti:**
- `src/content/generation/fixed-quests.generator.ts:1,3`: due import separati dallo stesso modulo `src/content/checking/content-index`.
- `src/content/generation/fixed-quests.generator.ts:566-567`: il commento «ripiego delle hunt: l'arma entro il tetto con più danni in totale» descrive il ripiego tolto con la revisione di D-33, e sta sopra `weaponsOf`, che non fa ripieghi.
- `src/lore/lore.service.ts:9`: import relativo `./related-lore`; la convenzione del repo (`CLAUDE.md` §Import Organization) è `src/...`, già usata in `enemies.service.ts`.
- `src/content/generation/city-profile.ts:40` vs `content/config.yaml` `dungeonHeroZones`: la stessa regola «fascia hero» (D-20) è divisa fra una costante nel codice (`necrorianCity`) e il config. L'utente può ritoccare solo metà della regola.
- `src/content/generation/city-profile.ts:6`: `KINGDOM_PREFIXES` è esportato ma usato solo nel modulo.

**Fix suggerito:**
- unire i due import;
- correggere o togliere il commento;
- uniformare l'import a `src/lore/related-lore`;
- portare `necrorianCity` in config (`dungeonHeroCityTypes`) o documentare perché resta nel codice;
- togliere l'`export` superfluo.

## Note (non difetti)

- **Gate D-25 ancora aperto lato FE:** sul `develop` del FE `lib/graphql/queries/lore_queries.dart:9` seleziona ancora `unlocked`. Come da D-25, il quick task FE deve entrare prima della merge della PR BE, altrimenti `lores` risponde con un errore di validazione.
- Il D-31 è conforme:
  - fixed spell prima del sorteggio;
  - stesso cancello di `canLearnSpell` (xp dopo i premi, magia non nota, id legacy stringa compresi);
  - nessun tiro senza il flag;
  - pool solo per le quest con `spellDraw === true`;
  - percorso GM coperto dallo stesso `readCatalog`;
  - `QuestPrizes.spellDraw` è solo `@Prop` e resta fuori dallo SDL.
- `withoutOrphanRelatedLore` muta il documento Mongoose idratato. Il comportamento è coperto dall'int-spec sul filo (`lore-related.int-spec.ts:116`).

## Riepilogo

| Severità | Numero |
| --- | ---: |
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 8 |
| **Totale** | **11** |

## File revisionati

- src/content/content-wire.int-spec.ts
- src/content/generation/city-profile.spec.ts
- src/content/generation/city-profile.ts
- src/content/generation/determinism.spec.ts
- src/content/generation/dungeon-quests.spec.ts
- src/content/generation/fixed-quests.generator.ts
- src/content/generation/hunt-quests.spec.ts
- src/content/generation/quest-descriptions.spec.ts
- src/content/generation/quest-descriptions.ts
- src/content/generation/quest-titles.ts
- src/content/generation/seeded-chance.spec.ts
- src/content/generation/seeded-chance.ts
- src/content/generation/service-quests.spec.ts
- src/content/run-generate-quests.spec.ts
- src/content/run-generate-quests.ts
- src/enemies/enemies.module.ts
- src/enemies/enemies.service.ts
- src/lore/lore-related.int-spec.ts
- src/lore/lore.service.ts
- src/lore/related-lore.ts
- src/models/lore.model.ts
- src/models/quest/quest-infos.model.ts
- src/models/quest/quest-outcome-fields.schema.spec.ts
- src/models/quest/quest-prizes.model.ts
- src/quests/outcomes/outcome-plan.spec.ts
- src/quests/outcomes/outcome-plan.ts
- src/quests/outcomes/resolution-loader.service.ts
- src/quests/outcomes/rewards/quest-rewards.spec.ts
- src/quests/outcomes/rewards/quest-rewards.ts
- src/quests/outcomes/study-spell-draw.int-spec.ts
- test/app.int-spec.ts
- test/content/generator-world.fixture.ts
- test/content/seed-world.ts
- test/fixtures/content-tree.fixture.ts
- test/fixtures/index.ts
- test/fixtures/lore.fixture.ts

Consultati per il contesto incrociato (non nel perimetro): `src/content/checking/check-content.ts`, `src/content/checking/content-index.ts`, `src/quests/quest-catalog.populate.ts`, `src/cities/cities.service.ts`, `src/quests/outcomes/aid/aid-quest.ts`, `src/quests/outcomes/gm-completion.service.ts`, `src/quests/outcomes/combatant-plan.ts`, `src/schema.gql`, `content/README.md`, `content/config.yaml`, `content/world/cities.yaml`, `content/quests/*.yaml`; nel FE, solo in lettura, `lib/graphql/**`.

---

_Reviewed: 2026-11-02T13:34:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
