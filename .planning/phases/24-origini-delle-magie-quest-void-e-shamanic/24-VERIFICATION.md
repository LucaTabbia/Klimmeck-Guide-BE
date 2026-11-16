---
phase: 24-origini-delle-magie-quest-void-e-shamanic
verified: 2026-11-15T19:56:56Z
status: human_needed
score: 12/12 must-haves verified (codice e test; boot reale, contenuto a DB e device restano all'orchestratore)
overrides_applied: 0
human_verification:
  - test: "Boot reale del BE dal ramo col migratore (BACKEND-NOTES §4, passi 1–5), a client fermi e con backup di spells, quests, questresults"
    expected: "Tre righe `Origini delle magie, …` prima di ogni altro modulo: 96 magie trovate e migrate, 0 senza corrispondenza; 1 quest rinominata in `arcane`; risultati con `magic` rinominati. Nessun WARN `Magie: …`. Secondo riavvio: `migrati 0` su tutte e tre"
    why_human: "Il migratore è provato solo su database di test; il verificatore non avvia il BE né legge il database reale"
    result: "FATTO il 2026-11-15: boot reale dal commit `791a7fd3` con backup prima; magie 96 trovate e migrate, 0 senza corrispondenza; 1 quest e 2 risultati rinominati; nessun WARN `Magie: …`; applicazione avviata. Log in BACKEND-NOTES §4"
  - test: "Rimozione del migratore dopo il boot reale (BACKEND-NOTES §4 passo 6) e registrazione del log nel handoff"
    expected: "`src/migrations/spell-origins/` cancellata, `SpellOriginsMigrationModule` tolto da `src/app.module.ts`, caso «does not mount…» in `test/app.int-spec.ts`, sezione «Log del boot reale» compilata"
    why_human: "Passo dell'orchestratore, previsto dopo il boot reale; oggi il modulo è ancora montato e il log è un segnaposto"
    result: "FATTO il 2026-11-15: cartella e voce di AppModule tolte in TDD (RED `test(migrations)`, GREEN `refactor(migrations)`), caso «does not mount…» verde, log compilato in BACKEND-NOTES §4"
  - test: "Contenuto a DB (BACKEND-NOTES §5): origine e livello rivisti delle 96 magie, ~45 magie nuove, tre lore d'origine e `relatedLore` su ogni magia, una quest `void` a Necrorian e una `shamanic` a Murnborim e a Thengran con `minTitle: mage` e `spellDraw: true`, heal e negozi da città nelle due capitali, lore delle tre città, `$unset` di `minXpToLearn` dopo la merge"
    expected: "Dopo le scritture e un riavvio: nessun WARN `Magie: …`, nessun WARN delle città di nascita, report dei negozi senza «fuori taglia» per Murnborim e Thengran"
    why_human: "Contenuto scritto dall'orchestratore dopo la revisione dell'utente, mai nel repo; il codice non può garantirlo"
    result: "FATTO il 2026-11-15 (BACKEND-NOTES §5): 96 magie aggiornate e 48 inserite (80 arcane, 32 shamanic, 32 void) con relatedLore, tre quest di scuola, heal e negozi da città, lore delle città, lore d'origine ai due personaggi con magie; resta il `$unset` di `minXpToLearn` dopo la merge"
  - test: "Finestra FE: riavvio del BE dal ramo insieme alla build della FE Phase 23 sul device"
    expected: "Nessuna operazione rifiutata per `minXpToLearn`; `cities` serve Murnborim, Thengran e Veg Faldir senza errore d'enum"
    why_human: "Dipende dal BE vero e dalla build FE sul telefono"
  - test: "UAT su device, otto passi di BACKEND-NOTES §7 (mappa, Diario, quest `arcane` di Valantar, `shamanic` con lore alla prima magia e nulla alla seconda, `void` a Necrorian e tabellone senza quest sotto mage, opzioni dell'oste, nascita di dragonborn e aarakocra)"
    expected: "Come descritto passo per passo nel handoff"
    why_human: "Comportamento end-to-end su dati reali e resa nell'app"
  - test: "Decisioni dell'utente lasciate aperte: lore d'origine sbloccabile anche dal tiro di lore dello studio (tipo `knowledge`), magie dei soli nemici sorteggiabili (A3), quest fuori dalle scuole con `spellDraw: true` (A2), campo `size` del report dei negozi che scrive la fascia"
    expected: "Una risposta per ciascuna; solo la prima può richiedere codice (esclusione dal pool o tipo diverso)"
    why_human: "Scelte di gioco, non verificabili"
---

# Phase 24: Origini delle magie, quest void e shamanic — Verification Report

**Phase Goal:** le magie prendono una macroclasse (origin → use → energy; `void`, `arcane`, `shamanic`) e nascono due scuole di quest nuove, con il BE come unica fonte di verità; livello minimo al posto dell'xp minimo; tre tipi di città; pavimento di Necrorian; lore dell'origine alla prima magia (D-01..D-24, gli emendamenti D-20..D-24 vincono).
**Verified:** 2026-11-15T19:56:56Z
**Status:** human_needed
**Re-verification:** No — verifica iniziale
**Ramo:** `feat/24-origini-magie-quest-void-shamanic`, base `a208ad3d`, 65 commit, albero pulito, 70 file di `src/` toccati.

## Metodo

Lettura del diff `a208ad3d..HEAD` dei sorgenti (non dei SUMMARY), ricerca dei residui dei nomi vecchi, tracciato dei consumatori, esecuzione di `npx tsc --noEmit` (exit 0) e di 20 suite unit della fase (687 test verdi). **Le int-spec non sono state rieseguite dal verificatore** (consegna: solo progetto `unit`): per esse valgono la lettura dei casi aggiunti e il gate 24-11; `npm run test:cov` resta all'orchestratore.

## Goal Achievement

### Observable Truths

| # | Truth (requisito) | Status | Evidence |
|---|---|---|---|
| 1 | BE-ORIGIN-01 — tre tipi di città con taglia, serviti sul filo; fascia `city` nel report dei negozi per le due capitali nuove | VERIFIED | `src/models/enums/city-type.enum.ts` (tre valori), `src/cities/city-size.ts` (`aarakocraCapital`/`dragonbornCapital` → `capital`, `dragonbornVillage` → `village`, `satisfies Record<CityType, CitySize>`), `src/schema.gql` (enum a 36 valori); `shopTierOf` in `src/shops/shop-pool.rules.ts` usato da `violationsOf` in `shop-pool.report.ts`, `CITY_TIER_SHOP_TYPES` in `shop-pool.constants.ts`; il generatore riammette le tre città via `isCityType`. Spec: `city-size.spec.ts`, `shop-pool.rules.spec.ts`, `shop-pool.report.spec.ts` (verdi), `cities.resolver.int-spec.ts` (2 casi nuovi) |
| 2 | BE-ORIGIN-02 — città di nascita dragonborn → `dragonbornCapital`, aarakocra → `aarakocraCapital` | VERIFIED | `RACE_HOME_CITY_TYPES` in `src/characters/creation/race-traits.ts`; nessun codice sposta i personaggi esistenti. Spec: `race-traits.spec.ts`, `starting-cities.reporter.spec.ts` (verdi), `starting-location.service.int-spec.ts` |
| 3 | BE-ORIGIN-03 — `SpellOrigin` e `Spell.origin: String!`, validata da Mongoose, senza effetti su combattimento e slot | VERIFIED | `src/models/enums/spell-origin.enum.ts`; `spell.model.ts` (`enum`, `required: true`, `@Field(() => String)`); `src/quests/outcomes/combat` e `src/characters/spells` senza diff e senza riferimenti a `SpellOrigin`; l'unico lettore dell'origine è `readSpellPool`. Spec: `spell-origin.enum.spec.ts` (verde), `spell-fields.int-spec.ts` |
| 4 | BE-ORIGIN-04 — `minLevelToLearn: Int!` al posto di `minXpToLearn`, `SpellInput` rimosso, reporter d'avvio | VERIFIED | `spell.model.ts` (`required`, `min: 1`); nessuna occorrenza di `minXpToLearn` né di `SpellInput` in `src/` e `test/` fuori dal migratore e dalle asserzioni di assenza; `SpellCatalogueReporter` registrato in `spells.module.ts`. Spec: `spell-catalogue.reporter.spec.ts` (verde), pin del blocco `type Spell` in `test/app.int-spec.ts` |
| 5 | BE-ORIGIN-05 — cancello a livello (dopo l'esito) su premio fisso, premio per titolo e sorteggio | VERIFIED | `outcome-plan.ts`: `drawLearnableSpell` e `canLearnSpell` ricevono `progression.level` (da `progressionAfter`/`levelRowFor`); `quest-rewards.ts` confronta `minLevelToLearn`; `learnableSpellOf` nel loader scarta i livelli non interi ≥ 1 (`isLearnLevel`). Spec: `outcome-plan.spec.ts`, `quest-rewards.spec.ts`, `resolution-loader.service.spec.ts` (verdi), `study-spell-draw.int-spec.ts`, `quest-resolution.service.int-spec.ts` |
| 6 | BE-ORIGIN-06 — cancello a livello nelle opzioni dell'oste e nella rivalidazione | VERIFIED | `mission-prize-options.service.ts`: `level: levelRowFor(character.status.xp ?? 0).level` dentro `allowanceFor`, la stessa funzione chiamata da `mission-draft-save.service.ts` (riga 319) e `guided-completion.service.ts` (riga 223); `mission-prizes.ts` `isReachedLevel`. Spec: `mission-prizes.spec.ts` (verde), `guided-mission.resolver.int-spec.ts`, `mission-draft-save.service.int-spec.ts`, `guided-completion.service.int-spec.ts` |
| 7 | BE-ORIGIN-07 — tipi `arcane`/`shamanic`/`void` identici, `magic` sparito | VERIFIED | `quest-type.enum.ts`; `REPEATABLE_TYPES` in `quest-eligibility.ts`; `isSpellSchool` nel pool di lore dello studio; alla base `QuestType.magic` aveva tre soli usi (enum, ripetibilità, pool dello studio), tutti convertiti; nessun `QuestType.magic` né `'magic'` residuo fuori dal migratore e dalle asserzioni di assenza. Spec: `spell-schools.spec.ts`, `quest-eligibility.spec.ts`, `quest-lanes.spec.ts`, `quest-start.service.spec.ts`, `combatant-plan.spec.ts` (verdi), `quest-acceptance.service.int-spec.ts`, `study-lore-draw.int-spec.ts` |
| 8 | BE-ORIGIN-08 — sorteggio filtrato per origine con tabella esplicita, altri tipi sull'intero catalogo | VERIFIED | `src/quests/spell-schools.ts` (`SPELL_ORIGIN_BY_QUEST_TYPE`, `schoolOriginOf` fail-closed con `Object.hasOwn`); `readSpellPool` filtra `{ origin }` solo per le scuole, alimentato da `quest.infos.type`; nessun tiro aggiunto. Spec: `resolution-loader.service.spec.ts` (verde), `study-spell-draw.int-spec.ts` (scuole, pool vuoto, study, magia fissa non filtrata) |
| 9 | BE-ORIGIN-09 — pavimento di Necrorian nel generatore, boss misti compresi | VERIFIED | `CITY_RANK_FLOORS`, `rankFloorOf`, `allowsRank`, `allowsMixedLower` in `generation-rules.ts`; `poiRankFloorOf` (marker e ogni POI della città), filtro dei ranghi in `compositionFor` e guardia del misto in `quest-generator.service.ts`. Spec: `generation-rules.spec.ts` (verde), `quest-generator.int-spec.ts` (describe «Necrorian rank floor (D-12)», 6 casi) |
| 10 | BE-ORIGIN-10 — migratore una tantum idempotente prima di ogni hook | VERIFIED (codice) | `src/migrations/spell-origins/` (nove file), montato solo da `AppModule`; passi dentro la factory di un provider; `spellMigrationOf` scrive solo i campi mancanti, mai `$unset`; scrittura condizionata sul valore letto; rinomina in `quests.infos.type` e `questresults.quest.type` (le sole copie persistite: `mission-draft.model.ts` ammette solo `story`/`worldMission`). Spec: `spell-fields.step.spec.ts`, `spell-origins.boot.spec.ts` (verdi), due int-spec, due casi in `test/app.int-spec.ts`. **Boot reale e rimozione: orchestratore** |
| 11 | BE-ORIGIN-11 — gate e handoff con diff SDL, finestra FE, compiti di contenuto | VERIFIED (codice e documento) | `git diff a208ad3d..HEAD -- src/schema.gql`: 1 riga tolta (`minXpToLearn: Int!`), 6 aggiunte (`aarakocraCapital`, `dragonbornCapital`, `dragonbornVillage`, `minLevelToLearn: Int!`, `origin: String!`, `relatedLore: [Lore!]!`) — identico a BACKEND-NOTES §1; `tsc --noEmit` 0; `test/authz` senza diff. **«Log del boot reale» ancora segnaposto: orchestratore** |
| 12 | BE-ORIGIN-12 — `Spell.relatedLore` filtrata per viewer e sbloccata a ogni magia imparata per qualunque via | VERIFIED | `SpellRelatedLoreResolver` registrato in `lore-visibility.module.ts`; `relatedLore` nella proiezione del loader, portata da `spellCandidateOf` (premio fisso e per titolo), dal pool del sorteggio e da `chosenSpellOf` (oste); `planParticipant` aggiunge `spellLore` all'unico `knowledgeUpdateOf` solo se la magia è imparata. Spec: `outcome-plan.spec.ts`, `chosen-rewards.spec.ts` (verdi), `lore-related.int-spec.ts` (7 casi), `study-spell-draw.int-spec.ts`, `quest-resolution.service.int-spec.ts`, `guided-completion.service.int-spec.ts` |

**Score:** 12/12 verificati nel codice.

### Decisioni D-01..D-24, lato BE

| Decisione | Esito | Nota |
|---|---|---|
| D-01, D-04 origine | Nel codice | Truth 3 |
| D-02, D-03 origini delle 96 magie, ~45 magie nuove | **Contenuto a DB (orchestratore)** | Il migratore lascia tutte `arcane` |
| D-07, D-08 livello minimo | Nel codice | Truth 4, 5, 6; conversione `levelRowFor` coerente con D-07 (4 000 → 6, 12 000 → 10, 20 000 → 12, 30 000 → 15, 50 000 → 20 sulla `LEVEL_TABLE`) |
| D-09, D-10, D-20 tipi di scuola e sorteggio | Nel codice | Truth 7, 8 |
| D-11 `void` solo a Necrorian, `shamanic` nelle due capitali da mage | **Contenuto a DB (orchestratore)** | Nessun vincolo di codice sulla posizione o sul `minTitle` di una quest scritta a mano; l'accettazione rispetta `requirements.minTitle` (provato per i tre tipi) |
| D-12 pavimento di Necrorian | Nel codice | Truth 9; vale solo per le quest generate |
| D-15, D-16 tipi di città e taglie | Nel codice | Truth 1 |
| D-18 città di nascita | Nel codice | Truth 2 |
| D-22 fascia città per heal e negozi | Report nel codice; **heal e pool reali a DB (orchestratore)** | Nessun codice deriva contenuto dalla taglia oltre al report |
| D-23 lore delle tre città | **Contenuto a DB (orchestratore)** | — |
| D-24 lore dell'origine | Meccanismo nel codice; **tre lore e collegamenti a DB (orchestratore)** | Truth 12 |
| D-05, D-06, D-13, D-14, D-17, D-19, D-21 | Solo FE | — |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/models/enums/spell-origin.enum.ts` | enum delle tre origini | VERIFIED | usato da modello, scuole, reporter, migratore |
| `src/models/spell.model.ts` | `origin`, `minLevelToLearn`, `relatedLore`; via `minXpToLearn` e `SpellInput` | VERIFIED | — |
| `src/quests/spell-schools.ts` | tabella tipo → origine | VERIFIED | consumata da `resolution-loader.service.ts` |
| `src/quests/outcomes/{outcome-plan,resolution-loader.service,rewards/quest-rewards}.ts` | cancello a livello, pool per origine, lore della magia | VERIFIED | — |
| `src/quests/guided/{mission-prizes,mission-prize-options.service,chosen-rewards}.ts` | cancello a livello dell'oste, lore | VERIFIED | — |
| `src/quests/generation/{generation-rules,quest-generator.service}.ts` | pavimento per tipo di città | VERIFIED | — |
| `src/cities/city-size.ts`, `src/models/enums/city-type.enum.ts` | tre tipi con taglia | VERIFIED | — |
| `src/characters/creation/race-traits.ts` | città di nascita | VERIFIED | — |
| `src/shops/shop-pool.{constants,rules,report}.ts` | fascia `city` | VERIFIED | — |
| `src/lore/related-lore.resolvers.ts` | `SpellRelatedLoreResolver` | VERIFIED | registrato nel modulo |
| `src/spells/spell-catalogue.reporter.ts` | conteggio al boot | VERIFIED | registrato in `SpellsModule` |
| `src/migrations/spell-origins/*` | migratore una tantum | VERIFIED, da rimuovere dopo il boot reale | montato in `src/app.module.ts` |
| `src/schema.gql` | diff dichiarato | VERIFIED | 1 tolta, 6 aggiunte |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `quest.infos.type` | filtro `{ origin }` della query delle magie | `readRewardCatalog` → `SpellPoolSource` → `readSpellPool` → `schoolOriginOf` | WIRED |
| `progression.level` | `canLearnSpell` / `drawLearnableSpell` | `planParticipant` | WIRED |
| `status.xp` | opzioni e rivalidazione dell'oste | `levelRowFor` in `allowanceFor`, chiamata da opzioni, salvataggio e completamento | WIRED |
| `Spell.relatedLore` a DB | `status.unlockedLore` e `QuestResult.loreUnlocked` | proiezione del loader → `SpellCandidate.relatedLore` → `spellLore` in `knowledgeUpdateOf` | WIRED |
| `Spell.relatedLore` sul filo | lore visibili al viewer | `SpellRelatedLoreResolver` → `VisibleLoreLoader` | WIRED |
| `City.type` | ranghi composti sul POI | `poiRankFloorOf` → `compositionFor` / guardia del misto | WIRED |
| `CityType` | fascia del report | `shopTierOf` in `violationsOf` | WIRED |
| `AppModule` | passi del migratore prima degli hook | `SpellOriginsMigrationModule` → factory asincrona | WIRED (fino alla rimozione) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Tipi coerenti | `npx tsc --noEmit -p tsconfig.json` | exit 0 | PASS |
| Suite unit della fase | `npx jest <20 spec> --selectProjects unit` | 20 suite, 687 test verdi | PASS |
| Diff SDL dichiarato | `git diff a208ad3d..HEAD -- src/schema.gql` | 1 tolta, 6 aggiunte, uguale al handoff | PASS |
| Int-spec della fase | non rieseguite (consegna: solo `unit`) | gate 24-11 dichiara 163 suite / 2 558 test | SKIP |

### Anti-Patterns Found

Nessun `TODO`/`FIXME`/`it.skip`/`it.only` nelle righe aggiunte; nessun file fuori da `src/`, `test/`, `.planning/`; nessun file di contenuto; nessun trailer di attribuzione nei 65 commit.

| File | Pattern | Severity | Impact |
|---|---|---|---|
| `BACKEND-NOTES.md` §6, BE-ORIGIN-01 | cita `src/shops/shop-pool-report.service.int-spec.ts` per D-22, ma quel file non ha diff nella fase né casi sulle due capitali | Info | La fascia `city` è provata solo a livello unit (`shop-pool.rules.spec.ts`, `shop-pool.report.spec.ts`); il cablaggio è diretto. Correggere la citazione nel handoff |
| `resolution-loader.service.ts` `readStudyLorePool` | le tre lore d'origine di tipo `knowledge` entrano nel pool dello studio | Info | Già dichiarato nel handoff come domanda aperta: sblocco possibile prima della prima magia; decisione dell'utente |

### Human Verification Required

Vedi `human_verification` nel frontmatter: boot reale col migratore, rimozione del migratore e log nel handoff, contenuto a DB (§5), finestra FE, otto passi di UAT su device, quattro decisioni aperte dell'utente.

Aggiornamento 2026-11-15: voci 1–3 fatte (boot reale col migratore, sua rimozione e log nel handoff, contenuto a DB salvo il `$unset` di `minXpToLearn` dopo la merge); restano aperte le voci 4–6.

### Gaps Summary

Nessun gap di codice. Ogni decisione lato BE è consegnata e provata; ciò che manca all'obiettivo «rivedere tutte le magie a DB, riempire il DB, quest void a Necrorian e shamanic nelle due capitali» è contenuto a DB dell'orchestratore per decisione di progetto, non un difetto del ramo. Restano il boot reale col migratore, la sua rimozione e la UAT su device.

---

_Verified: 2026-11-15T19:56:56Z_
_Verifier: Claude (gsd-verifier)_
