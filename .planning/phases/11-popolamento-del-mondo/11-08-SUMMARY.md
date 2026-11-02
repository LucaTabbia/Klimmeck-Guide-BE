---
phase: 11-popolamento-del-mondo
plan: 08
subsystem: content
tags: [content, generator, quests, seeded-rng, determinism, BE-CONTENT-06]
requires: ["11-05"]
provides:
  - "src/content/generation/seeded-chance.ts: SeededChanceSource extends ChanceSource (mulberry32) con next(), pick(items), shuffle(items)"
  - "src/content/generation/city-profile.ts: CityScale, citySizeOf, dungeonSizeKeyOf, regionalGroupOf, questFileOf, KINGDOM_PREFIXES, NO_SERVICE_CITY_TYPES, NO_CRIME_CITY_TYPES, HERO_DUNGEON_CITY_TYPES, SPELL_STUDY_CITY, COLLEGE_CITY, SPECIAL_QUEST_FILE, DUNGEON_QUEST_FILE"
  - "src/content/generation/quest-titles.ts: QUEST_TITLES (titoli italiani col nome della città)"
  - "src/content/generation/fixed-quests.generator.ts: generateFixedQuests(input) → { quests, skipped }, GeneratorInput, GeneratedQuest, SkippedQuest, GeneratorResult, CITY_WITHOUT_LORE, DUNGEON_WITHOUT_MONSTER"
  - "test/content/generator-world.fixture.ts: mondo del generatore in memoria (buildGeneratorTree/Index, generatorInput, GENERATOR_IDS, sequentialIds, withoutEnemies, addedMonster, questsOf…)"
affects: [11-23]
tech-stack:
  added: []
  patterns:
    - "generatore puro: input = ContentIndex + config + quest esistenti + factory di id; nessun DB, file, orologio o Math.random"
    - "ordine dei sorteggi fisso e documentato in testa al file (servizi per città → hunt per gruppo → dungeon per POI)"
    - "chiave stabile `type|markerLocation[|spellDraw]` per il riuso degli id (D-01)"
key-files:
  created:
    - src/content/generation/seeded-chance.ts
    - src/content/generation/city-profile.ts
    - src/content/generation/quest-titles.ts
    - src/content/generation/fixed-quests.generator.ts
    - src/content/generation/seeded-chance.spec.ts
    - src/content/generation/city-profile.spec.ts
    - src/content/generation/service-quests.spec.ts
    - src/content/generation/hunt-quests.spec.ts
    - src/content/generation/dungeon-quests.spec.ts
    - src/content/generation/determinism.spec.ts
    - test/content/generator-world.fixture.ts
  modified: []
decisions:
  - "Taglia di gioco chiamata `CityScale` ('village'|'city'|'capital') invece di `CitySize`: `CitySize` esiste già in `content-config.ts` ('Village'|'City'|'SeaCity'|'Capital') ed è il tipo di ritorno di `dungeonSizeKeyOf`"
  - "Tiri dei servizi solo nelle città di taglia `city` (Necrorian esclusa): prima il crime (mai a Ferrion), poi la study (saltata se la study è fissa per nome: Valantar, Liberia); capitali: crime e study fisse; villaggi: solo heal + job"
  - "Valantar riceve SOLO la study con `prizes.spellDraw: true` (titolo `Studi arcani a Valantar`), non anche quella senza magia; `minTitle` come le altre study della sua taglia"
  - "Hunt: gruppo = città servite (Necrorian esclusa) dello stesso `regionalGroupOf`; limite `floor(n × hunt.maxShareOfRegion)` (gruppi di una sola città: nessuna hunt); `shuffle` delle candidate ordinate per id, prime `limit`; animale sorteggiato fra quelli che vivono in almeno un POI libero, poi POI fra quelli dove vive; hunt in uscita ordinate per id di città"
  - "Dungeon: fascia = `hero` se il POI ha un tipo di `config.dungeonHeroZones` o la città è in `HERO_DUNGEON_CITY_TYPES` (`necrorianCity`), altrimenti `config.dungeonTierByCitySize[dungeonSizeKeyOf(type)]`; fallback per fascia: mostri della zona → mostri con `all` → fascia inferiore (fino a rookie); nessun candidato → `skipped` con `nessun mostro compatibile`"
  - "Il `minTitle`, la rarità del `randomLoot` e il tetto di rarità del `recommendedLoot` seguono la fascia del mostro EFFETTIVAMENTE scelto (dopo il fallback), così premi e difficoltà restano coerenti"
  - "Ordine delle fasce = `RANKED_TIERS` di `content-config.ts` (equivalente a `TITLE_RANK` senza `legend`); rarità = `RARITY_ORDER` di `cascading-loot.ts` letto al contrario; rarità sconosciuta = oggetto escluso"
  - "`randomLoot.quantity` = `config.prizes.dungeon.randomLootQuantity ?? 1`"
  - "`recommendedLoot`: fino a 2 equipaggiamenti con potenza utile (somma delle `power` dei danni base+energia il cui tipo è fra le debolezze) > 0, rarità ≤ quella della fascia, ordinati per potenza utile decrescente poi id; + la cura `effect: heal` di rarità ≤ con `power` massimo (pari merito: id)"
  - "`relatedLore` = lore `city` della città (prima voce con `city: <id>` in ordine di file) + `relatedLore` del nemico per hunt/dungeon, senza doppioni; città senza lore → una voce `skipped` `{ city: <id>, poi: null, type: '*', reason: 'città senza lore' }` per città"
  - "`skipped[].city` è l'id della città (non il nome: i nomi possono ripetersi)"
metrics:
  duration: "~30 min"
  completed: 2026-11-02
  tasks: 3
  files: 11
---

# Phase 11 Plan 08: generatore delle quest fisse Summary

Generatore puro e deterministico delle quest fisse (D-17..D-22, D-31): RNG mulberry32 con seme dal config, servizi per città (heal/job ovunque tranne Necrorian, guard, crime, study, una sola study di magia a Valantar), hunt fra animali facili al più in una città su due per gruppo regionale, una dungeon per POI dungeon con mostro della fascia della città e fallback documentati, premi in oggetti vincolati alla rarità della fascia, id riusati per chiave stabile.

## Commit

| Task | Fase TDD | Commit | Subject |
|------|----------|--------|---------|
| 1-3 | RED | `fd2816d` | `test(content): expect the fixed quest generator rules` |
| 1 | GREEN | `26831f9` | `feat(content): generate the service quests of every city` |
| 2 | GREEN | `3643a3f` | `feat(content): draw the hunts among easy animals` |
| 3 | GREEN | `f25e6de` | `feat(content): generate the dungeons and reuse quest ids` |

Nessun commit di REFACTOR: le funzioni sono già piccole e per tipo di quest (rimozione di un'interfaccia doppia fatta prima del commit GREEN del Task 3).

Fallimenti attesi del RED: tutte e 6 le suite non caricabili (`Cannot find module` di `seeded-chance`, `city-profile`, `fixed-quests.generator`): il commit RED contiene solo spec e fixture.

## Verifiche

- Task 1: `npx jest src/content/generation/seeded-chance.spec.ts src/content/generation/city-profile.spec.ts src/content/generation/service-quests.spec.ts --selectProjects unit` → `Test Suites: 3 passed`, `Tests: 39 passed`; `tsc` exit 0; `pgrep -fl jest` vuoto
- Task 2: `npx jest src/content/generation/hunt-quests.spec.ts src/content/generation/service-quests.spec.ts --selectProjects unit` → `Test Suites: 2 passed`, `Tests: 21 passed`; `tsc` exit 0
- Task 3: `npx jest src/content --selectProjects unit` → `Test Suites: 27 passed`, `Tests: 293 passed` (229 + 64 del generatore); `npx tsc --noEmit -p tsconfig.json` exit 0; `pgrep -fl jest` vuoto
- Acceptance: `extends ChanceSource` 1 riga; `0x6d2b79f5` 1 riga; `D-17|D-31` in service-quests.spec = 6; `maxShareOfRegion` nel generatore 1 riga; `D-18` in hunt-quests.spec = 3; `export function generateFixedQuests` 1 riga; `it('` in dungeon-quests.spec = 11, in determinism.spec = 6; `Math.random|new Date|readFileSync|process.` nel generatore: nessuna riga
- `npx prettier --check` ed `npx eslint` puliti su ogni file toccato; `git diff --exit-code src/schema.gql` → 0

## Esito sul mondo di prova (seme 11)

52 quest, nessuna `skipped`: heal 13, job 13, guard 8, crime 4 (3 capitali + Ondalta), study 3 (Drustal, Liberia, Valantar con `spellDraw`), hunt 5 (Drustal, Brina, Borgo Felce, Colle, Erba = 5 su 10 città del gruppo `drustea`), dungeon 6 (Drustal → Spettro errante `mage` via `all`; Corvia → Troll `paladin`; Aia → Ragno gigante `adventurer`; Borgo Felce/Harken → Kraken `hero`; Ferrion e Necrorian/Glounet → Drago del Glounet `hero`). Con questo seme nessuna delle 5 città di taglia `city` ha estratto la study (probabilità 0.4): il sorteggio è comunque coperto dal test con seme diverso (`draws differently with another seed`).

## Test (titoli)

- seeded-chance: stessa sequenza, semi diversi, valori in [0,1), pick su lista vuota, shuffle come permutazione senza mutare l'input.
- city-profile: taglie, chiavi di taglia della dungeon, tipo senza suffisso (RangeError), gruppi regionali, file per regno.
- service-quests: heal+job sul marker (D-17); Necrorian senza servizi (D-17); guard (D-17); crime capitali/mai Ferrion (D-17); crime sorteggiato «some but not all»; study capitali e Liberia (D-17); Valantar una sola study con `spellDraw` (D-31); minTitle adventurer/paladin (D-20); lore della città (D-22); titoli italiani (D-22); file per regno; ordine delle chiavi del README; città senza lore riportata.
- hunt-quests: solo animali ≤ 200 PE (D-18); al più metà del gruppo (D-17); POI non-marker non-dungeon nell'habitat (D-21); rookie (D-18); mai due quest fisse sullo stesso POI (D-21); lore dell'animale; titolo (D-22); città senza animali facili (D-18).
- dungeon-quests: una per POI dungeon (D-20); fascia per taglia (D-20); hero a Glounet/Harken/Necrorian (D-20); fallback `all` poi fascia inferiore; mai animali né leggendari; `randomLoot` della rarità della fascia (D-19); rarità inferiore più vicina (D-19); `recommendedLoot` contro le debolezze + 1 cura (D-20); minTitle dalla fascia del nemico; POI senza mostro → `skipped`; lore città + mostro (D-22).
- determinism: output identico per lo stesso seme; seme diverso → output diverso; riuso dell'id per tipo+marker (D-01); id nuovi solo alle chiavi nuove (zero chiamate alla factory alla seconda corsa); id della study di Valantar stabile e distinto da una study senza flag sullo stesso marker (D-31); le voci generate passano `checkContent` senza errori.

Casi in più rispetto al piano (stesso perimetro): titoli, file per regno, ordine delle chiavi, città senza lore, rarità di fallback, lore delle dungeon, seme diverso, passaggio di `checkContent` (garantisce a 11-23 che le voci siano valide per lo schema e per le regole delle quest fisse).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Naming] `CityScale` al posto di `CitySize` in `city-profile.ts`**
- **Trovato durante:** Task 1
- **Problema:** l'interfaccia del piano esportava un `CitySize = 'village'|'city'|'capital'`, ma `src/content/rules/content-config.ts` esporta già `CitySize = 'Village'|'City'|'SeaCity'|'Capital'` (usato dal config `dungeonTierByCitySize`): due tipi omonimi con significati diversi
- **Fix:** tipo della taglia di gioco `CityScale`; `dungeonSizeKeyOf` restituisce il `CitySize` del config; nomi delle funzioni (`citySizeOf`, `dungeonSizeKeyOf`) invariati
- **File:** `src/content/generation/city-profile.ts` — **Commit:** `26831f9`

**2. [Rule 2 - Correttezza] Fascia di `Necrorian` da costante e zone eroiche dal config**
- **Trovato durante:** Task 3
- **Problema:** il piano cita `glounet`/`harkenIsland`/`necrorianCity`; il config ha già `dungeonHeroZones` e `dungeonTierByCitySize`
- **Fix:** zone eroiche e fasce per taglia lette dal config (l'utente le ritocca, D-19); `necrorianCity` in `HERO_DUNGEON_CITY_TYPES`
- **File:** `src/content/generation/{city-profile,fixed-quests.generator}.ts` — **Commit:** `f25e6de`

**3. [Processo TDD] Moduli di supporto scritti prima del RED**
- **Trovato durante:** Task 1
- **Problema:** `seeded-chance.ts`, `city-profile.ts` e `quest-titles.ts` erano già nell'albero quando sono state scritte le spec
- **Fix:** il commit RED contiene solo spec e fixture (suite non caricabili); i moduli sono entrati nel commit GREEN del Task 1

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: codice puro senza I/O; T-11-28 (premi dal config, `randomLoot` vincolato alla rarità), T-11-29 (heal+job ovunque tranne Necrorian, hunt rookie), T-11-30 (riuso degli id), T-11-31 (seme + ordine dei tiri documentato + test di determinismo) coperti dai test.

## Note per il piano 11-23

- Entrypoint: `generateFixedQuests({ index: indexContent(tree), config: tree.config!, existingQuests: tree.entries.quests.map(e => e.raw), newId: () => new ObjectId().toHexString() })`, poi raggruppare `quests` per `file` (`drustea|valan|mirwa|fiamme|madre|liberia|speciali|dungeon`) → `content/quests/<file>.yaml`, chiavi già nell'ordine del README.
- `skipped` da riportare a console: città senza lore (`type: '*'`) e POI dungeon senza mostro.
- Le voci esistenti non più generate (chiave sparita) non vengono restituite: decidere in 11-23 se segnalarle.

## Self-Check: PASSED

- File creati presenti: i 4 moduli e le 6 spec in `src/content/generation/`, `test/content/generator-world.fixture.ts`
- Commit presenti: `fd2816d`, `26831f9`, `3643a3f`, `f25e6de`
