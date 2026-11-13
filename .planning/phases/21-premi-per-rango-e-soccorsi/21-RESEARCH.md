# Phase 21: Premi per rango e soccorsi - Research

**Researched:** 2026-11-13
**Domain:** regole delle quest lato BE (NestJS 11, Mongoose 8.18.1, Apollo code-first): blocchi premio per titolo, generatore dei boss, flusso delle aid, dungeon a turni
**Confidence:** HIGH sul codice (letto riga per riga sul branch `feat/21-premi-per-rango-e-soccorsi` allineato a `develop`; due sonde eseguite e cancellate), MEDIUM sulle proposte di forma (default tecnici dichiarati)

## Summary

Oggi ogni quest ha **un solo premio** (`QuestPrizes`, `src/models/quest/quest-prizes.model.ts:29-70`) e le sole due porte che lo tirano sono `planCombatant` (`src/quests/outcomes/combatant-plan.ts:149-151`, usata da individuale, boss e soccorso) e `GmCompletionService.commit` (`src/quests/outcomes/gm-completion.service.ts:315-319`, story e worldMission). Il titolo del personaggio è già nello snapshot in sessione di entrambe (`snapshot.status.title`), quindi la scelta del blocco (D-04) è una funzione pura chiamata **in due punti**. L'apprendimento della magia passa da **un solo punto** (`planParticipant`, `src/quests/outcomes/outcome-plan.ts:417-423`), quindi `isSpellCaster` (D-05b) si impone lì senza toccare l'ordine dei tiri (il sorteggio della study è già consumato in `drawRewards`).

Sul filo il cambio può restare **additivo** per la FE: `Quest.prizes` tiene nome, tipo e sotto-campi e diventa un `@ResolveField` per viewer (precedente: `relatedLore` di Lore/City/Enemy sovrascrive un `@Field` esistente, `src/lore/related-lore.resolvers.ts:21-35`; `noEffect` usa la stessa memo per viewer anche sugli eventi WS condivisi, `src/quests/no-effect/viewer-vitals.service.ts:36-71`); l'elenco dei blocchi entra come `Quest.rankPrizes` additivo e i turni della dungeon come campi nuovi nullable su `QuestResult`, con `stagesCleared`/`stagesTotal` invariati. La sonda 2 conferma che Mongoose 8.18.1 popola i ref **dentro un array di blocchi** (`prizes.rankPrizes.randomLoot.item` con `refPath` assoluto `prizes.rankPrizes.randomLoot.itemType`, `prizes.rankPrizes.prizeItem.item`, `prizes.rankPrizes.pet`): nessun Buffer sul filo se i percorsi entrano in `QUEST_CATALOG_POPULATE`.

Il flusso delle aid ha quattro difetti verificati: (1) `planCombatant` apre un'aid per **ogni** sconfitta (`combatant-plan.ts:132-137`) e `planParticipant` **lancia** su una sconfitta senza aid (`outcome-plan.ts:365-367`), quindi D-09 richiede un ramo «sconfitta senza soccorso» nuovo; (2) l'aid perde il tipo dell'originale (`aid-quest.ts:117`, `type: aid`) e non sa a che turno si è caduti; (3) il percorso a tappe esiste solo nell'individuale (`quest-resolution.service.ts:183-193`), il soccorso usa sempre `combat.resolve` (`rescue-resolution.service.ts:395-401`); (4) **sonda 1, riprodotto**: l'archiviatore che svuota `rescue.characters` conclude l'aid (`character-archiver.ts:221-247`) e lascia il soccorritore iscritto con corsia e `PendingQuest` (`{"aidConcludedAt":"2026-11-13T10:00:00.000Z","aidRegistered":1,"rescuerLane":"…2b35","pendingExists":true}`); nessuno lo libererà mai, perché il timeout del party esce su una quest conclusa (`party-timeout.service.ts:88-89`).

**Primary recommendation:** un modulo puro `src/quests/prizes/rank-prizes.ts` (lettura dei blocchi + scelta per titolo, usato da risoluzione, GM, filo e generatore), lo schema `prizes.rankPrizes` senza migratore (un boss senza blocchi si legge come «premio unico = blocco del suo `minTitle`»), poi in ordine: magia ai caster, aid per tipo, archiviatore, generatore misto, dungeon a turni con premio proporzionale salvato sull'aid, filo e handoff.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Quali quest e quale titolo
- **D-01:** Blocchi per titolo sulle **quest di gruppo**: `worldMission`, `boss` (anche misti, D-03) e l'`aid` clonata da una quest di gruppo. Le **solitarie** (`enemy`, `hunt`, `dungeon`, aid di una solitaria e i tipi senza registrazione) tengono **un premio unico calcolato sul `minTitle`** — utente: «riflette anche la difficoltà del mostro, rendendo il tutto più bilanciato».
- **D-02:** Nelle quest di gruppo **nessun posto a titolo null**: un blocco per ogni titolo dei posti. Un posto null in una quest di gruppo è contenuto non valido (planner: rifiuto o report di sola lettura, come le violazioni dei negozi).
- **D-03:** Boss generati **misti a caso**, non a regola fissa: posti anche del titolo **inferiore**, **mai superiore** («diventerebbe troppo facile»); frequenza e proporzione a discrezione dentro la formula esistente (⌈PE / media del rango⌉, 2–6 posti).
- **D-04:** Decide il **titolo del personaggio** alla risoluzione, non il titolo del posto.

#### Contenuto dei blocchi
- **D-05:** **Tutto il blocco va per titolo**: monete e xp (`GENERATED_PRIZES` × `TIER_MULTIPLIER`), loot (`LOOT_POOLS` del titolo) e **anche pet, cura e magia**, così nessuno ottiene un premio troppo forte per il suo rango (utente, 2026-11-12, correggendo la prima risposta: «anche quelle vanno in base al rango. Così non rischiamo che qualcuno ottenga un pet troppo forte/ una cura troppo forte / una magia troppo forte per il suo livello/rango»).
- **D-05a:** Il **pet si sorteggia con la regola di sempre** (Phase 19 D-28: un tiro a fasce sommate 10 % pet dello stesso nemico, 5 % di zona, 5 % solo boss non vendibile; tetto di rarità dal loot del titolo; legendary solo dai boss hero) **una volta per blocco**: il blocco mage può avere il pet e quello paladin no. Nuovi tiri dopo quelli esistenti (ordine delle spec a seme fisso).
- **D-05c:** Cure e magie esistono in pratica **solo nei tipi in solitaria dedicati** (`heal` per le cure, `magic` e la study di Valantar per le magie): le quest di gruppo generate non ne portano; i campi per titolo restano per le quest di gruppo scritte a mano. La magia si impara **solo dai titoli ≥ mage**.
- **D-05b:** Lacuna: `canLearnSpell`/`drawLearnableSpell` (`src/quests/outcomes/rewards/quest-rewards.ts`) guardano solo `minXpToLearn`; la regola di titolo vive in `isSpellCaster` (`src/models/character/active-spell-slots.ts`), usata solo per gli slot. Va imposta in ogni percorso (solitarie, study di Valantar, gruppo), RED prima.
- **D-06:** Quest generate: blocchi dalle tabelle, poi ritoccabili a DB («la mano vince»). Quest scritte a mano: i blocchi li scrive l'utente, **nessuna semina** né ripiego sulle tabelle.

#### Sul filo
- **D-07:** Il foglio della quest mostra al viewer **solo il blocco del suo titolo** (consiglio: `Quest.prizes` risolto per il viewer come `noEffect`, più l'elenco dei blocchi per l'oste quando servirà alla FE Phase 21). Forma decisa nel plan; cambio non additivo → FE gated.
- **D-08:** Esito invariato nella forma: `QuestResult.rewards` per partecipante.

#### Aid
- **D-09:** Aid solo da `enemy`, `boss`, `hunt`, `dungeon`, `aid` perse (oggi `combatant-plan.ts:127-136` la crea per ogni sconfitta).
- **D-09b:** La `crime` resta com'è: la «sconfitta» è l'arresto del 20 % alla conclusione (quick 261110-cgd, 10 h `CRIME_PRISON_MS`, un quarto delle monete, nessuna aid); lo scontro con le guardie perso lascia a vita minima senza aid; nessuna crime a DB ha nemici (34/34).
- **D-10:** Aid persa **invariata** (Phase 9 D-09, confermata dall'utente): i feriti originali muoiono, una nuova aid per i soccorritori caduti clonata dall'originale, timer ripartito.
- **D-11:** L'aid di una quest di gruppo clona i **blocchi per titolo** con i posti; la cura non si eredita (Phase 18 D-23).
- **D-12:** **Aid della dungeon a turni.** Dungeon = turni «esplorazione → scontro col primo nemico/gruppo → esplorazione → scontro col secondo → … fino alla fine dei nemici». Si può cadere **in qualunque turno, anche di esplorazione**. Alla sconfitta si **salva sull'aid il turno** (indice e tipo); l'aid percorre i turni **fino a quello** e il soccorritore deve **completarlo** per salvare il ferito; poi l'aid finisce e il salvato torna libero (anche di rifare la dungeon).
- **D-13:** Il motore a turni (esplorazione e scontri) è dell'utente: qui **struttura + segnaposto attuale** (turno salvato, percorso con la stessa porta della dungeon — oggi l'aid passa da `combatContextOf` + `combat.resolve` in `rescue-resolution.service.ts:395-401`, il percorso a tappe solo per `type === dungeon` in `quest-resolution.service.ts:183` —, contatori nell'esito); la porta deve già ammettere una sconfitta in esplorazione.
- **D-14:** Premio del soccorritore di un'aid di dungeon **in proporzione ai turni completati** sul totale della dungeon (caduto al 4° di 8 → metà di monete, xp e loot; unità e arrotondamento a discrezione, documentati; consiglio: turni).
- **D-15:** Nessun blocco della dungeon per gli altri mentre l'aid è aperta (come oggi).
- **D-16:** `character-archiver.ts:221-247` conclude l'aid senza liberare corsie e PendingQuest dei soccorritori iscritti ma non partiti (dedotto dal codice, non riprodotto): RED che lo riproduce, poi `releaseRegistered` come il timeout (`party-timeout.service.ts:137-155`).

#### Pulizia DB (fatta nel discuss, 2026-11-12)
- **D-17:** Le 3 aid concluse a DB erano avanzi delle UAT (sconfitte vere, chiuse a mano, nessun `QuestResult` sull'aid): backup EJSON nello scratchpad della sessione (`aid-cleanup-backup-2026-11-12.json`) e cancellazione su ordine dell'utente; 0 aid a DB.

### Claude's Discretion
- Forma sul filo del blocco del viewer e nomi dei campi (`rankPrizes`, turno salvato su `rescue`).
- Frequenza dei boss misti; unità e arrotondamento del premio proporzionale.
- Migrazione: oggi a DB 0 worldMission, 0 story, 12 boss a titolo unico, 0 aid → i boss esistenti possono ricevere i blocchi del loro titolo da un one-off al boot reale (rimosso prima della merge) o restare letti come premio unico; decidere nel plan.

### Deferred Ideas (OUT OF SCOPE)
- Motore a turni della dungeon: lo scrive l'utente.
- Passo dei premi dell'oste: fase gemella della FE Phase 21 (da aprire).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-RANKP-01 | Blocchi per ogni titolo dei posti sulle quest di gruppo; nessun posto null nel gruppo; solitarie col premio unico sul `minTitle` | §Q1 (schema `prizes.rankPrizes`, sonda 2), §Q2 (lettura «senza blocchi = blocco del `minTitle`»), §Q5 (rifiuto all'accettazione + report al boot), §Q12 (nessun migratore) |
| BE-RANKP-02 | Ognuno riceve il blocco del proprio titolo; magia solo ai titoli ≥ mage in ogni percorso | §Q2 (due porte: `combatant-plan.ts:150`, `gm-completion.service.ts:315`), §Q6 (un solo punto d'apprendimento, `outcome-plan.ts:417-423`) |
| BE-RANKP-03 | Generatore: boss misti col titolo inferiore, un blocco per titolo dalle tabelle, pet per blocco; scritte a mano senza semina; viewer col proprio blocco sul filo | §Q3 (ordine dei tiri), §Q4 (formula e tabella), §Q7 (SDL) |
| BE-RANKP-04 | Aid solo da enemy/boss/hunt/dungeon/aid; clona blocchi e posti; aid persa invariata; crime invariata | §Q8, §Q9 |
| BE-RANKP-05 | Dungeon a turni, turno salvato sull'aid, percorso fino al turno con la stessa porta, premio proporzionale, struttura + segnaposto | §Q10 |
| BE-RANKP-06 | Archiviatore che libera i soccorritori iscritti (RED prima); unit + integration; SDL al boot reale; handoff | §Q11 (sonda 1), §Q13, §Validation Architecture |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 21-REPO-RULES.md)

- Stack fisso NestJS 11 + Mongoose 8 + Apollo code-first; nessuna dipendenza nuova serve alla fase.
- TDD RED → GREEN → REFACTOR, commit `test(...)` prima di `feat(...)`; titoli dei test con `(D-NN)`.
- Nessun push/PR/`gh`/fetch dagli esecutori; nessun trailer `Co-Authored-By`/`Generated with`/`Claude-Session` (regola dell'utente, prevale).
- Mai `npm run lint`/`format`/`build`/`nest build`; solo `npx prettier --write <file>`, `npx eslint <file>`, `npx tsc --noEmit -p tsconfig.json`.
- Jest: percorsi prima di `--selectProjects`; integration `--runInBand`; mai in background; nessun `jest.mock(` di moduli (override di provider); `FixedClock`; nessun `Math.random`/`Date.now` nel codice della fase; ogni tiro nuovo DOPO quelli esistenti e solo quando serve.
- Mai intersezioni con interfacce negli update di Mongoose.
- Lo SDL cambia: `src/schema.gql` si rigenera solo col boot reale di test e si committa nel piano che cambia i decoratori; ogni cambio non additivo nel handoff.
- Nessun file di contenuto nel repo (D-36); nessuna variabile d'ambiente nuova; log con soli id/conteggi/`describeError`.
- Operatori Mongo solo in code span nei `.md` e mai nei titoli dei test.

## Risposte alle domande

### Q1 — Modello dei blocchi

**Oggi** (`quest-prizes.model.ts:29-70`): `prizeCoins`, `xpPrize`, `prizeItem` (`assetQuantitySchemaAt('prizes.prizeItem')`), `randomLoot` (`assetQuantitySchemaAt('prizes.randomLoot')`), `spell` (ref), `pet` (ref), `cure` (`QuestCureSchema`), `spellDraw` (solo Mongoose, mai nello SDL). Il `refPath` relativo non risolve negli array di sotto-documenti (commento e sonda della Phase 13, `asset-quantity.model.ts:30-35`): ogni uso dichiara il path assoluto.

**Sonda 2 (eseguita sull'harness di integrazione, file cancellato):** schema di prova `prizes.rankPrizes: [{ title, randomLoot: [assetQuantitySchemaAt('prizes.rankPrizes.randomLoot')], prizeItem: assetQuantitySchemaAt('prizes.rankPrizes.prizeItem'), pet: ref Pet }]`, `populate` dei tre percorsi → `randomLootIsObjectId:false`, `prizeItemIsObjectId:false`, `petIsObjectId:false` (documenti veri). L'array dentro l'array risolve col path assoluto. **HIGH.**

**Forma raccomandata a DB** (dentro `prizes`, così `RESOLUTION_QUEST_PROJECTION.prizes`, `ORIGINAL_QUEST_PROJECTION.prizes` e il clone dell'aid la portano senza cambiare proiezioni):

```
prizes: {
  …campi di oggi (premio unico delle solitarie e dei boss legacy),
  rankPrizes: [ { title, prizeCoins, xpPrize, prizeItem, randomLoot, spell, pet, cure } ]   // solo Mongoose, @Prop senza @Field
}
```

- Un array (non una mappa): l'ordine è quello dei posti (prima il rango proprio, poi l'inferiore, come chiede la FE), Mongoose valida `title` con l'enum `TitleType`, l'utente lo scrive a mano come scrive `requiredAdventurers`, e la sonda copre esattamente questa forma. Una mappa per titolo avrebbe chiavi dinamiche non validabili e `refPath` non dichiarabili.
- Classe nuova `QuestRankPrize` (`@Schema({ _id: false })`, solo Mongoose) con le stesse proprietà del premio e i path assoluti `prizes.rankPrizes.prizeItem` / `prizes.rankPrizes.randomLoot`. **Duplicazione dei tipi evitata così:** il dominio legge entrambi con lo stesso `PrizesSnapshot` (`quest-rewards.ts:18-28`, già strutturale e `unknown`); sul filo un blocco è restituito come oggetto di tipo GraphQL `QuestPrizes` (stessi 7 campi), quindi nessun `@ObjectType` nuovo per il contenuto. L'ereditarietà di classi per le `@Prop` funziona in `@nestjs/mongoose` (precedente `LootItem extends AssetItem`, `loot-item.model.ts:41`) ma non serve: i due `randomLoot` differiscono proprio nel `refPath`.
- `spellDraw` NON entra nel blocco (il sorteggio della study è una solitaria, D-05c).
- **Trappola dei ref annidati:** ogni ref del blocco va popolato in `QUEST_CATALOG_POPULATE` (`quest-catalog.populate.ts:9-23`) e sanificato da `dropOrphanCatalogRefs` (`:58-87`) blocco per blocco; un ref non popolato su `Pet`/`ItemUnion!` annullerebbe la lista `quests` (Pitfall 1 della Phase 13). Il `cureOf` va applicato anche alla `cure` di ogni blocco.

### Q2 — Risoluzione per titolo

**Percorsi** (verificati con `grep` di `drawRewards`; non ce ne sono altri):

| Tipo | Percorso | Dove si tira il premio |
|------|----------|------------------------|
| enemy, hunt, dungeon, heal, job, study, magic, crime, guard, aid senza feriti | `QuestResolutionService.resolveLoadedIndividual` → `planConclusion` → `planCombatant` (`quest-resolution.service.ts:118-131`, `conclusion-plan.ts:43-59`) | `combatant-plan.ts:149-151` |
| boss | `BossResolutionService.commitGroup` → `planCombatant` per posto (`boss-resolution.service.ts:159-185`) | idem |
| aid con feriti (soccorso di gruppo) | `RescueResolutionService.fightRescuers` → `planCombatant` (`rescue-resolution.service.ts:405-433`) | idem |
| story, worldMission | `GmCompletionService.commit` → `planParticipant` (`gm-completion.service.ts:301-324`) | `gm-completion.service.ts:315-319` |

In tutti e quattro lo snapshot è letto **in sessione** (`snapshotInSession`) e porta `status.title`: è «il titolo del personaggio alla risoluzione» di D-04. Raccomandazione: `planCombatant` passa `prizeBlockFor(quest, snapshot.status.title)` a `drawRewards` al posto di `quest.prizes`; lo stesso in `gm-completion.service.ts:315`. `doubledCoinPrizes` (`guard-outcome.ts:29-39`) raddoppia il premio unico: la guard è solitaria, quindi resta corretto se la scelta del blocco legge i blocchi **solo per i tipi di gruppo**.

**Funzione proposta** (`src/quests/prizes/rank-prizes.ts`, pura):

- `prizeBlocksOf(quest)`: per `boss`, `worldMission`, `aid` con `rankPrizes` non vuoto → i blocchi; altrimenti (solitarie, boss legacy, aid di una solitaria) → un solo blocco `{ title: requirements.minTitle, …campi di oggi }`.
- `prizeBlockFor(quest, title)`: blocco del titolo esatto; altrimenti **il blocco più alto non superiore al titolo** (`TITLE_RANK`, `quest-eligibility.ts:15-22`); altrimenti **il più basso**.

**Quando manca il blocco del titolo** (fatti del codice per la domanda di prodotto P-1):
- **legend in un boss hero:** `hasSeatFor` fa sedere i legend oltre i posti legend sui posti hero (`quest-capacity.ts:62-73`, `foldedCountsOf :133-144`, 13.1 D-08) e il generatore non produce mai titoli legend (`GENERATED_RANKS`, `generation-rules.ts:7-13`; `TIER_MULTIPLIER` non ha legend, `generated-prizes.ts:68-74`) → il blocco più alto ≤ legend è hero.
- **titolo salito dopo l'iscrizione:** il titolo cambia solo con una story vinta (`outcome-plan.ts:393-397`), completata dall'oste; il completamento rifiuta un partecipante con la corsia standard occupata (`assertNoBusyParticipant`, `gm-completion.service.ts:96-102,126-128`), quindi per boss e aid (corsia standard) il titolo non può salire fra iscrizione e risoluzione. Può salire invece per una `worldMission` (corsia del GM) se nel frattempo l'oste completa una story dello stesso personaggio: caso raro, coperto dal ripiego.
- **titolo sotto ogni blocco:** non succede col controllo d'accettazione (`meetsTitle` + posti esatti, `quest-eligibility.ts:164-176`) e il titolo non scende mai (nessuno scrittore che lo abbassi); il ripiego «il più basso» copre dati scritti a mano.
- **viewer senza personaggio** (o oste senza personaggio): `ViewerVitalsService.read` restituisce `null` (`viewer-vitals.service.ts:80-104`) → serve un titolo di ripiego: proposto `minTitle` della quest, cioè il blocco più basso.

### Q3 — Ordine dei tiri a seme fisso

**Spec che pinnano l'ordine** (usano `SequenceChance`, `test/quests/sequence-chance.ts`, o `SeededChanceSource`, `src/quests/generation/seeded-chance.ts`):

- Generatore: `generated-prizes.spec.ts`, `pet-prize.spec.ts`, `quest-composition.spec.ts`, `generated-quest-draft.spec.ts`, `quest-templates.spec.ts`, `city-picker.spec.ts`, `city-distribution.spec.ts`, `quest-generator.int-spec.ts` (`SeededChanceSource(7)` su più quest, più `SequenceChance([], 0.05)` e `SequenceChance([], 0.12)` alle righe 679 e 706), `quest-generation-trigger.int-spec.ts`, `quest-generation.resolver.int-spec.ts`, `test/quests/quest-generation*.e2e.int-spec.ts`.
- Premi e risoluzione: `quest-rewards.spec.ts`, `cascading-loot.spec.ts`, `quest-pet-prize.int-spec.ts`, `boss-resolution.int-spec.ts`, `aid-rescue.int-spec.ts`, `aid-timeout.int-spec.ts`, `quest-dungeon.int-spec.ts`, `quest-combat.int-spec.ts`, `placeholder-dungeon-resolver.spec.ts`, `study-spell-draw.int-spec.ts`, `study-lore-draw.int-spec.ts`, `crime-guard-conclusion.int-spec.ts`, `gm-completion.service.int-spec.ts`.

**Ordine di oggi:** generatore per quest `pickCity → pickPoi → composeQuest → prizesOf (slot del loot, poi fascia del pet e indice) → announcementOf` (`quest-generator.service.ts:193-198`, `generated-prizes.ts:118-133`); risoluzione per vincitore `loot → spellDraw (solo study) → pet (solo pet a catalogo) → lore (solo study/magic)` (`quest-rewards.ts:239-264`).

**Regola pratica:**
1. Il generatore è **un solo flusso** per tutte le quest di una corsa: un tiro nuovo in una quest sposta i tiri di tutte le quest successive. Quindi ogni tiro nuovo va **in coda alla quest** (dopo `announcementOf`) e **solo per i boss**; le enemy restano identiche tiro per tiro.
2. `SequenceChance` esaurita restituisce il suo `fallback` (default 0.99, `sequence-chance.ts:8-16`): un cancello nuovo «`next() < SHARE`» con fallback 0.99 è «no» e non cambia nulla; con i fallback 0.05/0.12 di `quest-generator.int-spec.ts:679,706` è «sì» → quelle due spec vedranno boss misti: aggiornarle con un `SequenceChance` esplicito o asserire l'invariante.
3. In risoluzione nessun tiro nuovo: il blocco cambia **cosa** si tira, non **quante volte** (per un boss misto il paladin tira dal blocco paladin con la stessa sequenza loot → pet). Per il premio proporzionale (§Q10) si scala la soglia, non si aggiunge un tiro.
4. Le spec che pinnano un boss «a titolo unico» (`quest-generator.int-spec.ts:399-407` posti con `title === minTitle`; `:437` rango letto da `minTitle`) vanno riscritte sull'invariante nuova (posti del rango e dell'inferiore, mai superiore).

### Q4 — Generatore e boss misti

**Fatti:** `composeBossQuest` (`quest-composition.ts:215-235`) sceglie un nemico sopra la fascia e i posti con `bossSeatsFor` (`generation-rules.ts:85-92`, 2–6); il draft scrive `minTitle = composition.rank` e `requiredAdventurers = [{ title: rank, count: seats }]` (`generated-quest-draft.ts:77-80,118-122`). La enemy ha un posto senza titolo (quick 261111-enm, `quest-capacity.ts:42-49`) ed è solitaria: invariata.

**Vincolo verificato (punto 4 della FE):** l'accettazione controlla il titolo minimo **prima** dei posti (`classifyEligibility`, `quest-eligibility.ts:164-176`: `meetsTitle` con `rank >= minRank`, poi `hasSeatFor`). Un boss misto con `minTitle` = rango del boss rifiuterebbe con `QUEST_TITLE_MISMATCH` il paladin per cui esiste un posto. **Il boss misto deve scrivere `minTitle` = titolo più basso dei posti.**

**Conseguenza sul conteggio dei ranghi:** `readWorld` conta le generate aperte per `requirements.minTitle` (`quest-generator.service.ts:337-340,394-397`) e serve il rango meno coperto. Con `minTitle` abbassato un boss mage misto conterebbe come paladin. Default tecnico: per i boss contare il **titolo più alto dei posti** (proiezione `requirements.requiredAdventurers` aggiunta alla lettura); per le enemy resta `minTitle`.

**Proposta (discrezione di Claude):**
- `MIXED_BOSS_SHARE = 0.5`: un boss su due è misto (tiro di cancello solo per i boss, in coda alla quest).
- Posti inferiori `k = 1 + floor(r × floor(posti / 2))` con un secondo tiro `r` solo se `floor(posti / 2) > 1`: almeno un posto e al più metà dei posti al titolo inferiore, almeno metà al rango proprio. Totale posti invariato (formula esistente).
- Titolo inferiore = rango precedente in `GENERATED_RANKS` (adventurer → rookie, paladin → adventurer, mage → paladin, hero → mage); rookie non ha boss (`BOSS_PARTY_AVERAGE_PE` senza rookie), quindi nessun caso senza inferiore.
- Blocco del titolo inferiore = `prizesOf({ type: boss, rank: inferiore, … })` tirato **dopo** l'annuncio (slot del loot di quel rango, poi fascia e indice del pet col tetto di quel rango): il pet si sorteggia una volta per blocco (D-05a) e il legendary resta ai soli blocchi hero (`petRarityCapOf`, `pet-prize.ts:78-90`).
- Ordine dei posti sul filo: `[{ title: rango, count: posti − k }, { title: inferiore, count: k }]`, mai null.

| Posti (formula) | k possibili | Esempio (boss mage) |
|-----------------|-------------|---------------------|
| 2 | 1 | 1 mage + 1 paladin |
| 3 | 1 | 2 mage + 1 paladin |
| 4 | 1–2 | 3+1 o 2+2 |
| 5 | 1–2 | 4+1 o 3+2 |
| 6 | 1–3 | 5+1, 4+2 o 3+3 |

**Forma dei premi del boss generato:** blocchi in `rankPrizes` (uno per titolo dei posti, anche per il boss non misto) e campi di oggi uguali al blocco del rango proprio (stessi valori di oggi: le spec sul premio del boss restano vere). «La mano vince»: per un tipo di gruppo con `rankPrizes` non vuoto i campi di oggi sono ignorati in lettura (documentato nel handoff, così l'utente sa quale ritoccare).

### Q5 — D-02: posto null in una quest di gruppo

**Fatti:** oggi un posto null è il jolly valido (`slotRuleOf`, `quest-capacity.ts:51-59`); slot non validi rendono la quest non accettabile con `questNotAcceptable` e un WARN di solo id (`quest-acceptance.service.ts:443-451`, D-27). I negozi riportano le violazioni al boot (`ShopBoot`, `src/shops/maintenance/shop-boot.ts:8-34`) e via query dell'oste (`shopPoolReport`).

**Raccomandazione (C-2):** entrambi, come D-27 + negozi:
1. **Rifiuto all'accettazione** (fail-closed, nessun codice nuovo): `registrationRuleOf` (`quest-eligibility.ts:97-104`) restituisce `'invalid'` per `boss` e `worldMission` con un posto a titolo null → `questNotAcceptable` già esistente. L'aid resta esclusa: la sua forma dice se è di gruppo (posti a titolo) o di una solitaria (posto unico null, `aidSlotsOf`, `aid-quest.ts:95-102`).
2. **Report di sola lettura al boot** in `QuestMaintenanceBoot` (passo mai bloccante, `quest-maintenance.boot.ts:13-29`): id e conteggi delle quest di gruppo aperte con (a) un posto null, (b) un titolo dei posti senza blocco quando `rankPrizes` non è vuoto, (c) una magia in un blocco sotto mage (mai insegnata per §Q6).
3. Alla generazione non serve nulla: il generatore non scrive posti null sui boss.

### Q6 — Magia solo ai caster

**Tutti i percorsi** convergono su `planParticipant` (`outcome-plan.ts:417-423`): magia fissa (`rewards.spellCandidate` da `prizes.spell`), sorteggio della study di Valantar (`drawLearnableSpell` su `rewards.spellDraw`), magic, gruppo e completamento del GM (`gm-completion.service.ts:303`). Gli altri scrittori di `status.spellStates` non insegnano (`unrewarded-plan.ts:90`, migratore e recuperi in `src/characters/spells/`); `spellLearned` è sempre `null` in `rescue-plan.ts:82`, `unrewarded-plan.ts:119`, `ambush-results.ts:94`.

**Un punto solo:** aggiungere il titolo a `canLearnSpell` e `drawLearnableSpell` (`quest-rewards.ts:267-297`) con `isSpellCaster` come primo cancello, e passare `titleAfter` da `planParticipant`. Il gate sta nelle funzioni pure (unit test RED lì) e il chiamante è uno. Nessun tiro cambia: `gate`/`roll` sono già consumati in `drawRewards`.

**Default tecnico:** titolo **dopo** l'esito (`titleAfter`): una story vinta che porta a mage e insegna una magia la insegna.

**Effetti collaterali da pinnare:** (a) una study di Valantar vinta da un non caster non impara la magia e quindi entra nel ramo «lore dello studio» (`outcome-plan.ts:455-461`) — comportamento nuovo, coerente con D-05b, da dichiarare nel handoff; (b) il fixture di default ha `title: 'rookie'` (`test/fixtures/character.fixture.ts:34`): le spec che oggi fanno imparare una magia a un rookie (`outcome-plan.spec.ts`, `quest-resolution.service.int-spec.ts`, `study-spell-draw.int-spec.ts`) vanno portate a `mage` nello stesso piano.

### Q7 — Sul filo

**Come risolve oggi `noEffect`:** `QuestNoEffectResolver` (`quest-no-effect.resolver.ts:12-28`) è un `@ResolveField` su `Quest` con `@CurrentUser`, `@Context`, `@Info`; `ViewerVitalsService.of` memoizza **per viewer dentro la chiave dell'evento** (`viewerCacheKeyOf`), perché il payload di `questUpdated` è lo stesso oggetto per tutti i subscriber (`viewer-vitals.service.ts:36-71`; publisher `quests.publisher.ts:48-53` pubblica `findOne` popolato). La proiezione legge già `status.title` (`:17-23`) ma non lo restituisce. Precedente di `@ResolveField` che sovrascrive un `@Field` della classe: `relatedLore` (`related-lore.resolvers.ts:21-35`).

**Applicabilità a `Quest.prizes`:** sì, per ogni percorso che restituisce un `Quest` (lista `quests` → `findForViewer`, `quest(id)`, `questUpdated` con snapshot): tutti passano da `QUEST_CATALOG_POPULATE` (`quests.service.ts:52-73`). Viewer senza personaggio → blocco del `minTitle`; oste col proprio personaggio → come chiunque (nessun ramo sul ruolo, come `noEffect`). `PendingQuest.quest` è un `Quest!` mai popolato (`pending-quests.service.ts:17-22`): difetto preesistente, il resolver deve tollerare un parent senza `prizes` (restituire un premio vuoto) per non peggiorarlo.

**Cosa seleziona la FE** (sola lettura): `QuestFragment` (`lib/graphql/fragments/quest_fragment.dart`) — `noEffect`, `prizes { prizeCoins xpPrize randomLoot prizeItem pet cure }` (non `spell`); `QuestResultFragment` — `stagesCleared stagesTotal rescuedCharacters …`. Un solo fragment per `quests` e `questUpdated`.

**SDL proposto (VERBATIM, ordine alfabetico come lo emette Apollo):**

```graphql
enum DungeonTurnKind {
  exploration
  fight
}

type Quest {
  id: ID!
  infos: QuestInfos!
  noEffect: Boolean!
  prizes: QuestPrizes!
  rankPrizes: [QuestRankPrizes!]!
  registeredAdventurers: [QuestRegistration!]!
  requirements: QuestRequirements!
}

type QuestRankPrizes {
  prizes: QuestPrizes!
  title: String!
}

type QuestResult {
  acknowledgedAt: DateTime
  ambush: AmbushReport
  arrested: Boolean!
  character: ID!
  coinsLost: Coins
  consumablesUsed: [AssetQuantity!]!
  enemies: [QuestEnemy!]!
  guardEncounter: Boolean!
  hpAfter: Int!
  hpBefore: Int!
  id: ID!
  injuriesAdded: [InjuryType!]!
  injuriesHealed: [InjuryType!]!
  kind: QuestResultKind!
  lastTurn: Int
  lastTurnKind: DungeonTurnKind
  levelAfter: Int!
  levelBefore: Int!
  loreUnlocked: [Lore!]!
  maxLifePoints: Int!
  outcome: QuestOutcome!
  petXpGained: Int!
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
  turnsCompleted: Int
  turnsTotal: Int
  user: ID!
  xpAfter: Int!
  xpBefore: Int!
  xpGained: Int!
}
```

`type QuestPrizes` resta **identico** (7 campi). Semantica:
- `Quest.prizes`: blocco del titolo del personaggio corrente del bearer (regola di §Q2), per HTTP e per ogni subscriber WS; solitarie = premio unico; aid di dungeon = premio già in proporzione (§Q10).
- `Quest.rankPrizes`: tutti i blocchi nell'ordine dei posti per le quest di gruppo; `[]` per le solitarie e per i boss legacy senza blocchi (la FE 20 non lo seleziona; serve alla FE 21).
- `turnsTotal`, `turnsCompleted`, `lastTurn` (1-based, ultimo turno giocato: quello della caduta in sconfitta, il turno salvato per il soccorritore che lo completa, `turnsTotal` per una dungeon finita), `lastTurnKind`: valorizzati solo per dungeon e soccorritori di un'aid di dungeon, `null` altrove. `stagesCleared`/`stagesTotal` restano i **scontri** di oggi.
- Verificato (punto 5 della FE): oggi gli esiti del soccorso hanno `stagesCleared`/`stagesTotal` `null` sia per il soccorritore (`planCombatant` senza `stages`, `rescue-resolution.service.ts:411-423`) sia per il ferito liberato (`rescue-plan.ts:85-86`).

**Cambi non additivi per la FE:** nessun cambio di forma. Cambi di **semantica** da elencare nel handoff: `Quest.prizes` per viewer (era il premio unico per tutti); `stagesCleared`/`stagesTotal` valorizzati anche sui soccorritori dell'aid di dungeon (scontri superati nel percorso). `test/app.int-spec.ts` pinna le stringhe esatte di `type Quest` (`:468-469`, `:655-656`, `:699`), `type QuestPrizes` (`:652-653`) e `type QuestResult` (`:708`): da aggiornare nel piano dello SDL.

### Q8 — Aid per tipo

**Dove nasce un'aid:** solo da `planCombatant` (`combatant-plan.ts:132-137`), materializzata in `quest-resolution.service.ts:145-150` (individuale), `boss-resolution.service.ts:211-218` (gruppo) e `rescue-resolution.service.ts:459-479` (aid persa). `planConclusion` delega la sconfitta del combattimento della quest a `planCombatant` (`conclusion-plan.ts:45`): anche crime e guard con nemici aprono oggi un'aid.

**Oggi una heal/job/study/magic/crime/guard con nemici persa** apre un'aid come ogni altra sconfitta. `planParticipant` rifiuta una sconfitta senza aid (`outcome-plan.ts:365-367`), quindi senza aid serve un piano diverso.

**Cosa fa oggi lo scontro con le guardie perso** (quick 261110-cgd): `planGuardDefeat` → `planUnrewarded` con vita `MIN_LIFE_POINTS` (1), corsia standard liberata, effetti del combattimento tenuti (ferite, consumi, magie), nessun xp/oggetto/magia/lore, niente `completedQuests` né `awaitingAid`, `outcome: failure` (`guard-outcome.ts:19-26`, `unrewarded-plan.ts:45-129`).

**Raccomandazione:** `opensAid(type)` = `enemy | boss | hunt | dungeon | aid`; per gli altri tipi la sconfitta usa `planUnrewarded` con la stessa conclusione dello scontro di guardia (vita 1, nessun soccorso). È una scelta di prodotto non scritta nel CONTEXT → **P-2**. Story e worldMission non arrivano mai qui (solo `gmCompleted`).

### Q9 — Aid di gruppo coi blocchi

`buildAidQuest` (`aid-quest.ts:106-141`) clona titolo, nemici validi, marker, tempo, lore, `minTitle`, posti (`aidSlotsOf` con la regola del tipo: boss → posti a titolo, solitarie → un posto null) e i premi con `clonedPrizesOf` (`:80-91`: monete, xp, `prizeItem`, `randomLoot`, `spell`, `pet`; **non** `cure`, Phase 18 D-23; **non** `spellDraw`). Una catena clona l'originale riletto (`rescue-resolution.service.ts:650-659`, proiezione `infos requirements prizes`).

**Da aggiungere:** `clonedPrizesOf` copia `rankPrizes` blocco per blocco **senza `cure`** (ogni blocco con `cure: null`, D-11 + D-23). I posti passano già. La lettura `prizeBlocksOf` tratta l'aid come gruppo quando ha `rankPrizes`, cioè solo se l'originale era di gruppo. L'aid clonata da un boss legacy senza blocchi resta col premio unico (coerente con la lettura del boss stesso).

### Q10 — Dungeon a turni

**Oggi:** la dungeon passa dalla porta `DungeonResolver.explore` (`dungeon-resolver.ts:27-32`) solo nell'individuale (`quest-resolution.service.ts:183-193`); il segnaposto gioca **una tappa per voce di `enemies`** dagli HP residui, l'esplorazione è implicita e gratuita, la prima sconfitta ferma (`placeholder-dungeon-resolver.ts:104-157`); i contatori `stagesCleared`/`stagesTotal` vanno nell'esito via `dungeonBattleOf` (`combatant-plan.ts:110-122`) e `planParticipant` (`outcome-plan.ts:535-536`). Le int-spec usano `ScriptedCombatResolver` sulla porta di combattimento (`quest-dungeon.int-spec.ts:13,39`).

**Struttura minima proposta (default tecnico):**
- `dungeonTurnsOf(enemies)` pura: per ogni voce i-esima due turni, `{ index: 2i, kind: exploration }` e `{ index: 2i+1, kind: fight, enemy }`. Totale = 2 × voci valide; 4 voci → 8 turni E F E F E F E F.
- `DungeonContext` guadagna `turns` e `lastTurnIndex` (dungeon intera = ultimo; aid = turno salvato). `DungeonResolution` guadagna `turnsCompleted`, `turnsTotal`, `failedTurn: { index, kind } | null`; `stagesCleared`/`stagesTotal` restano gli scontri.
- **Segnaposto:** l'esplorazione è sempre superata e **non consuma tiri** (la sequenza dei tiri di una dungeon intera resta identica a oggi: un `combat.resolve` per voce); la porta ammette la sconfitta in esplorazione perché il tipo di ritorno la esprime (`failedTurn.kind = exploration`) e il flusso la gestisce. Le prove usano un `DungeonResolver` di test (override di provider) che cade in un turno di esplorazione scelto. Nessuna probabilità iniettabile nel segnaposto: il motore vero è dell'utente.
- **Sull'aid:** `rescue.turn = { index, kind, total }` (Mongoose, mai sul filo come oggi `rescue`, `quest-rescue.model.ts:4-21`), scritto da `buildAidQuest` quando la battaglia persa porta `failedTurn`. La presenza di `rescue.turn` dice «aid di dungeon» (l'aid perde il tipo originale, `aid-quest.ts:117`).
- **Percorso del soccorritore:** in `RescueResolutionService.fightRescuers` (`:395-401`) un ramo: con `rescue.turn` → `dungeon.explore(buildDungeonContext({ combat, recommendedLoot, participants }), …)` con `lastTurnIndex = rescue.turn.index`, poi `dungeonBattleOf` per posto; serve iniettare `DungeonResolver` in `RescueResolutionService`. Stessa porta della dungeon (D-13).
- **Aid persa nel percorso:** si applica D-10 (feriti morti, nuova aid clonata dall'originale); la nuova aid salva **il turno dove sono caduti i soccorritori** (C-5).
- **Xp dei nemici e conoscenze:** solo per le voci affrontate fino al turno (oggi `enemyFactsOf`/`victoryKnowledgeOf` sommano tutte le voci, `combatant-plan.ts:75-91`): default tecnico.

**Premio proporzionale (D-14), salvato già all'aid (punto 6 della FE, fattibile):** il turno della sconfitta è noto quando nasce l'aid (`failedTurn` è nel piano della battaglia, stessa transazione di `createAid`). Quota `s = (index + 1) / total` (unità = turni; caduto al 4° di 8 → index 3 → 4/8).
- Monete in rame e xp: `floor(valore × s)` scritti sull'aid (così `Quest.prizes` dell'aid mostra la quota vera prima di accettare).
- `prizeItem` fisso: quantità `floor(q × s)`, voce tolta se 0 (default tecnico; con quantità 1 resta solo a dungeon completa).
- `randomLoot`: è un **pool** tirato a cascata per vincitore (`cascading-loot.ts:31-47`), non si può «dimezzare» scrivendolo. Si conserva il pool e alla risoluzione la soglia di ogni rarità diventa `DROP_RATES[rarità] × s` (stessi tiri, metà probabilità con s = 0,5). `s` si rilegge da `rescue.turn`.
- Pet: soglia `QUEST_PET_WIN_CHANCE × s` (stesso tiro).
- Magia e cura: invariate (la cura non si eredita; le magie vivono nelle solitarie dedicate).
- Una catena (aid persa) ricalcola dall'originale col turno nuovo: nessuna quota applicata due volte.

**Contatori per la FE:** vedi SDL (§Q7). Per il soccorritore che salva al turno 4 di 8: `turnsCompleted: 4`, `turnsTotal: 8`, `lastTurn: 4`, `lastTurnKind: fight`, `stagesCleared: 2`, `stagesTotal: 4`.

**Incoerenza nella ROADMAP:** il criterio 4 dice «persa al 4° turno (esplorazione)», ma col ritmo E F E F il 4° turno è uno scontro (le esplorazioni sono 1°, 3°, 5°, 7°) → **C-1**.

### Q11 — Archiviatore

**Sonda 1 (harness di integrazione, file cancellato):** aid con un ferito e un soccorritore iscritto (`PendingQuest` con `startDate: null`, corsia standard sulla `PendingQuest`), archivio del ferito in transazione → `{"aidConcludedAt":"2026-11-13T10:00:00.000Z","aidRescue":{"characters":[]},"aidRegistered":1,"rescuerLane":"…","pendingExists":true}`. **Riprodotto**: l'aid è conclusa, il soccorritore resta iscritto con corsia e `PendingQuest`. Nessuno lo libera: `disband` esce su `concludedAt != null` (`party-timeout.service.ts:88-89`) e la quest conclusa sparisce dalla board.

**Confronto:** il timeout chiama `releaseRegistered` in sessione dopo il claim (`rescue-resolution.service.ts:317-321`), che cancella le sole `PendingQuest` non avviate della quest e libera la corsia (`party-timeout.service.ts:135-155,187-241`), poi **dopo il commit** manda `questCancelled` ai liberati (`rescue-resolution.service.ts:338`, `notifyCancelled :174-184`). L'archiviatore non manda nulla oggi.

**Raccomandazione (C-8):** estrarre `releaseMembers` in una funzione di sessione condivisa sotto `src/quests/party/` (precedente di import dal personaggio al party: `seat-release.ts:4`) e chiamarla in `releaseQuestsOf` per le aid che il passo conclude; `CharacterArchiveModule` registra anche `PendingQuest`. Per il push: un metodo `archiveWithinReporting` che restituisce `{ outcome, released }` e `archiveWithin` resta un wrapper (nessuna delle 8 spec che lo chiamano cambia); i chiamanti (`character-deletion.service.ts:49`, `rescue-resolution.service.ts:562`) mandano `questCancelled` dopo il commit come il timeout. Caso a parte, fuori scope: un'aid **avviata** svuotata dall'archivio si risolve come individuale per i soccorritori già in countdown (`resolution-kind.ts:10-11`).

### Q12 — Dati a DB

Fatti del CONTEXT: 0 story, 0 worldMission, 12 boss a titolo unico (5 paladin, 5 mage, 2 hero), 40 dungeon senza posti, 0 aid. **Raccomandazione: nessun migratore** (C-10). La lettura `prizeBlocksOf` interpreta un boss senza `rankPrizes` come un solo blocco del suo `minTitle`, che per un boss a titolo unico coincide col titolo di ogni posto: stessa resa di oggi per ogni partecipante, e il ripiego copre i legend. Le 40 dungeon sono solitarie (premio unico). I boss generati da qui in avanti scrivono i blocchi.

### Q13 — Coverage e gate

- Soglie toccate (`package.json` `coverageThreshold`): `./src/quests/acceptance/` 97/91/98 (D-02 in `quest-eligibility.ts`), `./src/quests/generation/` 96/82/97 (boss misti, conteggio dei ranghi); `src/quests/outcomes/`, `src/quests/prizes/` e `src/characters/deletion/` non hanno soglia.
- `test/app.int-spec.ts` pinna le stringhe esatte di `type Quest`, `type QuestPrizes`, `type QuestResult` (§Q7).
- Trappola 15-03 confermata in questa ricerca: una int-spec che fallisce prima di `harness.close()` lascia jest appeso a 0 % CPU (la prima versione della sonda 1 è caduta su E11000 per il nome duplicato del fixture `Test Hero` e non è uscita da sola). Ogni int-spec nuova chiude l'harness in `afterAll` e usa nomi distinti.
- Spec lente da lanciare mirate: `quest-generator.int-spec.ts` (771 righe), `aid-rescue.int-spec.ts`, `boss-resolution.int-spec.ts`, `test/app.int-spec.ts`.

## Proposte di emendamento al CONTEXT

- **C-1 (ROADMAP criterio 4, D-12):** col ritmo E F E F il 4° turno è uno scontro. Testo proposto: «Una dungeon da 4 gruppi (8 turni) persa al 5° turno (esplorazione) salva il turno sull'aid; il soccorritore percorre 5 turni, completa il 5° e salva il ferito con 5/8 dei premi; persa al 4° (scontro) → metà».
- **C-2 (D-02):** «Un posto a titolo null in un `boss` o una `worldMission` rende la quest non accettabile (`QUEST_NOT_ACCEPTABLE`, fail-closed come D-27); il boot riporta in sola lettura le quest di gruppo aperte con posti null, titoli dei posti senza blocco o magie in blocchi sotto mage».
- **C-3 (D-04, ripiego):** «Se manca il blocco del titolo vale il blocco più alto non superiore al titolo, altrimenti il più basso; viewer senza personaggio = blocco del `minTitle`; stessa funzione per foglio e risoluzione» (in attesa di P-1).
- **C-4 (D-03):** «Il boss misto scrive `minTitle` = titolo più basso dei posti (l'accettazione controlla il titolo prima dei posti); posti `[rango, inferiore]`; 1 boss su 2 misto, da 1 a metà dei posti al titolo inferiore; il generatore conta la copertura dei boss sul titolo più alto dei posti; blocchi in `prizes.rankPrizes`, campi di oggi uguali al blocco del rango».
- **C-5 (D-10 con D-12):** «La nuova aid nata da un'aid di dungeon persa salva il turno dove sono caduti i soccorritori».
- **C-6 (D-14):** «Unità = turni, quota `(indice + 1) / totale`; monete, xp e quantità del `prizeItem` scritte già in proporzione sull'aid (per difetto); `randomLoot` e pet restano e la loro soglia di vittoria è moltiplicata per la quota alla risoluzione; turno salvato in `rescue.turn { index, kind, total }`».
- **C-7 (D-09):** testo secondo P-2.
- **C-8 (D-16):** «L'archiviatore libera corsie e PendingQuest dei soccorritori non partiti con la stessa routine del timeout e i chiamanti mandano lo stesso push `questCancelled` dopo il commit».
- **C-9 (D-07):** «`Quest.prizes` resta `QuestPrizes!` risolto per viewer; `Quest.rankPrizes: [QuestRankPrizes!]!` additivo; `QuestResult` guadagna `turnsTotal`, `turnsCompleted`, `lastTurn`, `lastTurnKind: DungeonTurnKind` nullable; `stagesCleared`/`stagesTotal` invariati. Nessun cambio di forma non additivo (solo semantica di `prizes`)».
- **C-10 (migrazione):** «Nessun migratore né one-off: un boss senza blocchi si legge come premio unico del suo `minTitle`».
- **C-11 (D-05b):** «Il cancello della magia usa il titolo dopo l'esito; una study di Valantar vinta da un non caster passa al ramo della lore dello studio».

## Domande di PRODOTTO per l'utente

**P-1 — Blocco quando il titolo del personaggio non ne ha uno.**
Dati: un legend si siede sui posti hero di un boss hero (regola 13.1 D-08) ma il generatore non crea mai blocchi legend; un titolo può salire fra iscrizione e completamento solo in una worldMission (story completata dall'oste nel frattempo; per boss e aid il completamento della story è bloccato dalla corsia standard occupata); chi apre il foglio senza personaggio non ha titolo. Opzioni: (a) blocco più alto non superiore al proprio titolo, altrimenti il più basso — senza personaggio il blocco del titolo minimo; (b) blocco del titolo con cui si è iscritto (`registeredAdventurers.title`), che però non esiste per il foglio di chi non è iscritto. **Raccomandazione: (a)**, stessa regola per foglio e risoluzione (anche la FE la propone).

**P-2 — Sconfitta in una quest che non apre soccorso.**
Dati: con D-09 heal, job, study, magic, crime e guard con nemici non aprono più un'aid; oggi la apre ogni sconfitta. A DB nessuna crime ha nemici; delle altre il CONTEXT non dice nulla. Lo scontro con le guardie perso oggi lascia il personaggio a 1 di vita in città, corsia libera, ferite e consumi tenuti, nessun premio, nessun soccorso. Opzioni: (a) come lo scontro con le guardie perso (1 di vita); (b) vita lasciata dal combattimento (in pratica 1, perché la vita non scende mai sotto 1); (c) morte. **Raccomandazione: (a)**, che riusa una regola che l'utente conosce dalla UAT.

## Default tecnici (non domande)

- Esplorazione del segnaposto sempre superata, senza tiri; sconfitta in esplorazione provata con una porta di test.
- `MIXED_BOSS_SHARE = 0.5` e proporzione dei posti inferiori come in §Q4.
- Arrotondamento per difetto di monete, xp e `prizeItem` sull'aid; soglie di loot e pet scalate.
- Copertura del generatore contata sul titolo più alto dei posti dei boss.
- Push `questCancelled` dall'archiviatore via chiamanti dopo il commit.

## Nomi interni consigliati

| Cosa | Nome |
|------|------|
| Blocchi a DB | `prizes.rankPrizes: QuestRankPrize[]` (`@Schema`, solo Mongoose) |
| Lettura e scelta | `prizeBlocksOf(quest)`, `prizeBlockFor(quest, title)` in `src/quests/prizes/rank-prizes.ts` |
| Tipi di gruppo per i premi | `GROUP_PRIZE_TYPES` (`boss`, `worldMission`, `aid`) |
| Sul filo | `Quest.prizes` (`@ResolveField`), `Quest.rankPrizes: [QuestRankPrizes!]!`, `QuestRankPrizes { title, prizes }` |
| Aid per tipo | `opensAid(type)` / `AID_OPENING_TYPES` |
| Turni | `DungeonTurnKind { exploration, fight }`, `dungeonTurnsOf`, `DungeonResolution.failedTurn`, `rescue.turn { index, kind, total }` |
| Quota | `rescueShareOf(turn)`, `proportionalPrizesOf(prizes, share)` |
| Boss misti | `MIXED_BOSS_SHARE`, `lowerRankOf(rank)`, `mixedSeatsOf(seats, chance)` |
| Viewer | `ViewerVitalsService` esteso con `title` (oppure `ViewerFactsService`) |
| Archiviatore | `releaseRegisteredWithin(models, questId, session)`, `archiveWithinReporting` |

## File probabili per area

- **Modello:** `src/models/quest/quest-prizes.model.ts`, `quest-rank-prize.model.ts` (nuovo), `quest-rescue.model.ts`, `src/models/quest-result/quest-result.model.ts`, `src/models/enums/dungeon-turn-kind.enum.ts` (nuovo), `src/quests/quest-catalog.populate.ts`.
- **Blocchi:** `src/quests/prizes/rank-prizes.ts` (nuovo), `combatant-plan.ts`, `gm-completion.service.ts`, `resolution-loader.service.ts` (`readRewardCatalog` sull'unione dei ref dei blocchi; `readPrizePets` per più pet), `quest-rewards.ts` (`rewardRefsOf` sui blocchi, soglie scalate).
- **Magia:** `quest-rewards.ts`, `outcome-plan.ts`.
- **D-02:** `quest-eligibility.ts`, `quest-capacity.ts`, `src/quests/maintenance/quest-maintenance.boot.ts` + report nuovo.
- **Generatore:** `quest-composition.ts`, `generated-quest-draft.ts`, `quest-generator.service.ts`, `generation-rules.ts`.
- **Aid:** `combatant-plan.ts`, `outcome-plan.ts` o `unrewarded-plan.ts`, `aid/aid-quest.ts`, `quest-resolution.service.ts`, `boss-resolution.service.ts`, `rescue-resolution.service.ts`.
- **Dungeon:** `dungeon/dungeon-resolver.ts`, `dungeon/dungeon-context.ts`, `dungeon/placeholder-dungeon-resolver.ts`, `dungeon/dungeon-turns.ts` (nuovo), `quest-outcomes.module.ts`.
- **Archiviatore:** `src/characters/deletion/character-archiver.ts`, `character-archive.module.ts`, `character-deletion.service.ts`, `src/quests/party/party-timeout.service.ts`, funzione condivisa nuova.
- **Filo:** `src/quests/no-effect/` (resolver dei premi, servizio del viewer), `quests.module.ts`, `src/schema.gql`, `test/app.int-spec.ts`.

## Ordine consigliato dei piani

1. **Magia ai caster** (D-05b): pura + `planParticipant`, fixture a mage dove serve. Indipendente.
2. **Modello e lettura dei blocchi** (D-01, D-04): schema `rankPrizes`, `prize-blocks`, populate/sanificazione, scelta nelle due porte, catalogo dei premi sull'unione dei ref. Base di 3, 5, 6, 8.
3. **D-02**: rifiuto all'accettazione + report al boot (dipende da 2 per «titolo senza blocco»).
4. **Aid per tipo** (D-09) e clone dei blocchi (D-11) (dipende da 2; P-2 deciso).
5. **Archiviatore** (D-16): RED della sonda 1, routine condivisa, push. Indipendente.
6. **Generatore misto** (D-03, D-05, D-05a) (dipende da 2).
7. **Dungeon a turni** (D-12, D-13): porta, segnaposto, turno sull'aid, percorso del soccorritore (dipende da 4).
8. **Premio proporzionale** (D-14) (dipende da 7).
9. **Filo** (D-07): resolver dei premi, `rankPrizes`, campi dei turni, SDL al boot reale (dipende da 2 e 7).
10. Gate. 11. Chiusura e handoff.

## Common Pitfalls

1. **Ref dei blocchi non popolati sul filo:** un `pet` o un `item` nudo dentro un blocco annulla la lista `quests`; aggiungere i tre percorsi a `QUEST_CATALOG_POPULATE` e sanificare ogni blocco. Prova: int-spec di `quests` con un blocco che punta a un pet cancellato.
2. **Tiri nuovi nel generatore in mezzo alla quest:** spostano tutte le quest successive della corsa. Solo in coda e solo per i boss (§Q3).
3. **`minTitle` del boss misto:** se resta il rango del boss, il titolo inferiore è rifiutato prima del controllo dei posti (§Q4).
4. **Conteggio dei ranghi del generatore** spostato dal `minTitle` abbassato (§Q4).
5. **`planParticipant` lancia su sconfitta senza aid** (`outcome-plan.ts:365-367`): D-09 non è «togliere l'aid» ma «cambiare piano».
6. **L'aid perde il tipo originale:** riconoscere l'aid di dungeon da `rescue.turn`, non da `infos.type`.
7. **Payload WS condiviso:** il resolver dei premi non deve mai mutare il parent né memoizzare fuori dalla chiave per viewer (trappola Phase 16).
8. **Fixture rookie che impara magie** nelle spec esistenti (§Q6).
9. **Catalogo dei premi con un solo pet e una sola magia** (`resolution-loader.service.ts:579-634`): coi blocchi servono le mappe sull'unione dei ref di tutti i blocchi.
10. **Quota applicata due volte:** le catene clonano l'originale, non l'aid scalata.
11. **Int-spec appese** se cadono prima di `close()` (§Q13); nomi dei personaggi distinti (indice unico case-insensitive sul nome).
12. **`SequenceChance` con fallback basso** nelle spec del generatore (0.05, 0.12) attiva il cancello dei boss misti.
13. **«La mano vince» ambiguo:** per un tipo di gruppo con blocchi i campi di oggi sono ignorati; il report al boot lo deve rendere visibile.

## Open Questions (RESOLVED)

1. Mappa o array per i blocchi? — RESOLVED: array dentro `prizes` (§Q1, sonda 2).
2. Serve un migratore per i 12 boss? — RESOLVED: no (§Q12, C-10).
3. Il cambio sul filo è non additivo? — RESOLVED: solo semantica di `Quest.prizes`; forme additive (§Q7, C-9).
4. Dove imporre `isSpellCaster`? — RESOLVED: nelle due funzioni pure, un chiamante (§Q6).
5. Rifiuto o report per D-02? — RESOLVED: entrambi (§Q5, C-2).
6. Il bug dell'archiviatore esiste? — RESOLVED: riprodotto (§Q11, sonda 1).
7. Come si dimezza il loot? — RESOLVED: soglie scalate, nessun tiro nuovo (§Q10, C-6).
8. Unità del premio proporzionale? — RESOLVED: turni (§Q10).
9. Premio dell'aid in proporzione già alla creazione? — RESOLVED: sì per monete, xp, `prizeItem`; loot e pet alla risoluzione (§Q10).
10. L'archiviatore manda `questCancelled`? — RESOLVED: oggi no; proposto sì via chiamanti (§Q11, C-8).
11. Blocco mancante per il titolo — spostata in **P-1**.
12. Sconfitta senza aid — spostata in **P-2**.

## Environment Availability

Step 2.6: nessuna dipendenza esterna nuova (MongoMemoryReplSet dell'harness verificato funzionante con le sonde: suite di 2 test in 2,6 s).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest, progetti `unit` e `integration` (`package.json` `jest.projects`) |
| Config file | `package.json`; integration con `test/setup/global-setup.ts` (MongoMemoryReplSet) |
| Quick run command | `npx jest <spec> --selectProjects unit` |
| Full suite command | `npm run test:unit` + `npm run test:int` (`test:cov` lo lancia l'orchestratore) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-RANKP-01 | lettura blocchi, boss legacy = blocco del `minTitle`, solitarie ignorano `rankPrizes` | unit | `npx jest src/quests/prizes/rank-prizes.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-RANKP-01 | schema `rankPrizes` con enum del titolo e path assoluti | unit | `npx jest src/models/quest/quest-prizes.schema.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-RANKP-01 | posto null rifiutato su boss/worldMission (D-02) | unit + integration | `npx jest src/quests/acceptance/quest-eligibility.spec.ts --selectProjects unit`; `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-RANKP-01 | report al boot | unit | `npx jest src/quests/maintenance/quest-maintenance.boot.spec.ts --selectProjects unit` | ✅ (da estendere) |
| BE-RANKP-02 | boss misto: mage blocco mage, paladin blocco paladin, legend blocco hero | integration | `npx jest src/quests/outcomes/boss-resolution.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-RANKP-02 | worldMission completata dal GM coi blocchi scritti a mano | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-RANKP-02 | nessun rookie impara una magia (fissa, sorteggio, study) | unit + integration | `npx jest src/quests/outcomes/rewards/quest-rewards.spec.ts src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit`; `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-RANKP-03 | boss misti solo col titolo inferiore, `minTitle` più basso, blocchi per titolo, pet per blocco, enemy invariate tiro per tiro | unit + integration | `npx jest src/quests/generation/quest-composition.spec.ts src/quests/generation/generated-quest-draft.spec.ts src/quests/generation/generated-prizes.spec.ts --selectProjects unit`; `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-RANKP-03 | `Quest.prizes` per viewer (HTTP, WS per subscriber, senza personaggio), `rankPrizes`, ref popolati | integration | `npx jest src/quests/quests.resolver.int-spec.ts src/quests/quest-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-RANKP-04 | hunt persa → aid; job persa → nessuna aid (P-2); boss perso → aid con blocchi e posti; crime arresto invariato | unit + integration | `npx jest src/quests/outcomes/combatant-plan.spec.ts src/quests/outcomes/aid/aid-quest.spec.ts --selectProjects unit`; `npx jest src/quests/outcomes/quest-combat.int-spec.ts src/quests/outcomes/crime-guard-conclusion.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-RANKP-05 | turni E F, sconfitta in esplorazione, turno salvato, percorso fino al turno, quota, aid persa col turno nuovo | unit + integration | `npx jest src/quests/outcomes/dungeon --selectProjects unit`; `npx jest src/quests/outcomes/quest-dungeon.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ✅ (+ `dungeon-turns.spec.ts` ❌) |
| BE-RANKP-06 | archiviatore libera i soccorritori e i chiamanti notificano | integration | `npx jest src/characters/deletion/character-archiver.int-spec.ts --selectProjects integration --runInBand` | ✅ (caso nuovo, RED della sonda 1) |
| BE-RANKP-06 | SDL al boot reale | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ |

### Sampling Rate
- **Per task commit:** la spec mirata del task + `npx tsc --noEmit -p tsconfig.json`.
- **Per wave merge:** cartella toccata (`src/quests/outcomes`, `src/quests/generation`, …) nei due progetti.
- **Phase gate:** suite completa senza coverage + coverage per cartella delle soglie toccate.

### Wave 0 Gaps
- [ ] `src/quests/prizes/rank-prizes.spec.ts` — BE-RANKP-01/02
- [ ] `src/quests/outcomes/dungeon/dungeon-turns.spec.ts` — BE-RANKP-05
- [ ] porta di dungeon di test che cade in un turno scelto (in `test/quests/`) — BE-RANKP-05
- [ ] spec della quota proporzionale (`rescue-share.spec.ts` o dentro `aid-quest.spec.ts`) — BE-RANKP-05

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (invariata) | JWT di sessione esistente |
| V4 Access Control | sì | `Quest.prizes` risolto sul personaggio del bearer (identità solo dal token, come `noEffect`); `rankPrizes` non è segreto (dati di gioco), nessun argomento nuovo |
| V5 Input Validation | sì | contenuto a DB sanificato in lettura (`rewardItemOf`, `cureOf`, enum `TitleType` nello schema dei blocchi); D-02 fail-closed |
| V6 Cryptography | no | — |

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Viewer che legge il blocco di un altro titolo per ottenere di più | Tampering | il premio si decide in sessione sul titolo dello snapshot, mai dal client |
| Memo per viewer condivisa fra subscriber WS | Information disclosure | memo dentro la chiave dell'evento per viewer (pattern Phase 16/18) |
| Log | Information disclosure | solo id e conteggi nel report al boot |

## Sources

### Primary (HIGH)
- Codice del repo BE sul branch della fase (file:riga citati sopra).
- Sonda 1 (archiviatore) e sonda 2 (populate dei blocchi annidati), harness `test/auth/auth-test-app.ts` su MongoMemoryReplSet, file cancellati; `git status --short` pulito dopo la cancellazione.
- FE in sola lettura: `lib/graphql/fragments/quest_fragment.dart`, `quest_result_fragment.dart`; `.planning/phases/20-rank-specific-prizes-for-group-quests/20-CONTEXT.md` e fatti della ricerca FE comunicati dall'orchestratore.

### Secondary
- CONTEXT delle fasi 9 (D-05, D-08..D-10), 13 (D-05, D-10..D-13, D-20, D-21).

## Metadata

**Confidence breakdown:**
- Blocchi e risoluzione: HIGH — due porte verificate, populate sondato.
- Filo: HIGH sul meccanismo (precedenti `relatedLore`/`noEffect`), MEDIUM sui nomi.
- Dungeon a turni: MEDIUM — struttura di default tecnico, motore dell'utente.
- Pitfall: HIGH.

**Research date:** 2026-11-13
**Valid until:** fine della fase (codice stabile sul branch)
