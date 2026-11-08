# Phase 16: Lore sbloccabili - Research

**Researched:** 2026-11-07
**Domain:** NestJS 11 + Mongoose 8.18.1 + Apollo code-first (graphql 16.11.0, graphql-ws 6.0.6). Due insiemi additivi sul `Character`, punti d'innesto nelle scritture di movimento e di esito già in transazione, field resolver per viewer con cache per richiesta (HTTP e WS), un tiro nuovo sulla `ChanceSource`, un one-off al boot
**Confidence:** HIGH sul codice (tutto letto sul branch `feat/16-lore-sbloccabili`, base `develop` `9103440`) e sulle due probe; MEDIUM su tre punti di semantica che il CONTEXT non copre o copre in modo contraddittorio (C-1, C-2, C-5)

## Summary

La fase non richiede librerie nuove. I due insiemi sono array di `ObjectId` tipizzati (come `status.spells`, `character-status.model.ts:51-57`): niente registro dei ref misti, niente migrazione del catalogo. Il filo serializza gli `ObjectId` come `ID` senza populate. Il precedente vivo è `QuestResult.character: ID!` / `ActiveTravel.to: ID!`. `graphql` 16 ricade su `toJSON()` → esadecimale. La probe conferma che `status.unlockedLore` resta una lista di `ObjectId` veri sia con l'update a pipeline sia con l'add-to-set di Mongoose: un esadecimale stringa viene castato e deduplicato.

Ogni scrittura che deve sbloccare esiste già ed è un solo `findOneAndUpdate` in transazione:

1. creazione: `character-creation.service.ts:37-67`;
2. completamento del viaggio: `travel-completion.service.ts:82-116`, con `COMPLETION_UPDATE` a pipeline in `travel.updates.ts:95-103`;
3. teleport: `travel.service.ts:186-210`, `teleportUpdate` in `travel.updates.ts:139-143`;
4. salto dell'accettazione: `laneClaimUpdate` in `quest-acceptance.updates.ts:74-95`;
5. esiti: `planParticipant`, `outcome-plan.ts:321-481`, scritto da `OutcomeWriter.writeParticipant`, `outcome-writer.service.ts:95-108`;
6. imboscata vinta: `ambush-plan.ts:236-248`.

La geografia è un dato di catalogo (città → lore → `relatedLore`). Il marker è noto prima della transazione per il teleport, il salto, il soccorso e la creazione; per il completamento si legge dal documento `before` dentro la stessa sessione. Lo snapshot che serve al diff di `loreUnlocked` c'è già: `OUTCOME_CHARACTER_PROJECTION` proietta tutto `status` (`outcome-plan.ts:44-48`), quindi la proiezione non va estesa. Va esteso solo il tipo `OutcomeCharacterSnapshot.status` (`:52-63`).

Il punto delicato è la cache per richiesta del viewer. La probe dimostra che su graphql-ws il `contextValue` è **lo stesso oggetto per tutti gli eventi di una subscription**: `graphql-ws/dist/server-3ewaJSjp.js:206-207` lo calcola una volta al `subscribe`, `graphql/execution/subscribe.js:69` riusa gli `args` con `rootValue: payload`. Una cache appesa al context servirebbe a `questResultReceived` e `questUpdated` la conoscenza del primo evento. Il `known: true` subito dopo una vittoria (D-07) sarebbe falso. La chiave giusta è `info.rootValue` quando è un oggetto (payload dell'evento, diverso a ogni evento, uguale dentro l'evento), altrimenti il context (HTTP: `rootValue` undefined, context nuovo per richiesta, probe).

Tre punti del CONTEXT non reggono alla lettera sul codice. **`gmCompleted` combatte sulla carta** (C-1): `planParticipant` lo tratta come vinto e gli dà l'xp dei nemici. **Il soccorso sposta il ferito sul marker della città** (C-2), un quinto arrivo che D-05 non elenca. **Il pool dello studio non si può filtrare nel loader** (C-3): il catalogo è letto fuori dalla transazione, lo snapshot dentro.

**Primary recommendation:**
- `src/lore/` diventa il modulo della conoscenza:
  - pure: `geographyOf` e `visibleLore`/`isVisible`;
  - reader: `LoreGeographyReader.ofMarker`;
  - servizio viewer: `ViewerKnowledgeService.of`, con cache WeakMap su `rootValue` o context;
  - field resolver: `QuestEnemy.known`, `City.relatedLore`, `Lore.relatedLore`, `Enemy.relatedLore`.
- Nei piani puri si aggiunge l'add-to-set solo quando la lista non è vuota. Così le decine di `toEqual` sugli update esistenti restano verdi.
- Il tiro dello studio sono due estrazioni (`gate`, `pick`) in coda a `drawRewards`, solo quando il pool di catalogo non è vuoto. Le sequenze `chance.drawn` delle spec esistenti non cambiano.
- Il backfill è un passo idempotente al boot (unione, mai sovrascrittura) in `src/migrations/lore-backfill/`, rimosso in TDD dopo il boot reale.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Insiemi e contratto (BE-LORE-01)
- **D-01 (utente, «Lista di id sul personaggio»):** `Character.status.unlockedLore: ObjectId[]` (ref `Lore`, default `[]`) e `Character.status.knownEnemies: ObjectId[]` (ref `Enemy`, default `[]`), additivi, scritti solo con add-to-set. Sul filo `CharacterStatus.unlockedLore: [ID!]!` (soli id, nessun populate; ~26 byte per lore in ogni evento `characterUpdated`, 473 lore a DB); `knownEnemies` non compare nello SDL. L'alternativa a collezione dedicata (`characterlore` con `unlockedAt`/`source`) è stata scartata: lo stream dei personaggi riemette già il documento.
- **D-02 (fatto di codice):** nessun campo `unlocked` esiste sul modello `Lore` né a DB (0 documenti su 473): la voce «rimosso o ridefinito» della ROADMAP è superata, nessuna conoscenza comune, nessuna migrazione del catalogo.

#### Geografia (BE-LORE-01, BE-LORE-02)
- **D-03 (utente, «Città + regioni + stato, nascita e arrivo»):** la geografia di una città = la lore della città (`City.relatedLore`, 167/167 presenti) più le lore di tipo `region` e `state` fra le `relatedLore` di quella lore di città (a DB: 88 città con 1 regione, 74 con 2, 5 con 3; sempre 1 stato; es. Murnborim → Regno della Madre, Lamstone, Lontano Nord). Un'unica funzione pura `geographyOf(cityLore, relatedLore)` serve la nascita e l'arrivo; le altre lore collegate (personaggi, religioni) non si aprono (nessuna cascata).
- **D-04 (utente, nascita):** `buildStartingCharacter` riceve la geografia della città natale scelta da `StartingLocationService` (oggi restituisce solo il marker: estendere il servizio o leggere la città nel servizio di creazione) e scrive `status.unlockedLore` nello stesso inserimento; `status.knownEnemies: []`.
- **D-05 (utente, arrivo = marker della città):** conta solo l'arrivo su un POI che è `City.markerLocation` (167 marker; i 475 POI del territorio — dungeon, portali, campi di battaglia — non sono una visita). Punti d'innesto, tutti nella stessa transazione della scrittura che muove il personaggio: completamento del viaggio (`TravelCompletionService.complete`, `COMPLETION_UPDATE`, sia `free` sia `quest`, compresa la deviazione dopo una sconfitta in imboscata che è un viaggio `free` verso una città), salto istantaneo dell'accettazione (`laneClaimUpdate` con `movement.kind === 'jump'`), teleport (`teleportUpdate`). La città e la sua geografia si leggono prima dell'update nella stessa sessione; add-to-set idempotente; un marker senza città (difetto di catalogo) non sblocca nulla e non blocca il movimento.

#### Nemici (BE-LORE-03, BE-LORE-06)
- **D-06 (utente, «Solo il nemico esatto sconfitto»):** a ogni esito `success` con nemici, per ogni partecipante vincente (individuale `QuestResolutionService`, party `BossResolutionService`, dungeon superata; l'imboscata vinta di `AmbushResolutionService` segue la stessa regola, default tecnico del Claude da vetare), lo stesso update del piano aggiunge con add-to-set le `Enemy.relatedLore` di tutti i nemici del contesto a `status.unlockedLore` e gli id dei nemici a `status.knownEnemies`. Sconfitta, soccorso, morte, `gmCompleted` senza combattimento: nulla. `known` sul filo = l'id esatto del nemico è in `knownEnemies` del personaggio corrente del viewer (una vittoria su un Goblin apre la pagina «Goblin» condivisa da 4 nemici, ma non schiarisce il Goblin boss).
- **D-07 (contratto):** `QuestEnemy.known: Boolean!` risolto per viewer (field resolver) su `Quest.infos.enemies[]` e `QuestResult.enemies[]`: innkeeper → `true`; utente senza personaggio corrente → `false`; una sola lettura del personaggio del viewer per richiesta (cache per request). Il risultato di una vittoria mostra `known: true` perché la conoscenza è scritta nella stessa transazione del `QuestResult`.

#### Studio (BE-LORE-04)
- **D-08 (utente, «50 %»):** `study` vinta (`infos.type === study`, le 30 «Ricerche in biblioteca» a DB non hanno magia fissa né sorteggio) senza `spellLearned` → con probabilità `LORE_STUDY_CHANCE` (config validata in [0, 1], default `0.5`) una lore casuale fra quelle non ancora sbloccate dei tipi `knowledge`, `god`, `religion`, `ceremony`, `material`, `state`, `character` (110 a DB); pool letto nel loader della risoluzione ordinato per id e tirato con la `ChanceSource` del piano (riproducibile nei test); pool vuoto → nulla; la lore appresa entra in `unlockedLore` nello stesso update e in `loreUnlocked`.

#### Esiti (BE-LORE-03, BE-LORE-04)
- **D-09 (utente, «Studio e prima pagina del bestiario»):** `QuestResult.loreUnlocked: ObjectId[]` (ref `Lore`, default `[]`) = le sole lore aggiunte da quell'esito (differenza rispetto allo snapshot di `status.unlockedLore` preso in sessione); sul filo `loreUnlocked: [Lore!]!` popolato (la FE seleziona `id name type` e scrive «Nuova pagina del Bestiario: …» per `enemy`/`animal`/`plant`, «Conoscenza appresa: …» per gli altri). Un esito senza novità → `[]`. Mai filtrato per viewer: è sbloccato per costruzione.

#### Query filtrate (BE-LORE-05)
- **D-10 (utente, «Mappa: solo il nome; quest intere»):** `lores` e `lore(id)` restituiscono solo le lore in `unlockedLore` del personaggio corrente del bearer, con le `relatedLore` annidate filtrate allo stesso modo; `lore(id)` di una lore chiusa → `NOT_FOUND` (stesso codice di una lore inesistente: nessun oracolo); `City.relatedLore` → `null` per il giocatore finché la città non è conosciuta (il FE mostra il solo nome); `Enemy.relatedLore` (query `enemy`/`enemys`) filtrata allo stesso modo; `Quest.infos.relatedLore` intera (voce del committente); l'innkeeper vede tutto senza filtro; utente senza personaggio corrente → `[]`/`null`/`NOT_FOUND`.

#### Dati esistenti, prove e handoff (BE-LORE-01, BE-LORE-06)
- **D-11 (regola di casa, migrazioni one-shot):** i 4 personaggi a DB nascono senza i due campi: un backfill one-off al boot reale li inizializza con la geografia della città del marker su cui si trovano (se `status.location` è un marker di città) più lore e id dei nemici dei loro `questresults` vinti (`success`/`gmCompleted` con `enemies`); report nel handoff, codice rimosso prima della merge (PR in draft finché non gira). I personaggi archiviati non si toccano.
- **D-12 (prove):** int-spec su nuovo personaggio (città + regioni + stato, nulla di più), arrivo libero/da quest/salto/teleport/deviazione (+ geografia, idempotente, POI del territorio ignorato), vittoria individuale e di party (tutti i vincitori; sconfitto nulla), dungeon, imboscata vinta, study con e senza tiro (chance stubbata), `loreUnlocked` solo novità, `lores`/`lore`/`City.relatedLore`/`Enemy.relatedLore` per giocatore e innkeeper, `known` per viewer, cancellazione e ricreazione → insieme nuovo, SDL verbatim della FE (selezioni `unlockedLore`, `known`, `loreUnlocked { id name type }`), `characterUpdated` riemesso; gate `test:cov` con le soglie di `src/` invariate; handoff `BACKEND-NOTES.md` per la FE Phase 17 con lo SDL finale, l'identità di prova per la UAT (il bypass dev è l'innkeeper e vede tutto: serve una seconda identità via env, come il 2026-11-01) e i trucchi a DB (svuotare `unlockedLore`, forzare il tiro dello studio, spostare un personaggio).

### Claude's Discretion
- Nome e forma della funzione di geografia, del field resolver `known` e della cache per request; dove vive il filtro (service vs resolver) e come si legge il personaggio corrente del bearer (pattern `@CurrentUser` + `users.currentCharacter`); forma del backfill (`--dry-run/--apply/--verify` come la Phase 10) e del suo report; nome della variabile d'ambiente oltre a `LORE_STUDY_CHANCE`; ordine delle `loreUnlocked`; indici (nessuno previsto: gli insiemi vivono nel documento); fixture e harness.

### Deferred Ideas (OUT OF SCOPE)
- Conoscenza per specie (scartata dall'utente); collezione dedicata con storico (scartata)
- Conoscenza comune / `Lore.unlocked` (non esiste più; nessuna lore condivisa)
- Filtro della narrativa delle quest (scartato: voce del committente)
- Lore sbloccate dalle quest narrative lette, dai negozi o dai pet; link fra lore (v2)
- Un contatore o una pagina «storia delle scoperte» (nessun `unlockedAt`)

### Nomi del contratto già fissati (`16-REPO-RULES.md`, bozza 2026-11-07)
`CharacterStatus.unlockedLore: [ID!]!`; `status.knownEnemies` senza `@Field`; `QuestEnemy.known: Boolean!`; `QuestResult.loreUnlocked: [Lore!]!` (popolato, sole novità); `City.relatedLore` null se chiusa; `Lore.relatedLore`/`Enemy.relatedLore` filtrate; `lores`/`lore(id)` filtrate con `ResourceNotFoundException.lore()`; `Quest.infos.relatedLore` intera; una sola env `LORE_STUDY_CHANCE` (default 0.5). Nomi interni: `src/lore/lore-geography.ts` (`geographyOf`), `src/lore/lore-visibility.ts`, `src/lore/known-enemies.resolver.ts`, `src/lore/study-lore-types.ts` (`STUDY_LORE_TYPES`), `src/config/lore-config.ts` (`LORE_CONFIG`), `src/migrations/lore-backfill/`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-LORE-01 | Due insiemi additivi, `unlockedLore` sul filo come `[ID!]!`, `knownEnemies` interno; geografia della città natale alla creazione; backfill one-off | F1 (modello `character-status.model.ts:51-57`, precedente `ID` da `ObjectId`), F2 (creazione `character-creation.service.ts:37-67`, `starting-character.ts:40-81`, `starting-location.service.ts:26-50`), F8 (backfill), C-5, Pattern 1-2 |
| BE-LORE-02 | Arrivo sul marker di una città → geografia nella stessa transazione, idempotente, POI del territorio ignorati | F2 (completamento `travel-completion.service.ts:86-104`, teleport `travel.service.ts:186-210`, salto `quest-acceptance.updates.ts:74-95` e `quest-acceptance.service.ts:321-330`, deviazione `ambush-plan.ts:259-285`), probe P2, C-2, C-4, Pattern 2 |
| BE-LORE-03 | Esito `success` con nemici → `Enemy.relatedLore` e id esatti per ogni vincitore; sconfitta nulla; `loreUnlocked` = sole novità | F3 (`planParticipant` `outcome-plan.ts:321-481`, `planCombatant` `combatant-plan.ts:124-158`, boss `boss-resolution.service.ts:157-184`, imboscata `ambush-plan.ts:204-248`, catalogo `resolution-loader.service.ts:147-154`), C-1, Pattern 3 |
| BE-LORE-04 | `study` vinta senza magia → `LORE_STUDY_CHANCE` su una lore chiusa dei `STUDY_LORE_TYPES` | F4 (`drawRewards` `quest-rewards.ts:191-212`, `drawLearnableSpell` `:227-246`, `readSpellPool` `resolution-loader.service.ts:605-622`, `SequenceChance` `test/quests/sequence-chance.ts`), C-3, Pattern 4 |
| BE-LORE-05 | `lores`/`lore(id)`/`City.relatedLore`/`Enemy.relatedLore` per viewer, innkeeper tutto, `Quest.infos.relatedLore` intera, `characterUpdated` riemesso | F5 (`lore.service.ts`, `cities.service.ts`, `enemies.service.ts`, `quests.service.ts:76-100` per il personaggio corrente), F7 (change stream senza filtro di campi), probe P1, Pattern 5 |
| BE-LORE-06 | `QuestEnemy.known` per viewer (nemico esatto), innkeeper `true` | F6 (field resolver, `@CurrentUser` valido nei field resolver e sotto WS — probe P1, cache su `rootValue`), Pattern 5, Pitfall 1 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fisso: NestJS 11, Mongoose 8, Apollo code-first. Nessuna libreria nuova (nessun DataLoader: la cache è una `WeakMap` di 20 righe, Pattern 5).
- **TDD Red → Green → Refactor** su ogni modulo. Clean Code, SoC, Boy Scout Rule: un solo `geographyOf`, un solo `ViewerKnowledgeService`, un solo helper per gli add-to-set del piano.
- **Il backend è fonte di verità**: cosa è conosciuto lo decide il server; il FE riceve id, `known`, `loreUnlocked` e `null`.
- **Compatibilità FE**: SDL solo additivo (`git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` vuoto); `City.relatedLore` è già nullable (`city.model.ts:34`).
- Branch e PR verso `develop`. **Nessun trailer `Co-Authored-By` / `Generated with` / `Claude-Session`** (`16-REPO-RULES.md`, prevale).
- Nessun segreto, mai leggere `.env`. `process.env.` solo nei provider di config (`src/config/env-example.drift.spec.ts:10-12`).
- Da `16-REPO-RULES.md`:
  - mai `npm run lint`/`format`/`build`/`nest build`;
  - `npx tsc --noEmit -p tsconfig.json` come gate (oggi exit 0, verificato);
  - jest con i percorsi prima di `--selectProjects`, integration `--runInBand`, mai in background;
  - nessun `Math.random` (il tiro solo dalla `ChanceSource`);
  - il DB reale non si tocca;
  - operatori Mongo solo in code span.

## Standard Stack

### Core (già installato, nessuna aggiunta)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mongoose | 8.18.1 | array `ObjectId` tipizzati, add-to-set castato, update a pipeline, transazioni | pattern di `status.spells` e degli esiti [VERIFIED: codebase, probe P2] |
| @nestjs/graphql | 13.2.0 | `@ResolveField` con `@Parent`, `@Context`, `@Info`, `@CurrentUser` | precedenti `cities.resolver.ts:23-31` (`size`, `hasShop`) [VERIFIED: codebase, probe P1] |
| graphql | 16.11.0 | `ID` da `ObjectId` via `toJSON`, `rootValue: payload` per evento | `node_modules/graphql/execution/subscribe.js:69` [VERIFIED: node_modules] |
| graphql-ws | 6.0.6 | context calcolato una volta per `subscribe` | `node_modules/graphql-ws/dist/server-3ewaJSjp.js:206-207` [VERIFIED: node_modules, probe P1] |
| jest 30 + mongodb-memory-server 11.2.0 | in uso | unit, integration sul replica set | harness esistenti [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cache per viewer in `WeakMap` con chiave `rootValue`-o-context (consigliata) | Provider `Scope.REQUEST` | Lo scope di richiesta in Nest si propaga a tutta la catena (resolver, servizi) e non funziona per evento sotto WS. Scartato [ASSUMED sul costo; il comportamento WS è VERIFIED da P1] |
| Cache `WeakMap` (consigliata) | `dataloader` | Libreria nuova vietata; qui la chiave è una sola (il viewer), non un batch di id |
| Seconda scrittura add-to-set dopo `COMPLETION_UPDATE` nella stessa sessione (consigliata) | Pipeline estesa con `$concatArrays` + `$filter` (verificata da P2) | La pipeline richiede di leggere `activeTravel.to` **prima** dell'update e di aggiungere `to` al filtro. La seconda scrittura lascia la costante `COMPLETION_UPDATE` (fissata da `travel.updates.spec.ts:172-181`) e la regola «la meta si legge dal documento». È atomica lo stesso (C-4) |
| Field resolver su `City.relatedLore`/`Lore.relatedLore`/`Enemy.relatedLore` (consigliato) | Post-filtro nei tre service | Il tipo `City` arriva anche da `cityShop.city` (`city-shop.model.ts:9`) e `PointOfInterest.city` (`point-of-interest.model.ts:22`); `Lore` anche da `loreUnlocked` e `Quest.infos.relatedLore[].relatedLore`. Il field resolver copre ogni percorso con una regola sola |
| Passo al boot (consigliato, C-5) | CLI `--dry-run/--apply/--verify` del piano 10-26 (`src/migrations/run-mixed-refs.ts`) | La CLI va lanciata a mano con `node --env-file=.env dist/...`. Il boot è la pratica delle Phase 12/13/13.1 (`quest-maintenance.boot.ts:5`) e non richiede comandi oltre al riavvio |

**Installation:** nessuna.

## Findings per flag

### F1 — Modelli e SDL
- **`status.spells` è il modello da copiare** (`character-status.model.ts:51-57`): `@Field(() => [Spell])` + `@Prop({ type: [MongooseSchema.Types.ObjectId], ref: Spell.name, default: [] })`. Per `unlockedLore`:
  - `@Field(() => [ID])`, che genera `[ID!]!` come `QuestResult.rescuedCharacters` (`quest-result.model.ts:249-255`, SDL `rescuedCharacters: [ID!]!`);
  - `@Prop({ type: [MongooseSchema.Types.ObjectId], ref: Lore.name, default: [] })`;
  - tipo TS `Types.ObjectId[]`.
  
  `knownEnemies` ha lo stesso `@Prop` con `ref: Enemy.name` e nessun `@Field`, come il `kind` interno di `ActiveTravel` (Phase 15 F1) [VERIFIED: codebase].
- **`ObjectId` → `ID` senza populate.** `QuestResult.character: ID!` e `ActiveTravel.to: ID!` sono `ObjectId` serviti oggi sul filo. `graphql` 16 `serializeID` ricade su `toJSON()` di bson, che restituisce l'esadecimale. Il documento idratato di `CharactersService.findOne` (`characters.service.ts:97-121`, nessun `lean`) applica il default `[]` ai documenti vecchi senza campo [VERIFIED: codebase; default all'idratazione ASSUMED, coperto dal backfill e da `?? []` nei lettori lean].
- **`QuestResult.loreUnlocked`** va accanto a `spellLearned` (`quest-result.model.ts:236-242`):
  - `@Field(() => [Lore])`;
  - `@Prop({ type: [MongooseSchema.Types.ObjectId], ref: Lore.name, default: [] })`;
  - tipo `(Types.ObjectId | Lore)[]`.
  
  Il populate è uno solo per i tre percorsi: `QUEST_RESULT_POPULATE` (`src/quests/results/quest-result.populate.ts:16-23`), usato da `findOne` (`quest-results.service.ts:32-42`, quindi `questResult` e il publisher `quest-results.publisher.ts:42-43` di `questResultReceived`), `findUnacknowledged` (`:44-53`) e `readCommitted` (`:56-80`, risposta del GM). Va aggiunto `{ path: 'loreUnlocked', model: Lore.name }`. Vanno toccati anche:
  - `dropOrphanResultRefs` (`:36-51`), per togliere le voci non risolte;
  - `unpopulatedResultOf` (`:54-69`), con `loreUnlocked: []`.
  
  [VERIFIED: codebase]
- **Registro dei ref misti: NON registrare i path nuovi.** `MIXED_REF_PATHS` (`mixed-ref-paths.ts:42-71`) elenca i ref salvati come Mixed e migrati dal piano 10-26. La spec conta `34` voci (`mixed-ref-paths.spec.ts:155-171`) e vuole che nessun ref degli schemi sia `Mixed` (`:136-142`). I nuovi array nascono `ObjectId`, come `rescuedCharacters` che non è nel registro [VERIFIED: codebase].
- **Asserzioni a stringa esatta dello SDL** (`test/app.int-spec.ts`), da aggiornare RED prima del codice. `sortSchema: true` (`graphql-options.factory.ts:55`) mette i campi in ordine alfabetico.
  - `:524-526` `type CharacterStatus`: inserire `  unlockedLore: [ID!]!\n` fra `  title: String!\n` e `  xp: Int!\n`.
  - `:455-457` e `:727-729` `type QuestEnemy` (due copie): `'type QuestEnemy {\n  enemy: Enemy!\n  known: Boolean!\n  quantity: Int!\n}'`.
  - `:662-664` `type QuestResult`: inserire `  loreUnlocked: [Lore!]!\n` fra `  levelBefore: Int!\n` e `  maxLifePoints: Int!\n`.
  - Invariati: `type Lore` (`:444-446`), `type City` (`:548-550`), `type QuestInfos` (`:452-454`), i blocchi `Enemy` (`:701`, `toContain`), `type Query`. Nessuna operazione nuova: le liste `EXPECTED_*_HANDLERS` (`:135-163`) non cambiano.
  
  [VERIFIED: codebase]
- **`production-surface.int-spec.ts:153-185`** (`lore(id)` di un id mancante con bearer di un giocatore → `NOT_FOUND`, messaggio `Lore non trovata`) resta verde con il filtro, se la lore chiusa lancia la stessa `ResourceNotFoundException.lore()` (`resource-not-found.exception.ts:47-49`). L'harness importa `LoreModule`: il modulo deve registrare da sé i modelli `User` e `Character` che il servizio del viewer legge (Pitfall 2) [VERIFIED: codebase].
- **Snapshot di schema**: `character.model.spec.ts` non fissa le chiavi di `status`. `quest-result.schema.spec.ts:110-121` controlla le liste vuote una per una: si aggiunge un `expect(result.loreUnlocked).toEqual([])`, nessun rosso. `catalog-list-fields.schema.spec.ts` non tocca `Lore`, `City` né `Enemy.relatedLore` [VERIFIED: codebase].

### F2 — Geografia e punti d'innesto (D-03..D-05)
- **Lettura della geografia** (un reader, tre query lean su collezioni piccole):
  1. `City` con `markerLocation` in `idForms(marker)`, via il **driver nativo** come `cityPoiIdsAt` (`quests.service.ts:128-138`, commento: «il cast di Mongoose sul ref ObjectId trasformerebbe la forma stringa di idForms»);
  2. la lore della città (`City.relatedLore`, scalare nullable `city.model.ts:34-40`) con proiezione `{ type: 1, relatedLore: 1 }`;
  3. le `relatedLore` di quella lore con proiezione `{ type: 1 }`.
  
  `geographyOf(cityLore, related)` restituisce `[cityLore._id, ...related.filter(type ∈ {region, state})._id]` senza duplicati. Nessuna città → `[]`, quindi il POI del territorio è ignorato per costruzione. Nessun indice su `markerLocation` (`grep CitySchema.index` vuoto): 167 documenti, scansione accettabile come oggi in `returnCityOf` (`rescue-resolution.service.ts:657-674`) [VERIFIED: codebase].
- **Creazione** (`character-creation.service.ts:32-45`): `resolveFor` restituisce il marker (`starting-location.service.ts:26-34`, fissato da `starting-location.service.int-spec.ts:59-152` con `toEqual(marker)`). **Non estendere `resolveFor`**: si legge `geography.ofMarker(locationId)` subito dopo, fuori dalla transazione come `resolveFor`. Poi `buildStartingCharacter(normalized, locationId, unlockedLore)` scrive `status.unlockedLore` e `status.knownEnemies: []` (`starting-character.ts:55-66`). L'inserimento resta quello in transazione (`:64-67`). `CharacterCreationModule` (`character-creation.module.ts`) registra solo `User`/`Character`/`City`/`PointOfInterest`: va aggiunto `Lore`, oppure va importato il modulo del reader [VERIFIED: codebase].
- **Completamento del viaggio** (`travel-completion.service.ts:86-104`). `findOneAndUpdate(completionFilter, COMPLETION_UPDATE, { returnDocument: 'before', projection: COMPLETION_PROJECTION })`.
  - Si aggiunge `'status.activeTravel.to': 1` a `COMPLETION_PROJECTION` (`travel.updates.ts:106-110`).
  - Se `before` esiste: `geography.ofMarker(to, session)`, poi, se non vuota, `characterModel.updateOne({ _id }, { $addToSet: { 'status.unlockedLore': { $each: ids } } }, { session })` nello stesso callback.
  - `free` e `quest` passano entrambi da qui. La deviazione d'imboscata è un `free` con `to` = marker della città raggiunta (`ambush-plan.ts:276-283`); il ripiego D-25 punta alla meta originale (`ambush-resolution.service.ts:327-338`), che sblocca solo se è un marker di città.
  
  Alternativa a pipeline in C-4 [VERIFIED: codebase, probe P2].
- **Teleport** (`travel.service.ts:165-210`). Il `poiId` è noto prima della transazione e il `poi` è già verificato (`:169-170`). `geography.ofMarker(poiId)` va letto fuori dal callback (catalogo, pattern «nel callback solo scritture» dell'accettazione). Poi `teleportUpdate(poiId, geography)` restituisce `$set` più `$addToSet` **solo se** la geografia non è vuota. `travel.updates.spec.ts:226-229` (`teleportUpdate(poi)` `toEqual` il solo `$set`) resta verde [VERIFIED: codebase].
- **Salto dell'accettazione**. `movementTo` (`quest-acceptance.service.ts:309-330`) restituisce `{ kind: 'jump', marker: request.to }` fuori dalla transazione. Si legge lì la geografia e si porta nel movimento, `{ kind: 'jump', marker, geography }`. `laneClaimUpdate` (`quest-acceptance.updates.ts:74-95`) aggiunge l'add-to-set solo con una geografia non vuota. Le `toEqual` di `quest-acceptance.updates.spec.ts:109-200` restano verdi se il campo è opzionale [VERIFIED: codebase].
- **Soccorso (C-2)**. `planRescued` scrive `'status.location': cityMarker` (`rescue-plan.ts:80-92`) con `cityMarker` letto fuori dalla sessione (`rescue-resolution.service.ts:657-674`). È un arrivo sul marker di una città che D-05 non elenca [VERIFIED: codebase].
- **Altre scritture di `status.location`** (`grep "'status.location'"`): solo quelle sopra. Le altre righe sono filtri o proiezioni (`quest-board.ts:20`, `pending-requests.service.ts:38`, `shop-transaction.service.ts:79/234`, `travel-planner.service.ts:66`). Il `CharacterStatusInput` (`character-status.model.ts:90-118`) non è usato da nessuna mutation (`grep CharacterInput` = solo la dichiarazione) [VERIFIED: codebase].

### F3 — Vittorie (D-06)
- **Un solo punto per quest, party, dungeon e GM: `planParticipant`** (`outcome-plan.ts:321-481`). Lo chiamano `planCombatant` (individuale, boss, soccorritori della aid: `combatant-plan.ts:137-156`) e `GmCompletionService` (`gm-completion.service.ts:302-321`). Il predicato è `won && input.enemies` (`enemyFactsOf` restituisce `null` senza nemici validi, `combatant-plan.ts:74-90`). Con questo predicato:
  - la sconfitta non insegna (`won` falso);
  - la quest senza nemici non insegna (auto-successo C6, `combatant-plan.ts:56-62`);
  - la dungeon a tappe vince solo con verdetto `success`, e allora i nemici sono tutti quelli della quest (`quest-resolution.service.ts:174-189`).
  
  [VERIFIED: codebase]
- **`gmCompleted` (C-1)**. `won = input.verdict !== QuestOutcome.failure` (`outcome-plan.ts:323`) include `gmCompleted`. Il GM passa `enemies: enemyFactsOf(catalog)` (`gm-completion.service.ts:311`) e il personaggio guadagna l'xp dei nemici. Se si vuole «`gmCompleted` → nulla», il predicato va scritto `input.verdict === QuestOutcome.success`. Ma è in tensione con D-11, che nel backfill conta i `gmCompleted` con nemici [VERIFIED: codebase].
- **Party**: un piano per partecipante con il proprio snapshot in sessione (`boss-resolution.service.ts:126-184`). Il verdetto è unico per il gruppo («il verdetto è del combattimento», `combatant-plan.ts:92`). I segnaposto archiviati (`holders`, `:136-146`) non hanno piano, quindi nessuno sblocco [VERIFIED: codebase].
- **Catalogo**. `COMBAT_ENEMY_PROJECTION` (`resolution-loader.service.ts:147-154`) non porta `relatedLore`: si aggiunge `relatedLore: 1`, e `CombatEnemySnapshot` (`combat/combat-context.ts:46-54`) guadagna `relatedLore?: unknown[]`. Il catalogo dei nemici è lo stesso per quest e imboscate (`readCombatCatalog`, `:415-465`) [VERIFIED: codebase].
- **Funzione nuova invece di toccare `EnemyFacts`**. `enemyFactsOf` è fissato da `combatant-plan.spec.ts:85-108` (`toEqual({ entries, xp })`). Conviene una funzione separata `victoryKnowledgeOf(catalog)`: restituisce `{ enemyIds, loreIds }` con gli id ordinati nell'ordine delle voci e senza duplicati. Le lore orfane si filtrano più avanti con il populate. Entra in `ParticipantPlanInput`/`AmbushPlanInput` come campo opzionale `victory?: { enemyIds; loreIds } | null` [VERIFIED: codebase].
- **Forma dell'update**. `ParticipantPlan.update` è `{ $set }` (`outcome-plan.ts:167-173`) e diventa `{ $set; $addToSet? }`. `writeCharacterUpdate` accetta già un `Record<string, unknown>` (`outcome-writer.service.ts:110-122`). Il filtro di staleness (`participantFilter`, `:307-319`) non cambia. `outcome-plan.spec.ts:144-157` fissa `Object.keys(plan.update)).toEqual(['$set'])` per la quest **senza combattimento**, quindi l'add-to-set va aggiunto solo con una lista non vuota [VERIFIED: codebase].
- **Diff `loreUnlocked`**: `nuove = victory.loreIds ∪ studio − snapshot.status.unlockedLore`, confrontate per esadecimale (`sameId`, `document-id.ts:28-33`). Lo snapshot è in sessione (`snapshotInSession`, `resolution-loader.service.ts:360-398`). Un `WriteConflict` riesegue il callback e ricalcola tutto (`quest-resolution.service.ts:101-104`) [VERIFIED: codebase].
- **Soccorso, morte**: `planRescued`/`deathResultOf` (`rescue-plan.ts:36-114`) non hanno nemici; `unchangedResult` guadagna `loreUnlocked: []` [VERIFIED: codebase].
- **Imboscata vinta**.
  - `planAmbushOutcome` (`ambush-plan.ts:313-336`) → `victoryUpdateOf` (`:236-248`): `$set` + `$push` del report, a cui si aggiunge l'add-to-set (path diversi, nessun conflitto).
  - Il catalogo è `readCombatCatalog` (`ambush-resolution.service.ts:261-265`); lo snapshot in sessione proietta tutto `status` (`:414-421`).
  - Il report (`AmbushReportDraft`, `ambush-plan.ts:66-88`) guadagna `loreUnlocked: Types.ObjectId[]`. Lo schema interno `AmbushReportSnapshot` (`ambush-snapshot.model.ts:48-123`) guadagna lo stesso `@Prop`: senza, la strict mode lo scarta (Phase 15 Pitfall 3).
  - `resultDraftOf` (`ambush-results.ts:58-96`) copia `report.loreUnlocked ?? []`: i report trattenuti prima del deploy non hanno il campo.
  - La sconfitta (`defeatPlanOf`, `:287-311`) non insegna.
  
  [VERIFIED: codebase]

### F4 — Tiro dello studio (D-08)
- **API della `ChanceSource`**: `next(): number` in [0, 1) (`chance-source.ts:4-7`); l'indice si sceglie a mano con il clamp di `drawLearnableSpell` (`quest-rewards.ts:238-245`, `Math.min(len - 1, Math.floor(roll * len))`). `SequenceChance` (`test/quests/sequence-chance.ts`) registra `drawn` e a sequenza esaurita restituisce `0.99`, che sta sopra 0.5: **nessuna lora studiata di default nei test esistenti** [VERIFIED: codebase].
- **Ordine dei tiri**. `drawRewards` tira loot, poi magia (solo `spellDraw === true`), poi pet (solo con pet a catalogo) (`quest-rewards.ts:167-212`). Il commento D-31/D-21 fissa la regola «tiro dopo …, così le altre quest consumano gli stessi tiri di prima». Lo studio si accoda **dopo il pet** e **solo con pool di catalogo non vuoto**. Le asserzioni `expect(chance.drawn).toEqual([0])` di `study-spell-draw.int-spec.ts:128` (e simili in `quest-pet-prize.int-spec.ts`) restano verdi, perché quei test non persistono lore [VERIFIED: codebase].
- **Il pool non si filtra nel loader (C-3)**. `readCatalog` gira **fuori** dalla transazione (`quest-resolution.service.ts:91-93`), lo snapshot **dentro** (`:105-109`). Il loader legge gli id di tutte le lore dei `STUDY_LORE_TYPES`, ordinati per `_id` (pattern `readSpellPool`, `resolution-loader.service.ts:605-622`), solo per `quest.infos.type === QuestType.study`; `readCatalog` ha la quest (`:401-412`). Il piano filtra contro `snapshot.status.unlockedLore` **e** contro le lore dei nemici dello stesso esito: i 2 nemici con lore `character` del DB reale cadrebbero in entrambi gli insiemi [VERIFIED: codebase; dati dall'orchestratore].
- **Due estrazioni**:
  - `loreDraw = pool.length ? { pool, chance: catalog.studyLoreChance, gate: chance.next(), pick: chance.next() } : null`;
  - in `planParticipant`, con `won && !spellLearned && loreDraw && loreDraw.gate < loreDraw.chance`: filtro del pool, poi indice con il clamp su `pick`.
  
  Il tiro avviene anche quando poi si impara una magia: consumo fisso, quindi riproducibile. `RewardCatalog` (`quest-rewards.ts:53-59`) guadagna `studyLorePool?`/`studyLoreChance?` **opzionali**. I letterali di `RewardCatalog` in `combatant-plan.spec.ts:44-50` e `quest-rewards.spec.ts:23-41` restano compilabili (ts-jest controlla i tipi). `DrawnRewards`/`NO_REWARDS` (`:44-75`) guadagnano `loreDraw`: `quest-rewards.spec.ts:72-79` e `:89-96` (`toEqual` di `NO_REWARDS` e di `drawRewards`) vanno aggiornati RED con `loreDraw: null` [VERIFIED: codebase].
- **Config**. File `src/config/lore-config.ts`: il drift test scansiona i file `*-config.ts` con export `*_ENV_KEYS` (`env-example.drift.spec.ts:6-34`).
  - Esporta `LORE_CONFIG`, `LORE_ENV_KEYS = ['LORE_STUDY_CHANCE']`, `parseLoreConfig` (vuota → 0.5; numero finito in [0, 1], altrimenti `throw` con un messaggio che non riporta il valore) e `readLoreEnv`.
  - Esporta `loreConfigProvider` con `inject: [{ token: ConfigService, optional: true }]`, come `ambushConfigProvider` (`ambush-config.ts:52-61`): l'harness nudo dell'accettazione non ha `ConfigModule` (`quest-acceptance.module.ts:37`), trappola 15-03.
  - `env.validation.ts:31-41` guadagna `parseLoreConfig(readLoreEnv(env))`.
  - `.env.example` guadagna `LORE_STUDY_CHANCE=` con il commento nel formato di `AMBUSH_TIMEZONE` (`.env.example:79-81`).
  - Il provider vive in `QuestOutcomesModule` (`quest-outcomes.module.ts:56-110`) e lo inietta `ResolutionLoader`, che scrive `studyLoreChance` nel catalogo dei premi.
  
  [VERIFIED: codebase]
- `QuestOutcomesModule` **non registra `Lore`** (`quest-outcomes.module.ts:58-70`): va aggiunto per il pool [VERIFIED: codebase].

### F5 — Query filtrate per viewer (D-10)
- **Personaggio corrente del bearer**. Il precedente esatto è `QuestsService.currentCharacterIdOf` + `boardCharacterOf` (`quests.service.ts:90-112`): `userModel.findById(id, { currentCharacter: 1 }).lean()` → `refIdOf` (il ref era Mixed, `mixed-ref-paths.ts:43`) → `characterModel.findOne(activeCharacterById(id), projection).lean()`. L'identità arriva da `@CurrentUser()` → `AuthIdentity { userId, role }` (`auth-identity.ts`, `current-user.decorator.ts`); l'innkeeper è `RoleType.innkeeper` (`role-type.enum.ts`) [VERIFIED: codebase].
- **Il link al morto in attesa di conferma.** `CURRENT_CHARACTER_LINK_FILTER` accetta anche `deletionReason: death` (`active-character.filter.ts:12-14`, usato da `users.service.ts:16-20`). Con `activeCharacterById` il morto non ha conoscenza: `lores` vuota e `known` falso sul suo ultimo foglio. Vedi Open Question 3 [VERIFIED: codebase].
- **`lores`/`lore(id)`** (`lore.service.ts:17-32`, `lore.resolver.ts:10-18`). Il resolver passa l'identità e il servizio riceve una `LoreVisibility` (`{ all: true }` oppure `{ ids: Set<string> }`).
  - `findAll`: con il filtro `{ _id: { $in: [...ids] } }`, oppure senza per l'innkeeper; set vuoto → `[]` senza query.
  - `findOne(id)`: se l'id non è visibile → `ResourceNotFoundException.lore()` **prima** della query, così il tempo non fa da oracolo.
  - Le `relatedLore` annidate si filtrano nel field resolver `Lore.relatedLore`. `withoutOrphanRelatedLore` (`related-lore.ts:10-17`) resta per gli orfani.
  
  [VERIFIED: codebase]
- **`City.relatedLore`**. `CitiesService.findAll` popola `relatedLore` (`cities.service.ts:12-18`); `findOne` usa `cityRelations()` (`city-relations.ts:4-10`). Il field resolver va in `CitiesResolver`, accanto a `size`/`hasShop` (`cities.resolver.ts:23-31`): `@ResolveField('relatedLore', () => Lore, { nullable: true })`. Restituisce `null` se il ref non è risolto (`isResolvedRef`, `quest-catalog.populate.ts:44-47`) o se l'id non è visibile. Effetto collaterale voluto: copre anche `cityShop.city` (`ShopsModule` importa `CitiesModule`, `shops.module.ts:18-19`) [VERIFIED: codebase].
- **`Enemy.relatedLore`** (`enemies.service.ts:17-32`): field resolver in `EnemiesResolver`. Sotto `Quest.infos.enemies[].enemy` le `relatedLore` **non sono popolate**: `QUEST_CATALOG_POPULATE` popola `infos.enemies.enemy` senza annidare (`quest-catalog.populate.ts:8-17`). Il resolver deve scartare i ref non risolti; oggi selezionarle romperebbe la lista [VERIFIED: codebase].
- **Asserzioni che diventano rosse** (giocatori senza lore sbloccate):
  - `src/lore/lore-related.int-spec.ts:99-157`: tutti e quattro gli `it` usano un `createPlayer` con personaggio senza `unlockedLore` (`:82-84`) e vedrebbero liste vuote. Si aggiorna il `beforeEach` con `characterOverrides: { status: { ...buildCharacter().status, unlockedLore: [loreA._id, loreB._id] } }`, e le lore si persistono **prima** del giocatore.
  - `src/shops/city-shop.resolver.int-spec.ts:201-243`: `relatedLore: { id }` con un giocatore senza personaggio (`:89-93`) diventerebbe `null`. Si passa a un bearer innkeeper (`role: RoleType.innkeeper`), o si aggiunge un caso.
  - `src/cities/cities.resolver.int-spec.ts` non seleziona `relatedLore` e resta verde.
  - `src/quests/quests.resolver.int-spec.ts:45` seleziona `infos { relatedLore { id name description } }`, non filtrata: resta verde.
  
  [VERIFIED: codebase]

### F6 — `QuestEnemy.known` per viewer (D-07)
- **Probe P1** ([VERIFIED: probe], risultati sotto). In un `@ResolveField` su un tipo annidato:
  - `@CurrentUser()` restituisce l'identità sia su HTTP sia sugli eventi di una subscription graphql-ws. `AuthGuard` scrive `request.user` all'operazione radice (`auth.guard.ts:23-28`); su WS `req` è `extra.request`, lo stesso per tutto il socket (`graphql-context.ts:27-34`);
  - su HTTP il context è lo stesso dentro una richiesta e nuovo fra due richieste, e `info.rootValue` è `undefined`;
  - su WS il context è **lo stesso fra due eventi**, mentre `info.rootValue` è lo stesso dentro un evento e diverso fra due eventi.
- **Chiave della cache**: `cacheKeyOf(context, info) = isObject(info.rootValue) ? info.rootValue : context`. Si usa una `WeakMap<object, Promise<ViewerKnowledge>>`, quindi niente perdite di memoria. La promise è memoizzata, così le N voci concorrenti di un evento fanno una sola lettura.
- **Field resolver**: `@Resolver(() => QuestEnemy)` con `@ResolveField('known', () => Boolean)`. Il parent `enemy` è un documento popolato (`QUEST_CATALOG_POPULATE`, `QUEST_RESULT_POPULATE`) o un `ObjectId`; l'id si ricava con `documentIdOf(entry.enemy) ?? refIdOf(entry.enemy)?.toHexString()` (`document-id.ts:6-10`, `:41-45`). Il risultato è innkeeper → `true`, viewer senza personaggio → `false`, altrimenti appartenenza dell'esadecimale a `knownEnemies`.
- **Costo**: `quests` è già filtrato per area (`quests.service.ts:52-62`, tabellone della città), con decine di voci invece delle 750 totali. Senza cache sarebbero 2 query per voce di `enemies`; con la cache sono 2 query per richiesta [VERIFIED: codebase].
- **Registrazione**: il field resolver esiste nello schema solo se il suo modulo è nel grafo dell'app o dell'harness. Va messo in un `LoreVisibilityModule` (servizio viewer + tre field resolver + `KnownEnemiesResolver`, `forFeature` di `User`, `Character`, `Lore`), importato da `LoreModule`, `CitiesModule`, `EnemiesModule`, `QuestsModule`, `QuestResultsModule` e `PendingRequestsModule`. Nest istanzia il modulo una volta sola, e la registrazione multipla di `Character`/`User` via `forFeature` è già prassi (`quests.module.ts:43-45`) [VERIFIED: codebase].

### F7 — `characterUpdated` (D-01)
- `CHARACTER_CHANGES_PIPELINE` filtra solo `operationType` in `update`/`replace` e `fullDocument.deletedAt: null` (`character-changes.pipeline.ts:2-9`). **Nessun filtro su `updatedFields`.** Ogni add-to-set che cambia il documento riemette; un add-to-set senza novità non cambia il documento e non genera evento [VERIFIED: codebase; «nessun evento senza modifica» ASSUMED dal comportamento standard degli update no-op].
- `CharacterUpdatesPublisher.publishOnce` rilegge con `CharactersService.findOne` (`character-updates.publisher.ts:59-71`, `characters.service.ts:97-121`), un documento idratato. `status.unlockedLore` non è popolato: escono gli `ObjectId`, serializzati come `ID`. Due scritture nella stessa transazione (completamento + add-to-set, C-4) danno due eventi di change stream. `KeyedSingleFlight` (`keyed-single-flight.ts`) li coalizza in al più due riletture, e l'ultima riflette lo stato finale [VERIFIED: codebase].

### F8 — Backfill one-off (D-11)
- **Pattern esistenti**:
  - CLI della Phase 10 piano 10-26: `src/migrations/run-mixed-refs.ts` (`--dry-run|--apply|--verify`, `MongoClient` nativo, report JSON di soli conteggi, exit code 0/1/2/3), più `MixedRefsVerifier` `OnApplicationBootstrap` di sola lettura (`mixed-refs.verifier.ts`, registrato in `MongoModule`);
  - one-off al boot delle Phase 13/13.1: `QuestMaintenanceBoot` (`quest-maintenance.boot.ts:6-30`), con passi in ordine, mai bloccanti, `try/catch` con `describeError`, modulo importato **solo** da `AppModule` (`quest-maintenance.module.ts:11`).
  
  La rimozione è avvenuta in due commit: `3bdf65a test(migrations): expect only the permanent enemies step at boot` (RED sulla spec del boot), poi `64ef914 refactor(migrations): drop the 13.1 one-off migrators after their run` (−2562 righe) [VERIFIED: git log].
- **Forma consigliata (C-5)**:
  - file in `src/migrations/lore-backfill/`:
    - `lore-backfill.ts`, funzione pura: dato personaggio, geografia e risultati → `{ loreIds, enemyIds }`;
    - `lore-backfill.migrator.ts`, che legge personaggi attivi (`ACTIVE_CHARACTER_FILTER`), risultati vinti e catalogo, e scrive un add-to-set per personaggio;
    - `lore-backfill.boot.ts` `OnApplicationBootstrap`, mai bloccante;
    - `lore-backfill.module.ts`, importato solo da `AppModule`;
  - **idempotente per unione** (add-to-set), non per «campo assente»: un personaggio che nel frattempo ha già sbloccato qualcosa riceve lo stesso il suo passato. Al secondo boot non cambia nulla, e quel boot fa da verifica;
  - sorgenti dei dati:
    - geografia di `status.location` con lo stesso `LoreGeographyReader.ofMarker`;
    - `questresults` con `character` = id, `outcome` in {`success`, `gmCompleted`}, `enemies.enemy` (i risultati legacy con `enemy` singolo li migra già il permanente `QuestEnemiesMigrator`, `quest-maintenance.boot.ts:12-16`; per sicurezza si leggono entrambe le forme);
    - `Enemy.relatedLore` di quegli id.
  - log: solo conteggi (`personaggi`, `lore aggiunte`, `nemici aggiunti`, `personaggi senza città`);
  - `QuestResult.loreUnlocked` dei vecchi risultati **non** si tocca (default `[]` alla lettura).
  
  L'orchestratore lancia la build, ferma il BE di `dist/`, lo riavvia, legge il log e lo scrive nel handoff. Il piano di rimozione toglie modulo e import da `AppModule` in TDD: RED sulla spec che elenca gli import del boot o sull'assenza del provider, poi `refactor(migrations): drop the 16 one-off lore backfill after its run` [VERIFIED: codebase; procedura di boot dall'orchestratore].

### F9 — Test, coverage e gate
- **Soglie** (`package.json` `jest.coverageThreshold`, valori esatti):

  | Cartella | statements | branches | lines |
  |----------|------------|----------|-------|
  | `./src/travel/` (comprende `ambush/`) | 97 | 84 | 98 |
  | `./src/quests/acceptance/` | 97 | 91 | 98 |
  | `./src/shops/` | 97 | 82 | 98 |
  | `./src/quests/generation/` | 96 | 82 | 97 |
  | `./src/auth/` | 97 | 84 | 98 |
  | `./src/economy/` | 98 | 91 | 98 |
  | `./src/characters/spells/` | 97 | 88 | 97 |
  | `./src/characters/equipment/` | 98 | 98 | 98 |
  | `./src/characters/characters.service.ts` | 96 | 88 | 98 |
  | `./src/eventsub/` | 97 | 92 | 97 |

  **Nessuna soglia** su `src/lore/`, `src/cities/`, `src/enemies/`, `src/quests/outcomes/`, `src/characters/creation/`, `src/migrations/`. `./src/travel/` alla chiusura della 15 aveva **3 branch di margine** (590/698 contro 587: `15-11-SUMMARY.md:47`); ogni ramo nuovo in `travel-completion.service.ts`, `travel.service.ts`, `travel.updates.ts` e `ambush/*` va coperto da un test [VERIFIED: codebase].
- **Durata**: l'ultima `npm run test:cov` ha impiegato **571.5 s** su 360 suite / 4493 test (`15-11-SUMMARY.md:37`), vicino ai 600 s dello strumento. Il piano di gate deve prevedere il ripiego per cartella (`15-11-SUMMARY.md:100`) [VERIFIED: codebase].
- **Harness e fixture**:
  - `createAuthTestApp({ imports, providers, overrides })` (`test/auth/auth-test-app.ts:101-170`) importa solo i moduli passati: niente `MongoModule` globale, ogni modulo registra i suoi modelli;
  - `createPlayer(harness, { twitchId, role, withCharacter, characterOverrides })` (`test/authz/player-fixture.ts:31-45`): `characterOverrides.status` sostituisce `status` intero, quindi va scritto `{ ...buildCharacter().status, unlockedLore: [...] }`;
  - `persistCity(model, { relatedLore }, poiModel)` crea il marker vero (`test/fixtures/city.fixture.ts:23-36`); `persistLore(model, { type, relatedLore })` (`lore.fixture.ts`); `persistEnemy(model, { relatedLore })` (`enemy.fixture.ts`);
  - `buildQuestResult` (`test/quests/quest-result.fixture.ts:5-38`) guadagna `loreUnlocked: []`;
  - `createOutcomeHarness({ clock, chance })` + `persistQuester` + `SequenceChance` (`study-spell-draw.int-spec.ts:24-45`) sono il modello per study e vittorie.
  
  [VERIFIED: codebase]
- **Asserzioni a stringa/oggetto esatto da aggiornare RED prima del codice** (elenco completo trovato):
  1. `test/app.int-spec.ts:455-457`, `:524-526`, `:662-664`, `:727-729` (F1);
  2. `src/quests/results/quest-result.populate.spec.ts:49-56` (`QUEST_RESULT_POPULATE` `toEqual`, più la voce `{ path: 'loreUnlocked', model: 'Lore' }`);
  3. `src/quests/outcomes/outcome-plan.spec.ts:178-212` (`plan.result` `toEqual`, più `loreUnlocked: []`);
  4. `src/quests/outcomes/rescue-plan.spec.ts:43-79` (`unchangedSheet`, usato da `:116` e `:133`, più `loreUnlocked: []`); `:101-114` solo se C-2 passa e la geografia del test non è vuota;
  5. `src/travel/ambush/ambush-results.spec.ts:20-50` (`toEqual`) e `:52-81` (chiavi ordinate, più `'loreUnlocked'` fra `'levelBefore'` e `'maxLifePoints'`);
  6. `src/travel/ambush/ambush-plan.spec.ts:194-215` (`plan.report` `toEqual`, più `loreUnlocked: []` o le lore attese) e `:191-193` (`$push` = report, si aggiorna da sé);
  7. `src/travel/travel.updates.spec.ts:183-189` (`COMPLETION_PROJECTION`, più `'status.activeTravel.to': 1`);
  8. `src/characters/creation/starting-character.spec.ts:23-57` (`toEqual` dello stato iniziale, più `unlockedLore` e `knownEnemies: []`);
  9. `src/quests/outcomes/rewards/quest-rewards.spec.ts:72-79` e `:89-96` (più `loreDraw: null`);
  10. `src/lore/lore-related.int-spec.ts:80-91` (`beforeEach`: giocatore con lore sbloccate), `src/shops/city-shop.resolver.int-spec.ts:201-243` (bearer innkeeper o personaggio con la lore della città).
  
  Restano verdi:
  - `outcome-plan.spec.ts:144-157` (`['$set']` senza nemici);
  - `travel.updates.spec.ts:172-181` (`COMPLETION_UPDATE`) e `:226-229` (`teleportUpdate(poi)`);
  - `quest-acceptance.updates.spec.ts:109-200`;
  - `combatant-plan.spec.ts:85-108`;
  - `mixed-ref-paths.spec.ts:155-171` (34);
  - `production-surface.int-spec.ts:153-185`.
  
  Vale solo se si rispettano le regole «add-to-set solo se non vuoto», «campi opzionali» e «funzione separata `victoryKnowledgeOf`» [VERIFIED: codebase].

### F10 — Validation Architecture
Vedi la sezione `## Validation Architecture`.

## Architecture Patterns

### Recommended Project Structure
```
src/lore/
├── lore-geography.ts              # geographyOf(cityLore, related) puro (D-03)
├── lore-geography.reader.ts       # LoreGeographyReader.ofMarker(marker, session?) → ObjectId[]
├── lore-geography.module.ts       # forFeature City + Lore, esporta il reader (creazione, viaggio, accettazione, esiti, backfill)
├── lore-visibility.ts             # LoreVisibility { all } | { ids }, isVisible, visibleRelated (puri)
├── viewer-knowledge.service.ts    # of(identity, context, info) con cache WeakMap su rootValue-o-context
├── known-enemies.resolver.ts      # @Resolver(() => QuestEnemy) known
├── related-lore.resolvers.ts      # @ResolveField relatedLore su Lore (o dentro LoreResolver)
├── lore-visibility.module.ts      # forFeature User + Character + Lore; servizio + KnownEnemiesResolver
├── study-lore-types.ts            # STUDY_LORE_TYPES, BESTIARY_LORE_TYPES (costanti)
├── lore.service.ts / lore.resolver.ts / related-lore.ts (esistenti, estesi)
src/config/lore-config.ts          # LORE_CONFIG, LORE_ENV_KEYS, parseLoreConfig, loreConfigProvider (optional ConfigService)
src/quests/outcomes/victory-knowledge.ts  # victoryKnowledgeOf(catalog), knowledgeUpdateOf(snapshot, lore, enemies) puri
src/migrations/lore-backfill/      # one-off al boot (C-5), rimosso prima della merge
```

### Pattern 1: geografia pura + reader unico (BE-LORE-01, BE-LORE-02)
**What:** `geographyOf` non conosce Mongo. Il reader fa tre letture lean e restituisce `[]` per un marker senza città, una città senza lore o una lore orfana.
**When to use:** creazione, completamento, teleport, salto, soccorso (C-2), backfill.

### Pattern 2: add-to-set solo se non vuoto (BE-LORE-01..03)
**What:** ogni builder di update (`teleportUpdate`, `laneClaimUpdate`, `planParticipant`, `victoryUpdateOf`, `planRescued`) aggiunge la chiave `$addToSet` solo con liste non vuote. Così gli update esistenti restano byte-identici nei casi senza conoscenza. Usa `$each` con `ObjectId` veri; Mongoose casta comunque (probe P2).
**When to use:** sempre; mai `$set` di `status.unlockedLore` (D-01).

### Pattern 3: diff contro lo snapshot in sessione (BE-LORE-03, D-09)
**What:** `knowledgeUpdateOf(snapshot.status.unlockedLore, candidates)` restituisce `{ fresh, update }`. `fresh` va in `result.loreUnlocked` (ordine: lore dei nemici nell'ordine delle voci, poi la lore dello studio); `update` va nell'add-to-set.
**When to use:** quest (tutti i tipi), imboscata.

### Pattern 4: tiro dello studio dopo il pet, solo con pool (BE-LORE-04)
**What:** `drawRewards` accoda `{ gate, pick }` solo se `catalog.studyLorePool` non è vuoto; `planParticipant` applica solo se `won && !spellLearned && gate < chance`; il pool si filtra contro snapshot e lore dello stesso esito.

### Pattern 5: viewer per richiesta con chiave per evento (BE-LORE-05, BE-LORE-06)
**What:** `ViewerKnowledgeService.of(identity, context, info)` → `Promise<ViewerKnowledge>`, dove `ViewerKnowledge = { all: true } | { all: false; lore: Set<string>; enemies: Set<string> }`. Lo usano i resolver radice (`lores`, `lore`) e i field resolver, con la stessa chiave (Code Examples).

### Pattern 6: one-off al boot per unione (D-11)
**What:** `OnApplicationBootstrap` mai bloccante, add-to-set per personaggio, log di soli conteggi, rimozione con RED + `refactor(migrations)` come `3bdf65a`/`64ef914`.

### Anti-Patterns to Avoid
- **Cache appesa al solo context**: sotto WS serve dati vecchi a ogni evento dopo il primo (probe P1).
- **`$set` dell'intero `status.unlockedLore` calcolato in memoria**: perde le scritture concorrenti fuori dal filtro `status.xp` (completamento, teleport) e viola D-01.
- **Filtrare il pool dello studio nel loader**: lo snapshot fuori sessione può essere vecchio (C-3).
- **Estendere `enemyFactsOf`/`EnemyFacts`**: rompe `combatant-plan.spec.ts:85-108` e l'xp dell'imboscata senza motivo.
- **Popolare `unlockedLore` sul personaggio**: D-01 vuole soli id; il populate gonfierebbe ogni `characterUpdated`.
- **Leggere la città per `markerLocation` con il cast di Mongoose**: perde le forme stringa legacy (`quests.service.ts:126-127`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Personaggio corrente del bearer | una nuova lettura `users` → `characters` | lo stesso schema di `QuestsService.currentCharacterIdOf`/`boardCharacterOf` (`quests.service.ts:90-112`), estratto o ricopiato in `ViewerKnowledgeService` | forme Mixed (`refIdOf`), archiviati esclusi (`activeCharacterById`) |
| NOT_FOUND della lore | un errore nuovo | `ResourceNotFoundException.lore()` | stesso messaggio e codice di `production-surface.int-spec.ts:178-185` (nessun oracolo) |
| Confronto di id | `===` su ObjectId | `sameId`, `idForms`, `refIdOf`, `documentIdOf` (`src/mongo/document-id.ts`) | forme legacy stringa |
| Orfani di populate | filtri ad hoc | `isResolvedRef` (`quest-catalog.populate.ts:44-47`), `withoutOrphanRelatedLore`, `dropOrphanResultRefs` | `[Lore!]!` annullerebbe la lista |
| Caso | `Math.random` | `ChanceSource` + clamp di `drawLearnableSpell` | riproducibile con `SequenceChance` |
| Config | `process.env` | `*-config.ts` + `env.validation.ts` + `.env.example` + provider opzionale | drift test e trappola 15-03 |

**Key insight:** ogni scrittura che muove o premia il personaggio esiste già, è una sola ed è atomica. La fase aggiunge chiavi a quegli update, non scritture nuove; l'unica eccezione è la seconda scrittura del completamento (C-4).

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 4 personaggi senza `status.unlockedLore`/`status.knownEnemies` (dato dell'orchestratore). 26 `questresults` senza `loreUnlocked`. Eventuali `status.activeTravel.ambushReports` trattenuti senza `loreUnlocked` | **data migration**: backfill al boot (F8). **Codice**: default `[]` sui modelli e `?? []` in `resultDraftOf`. Nessuna migrazione dei risultati |
| Live service config | Nessuna (nessun servizio esterno coinvolto) — verificato: la fase non tocca push, EventSub, Cloudinary | nessuna |
| OS-registered state | Processo BE dell'utente sulla 3001 da `dist/` di questo albero (build di `develop` `9103440`) | build + riavvio dall'orchestratore al boot reale (runbook nel handoff); mai dagli esecutori |
| Secrets/env vars | `LORE_STUDY_CHANCE` nuova, opzionale, non segreta. Per la UAT FE: seconda identità con `DEV_AUTH_ROLE=adventurer` e `DEV_AUTH_TWITCH_ID` del giocatore sul processo (`.env.example:43-48`), `LORE_STUDY_CHANCE=1` per un tiro deterministico | nessuna rinomina; solo documentazione nel handoff |
| Build artifacts | `dist/` contiene il BE di `develop`; nessun pacchetto installato con nomi della fase | rebuild dall'orchestratore |

## Conflicts

- **C-1 — `gmCompleted` con nemici.** D-06 dice «`gmCompleted` senza combattimento: nulla», D-11 conta i `gmCompleted` con nemici nel backfill. Nel codice `planParticipant` tratta `gmCompleted` come vinto (`outcome-plan.ts:323`) e il GM passa i nemici della quest con il loro xp (`gm-completion.service.ts:311`). **Emendamento consigliato:** D-06 → «sconfitta, soccorso, morte, esiti **senza nemici** (anche `gmCompleted`): nulla; `gmCompleted` con nemici insegna come un `success`». Così il predicato è unico (`won && victory`), coerente con l'xp già assegnato e con D-11. Se l'orchestratore vuole escludere `gmCompleted`, il predicato diventa `verdict === success` e il backfill va allineato togliendo `gmCompleted`.
- **C-2 — Il soccorso è un arrivo.** `planRescued` riporta il ferito sul marker della città (`rescue-plan.ts:80-92`); D-05 non lo elenca. **Emendamento consigliato:** aggiungere a D-05 «il ritorno del soccorso sul marker della città». La geografia si legge fuori sessione con `cityMarker` (`rescue-resolution.service.ts:497-513`) e va nello stesso update di `planRescued`; `loreUnlocked` del foglio `rescued` resta `[]` (D-06).
- **C-3 — Pool dello studio.** D-08 dice «pool letto nel loader … fra quelle non ancora sbloccate». Il loader gira fuori dalla transazione: **emendamento consigliato** → «il loader legge tutte le lore dei `STUDY_LORE_TYPES` ordinate per id; il piano esclude quelle già in `unlockedLore` dello snapshot in sessione e quelle sbloccate dallo stesso esito».
- **C-4 — Ordine lettura/scrittura nel completamento.** D-05 dice «la città e la sua geografia si leggono prima dell'update nella stessa sessione». Per il completamento la meta è nota solo dal documento: **emendamento consigliato** → «nella stessa transazione». La meta si legge dal `before` di `COMPLETION_UPDATE` (proiezione `status.activeTravel.to`) e la geografia si scrive con un secondo update nello stesso callback. La variante a pipeline (probe P2) richiede una lettura in sessione prima dell'update e `to` nel filtro.
- **C-5 — Forma del backfill.** `16-REPO-RULES.md:23,38` dice «CLI `--dry-run/--apply/--verify` come il piano 10-26», D-11 dice «al boot reale». **Raccomandazione:** passo al boot idempotente per unione (pratica delle Phase 12/13/13.1, F8); il secondo boot con zero modifiche fa da `--verify`. Se l'orchestratore preferisce la CLI, il modello è `run-mixed-refs.ts` con la stessa funzione pura, ma va lanciata a mano con `node --env-file=.env dist/migrations/run-lore-backfill.js`.
- **C-6 — Proiezione dello snapshot (nota per l'orchestratore, non una decisione).** Il brief chiede di estendere `OUTCOME_CHARACTER_PROJECTION` con `status.unlockedLore`/`status.knownEnemies`: non serve, la proiezione è già `status: 1` (`outcome-plan.ts:44-48`). Si estende solo il tipo `OutcomeCharacterSnapshot.status`.

## Common Pitfalls

### Pitfall 1: cache del viewer stale sotto WS
**What goes wrong:** `known` resta `false` sugli eventi di `questResultReceived`/`questUpdated` dopo il primo.
**Why it happens:** graphql-ws calcola il context una volta per subscription (P1).
**How to avoid:** chiave `rootValue`-o-context (Pattern 5); int-spec con due eventi sullo stesso socket.
**Warning signs:** test WS verde con un solo evento, rosso al secondo.

### Pitfall 2: modulo o modello mancante negli harness
**What goes wrong:** `Cannot query field "known"`, `MissingSchemaError: Lore` al populate di `loreUnlocked`, oppure `Nest can't resolve dependencies` in un harness nudo.
**Why it happens:** gli harness importano singoli moduli (`auth-test-app.ts:101-130`). Oggi `QuestResultsReadModule` (`quest-results-read.module.ts`), `QuestOutcomesModule`, `CharacterCreationModule`, `TravelModule` e `QuestAcceptanceModule` non registrano `Lore`.
**How to avoid:** ogni modulo registra i propri modelli; il field resolver vive in `LoreVisibilityModule`, importato dai moduli che servono `Quest`/`QuestResult`/`City`/`Enemy`/`Lore`.
**Warning signs:** spec di altri moduli rosse dopo un piano «solo lore».

### Pitfall 3: strict mode sullo snapshot del report
**What goes wrong:** `loreUnlocked` dell'imboscata sparisce all'arrivo.
**Why it happens:** `AmbushReportSnapshot` non dichiara il campo e Mongoose lo scarta nel `$push`.
**How to avoid:** `@Prop` in `ambush-snapshot.model.ts` prima di scriverlo; `?? []` in `resultDraftOf`.

### Pitfall 4: update che cambiano forma
**What goes wrong:** decine di `toEqual` rossi in spec non correlate.
**How to avoid:** add-to-set solo se non vuoto, campi opzionali, funzione separata per la conoscenza (F9 elenco).

### Pitfall 5: sequenze di tiri spostate
**What goes wrong:** `chance.drawn` diversi in `study-spell-draw.int-spec.ts`, `quest-pet-prize.int-spec.ts`.
**How to avoid:** estrazioni dello studio dopo il pet, solo per `study` con pool non vuoto (Pattern 4).

### Pitfall 6: doppio sblocco della stessa lore nello stesso esito
**What goes wrong:** una lore `character` di un nemico è anche nel pool dello studio; `loreUnlocked` la elenca due volte o il tiro «spreca» la novità.
**How to avoid:** il pool si filtra anche contro le lore dei nemici dell'esito; `fresh` è deduplicato per esadecimale.

### Pitfall 7: margine di coverage di `./src/travel/`
**What goes wrong:** gate rosso per 1–3 branch.
**How to avoid:** ogni ramo nuovo (marker senza città, geografia vuota, report senza `loreUnlocked`) ha un caso int-spec; misura per cartella nel piano di gate.

### Pitfall 8: marker legacy stringa
**What goes wrong:** una città con `markerLocation` stringa non sblocca.
**How to avoid:** driver nativo + `idForms` come `cityPoiIdsAt`.

### Pitfall 9: `relatedLore` non popolate sotto `Quest.infos.enemies[].enemy`
**What goes wrong:** il field resolver di `Enemy.relatedLore` restituisce `ObjectId` dove lo SDL vuole `Lore!`.
**How to avoid:** filtro `isResolvedRef` prima della visibilità.

### Pitfall 10: test esistenti con giocatori «ciechi»
**What goes wrong:** `lore-related.int-spec.ts` e `city-shop.resolver.int-spec.ts:234` rossi per il filtro, non per regressione.
**How to avoid:** aggiornarli nello stesso commit RED del filtro, con titolo che nomina `(D-10)`.

### Pitfall 11: pipeline che si riapplica senza viaggio
**What goes wrong:** nella probe P2, la seconda applicazione della pipeline senza `activeTravel` ha **tolto** `status.location` (`'$status.activeTravel.to'` mancante).
**How to avoid:** non toccare `completionFilter` (`travel.updates.ts:79-92`, vuole `activeTravel.startTime`/`endTime`); con C-4 la pipeline resta la costante attuale.

### Pitfall 12: `test:cov` oltre i 600 s
**What goes wrong:** lo strumento sposta il comando in background (571.5 s nella 15).
**How to avoid:** piano di gate con il ripiego per cartella già scritto.

## Code Examples

### Chiave della cache del viewer (Pattern 5)
```typescript
// Fonte: probe P1 (graphql/execution/subscribe.js:69, graphql-ws server :206-207)
const cache = new WeakMap<object, Promise<ViewerKnowledge>>();

function cacheKeyOf(context: object, info: GraphQLResolveInfo): object {
    const root: unknown = info.rootValue;
    return typeof root === 'object' && root !== null ? root : context;
}

of(identity: AuthIdentity | undefined, context: object, info: GraphQLResolveInfo) {
    const key = cacheKeyOf(context, info);
    const cached = cache.get(key);
    if (cached) return cached;
    const read = this.read(identity);
    cache.set(key, read);
    return read;
}
```

### Field resolver `known`
```typescript
@Resolver(() => QuestEnemy)
export class KnownEnemiesResolver {
    constructor(private readonly viewers: ViewerKnowledgeService) {}

    @ResolveField('known', () => Boolean)
    async known(
        @Parent() entry: QuestEnemy,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<boolean> {
        const viewer = await this.viewers.of(identity, context, info);
        if (viewer.all) return true;
        const id = documentIdOf(entry.enemy) ?? refIdOf(entry.enemy)?.toHexString();
        return id !== undefined && viewer.enemies.has(id);
    }
}
```

### Add-to-set solo se non vuoto (Pattern 2)
```typescript
export function knowledgeAdditionOf(
    lore: readonly Types.ObjectId[],
    enemies: readonly Types.ObjectId[] = [],
): { $addToSet?: Record<string, { $each: Types.ObjectId[] }> } {
    const additions = {
        ...(lore.length ? { 'status.unlockedLore': { $each: [...lore] } } : {}),
        ...(enemies.length ? { 'status.knownEnemies': { $each: [...enemies] } } : {}),
    };
    return Object.keys(additions).length ? { $addToSet: additions } : {};
}
```

### Completamento (C-4)
```typescript
const before = await this.characterModel
    .findOneAndUpdate(completionFilter(identity, now), COMPLETION_UPDATE, {
        session, returnDocument: 'before', projection: COMPLETION_PROJECTION,
    })
    .lean<CompletedSnapshot | null>()
    .exec();
if (!before) return;
const to = refIdOf(before.status?.activeTravel?.to);
const geography = to ? await this.geography.ofMarker(to, session) : [];
const addition = knowledgeAdditionOf(geography);
if (addition.$addToSet) {
    await this.characterModel
        .updateOne({ _id: identity.characterId }, addition, { session })
        .exec();
}
```

### Config opzionale validata
```typescript
export const LORE_ENV_KEYS = ['LORE_STUDY_CHANCE'] as const;
export const DEFAULT_LORE_STUDY_CHANCE = 0.5;

export function parseLoreConfig(env: LoreEnv): LoreConfig {
    const raw = (env.LORE_STUDY_CHANCE ?? '').trim();
    if (!raw) return { studyChance: DEFAULT_LORE_STUDY_CHANCE };
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('LORE_STUDY_CHANCE must be a number between 0 and 1 (empty = 0.5)');
    }
    return { studyChance: value };
}

export const loreConfigProvider: FactoryProvider<LoreConfig> = {
    provide: LORE_CONFIG,
    inject: [{ token: ConfigService, optional: true }],
    useFactory: (config: ConfigService | undefined) =>
        parseLoreConfig(readLoreEnv({ LORE_STUDY_CHANCE: config?.get<string>('LORE_STUDY_CHANCE') })),
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Lore.unlocked` globale | nessun flag, conoscenza per personaggio | Phase 11 D-25 (`11-popolamento-del-mondo/BACKEND-NOTES.md:8,26`) | nessuna migrazione del catalogo (D-02) |
| `infos.enemy` singolo | `infos.enemies[]` / `QuestResult.enemies[]` | Phase 13 D-01 | `known` sta sulla voce `QuestEnemy`, non su `Enemy` |
| One-off via CLI (10-26) | one-off al boot e rimozione in TDD | Phase 12 D-24/D-25, 13, 13.1 | C-5 |

**Deprecated/outdated:** nessuno nella fase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mongoose applica il default `[]` di `status.unlockedLore` all'idratazione dei documenti vecchi | F1 | Se no, `characterUpdated` di un personaggio non migrato annullerebbe il campo non-null. Mitigato: backfill su tutti gli attivi + spec che legge un documento senza campo via `CharactersService.findOne` (Wave 0) |
| A2 | Un update che non cambia il documento non produce evento di change stream | F7 | Solo un evento in più; nessun impatto funzionale |
| A3 | `Scope.REQUEST` sarebbe più costoso e non per-evento | Alternatives | Nessuno: si raccomanda la `WeakMap` |

## Open Questions (RESOLVED — orchestratore, 2026-11-07; le revisioni di D-05..D-11 e i nuovi D-13..D-15 del CONTEXT portano le decisioni)

1. **`gmCompleted` con nemici insegna?** (C-1) _(RESOLVED — sì, come un `success`; CONTEXT D-06 rivisto)_
   - What we know: il codice lo tratta come vinto con xp dei nemici; D-06 e D-11 si contraddicono.
   - Recommendation: sì (emendamento C-1).
2. **Il ritorno del soccorso sblocca la geografia?** (C-2) _(RESOLVED — sì, nello stesso update di `planRescued`; CONTEXT D-05 rivisto)_
   - Recommendation: sì, nello stesso update di `planRescued`.
3. **Il morto in attesa di conferma vede la sua conoscenza?** _(RESOLVED — no: `activeCharacterById`; CONTEXT D-13)_
   - What we know: `users.currentCharacter` resta collegato al morto finché non conferma il foglio (`active-character.filter.ts:12-14`); con `activeCharacterById` il viewer è «senza personaggio».
   - Recommendation: usare `activeCharacterById` (il morto vede `known: false` e una Biblioteca vuota; il foglio di morte non ha `loreUnlocked`). Alternativa: `CURRENT_CHARACTER_LINK_FILTER` per mostrargli la sua conoscenza fino alla conferma. Da decidere.
4. **Forma del backfill** (C-5): boot (consigliato) o CLI. _(RESOLVED — passo al boot idempotente per unione; CONTEXT D-11 rivisto)_
5. **Ordine di `loreUnlocked`** (discrezione) _(RESOLVED — nemici nell'ordine delle voci, poi lo studio, dedup per esadecimale; CONTEXT D-09)_: lore dei nemici nell'ordine delle voci, poi lo studio. Nessun impatto sul contratto (la FE rende nell'ordine del BE, `17-REPO-RULES.md:34`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tutto | ✓ | v26.12.1 | — |
| mongodb-memory-server (replica set) | integration | ✓ | 11.2.0 | — |
| graphql-ws client (`test/auth/ws-test-client.ts`) | prove WS di `known` | ✓ | 6.0.6 | — |
| `npx tsc` | gate | ✓ | exit 0 oggi | — |
| BE reale sulla 3001 | backfill, UAT | ✓ (non toccare) | build di `9103440` | solo l'orchestratore |

**Missing dependencies with no fallback:** nessuna.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 (progetti `unit` e `integration`), ts-jest, mongodb-memory-server 11.2.0 replica set |
| Config file | `package.json` §`jest` (`projects`, `coverageThreshold`) |
| Quick run command | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| Full suite command | `npm run test:cov` (~571 s; ripiego per cartella nel piano di gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BE-LORE-01 | `geographyOf` (città + regioni + stato, nient'altro, dedup) | unit | `npx jest src/lore/lore-geography.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-LORE-01 | reader: marker senza città → `[]`, marker stringa, lore orfana | integration | `npx jest src/lore/lore-geography.reader.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-LORE-01 | nuovo personaggio con la geografia della città natale; cancellazione e ricreazione → insieme nuovo | integration | `npx jest src/characters/creation/character-creation.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (estendere) |
| BE-LORE-01 | SDL: `unlockedLore: [ID!]!`, `known`, `loreUnlocked` | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (RED alle righe F1) |
| BE-LORE-01 | backfill: unione idempotente, solo attivi, log di conteggi | integration | `npx jest src/migrations/lore-backfill --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-LORE-02 | completamento libero/da quest/deviazione → geografia, idempotente, POI del territorio ignorato | integration | `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ✅ (estendere) |
| BE-LORE-02 | teleport → geografia | integration | `npx jest src/travel/travel.service.int-spec.ts src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ (estendere) |
| BE-LORE-02 | salto dell'accettazione → geografia | integration | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (estendere) |
| BE-LORE-02 | builder puri (`teleportUpdate`, `laneClaimUpdate`, `COMPLETION_PROJECTION`) | unit | `npx jest src/travel/travel.updates.spec.ts src/quests/acceptance/quest-acceptance.updates.spec.ts --selectProjects unit` | ✅ |
| BE-LORE-03 | `planParticipant`: vittoria con nemici → add-to-set + `loreUnlocked` solo novità; sconfitta/senza nemici nulla | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/victory-knowledge.spec.ts --selectProjects unit` | ✅ / ❌ Wave 0 |
| BE-LORE-03 | individuale, party (tutti i vincitori), dungeon | integration | `npx jest src/quests/outcomes/quest-combat.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/quest-dungeon.int-spec.ts --selectProjects integration --runInBand` | ✅ (estendere) |
| BE-LORE-03 | imboscata vinta → add-to-set + report → `loreUnlocked` all'arrivo | unit + integration | `npx jest src/travel/ambush/ambush-plan.spec.ts src/travel/ambush/ambush-results.spec.ts --selectProjects unit`; `npx jest src/travel/ambush/ambush-resolution.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-LORE-04 | study con tiro riuscito / fallito / pool vuoto / magia imparata | unit + integration | `npx jest src/quests/outcomes/rewards/quest-rewards.spec.ts --selectProjects unit`; `npx jest src/quests/outcomes/study-lore-draw.int-spec.ts --selectProjects integration --runInBand` | ✅ / ❌ Wave 0 |
| BE-LORE-04 | `LORE_STUDY_CHANCE` validata, default 0.5, drift | unit | `npx jest src/config --selectProjects unit` | ❌ Wave 0 (`lore-config.spec.ts`) |
| BE-LORE-05 | `lores`/`lore(id)`/annidate per giocatore e innkeeper, NOT_FOUND identico | integration | `npx jest src/lore --selectProjects integration --runInBand` | ✅ (estendere `lore-related.int-spec.ts`) |
| BE-LORE-05 | `City.relatedLore` null/visibile, `Enemy.relatedLore` filtrata | integration | `npx jest src/cities/cities.resolver.int-spec.ts src/shops/city-shop.resolver.int-spec.ts src/lore/lore-related.int-spec.ts --selectProjects integration --runInBand` | ✅ |
| BE-LORE-05 | `characterUpdated` riemesso con `unlockedLore` | integration | `npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ (estendere) |
| BE-LORE-06 | `known` per viewer su `quests`, `questResult`, `questResultReceived` (due eventi sullo stesso socket), innkeeper true, senza personaggio false | integration | `npx jest src/lore/known-enemies.resolver.int-spec.ts src/quests/results/quest-result-received.subscription.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 / ✅ |
| BE-LORE-05/06 | selezioni FE verbatim (`statusFields` con `unlockedLore`, `enemies { quantity known enemy { id name imagePath xp } }`, `loreUnlocked { id name type }`, `cities { … relatedLore { id description image } }`, `lores`/`lore` di `lore_queries.dart`) | integration | stessi file sopra | ✅ |

### Sampling Rate
- **Per task commit:** la spec mirata del task (comandi sopra).
- **Per wave merge:** le cartelle toccate (`src/lore`, `src/travel`, `src/quests/outcomes`, `src/quests/acceptance`, `src/characters/creation`).
- **Phase gate:** `npm run test:cov` (o il ripiego per cartella sulle soglie di `./src/travel/`, `./src/quests/acceptance/`, `./src/shops/`) + `test/app.int-spec.ts` + `npx tsc --noEmit`.

### Wave 0 Gaps
- [ ] `src/lore/lore-geography.spec.ts`, `src/lore/lore-geography.reader.int-spec.ts`
- [ ] `src/lore/lore-visibility.spec.ts`, `src/lore/viewer-knowledge.service.int-spec.ts` (HTTP + due eventi WS)
- [ ] `src/lore/known-enemies.resolver.int-spec.ts`
- [ ] `src/quests/outcomes/victory-knowledge.spec.ts`, `src/quests/outcomes/study-lore-draw.int-spec.ts`
- [ ] `src/config/lore-config.spec.ts`
- [ ] `src/migrations/lore-backfill/*.spec.ts` / `*.int-spec.ts`
- [ ] fixture: `test/quests/quest-result.fixture.ts` (`loreUnlocked: []`), helper `playerKnowing(harness, { lore, enemies })` sopra `createPlayer`

**Solo manuali:** boot reale con il backfill (log dei conteggi, secondo boot a zero) a carico dell'orchestratore; UAT della FE Phase 17 con la seconda identità (`DEV_AUTH_ROLE=adventurer`) e `LORE_STUDY_CHANCE=1`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (invariata) | `AuthGuard` globale |
| V3 Session Management | no | — |
| V4 Access Control | yes | filtro per viewer server-side; innkeeper per ruolo; `loreUnlocked` sotto `@OwnsQuestResult`/`@OwnsCharacter` già esistenti (`quest-results.resolver.ts:28-75`) |
| V5 Input Validation | yes | `ObjectIdPipe` su `lore(id)`/`enemy(id)`/`city(id)` (già presente) |
| V6 Cryptography | no | — |

### Known Threat Patterns for NestJS + Mongo + GraphQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oracolo dell'esistenza di una lore chiusa via `lore(id)` | Information disclosure | stesso `ResourceNotFoundException.lore()` prima della query (F5) |
| Lettura di lore chiuse via percorsi alternativi (`cityShop.city.relatedLore`, `PointOfInterest.city`, `Lore.relatedLore` annidata, `Enemy.relatedLore` nelle quest) | Information disclosure | field resolver sul tipo, non sulla query (F5) |
| `Quest.infos.relatedLore` intera | Information disclosure (accettata) | decisione D-10: voce del committente |
| Conoscenza di un altro personaggio via `characterUpdated`/`characters` | Information disclosure | ownership/ruolo già in vigore (`EXPECTED_OWNERSHIP_HANDLERS` di `test/app.int-spec.ts:135-153`) |
| Sblocco forzato dal client | Tampering | nessuna mutation nuova; solo scritture server-side in transazione |
| Viewer stale fra eventi WS | Information disclosure / integrità | chiave per evento (Pitfall 1) |

## Probe eseguite

- **P1 — viewer nei field resolver (HTTP e WS)** [VERIFIED: probe]. Spec usa-e-getta `src/lore/_probe-viewer-context.int-spec.ts`, comando `npx jest src/lore/_probe-viewer-context.int-spec.ts --selectProjects integration --runInBand`, 3/3 verdi, poi cancellata. Esiti:
  - HTTP: `@CurrentUser` nel field resolver = `twitch-probe-viewer`; stesso context dentro la richiesta (`true`) e diverso fra richieste (`true`); `rootValue` `undefined`;
  - WS (graphql-ws, due eventi): context **uguale fra gli eventi** (`true`); `rootValue` uguale dentro l'evento (`true`) e diverso fra gli eventi (`true`); utente presente in tutti e tre i field.
- **P2 — insiemi in transazione** [VERIFIED: probe], stessa spec.
  - Pipeline `[{ $set: { 'status.location': '$status.activeTravel.to', 'status.activeTravel': null, 'status.unlockedLore': { $concatArrays: [ { $ifNull: [...] }, { $filter: { input: { $literal: ids }, cond: { $not: [{ $in: ['$$this', ...] }] } } } ] } } }]` in `withTransaction` su `MongoMemoryReplSet`: campo assente → `[a, b]` come `ObjectId` in ordine; seconda applicazione con `[b, a]` → nessun duplicato. Effetto collaterale: senza `activeTravel` la pipeline toglie `status.location` (Pitfall 11).
  - `$addToSet` + `$each` con `[b.toHexString(), ObjectId(a)]` via Mongoose → nessun duplicato, tutti `ObjectId` (cast).
- A fine ricerca: `pgrep -fl 'bin/jest'` vuoto. `git status --short` mostra solo `?? .planning/phases/16-lore-sbloccabili/16-VALIDATION.md`, che non è stato creato da questa ricerca, più questo file.

## Sources

### Primary (HIGH confidence)
- Codice del branch `feat/16-lore-sbloccabili` (righe citate in ogni finding)
- `node_modules/graphql/execution/subscribe.js:69`, `node_modules/graphql-ws/dist/server-3ewaJSjp.js:206-207`, `node_modules/@nestjs/graphql/dist/services/gql-subscription.service.js:30-37`
- Probe P1 e P2 (sopra)
- `git log` di `src/quests/maintenance` (`3bdf65a`, `64ef914`)

### Secondary (MEDIUM confidence)
- `.planning/phases/15-imboscate-in-viaggio/15-11-SUMMARY.md` (durata e margini di coverage)
- Inventario del DB reale fornito dall'orchestratore (2026-11-07)

### Tertiary (LOW confidence)
- A1–A3 (Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, versioni lette da `node_modules`
- Architecture: HIGH — punti d'innesto letti riga per riga, comportamento WS provato
- Pitfalls: HIGH — asserzioni esatte trovate con grep; MEDIUM su C-1/C-2/C-5 (semantica da decidere)

**Research date:** 2026-11-07
**Valid until:** 2026-12-07 (codice stabile; rivedere se cambia `planParticipant` o il contesto GraphQL)
