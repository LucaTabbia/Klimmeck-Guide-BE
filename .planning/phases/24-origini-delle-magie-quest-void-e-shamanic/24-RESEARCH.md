# Phase 24: Origini delle magie, quest void e shamanic - Research

**Researched:** 2026-11-15
**Domain:** catalogo delle magie (origine, livello minimo), tipi di quest `shamanic` e `void`, sorteggio della magia per origine, generatore (pavimento di rango di Necrorian), tipi di città e città di nascita, lato BE (NestJS 11, Mongoose 8, Apollo code-first)
**Confidence:** HIGH sul codice (letto sul ramo `feat/24-origini-magie-quest-void-shamanic`, HEAD `7544aa8b`; due sonde fuori dal repo: `tsc` su un enum col membro `void`, graphql-js su un valore di enum sconosciuto), MEDIUM sulle proposte di forma (nomi, `origin: String!`, disegno del migratore: default tecnici dichiarati), LOW su ciò che dipende dal DB reale (non letto per regola: vale quanto dice il CONTEXT)

## Summary

La fase tocca poco codice di regola e molte spec. Una magia è **un solo tipo sul filo** (`Spell`, `src/models/spell.model.ts:7-44`) e **una sola collection**: ogni altro modello la referenzia per id (nemici, equipaggiamento, premi, stati, risultati, bozza dell'oste), quindi origine e livello minimo si aggiungono in un punto e arrivano ovunque. **Non esiste alcuna mutation admin sulle magie**: `SpellInput` (`spell.model.ts:50-78`) è codice morto, assente dallo SDL. `minXpToLearn` ha tre catene di lettori: il premio fisso e il sorteggio delle quest (`quest-rewards.ts` + `resolution-loader.service.ts` + `outcome-plan.ts`), il premio scelto dall'oste (`chosen-rewards.ts`) e le opzioni dell'oste con la loro rivalidazione (`mission-prizes.ts` + `mission-prize-options.service.ts`). Il livello è già disponibile dove serve: `progressionAfter` restituisce `level` accanto a `xp` (`level-table.ts:58-71`) e `planParticipant` lo ha in mano (`outcome-plan.ts:431-435`).

I tipi di quest non sono un enum sul filo (`QuestInfos.type: String!`): aggiungere `shamanic` e `void` **non cambia lo SDL**. La `magic` oggi non ha quasi regole proprie: è nella lista delle ripetibili (`quest-eligibility.ts:28-37`) e nel pool dello studio (`resolution-loader.service.ts:717`); tutto il resto (corsia, avvio all'arrivo, sweeper, nessun soccorso, tabellone, esiti, push) deriva da «non registrata, corsia standard». Il sorteggio della magia **non dipende dal tipo ma dal flag `prizes.spellDraw`** (`readSpellPool`, `:730-746`): «la magic le insegna tutte» perché il pool è l'intera collection. Il filtro per origine entra lì, con il tipo della quest come chiave (il tipo `magic` insegna l'origine `arcane`: i nomi non coincidono, D-01 emendata).

Due scoperte fuori dal perimetro atteso. (1) `City.type` è `CityType!` sul filo: le tre città scritte a DB dall'utente con i tipi nuovi **oggi non si serializzano** (sonda graphql-js: «Enum "CityType" cannot represent value»), quindi con il BE in esecuzione `cities` e `city` rispondono errore, non solo «senza taglia». Il piano dei tipi di città va **per primo**. (2) Il generatore abbassa `minTitle` nei boss misti (`mixedBossDraftOf`, `generated-quest-draft.ts:190-216`): un boss mage di Necrorian nascerebbe con `minTitle: paladin`. Il pavimento deve coprire sia la scelta del rango sia il misto.

**Primary recommendation:** enum `SpellOrigin` (`void`, `arcane`, `shamanic`) accanto a `UseType`; `Spell.origin: String!` e `Spell.minLevelToLearn: Int!` (aggiunti prima, `minXpToLearn` tolto dopo che ogni lettore è passato al livello); un modulo puro delle «scuole» (`QuestType` → `SpellOrigin`) usato da ripetibilità, pool dello studio e `readSpellPool`; pavimento di rango **per POI** nel generatore; migratore una tantum sul modello della Phase 19 (factory di un provider, prima di ogni hook) che scrive livello e origine di default senza cancellare il campo vecchio.

<user_constraints>
## User Constraints (from CONTEXT.md)

Copia dalla FE `23-CONTEXT.md` (autorevole per entrambe le fasi, stessa numerazione) e dal puntatore `24-CONTEXT.md`.

### Locked Decisions

#### Carried forward (not re-asked)
- The backend is the source of truth (rule 4); no app chrome on gameplay (rule 1); no blocking loading in session (rule 2).
- The world lives only in the DB: origins, new spells, minimum levels, the new quests and their texts are written at DB by the orchestrator after the user's review; no content file in either repo; one-off migrators leave the repo after the real boot.
- Non-additive SDL changes are declared in the BE handoff and the FE plans that select the new fields are gated on the BE merge (schema check on the merged SDL), as in Phases 19 and 22.
- Assets with masks built on `feColorMatrix` filters are flattened with headless Chrome before the upload; the user uploads to Cloudinary and gives the new ids, wired in TDD in `lib/config/cloudinary_assets.dart`.

#### Spell origin
- **D-01 (user):** every spell carries an origin; the macro-class order is origin → use → energy. The origins are three: `void`, `arcane`, `shamanic` (wire values; BE enum next to `UseType`). **Amended 2026-11-15 (user: «arcane (cambia da magic, troppo generico)»):** the origin is `arcane`, not `magic`; the quest type keeps its name `magic` and teaches the `arcane` origin.
- **D-02 (user):** every spell at DB is reviewed and given its origin «sulla base della descrizione». The orchestrator proposes the table (96 spells today), the user reviews it before the write. First reading: about 6 void, about 8 shamanic, about 82 arcane.
- **D-03 (user, «Circa 30 per origine»):** the DB is filled with new spells until `void` and `shamanic` hold about 30 spells each (about 45 new spells), covering the 9 uses with several energies per use and spread over the levels. Same fields and same balance rules as today's catalogue (power, usages, learn time, recovery); the table is reviewed by the user before the write.
- **D-04 (assumption, stated to the user):** the origin has no effect on combat, on who can learn a spell or on the spell slots. Enemy spells get an origin like any other spell.
- **D-05 (user, «Icona, ve le mando»):** the app shows the origin with an **icon**, like use and energy; the user sends three icons. The UI plan that draws the origin is gated on those three assets. Until they arrive the model and the wire carry the origin and nothing draws it.
- **D-06 (user):** Italian names of the origins: «Arcana» (`arcane`), «Sciamanica» (`shamanic`), «Vuoto» (`void`).

#### Minimum level instead of minimum xp
- **D-07 (user):** «Le magie non devono più avere un minimo xp per impararle, ma un minimo livello, quindi rivedi il parametro in base alla tabella dei livelli personaggio». `minXpToLearn` is replaced by a minimum level (name fixed in the plan, e.g. `minLevelToLearn`); non-additive SDL change. Conversion of today's values through the BE level table (`level-table.ts`): the level whose `minXp` is the highest one not above the spell's xp (4 000 → level 6, 12 000 → level 10, 20 000 → level 12, 30 000 → level 15, 50 000 → level 20). The converted table goes to the user with the origin table (one review).
- **D-08:** every reader of the old parameter moves to the level: the spell draw of the quests, the rank prizes with a spell, the innkeeper prize options and their re-validation, the FE line that today reads «min xp». The app never computes a level: it only prints the level the backend sends.

#### Quest types `shamanic` and `void`
- **D-09 (user):** two new quest types, `shamanic` and `void`. «Funzioneranno esattamente come la missione magic»: same lane, same acceptance (no registration), same duration model, same study-lore pool, same spell draw at the end.
- **D-10 (user):** «Ognuna di loro insegnerà una magia sulla base del tipo (adesso magic le insegna tutte)»: the draw of a `magic` quest takes only spells of origin `arcane`, `shamanic` only `shamanic`, `void` only `void`; the level gate of D-07 applies to all three.
- **D-11 (user):** the `void` quest exists only in Necrorian. The `shamanic` quest is available in the two new capitals (Murnborim, `aarakocraCapital`; Thengran, `dragonbornCapital`) and is acceptable from rank mage up. These are DB quests like today's «Iniziazione arcana a Valantar» (the only `magic` quest at DB, `minTitle: mage`, `spellDraw: true`): the orchestrator writes one `void` quest in Necrorian and one `shamanic` quest in each capital, texts reviewed by the user.
- **D-12 (user):** «nessuna quest a Necrorian dovrebbe venir creata con rango minimo inferiore a mage»: the generator never creates a quest in or for Necrorian with a minimum title below mage (today Necrorian has no quest at DB). The `void` quest follows the same floor.
- **D-13 (user):** Italian names of the quest types: «Magia» stays, the new ones are «Rito sciamanico» and «Rito del Vuoto».
- **D-14 (user):** sheet assets (solo FE).

#### Cities
- **D-15 (user):** new city types, already written at DB by the user: `690961bfe74c2f6dfc837d8f` Murnborim → `aarakocraCapital`; `690961bf31795cde80768bc7` Thengran → `dragonbornCapital`; `690961bf1bf8bb61e5f6af2f` Veg Faldir → `dragonbornVillage`. Until the BE knows the three types these cities have no size (fail-closed `isCityType`).
- **D-16 (user):** the two capitals have size `capital` (BE `CITY_SIZE_BY_TYPE`); `dragonbornVillage` is a village.
- **D-17 (user):** assets (solo FE).
- **D-18 (user):** home cities of the races: dragonborn → `dragonbornCapital` (today `mountainVillage`), aarakocra → `aarakocraCapital` (today `aarakocraVillage`). Only new characters; existing characters are not moved.

#### Assets
- **D-19:** solo FE.

### Claude's Discretion
Wire shape and field names, where the origin sits in the BE model, how the generator recognises «a quest of Necrorian», the migrator (xp → level, origin default), the placement of the origin icon next to use and energy, final copy.

### Deferred Ideas (OUT OF SCOPE)
- Effects of the origin on combat or on who may learn a spell.
- `shamanic`/`void` quests in other cities.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP dice «Requirements: TBD (definiti nel plan)». Proposta (prefisso `BE-ORIGIN-NN`):

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-ORIGIN-01 | Tipi di città `aarakocraCapital`, `dragonbornCapital` (taglia `capital`), `dragonbornVillage` (villaggio) nell'enum, nella tabella esaustiva delle taglie e sul filo; le tre città a DB tornano servibili | §Q5 |
| BE-ORIGIN-02 | Città di nascita: dragonborn → `dragonbornCapital`, aarakocra → `aarakocraCapital`, solo per i personaggi nuovi | §Q5 |
| BE-ORIGIN-03 | Enum `SpellOrigin` (`void`, `arcane`, `shamanic`) e `Spell.origin` su schema Mongoose e filo; nessun effetto sul combattimento | §Q1 |
| BE-ORIGIN-04 | `Spell.minLevelToLearn` al posto di `minXpToLearn` su schema e filo (non additivo dichiarato) | §Q1, §Q2, §Q6 |
| BE-ORIGIN-05 | Cancello a livello (livello dopo l'esito, dalla tabella unica) nel premio fisso e nel sorteggio delle quest; una magia senza livello valido non si insegna | §Q2 |
| BE-ORIGIN-06 | Cancello a livello nelle opzioni dei premi dell'oste e nella loro rivalidazione a salvataggio e completamento | §Q2 |
| BE-ORIGIN-07 | Tipi di quest `shamanic` e `void` identici alla `magic`: ripetibili, senza registrazione, corsia standard, avvio all'arrivo, pool dello studio, nessun soccorso | §Q3 |
| BE-ORIGIN-08 | Il sorteggio di una quest `magic`/`shamanic`/`void` prende solo le magie dell'origine del tipo (`magic` → `arcane`, `shamanic` → `shamanic`, `void` → `void`); una magia senza origine valida non entra in nessun pool di scuola | §Q3 |
| BE-ORIGIN-09 | Il generatore non crea mai su un POI di una città `necrorianCity` una quest con `minTitle` sotto mage (boss misti compresi) | §Q4 |
| BE-ORIGIN-10 | Migratore una tantum idempotente: livello da `levelRowFor`, origine di default, prima di ogni hook; esce dal repo dopo il boot reale | §Q2 |
| BE-ORIGIN-11 | Gate (tsc, suite per aree, SDL al boot reale di test) e handoff `BACKEND-NOTES.md` per la FE Phase 23 con il diff SDL e la forma del contenuto da scrivere a DB | §Q6, §Q7 |
</phase_requirements>

## Project Constraints (from CLAUDE.md e dalle regole delle fasi precedenti)

Non esiste `docs/rules/` nel repo BE né una cartella di skill di progetto; le regole operative degli esecutori stanno nei `NN-REPO-RULES.md` di fase (modello: `23-REPO-RULES.md`). `24-REPO-RULES.md` non esiste ancora: va scritto dall'orchestratore prima dei piani.

- Stack non negoziabile: NestJS 11 + Mongoose 8 + Apollo code-first + Bull/ioredis (`CLAUDE.md` §Constraints).
- «I contratti GraphQL esistenti consumati dal FE non si rompono»: l'unica rottura ammessa è quella dichiarata dal CONTEXT (D-07, `minXpToLearn` → livello), da riportare nel handoff; il resto dello SDL è solo aggiunte.
- TDD obbligatorio (RED → GREEN → REFACTOR, titoli dei casi con `(D-NN)`), Clean Code, SoC, Boy Scout.
- Branch + PR verso `develop`; Conventional Commits in inglese; scope dei documenti `phase-24`; **nessun trailer** `Co-Authored-By` / `Generated with` / `Claude-Session`.
- Nessun secret in repo; mai leggere né stampare `.env`, `.env.*` o variabili d'ambiente; nessuna variabile d'ambiente nuova; `process.env.` solo nei provider di config.
- Mai `npm run lint` / `npm run format` / `npm run build` / `nest build` (il BE dell'utente gira da `dist/` di questo albero): solo `npx prettier --write <file>`, `npx eslint <file>`, `npx tsc --noEmit -p tsconfig.json`.
- Jest: percorsi prima di `--selectProjects`, integration sempre `--runInBand`, mai in background; una spec unitaria non importa mai `AppModule`.
- Nessun `Math.random` né `Date.now`: caso dalla porta `ChanceSource`, ora dalla porta `Clock`; **ogni tiro nuovo dopo quelli esistenti e solo quando serve** (spec a seme fisso del generatore e degli esiti).
- Nessun `jest.mock(` di moduli; prove di assenza con `toEqual` sull'output intero.
- Nessun file di contenuto nel repo (D-36 del progetto): origini, livelli rivisti, magie nuove e le tre quest le scrive l'orchestratore fuori dal repo. Un migratore una tantum esce dal repo dopo il boot reale (resta il report nel handoff).
- `src/schema.gql` si rigenera solo col boot reale di test (`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`) e si committa nello stesso piano che cambia i decoratori; i blocchi pinnati in `test/app.int-spec.ts` si aggiornano PRIMA (RED).
- Operatori Mongo solo dentro code span nei `.md`. Il database reale non si tocca dagli esecutori.

## Risposte alle domande

### Q1 — Origine: enum, modello, ogni punto in cui una magia è proiettata o esposta

**Il modello.** `Spell` (`src/models/spell.model.ts:7-44`): `useType` è `@Field(() => String)` + `@Prop({ type: String, enum: Object.values(UseType) })` (`:21-23`), `minXpToLearn` è `Int` non nullo (`:33-35`). L'enum `UseType` (`src/models/enums/use-type.enum.ts`) è registrato con `registerEnumType`, ma **non compare nello SDL**: sul filo `useType: String!` (`src/schema.gql:1022`). [VERIFIED: codice]

**`SpellInput` è codice morto.** `spell.model.ts:50-78`: unico riferimento in tutto `src` e `test` è la definizione; `grep -n "^input " src/schema.gql` non lo elenca. Non esiste alcuna mutation che crei o modifichi una magia (lista completa di `type Mutation`, `schema.gql`: nessuna voce sulle magie; `SpellsResolver` ha solo `spells` e `spell(id)`, `src/spells/spells.resolver.ts:10-18`). [VERIFIED: codice] → «admin mutations» del brief: **non esistono**; il contenuto entra solo a DB. Boy Scout: togliere `SpellInput` nello stesso piano che tocca il modello (commit `refactor` separato), invece di aggiornare un input che nessuno usa.

**Dove una magia arriva sul filo** (tutti con lo stesso tipo `Spell`, per riferimento alla collection `spells`): [VERIFIED: codice]

| Punto | Riferimento |
|-------|-------------|
| query `spells`, `spell(id)` | `src/spells/spells.resolver.ts:10-18`, lettura idratata `spells.service.ts:13-21` |
| `Enemy.spells: [Spell!]!` | `src/models/enemy.model.ts:45-51`, populate `src/enemies/enemies.service.ts:12-15` |
| `EquipmentItem.addedSpell: Spell` | `src/models/equipment-item.model.ts:27-33` |
| `QuestPrizes.spell`, `QuestRankPrize.spell` | `src/models/quest/quest-prizes.model.ts:37-43`, `quest-rank-prize.model.ts:34-37`, populate `src/quests/quest-catalog.populate.ts` |
| `SpellState.spell: Spell!` (personaggio) | `src/models/character/spell-state.model.ts:9-16` |
| `QuestResult.spellLearned`, `SpellUsage.spell` | `src/models/quest-result/quest-result.model.ts:91-99, 278-284` |
| `MissionPrizeOptions.spells: [Spell!]!` (oste) | `src/quests/guided/mission-draft.wire.ts:227-228`, lettura `mission-prize-options.service.ts:110-113` |

Nessuna copia incorporata della magia in altri documenti: le magie dei nemici sono ref dalla Phase 19 (handoff 19, riga «magie dei nemici»). Quindi D-04 «le magie dei nemici prendono un'origine come le altre» è vero per costruzione: sono documenti della stessa collection.

**Dove va l'enum.** `src/models/enums/spell-origin.enum.ts`, accanto a `use-type.enum.ts` (D-01):

```ts
export enum SpellOrigin {
    void = 'void',
    arcane = 'arcane',
    shamanic = 'shamanic',
}
```

`void` come nome di membro compila (sonda: `tsc --noEmit --strict` su un file con `SpellOrigin.void` e `Record<SpellOrigin, number>`, uscita 0) ed è un valore di enum GraphQL valido (sonda graphql-js: serializzato `"void"`). [VERIFIED: sonde fuori dal repo]

**Campo sul modello** (raccomandato, speculare a `useType`):

```ts
@Field(() => String)
@Prop({ type: String, enum: Object.values(SpellOrigin), required: true })
origin: SpellOrigin;
```

**`String!` e non `SpellOrigin!` sul filo** (default tecnico, alternativa in §Conflitti C-3): con un enum GraphQL un valore fuori tabella scritto a mano a DB annulla la magia e risale fino al personaggio (`SpellState.spell: Spell!`); è esattamente il guasto che oggi colpisce `City.type` (§Q5). Con `String!` il filo regge e la regola di dominio resta fail-closed (un'origine non riconosciuta non entra in nessun pool di scuola, §Q3). Nessun `registerEnumType` se l'enum non è tipo di un campo.

**Niente default implicito** sul prop: il commento di regola è «mai valori impliciti» (`resolution-loader.service.ts:180`). Il campo non nullo sul filo è garantito dal migratore (§Q2) e sorvegliato da un reporter d'avvio che conta le magie senza origine o senza livello validi (solo il numero nel log, modello `starting-cities.reporter.ts`).

### Q2 — `minXpToLearn` → livello minimo: lettori, livello disponibile, migratore

**Nome:** `minLevelToLearn` (quello suggerito dal CONTEXT).

**Lettori e scrittori nel codice di produzione** (grep completo su `src` e `test`): [VERIFIED: codice]

| File:riga | Ruolo | Cambio |
|-----------|-------|--------|
| `src/models/spell.model.ts:33-35` | schema + filo | `minLevelToLearn` (Int, non nullo) |
| `src/models/spell.model.ts:70-71` | `SpellInput` morto | rimosso con l'input |
| `src/schema.gql:1018` | SDL | riga sostituita (§Q6) |
| `src/quests/outcomes/rewards/quest-rewards.ts:38-42` | `SpellCandidate.minXpToLearn` | `minLevelToLearn` |
| `…/quest-rewards.ts:77` | `RewardCatalog.spells` (magie fisse) | idem |
| `…/quest-rewards.ts:208-221` | `spellCandidateOf` (premio fisso, anche dei blocchi per titolo) | idem |
| `…/quest-rewards.ts:297-309` | `canLearnSpell(candidate, xpAfter, …)` | secondo argomento = livello dopo l'esito |
| `…/quest-rewards.ts:312-333` | `drawLearnableSpell(draw, xpAfter, …)` | idem |
| `src/quests/outcomes/resolution-loader.service.ts:162-167` | `LearnableSpellEntry`, `LEARNABLE_SPELL_PROJECTION` | proiezione `{ minLevelToLearn: 1, maxUsages: 1 }` (+ `origin` per il pool, §Q3) |
| `…/resolution-loader.service.ts:181-188` | `learnableSpellOf` (magia senza soglia valida = non si insegna) | validità = intero ≥ 1 |
| `…/resolution-loader.service.ts:665-682` | `readFixedSpells` | idem |
| `…/resolution-loader.service.ts:730-746` | `readSpellPool` | idem + filtro per origine |
| `src/quests/outcomes/outcome-plan.ts:476-486` | chiamate ai due cancelli con `progression.xp` | `progression.level` |
| `src/quests/guided/chosen-rewards.ts:34-46` | `chosenSpellOf` (premio scelto dall'oste) | campo rinominato |
| `src/quests/guided/mission-prizes.ts:27-30, 48-55, 112-128` | `SpellCatalogueEntry`, `MissionPrizeOptionsInput.xp`, `learnableSpells` | `minLevelToLearn`, `level` |
| `src/quests/guided/mission-prize-options.service.ts:46-49, 137-149, 159-166` | proiezione del catalogo, `xp: character.status.xp ?? 0` (`:163`) | proiezione nuova, `level` |
| `test/fixtures/spell.fixture.ts:15` | fixture condivisa | `minLevelToLearn: 1`, `origin: 'arcane'` |

`src/quests/prizes/rank-prizes.ts` **non legge** il parametro: copia `spell` e `spellDraw` nel blocco (`:42-54`) e il cancello resta in `planParticipant`. «I premi per titolo con una magia» di D-08 passano quindi dalla stessa catena di `quest-rewards.ts`.

**Spec e int-spec che citano il campo** (conteggio occorrenze): `outcomes/outcome-plan.spec.ts` 14, `outcomes/study-spell-draw.int-spec.ts` 14, `outcomes/rewards/quest-rewards.spec.ts` 7, `outcomes/resolution-loader.service.spec.ts` 6, `guided/mission-prizes.spec.ts` 5, `outcomes/quest-resolution.service.int-spec.ts` 4, `quests.resolver.int-spec.ts` 4 (una è un documento GraphQL che seleziona `minXpToLearn`, `:62`), `guided/guided-mission.resolver.int-spec.ts` 4, `guided/chosen-rewards.spec.ts` 2, `guided/mission-draft-save.service.int-spec.ts` 2, `guided/mission-draft-prefill.spec.ts` 1, `guided/guided-completion.service.int-spec.ts` 1.

**Come il livello è disponibile dove si controlla il cancello.**
- Esito di una quest: `progressionAfter` (`level-table.ts:58-71`) restituisce `{ xp, level, … }` con `level = levelRowFor(xp).level`; `planParticipant` lo calcola a `outcome-plan.ts:431-435` e oggi passa `progression.xp` ai cancelli (`:480, :485`). Basta passare `progression.level`: è il livello **dopo** i premi di xp, come oggi l'xp dopo i premi (commento D-17 a `quest-rewards.ts:296`).
- Opzioni dell'oste: lo snapshot del personaggio ha `status.xp` (`mission-prize-options.service.ts:163`). Raccomandato `levelRowFor(character.status.xp ?? 0).level`: stessa fonte del cancello finale (il livello deriva sempre dall'xp nella tabella unica), mai `status.level` salvato, che una mano a DB può aver lasciato disallineato. È il livello **prima** dell'esito, come oggi l'xp (comportamento invariato: il cancello finale resta `planParticipant`).
- Nessun altro punto calcola livelli: `levelRowFor` ha due soli chiamanti (`level-table.ts:64`, `status-facts.ts:26`).

**Conversione (D-07), verificata sulla tabella** (`level-table.ts:6-27`): `levelRowFor(4 000)` = 6 (soglia 3 950), `12 000` → 10 (11 850), `20 000` → 12 (17 350; il 13 parte a 20 550), `30 000` → 15 (27 650), `50 000` → 20. Coincide con il CONTEXT. Effetto di regola: il cancello a livello non è mai più severo di quello a xp (4 000 xp → livello 6 = 3 950 xp).

**Validità del livello letto lean:** intero ≥ 1 (`Number.isInteger`), altrimenti la magia non si insegna (stessa regola fail-closed di oggi). Un livello sopra 20 resta semplicemente irraggiungibile.

**Migratore: precedente.** La Phase 23 non ne ha avuti (handoff 23: «Nessuna … migrazione, seeder o one-off»). Il modello è la Phase 19: cartella `src/migrations/model-review/`, rimossa dopo il boot reale col commit `0822feee` (RED `c3492ced` in `test/app.int-spec.ts`: «does not mount the one-off model review migration»). Forma (da `git show 0822feee^:src/migrations/model-review/…`): [VERIFIED: git]
- contratto `ModelReviewStep { label; run(): Promise<{ found, migrated, alreadyDone, unmatched }> }` e riga di log «…: trovati N, migrati N, già a posto N, senza corrispondenza N» (`model-review.step.ts`);
- i passi girano **dentro la factory asincrona di un provider** (`modelReviewBootProvider`, `model-review.boot.ts`): Nest attende le factory prima del primo `onModuleInit`, quindi prima di processor, sweep, HTTP e WS; un passo fallito lancia un errore nuovo senza causa (lo stack del driver potrebbe portare l'URI) e ferma il boot;
- modulo importato **solo** da `AppModule` (gli harness non migrano), con commento «esce dal repo dopo il boot reale»;
- scritture condizionate sul valore letto (`asRead`), seconda corsa = zero scritture, int-spec per passo con documenti legacy inseriti dalla collection grezza.

**Disegno per la Phase 24** (un solo passo, `src/migrations/spell-origins/`):
1. Funzione pura `spellMigrationOf(doc)` (spec unitaria): da `{ minXpToLearn, minLevelToLearn, origin }` letti lean a `{ set } | 'alreadyDone' | 'unmatched'`. `minLevelToLearn` assente e `minXpToLearn` numero finito ≥ 0 → `levelRowFor(minXpToLearn).level`; `origin` assente → `SpellOrigin.arcane` (default di D-02: «circa 82 arcane»; la tabella rivista dall'utente la sovrascrive dopo); `minLevelToLearn` assente e `minXpToLearn` non valido → `unmatched`, documento lasciato com'è (atteso 0: il CONTEXT dice 96 magie tutte con valori fra 4 000 e 50 000).
2. Passo: lettura lean delle magie a cui manca uno dei due campi (filtro con `$exists` su `minLevelToLearn` e `origin`), un `updateOne` per documento con `$set` dei soli campi mancanti e filtro di guardia sui valori letti. 96 documenti: nessun bisogno di bulk.
3. **Non cancella `minXpToLearn`** (default tecnico, §Conflitti C-5): lo schema Mongoose strict lo ignora, i lettori lean non lo proiettano più, e il codice di `develop` continua a funzionare sul database migrato (ritorno indietro senza ripristino del backup, al contrario della Phase 19). Il `$unset` lo fa l'orchestratore con lo script di contenuto dopo la merge di BE e FE; va scritto nel handoff.
4. Idempotenza: seconda corsa «trovati 0» (o «già a posto» = trovati).
5. Uscita dal repo: dopo il boot reale, RED/GREEN come `c3492ced` / `0822feee`, a cura dell'orchestratore; nel handoff resta il report (righe di log, conteggi).

**Ordine col contenuto.** Dopo il migratore ogni magia ha origine `arcane` e livello convertito: il filo non nullo regge subito. Poi l'orchestratore scrive la tabella rivista (origini vere, livelli corretti a mano, ~45 magie nuove, che nascono già con `origin` e `minLevelToLearn` e senza `minXpToLearn`).

### Q3 — `shamanic` e `void` identici alla `magic`; sorteggio per origine

**`QuestType`** (`src/models/enums/quest-type.enum.ts:3-17`) ha 13 valori; sul filo il tipo è `String!` (`src/models/quest/quest-infos.model.ts:24-26`; nessun `enum QuestType` in `schema.gql`): **aggiungere due valori non cambia lo SDL**. Il prop Mongoose ha `enum: Object.values(QuestType)` (si aggiorna da solo). [VERIFIED: codice]

**Inventario di ogni regola sul tipo** (grep di `QuestType.` e di `infos.type` su tutto `src`, spec escluse): [VERIFIED: codice]

| Regola | Dove | `magic` oggi | Cosa fare per `shamanic` / `void` |
|--------|------|--------------|-----------------------------------|
| Ripetibili | `REPEATABLE_TYPES`, `acceptance/quest-eligibility.ts:28-37` | dentro | **aggiungere i due tipi** |
| Registrate (capienza) | `REGISTERED_TYPES`, `:39-45` | fuori | nulla (default = non registrata) |
| Posti a titolo | `TITLED_SEAT_TYPES`, `:47-51` | fuori | nulla |
| Titolo minimo | `meetsTitle`, `:83-93` (solo `story` è speciale) | `rank >= minRank` | nulla (`minTitle: mage` è contenuto) |
| Corsia | `laneOf`, `acceptance/quest-lanes.ts:30-34` | standard (default) | nulla |
| Posti della enemy | `questSlotsOf`, `acceptance/quest-capacity.ts:42-49` | non toccata | nulla |
| Avvio all'arrivo | `soloStartDateOf`, `party/quest-start.service.ts:81-89` (derivata da corsia + non registrata) | sì | nulla |
| Sweep dei party | `PARTY_TYPES`, `outcomes/scheduling/quest-resolution.updates.ts:15-18` (derivata) | fuori | nulla |
| Tipo di risoluzione | `outcomes/resolution-kind.ts:17-19` (boss, aid) | standard | nulla |
| Apertura del soccorso | `AID_OPENING_TYPES`, `outcomes/aid/aid-opening.ts:4-10` | fuori (sconfitta = 1 di vita, nessun soccorso) | nulla |
| Strappata durante un soccorso | `RESCUE_LOCKED_TYPES`, `aid-opening.ts:17-20` | fuori | nulla |
| Evento di fine (guardia, crime) | `outcomes/conclusion/conclusion-event.drawer.ts:41-44` | nessuno | nulla |
| Premi per titolo | `GROUP_PRIZE_TYPES`, `prizes/rank-prizes.ts:7-11` | fuori (premio unico) | nulla |
| **Pool dello studio** | `readStudyLorePool`, `outcomes/resolution-loader.service.ts:713-727`, condizione a `:717` (`study` o `magic`) | dentro | **aggiungere i due tipi** |
| **Sorteggio della magia** | `readSpellPool`, `:730-746`: dipende da `prizes.spellDraw`, **non dal tipo** | intera collection | **filtro per origine** (sotto) |
| Senza effetto | `no-effect/quest-no-effect.resolver.ts:23`, `quest-acceptance.service.ts:398` (solo `heal`) | no | nulla |
| Tabellone | `quest-board.ts:47-63` (solo `story` ha un ramo) | per POI | nulla |
| Avanzamento del titolo | `outcome-plan.ts:452-455` (solo `story`) | no | nulla |
| Tetti dei premi dell'oste | `guided/mission-prizes.ts:69-73` | non pertinente (solo story e worldMission arrivano all'oste) | nulla |
| Generatore | `generation/*` (solo `enemy` e `boss`) | mai generata | nulla |
| Push | nessun testo dipende dal tipo di quest (`src/push/`: nessun riferimento a `QuestType`) | — | nulla |
| Esiti | `QuestResult.quest.type` è la fotografia del tipo come stringa (`outcome-plan.ts:250`) | — | nulla |

Quindi i cambi di regola sono **tre**: ripetibilità, pool dello studio, pool del sorteggio. Tutto il resto è già vero per default; lo provano le spec con tabelle esaustive, che vanno in RED appena l'enum cresce: `quest-lanes.spec.ts:13-27` (`Record<QuestType, QuestLane>`, non compila senza le due voci) e `quest-eligibility.spec.ts:65-79` (`Record<QuestType, boolean>`). Le spec con `it.each(Object.values(QuestType))` (`aid-opening.spec.ts:13, 34`, `rescue-lock.spec.ts:48`) coprono i due tipi da sole.

**Modulo delle scuole** (puro, proposto `src/quests/spell-schools.ts`): una sola tabella, tre consumatori.

```ts
export const SPELL_ORIGIN_BY_QUEST_TYPE: Readonly<Partial<Record<QuestType, SpellOrigin>>> = {
    [QuestType.magic]: SpellOrigin.arcane,
    [QuestType.shamanic]: SpellOrigin.shamanic,
    [QuestType.void]: SpellOrigin.void,
};
export const schoolOriginOf = (type: unknown): SpellOrigin | null => …;   // null fuori dalle tre scuole
export const isSpellSchool = (type: unknown): boolean => schoolOriginOf(type) !== null;
```

- `REPEATABLE_TYPES`: le tre scuole entrano dalla tabella (o le due voci nuove scritte a mano: scelta di stile del piano).
- `readStudyLorePool`: `type !== QuestType.study && !isSpellSchool(type)`.
- `readSpellPool`: riceve anche il tipo della quest.

**Filtro per origine nel sorteggio.** Oggi: `readSpellPool(prizes)` → `find({}, LEARNABLE_SPELL_PROJECTION)` se `prizes.spellDraw === true`. La firma pubblica è `readRewardCatalogFor(refs, spellPoolSource)` (`:627-662`), chiamata da `readRewardCatalog(quest)` con `quest.prizes` (`:617-624`) e dai due servizi dell'oste con `null` (`guided/mission-draft.service.ts:191-194`, `guided/guided-completion.service.ts:149-152`: l'oste non sorteggia mai). Cambio minimo: la sorgente del pool diventa `{ prizes, questType } | null`; `readRewardCatalog` passa `quest.infos?.type`; i chiamanti dell'oste restano a `null`.

```ts
// forma, da implementare in TDD
const origin = schoolOriginOf(source.questType);
const filter = origin ? { origin } : {};          // fuori dalle scuole: catalogo intero, come oggi (§Conflitti C-4)
this.spellModel.find(filter, LEARNABLE_SPELL_PROJECTION).lean()…
```

Il filtro sta nella query (il valore è una costante dell'enum, mai un input). **Nessun tiro nuovo e nessun tiro spostato**: `spellDrawOf` consuma cancello e scelta quando `spellDraw` è vero, a pool pieno o vuoto (`quest-rewards.ts:225-236`); un pool di scuola vuoto (origine senza magie imparabili) dà «nessuna magia», come oggi a `learnable.length === 0` (`:326`). L'ordine per id esadecimale resta (`:741-745`).

**Il cancello a livello vale per tutte e tre** (D-10) perché è in `drawLearnableSpell`, a valle del pool. La magia fissa (`prizes.spell`) vince sul sorteggio (`outcome-plan.ts:475-483`) e **non** è filtrata per origine: D-10 parla del sorteggio. Le opzioni dell'oste non filtrano per origine (story e worldMission non sono scuole).

**Test esistenti sulla `magic` da rendere parametrici sui tre tipi:** `outcomes/study-spell-draw.int-spec.ts:182, 248`, `outcomes/study-lore-draw.int-spec.ts:152`, `acceptance/quest-acceptance.service.int-spec.ts:1014, 1030` (accettazione con `minTitle: mage`), `acceptance/quest-eligibility.spec.ts:57-63, 109`, `outcomes/combatant-plan.spec.ts:338` (nessun soccorso), `outcomes/outcome-plan.spec.ts:1977`.

### Q4 — Generatore: come una quest generata è legata a una città, e la regola minima per Necrorian

**Il legame.** `QuestGenerator.runOnce` (`generation/quest-generator.service.ts:207-233`): `pickCityOf` (peso per taglia e densità, `city-picker.ts:75-83`) → `pickPoi` fra i POI liberi della città (`city-picker.ts:108-127`: i `pointsOfInterest` della città, escluso il marker e i POI con una quest aperta) → `createOn(world, city, poiId)` (`:262-307`). La quest generata porta **solo** `infos.markerLocation = poiId` (`generated-quest-draft.ts:149`): nessun campo «città». Una quest è «di una città» perché il suo marker è fra i POI della città: è la stessa definizione del tabellone (`quest-board.ts:36-38, 47-51`, `cityPoiIdsOf`). Della città il generatore usa nome e lore per titolo e descrizione (`:288`). [VERIFIED: codice]

**Il rango.** `compositionFor` (`:333-347`) prova i ranghi in ordine di copertura **mondiale** (`ranksByCoverage`, `:114-120`, sui cinque `GENERATED_RANKS` rookie–hero, `generation-rules.ts:11-17`) e prende il primo che il POI riesce a comporre (`composeQuest`, `quest-composition.ts:237-246`). `minTitle` = rango della composizione (`generated-quest-draft.ts:166`).

**La trappola del boss misto.** `mixedOf` (`quest-generator.service.ts:310-330`): un boss su due riceve anche posti del titolo inferiore e `mixedBossDraftOf` **abbassa `minTitle` al titolo inferiore** (`generated-quest-draft.ts:190-216`, riga `:199`). Un boss mage misto ha `minTitle: paladin`. Filtrare i ranghi non basta.

**Oggi la città non porta il tipo nel mondo del generatore.** `WorldCity` ha `id, location, freePoiIds, size, name, relatedLore` (`:86-89`, `city-picker.ts:24-29`); il tipo si legge in `readWorld` solo per la taglia (`:401-415`). Necrorian è `necrorianCity`, taglia `capital` (`city-size.ts:29`): se ha POI liberi può ricevere fino a 4 generate (`city-picker.ts:7-11`) di qualunque rango. Che oggi non ne abbia è un fatto del DB, non una regola del codice.

**Regola minima raccomandata: pavimento di rango per POI.**
1. `generation-rules.ts`: `CITY_RANK_FLOORS: Readonly<Partial<Record<CityType, GeneratedRank>>> = { necrorianCity: mage }` e due funzioni pure, `ranksFrom(floor)` (i `GENERATED_RANKS` da quel rango in su; `null` = tutti) e `allowsRank(floor, rank)`.
2. `readWorld`: una mappa `poiRankFloor` (POI → pavimento) costruita da **ogni** città con un pavimento, sui suoi `pointsOfInterest` e sul marker. Per POI e non per città scelta: se un POI di Necrorian comparisse anche fra i POI di un'altra città, la quest starebbe comunque sul tabellone di Necrorian (stessa definizione del tabellone). È la lettura di «in or for Necrorian» di D-12.
3. `compositionFor(world, poiTypes, floor)`: `ranksByCoverage(...)` filtrato con `allowsRank`. Nessuna composizione possibile ai ranghi ammessi → `null` → il POI esce dalla corsa (comportamento già esistente, `:268-269`, `:221`).
4. `mixedOf`: se il titolo inferiore è sotto il pavimento, restituisce la bozza **senza tirare** (boss mage di Necrorian mai misto; boss hero misto con posti mage ammesso, `minTitle: mage`).

**Ordine dei tiri.** Nessun tiro nuovo. Per le città senza pavimento la sequenza è identica tiro per tiro. Per un POI con pavimento la sequenza cambia (meno ranghi provati, nessun tiro del misto), ma i mondi di test a seme fisso usano solo `drusteaVillage` / `drusteaCity` / `drusteaCapital` (`test/quests/generation-world.ts:90-94`): le spec «repeats the same quests for the same seed», «keeps the enemies identical draw by draw», «pins the draws of a mixed boss at the tail» (`quest-generator.int-spec.ts:834, 918, 937`) restano verdi senza toccarle. [VERIFIED: codice]

**Fuori dal generatore.** Nessuna mutation crea quest (lista di `type Mutation`): le sole altre fonti sono il contenuto a DB (la quest `void`, D-11: `minTitle` da mage in su, a cura dell'orchestratore) e l'aid nata da una sconfitta, che eredita `minTitle` dalla quest d'origine (`outcomes/aid/aid-quest.ts:181`): un'aid di Necrorian resta da mage in su.

**Harness.** `persistGenerationWorld` accetta le taglie (`sizes`), non i tipi (`generation-world.ts:31-45, 254-282`): serve un'opzione per dare a una città il tipo `necrorianCity` (Wave 0).

### Q5 — Tipi di città, taglie, consumatori, città di nascita

**Stato di oggi, più grave di quanto dica D-15.** `City.type` è `@Field(() => CityType)` non nullo (`src/models/city.model.ts:15-17`; SDL `type: CityType!`, pin a `test/app.int-spec.ts:583`). graphql-js rifiuta di serializzare un valore fuori dall'enum (sonda: `Enum "CityType" cannot represent value: "aarakocraCapital"`, campo a `null`); su un campo non nullo l'errore risale: la città diventa `null`, e in `cities: [City!]!` cade l'intera lista. Inoltre `size` è `CitySize!` e `citySizeOf` (`src/cities/city-size.ts:41-43`) restituisce `undefined` per un tipo ignoto (`cities.resolver.ts:23-26`). **Con le tre città già scritte a DB, il BE in esecuzione risponde errore a `cities` (e a `city` per quelle tre)** finché non conosce i tipi. [VERIFIED: sonda graphql-js + codice; non provato sul BE reale] → il piano dei tipi di città è il **primo** della fase; l'orchestratore valuti se anticiparlo sul BE in esecuzione (§Open Questions 1).

**Cosa cambia.**
- `src/models/enums/city-type.enum.ts:3-37`: tre valori nuovi (33 → 36).
- `src/cities/city-size.ts:5-39`: `CITY_SIZE_BY_TYPE` è `as const satisfies Record<CityType, CitySize>` → **non compila** finché le tre voci mancano (è la rete voluta da D-01 della Phase 12). `aarakocraCapital` e `dragonbornCapital` → `capital`, `dragonbornVillage` → `village` (D-16). `isCityType` (`:46-48`) legge la stessa tabella.
- SDL: tre valori in più in `enum CityType` (additivo).

**Consumatori di tipo e taglia** (grep completo): [VERIFIED: codice]

| Consumatore | Riferimento | Effetto dei tipi nuovi |
|-------------|-------------|------------------------|
| `City.size` sul filo | `cities.resolver.ts:23-26` | servita (capital / village) |
| Generatore: città saltate se il tipo è ignoto, taglia per tetto e peso | `quest-generator.service.ts:401-415`, `city-picker.ts:7-22` | le tre città rientrano nel mondo: le due capitali con tetto 4 e peso 4, il villaggio 1 e 1 (oggi sono saltate con un WARN) |
| Report dei negozi: rarità ammesse per taglia | `shops/shop-pool.report.ts:66-67`, `shop-pool.constants.ts:7-16` | il report giudica i pool delle due capitali con le rarità da capitale; **il pool a DB non cambia da solo** («la mano vince») |
| Città senza negozio | `shop-pool.constants.ts:19` (`necrorianCity`) | invariato |
| Città di nascita | `characters/creation/race-traits.ts:36-46`, `starting-location.service.ts:26-50`, `starting-cities.reporter.ts:9-17` | D-18 |
| Quest heal per taglia, descrizioni per taglia | **contenuto a DB** (Phase 18: script fuori repo, per `citySizeOf` al momento della scrittura) | nessun codice; il contenuto delle due capitali resta quello della taglia di prima (§Conflitti C-6) |

Nessun'altra regola è indicizzata sul tipo o sulla taglia (viaggio, imboscate, lore, push: nessun riferimento).

**Città di nascita (D-18).** `RACE_HOME_CITY_TYPES` (`race-traits.ts:36-46`): `aarakocra: [aarakocraVillage]` (`:42`) → `[aarakocraCapital]`; `dragonborn: [mountainVillage]` (`:43`) → `[dragonbornCapital]`. `StartingLocationService.resolveFor` sceglie fra tutte le città esistenti dei tipi della razza (`starting-location.service.ts:26-50`): con un solo tipo e una sola città (Murnborim, Thengran) la nascita è deterministica. Solo i personaggi nuovi: la posizione si scrive alla creazione, nessuna lettura successiva della tabella. `StartingCitiesReporter` avvisa al boot se una razza non ha città (`starting-cities.reporter.ts:32-50`): atteso nessun WARN, le due capitali esistono a DB.

**Spec che vanno in RED per scelta:** `cities/city-size.spec.ts:41` («counts 13 villages, 9 cities and 11 capitals» → 14 / 9 / 13), `characters/creation/race-traits.spec.ts:39-40`, `starting-cities.reporter.spec.ts:14-15`, `starting-location.service.int-spec.ts:73-74`, `character-creation.resolver.int-spec.ts:149` (semina `mountainVillage` per il dragonborn).

### Q6 — Diff SDL atteso

`sortSchema: true` (`src/graphql/graphql-options.factory.ts:54`): campi e valori in ordine alfabetico.

**Non additivo (dichiarato, D-07)** — una riga tolta:

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
  requiredLearnTime: Int!
  useType: String!
}
```

Rispetto a `schema.gql:1013-1023`: tolta `minXpToLearn: Int!`, aggiunte `minLevelToLearn: Int!` e `origin: String!`.

**Additivo:**

```graphql
enum CityType {
  aarakocraCapital
  aarakocraVillage
  desertVillage
  dragonbornCapital
  dragonbornVillage
  drusteaCapital
  …
}
```

**Nessun diff:** tipi di quest (`String!`), `SpellInput` (mai stato nello SDL), mutation, input, codici d'errore, push. Nessun handler nuovo → `test/authz/expected-handlers.ts` e la matrice di autorizzazione non cambiano; `src/validation/input-decorators.spec.ts` non cambia.

**Conseguenza per la FE** (da dichiarare nel handoff): la FE di oggi seleziona `minXpToLearn` nei due frammenti della magia (`lib/graphql/fragments/spell_fragment.dart:13, 38`, letto in sola lettura). Dopo il riavvio del BE dal ramo **ogni operazione che usa quei frammenti è rifiutata in validazione** (personaggio compreso) finché sul device non gira la build della FE Phase 23. Stesso schema delle Phase 19 e 22: piani FE gated sulla merge, UAT con le due build insieme.

**Pin da aggiungere in `test/app.int-spec.ts` (RED prima):** blocco esatto di `type Spell` (oggi non pinnato; modello: il pin di `SpellState` a `:567-568`), presenza dei tre valori in `enum CityType` (il blocco `type City` a `:583` non cambia), assenza di `minXpToLearn` nello schema.

### Q7 — Strategia di test, baseline, ordine dei piani

**Baseline** (handoff 23, dopo le correzioni della review): `tsc` 0; unit 304 suite / 4 206 test; integration 160 suite; boot reale `test/app.int-spec.ts` 102; `test:cov` 464 suite / 6 657 test. Il ramo parte da `fix/23-dungeon-xp-and-innkeeper-corrections` (PR #43), che può aver spostato i numeri: il primo piano li rilegge. In questa ricerca: eseguite solo tre spec unitarie (`city-size`, `race-traits`, `quest-lanes`: 3 suite, 78 test verdi) per provare l'ambiente; suite complete **non** eseguite.

**Unit (funzioni pure):** tabella delle taglie e conteggi; città di nascita; `schoolOriginOf` / `isSpellSchool`; `isRepeatable` e `laneOf` con le tabelle esaustive; `canLearnSpell` e `drawLearnableSpell` a livello (confine: livello uguale alla soglia impara, uno sotto no); `learnableSpells` dell'oste; `ranksFrom` / `allowsRank`; passo puro del migratore (conversione sui cinque valori del CONTEXT e sui confini 3 949 / 3 950); reporter delle magie non servibili.

**Integration (`*.int-spec.ts`, `MongoMemoryReplSet`):** `cities` serve le tre città nuove con la taglia; creazione di un dragonborn e di un aarakocra nella capitale; sorteggio per origine (tre tipi × tre origini: una `shamanic` non insegna mai una magia `arcane`, una `magic` insegna solo `arcane`, pool di scuola vuoto = nessuna magia e stessi tiri consumati); pool dello studio per i tre tipi; accettazione, avvio all'arrivo e risoluzione di `shamanic` e `void` come la `magic`; opzioni dell'oste e rivalidazione a livello; generatore con una città `necrorianCity` (nessuna quest sotto mage su N corse a semi diversi, boss misti compresi; mondo senza Necrorian identico tiro per tiro); migratore (documenti legacy dalla collection grezza, seconda corsa a zero scritture, documento non convertibile lasciato com'è e contato); boot reale: pin SDL, modulo una tantum montato solo da `AppModule`.

**Ordine dei piani consigliato** (sequenziale, TDD, 11 piani; dipendenze fra parentesi). L'ordine dei piani 02–05 evita che Mongoose strict scarti dalle fixture un campo non ancora dichiarato e che una catena resti rossa fra un piano e l'altro.

1. **24-01 Tipi di città e città di nascita** — enum, tabella delle taglie, `RACE_HOME_CITY_TYPES`, spec, pin e `schema.gql` (D-15, D-16, D-18). Requisiti scritti in `REQUIREMENTS.md` e ROADMAP. (—)
2. **24-02 Modello della magia, solo aggiunte** — `SpellOrigin`, `Spell.origin`, `Spell.minLevelToLearn` accanto a `minXpToLearn` ancora presente; fixture con i campi nuovi; pin; rimozione di `SpellInput` morto. (—)
3. **24-03 Cancello a livello nelle quest** — `SpellCandidate`, `RewardCatalog.spells`, `learnableSpellOf`, proiezione, `canLearnSpell`, `drawLearnableSpell`, `chosenSpellOf`, chiamate in `planParticipant` (stesso tipo: un solo piano, `tsc` 0 a fine piano). (02)
4. **24-04 Cancello a livello nelle opzioni dell'oste** — `mission-prizes.ts`, `mission-prize-options.service.ts`, int-spec di opzioni, salvataggio e completamento. (02)
5. **24-05 Via `minXpToLearn`** — tolto da schema, filo, fixture e documenti GraphQL delle spec; pin dell'assenza; reporter d'avvio delle magie senza origine o livello validi. (03, 04)
6. **24-06 Tipi di quest `shamanic` e `void`** — enum, modulo delle scuole, ripetibilità, pool dello studio, tabelle esaustive, int-spec parametriche. (—)
7. **24-07 Sorteggio per origine** — sorgente del pool col tipo, filtro in `readSpellPool`, int-spec tre tipi × tre origini. (02, 05, 06)
8. **24-08 Pavimento di rango di Necrorian** — regole pure, `poiRankFloor`, `compositionFor`, `mixedOf`, opzione dell'harness. (—)
9. **24-09 Migratore una tantum** — passo puro, passo, boot nella factory, modulo in `AppModule`, pin «monta il modulo», runbook nel handoff. (05)
10. **24-10 Gate** — `tsc`, unit completa, integration a blocchi `--runInBand`, boot reale, coverage per cartella. (tutti)
11. **24-11 Handoff** — `BACKEND-NOTES.md` (diff SDL verbatim, semantica, forma del contenuto da scrivere a DB, passi di UAT, runbook del boot col migratore), `requirements mark-complete`. (10)

Dopo l'ultimo piano, a cura dell'orchestratore: backup, boot reale dal ramo, log del migratore nel handoff, rimozione del modulo (RED/GREEN), scrittura del contenuto rivisto dall'utente, UAT con la FE Phase 23.

## Conflitti con il CONTEXT

| # | Decisione | Problema nel codice | Alternative (raccomandata in grassetto) |
|---|-----------|---------------------|-----------------------------------------|
| C-1 | D-15 «le città restano senza taglia» | `City.type` è un enum non nullo sul filo: le tre città rompono `cities` / `city` sul BE in esecuzione, non solo la taglia | **piano dei tipi di città per primo**; l'orchestratore decide se anticiparlo sul BE in esecuzione prima della fine della fase |
| C-2 | Brief «admin mutations» sulle magie | Non esistono; `SpellInput` è morto | **togliere `SpellInput`** (Boy Scout); alternativa: aggiornarlo senza che nessuno lo usi |
| C-3 | D-01 «BE enum» | `useType` sul filo è `String!`; un enum GraphQL rompe il personaggio per un valore scritto male a DB (vedi C-1) | **`origin: String!` con enum TypeScript e validazione Mongoose**; alternativa `origin: SpellOrigin!` (contratto tipizzato, fail-closed sul filo) |
| C-4 | D-10 «il sorteggio di una magic…» | Il sorteggio dipende da `prizes.spellDraw`, non dal tipo: una `study` (o altro tipo) col flag oggi sorteggia dall'intero catalogo | **fuori dalle tre scuole il catalogo intero resta com'è** (nessun cambio di comportamento); alternativa: fuori dalle scuole nessun sorteggio (fail-closed). Dipende da quante quest non-scuola hanno il flag a DB |
| C-5 | D-07 «sostituito» | Cancellare `minXpToLearn` nel migratore rende il database inservibile al codice di `develop` (campo `Int!` nullo): ritorno indietro solo dal backup | **il migratore scrive i campi nuovi e lascia il vecchio; il `$unset` lo fa l'orchestratore dopo la merge**; alternativa: `$unset` nel migratore (database pulito subito, come la Phase 19) |
| C-6 | D-16 taglia `capital` | Il contenuto per taglia è a DB (heal 2/5/8 h, liste di ferite, quota di vita, descrizioni, pool dei negozi) e non segue il cambio di tipo | nessun codice; **l'orchestratore rivede heal e negozio di Murnborim e Thengran col contenuto da capitale** (da confermare con l'utente) |
| C-7 | D-12 «rango minimo» | Il boss misto abbassa `minTitle`; una quest è di una città per POI, non per città scelta | **pavimento per POI + nessun misto sotto il pavimento** |
| C-8 | D-08 opzioni dell'oste | Nessuna decisione sull'origine nelle opzioni dell'oste | **nessun filtro per origine** (story e worldMission non sono scuole) |
| C-9 | D-11 quest nuove a DB | La FE di oggi può non conoscere i tipi `shamanic` / `void` e i tre `CityType` | le tre quest si scrivono a DB **dopo** che la build della FE Phase 23 è sul device; i tipi di città sono già a DB (problema della FE già presente) |

## Common Pitfalls

### Pitfall 1: enum sul filo e valori scritti a mano
**Cosa va storto:** un valore fuori dall'enum GraphQL annulla il campo non nullo e risale (oggi: `City.type`).
**Come evitarlo:** tipi di città per primi; `origin` come `String!`; reporter d'avvio col conteggio delle magie non servibili.
**Segnale:** errore «cannot represent value» nelle risposte, mappa vuota.

### Pitfall 2: Mongoose strict e fixture
**Cosa va storto:** `persistSpell` passa dal modello: un campo non dichiarato nello schema viene scartato in silenzio, e le spec leggono `undefined`.
**Come evitarlo:** dichiarare `minLevelToLearn` e `origin` nello schema (piano 02) prima di spostare i lettori; togliere `minXpToLearn` solo alla fine (piano 05).

### Pitfall 3: ordine dei tiri
**Cosa va storto:** un tiro in più o in meno sposta le sequenze delle spec a seme fisso (generatore, esiti).
**Come evitarlo:** il filtro per origine non tocca `spellDrawOf`; il pavimento non aggiunge tiri e cambia la sequenza solo per i POI con pavimento; prova «mondo senza Necrorian identico tiro per tiro».

### Pitfall 4: `minTitle` del boss misto
**Cosa va storto:** rango mage rispettato ma `minTitle` paladin dopo `mixedBossDraftOf`.
**Come evitarlo:** l'asserzione dell'int-spec è su `requirements.minTitle` della quest scritta, non sul rango della composizione.

### Pitfall 5: livello salvato contro livello dalla tabella
**Cosa va storto:** usare `status.level` nelle opzioni dell'oste e `progression.level` nell'esito dà due risposte se il campo salvato è disallineato.
**Come evitarlo:** sempre `levelRowFor(xp).level`.

### Pitfall 6: lettori lean dopo il migratore
**Cosa va storto:** una magia nuova scritta a DB senza `minLevelToLearn` o senza `origin` annulla la magia sul filo e non si insegna mai.
**Come evitarlo:** forma del documento nel handoff per lo script dell'orchestratore; reporter d'avvio; contenuto scritto dopo il boot col codice nuovo.

### Pitfall 7: la FE di oggi contro lo SDL nuovo
**Cosa va storto:** dopo il riavvio dal ramo la FE di `develop` seleziona `minXpToLearn` e ogni query col frammento della magia è rifiutata.
**Come evitarlo:** riavvio del BE e build della FE Phase 23 insieme; dichiararlo in testa al handoff.

### Pitfall 8: il modulo una tantum negli harness
**Cosa va storto:** un harness che monta il migratore lo esegue a ogni suite, o una spec unitaria importa `AppModule`.
**Come evitarlo:** modulo importato solo da `AppModule`, come `ModelReviewMigrationModule`; int-spec del passo con il passo istanziato a mano.

### Pitfall 9: `void` come identificatore
**Cosa va storto:** `void` è parola riservata: va bene come membro di enum e come chiave (`QuestType.void`, `{ void: … }`), non come nome di variabile o parametro. In Dart non è usabile nemmeno come valore di enum: nota per il handoff alla FE.

### Pitfall 10: tipo `magic`, origine `arcane`
**Cosa va storto:** trattare la tabella delle scuole come un'identità (origine = nome del tipo) o usare `magic` come valore di origine in fixture, migratore e filtri: il pool della quest `magic` resterebbe vuoto.
**Come evitarlo:** la corrispondenza sta solo nella tabella `SPELL_ORIGIN_BY_QUEST_TYPE`; una spec pinna le tre coppie e che `magic` non è un valore di `SpellOrigin`.

## Don't Hand-Roll

| Problema | Non costruire | Usare | Perché |
|----------|---------------|-------|--------|
| Livello da un xp | una seconda tabella o soglie copiate nel migratore | `levelRowFor` (`level-table.ts:43-49`) | tabella unica (D-12 della Phase 9) |
| Taglia di una città | confronti sul nome del tipo («Capital» nel nome) | `CITY_SIZE_BY_TYPE` esaustiva | il compilatore rifiuta un tipo senza taglia |
| «Tipi come la magic» | liste ripetute in tre file | un solo modulo delle scuole | D-09: una regola, tre consumatori |
| Boot del migratore | script CLI o hook `onModuleInit` | factory di un provider (modello Phase 19) | finisce prima di ogni hook, fallisce chiuso |
| Caso | `Math.random` | porta `ChanceSource` | spec a seme fisso |

## Code Examples

### Cancello a livello (forma, da implementare in TDD)

```ts
// src/quests/outcomes/rewards/quest-rewards.ts — stessa struttura di oggi, soglia a livello
export function canLearnSpell(candidate, levelAfter, knownSpells, title) {
    if (!isSpellCaster(title)) return null;
    if (!candidate || levelAfter < candidate.minLevelToLearn) return null;
    …
}
// src/quests/outcomes/outcome-plan.ts:476-486
drawLearnableSpell(rewards.spellDraw, progression.level, knownSpells, titleAfter);
canLearnSpell(spellCandidate, progression.level, knownSpells, titleAfter);
```

### Pavimento di rango (forma)

```ts
// src/quests/generation/generation-rules.ts
export const CITY_RANK_FLOORS: Readonly<Partial<Record<CityType, GeneratedRank>>> = {
    [CityType.necrorianCity]: TitleType.mage,
};
export const allowsRank = (floor: GeneratedRank | null, rank: GeneratedRank): boolean =>
    floor === null || GENERATED_RANKS.indexOf(rank) >= GENERATED_RANKS.indexOf(floor);
```

### Passo del migratore (forma)

```ts
// lettura: magie a cui manca `minLevelToLearn` oppure `origin`
// scrittura per documento, condizionata sui valori letti (asRead del modello Phase 19):
//   `$set` di `minLevelToLearn: levelRowFor(minXpToLearn).level` se assente
//   `$set` di `origin: 'arcane'` se assente
// `minXpToLearn` resta dov'è (C-5)
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tutte le 96 magie a DB hanno `minXpToLearn` numerico (4 000–50 000), come dice il CONTEXT | Q2 | il migratore conta «senza corrispondenza» e quelle magie restano non servibili sul filo: da correggere a mano prima del boot |
| A2 | Nessuna quest fuori dalle tre scuole ha `spellDraw: true` a DB (il CONTEXT cita solo la magic di Valantar) | Q3, C-4 | con C-4 raccomandata resterebbero a sorteggiare dall'intero catalogo |
| A3 | La collection `spells` non contiene magie «solo dei nemici» da tenere fuori dal sorteggio | Q3 | già oggi il sorteggio le include; con ~45 magie nuove il problema cresce: serve una decisione di contenuto |
| A4 | Il BE in esecuzione risponde errore a `cities` per le tre città (dedotto da sonda e codice, non provato sul processo reale) | Q5, C-1 | se la FE non seleziona `type` per quelle città l'effetto è minore; il piano 01 resta comunque il primo |
| A5 | Murnborim e Thengran erano villaggi prima del cambio di tipo, quindi heal e negozio a DB sono da villaggio | Q5, C-6 | se erano già curate a mano non serve nessun ritocco |
| A6 | Un POI può comparire fra i POI di più città | Q4 | se non succede mai, il pavimento per POI e quello per città scelta coincidono (nessun danno) |
| A7 | La FE di oggi non regge i tipi di quest sconosciuti | C-9 | se li regge, le quest si possono scrivere prima |

## Open Questions

Per l'orchestratore o per l'utente:

1. **Anticipare i tipi di città?** `cities` è verosimilmente rotta sul BE in esecuzione (C-1). Si aspetta la fine della fase o si porta subito il piano 01 sul BE in esecuzione?
2. **`origin: String!` oppure `SpellOrigin!` sul filo?** (C-3; raccomandato `String!`.)
3. **Sorteggio fuori dalle tre scuole** (C-4): catalogo intero come oggi, oppure nessun sorteggio? Serve il conteggio a DB delle quest con `spellDraw: true` per tipo.
4. **`$unset` di `minXpToLearn`**: nel migratore o nello script di contenuto dopo la merge? (C-5; raccomandato il secondo.) E conferma dell'origine di default `arcane` prima della tabella rivista.
5. **Heal e negozio delle due capitali nuove** (C-6): vanno riscritti col contenuto da capitale? Decisione dell'utente.
6. **Magie dei nemici nel sorteggio** (A3): fra le 96 e le ~45 nuove ce ne sono che un personaggio non deve poter imparare? Oggi non esiste un modo per escluderle.
7. **Report di sola lettura** per le quest scritte a mano su un POI di Necrorian sotto mage (stile `group-prize-report`): utile o fuori scope? Raccomandato fuori scope (il generatore è l'unica fonte automatica).
8. **`24-REPO-RULES.md`**: da scrivere prima dei piani (nomi fissati: `minLevelToLearn`, `origin`, `SpellOrigin`, `BE-ORIGIN-NN`, scope dei commit).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tsc, jest | ✓ | 22.12.0 | — |
| Jest | unit / integration | ✓ (tre spec unitarie eseguite) | 30.1.2 | — |
| TypeScript | type check | ✓ (sonda `tsc --noEmit`) | del repo (5.7) | — |
| MongoMemoryReplSet | integration | non provato in questa ricerca (usato dalla Phase 23 il giorno prima) | del repo | — |
| DB reale, BE avviato | boot col migratore, UAT | vietato agli esecutori | — | orchestratore dopo l'ultimo piano |

Nessuna dipendenza nuova da installare. Nessun pacchetto nuovo: sezione «Standard Stack» non applicabile (solo codice esistente).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 (progetti `unit` e `integration` in `package.json`), `MongoMemoryReplSet` condiviso |
| Config file | `package.json` (`jest.projects`) |
| Quick run command | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| Full suite command | gate: unit completa + integration a blocchi `--runInBand` + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`; `test:cov` dall'orchestratore in background |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-ORIGIN-01 | taglie dei tre tipi, conteggi, filo | unit + int | `npx jest src/cities/city-size.spec.ts --selectProjects unit`; `npx jest src/cities/cities.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-ORIGIN-02 | città di nascita di dragonborn e aarakocra | unit + int | `npx jest src/characters/creation/race-traits.spec.ts src/characters/creation/starting-cities.reporter.spec.ts --selectProjects unit`; `npx jest src/characters/creation/starting-location.service.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-ORIGIN-03 | origine su schema e filo | unit + int | `npx jest src/models/enums/spell-origin.enum.spec.ts --selectProjects unit`; `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | enum ❌ Wave 0 |
| BE-ORIGIN-04 | `minLevelToLearn` sul filo, `minXpToLearn` assente | int | `npx jest test/app.int-spec.ts src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-ORIGIN-05 | cancello a livello in premio fisso e sorteggio | unit + int | `npx jest src/quests/outcomes/rewards/quest-rewards.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts --selectProjects unit`; `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-ORIGIN-06 | opzioni dell'oste a livello | unit + int | `npx jest src/quests/guided/mission-prizes.spec.ts src/quests/guided/chosen-rewards.spec.ts --selectProjects unit`; `npx jest src/quests/guided/guided-mission.resolver.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-ORIGIN-07 | i due tipi come la magic | unit + int | `npx jest src/quests/spell-schools.spec.ts src/quests/acceptance/quest-eligibility.spec.ts src/quests/acceptance/quest-lanes.spec.ts --selectProjects unit`; `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts src/quests/outcomes/study-lore-draw.int-spec.ts --selectProjects integration --runInBand` | scuole ❌ Wave 0 |
| BE-ORIGIN-08 | sorteggio per origine | int | `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-ORIGIN-09 | pavimento di Necrorian | unit + int | `npx jest src/quests/generation/generation-rules.spec.ts --selectProjects unit`; `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand` | ✅ (da estendere) |
| BE-ORIGIN-10 | migratore idempotente | unit + int | `npx jest src/migrations/spell-origins/spell-origins.step.spec.ts --selectProjects unit`; `npx jest src/migrations/spell-origins/spell-origins.step.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-ORIGIN-11 | SDL e gate | int | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ |

### Sampling Rate
- **Per task commit:** la sola spec mirata + `npx tsc --noEmit -p tsconfig.json`.
- **Per piano:** le spec della cartella toccata + `test/app.int-spec.ts` se il piano cambia decoratori.
- **Phase gate:** suite completa (piano 24-10) verde prima di `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/models/enums/spell-origin.enum.spec.ts` — valori sul filo (modello: `use-type.enum.spec.ts`)
- [ ] `src/quests/spell-schools.spec.ts` — tabella tipo → origine
- [ ] `src/migrations/spell-origins/*.spec.ts` e `*.int-spec.ts` — passo e boot del migratore
- [ ] spec del reporter d'avvio delle magie non servibili
- [ ] `test/fixtures/spell.fixture.ts` — `origin`, `minLevelToLearn`
- [ ] `test/quests/generation-world.ts` — opzione per il tipo di una città (`necrorianCity`)
- Nessun framework da installare.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (invariata) | JWT di sessione esistente |
| V3 Session Management | no | — |
| V4 Access Control | no (nessun handler nuovo) | liste di `test/authz/expected-handlers.ts` invariate, verificate dal boot reale |
| V5 Input Validation | sì, lato dati | nessun input nuovo dal client; valori letti lean da DB validati fail-closed (livello intero ≥ 1, origine nella tabella); filtro per origine con costante dell'enum, mai da input |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| magia imparata sotto soglia per un dato sporco (livello non numerico) | Tampering | lettura fail-closed: senza livello valido non si insegna |
| quest sotto rango a Necrorian per via del boss misto | Elevation (regola di gioco) | pavimento su `minTitle` scritto, provato in int-spec |
| migratore che scrive su documenti cambiati nel frattempo | Tampering | scrittura condizionata sui valori letti, boot a client fermi |
| log del migratore con dati del database | Information disclosure | solo conteggi e id; errore nuovo senza causa al fallimento (lo stack del driver può portare l'URI) |
| handoff con valori reali | Information disclosure | segnaposto, nessuna URI, operatori solo in code span |

## Sources

### Primary (HIGH)
- Codice del ramo `feat/24-origini-magie-quest-void-shamanic` (percorsi e righe citati in ogni sezione).
- `git show 0822feee` e `0822feee^:src/migrations/model-review/*` (modello del migratore una tantum); `.planning/phases/19-revisione-dei-modelli/BACKEND-NOTES.md` (boot reale e rimozione).
- Sonde fuori dal repo (cancellate): `tsc --noEmit --strict` su un enum col membro `void` (uscita 0); graphql-js del repo su un valore di enum sconosciuto («cannot represent value», campo nullo) e su `void` come valore (serializzato).
- Tre spec unitarie eseguite (`city-size`, `race-traits`, `quest-lanes`): 78 test verdi.
- FE `23-CONTEXT.md` (decisioni), BE `24-CONTEXT.md`, `23-REPO-RULES.md`, `23-RESEARCH.md`, `23-18-PLAN.md` (modello di forma).

### Secondary (MEDIUM)
- FE `lib/graphql/fragments/spell_fragment.dart` (sola lettura: la FE di oggi seleziona `minXpToLearn`).

### Tertiary (LOW)
- Fatti del DB reale (conteggi, valori, POI di Necrorian): solo dal CONTEXT, non letti.

## Metadata

**Confidence breakdown:**
- Lettori di `minXpToLearn`, regole sul tipo di quest, consumatori dei tipi di città: HIGH — grep completo e lettura dei file.
- Generatore e boss misto: HIGH sul meccanismo, MEDIUM sulla regola per POI (dipende da A6).
- Forma del filo e migratore: MEDIUM — default tecnici con alternativa dichiarata.
- Stato del BE in esecuzione e contenuto a DB: LOW — dedotti, non provati.

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (codice stabile; rileggere se la PR #43 cambia `resolution-loader.service.ts`, `quest-rewards.ts` o `src/quests/guided/` prima dei piani)
